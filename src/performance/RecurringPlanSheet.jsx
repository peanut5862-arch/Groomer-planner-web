import React,{useEffect,useState} from 'react'
import {supabase} from '../supabase.js'
import {businessSettings,getBusinessContext} from './businessConfig.js'
import {businessDateKey,mondayForDate,plannerClientGroups,canonicalAreaLabel,canonicalServiceLabel,serviceDefaultsForDog,dogDueInfo,appointmentTimeInput,fullClientAddress,apiFetch} from './shared.jsx'
import {addDays,horizonDate,proposeRecurring} from './recurringPlan.js'
const value=(r,...keys)=>keys.map(k=>r?.[k]).find(v=>v!==undefined&&v!==null&&String(v).trim()!=='') || ''
export default function RecurringPlanSheet({dogs,onClose,onSaved}){
 const [plan,setPlan]=useState(null),[snapshot,setSnapshot]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[refresh,setRefresh]=useState(0),[progress,setProgress]=useState('Preparing appointments…')
 const [selected,setSelected]=useState(new Set())
 useEffect(()=>{let live=true;setPlan(null);setMessage('');
  async function load(){try{
   const today=businessDateKey(),from=mondayForDate(addDays(today,-84)),until=horizonDate(today)
   const [weeks,details]=await Promise.all([supabase.from('weekly_drafts').select('week_start,plan_json,status').gte('week_start',from).lte('week_start',until).order('week_start'),supabase.from('client_details').select('household_id,client_status')]);if(weeks.error)throw weeks.error;if(details.error)throw details.error
   const status=new Map((details.data||[]).map(r=>[r.household_id,r.client_status]))
   const events=(weeks.data||[]).flatMap(w=>(Array.isArray(w.plan_json)?w.plan_json:[]).map(r=>({household:String(value(r,'Household ID','household_id')),owner:value(r,'Owner'),dogs:String(value(r,'Dogs')).split(',').map(d=>d.replace(/\s*\([^)]*\)/g,'').trim()),groomer:value(r,'Groomer'),area:canonicalAreaLabel(value(r,'Area Cluster','Area')),date:String(value(r,'Date')).slice(0,10),time:appointmentTimeInput(value(r,'Start Time')),duration:Number(value(r,'Minutes')),active:!['cancelled','canceled','moved to another week','no-show','no show'].includes(String(value(r,'Appointment Status')).toLowerCase())}))).filter(e=>/^\d{4}-\d{2}-\d{2}$/.test(e.date)&&e.owner&&e.dogs.length)
   const clients=plannerClientGroups(dogs).flatMap(c=>c.rows.map(r=>{const raw=canonicalServiceLabel(value(r,'service_pattern','Service Pattern')),service=raw==='Bath Only'?'Bath':(['Groom','Bath','Partial Groom'].includes(raw)?raw:'');const defaults=serviceDefaultsForDog(r,service);return {household:c.household,owner:c.owner,dog:value(r,'dog','Dog'),address:fullClientAddress(r),area:canonicalAreaLabel(value(r,'area','Area')),groomer:value(r,'groomer','Groomer'),frequency:Number(String(value(r,'frequency_weeks','Frequency Weeks')).replace(/[^0-9.]/g,'')),service,duration:Math.round(defaults.minutes),price:defaults.price,due:dogDueInfo(r,today).dueDate,paused:['paused','inactive'].includes(String(status.get(c.household)||'').toLowerCase())}}))
   const groomers=businessSettings().groomers,returnHome={},jobs=new Map(),context=getBusinessContext()
   const areaPairs=new Set(events.filter(e=>e.active).map(e=>`${e.groomer}|${e.area}`))
   for(const e of events){if(!e.household){const matches=clients.filter(c=>c.owner===e.owner);if(new Set(matches.map(c=>c.household)).size===1)e.household=matches[0]?.household}}
   for(const c of clients){if(c.paused||!c.household||!c.frequency)continue;for(const g of groomers){if(g.active===false || (String(c.groomer).toLowerCase()!=='either'&&c.groomer!==g.name) || !areaPairs.has(`${g.name}|${c.area}`))continue;jobs.set(`${c.household}|${g.name}`,{c,g})}}
   for(const e of events.filter(e=>e.active&&e.date>today)){const c=clients.find(c=>c.household===e.household),g=groomers.find(g=>g.name===e.groomer);if(c&&g)jobs.set(`${c.household}|${g.name}`,{c,g})}
   let completed=0;const queue=[...jobs.entries()]
   await Promise.all(Array.from({length:Math.min(4,queue.length)},async()=>{while(queue.length&&live){const [key,{c,g}]=queue.shift();const cacheKey=`planner-return-home:${context.businessId}:${context.revision}:${key}:${c.address}`
    try{if(!c.address)continue;let cached=null;try{cached=JSON.parse(localStorage.getItem(cacheKey)||'null')}catch{}
     if(cached&&Date.now()-cached.at<86400000&&Number.isFinite(cached.minutes)){returnHome[key]=cached.minutes;continue}
     const response=await apiFetch('/api/google-route',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({groomer:g.name,stops:[{id:c.household,owner:c.owner,address:c.address}]})})
     const payload=await response.json();const minutes=Number(payload.legs?.at(-1)?.minutes)
     if(!response.ok||!payload.legs?.length||!Number.isFinite(minutes)||minutes<0)continue
     returnHome[key]=minutes;try{localStorage.setItem(cacheKey,JSON.stringify({at:Date.now(),minutes}))}catch{}
    }catch{}finally{completed++;if(live)setProgress(`Checking drives home… ${completed}/${jobs.size}`)}
   }}))
   if(!live)return
   const result=proposeRecurring({today,clients,events,groomers,buffer:businessSettings().bufferMinutes,returnHome,requireReturnHome:true})
   for(const c of clients){if(c.paused||!c.frequency)continue;const relevant=[...jobs.entries()].filter(([,job])=>job.c.household===c.household);if(relevant.length&&relevant.every(([key])=>!Number.isFinite(returnHome[key]))) {const issue=result.issues.find(i=>i.owner===c.owner&&i.dog===c.dog);if(issue&&issue.reason.startsWith('No opening'))issue.reason='Could not check the drive home. Check the client and groomer starting addresses.'}}
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
 <p style={{fontSize:13,lineHeight:1.5,marginBottom:12}}>Uses each dog’s frequency and the area weekdays found in your existing schedule. “Either” clients are assigned to an active groomer with an area day and available space. Specific groomer preferences stay unchanged. Services that vary are marked To confirm, with provisional space based on the last visit or a 60-minute estimate if no length is saved. Their price stays unset until you confirm the service. The end time is the deadline to be back home, including the final drive. These are flexible drafts; review routes before giving clients times.</p>
 {!plan&&!message&&<p role="status">{progress}</p>}{message&&<div className="login-message" role="alert">{message}<button className="secondary-btn" disabled={busy} onClick={()=>setRefresh(v=>v+1)}>Rebuild plan</button></div>}
 {plan&&<><p>{plan.appointments.length} suggested stops · {plan.from} to {plan.until}</p><div style={{display:'grid',gap:8,marginTop:12}}>{plan.appointments.map(a=><label key={a.id} style={{display:'flex',gap:10,padding:10,border:'1px solid #d7dde6',borderRadius:12,background:'#fff'}}><input type="checkbox" disabled={busy} checked={selected.has(a.id)} onChange={e=>setSelected(old=>{const next=new Set(old);if(e.target.checked)next.add(a.id);else next.delete(a.id);return next})}/><div><strong>{a.owner}</strong><div style={{fontSize:12,marginTop:4}}>{a.date} · {a.groomer} · {a.area}</div><div style={{fontSize:12,color:'#52657a',marginTop:4}}>Allows {Math.ceil(a.returnMinutes)} min to return home by {a.homeBy}.</div>{a.assignmentReason&&<div style={{fontSize:12,color:'#52657a',marginTop:4}}>{a.assignmentReason}</div>}<div style={{fontSize:12}}>{a.dogs.map(d=>`${d.dog} (${d.service})`).join(', ')} · {a.duration} min{a.servicePending?' estimated · service and price to confirm':''}</div></div></label>)}</div>
 {plan.issues.length>0&&<details style={{marginTop:16}}><summary>Needs attention ({plan.issues.length})</summary>{plan.issues.map((i,n)=><p key={n} style={{fontSize:12,marginTop:8}}><strong>{i.owner} · {i.dog}</strong>: {i.reason}</p>)}</details>}
 {!plan.appointments.length&&<p style={{marginTop:12}}>No new appointments are ready to add. Existing future bookings are kept.</p>}
 <div className="sheet-actions"><button className="ghost" disabled={busy} onClick={onClose}>Close</button><button className="login-button" disabled={busy||!selected.size} onClick={save}>{busy?'Saving…':`Save ${selected.size} draft stops`}</button></div></>}
 </div></div>
}
