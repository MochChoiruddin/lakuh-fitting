-- Fixture-only, rollback. No global worker claims and no real customer output.
begin;
create function pg_temp.assert(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end $$;
create function pg_temp.reject(statement text, expected text) returns void language plpgsql as $$ begin begin execute statement; exception when others then if position(expected in sqlerrm)>0 then return; end if; raise exception 'Unexpected rejection'; end; raise exception 'Missing rejection'; end $$;
create temp table fixture(admin_id uuid, rid uuid, tag text);
insert into fixture values(gen_random_uuid(),gen_random_uuid(),'Report Test '||gen_random_uuid()::text);
select pg_temp.assert(not exists(select 1 from public.reservations where appointment_at >= '1901-01-01T00:00:00+07:00' and appointment_at < '1901-02-01T00:00:00+07:00'),'fixture month unoccupied');
insert into public.reservations(id,idempotency_key,request_payload,name,phone,appointment_at,status)
select rid,gen_random_uuid(),'{}',tag,'6281234567890','1901-01-01T00:00:00+07:00','pending' from fixture;
insert into public.reminder_jobs(reservation_id,due_at,next_attempt_at) select rid,'1900-12-31T22:00:00+07:00',now()+interval '1 day' from fixture;
insert into auth.users(id,email) select admin_id,admin_id::text||'@example.invalid' from fixture;
insert into public.admins(user_id) select admin_id from fixture;
grant select on fixture to authenticated;
set local role authenticated;
select pg_temp.reject('select public.reservation_report(''1901-01-01'',''1901-01-31'',null)','FORBIDDEN');
reset role;
select set_config('request.jwt.claim.sub',(select admin_id::text from fixture),true);
set local role authenticated;
select pg_temp.reject(format('select public.change_status(%L,''completed'')',rid),'INVALID_TRANSITION') from fixture;
select public.change_status(rid,'confirmed') from fixture;
select pg_temp.reject(format('select public.change_status(%L,''no_show'')',rid),'INVALID_TRANSITION') from fixture;
select public.change_status(rid,'completed') from fixture;
select pg_temp.assert((select status='completed' from public.reservations where id=(select rid from fixture)),'confirmed to completed');
select pg_temp.assert((select status='cancelled' from public.reminder_jobs where reservation_id=(select rid from fixture)),'remaining reminder cancelled');
select pg_temp.assert((select count(*)=1 from public.reminder_jobs where reservation_id=(select rid from fixture)),'no new reminder');
select pg_temp.assert((select count(*)=1 from public.reservation_audit where reservation_id=(select rid from fixture) and actor_id=(select admin_id from fixture) and old_status='confirmed' and new_status='completed' and changed_at>=transaction_timestamp()),'audit actor old/new time and booking id');
select pg_temp.reject(format('select public.change_status(%L,%L)',rid,s),'INVALID_TRANSITION') from fixture cross join unnest(array['pending','confirmed','cancelled']) s;
reset role;
-- 1204 more explicit synthetic rows; all data resides in a rolled-back transaction.
insert into public.reservations(idempotency_key,request_payload,name,phone,appointment_at,status)
select gen_random_uuid(),'{}',f.tag,'6281234567890','1901-01-01T00:00:00+07:00'::timestamptz + n*interval '1 minute',
  (array['pending','confirmed','completed','cancelled'])[1+(n%4)] from fixture f cross join generate_series(1,1204) n;
set local role authenticated;
select pg_temp.assert((public.reservation_report('1901-01-01','1901-01-31',null)->'counts'->>'total')::int=1205,'all rows above 100 and 1000');
select pg_temp.assert(jsonb_array_length(public.reservation_report('1901-01-01','1901-01-31',null)->'rows')=1205,'no row cap');
select pg_temp.assert((public.reservation_report('1901-01-01','1901-01-01',null)->'counts'->>'total')::int=1205,'inclusive Jakarta date, not UTC date');
select pg_temp.assert((public.reservation_report('1900-12-31','1900-12-31',null)->'counts'->>'total')::int=0,'exclude previous Jakarta day');
select pg_temp.assert((public.reservation_report('1901-01-01','1901-01-31',s)->'counts'->>'total')::int>0,'every status filter') from unnest(array['pending','confirmed','completed','cancelled']) s;
select pg_temp.reject('select public.reservation_report(''1901-02-01'',''1901-01-01'',null)','INVALID_REPORT_FILTER');
select pg_temp.reject('select public.reservation_report(''1901-01-01'',''1901-01-31'',''bad'')','INVALID_REPORT_FILTER');
select pg_temp.reject(format('select public.change_status(%L,''confirmed'')',id),'INVALID_TRANSITION') from public.reservations where name=(select tag from fixture) and status='cancelled' limit 1;
reset role;
select pg_temp.assert(not has_function_privilege('anon','public.reservation_report(date,date,text)','execute'),'anonymous RPC denied');
delete from public.admins where user_id=(select admin_id from fixture);
set local role authenticated;
select pg_temp.reject('select public.reservation_report(''1901-01-01'',''1901-01-31'',null)','FORBIDDEN');
reset role;
rollback;
select 'PASS: report RLS, status terminal/audit/reminder, Jakarta inclusive dates, 1205 rows, filters, revoked membership; fixtures rolled back' as result;
