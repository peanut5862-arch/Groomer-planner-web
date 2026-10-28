create or replace function planner_private.closed_reason(p_date date,p_groomer text)
returns text language sql stable security invoker set search_path to '' as $fn$
 select coalesce(nullif(c->>'label',''),'Business closed')
 from jsonb_array_elements(coalesce(planner_private.settings()->'timeOff','[]'::jsonb)) c
 where (c->>'start')::date<=p_date and (c->>'end')::date>=p_date
 and (nullif(c->>'groomerId','') is null or exists(select 1 from jsonb_array_elements(planner_private.settings()->'groomers') g where g->>'name'=p_groomer and g->>'id'=c->>'groomerId')) limit 1;
$fn$;
revoke all on function planner_private.closed_reason(date,text) from public,anon;
grant execute on function planner_private.closed_reason(date,text) to authenticated;

create or replace function public.move_closed_day_appointments(p_moves jsonb,p_expected_weeks jsonb,p_expected_settings jsonb)
returns jsonb language plpgsql security invoker set search_path to '' as $fn$
declare
 bid uuid:=planner_private.business_id(); today date:=(now() at time zone coalesce(planner_private.settings()->>'timeZone','America/Chicago'))::date;
 entry record; m jsonb; src jsonb; target jsonb; plans jsonb:=p_expected_weeks; current_plan jsonb; plan jsonb; target_day jsonb; profile jsonb;
 sw date; tw date; target_date date; n integer; changed integer:=0; gap integer:=coalesce((planner_private.settings()->>'bufferMinutes')::integer,0);
