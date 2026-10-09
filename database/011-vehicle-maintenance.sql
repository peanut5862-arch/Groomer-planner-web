begin;
create table public.planner_vehicles (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null default planner_private.business_id() references public.planner_businesses(id),
 name text not null check(length(btrim(name)) between 1 and 100),
 plate text not null default '' check(length(plate)<=30),
 assigned_groomer_id text,
 odometer integer not null default 0 check(odometer between 0 and 10000000),
 active boolean not null default true,
 notes text not null default '' check(length(notes)<=3000),
 updated_at timestamptz not null default now(),
 unique(business_id,id)
);
create table public.planner_vehicle_maintenance (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null default planner_private.business_id(),
 vehicle_id uuid not null,
 service_date date not null,
 category text not null check(category in ('Oil change','Tires','Brakes','Generator','Grooming equipment','Inspection','Repair','Other')),
 mileage integer check(mileage between 0 and 10000000),
 cost numeric(12,2) check(cost between 0 and 9999999999.99),
 shop text not null default '' check(length(shop)<=200),
 notes text not null default '' check(length(notes)<=5000),
 next_due_date date,
 next_due_mileage integer check(next_due_mileage between 0 and 10000000),
 receipt_path text unique,
 updated_at timestamptz not null default now(),
 foreign key(business_id,vehicle_id) references public.planner_vehicles(business_id,id),
 check(receipt_path is null or (receipt_path like business_id::text||'/'||vehicle_id::text||'/'||id::text||'/%' and receipt_path !~ '\.\.' and receipt_path ~ '\.jpg$'))
);
create index vehicle_maintenance_history on public.planner_vehicle_maintenance(business_id,vehicle_id,service_date desc);
alter table public.planner_vehicles enable row level security;
alter table public.planner_vehicle_maintenance enable row level security;
create policy owner_vehicle_read on public.planner_vehicles for select to authenticated using(business_id=planner_private.business_id() and planner_private.role()='owner');
create policy owner_vehicle_insert on public.planner_vehicles for insert to authenticated with check(business_id=planner_private.business_id() and planner_private.role()='owner');
create policy owner_vehicle_update on public.planner_vehicles for update to authenticated using(business_id=planner_private.business_id() and planner_private.role()='owner') with check(business_id=planner_private.business_id() and planner_private.role()='owner');
create policy owner_maintenance_read on public.planner_vehicle_maintenance for select to authenticated using(business_id=planner_private.business_id() and planner_private.role()='owner');
create policy owner_maintenance_insert on public.planner_vehicle_maintenance for insert to authenticated with check(business_id=planner_private.business_id() and planner_private.role()='owner');
create policy owner_maintenance_update on public.planner_vehicle_maintenance for update to authenticated using(business_id=planner_private.business_id() and planner_private.role()='owner') with check(business_id=planner_private.business_id() and planner_private.role()='owner');
grant select,insert,update on public.planner_vehicles,public.planner_vehicle_maintenance to authenticated;
create function planner_private.validate_vehicle() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.id<>old.id or new.business_id<>old.business_id) then raise exception 'Vehicle identity cannot change.'; end if;
 if new.assigned_groomer_id is not null and not exists(select 1 from jsonb_array_elements(planner_private.settings()->'groomers') g where g->>'id'=new.assigned_groomer_id and g->'active'='true'::jsonb) then
  if tg_op='INSERT' or new.assigned_groomer_id is distinct from old.assigned_groomer_id then raise exception 'Choose an active groomer.'; end if;
 end if;
 new.updated_at=now();return new;
end $$;
create trigger vehicle_valid before insert or update on public.planner_vehicles for each row execute function planner_private.validate_vehicle();
create function planner_private.vehicle_service_saved() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.id<>old.id or new.business_id<>old.business_id or new.vehicle_id<>old.vehicle_id) then raise exception 'Maintenance identity cannot change.'; end if;
 new.updated_at=now();
 update public.planner_vehicles set odometer=greatest(odometer,coalesce(new.mileage,0)),updated_at=now() where business_id=new.business_id and id=new.vehicle_id;
 return new;
end $$;
create trigger vehicle_service_valid before insert or update on public.planner_vehicle_maintenance for each row execute function planner_private.vehicle_service_saved();
revoke all on function planner_private.validate_vehicle(),planner_private.vehicle_service_saved() from public,anon;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('vehicle-receipts','vehicle-receipts',false,5242880,array['image/jpeg']);
create policy vehicle_receipt_read on storage.objects for select to authenticated using(bucket_id='vehicle-receipts' and planner_private.role()='owner' and split_part(name,'/',1)=planner_private.business_id()::text and exists(select 1 from public.planner_vehicle_maintenance m where m.receipt_path=name));
create policy vehicle_receipt_upload on storage.objects for insert to authenticated with check(bucket_id='vehicle-receipts' and planner_private.role()='owner' and split_part(name,'/',1)=planner_private.business_id()::text and exists(select 1 from public.planner_vehicles v where v.id::text=split_part(name,'/',2)));
create policy vehicle_receipt_remove on storage.objects for delete to authenticated using(bucket_id='vehicle-receipts' and planner_private.role()='owner' and split_part(name,'/',1)=planner_private.business_id()::text);
notify pgrst,'reload schema';
commit;
