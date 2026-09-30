-- Runs at any hour. Real production schema, fixture-only transaction, no global claim.
begin;
create function pg_temp.assert(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end $$;
create function pg_temp.denied(statement text) returns void language plpgsql as $$ begin
 begin execute statement; exception when insufficient_privilege then return; end;
 raise exception 'Expected insufficient privilege';
end $$;
create function pg_temp.invalid(statement text) returns void language plpgsql as $$ begin
 begin execute statement; exception when check_violation then return; end;
 raise exception 'Expected constraint rejection';
end $$;
create temp table fixture(id uuid, marker text);
insert into fixture values(gen_random_uuid(),'Revision RLS '||gen_random_uuid()::text);
grant select on fixture to anon,authenticated;
insert into public.reservations(id,idempotency_key,request_payload,name,phone,appointment_at,weight_kg,height_cm,event_plan,event_date_unknown,event_date,consent_on_time,consent_whatsapp,consent_stock,consent_terms,terms_version,consented_at,timezone)
select id,gen_random_uuid(),'{}',marker,'6281234567890',(timestamp '1903-01-01 11:00' at time zone 'Asia/Jakarta'),50,160,'',true,null,true,true,true,true,'free-visit-2026-09-v2',now(),'Asia/Jakarta' from fixture;
select pg_temp.assert((select array_agg(slot order by slot)=array['11:00','12:00','13:00','14:00','15:00'] from public.availability((now() at time zone 'Asia/Jakarta')::date)),'exact five slots');
select pg_temp.assert((select bool_and(not available) from public.availability((now() at time zone 'Asia/Jakarta')::date+1)),'same-day only');
select pg_temp.assert((select bool_and(available=(
 (((now() at time zone 'Asia/Jakarta')::date+slot::time) at time zone 'Asia/Jakarta') >= now()+interval '60 minutes'
 and not exists(select 1 from public.reservations r where r.appointment_at=(((now() at time zone 'Asia/Jakarta')::date+slot::time) at time zone 'Asia/Jakarta') and status<>'cancelled')
)) from public.availability((now() at time zone 'Asia/Jakarta')::date)),'actual Jakarta cutoff');
select pg_temp.invalid(format('update public.reservations set %I=%L::numeric where id=%L',col,val,id))
from fixture cross join (values('weight_kg','19'),('weight_kg','301'),('weight_kg','NaN'),('weight_kg','Infinity'),('height_cm','79'),('height_cm','251'),('height_cm','NaN'),('height_cm','-Infinity')) v(col,val);
select pg_temp.invalid(format('update public.reservations set %I=null where id=%L',col,id)) from fixture cross join unnest(array['weight_kg','height_cm']) col;
select pg_temp.invalid(format('update public.reservations set appointment_at=%L::timestamptz where id=%L','1903-01-01T'||slot||':00+07:00',id)) from fixture cross join unnest(array['16:00','17:00','18:00','19:00','20:00']) slot;
select pg_temp.invalid(format('update public.reservations set bust_circumference_cm=90 where id=%L',id)) from fixture;
select pg_temp.assert(not has_table_privilege(role,'public.'||tbl,op),'no direct private mutation grants') from unnest(array['anon','authenticated']) role cross join unnest(array['admins','reservations','reminder_jobs','reservation_audit','rate_limits']) tbl cross join unnest(array['INSERT','UPDATE','DELETE']) op;
select pg_temp.assert(not has_function_privilege(role,fn,'execute'),'private RPC denied') from unnest(array['anon','authenticated']) role cross join unnest(array['public.book_free_visit(jsonb)','public.book_fitting(uuid,text,text,text,date,text,boolean,boolean)','public.claim_reminders(integer)','public.take_rate_limit(text,integer)','public.availability(date)']) fn;
select pg_temp.assert((select bool_and(relrowsecurity) from pg_class c join pg_namespace n on c.relnamespace=n.oid where n.nspname='public' and c.relname in ('admins','reservations','reminder_jobs','reservation_audit','rate_limits')),'RLS enabled');
set local role anon;
select pg_temp.denied('select id from public.reservations');
select pg_temp.denied(format('select public.open_manual_reminder(%L)',id)) from fixture;
select pg_temp.denied(format('select public.change_status(%L,''confirmed'')',id)) from fixture;
select pg_temp.denied('select public.reservation_report(''1903-01-01'',''1903-01-01'',null)');
select pg_temp.denied(format('insert into public.%I default values',tbl)) from unnest(array['admins','reservations','reminder_jobs','reservation_audit','rate_limits']) tbl;
select pg_temp.denied(format('delete from public.%I where false',tbl)) from unnest(array['admins','reservations','reminder_jobs','reservation_audit','rate_limits']) tbl;
select pg_temp.denied(format('update public.%I set %I=%I where false',tbl,col,col)) from (values('admins','user_id'),('reservations','id'),('reminder_jobs','id'),('reservation_audit','new_status'),('rate_limits','key')) v(tbl,col);
reset role;
set local role authenticated;
select pg_temp.assert((select count(*)=0 from public.reservations where id=(select id from fixture)),'non-admin cannot read fixture PII');
select pg_temp.denied(format('select public.open_manual_reminder(%L)',id)) from fixture;
select pg_temp.denied(format('select public.change_status(%L,''confirmed'')',id)) from fixture;
select pg_temp.denied('select public.reservation_report(''1903-01-01'',''1903-01-01'',null)');
select pg_temp.denied(format('insert into public.%I default values',tbl)) from unnest(array['admins','reservations','reminder_jobs','reservation_audit','rate_limits']) tbl;
select pg_temp.denied(format('delete from public.%I where false',tbl)) from unnest(array['admins','reservations','reminder_jobs','reservation_audit','rate_limits']) tbl;
select pg_temp.denied(format('update public.%I set %I=%I where false',tbl,col,col)) from (values('admins','user_id'),('reservations','id'),('reminder_jobs','id'),('reservation_audit','new_status'),('rate_limits','key')) v(tbl,col);
reset role;
rollback;
select 'PASS: actual five-slot/cutoff, v2 measurement constraints, anon/nonadmin RPC and table RLS; fixture rolled back; no worker claim' as result;
