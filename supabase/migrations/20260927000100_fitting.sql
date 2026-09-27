-- A new, isolated fitting schema. No dependency on lakuh-attire.
create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('LK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))),
  idempotency_key uuid not null unique,
  request_payload jsonb not null,
  name text not null check (char_length(name) between 2 and 80),
  instagram text check (instagram ~ '^[a-zA-Z0-9._]{0,30}$'),
  phone text not null check (phone ~ '^628[0-9]{8,11}$'),
  appointment_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','confirmed','cancelled','completed','no_show')),
  policy_version text not null default '2026-09-27',
  consent_at timestamptz not null default now(),
  reminder_consent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  status_updated_at timestamptz not null default now()
);
create unique index one_active_booking_per_slot on public.reservations(appointment_at) where status <> 'cancelled';
create index reservations_date on public.reservations(appointment_at);
create table public.reservation_audit (
  id bigint generated always as identity primary key,
  reservation_id uuid not null references public.reservations(id),
  actor_id uuid references auth.users(id),
  old_status text,
  new_status text not null,
  changed_at timestamptz not null default now()
);
create table public.reminder_jobs (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null unique references public.reservations(id),
  kind text not null default 'h2' check (kind = 'h2'),
  status text not null default 'scheduled' check (status in ('scheduled','processing','sent','failed','cancelled')),
  due_at timestamptz not null,
  next_attempt_at timestamptz not null,
  attempt_count integer not null default 0 check (attempt_count between 0 and 3),
  locked_at timestamptz,
  lock_token uuid,
  provider_message_id text,
  sent_at timestamptz,
  failed_at timestamptz,
  safe_error text,
  created_at timestamptz not null default now()
);
create index reminder_due on public.reminder_jobs(next_attempt_at) where status = 'scheduled';
create table public.rate_limits (key text primary key, window_at timestamptz not null, hits integer not null);

alter table public.admins enable row level security;
alter table public.reservations enable row level security;
alter table public.reservation_audit enable row level security;
alter table public.reminder_jobs enable row level security;
alter table public.rate_limits enable row level security;
revoke all on public.admins, public.reservations, public.reservation_audit, public.reminder_jobs, public.rate_limits from anon, authenticated;
grant select on public.admins, public.reservations, public.reservation_audit, public.reminder_jobs to authenticated;
grant all on public.admins, public.reservations, public.reservation_audit, public.reminder_jobs, public.rate_limits to service_role;
grant usage, select on sequence public.reservation_audit_id_seq to service_role;
create policy own_admin on public.admins for select to authenticated using (user_id = auth.uid());
create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.admins where user_id = auth.uid());
$$;
create policy admin_read on public.reservations for select to authenticated using (public.is_admin());
create policy admin_read on public.reminder_jobs for select to authenticated using (public.is_admin());
create policy admin_read on public.reservation_audit for select to authenticated using (public.is_admin());

create function public.take_rate_limit(p_key text, p_limit integer) returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  insert into public.rate_limits as r values (p_key, now(), 1)
  on conflict (key) do update set hits = case when r.window_at < now() - interval '10 minutes' then 1 else r.hits + 1 end,
    window_at = case when r.window_at < now() - interval '10 minutes' then now() else r.window_at end
  returning hits into n;
  delete from public.rate_limits where window_at < now() - interval '1 day';
  return n <= p_limit;
end; $$;

create function public.availability(p_date date) returns table(slot text, available boolean) language sql stable security definer set search_path = '' as $$
  select to_char(t, 'HH24:MI'),
    p_date between (now() at time zone 'Asia/Jakarta')::date and (now() at time zone 'Asia/Jakarta')::date + 30
    and (t at time zone 'Asia/Jakarta') >= now() + interval '60 minutes'
    and not exists(select 1 from public.reservations r where r.appointment_at = (t at time zone 'Asia/Jakarta') and r.status <> 'cancelled')
  from generate_series(p_date + time '11:00', p_date + time '15:00', interval '1 hour') t;
$$;

create function public.book_fitting(p_key uuid, p_name text, p_instagram text, p_phone text, p_date date, p_slot text, p_policy boolean, p_reminder boolean)
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
  if p_date is null or p_date < (now() at time zone 'Asia/Jakarta')::date or p_date > (now() at time zone 'Asia/Jakarta')::date + 30 or p_slot is null or p_slot not in ('11:00','12:00','13:00','14:00','15:00') then raise exception 'INVALID_SLOT'; end if;
  appt := (p_date + p_slot::time) at time zone 'Asia/Jakarta';
  if appt < now() + interval '60 minutes' then raise exception 'CUTOFF'; end if;
  insert into public.reservations(idempotency_key,request_payload,name,instagram,phone,appointment_at)
  values(p_key,payload,trim(p_name),p_instagram,p_phone,appt) returning * into r;
  insert into public.reservation_audit(reservation_id,new_status) values(r.id,'pending');
  insert into public.reminder_jobs(reservation_id,due_at,next_attempt_at) values(r.id,appt - interval '2 hours',greatest(now(),appt - interval '2 hours'));
  return jsonb_build_object('reference',r.reference,'appointment_at',r.appointment_at,'status',r.status);
end; $$;

create function public.change_status(p_id uuid, p_status text) returns void language plpgsql security definer set search_path = '' as $$
declare r public.reservations;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into r from public.reservations where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if r.status = p_status then return; end if;
  if not ((r.status = 'pending' and p_status in ('confirmed','cancelled')) or (r.status = 'confirmed' and p_status in ('cancelled','completed','no_show'))) then raise exception 'INVALID_TRANSITION'; end if;
  if p_status in ('completed','no_show') and r.appointment_at > now() then raise exception 'APPOINTMENT_NOT_STARTED'; end if;
  update public.reservations set status = p_status, status_updated_at = clock_timestamp() where id = p_id;
  insert into public.reservation_audit(reservation_id,actor_id,old_status,new_status) values(p_id,auth.uid(),r.status,p_status);
  if p_status in ('cancelled','completed','no_show') then
    update public.reminder_jobs set status = 'cancelled', lock_token = null, safe_error = 'RESERVATION_INACTIVE' where reservation_id = p_id and status in ('scheduled','processing');
  end if;
end; $$;

create function public.claim_reminders(p_limit integer default 10) returns setof public.reminder_jobs language plpgsql security definer set search_path = '' as $$
begin
  -- Never retry ambiguous delivery after a crashed worker.
  update public.reminder_jobs set status = 'failed', failed_at = now(), safe_error = 'DELIVERY_UNKNOWN', lock_token = null
    where status = 'processing' and locked_at < now() - interval '5 minutes';
  return query with picked as (
    select j.id from public.reminder_jobs j where j.status = 'scheduled' and j.next_attempt_at <= now() and j.attempt_count < 3
    order by j.next_attempt_at for update skip locked limit least(greatest(p_limit,1),20)
  ) update public.reminder_jobs j set status = 'processing', attempt_count = j.attempt_count + 1, locked_at = now(), lock_token = gen_random_uuid()
    from picked where j.id = picked.id returning j.*;
end; $$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;
revoke all on function public.availability(date), public.book_fitting(uuid,text,text,text,date,text,boolean,boolean), public.take_rate_limit(text,integer), public.claim_reminders(integer) from public, anon, authenticated;
grant execute on function public.availability(date), public.book_fitting(uuid,text,text,text,date,text,boolean,boolean), public.take_rate_limit(text,integer), public.claim_reminders(integer) to service_role;
revoke all on function public.change_status(uuid,text) from public, anon;
grant execute on function public.change_status(uuid,text) to authenticated;
