begin;
create table public.planner_sales_tax_log(id uuid primary key default gen_random_uuid(),business_id uuid not null references public.planner_businesses(id),recorded_at timestamptz not null default now(),appointment_date text,owner_name text,groomer text,event text not null,subtotal numeric(12,2) not null,rate numeric(7,4) not null,tax numeric(12,2) not null,tip numeric(12,2) not null,total numeric(12,2) not null,recorded_by uuid not null);
alter table public.planner_sales_tax_log enable row level security;
create policy sales_tax_owner on public.planner_sales_tax_log for select to authenticated using(business_id=planner_private.business_id() and planner_private.role()='owner');
grant select on public.planner_sales_tax_log to authenticated;
create function public.save_grooming_payment_with_tax(p_week_start date,p_expected_row jsonb,p_payment_status text,p_payment_method text default null,p_tip numeric default 0,p_tax_rate numeric default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare bid uuid:=planner_private.business_id(); plan jsonb; original jsonb; changed jsonb; result jsonb; idx integer; matches integer; rate numeric; subtotal numeric; tax numeric; total numeric;
begin
 if auth.uid() is null or planner_private.role() not in ('owner','editor') then raise exception 'No payment access.'; end if;
 if p_tax_rate is null or p_tax_rate<0 or p_tax_rate>100 or p_tax_rate<>round(p_tax_rate,4) then raise exception 'Enter a tax rate from 0 to 100 percent, with up to four decimal places.'; end if;
 select plan_json into plan from public.weekly_drafts where business_id=bid and week_start=p_week_start for update;
 select count(*),min(ord-1)::integer into matches,idx from jsonb_array_elements(plan) with ordinality x(row,ord) where row=(p_expected_row-'_row_index');
 if matches<>1 then raise exception 'Appointment changed. Refresh before saving payment.'; end if;
 original=plan->idx;
 result=public.save_grooming_payment(p_week_start,p_expected_row,p_payment_status,p_payment_method,p_tip);
 if result->>'status'<>'saved' then raise exception 'Payment could not be confirmed.'; end if;
 select plan_json into plan from public.weekly_drafts where business_id=bid and week_start=p_week_start;
 changed=plan->idx;subtotal=coalesce((result->>'service_total')::numeric,0);rate=round(p_tax_rate,4);tax=round(subtotal*rate/100,2);
 if original->>'Payment Status'='Paid' and original ? 'Sales Tax Amount' then
  insert into public.planner_sales_tax_log(business_id,appointment_date,owner_name,groomer,event,subtotal,rate,tax,tip,total,recorded_by) values(bid,original->>'Date',original->>'Owner',original->>'Groomer','Reversal',-coalesce((original->>'Tax Subtotal')::numeric,0),coalesce((original->>'Sales Tax Rate')::numeric,0),-coalesce((original->>'Sales Tax Amount')::numeric,0),-coalesce((original->>'Tip')::numeric,0),-coalesce((original->>'Amount Paid')::numeric,0),auth.uid());
 end if;
 if p_payment_status='Paid' then
  total=round(subtotal+tax+coalesce(p_tip,0),2);
  changed=changed||jsonb_build_object('Tax Subtotal',subtotal,'Sales Tax Rate',rate,'Sales Tax Amount',tax,'Amount Paid',total);
  insert into public.planner_sales_tax_log(business_id,appointment_date,owner_name,groomer,event,subtotal,rate,tax,tip,total,recorded_by) values(bid,changed->>'Date',changed->>'Owner',changed->>'Groomer','Payment',subtotal,rate,tax,coalesce(p_tip,0),total,auth.uid());
 else changed=changed-'Tax Subtotal'-'Sales Tax Rate'-'Sales Tax Amount';total=0;tax=0;
 end if;
 update public.weekly_drafts set plan_json=jsonb_set(plan,array[idx::text],changed),updated_at=now() where business_id=bid and week_start=p_week_start;
 return result||jsonb_build_object('amount_paid',total,'sales_tax',tax,'tax_rate',rate);
end $$;
revoke all on function public.save_grooming_payment_with_tax(date,jsonb,text,text,numeric,numeric) from public,anon;
grant execute on function public.save_grooming_payment_with_tax(date,jsonb,text,text,numeric,numeric) to authenticated;
commit;
