import { businessSettings, groomerNames, groomerConfig, firstGroomer, groomerWorksOn, chooseGroomer, calendarWorkDays, getBusinessContext, setBusinessContext, useBusinessContext } from './performance/businessConfig.js';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase.js';
import { AppLauncher } from '@capacitor/app-launcher';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Ellipsis, Home, MapPin, Plus, Route, Sparkles, Users, WalletCards, LogOut } from 'lucide-react';
import { Stat, ApptCard, businessDateKey, mondayForDate, todayAppointments, clockMinutesForDisplay, apiUrl, displayClockTime, compareAppointmentTimes, clientAddressLookup, appointmentAddress, clientConfirmationStatus, needsClientConfirmation, phoneForScheduleRow, googleMapsAddressUrl, dismissFormKeyboard, defaultFirstStopTime, completionBlockReason, scheduleRowDuration , apiFetch } from './performance/shared.jsx'
import { createLazyFeature, DeferredSheet } from './performance/DeferredFeature.jsx'
import LoginScreen from './performance/LoginScreen.jsx'
import {needsBusinessSetup} from './performance/customerAuth.js'
const GroomerWelcome = createLazyFeature(() => import('./performance/GroomerWelcome.jsx'), {sheet:false})
const BusinessWelcome = createLazyFeature(() => import('./performance/BusinessWelcome.jsx'), {sheet:false})
import { usePlannerWeekStart } from './performance/plannerWeek.js'
const Month = createLazyFeature(() => import('./performance/Month.jsx'), { sheet: false })
const Clients = createLazyFeature(() => import('./performance/Clients.jsx'), { sheet: false })
const More = createLazyFeature(() => import('./performance/More.jsx'), { sheet: false })
const AssistantSheet = createLazyFeature(() => import('./performance/AssistantSheet.jsx'), { sheet: true })
const AddAppointmentSheet = createLazyFeature(() => import('./performance/AddAppointmentSheet.jsx'), { sheet: true })
const FillOpeningSheet = createLazyFeature(() => import('./performance/FillOpeningSheet.jsx'), { sheet: true })
const CompletionSheet = createLazyFeature(() => import('./performance/CompletionSheet.jsx'), { sheet: true })

