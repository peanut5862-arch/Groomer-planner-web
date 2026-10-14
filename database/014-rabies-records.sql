begin;
create table public.planner_rabies_records (
 business_id uuid not null default planner_private.business_id() references public.planner_businesses(id),
 household_id text not null,
 dog_name text not null check(length(btrim(dog_name)) between 1 and 100),
 expires_on date,
 certificate_path text,
 updated_at timestamptz not null default now(),
 primary key(business_id,household_id,dog_name),
 check(certificate_path is null or (split_part(certificate_path,'/',1)=business_id::text and certificate_path !~ '\.\.' and certificate_path ~ '\.jpg$'))
);
alter table public.planner_rabies_records enable row level security;
create policy rabies_read on public.planner_rabies_records for select to authenticated using(planner_private.can_read_dog_photo(business_id,household_id));
create policy rabies_insert on public.planner_rabies_records for insert to authenticated with check(business_id=planner_private.business_id() and planner_private.role()='owner' and exists(select 1 from public.dogs d where d.business_id=planner_rabies_records.business_id and d.household_id=planner_rabies_records.household_id and lower(d.dog)=lower(planner_rabies_records.dog_name)));
create policy rabies_update on public.planner_rabies_records for update to authenticated using(business_id=planner_private.business_id() and planner_private.role()='owner') with check(business_id=planner_private.business_id() and planner_private.role()='owner');
grant select,insert,update on public.planner_rabies_records to authenticated;
revoke all on public.planner_rabies_records from anon;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('rabies-certificates','rabies-certificates',false,5242880,array['image/jpeg']);
create policy rabies_certificate_read on storage.objects for select to authenticated using(bucket_id='rabies-certificates' and exists(select 1 from public.planner_rabies_records r where r.certificate_path=name and planner_private.can_read_dog_photo(r.business_id,r.household_id)));
create policy rabies_certificate_upload on storage.objects for insert to authenticated with check(bucket_id='rabies-certificates' and planner_private.role()='owner' and split_part(name,'/',1)=planner_private.business_id()::text and split_part(name,'/',2)=auth.uid()::text);
create policy rabies_certificate_remove on storage.objects for delete to authenticated using(bucket_id='rabies-certificates' and planner_private.role()='owner' and split_part(name,'/',1)=planner_private.business_id()::text);
notify pgrst,'reload schema';
commit;
