-- Schedule mirrors lib/fitting-schedule.json; parity covered by tests.
-- 20:00 is an appointment start. Existing data and grants remain intact.
create or replace function public.availability(p_date date) returns table(slot text, available boolean) language sql stable security definer set search_path = '' as $$
  select to_char(t, 'HH24:MI'),
    p_date between (now() at time zone 'Asia/Jakarta')::date and (now() at time zone 'Asia/Jakarta')::date + 30
    and (p_date > (now() at time zone 'Asia/Jakarta')::date or (t at time zone 'Asia/Jakarta') >= now() + interval '60 minutes')
    and not exists(select 1 from public.reservations r where r.appointment_at = (t at time zone 'Asia/Jakarta') and r.status <> 'cancelled')
  from generate_series(p_date + time '11:00', p_date + time '20:00', interval '1 hour') t;
$$;

create or replace function public.book_fitting(p_key uuid, p_name text, p_instagram text, p_phone text, p_date date, p_slot text, p_policy boolean, p_reminder boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare payload jsonb; r public.reservations; appt timestamptz;
begin
  payload := jsonb_build_object('name',p_name,'instagram',p_instagram,'phone',p_phone,'date',p_date,'slot',p_slot,'policy',p_policy,'reminder',p_reminder);
  perform pg_advisory_xact_lock(hashtextextended(p_key::text, 0));
  select * into r from public.reservations where idempotency_key = p_key;
  if found then
    if r.request_payload <> payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('reference',r.reference,'appointment_at',r.appointment_at,'status',r.status);
  end if;
  if p_policy is distinct from true or p_reminder is distinct from true or p_name is null or char_length(trim(p_name)) not between 2 and 80 or p_name ~ '[[:cntrl:]]' or p_phone is null or p_phone !~ '^628[0-9]{8,11}$' or p_instagram is null or p_instagram !~ '^[a-zA-Z0-9._]{0,30}$' then raise exception 'INVALID_INPUT'; end if;
  if p_date is null or p_date < (now() at time zone 'Asia/Jakarta')::date or p_date > (now() at time zone 'Asia/Jakarta')::date + 30 or p_slot is null or not exists (select 1 from public.availability(p_date) a where a.slot = p_slot) then raise exception 'INVALID_SLOT'; end if;
  appt := (p_date + p_slot::time) at time zone 'Asia/Jakarta';
  if p_date = (now() at time zone 'Asia/Jakarta')::date and appt < now() + interval '60 minutes' then raise exception 'CUTOFF'; end if;
  insert into public.reservations(idempotency_key,request_payload,name,instagram,phone,appointment_at)
  values(p_key,payload,trim(p_name),p_instagram,p_phone,appt) returning * into r;
  insert into public.reservation_audit(reservation_id,new_status) values(r.id,'pending');
  insert into public.reminder_jobs(reservation_id,due_at,next_attempt_at) values(r.id,appt - interval '2 hours',greatest(now(),appt - interval '2 hours'));
  return jsonb_build_object('reference',r.reference,'appointment_at',r.appointment_at,'status',r.status);
end; $$;

