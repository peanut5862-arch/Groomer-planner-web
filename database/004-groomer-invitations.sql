begin;
create table public.planner_groomer_invites (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.planner_businesses(id),
 groomer_id text not null, email text not null check(email=lower(btrim(email))),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '7 days', last_attempt_at timestamptz not null default now(),
 sent_at timestamptz, accepted_at timestamptz, accepted_by uuid references auth.users(id), cancelled_at timestamptz
);
create unique index planner_pending_invite_email on public.planner_groomer_invites(email) where accepted_at is null and cancelled_at is null;
alter table public.planner_groomer_invites enable row level security;
revoke all on public.planner_groomer_invites from public,anon,authenticated;
grant all on public.planner_groomer_invites to service_role;
-- Only the server can reserve email sends. The owner id comes from verified JWT identity.
create function public.reserve_groomer_invite(p_owner uuid,p_groomer_id text,p_email text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b public.planner_businesses%rowtype; g jsonb; inv public.planner_groomer_invites%rowtype; m public.planner_members%rowtype; e text:=lower(btrim(p_email));
begin
 select pb.* into b from public.planner_businesses pb join public.planner_members pm on pm.business_id=pb.id where pm.user_id=p_owner and pm.role='owner' for update of pb;
 if not found then raise exception 'Only the business owner can invite groomers.'; end if;
 if e is null or length(e)>254 or e!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Enter a valid email address.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(e,1));
 select x into g from jsonb_array_elements(b.settings->'groomers') x where x->>'id'=p_groomer_id and coalesce((x->>'active')::boolean,true);
 if g is null then raise exception 'Save an active groomer before inviting them.'; end if;
 select pm.* into m from public.planner_members pm join auth.users u on u.id=pm.user_id where lower(u.email)=e;
 if found then
  if m.business_id=b.id and m.role='groomer' and m.groomer=g->>'name' then return jsonb_build_object('alreadyConnected',true); end if;
  raise exception 'This email already has app access. Use a different email for this invitation.';
 end if;
 if exists(select 1 from planner_private.legacy_access where email=e) then raise exception 'This email already has app access. Use its existing login.'; end if;
 select * into inv from public.planner_groomer_invites where email=e and accepted_at is null and cancelled_at is null for update;
 if found then
  if inv.business_id<>b.id or inv.groomer_id<>p_groomer_id then raise exception 'This email already has a pending invitation. Cancel it before sending another.'; end if;
  if inv.last_attempt_at>now()-interval '60 seconds' then raise exception 'Please wait a minute before resending this invitation.'; end if;
  update public.planner_groomer_invites set last_attempt_at=now(),expires_at=now()+interval '7 days' where id=inv.id returning * into inv;
 else
  if (select count(*) from public.planner_groomer_invites where business_id=b.id and created_at>now()-interval '1 day')>=50 then raise exception 'Daily invitation limit reached. Try again tomorrow.'; end if;
  insert into public.planner_groomer_invites(business_id,groomer_id,email,created_by) values(b.id,p_groomer_id,e,p_owner) returning * into inv;
 end if;
 return jsonb_build_object('id',inv.id,'email',e,'existingUser',exists(select 1 from auth.users where lower(email)=e));
end $$;
revoke all on function public.reserve_groomer_invite(uuid,text,text) from public,anon,authenticated;
grant execute on function public.reserve_groomer_invite(uuid,text,text) to service_role;
create function public.mark_groomer_invite_sent(p_id uuid) returns void language sql security definer set search_path='' as $$
 update public.planner_groomer_invites set sent_at=now() where id=p_id and cancelled_at is null and accepted_at is null;
$$;
revoke all on function public.mark_groomer_invite_sent(uuid) from public,anon,authenticated;
grant execute on function public.mark_groomer_invite_sent(uuid) to service_role;
create function public.list_groomer_invites() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if planner_private.role() is distinct from 'owner' then raise exception 'Only the business owner can view invitations.'; end if;
 return jsonb_build_object('invitations',coalesce((select jsonb_agg(jsonb_build_object('id',id,'groomerId',groomer_id,'email',email,'sentAt',sent_at,'expiresAt',expires_at,'acceptedAt',accepted_at,'cancelledAt',cancelled_at) order by created_at desc) from public.planner_groomer_invites where business_id=planner_private.business_id()),'[]'::jsonb),
 'members',coalesce((select jsonb_agg(jsonb_build_object('groomer',m.groomer,'email',u.email)) from public.planner_members m join auth.users u on u.id=m.user_id where m.business_id=planner_private.business_id() and m.role='groomer'),'[]'::jsonb));
