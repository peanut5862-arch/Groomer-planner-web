import React,{useEffect,useState} from 'react'
import {supabase} from '../supabase.js'
import {businessSettings,getBusinessContext} from './businessConfig.js'
import {businessDateKey,mondayForDate,plannerClientGroups,canonicalAreaLabel,canonicalServiceLabel,serviceDefaultsForDog,dogDueInfo,appointmentTimeInput} from './shared.jsx'
import {addDays,horizonDate,proposeRecurring} from './recurringPlan.js'
const value=(r,...keys)=>keys.map(k=>r?.[k]).find(v=>v!==undefined&&v!==null&&String(v).trim()!=='') || ''
export default function RecurringPlanSheet({dogs,onClose,onSaved}){
 const [plan,setPlan]=useState(null),[snapshot,setSnapshot]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[refresh,setRefresh]=useState(0)
 const [selected,setSelected]=useState(new Set())
 useEffect(()=>{let live=true;setPlan(null);setMessage('');
  async function load(){try{
   const today=businessDateKey(),from=mondayForDate(addDays(today,-84)),until=horizonDate(today)
   const [weeks,details]=await Promise.all([supabase.from('weekly_drafts').select('week_start,plan_json,status').gte('week_start',from).lte('week_start',until).order('week_start'),supabase.from('client_details').select('household_id,client_status')]);if(weeks.error)throw weeks.error;if(details.error)throw details.error
   const status=new Map((details.data||[]).map(r=>[r.household_id,r.client_status]))
   const events=(weeks.data||[]).flatMap(w=>(Array.isArray(w.plan_json)?w.plan_json:[]).map(r=>({household:String(value(r,'Household ID','household_id')),owner:value(r,'Owner'),dogs:String(value(r,'Dogs')).split(',').map(d=>d.replace(/\s*\([^)]*\)/g,'').trim()),groomer:value(r,'Groomer'),area:canonicalAreaLabel(value(r,'Area Cluster','Area')),date:String(value(r,'Date')).slice(0,10),time:appointmentTimeInput(value(r,'Start Time')),duration:Number(value(r,'Minutes')),active:!['cancelled','canceled','moved to another week','no-show','no show'].includes(String(value(r,'Appointment Status')).toLowerCase())}))).filter(e=>/^\d{4}-\d{2}-\d{2}$/.test(e.date)&&e.owner&&e.dogs.length)
   const clients=plannerClientGroups(dogs).flatMap(c=>c.rows.map(r=>{const raw=canonicalServiceLabel(value(r,'service_pattern','Service Pattern')),service=raw==='Bath Only'?'Bath':(['Groom','Bath','Partial Groom'].includes(raw)?raw:'');const defaults=serviceDefaultsForDog(r,service);return {household:c.household,owner:c.owner,dog:value(r,'dog','Dog'),area:canonicalAreaLabel(value(r,'area','Area')),groomer:value(r,'groomer','Groomer'),frequency:Number(String(value(r,'frequency_weeks','Frequency Weeks')).replace(/[^0-9.]/g,'')),service,duration:Math.round(defaults.minutes),price:defaults.price,due:dogDueInfo(r,today).dueDate,paused:['paused','inactive'].includes(String(status.get(c.household)||'').toLowerCase())}}))
   const result=proposeRecurring({today,clients,events,groomers:businessSettings().groomers,buffer:businessSettings().bufferMinutes});if(!live)return
   const expected={};for(let week=mondayForDate(addDays(today,1));week<=until;week=addDays(week,7))expected[week]=(weeks.data||[]).find(w=>w.week_start===week)?.plan_json || null
   setSnapshot(expected);setPlan(result);setSelected(new Set(result.appointments.map(a=>a.id)))
  }catch(e){if(live)setMessage(e.message||'Could not prepare recurring appointments.')}}load();return()=>{live=false}
 },[dogs,refresh])
 async function save(){if(busy||!plan||!selected.size)return;setBusy(true);setMessage('');try{
  if(!['owner','editor'].includes(getBusinessContext().role))throw Error('Only the business owner or editor can save this plan.')
  const rows=plan.appointments.filter(a=>selected.has(a.id)).map(a=>({'Household ID':a.household,Owner:a.owner,Dogs:a.dogs.map(d=>`${d.dog} (${d.service})`).join(', '),Date:a.date,Groomer:a.groomer,'Start Time':a.time,'Area Cluster':a.area,Price:a.price,Minutes:a.duration,'Recurring IDs':a.ids,'Appointment Status':'Scheduled',Status:'Scheduled','Client Confirmation':'Unconfirmed','Route Review Needed':true,'Status Note':'Recurring draft — review the route before giving the client a time.'}))
  const {data,error}=await supabase.rpc('save_recurring_grooming_plan',{p_rows:rows,p_expected_weeks:snapshot});if(error)throw error
  if(data?.status!=='saved')throw Error('The plan could not be saved.');onSaved(`${data.added} recurring appointments saved as drafts.`);onClose()
 }catch(e){setMessage(e.code==='PGRST202'?'Recurring scheduling needs its database update before saving.':e.message||'Could not save the plan.')}finally{setBusy(false)}}
 return <div className="sheet-backdrop" onMouseDown={()=>!busy&&onClose()}><div className="sheet" onMouseDown={e=>e.stopPropagation()}><div className="sheet-handle"/><div className="sheet-title"><div><span>Recurring schedule</span><h2>Plan the next 3 months</h2></div><button className="icon-btn" aria-label="Close recurring plan" disabled={busy} onClick={onClose}>×</button></div>
 <p style={{fontSize:13,lineHeight:1.5,marginBottom:12}}>Uses each dog’s frequency, assigned groomer, and the area weekdays found in your existing schedule. These are flexible drafts; review routes before giving clients times.</p>
 {!plan&&!message&&<p role="status">Preparing appointments…</p>}{message&&<div className="login-message" role="alert">{message}<button className="secondary-btn" disabled={busy} onClick={()=>setRefresh(v=>v+1)}>Rebuild plan</button></div>}
 {plan&&<><p>{plan.appointments.length} suggested stops · {plan.from} to {plan.until}</p><div style={{display:'grid',gap:8,marginTop:12}}>{plan.appointments.map(a=><label key={a.id} style={{display:'flex',gap:10,padding:10,border:'1px solid #d7dde6',borderRadius:12,background:'#fff'}}><input type="checkbox" disabled={busy} checked={selected.has(a.id)} onChange={e=>setSelected(old=>{const next=new Set(old);if(e.target.checked)next.add(a.id);else next.delete(a.id);return next})}/><div><strong>{a.owner}</strong><div style={{fontSize:12,marginTop:4}}>{a.date} · {a.groomer} · {a.area}</div><div style={{fontSize:12}}>{a.dogs.map(d=>`${d.dog} (${d.service})`).join(', ')} · {a.duration} min</div></div></label>)}</div>
 {plan.issues.length>0&&<details style={{marginTop:16}}><summary>Needs attention ({plan.issues.length})</summary>{plan.issues.map((i,n)=><p key={n} style={{fontSize:12,marginTop:8}}><strong>{i.owner} · {i.dog}</strong>: {i.reason}</p>)}</details>}
 {!plan.appointments.length&&<p style={{marginTop:12}}>No new appointments are ready to add. Existing future bookings are kept.</p>}
 <div className="sheet-actions"><button className="ghost" disabled={busy} onClick={onClose}>Close</button><button className="login-button" disabled={busy||!selected.size} onClick={save}>{busy?'Saving…':`Save ${selected.size} draft stops`}</button></div></>}
 </div></div>
}
