-- Keep the existing functions, permissions and validations. Add closure checks
-- at their established validation points; stop if an unexpected version is installed.
do $patch$
declare definition text; needle text; guard text; signature regprocedure;
begin
 signature:='public.save_recurring_grooming_plan(jsonb,jsonb)'::regprocedure;
 select pg_get_functiondef(signature) into definition;
 needle:='for r in select value from jsonb_array_elements(p_rows) loop';
 guard:=$guard$
  if planner_private.closed_reason((r->>'Date')::date,r->>'Groomer') is not null then
   raise exception 'This date is closed for the selected groomer. Choose an open date.';
  end if;
$guard$;
 if position('planner_private.closed_reason' in definition)=0 then
  if position(needle in definition)=0 then raise exception 'Unexpected recurring save function. Review before installing closure guard';end if;
  execute replace(definition,needle,needle||guard);
 end if;
 signature:='public.reschedule_grooming_appointment_flexible(date,jsonb,date,text,text,text,boolean)'::regprocedure;
 select pg_get_functiondef(signature) into definition;
 needle:='  v_target_week :=';
 guard:=$guard$
  if planner_private.closed_reason(p_target_date,p_target_groomer) is not null then
   raise exception 'This date is closed for the selected groomer. Choose an open date.';
  end if;
$guard$;
 if position('planner_private.closed_reason' in definition)=0 then
  if position(needle in definition)=0 then raise exception 'Unexpected reschedule function. Review before installing closure guard';end if;
  execute replace(definition,needle,guard||needle);
 end if;
end;
$patch$;
