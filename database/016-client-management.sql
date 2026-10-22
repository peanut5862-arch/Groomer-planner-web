begin;
alter table public.planner_client_notes add column if not exists updated_at timestamptz;
alter table public.planner_client_notes add column if not exists deleted_at timestamptz;
create or replace function public.get_planner_client_notes(p_household text default null,p_week_start date default null,p_row_index integer default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare bid uuid:=planner_private.business_id(); h text; r jsonb; c jsonb; notes jsonb; dogs jsonb;
begin
 if auth.uid() is null or bid is null then raise exception 'Please sign in.'; end if;
 if planner_private.role()='groomer' then
  select w.plan_json->p_row_index into r from public.weekly_drafts w where w.business_id=bid and w.week_start=p_week_start;
  if p_row_index is null or p_row_index<0 or r is null or btrim(coalesce(r->>'Groomer','')) is distinct from public.current_groomer_name() then raise exception 'This stop is not assigned to you.'; end if;
  h:=nullif(btrim(r->>'Household ID'),'');
  if h is null then
   select min(d.household_id::text) into h from public.dogs d where d.business_id=bid and lower(btrim(d.owner))=lower(btrim(r->>'Owner')) having count(distinct d.household_id)=1;
  end if;
 else
  if planner_private.role() not in ('owner','editor','viewer') then raise exception 'No client access.'; end if;
  h:=nullif(btrim(p_household),'');
 end if;
 if h is null then raise exception 'This client needs a saved client card before adding photos or notes.'; end if;
 if planner_private.role()='groomer' and not coalesce(planner_private.can_read_dog_photo(bid,h),false) then raise exception 'This client is not assigned to you.'; end if;
 select jsonb_build_object('client',coalesce(d.client_notes,''),'access',coalesce(d.gate_access_notes,''),'parking',coalesce(d.parking_notes,'')) into c from public.client_details d where d.business_id=bid and d.household_id::text=h;
 select coalesce(jsonb_agg(jsonb_build_object('dog',d.dog_name,'grooming',coalesce(d.grooming_notes,''),'handling',coalesce(d.behavior_notes,''),'care',coalesce(d.medical_notes,'')) order by d.dog_name),'[]'::jsonb) into dogs from public.dog_details d where d.business_id=bid and d.household_id::text=h;
 select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'author',n.author_name,'note',n.note,'createdAt',n.created_at,'updatedAt',n.updated_at,'deleted',n.deleted_at is not null,'canEdit',(planner_private.role()='owner' or n.author_id=auth.uid())) order by n.created_at),'[]'::jsonb) into notes from public.planner_client_notes n where n.business_id=bid and n.household_id=h;
 return jsonb_build_object('householdId',h,'clientNotes',coalesce(c,'{}'::jsonb),'dogNotes',dogs,'sharedNotes',notes);
end $$;

create or replace function public.change_planner_client_note(p_id uuid,p_expected text,p_note text default null,p_action text default 'edit') returns void
language plpgsql security definer set search_path='' as $$
declare n public.planner_client_notes; bid uuid:=planner_private.business_id();
begin
 select * into n from public.planner_client_notes where id=p_id and business_id=bid for update;
 if n.id is null or auth.uid() is null or not coalesce(planner_private.can_write_dog_photo(bid,n.household_id),false) or not (planner_private.role()='owner' or n.author_id=auth.uid()) then raise exception 'You can change your own notes; the owner can manage all notes.'; end if;
 if n.note is distinct from p_expected then raise exception 'This note changed. Refresh before editing.'; end if;
 if p_action='edit' then
  if n.deleted_at is not null then raise exception 'Restore this note before editing.'; end if;
  if length(btrim(coalesce(p_note,''))) not between 1 and 2000 then raise exception 'Enter a note up to 2,000 characters.'; end if;
  update public.planner_client_notes set note=btrim(p_note),updated_at=now() where id=p_id;
 elsif p_action='delete' then update public.planner_client_notes set deleted_at=now() where id=p_id;
 elsif p_action='restore' then update public.planner_client_notes set deleted_at=null where id=p_id;
 else raise exception 'Unknown note action.'; end if;
end $$;
revoke all on function public.change_planner_client_note(uuid,text,text,text) from public,anon;
grant execute on function public.change_planner_client_note(uuid,text,text,text) to authenticated;

create table if not exists public.planner_removed_clients(business_id uuid references public.planner_businesses(id),household_id text,previous_status text,removed_at timestamptz not null default now(),primary key(business_id,household_id));
alter table public.planner_removed_clients enable row level security;
create policy removed_client_owner on public.planner_removed_clients for select to authenticated using(business_id=planner_private.business_id() and planner_private.role()='owner');
grant select on public.planner_removed_clients to authenticated;
create or replace function public.remove_planner_client(p_household text,p_restore boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare bid uuid:=planner_private.business_id(); previous text;
begin
 if auth.uid() is null or planner_private.role()<>'owner' then raise exception 'Only the owner can remove clients.'; end if;
 if not exists(select 1 from public.dogs where business_id=bid and household_id::text=p_household) then raise exception 'Client not found.'; end if;
 perform pg_advisory_xact_lock(hashtext(bid::text||p_household));
 if p_restore then
  select previous_status into previous from public.planner_removed_clients where business_id=bid and household_id=p_household;
  if not found then return; end if;
  update public.client_details set client_status=coalesce(previous,'Active'),updated_at=now() where business_id=bid and household_id::text=p_household;
  delete from public.planner_removed_clients where business_id=bid and household_id=p_household;
 else
  select client_status into previous from public.client_details where business_id=bid and household_id::text=p_household;
  insert into public.planner_removed_clients(business_id,household_id,previous_status) values(bid,p_household,coalesce(previous,'Active')) on conflict do nothing;
  insert into public.client_details(business_id,household_id,client_status) values(bid,p_household,'Inactive') on conflict(business_id,household_id) do update set client_status='Inactive',updated_at=now();
 end if;
end $$;
revoke all on function public.remove_planner_client(text,boolean) from public,anon;
grant execute on function public.remove_planner_client(text,boolean) to authenticated;
commit;
