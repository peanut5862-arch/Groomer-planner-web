import React,{useEffect,useState} from 'react'
import {supabase} from '../supabase.js'
import {useBusinessContext} from './businessConfig.js'
import {businessDateKey,mondayForDate,todayAppointments} from './shared.jsx'
import {dailyCloseout} from './dailyCloseout.js'
import {X} from 'lucide-react'
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n)
export default function DailyCloseout({onClose,onOpen,dogs,revision,initialDate}){
 const business=useBusinessContext(),[date,setDate]=useState(initialDate||businessDateKey()),[rows,setRows]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0)
 useEffect(()=>{let live=true;setLoading(true);setError('');supabase.from('weekly_drafts').select('plan_json').eq('business_id',business.businessId).eq('week_start',mondayForDate(date)).limit(1).then(({data,error})=>{if(!live)return;if(error)setError('Could not load this day. Please try again.');else setRows(data?.[0]?.plan_json||[])}).catch(()=>{if(live)setError('Could not load this day. Please try again.')}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[date,business.businessId,revision,retry])
 if(business.role!=='owner')return null
 const report=dailyCloseout(rows,date,business.settings.groomers),appointments=todayAppointments(rows,date,'All',dogs)
 function open(row){const appt=appointments.find(a=>a.sourceRow===row);if(appt){onClose();onOpen?.({...appt,_initialMode:'edit'})}}
 return <div className="sheet-backdrop" onClick={onClose}><section className="sheet" role="dialog" aria-modal="true" aria-labelledby="closeout-title" onClick={e=>e.stopPropagation()} style={{maxHeight:'92dvh',overflow:'auto',padding:20}}>
 <div style={{display:'flex',justifyContent:'space-between',gap:12}}><div><div className="eyebrow">BUSINESS</div><h2 id="closeout-title">Daily closeout</h2></div><button className="icon-btn" aria-label="Close daily closeout" onClick={onClose}><X/></button></div>
 <label style={{display:'grid',gap:6,margin:'12px 0'}}>Day<input type="date" required value={date} onChange={e=>{if(e.target.value)setDate(e.target.value)}} style={{font:'inherit',padding:12,border:'1px solid #dce1ea',borderRadius:12}}/></label>
 {loading?<p role="status">Loading this day…</p>:error?<div role="alert">{error}<button className="secondary-btn" onClick={()=>setRetry(n=>n+1)}>Retry</button></div>:<>
 <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:10}}>{[['Finished stops',`${report.completed}/${report.stops}`],['Completed services',money(report.service)],['Service payments recorded',money(report.received)],['Tips recorded',money(report.tips)],['Completed, unpaid services',money(report.unpaid)]].map(([label,value])=><div key={label} style={{padding:12,border:'1px solid #e1e4e9',borderRadius:14}}><div style={{fontSize:12,color:'#657084'}}>{label}</div><strong style={{fontSize:21}}>{value}</strong></div>)}</div>
 <h3 style={{marginTop:20}}>Needs attention ({report.issues.length})</h3>{!report.stops?<p>No appointments on this day.</p>:!report.issues.length?<p>All stops finished with prices and payment details recorded.</p>:report.issues.map(({row,reasons},i)=><button key={i} className="secondary-btn" onClick={()=>open(row)} style={{display:'block',width:'100%',textAlign:'left',margin:'8px 0',padding:12}}><strong>{row.Owner}</strong><span style={{display:'block',fontSize:12,marginTop:4}}>{row.Groomer} · {reasons.join(' · ')} ›</span></button>)}
 <h3 style={{marginTop:20}}>Groomer payout estimates</h3><p style={{fontSize:12,color:'#657084'}}>Completed-service commission plus recorded tips on completed stops. These are estimates, not payouts sent.</p>{report.team.map(t=><div key={t.name} style={{padding:12,borderTop:'1px solid #e1e4e9'}}><strong>{t.name} · {money(t.payout)}</strong><div>{money(t.commission)} commission + {money(t.tips)} tips</div>{t.missingRate&&<p role="status">Commission rate missing; estimate is incomplete.</p>}</div>)}
 <p style={{fontSize:12,color:'#657084'}}>Missing prices are excluded from totals. Payments are recorded by your team; bank deposits are not verified here.</p>
 </>}
 </section></div>
}
