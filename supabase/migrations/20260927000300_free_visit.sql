-- Free Visit: preserve legacy records without inventing consent or measurements.
alter table public.reservations
  add column bust_circumference_cm numeric,
  add column event_plan text,
  add column event_date date,
  add column event_date_unknown boolean,
  add column consent_on_time boolean,
  add column consent_whatsapp boolean,
  add column consent_stock boolean,
  add column consent_terms boolean,
  add column terms_version text,
  add column consented_at timestamptz,
  add column timezone text;
alter table public.reservations add constraint free_visit_details check (
  terms_version is null or (
    terms_version = 'free-visit-2026-09-v1'
    and bust_circumference_cm is not null and bust_circumference_cm::text not in ('NaN','Infinity','-Infinity')
    and event_plan is not null and char_length(event_plan) <= 2000
    and event_date_unknown is not null
    and ((event_date_unknown and event_date is null) or
      (not event_date_unknown and event_date is not null and event_date >= (appointment_at at time zone 'Asia/Jakarta')::date))
    and consent_on_time is true and consent_whatsapp is true and consent_stock is true and consent_terms is true
    and consented_at is not null and timezone is not null and timezone = 'Asia/Jakarta'
  )
);

create or replace function public.availability(p_date date)
returns table(slot text, available boolean) language sql stable security definer set search_path = '' as $$
  select to_char(t, 'HH24:MI'),
    p_date = (now() at time zone 'Asia/Jakarta')::date
    and (t at time zone 'Asia/Jakarta') >= now() + interval '60 minutes'
    and not exists(select 1 from public.reservations r where r.appointment_at = (t at time zone 'Asia/Jakarta') and r.status <> 'cancelled')
  from generate_series(p_date + time '11:00', p_date + time '20:00', interval '1 hour') t;
$$;
-- Disable the legacy write entry point, including for server callers, so it cannot bypass new requirements.
revoke all on function public.book_fitting(uuid,text,text,text,date,text,boolean,boolean) from public, anon, authenticated, service_role;

create function public.book_free_visit(p_input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  k uuid; payload jsonb; r public.reservations; appt timestamptz; d date; ed date; bust numeric;
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
      or jsonb_typeof(p_input->'bust_circumference_cm') is distinct from 'number'
      or jsonb_typeof(p_input->'event_plan') is distinct from 'string' or char_length(p_input->>'event_plan') > 2000
      or jsonb_typeof(p_input->'event_date_unknown') is distinct from 'boolean'
      or p_input->'consent_on_time' is distinct from 'true'::jsonb
      or p_input->'consent_whatsapp' is distinct from 'true'::jsonb
      or p_input->'consent_stock' is distinct from 'true'::jsonb
      or p_input->'consent_terms' is distinct from 'true'::jsonb
      or p_input->>'terms_version' is distinct from 'free-visit-2026-09-v1'
    then raise exception 'INVALID_INPUT'; end if;
    if coalesce(p_input->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'INVALID_SLOT'; end if;
    d := (p_input->>'date')::date;
    if d <> (now() at time zone 'Asia/Jakarta')::date or not exists(select 1 from public.availability(d) a where a.slot = p_input->>'slot') then raise exception 'INVALID_SLOT'; end if;
    appt := (d + (p_input->>'slot')::time) at time zone 'Asia/Jakarta';
    if appt < now() + interval '60 minutes' then raise exception 'CUTOFF'; end if;
    bust := (p_input->>'bust_circumference_cm')::numeric;
    if bust::text in ('NaN','Infinity','-Infinity') then raise exception 'INVALID_INPUT'; end if;
    if (p_input->>'event_date_unknown')::boolean then
      if p_input->'event_date' is distinct from 'null'::jsonb then raise exception 'INVALID_INPUT'; end if;
      ed := null;
    else
      if coalesce(p_input->>'event_date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'INVALID_INPUT'; end if;
      ed := (p_input->>'event_date')::date;
      if ed < d then raise exception 'INVALID_INPUT'; end if;
    end if;
    insert into public.reservations(idempotency_key,request_payload,name,instagram,phone,appointment_at,
      bust_circumference_cm,event_plan,event_date,event_date_unknown,
      consent_on_time,consent_whatsapp,consent_stock,consent_terms,terms_version,consented_at,timezone,policy_version)
    values(k,payload,trim(p_input->>'name'),'',p_input->>'phone',appt,
      bust,p_input->>'event_plan',ed,(p_input->>'event_date_unknown')::boolean,
      true,true,true,true,'free-visit-2026-09-v1',now(),'Asia/Jakarta','free-visit-2026-09-v1') returning * into r;
    insert into public.reservation_audit(reservation_id,new_status) values(r.id,'pending');
    insert into public.reminder_jobs(reservation_id,due_at,next_attempt_at) values(r.id,appt-interval '2 hours',greatest(now(),appt-interval '2 hours'));
  end if;
  return jsonb_build_object('reference',r.reference,'appointment_at',r.appointment_at,'status',r.status,
    'name',r.name,'phone',r.phone,'bust_circumference_cm',r.bust_circumference_cm,'event_plan',r.event_plan,
    'event_date',r.event_date,'event_date_unknown',r.event_date_unknown);
end;
$$;
revoke all on function public.book_free_visit(jsonb) from public, anon, authenticated;
grant execute on function public.book_free_visit(jsonb) to service_role;
