import React,{useEffect,useRef,useState} from 'react'
import {supabase} from '../supabase.js'
import {AppointmentDogPhotos} from './DogPhoto.jsx'

export default function ClientNotes({householdId,appt,editable=true}) {
 const panel=useRef(null),[ready,setReady]=useState(false)
 useEffect(()=>{
  if(ready)return
  if(typeof IntersectionObserver==='undefined'){setReady(true);return}
  const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setReady(true);observer.disconnect()}},{rootMargin:'200px 0px'})
  if(panel.current)observer.observe(panel.current)
  return()=>observer.disconnect()
 },[ready])
 const [data,setData]=useState(null),[draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[refresh,setRefresh]=useState(0)
 useEffect(()=>{
  if(!ready)return
  let active=true;setData(null);setMessage('');setDraft('')
  supabase.rpc('get_planner_client_notes',{p_household:householdId || null,p_week_start:appt?.weekStart || null,p_row_index:appt?.rowIndex ?? null}).then(({data,error})=>{
   if(!active)return
   if(error)setMessage('Could not load this client’s photos and notes. Please refresh and try again.')
   else setData(data)
  }).catch(()=>{if(active)setMessage('Could not load this client’s photos and notes. Please refresh and try again.')})
  return ()=>{active=false}
 },[ready,householdId,appt?.weekStart,appt?.rowIndex,refresh])
 async function save(){
  if(!draft.trim() || busy || !data?.householdId)return
  setBusy(true);setMessage('')
  try{
   const {error}=await supabase.rpc('add_planner_client_note',{p_household:data.householdId,p_note:draft.trim()});if(error)throw error
   const result=await supabase.rpc('get_planner_client_notes',{p_household:householdId || null,p_week_start:appt?.weekStart || null,p_row_index:appt?.rowIndex ?? null})
   if(!result.error)setData(result.data)
   setDraft('');setMessage('Note saved to the client card.')
  }catch{setMessage('Could not save your note. Please try again.')}finally{setBusy(false)}
 }
 const c=data?.clientNotes || {}
 return <section ref={panel} className="client-notes">
  {appt && <><strong style={{display:'block',marginBottom:6}}>Dog photos</strong>{data && <AppointmentDogPhotos appt={appt} householdId={data.householdId}/>}</>}
  <strong style={{display:'block',marginTop:10}}>Client notes</strong>
  {data && <><div style={{fontSize:13,lineHeight:1.5,whiteSpace:'pre-wrap'}}>{[['Client',c.client],['Gate / access',c.access],['Parking',c.parking]].filter(([,value])=>value).map(([label,value])=><p key={label}><strong>{label}:</strong> {value}</p>)}
  {(data.dogNotes || []).map(d=><div key={d.dog}>{[['Grooming',d.grooming],['Handling',d.handling],['Care',d.care]].filter(([,v])=>v).map(([label,value])=><p key={label}><strong>{d.dog} · {label}:</strong> {value}</p>)}</div>)}
  {(data.sharedNotes || []).map(n=><div key={n.id} style={{marginTop:8,padding:8,background:'#fff',borderRadius:8}}><strong>{n.author}</strong><span style={{color:'#7b828e',marginLeft:8,fontSize:11}}>{new Date(n.createdAt).toLocaleString()}</span><div>{n.note}</div></div>)}
  {!c.client && !c.access && !c.parking && !(data.dogNotes || []).some(d=>d.grooming || d.handling || d.care) && !data.sharedNotes?.length && <p>No saved notes yet.</p>}</div>
  {editable && <details className="note-composer"><summary>Add a note</summary><label style={{display:'block',fontSize:13,marginTop:10}}>Note<textarea aria-label="Add a client note" maxLength={2000} value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Grooming, handling, or visit notes…" style={{display:'block',width:'100%',boxSizing:'border-box',minHeight:80,marginTop:6}}/></label><button type="button" className="secondary-btn" disabled={busy || !draft.trim()} onClick={save}>{busy?'Saving…':'Save note'}</button></details>}
  </>}
  {!data && !message && <div role="status">Loading photos and notes…</div>}
  {message && <div role="status" style={{fontSize:12,marginTop:8}}>{message}{!data && <button type="button" className="secondary-btn" onClick={()=>setRefresh(v=>v+1)}>Retry</button>}</div>}
 </section>
}
