import React, { useEffect, useState } from 'react';
import { supabase } from "../supabase.js";
import { ChevronLeft, ChevronRight, Route, Settings, WalletCards, LogOut } from 'lucide-react';
import { clientConfirmationStatus, businessDateKey, mondayForDate, clientDueInfo, plannerClientGroups, plannerActiveRow } from './shared.jsx'

function More({dogs,revision,onAsk,onRebook,session,showPushSetup=false}) {
  const today = businessDateKey()
  const [weekStart,setWeekStart] = useState(()=>mondayForDate(businessDateKey()))
  const [weekRecord,setWeekRecord] = useState(null)
  const [futureWeeks,setFutureWeeks] = useState([])
  const [loading,setLoading] = useState(true)
  const [error,setError] = useState('')

  const money = value => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(value || 0))
  const prettyDate = key => new Date(`${key}T12:00:00Z`).toLocaleDateString('en-US',{timeZone:'UTC',month:'short',day:'numeric'})
  const shiftWeek = amount => {
    const date = new Date(`${weekStart}T12:00:00Z`)
    date.setUTCDate(date.getUTCDate()+amount*7)
    setWeekStart(date.toISOString().slice(0,10))
  }
  const endKey = (()=>{
    const date = new Date(`${weekStart}T12:00:00Z`)
    date.setUTCDate(date.getUTCDate()+4)
    return date.toISOString().slice(0,10)
  })()

  useEffect(()=>{
    let cancelled=false
    const load = async ()=>{
      if(!supabase) return
      setLoading(true)
      setError('')
      const currentWeek = mondayForDate(today)
      const futureEndDate = new Date(`${today}T12:00:00Z`)
      futureEndDate.setUTCDate(futureEndDate.getUTCDate()+84)
      const futureEndWeek = mondayForDate(futureEndDate.toISOString().slice(0,10))
      const [weekResult,futureResult] = await Promise.all([
        supabase.from('weekly_drafts').select('week_start,plan_json,status,confirmed_at').eq('week_start',weekStart).limit(1),
        supabase.from('weekly_drafts').select('week_start,plan_json,status').gte('week_start',currentWeek).lte('week_start',futureEndWeek).order('week_start',{ascending:true})
      ])
      if(cancelled) return
      if(weekResult.error || futureResult.error){
        setError(weekResult.error?.message || futureResult.error?.message || 'Could not load business dashboard.')
        setWeekRecord(null)
        setFutureWeeks([])
      } else {
        setWeekRecord(weekResult.data?.[0] || null)
        setFutureWeeks(futureResult.data || [])
      }
      setLoading(false)
    }
    load()
    return ()=>{cancelled=true}
  },[weekStart,revision,today])

  const rows = Array.isArray(weekRecord?.plan_json) ? weekRecord.plan_json : []
  const lower = value => String(value || '').trim().toLowerCase()
  const rowState = row => {
    const appt = lower(row?.['Appointment Status'])
    const status = lower(row?.Status)
    const completion = lower(row?.['Completion Status'])
    const cancelled = ['cancelled','canceled'].includes(appt) || ['cancelled','canceled'].includes(status)
    const moved = appt==='moved to another week' || status==='rescheduled'
    const noShow = ['missed','no show','no-show','noshow'].includes(appt) || ['missed','no show','no-show','noshow'].includes(status)
    const completed = completion==='completed'
    return {cancelled,moved,noShow,completed,booked:!cancelled && !moved && !noShow}
  }
  const priced = row => {
    const value = Number(row?.Price)
    return Number.isFinite(value) ? value : 0
  }
  const dogCountForRow = row => {
    const text = String(row?.Dogs || '').trim()
    if(!text) return 0
    const simple = text.match(/^\s*(\d+)\s+dogs?\s*$/i)
    if(simple) return Number(simple[1])
    return text.split(',').map(part=>part.trim()).filter(Boolean).length || 1
  }

  const bookedRows = rows.filter(row=>String(row?.Owner || '').trim() && rowState(row).booked)
  const completedRows = bookedRows.filter(row=>rowState(row).completed)
  const openRows = bookedRows.filter(row=>!rowState(row).completed)
  const tipForRow = row => {
    const value = Number(String(row?.Tip ?? '').replace(/[$,]/g,'').trim())
    return Number.isFinite(value) ? Math.max(0,value) : 0
  }
  const isPaidRow = row => lower(row?.['Payment Status']) === 'paid'

  const scheduledRevenue = bookedRows.reduce((sum,row)=>sum+priced(row),0)
  const completedRevenue = completedRows.reduce((sum,row)=>sum+priced(row),0)
  const remainingRevenue = Math.max(0,scheduledRevenue-completedRevenue)
  const paidRows = bookedRows.filter(isPaidRow)
  const serviceReceived = paidRows.reduce((sum,row)=>sum+priced(row),0)
  const tipsReceived = paidRows.reduce((sum,row)=>sum+tipForRow(row),0)
  const totalReceived = serviceReceived + tipsReceived
  const dogCount = bookedRows.reduce((sum,row)=>sum+dogCountForRow(row),0)
  const cancelledCount = rows.filter(row=>rowState(row).cancelled).length
  const noShowCount = rows.filter(row=>rowState(row).noShow).length

  const groomerTotals = ['Jen','Haley'].map(name=>{
    const groomerRows = bookedRows.filter(row=>String(row?.Groomer || '').trim()===name)
    const done = groomerRows.filter(row=>rowState(row).completed)
    const completedService = done.reduce((sum,row)=>sum+priced(row),0)
    const tips = done.filter(isPaidRow).reduce((sum,row)=>sum+tipForRow(row),0)
    const commission = name==='Haley' ? completedService * 0.5 : 0
    const payout = name==='Haley' ? commission + tips : 0
    return {
      name,
      appointments:groomerRows.length,
      scheduled:groomerRows.reduce((sum,row)=>sum+priced(row),0),
      completed:completedService,
      tips,
      commission,
      payout
    }
  })
  const haleyTotals = groomerTotals.find(item=>item.name==='Haley') || {commission:0,tips:0,payout:0}

  const confirmations = openRows.reduce((acc,row)=>{
    const status = clientConfirmationStatus(row)
    acc[status] = (acc[status] || 0) + 1
    return acc
  },{'Confirmed':0,'Unconfirmed':0,'Needs reply':0,"Can't make it":0})

  const futureRows = futureWeeks.flatMap(week=>Array.isArray(week.plan_json)?week.plan_json:[]).filter(row=>plannerActiveRow(row,today))
  const bookedKeys = new Set()
  for(const row of futureRows){
    const household=String(row?.['Household ID'] || row?.household_id || '').trim()
    const owner=String(row?.Owner || '').trim().toLowerCase()
    if(household) bookedKeys.add(`h:${household}`)
    if(owner) bookedKeys.add(`o:${owner}`)
  }
  const rebooking = plannerClientGroups(dogs).map(client=>{
    const ownerKey=`o:${client.owner.toLowerCase()}`
    if(bookedKeys.has(client.key) || bookedKeys.has(ownerKey)) return null
    const due=clientDueInfo(client.rows,today)
    if(!['Overdue','Due today','Due this week','Due soon'].includes(due.status)) return null
    const assigned=[...new Set(client.rows.map(row=>String(row?.groomer || row?.Groomer || '').trim()).filter(name=>name==='Jen' || name==='Haley'))]
    return {...client,due,groomer:assigned.length===1?assigned[0]:'Jen'}
  }).filter(Boolean).sort((a,b)=>a.due.rank-b.due.rank || (a.due.dueDate || '').localeCompare(b.due.dueDate || '') || a.owner.localeCompare(b.owner))

  const reportCard = {background:'#fff',border:'1px solid #e4e7ec',borderRadius:18,padding:16,boxShadow:'0 8px 24px rgba(23,32,56,.04)'}
  const smallLabel = {fontSize:10,fontWeight:900,letterSpacing:'.08em',textTransform:'uppercase',color:'#7b828e'}
  const metricValue = {fontSize:24,lineHeight:1.1,fontWeight:900,color:'#172038',marginTop:5}

  return (
    <section>
      <div className="page-head">
        <div><div className="eyebrow">Business</div><h1>More</h1></div>
      </div>

      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:14}}>
        <div>
          <div style={smallLabel}>Week summary</div>
          <div style={{fontSize:18,fontWeight:900,color:'#172038',marginTop:3}}>{prettyDate(weekStart)} – {prettyDate(endKey)}</div>
        </div>
        <div className="month-arrows">
          <button className="icon-btn" type="button" onClick={()=>shiftWeek(-1)}><ChevronLeft size={18}/></button>
          <button className="icon-btn" type="button" onClick={()=>shiftWeek(1)}><ChevronRight size={18}/></button>
        </div>
      </div>

      {loading && <div className="prototype-note">Loading business dashboard…</div>}
      {error && <div className="login-message">{error}</div>}

      {!loading && !error && <>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          <div style={{...reportCard,background:'#fff9ec'}}><div style={smallLabel}>Scheduled revenue</div><div style={metricValue}>{money(scheduledRevenue)}</div><div style={{fontSize:11,color:'#7b828e',marginTop:5}}>{bookedRows.length} appointment{bookedRows.length===1?'':'s'}</div></div>
          <div style={{...reportCard,background:'#effaf2'}}><div style={smallLabel}>Completed revenue</div><div style={metricValue}>{money(completedRevenue)}</div><div style={{fontSize:11,color:'#4c7259',marginTop:5}}>{completedRows.length} completed</div></div>
          <div style={reportCard}><div style={smallLabel}>Service received</div><div style={metricValue}>{money(serviceReceived)}</div><div style={{fontSize:11,color:'#7b828e',marginTop:5}}>paid service only</div></div>
          <div style={reportCard}><div style={smallLabel}>Tips received</div><div style={metricValue}>{money(tipsReceived)}</div><div style={{fontSize:11,color:'#7b828e',marginTop:5}}>recorded tips</div></div>
          <div style={{...reportCard,background:'#f5f2ff'}}><div style={smallLabel}>Total received</div><div style={metricValue}>{money(totalReceived)}</div><div style={{fontSize:11,color:'#66579a',marginTop:5}}>service + tips</div></div>
          <div style={reportCard}><div style={smallLabel}>Remaining</div><div style={metricValue}>{money(remainingRevenue)}</div><div style={{fontSize:11,color:'#7b828e',marginTop:5}}>scheduled, not completed</div></div>
          <div style={reportCard}><div style={smallLabel}>Dogs</div><div style={metricValue}>{dogCount}</div><div style={{fontSize:11,color:'#7b828e',marginTop:5}}>across {bookedRows.length} stops</div></div>
          <div style={{...reportCard,background:'#eef7ff'}}><div style={smallLabel}>Haley payout</div><div style={metricValue}>{money(haleyTotals.payout)}</div><div style={{fontSize:11,color:'#52657a',marginTop:5}}>50% commission + 100% tips</div></div>
          <div style={{...reportCard,background:'#fff4ed'}}><div style={smallLabel}>Your share from Haley</div><div style={metricValue}>{money(haleyTotals.commission)}</div><div style={{fontSize:11,color:'#8a5a3b',marginTop:5}}>your 50% of Haley's completed service revenue</div></div>
        </div>

        {!weekRecord && <div className="prototype-note" style={{marginTop:12}}>No saved schedule exists for this week yet.</div>}

        <div style={{...reportCard,marginTop:14}}>
          <div className="section-title" style={{margin:'0 0 12px'}}><h3>Groomer totals</h3></div>
          <div style={{display:'grid',gap:10}}>
            {groomerTotals.map(item=><div key={item.name} style={{display:'grid',gridTemplateColumns:'1fr auto',gap:10,alignItems:'center',padding:12,borderRadius:14,background:item.name==='Jen'?'#f1f3ff':'#eff8f0',border:`1px solid ${item.name==='Jen'?'#dfe3ff':'#d9ecdc'}`}}>
              <div>
                <strong style={{fontSize:14,color:'#172038'}}>{item.name}</strong>
                <div style={{fontSize:11,color:'#7b828e',marginTop:3}}>{item.appointments} appointment{item.appointments===1?'':'s'}</div>
                {item.name==='Haley' && <div style={{fontSize:10.5,color:'#52657a',marginTop:4}}>50% service commission · keeps 100% of tips</div>}
              </div>
              <div style={{textAlign:'right'}}>
                <strong style={{fontSize:16,color:'#172038'}}>{money(item.scheduled)}</strong>
                <div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{money(item.completed)} completed</div>
                {item.name==='Haley' && <div style={{fontSize:10,color:'#267447',marginTop:3,fontWeight:800}}>{money(item.commission)} commission + {money(item.tips)} tips = {money(item.payout)} pay</div>}
              </div>
            </div>)}
          </div>
        </div>

        <div style={{...reportCard,marginTop:14}}>
          <div className="section-title" style={{margin:'0 0 12px'}}><h3>Client confirmations</h3></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <div style={{padding:11,borderRadius:12,background:'#effaf2'}}><div style={smallLabel}>Confirmed</div><strong style={{fontSize:19,color:'#267447'}}>{confirmations['Confirmed']}</strong></div>
            <div style={{padding:11,borderRadius:12,background:'#fff9ec'}}><div style={smallLabel}>Unconfirmed</div><strong style={{fontSize:19,color:'#8a651e'}}>{confirmations['Unconfirmed']}</strong></div>
            <div style={{padding:11,borderRadius:12,background:'#f5f2ff'}}><div style={smallLabel}>Needs reply</div><strong style={{fontSize:19,color:'#5e4aa8'}}>{confirmations['Needs reply']}</strong></div>
            <div style={{padding:11,borderRadius:12,background:'#fff0f0'}}><div style={smallLabel}>Can't make it</div><strong style={{fontSize:19,color:'#a83d3d'}}>{confirmations["Can't make it"]}</strong></div>
          </div>
          <button type="button" className="ghost" style={{width:'100%',marginTop:10}} onClick={()=>onAsk?.('Who still needs to confirm this week?')}>Ask Betty who still needs confirmation</button>
        </div>

        <div style={{...reportCard,marginTop:14}}>
          <div className="section-title" style={{margin:'0 0 12px'}}><h3>Changes this week</h3></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <div style={{padding:12,borderRadius:12,background:'#fff5f3'}}><div style={smallLabel}>Cancelled</div><strong style={{fontSize:20,color:'#983f36'}}>{cancelledCount}</strong></div>
            <div style={{padding:12,borderRadius:12,background:'#fff5f3'}}><div style={smallLabel}>No-shows</div><strong style={{fontSize:20,color:'#983f36'}}>{noShowCount}</strong></div>
          </div>
        </div>

        <div style={{...reportCard,marginTop:14}}>
          <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'flex-start',marginBottom:10}}>
            <div><div className="section-title" style={{margin:0}}><h3>Needs rebooking</h3></div><div style={{fontSize:11,color:'#7b828e',marginTop:3}}>Due or overdue with no active future appointment</div></div>
            <div style={{fontSize:22,fontWeight:900,color:'#172038'}}>{rebooking.length}</div>
          </div>
          {rebooking.slice(0,5).map(client=><button key={client.key} type="button" onClick={()=>onRebook?.(client)} style={{width:'100%',display:'grid',gridTemplateColumns:'1fr auto',gap:10,alignItems:'center',textAlign:'left',padding:'11px 0',border:'0',borderTop:'1px solid #eceef1',background:'transparent',color:'#172038'}}>
            <div><strong style={{fontSize:13}}>{client.owner}</strong><div style={{fontSize:11,color:client.due.status==='Overdue'?'#a83d3d':'#7b828e',marginTop:2}}>{client.due.detail}</div></div>
            <span style={{fontSize:11,fontWeight:900,color:'#26345e'}}>Rebook ›</span>
          </button>)}
          {!rebooking.length && <div className="prototype-note">No due or overdue clients currently need rebooking.</div>}
          {rebooking.length>5 && <button type="button" className="ghost" style={{width:'100%',marginTop:10}} onClick={()=>onAsk?.("Who hasn't been booked back yet?")}>View all with Ask Betty</button>}
        </div>

        {showPushSetup && <OwnerPushNotifications session={session}/>}

        <div className="menu-list" style={{marginTop:16}}>
          <button><Settings size={19}/><span>Scheduling settings</span><ChevronRight size={17}/></button>
          <button><Route size={19}/><span>Route settings</span><ChevronRight size={17}/></button>
          <button type="button" onClick={()=>onAsk?.('Show me this week\'s business summary')}><WalletCards size={19}/><span>Ask Betty about the week</span><ChevronRight size={17}/></button>
          <button type="button" onClick={async()=>{ await supabase?.auth?.signOut?.() }}><LogOut size={19}/><span>Sign out</span><ChevronRight size={17}/></button>
        </div>
      </>}
    </section>
  )
}