function useRememberScrollPosition(key, waitForSection = false) {
  const lastScrollRef = useRef(0)

  useEffect(() => {
    const storageKey = `grooming-scroll:${key}`
    let timers = []
    let scrollFrame = 0
    let lastStored = null
    // A short loading fallback can temporarily collapse the page to scroll 0.
    // Keep the saved position intact until the deferred page has committed.
    let sectionReady = !waitForSection

    const saveNow = () => {
      if (!sectionReady) return
      const y = window.scrollY || document.documentElement.scrollTop || 0
      if (y < 0) return
      lastScrollRef.current = y
      const next = String(Math.round(y))
      if (next !== lastStored) {
        sessionStorage.setItem(storageKey, next)
        lastStored = next
      }
    }

    const save = () => {
      if (scrollFrame) return
      scrollFrame = window.requestAnimationFrame(() => {
        scrollFrame = 0
        saveNow()
      })
    }

    const restore = () => {
      const saved = Number(sessionStorage.getItem(storageKey) || lastScrollRef.current || 0)
      lastStored = String(Math.round(saved || 0))

      timers.forEach(clearTimeout)
      timers = []

      const doRestore = () => {
        if (saved > 0) window.scrollTo(0, saved)
      }

      doRestore()
      timers.push(setTimeout(doRestore, 80))
      timers.push(setTimeout(doRestore, 300))
      timers.push(setTimeout(doRestore, 800))
    }

    const visibility = () => {
      if (document.visibilityState === 'hidden') saveNow()
      else restore()
    }

    const sectionLoaded = () => {
      sectionReady = true
      restore()
    }

    window.addEventListener('scroll', save, { passive:true })
    window.addEventListener('pagehide', saveNow)
    window.addEventListener('pageshow', restore)
    window.addEventListener('grooming-section-ready', sectionLoaded)
    document.addEventListener('visibilitychange', visibility)

    restore()

    return () => {
      if (scrollFrame) window.cancelAnimationFrame(scrollFrame)
      saveNow()
      timers.forEach(clearTimeout)
      window.removeEventListener('scroll', save)
      window.removeEventListener('pagehide', saveNow)
      window.removeEventListener('pageshow', restore)
      window.removeEventListener('grooming-section-ready', sectionLoaded)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [key, waitForSection])
}

async function openExternalUrl(url) {
  const clean = String(url || '').trim()
  if (!clean) return

  // On iOS, force Google Maps URLs into the installed Google Maps app.
  // `comgooglemapsurl://` accepts an existing google.com/maps URL after
  // replacing the normal http/https scheme.
  const isGoogleMapsUrl = /^https?:\/\/(?:www\.)?google\.[^/]+\/maps\//i.test(clean)
    || /^https?:\/\/maps\.google\.[^/]+\//i.test(clean)
  const nativeGoogleUrl = isGoogleMapsUrl
    ? clean.replace(/^https?:\/\//i,'comgooglemapsurl://')
    : clean

  try {
    const nativeResult = await AppLauncher.openUrl({ url: nativeGoogleUrl })
    if (nativeResult?.completed !== false) return
  } catch {}

  // Fall back to the universal Google Maps URL. AppLauncher can return
  // { completed: false } without throwing, so check the result explicitly.
  try {
    const webResult = await AppLauncher.openUrl({ url: clean })
    if (webResult?.completed !== false) return
  } catch {}

  window.location.href = clean
}

function Today({onOpen,onComplete,onUndo,onConfirmation,onPayment,onAddAppointment,completingId,confirmingId,paymentSavingId,revision,dogs,viewerMode=false}) {
  const business = useBusinessContext()
  const [groomer,setGroomer] = useState('All')
  useEffect(() => { if (groomer !== 'All' && !groomerNames().includes(groomer)) setGroomer('All') }, [business.revision,groomer])
  const [dateKey,setDateKey] = useState(() => businessDateKey())
  const [result,setResult] = useState(null)
  const [loading,setLoading] = useState(true)
  const [error,setError] = useState('')
  const [refresh,setRefresh] = useState(0)

  useEffect(() => {
    const updateDate = () => setDateKey(businessDateKey())
    const timer = window.setInterval(updateDate,30000)
    window.addEventListener('focus',updateDate)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus',updateDate)
    }
  },[])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setResult(null)
    const load = async () => {
      try {
        if (!supabase) throw new Error('Your schedule connection is not configured.')
        const {data,error:loadError} = await supabase
          .from('weekly_drafts')
          .select('week_start,plan_json,status,confirmed_at')
          .eq('week_start',mondayForDate(dateKey))
          .limit(1)
        if (loadError) throw loadError
        if (!cancelled) setResult({dateKey,record:data?.[0] || null})
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not load today’s schedule. Please try again.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  },[dateKey,refresh,revision])

  const current = result?.dateKey === dateKey
  const ready = !loading && !error && current
  const record = current ? result.record : null
  const appointments = useMemo(
    ()=>todayAppointments(record?.plan_json,dateKey,groomer,dogs),
    [record?.plan_json,dateKey,groomer,dogs]
  )
  const total = useMemo(()=>appointments.reduce((sum,appt) => sum + (Number.isFinite(appt.price) ? appt.price : 0),0),[appointments])
  const missingPrices = useMemo(()=>appointments.some(appt => !Number.isFinite(appt.price)),[appointments])
  const completed = useMemo(()=>appointments.filter(appt => appt.completed).length,[appointments])
  const dateLabel = new Date(`${dateKey}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone:businessSettings().timeZone,weekday:'long',month:'short',day:'numeric',year:'numeric'
  })

  return (
    <section>
      <div className="page-head">
        <div><div className="eyebrow">{dateLabel}</div><h1>Today</h1></div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {!viewerMode && <button className="text-btn" type="button" onClick={()=>onAddAppointment?.(dateKey)}>
            <Plus size={15}/> Add appointment
          </button>}
          <button className="text-btn" disabled={loading} onClick={()=>setRefresh(value=>value+1)}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="segmented" aria-label="Filter by groomer">
        {['All',...groomerNames()].map(name=>(
          <button key={name} className={groomer===name?'active':''}
            aria-pressed={groomer===name} onClick={()=>setGroomer(name)}>{name}</button>
        ))}
      </div>

      {(loading || (!current && !error)) && <div className="prototype-note" role="status">Loading today’s appointments…</div>}
      {error && <div className="login-message" role="alert">{error}</div>}
      {ready && !record && (
        <div className="prototype-note">No saved schedule for this week yet. Today will appear here once the week is saved in your planner.</div>
      )}
      {ready && record && (
        <>
          <div className="eyebrow" style={{margin:'16px 0 12px'}}>
            {record.status === 'confirmed' ? 'Confirmed week' : 'Draft week'} · {groomer === 'All' ? 'All groomers' : groomer}
          </div>
          <div className="stats-row">
            <Stat label="Stops" value={appointments.length}/>
            <Stat label="Scheduled total" value={new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(total)}/>
            <Stat label="Completed" value={`${completed}/${appointments.length}`}/>
          </div>
          {missingPrices && <div className="prototype-note">Some appointments have no price saved; the total includes known prices only.</div>}
          <GoogleRoutePanel appointments={appointments} dogs={dogs} selectedGroomer={groomer} dateLabel={dateLabel} dateKey={dateKey} viewerMode={viewerMode}/>
          <div className="section-title"><h3>Appointments</h3></div>
          {appointments.length ? (
            <div className="appt-list">{appointments.map(appt=><ApptCard key={appt.id} appt={appt} dogs={dogs} onOpen={(mode)=>onOpen({...appt,_initialMode:mode || 'edit'})} onComplete={onComplete} onUndo={onUndo} onConfirmation={onConfirmation} onPayment={onPayment} completing={completingId===appt.id} confirmationSaving={confirmingId===appt.id} paymentSaving={paymentSavingId===appt.id} viewerMode={viewerMode}/>)}</div>
          ) : (
            <div className="prototype-note">No appointments scheduled today{groomer === 'All' ? '' : ` for ${groomer}`}.</div>
          )}
          <div className="prototype-note">Cancelled appointments and appointments moved to another week are excluded.</div>
        </>
      )}
    </section>
  )
}

function displayClockFromMinutes(totalMinutes) {
  if (!Number.isFinite(totalMinutes)) return ''
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440
  const hours24 = Math.floor(normalized / 60)
  const mins = normalized % 60
  const period = hours24 >= 12 ? 'PM' : 'AM'
  const hours12 = hours24 % 12 || 12
  return `${hours12}:${String(mins).padStart(2,'0')} ${period}`
}

function appointmentWindowText(value) {
  const minutes = clockMinutesForDisplay(String(value || ''))
  if (!Number.isFinite(minutes)) return ''
  const fmt = total => {
    const normalized = ((Math.round(total) % 1440) + 1440) % 1440
    const hours24 = Math.floor(normalized / 60)
    const mins = normalized % 60
    const period = hours24 >= 12 ? 'PM' : 'AM'
    const hours12 = hours24 % 12 || 12
    return `${hours12}:${String(mins).padStart(2,'0')} ${period}`
  }
  return `${fmt(minutes - 30)}–${fmt(minutes + 30)}`
}

function GoogleRoutePanel({appointments,dogs,selectedGroomer,dateLabel,dateKey,viewerMode=false}) {
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState('')
  const [result,setResult] = useState(null)
  const [updatedAt,setUpdatedAt] = useState(null)
  const [expanded,setExpanded] = useState(false)
  const [mapOpenMessage,setMapOpenMessage] = useState('')
  const [autoReady,setAutoReady] = useState(false)
  const [dayProposal,setDayProposal]=useState(null)
  const [planning,setPlanning]=useState(false)
  const panelRef = useRef(null)

  const sorted = (Array.isArray(appointments) ? appointments : [])
    .filter(appt=>!appt?.inactive)
    .slice()
    .sort(compareAppointmentTimes)

  const groomers = [...new Set(sorted.map(appt=>String(appt?.groomer || appt?.sourceRow?.Groomer || '').trim()).filter(Boolean))]
  const mixedGroomers = selectedGroomer === 'All' && groomers.length > 1
  const routeGroomer = selectedGroomer !== 'All' ? selectedGroomer : (groomers.length === 1 ? groomers[0] : '')
  const lookup = clientAddressLookup(dogs)
  const stops = sorted.map((appt,index)=>({
    id:appt.id || `${appt.owner}-${index}`,
    owner:appt.owner || `Stop ${index+1}`,
    address:appointmentAddress(appt,lookup),
    time:String(appt?.time || '').trim(),
    window:appointmentWindowText(appt?.time)
  }))
  const missing = stops.filter(stop=>!stop.address)
  const validGroomer = groomerNames().includes(routeGroomer)
  const canCheck = !mixedGroomers && validGroomer && stops.length >= 1 && missing.length === 0 && !loading
  const signature = stops.map(stop=>`${stop.id}:${stop.address}:${stop.time}`).join('|') + `:${routeGroomer}`

  useEffect(()=>{setDayProposal(null)},[signature,dateKey])
  const planDay=async()=>{
    if(!canCheck || planning)return
    setPlanning(true);setError('');setDayProposal(null)
    try{
      const profile=groomerConfig(routeGroomer)
      const start=routeGroomer.toLowerCase()==='haley'?510:routeGroomer.toLowerCase()==='jen'?540:clockMinutesForDisplay(profile?.startTime || '09:00')
      const end=clockMinutesForDisplay(profile?.endTime || '17:30')
      const inputs=stops.map((stop,index)=>({...stop,fixed:Boolean(String(sorted[index]?.sourceRow?.['Locked Time'] || '').trim()),scheduled:clockMinutesForDisplay(stop.time),duration:scheduleRowDuration(sorted[index]?.sourceRow,60)}))
      if(inputs.some(stop=>stop.fixed && !Number.isFinite(stop.scheduled)))throw new Error('A fixed appointment is missing its time.')
      const response=await apiFetch('/api/google-route',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'plan-day',groomer:routeGroomer,stops:inputs})})
      const payload=await response.json()
      if(!response.ok)throw new Error(payload.error || 'Day planning failed.')
      if(payload.proposalOnly!==true || !Array.isArray(payload.stops))throw new Error('Day planning is not available on the server yet.')
      const ordered=payload.stops.map(stop=>inputs.find(input=>input.id===stop.id))
      if(ordered.length!==inputs.length || ordered.some(stop=>!stop))throw new Error('The route proposal is missing an appointment.')
      const timeline=dayPlanTimeline(ordered,payload.legs,{start,end,buffer:Number(businessSettings().bufferMinutes || 0)})
      setDayProposal({...timeline,totalMinutes:payload.totalMinutes,totalMiles:payload.totalMiles,start})
    }catch(error){setError(error.message)}finally{setPlanning(false)}
  }

  const cacheKey = `${getBusinessContext().businessId}:${getBusinessContext().revision}:grooming-route-v2:${signature}`
  const cacheMs = 15 * 60 * 1000
  const isToday = String(dateKey || '') === businessDateKey()
  const firstLeg = result?.legs?.[0]
  const firstStop = stops?.[0]
  const firstStopMinutes = clockMinutesForDisplay(firstStop?.time)
  const firstDriveMinutes = Number(firstLeg?.minutes || 0)
  const suggestedDeparture = Number.isFinite(firstStopMinutes) && firstDriveMinutes > 0
    ? displayClockFromMinutes(firstStopMinutes - Math.ceil(firstDriveMinutes))
    : ''

  const fallbackMapsUrl = (() => {
    if (!stops.length) return ''
    const addresses = stops.map(stop=>String(stop?.address || '').trim()).filter(Boolean)
    if (!addresses.length) return ''
    const params = new URLSearchParams({
      api:'1',
      travelmode:'driving',
      dir_action:'navigate'
    })
    // The server route is home -> clients -> home. When the native payload omits mapsUrl,
    // still give Google Maps the scheduled client stops; the user can start navigation from
    // their current/home position.
    params.set('destination', addresses[addresses.length - 1])
    if (addresses.length > 1) params.set('waypoints', addresses.slice(0,-1).join('|'))
    return `https://www.google.com/maps/dir/?${params.toString()}`
  })()
  const routeMapsUrl = String(result?.mapsUrl || fallbackMapsUrl || '').trim()

  useEffect(()=>{
    if (autoReady) return
    const node = panelRef.current
    if (!node) return
    if (typeof IntersectionObserver === 'undefined') {
      setAutoReady(true)
      return
    }
    const observer = new IntersectionObserver(entries=>{
      if (entries.some(entry=>entry.isIntersecting)) {
        setAutoReady(true)
        observer.disconnect()
      }
    },{rootMargin:'220px 0px'})
    observer.observe(node)
    return ()=>observer.disconnect()
  },[autoReady])

  const checkTraffic = async ({force=false}={}) => {
    if (mixedGroomers) {
      setError('Choose a groomer above so the app calculates one van route at a time.')
      return
    }
    if (!validGroomer) {
      setError('Choose a groomer so the app knows which home base to use.')
      return
    }
    if (!stops.length) {
      setError('Add at least one scheduled stop to calculate a route.')
      return
    }
    if (missing.length) {
      setError(`Add a street address for ${missing.map(stop=>stop.owner).join(', ')} before checking traffic.`)
      return
    }

    if (!force) {
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null')
        if (cached?.payload && Number(cached?.savedAt) > Date.now() - cacheMs) {
          setResult(cached.payload)
          setUpdatedAt(Number(cached.savedAt))
          setError('')
          return
        }
      } catch {}
    }

    setLoading(true)
    setError('')
    try {
      const response = await apiFetch('/api/google-route',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({stops,groomer:routeGroomer})
      })
      const payload = await response.json().catch(()=>({}))
      if (!response.ok) throw new Error(payload?.error || `Route check failed (${response.status}).`)
      const savedAt = Date.now()
      setResult(payload)
      setUpdatedAt(savedAt)
      try { localStorage.setItem(cacheKey,JSON.stringify({savedAt,payload})) } catch {}
    } catch (err) {
      setError(err?.message || 'Could not check Google traffic right now.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(()=>{
    setResult(null)
    setUpdatedAt(null)
    setError('')
    setExpanded(false)
    if (autoReady && !mixedGroomers && validGroomer && stops.length >= 1 && missing.length === 0) {
      checkTraffic()
    }
    // Route signature captures the stops/times/groomer. Other values are derived from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[signature,autoReady])

  const openRouteInGoogleMaps = async () => {
    const routeUrl = routeMapsUrl
    if (!routeUrl) {
      setMapOpenMessage('No Google Maps route URL was returned.')
      return
    }

    const nativeUrl = routeUrl.replace(/^https?:\/\//i,'comgooglemapsurl://')
    setMapOpenMessage('Checking Google Maps…')

    try {
      const check = await AppLauncher.canOpenUrl({url:'comgooglemapsurl://'})
      if (!check?.value) {
        setMapOpenMessage('iOS is not detecting the Google Maps app.')
        return
      }

      const opened = await AppLauncher.openUrl({url:nativeUrl})
      if (opened?.completed) {
        setMapOpenMessage('')
      } else {
        setMapOpenMessage('iOS detected Google Maps but did not open the route.')
      }
    } catch (err) {
      setMapOpenMessage(`Google Maps launch error: ${err?.message || 'unknown error'}`)
    }
  }

  if (!sorted.length) return null

  return (
    <div ref={panelRef} className="route-card" style={{margin:'8px 0 12px',padding:'11px 12px',border:'1px solid #cedbea',borderRadius:14,background:'#f1f6fb'}}>
      <div style={{display:'flex',gap:8,alignItems:'center',justifyContent:'space-between',flexWrap:'wrap'}}>
        <div>
          <div style={{fontSize:12,fontWeight:800,color:'#17223f',display:'flex',alignItems:'center',gap:6}}><Route size={15}/>Google route</div>
          <div style={{fontSize:11,color:'#7b828e',marginTop:2}}>{dateLabel} · {routeGroomer ? `${routeGroomer} home → clients → ${routeGroomer} home` : 'traffic-aware driving'}</div>
        </div>
        {!mixedGroomers && validGroomer && missing.length === 0 && (
          <button className="day-ai" type="button" onClick={()=>checkTraffic({force:true})} disabled={!canCheck} style={{opacity:canCheck?1:0.6}}>
            <Route size={14}/>{loading?'Updating…':'Refresh'}
          </button>
        )}
      </div>

      {mixedGroomers && <div style={{fontSize:11,color:'#7b828e',marginTop:8}}>Choose a groomer above to calculate one route at a time.</div>}
      {!mixedGroomers && !validGroomer && <div style={{fontSize:11,color:'#7b828e',marginTop:8}}>Choose a groomer so the correct home base is used.</div>}
      {!mixedGroomers && validGroomer && missing.length > 0 && <div style={{fontSize:11,color:'#9a5d19',marginTop:8}}>Missing address: {missing.map(stop=>stop.owner).join(', ')}</div>}
      {error && <div className="login-message" role="alert" style={{marginTop:8}}>{error}</div>}

      {result && (
        <div style={{marginTop:9}}>
          <div style={{fontSize:13,fontWeight:800,color:'#17223f'}}>
            {Math.round(Number(result.totalMinutes || 0))} min · {Number(result.totalMiles || 0).toFixed(1)} mi round trip
          </div>

          {suggestedDeparture && firstStop && (
            <div style={{marginTop:8,padding:'9px 10px',border:'1px solid #e3e5e9',borderRadius:10,background:'#fff'}}>
              <div style={{fontSize:12,fontWeight:800,color:'#17223f'}}>
                Leave {routeGroomer} home around {suggestedDeparture}
              </div>
              <div style={{fontSize:10.5,color:'#6b7280',marginTop:2}}>
                {Math.ceil(firstDriveMinutes)} min to {firstStop.owner} · first appointment {displayClockTime(firstStop.time)}
              </div>
              {!isToday && (
                <div style={{fontSize:10,color:'#8a8f99',marginTop:3}}>
                  Planning estimate · refresh on the appointment day for live traffic.
                </div>
              )}
            </div>
          )}

          <div style={{marginTop:9,display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px 14px',flexWrap:'wrap'}}>
            {!viewerMode && routeMapsUrl && (
              <button
                type="button"
                onClick={openRouteInGoogleMaps}
                style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:11,fontWeight:800,color:'#17223f',textDecoration:'none',whiteSpace:'nowrap',border:'none',background:'transparent',padding:0,cursor:'pointer'}}
              >
                <MapPin size={14}/>Open in Google Maps
              </button>
            )}

            <button
              type="button"
              onClick={()=>setExpanded(value=>!value)}
              style={{border:'none',background:'transparent',padding:0,fontSize:10.5,fontWeight:800,color:'#5d6678',cursor:'pointer',whiteSpace:'nowrap'}}
            >
              {expanded ? 'Hide route details ▴' : 'View route details ▾'}
            </button>
          </div>

          {!viewerMode && <button type="button" className="ghost" disabled={!canCheck || planning} onClick={planDay} style={{marginTop:12}}>{planning?'Planning day…':'Plan my day'}</button>}
          {dayProposal && <div className="ai-result" style={{marginTop:12}}>
            <strong>Suggested day · {routeGroomer}</strong>
            <p>Leave your starting address at {displayClockFromMinutes(dayProposal.departure)}. Estimated return: {displayClockFromMinutes(dayProposal.homeArrival)}.</p>
            <p>Review this proposed order before giving clients a time. Saved appointment times remain below. Finish estimates allow arrival at the end of each window.</p>
            {dayProposal.items.map((stop,index)=><div key={stop.id} style={{padding:'9px 0',borderTop:'1px solid #e6e8ed'}}><strong>{index+1}. {stop.owner}</strong><div>{stop.fixed?'Fixed appointment':'Suggested arrival window'}: {displayClockFromMinutes(stop.windowStart)}{stop.windowEnd>stop.windowStart?`–${displayClockFromMinutes(stop.windowEnd)}`:''}</div><div>{stop.duration} min service · estimated finish {displayClockFromMinutes(stop.finish)}</div></div>)}
            {dayProposal.warnings.map(warning=><p key={warning} role="alert" style={{color:'#a33'}}>{warning}</p>)}
            <button className="ghost" type="button" onClick={()=>setDayProposal(null)}>Dismiss proposal</button>
          </div>}

          {mapOpenMessage && (
            <div className="login-message" role="status" style={{marginTop:8}}>
              {mapOpenMessage}
            </div>
          )}

          {expanded && (
            <div style={{marginTop:8,paddingTop:8,borderTop:'1px solid #eceef1'}}>
              <div style={{fontSize:10,color:'#8a8f99',marginBottom:7}}>
                {updatedAt ? `Updated ${Math.max(0,Math.round((Date.now()-updatedAt)/60000))} min ago` : 'Google route estimate'} · customer times stay unchanged
              </div>
              <div style={{display:'grid',gap:5}}>
                {(result.legs || []).map((leg,index)=>(
                  <div key={`${leg.fromId}-${leg.toId}-${index}`} style={{fontSize:11,color:'#555f70',display:'flex',justifyContent:'space-between',gap:8}}>
                    <span>{leg.fromOwner} → {leg.toOwner}</span>
                    <span style={{whiteSpace:'nowrap',fontWeight:700}}>{Math.round(Number(leg.minutes || 0))} min · {Number(leg.miles || 0).toFixed(1)} mi{Number(leg.trafficDelayMinutes || 0)>=1 ? ` · +${Math.round(Number(leg.trafficDelayMinutes))} traffic` : ''}</span>
                  </div>
                ))}
              </div>
              {stops.some(stop=>stop.window) && (
                <div style={{marginTop:9,paddingTop:8,borderTop:'1px solid #eceef1'}}>
                  <div style={{fontSize:10,fontWeight:800,color:'#7b828e',marginBottom:4}}>ARRIVAL WINDOWS</div>
                  <div style={{display:'grid',gap:3}}>
                    {stops.filter(stop=>stop.window).map(stop=>(
                      <div key={`window-${stop.id}`} style={{fontSize:10,color:'#6b7280'}}>
                        {stop.owner}: {stop.window}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

    </div>
  )
}

function Week({onAsk,onOpen,onComplete,onUndo,onConfirmation,onPayment,onAddAppointment,onFillOpening,completingId,confirmingId,paymentSavingId,revision,dogs,viewerMode=false}) {
  const business = useBusinessContext()
  const [groomer,setGroomer]=useState('All')
  useEffect(() => { if (groomer !== 'All' && !groomerNames().includes(groomer)) setGroomer('All') }, [business.revision,groomer])
  const [weekStart,setWeekStart]=usePlannerWeekStart({dateObject:true})
  const [weekRecord,setWeekRecord]=useState(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [confirmationFilter,setConfirmationFilter]=useState('All')
  const loadedWeekRef=useRef('')
  const dayRefs=useRef({})

  const ymd = (date) => {
    const y = date.getFullYear()
    const m = String(date.getMonth()+1).padStart(2,'0')
    const d = String(date.getDate()).padStart(2,'0')
    return `${y}-${m}-${d}`
  }

  const parseLocalDate = (value) => {
    if (!value) return null
    const match = String(value).slice(0,10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!match) return null
    return new Date(Number(match[1]), Number(match[2])-1, Number(match[3]))
  }

  const addDays = (date, amount) => {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    next.setDate(next.getDate()+amount)
    return next
  }

  const displayDate = (date) =>
    date.toLocaleDateString(undefined,{month:'short',day:'numeric'})

  const displayDay = (date) =>
    date.toLocaleDateString(undefined,{weekday:'short'})

  useEffect(() => {
    let cancelled = false

    const loadWeek = async () => {
      if (!supabase) return
      const requestedWeek=ymd(weekStart)
      // Keep the current week rendered during same-week refreshes (such as
      // confirmation changes) so the page height does not collapse and
      // Safari does not jump the user back to the top.
      if (loadedWeekRef.current !== requestedWeek) setLoading(true)
      setError('')

      const {data,error} = await supabase
        .from('weekly_drafts')
        .select('week_start,plan_json,status,confirmed_at')
        .eq('week_start', requestedWeek)
        .limit(1)

      if (cancelled) return

      if (error) {
        setError(error.message)
        if (loadedWeekRef.current !== requestedWeek) setWeekRecord(null)
      } else {
        setWeekRecord(data?.[0] || null)
        loadedWeekRef.current=requestedWeek
      }

      setLoading(false)
    }

    loadWeek()
    return () => { cancelled = true }
  }, [weekStart,revision])

  const rawRows = useMemo(
    ()=>Array.isArray(weekRecord?.plan_json) ? weekRecord.plan_json : [],
    [weekRecord?.plan_json]
  )

  const appointments = useMemo(()=>rawRows
    .filter(row => String(row?.Owner || '').trim())
    .map((row,index) => {
      const completion = String(row['Completion Status'] || '').trim()
      const apptStatus = String(row['Appointment Status'] || '').trim()
      const locked = String(row['Locked Time'] || '').trim()
      const rawStatus = String(row.Status || '').trim()

      let note = rawStatus
      let statusClass = 'confirmed'

      if (completion === 'Completed') {
        note = 'Completed'
        statusClass = 'confirmed'
      } else if (apptStatus === 'Cancelled') {
        note = 'Cancelled'
        statusClass = 'pending'
      } else if (apptStatus === 'Moved to another week') {
        note = row['Rescheduled To']
          ? `Moved to ${row['Rescheduled To']}`
          : 'Moved to another week'
        statusClass = 'pending'
      } else {
        note = 'Scheduled'
        statusClass = 'confirmed'
        if (locked) {
          note = 'Scheduled · Fixed time'
          statusClass = 'locked'
        }
      }

      if (row['Route Review Needed']) note = [note,'Review route'].filter(Boolean).join(' · ')

      const driveRaw =
        row['Drive From Previous Min'] ??
        row['Drive Minutes'] ??
        row['Drive From Previous Minutes']

      return {
        id: `${row['Household ID'] || row.Owner}-${row.Date || index}-${index}`,
        sourceRow:row,
        weekStart:ymd(weekStart),
        date: String(row.Date || '').slice(0,10),
        day: row.Day || '',
        groomer: String(row.Groomer || '').trim(),
        time: String(row['Start Time'] || locked || '').trim(),
        endTime: String(row['End Time'] || '').trim(),
        owner: String(row.Owner || '').trim(),
        dogs: String(row.Dogs || '').trim(),
        phone: phoneForScheduleRow(dogs,row),
        area: String(row['Area Cluster'] || row.Area || '').trim(),
        price: Number(row.Price || 0),
        drive: Number(driveRaw),
        note,
        statusClass,
        inactive:['cancelled','canceled','moved to another week'].includes(apptStatus.toLowerCase()),
        completed:completion.toLowerCase()==='completed'
      }
    }),[rawRows,dogs,weekStart])

  const days = useMemo(()=>calendarWorkDays().map(day=>addDays(weekStart,day===0?6:day-1)),[weekStart])
  const activeWeekAppointments = useMemo(()=>appointments.filter(appt => !appt.inactive),[appointments])
  const groomerAppointments = useMemo(()=>
    groomer === 'All'
      ? activeWeekAppointments
      : activeWeekAppointments.filter(a => a.groomer === groomer),
    [activeWeekAppointments,groomer]
  )
  const confirmationNeededCount = useMemo(()=>groomerAppointments.filter(appt=>!appt.completed && needsClientConfirmation(appt.sourceRow)).length,[groomerAppointments])
  const todayForReminder = parseLocalDate(businessDateKey()) || new Date()
  const tomorrowKey = ymd(addDays(todayForReminder,1))
  const tomorrowReminderCount = useMemo(()=>groomerAppointments.filter(appt=>
    !appt.completed && appt.date===tomorrowKey && ['Unconfirmed','Needs reply'].includes(clientConfirmationStatus(appt.sourceRow))
  ).length,[groomerAppointments,tomorrowKey])
  const visibleAppointments = useMemo(()=>confirmationFilter === 'Needs confirmation'
    ? groomerAppointments.filter(appt=>!appt.completed && needsClientConfirmation(appt.sourceRow))
    : confirmationFilter === 'Tomorrow reminders'
      ? groomerAppointments.filter(appt=>!appt.completed && appt.date===tomorrowKey && ['Unconfirmed','Needs reply'].includes(clientConfirmationStatus(appt.sourceRow)))
      : groomerAppointments,[confirmationFilter,groomerAppointments,tomorrowKey])

  const statusLabel = weekRecord?.status === 'confirmed' ? 'Confirmed week' : 'Draft week'
  const weekEnd = addDays(weekStart,4)
  const weeklyRevenue = groomerAppointments.reduce((sum,appt)=>sum+(Number.isFinite(appt.price)?appt.price:0),0)
  const weeklyCompleted = groomerAppointments.filter(appt=>appt.completed).length
  const weeklyMissingPrices = groomerAppointments.some(appt=>!Number.isFinite(appt.price))
  const todayKey = businessDateKey()
  const jumpToDay = (dateKey) => {
    const target = dayRefs.current[dateKey]
    if (!target) return
    target.scrollIntoView({behavior:'smooth',block:'start'})
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            {displayDate(weekStart)} – {displayDate(weekEnd)} · {weekRecord ? statusLabel : 'No saved week'}
          </div>
          <h1>Week</h1>
        </div>

        <div className="month-arrows">
          <button className="icon-btn" onClick={()=>setWeekStart(addDays(weekStart,-7))}>
            <ChevronLeft size={18}/>
          </button>
          <button className="icon-btn" onClick={()=>setWeekStart(addDays(weekStart,7))}>
            <ChevronRight size={18}/>
          </button>
        </div>
      </div>

      <div className="segmented">
        {['All',...groomerNames()].map(x=>(
          <button
            key={x}
            className={`${groomer===x?'active ':''}${x==='Jen'?'seg-jen':x==='Haley'?'seg-haley':'seg-all'}`}
            onClick={()=>setGroomer(x)}
          >
            {x}
          </button>
        ))}
      </div>

      {!loading && !error && weekRecord && (
        <>
          <div className="eyebrow" style={{margin:'16px 0 12px'}}>
            {statusLabel} · {groomer === 'All' ? 'All groomers' : groomer}
          </div>
          <div className="stats-row">
            <Stat label="Stops" value={groomerAppointments.length}/>
            <Stat label="Week total" value={new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(weeklyRevenue)}/>
            <Stat label="Completed" value={`${weeklyCompleted}/${groomerAppointments.length}`}/>
          </div>
          <div className="confirmation-filter">
            <button type="button" className={confirmationFilter==='All'?'active':''} onClick={()=>setConfirmationFilter('All')}>All appointments</button>
            <button type="button" className={confirmationFilter==='Needs confirmation'?'active attention':''} onClick={()=>setConfirmationFilter('Needs confirmation')}>
              Needs confirmation{confirmationNeededCount ? ` (${confirmationNeededCount})` : ''}
            </button>
            <button type="button" className={confirmationFilter==='Tomorrow reminders'?'active attention':''} onClick={()=>setConfirmationFilter('Tomorrow reminders')}>
              Tomorrow reminders{tomorrowReminderCount ? ` (${tomorrowReminderCount})` : ''}
            </button>
          </div>
          <div className="week-day-jump" aria-label="Jump to a day">
            {days.map(dayDate => {
              const dateKey = ymd(dayDate)
              const dayRows = groomerAppointments.filter(appt=>appt.date===dateKey)
              const done = dayRows.filter(appt=>appt.completed).length
              return (
                <button
                  key={dateKey}
                  type="button"
                  className={dateKey===todayKey?'today':''}
                  onClick={()=>jumpToDay(dateKey)}
                >
                  <span>{displayDay(dayDate)} {dayDate.getDate()}</span>
                  <small>{dayRows.length ? `${done}/${dayRows.length} done` : 'No stops'}</small>
                </button>
              )
            })}
          </div>
          {weeklyMissingPrices && <div className="prototype-note">Some appointments have no price saved; the week total includes known prices only.</div>}
        </>
      )}

      {loading && <div className="prototype-note">Loading your saved week…</div>}
      {error && <div className="login-message">{error}</div>}

      {!loading && !error && !weekRecord && (
        <div className="prototype-note">
          No saved weekly draft exists for this week yet.
        </div>
      )}

      {!loading && !error && weekRecord && days.map(dayDate => {
        const dateKey = ymd(dayDate)
        const dayAppointments = visibleAppointments.filter(a => a.date === dateKey)
        const activeAppointments = dayAppointments.filter(appt=>!appt.inactive)
        const revenue = activeAppointments.reduce((sum,a)=>sum+(Number.isFinite(a.price)?a.price:0),0)

        return (
          <div className="day-block" key={dateKey} ref={node=>{ if (node) dayRefs.current[dateKey]=node }}>
            <div className="day-head">
              <div>
                <strong>{displayDay(dayDate)}</strong>
                <span>{dayDate.getDate()}</span>
              </div>

              {!viewerMode && <div className="day-actions" style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}}>
                <button className="day-ai" type="button" onClick={()=>onAddAppointment?.(dateKey,groomer)}>
                  <Plus size={14}/>Add appointment
                </button>
                <button
                  className="day-ai"
                  type="button"
                  onClick={()=>onFillOpening?.({
                    date:dateKey,
                    groomer,
                    appointments:activeWeekAppointments.filter(appt=>appt.date===dateKey)
                  })}
                >
                  <Sparkles size={14}/>Fill opening
                </button>
              </div>}
            </div>

            {dayAppointments.length > 0 ? (
              <>
                <div style={{fontSize:11,color:'#8a8f99',margin:'0 0 8px 2px'}}>
                  {activeAppointments.length} stop{activeAppointments.length===1?'':'s'} · ${Math.round(revenue)}
                </div>
                <GoogleRoutePanel appointments={activeAppointments} dogs={dogs} selectedGroomer={groomer} dateLabel={`${displayDay(dayDate)} ${displayDate(dayDate)}`} dateKey={dateKey} viewerMode={viewerMode}/>
                <div className="appt-list">
                  {dayAppointments
                    .slice()
                    .sort(compareAppointmentTimes)
                    .map(appt=>(
                      <ApptCard key={appt.id} appt={appt} dogs={dogs} onOpen={(mode)=>onOpen({...appt,_initialMode:mode || 'edit'})} onComplete={onComplete} onUndo={onUndo} onConfirmation={onConfirmation} onPayment={onPayment} completing={completingId===appt.id} confirmationSaving={confirmingId===appt.id} paymentSaving={paymentSavingId===appt.id} viewerMode={viewerMode}/>
                    ))}
                </div>
              </>
            ) : (
              <div className="prototype-note" style={{marginTop:8}}>
                No appointments
              </div>
            )}
          </div>
        )
      })}

      {weekRecord && (
        <div className="prototype-note">
          {viewerMode ? 'Viewer mode is read-only. You can open appointments to inspect them, but changes are disabled.' : 'Tap an appointment to edit, change services, cancel, reschedule, or mark a no-show. Cancelled appointments and appointments moved to another week are hidden from the active schedule.'}
        </div>
      )}
    </section>
  )
}

function ensureGroomingWebAppMetadata() {
  if (typeof document === 'undefined') return
  let manifest = document.querySelector('link[rel="manifest"]')
  if (!manifest) {
    manifest = document.createElement('link')
    manifest.rel = 'manifest'
    document.head.appendChild(manifest)
  }
  manifest.href = '/manifest.webmanifest'

  const ensureMeta = (name, content) => {
    let meta = document.querySelector(`meta[name="${name}"]`)
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = name
      document.head.appendChild(meta)
    }
    meta.content = content
  }
  ensureMeta('apple-mobile-web-app-capable','yes')
  ensureMeta('apple-mobile-web-app-title','Hey Betty')
  ensureMeta('theme-color','#17223f')
}

function groomerAppointmentFromRow(row,weekStart) {
  const status=String(row?.['Appointment Status'] || '').trim().toLowerCase()
  const completed=String(row?.['Completion Status'] || '').trim().toLowerCase()==='completed'
  const finished=completed || String(row?.['Groomer Finish Status'] || '').trim().toLowerCase()==='finished'
  const rowIndex=Number(row?._row_index)
  return {
    id:`groomer-${weekStart}-${Number.isFinite(rowIndex)?rowIndex:'x'}-${String(row?.Date || '')}`,
    rowIndex,
    weekStart,
    sourceRow:row,
    date:String(row?.Date || '').slice(0,10),
    groomer:String(row?.Groomer || '').trim(),
    time:String(row?.['Start Time'] || '').trim(),
    owner:String(row?.Owner || '').trim(),
    dogs:String(row?.Dogs || '').trim(),
    services:String(row?.Services || row?.Service || '').trim(),
    area:String(row?.['Area Cluster'] || row?.Area || '').trim(),
    note:String(row?.['Appointment Note'] || row?.Notes || row?.Note || row?.['Client Notes'] || row?.['Status Note'] || '').trim(),
    inactive:['cancelled','canceled','moved to another week'].includes(status),
    completed,
    finished,
    groomerPaymentType:String(row?.['Groomer Payment Type'] || '').trim()
  }
}

function GroomerStopCard({appt,onFinish,finishing}) {
  const address=appointmentAddress(appt,{})
  const today=businessDateKey()
  const canFinish=!appt.inactive && !appt.finished && appt.date===today
  const mapsUrl=googleMapsAddressUrl(address)
  const [paymentType,setPaymentType]=useState(appt.groomerPaymentType || '')

  useEffect(()=>{
    setPaymentType(appt.groomerPaymentType || '')
  },[appt.id,appt.groomerPaymentType])

  return (
    <div className={`appt-card groomer-haley ${appt.finished?'completed-card':''}`} style={{cursor:'default'}}>
      <div className="time-pill">{displayClockTime(appt.time)}</div>
      <div className="appt-main">
        <div className="appt-topline"><strong>{appt.owner}</strong><span className={`status-dot ${appt.finished?'confirmed':'locked'}`}/></div>
        <div className="dogs">{appt.dogs}</div>
        <div className="meta">
          {appt.area && <span><MapPin size={14}/>{appt.area}</span>}
          {address && <span><MapPin size={14}/>{address}</span>}
        </div>
        {appt.note && <div style={{fontSize:11,color:'#59616e',marginTop:7,lineHeight:1.45}}><strong>Notes:</strong> {appt.note}</div>}

        {canFinish && (
          <div style={{marginTop:12,padding:10,border:'1px solid #e0e5ec',borderRadius:12,background:'#f8fafc'}}>
            <div style={{fontSize:11,fontWeight:900,color:'#34415f',marginBottom:7}}>Payment received</div>
            <div style={{display:'flex',gap:7,flexWrap:'wrap'}}>
              {['Cash/Check','Electronic'].map(type=>(
                <button
                  key={type}
                  type="button"
                  onClick={()=>setPaymentType(type)}
                  style={{
                    border:`1px solid ${paymentType===type?'#17223f':'#d7dde6'}`,
                    background:paymentType===type?'#17223f':'#fff',
                    color:paymentType===type?'#fff':'#31415f',
                    borderRadius:999,
                    padding:'7px 11px',
                    fontSize:11,
                    fontWeight:850
                  }}
                >
                  {paymentType===type?'✓ ':''}{type}
                </button>
              ))}
            </div>
            {!paymentType && <div style={{fontSize:10.5,color:'#7b828e',marginTop:7}}>Choose Cash/Check or Electronic before marking this stop finished.</div>}
          </div>
        )}

        {appt.finished && appt.groomerPaymentType && (
          <div style={{display:'inline-flex',alignItems:'center',gap:6,marginTop:10,padding:'5px 8px',borderRadius:999,background:'#edf7ef',border:'1px solid #bddcc5',color:'#267447',fontSize:11,fontWeight:850}}>
            <WalletCards size={13}/>Payment: {appt.groomerPaymentType}
          </div>
        )}

        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:10}}>
          {mapsUrl && <button type="button" onClick={()=>openExternalUrl(mapsUrl)} className="day-ai" style={{display:'inline-flex',alignItems:'center',gap:6}}><MapPin size={14}/>Open address</button>}
          {canFinish && <button type="button" className="save" disabled={finishing || !paymentType} onClick={()=>onFinish(appt,paymentType)}>{finishing?'Saving…':'✓ Finished'}</button>}
          {appt.finished && <div style={{fontSize:12,fontWeight:900,color:'#267447',padding:'8px 0'}}>✓ Finished</div>}
        </div>
      </div>
    </div>
  )
}

function GroomerPortal({session,groomer}) {
  const business=useBusinessContext()
  const [tab,setTab]=useState('Today')
  const [weekStart,setWeekStart]=usePlannerWeekStart()
  const [record,setRecord]=useState(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [revision,setRevision]=useState(0)
  const [finishingId,setFinishingId]=useState('')
  const [notice,setNotice]=useState('')
  const dayRefs=useRef({})
  const today=businessDateKey()
  const activeWeek=tab==='Today'?mondayForDate(today):weekStart

  const ymd = (date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2,'0')
    const day = String(date.getDate()).padStart(2,'0')
    return `${year}-${month}-${day}`
  }

  const parseLocalDate = (value) => {
    const [year,month,day] = String(value || '').split('-').map(Number)
    if (!year || !month || !day) return null
    return new Date(year,month - 1,day,12,0,0,0)
  }

  const addDays = (date, amount) => {
    const next = new Date(date)
    next.setDate(next.getDate() + amount)
    return next
  }

  const displayDate = (date) =>
    date.toLocaleDateString(undefined,{month:'short',day:'numeric'})

  const displayDay = (date) =>
    date.toLocaleDateString(undefined,{weekday:'short'})

  useEffect(()=>{
    if(tab==='More') return
    let cancelled=false
    setLoading(true);setError('')
    supabase.rpc('get_groomer_week',{p_week_start:activeWeek}).then(({data,error:loadError})=>{
      if(cancelled) return
      if(loadError){setRecord(null);setError(loadError.message || 'Could not load your route.')}
      else setRecord(data || {week_start:activeWeek,status:null,plan_json:[]})
      setLoading(false)
    })
    return()=>{cancelled=true}
  },[tab,activeWeek,revision])

  const appointments=(Array.isArray(record?.plan_json)?record.plan_json:[])
    .map(row=>groomerAppointmentFromRow(row,activeWeek))
    .filter(appt=>appt.groomer===groomer && !appt.inactive)
    .sort(compareAppointmentTimes)

  const finishStop=async(appt,paymentType)=>{
    if(finishingId || !appt) return
    setFinishingId(appt.id);setNotice('')
    try{
      const row=appt.sourceRow || {}
      const {data,error:finishError}=await supabase.rpc('groomer_finish_stop',{
        p_week_start:appt.weekStart,
        p_row_index:appt.rowIndex,
        p_expected_date:appt.date,
        p_expected_time:String(row['Start Time'] || ''),
        p_payment_type:paymentType
      })
      if(finishError) throw finishError
      if(['finished','already_finished'].includes(data?.status) && data?.event_id){
        const response=await apiFetch('/api/send-groomer-finished',{
          method:'POST',
          headers:{'Content-Type':'application/json','Authorization':`Bearer ${session?.access_token || ''}`},
          body:JSON.stringify({eventId:data.event_id})
        })
        const payload=await response.json().catch(()=>({}))
        if(!response.ok) setNotice(`Finished was saved, but the owner push could not be sent: ${payload?.error || 'notification error'}`)
        else if(payload?.alreadySent) setNotice(`${appt.owner} was already marked finished and the owner notification had already been sent.`)
        else if(Number(payload?.sent || 0) < 1) setNotice(`${appt.owner} is marked finished, but no owner phone is registered for push notifications yet.`)
        else setNotice(`${appt.owner} is marked finished · ${paymentType}. The owner notification was sent.`)
      }else if(data?.status==='already_finished'){
        setNotice(`${appt.owner} was already marked finished.`)
      }else{
        setNotice(`${appt.owner} was marked finished, but the notification event could not be confirmed.`)
      }
      setRevision(value=>value+1)
    }catch(err){
      setNotice(err?.message || 'Could not mark this stop finished.')
    }finally{setFinishingId('')}
  }

  const shiftWeek=amount=>{
    const d=new Date(`${weekStart}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+amount*7);setWeekStart(d.toISOString().slice(0,10))
  }
  const nav=[['Today',Home],['Week',CalendarDays],['More',Ellipsis]]

  let body=null
  if(tab==='More'){
    body=(<section><div className="page-head"><div><div className="eyebrow">{groomer}</div><h1>Groomer mode</h1></div></div><div className="prototype-note">This login only shows your assigned appointments, addresses, dogs/services, notes and route tools. Customer phone numbers and text/call tools are not available.</div><div className="menu-list" style={{marginTop:16}}><button type="button" onClick={async()=>{await supabase?.auth?.signOut?.()}}><LogOut size={19}/><span>Sign out</span><ChevronRight size={17}/></button></div></section>)
  }else if(tab==='Today'){
    const todayAppointments=appointments.filter(appt=>appt.date===today)
    const label=new Date(`${today}T12:00:00Z`).toLocaleDateString('en-US',{timeZone:'UTC',weekday:'long',month:'short',day:'numeric',year:'numeric'})
    body=(<section><div className="page-head"><div><div className="eyebrow">{label}</div><h1>Today</h1></div><button className="text-btn" onClick={()=>setRevision(value=>value+1)}>Refresh</button></div>{loading&&<div className="prototype-note">Loading your appointments…</div>}{error&&<div className="login-message">{error}</div>}{!loading&&!error&&<><div className="stats-row"><Stat label="Stops" value={todayAppointments.length}/><Stat label="Finished" value={`${todayAppointments.filter(a=>a.finished).length}/${todayAppointments.length}`}/></div><GoogleRoutePanel appointments={todayAppointments} dogs={[]} selectedGroomer={groomer} dateLabel={label} dateKey={today} viewerMode={false}/><div className="section-title"><h3>Your appointments</h3></div>{todayAppointments.length?<div className="appt-list">{todayAppointments.map(appt=><GroomerStopCard key={appt.id} appt={appt} onFinish={finishStop} finishing={finishingId===appt.id}/>)}</div>:<div className="prototype-note">No {groomer} appointments scheduled today.</div>}</>}</section>)
  }else{
    const weekEnd=addDays(parseLocalDate(activeWeek) || new Date(`${activeWeek}T12:00:00`),4)
    const weekStartDate=parseLocalDate(activeWeek) || new Date(`${activeWeek}T12:00:00`)
    const weekDays=calendarWorkDays().map(day=>addDays(weekStartDate,day===0?6:day-1))
    const jumpToDay=dateKey=>{
      const target=dayRefs.current[dateKey]
      if(target) target.scrollIntoView({behavior:'smooth',block:'start'})
    }
    body=(<section>
      <div className="page-head"><div><div className="eyebrow">{displayDate(weekStartDate)} – {displayDate(weekEnd)}</div><h1>Week</h1></div><div className="month-arrows"><button className="icon-btn" onClick={()=>shiftWeek(-1)}><ChevronLeft size={18}/></button><button className="icon-btn" onClick={()=>shiftWeek(1)}><ChevronRight size={18}/></button></div></div>
      {loading&&<div className="prototype-note">Loading your week…</div>}
      {error&&<div className="login-message">{error}</div>}
      {!loading&&!error&&<>
        <div className="week-day-jump" aria-label="Jump to a day">
          {weekDays.map(day=>{
            const dateKey=ymd(day)
            const dayAppts=appointments.filter(a=>a.date===dateKey)
            const done=dayAppts.filter(a=>a.finished).length
            return <button key={dateKey} type="button" className={dateKey===today?'today':''} onClick={()=>jumpToDay(dateKey)}><span>{displayDay(day)} {day.getDate()}</span><small>{dayAppts.length?`${done}/${dayAppts.length} done`:'No stops'}</small></button>
          })}
        </div>
        {weekDays.map(day=>{
          const dateKey=ymd(day)
          const dayAppts=appointments.filter(a=>a.date===dateKey)
          return <div className="day-block" key={dateKey} ref={node=>{if(node) dayRefs.current[dateKey]=node}}><div className="day-head"><div><strong>{displayDay(day)}</strong><span>{day.getDate()}</span></div></div>{dayAppts.length?<><div style={{fontSize:11,color:'#8a8f99',margin:'0 0 8px 2px'}}>{dayAppts.length} stop{dayAppts.length===1?'':'s'} · {dayAppts.filter(a=>a.finished).length} finished</div><GoogleRoutePanel appointments={dayAppts} dogs={[]} selectedGroomer={groomer} dateLabel={`${displayDay(day)} ${displayDate(day)}`} dateKey={dateKey} viewerMode={false}/><div className="appt-list">{dayAppts.map(appt=><GroomerStopCard key={appt.id} appt={appt} onFinish={finishStop} finishing={finishingId===appt.id}/>)}</div></>:<div className="prototype-note">No appointments</div>}</div>
        })}
      </>}
    </section>)
  }

  return (
    <div className="app-shell">
      <style>{plannerThemeCss}</style>
      <header className="topbar"><div className="brand-mark">HB</div><div><strong>Hey Betty</strong><span>{groomer} · Groomer mode</span></div></header>
      <main key={business.businessId}>{notice&&<div className="prototype-note" style={{marginBottom:14}}>{notice} <button className="text-btn" onClick={()=>setNotice('')}>Dismiss</button></div>}{body}</main>
      <nav className="bottom-nav">{nav.map(([name,Icon])=><button key={name} className={tab===name?'active':''} onClick={()=>setTab(name)}><Icon size={20}/><span>{name}</span></button>)}</nav>
    </div>
  )
}

const plannerThemeCss = `
  :root{
    --gp-navy:#17223f;
    --gp-page:#f7f4ef;
    --gp-card:#ffffff;
    --gp-line:#e6e1d9;
    --gp-jen:#dfe7f8;
    --gp-jen-line:#8fa5d6;
    --gp-haley:#e2f0e7;
    --gp-haley-line:#85ae95;
    --gp-route:#eef5fb;
    --gp-money:#fbf1dc;
    --gp-money-line:#e8c98d;
    --gp-success:#edf7ef;
    --gp-danger:#fff0ef;
    --gp-warning:#fff7e8;
  }
  body{background:var(--gp-page)!important;}
  .app-shell{background:var(--gp-page)!important;}
  .topbar,.bottom-nav{background:rgba(255,255,255,.97)!important;}
  .day-block{background:#fbfaf8;border:1px solid #eee9e2;border-radius:18px;padding:14px 12px;margin:16px -12px 0;}
  .appt-card{background:var(--gp-card)!important;border-color:#e5e2dc!important;box-shadow:0 5px 14px rgba(23,34,63,.035);position:relative;overflow:hidden;}
  .appt-card.groomer-jen{border-left:5px solid var(--gp-jen-line)!important;}
  .appt-card.groomer-haley{border-left:5px solid var(--gp-haley-line)!important;}
  .appt-card.completed-card{background:var(--gp-success)!important;}
  .route-card{box-shadow:0 5px 14px rgba(83,117,155,.06);}
  .stat{background:#fff!important;border-color:#e5e2dc!important;}
  .stat.money{background:var(--gp-money)!important;border-color:var(--gp-money-line)!important;}
  .stat.completed{background:var(--gp-success)!important;border-color:#b9d8c1!important;}
  .segmented button.active.seg-jen{background:var(--gp-jen)!important;color:var(--gp-navy)!important;box-shadow:inset 0 0 0 1px var(--gp-jen-line);}
  .segmented button.active.seg-haley{background:var(--gp-haley)!important;color:var(--gp-navy)!important;box-shadow:inset 0 0 0 1px var(--gp-haley-line);}
  .segmented button.active.seg-all{background:#fff!important;color:var(--gp-navy)!important;}
  .schedule-check{margin-top:12px;padding:11px 12px;border-radius:12px;font-size:12px;line-height:1.5;border:1px solid #d8e3da;background:#f3f8f4;color:#3d5b45;}
  .schedule-check.warning{background:var(--gp-warning);border-color:#e6c981;color:#76551b;}
  .schedule-check.danger{background:var(--gp-danger);border-color:#e6aaa5;color:#8b342f;}
  .schedule-check-title{font-weight:900;margin-bottom:3px;}
  .sheet .segmented{background:#f1eee9!important;padding:4px!important;gap:3px!important;overflow-x:auto;}
  .sheet .segmented button{white-space:nowrap;min-width:max-content;padding-left:12px!important;padding-right:12px!important;}
  .sheet .segmented button.active{background:#fff!important;color:var(--gp-navy)!important;box-shadow:0 1px 4px rgba(23,34,63,.08);}
  .confirmation-control{display:inline-flex;align-items:center;gap:6px;margin-top:9px;padding:5px 8px;border:1px solid #d9d9d6;border-radius:999px;background:#f7f7f5;color:#687080;position:relative;z-index:6;max-width:190px;}
  .confirmation-control select{appearance:none;-webkit-appearance:none;border:0;background:transparent;color:inherit;font:inherit;font-size:12px;font-weight:850;padding:0 16px 0 0;min-width:0;max-width:145px;outline:none;background-image:linear-gradient(45deg,transparent 50%,currentColor 50%),linear-gradient(135deg,currentColor 50%,transparent 50%);background-position:calc(100% - 7px) 50%,calc(100% - 3px) 50%;background-size:4px 4px,4px 4px;background-repeat:no-repeat;}
  .confirmation-control.confirmed{background:#edf7ef;border-color:#bddcc5;color:#267447;}
  .confirmation-control.reply{background:#fff7e8;border-color:#e6c981;color:#76551b;}
  .confirmation-control.cant{background:#fff0ef;border-color:#e6aaa5;color:#8b342f;}
  .confirmation-control.unconfirmed{background:#f3f5f8;border-color:#d9dfe8;color:#4f5c70;}
  .confirmation-filter{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 2px;}
  .confirmation-filter button{border:1px solid #dfe2e7;background:#fff;color:#5d6572;border-radius:999px;padding:7px 11px;font-size:12px;font-weight:800;}
  .confirmation-filter button.active{background:#17223f;color:#fff;border-color:#17223f;}
  .confirmation-filter button.attention.active{background:#fff7e8;color:#76551b;border-color:#e6c981;}
  .week-day-jump{position:sticky;top:86px;z-index:18;display:grid;grid-template-columns:repeat(auto-fit,minmax(38px,1fr));gap:6px;margin:12px -4px 6px;padding:7px;background:rgba(247,244,239,.96);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid #e6e1d9;border-radius:15px;box-shadow:0 6px 16px rgba(23,34,63,.08);}
  .week-day-jump button{min-width:0;border:1px solid #dfe2e7;background:#fff;color:#455064;border-radius:11px;padding:7px 3px 6px;font:inherit;text-align:center;}
  .week-day-jump button span{display:block;font-size:11px;font-weight:900;white-space:nowrap;}
  .week-day-jump button small{display:block;margin-top:2px;font-size:8.5px;font-weight:800;color:#8a8f99;white-space:nowrap;}
  .week-day-jump button.today{background:#17223f;color:#fff;border-color:#17223f;box-shadow:0 2px 6px rgba(23,34,63,.18);}
  .week-day-jump button.today small{color:#dbe3f2;}
  .day-block{scroll-margin-top:155px;}
  .appt-text-btn{display:inline-flex;align-items:center;gap:5px;margin-top:9px;margin-left:7px;padding:6px 9px;border:1px solid #d7dde6;border-radius:999px;background:#fff;color:#31415f;font-size:12px;font-weight:850;position:relative;z-index:6;}
  .appt-text-btn.reminder{background:#fff7e8;border-color:#e6c981;color:#76551b;}
  .appt-communication-row{display:flex;gap:0;align-items:center;flex-wrap:wrap;position:relative;z-index:6;}
  .quick-text-menu{display:flex;gap:6px;flex-wrap:wrap;width:100%;margin:7px 0 0 7px;padding:8px;border:1px solid #dfe4eb;border-radius:12px;background:#f8fafc;}
  .quick-text-menu button{border:1px solid #d7dde6;background:#fff;color:#31415f;border-radius:999px;padding:7px 10px;font-size:11px;font-weight:850;}
  .quick-text-menu button:disabled{opacity:.45;}
  .sheet-text-menu{margin:0;}
  .late-options{display:flex;gap:6px;flex-wrap:wrap;width:100%;margin:7px 0 0 7px;}
  .late-options button{border:1px solid #d7dde6;background:#fff;color:#31415f;border-radius:999px;padding:6px 9px;font-size:11px;font-weight:850;}
  .sheet-late-options{margin:0;}
  .last-contact{font-size:10px;color:#7b828e;margin-top:5px;}
  .communication-error{font-size:10.5px;color:#9b3a33;margin-top:5px;}
  .client-quick-actions{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 16px;}
  .client-quick-actions button,.communication-actions button{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid #dce1e8;background:#fff;color:#26345e;border-radius:11px;padding:9px 11px;font-size:12px;font-weight:850;}
  .client-quick-actions button:disabled,.communication-actions button:disabled{opacity:.45;}
  .communication-card{display:grid;gap:10px;margin:0 0 16px;padding:12px 13px;border:1px solid #d7e4ef;border-radius:14px;background:#f3f8fc;}
  .communication-card>div:first-child{display:grid;gap:2px;}
  .communication-card strong{font-size:13px;color:#172038;}
  .communication-card span{font-size:11px;color:#657084;}
  .communication-actions{display:flex;gap:7px;flex-wrap:wrap;}
  .rebook-text-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;}
  .rebook-text-row input{min-width:0;border:1px solid #dce1e8;border-radius:11px;padding:9px 10px;background:#fff;color:#172038;font:inherit;font-size:12px;font-weight:750;}
  .rebook-text-row button{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid #dce1e8;background:#fff;color:#26345e;border-radius:11px;padding:9px 11px;font-size:12px;font-weight:850;}
  .rebook-text-row button:disabled{opacity:.45;}
  .communication-preview{font-size:11px;line-height:1.45;color:#657084;background:#fff;border:1px solid #e0e6ed;border-radius:11px;padding:9px 10px;}
  .appointment-payment{margin-top:9px;position:relative;z-index:7;}
  .appt-payment-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid #d8dde5;background:#fff;color:#31415f;border-radius:999px;padding:7px 10px;font-size:12px;font-weight:850;}
  .appt-payment-btn.paid{background:#edf7ef;border-color:#bddcc5;color:#267447;}
  .appt-payment-btn.unpaid{background:#fff7e8;border-color:#e6c981;color:#76551b;}
  .payment-panel{margin-top:8px;padding:12px;border:1px solid #dfe4eb;border-radius:14px;background:#f8fafc;display:grid;gap:10px;max-width:360px;}
  .payment-panel-title{font-size:13px;font-weight:900;color:#17223f;}
  .payment-service-total,.payment-preview{font-size:11px;line-height:1.4;color:#657084;}
  .payment-panel label{display:grid;gap:5px;font-size:11px;font-weight:850;color:#3f495b;}
  .payment-panel select,.payment-panel input{width:100%;box-sizing:border-box;border:1px solid #d7dde6;border-radius:10px;background:#fff;color:#172038;padding:9px 10px;font:inherit;font-size:12px;outline:none;}
  .tip-input-wrap{position:relative;display:flex;align-items:center;}
  .tip-input-wrap>span{position:absolute;left:10px;color:#687080;font-size:12px;font-weight:800;pointer-events:none;}
  .tip-input-wrap input{padding-left:23px;}
  .payment-actions{display:flex;gap:8px;flex-wrap:wrap;}
  .payment-actions button{border-radius:10px;padding:8px 11px;font-size:12px;font-weight:850;}
  .payment-actions button.secondary{border:1px solid #d7dde6;background:#fff;color:#31415f;}
  .payment-actions button:disabled{opacity:.5;}
  .viewer-banner{margin:0 0 14px;padding:10px 12px;border:1px solid #d8dfea;border-radius:13px;background:#f3f6fb;color:#34415f;display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px;font-weight:750;}
  .viewer-banner strong{color:#17223f;}
  .viewer-badge{display:inline-flex;align-items:center;padding:4px 7px;border-radius:999px;background:#e8eef8;color:#30466d;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;}
  .viewer-banner button{border:1px solid #ccd5e3;background:#fff;color:#31415f;border-radius:9px;padding:6px 9px;font-weight:800;font-size:11px;}
  /* Native iPhone/WKWebView: anchor New Client to the viewport so opening the keyboard
     scrolls only the form instead of shifting the whole app around. */
  .new-client-backdrop{
    position:fixed!important;
    inset:0!important;
    overflow:hidden!important;
    overscroll-behavior:none!important;
    align-items:stretch!important;
    justify-content:stretch!important;
  }
  .new-client-sheet{
    position:fixed!important;
    left:0!important;
    right:0!important;
    top:max(env(safe-area-inset-top),8px)!important;
    bottom:0!important;
    width:100%!important;
    max-width:none!important;
    max-height:none!important;
    height:auto!important;
    margin:0!important;
    transform:none!important;
    overflow-x:hidden!important;
    overflow-y:auto!important;
    overscroll-behavior:contain!important;
    -webkit-overflow-scrolling:touch;
    border-radius:22px 22px 0 0!important;
    padding-bottom:max(18px,env(safe-area-inset-bottom))!important;
    box-sizing:border-box!important;
  }
  .new-client-sheet .sheet-title{
    position:sticky;
    top:0;
    z-index:30;
    background:#fff;
    margin-left:-2px;
    margin-right:-2px;
    padding-top:8px;
    padding-bottom:10px;
  }
  .new-client-sheet .sheet-actions{
    position:sticky;
    bottom:calc(-1 * max(18px,env(safe-area-inset-bottom)));
    z-index:30;
    background:#fff;
    padding-top:10px;
    padding-bottom:max(18px,env(safe-area-inset-bottom));
    border-top:1px solid #eee9e2;
  }

  .sheet .dog-entry-form,.sheet .additional-dog-card{grid-template-columns:repeat(2,minmax(0,1fr));min-width:0;}
  .dog-entry-form > *,.additional-dog-card > *{min-width:0;}
  .dog-entry-form label{display:grid;gap:6px;min-width:0;}
  .dog-entry-form input:not([type="checkbox"]),.dog-entry-form select,.dog-entry-form textarea{width:100%;max-width:100%;min-width:0;box-sizing:border-box;}
  .dog-entry-form textarea{min-height:76px;resize:vertical;}
  @media (max-width:480px){
    .sheet .dog-entry-form,.sheet .additional-dog-card{grid-template-columns:minmax(0,1fr);}
  }
  /* Keep rapid taps from zooming the page; scrolling and pinch zoom remain available. */
  html{touch-action:manipulation;}
  button,a,input,select,textarea,[role="button"]{touch-action:manipulation;}
  @media (any-pointer:coarse), (max-width:767px){
    /* iPhone focus zoom is triggered by small form text, including payment fields. */
    body input,body select,body textarea{font-size:16px!important;}
  }
  @media (max-width:560px){
    .day-block{margin-left:-4px;margin-right:-4px;padding-left:8px;padding-right:8px;}
    .stats-row{gap:8px!important;}
    .stat{min-width:0!important;}
  }
`

function OpeningScreen({ ready, onFinished }) {
  const [imageReady, setImageReady] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  const [displayed, setDisplayed] = useState(false)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    // A missing image must never prevent the app from opening.
    const timer = window.setTimeout(() => setImageReady(true), 2500)
    return () => window.clearTimeout(timer)
  }, [])
  useEffect(() => {
    if (!imageReady) return
    const timer = window.setTimeout(() => setDisplayed(true), 2000)
    return () => window.clearTimeout(timer)
  }, [imageReady])
  useEffect(() => {
    if (!ready || !displayed) return
    setLeaving(true)
    const timer = window.setTimeout(onFinished, 220)
    return () => window.clearTimeout(timer)
  }, [ready, displayed, onFinished])

  return (
    <div className="betty-opening" role="status" aria-label="Opening Hey Betty" aria-busy="true">
      <style>{`
        .betty-opening { position:fixed; inset:0; z-index:1000; display:grid; place-items:center; background:#f9f6f0; padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); opacity:${leaving ? 0 : 1}; transition:opacity 220ms ease-out; pointer-events:auto; }
        .betty-opening img { display:block; width:100%; height:100%; min-height:0; max-height:100%; object-fit:contain; }
        @media (prefers-reduced-motion:reduce) { .betty-opening { transition:none; } }
      `}</style>
      {imageFailed
        ? <h1 style={{color:'#17213a'}}>Hey Betty</h1>
        : <img src={`${import.meta.env.BASE_URL}hey-betty-opening.jpg`} alt="Betty the shaggy Irish wolfhound. Hey Betty — Your grooming day, organized." onLoad={() => setImageReady(true)} onError={() => {setImageFailed(true);setDisplayed(true)}}/>}
    </div>
  )
}

class AppRecoveryBoundary extends React.Component {
  state={failed:false,signingOut:false,message:''}
  static getDerivedStateFromError(){return {failed:true}}
  signOut=async()=>{
    this.setState({signingOut:true,message:''})
    try {
      const result=await supabase?.auth.signOut({scope:'local'})
      if(result?.error) throw result.error
      window.location.reload()
    } catch(error){this.setState({signingOut:false,message:'Could not sign out. Please try again.'})}
  }
  render(){
    if(this.state.failed) return <div className="login-shell"><div className="login-card"><div className="login-brand">HB</div><h1>Let’s reopen Hey Betty</h1><p role="alert">This screen could not open. Try again, or sign out to return to the welcome screen.</p><button type="button" className="login-button" onClick={()=>window.location.reload()}>Try again</button><button type="button" className="text-btn" disabled={this.state.signingOut} onClick={this.signOut}>{this.state.signingOut?'Signing out…':'Sign out'}</button>{this.state.message&&<p role="status">{this.state.message}</p>}</div></div>
    return this.props.children
  }
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [opening, setOpening] = useState(true)
  const finishOpening = React.useCallback(() => setOpening(false), [])
  return <AppRecoveryBoundary>
    <div style={{visibility:opening && !ready ? 'hidden' : undefined}} aria-hidden={opening || undefined}>
      <PlannerApp onReady={setReady}/>
    </div>
    {opening && <OpeningScreen ready={ready} onFinished={finishOpening}/>}
  </AppRecoveryBoundary>
}

function PlannerApp({ onReady }) {
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [accessMode,setAccessMode] = useState('editor')
  const [accessReady,setAccessReady] = useState(false)
  const [accessError,setAccessError] = useState('')
  const business = useBusinessContext()
  const [dogs, setDogs] = useState([])
  const [dataLoading, setDataLoading] = useState(false)
  const [dataError, setDataError] = useState('')
  const [tab,setTab]=useState(()=>sessionStorage.getItem('grooming-owner-tab') || 'Today')
  useRememberScrollPosition(`owner:${tab}`, ['Month', 'Clients', 'More'].includes(tab))
  useEffect(()=>{ sessionStorage.setItem('grooming-owner-tab', tab) },[tab])
  const [editing,setEditing]=useState(null)
  const [scheduleRevision,setScheduleRevision]=useState(0)
  const [saveMessage,setSaveMessage]=useState('')
  const [completingId,setCompletingId]=useState('')
  const [confirmingId,setConfirmingId]=useState('')
  const [paymentSavingId,setPaymentSavingId]=useState('')
  const [assistant,setAssistant]=useState(()=>{
    if(typeof window==='undefined') return {open:false,initial:''}
    try {
      const saved=JSON.parse(sessionStorage.getItem('grooming-ask-betty-shell-v1') || 'null')
      return {open:Boolean(saved?.open),initial:''}
    } catch { return {open:false,initial:''} }
  })
  const [clientJump,setClientJump]=useState(null)
  const [addAppointment,setAddAppointment]=useState({open:false,date:businessDateKey(),preset:null})
  const [fillOpening,setFillOpening]=useState({open:false,date:businessDateKey(),groomer:'All',appointments:[]})
  const ask=(initial='')=>setAssistant({open:true,initial})

  useEffect(()=>{
    try { sessionStorage.setItem('grooming-ask-betty-shell-v1',JSON.stringify({open:assistant.open})) } catch {}
  },[assistant.open])
  useEffect(()=>{ ensureGroomingWebAppMetadata() },[])
  const openRebookForClient = client => {
    const assigned=[...new Set((client?.rows || []).map(row=>String(row?.groomer || row?.Groomer || '').trim()).filter(name=>groomerNames(true).includes(name)))]
    const groomer=assigned.length===1?assigned[0]:firstGroomer()
    let date=new Date(`${businessDateKey()}T12:00:00Z`)
    for(let i=0;i<8;i+=1){
      const weekday=date.getUTCDay()
      const allowed=groomerWorksOn(groomer,date.toISOString().slice(0,10))
      if(allowed) break
      date.setUTCDate(date.getUTCDate()+1)
    }
    setAddAppointment({open:true,date:date.toISOString().slice(0,10),preset:{clientKey:client?.key || client?.household || client?.owner,groomer,time:defaultFirstStopTime(groomer),note:'Booked from Client profile'}})
  }
  const setClientConfirmation = async (appt,status) => {
    if (!appt || confirmingId) return
    const allowed = ['Unconfirmed','Confirmed','Needs reply',"Can't make it"]
    if (!allowed.includes(status)) return
    setConfirmingId(appt.id)
    setSaveMessage('')
    try {
      if (!supabase) throw new Error('Your schedule connection is not configured.')
      const {data,error} = await supabase.rpc('set_grooming_confirmation',{
        p_week_start:appt.weekStart,
        p_expected_row:appt.sourceRow || {},
        p_confirmation:status
      })
      if (error) {
        if (error.code==='PGRST202' || error.code==='42883') throw new Error('Client confirmations need the one-time Supabase setup first.')
        throw error
      }
      if (!['updated','unchanged'].includes(data?.status)) throw new Error('The confirmation status could not be saved. Refresh and try again.')
      setSaveMessage(status==="Can't make it" ? `${appt.owner} marked as can't make it. Tap the appointment to reschedule or cancel.` : `${appt.owner}: ${status}.`)
      setScheduleRevision(value=>value+1)
    } catch (err) {
      setSaveMessage(err?.message || 'Could not save the client confirmation status.')
      window.alert(err?.message || 'Could not save the client confirmation status.')
    } finally {
      setConfirmingId('')
    }
  }
  const savePaymentFromSchedule = async (appt,status,method,tip) => {
    if (!appt || paymentSavingId) return false
    dismissFormKeyboard()
    setPaymentSavingId(appt.id)
    setSaveMessage('')
    try {
      if (!supabase) throw new Error('Your schedule connection is not configured.')
      const {data,error} = await supabase.rpc('save_grooming_payment',{
        p_week_start:appt.weekStart,
        p_expected_row:appt.sourceRow || {},
        p_payment_status:status,
        p_payment_method:status==='Paid' ? method : null,
        p_tip:status==='Paid' ? Math.max(0,Number(tip || 0) || 0) : 0
      })
      if (error) {
        if (error.code==='PGRST202' || error.code==='42883') throw new Error('Payment tracking needs its one-time Supabase setup first.')
        throw error
      }
      if (data?.status !== 'saved') throw new Error('The payment could not be confirmed. Refresh and try again.')
      if (status === 'Paid') {
        const tipValue=Number(data?.tip || 0)
        const amount=Number(data?.amount_paid)
        const amountLabel=Number.isFinite(amount) ? ` · $${amount.toFixed(2)} collected` : ''
        setSaveMessage(`${appt.owner}: ${method}${tipValue>0?` · $${tipValue.toFixed(2)} tip`:''}${amountLabel}.`)
      } else {
        setSaveMessage(`${appt.owner} marked unpaid.`)
      }
      setScheduleRevision(value=>value+1)
      return true
    } catch (err) {
      setSaveMessage(err?.message || 'Could not save payment information.')
      return false
    } finally {
      setPaymentSavingId('')
    }
  }

  const completeFromSchedule = async (appt) => {
    if (!appt || completingId) return
    const row = appt.sourceRow || {}
    const today = businessDateKey()
    const blocked = completionBlockReason(row,today)
    if (blocked) { setSaveMessage(blocked); window.alert(blocked); return }
    setCompletingId(appt.id)
    setSaveMessage('')
    try {
      if (!supabase) throw new Error('Your schedule connection is not configured.')
      const completedDate = String(row.Date || today).slice(0,10)
      const {data,error} = await supabase.rpc('complete_grooming_appointment_safe',{
        p_week_start:appt.weekStart,
        p_expected_row:row,
        p_completed_date:completedDate
      })
      if (error) {
        if (error.code==='PGRST202' || error.code==='42883') throw new Error('Complete/Undo has not been enabled yet. Run its one-time Supabase setup first.')
        throw error
      }
      if (!['completed','already_completed'].includes(data?.status)) throw new Error('The completion could not be confirmed. Refresh before trying again.')
      setSaveMessage(data.status==='completed'
        ? `${appt.owner} marked completed. Service history updated for ${data.dogs_updated} dog${data.dogs_updated===1?'':'s'}.`
        : `${appt.owner} was already completed.`)
      setScheduleRevision(value=>value+1)
    } catch (err) {
      setSaveMessage(err.message || 'Could not confirm completion. Refresh before trying again.'); window.alert(err.message || 'Could not confirm completion. Refresh before trying again.')
    } finally {
      setCompletingId('')
    }
  }

  const undoCompleteFromSchedule = async (appt) => {
    if (!appt || completingId) return
    if (!window.confirm(`Undo completion for ${appt.owner}? This will restore the appointment to Scheduled and recalculate the dogs’ last-service dates.`)) return
    const row = appt.sourceRow || {}
    setCompletingId(appt.id)
    setSaveMessage('')
    try {
      if (!supabase) throw new Error('Your schedule connection is not configured.')
      const {data,error} = await supabase.rpc('undo_grooming_appointment_completion',{
        p_week_start:appt.weekStart,
        p_expected_row:row
      })
      if (error) {
        if (error.code==='PGRST202' || error.code==='42883') throw new Error('Undo Complete has not been enabled yet. Run its one-time Supabase setup first.')
        throw error
      }
      if (!['undone','not_completed'].includes(data?.status)) throw new Error('The undo could not be confirmed. Refresh before trying again.')
      setSaveMessage(data.status==='undone' ? `${appt.owner} completion was undone and service history was recalculated.` : `${appt.owner} was not marked completed.`)
      setScheduleRevision(value=>value+1)
    } catch (err) {
      setSaveMessage(err.message || 'Could not undo completion. Refresh before trying again.')
    } finally {
      setCompletingId('')
    }
  }

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true)
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null)
      setAuthReady(true)
    })

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession)
        setAuthReady(true)
      }
    )

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let cancelled=false
    setBusinessContext(null)
    setDogs([])
    setEditing(null)
    setClientJump(null)
    setAddAppointment({open:false,date:businessDateKey(),preset:null})
    setFillOpening({open:false,date:businessDateKey(),groomer:'All',appointments:[]})
    setAssistant({open:false,initial:''})
    setSaveMessage('')
    setAccessError('')
    if (!session || !supabase) { setAccessReady(true); return }
    setAccessReady(false)
    supabase.rpc('get_business_context').then(({data,error})=>{
      if(cancelled) return
      if(error || !data?.businessId || !['owner','editor','viewer','groomer'].includes(data.role)) {
        setAccessError(error?.message || 'Your business could not be opened. Please try signing in again.')
        setAccessMode('unassigned')
      } else {
        setBusinessContext(data)
        setAccessMode(data.role==='groomer' ? `groomer:${data.groomer}` : data.role==='viewer' ? 'viewer' : 'editor')
      }
      setAccessReady(true)
    }).catch(err=>{if(!cancelled){setAccessError(err.message);setAccessReady(true)}})
    return ()=>{cancelled=true}
  },[session?.user?.id])

  const viewerMode = accessMode === 'viewer'
  const groomerMode = accessMode.startsWith('groomer:')
  const groomerName = groomerMode ? accessMode.slice('groomer:'.length) : ''
  const viewerNotice = () => setSaveMessage('Viewer mode is read-only. No client or schedule changes were made.')

  useEffect(() => {
    if (!session || !supabase || !accessReady || !business.businessId || groomerMode) {
      setDogs([])
      return
    }

    let cancelled = false

    const loadDogs = async () => {
      setDataLoading(true)
      setDataError('')

      const { data, error } = await supabase
        .from('dogs')
        .select('*')

      if (cancelled) return

      if (error) {
        setDataError(error.message)
        setDogs([])
      } else {
        setDogs(data || [])
      }

      setDataLoading(false)
    }

    loadDogs()

    return () => {
      cancelled = true
    }
  }, [session?.user?.id,scheduleRevision,groomerMode,accessReady,business.businessId,business.revision])

  useEffect(() => {
    if (authReady && (!session || accessReady)) onReady(true)
  }, [authReady, session, accessReady, onReady])

  if (!authReady || (session && (!accessReady || (!accessError && business.accountId!==session.user.id)))) {
    return <div className="login-shell" role="status" aria-label="Opening Hey Betty" aria-busy="true"/>
  }

  if (!session) {
    return <LoginScreen onSignedIn={setSession} />
  }

  if (accessError) return <div className="login-shell"><div className="login-message" role="alert">{accessError}</div><button onClick={()=>supabase.auth.signOut()}>Sign out and try again</button></div>

  if (business.needsGroomerSetup) return <GroomerWelcome business={business}/>

  if (needsBusinessSetup(business)) return <BusinessWelcome key={business.businessId}/>

  if (groomerMode) {
    return <GroomerPortal session={session} groomer={groomerName}/>
  }

  let body
  if (tab === 'Today') {
    body = <Today dogs={dogs} onOpen={setEditing} onComplete={viewerMode?viewerNotice:completeFromSchedule} onUndo={viewerMode?viewerNotice:undoCompleteFromSchedule} onConfirmation={viewerMode?viewerNotice:setClientConfirmation} onPayment={viewerMode?viewerNotice:savePaymentFromSchedule} onAddAppointment={viewerMode?viewerNotice:date=>setAddAppointment({open:true,date,preset:null})} completingId={completingId} confirmingId={confirmingId} paymentSavingId={paymentSavingId} revision={scheduleRevision} viewerMode={viewerMode}/>
  } else if (tab === 'Week') {
    body = <Week dogs={dogs} onAsk={ask} onOpen={setEditing} onComplete={viewerMode?viewerNotice:completeFromSchedule} onUndo={viewerMode?viewerNotice:undoCompleteFromSchedule} onConfirmation={viewerMode?viewerNotice:setClientConfirmation} onPayment={viewerMode?viewerNotice:savePaymentFromSchedule} onAddAppointment={viewerMode?viewerNotice:(date,selectedGroomer)=>setAddAppointment({open:true,date,preset:groomerNames().includes(selectedGroomer)?{groomer:selectedGroomer}:null})} onFillOpening={viewerMode?viewerNotice:payload=>setFillOpening({open:true,date:payload.date,groomer:payload.groomer,appointments:payload.appointments || []})} completingId={completingId} confirmingId={confirmingId} paymentSavingId={paymentSavingId} revision={scheduleRevision} viewerMode={viewerMode}/>
  } else if (tab === 'Month') {
    body = <Month dogs={dogs} onOpen={setEditing} revision={scheduleRevision}/>
  } else if (tab === 'Clients') {
    body = <Clients userId={session?.user?.id || ''} dogs={dogs} loading={dataLoading} error={dataError} onOpen={setEditing} revision={scheduleRevision} openClient={clientJump} onOpenClientHandled={()=>setClientJump(null)} onRebook={viewerMode?viewerNotice:openRebookForClient} onDataChanged={message=>{ setSaveMessage(message); setScheduleRevision(value=>value+1) }} viewerMode={viewerMode}/>
  } else {
    body = <More dogs={dogs} revision={scheduleRevision} onAsk={ask} onRebook={viewerMode?viewerNotice:openRebookForClient} session={session} showPushSetup={!viewerMode} onSettingsSaved={()=>setScheduleRevision(value=>value+1)}/>
  }

  const nav=[['Today',Home],['Week',CalendarDays],['Month',Clock3],['Clients',Users],['More',Ellipsis]]

  return (
    <div className="app-shell">
      <style>{plannerThemeCss}</style>
      <header className="topbar">
        <div className="brand-mark">HB</div>
        <div><strong>Hey Betty</strong><span>{viewerMode ? 'Viewer demo · read only' : business.settings.businessName}</span></div>
        <button
          type="button"
          className="top-ai"
          onPointerDown={event=>event.stopPropagation()}
          onTouchStart={event=>event.stopPropagation()}
          onClick={event=>{event.preventDefault();event.stopPropagation();ask()}}
          style={{position:'relative',zIndex:80,pointerEvents:'auto',touchAction:'manipulation',WebkitTapHighlightColor:'transparent'}}
        >🐾 Ask Betty</button>
      </header>
      <main key={business.businessId}>
        {viewerMode && <div className="viewer-banner"><div><span className="viewer-badge">Viewer</span> <strong>Read-only demo</strong> · Client phone numbers and street addresses are hidden, and changes are blocked.</div><button type="button" onClick={()=>supabase?.auth?.signOut?.()}>Sign out</button></div>}
        {saveMessage && <div className="prototype-note" role="status" style={{marginBottom:16}}>
          {saveMessage} <button className="text-btn" onClick={()=>setSaveMessage('')}>Dismiss</button>
        </div>}
        {body}
      </main>

      <button
        type="button"
        className="floating-ai"
        aria-label="Ask Betty"
        title="Ask Betty"
        onPointerDown={event=>event.stopPropagation()}
        onTouchStart={event=>event.stopPropagation()}
        onClick={event=>{event.preventDefault();event.stopPropagation();ask()}}
        style={{zIndex:90,pointerEvents:'auto',touchAction:'manipulation',WebkitTapHighlightColor:'transparent',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,lineHeight:1,color:'#fff'}}
      >
        🐾
      </button>

      <nav className="bottom-nav">
        {nav.map(([name,Icon])=>(
          <button key={name} className={tab===name?'active':''} onClick={()=>setTab(name)}>
            <Icon size={20}/><span>{name}</span>
          </button>
        ))}
      </nav>

      {editing && <CompletionSheet appt={editing} dogs={dogs} onConfirmation={viewerMode?viewerNotice:setClientConfirmation} viewerMode={viewerMode} onClose={()=>setEditing(null)} onSaved={message=>{
        setEditing(null)
        setSaveMessage(message)
        setScheduleRevision(value=>value+1)
      }}/>}
      {!viewerMode && <DeferredSheet open={fillOpening.open}><FillOpeningSheet open={fillOpening.open} dateKey={fillOpening.date} preferredGroomer={fillOpening.groomer} dayAppointments={fillOpening.appointments} dogs={dogs} onClose={()=>setFillOpening(current=>({...current,open:false}))} onChoose={preset=>{
        setFillOpening(current=>({...current,open:false}))
        setAddAppointment({open:true,date:preset.date,preset})
      }}/></DeferredSheet> }
      {!viewerMode && <DeferredSheet open={addAppointment.open}><AddAppointmentSheet open={addAppointment.open} dateKey={addAppointment.date} dogs={dogs} preset={addAppointment.preset} onClose={()=>setAddAppointment(current=>({...current,open:false,preset:null}))} onSaved={message=>{
        setAddAppointment(current=>({...current,open:false,preset:null}))
        setSaveMessage(message)
        setScheduleRevision(value=>value+1)
      }}/></DeferredSheet> }
      <DeferredSheet open={assistant.open}><AssistantSheet open={assistant.open} initial={assistant.initial} dogs={dogs} onClose={()=>setAssistant({open:false,initial:''})} onChoose={viewerMode?viewerNotice:preset=>{ setAssistant({open:false,initial:''}); setAddAppointment({open:true,date:preset.date,preset}) }} onClient={client=>{ setAssistant({open:false,initial:''}); setClientJump(client); setTab('Clients') }} onScheduleChanged={message=>{ setSaveMessage(message); setScheduleRevision(value=>value+1) }} viewerMode={viewerMode}/></DeferredSheet>
    </div>
  )
}

function dayPlanTimeline(stops,legs,{start,end,buffer=15}) {
  const firstArrival=stops[0]?.fixed?stops[0].scheduled:start
  const departure=firstArrival-Math.ceil(Number(legs[0]?.minutes || 0))
  let cursor=departure
  const warnings=[]
  const items=stops.map((stop,index)=>{
    const drive=Number(legs[index]?.minutes)
    if(!Number.isFinite(drive))throw new Error('A driving estimate is missing.')
    const earliest=cursor+Math.ceil(drive)
    const arrival=stop.fixed?Math.max(earliest,stop.scheduled):earliest
    if(stop.fixed && earliest>stop.scheduled)warnings.push(`${stop.owner}: the route arrives ${Math.ceil(earliest-stop.scheduled)} minutes after the fixed time.`)
    const windowEnd=stop.fixed || index===0?arrival:arrival+30
    const finish=windowEnd+stop.duration
    cursor=finish+buffer
    return {...stop,arrival,finish,windowStart:stop.fixed?stop.scheduled:arrival,windowEnd:stop.fixed?stop.scheduled:windowEnd}
  })
  const homeArrival=items.length?cursor-buffer+Math.ceil(Number(legs.at(-1)?.minutes || 0)):start
  if(homeArrival>end)warnings.push(`Return home is ${Math.ceil(homeArrival-end)} minutes after the working day ends.`)
  return {items,homeArrival,warnings,departure}
}
