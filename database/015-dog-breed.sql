begin;
alter table public.dog_details add column breed text check(length(breed)<=100);
create function public.get_planner_dog_breed(p_household text,p_dog text) returns text language plpgsql security definer set search_path='' as $$
begin
 if not planner_private.can_read_dog_photo(planner_private.business_id(),p_household) then raise exception 'Client not available';end if;
 return (select breed from public.dog_details where business_id=planner_private.business_id() and household_id=p_household and lower(dog_name)=lower(p_dog) limit 1);
end $$;
create function public.save_planner_dog_breed(p_household text,p_dog text,p_breed text) returns void language plpgsql security definer set search_path='' as $$
begin
 if planner_private.role() is distinct from 'owner' then raise exception 'Owner access required';end if;
 if length(btrim(p_breed))>100 then raise exception 'Keep breed under 100 characters';end if;
 if not exists(select 1 from public.dogs where business_id=planner_private.business_id() and household_id=p_household and dog=p_dog) then raise exception 'Dog not found';end if;
 insert into public.dog_details(business_id,household_id,dog_name,breed) values(planner_private.business_id(),p_household,p_dog,nullif(btrim(p_breed),'')) on conflict(business_id,household_id,dog_name) do update set breed=excluded.breed;
end $$;
revoke all on function public.get_planner_dog_breed(text,text),public.save_planner_dog_breed(text,text,text) from public,anon;
grant execute on function public.get_planner_dog_breed(text,text),public.save_planner_dog_breed(text,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
