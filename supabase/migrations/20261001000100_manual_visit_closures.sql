-- Manual per-date closures; absent dates are open. No weekly/holiday automation.
create table public.visit_days (
  visit_date date primary key,
  closed boolean not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.visit_days enable row level security;
revoke all on public.visit_days from public, anon, authenticated;
grant select on public.visit_days to authenticated;
grant all on public.visit_days to service_role;
create policy admin_read on public.visit_days for select to authenticated using (public.is_admin());

create function public.set_visit_day(p_date date, p_closed boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_date is null or p_closed is null or p_date < date '1900-01-01' or p_date > date '9998-12-31' then
    raise exception 'INVALID_INPUT' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(73421, p_date - date '2000-01-01');
  insert into public.visit_days(visit_date,closed,updated_by) values(p_date,p_closed,auth.uid())
  on conflict(visit_date) do update set closed=excluded.closed,updated_at=now(),updated_by=excluded.updated_by;
  return jsonb_build_object('date',p_date,'closed',p_closed);
end;
$$;
revoke all on function public.set_visit_day(date,boolean) from public,anon,authenticated,service_role;
grant execute on function public.set_visit_day(date,boolean) to authenticated;

create or replace function public.availability(p_date date)
returns table(slot text, available boolean) language sql stable security definer set search_path = '' as $$
  select to_char(t, 'HH24:MI'),
    p_date = (now() at time zone 'Asia/Jakarta')::date
    and not exists(select 1 from public.visit_days v where v.visit_date=p_date and v.closed)
    and (t at time zone 'Asia/Jakarta') >= now() + interval '60 minutes'
    and not exists(select 1 from public.reservations r where r.appointment_at = (t at time zone 'Asia/Jakarta') and r.status <> 'cancelled')
  from generate_series(p_date + time '11:00', p_date + time '15:00', interval '1 hour') t;
$$;

-- One SQL snapshot keeps the closure flag and slot list consistent.
create function public.visit_availability(p_date date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'closed',exists(select 1 from public.visit_days v where v.visit_date=p_date and v.closed),
    'slots',(select jsonb_agg(jsonb_build_object('slot',a.slot,'available',a.available) order by a.slot) from public.availability(p_date) a)
  );
$$;
revoke all on function public.visit_availability(date) from public,anon,authenticated;
grant execute on function public.visit_availability(date) to service_role;

create or replace function public.book_free_visit(p_input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  k uuid; payload jsonb; r public.reservations; appt timestamptz; d date; ed date; weight numeric; height numeric;
begin
  if jsonb_typeof(p_input) is distinct from 'object' or
     coalesce(p_input->>'key','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'INVALID_INPUT'; end if;
  k := (p_input->>'key')::uuid;
  payload := p_input - 'key';
  perform pg_advisory_xact_lock(hashtextextended(k::text, 0));
  select * into r from public.reservations where idempotency_key = k;
  if found then
    if r.request_payload <> payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  else
    if jsonb_typeof(p_input->'name') is distinct from 'string' or char_length(trim(p_input->>'name')) not between 2 and 80 or p_input->>'name' ~ '[[:cntrl:]]'
      or jsonb_typeof(p_input->'phone') is distinct from 'string' or p_input->>'phone' !~ '^628[0-9]{8,11}$'
      or jsonb_typeof(p_input->'weight_kg') is distinct from 'number' or jsonb_typeof(p_input->'height_cm') is distinct from 'number' or p_input ? 'bust_circumference_cm'
      or jsonb_typeof(p_input->'event_plan') is distinct from 'string' or char_length(p_input->>'event_plan') > 2000
      or jsonb_typeof(p_input->'event_date_unknown') is distinct from 'boolean'
      or p_input->'consent_on_time' is distinct from 'true'::jsonb
      or p_input->'consent_whatsapp' is distinct from 'true'::jsonb
      or p_input->'consent_stock' is distinct from 'true'::jsonb
      or p_input->'consent_terms' is distinct from 'true'::jsonb
      or p_input->>'terms_version' is distinct from 'free-visit-2026-09-v2'
    then raise exception 'INVALID_INPUT'; end if;
    if coalesce(p_input->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'INVALID_SLOT'; end if;
    d := (p_input->>'date')::date;
    -- Serialize booking and admin closure for the same Jakarta date.
    perform pg_advisory_xact_lock(73421, d - date '2000-01-01');
    if exists(select 1 from public.visit_days v where v.visit_date=d and v.closed) then
      raise exception 'VISIT_CLOSED';
    end if;
    if d <> (now() at time zone 'Asia/Jakarta')::date or not exists(select 1 from public.availability(d) a where a.slot = p_input->>'slot') then raise exception 'INVALID_SLOT'; end if;
    appt := (d + (p_input->>'slot')::time) at time zone 'Asia/Jakarta';
    if appt < now() + interval '60 minutes' then raise exception 'CUTOFF'; end if;
    weight := (p_input->>'weight_kg')::numeric; height := (p_input->>'height_cm')::numeric;
    if weight not between 20 and 300 or height not between 80 and 250 or weight::text in ('NaN','Infinity','-Infinity') or height::text in ('NaN','Infinity','-Infinity') then raise exception 'INVALID_INPUT'; end if;
    if (p_input->>'event_date_unknown')::boolean then
      if p_input->'event_date' is distinct from 'null'::jsonb then raise exception 'INVALID_INPUT'; end if;
      ed := null;
    else
      if coalesce(p_input->>'event_date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'INVALID_INPUT'; end if;
      ed := (p_input->>'event_date')::date;
      if ed < d then raise exception 'INVALID_INPUT'; end if;
    end if;
    insert into public.reservations(idempotency_key,request_payload,name,instagram,phone,appointment_at,
      weight_kg,height_cm,event_plan,event_date,event_date_unknown,
      consent_on_time,consent_whatsapp,consent_stock,consent_terms,terms_version,consented_at,timezone,policy_version)
    values(k,payload,trim(p_input->>'name'),'',p_input->>'phone',appt,
      weight,height,p_input->>'event_plan',ed,(p_input->>'event_date_unknown')::boolean,
      true,true,true,true,'free-visit-2026-09-v2',now(),'Asia/Jakarta','free-visit-2026-09-v2') returning * into r;
    insert into public.reservation_audit(reservation_id,new_status) values(r.id,'pending');
    insert into public.reminder_jobs(reservation_id,due_at,next_attempt_at) values(r.id,appt-interval '2 hours',greatest(now(),appt-interval '2 hours'));
  end if;
  return jsonb_build_object('reference',r.reference,'appointment_at',r.appointment_at,'status',r.status,
    'name',r.name,'phone',r.phone,'weight_kg',r.weight_kg,'height_cm',r.height_cm,'event_plan',r.event_plan,
    'event_date',r.event_date,'event_date_unknown',r.event_date_unknown);
end;
$$;
revoke all on function public.book_free_visit(jsonb) from public, anon, authenticated;
grant execute on function public.book_free_visit(jsonb) to service_role;
