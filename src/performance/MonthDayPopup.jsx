import React,{useEffect,useRef} from 'react'
import {groomerConfig,groomerNames} from './businessConfig.js'
import {groomerColorStyle} from './groomerColors.js'
import {timeOffReason} from './timeOff.js'
const money=amount=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(amount)
export default function MonthDayPopup({date,visits,appointments,groomer,settings,viewerMode,onClose,onOpen,onAdd,onFind}){
 const dialog=useRef(null),close=useRef(null)
 useEffect(()=>{const previous=document.activeElement;close.current?.focus();const key=event=>{
  if(event.key==='Escape')onClose()
  if(event.key==='Tab'){const buttons=[...dialog.current.querySelectorAll('button:not(:disabled)')];const first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}
 };document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);previous?.focus()}},[])
 const label=new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US',{timeZone:'UTC',weekday:'long',month:'short',day:'numeric'})
 return <div className="sheet-backdrop" onClick={onClose}><section ref={dialog} className="sheet" role="dialog" aria-modal="true" aria-labelledby="month-day-title" onClick={event=>event.stopPropagation()} style={{padding:18,maxHeight:'88dvh',overflowY:'auto',width:'min(680px,100%)',boxSizing:'border-box'}}>
  <div className="sheet-head" style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}><div><div className="eyebrow">Day overview</div><h2 id="month-day-title" style={{margin:'4px 0',fontSize:22}}>{label}</h2></div><button ref={close} className="icon-btn" aria-label="Close day overview" onClick={onClose}>×</button></div>
  <p style={{margin:'8px 0'}}><strong>{visits.length} {visits.length===1?'stop':'stops'} · {money(appointments.reduce((sum,appt)=>sum+(Number(appt.price)||0),0))}</strong>{appointments.some(appt=>!Number.isFinite(appt.price)||/to confirm/i.test(appt.dogs))?' · Known prices only':''}</p>
  {(groomer==='All'?groomerNames():[groomer]).map(name=>{const reason=timeOffReason(settings,groomerConfig(name),date);return reason?<p className="login-message" key={name}>{name}: {reason}</p>:null})}
  {!viewerMode&&<div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14}}><button className="primary-mini" onClick={onAdd}>Add appointment</button><button className="ghost" onClick={onFind}>Find clients</button></div>}
  <div style={{display:'grid',gap:8}}>{visits.map(visit=><article key={visit.key} className="groomer-colored" style={{...groomerColorStyle(groomerConfig(visit.groomer)),borderLeft:'5px solid var(--groomer-color)',borderRadius:12,borderTop:'1px solid #ddd',borderRight:'1px solid #ddd',borderBottom:'1px solid #ddd',background:'#fff',padding:8,fontSize:13,lineHeight:1.25}}>
   <strong>{visit.owner}</strong><div style={{fontSize:13,marginTop:3}}>{visit.groomer} · {[...new Set(visit.appointments.map(appt=>appt.area).filter(Boolean))].join(', ')}</div>
   {visit.appointments.map(appt=><button key={appt.id} className="text-btn" style={{display:'block',textAlign:'left',width:'100%',padding:'5px 0',whiteSpace:'normal',fontSize:13,lineHeight:1.25,margin:0,minHeight:0}} onClick={()=>onOpen(appt)}>{appt.time} · {appt.dogs}{appt.completed?' · Completed':''}<span style={{fontSize:12}}> · {/to confirm/i.test(appt.dogs)?'Price to confirm':money(Number(appt.price)||0)} ›</span></button>)}
  </article>)}</div>
  {!visits.length&&<p>No appointments scheduled for this date.</p>}
 </section></div>
}