function base64UrlToUint8Array(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g,'+').replace(/_/g,'/')
  const raw = window.atob(base64)
  return Uint8Array.from([...raw].map(char=>char.charCodeAt(0)))
}

function OwnerPushNotifications({session}) {
  const [state,setState] = useState({loading:true,enabled:false,message:''})
  const publicKey = String(import.meta.env.VITE_VAPID_PUBLIC_KEY || '').trim()
  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  const isIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)
  const standalone = typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator?.standalone === true)

  useEffect(()=>{
    let cancelled=false
    const check=async()=>{
      if(!supported){ if(!cancelled)setState({loading:false,enabled:false,message:'Push notifications are not supported on this device.'}); return }
      try{
        const registration = await navigator.serviceWorker.getRegistration('/push-sw.js') || await navigator.serviceWorker.getRegistration()
        const subscription = await registration?.pushManager?.getSubscription?.()
        const browserEnabled = Boolean(subscription && Notification.permission==='granted')
        if(!browserEnabled){
          if(!cancelled) setState({loading:false,enabled:false,message:''})
          return
        }
        if(!session?.access_token){
          if(!cancelled) setState({loading:false,enabled:false,message:'Sign in again before enabling notifications.'})
          return
        }

        // A browser can still hold a valid push subscription even if an earlier
        // server save failed. Re-sync it on load so ON means the phone is actually
        // registered in Supabase, not merely that iOS granted permission.
        const response=await fetch('/api/push-subscribe',{
          method:'POST',
          headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`},
          body:JSON.stringify({subscription:subscription.toJSON()})
        })
        const payload=await response.json().catch(()=>({}))
        if(!response.ok) throw new Error(payload?.error || 'Could not sync this phone for notifications.')
        if(!cancelled) setState({loading:false,enabled:true,message:'Finish notifications are enabled on this phone.'})
      }catch(error){
        if(!cancelled) setState({loading:false,enabled:false,message:error?.message || 'Could not sync this phone for notifications.'})
      }
    }
    check()
    return()=>{cancelled=true}
  },[supported,session?.access_token])

  const enable=async()=>{
    if(state.loading || state.enabled) return
    if(!supported){setState({loading:false,enabled:false,message:'Push notifications are not supported on this device.'});return}
    if(isIOS && !standalone){setState({loading:false,enabled:false,message:'On iPhone, add Grooming Planner to your Home Screen first, open it from the new icon, then tap Enable notifications.'});return}
    if(!publicKey){setState({loading:false,enabled:false,message:'VITE_VAPID_PUBLIC_KEY is not configured in Vercel yet.'});return}
    if(!session?.access_token){setState({loading:false,enabled:false,message:'Sign in again before enabling notifications.'});return}
    setState({loading:true,enabled:false,message:''})
    try{
      const registration=await navigator.serviceWorker.register('/push-sw.js')
      const permission=await Notification.requestPermission()
      if(permission!=='granted') throw new Error('Notifications were not allowed on this phone.')
      let subscription=await registration.pushManager.getSubscription()
      if(!subscription){
        subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64UrlToUint8Array(publicKey)})
      }
      const response=await fetch('/api/push-subscribe',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`},
        body:JSON.stringify({subscription:subscription.toJSON()})
      })
      const payload=await response.json().catch(()=>({}))
      if(!response.ok) throw new Error(payload?.error || 'Could not save this phone for notifications.')
      setState({loading:false,enabled:true,message:'Finish notifications are enabled on this phone.'})
    }catch(error){
      setState({loading:false,enabled:false,message:error?.message || 'Could not enable notifications.'})
    }
  }

  return (
    <div style={{background:'#fff',border:'1px solid #e4e7ec',borderRadius:18,padding:16,marginTop:14,boxShadow:'0 8px 24px rgba(23,32,56,.04)'}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start'}}>
        <div>
          <strong style={{display:'block',fontSize:14,color:'#172038'}}>Haley finish notifications</strong>
          <span style={{display:'block',fontSize:11,color:'#7b828e',marginTop:4,lineHeight:1.45}}>Get a phone notification as soon as Haley taps Finished, even when you are not watching the planner.</span>
        </div>
        <span style={{fontSize:10,fontWeight:900,padding:'5px 8px',borderRadius:999,background:state.enabled?'#edf7ef':'#f2f3f5',color:state.enabled?'#267447':'#67707d',whiteSpace:'nowrap'}}>{state.enabled?'ON':'OFF'}</span>
      </div>
      <button type="button" className={state.enabled?'ghost':'save'} disabled={state.loading || state.enabled} onClick={enable} style={{width:'100%',marginTop:12}}>
        {state.loading?'Checking…':state.enabled?'✓ Notifications enabled':'Enable finish notifications'}
      </button>
      {isIOS && !standalone && !state.enabled && <div className="prototype-note" style={{marginTop:10}}>iPhone: Safari → Share → Add to Home Screen. Then open Grooming Planner from the Home Screen icon and come back here.</div>}
      {state.message && <div className={state.enabled?'prototype-note':'login-message'} style={{marginTop:10}}>{state.message}</div>}
    </div>
  )
}

export default More

