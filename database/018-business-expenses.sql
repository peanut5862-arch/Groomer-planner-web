begin;
create table public.planner_expenses (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null default planner_private.business_id() references public.planner_businesses(id),
 author_id uuid not null default auth.uid(),author_name text not null,
 expense_date date not null,category text not null check(category in ('Fuel','Supplies','Insurance','Vehicle payment','Repairs','Maintenance','Equipment','Rent','Utilities','Software','Other')),
 amount numeric(12,2) not null check(amount>0 and amount<=9999999999.99),
 vendor text not null default '' check(length(vendor)<=200),notes text not null default '' check(length(notes)<=2000),
 receipt_path text unique,deleted_at timestamptz,updated_at timestamptz not null default clock_timestamp(),
 check(receipt_path is null or (split_part(receipt_path,'/',1)=business_id::text and split_part(receipt_path,'/',3)=id::text and receipt_path !~ '\.\.' and receipt_path ~ '\.jpg$'))
);
create index expense_month on public.planner_expenses(business_id,expense_date desc);
alter table public.planner_expenses enable row level security;
create policy expense_read on public.planner_expenses for select to authenticated using(business_id=planner_private.business_id() and (planner_private.role()='owner' or (planner_private.role()='groomer' and author_id=auth.uid())));
grant select on public.planner_expenses to authenticated;
create function public.save_planner_expense(p_id uuid,p_date date,p_category text,p_amount numeric,p_vendor text default '',p_notes text default '',p_receipt text default null,p_expected timestamptz default null,p_action text default 'save') returns uuid language plpgsql security definer set search_path='' as $$
declare bid uuid:=planner_private.business_id(); r text:=planner_private.role(); existing public.planner_expenses; display_name text;
begin
 if auth.uid() is null or bid is null or r not in ('owner','groomer') then raise exception 'Expense access is not available.'; end if;
 perform pg_advisory_xact_lock(hashtext(p_id::text));
 select * into existing from public.planner_expenses where id=p_id for update;
 if existing.id is not null then
  if existing.business_id<>bid or (r<>'owner' and existing.author_id<>auth.uid()) then raise exception 'Expense not found.'; end if;
  if p_expected is distinct from existing.updated_at then raise exception 'This expense changed. Refresh before editing.'; end if;
 elsif p_expected is not null or p_action<>'save' then raise exception 'Expense not found.';
 end if;
 if p_action in ('delete','restore') then
  update public.planner_expenses set deleted_at=case when p_action='delete' then clock_timestamp() else null end,updated_at=clock_timestamp() where id=p_id;return p_id;
 elsif p_action<>'save' then raise exception 'Unknown expense action.'; end if;
 if existing.deleted_at is not null then raise exception 'Restore this expense before editing.'; end if;
 if r='groomer' and p_category not in ('Fuel','Supplies') then raise exception 'Choose gas or supplies.'; end if;
 if p_receipt is not null and p_receipt is distinct from existing.receipt_path then
  if split_part(p_receipt,'/',2)<>auth.uid()::text or not exists(select 1 from storage.objects where bucket_id='expense-receipts' and name=p_receipt) then raise exception 'Upload the receipt before saving.'; end if;
 end if;
 display_name:=case when r='groomer' then public.current_groomer_name() else 'Owner' end;
 insert into public.planner_expenses(id,business_id,author_id,author_name,expense_date,category,amount,vendor,notes,receipt_path)
 values(p_id,bid,auth.uid(),coalesce(display_name,'Groomer'),p_date,p_category,p_amount,btrim(coalesce(p_vendor,'')),btrim(coalesce(p_notes,'')),p_receipt)
 on conflict(id) do update set expense_date=excluded.expense_date,category=excluded.category,amount=excluded.amount,vendor=excluded.vendor,notes=excluded.notes,receipt_path=excluded.receipt_path,updated_at=clock_timestamp();
 return p_id;
end $$;
revoke all on function public.save_planner_expense(uuid,date,text,numeric,text,text,text,timestamptz,text) from public,anon;
grant execute on function public.save_planner_expense(uuid,date,text,numeric,text,text,text,timestamptz,text) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('expense-receipts','expense-receipts',false,5242880,array['image/jpeg']);
create policy expense_receipt_read on storage.objects for select to authenticated using(bucket_id='expense-receipts' and split_part(name,'/',1)=planner_private.business_id()::text and exists(select 1 from public.planner_expenses e where e.receipt_path=name));
create policy expense_receipt_upload on storage.objects for insert to authenticated with check(bucket_id='expense-receipts' and planner_private.role() in ('owner','groomer') and split_part(name,'/',1)=planner_private.business_id()::text and split_part(name,'/',2)=auth.uid()::text);
create policy expense_receipt_cleanup on storage.objects for delete to authenticated using(bucket_id='expense-receipts' and split_part(name,'/',1)=planner_private.business_id()::text and (planner_private.role()='owner' or (planner_private.role()='groomer' and split_part(name,'/',2)=auth.uid()::text)) and not exists(select 1 from public.planner_expenses e where e.receipt_path=name));
notify pgrst,'reload schema';
commit;