begin
 if auth.uid() is null or bid is null or coalesce(planner_private.role(),'') not in ('owner','editor') then raise exception 'Owner or editor access required';end if;
 if jsonb_typeof(p_moves) is distinct from 'array' or jsonb_array_length(p_moves)>1000 or jsonb_typeof(p_expected_weeks) is distinct from 'object' then raise exception 'Invalid closure move plan';end if;
 if p_expected_settings is distinct from planner_private.settings() then raise exception 'Settings changed. Retry the holiday move';end if;
 perform pg_advisory_xact_lock(hashtextextended(bid::text||':recurring',0));
 for entry in select key,value from jsonb_each(p_expected_weeks) order by key loop
  select plan_json into current_plan from public.weekly_drafts where business_id=bid and week_start=entry.key::date for update;
  if coalesce(current_plan,'null'::jsonb) is distinct from entry.value then raise exception 'The schedule changed. Retry the holiday move';end if;
  plans:=jsonb_set(plans,array[entry.key],coalesce(current_plan,'[]'::jsonb));
 end loop;
 -- Validate and remove every source before inserting any destination, so
 -- multiple dog rows from one household move together in one transaction.
 for m in select value from jsonb_array_elements(p_moves) loop
  src:=m->'expectedRow';sw:=(m->>'weekStart')::date;target_date:=(m->>'date')::date;
  tw:=date_trunc('week',target_date)::date;
  if not plans ? sw::text or not plans ? tw::text then raise exception 'A required week is missing';end if;
  select count(*) into n from jsonb_array_elements(plans->sw::text) e where e=src;
  if n<>1 then raise exception 'A source appointment changed';end if;
  if lower(coalesce(src->>'Completion Status',''))='completed' or lower(coalesce(src->>'Appointment Status','')) in ('cancelled','canceled','moved to another week','no-show','no show') then raise exception 'A source appointment is no longer active';end if;
  if (src->>'Date')::date<today or planner_private.closed_reason((src->>'Date')::date,src->>'Groomer') is null then raise exception 'Only appointments on saved closed dates can move automatically';end if;
  if target_date<today or target_date<=(src->>'Date')::date or target_date>(src->>'Date')::date+21 or planner_private.closed_reason(target_date,m->>'groomer') is not null then raise exception 'The destination must be an open date within 21 days';end if;
  select value into profile from jsonb_array_elements(planner_private.settings()->'groomers') where value->>'name'=m->>'groomer' and coalesce((value->>'active')::boolean,true);
  if profile is null or not (profile->'workDays') @> to_jsonb(array[extract(dow from target_date)::integer]) then raise exception 'Groomer does not work on the destination date';end if;
  if coalesce(m->>'time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce((src->>'Minutes')::integer,0)<1 or (m->>'time')::time<(profile->>'startTime')::time or (m->>'time')::time+make_interval(mins=>(src->>'Minutes')::integer)>(profile->>'endTime')::time then raise exception 'Invalid destination time';end if;
  select jsonb_agg(case when e=src then e||jsonb_build_object('Appointment Status','Moved to another week','Status','Rescheduled','Rescheduled To',target_date::text,'Route Review Needed',true,'Status Note',concat_ws(' · ',nullif(e->>'Status Note',''),'Moved automatically off a closed day')) else e end order by ord) into plan from jsonb_array_elements(plans->sw::text) with ordinality a(e,ord);
  plans:=jsonb_set(plans,array[sw::text],plan);
 end loop;
 for m in select value from jsonb_array_elements(p_moves) loop
  src:=m->'expectedRow';target_date:=(m->>'date')::date;tw:=date_trunc('week',target_date)::date;
  target:=(src-'Completion Status'-'Completed Date'-'Completion Snapshot'-'Cancelled Date'-'Rescheduled To'-'Locked Time'-'End Time')||jsonb_build_object('Date',target_date::text,'Day',to_char(target_date,'Dy'),'Groomer',m->>'groomer','Start Time',m->>'time','Appointment Status','Scheduled','Status','Scheduled','Client Confirmation','Unconfirmed','Route Review Needed',true,'Status Note',concat_ws(' · ',nullif(src->>'Status Note',''),'Moved automatically off a closed day'));
  plans:=jsonb_set(plans,array[tw::text],plans->tw::text||jsonb_build_array(target));changed:=changed+1;
 end loop;
 for m in select value from jsonb_array_elements(p_moves) loop
  tw:=date_trunc('week',(m->>'date')::date)::date;
  select coalesce(jsonb_agg(e),'[]'::jsonb) into target_day from jsonb_array_elements(plans->tw::text) e where e->>'Date'=m->>'date' and e->>'Groomer'=m->>'groomer' and lower(coalesce(e->>'Appointment Status','')) not in ('cancelled','canceled','moved to another week','no-show','no show');
  if exists(select 1 from jsonb_array_elements(target_day) e where lower(btrim(coalesce(e->>'Area Cluster',e->>'Area','')))<>lower(btrim(coalesce(m->'expectedRow'->>'Area Cluster',m->'expectedRow'->>'Area','')))) then raise exception 'A destination would mix service areas';end if;
  if exists(select 1 from jsonb_array_elements(target_day) with ordinality a(v,i) cross join jsonb_array_elements(target_day) with ordinality b(v,i) where a.i<b.i and (a.v->>'Start Time')::time<(b.v->>'Start Time')::time+make_interval(mins=>(b.v->>'Minutes')::integer+gap) and (b.v->>'Start Time')::time<(a.v->>'Start Time')::time+make_interval(mins=>(a.v->>'Minutes')::integer+gap)) then raise exception 'A destination would overlap appointments';end if;
 end loop;
 for entry in select key,value from jsonb_each(plans) loop
  if entry.value is distinct from coalesce(nullif(p_expected_weeks->entry.key,'null'::jsonb),'[]'::jsonb) then
   insert into public.weekly_drafts(business_id,week_start,plan_json,status,updated_at) values(bid,entry.key::date,entry.value,'draft',now()) on conflict(business_id,week_start) do update set plan_json=excluded.plan_json,status='draft',updated_at=now();
  end if;
 end loop;
 return jsonb_build_object('status','moved','moved',changed);
end;
$fn$;
revoke all on function public.move_closed_day_appointments(jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.move_closed_day_appointments(jsonb,jsonb,jsonb) to authenticated;
