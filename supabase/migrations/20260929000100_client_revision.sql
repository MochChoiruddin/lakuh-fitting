-- September revision; historical migration files are immutable.
alter table public.reservations add column weight_kg numeric, add column height_cm numeric;
alter table public.reservations add constraint weight_range check(weight_kg is null or (weight_kg between 20 and 300 and weight_kg::text not in ('NaN','Infinity','-Infinity')));
alter table public.reservations add constraint height_range check(height_cm is null or (height_cm between 80 and 250 and height_cm::text not in ('NaN','Infinity','-Infinity')));
alter table public.reservations drop constraint free_visit_details;
alter table public.reservations add constraint free_visit_details check (
  terms_version is null or terms_version = 'free-visit-2026-09-v2' or (
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


alter table public.reservations add constraint free_visit_v2_details check(terms_version is distinct from 'free-visit-2026-09-v2' or (
 weight_kg is not null and height_cm is not null and bust_circumference_cm is null
 and event_plan is not null and char_length(event_plan)<=2000 and event_date_unknown is not null
 and ((event_date_unknown and event_date is null) or (not event_date_unknown and event_date is not null and event_date >= (appointment_at at time zone 'Asia/Jakarta')::date))
 and consent_on_time is true and consent_whatsapp is true and consent_stock is true and consent_terms is true
 and consented_at is not null and timezone is not null and timezone='Asia/Jakarta'
 and (appointment_at at time zone 'Asia/Jakarta')::time in (time '11:00',time '12:00',time '13:00',time '14:00',time '15:00')
));
comment on column public.reservations.bust_circumference_cm is 'Deprecated: historical records only; new reservations use weight_kg and height_cm.';
create or replace function public.availability(p_date date)
returns table(slot text, available boolean) language sql stable security definer set search_path = '' as $$
  select to_char(t, 'HH24:MI'),
    p_date = (now() at time zone 'Asia/Jakarta')::date
    and (t at time zone 'Asia/Jakarta') >= now() + interval '60 minutes'
    and not exists(select 1 from public.reservations r where r.appointment_at = (t at time zone 'Asia/Jakarta') and r.status <> 'cancelled')
  from generate_series(p_date + time '11:00', p_date + time '15:00', interval '1 hour') t;
$$;
-- Disable the legacy write entry point, including for server callers, so it cannot bypass new requirements.
revoke all on function public.book_fitting(uuid,text,text,text,date,text,boolean,boolean) from public, anon, authenticated, service_role;

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

create or replace function public.reservation_report(p_start date,p_end date,p_status text default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_start is null or p_end is null or p_end<p_start
    or p_start<date '1900-01-01' or p_end>date '9998-12-31'
    or (p_status is not null and p_status not in ('pending','confirmed','completed','cancelled')) then
    raise exception 'INVALID_REPORT_FILTER' using errcode='22023';
  end if;
  with selected as (
    select r.reference,r.appointment_at,r.name,r.phone,r.weight_kg,r.height_cm,
      r.event_date,r.event_date_unknown,r.status,r.created_at,r.status_updated_at,
      j.status as reminder_status,coalesce(j.attempt_count,0) as reminder_attempts
    from public.reservations r left join public.reminder_jobs j on j.reservation_id=r.id
    where r.appointment_at >= (p_start::timestamp at time zone 'Asia/Jakarta')
      and r.appointment_at < ((p_end+1)::timestamp at time zone 'Asia/Jakarta')
      and (p_status is null or r.status=p_status)
  ) select jsonb_build_object(
    'rows',coalesce(jsonb_agg(to_jsonb(s) order by s.appointment_at,s.reference),'[]'::jsonb),
    'counts',jsonb_build_object('total',count(*),
      'pending',count(*) filter(where status='pending'),
      'confirmed',count(*) filter(where status='confirmed'),
      'completed',count(*) filter(where status='completed'),
      'cancelled',count(*) filter(where status='cancelled'),
      'no_show',count(*) filter(where status='no_show'))
  ) into result from selected s;
  return result;
end; $$;
revoke all on function public.reservation_report(date,date,text) from public,anon,service_role;
grant execute on function public.reservation_report(date,date,text) to authenticated;

alter table public.reservation_audit add column event_type text not null default 'status_changed'
  check(event_type in ('status_changed','reminder_opened_by_admin'));
create function public.open_manual_reminder(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.reservations; number text;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select * into r from public.reservations where id=p_id for update;
  if not found or r.status not in ('pending','confirmed') then raise exception 'INVALID_REMINDER'; end if;
  if r.phone !~ '^[+0-9 ()-]+$' then raise exception 'INVALID_PHONE'; end if;
  number := regexp_replace(r.phone,'[ ()-]','','g');
  if left(number,1)='+' then number:=substr(number,2); end if;
  if left(number,1)='0' then number:='62'||substr(number,2);
  elsif left(number,1)='8' then number:='62'||number; end if;
  if number !~ '^628[0-9]{8,11}$' then raise exception 'INVALID_PHONE'; end if;
  insert into public.reservation_audit(reservation_id,actor_id,old_status,new_status,event_type)
    values(r.id,auth.uid(),r.status,r.status,'reminder_opened_by_admin');
  return jsonb_build_object('phone',number,'appointment_at',r.appointment_at,'status',r.status);
end; $$;
revoke all on function public.open_manual_reminder(uuid) from public,anon,service_role;
grant execute on function public.open_manual_reminder(uuid) to authenticated;
