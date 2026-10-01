-- Run in a transaction; fixture changes roll back. Can also be appended after migration SQL.
begin;
create function pg_temp.assert(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end $$;
create function pg_temp.denied(statement text) returns void language plpgsql as $$ begin begin execute statement; exception when insufficient_privilege then return; end; raise exception 'Expected insufficient privilege'; end $$;
create temp table closure_fixture(admin_id uuid, payload jsonb, rid uuid, day date);
insert into closure_fixture(admin_id,day) values(gen_random_uuid(),(now() at time zone 'Asia/Jakarta')::date);
insert into auth.users(id,email) select admin_id,admin_id::text||'@example.invalid' from closure_fixture;
insert into public.admins(user_id) select admin_id from closure_fixture;
grant select on closure_fixture to anon,authenticated;
select pg_temp.assert(not has_table_privilege(role,'public.visit_days',op),'no direct closure mutation') from unnest(array['anon','authenticated']) role cross join unnest(array['INSERT','UPDATE','DELETE']) op;
select pg_temp.assert(not has_function_privilege(role,'public.visit_availability(date)','execute'),'public status RPC restricted') from unnest(array['anon','authenticated']) role;
select pg_temp.assert(not has_function_privilege('anon','public.set_visit_day(date,boolean)','execute'),'anon cannot close');
set local role authenticated;
select pg_temp.denied(format('select public.set_visit_day(%L,true)',day)) from closure_fixture;
select pg_temp.assert((select count(*)=0 from public.visit_days),'nonadmin no closure metadata');
reset role;
select set_config('request.jwt.claim.sub',(select admin_id::text from closure_fixture),true);
set local role authenticated;
select public.set_visit_day(day,false) from closure_fixture;
reset role;
update closure_fixture set payload=jsonb_build_object('key',gen_random_uuid(),'name','Closure Test '||gen_random_uuid()::text,'phone','6281234567890','date',day::text,'slot',(select slot from public.availability(day) where available order by slot desc limit 1),'weight_kg',50,'height_cm',160,'event_plan','Synthetic closure fixture','event_date',null,'event_date_unknown',true,'consent_on_time',true,'consent_whatsapp',true,'consent_stock',true,'consent_terms',true,'terms_version','free-visit-2026-09-v2');
select pg_temp.assert((select payload->>'slot' is not null from closure_fixture),'same-day test slot before cutoff');
select public.book_free_visit(payload) from closure_fixture;
update closure_fixture set rid=(select id from public.reservations where idempotency_key=(payload->>'key')::uuid);
set local role authenticated;
select public.set_visit_day(day,true) from closure_fixture;
select pg_temp.assert((select closed and updated_by=(select admin_id from closure_fixture) from public.visit_days where visit_date=(select day from closure_fixture)),'closure persisted with actor');
reset role;
select pg_temp.assert((public.visit_availability(day)->>'closed')::boolean,'public closure flag') from closure_fixture;
select pg_temp.assert((select count(*)=5 and bool_and(not available) from public.availability(day)),'closed all five slots') from closure_fixture;
select pg_temp.assert((select status='pending' from public.reservations where id=rid),'existing booking retained') from closure_fixture;
select pg_temp.assert((select count(*)=1 from public.reminder_jobs where reservation_id=rid),'existing reminder retained') from closure_fixture;
-- Existing idempotency receipt remains accessible after closure, without another row/job.
select public.book_free_visit(payload) from closure_fixture;
select pg_temp.assert((select count(*)=1 from public.reservations where idempotency_key=(payload->>'key')::uuid),'closed-day replay no duplicate') from closure_fixture;
do $$ declare p jsonb; begin select payload||jsonb_build_object('key',gen_random_uuid()) into p from closure_fixture; begin perform public.book_free_visit(p); exception when others then if sqlerrm='VISIT_CLOSED' then return; end if; raise; end; raise exception 'FAIL: new booking bypassed closure'; end $$;
set local role authenticated;
select public.set_visit_day(day,false) from closure_fixture;
reset role;
select pg_temp.assert(not (public.visit_availability(day)->>'closed')::boolean,'reopened flag') from closure_fixture;
select pg_temp.assert((select bool_and(available=(
 (((day+a.slot::time) at time zone 'Asia/Jakarta')>=now()+interval '30 minutes')
 and not exists(select 1 from public.reservations r where r.appointment_at=((day+a.slot::time) at time zone 'Asia/Jakarta') and r.status<>'cancelled')
)) from public.availability(day) a),'reopen respects cutoff and existing occupancy') from closure_fixture;
select pg_temp.assert(not exists(select 1 from public.visit_days where visit_date=date '2098-10-05'),'fixture future date absent');
select pg_temp.assert(not (public.visit_availability(date '2098-10-05')->>'closed')::boolean,'no automatic Sunday or holiday closures');
rollback;
select 'PASS: manual close/reopen, existing booking/job preservation, replay, new-booking denial, admin/RLS and cutoff; fixtures rolled back' as result;
