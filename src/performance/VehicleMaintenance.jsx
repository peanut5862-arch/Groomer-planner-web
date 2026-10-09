import React,{useEffect,useRef,useState} from 'react'
import {supabase} from '../supabase.js'
import {useBusinessContext} from './businessConfig.js'
import {businessDateKey} from './shared.jsx'
import {prepareDogPhoto} from './DogPhoto.jsx'
import {X,Plus,Truck,Wrench} from 'lucide-react'
const categories=['Oil change','Tires','Brakes','Generator','Grooming equipment','Inspection','Repair','Other']
const emptyVehicle=()=>({name:'',plate:'',assigned_groomer_id:'',odometer:0,active:true,notes:''})
const emptyLog=()=>({service_date:businessDateKey(),category:'Oil change',mileage:'',cost:'',shop:'',notes:'',next_due_date:'',next_due_mileage:''})
const numberOrNull=value=>value===''||value==null?null:Number(value)
const money=value=>value==null?'Cost not recorded':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value)
const dateLabel=value=>new Date(value+'T12:00:00Z').toLocaleDateString('en-US',{timeZone:'UTC',month:'short',day:'numeric',year:'numeric'})
export function maintenanceDue(logs,vehicle,today){
 const latest=new Map()
 for(const log of logs)if(!latest.has(log.category))latest.set(log.category,log)
 return [...latest.values()].filter(log=>(log.next_due_date&&log.next_due_date<=today)||(log.next_due_mileage!=null&&vehicle.odometer>=log.next_due_mileage))
}
function Receipt({path}){
 const [url,setUrl]=useState(''),[error,setError]=useState('')
 useEffect(()=>{let live=true;supabase.storage.from('vehicle-receipts').createSignedUrl(path,3600).then(({data,error})=>{if(live){setUrl(data?.signedUrl||'');setError(error?'Could not open receipt. Close and reopen maintenance to retry.':'')}});return()=>{live=false}},[path])
 return url?<a href={url} target="_blank" rel="noopener noreferrer" className="secondary-btn">View receipt photo</a>:<span role="status">{error||'Loading receipt…'}</span>
}
export default function VehicleMaintenance({onClose}){
 const business=useBusinessContext(),owner=business.role==='owner',today=businessDateKey()
 const [vehicles,setVehicles]=useState([]),[logs,setLogs]=useState([]),[selected,setSelected]=useState(''),[showArchived,setShowArchived]=useState(false)
 const [vehicleDraft,setVehicleDraft]=useState(null),[logDraft,setLogDraft]=useState(null),[receipt,setReceipt]=useState(null)
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const camera=useRef(null),library=useRef(null),saving=useRef(false),loadVersion=useRef(0)
 const vehicle=vehicles.find(v=>v.id===selected),vehicleLogs=logs.filter(l=>l.vehicle_id===selected)
 const groomers=business.settings.groomers||[]
 async function load(){
  const version=++loadVersion.current;setLoading(true);setError('')
  try{
   const [v,m]=await Promise.all([supabase.from('planner_vehicles').select('*').eq('business_id',business.businessId).order('name'),supabase.from('planner_vehicle_maintenance').select('*').eq('business_id',business.businessId).order('service_date',{ascending:false}).order('updated_at',{ascending:false})])
   if(v.error||m.error)throw v.error||m.error
   if(version===loadVersion.current){setVehicles(v.data||[]);setLogs(m.data||[]);setSelected(id=>(v.data||[]).some(x=>x.id===id)?id:((v.data||[]).find(x=>x.active)?.id||v.data?.[0]?.id||''))}
  }catch(e){if(version===loadVersion.current)setError('Could not load vehicle maintenance. Please try again.')}
  finally{if(version===loadVersion.current)setLoading(false)}
 }
 useEffect(()=>{if(owner)load();else setLoading(false);return()=>{loadVersion.current++}},[business.businessId,owner])
 function editVehicle(v){setError('');setNotice('');setLogDraft(null);setVehicleDraft(v?{...v,assigned_groomer_id:v.assigned_groomer_id||''}:emptyVehicle())}
 function editLog(log){setError('');setNotice('');setVehicleDraft(null);setReceipt(null);setLogDraft(log?{...log,mileage:log.mileage??'',cost:log.cost??'',next_due_date:log.next_due_date||'',next_due_mileage:log.next_due_mileage??''}:{...emptyLog(),mileage:vehicle?.odometer||''})}
 async function saveVehicle(event){
  event.preventDefault();if(saving.current||!owner)return
  const d=vehicleDraft,payload={business_id:business.businessId,name:d.name.trim(),plate:d.plate.trim(),assigned_groomer_id:d.assigned_groomer_id||null,odometer:Number(d.odometer),active:d.active,notes:d.notes.trim()}
  if(!payload.name||!Number.isInteger(payload.odometer)||payload.odometer<0){setError('Enter a vehicle name and valid mileage.');return}
  saving.current=true;setBusy(true);setError('')
  try{
   const result=d.id?await supabase.from('planner_vehicles').update(payload).eq('id',d.id).eq('business_id',business.businessId).select('id').single():await supabase.from('planner_vehicles').insert(payload).select('id').single()
   if(result.error)throw result.error
   setSelected(result.data.id);setVehicleDraft(null);await load();setNotice('Vehicle saved.')
  }catch(e){setError('Could not save the vehicle. Check the details and try again.')}
  finally{saving.current=false;setBusy(false)}
 }
 async function saveLog(event){
  event.preventDefault();if(saving.current||!owner||!vehicle)return
  const d=logDraft,id=d.id||crypto.randomUUID(),payload={id,business_id:business.businessId,vehicle_id:vehicle.id,service_date:d.service_date,category:d.category,mileage:numberOrNull(d.mileage),cost:numberOrNull(d.cost),shop:d.shop.trim(),notes:d.notes.trim(),next_due_date:d.next_due_date||null,next_due_mileage:numberOrNull(d.next_due_mileage),receipt_path:d.receipt_path||null}
  if(!d.service_date||[payload.mileage,payload.next_due_mileage].some(n=>n!=null&&(!Number.isInteger(n)||n<0))||(payload.cost!=null&&(!Number.isFinite(payload.cost)||payload.cost<0))){setError('Check the service date, mileage, and cost.');return}
  saving.current=true;setBusy(true);setError('');let uploadedPath=''
  try{
   if(receipt){const blob=await prepareDogPhoto(receipt);uploadedPath=`${business.businessId}/${vehicle.id}/${id}/${crypto.randomUUID()}.jpg`;const upload=await supabase.storage.from('vehicle-receipts').upload(uploadedPath,blob,{contentType:'image/jpeg',upsert:false});if(upload.error)throw upload.error;payload.receipt_path=uploadedPath}
   const result=d.id?await supabase.from('planner_vehicle_maintenance').update(payload).eq('id',id).eq('business_id',business.businessId).select('id').single():await supabase.from('planner_vehicle_maintenance').insert(payload).select('id').single()
   if(result.error)throw result.error
   uploadedPath='';setLogDraft(null);setReceipt(null)
   if(receipt&&d.receipt_path)await supabase.storage.from('vehicle-receipts').remove([d.receipt_path])
   await load();setNotice('Maintenance saved.')
  }catch(e){if(uploadedPath)await supabase.storage.from('vehicle-receipts').remove([uploadedPath]);setError('Could not save maintenance. Please check the details and receipt photo, then try again.')}
  finally{saving.current=false;setBusy(false)}
 }
 function chooseReceipt(event){const file=event.target.files?.[0];event.target.value='';if(file){setReceipt(file);setError('')}}
 if(!owner)return null
 return <div className="sheet-backdrop" onClick={()=>!busy&&onClose()}><section className="sheet vehicle-maintenance" role="dialog" aria-modal="true" aria-labelledby="vehicle-maintenance-title" onClick={e=>e.stopPropagation()}>
  <style>{`.vehicle-maintenance{max-height:92dvh;overflow:auto;padding:20px!important}.vehicle-maintenance .vm-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.vehicle-maintenance h2{margin:4px 0}.vehicle-maintenance h3{margin:0 0 8px}.vehicle-maintenance p{font-size:13px;line-height:1.5;color:#727b89}.vehicle-maintenance .vm-card{padding:15px;border:1px solid #e1e4e9;border-radius:16px;background:#fff;margin:12px 0}.vehicle-maintenance .vm-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.vehicle-maintenance label{display:grid;gap:7px;margin:12px 0;font-size:13px;font-weight:700;color:#34415f}.vehicle-maintenance input,.vehicle-maintenance select,.vehicle-maintenance textarea{min-width:0;width:100%;box-sizing:border-box;border:1px solid #dcdfe5;border-radius:12px;padding:12px;background:white;color:#172038;font:inherit}.vehicle-maintenance .vm-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 12px}.vehicle-maintenance .vm-check{display:flex;gap:8px;align-items:center}.vehicle-maintenance .vm-check input{width:20px;height:20px}.vehicle-maintenance .vm-select{appearance:none;text-align:left;display:block;width:100%;padding:13px;border:1px solid #dce1ea;border-radius:12px;background:#fff;color:#172038;margin:8px 0;font:inherit}.vehicle-maintenance .vm-select[aria-pressed=true]{border-color:#17213a;background:#eef2fa}.vehicle-maintenance .vm-select span{display:block;font-size:12px;color:#727b89;margin-top:4px}.vehicle-maintenance .vm-due{background:#fff6e5;border-color:#efd18c}.vehicle-maintenance .vm-actions{display:flex;gap:8px;flex-wrap:wrap;margin:15px 0 4px}.vehicle-maintenance button:disabled{opacity:.5}.vehicle-maintenance .vm-note{white-space:pre-wrap;overflow-wrap:anywhere}@media(max-width:420px){.vehicle-maintenance .vm-grid{grid-template-columns:1fr}}`}</style>
  <div className="vm-head"><div><div className="eyebrow">BUSINESS</div><h2 id="vehicle-maintenance-title">Vehicle maintenance</h2><p>Service history stays with each vehicle when its groomer changes.</p></div><button type="button" className="icon-btn" aria-label="Close vehicle maintenance" disabled={busy} onClick={onClose}><X size={20}/></button></div>
  {loading?<p role="status">Loading vehicles…</p>:<>
   {!vehicleDraft&&!logDraft&&<><button type="button" className="secondary-btn" onClick={()=>editVehicle(null)}><Plus size={16}/>Add vehicle</button><label className="vm-check"><input type="checkbox" checked={showArchived} onChange={e=>setShowArchived(e.target.checked)}/>Show archived vehicles</label>
    {vehicles.filter(v=>showArchived||v.active).map(v=><button type="button" key={v.id} className="vm-select" aria-pressed={selected===v.id} onClick={()=>{setSelected(v.id);setNotice('')}}><strong>{v.name}{!v.active?' · Archived':''}</strong><span>{groomers.find(g=>g.id===v.assigned_groomer_id)?.name||'Unassigned'} · {v.odometer.toLocaleString()} miles{v.plate?` · ${v.plate}`:''}</span></button>)}
    {!vehicles.length&&<div className="vm-card"><Truck size={24}/><h3>Add your first vehicle</h3><p>Assign a groomer and record mileage, service costs, and the next service due.</p></div>}
   </>}
   {vehicleDraft&&<form className="vm-card" onSubmit={saveVehicle}><h3>{vehicleDraft.id?'Edit vehicle':'Add vehicle'}</h3><label>Vehicle name<input required maxLength={100} value={vehicleDraft.name} placeholder="Haley’s van" onChange={e=>setVehicleDraft({...vehicleDraft,name:e.target.value})}/></label><div className="vm-grid"><label>Plate (optional)<input maxLength={30} value={vehicleDraft.plate} onChange={e=>setVehicleDraft({...vehicleDraft,plate:e.target.value})}/></label><label>Current mileage<input type="number" min={0} max={10000000} step={1} required value={vehicleDraft.odometer} onChange={e=>setVehicleDraft({...vehicleDraft,odometer:e.target.value})}/></label></div><label>Assigned groomer<select value={vehicleDraft.assigned_groomer_id} onChange={e=>setVehicleDraft({...vehicleDraft,assigned_groomer_id:e.target.value})}><option value="">Unassigned / shared</option>{groomers.filter(g=>g.active!==false||g.id===vehicleDraft.assigned_groomer_id).map(g=><option key={g.id} value={g.id}>{g.name}{g.active===false?' (archived)':''}</option>)}</select></label><label>Vehicle notes<textarea maxLength={3000} value={vehicleDraft.notes} onChange={e=>setVehicleDraft({...vehicleDraft,notes:e.target.value})}/></label><label className="vm-check"><input type="checkbox" checked={vehicleDraft.active} onChange={e=>setVehicleDraft({...vehicleDraft,active:e.target.checked})}/>Active vehicle</label><p>Turn Active off to archive this vehicle and keep its service history.</p><div className="vm-actions"><button className="primary-mini" disabled={busy}>{busy?'Saving…':'Save vehicle'}</button><button type="button" className="secondary-btn" disabled={busy} onClick={()=>setVehicleDraft(null)}>Cancel</button></div></form>}
   {vehicle&&!vehicleDraft&&<>
    {!logDraft&&<><div className="vm-card"><h3>{vehicle.name}</h3><p>{vehicle.notes}</p><div className="vm-row"><button type="button" className="secondary-btn" onClick={()=>editVehicle(vehicle)}>Edit vehicle / assignment</button><button type="button" className="primary-mini" disabled={!vehicle.active} onClick={()=>editLog(null)}><Plus size={16}/>Add maintenance</button></div></div>
     {maintenanceDue(vehicleLogs,vehicle,today).map(log=><div key={log.id} className="vm-card vm-due"><strong>{log.category} due</strong><p>{log.next_due_date?`Due ${dateLabel(log.next_due_date)}. `:''}{log.next_due_mileage!=null?`Due at ${log.next_due_mileage.toLocaleString()} miles.`:''}</p></div>)}
     <h3>Service history</h3>{!vehicleLogs.length&&<p>No maintenance recorded yet.</p>}
     {vehicleLogs.map(log=><article key={log.id} className="vm-card"><div className="vm-row" style={{justifyContent:'space-between'}}><strong><Wrench size={14}/> {log.category}</strong><button type="button" className="secondary-btn" onClick={()=>editLog(log)}>Edit service</button></div><p>{dateLabel(log.service_date)} · {log.mileage!=null?`${log.mileage.toLocaleString()} miles · `:''}{money(log.cost)}{log.shop?` · ${log.shop}`:''}</p>{log.notes&&<p className="vm-note">{log.notes}</p>}{(log.next_due_date||log.next_due_mileage!=null)&&<p>Next service: {log.next_due_date?dateLabel(log.next_due_date):''}{log.next_due_date&&log.next_due_mileage!=null?' or ':''}{log.next_due_mileage!=null?`${log.next_due_mileage.toLocaleString()} miles`:''}</p>}{log.receipt_path&&<Receipt path={log.receipt_path}/>}</article>)}
    </>}
    {logDraft&&<form className="vm-card" onSubmit={saveLog}><h3>{logDraft.id?'Edit maintenance':'Add maintenance'} · {vehicle.name}</h3><div className="vm-grid"><label>Service date<input type="date" required value={logDraft.service_date} onChange={e=>setLogDraft({...logDraft,service_date:e.target.value})}/></label><label>Service type<select value={logDraft.category} onChange={e=>setLogDraft({...logDraft,category:e.target.value})}>{categories.map(c=><option key={c}>{c}</option>)}</select></label><label>Mileage (optional)<input type="number" min={0} max={10000000} step={1} value={logDraft.mileage} onChange={e=>setLogDraft({...logDraft,mileage:e.target.value})}/></label><label>Cost (optional)<input type="number" min={0} max={9999999999} step="0.01" value={logDraft.cost} onChange={e=>setLogDraft({...logDraft,cost:e.target.value})}/></label></div><label>Shop / provider<input maxLength={200} value={logDraft.shop} onChange={e=>setLogDraft({...logDraft,shop:e.target.value})}/></label><label>Notes<textarea maxLength={5000} value={logDraft.notes} onChange={e=>setLogDraft({...logDraft,notes:e.target.value})}/></label><div className="vm-grid"><label>Next service date (optional)<input type="date" value={logDraft.next_due_date} onChange={e=>setLogDraft({...logDraft,next_due_date:e.target.value})}/></label><label>Next service mileage (optional)<input type="number" min={0} max={10000000} step={1} value={logDraft.next_due_mileage} onChange={e=>setLogDraft({...logDraft,next_due_mileage:e.target.value})}/></label></div><p>Service is due when either the date or mileage is reached. Recorded service mileage updates the vehicle’s odometer when higher.</p><label>Receipt photo (optional)</label><input hidden ref={camera} type="file" accept="image/*" capture="environment" onChange={chooseReceipt}/><input hidden ref={library} type="file" accept="image/*" onChange={chooseReceipt}/><div className="vm-row"><button type="button" className="secondary-btn" disabled={busy} onClick={()=>camera.current.click()}>Take receipt photo</button><button type="button" className="secondary-btn" disabled={busy} onClick={()=>library.current.click()}>Choose receipt photo</button></div>{receipt?<p>Photo selected: {receipt.name}</p>:logDraft.receipt_path?<p>Saved receipt will be kept unless you choose a replacement.</p>:null}<div className="vm-actions"><button className="primary-mini" disabled={busy}>{busy?'Saving…':'Save maintenance'}</button><button type="button" className="secondary-btn" disabled={busy} onClick={()=>{setLogDraft(null);setReceipt(null)}}>Cancel</button></div></form>}
   </>}
  </>}
  {error&&<div className="login-message" role="alert">{error}<button type="button" className="secondary-btn" disabled={busy} onClick={load}>Retry</button></div>}{notice&&<p role="status">{notice}</p>}
 </section></div>
}