end $$;
create function public.cancel_groomer_invite(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if planner_private.role() is distinct from 'owner' then raise exception 'Only the business owner can cancel invitations.'; end if;
 perform 1 from public.planner_businesses where id=planner_private.business_id() for update;
 update public.planner_groomer_invites set cancelled_at=now() where id=p_id and business_id=planner_private.business_id() and accepted_at is null and cancelled_at is null;
 if not found then raise exception 'This invitation is no longer pending. Refresh settings.'; end if;
end $$;
create or replace function public.get_business_context() returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.planner_members%rowtype; bid uuid; e text; l planner_private.legacy_access%rowtype; inv public.planner_groomer_invites%rowtype; g jsonb; s jsonb;
begin
 if auth.uid() is null then raise exception 'Please sign in.'; end if;
 -- Serialize bootstrap for the same user; no business can be claimed by a supplied id/email.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into m from public.planner_members where user_id=auth.uid();
 if not found then
  select lower(email) into e from auth.users where id=auth.uid() and email_confirmed_at is not null;
  select * into inv from public.planner_groomer_invites where email=e and accepted_at is null and cancelled_at is null order by created_at desc limit 1;
  if found then
   if inv.expires_at<=now() then raise exception 'Your invitation expired. Ask your owner to resend it.'; end if;
   select settings into s from public.planner_businesses where id=inv.business_id;
   select x into g from jsonb_array_elements(s->'groomers') x where x->>'id'=inv.groomer_id and coalesce((x->>'active')::boolean,true);
   if g is null then raise exception 'This groomer is no longer active. Contact your business owner.'; end if;
   return jsonb_build_object('accountId',auth.uid(),'businessId',inv.business_id,'role','groomer','groomer',g->>'name','invitationId',inv.id,'needsGroomerSetup',true,'settings',jsonb_build_object('businessName',s->>'businessName','timeZone',s->>'timeZone','groomers',jsonb_build_array(jsonb_build_object('id',g->>'id','name',g->>'name','active',true))));
  end if;
  if exists(select 1 from public.planner_groomer_invites where email=e and cancelled_at is not null) then raise exception 'Your invitation was cancelled. Contact your business owner for a new invitation.'; end if;
  select * into l from planner_private.legacy_access where email=e;
  if found then
   insert into public.planner_members values(auth.uid(),l.business_id,l.role,l.groomer);
  else
   insert into public.planner_businesses(owner_id,settings) values(auth.uid(),'{"businessName": "My grooming business", "timeZone": "America/Chicago", "bufferMinutes": 15, "route": {"avoidTolls": false, "maxAddedDriveMinutes": 0}, "groomers": [{"id": "owner", "name": "Me", "active": true, "workDays": [1, 2, 3, 4, 5], "startTime": "09:00", "endTime": "17:30", "homeAddress": "", "commissionPercent": 0}]}') returning id into bid;
   insert into public.planner_members values(auth.uid(),bid,'owner',null);
  end if;
  select * into m from public.planner_members where user_id=auth.uid();
 end if;
 return jsonb_build_object('accountId',auth.uid(),'businessId',m.business_id,'role',m.role,'groomer',m.groomer,'revision',(select revision from public.planner_businesses where id=m.business_id),'settings',planner_private.settings());
end $$;

create function public.accept_groomer_invite(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare inv public.planner_groomer_invites%rowtype; e text; g jsonb; b public.planner_businesses%rowtype; m public.planner_members%rowtype;
begin
 if auth.uid() is null then raise exception 'Please open your invitation email and sign in.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select lower(email) into e from auth.users where id=auth.uid() and email_confirmed_at is not null and coalesce(encrypted_password,'')<>'';
 if e is null then raise exception 'Confirm your email and set your password first.'; end if;
 select pb.* into b from public.planner_businesses pb join public.planner_groomer_invites i on i.business_id=pb.id where i.id=p_id and i.email=e for update of pb;
 if not found then raise exception 'This invitation does not belong to your account.'; end if;
 select * into inv from public.planner_groomer_invites where id=p_id for update;
 if inv.accepted_by=auth.uid() and inv.accepted_at is not null then return public.get_business_context(); end if;
 if inv.cancelled_at is not null or inv.accepted_at is not null or inv.expires_at<=now() then raise exception 'This invitation is no longer available. Ask your owner to resend it.'; end if;
 select * into m from public.planner_members where user_id=auth.uid();
 if found then raise exception 'This account already has a business. Sign in with the invited email.'; end if;
 select x into g from jsonb_array_elements(b.settings->'groomers') x where x->>'id'=inv.groomer_id and coalesce((x->>'active')::boolean,true);
 if g is null then raise exception 'This groomer is no longer active. Contact your business owner.'; end if;
 insert into public.planner_members(user_id,business_id,role,groomer) values(auth.uid(),b.id,'groomer',g->>'name');
 update public.planner_groomer_invites set accepted_at=now(),accepted_by=auth.uid() where id=p_id;
 return public.get_business_context();
end $$;
revoke all on function public.list_groomer_invites(),public.cancel_groomer_invite(uuid),public.accept_groomer_invite(uuid) from public,anon;
grant execute on function public.list_groomer_invites(),public.cancel_groomer_invite(uuid),public.accept_groomer_invite(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
