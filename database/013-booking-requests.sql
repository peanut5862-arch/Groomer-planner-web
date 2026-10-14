begin;
create table public.planner_booking_links (
 business_id uuid primary key references public.planner_businesses(id),
 token uuid not null unique default gen_random_uuid(),
 enabled boolean not null default false
);
create table public.planner_booking_requests (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.planner_businesses(id),
 submission_id uuid not null,
 owner_name text not null check(length(owner_name) between 1 and 100),
 phone text not null check(length(phone) between 7 and 40),
 email text not null default '' check(length(email)<=254),
 address text not null check(length(address) between 5 and 500),
 area text not null default '' check(length(area)<=100),
 dogs jsonb not null check(jsonb_typeof(dogs)='array' and jsonb_array_length(dogs) between 1 and 8),
 preferred_date date not null,
 preferences text not null default '' check(length(preferences)<=2000),
 status text not null default 'pending' check(status in ('pending','scheduled','declined')),
 appointment jsonb,
 created_at timestamptz not null default now(), reviewed_at timestamptz,
 unique(business_id,submission_id)
);
create index booking_request_queue on public.planner_booking_requests(business_id,status,created_at desc);
alter table public.planner_booking_links enable row level security;
alter table public.planner_booking_requests enable row level security;
create policy booking_links_owner on public.planner_booking_links for select to authenticated using(business_id=planner_private.business_id() and planner_private.role()='owner');
create policy booking_requests_owner on public.planner_booking_requests for select to authenticated using(business_id=planner_private.business_id() and planner_private.role()='owner');
grant select on public.planner_booking_links,public.planner_booking_requests to authenticated;
revoke all on public.planner_booking_links,public.planner_booking_requests from anon;
create function public.set_booking_link(p_enabled boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.planner_booking_links;
begin
 if planner_private.role() is distinct from 'owner' then raise exception 'Owner access required';end if;
 insert into public.planner_booking_links(business_id,enabled) values(planner_private.business_id(),p_enabled) on conflict(business_id) do update set enabled=excluded.enabled returning * into r;
 return jsonb_build_object('token',r.token,'enabled',r.enabled);
end $$;
-- Public callers can read only the display name for an enabled, unguessable link.
create function public.booking_link_info(p_token uuid) returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('name',b.settings->>'businessName','timeZone',coalesce(b.settings->>'timeZone','America/Chicago')) from public.planner_booking_links l join public.planner_businesses b on b.id=l.business_id where l.token=p_token and l.enabled;
$$;
-- Only the server can submit; no public table insert/read permissions.
create function public.submit_booking_request(p_token uuid,p_submission uuid,p_payload jsonb,p_sender_hash text) returns uuid language plpgsql security definer set search_path='' as $$
declare bid uuid; rid uuid; d jsonb; tz text;
begin
 select l.business_id,coalesce(b.settings->>'timeZone','America/Chicago') into bid,tz from public.planner_booking_links l join public.planner_businesses b on b.id=l.business_id where l.token=p_token and l.enabled for update of l;
 if bid is null then raise exception 'Booking requests are unavailable.';end if;
 select id into rid from public.planner_booking_requests where business_id=bid and submission_id=p_submission;
 if rid is not null then return rid;end if;
 if not coalesce((p_payload->>'consent')::boolean,false) then raise exception 'Contact permission is required';end if;
 if jsonb_typeof(p_payload->'dogs') is distinct from 'array' or jsonb_array_length(p_payload->'dogs') not between 1 and 8 then raise exception 'Add 1–8 dogs';end if;
 for d in select * from jsonb_array_elements(p_payload->'dogs') loop
  if length(btrim(coalesce(d->>'name',''))) not between 1 and 80 or length(coalesce(d->>'details',''))>300 or coalesce(d->>'service','') not in ('Groom','Bath','Partial Groom','Not sure') then raise exception 'Check the dog details';end if;
 end loop;
 if (p_payload->>'preferredDate')::date < (now() at time zone tz)::date or (p_payload->>'preferredDate')::date > (now() at time zone tz)::date+180 then raise exception 'Choose a date within six months';end if;
 -- Shared DB-backed limits work across server instances; identifiers expire with requests.
 if (select count(*) from public.planner_booking_requests where business_id=bid and created_at>now()-interval '1 hour')>=30 then raise exception 'Too many requests. Please contact the business.';end if;
 if (select count(*) from public.planner_booking_requests where business_id=bid and regexp_replace(phone,'[^0-9]','','g')=regexp_replace(p_payload->>'phone','[^0-9]','','g') and created_at>now()-interval '1 day')>=3 then raise exception 'You already have requests to review. Please contact the business.';end if;
 if (select count(*) from public.planner_booking_rate where sender_hash=p_sender_hash and created_at>now()-interval '1 hour')>=10 then raise exception 'Please wait before sending another request.';end if;
 insert into public.planner_booking_requests(business_id,submission_id,owner_name,phone,email,address,area,dogs,preferred_date,preferences)
 values(bid,p_submission,btrim(p_payload->>'name'),btrim(p_payload->>'phone'),btrim(coalesce(p_payload->>'email','')),btrim(p_payload->>'address'),btrim(coalesce(p_payload->>'area','')),p_payload->'dogs',(p_payload->>'preferredDate')::date,btrim(coalesce(p_payload->>'preferences',''))) returning id into rid;
 delete from public.planner_booking_rate where created_at<now()-interval '1 day';
 insert into public.planner_booking_rate(sender_hash) values(p_sender_hash);
 return rid;
end $$;
create table public.planner_booking_rate(sender_hash text not null,created_at timestamptz not null default now());
create index booking_rate_sender on public.planner_booking_rate(sender_hash,created_at);
alter table public.planner_booking_rate enable row level security;
revoke all on public.planner_booking_rate from anon,authenticated;
create function public.decline_booking_request(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if planner_private.role() is distinct from 'owner' then raise exception 'Owner access required';end if;
 update public.planner_booking_requests set status='declined',reviewed_at=now() where id=p_id and business_id=planner_private.business_id() and status='pending';
 if not found then raise exception 'Request is no longer pending';end if;
end $$;
create function public.approve_booking_request(p_id uuid,p_date date,p_groomer text,p_time text,p_area text,p_household text,p_dogs jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.planner_booking_requests; d jsonb; hh text:=p_household; saved jsonb; result jsonb; total numeric:=0; mins integer:=0; labels text:='';
begin
 if planner_private.role() is distinct from 'owner' then raise exception 'Owner access required';end if;
 select * into r from public.planner_booking_requests where id=p_id and business_id=planner_private.business_id() for update;
 if r.id is null then raise exception 'Request not found';end if;
 if r.status='scheduled' then return r.appointment;end if;
 if r.status<>'pending' then raise exception 'Request is no longer pending';end if;
 if p_date<(now() at time zone coalesce(planner_private.settings()->>'timeZone','America/Chicago'))::date then raise exception 'Choose today or a future date';end if;
 if not exists(select 1 from jsonb_array_elements(planner_private.settings()->'groomers') g where g->>'name'=p_groomer and coalesce((g->>'active')::boolean,true) and (g->'workDays') @> to_jsonb(array[extract(dow from p_date)::integer])) then raise exception 'Choose a groomer working on this day';end if;
 if p_time is null or p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Choose an arrival time';end if;
 if coalesce(length(btrim(p_area)),0)=0 then raise exception 'Choose an area';end if;
 if jsonb_typeof(p_dogs) is distinct from 'array' or jsonb_array_length(p_dogs) not between 1 and 8 then raise exception 'Choose dogs';end if;
 if hh is null and exists(select 1 from public.dogs where business_id=r.business_id and lower(owner)=lower(r.owner_name)) then raise exception 'An existing client has this name. Select that client instead of creating a duplicate.';end if;
 if hh is not null and not exists(select 1 from public.dogs where business_id=r.business_id and household_id=hh and lower(owner)=lower(r.owner_name)) then raise exception 'Existing client must match the request name. Review in Clients first.';end if;
 for d in select * from jsonb_array_elements(p_dogs) loop
  if length(btrim(coalesce(d->>'name',''))) not between 1 and 80 or coalesce(d->>'service','') not in ('Groom','Bath','Partial Groom') or coalesce((d->>'minutes')::integer,0) not between 1 and 480 or coalesce((d->>'price')::numeric,-1) not between 0 and 10000 then raise exception 'Review services, prices and durations';end if;
  if hh is not null and p_household is not null and not exists(select 1 from public.dogs where business_id=r.business_id and household_id=hh and dog=d->>'name') then raise exception 'Add this dog in Clients first';end if;
  if p_household is null then
   saved:=public.save_grooming_dog(p_household_id=>hh,p_owner=>r.owner_name,p_original_dog=>null,p_dog=>d->>'name',p_phone=>r.phone,p_groomer=>p_groomer,p_area=>p_area,p_address=>r.address,p_service=>d->>'service',p_price=>(d->>'price')::numeric,p_minutes=>(d->>'minutes')::integer);
   hh:=coalesce(saved->>'household_id',saved->>'householdId',saved->0->>'household_id');
   if hh is null then raise exception 'Client could not be saved';end if;
  end if;
  total:=total+(d->>'price')::numeric;mins:=mins+(d->>'minutes')::integer;
  labels:=labels||case when labels='' then '' else ', ' end||(d->>'name')||' ('||(d->>'service')||')';
 end loop;
 result:=public.add_grooming_appointment(p_date=>p_date,p_household_id=>hh,p_owner=>r.owner_name,p_dogs=>labels,p_groomer=>p_groomer,p_start_time=>p_time,p_fixed=>false,p_price=>total,p_minutes=>mins,p_area=>p_area,p_note=>'Approved booking request '||r.id::text);
 if result->>'status' is distinct from 'added' then raise exception 'Appointment was not added';end if;
 update public.planner_booking_requests set status='scheduled',reviewed_at=now(),appointment=result||jsonb_build_object('date',p_date,'time',p_time,'groomer',p_groomer) where id=r.id;
 return result;
end $$;
revoke all on function public.set_booking_link(boolean),public.booking_link_info(uuid),public.submit_booking_request(uuid,uuid,jsonb,text),public.decline_booking_request(uuid),public.approve_booking_request(uuid,date,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.set_booking_link(boolean),public.decline_booking_request(uuid),public.approve_booking_request(uuid,date,text,text,text,text,jsonb) to authenticated;
grant execute on function public.booking_link_info(uuid) to anon,authenticated,service_role;
grant execute on function public.submit_booking_request(uuid,uuid,jsonb,text) to service_role;
notify pgrst,'reload schema';
commit;
