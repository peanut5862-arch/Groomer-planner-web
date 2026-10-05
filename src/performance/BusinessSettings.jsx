import React,{useEffect,useState} from 'react'
import {X,Plus} from 'lucide-react'
import {supabase} from '../supabase.js'
import {useBusinessContext,setBusinessContext,validateBusinessSettings} from './businessConfig.js'
const weekdays=['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const zones=['America/New_York','America/Chicago','America/Denver','America/Phoenix','America/Los_Angeles','America/Anchorage','Pacific/Honolulu','Europe/London','Australia/Sydney']
export default function BusinessSettings({initialTab='schedule',onClose,onSaved}) {
 const business=useBusinessContext()
 const [tab,setTab]=useState(initialTab)
 const [draft,setDraft]=useState(()=>structuredClone(business.settings))
 const [saving,setSaving]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(true)
 useEffect(()=>{let live=true;supabase.rpc('get_business_context').then(({data,error})=>{if(!live)return;if(error)setError(error.message);else if(data?.businessId){setBusinessContext(data);setDraft(structuredClone(data.settings))}setLoading(false)}).catch(e=>{if(live){setError(e.message);setLoading(false)}});return()=>{live=false}},[])
 const editable=business.role==='owner'
 const patch=values=>{setError('');setDraft(s=>({...s,...values}))}
 const changeGroomer=(id,values)=>{setError('');setDraft(s=>({...s,groomers:s.groomers.map(g=>g.id===id?{...g,...values}:g)}))}
 const save=async event=>{
  event.preventDefault()
  if(saving||loading||!editable)return
  const next={...draft,businessName:draft.businessName.trim(),groomers:draft.groomers.map(g=>({...g,name:g.name.trim(),homeAddress:g.homeAddress.trim()}))}
  const errors=validateBusinessSettings(next)
  if(errors.length){setError(errors.join(' '));return}
  setSaving(true);setError('')
  try{
   const {data,error}=await supabase.rpc('save_business_settings',{p_settings:next,p_expected_revision:business.revision})
   if(error)throw error
   if(!data?.businessId)throw Error('The save could not be confirmed. Close and reopen settings before trying again.')
   setBusinessContext(data);onSaved?.();onClose()
  }catch(e){setError(e.message||'Could not save your settings.')}finally{setSaving(false)}
 }
 return <div className="sheet-backdrop" onClick={()=>!saving&&onClose()}>
  <form className="sheet business-settings" aria-label="Business settings" onClick={e=>e.stopPropagation()} onSubmit={save} style={{maxHeight:'92dvh',overflowY:'auto',paddingBottom:24}}>
   <style>{`.business-settings .sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.business-settings label{display:grid;gap:7px;margin:12px 0;font-weight:700;color:#34415f}.business-settings input,.business-settings select,.business-settings textarea{width:100%;box-sizing:border-box;border:1px solid #dcdfe5;border-radius:12px;padding:12px;background:white;color:#172038;font:inherit}.business-settings .settings-card{padding:15px;border:1px solid #e1e4e9;border-radius:16px;margin:12px 0}.business-settings .settings-days{display:flex;flex-wrap:wrap;gap:6px}.business-settings .settings-days button{padding:9px;border:1px solid #cdd4e0;border-radius:10px;background:#fff;color:#34415f}.business-settings .settings-days button[aria-pressed=true]{background:#17223f;color:#fff}.business-settings .check-label{display:flex;align-items:center;gap:10px}.business-settings .check-label input{width:20px}.business-settings .settings-help{font-size:12px;line-height:1.5;color:#727b89}.business-settings .settings-actions{display:flex;gap:10px;position:sticky;bottom:-24px;background:#faf9f6;padding:14px 0}.business-settings .settings-actions button{flex:1}`}</style>
   <div className="sheet-head"><div><div className="eyebrow">{business.settings.businessName}</div><h2>Your business settings</h2></div><button type="button" className="icon-btn" aria-label="Close settings" disabled={saving} onClick={onClose}><X size={20}/></button></div>
   <div className="segmented">{[['business','Business'],['schedule','Schedule'],['route','Routes']].map(([key,label])=><button key={key} type="button" className={tab===key?'active':''} onClick={()=>setTab(key)}>{label}</button>)}</div>
   {!editable&&<p className="settings-help">Only your business owner can change these settings.</p>}
   <fieldset disabled={!editable||saving||loading} style={{border:0,padding:0,margin:0}}>
   {tab==='business'&&<>
    <label>Business name<input value={draft.businessName} maxLength={100} onChange={e=>patch({businessName:e.target.value})}/></label>
    <label>Time zone<select value={draft.timeZone} onChange={e=>patch({timeZone:e.target.value})}>{[...new Set([draft.timeZone,...zones])].map(zone=><option key={zone}>{zone}</option>)}</select></label>
    <p className="settings-help">Use the time zone where your business works. It controls Today and appointment dates.</p>
    <h3>Payment instructions</h3><p className="settings-help">Add your own payment links or contact details. These appear in payment text drafts.</p>
    {['Venmo','PayPal','Cash App','Zelle','Apple Pay'].map(method=><label key={method}>{method}<input value={draft.paymentInstructions?.[method]||''} maxLength={500} placeholder={`Your ${method} details`} onChange={e=>patch({paymentInstructions:{...draft.paymentInstructions,[method]:e.target.value}})}/></label>)}
   </>}
   {tab==='schedule'&&<>
    <label>Gap between appointments (minutes)<input type="number" min={0} max={120} value={draft.bufferMinutes} onChange={e=>patch({bufferMinutes:Number(e.target.value)})}/></label>
    <p className="settings-help">Used when finding openings. Saved appointments stay where you placed them.</p>
    {draft.groomers.map(g=><div className="settings-card" key={g.id}>
     <label>Groomer name<input value={g.name} maxLength={50} onChange={e=>changeGroomer(g.id,{name:e.target.value})}/></label>
     <label className="check-label"><input type="checkbox" checked={g.active!==false} onChange={e=>changeGroomer(g.id,{active:e.target.checked})}/>Active groomer</label>
     <p className="settings-help">Turn Active off to archive a groomer and keep their clients and history.</p>
     <div className="settings-days" aria-label={`${g.name} working days`}>{[1,2,3,4,5,6,0].map(day=><button key={day} type="button" aria-pressed={g.workDays.includes(day)} onClick={()=>changeGroomer(g.id,{workDays:g.workDays.includes(day)?g.workDays.filter(d=>d!==day):[...g.workDays,day]})}>{weekdays[day]}</button>)}</div>
     <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}><label>Start time<input type="time" value={g.startTime} onChange={e=>changeGroomer(g.id,{startTime:e.target.value})}/></label><label>End time<input type="time" value={g.endTime} onChange={e=>changeGroomer(g.id,{endTime:e.target.value})}/></label></div>
     <label>Service commission (%)<input type="number" min={0} max={100} step="0.1" value={g.commissionPercent} onChange={e=>changeGroomer(g.id,{commissionPercent:Number(e.target.value)})}/></label>
     <p className="settings-help">Tips are separate. Changing this rate applies to future completions; past pay stays the same.</p>
    </div>)}
    <button type="button" className="ghost" onClick={()=>patch({groomers:[...draft.groomers,{id:crypto.randomUUID(),name:'',active:true,workDays:[1,2,3,4,5],startTime:'09:00',endTime:'17:30',homeAddress:'',commissionPercent:0}]})}><Plus size={16}/> Add groomer</button>
   </>}
   {tab==='route'&&<>
    {draft.groomers.map(g=><label key={g.id}>{g.name||'New groomer'} starting address<input value={g.homeAddress||''} maxLength={500} placeholder={draft.legacyHomeBases&&['jen','haley'].includes(g.id)?'Existing starting address is kept until you enter a new one':'Street address, city, state, ZIP'} onChange={e=>changeGroomer(g.id,{homeAddress:e.target.value})}/></label>)}
    <p className="settings-help">Google routes start and finish here. New groomers need an address before calculating a home-to-home route.</p>
    <label className="check-label"><input type="checkbox" checked={Boolean(draft.route.avoidTolls)} onChange={e=>patch({route:{...draft.route,avoidTolls:e.target.checked}})}/>Prefer routes without tolls</label>
    <label>Maximum extra driving for a suggestion (minutes)<input type="number" min={0} max={240} value={draft.route.maxAddedDriveMinutes} onChange={e=>patch({route:{...draft.route,maxAddedDriveMinutes:Number(e.target.value)}})}/></label>
    <p className="settings-help">0 means no limit. Suggestions with a calculated Google route over this limit are marked for review.</p>
   </>}
   </fieldset>
   {error&&<div className="login-message" role="alert">{error}</div>}
   <div className="settings-actions"><button type="button" className="ghost" disabled={saving} onClick={onClose}>Close</button>{editable&&<button type="submit" className="primary-mini" disabled={saving||loading}>{saving?'Saving…':'Save settings'}</button>}</div>
  </form>
 </div>
}
