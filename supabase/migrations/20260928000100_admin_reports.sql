-- Preserve historical no_show rows; new transitions follow the four-status workflow.
create or replace function public.change_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.reservations;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into r from public.reservations where id=p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if r.status=p_status then return; end if;
  if not ((r.status='pending' and p_status in ('confirmed','cancelled'))
    or (r.status='confirmed' and p_status in ('completed','cancelled'))) then
    raise exception 'INVALID_TRANSITION';
  end if;
  if p_status='completed' and r.appointment_at>now() then raise exception 'APPOINTMENT_NOT_STARTED'; end if;
  update public.reservations set status=p_status,status_updated_at=clock_timestamp() where id=p_id;
  insert into public.reservation_audit(reservation_id,actor_id,old_status,new_status)
    values(p_id,auth.uid(),r.status,p_status);
  if p_status in ('completed','cancelled') then
    update public.reminder_jobs set status='cancelled',lock_token=null,safe_error='RESERVATION_INACTIVE'
      where reservation_id=p_id and status in ('scheduled','processing');
  end if;
end; $$;
revoke all on function public.change_status(uuid,text) from public,anon;
grant execute on function public.change_status(uuid,text) to authenticated;

-- Single SQL snapshot and one JSON result: not subject to a PostgREST row page cap.
-- Invoker privileges retain RLS; membership is also explicitly checked.
create function public.reservation_report(p_start date,p_end date,p_status text default null)
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
    select r.reference,r.appointment_at,r.name,r.phone,r.bust_circumference_cm,
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
