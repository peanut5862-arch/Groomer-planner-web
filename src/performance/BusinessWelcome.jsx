import React,{useState,useRef} from 'react'
import {supabase} from '../supabase.js'
import {useBusinessContext,setBusinessContext,validateBusinessSettings} from './businessConfig.js'
import {saveWelcomeSettings} from './customerAuth.js'
const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const zones=['America/New_York','America/Chicago','America/Denver','America/Phoenix','America/Los_Angeles','America/Anchorage','Pacific/Honolulu','Europe/London','Australia/Sydney']
export default function BusinessWelcome() {
 const business=useBusinessContext()
 const [draft,setDraft]=useState(()=>({...structuredClone(business.settings),businessName:'',groomers:business.settings.groomers.map(g=>({...g,name:g.name==='Me'?'':g.name}))}))
 const [saving,setSaving]=useState(false),[error,setError]=useState('');const busy=useRef(false)
 const patch=values=>{setError('');setDraft(d=>({...d,...values}))}
 const groomer=(id,values)=>patch({groomers:draft.groomers.map(g=>g.id===id?{...g,...values}:g)})
 const save=async event=>{
  event.preventDefault();if(busy.current)return
  const errors=validateBusinessSettings(draft);if(errors.length){setError(errors.join(' '));return}
  busy.current=true;setSaving(true);setError('')
  try{const data=await saveWelcomeSettings(supabase,business,draft);setBusinessContext(data)}
  catch(e){setError(e.message||'Could not save your setup. Please try again.')}finally{busy.current=false;setSaving(false)}
 }
 return <div className="login-shell"><div className="login-card welcome-card" style={{maxWidth:720}}>
  <style>{`.welcome-card select{width:100%;padding:12px;border:1px solid #dedbd5;border-radius:12px;background:white;font:inherit;color:#17223f}.welcome-card .groomer-card{padding:18px;border:1px solid #dedbd5;border-radius:16px;display:grid;gap:12px}.welcome-card .workdays{display:flex;flex-wrap:wrap;gap:6px}.welcome-card .workdays button{padding:10px;border-radius:10px;border:1px solid #ccd2de;background:white;color:#17223f}.welcome-card .workdays button[aria-pressed=true]{background:#17223f;color:white}.welcome-card .time-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}`}</style>
  <div className="login-brand">HB</div><div className="eyebrow">Welcome to Hey Betty</div><h1>Let’s set up your business</h1><p className="login-copy">Your dashboard starts fresh. Add your business and team below—you can change these details anytime in More.</p>
  <form className="login-form" onSubmit={save}><fieldset disabled={saving} style={{border:0,padding:0,margin:0,display:'grid',gap:16}}>
   <label>Business name<input required maxLength={100} autoComplete="organization" value={draft.businessName} onChange={e=>patch({businessName:e.target.value})}/></label>
   <label>Business time zone<select value={draft.timeZone} onChange={e=>patch({timeZone:e.target.value})}>{[...new Set([draft.timeZone,...zones])].map(zone=><option key={zone}>{zone}</option>)}</select></label>
   <h2>Your groomers</h2>
   {draft.groomers.map((g,index)=><div className="groomer-card" key={g.id}>
    <label>Groomer {index+1} name<input required maxLength={50} value={g.name} onChange={e=>groomer(g.id,{name:e.target.value})}/></label>
    <div><strong>Working days</strong><div className="workdays" role="group" aria-label={`Groomer ${index+1} working days`}>{[1,2,3,4,5,6,0].map(day=><button type="button" key={day} aria-pressed={g.workDays.includes(day)} onClick={()=>groomer(g.id,{workDays:g.workDays.includes(day)?g.workDays.filter(d=>d!==day):[...g.workDays,day]})}>{days[day]}</button>)}</div></div>
    <div className="time-fields"><label>Start time<input required type="time" value={g.startTime} onChange={e=>groomer(g.id,{startTime:e.target.value})}/></label><label>End time<input required type="time" value={g.endTime} onChange={e=>groomer(g.id,{endTime:e.target.value})}/></label></div>
    <label>Route starting address (optional)<input maxLength={500} autoComplete="off" placeholder="Street address, city, state, ZIP" value={g.homeAddress||''} onChange={e=>groomer(g.id,{homeAddress:e.target.value})}/></label>
    <p className="settings-help">Add an address when you want Google to calculate routes from your starting location.</p>
    {draft.groomers.length>1&&<button className="text-btn" type="button" onClick={()=>patch({groomers:draft.groomers.filter(item=>item.id!==g.id)})}>Remove this groomer</button>}
   </div>)}
   <button type="button" className="ghost" disabled={draft.groomers.length>=100} onClick={()=>patch({groomers:[...draft.groomers,{id:crypto.randomUUID(),name:'',active:true,workDays:[1,2,3,4,5],startTime:'09:00',endTime:'17:30',homeAddress:'',commissionPercent:0}]})}>+ Add another groomer</button>
   {error&&<div className="login-message" role="alert">{error}</div>}
   <button className="login-button" type="submit">{saving?'Saving your business…':'Open my dashboard'}</button>
  </fieldset></form><button type="button" className="text-btn" disabled={saving} style={{marginTop:20}} onClick={()=>supabase.auth.signOut().catch(e=>setError(e.message))}>Sign out</button>
 </div></div>
}
