-- Replace only generated, flexible, unconfirmed future rows. The existing
-- recurring-save function validates and inserts the replacement rows in the
-- same transaction; a stale preview or any error rolls everything back.
create or replace function public.rebuild_recurring_grooming_plan(p_rows jsonb,p_expected_weeks jsonb,p_until date)
returns jsonb language plpgsql security invoker set search_path to public,pg_temp as $fn$
declare
 bid uuid:=planner_private.business_id();
 today date:=(now() at time zone coalesce(planner_private.settings()->>'timeZone','America/Chicago'))::date;
 wk record; expected record; row_value jsonb; revised jsonb; next_expected jsonb:=p_expected_weeks;
 current_plan jsonb; replaced integer:=0; result jsonb; key_date date; target_day jsonb;
begin
 if auth.uid() is null or bid is null or coalesce(planner_private.role(),'') not in ('owner','editor') then raise exception 'Owner or editor access required'; end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)=0 or jsonb_array_length(p_rows)>1000 then raise exception 'Review and select replacement appointments first'; end if;
 if jsonb_typeof(p_expected_weeks) is distinct from 'object' then raise exception 'A schedule snapshot is required'; end if;
 if p_until is null or p_until<=today or p_until>(today+interval '3 months')::date then raise exception 'Choose the next three months'; end if;
 -- All replacement dates must be inside the reviewed range.
 for row_value in select value from jsonb_array_elements(p_rows) loop
  if coalesce(row_value->>'Date','') !~ '^\d{4}-\d{2}-\d{2}$' or (row_value->>'Date')::date<=today or (row_value->>'Date')::date>p_until then raise exception 'Replacement date is outside the preview'; end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended(bid::text||':recurring',0));
 -- Lock in date order; RLS and an explicit business filter both apply.
 perform 1 from public.weekly_drafts where business_id=bid and week_start>=date_trunc('week',today+1)::date and week_start<=p_until order by week_start for update;
 -- Require every week in the range, including currently empty weeks.
 key_date:=date_trunc('week',today+1)::date;
 while key_date<=p_until loop
  if not p_expected_weeks ? key_date::text then raise exception 'The preview is missing a week. Rebuild it first'; end if;
  select plan_json into current_plan from public.weekly_drafts where business_id=bid and week_start=key_date;
  if coalesce(current_plan,'null'::jsonb) is distinct from p_expected_weeks->key_date::text then raise exception 'The schedule changed. Rebuild the preview before saving'; end if;
  key_date:=key_date+7;
 end loop;
 for wk in select week_start,plan_json,status from public.weekly_drafts where business_id=bid and week_start>=date_trunc('week',today+1)::date and week_start<=p_until order by week_start loop
  revised:='[]'::jsonb;
  for row_value in select value from jsonb_array_elements(coalesce(wk.plan_json,'[]'::jsonb)) loop
   if wk.status is distinct from 'confirmed' and coalesce(row_value->>'Date','') ~ '^\d{4}-\d{2}-\d{2}$'
      and (row_value->>'Date')::date>today and (row_value->>'Date')::date<=p_until
      and lower(coalesce(row_value->>'Appointment Status','')) not in ('cancelled','canceled','moved to another week','no-show','no show')
      and coalesce(row_value->'Locked Time','null'::jsonb) in ('null'::jsonb,'false'::jsonb,'0'::jsonb,'""'::jsonb)
      and coalesce(row_value->>'Completion Status','') !~* 'completed'
      and lower(btrim(coalesce(row_value->>'Client Confirmation',''))) not in ('confirmed','yes')
      and (jsonb_typeof(row_value->'Recurring IDs')='array' or coalesce(row_value->>'Status Note','') ~* '^Recurring draft') then
    row_value:=row_value || jsonb_build_object('Appointment Status','Moved to another week','Status','Rescheduled','Rebuilt At',now(),'Status Note',concat_ws(' · ',nullif(row_value->>'Status Note',''),'Replaced by reviewed recurring rebuild'));
    replaced:=replaced+1;
   end if;
   revised:=revised || jsonb_build_array(row_value);
  end loop;
  if revised is distinct from wk.plan_json then
   update public.weekly_drafts set plan_json=revised,status='draft',updated_at=now() where business_id=bid and week_start=wk.week_start;
   next_expected:=jsonb_set(next_expected,array[wk.week_start::text],revised,true);
  end if;
 end loop;
 result:=public.save_recurring_grooming_plan(p_rows,next_expected);
 if result->>'status' is distinct from 'saved' then raise exception 'Replacement appointments could not be saved'; end if;
 -- Check each rebuilt destination against the entire resulting day,
 -- including protected appointments retained by the rebuild.
 for row_value in select value from jsonb_array_elements(p_rows) loop
  select coalesce(jsonb_agg(e.value),'[]'::jsonb) into target_day
  from public.weekly_drafts wd cross join lateral jsonb_array_elements(wd.plan_json) e(value)
  where wd.business_id=bid and wd.week_start=date_trunc('week',(row_value->>'Date')::date)::date
    and e.value->>'Date'=row_value->>'Date' and e.value->>'Groomer'=row_value->>'Groomer'
    and lower(coalesce(e.value->>'Appointment Status','')) not in ('cancelled','canceled','moved to another week','no-show','no show');
  if exists(select 1 from jsonb_array_elements(target_day) e where lower(btrim(coalesce(e->>'Area Cluster',e->>'Area','')))<>lower(btrim(row_value->>'Area Cluster'))) then raise exception 'A rebuilt day would mix service areas. Rebuild the preview'; end if;
  if exists(
   select 1 from jsonb_array_elements(target_day) with ordinality a(value,ord)
   cross join jsonb_array_elements(target_day) with ordinality b(value,ord)
   where a.ord<b.ord
    and (a.value->>'Start Time')::time < (b.value->>'Start Time')::time+make_interval(mins=>(b.value->>'Minutes')::integer+coalesce((planner_private.settings()->>'bufferMinutes')::integer,0))
    and (b.value->>'Start Time')::time < (a.value->>'Start Time')::time+make_interval(mins=>(a.value->>'Minutes')::integer+coalesce((planner_private.settings()->>'bufferMinutes')::integer,0))
  ) then raise exception 'A rebuilt day would overlap appointments. Rebuild the preview'; end if;
 end loop;
 return result || jsonb_build_object('replaced',replaced);
end;
$fn$;
revoke all on function public.rebuild_recurring_grooming_plan(jsonb,jsonb,date) from public,anon;
grant execute on function public.rebuild_recurring_grooming_plan(jsonb,jsonb,date) to authenticated;
