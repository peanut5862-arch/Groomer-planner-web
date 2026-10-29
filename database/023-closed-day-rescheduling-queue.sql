-- The existing three-argument move function retains its validations and grants.
-- This overload moves what fits and queues the remainder atomically.
create or replace function public.move_closed_day_appointments(p_moves jsonb,p_expected_weeks jsonb,p_expected_settings jsonb,p_unplaced jsonb)
returns jsonb language plpgsql security invoker set search_path to '' as $fn$
declare
 bid uuid:=planner_private.business_id();
 today date:=(now() at time zone coalesce(planner_private.settings()->>'timeZone','America/Chicago'))::date;
 result jsonb; q jsonb; src jsonb; current_plan jsonb; updated_plan jsonb;
 sw date; closed_date date; closed_groomer text; n integer; queued integer:=0;
begin
 if auth.uid() is null or bid is null or coalesce(planner_private.role(),'') not in ('owner','editor') then raise exception 'Owner or editor access required';end if;
 if jsonb_typeof(p_unplaced) is distinct from 'array' or jsonb_array_length(p_unplaced)>1000 then raise exception 'Invalid rescheduling queue';end if;
 -- Includes settings/week snapshot checks and the shared business schedule lock.
 result:=public.move_closed_day_appointments(p_moves,p_expected_weeks,p_expected_settings);
 for q in select value from jsonb_array_elements(p_unplaced) loop
  src:=q->'expectedRow';sw:=(q->>'weekStart')::date;
  closed_date:=coalesce((q->>'closedDate')::date,(src->>'Date')::date);
  closed_groomer:=coalesce(q->>'closedGroomer',src->>'Groomer');
  if not p_expected_weeks ? sw::text then raise exception 'A reviewed source week is required';end if;
  select plan_json into current_plan from public.weekly_drafts where business_id=bid and week_start=sw for update;
  select count(*) into n from jsonb_array_elements(current_plan) e where e=src;
  if n<>1 then raise exception 'An appointment changed. Refresh before saving time off';end if;
  if lower(coalesce(src->>'Completion Status',''))='completed' or lower(coalesce(src->>'Appointment Status','')) in ('cancelled','canceled','moved to another week','no-show','no show') then raise exception 'Only active future appointments can enter the queue';end if;
  if (src->>'Date')::date<today or planner_private.closed_reason(closed_date,closed_groomer) is null then raise exception 'A saved closed date is required';end if;
  if closed_date=(src->>'Date')::date and closed_groomer is distinct from src->>'Groomer' then raise exception 'The closed groomer does not match the source';end if;
  if closed_date<>(src->>'Date')::date and not exists(select 1 from jsonb_each(p_expected_weeks) w cross join lateral jsonb_array_elements(coalesce(nullif(w.value,'null'::jsonb),'[]'::jsonb)) old where old->>'Date'=closed_date::text and old->>'Groomer'=closed_groomer and old->>'Rescheduled To'=src->>'Date' and old->>'Dogs'=src->>'Dogs' and coalesce(old->>'Household ID',old->>'Owner')=coalesce(src->>'Household ID',src->>'Owner')) then raise exception 'The original holiday appointment could not be verified';end if;
  select jsonb_agg(case when e=src then (e-'Rescheduled To')||jsonb_build_object(
   'Appointment Status','Moved to another week',
   'Status','Needs rescheduling',
   'Queued Date',today::text,
   'Original Closed Date',closed_date::text,
   'Needs Rescheduling Reason',planner_private.closed_reason(closed_date,closed_groomer),
   'Route Review Needed',true
  ) else e end order by ord) into updated_plan from jsonb_array_elements(current_plan) with ordinality a(e,ord);
  update public.weekly_drafts set plan_json=updated_plan,updated_at=now() where business_id=bid and week_start=sw;
  queued:=queued+1;
 end loop;
 return result||jsonb_build_object('queued',queued);
end;
$fn$;
revoke all on function public.move_closed_day_appointments(jsonb,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.move_closed_day_appointments(jsonb,jsonb,jsonb,jsonb) to authenticated;
