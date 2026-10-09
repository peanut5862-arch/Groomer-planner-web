CREATE OR REPLACE FUNCTION public.reschedule_grooming_appointment_flexible(p_week_start date, p_expected_row jsonb, p_target_date date, p_target_time text, p_target_groomer text, p_note text, p_fixed boolean) 
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_source_plan jsonb;
  v_target_plan jsonb;
  v_source_count integer;
  v_source_index integer;
  v_source_row jsonb;
  v_moved_row jsonb;
  v_target_row jsonb;
  v_target_week date;
  v_household text;
  v_owner text;
  v_note text := nullif(btrim(p_note),'');
  v_duplicate_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if coalesce(planner_private.role(),'') not in ('owner','editor') then
    raise exception 'Only owners and editors can reschedule appointments';
  end if;

  if p_target_date is null then
    raise exception 'A new appointment date is required';
  end if;

  if p_target_time is null
     or p_target_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'A valid appointment time is required';
  end if;

  if planner_private.groomer(p_target_groomer) is null then
    raise exception 'Choose one of your groomers';
  end if;

  v_target_week :=
    p_target_date - ((extract(isodow from p_target_date)::integer) - 1);

  select wd.plan_json
  into v_source_plan
  from public.weekly_drafts wd
  where wd.business_id = planner_private.business_id() and wd.week_start = p_week_start
  for update;

  if v_source_plan is null then
    raise exception 'Source week not found';
  end if;

  select
    count(*)::integer,
    min(entry.ord)::integer
  into
    v_source_count,
    v_source_index
  from jsonb_array_elements(v_source_plan)
       with ordinality as entry(value, ord)
  where entry.value = p_expected_row;

  if v_source_count = 0 then
    raise exception 'Appointment not found or has already changed';
  end if;

  if v_source_count > 1 then
    raise exception 'More than one matching appointment was found';
  end if;

  v_source_row := v_source_plan -> (v_source_index - 1);

  if lower(coalesce(v_source_row ->> 'Completion Status','')) = 'completed' then
    raise exception 'Completed appointments cannot be rescheduled';
  end if;

  if lower(coalesce(v_source_row ->> 'Appointment Status',''))
     in ('cancelled','canceled','moved to another week') then
    raise exception 'Cancelled or moved appointments cannot be rescheduled';
  end if;

  v_household :=
    nullif(
      btrim(v_source_row ->> 'Household ID'),
      ''
    );

  v_owner :=
    nullif(
      btrim(
        coalesce(
          v_source_row ->> 'Owner',
          v_source_row ->> 'Client'
        )
      ),
      ''
    );

  if v_owner is null then
    raise exception 'Client name is missing';
  end if;

  if v_target_week = p_week_start then
    v_target_plan := v_source_plan;
  else
    select wd.plan_json
    into v_target_plan
    from public.weekly_drafts wd
    where wd.business_id = planner_private.business_id() and wd.week_start = v_target_week
    for update;

    v_target_plan := coalesce(v_target_plan, '[]'::jsonb);
  end if;

  select count(*)::integer
  into v_duplicate_count
  from jsonb_array_elements(v_target_plan)
       with ordinality as entry(value, ord)
  where not (
    v_target_week = p_week_start
    and entry.ord = v_source_index
  )
  and lower(coalesce(entry.value ->> 'Completion Status','')) <> 'completed'
  and lower(coalesce(entry.value ->> 'Appointment Status','')) not in (
    'cancelled',
    'canceled',
    'moved to another week',
    'missed',
    'no show',
    'no-show',
    'noshow'
  )
  and lower(coalesce(entry.value ->> 'Status','')) not in (
    'completed',
    'cancelled',
    'canceled',
    'rescheduled',
    'missed',
    'no show',
    'no-show',
    'noshow'
  )
  and (
    (
      v_household is not null
      and (
        nullif(
          btrim(entry.value ->> 'Household ID'),
          ''
        ) = v_household

        or (
          nullif(
            btrim(entry.value ->> 'Household ID'),
            ''
          ) is null

          and lower(
            btrim(
              coalesce(
                entry.value ->> 'Owner',
                entry.value ->> 'Client',
                ''
              )
            )
          ) = lower(v_owner)
        )
      )
    )

    or (
      v_household is null
      and lower(
        btrim(
          coalesce(
            entry.value ->> 'Owner',
            entry.value ->> 'Client',
            ''
          )
        )
      ) = lower(v_owner)
    )
  );

  if v_duplicate_count > 0 then
    raise exception
      'This household already has a separate active appointment in the destination week.';
  end if;

  v_moved_row :=
    jsonb_set(
      v_source_row,
      '{Appointment Status}',
      to_jsonb('Moved to another week'::text),
      true
    );

  v_moved_row :=
    jsonb_set(
      v_moved_row,
      '{Status}',
      to_jsonb('Rescheduled'::text),
      true
    );

  v_moved_row :=
    jsonb_set(
      v_moved_row,
      '{Rescheduled To}',
      to_jsonb(p_target_date::text),
      true
    );

  v_moved_row :=
    jsonb_set(
      v_moved_row,
      '{Route Review Needed}',
      'true'::jsonb,
      true
    );

  if v_note is null then
    v_moved_row :=
      v_moved_row - 'Status Note';
  else
    v_moved_row :=
      jsonb_set(
        v_moved_row,
        '{Status Note}',
        to_jsonb(v_note),
        true
      );
  end if;

  v_target_row :=
    v_source_row
    - 'Completion Status'
    - 'Completed Date'
    - 'Completion Snapshot'
    - 'Cancelled Date'
    - 'Rescheduled To';

  v_target_row :=
    jsonb_set(
      v_target_row,
      '{Date}',
      to_jsonb(p_target_date::text),
      true
    );

  v_target_row :=
    jsonb_set(
      v_target_row,
      '{Day}',
      to_jsonb(to_char(p_target_date,'Dy')),
      true
    );

  v_target_row :=
    jsonb_set(
      v_target_row,
      '{Groomer}',
      to_jsonb(p_target_groomer),
      true
    );

  v_target_row :=
    jsonb_set(
      v_target_row,
      '{Start Time}',
      to_jsonb(p_target_time),
      true
    );

  v_target_row := v_target_row - 'Locked Time' - 'End Time';
  if p_fixed then
    v_target_row := jsonb_set(v_target_row, '{Locked Time}', to_jsonb(p_target_time), true);
  end if;

  v_target_row :=
    jsonb_set(
      v_target_row,
      '{Appointment Status}',
      to_jsonb('Scheduled'::text),
      true
    );

  v_target_row :=
    jsonb_set(
      v_target_row,
      '{Status}',
      to_jsonb('Scheduled'::text),
      true
    );

  v_target_row :=
    jsonb_set(
      v_target_row,
      '{Route Review Needed}',
      'true'::jsonb,
      true
    );

  if v_note is null then
    v_target_row :=
      v_target_row - 'Status Note';
  else
    v_target_row :=
      jsonb_set(
        v_target_row,
        '{Status Note}',
        to_jsonb(v_note),
        true
      );
  end if;

  if v_target_week = p_week_start then

    v_source_plan :=
      jsonb_set(
        v_source_plan,
        array[(v_source_index - 1)::text],
        v_moved_row,
        false
      )
      || jsonb_build_array(v_target_row);

    update public.weekly_drafts
    set
      plan_json = v_source_plan,
      status = 'draft',
      updated_at = now()
    where business_id = planner_private.business_id() and week_start = p_week_start;

  else

    v_source_plan :=
      jsonb_set(
        v_source_plan,
        array[(v_source_index - 1)::text],
        v_moved_row,
        false
      );

    update public.weekly_drafts
    set
      plan_json = v_source_plan,
      status = 'draft',
      updated_at = now()
    where business_id = planner_private.business_id() and week_start = p_week_start;

    if exists (
      select 1
      from public.weekly_drafts
      where business_id = planner_private.business_id() and week_start = v_target_week
    ) then

      update public.weekly_drafts
      set
        plan_json =
          coalesce(plan_json,'[]'::jsonb)
          || jsonb_build_array(v_target_row),
        status = 'draft',
        updated_at = now()
      where business_id = planner_private.business_id() and week_start = v_target_week;

    else

      insert into public.weekly_drafts (
        week_start,
        plan_json,
        status,
        updated_at
      )
      values (
        v_target_week,
        jsonb_build_array(v_target_row),
        'draft',
        now()
      );

    end if;
  end if;

  return jsonb_build_object(
    'status','rescheduled',
    'target_date',p_target_date,
    'target_week',v_target_week,
    'groomer',p_target_groomer,
    'time',p_target_time
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.reschedule_grooming_appointment_safe(p_week_start date, p_expected_row jsonb, p_target_date date, p_target_time text, p_target_groomer text, p_note text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO '' AS $fn$
 SELECT public.reschedule_grooming_appointment_flexible(p_week_start,p_expected_row,p_target_date,p_target_time,p_target_groomer,p_note,false);
$fn$;
REVOKE ALL ON FUNCTION public.reschedule_grooming_appointment_flexible(date,jsonb,date,text,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reschedule_grooming_appointment_flexible(date,jsonb,date,text,text,text,boolean) TO authenticated;
NOTIFY pgrst, 'reload schema';
