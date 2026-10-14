import React,{lazy,Suspense,useEffect,useState} from 'react'
import {Bell} from 'lucide-react'
import {supabase} from '../supabase.js'
import {useBusinessContext} from './businessConfig.js'
const BookingRequests=lazy(()=>import('./BookingRequests.jsx'))
export default function BookingNotice({dogs,revision,onSaved}){
 const business=useBusinessContext(),[count,setCount]=useState(null),[error,setError]=useState(false),[open,setOpen]=useState(false),[refresh,setRefresh]=useState(0)
 useEffect(()=>{
  if(business.role!=='owner'||!business.businessId)return
  let live=true,inFlight=false
  const load=async()=>{
   if(inFlight||document.visibilityState==='hidden')return
   inFlight=true
   try{const result=await supabase.from('planner_booking_requests').select('id',{count:'exact',head:true}).eq('business_id',business.businessId).eq('status','pending');if(!live)return;if(result.error)throw result.error;setCount(result.count??0);setError(false)}catch{if(live)setError(true)}finally{inFlight=false}
  }
  setCount(null);setError(false);load()
  const timer=setInterval(load,30000),visible=()=>{if(document.visibilityState==='visible')load()}
  window.addEventListener('focus',load);document.addEventListener('visibilitychange',visible)
  return()=>{live=false;clearInterval(timer);window.removeEventListener('focus',load);document.removeEventListener('visibilitychange',visible)}
 },[business.role,business.businessId,revision,refresh])
 if(business.role!=='owner')return null
 return <><BookingNoticeCard count={count} error={error} onOpen={()=>setOpen(true)} onRetry={()=>setRefresh(n=>n+1)}/>{open&&<Suspense fallback={<div className="sheet-backdrop"><section className="sheet"><p role="status">Opening booking requests…</p><button className="secondary-btn" onClick={()=>setOpen(false)}>Close</button></section></div>}><BookingRequests dogs={dogs} onClose={()=>{setOpen(false);setRefresh(n=>n+1)}} onSaved={()=>{setRefresh(n=>n+1);onSaved?.()}}/></Suspense>}</>
}

export function BookingNoticeCard({count,error,onOpen,onRetry}){return <>{(count>0||error)&&<aside aria-label="Booking request notifications" role="status" style={{marginBottom:18,padding:16,border:'1px solid #e5bf67',borderRadius:16,background:'#fff6df',color:'#172038'}}><div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}><Bell size={22} aria-hidden="true"/><div style={{flex:'1 1 170px'}}><strong style={{fontSize:16}}>{count>0?`${count} booking request${count===1?'':'s'} waiting`:'Check booking requests'}</strong><div style={{fontSize:13,marginTop:3}}>{error?'Could not refresh the count. Open requests or try again.':'Review before adding to your schedule.'}</div></div><button className="secondary-btn" type="button" onClick={onOpen}>Review requests</button>{error&&<button className="secondary-btn" type="button" onClick={onRetry}>Retry</button>}</div></aside>}</>}
