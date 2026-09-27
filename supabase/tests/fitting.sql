-- Run via: supabase db query --linked --file supabase/tests/fitting.sql
-- All test data is rolled back, including auth users. No messages are sent.
begin;
create function pg_temp.assert(ok boolean, label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; end $$;
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then
    if position(expected in sqlerrm) > 0 then return; end if;
    raise exception 'Unexpected test error: %', sqlerrm;
  end;
  raise exception 'Expected error missing: %', expected;
end; $$;
create temporary table test_ids (key uuid, rid uuid, admin_id uuid);
insert into test_ids(key,admin_id) values(gen_random_uuid(),gen_random_uuid());
insert into auth.users(id,email) select admin_id, 'fitting-test@example.invalid' from test_ids;
insert into public.admins(user_id) select admin_id from test_ids;
select pg_temp.assert((select count(*) = 10 from public.availability((now() at time zone 'Asia/Jakarta')::date + 20)), 'ten slots');
select pg_temp.assert((select bool_and(a.available = (((now() at time zone 'Asia/Jakarta')::date + a.slot::time) at time zone 'Asia/Jakarta' >= now()+interval '60 minutes' and not exists(select 1 from public.reservations r where r.appointment_at=(((now() at time zone 'Asia/Jakarta')::date + a.slot::time) at time zone 'Asia/Jakarta') and r.status <> 'cancelled'))) from public.availability((now() at time zone 'Asia/Jakarta')::date) a), 'today database cutoff');
select pg_temp.assert((select bool_and(not available) from public.availability((now() at time zone 'Asia/Jakarta')::date - 1)), 'past date unavailable');
select pg_temp.assert((select bool_and(not available) from public.availability((now() at time zone 'Asia/Jakarta')::date + 31)), 'day 31 unavailable');
select public.book_fitting(key,'Test Guest','','6281234567890',(now() at time zone 'Asia/Jakarta')::date + 20,'11:00',true,true) from test_ids;
update test_ids set rid = (select id from public.reservations where idempotency_key = test_ids.key);
select pg_temp.assert((select count(*) = 1 from public.reminder_jobs where reservation_id = (select rid from test_ids)), 'one reminder');
select pg_temp.assert((select j.due_at = r.appointment_at - interval '2 hours' from public.reminder_jobs j join public.reservations r on r.id=j.reservation_id where r.id=(select rid from test_ids)), 'H-2 due time');
select public.book_fitting(key,'Test Guest','','6281234567890',(now() at time zone 'Asia/Jakarta')::date + 20,'11:00',true,true) from test_ids;
select pg_temp.assert((select count(*) = 1 from public.reservations where idempotency_key=(select key from test_ids)), 'idempotent replay');
select pg_temp.expect_error(format('select public.book_fitting(%L,''Changed'','''',''6281234567890'',%L,''11:00'',true,true)',key,(now() at time zone 'Asia/Jakarta')::date+20),'IDEMPOTENCY_CONFLICT') from test_ids;
select pg_temp.expect_error(format('select public.book_fitting(gen_random_uuid(),''Test Guest'','''',''6281234567890'',%L,''11:00'',true,true)',(now() at time zone 'Asia/Jakarta')::date+20),'one_active_booking_per_slot');
select pg_temp.expect_error(format('select public.book_fitting(gen_random_uuid(),''Test Guest'','''',''6281234567890'',%L,''12:00'',false,true)',(now() at time zone 'Asia/Jakarta')::date+20),'INVALID_INPUT');
select pg_temp.expect_error(format('select public.book_fitting(gen_random_uuid(),''Test Guest'','''',''123'',%L,''12:00'',true,true)',(now() at time zone 'Asia/Jakarta')::date+20),'INVALID_INPUT');
select pg_temp.assert(not has_function_privilege('anon','public.book_fitting(uuid,text,text,text,date,text,boolean,boolean)','execute'), 'anon cannot book via RPC');
select pg_temp.assert(not has_function_privilege('authenticated','public.claim_reminders(integer)','execute'), 'users cannot claim jobs');
select pg_temp.assert(not has_table_privilege('anon','public.reservations','select'), 'anon cannot read PII');
select pg_temp.assert(not has_table_privilege('authenticated','public.admins','insert'), 'users cannot self promote');
select pg_temp.assert((select count(*)=5 from pg_class c join pg_namespace n on c.relnamespace=n.oid where n.nspname='public' and c.relname in ('admins','reservations','reservation_audit','reminder_jobs','rate_limits') and c.relrowsecurity), 'all tables RLS enabled');
select public.book_fitting(gen_random_uuid(),'Evening Test','','6281234567890',(now() at time zone 'Asia/Jakarta')::date+20,'20:00',true,true);
select pg_temp.assert((select (j.due_at at time zone 'Asia/Jakarta')::time = time '18:00' from public.reminder_jobs j join public.reservations r on r.id=j.reservation_id where r.name='Evening Test'), '20:00 reminder at 18:00');
select pg_temp.expect_error(format('select public.book_fitting(gen_random_uuid(),''Test Guest'','''',''6281234567890'',%L,''21:00'',true,true)',(now() at time zone 'Asia/Jakarta')::date+20),'INVALID_SLOT');
grant select on test_ids to authenticated;
set local role authenticated;
select pg_temp.assert((select count(*) = 0 from public.reservations), 'non-admin sees no rows');
select pg_temp.expect_error(format('select public.change_status(%L,''confirmed'')',rid),'FORBIDDEN') from test_ids;
reset role;
select set_config('request.jwt.claim.sub',(select admin_id::text from test_ids),true);
set local role authenticated;
select pg_temp.assert((select count(*) = 1 from public.reservations where id=(select rid from test_ids)), 'admin reads reservation');
select public.change_status(rid,'confirmed') from test_ids;
select pg_temp.expect_error(format('select public.change_status(%L,''completed'')',rid),'APPOINTMENT_NOT_STARTED') from test_ids;
select pg_temp.expect_error(format('select public.change_status(%L,''pending'')',rid),'INVALID_TRANSITION') from test_ids;
select public.change_status(rid,'cancelled') from test_ids;
select pg_temp.assert((select status='cancelled' from public.reminder_jobs where reservation_id=(select rid from test_ids)), 'cancel cancels reminder');
select pg_temp.assert((select count(*)=3 from public.reservation_audit where reservation_id=(select rid from test_ids)), 'creation and status audit');
reset role;
select public.book_fitting(gen_random_uuid(),'Test Replacement','','6281234567890',(now() at time zone 'Asia/Jakarta')::date+20,'11:00',true,true);
select pg_temp.assert(public.take_rate_limit('unit-test-rate',1), 'first rate allowed');
select pg_temp.assert(not public.take_rate_limit('unit-test-rate',1), 'second rate blocked');
-- Restrict due jobs to our transactional test booking.
update public.reminder_jobs set next_attempt_at=now()+interval '1 day' where status='scheduled';
update public.reminder_jobs set status='scheduled',next_attempt_at=now()-interval '1 second' where reservation_id=(select rid from test_ids);
select pg_temp.assert((select count(*)=1 from public.claim_reminders(1)), 'claim one job');
select pg_temp.assert((select count(*)=0 from public.claim_reminders(1)), 'no duplicate claim');
select pg_temp.assert((select attempt_count=1 from public.reminder_jobs where reservation_id=(select rid from test_ids)), 'attempt increment');
update public.reminder_jobs set locked_at=now()-interval '6 minutes' where reservation_id=(select rid from test_ids);
select count(*) from public.claim_reminders(1);
select pg_temp.assert((select status='failed' and safe_error='DELIVERY_UNKNOWN' from public.reminder_jobs where reservation_id=(select rid from test_ids)), 'stale claim fails without retry');
rollback;
select 'PASS: availability, atomic booking, idempotency, constraints, RLS, authorization, transitions, audit, H-2, cancellation, locking, stale recovery, rate limit' as result;
