-- Transactional tests on the connected lakuh-fitting project. No provider calls.
begin;
create function pg_temp.assert(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end $$;
create function pg_temp.expect_error(statement text,expected text) returns void language plpgsql as $$ begin begin execute statement; exception when others then if position(expected in sqlerrm)>0 then return; end if; raise exception 'Unexpected SQL test failure'; end; raise exception 'Expected rejection missing: %',expected; end $$;
create temp table fixture(payload jsonb, rid uuid, admin_id uuid);
insert into fixture(payload,admin_id) select jsonb_build_object('key',gen_random_uuid(),'name','Database Synthetic '||gen_random_uuid()::text,'phone','6281234567890','date',(now() at time zone 'Asia/Jakarta')::date,'slot',(select slot from public.availability((now() at time zone 'Asia/Jakarta')::date) where available order by slot desc limit 1),'bust_circumference_cm',92.5,'event_plan','Acara keluarga','event_date',((now() at time zone 'Asia/Jakarta')::date+1)::text,'event_date_unknown',false,'consent_on_time',true,'consent_whatsapp',true,'consent_stock',true,'consent_terms',true,'terms_version','free-visit-2026-09-v1'),gen_random_uuid();
select pg_temp.assert((select payload->>'slot' is not null from fixture),'a real unoccupied same-day slot exists before cutoff');
select pg_temp.assert((select count(*)=10 from public.availability((now() at time zone 'Asia/Jakarta')::date)),'ten slots');
select pg_temp.assert((select bool_and(a.available = (
  (((now() at time zone 'Asia/Jakarta')::date + a.slot::time) at time zone 'Asia/Jakarta') >= now()+interval '60 minutes'
  and not exists(select 1 from public.reservations r where r.appointment_at=(((now() at time zone 'Asia/Jakarta')::date + a.slot::time) at time zone 'Asia/Jakarta') and r.status<>'cancelled')
)) from public.availability((now() at time zone 'Asia/Jakarta')::date) a),'database Jakarta cutoff and occupancy');
select pg_temp.assert((select bool_and(not available) from public.availability((now() at time zone 'Asia/Jakarta')::date+1)),'tomorrow unavailable');
select pg_temp.assert((select bool_and(not available) from public.availability((now() at time zone 'Asia/Jakarta')::date-1)),'yesterday unavailable');
select pg_temp.expect_error(format('select public.book_free_visit(%L::jsonb)',payload||jsonb_build_object('date',((now() at time zone 'Asia/Jakarta')::date+1)::text)),'INVALID_SLOT') from fixture;
select pg_temp.expect_error(format('select public.book_free_visit(%L::jsonb)',payload||jsonb_build_object('slot','21:00')),'INVALID_SLOT') from fixture;
select pg_temp.expect_error(format('select public.book_free_visit(%L::jsonb)',payload-'bust_circumference_cm'),'INVALID_INPUT') from fixture;
select pg_temp.expect_error(format('select public.book_free_visit(%L::jsonb)',payload||jsonb_build_object('phone','123')),'INVALID_INPUT') from fixture;
select pg_temp.expect_error(format('select public.book_free_visit(%L::jsonb)',payload||jsonb_build_object('event_date',((now() at time zone 'Asia/Jakarta')::date-1)::text)),'INVALID_INPUT') from fixture;
select pg_temp.expect_error(format('select public.book_free_visit(%L::jsonb)',payload||jsonb_build_object('event_date_unknown',true)),'INVALID_INPUT') from fixture;
select pg_temp.expect_error(format('select public.book_free_visit(%L::jsonb)',payload||jsonb_build_object(consent,false)),'INVALID_INPUT') from fixture cross join unnest(array['consent_on_time','consent_whatsapp','consent_stock','consent_terms']) consent;
select public.book_free_visit(payload) from fixture;
update fixture set rid=(select id from public.reservations where idempotency_key=(payload->>'key')::uuid);
select pg_temp.assert((select r.bust_circumference_cm=92.5 and r.event_date=(now() at time zone 'Asia/Jakarta')::date+1 and not r.event_date_unknown and r.consent_on_time and r.consent_whatsapp and r.consent_stock and r.consent_terms and r.terms_version='free-visit-2026-09-v1' and r.consented_at is not null and r.timezone='Asia/Jakarta' from public.reservations r where id=(select rid from fixture)),'new fields and consent persisted');
select public.book_free_visit(payload) from fixture;
select pg_temp.assert((select count(*)=1 from public.reminder_jobs where reservation_id=(select rid from fixture)),'one reminder on replay');
select pg_temp.assert((select j.due_at=r.appointment_at-interval '2 hours' from public.reminder_jobs j join public.reservations r on r.id=j.reservation_id where r.id=(select rid from fixture)),'exact H-2');
select pg_temp.expect_error(format('select public.book_free_visit(%L::jsonb)',payload||jsonb_build_object('bust_circumference_cm',93)),'IDEMPOTENCY_CONFLICT') from fixture;
select pg_temp.expect_error(format('select public.book_free_visit(%L::jsonb)',payload||jsonb_build_object('key',gen_random_uuid())),'one_active_booking_per_slot') from fixture;
select pg_temp.assert(not has_function_privilege('service_role','public.book_fitting(uuid,text,text,text,date,text,boolean,boolean)','execute'),'legacy RPC cannot bypass requirements');
select pg_temp.assert(not has_function_privilege('anon','public.book_free_visit(jsonb)','execute') and not has_function_privilege('authenticated','public.book_free_visit(jsonb)','execute'),'new RPC server only');
select pg_temp.assert((select count(*)=5 from pg_class c join pg_namespace n on c.relnamespace=n.oid where n.nspname='public' and c.relname in ('admins','reservations','reservation_audit','reminder_jobs','rate_limits') and c.relrowsecurity),'RLS all five tables');
-- Check dangerous global RPC grants without invoking them on the shared database.
select pg_temp.assert(not has_function_privilege(role,fn,'execute'),'private RPC denied')
from unnest(array['anon','authenticated']) role cross join unnest(array['public.availability(date)','public.claim_reminders(integer)','public.take_rate_limit(text,integer)','public.book_free_visit(jsonb)','public.book_fitting(uuid,text,text,text,date,text,boolean,boolean)']) fn;
select pg_temp.assert(not has_table_privilege(role,'public.'||tbl,op),'direct table mutation denied')
from unnest(array['anon','authenticated']) role cross join unnest(array['admins','reservations','reminder_jobs','reservation_audit','rate_limits']) tbl cross join unnest(array['INSERT','UPDATE','DELETE']) op;
grant select on fixture to authenticated;
set local role authenticated;
select pg_temp.assert((select count(*)=0 from public.reservations),'nonadmin no PII');
select pg_temp.expect_error(format('select public.change_status(%L,''confirmed'')',rid),'FORBIDDEN') from fixture;
reset role;
insert into auth.users(id,email) select admin_id,'free-visit-db-'||admin_id::text||'@example.invalid' from fixture;
insert into public.admins(user_id) select admin_id from fixture;
select set_config('request.jwt.claim.sub',(select admin_id::text from fixture),true);
set local role authenticated;
select pg_temp.assert((select bust_circumference_cm=92.5 from public.reservations where id=(select rid from fixture)),'admin reads new details');
select public.change_status(rid,'confirmed') from fixture;
select pg_temp.expect_error(format('select public.change_status(%L,''completed'')',rid),'APPOINTMENT_NOT_STARTED') from fixture;
select pg_temp.expect_error(format('select public.change_status(%L,''pending'')',rid),'INVALID_TRANSITION') from fixture;
select public.change_status(rid,'cancelled') from fixture;
select pg_temp.assert((select status='cancelled' from public.reminder_jobs where reservation_id=(select rid from fixture)),'cancellation cancels reminder');
select pg_temp.assert((select count(*)=3 from public.reservation_audit where reservation_id=(select rid from fixture)),'audit transitions');
reset role;
update fixture set payload=payload||jsonb_build_object('key',gen_random_uuid(),'event_date',null,'event_date_unknown',true);
select public.book_free_visit(payload) from fixture;
select pg_temp.assert((select event_date is null and event_date_unknown from public.reservations where idempotency_key=(select (payload->>'key')::uuid from fixture)),'unknown date stored null');
-- Global housekeeping/claim run only in an isolated database.
rollback;
select 'PASS: shared fixture-only database/RLS checks' as result;
