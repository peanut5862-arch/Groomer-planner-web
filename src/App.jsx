import React, { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import {
  CalendarDays, ChevronLeft, ChevronRight, Clock3, Dog, Ellipsis, Home,
  MapPin, Plus, Route, Search, Settings, Sparkles, Users, WalletCards, X,
  CheckCircle2, MessageCircle, WandSparkles, LogOut
} from 'lucide-react'

const demoDays = [
  { day:'Mon', date:29, groomer:'Haley', appointments:[
    { time:'8:30', owner:'Leslie Dunn', dogs:'Gus', area:'The Woodlands', price:120, drive:18, status:'confirmed' },
    { time:'10:30', owner:'Tammy', dogs:'Gus + Jax', area:'Spring', price:165, drive:21, status:'confirmed' },
    { time:'1:15', owner:'Danielle Russell', dogs:'Bella', area:'Spring', price:110, drive:14, status:'confirmed' },
  ]},
  { day:'Tue', date:30, groomer:'Jen', appointments:[
    { time:'8:30', owner:'Amber', dogs:'Oakley + Indy', area:'The Woodlands', price:170, drive:16, status:'confirmed' },
    { time:'11:00', owner:'Nikki', dogs:'Lulu', area:'The Woodlands', price:95, drive:12, status:'pending' },
    { time:'1:00', owner:'Betty', dogs:'Tux', area:'Conroe', price:90, drive:24, status:'confirmed' },
  ]},
  { day:'Wed', date:1, groomer:'Jen', appointments:[
    { time:'8:30', owner:'Leah', dogs:'Beau', area:'Spring', price:120, drive:19, status:'locked' },
    { time:'10:40', owner:'Misty', dogs:'3 dogs', area:'Spring', price:210, drive:13, status:'confirmed' },
  ]},
  { day:'Thu', date:2, groomer:'Haley', appointments:[
    { time:'9:00', owner:'Susan Hensley', dogs:'Peanut', area:'Tomball', price:95, drive:22, status:'confirmed' },
    { time:'11:15', owner:'Sheri Rose', dogs:'Ruby', area:'Tomball', price:105, drive:11, status:'confirmed' },
  ]},
  { day:'Fri', date:3, groomer:'Haley', appointments:[
    { time:'8:30', owner:'Carol Kovacich', dogs:'Charlotte + Summer', area:'Woodforest', price:160, drive:26, status:'confirmed' },
  ]},
]

const fillCandidates = [
  { owner:'Nikki', dogs:'Lulu', area:'The Woodlands', due:'2 days overdue', minutes:90, price:95, drive:9 },
  { owner:'Kristen Neal', dogs:'Max', area:'The Woodlands', due:'Due Friday', minutes:75, price:105, drive:12 },
  { owner:'Diddy', dogs:'Diddy', area:'The Woodlands', due:'Due this week', minutes:90, price:115, drive:14 },
]

function Stat({label,value,subtle}) {
  const tone = /total|revenue|money/i.test(String(label || '')) ? ' money' : /completed/i.test(String(label || '')) ? ' completed' : ''
  return <div className={`stat ${subtle?'subtle':''}${tone}`}><span>{label}</span><strong>{value}</strong></div>
}

function clientConfirmationStatus(row) {
  const raw = String(row?.['Client Confirmation'] || row?.['Confirmation Status'] || '').trim().toLowerCase()
  if (raw === 'confirmed') return 'Confirmed'
  if (raw === 'needs reply' || raw === 'needs response' || raw === 'pending reply') return 'Needs reply'
  if (raw === "can't make it" || raw === 'cant make it' || raw === 'cannot make it') return "Can't make it"
  return 'Unconfirmed'
}

function confirmationTone(status) {
  return status === 'Confirmed' ? 'confirmed' : status === 'Needs reply' ? 'reply' : status === "Can't make it" ? 'cant' : 'unconfirmed'
}

function needsClientConfirmation(row) {
  return clientConfirmationStatus(row) !== 'Confirmed'
}


function normalizedPhone(value) {
  return String(value || '').replace(/[^0-9+]/g,'').trim()
}

function phoneForScheduleRow(dogs,row) {
  const household = String(row?.['Household ID'] || '').trim().toLowerCase()
  const owner = String(row?.Owner || '').trim().toLowerCase()
  const match = (dogs || []).find(dog => {
    const dogHousehold = String(dog?.household_id || dog?.['Household ID'] || '').trim().toLowerCase()
    const dogOwner = String(dog?.owner || dog?.Owner || '').trim().toLowerCase()
    return (household && dogHousehold === household) || (!household && owner && dogOwner === owner)
  })
  return String(match?.phone || match?.Phone || '').trim()
}

function arrivalWindowLabel(time) {
  const minutes = clockMinutesForDisplay(String(time || ''))
  if (!Number.isFinite(minutes)) return ''
  const fmt = total => {
    const wrapped = ((Math.round(total) % 1440) + 1440) % 1440
    const hour24 = Math.floor(wrapped / 60)
    const mins = wrapped % 60
    const period = hour24 >= 12 ? 'PM' : 'AM'
    const hour12 = hour24 % 12 || 12
    return `${hour12}:${String(mins).padStart(2,'0')} ${period}`
  }
  return `${fmt(minutes - 30)}–${fmt(minutes + 30)}`
}

function messageDateLabel(date) {
  const dateKey = String(date || '').slice(0,10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return dateKey
  const d = new Date(`${dateKey}T12:00:00`)
  const weekday = d.toLocaleDateString('en-US',{weekday:'long'})
  const month = d.toLocaleDateString('en-US',{month:'short'})
  const day = d.getDate()
  return `${weekday} ${month}. ${day}`
}

function naturalPetNames(dogs) {
  const cleaned = String(dogs || '')
    .replace(/\s*\([^)]*\)/g,'')
    .replace(/\s*\+\s*/g, ',')
    .split(',')
    .map(name=>name.trim())
    .filter(Boolean)
  const names = [...new Set(cleaned)]
  if (!names.length) return ''
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0,-1).join(', ')}, and ${names[names.length-1]}`
}

function confirmationMessage({owner,dogs,date,time}) {
  const first = String(owner || '').trim().split(/\s+/)[0] || 'there'
  const dateLabel = messageDateLabel(date)
  const windowLabel = arrivalWindowLabel(time)
  const petNames = naturalPetNames(dogs)
  const petText = petNames ? ` for ${petNames}` : ''
  return `Hi ${first}! Just confirming your grooming appointment${petText} on ${dateLabel}.${windowLabel ? ` Would between ${windowLabel} work for you?` : ''}`
}

function reminderMessage({owner,dogs,date,time}) {
  const first = String(owner || '').trim().split(/\s+/)[0] || 'there'
  const dateLabel = messageDateLabel(date)
  const windowLabel = arrivalWindowLabel(time)
  const petNames = naturalPetNames(dogs)
  const petText = petNames ? ` for ${petNames}` : ''
  return `Hi ${first}! Just checking in about your grooming appointment${petText} on ${dateLabel}.${windowLabel ? ` Would between ${windowLabel} still work for you?` : ''} Just let me know when you get a chance!`
}

function runningLateMessage({owner,minutes}) {
  const first = String(owner || '').trim().split(/\s+/)[0] || 'there'
  return `Hi ${first}! Just a heads up, I'm running about ${minutes} minutes behind. I'll see you soon!`
}

function onMyWayMessage({owner,arrivalTime}) {
  const first = String(owner || '').trim().split(/\s+/)[0] || 'there'
  return `Hi ${first}! I'm on my way and should be there around ${arrivalTime}. See you soon!`
}

function imHereMessage({owner}) {
  const first = String(owner || '').trim().split(/\s+/)[0] || 'there'
  return `Hi ${first}! I'm here whenever you're ready 😊`
}

function needAccessMessage({owner}) {
  const first = String(owner || '').trim().split(/\s+/)[0] || 'there'
  return `Hi ${first}! I'm here but I'm having trouble getting in. Can you send me the gate/access info?`
}

function finishedReadyMessage({owner,dogs}) {
  const first = String(owner || '').trim().split(/\s+/)[0] || 'there'
  const petNames = naturalPetNames(dogs)
  const count = String(dogs || '').replace(/\s*\([^)]*\)/g,'').replace(/\s*\+\s*/g, ',').split(',').map(x=>x.trim()).filter(Boolean).length
  if (!petNames) return `Hi ${first}! Your pup is all finished and ready 😊`
  return `Hi ${first}! ${petNames} ${count > 1 ? 'are' : 'is'} all finished and ready 😊`
}

function paymentReminderMessage({owner,total}) {
  const first = String(owner || '').trim().split(/\s+/)[0] || 'there'
  const n = Number(total)
  const amount = Number.isFinite(n)
    ? n.toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:0,maximumFractionDigits:2})
    : '$0'
  return `Hi ${first}! today's grooming total is ${amount}. Thank you!`
}

function backInAreaMessage({date}) {
  const dateLabel = messageDateLabel(date)
  return `No problem! We will be back in the area ${dateLabel}.`
}

function rescheduleMessage({owner,date,time}) {
  const first = String(owner || '').trim().split(/\s+/)[0] || 'there'
  const dateLabel = messageDateLabel(date)
  const windowLabel = arrivalWindowLabel(time)
  return `Hi ${first}! I need to move your grooming appointment. Would ${dateLabel}${windowLabel ? ` between ${windowLabel}` : ''} work for you instead?`
}

function rebookingMessage({owner,date}) {
  const first = String(owner || '').trim().split(/\s+/)[0] || 'there'
  const dateLabel = messageDateLabel(date)
  return `Hi ${first}! We are in your area on ${dateLabel}. Are you ready for grooming again?`
}

function appointmentContactKey(appt) {
  const row = appt?.sourceRow || {}
  const week = String(appt?.weekStart || row?.week_start || '').slice(0,10)
  const household = String(row?.['Household ID'] || row?.household_id || '').trim()
  const owner = String(appt?.owner || row?.Owner || '').trim()
  const date = String(appt?.date || row?.Date || '').slice(0,10)
  const time = String(appt?.time || row?.['Start Time'] || row?.['Locked Time'] || '').trim()
  return `grooming-contact-v1:${week}:${household || owner}:${date}:${time}`
}

function readAppointmentContact(appt) {
  try {
    const raw = localStorage.getItem(appointmentContactKey(appt))
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveAppointmentContact(appt,type) {
  const record = {at:Date.now(),type:String(type || 'Text')}
  try { localStorage.setItem(appointmentContactKey(appt),JSON.stringify(record)) } catch {}
  return record
}

function contactLabel(record) {
  const at = Number(record?.at || 0)
  if (!at) return ''
  const d = new Date(at)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const when = sameDay
    ? d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})
    : d.toLocaleDateString('en-US',{month:'short',day:'numeric'})
  const type = String(record?.type || 'Text').trim() || 'Text'
  return `Last text: ${type} · ${when}`
}

function currentPosition() {
  return new Promise((resolve,reject)=>{
    if (!navigator.geolocation) return reject(new Error('Location is not available on this device.'))
    navigator.geolocation.getCurrentPosition(resolve,()=>reject(new Error('Allow location access to get a live Google ETA.')),{enableHighAccuracy:true,timeout:10000,maximumAge:60000})
  })
}

async function googleEtaToAppointment(appt,dogs) {
  const lookup = clientAddressLookup(dogs || [])
  const address = appointmentAddress(appt,lookup)
  if (!address) throw new Error(`Add a street address for ${appt?.owner || 'this client'} first.`)
  const position = await currentPosition()
  const response = await fetch('/api/google-route',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      mode:'eta',
      origin:{latitude:position.coords.latitude,longitude:position.coords.longitude},
      destination:{address,owner:appt?.owner || 'Client'}
    })
  })
  const payload = await response.json().catch(()=>({}))
  if (!response.ok) throw new Error(payload?.error || `Google ETA failed (${response.status}).`)
  return payload
}

function etaArrivalClock(minutes) {
  const d = new Date(Date.now() + Math.max(0,Number(minutes || 0)) * 60000)
  return d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})
}

function openSms(phone, body='') {
  const clean = normalizedPhone(phone)
  if (!clean) return
  const suffix = body ? `&body=${encodeURIComponent(body)}` : ''
  window.location.href = `sms:${clean}${suffix}`
}

function openCall(phone) {
  const clean = normalizedPhone(phone)
  if (!clean) return
  window.location.href = `tel:${clean}`
}

function ApptCard({appt,dogs,onOpen,onComplete,onUndo,onConfirmation,completing,confirmationSaving,viewerMode=false}) {
  const [showTextMenu,setShowTextMenu] = useState(false)
  const [showLate,setShowLate] = useState(false)
  const [etaLoading,setEtaLoading] = useState(false)
  const [communicationError,setCommunicationError] = useState('')
  const [lastContact,setLastContact] = useState(()=>readAppointmentContact(appt))
  const row = appt?.sourceRow || {}
  const today = businessDateKey()
  const date = String(row.Date || appt?.date || '').slice(0,10)
  const completed = appt?.completed || String(row['Completion Status'] || '').trim().toLowerCase()==='completed'
  const inactive = appt?.inactive || ['cancelled','canceled','moved to another week'].includes(String(row['Appointment Status'] || '').trim().toLowerCase())
  const canComplete = Boolean(onComplete) && !completed && !inactive && /^\d{4}-\d{2}-\d{2}$/.test(date)
  const hasUndoSnapshot = Boolean(row['Completion Snapshot'] && typeof row['Completion Snapshot'] === 'object')
  const canUndo = Boolean(onUndo) && completed && !inactive && hasUndoSnapshot
  const cardGroomer = String(appt?.groomer || row.Groomer || '').trim().toLowerCase()
  const cardClass = ['appt-card',cardGroomer==='jen'?'groomer-jen':'',cardGroomer==='haley'?'groomer-haley':'',completed?'completed-card':''].filter(Boolean).join(' ')
  const clientAddress = appointmentAddress(appt,clientAddressLookup(dogs || []))
  const copyClientAddress = async () => {
    if (!clientAddress) { setCommunicationError('No saved street address for this client.'); return }
    try { await navigator.clipboard.writeText(clientAddress); setCommunicationError('Address copied.') }
    catch { setCommunicationError('Could not copy the address automatically.') }
  }
  useEffect(()=>{ setLastContact(readAppointmentContact(appt)); setCommunicationError('') },[appt?.id,appt?.date,appt?.time])
  const sendAppointmentText = (body,type) => {
    setLastContact(saveAppointmentContact(appt,type))
    setCommunicationError('')
    openSms(appt.phone,body)
  }
  const sendOnMyWay = async () => {
    if (etaLoading) return
    setEtaLoading(true); setCommunicationError('')
    try {
      const eta = await googleEtaToAppointment(appt,dogs)
      const arrivalTime = etaArrivalClock(eta?.etaMinutes)
      sendAppointmentText(onMyWayMessage({owner:appt.owner,arrivalTime}),'On my way')
    } catch (error) {
      setCommunicationError(error?.message || 'Could not get a live Google ETA.')
    } finally { setEtaLoading(false) }
  }
  return (
    <div className={cardClass} style={{cursor:onOpen?'pointer':'default'}} onClick={onOpen} role={onOpen?'button':undefined} tabIndex={onOpen?0:undefined}
      onKeyDown={onOpen ? event=>{ if(event.key==='Enter' || event.key===' '){event.preventDefault();onOpen()} } : undefined}>
      <div className="time-pill">{displayClockTime(appt.time)}</div>
      <div className="appt-main">
        <div className="appt-topline">
          <strong>{appt.owner}</strong>
          <span className={`status-dot ${appt.statusClass || appt.status || 'confirmed'}`} />
        </div>
        <div className="dogs">{appt.dogs}</div>
        <div className="meta">
          {appt.area && <span><MapPin size={14}/>{appt.area}</span>}
          {Number.isFinite(appt.drive) && appt.drive > 0 && (
            <span><Route size={14}/>{Math.round(appt.drive)} min</span>
          )}
          {Number.isFinite(appt.price) && (
            <span><WalletCards size={14}/>${Math.round(appt.price)}</span>
          )}
        </div>
        {appt.note && (
          <div style={{fontSize:11,color:'#7b828e',marginTop:5}}>
            {appt.note}
          </div>
        )}
        {!viewerMode && !inactive && !completed && onConfirmation && (
          <div className={`confirmation-control ${confirmationTone(clientConfirmationStatus(row))}`}
            onPointerDown={event=>event.stopPropagation()} onTouchStart={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()}>
            <MessageCircle size={14}/>
            <select
              aria-label={`Confirmation status for ${appt.owner}`}
              value={clientConfirmationStatus(row)}
              disabled={confirmationSaving}
              onChange={event=>onConfirmation(appt,event.target.value)}
            >
              <option>Unconfirmed</option>
              <option>Confirmed</option>
              <option>Needs reply</option>
              <option>Can't make it</option>
            </select>
          </div>
        )}
        {!viewerMode && !inactive && !completed && appt.phone && (
          <>
            <div className="appt-communication-row" onPointerDown={event=>event.stopPropagation()} onTouchStart={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()}>
              <button type="button" className="appt-text-btn" onClick={()=>{setShowTextMenu(value=>!value);setShowLate(false)}}>
                <MessageCircle size={13}/> Text ▾
              </button>
              {showTextMenu && <div className="quick-text-menu" aria-label="Client text options">
                <button type="button" onClick={()=>{
                  if (clientConfirmationStatus(row)==='Unconfirmed' && onConfirmation) onConfirmation(appt,'Needs reply')
                  sendAppointmentText(confirmationMessage({owner:appt.owner,dogs:appt.dogs,date:appt.date,time:appt.time}),'Confirmation')
                }}>Confirm</button>
                {clientConfirmationStatus(row)!=='Confirmed' && onConfirmation && <button type="button" onClick={()=>{onConfirmation(appt,'Confirmed');setShowTextMenu(false)}}>Mark confirmed ✓</button>}
                <button type="button" onClick={()=>sendAppointmentText(reminderMessage({owner:appt.owner,dogs:appt.dogs,date:appt.date,time:appt.time}),'Reminder')}>Reminder</button>
                {date===today && <button type="button" disabled={etaLoading} onClick={sendOnMyWay}>{etaLoading?'Getting ETA…':'On my way'}</button>}
                <button type="button" onClick={()=>setShowLate(value=>!value)}>Running late</button>
                {date===today && <button type="button" onClick={()=>sendAppointmentText(imHereMessage({owner:appt.owner}),"I'm here")}>I'm here</button>}
                {date===today && <button type="button" onClick={()=>sendAppointmentText(needAccessMessage({owner:appt.owner}),'Need access')}>Need access</button>}
                <button type="button" onClick={()=>sendAppointmentText(finishedReadyMessage({owner:appt.owner,dogs:appt.dogs}),'Finished / ready')}>Finished / ready</button>
                <button type="button" onClick={()=>sendAppointmentText(paymentReminderMessage({owner:appt.owner,total:appt.price}),'Payment')}>Payment total</button>
                <button type="button" onClick={()=>openSms(appt.phone,'')}>Custom text</button>
                <button type="button" onClick={()=>openCall(appt.phone)}>Call</button>
                <button type="button" disabled={!clientAddress} onClick={copyClientAddress}>Copy address</button>
                {onOpen && onConfirmation && <button type="button" onClick={()=>{onConfirmation(appt,"Can't make it");setShowTextMenu(false);onOpen('reschedule')}}>Can't make it…</button>}
                {onOpen && <button type="button" onClick={()=>{setShowTextMenu(false);onOpen('reschedule')}}>Reschedule…</button>}
              </div>}
              {showLate && <div className="late-options" aria-label="Running late options">
                {[10,15,20,30].map(minutes=><button key={minutes} type="button" onClick={()=>{setShowLate(false);sendAppointmentText(runningLateMessage({owner:appt.owner,minutes}),'Running late')}}>{minutes} min</button>)}
              </div>}
            </div>
            {lastContact && <div className="last-contact">{contactLabel(lastContact)}</div>}
            {communicationError && <div className="communication-error">{communicationError}</div>}
          </>
        )}
        {!viewerMode && !inactive && canComplete && (
          <button
            type="button"
            disabled={completing}
            onPointerDown={event=>event.stopPropagation()}
            onTouchStart={event=>event.stopPropagation()}
            onClick={event=>{
              event.preventDefault()
              event.stopPropagation()
              onComplete(appt)
            }}
            style={{
              marginTop:9, padding:'7px 12px', border:'1px solid #17223f', borderRadius:10, background:'#fff', cursor:completing?'default':'pointer',
              fontSize:12, fontWeight:800, color:'#17223f', position:'relative', zIndex:5, WebkitTapHighlightColor:'transparent'
            }}
          >
            {completing ? 'Saving...' : 'Complete'}
          </button>
        )}
        {!viewerMode && !inactive && completed && canUndo && (
          <button
            type="button"
            disabled={completing}
            onPointerDown={event=>event.stopPropagation()}
            onTouchStart={event=>event.stopPropagation()}
            onClick={event=>{
              event.preventDefault()
              event.stopPropagation()
              onUndo(appt)
            }}
            style={{
              marginTop:9, padding:'7px 12px', border:'1px solid #267447', borderRadius:10, background:'#fff', cursor:completing?'default':'pointer',
              fontSize:12, fontWeight:800, color:'#267447', position:'relative', zIndex:5, WebkitTapHighlightColor:'transparent'
            }}
          >
            {completing ? 'Saving...' : '✓ Completed'}
          </button>
        )}
        {!inactive && completed && !canUndo && (
          <div style={{marginTop:9,fontSize:12,fontWeight:800,color:'#267447'}}>✓ Completed</div>
        )}
      </div>
      <div style={{display:'flex',alignItems:'center',gap:8,marginLeft:'auto'}}>
        {onOpen && <ChevronRight size={18} className="chev"/>}
      </div>
    </div>
  )
}

// Use the business date even when the phone is traveling in another time zone.
function businessDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone:'America/Chicago', year:'numeric', month:'2-digit', day:'2-digit'
  }).formatToParts(now)
  const part = type => parts.find(value => value.type === type).value
  return `${part('year')}-${part('month')}-${part('day')}`
}

function mondayForDate(dateKey) {
  const date = new Date(`${dateKey}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
  return date.toISOString().slice(0,10)
}

function todayAppointments(rows, dateKey, groomer, dogs) {
  return (Array.isArray(rows) ? rows : [])
    .filter(row => row && String(row.Owner || '').trim()
      && String(row.Date || '').slice(0,10) === dateKey
      && !['cancelled','canceled','moved to another week'].includes(
        String(row['Appointment Status'] || '').trim().toLowerCase())
      && (groomer === 'All' || String(row.Groomer || '').trim() === groomer))
    .map((row,index) => {
      const completed = String(row['Completion Status'] || '').trim() === 'Completed'
      const locked = String(row['Locked Time'] || '').trim()
      const priceText = String(row.Price ?? '').replace(/[$,]/g,'').trim()
      const price = priceText === '' ? NaN : Number(priceText)
      const rawStatus = String(row.Status || '').trim()
      const scheduleStatus = completed ? 'Completed' : 'Scheduled'
      return {
        id:`${row['Household ID'] || row.Owner}-${index}`,
        sourceRow:row,
        weekStart:mondayForDate(String(row.Date).slice(0,10)),
        owner:String(row.Owner).trim(),
        dogs:String(row.Dogs || '').trim(),
        phone:phoneForScheduleRow(dogs,row),
        date:String(row.Date || '').slice(0,10),
        groomer:String(row.Groomer || '').trim(),
        area:String(row['Area Cluster'] || row.Area || '').trim(),
        time:String(row['Start Time'] || locked || '').trim(),
        price,
        completed,
        statusClass:completed ? 'confirmed' : locked ? 'locked' : 'confirmed',
        note:[String(row.Groomer || '').trim(),
          scheduleStatus,
          locked ? 'Fixed time' : '',row['Route Review Needed'] ? 'Review route' : ''].filter(Boolean).join(' · ')
      }
    })
    .sort(compareAppointmentTimes)
}

function Today({onOpen,onComplete,onUndo,onConfirmation,onAddAppointment,completingId,confirmingId,revision,dogs,viewerMode=false}) {
  const [groomer,setGroomer] = useState('All')
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
  const appointments = todayAppointments(record?.plan_json,dateKey,groomer,dogs)
  const total = appointments.reduce((sum,appt) => sum + (Number.isFinite(appt.price) ? appt.price : 0),0)
  const missingPrices = appointments.some(appt => !Number.isFinite(appt.price))
  const completed = appointments.filter(appt => appt.completed).length
  const dateLabel = new Date(`${dateKey}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone:'America/Chicago',weekday:'long',month:'short',day:'numeric',year:'numeric'
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
        {['All','Jen','Haley'].map(name=>(
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
            {record.status === 'confirmed' ? 'Confirmed week' : 'Draft week'} · {groomer === 'All' ? 'Both groomers' : groomer}
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
            <div className="appt-list">{appointments.map(appt=><ApptCard key={appt.id} appt={appt} dogs={dogs} onOpen={(mode)=>onOpen({...appt,_initialMode:mode || 'edit'})} onComplete={onComplete} onUndo={onUndo} onConfirmation={onConfirmation} completing={completingId===appt.id} confirmationSaving={confirmingId===appt.id} viewerMode={viewerMode}/>)}</div>
          ) : (
            <div className="prototype-note">No appointments scheduled today{groomer === 'All' ? '' : ` for ${groomer}`}.</div>
          )}
          <div className="prototype-note">Cancelled appointments and appointments moved to another week are excluded.</div>
        </>
      )}
    </section>
  )
}

// Display-only sorting: compare clock times, never change saved appointments.
function clockMinutesForDisplay(value) {
  if (typeof value !== 'string') return Number.POSITIVE_INFINITY

  const text = value.trim().toUpperCase().replace(/\./g, '').replace(/\s+/g, ' ')
  const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/)
  if (!match) return Number.POSITIVE_INFINITY

  let hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3] || 0)
  const period = match[4]
  if (minutes > 59 || seconds > 59) return Number.POSITIVE_INFINITY

  if (period) {
    if (hours < 1 || hours > 12) return Number.POSITIVE_INFINITY
    hours = (hours % 12) + (period === 'PM' ? 12 : 0)
  } else if (hours > 23) {
    return Number.POSITIVE_INFINITY
  }

  return hours * 60 + minutes + seconds / 60
}

function displayClockTime(value) {
  const raw = String(value || '').trim()
  const minutes = clockMinutesForDisplay(raw)
  if (!Number.isFinite(minutes)) return raw || '—'
  const wholeMinutes = Math.floor(minutes)
  const hours24 = Math.floor(wholeMinutes / 60) % 24
  const mins = wholeMinutes % 60
  const period = hours24 >= 12 ? 'PM' : 'AM'
  const hours12 = hours24 % 12 || 12
  return `${hours12}:${String(mins).padStart(2,'0')} ${period}`
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

function compareAppointmentTimes(a, b) {
  const first = clockMinutesForDisplay(a?.time)
  const second = clockMinutesForDisplay(b?.time)
  // Equal or missing times retain their saved order. Missing times go last.
  if (first === second) return 0
  return first < second ? -1 : 1
}


function routeValue(row, ...keys) {
  for (const key of keys) {
    const value = row?.[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim()
  }
  return ''
}

function routeKey(value) {
  return String(value || '').trim().toLowerCase()
}

function fullClientAddress(row) {
  const street = routeValue(row,'address','Address')
  const city = routeValue(row,'city','City')
  const state = routeValue(row,'state','State') || 'TX'
  const zip = routeValue(row,'zip','ZIP','Zip')
  if (!street) return ''
  const cityState = [city,state].filter(Boolean).join(', ')
  return [street,cityState,zip].filter(Boolean).join(' ').replace(/\s+/g,' ').trim()
}

function clientAddressLookup(dogs) {
  const lookup = {}
  for (const row of (Array.isArray(dogs) ? dogs : [])) {
    const address = fullClientAddress(row)
    if (!address) continue
    const household = routeValue(row,'household_id','Household ID')
    const owner = routeValue(row,'owner','Owner')
    if (household && !lookup[`h:${routeKey(household)}`]) lookup[`h:${routeKey(household)}`] = address
    if (owner && !lookup[`o:${routeKey(owner)}`]) lookup[`o:${routeKey(owner)}`] = address
  }
  return lookup
}

function appointmentAddress(appt, lookup) {
  const row = appt?.sourceRow || {}
  const direct = fullClientAddress(row)
  if (direct) return direct
  const household = routeValue(row,'Household ID','household_id')
  const owner = appt?.owner || routeValue(row,'Owner','owner')
  return (household && lookup[`h:${routeKey(household)}`]) || (owner && lookup[`o:${routeKey(owner)}`]) || ''
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
  const validGroomer = ['Jen','Haley'].includes(routeGroomer)
  const canCheck = !mixedGroomers && validGroomer && stops.length >= 1 && missing.length === 0 && !loading
  const signature = stops.map(stop=>`${stop.id}:${stop.address}:${stop.time}`).join('|') + `:${routeGroomer}`

  const cacheKey = `grooming-route-v2:${signature}`
  const cacheMs = 15 * 60 * 1000
  const isToday = String(dateKey || '') === businessDateKey()
  const firstLeg = result?.legs?.[0]
  const firstStop = stops?.[0]
  const firstStopMinutes = clockMinutesForDisplay(firstStop?.time)
  const firstDriveMinutes = Number(firstLeg?.minutes || 0)
  const suggestedDeparture = Number.isFinite(firstStopMinutes) && firstDriveMinutes > 0
    ? displayClockFromMinutes(firstStopMinutes - Math.ceil(firstDriveMinutes))
    : ''

  const checkTraffic = async ({force=false}={}) => {
    if (mixedGroomers) {
      setError('Choose Jen or Haley above so the app calculates one van route at a time.')
      return
    }
    if (!validGroomer) {
      setError('Choose Jen or Haley so the app knows which home base to use.')
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
      const response = await fetch('/api/google-route',{
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
    if (!mixedGroomers && validGroomer && stops.length >= 1 && missing.length === 0) {
      checkTraffic()
    }
    // Route signature captures the stops/times/groomer. Other values are derived from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[signature])

  if (!sorted.length) return null

  return (
    <div className="route-card" style={{margin:'8px 0 12px',padding:'11px 12px',border:'1px solid #cedbea',borderRadius:14,background:'#f1f6fb'}}>
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

      {mixedGroomers && <div style={{fontSize:11,color:'#7b828e',marginTop:8}}>Choose Jen or Haley above to calculate one route at a time.</div>}
      {!mixedGroomers && !validGroomer && <div style={{fontSize:11,color:'#7b828e',marginTop:8}}>Choose Jen or Haley so the correct home base is used.</div>}
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
            {!viewerMode && result?.mapsUrl && (
              <a href={result.mapsUrl} target="_blank" rel="noreferrer" style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:11,fontWeight:800,color:'#17223f',textDecoration:'none',whiteSpace:'nowrap'}}>
                <MapPin size={14}/>Open in Google Maps
              </a>
            )}

            <button
              type="button"
              onClick={()=>setExpanded(value=>!value)}
              style={{border:'none',background:'transparent',padding:0,fontSize:10.5,fontWeight:800,color:'#5d6678',cursor:'pointer',whiteSpace:'nowrap'}}
            >
              {expanded ? 'Hide route details ▴' : 'View route details ▾'}
            </button>
          </div>

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

function Week({onAsk,onOpen,onComplete,onUndo,onConfirmation,onAddAppointment,onFillOpening,completingId,confirmingId,revision,dogs,viewerMode=false}) {
  const [groomer,setGroomer]=useState('All')
  const [weekStart,setWeekStart]=useState(() => {
    const now = new Date()
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekday = d.getDay()
    const delta = weekday === 0 ? -6 : 1 - weekday
    d.setDate(d.getDate() + delta)
    return d
  })
  const [weekRecord,setWeekRecord]=useState(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [confirmationFilter,setConfirmationFilter]=useState('All')

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
      setLoading(true)
      setError('')

      const {data,error} = await supabase
        .from('weekly_drafts')
        .select('week_start,plan_json,status,confirmed_at')
        .eq('week_start', ymd(weekStart))
        .limit(1)

      if (cancelled) return

      if (error) {
        setError(error.message)
        setWeekRecord(null)
      } else {
        setWeekRecord(data?.[0] || null)
      }

      setLoading(false)
    }

    loadWeek()
    return () => { cancelled = true }
  }, [weekStart,revision])

  const rawRows = Array.isArray(weekRecord?.plan_json) ? weekRecord.plan_json : []

  const appointments = rawRows
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
    })

  const days = Array.from({length:5},(_,i)=>addDays(weekStart,i))
  const activeWeekAppointments = appointments.filter(appt => !appt.inactive)
  const groomerAppointments =
    groomer === 'All'
      ? activeWeekAppointments
      : activeWeekAppointments.filter(a => a.groomer === groomer)
  const confirmationNeededCount = groomerAppointments.filter(appt=>!appt.completed && needsClientConfirmation(appt.sourceRow)).length
  const todayForReminder = parseLocalDate(businessDateKey()) || new Date()
  const tomorrowKey = ymd(addDays(todayForReminder,1))
  const tomorrowReminderCount = groomerAppointments.filter(appt=>
    !appt.completed && appt.date===tomorrowKey && ['Unconfirmed','Needs reply'].includes(clientConfirmationStatus(appt.sourceRow))
  ).length
  const visibleAppointments = confirmationFilter === 'Needs confirmation'
    ? groomerAppointments.filter(appt=>!appt.completed && needsClientConfirmation(appt.sourceRow))
    : confirmationFilter === 'Tomorrow reminders'
      ? groomerAppointments.filter(appt=>!appt.completed && appt.date===tomorrowKey && ['Unconfirmed','Needs reply'].includes(clientConfirmationStatus(appt.sourceRow)))
      : groomerAppointments

  const statusLabel = weekRecord?.status === 'confirmed' ? 'Confirmed week' : 'Draft week'
  const weekEnd = addDays(weekStart,4)
  const weeklyRevenue = groomerAppointments.reduce((sum,appt)=>sum+(Number.isFinite(appt.price)?appt.price:0),0)
  const weeklyCompleted = groomerAppointments.filter(appt=>appt.completed).length
  const weeklyMissingPrices = groomerAppointments.some(appt=>!Number.isFinite(appt.price))

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
        {['All','Jen','Haley'].map(x=>(
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
            {statusLabel} · {groomer === 'All' ? 'Both groomers' : groomer}
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
          <div className="day-block" key={dateKey}>
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
                      <ApptCard key={appt.id} appt={appt} dogs={dogs} onOpen={(mode)=>onOpen({...appt,_initialMode:mode || 'edit'})} onComplete={onComplete} onUndo={onUndo} onConfirmation={onConfirmation} completing={completingId===appt.id} confirmationSaving={confirmingId===appt.id} viewerMode={viewerMode}/>
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


function serviceDefaultsForDog(row, service) {
  const canonical = canonicalServiceLabel(service)
  const numberValue = (...keys) => {
    for (const key of keys) {
      const raw = row?.[key]
      if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
        const value = Number(String(raw).replace(/[$,]/g,''))
        if (Number.isFinite(value)) return value
      }
    }
    return 0
  }
  if (canonical === 'Bath' || canonical === 'Bath Only') {
    return {
      price:numberValue('bath_price','Bath Price','price','Price'),
      minutes:numberValue('bath_minutes','Bath Minutes','minutes','Minutes')
    }
  }
  if (canonical === 'Partial Groom') {
    return {
      price:numberValue('partial_groom_price','Partial Groom Price','price','Price'),
      minutes:numberValue('partial_groom_minutes','Partial Groom Minutes','minutes','Minutes')
    }
  }
  return {
    price:numberValue('groom_price','Groom Price','price','Price'),
    minutes:numberValue('groom_minutes','Groom Minutes','minutes','Minutes')
  }
}

function defaultFirstStopTime(groomer) {
  return groomer === 'Jen' ? '09:00' : '08:30'
}

function schedulingOverrideReasons(date,groomer,assignedGroomers=[]) {
  const reasons = []
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
    if (groomer === 'Jen' && ![2,3,4].includes(weekday)) reasons.push('Jen normally works Tuesday through Thursday.')
  }
  const assigned = [...new Set((assignedGroomers || []).filter(name=>name==='Jen' || name==='Haley'))]
  if (assigned.length === 1 && groomer && groomer !== assigned[0]) reasons.push(`This household is normally assigned to ${assigned[0]}.`)
  return reasons
}

function AddAppointmentSheet({open,dateKey,dogs,preset,onClose,onSaved}) {
  const [date,setDate] = useState(dateKey || businessDateKey())
  const [clientKey,setClientKey] = useState('')
  const [selectedDogs,setSelectedDogs] = useState({})
  const [groomer,setGroomer] = useState('Jen')
  const [time,setTime] = useState('09:00')
  const [fixed,setFixed] = useState(false)
  const [note,setNote] = useState('')
  const [saving,setSaving] = useState(false)
  const [message,setMessage] = useState('')
  const [manualOverride,setManualOverride] = useState(false)

  const keyOf = row => String(row?.household_id || row?.['Household ID'] || '').trim()
    ? `h:${String(row?.household_id || row?.['Household ID']).trim()}`
    : `o:${String(row?.owner || row?.Owner || '').trim().toLowerCase()}`
  const ownerOf = row => String(row?.owner || row?.Owner || '').trim()
  const dogOf = row => String(row?.dog || row?.Dog || '').trim()
  const areaOf = row => canonicalAreaLabel(row?.area || row?.Area || '')

  const clients = Object.values((dogs || []).reduce((map,row) => {
    const owner = ownerOf(row)
    const dog = dogOf(row)
    if (!owner || !dog) return map
    const key = keyOf(row)
    if (!map[key]) map[key] = {key,owner,household:String(row?.household_id || row?.['Household ID'] || '').trim(),rows:[]}
    map[key].rows.push(row)
    return map
  },{})).sort((a,b)=>a.owner.localeCompare(b.owner))

  const client = clients.find(item=>item.key===clientKey) || null

  useEffect(()=>{
    if (!open) return
    setDate(dateKey || businessDateKey())
    setClientKey(preset?.clientKey || '')
    setSelectedDogs({})
    const initialGroomer = ['Jen','Haley'].includes(preset?.groomer) ? preset.groomer : 'Jen'
    setGroomer(initialGroomer)
    setTime(/^([01]\d|2[0-3]):[0-5]\d$/.test(String(preset?.time || '')) ? preset.time : defaultFirstStopTime(initialGroomer))
    setFixed(Boolean(preset?.fixed))
    setNote(preset?.note || '')
    setMessage('')
    setManualOverride(false)
  },[open,dateKey,preset?.clientKey,preset?.groomer,preset?.time,preset?.fixed,preset?.note])

  useEffect(()=>{ setManualOverride(false) },[date,groomer,clientKey])

  useEffect(()=>{
    if (!client) { setSelectedDogs({}); return }
    const initial = {}
    for (const row of client.rows) {
      const name = dogOf(row)
      let service = canonicalServiceLabel(row?.service_pattern || row?.['Service Pattern'] || '')
      if (service === 'Service Varies' || !appointmentServiceOptions.includes(service)) service = 'Groom'
      initial[name] = {checked:true,service}
    }
    setSelectedDogs(initial)
    const preferred = client.rows.map(row=>String(row?.groomer || row?.Groomer || '').trim()).find(Boolean)
    if (['Jen','Haley'].includes(preset?.groomer)) setGroomer(preset.groomer)
    else if (preferred === 'Jen' || preferred === 'Haley') {
      const previousDefault = defaultFirstStopTime(groomer)
      setGroomer(preferred)
      if (time === previousDefault) setTime(defaultFirstStopTime(preferred))
    }
  },[clientKey,preset?.groomer])

  if (!open) return null

  const chosen = client ? client.rows.filter(row=>selectedDogs[dogOf(row)]?.checked) : []
  const totals = chosen.reduce((acc,row)=>{
    const name = dogOf(row)
    const service = selectedDogs[name]?.service || 'Groom'
    const defaults = serviceDefaultsForDog(row,service)
    acc.price += defaults.price
    acc.minutes += defaults.minutes
    return acc
  },{price:0,minutes:0})

  const assignedGroomers = client ? [...new Set(client.rows.map(row=>String(row?.groomer || row?.Groomer || '').trim()).filter(name=>name==='Jen' || name==='Haley'))] : []
  const overrideReasons = schedulingOverrideReasons(date,groomer,assignedGroomers)

  const save = async () => {
    if (!supabase || saving) return
    if (!client) { setMessage('Choose a client.'); return }
    if (!chosen.length) { setMessage('Choose at least one dog.'); return }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setMessage('Choose an appointment date.'); return }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) { setMessage('Choose a valid appointment time.'); return }
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
    if (![1,2,3,4,5].includes(weekday)) { setMessage('Choose Monday through Friday.'); return }
    if (overrideReasons.length && !manualOverride) { setMessage('Turn on Manual override to schedule outside the normal groomer rules.'); return }
    setSaving(true)
    setMessage('')
    try {
      const dogServices = chosen.map(row=>{
        const name = dogOf(row)
        return `${name} (${selectedDogs[name]?.service || 'Groom'})`
      }).join(', ')
      const area = areaOf(chosen[0]) || areaOf(client.rows[0])
      const {data,error} = await supabase.rpc('add_grooming_appointment',{
        p_date:date,
        p_household_id:client.household || null,
        p_owner:client.owner,
        p_dogs:dogServices,
        p_groomer:groomer,
        p_start_time:time,
        p_fixed:fixed,
        p_price:totals.price,
        p_minutes:Math.max(1,Math.round(totals.minutes || 1)),
        p_area:area || null,
        p_note:String(note || '').trim() || null
      })
      if (error) {
        if (error.code === 'PGRST202' || error.code === '42883') throw new Error('Add Appointment needs its one-time Supabase setup first.')
        throw error
      }
      if (data?.status !== 'added') throw new Error('The appointment could not be confirmed.')
      onSaved?.(`${client.owner} added to ${date} at ${displayClockTime(time)}.`)
    } catch(err) {
      setMessage(err?.message || 'Could not add appointment.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={event=>event.stopPropagation()}>
        <div className="sheet-head">
          <div><div className="eyebrow">New appointment</div><h2>Add appointment</h2></div>
          <button className="icon-btn" type="button" onClick={onClose}><X size={18}/></button>
        </div>

        <div style={{display:'grid',gap:12}}>
          <label className="field-label">Date
            <input type="date" value={date} onChange={event=>setDate(event.target.value)}/>
          </label>

          <label className="field-label">Client
            <select value={clientKey} onChange={event=>setClientKey(event.target.value)}>
              <option value="">Choose client…</option>
              {clients.map(item=><option key={item.key} value={item.key}>{item.owner}</option>)}
            </select>
          </label>

          {client && <div className="prototype-note" style={{margin:0}}>
            <strong>Dogs & services</strong>
            <div style={{display:'grid',gap:10,marginTop:10}}>
              {client.rows.map(row=>{
                const name = dogOf(row)
                const state = selectedDogs[name] || {checked:false,service:'Groom'}
                return <div key={name} style={{display:'grid',gridTemplateColumns:'auto 1fr',gap:10,alignItems:'center'}}>
                  <input type="checkbox" checked={Boolean(state.checked)} onChange={event=>setSelectedDogs(current=>({...current,[name]:{...state,checked:event.target.checked}}))}/>
                  <div style={{display:'grid',gridTemplateColumns:'1fr minmax(130px,1fr)',gap:8,alignItems:'center'}}>
                    <strong>{name}</strong>
                    <select value={state.service} onChange={event=>setSelectedDogs(current=>({...current,[name]:{...state,service:event.target.value}}))}>
                      {appointmentServiceOptions.map(service=><option key={service} value={service}>{service}</option>)}
                    </select>
                  </div>
                </div>
              })}
            </div>
          </div>}

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <label className="field-label">Groomer
              <select value={groomer} onChange={event=>{
                const next = event.target.value
                const previousDefault = defaultFirstStopTime(groomer)
                setGroomer(next)
                if (time === previousDefault) setTime(defaultFirstStopTime(next))
              }}>
                <option>Jen</option><option>Haley</option>
              </select>
            </label>
            <label className="field-label">Start time
              <input type="time" value={time} onChange={event=>setTime(event.target.value)}/>
            </label>
          </div>

          {overrideReasons.length > 0 && <div className="schedule-check warning" style={{margin:0}}>
            <div className="schedule-check-title">Outside normal scheduling rules</div>
            {overrideReasons.map((reason,index)=><div key={index}>• {reason}</div>)}
            <label style={{display:'flex',gap:10,alignItems:'flex-start',marginTop:10,fontWeight:800}}>
              <input type="checkbox" checked={manualOverride} onChange={event=>setManualOverride(event.target.checked)} style={{width:20,height:20,minWidth:20,margin:0}}/>
              <span>Manual override — schedule this appointment anyway</span>
            </label>
          </div>}

          <label style={{display:'flex',gap:9,alignItems:'center',fontSize:13,fontWeight:700}}>
            <input type="checkbox" checked={fixed} onChange={event=>setFixed(event.target.checked)}/>
            Fixed appointment time
          </label>

          <label className="field-label">Appointment note
            <textarea rows="3" value={note} onChange={event=>setNote(event.target.value)} placeholder="Optional note"/>
          </label>

          <div className="prototype-note" style={{margin:0}}>
            <strong>Total:</strong> ${Math.round(totals.price)} · {Math.round(totals.minutes)} min
            {client && <div style={{marginTop:4}}>Area: {areaOf(chosen[0]) || areaOf(client.rows[0]) || 'Not set'}</div>}
          </div>

          {message && <div className="login-message" role="alert">{message}</div>}
          <button className="login-button" type="button" disabled={saving} onClick={save}>{saving?'Saving…':'Add appointment'}</button>
        </div>
      </div>
    </div>
  )
}


function fillClockValue(minutes) {
  if (!Number.isFinite(minutes)) return '08:30'
  const clamped = Math.max(0,Math.min(23*60+59,Math.round(minutes)))
  return `${String(Math.floor(clamped/60)).padStart(2,'0')}:${String(clamped%60).padStart(2,'0')}`
}

function appointmentDurationMinutes(appt) {
  const row = appt?.sourceRow || {}
  const raw = row.Minutes ?? row['Service Minutes'] ?? row['Duration Minutes'] ?? row.Duration
  const value = Number(String(raw ?? '').replace(/[^0-9.]/g,''))
  return Number.isFinite(value) && value > 0 ? value : 60
}

function openingForDuration(appointments, duration, groomer) {
  const startOfDay = groomer === 'Jen' ? 9 * 60 : 8 * 60 + 30
  const endOfDay = 17 * 60 + 30
  const buffer = 15
  const occupied = (appointments || [])
    .filter(appt => !groomer || appt.groomer === groomer)
    .map(appt => {
      const start = clockMinutesForDisplay(appt.time)
      if (!Number.isFinite(start)) return null
      return {start,end:start + appointmentDurationMinutes(appt)}
    })
    .filter(Boolean)
    .sort((a,b)=>a.start-b.start)

  let cursor = startOfDay
  for (const slot of occupied) {
    if (slot.start - cursor >= duration) return fillClockValue(cursor)
    cursor = Math.max(cursor,slot.end + buffer)
  }
  if (endOfDay - cursor >= duration) return fillClockValue(cursor)
  return ''
}

function FillOpeningGoogleResults({candidates,dateKey,dayAppointments,dogs,onChoose}) {
  const [routeData,setRouteData] = useState({})
  const [checkingRoutes,setCheckingRoutes] = useState(true)
  const [routeNotice,setRouteNotice] = useState('')

  const lookup = clientAddressLookup(dogs)
  const candidateAddress = candidate => (candidate?.rows || []).map(fullClientAddress).find(Boolean) || ''
  const daySignature = (dayAppointments || []).map(appt=>[
    appt?.id || appt?.owner,
    appt?.groomer,
    appt?.time,
    appointmentAddress(appt,lookup)
  ].join(':')).join('|')
  const candidateSignature = (candidates || []).map(candidate=>[
    candidate.key,
    candidate.targetGroomer,
    candidate.suggestedTime,
    candidateAddress(candidate)
  ].join(':')).join('|')
  const signature = `${dateKey}|${daySignature}|${candidateSignature}`

  useEffect(()=>{
    let cancelled = false
    const cacheMs = 15 * 60 * 1000

    const fetchRoute = async (stops,groomer) => {
      if (!stops.length) return {totalMinutes:0,totalMiles:0,legs:[]}
      const routeSignature = stops.map(stop=>`${stop.id}:${stop.address}:${stop.time}`).join('|')
      const cacheKey = `fill-opening-google-v1:${groomer}:${dateKey}:${routeSignature}`
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null')
        if (cached?.payload && Number(cached?.savedAt) > Date.now() - cacheMs) return cached.payload
      } catch {}

      const response = await fetch('/api/google-route',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({stops,groomer})
      })
      const payload = await response.json().catch(()=>({}))
      if (!response.ok) throw new Error(payload?.error || `Google route check failed (${response.status}).`)
      try { localStorage.setItem(cacheKey,JSON.stringify({savedAt:Date.now(),payload})) } catch {}
      return payload
    }

    const run = async () => {
      setCheckingRoutes(true)
      setRouteNotice('')
      setRouteData({})

      const basePromises = {}
      const baseRouteFor = groomer => {
        if (!basePromises[groomer]) {
          const appointments = (dayAppointments || [])
            .filter(appt=>!appt?.inactive && appt?.groomer===groomer)
            .slice()
            .sort(compareAppointmentTimes)
          const stops = appointments.map((appt,index)=>({
            id:appt.id || `existing-${groomer}-${index}`,
            owner:appt.owner || `Stop ${index+1}`,
            address:appointmentAddress(appt,lookup),
            time:String(appt.time || '').trim(),
            appt
          }))
          if (stops.some(stop=>!stop.address)) {
            basePromises[groomer] = Promise.resolve({unavailable:true,missing:stops.filter(stop=>!stop.address).map(stop=>stop.owner)})
          } else {
            basePromises[groomer] = fetchRoute(stops.map(({appt,...stop})=>stop),groomer)
              .catch(error=>({unavailable:true,error:error?.message || 'Could not check Google route.'}))
          }
        }
        return basePromises[groomer]
      }

      const results = await Promise.all((candidates || []).map(async candidate=>{
        const groomer = candidate.targetGroomer
        const address = candidateAddress(candidate)
        const suggestedTime = candidate.suggestedTime || defaultFirstStopTime(groomer)
        if (!address) return [candidate.key,{unavailable:true,googlePoints:-30,label:'Address needed for Google route'}]
        if (!suggestedTime) return [candidate.key,{unavailable:true,googlePoints:-35,label:'No open time found'}]

        const existing = (dayAppointments || [])
          .filter(appt=>!appt?.inactive && appt?.groomer===groomer)
          .slice()
          .sort(compareAppointmentTimes)
          .map((appt,index)=>({
            id:appt.id || `existing-${groomer}-${index}`,
            owner:appt.owner || `Stop ${index+1}`,
            address:appointmentAddress(appt,lookup),
            time:String(appt.time || '').trim(),
            appt
          }))
        if (existing.some(stop=>!stop.address)) {
          return [candidate.key,{unavailable:true,googlePoints:-20,label:'Existing stop needs an address'}]
        }

        const candidateStop = {
          id:`fill-${candidate.key}`,
          owner:candidate.owner,
          address,
          time:suggestedTime,
          candidate:true
        }
        const proposed = [...existing,candidateStop].sort((a,b)=>{
          const first = clockMinutesForDisplay(a.time)
          const second = clockMinutesForDisplay(b.time)
          if (!Number.isFinite(first)) return 1
          if (!Number.isFinite(second)) return -1
          return first-second
        })

        try {
          const [base,proposedRoute] = await Promise.all([
            baseRouteFor(groomer),
            fetchRoute(proposed.map(({appt,candidate,...stop})=>stop),groomer)
          ])
          if (base?.unavailable) {
            return [candidate.key,{unavailable:true,googlePoints:-15,label:base.missing?.length ? `Missing address: ${base.missing.join(', ')}` : 'Google route unavailable'}]
          }

          const addedMinutes = Math.max(0,Number(proposedRoute.totalMinutes || 0) - Number(base.totalMinutes || 0))
          const addedMiles = Math.max(0,Number(proposedRoute.totalMiles || 0) - Number(base.totalMiles || 0))
          const candidateIndex = proposed.findIndex(stop=>stop.id===candidateStop.id)
          const previous = candidateIndex > 0 ? proposed[candidateIndex-1] : null
          const next = candidateIndex >= 0 && candidateIndex < proposed.length-1 ? proposed[candidateIndex+1] : null
          const legIn = (proposedRoute.legs || []).find(leg=>leg.toId===candidateStop.id)
          const legOut = (proposedRoute.legs || []).find(leg=>leg.fromId===candidateStop.id)
          const candidateMinutes = clockMinutesForDisplay(suggestedTime)
          const risks = []

          if (previous?.appt && Number.isFinite(candidateMinutes)) {
            const previousStart = clockMinutesForDisplay(previous.time)
            const arrival = previousStart + appointmentDurationMinutes(previous.appt) + Number(legIn?.minutes || 0)
            const latest = candidateMinutes + 30
            if (Number.isFinite(previousStart) && arrival > latest) {
              risks.push(`${Math.ceil(arrival-latest)} min past ${candidate.owner}'s window`)
            }
          }
          if (next?.appt && Number.isFinite(candidateMinutes)) {
            const nextMinutes = clockMinutesForDisplay(next.time)
            const arrival = candidateMinutes + Number(candidate.minutes || 0) + Number(legOut?.minutes || 0)
            const latest = nextMinutes + 30
            if (Number.isFinite(nextMinutes) && arrival > latest) {
              risks.push(`${Math.ceil(arrival-latest)} min past ${next.owner}'s window`)
            }
          }

          const routeRisk = risks.length > 0
          let googlePoints = addedMinutes <= 10 ? 52 : addedMinutes <= 20 ? 40 : addedMinutes <= 30 ? 28 : addedMinutes <= 45 ? 14 : addedMinutes <= 60 ? 0 : -22
          if (routeRisk) googlePoints -= 65
          const label = routeRisk
            ? 'Route risk'
            : addedMinutes <= 15 ? 'Great route'
            : addedMinutes <= 30 ? 'Good route'
            : addedMinutes <= 45 ? 'Okay route'
            : 'Longer drive'

          return [candidate.key,{
            googlePoints,
            addedMinutes,
            addedMiles,
            routeRisk,
            risks,
            label,
            totalMinutes:Number(proposedRoute.totalMinutes || 0),
            totalMiles:Number(proposedRoute.totalMiles || 0)
          }]
        } catch(error) {
          return [candidate.key,{unavailable:true,googlePoints:-15,label:'Google route unavailable',error:error?.message || ''}]
        }
      }))

      if (cancelled) return
      const next = Object.fromEntries(results)
      setRouteData(next)
      const unavailableCount = Object.values(next).filter(info=>info?.unavailable).length
      if (unavailableCount) setRouteNotice(`Google route ranking could not be calculated for ${unavailableCount} suggestion${unavailableCount===1?'':'s'}; those stay in the list using the regular planner score.`)
      setCheckingRoutes(false)
    }

    if (!(candidates || []).length) {
      setRouteData({})
      setCheckingRoutes(false)
      setRouteNotice('')
      return ()=>{cancelled=true}
    }
    run()
    return ()=>{cancelled=true}
    // The signature captures the candidate list, addresses, times, and current route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[signature])

  const ranked = (candidates || []).map(candidate=>({
    ...candidate,
    routeInfo:routeData[candidate.key] || null,
    finalScore:Number(candidate.score || 0) + Number(routeData[candidate.key]?.googlePoints || 0)
  })).sort((a,b)=>{
    if (Boolean(a.fallback) !== Boolean(b.fallback)) return a.fallback ? 1 : -1
    return b.finalScore-a.finalScore || (a.due.dueDate || '').localeCompare(b.due.dueDate || '') || a.owner.localeCompare(b.owner)
  }).slice(0,6)

  return (
    <>
      {checkingRoutes && <div className="prototype-note" style={{marginTop:10}}>Checking real Google drive times for the best fits…</div>}
      {routeNotice && !checkingRoutes && <div className="prototype-note" style={{marginTop:10,textAlign:'left'}}>{routeNotice}</div>}
      <div style={{display:'grid',gap:10,marginTop:12}}>
        {ranked.map((candidate,index)=>{
          const info = candidate.routeInfo
          const routeText = checkingRoutes
            ? 'Checking Google route…'
            : info?.unavailable
              ? info.label
              : info
                ? `${info.label} · adds about ${Math.round(info.addedMinutes)} min driving${info.addedMiles >= 0.1 ? ` · ${info.addedMiles.toFixed(1)} mi` : ''}`
                : 'Planner route score'
          return (
            <button key={candidate.key} type="button" className="candidate" style={{textAlign:'left',width:'100%',...(info?.routeRisk?{borderColor:'#e4a24c',background:'#fffaf2'}:{})}} onClick={()=>onChoose?.({
              date:dateKey,
              clientKey:candidate.key,
              groomer:candidate.targetGroomer,
              time:candidate.suggestedTime || defaultFirstStopTime(candidate.targetGroomer),
              fixed:false,
              note:'Added from Fill Opening'
            })}>
              <div className="candidate-rank">{index+1}</div>
              <div className="candidate-main">
                <strong>{candidate.owner} · {candidate.rows.map(row=>String(row?.dog || row?.Dog || '').trim()).filter(Boolean).join(' + ')}</strong>
                <span>{candidate.due.detail}{candidate.fallback ? ' · Early fallback' : ''} · {candidate.area || 'Area not set'} · {candidate.minutes} min</span>
                <span>{candidate.targetGroomer}{candidate.suggestedTime ? ` · Suggested ${displayClockTime(candidate.suggestedTime)}` : ' · Choose a time manually'}</span>
                <span style={{fontWeight:info?.routeRisk?800:700,color:info?.routeRisk?'#9a5d19':'#5d6678'}}>{routeText}</span>
                {info?.routeRisk && info.risks?.length > 0 && <span style={{color:'#9a5d19'}}>⚠ {info.risks[0]}</span>}
              </div>
              <div className="candidate-price">${candidate.price}</div>
            </button>
          )
        })}
      </div>
    </>
  )
}

function FillOpeningSheet({open,dateKey,preferredGroomer,dayAppointments,dogs,onClose,onChoose}) {
  const [booked,setBooked] = useState({})
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState('')

  const normalized = value => String(value || '').trim().toLowerCase()
  const keyFor = row => {
    const household = String(row?.household_id || row?.['Household ID'] || '').trim()
    const owner = String(row?.owner || row?.Owner || '').trim()
    return household ? `h:${normalized(household)}` : `o:${normalized(owner)}`
  }
  const ownerOf = row => String(row?.owner || row?.Owner || '').trim()
  const dogOf = row => String(row?.dog || row?.Dog || '').trim()
  const areaOf = row => canonicalAreaLabel(row?.area || row?.Area || '')
  const groomerOf = row => String(row?.groomer || row?.Groomer || '').trim()

  useEffect(()=>{
    if (!open || !supabase) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const today = businessDateKey()
        const startWeek = mondayForDate(today)
        const end = new Date(`${today}T12:00:00Z`)
        end.setUTCDate(end.getUTCDate()+84)
        const endWeek = mondayForDate(end.toISOString().slice(0,10))
        const {data,error:loadError} = await supabase
          .from('weekly_drafts')
          .select('week_start,plan_json')
          .gte('week_start',startWeek)
          .lte('week_start',endWeek)
          .order('week_start',{ascending:true})
        if (loadError) throw loadError
        if (cancelled) return
        const next = {}
        for (const week of (data || [])) {
          for (const row of (Array.isArray(week.plan_json) ? week.plan_json : [])) {
            if (!row || !String(row.Owner || '').trim()) continue
            const date = String(row.Date || '').slice(0,10)
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today) continue
            const apptStatus = String(row['Appointment Status'] || '').trim().toLowerCase()
            const completion = String(row['Completion Status'] || '').trim().toLowerCase()
            const status = String(row.Status || '').trim().toLowerCase()
            if (completion === 'completed') continue
            if (['cancelled','canceled','moved to another week','missed','no show','no-show','noshow'].includes(apptStatus)) continue
            if (['cancelled','canceled','rescheduled','completed','missed','no show','no-show','noshow'].includes(status)) continue
            const household = String(row['Household ID'] || '').trim()
            const owner = String(row.Owner || row.Client || '').trim()
            const info = {date,time:String(row['Start Time'] || row['Locked Time'] || '').trim()}
            if (household) next[`h:${normalized(household)}`] = info
            if (owner) next[`o:${normalized(owner)}`] = info
          }
        }
        setBooked(next)
      } catch(err) {
        if (!cancelled) setError(err?.message || 'Could not check existing appointments.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return ()=>{cancelled=true}
  },[open,dateKey])

  if (!open) return null

  const grouped = Object.values((dogs || []).reduce((map,row)=>{
    const owner = ownerOf(row)
    const dog = dogOf(row)
    if (!owner || !dog) return map
    const key = keyFor(row)
    if (!map[key]) map[key] = {key,owner,household:String(row?.household_id || row?.['Household ID'] || '').trim(),rows:[]}
    map[key].rows.push(row)
    return map
  },{}))

  const weekday = new Date(`${dateKey}T12:00:00Z`).getUTCDay()
  const dayAreas = [...new Set((dayAppointments || []).map(appt=>canonicalAreaLabel(appt.area)).filter(Boolean))]
  const dayCounts = (dayAppointments || []).reduce((acc,appt)=>{
    if (appt.groomer === 'Jen' || appt.groomer === 'Haley') acc[appt.groomer] += 1
    return acc
  },{Jen:0,Haley:0})

  const latestServiceDate = rows => {
    const dates = (rows || []).flatMap(row => [
      String(row?.last_groom || row?.['Last Groom'] || '').slice(0,10),
      String(row?.last_bath || row?.['Last Bath'] || '').slice(0,10)
    ]).filter(value=>/^\d{4}-\d{2}-\d{2}$/.test(value))
    return dates.sort().at(-1) || ''
  }

  const targetDay = new Date(`${dateKey}T12:00:00Z`)
  const scoredCandidates = grouped.map(client=>{
    if (booked[client.key] || booked[`o:${normalized(client.owner)}`]) return null
    const due = clientDueInfo(client.rows,dateKey)
    if (!due.dueDate || !['Overdue','Due today','Due this week','Due soon','Upcoming'].includes(due.status)) return null

    const lastService = latestServiceDate(client.rows)
    if (lastService) {
      const last = new Date(`${lastService}T12:00:00Z`)
      const daysSinceService = Math.floor((targetDay - last) / 86400000)
      if (daysSinceService >= 0 && daysSinceService < 14) return null
    }

    const assigned = [...new Set(client.rows.map(groomerOf).filter(name=>name==='Jen' || name==='Haley'))]
    const exclusive = assigned.length === 1 ? assigned[0] : ''
    let targetGroomer = ['Jen','Haley'].includes(preferredGroomer) ? preferredGroomer : ''
    if (!targetGroomer) {
      if (weekday === 1 || weekday === 5) targetGroomer = 'Haley'
      else if (exclusive) targetGroomer = exclusive
      else targetGroomer = dayCounts.Jen <= dayCounts.Haley ? 'Jen' : 'Haley'
    }
    if ((weekday === 1 || weekday === 5) && targetGroomer !== 'Haley') return null
    if (targetGroomer === 'Jen' && ![2,3,4].includes(weekday)) return null
    if (exclusive && exclusive !== targetGroomer) return null

    const defaults = client.rows.reduce((acc,row)=>{
      let service = canonicalServiceLabel(row?.service_pattern || row?.['Service Pattern'] || '')
      if (service === 'Service Varies' || !appointmentServiceOptions.includes(service)) {
        const next = canonicalServiceLabel(row?.next_service || row?.['Next Service'] || '')
        service = appointmentServiceOptions.includes(next) ? next : 'Groom'
      }
      const values = serviceDefaultsForDog(row,service)
      acc.price += Number(values.price || 0)
      acc.minutes += Number(values.minutes || 0)
      return acc
    },{price:0,minutes:0})
    const minutes = Math.max(30,Math.round(defaults.minutes || 60))
    const suggestedTime = openingForDuration(dayAppointments,minutes,targetGroomer)
    const area = areaOf(client.rows[0])
    const exactArea = Boolean(area && dayAreas.some(item=>normalized(item)===normalized(area)))
    const duePoints = due.status === 'Overdue' ? 100 : due.status === 'Due today' ? 92 : due.status === 'Due this week' ? 82 : due.status === 'Due soon' ? 65 : 30
    const overdueBonus = due.days < 0 ? Math.min(25,Math.abs(due.days)) : 0
    const areaBackupPoints = exactArea ? 8 : 0
    const openingPoints = suggestedTime ? 30 : -20
    const groomerPoints = (dayAppointments || []).some(appt=>appt.groomer===targetGroomer) ? 8 : 0
    const fallback = due.status === 'Upcoming'
    if (fallback && (due.days == null || due.days > 28)) return null
    return {
      ...client,due,area,targetGroomer,minutes,price:Math.round(defaults.price || 0),suggestedTime,exactArea,lastService,fallback,
      score:duePoints+overdueBonus+areaBackupPoints+openingPoints+groomerPoints
    }
  }).filter(Boolean)

  const sortCandidates = items => items.sort((a,b)=>b.score-a.score || (a.due.dueDate || '').localeCompare(b.due.dueDate || '') || a.owner.localeCompare(b.owner))
  const primaryCandidates = sortCandidates(scoredCandidates.filter(candidate=>!candidate.fallback))
  const fallbackCandidates = sortCandidates(scoredCandidates.filter(candidate=>candidate.fallback))
  const candidates = primaryCandidates.length >= 8
    ? primaryCandidates.slice(0,8)
    : [...primaryCandidates, ...fallbackCandidates.slice(0,8-primaryCandidates.length)]

  const dateLabel = new Date(`${dateKey}T12:00:00Z`).toLocaleDateString('en-US',{timeZone:'UTC',weekday:'long',month:'short',day:'numeric'})

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={event=>event.stopPropagation()} style={{maxHeight:'90dvh',overflowY:'auto'}}>
        <div className="sheet-head">
          <div><div className="eyebrow">Smart route suggestions</div><h2>Fill opening · {dateLabel}</h2></div>
          <button className="icon-btn" type="button" onClick={onClose}><X size={18}/></button>
        </div>
        <div className="prototype-note" style={{marginTop:0,textAlign:'left'}}>
          Ranked using due date, real Google drive time, groomer rules, saved service length, and whether the client fits an open spot. Clients already booked or serviced within the last 2 weeks are excluded. Slightly early clients only appear as fallback options.
        </div>
        {loading && <div className="prototype-note">Checking your schedule…</div>}
        {error && <div className="login-message">{error}</div>}
        {!loading && !error && candidates.length === 0 && <div className="prototype-note">No unscheduled due clients fit this day right now.</div>}
        {!loading && !error && candidates.length > 0 && (
          <FillOpeningGoogleResults
            candidates={candidates}
            dateKey={dateKey}
            dayAppointments={dayAppointments}
            dogs={dogs}
            onChoose={onChoose}
          />
        )}
        <div className="prototype-note" style={{marginTop:12}}>Tap a client to open Add Appointment with the client, groomer, and suggested time already filled in. You can review services before saving.</div>
      </div>
    </div>
  )
}

function monthGrid(monthKey) {
  const first = new Date(`${monthKey}-01T12:00:00Z`)
  const last = new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0,12))
  const start = new Date(`${mondayForDate(first.toISOString().slice(0,10))}T12:00:00Z`)
  const end = new Date(`${mondayForDate(last.toISOString().slice(0,10))}T12:00:00Z`)
  const days = []
  for (let week = new Date(start); week <= end; week.setUTCDate(week.getUTCDate()+7)) {
    for (let offset=0; offset<5; offset++) {
      const day = new Date(week)
      day.setUTCDate(day.getUTCDate()+offset)
      days.push(day.toISOString().slice(0,10))
    }
  }
  return {days,firstWeek:start.toISOString().slice(0,10),lastWeek:end.toISOString().slice(0,10)}
}

function moveMonth(monthKey,offset) {
  const day = new Date(`${monthKey}-01T12:00:00Z`)
  day.setUTCMonth(day.getUTCMonth()+offset)
  return day.toISOString().slice(0,7)
}

function Month({onOpen,revision,dogs}) {
  const [month,setMonth] = useState(()=>businessDateKey().slice(0,7))
  const [groomer,setGroomer] = useState('All')
  const [selected,setSelected] = useState(()=>businessDateKey())
  const [result,setResult] = useState(null)
  const [loading,setLoading] = useState(true)
  const [error,setError] = useState('')
  const [refresh,setRefresh] = useState(0)
  const {days,firstWeek,lastWeek} = monthGrid(month)

  useEffect(()=>{
    let cancelled = false
    setLoading(true)
    setError('')
    setResult(null)
    const load = async () => {
      try {
        if (!supabase) throw new Error('Your schedule connection is not configured.')
        const {data,error:loadError} = await supabase.from('weekly_drafts')
          .select('week_start,plan_json,status').gte('week_start',firstWeek)
          .lte('week_start',lastWeek).order('week_start')
        if (loadError) throw loadError
        if (!cancelled) setResult({month,weeks:data || []})
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not load this month. Please try again.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return ()=>{cancelled=true}
  },[month,firstWeek,lastWeek,refresh,revision])

  const ready = !loading && !error && result?.month === month
  const weeks = result?.month === month ? result.weeks : []
  const rows = weeks.flatMap(week=>Array.isArray(week.plan_json)?week.plan_json:[])
  const appointmentsOn = day => todayAppointments(rows,day,groomer)
  const monthly = days.filter(day=>day.startsWith(month)).flatMap(appointmentsOn)
  const total = monthly.reduce((sum,appt)=>sum+(Number.isFinite(appt.price)?appt.price:0),0)
  const selectedAppointments = appointmentsOn(selected)
  const selectedWeek = weeks.find(week=>String(week.week_start).slice(0,10)===mondayForDate(selected))
  const label = new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-US',{timeZone:'UTC',month:'long',year:'numeric'})
  const changeMonth = offset => {
    const next = moveMonth(month,offset)
    setMonth(next)
    setSelected(monthGrid(next).days.find(day=>day.startsWith(next)))
  }

  return (
    <section>
      <div className="page-head">
        <div><div className="eyebrow">Saved schedule</div><h1>{label}</h1></div>
        <div className="month-arrows">
          <button className="icon-btn" aria-label="Previous month" onClick={()=>changeMonth(-1)}><ChevronLeft size={18}/></button>
          <button className="icon-btn" aria-label="Next month" onClick={()=>changeMonth(1)}><ChevronRight size={18}/></button>
        </div>
      </div>
      <div className="segmented" aria-label="Filter by groomer">
        {['All','Jen','Haley'].map(name=><button key={name} className={groomer===name?'active':''}
          aria-pressed={groomer===name} onClick={()=>setGroomer(name)}>{name}</button>)}
      </div>
      <div className="section-title">
        <button className="text-btn" onClick={()=>{setMonth(businessDateKey().slice(0,7));setSelected(businessDateKey())}}>This month</button>
        <button className="text-btn" disabled={loading} onClick={()=>setRefresh(value=>value+1)}>Refresh</button>
      </div>
      {loading && <div className="prototype-note" role="status">Loading your month…</div>}
      {error && <div className="login-message" role="alert">{error}</div>}
      {ready && <>
        <div className="calendar">
          {['Mon','Tue','Wed','Thu','Fri'].map(day=><div className="dow" key={day}>{day}</div>)}
          {days.map(day=>{
            const inMonth = day.startsWith(month)
            const appointments = inMonth ? appointmentsOn(day) : []
            return <button type="button" key={day} disabled={!inMonth}
              className={`cal-day ${appointments.length?'busy':''}`}
              aria-pressed={selected===day} aria-label={`${day}, ${appointments.length} appointments`}
              onClick={()=>setSelected(day)}
              style={{textAlign:'left',font:'inherit',minWidth:0,cursor:inMonth?'pointer':'default',
                opacity:inMonth?1:0.3,outline:selected===day?'2px solid #405847':'none',outlineOffset:-2}}>
              <span className="day-num">{Number(day.slice(8))}</span>
              {appointments.slice(0,2).map(appt=><div key={appt.id} className="tiny-appt"
                style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{appt.dogs || appt.owner}</div>)}
              {appointments.length>2 && <div style={{fontSize:10}}>+{appointments.length-2} more</div>}
            </button>
          })}
        </div>
        <div className="month-summary">
          <Stat label="Scheduled stops" value={monthly.length}/>
          <Stat label="Scheduled total" value={new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(total)}/>
        </div>
        <div className="prototype-note">Monday–Friday · Saved drafts and confirmed weeks. Cancelled and moved appointments are excluded.
          {monthly.some(appt=>!Number.isFinite(appt.price)) && ' Total includes known prices only.'}
        </div>
        <div className="section-title"><h3>{new Date(`${selected}T12:00:00Z`).toLocaleDateString('en-US',{timeZone:'UTC',weekday:'long',month:'short',day:'numeric'})}</h3></div>
        {selectedWeek && <div className="eyebrow" style={{marginBottom:12}}>{selectedWeek.status==='confirmed'?'Confirmed week':'Draft week'}</div>}
        <div className="appt-list">{selectedAppointments.map(appt=><ApptCard key={appt.id} appt={appt} dogs={dogs} onOpen={(mode)=>onOpen({...appt,_initialMode:mode || 'edit'})}/>)}</div>
        {!selectedAppointments.length && <div className="prototype-note">{selectedWeek
          ? `No appointments scheduled${groomer==='All'?'':` for ${groomer}`} on this date.`
          : 'No saved schedule for this week yet.'}</div>}
      </>}
    </section>
  )
}


function canonicalServiceLabel(value) {
  const key = String(value || '').trim().toLowerCase()
  if (key === 'groom' || key === 'groom only') return 'Groom'
  if (key === 'bath only') return 'Bath Only'
  if (key === 'bath') return 'Bath'
  if (key === 'partial groom') return 'Partial Groom'
  if (key === 'service varies' || key === 'varies') return 'Service Varies'
  return String(value || '').trim()
}

const appointmentServiceOptions = ['Groom','Bath Only','Bath','Partial Groom']

function parseAppointmentDogServices(value) {
  return String(value || '').split(',').map(part=>part.trim()).filter(Boolean).map(part=>{
    const match = part.match(/^(.*?)\s*\(([^()]*)\)\s*$/)
    const name = (match?.[1] || part).trim()
    const service = canonicalServiceLabel(match?.[2] || '')
    return {name,service:appointmentServiceOptions.includes(service)?service:'Groom'}
  })
}

function formatAppointmentDogServices(items) {
  return items.map(item=>`${String(item.name || '').trim()} (${item.service})`).join(', ')
}

function dogDueInfo(row, todayKey = businessDateKey()) {
  const pick = (...keys) => {
    for (const key of keys) {
      const value = row?.[key]
      if (value !== undefined && value !== null && String(value).trim() !== '') return value
    }
    return ''
  }
  const dateKey = value => {
    const text = String(value || '').trim().slice(0,10)
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
  }
  const addWeeks = (key, weeks) => {
    if (!key || !Number.isFinite(weeks)) return ''
    const date = new Date(`${key}T12:00:00Z`)
    date.setUTCDate(date.getUTCDate() + Math.round(weeks * 7))
    return date.toISOString().slice(0,10)
  }

  const frequencyRaw = pick('frequency_weeks', 'Frequency Weeks')
  const frequency = Number(String(frequencyRaw).replace(/[^0-9.]/g,''))
  const lastGroom = dateKey(pick('last_groom', 'Last Groom', 'last_groom_date', 'Last Groom Date'))
  const lastBath = dateKey(pick('last_bath', 'Last Bath', 'last_bath_date', 'Last Bath Date'))
  const nextRaw = pick('next_service', 'Next Service')
  const explicitDue = dateKey(pick('next_service_date', 'Next Service Date')) || dateKey(nextRaw)
  const nextLabel = explicitDue ? '' : String(nextRaw || '').trim()

  const servicePattern = String(pick('service_pattern', 'Service Pattern') || '').trim().toLowerCase()
  let baseDate = ''
  if (servicePattern === 'bath only' || servicePattern === 'bath') baseDate = lastBath
  else if (servicePattern === 'groom' || servicePattern === 'groom only' || servicePattern === 'partial groom') baseDate = lastGroom
  else if (servicePattern === 'service varies' || servicePattern === 'varies') baseDate = [lastGroom,lastBath].filter(Boolean).sort().at(-1) || ''
  else if (nextLabel.toLowerCase().includes('groom')) baseDate = lastGroom
  else if (nextLabel.toLowerCase().includes('bath')) baseDate = lastBath
  else baseDate = [lastGroom,lastBath].filter(Boolean).sort().at(-1) || ''

  const dueDate = explicitDue || (Number.isFinite(frequency) && frequency > 0 ? addWeeks(baseDate,frequency) : '')
  if (!dueDate) {
    return { dueDate:'', status:'Not enough data', detail:'No completed service history yet', rank:5, days:null, nextLabel }
  }

  const today = new Date(`${todayKey}T12:00:00Z`)
  const due = new Date(`${dueDate}T12:00:00Z`)
  const days = Math.round((due - today) / 86400000)

  if (days < 0) return {dueDate,status:'Overdue',detail:`${Math.abs(days)} day${Math.abs(days)===1?'':'s'} overdue`,rank:0,days,nextLabel}
  if (days === 0) return {dueDate,status:'Due today',detail:'Due today',rank:1,days,nextLabel}
  if (days <= 7) return {dueDate,status:'Due this week',detail:`Due in ${days} day${days===1?'':'s'}`,rank:1,days,nextLabel}
  if (days <= 14) return {dueDate,status:'Due soon',detail:`Due in ${days} days`,rank:2,days,nextLabel}
  return {dueDate,status:'Upcoming',detail:`Due in ${days} days`,rank:3,days,nextLabel}
}

function clientDueInfo(rows, todayKey = businessDateKey()) {
  const infos = (rows || []).map(row => ({row, ...dogDueInfo(row,todayKey)}))
  const known = infos.filter(info => info.dueDate)
  if (!known.length) return {status:'Not enough data',detail:'No due date yet',dueDate:'',rank:5,infos}
  known.sort((a,b) => a.rank - b.rank || a.dueDate.localeCompare(b.dueDate))
  const mostUrgent = known[0]
  const overdueCount = known.filter(info => info.status === 'Overdue').length
  const detail = overdueCount > 1 ? `${overdueCount} dogs overdue` : mostUrgent.detail
  return {...mostUrgent,detail,infos}
}

function canonicalAreaLabel(value) {
  const raw = String(value || '').trim().replace(/\s+/g,' ')
  if (!raw) return ''

  const key = raw
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/\s+/g,' ')

  const known = {
    'april sound':'April Sound',
    'april sounds':'April Sound',
    'back woodlands':'Back Woodlands',
    "back woodlands's":'Back Woodlands',
    'middle woodlands':'Middle Woodlands',
    'middle spring':'Middle Spring',
    'old magnolia':'Old Magnolia',
    'hmr':'HMR',
    'hockley':'Hockley',
    'conroe':'Conroe',
    'montgomery':'Montgomery',
    'spring':'Spring',
    'willis':'Willis',
    'woodforest':'Woodforest',
    'the woodlands':'The Woodlands',
    'tomball':'Tomball',
    'cypress':'Cypress'
  }

  if (known[key]) return known[key]

  return raw.split(' ').map(word => {
    if (!word) return word
    if (word.toUpperCase() === word && word.length <= 4) return word
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  }).join(' ')
}

function Clients({ dogs, loading, error, onOpen, revision, onDataChanged, openClient, onOpenClientHandled, onRebook, viewerMode=false }) {
  const [query, setQuery] = useState('')
  const [clientFilter, setClientFilter] = useState('all')
  const [areaFilter, setAreaFilter] = useState('all')
  const [selectedClient, setSelectedClient] = useState(null)
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [scheduledLookup, setScheduledLookup] = useState({})
  const [areaEditValue, setAreaEditValue] = useState('')
  const [addingArea, setAddingArea] = useState(false)
  const [newArea, setNewArea] = useState('')
  const [areaSaving, setAreaSaving] = useState(false)
  const [areaMessage, setAreaMessage] = useState('')
  const [dogEditor, setDogEditor] = useState(null)
  const [newClientOpen, setNewClientOpen] = useState(false)
  const [dogSaving, setDogSaving] = useState(false)
  const [dogMessage, setDogMessage] = useState('')
  const [rebookTextDate, setRebookTextDate] = useState('')

  const valueOf = (row, ...keys) => {
    for (const key of keys) {
      if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== '') {
        return row[key]
      }
    }
    return ''
  }

  const textDate = value => {
    if (!value) return ''
    const key = String(value).slice(0,10)
    const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!match) return String(value)
    const date = new Date(`${key}T12:00:00Z`)
    return date.toLocaleDateString('en-US',{timeZone:'UTC',month:'short',day:'numeric',year:'numeric'})
  }

  const normalizedKey = value => String(value || '').trim().toLowerCase()
  const householdScheduleKey = value => value ? `h:${normalizedKey(value)}` : ''
  const ownerScheduleKey = value => value ? `o:${normalizedKey(value)}` : ''

  const scheduleForClient = client => {
    const byHousehold = householdScheduleKey(client.household)
    const byOwner = ownerScheduleKey(client.owner)
    return (byHousehold && scheduledLookup[byHousehold]) || (byOwner && scheduledLookup[byOwner]) || null
  }

  const scheduledDueInfo = (baseDue, scheduleInfo) => {
    if (!scheduleInfo?.date) return baseDue
    const today = businessDateKey()
    const thisWeek = mondayForDate(today)
    const appointmentWeek = mondayForDate(scheduleInfo.date)
    const firstVisit = !baseDue?.dueDate && baseDue?.status === 'Not enough data'
    const status = firstVisit
      ? (scheduleInfo.date === today ? 'First visit today' : 'First visit scheduled')
      : scheduleInfo.date === today
        ? 'Scheduled today'
        : appointmentWeek === thisWeek
          ? 'Scheduled this week'
          : 'Scheduled'
    return {
      ...baseDue,
      status,
      detail: scheduleInfo.time ? `${textDate(scheduleInfo.date)} · ${scheduleInfo.time}` : textDate(scheduleInfo.date),
      rank:4,
      scheduled:true,
      scheduleDate:scheduleInfo.date,
      scheduleTime:scheduleInfo.time || '',
      scheduleGroomer:scheduleInfo.groomer || ''
    }
  }

  useEffect(() => {
    if (!supabase) {
      setScheduledLookup({})
      return
    }

    let cancelled = false

    const loadScheduledAppointments = async () => {
      try {
        const today = businessDateKey()
        const startWeek = mondayForDate(today)
        const endDate = new Date(`${today}T12:00:00Z`)
        endDate.setUTCDate(endDate.getUTCDate() + 84)
        const endWeek = mondayForDate(endDate.toISOString().slice(0,10))

        const {data,error:scheduleError} = await supabase
          .from('weekly_drafts')
          .select('week_start,plan_json')
          .gte('week_start',startWeek)
          .lte('week_start',endWeek)
          .order('week_start',{ascending:true})

        if (scheduleError) throw scheduleError
        if (cancelled) return

        const lookup = {}
        const remember = (key, info) => {
          if (!key) return
          const current = lookup[key]
          if (!current || `${info.date} ${info.time || ''}` < `${current.date} ${current.time || ''}`) {
            lookup[key] = info
          }
        }

        for (const week of (data || [])) {
          for (const row of (Array.isArray(week.plan_json) ? week.plan_json : [])) {
            if (!row || !String(row.Owner || '').trim()) continue
            const date = String(row.Date || '').slice(0,10)
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today) continue

            const appointmentStatus = String(row['Appointment Status'] || '').trim().toLowerCase()
            const completionStatus = String(row['Completion Status'] || '').trim().toLowerCase()
            if (['cancelled','canceled','moved to another week'].includes(appointmentStatus)) continue
            if (completionStatus === 'completed') continue

            const info = {
              date,
              time:String(row['Start Time'] || row['Locked Time'] || '').trim(),
              groomer:String(row.Groomer || '').trim(),
              dogs:String(row.Dogs || '').trim()
            }
            remember(householdScheduleKey(row['Household ID']), info)
            remember(ownerScheduleKey(row.Owner), info)
          }
        }

        setScheduledLookup(lookup)
      } catch (err) {
        if (!cancelled) {
          console.error('Could not load scheduled client status', err)
          setScheduledLookup({})
        }
      }
    }

    loadScheduledAppointments()
    return () => { cancelled = true }
  }, [revision])

  const grouped = Object.values(
    (dogs || []).reduce((acc, row) => {
      const owner = valueOf(row, 'owner', 'Owner') || 'Unknown owner'
      const dog = valueOf(row, 'dog', 'Dog') || 'Unnamed dog'
      const household = valueOf(row, 'household_id', 'Household ID') || owner
      const key = String(household || owner)

      if (!acc[key]) {
        acc[key] = {
          household,
          owner,
          dogs: [],
          area: canonicalAreaLabel(valueOf(row, 'area', 'Area')),
          groomer: valueOf(row, 'groomer', 'Groomer'),
          phone: valueOf(row, 'phone', 'Phone'),
          address: valueOf(row, 'address', 'Address'),
          city: valueOf(row, 'city', 'City'),
          state: valueOf(row, 'state', 'State'),
          zip: valueOf(row, 'zip', 'ZIP'),
          notes: valueOf(row, 'notes', 'Notes'),
          rows: []
        }
      }

      if (dog && !acc[key].dogs.includes(dog)) {
        acc[key].dogs.push(dog)
      }

      acc[key].rows.push(row)
      return acc
    }, {})
  ).sort((a, b) => a.owner.localeCompare(b.owner))

  const preparedClients = grouped.map(client => {
    const baseDue = clientDueInfo(client.rows)
    const scheduleInfo = scheduleForClient(client)
    return {...client, scheduleInfo, dueInfo:scheduledDueInfo(baseDue,scheduleInfo)}
  })

  const needsSchedulingClients = preparedClients.filter(client =>
    !client.dueInfo.scheduled && ['Overdue','Due today','Due this week','Due soon'].includes(client.dueInfo.status)
  )

  const areaOptions = [...new Set(
    preparedClients
      .map(client => canonicalAreaLabel(client.area))
      .filter(Boolean)
  )].sort((a,b) => a.localeCompare(b))

  const filtered = preparedClients
    .filter(client => {
      const haystack = `${client.owner} ${client.dogs.join(' ')} ${client.area} ${client.groomer}`.toLowerCase()
      const matchesSearch = haystack.includes(query.trim().toLowerCase())
      const needsScheduling = !client.dueInfo.scheduled && ['Overdue','Due today','Due this week','Due soon'].includes(client.dueInfo.status)
      const matchesArea = areaFilter === 'all' || normalizedKey(client.area) === normalizedKey(areaFilter)
      return matchesSearch && (clientFilter === 'all' || (needsScheduling && matchesArea))
    })
    .sort((a,b) => a.dueInfo.rank - b.dueInfo.rank ||
      (a.dueInfo.dueDate || '9999-99-99').localeCompare(b.dueInfo.dueDate || '9999-99-99') ||
      a.owner.localeCompare(b.owner))

  useEffect(() => {
    if (!openClient) return
    const wantedHousehold = normalizedKey(openClient.household)
    const wantedOwner = normalizedKey(openClient.owner)
    const found = preparedClients.find(client =>
      (wantedHousehold && normalizedKey(client.household) === wantedHousehold) ||
      (wantedOwner && normalizedKey(client.owner) === wantedOwner)
    )
    if (!found) return
    setSelectedClient(found)
    onOpenClientHandled?.()
  }, [openClient?.key, openClient?.household, openClient?.owner, dogs, scheduledLookup])

  useEffect(() => {
    if (!selectedClient) {
      setAreaEditValue('')
      setAddingArea(false)
      setNewArea('')
      setAreaMessage('')
      return
    }
    setAreaEditValue(canonicalAreaLabel(selectedClient.area))
    setAddingArea(false)
    setNewArea('')
    setAreaMessage('')
    setRebookTextDate('')
  }, [selectedClient?.household, selectedClient?.owner])

  const saveClientArea = async rawArea => {
    if (!selectedClient || !supabase || areaSaving) return
    const area = canonicalAreaLabel(rawArea)
    if (!area) {
      setAreaMessage('Enter an area name first.')
      return
    }

    setAreaSaving(true)
    setAreaMessage('')
    try {
      const {data,error:saveError} = await supabase.rpc('update_client_area', {
        p_household_id:String(selectedClient.household || '').trim() || null,
        p_owner:String(selectedClient.owner || '').trim(),
        p_area:area
      })
      if (saveError) {
        if (saveError.code === 'PGRST202' || saveError.code === '42883') {
          throw new Error('Area editing needs its one-time Supabase setup first.')
        }
        throw saveError
      }
      if (data?.status && data.status !== 'updated') throw new Error('The area change could not be confirmed.')

      setSelectedClient(current => current ? {
        ...current,
        area,
        rows:(current.rows || []).map(row => ({...row, area, Area:area}))
      } : current)
      setAreaEditValue(area)
      setAddingArea(false)
      setNewArea('')
      setAreaMessage(`Area saved as ${area}.`)
      onDataChanged?.(`Area updated to ${area}.`)
    } catch (err) {
      setAreaMessage(err?.message || 'Could not save the area.')
    } finally {
      setAreaSaving(false)
    }
  }

  const commonFrequencyOptions = ['2','4','6','8','10','12']
  const blankAdditionalDog = () => ({
    dog:'', service:'Groom', groom_price:'', bath_price:'', partial_groom_price:'',
    groom_minutes:'', bath_minutes:'', partial_groom_minutes:'', frequency_weeks:'', frequency_mode:'preset',
    last_groom:'', last_bath:'', prior_service:'no', first_appointment_service:'Groom'
  })
  const blankDogForm = (client = null) => ({
    household_id:client?.household || '', owner:client?.owner || '', original_dog:'', dog:'',
    phone:client?.phone || '', groomer:client?.groomer || '', area:client?.area || '', area_mode:'existing', new_area:'',
    address:client?.address || '', city:client?.city || '', state:client?.state || 'TX', zip:client?.zip || '',
    service:'Groom', groom_price:'', bath_price:'', partial_groom_price:'', groom_minutes:'', bath_minutes:'', partial_groom_minutes:'', frequency_weeks:'', frequency_mode:'preset', last_groom:'', last_bath:'',
    prior_service:'no', first_appointment_booked:false, first_appointment_date:'', first_appointment_groomer:'Jen', first_appointment_time:'09:00', first_appointment_service:'Groom', first_appointment_fixed:false, first_appointment_override:false,
    additional_dogs:[]
  })

  const editDog = row => {
    const client = selectedClient
    setDogEditor({
    household_id:selectedClient.household || '', owner:selectedClient.owner || '',
    original_dog:valueOf(row,'dog','Dog') || '', dog:valueOf(row,'dog','Dog') || '',
    phone:selectedClient.phone || '', groomer:valueOf(row,'groomer','Groomer') || selectedClient.groomer || '',
    area:selectedClient.area || '', area_mode:'existing', new_area:'', address:selectedClient.address || '', city:selectedClient.city || '',
    state:selectedClient.state || 'TX', zip:selectedClient.zip || '',
    service:canonicalServiceLabel(valueOf(row,'service_pattern','Service Pattern')) || 'Groom',
    groom_price:valueOf(row,'groom_price','Groom Price') || (['Groom','Service Varies'].includes(canonicalServiceLabel(valueOf(row,'service_pattern','Service Pattern'))) ? valueOf(row,'price','Price') : ''),
    bath_price:valueOf(row,'bath_price','Bath Price') || (['Bath','Bath Only'].includes(canonicalServiceLabel(valueOf(row,'service_pattern','Service Pattern'))) ? valueOf(row,'price','Price') : ''),
    partial_groom_price:valueOf(row,'partial_groom_price','Partial Groom Price') || (canonicalServiceLabel(valueOf(row,'service_pattern','Service Pattern'))==='Partial Groom' ? valueOf(row,'price','Price') : ''),
    groom_minutes:valueOf(row,'groom_minutes','Groom Minutes') || (['Groom','Service Varies'].includes(canonicalServiceLabel(valueOf(row,'service_pattern','Service Pattern'))) ? valueOf(row,'minutes','Minutes') : ''),
    bath_minutes:valueOf(row,'bath_minutes','Bath Minutes') || (['Bath','Bath Only'].includes(canonicalServiceLabel(valueOf(row,'service_pattern','Service Pattern'))) ? valueOf(row,'minutes','Minutes') : ''),
    partial_groom_minutes:valueOf(row,'partial_groom_minutes','Partial Groom Minutes') || (canonicalServiceLabel(valueOf(row,'service_pattern','Service Pattern'))==='Partial Groom' ? valueOf(row,'minutes','Minutes') : ''),
    frequency_weeks:valueOf(row,'frequency_weeks','Frequency Weeks'),
    frequency_mode:commonFrequencyOptions.includes(String(valueOf(row,'frequency_weeks','Frequency Weeks') || '')) ? 'preset' : (valueOf(row,'frequency_weeks','Frequency Weeks') ? 'custom' : 'preset'),
    last_groom:String(valueOf(row,'last_groom','Last Groom','last_groom_date','Last Groom Date') || '').slice(0,10),
    last_bath:String(valueOf(row,'last_bath','Last Bath','last_bath_date','Last Bath Date') || '').slice(0,10),
    prior_service:(valueOf(row,'last_groom','Last Groom','last_groom_date','Last Groom Date') || valueOf(row,'last_bath','Last Bath','last_bath_date','Last Bath Date')) ? 'yes' : 'no',
    first_appointment_booked:false, first_appointment_date:'', first_appointment_groomer:'Jen', first_appointment_time:'09:00', first_appointment_service:'Groom', first_appointment_fixed:false, first_appointment_override:false, additional_dogs:[]
    })
    setSelectedClient(null)
  }

  const saveDogForm = async (form, closeNew=false) => {
    if (!supabase || dogSaving) return

    const extraDogs = closeNew && Array.isArray(form.additional_dogs) ? form.additional_dogs : []
    const dogsToSave = closeNew
      ? [
          {...form, additional_dogs:undefined},
          ...extraDogs.map(dog => ({
            ...form,
            ...dog,
            original_dog:'',
            additional_dogs:undefined,
            first_appointment_booked:false,
            first_appointment_date:'',
            first_appointment_groomer:form.first_appointment_groomer,
            first_appointment_time:form.first_appointment_time,
            first_appointment_fixed:form.first_appointment_fixed
          }))
        ]
      : [form]

    if (!String(form.owner||'').trim()) { setDogMessage('Owner name is required.'); return }
    if (dogsToSave.some(dog => !String(dog.dog||'').trim())) { setDogMessage('Enter a name for every dog.'); return }
    const dogNames = dogsToSave.map(dog => normalizedKey(dog.dog))
    if (new Set(dogNames).size !== dogNames.length) { setDogMessage('Each dog needs a different name.'); return }

    const bookingFirstVisit = Boolean(closeNew && form.prior_service === 'no' && form.first_appointment_booked)
    if (bookingFirstVisit) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(form.first_appointment_date || ''))) { setDogMessage('Choose the first appointment date.'); return }
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(form.first_appointment_time || ''))) { setDogMessage('Choose a valid first appointment time.'); return }
      if (!['Jen','Haley'].includes(form.first_appointment_groomer)) { setDogMessage('Choose Jen or Haley for the first appointment.'); return }
      if (dogsToSave.some(dog => !appointmentServiceOptions.includes(dog.first_appointment_service || dog.service))) { setDogMessage('Choose a first appointment service for every dog.'); return }
      const weekday = new Date(`${form.first_appointment_date}T12:00:00Z`).getUTCDay()
      if (![1,2,3,4,5].includes(weekday)) { setDogMessage('First appointments must be Monday through Friday.'); return }
      const firstVisitOverrideReasons = schedulingOverrideReasons(form.first_appointment_date,form.first_appointment_groomer,['Jen','Haley'].includes(form.groomer)?[form.groomer]:[])
      if (firstVisitOverrideReasons.length && !form.first_appointment_override) { setDogMessage('Turn on Manual override to book this first visit outside the normal groomer rules.'); return }
    }

    setDogSaving(true); setDogMessage('')
    let savedCount = 0
    try {
      const num = v => String(v ?? '').trim()==='' ? null : Number(v)
      let householdId = String(form.household_id||'').trim() || null

      for (const dogForm of dogsToSave) {
        const cleanLastGroom = closeNew && dogForm.prior_service === 'no' ? null : (dogForm.last_groom || null)
        const cleanLastBath = closeNew && dogForm.prior_service === 'no' ? null : (dogForm.last_bath || null)
        const {data,error:saveError} = await supabase.rpc('save_grooming_dog', {
          p_household_id:householdId,
          p_owner:String(form.owner||'').trim(), p_original_dog:String(dogForm.original_dog||'').trim() || null,
          p_dog:String(dogForm.dog||'').trim(), p_phone:String(form.phone||'').trim() || null,
          p_groomer:String(form.groomer||'').trim() || null, p_area:canonicalAreaLabel(form.area_mode==='new' ? form.new_area : form.area) || null,
          p_address:String(form.address||'').trim() || null, p_city:String(form.city||'').trim() || null,
          p_state:String(form.state||'').trim() || null, p_zip:String(form.zip||'').trim() || null,
          p_service:dogForm.service || 'Groom', p_price:num(dogForm.groom_price || dogForm.bath_price || dogForm.partial_groom_price),
          p_groom_price:num(dogForm.groom_price), p_bath_price:num(dogForm.bath_price), p_partial_groom_price:num(dogForm.partial_groom_price),
          p_groom_minutes:num(dogForm.groom_minutes), p_bath_minutes:num(dogForm.bath_minutes), p_partial_groom_minutes:num(dogForm.partial_groom_minutes),
          p_minutes:num(dogForm.groom_minutes || dogForm.bath_minutes || dogForm.partial_groom_minutes),
          p_frequency_weeks:num(dogForm.frequency_weeks), p_last_groom:cleanLastGroom, p_last_bath:cleanLastBath
        })
        if (saveError) throw saveError
        savedCount += 1
        const savedRow = Array.isArray(data) ? data[0] : data
        householdId = String(savedRow?.household_id || savedRow?.householdId || householdId || '').trim() || null
      }

      if (bookingFirstVisit) {
        const appointmentDogs = dogsToSave.map(dog => {
          const service = dog.first_appointment_service || dog.service || 'Groom'
          return {...dog, firstService:service, defaults:serviceDefaultsForDog(dog,service)}
        })
        const totalPrice = appointmentDogs.reduce((sum,dog)=>sum + Number(dog.defaults.price || 0),0)
        const totalMinutes = appointmentDogs.reduce((sum,dog)=>sum + Number(dog.defaults.minutes || 0),0)
        const area = canonicalAreaLabel(form.area_mode==='new' ? form.new_area : form.area)
        const {data:appointmentData,error:appointmentError} = await supabase.rpc('add_grooming_appointment',{
          p_date:form.first_appointment_date,
          p_household_id:householdId,
          p_owner:String(form.owner||'').trim(),
          p_dogs:appointmentDogs.map(dog=>`${String(dog.dog||'').trim()} (${dog.firstService})`).join(', '),
          p_groomer:form.first_appointment_groomer,
          p_start_time:form.first_appointment_time,
          p_fixed:Boolean(form.first_appointment_fixed),
          p_price:totalPrice,
          p_minutes:Math.max(1,Math.round(totalMinutes || 1)),
          p_area:area || null,
          p_note:'First visit'
        })
        if (appointmentError) {
          if (appointmentError.code === 'PGRST202' || appointmentError.code === '42883') throw new Error('Client saved, but Add Appointment needs its one-time Supabase setup first.')
          throw new Error(`Client saved, but the first appointment could not be added: ${appointmentError.message || 'Unknown error'}`)
        }
        if (appointmentData?.status !== 'added') throw new Error('Client saved, but the first appointment could not be confirmed.')
      }

      setDogEditor(null); if (closeNew) setNewClientOpen(false)
      onDataChanged?.(bookingFirstVisit
        ? `${form.owner} · ${dogsToSave.length} dog${dogsToSave.length===1?'':'s'} saved · first visit ${textDate(form.first_appointment_date)} at ${displayClockTime(form.first_appointment_time)}.`
        : closeNew && dogsToSave.length > 1 ? `${form.owner} · ${dogsToSave.length} dogs saved.` : `${form.dog} saved.`)
      if (selectedClient) setSelectedClient(null)
    } catch(err) {
      setDogMessage(err?.message || (savedCount ? `${savedCount} dog${savedCount===1?'':'s'} saved, but the rest could not be completed.` : 'Could not save dog.'))
    }
    finally { setDogSaving(false) }
  }

  const updateAdditionalDog = (index, patch) => {
    setDogEditor(current => current ? {
      ...current,
      additional_dogs:(current.additional_dogs || []).map((dog,i) => i === index ? {...dog,...patch} : dog)
    } : current)
  }

  const removeAdditionalDog = index => {
    setDogEditor(current => current ? {
      ...current,
      additional_dogs:(current.additional_dogs || []).filter((_,i) => i !== index)
    } : current)
  }

  useEffect(() => {
    if (!selectedClient || !supabase) {
      setHistory([])
      setHistoryError('')
      return
    }

    let cancelled = false

    const loadHistory = async () => {
      setHistoryLoading(true)
      setHistoryError('')

      try {
        const {data,error:historyLoadError} = await supabase
          .from('weekly_drafts')
          .select('week_start,plan_json,status')
          .order('week_start',{ascending:false})
          .limit(104)

        if (historyLoadError) throw historyLoadError
        if (cancelled) return

        const targetHousehold = String(selectedClient.household || '').trim().toLowerCase()
        const targetOwner = String(selectedClient.owner || '').trim().toLowerCase()
        const today = businessDateKey()

        const rows = (data || []).flatMap(week =>
          (Array.isArray(week.plan_json) ? week.plan_json : []).map((row,index) => ({
            row,
            weekStart:String(week.week_start || '').slice(0,10),
            weekStatus:week.status,
            index
          }))
        )

        const matches = rows
          .filter(item => {
            const rowHousehold = String(item.row?.['Household ID'] || '').trim().toLowerCase()
            const rowOwner = String(item.row?.Owner || '').trim().toLowerCase()
            return (targetHousehold && rowHousehold && rowHousehold === targetHousehold) ||
              (!rowHousehold && rowOwner === targetOwner) ||
              (!targetHousehold && rowOwner === targetOwner)
          })
          .map(item => {
            const row = item.row || {}
            const completion = String(row['Completion Status'] || '').trim().toLowerCase()
            const appointmentStatus = String(row['Appointment Status'] || '').trim().toLowerCase()
            const date = String(row.Date || '').slice(0,10)
            const completedDate = String(row['Completed Date'] || '').slice(0,10)
            const rescheduledTo = String(row['Rescheduled To'] || '').slice(0,10)
            const cancelledDate = String(row['Cancelled Date'] || '').slice(0,10)

            const rawStatus = String(row.Status || '').trim()
            const rawStatusLower = rawStatus.toLowerCase()
            const statusNote = String(row['Status Note'] || '').trim()
            const explicitlyMissed = ['missed','no show','no-show','noshow'].some(value =>
              rawStatusLower === value || rawStatusLower.includes(value)
            )

            let status = 'Scheduled'
            let statusClass = 'confirmed'
            if (completion === 'completed') {
              status = 'Completed'
              statusClass = 'confirmed'
            } else if (['cancelled','canceled'].includes(appointmentStatus)) {
              status = 'Cancelled'
              statusClass = 'pending'
            } else if (appointmentStatus === 'moved to another week') {
              status = 'Rescheduled'
              statusClass = 'pending'
            } else if (date && date < today && explicitlyMissed) {
              status = 'No-show'
              statusClass = 'pending'
            } else if (date && date < today) {
              status = 'Needs review'
              statusClass = 'locked'
            }

            const priceText = String(row.Price ?? '').replace(/[$,]/g,'').trim()
            const price = priceText === '' ? NaN : Number(priceText)
            const sortDate = completedDate || cancelledDate || rescheduledTo || date || item.weekStart
            const operationalStatusText = `${rawStatusLower} ${statusNote.toLowerCase()}`
            const suppressOperationalStatus = ['overdue','due soon','due'].some(value =>
              operationalStatusText.includes(value)
            )
            const note = suppressOperationalStatus ? '' : (statusNote || rawStatus)

            return {
              id:`${item.weekStart}-${row['Household ID'] || row.Owner}-${item.index}`,
              weekStart:item.weekStart,
              sourceRow:row,
              date,
              sortDate,
              completedDate,
              cancelledDate,
              rescheduledTo,
              status,
              statusClass,
              groomer:String(row.Groomer || '').trim(),
              dogs:String(row.Dogs || '').trim(),
              time:String(row['Start Time'] || row['Locked Time'] || '').trim(),
              price,
              note
            }
          })
          .filter(item => item.status !== 'Scheduled')
          .sort((a,b) => String(b.sortDate).localeCompare(String(a.sortDate)))

        setHistory(matches)
      } catch (err) {
        if (!cancelled) {
          setHistory([])
          setHistoryError(err.message || 'Could not load appointment history.')
        }
      } finally {
        if (!cancelled) setHistoryLoading(false)
      }
    }

    loadHistory()
    return () => { cancelled = true }
  }, [selectedClient, revision])

  return (
    <section>
      <div className="page-head">
        <div>
          <div className="eyebrow">Live Supabase data</div>
          <h1>Clients</h1>
        </div>
        {!viewerMode && <button className="primary-mini" onClick={() => { setDogMessage(''); setNewClientOpen(true); setDogEditor(blankDogForm()) }}><Plus size={16}/>New</button>}
      </div>

      <div className="search">
        <Search size={17}/>
        <input
          placeholder="Search owner or dog"
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
      </div>

      <div style={{display:'flex',gap:8,marginTop:12,marginBottom:4}}>
        <button
          type="button"
          className={clientFilter === 'all' ? 'primary-mini' : 'secondary-btn'}
          onClick={() => {
            setClientFilter('all')
            setAreaFilter('all')
          }}
          style={{flex:1,justifyContent:'center'}}
        >
          All Clients
        </button>
        <button
          type="button"
          className={clientFilter === 'needs' ? 'primary-mini' : 'secondary-btn'}
          onClick={() => setClientFilter('needs')}
          style={{flex:1,justifyContent:'center'}}
        >
          Needs Scheduling{needsSchedulingClients.length ? ` (${needsSchedulingClients.length})` : ''}
        </button>
      </div>

      {clientFilter === 'needs' && (
        <div style={{marginTop:10}}>
          <label style={{display:'block',fontSize:13,fontWeight:700,color:'#737b89',marginBottom:6}}>
            Area
          </label>
          <select
            value={areaFilter}
            onChange={event => setAreaFilter(event.target.value)}
            style={{
              width:'100%',
              padding:'13px 14px',
              border:'1px solid #deddd8',
              borderRadius:14,
              background:'#fff',
              color:'#172038',
              fontSize:16,
              fontWeight:600
            }}
          >
            <option value="all">All areas</option>
            {areaOptions.map(area => (
              <option key={area} value={area}>{area}</option>
            ))}
          </select>
        </div>
      )}

      <div className="prototype-note" style={{marginTop:10}}>
        {clientFilter === 'needs'
          ? 'Showing due or overdue clients who do not already have an active appointment booked.'
          : 'Clients who still need attention are shown first. Already-booked clients show Scheduled instead of Overdue.'}
      </div>

      {loading && <div className="prototype-note">Loading your clients…</div>}
      {error && <div className="login-message">{error}</div>}
      {!loading && !error && filtered.length === 0 && (
        <div className="prototype-note">{clientFilter === 'needs' ? (areaFilter !== 'all' ? `No clients in ${areaFilter} currently need scheduling.` : 'No clients currently need scheduling.') : 'No matching clients found.'}</div>
      )}

      <div className="client-list">
        {filtered.map((client, index) => {
          const status = client.dueInfo.status
          const statusStyle = client.dueInfo.scheduled
            ? {background:'#eef5fb',border:'#c9dced',color:'#31577a'}
            : status === 'Overdue'
              ? {background:'#fff0ef',border:'#e8b5b0',color:'#9b3832'}
              : ['Due today','Due this week'].includes(status)
                ? {background:'#fff7e8',border:'#ead39d',color:'#7a5719'}
                : status === 'Due soon'
                  ? {background:'#f3f1ed',border:'#ddd8cf',color:'#59616e'}
                  : {background:'#f7f7f5',border:'#e5e2dc',color:'#737b89'}
          return (
            <button
              key={`${client.owner}-${index}`}
              onClick={() => setSelectedClient(client)}
              style={{alignItems:'flex-start'}}
            >
              <div className="avatar"><Dog size={18}/></div>
              <span style={{minWidth:0,flex:1,textAlign:'left'}}>
                <strong style={{display:'block',fontSize:15,color:'#172038',lineHeight:1.25}}>{client.owner}</strong>
                <small style={{display:'block',fontSize:12,fontWeight:650,color:'#59616e',marginTop:3,lineHeight:1.35}}>
                  {client.dogs.join(' + ')}
                </small>
                {(client.area || client.groomer) && (
                  <small style={{display:'block',fontWeight:500,color:'#8a919d',marginTop:4}}>
                    {[client.area, client.groomer].filter(Boolean).join(' · ')}
                  </small>
                )}
                <small style={{display:'inline-flex',alignItems:'center',marginTop:7,padding:'4px 7px',borderRadius:999,border:`1px solid ${statusStyle.border}`,background:statusStyle.background,color:statusStyle.color,fontWeight:800,fontSize:10.5,lineHeight:1.2}}>
                  {client.dueInfo.scheduled
                    ? `${status} · ${textDate(client.dueInfo.scheduleDate)}${client.dueInfo.scheduleTime ? ` · ${displayClockTime(client.dueInfo.scheduleTime)}` : ''}`
                    : `${status}${client.dueInfo.dueDate ? ` · ${textDate(client.dueInfo.dueDate)}` : ''}`}
                </small>
              </span>
              <ChevronRight size={17} style={{marginTop:4}}/>
            </button>
          )
        })}
      </div>

      {dogEditor && (
        <div className="sheet-backdrop" onMouseDown={() => { setDogEditor(null); if(newClientOpen) setNewClientOpen(false) }}>
          <div className="sheet" onMouseDown={e=>e.stopPropagation()} style={{maxHeight:'90dvh',overflowY:'auto'}}>
            <div className="sheet-handle" />
            <div className="sheet-title"><div><span>{dogEditor.original_dog ? 'Edit dog' : newClientOpen ? 'New client' : 'Add dog'}</span><h2>{dogEditor.original_dog || dogEditor.dog || 'Dog details'}</h2></div><button className="icon-btn" onClick={()=>{setDogEditor(null);setNewClientOpen(false)}}><X size={18}/></button></div>
            <div className="form-grid">
              <label>Owner<input value={dogEditor.owner} onChange={e=>setDogEditor({...dogEditor,owner:e.target.value})}/></label>
              <label>Dog name<input value={dogEditor.dog} onChange={e=>setDogEditor({...dogEditor,dog:e.target.value})}/></label>
              <label>Phone<input value={dogEditor.phone} onChange={e=>setDogEditor({...dogEditor,phone:e.target.value})}/></label>
              <label>Groomer<select value={dogEditor.groomer} onChange={e=>{
                const next=e.target.value
                const patch={...dogEditor,groomer:next}
                if(newClientOpen && ['Jen','Haley'].includes(next)) {
                  const previousDefault=defaultFirstStopTime(dogEditor.first_appointment_groomer)
                  patch.first_appointment_groomer=next
                  if(!dogEditor.first_appointment_time || dogEditor.first_appointment_time===previousDefault) patch.first_appointment_time=defaultFirstStopTime(next)
                }
                setDogEditor(patch)
              }}>
                <option value="">Choose groomer</option><option>Either</option><option>Jen</option><option>Haley</option>
              </select></label>
              <label style={{gridColumn:'1 / -1'}}>Area<select value={dogEditor.area_mode==='new'?'__new__':dogEditor.area} onChange={e=>{
                const value=e.target.value
                if(value==='__new__') setDogEditor({...dogEditor,area_mode:'new',area:'',new_area:''})
                else setDogEditor({...dogEditor,area_mode:'existing',area:value,new_area:''})
              }}>
                <option value="">Choose area</option>
                {areaOptions.map(area=><option key={area} value={area}>{area}</option>)}
                {dogEditor.area && !areaOptions.includes(canonicalAreaLabel(dogEditor.area)) && <option value={dogEditor.area}>{dogEditor.area}</option>}
                <option value="__new__">+ Add new area</option>
              </select></label>
              {dogEditor.area_mode==='new' && <label style={{gridColumn:'1 / -1'}}>New area name<input value={dogEditor.new_area || ''} placeholder="Example: Tomball" onChange={e=>setDogEditor({...dogEditor,new_area:e.target.value})}/></label>}
              <label style={{gridColumn:'1 / -1'}}>Address<input value={dogEditor.address} onChange={e=>setDogEditor({...dogEditor,address:e.target.value})}/></label>
              <label>City<input value={dogEditor.city} onChange={e=>setDogEditor({...dogEditor,city:e.target.value})}/></label>
              <label>ZIP<input value={dogEditor.zip} onChange={e=>setDogEditor({...dogEditor,zip:e.target.value})}/></label>
              <label style={{gridColumn:'1 / -1'}}>Service<select value={dogEditor.service} onChange={e=>{
                const next=e.target.value
                setDogEditor({...dogEditor,service:next,first_appointment_service:appointmentServiceOptions.includes(next)?next:(dogEditor.first_appointment_service || 'Groom')})
              }}><option>Groom</option><option>Bath Only</option><option>Bath</option><option>Partial Groom</option><option>Service Varies</option></select></label>
              <label>Groom price<input type="number" inputMode="decimal" value={dogEditor.groom_price} onChange={e=>setDogEditor({...dogEditor,groom_price:e.target.value})}/></label>
              <label>Bath price<input type="number" inputMode="decimal" value={dogEditor.bath_price} onChange={e=>setDogEditor({...dogEditor,bath_price:e.target.value})}/></label>
              <label>Partial Groom price<input type="number" inputMode="decimal" value={dogEditor.partial_groom_price} onChange={e=>setDogEditor({...dogEditor,partial_groom_price:e.target.value})}/></label>
              <label>Groom time (min)<input type="number" inputMode="numeric" value={dogEditor.groom_minutes} onChange={e=>setDogEditor({...dogEditor,groom_minutes:e.target.value})}/></label>
              <label>Bath time (min)<input type="number" inputMode="numeric" value={dogEditor.bath_minutes} onChange={e=>setDogEditor({...dogEditor,bath_minutes:e.target.value})}/></label>
              <label>Partial Groom time (min)<input type="number" inputMode="numeric" value={dogEditor.partial_groom_minutes} onChange={e=>setDogEditor({...dogEditor,partial_groom_minutes:e.target.value})}/></label>
              <label>Frequency (weeks)<select value={dogEditor.frequency_mode==='custom'?'__custom__':String(dogEditor.frequency_weeks || '')} onChange={e=>{
                const value=e.target.value
                if(value==='__custom__') setDogEditor({...dogEditor,frequency_mode:'custom',frequency_weeks:commonFrequencyOptions.includes(String(dogEditor.frequency_weeks || ''))?'':dogEditor.frequency_weeks})
                else setDogEditor({...dogEditor,frequency_mode:'preset',frequency_weeks:value})
              }}>
                <option value="">Choose frequency</option>
                {commonFrequencyOptions.map(value=><option key={value} value={value}>{value} weeks</option>)}
                <option value="__custom__">Other</option>
              </select></label>
              {dogEditor.frequency_mode==='custom' && <label>Custom weeks<input type="number" min="1" inputMode="numeric" value={dogEditor.frequency_weeks} onChange={e=>setDogEditor({...dogEditor,frequency_weeks:e.target.value})}/></label>}
              {newClientOpen && <label style={{gridColumn:'1 / -1'}}>Have we serviced this dog before?<select value={dogEditor.prior_service || 'no'} onChange={e=>setDogEditor({...dogEditor,prior_service:e.target.value,last_groom:e.target.value==='no'?'':dogEditor.last_groom,last_bath:e.target.value==='no'?'':dogEditor.last_bath})}>
                <option value="no">No — this is their first visit with us</option>
                <option value="yes">Yes — we have service history</option>
              </select></label>}
              {(!newClientOpen || dogEditor.prior_service==='yes') && <>
                <label>Last groom<input type="date" value={dogEditor.last_groom} onChange={e=>setDogEditor({...dogEditor,last_groom:e.target.value})}/></label>
                <label>Last bath<input type="date" value={dogEditor.last_bath} onChange={e=>setDogEditor({...dogEditor,last_bath:e.target.value})}/></label>
              </>}
              {newClientOpen && dogEditor.prior_service==='no' && <div className="prototype-note" style={{gridColumn:'1 / -1',margin:0}}>
                Leave Last Groom / Last Bath blank. When you complete their first appointment, Grooming Planner will automatically save that service as their real history.
              </div>}

              {newClientOpen && <div style={{gridColumn:'1 / -1',display:'grid',gap:10}}>
                {(dogEditor.additional_dogs || []).map((extraDog,index) => <div key={index} style={{border:'1px solid #e7e4de',borderRadius:16,padding:14,display:'grid',gap:10,background:'#fbfaf8'}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
                    <strong style={{fontSize:15,color:'#172038'}}>Dog {index + 2}</strong>
                    <button type="button" className="secondary-btn" onClick={()=>removeAdditionalDog(index)} style={{padding:'8px 10px'}}>Remove</button>
                  </div>
                  <label>Dog name<input value={extraDog.dog || ''} onChange={e=>updateAdditionalDog(index,{dog:e.target.value})}/></label>
                  <label>Service<select value={extraDog.service || 'Groom'} onChange={e=>{
                    const next=e.target.value
                    updateAdditionalDog(index,{service:next,first_appointment_service:appointmentServiceOptions.includes(next)?next:(extraDog.first_appointment_service || 'Groom')})
                  }}><option>Groom</option><option>Bath Only</option><option>Bath</option><option>Partial Groom</option><option>Service Varies</option></select></label>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                    <label>Groom price<input type="number" inputMode="decimal" value={extraDog.groom_price || ''} onChange={e=>updateAdditionalDog(index,{groom_price:e.target.value})}/></label>
                    <label>Bath price<input type="number" inputMode="decimal" value={extraDog.bath_price || ''} onChange={e=>updateAdditionalDog(index,{bath_price:e.target.value})}/></label>
                    <label>Partial price<input type="number" inputMode="decimal" value={extraDog.partial_groom_price || ''} onChange={e=>updateAdditionalDog(index,{partial_groom_price:e.target.value})}/></label>
                    <label>Groom time<input type="number" inputMode="numeric" value={extraDog.groom_minutes || ''} onChange={e=>updateAdditionalDog(index,{groom_minutes:e.target.value})}/></label>
                    <label>Bath time<input type="number" inputMode="numeric" value={extraDog.bath_minutes || ''} onChange={e=>updateAdditionalDog(index,{bath_minutes:e.target.value})}/></label>
                    <label>Partial time<input type="number" inputMode="numeric" value={extraDog.partial_groom_minutes || ''} onChange={e=>updateAdditionalDog(index,{partial_groom_minutes:e.target.value})}/></label>
                  </div>
                  <label>Frequency (weeks)<select value={extraDog.frequency_mode==='custom'?'__custom__':String(extraDog.frequency_weeks || '')} onChange={e=>{
                    const value=e.target.value
                    if(value==='__custom__') updateAdditionalDog(index,{frequency_mode:'custom',frequency_weeks:commonFrequencyOptions.includes(String(extraDog.frequency_weeks || ''))?'':extraDog.frequency_weeks})
                    else updateAdditionalDog(index,{frequency_mode:'preset',frequency_weeks:value})
                  }}>
                    <option value="">Choose frequency</option>
                    {commonFrequencyOptions.map(value=><option key={value} value={value}>{value} weeks</option>)}
                    <option value="__custom__">Other</option>
                  </select></label>
                  {extraDog.frequency_mode==='custom' && <label>Custom weeks<input type="number" min="1" inputMode="numeric" value={extraDog.frequency_weeks || ''} onChange={e=>updateAdditionalDog(index,{frequency_weeks:e.target.value})}/></label>}
                  <label>Have we serviced this dog before?<select value={extraDog.prior_service || 'no'} onChange={e=>updateAdditionalDog(index,{prior_service:e.target.value,last_groom:e.target.value==='no'?'':extraDog.last_groom,last_bath:e.target.value==='no'?'':extraDog.last_bath})}>
                    <option value="no">No — first visit with us</option>
                    <option value="yes">Yes — we have service history</option>
                  </select></label>
                  {extraDog.prior_service==='yes' && <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                    <label>Last groom<input type="date" value={extraDog.last_groom || ''} onChange={e=>updateAdditionalDog(index,{last_groom:e.target.value})}/></label>
                    <label>Last bath<input type="date" value={extraDog.last_bath || ''} onChange={e=>updateAdditionalDog(index,{last_bath:e.target.value})}/></label>
                  </div>}
                </div>)}
                <button type="button" className="secondary-btn" onClick={()=>setDogEditor(current=>({...current,additional_dogs:[...(current.additional_dogs || []),blankAdditionalDog()]}))} style={{justifyContent:'center',padding:'12px 14px'}}>
                  <Plus size={16}/> Add another dog
                </button>
              </div>}

              {newClientOpen && dogEditor.prior_service==='no' && <div style={{gridColumn:'1 / -1',border:'1px solid #e7e4de',borderRadius:14,padding:12,display:'grid',gap:10}}>
                <label style={{display:'flex',gap:10,alignItems:'center',fontSize:13,fontWeight:800,width:'100%',minWidth:0,lineHeight:1.35}}>
                  <input type="checkbox" checked={Boolean(dogEditor.first_appointment_booked)} onChange={e=>setDogEditor({...dogEditor,first_appointment_booked:e.target.checked})} style={{width:22,height:22,minWidth:22,flex:'0 0 22px',margin:0,padding:0}}/>
                  <span style={{minWidth:0,whiteSpace:'normal',overflowWrap:'anywhere'}}>First appointment is already booked</span>
                </label>
                {dogEditor.first_appointment_booked && <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  <label style={{gridColumn:'1 / -1'}}>First appointment date<input type="date" value={dogEditor.first_appointment_date || ''} onChange={e=>setDogEditor({...dogEditor,first_appointment_date:e.target.value,first_appointment_override:false})}/></label>
                  <label>Groomer<select value={dogEditor.first_appointment_groomer || 'Jen'} onChange={e=>{
                    const next=e.target.value
                    const previousDefault=defaultFirstStopTime(dogEditor.first_appointment_groomer)
                    setDogEditor({...dogEditor,first_appointment_groomer:next,first_appointment_time:(!dogEditor.first_appointment_time || dogEditor.first_appointment_time===previousDefault)?defaultFirstStopTime(next):dogEditor.first_appointment_time,first_appointment_override:false})
                  }}><option>Jen</option><option>Haley</option></select></label>
                  <label>Time<input type="time" value={dogEditor.first_appointment_time || defaultFirstStopTime(dogEditor.first_appointment_groomer)} onChange={e=>setDogEditor({...dogEditor,first_appointment_time:e.target.value})}/></label>
                  <div style={{gridColumn:'1 / -1',display:'grid',gap:8}}>
                    <label>{dogEditor.dog || 'Dog 1'} service<select value={dogEditor.first_appointment_service || dogEditor.service || 'Groom'} onChange={e=>setDogEditor({...dogEditor,first_appointment_service:e.target.value})}>{appointmentServiceOptions.map(service=><option key={service}>{service}</option>)}</select></label>
                    {(dogEditor.additional_dogs || []).map((extraDog,index)=><label key={index}>{extraDog.dog || `Dog ${index+2}`} service<select value={extraDog.first_appointment_service || extraDog.service || 'Groom'} onChange={e=>updateAdditionalDog(index,{first_appointment_service:e.target.value})}>{appointmentServiceOptions.map(service=><option key={service}>{service}</option>)}</select></label>)}
                  </div>
                  <label style={{gridColumn:'1 / -1',display:'flex',gap:10,alignItems:'flex-start',fontSize:13,fontWeight:700,width:'100%',minWidth:0,lineHeight:1.35}}>
                    <input type="checkbox" checked={Boolean(dogEditor.first_appointment_fixed)} onChange={e=>setDogEditor({...dogEditor,first_appointment_fixed:e.target.checked})} style={{width:22,height:22,minWidth:22,flex:'0 0 22px',margin:0,padding:0}}/>
                    <span style={{minWidth:0,whiteSpace:'normal',overflowWrap:'anywhere'}}>Fixed time (otherwise the normal ±30 minute arrival window applies)</span>
                  </label>
                  {schedulingOverrideReasons(dogEditor.first_appointment_date,dogEditor.first_appointment_groomer,['Jen','Haley'].includes(dogEditor.groomer)?[dogEditor.groomer]:[]).length > 0 && <div className="schedule-check warning" style={{gridColumn:'1 / -1',margin:0}}>
                    <div className="schedule-check-title">Outside normal scheduling rules</div>
                    {schedulingOverrideReasons(dogEditor.first_appointment_date,dogEditor.first_appointment_groomer,['Jen','Haley'].includes(dogEditor.groomer)?[dogEditor.groomer]:[]).map((reason,index)=><div key={index}>• {reason}</div>)}
                    <label style={{display:'flex',gap:10,alignItems:'flex-start',marginTop:10,fontWeight:800}}>
                      <input type="checkbox" checked={Boolean(dogEditor.first_appointment_override)} onChange={e=>setDogEditor({...dogEditor,first_appointment_override:e.target.checked})} style={{width:20,height:20,minWidth:20,margin:0}}/>
                      <span>Manual override — book this first appointment anyway</span>
                    </label>
                  </div>}
                </div>}
              </div>}
            </div>
            <div className="prototype-note" style={{marginTop:12}}>Usual service: Groom, Bath Only, Bath, Partial Groom, or Service Varies. Each service can have its own price and time. For a brand-new client, use Add another dog for households with multiple dogs. Do not use an upcoming appointment as Last Groom or Last Bath — schedule the first visit separately above.</div>
            {dogMessage && <div className="login-message" style={{marginTop:10}}>{dogMessage}</div>}
            <div className="sheet-actions"><button className="ghost" onClick={()=>{setDogEditor(null);setNewClientOpen(false)}}>Cancel</button><button className="save" disabled={dogSaving} onClick={()=>saveDogForm(dogEditor,newClientOpen)}>{dogSaving?'Saving…':'Save'}</button></div>
          </div>
        </div>
      )}

      {selectedClient && (
        <div className="sheet-backdrop" onMouseDown={() => setSelectedClient(null)}>
          <div className="sheet" onMouseDown={event => event.stopPropagation()} style={{maxHeight:'88dvh',overflowY:'auto'}}>
            <div className="sheet-handle" />

            <div className="sheet-title">
              <div>
                <span>Client profile</span>
                <h2>{selectedClient.owner}</h2>
                <p>{selectedClient.dogs.join(' + ')}</p>
              </div>

              <button className="icon-btn" onClick={() => setSelectedClient(null)}>
                <X size={18}/>
              </button>
            </div>

            <div style={{
              margin:'2px 0 16px',
              padding:'13px 14px',
              borderRadius:15,
              border:`1px solid ${selectedClient.scheduleInfo ? '#c9dced' : ['Overdue','Due today','Due this week','Due soon'].includes(selectedClient.dueInfo.status) ? '#ead39d' : '#e5e2dc'}`,
              background:selectedClient.scheduleInfo ? '#eef5fb' : ['Overdue','Due today','Due this week','Due soon'].includes(selectedClient.dueInfo.status) ? '#fff7e8' : '#f8f7f4'
            }}>
              {selectedClient.scheduleInfo ? (
                <>
                  <div style={{fontSize:11,fontWeight:900,textTransform:'uppercase',letterSpacing:'.08em',color:'#647187'}}>Next appointment</div>
                  <div style={{fontSize:15,fontWeight:900,color:'#172038',marginTop:4}}>
                    {textDate(selectedClient.scheduleInfo.date)}{selectedClient.scheduleInfo.time ? ` · ${displayClockTime(selectedClient.scheduleInfo.time)}` : ''}
                  </div>
                  <div style={{fontSize:12,color:'#59616e',marginTop:3}}>
                    {[selectedClient.scheduleInfo.groomer,selectedClient.scheduleInfo.dogs].filter(Boolean).join(' · ')}
                  </div>
                </>
              ) : (
                <>
                  <div style={{fontSize:11,fontWeight:900,textTransform:'uppercase',letterSpacing:'.08em',color:'#7a5719'}}>Rebook status</div>
                  <div style={{fontSize:15,fontWeight:900,color:'#172038',marginTop:4}}>
                    {['Overdue','Due today','Due this week','Due soon'].includes(selectedClient.dueInfo.status) ? 'Needs scheduling' : 'No appointment booked'}
                  </div>
                  <div style={{fontSize:12,color:'#59616e',marginTop:3}}>
                    {selectedClient.dueInfo.status}{selectedClient.dueInfo.dueDate ? ` · next due ${textDate(selectedClient.dueInfo.dueDate)}` : ''}
                  </div>
                </>
              )}
            </div>

            {!viewerMode && <div className="client-quick-actions">
              <button type="button" disabled={!selectedClient.phone} onClick={()=>{
                if (selectedClient.scheduleInfo) openSms(selectedClient.phone,confirmationMessage({owner:selectedClient.owner,dogs:selectedClient.scheduleInfo.dogs || selectedClient.dogs.join(' + '),date:selectedClient.scheduleInfo.date,time:selectedClient.scheduleInfo.time}))
                else openSms(selectedClient.phone)
              }}><MessageCircle size={15}/>{selectedClient.scheduleInfo ? 'Text confirmation' : 'Text client'}</button>
              <button type="button" disabled={!selectedClient.phone} onClick={()=>openCall(selectedClient.phone)}>Call</button>
              <button type="button" onClick={()=>{onRebook?.(selectedClient);setSelectedClient(null)}}><CalendarDays size={15}/> Book appointment</button>
            </div>}

            {!viewerMode && !selectedClient.scheduleInfo && <div className="communication-card">
              <div><strong>Rebooking text</strong><span>Choose the day you will be in {selectedClient.area || 'their area'}.</span></div>
              <div className="rebook-text-row">
                <input type="date" value={rebookTextDate} min={businessDateKey()} onChange={event=>setRebookTextDate(event.target.value)} aria-label="Date you will be in this client's area"/>
                <button type="button" disabled={!selectedClient.phone || !rebookTextDate} onClick={()=>openSms(selectedClient.phone,rebookingMessage({owner:selectedClient.owner,date:rebookTextDate}))}><MessageCircle size={14}/> Text rebooking</button>
              </div>
              {rebookTextDate && <div className="communication-preview">{rebookingMessage({owner:selectedClient.owner,date:rebookTextDate})}</div>}
            </div>}

            <div className="form-grid">
              <label>
                Phone
                <input readOnly value={viewerMode ? 'Hidden in viewer mode' : (selectedClient.phone || '—')} />
              </label>

              <label>
                Groomer
                <input readOnly value={selectedClient.groomer || '—'} />
              </label>

              <label style={{gridColumn:'1 / -1'}}>
                Address
                <input
                  readOnly
                  value={viewerMode ? 'Hidden in viewer mode' : ([selectedClient.address,selectedClient.city,selectedClient.state,selectedClient.zip].filter(Boolean).join(', ') || '—')}
                />
              </label>

              <label style={{gridColumn:'1 / -1'}}>
                Area
                <select
                  value={addingArea ? '__new__' : areaEditValue}
                  disabled={viewerMode || areaSaving}
                  onChange={event => {
                    const value = event.target.value
                    setAreaMessage('')
                    if (value === '__new__') {
                      setAddingArea(true)
                      setNewArea('')
                    } else {
                      setAddingArea(false)
                      setAreaEditValue(value)
                    }
                  }}
                  style={{width:'100%'}}
                >
                  {!areaEditValue && <option value="">Choose an area</option>}
                  {areaEditValue && !areaOptions.includes(areaEditValue) && (
                    <option value={areaEditValue}>{areaEditValue}</option>
                  )}
                  {areaOptions.map(area => <option key={area} value={area}>{area}</option>)}
                  <option value="__new__">+ Add new area</option>
                </select>
              </label>

              {!viewerMode && (addingArea ? (
                <div style={{gridColumn:'1 / -1',display:'grid',gridTemplateColumns:'1fr auto',gap:8,alignItems:'end'}}>
                  <label>
                    New area name
                    <input
                      value={newArea}
                      disabled={areaSaving}
                      placeholder="Example: Tomball"
                      onChange={event => setNewArea(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="primary-mini"
                    disabled={areaSaving || !newArea.trim()}
                    onClick={() => saveClientArea(newArea)}
                    style={{height:46,marginBottom:1}}
                  >
                    {areaSaving ? 'Saving…' : 'Add & save'}
                  </button>
                </div>
              ) : (
                <div style={{gridColumn:'1 / -1',display:'flex',justifyContent:'flex-end'}}>
                  <button
                    type="button"
                    className="secondary-btn"
                    disabled={areaSaving || !areaEditValue || canonicalAreaLabel(selectedClient.area) === canonicalAreaLabel(areaEditValue)}
                    onClick={() => saveClientArea(areaEditValue)}
                  >
                    {areaSaving ? 'Saving…' : 'Save Area'}
                  </button>
                </div>
              ))}

              {areaMessage && (
                <div className="prototype-note" style={{gridColumn:'1 / -1',marginTop:-2}} role="status">
                  {areaMessage}
                </div>
              )}

              <label>
                Dogs
                <input readOnly value={selectedClient.dogs.join(', ') || '—'} />
              </label>
            </div>

            <div style={{marginTop:18}}>
              <div className="eyebrow" style={{marginBottom:8}}>Dogs & services</div>
              <div className="client-list">
                {selectedClient.rows.map((row, index) => {
                  const dog = valueOf(row, 'dog', 'Dog') || 'Unnamed dog'
                  const servicePattern = valueOf(row, 'service_pattern', 'Service Pattern')
                  const nextService = canonicalServiceLabel(servicePattern) || canonicalServiceLabel(valueOf(row, 'next_service', 'Next Service'))
                  const price = valueOf(row, 'price', 'Price')
                  const minutes = valueOf(row, 'minutes', 'Minutes')
                  const frequency = valueOf(row, 'frequency_weeks', 'Frequency Weeks')
                  const lastGroom = valueOf(row, 'last_groom', 'Last Groom', 'last_groom_date', 'Last Groom Date')
                  const lastBath = valueOf(row, 'last_bath', 'Last Bath', 'last_bath_date', 'Last Bath Date')
                  const baseDue = dogDueInfo(row)
                  const due = scheduledDueInfo(baseDue,selectedClient.scheduleInfo)

                  return (
                    <div
                      key={`${dog}-${index}`}
                      style={{
                        background:'#fff',
                        border:'1px solid #ebe8e2',
                        borderRadius:14,
                        padding:'12px 14px',
                        marginBottom:8
                      }}
                    >
                      <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'flex-start'}}>
                        <div style={{minWidth:0}}>
                          <strong style={{display:'block',fontSize:15,color:'#172038'}}>{dog}</strong>
                          <div style={{fontSize:11,color:'#7b828e',marginTop:3}}>
                            {[nextService || servicePattern, frequency !== '' ? `Every ${frequency} wks` : ''].filter(Boolean).join(' · ') || 'Service details not set'}
                          </div>
                        </div>
                        {!viewerMode && <button type="button" className="secondary-btn" onClick={() => { setDogMessage(''); editDog(row) }} style={{flex:'0 0 auto'}}>Edit</button>}
                      </div>

                      {!lastGroom && !lastBath ? (
                        <div style={{marginTop:10,padding:'9px 10px',borderRadius:11,background:selectedClient.scheduleInfo ? '#eef5fb' : '#f7f7f5',border:'1px solid #e3e2de',fontSize:11.5,color:'#59616e'}}>
                          {selectedClient.scheduleInfo
                            ? `No completed service yet · first visit ${textDate(selectedClient.scheduleInfo.date)}${selectedClient.scheduleInfo.time ? ` at ${displayClockTime(selectedClient.scheduleInfo.time)}` : ''}`
                            : 'No completed service history yet.'}
                        </div>
                      ) : (
                        <div style={{fontSize:11.5,color:'#59616e',lineHeight:1.55,marginTop:10}}>
                          {lastGroom && <div><strong>Last groom:</strong> {textDate(lastGroom)}</div>}
                          {lastBath && <div><strong>Last bath:</strong> {textDate(lastBath)}</div>}
                        </div>
                      )}

                      <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',marginTop:10,paddingTop:9,borderTop:'1px solid #eeeae4'}}>
                        <div>
                          <div style={{fontSize:10.5,fontWeight:850,textTransform:'uppercase',letterSpacing:'.05em',color:'#8a919d'}}>Next due</div>
                          <div style={{fontSize:12,fontWeight:800,color:'#172038',marginTop:2}}>{due.dueDate ? textDate(due.dueDate) : 'Not set'}</div>
                        </div>
                        <div style={{fontSize:10.5,fontWeight:850,padding:'4px 7px',borderRadius:999,background:
                          due.scheduled ? '#eef5fb' : due.status === 'Overdue' ? '#fff0ef' : ['Due today','Due this week'].includes(due.status) ? '#fff7e8' : '#f4f3f0',
                          color:due.scheduled ? '#31577a' : due.status === 'Overdue' ? '#9b3832' : ['Due today','Due this week'].includes(due.status) ? '#7a5719' : '#687080'}}>
                          {due.status}
                        </div>
                      </div>

                      <div style={{fontSize:11.5,color:'#7b828e',marginTop:9,lineHeight:1.5}}>
                        {[servicePattern,
                          price !== '' ? `$${price}` : '',
                          minutes !== '' ? `${minutes} min` : '',
                        ].filter(Boolean).join(' · ') || 'Saved price/time not set'}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {!viewerMode && <div style={{display:'flex',justifyContent:'flex-end',marginTop:10}}>
              <button type="button" className="primary-mini" onClick={() => { const form=blankDogForm(selectedClient); setDogMessage(''); setDogEditor(form); setSelectedClient(null) }}><Plus size={15}/>Add Dog</button>
            </div>}

            <div style={{marginTop:18}}>
              <div className="eyebrow" style={{marginBottom:8}}>Appointment history</div>
              {historyLoading && <div className="prototype-note">Loading appointment history…</div>}
              {historyError && <div className="login-message">{historyError}</div>}
              {!historyLoading && !historyError && history.length === 0 && (
                <div className="prototype-note">No completed, cancelled, rescheduled, no-show, or past appointments found yet.</div>
              )}
              {!historyLoading && !historyError && history.length > 0 && (
                <div className="appt-list">
                  {history.slice(0,20).map(item => {
                    const needsReview = item.status === 'Needs review'
                    const CardTag = needsReview ? 'button' : 'div'
                    return (
                    <CardTag
                      className="appt-card"
                      key={item.id}
                      type={needsReview ? 'button' : undefined}
                      onClick={needsReview ? () => onOpen?.({
                        id:item.id,
                        owner:selectedClient.owner,
                        dogs:item.dogs || selectedClient.dogs.join(' + '),
                        weekStart:item.weekStart,
                        sourceRow:item.sourceRow
                      }) : undefined}
                      style={{
                        ...(needsReview ? {width:'100%',textAlign:'left',cursor:'pointer',font:'inherit',color:'inherit'} : {}),
                        background:item.status === 'Completed' ? '#edf7ef' : item.status === 'Cancelled' ? '#fff4f2' : item.status === 'Rescheduled' ? '#eef5fb' : item.status === 'No-show' ? '#fff7e8' : '#fff',
                        borderColor:item.status === 'Completed' ? '#bfd9c5' : item.status === 'Cancelled' ? '#e9c2bd' : item.status === 'Rescheduled' ? '#c9dced' : item.status === 'No-show' ? '#ead39d' : '#e5e2dc'
                      }}
                    >
                      <div className="time-pill">{item.date ? textDate(item.date).replace(/, \d{4}$/,'') : '—'}</div>
                      <div className="appt-main">
                        <div className="appt-topline">
                          <strong>{item.status}</strong>
                          <span className={`status-dot ${item.statusClass}`} />
                        </div>
                        <div className="dogs">{item.dogs || selectedClient.dogs.join(' + ')}</div>
                        <div className="meta">
                          {item.groomer && <span><Users size={14}/>{item.groomer}</span>}
                          {item.time && <span><Clock3 size={14}/>{item.time}</span>}
                          {Number.isFinite(item.price) && <span><WalletCards size={14}/>${Math.round(item.price)}</span>}
                        </div>
                        {item.status === 'Completed' && item.completedDate && (
                          <div style={{fontSize:11,color:'#7b828e',marginTop:5}}>Completed {textDate(item.completedDate)}</div>
                        )}
                        {item.status === 'Cancelled' && item.cancelledDate && (
                          <div style={{fontSize:11,color:'#7b828e',marginTop:5}}>Cancelled {textDate(item.cancelledDate)}</div>
                        )}
                        {item.status === 'Rescheduled' && item.rescheduledTo && (
                          <div style={{fontSize:11,color:'#7b828e',marginTop:5}}>Moved to {textDate(item.rescheduledTo)}</div>
                        )}
                        {item.status === 'No-show' && item.date && (
                          <div style={{fontSize:11,color:'#7b828e',marginTop:5}}>No-show on {textDate(item.date)}</div>
                        )}
                        {item.note && <div style={{fontSize:11,color:'#7b828e',marginTop:5}}>{item.note}</div>}
                        {needsReview && <div style={{fontSize:11,color:'#53617a',marginTop:6,fontWeight:700}}>Tap to review →</div>}
                      </div>
                    </CardTag>
                  )})}
                </div>
              )}
              {history.length > 20 && (
                <div className="prototype-note">Showing the 20 most recent history entries.</div>
              )}
            </div>

            {selectedClient.notes && (
              <div style={{marginTop:14}}>
                <div className="eyebrow" style={{marginBottom:6}}>Notes</div>
                <div className="prototype-note">{selectedClient.notes}</div>
              </div>
            )}

            <div className="sheet-actions">
              <button className="save" onClick={() => setSelectedClient(null)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function More({dogs,revision,onAsk,onRebook}) {
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
  const scheduledRevenue = bookedRows.reduce((sum,row)=>sum+priced(row),0)
  const completedRevenue = completedRows.reduce((sum,row)=>sum+priced(row),0)
  const remainingRevenue = Math.max(0,scheduledRevenue-completedRevenue)
  const dogCount = bookedRows.reduce((sum,row)=>sum+dogCountForRow(row),0)
  const cancelledCount = rows.filter(row=>rowState(row).cancelled).length
  const noShowCount = rows.filter(row=>rowState(row).noShow).length

  const groomerTotals = ['Jen','Haley'].map(name=>{
    const groomerRows = bookedRows.filter(row=>String(row?.Groomer || '').trim()===name)
    const done = groomerRows.filter(row=>rowState(row).completed)
    return {name,appointments:groomerRows.length,scheduled:groomerRows.reduce((sum,row)=>sum+priced(row),0),completed:done.reduce((sum,row)=>sum+priced(row),0)}
  })

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
          <div style={reportCard}><div style={smallLabel}>Remaining</div><div style={metricValue}>{money(remainingRevenue)}</div><div style={{fontSize:11,color:'#7b828e',marginTop:5}}>scheduled, not completed</div></div>
          <div style={reportCard}><div style={smallLabel}>Dogs</div><div style={metricValue}>{dogCount}</div><div style={{fontSize:11,color:'#7b828e',marginTop:5}}>across {bookedRows.length} stops</div></div>
        </div>

        {!weekRecord && <div className="prototype-note" style={{marginTop:12}}>No saved schedule exists for this week yet.</div>}

        <div style={{...reportCard,marginTop:14}}>
          <div className="section-title" style={{margin:'0 0 12px'}}><h3>Groomer totals</h3></div>
          <div style={{display:'grid',gap:10}}>
            {groomerTotals.map(item=><div key={item.name} style={{display:'grid',gridTemplateColumns:'1fr auto',gap:10,alignItems:'center',padding:12,borderRadius:14,background:item.name==='Jen'?'#f1f3ff':'#eff8f0',border:`1px solid ${item.name==='Jen'?'#dfe3ff':'#d9ecdc'}`}}>
              <div><strong style={{fontSize:14,color:'#172038'}}>{item.name}</strong><div style={{fontSize:11,color:'#7b828e',marginTop:3}}>{item.appointments} appointment{item.appointments===1?'':'s'}</div></div>
              <div style={{textAlign:'right'}}><strong style={{fontSize:16,color:'#172038'}}>{money(item.scheduled)}</strong><div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{money(item.completed)} completed</div></div>
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
          <button type="button" className="ghost" style={{width:'100%',marginTop:10}} onClick={()=>onAsk?.('Who still needs to confirm this week?')}>Ask Planner who still needs confirmation</button>
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
          {rebooking.length>5 && <button type="button" className="ghost" style={{width:'100%',marginTop:10}} onClick={()=>onAsk?.("Who hasn't been booked back yet?")}>View all with Ask Planner</button>}
        </div>

        <div className="menu-list" style={{marginTop:16}}>
          <button><Settings size={19}/><span>Scheduling settings</span><ChevronRight size={17}/></button>
          <button><Route size={19}/><span>Route settings</span><ChevronRight size={17}/></button>
          <button type="button" onClick={()=>onAsk?.('Show me this week\'s business summary')}><WalletCards size={19}/><span>Ask Planner about the week</span><ChevronRight size={17}/></button>
          <button type="button" onClick={async()=>{ await supabase?.auth?.signOut?.() }}><LogOut size={19}/><span>Sign out</span><ChevronRight size={17}/></button>
        </div>
      </>}
    </section>
  )
}

function completionBlockReason(row,today) {
  if (String(row?.['Completion Status'] || '').trim().toLowerCase()==='completed') return 'This appointment is already completed.'
  if (['cancelled','canceled','moved to another week'].includes(String(row?.['Appointment Status'] || '').trim().toLowerCase())) return 'Cancelled or moved appointments cannot be completed.'
  const date = String(row?.Date || '').slice(0,10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'This appointment needs a valid scheduled date.'
  if (!String(row?.Dogs || '').trim()) return 'Service details are missing. Update this appointment in the existing planner first.'
  return ''
}

function appointmentTimeInput(value) {
  const minutes = clockMinutesForDisplay(String(value || ''))
  return Number.isFinite(minutes)
    ? `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(Math.floor(minutes%60)).padStart(2,'0')}` : ''
}

function rescheduleValidation(date,time,groomer,today) {
  if (!date || date<today) return 'Choose today or a future date.'
  const day = new Date(`${date}T12:00:00Z`).getUTCDay()
  if (![1,2,3,4,5].includes(day)) return 'Choose Monday through Friday.'
  if (!['Jen','Haley'].includes(groomer)) return 'Choose a groomer.'
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return 'Choose a valid arrival time.'
  return ''
}


function activeScheduleRow(row) {
  const appointmentStatus = String(row?.['Appointment Status'] || '').trim().toLowerCase()
  const completion = String(row?.['Completion Status'] || '').trim().toLowerCase()
  const status = String(row?.Status || '').trim().toLowerCase()
  if (!String(row?.Owner || '').trim()) return false
  if (completion === 'completed') return false
  if (['cancelled','canceled','moved to another week','missed','no show','no-show','noshow'].includes(appointmentStatus)) return false
  if (['cancelled','canceled','rescheduled','completed','missed','no show','no-show','noshow'].includes(status)) return false
  return true
}

function scheduleRowDuration(row, fallback=60) {
  const raw = Number(String(row?.Minutes ?? row?.['Minutes'] ?? '').replace(/[^0-9.]/g,''))
  return Number.isFinite(raw) && raw > 0 ? raw : fallback
}

function sameSourceAppointment(candidate, source) {
  return String(candidate?.['Household ID'] || '').trim() === String(source?.['Household ID'] || '').trim()
    && String(candidate?.Owner || '').trim().toLowerCase() === String(source?.Owner || '').trim().toLowerCase()
    && String(candidate?.Date || '').slice(0,10) === String(source?.Date || '').slice(0,10)
    && appointmentTimeInput(candidate?.['Start Time'] || candidate?.['Locked Time']) === appointmentTimeInput(source?.['Start Time'] || source?.['Locked Time'])
}

function scheduleRiskBadge(severity) {
  return severity === 'danger' ? 'Conflict' : severity === 'warning' ? 'Tight route' : 'Looks good'
}

function CompletionSheet({appt,dogs,onClose,onSaved,onConfirmation,viewerMode=false}) {
  const row = appt.sourceRow
  const today = businessDateKey()
  const originalDate = String(row.Date || today).slice(0,10)
  const [mode,setMode] = useState(appt?._initialMode || 'edit')
  const [targetDate,setTargetDate] = useState(originalDate<today?today:originalDate)
  const [targetTime,setTargetTime] = useState(()=>appointmentTimeInput(row['Start Time'] || row['Locked Time'] || row['Original Start Time']))
  const [targetGroomer,setTargetGroomer] = useState(String(row.Groomer || '').trim())
  const [note,setNote] = useState(String(row['Status Note'] || ''))
  const [editTime,setEditTime] = useState(()=>appointmentTimeInput(row['Start Time'] || row['Locked Time'] || row['Original Start Time']))
  const [editGroomer,setEditGroomer] = useState(String(row.Groomer || '').trim())
  const [editFixed,setEditFixed] = useState(Boolean(String(row['Locked Time'] || '').trim()))
  const [serviceRows,setServiceRows] = useState(()=>parseAppointmentDogServices(row.Dogs))
  const [saving,setSaving] = useState(false)
  const [error,setError] = useState('')
  const [scheduleCheck,setScheduleCheck] = useState({loading:false,severity:'ok',messages:[]})
  const [manualOverride,setManualOverride] = useState(false)
  const [showTextMenu,setShowTextMenu] = useState(false)
  const [showLateOptions,setShowLateOptions] = useState(false)
  const [etaLoading,setEtaLoading] = useState(false)
  const [lastContact,setLastContact] = useState(()=>readAppointmentContact(appt))
  const savingRef = React.useRef(false)
  const closeRef = React.useRef(null)
  const dialogRef = React.useRef(null)
  const blocked = completionBlockReason(row,today)
  const completed = String(row['Completion Status'] || '').trim().toLowerCase()==='completed'
  const moved = String(row['Appointment Status'] || '').trim().toLowerCase()==='moved to another week'
  const cancelled = ['cancelled','canceled'].includes(String(row['Appointment Status'] || '').trim().toLowerCase())
  const missed = ['missed','no show','no-show','noshow'].some(value => String(row['Appointment Status'] || row.Status || '').trim().toLowerCase().includes(value))
  const householdDogs = (dogs || []).filter(dog=>String(dog.household_id || dog['Household ID'] || '').trim()===String(row['Household ID'] || '').trim())
  const servicePriceFor = (name,service) => {
    const dog = householdDogs.find(item=>String(item.dog || item.Dog || '').trim().toLowerCase()===String(name || '').trim().toLowerCase())
    if (!dog) return null
    const raw = service==='Partial Groom' ? (dog.partial_groom_price ?? dog['Partial Groom Price']) : (service==='Bath' || service==='Bath Only') ? (dog.bath_price ?? dog['Bath Price']) : (dog.groom_price ?? dog['Groom Price'] ?? dog.price ?? dog.Price)
    const n=Number(String(raw ?? '').replace(/[$,]/g,'')); return Number.isFinite(n)?n:null
  }
  const serviceMinutesFor = (name,service) => {
    const dog = householdDogs.find(item=>String(item.dog || item.Dog || '').trim().toLowerCase()===String(name || '').trim().toLowerCase())
    if (!dog) return null
    const raw = service==='Partial Groom' ? (dog.partial_groom_minutes ?? dog['Partial Groom Minutes']) : (service==='Bath' || service==='Bath Only') ? (dog.bath_minutes ?? dog['Bath Minutes']) : (dog.groom_minutes ?? dog['Groom Minutes'] ?? dog.minutes ?? dog.Minutes)
    const n=Number(String(raw ?? '').replace(/[^0-9.]/g,'')); return Number.isFinite(n)?n:null
  }
  const serviceTotal = serviceRows.reduce((sum,item)=>{ const n=servicePriceFor(item.name,item.service); return sum+(Number.isFinite(n)?n:0) },0)
  const serviceMinutesTotal = serviceRows.reduce((sum,item)=>{ const n=serviceMinutesFor(item.name,item.service); return sum+(Number.isFinite(n)?n:0) },0)
  const missingServicePrice = serviceRows.some(item=>!Number.isFinite(servicePriceFor(item.name,item.service)))
  const missingServiceMinutes = serviceRows.some(item=>!Number.isFinite(serviceMinutesFor(item.name,item.service)))
  const restrictions = householdDogs.map(dog=>String(dog.groomer || dog.Groomer || '').trim()).filter(name=>['Jen','Haley'].includes(name))
  const assignedGroomers = [...new Set(restrictions)]
  const groomers = ['Jen','Haley']
  const editOverrideReasons = schedulingOverrideReasons(originalDate,editGroomer,assignedGroomers)
  const rescheduleOverrideReasons = schedulingOverrideReasons(targetDate,targetGroomer,assignedGroomers)
  const close = () => { if (!savingRef.current) onClose() }
  const clientAddress = appointmentAddress(appt,clientAddressLookup(dogs || []))
  const copyClientAddress = async () => {
    if (!clientAddress) { setError('No saved street address for this client.'); return }
    try { await navigator.clipboard.writeText(clientAddress); setError('Address copied.') }
    catch { setError('Could not copy the address automatically.') }
  }


  const completeNow = async () => {
    if (savingRef.current || completed || moved || missed) return
    if (blocked) { setError(blocked); return }
    savingRef.current=true; setSaving(true); setError('')
    try {
      if (!supabase) throw new Error('Your schedule connection is not configured.')
      const {data,error:saveError} = await supabase.rpc('complete_grooming_appointment_safe',{
        p_week_start:appt.weekStart,
        p_expected_row:row,
        p_completed_date:originalDate
      })
      if (saveError) {
        if (saveError.code==='PGRST202' || saveError.code==='42883') throw new Error('Complete/Undo has not been enabled yet. Run its one-time Supabase setup first.')
        throw saveError
      }
      if (!['completed','already_completed'].includes(data?.status)) throw new Error('The completion could not be confirmed. Close and refresh before trying again.')
      if (data.status==='completed') onSaved(`${appt.owner} marked completed. Service history updated for ${data.dogs_updated} dog${data.dogs_updated===1?'':'s'}.`)
      else onSaved(`${appt.owner} was already completed.`)
    } catch (err) {
      setError(err.message || 'Could not confirm completion. Close and refresh before trying again.')
    } finally {
      savingRef.current=false; setSaving(false)
    }
  }

  useEffect(()=>{
    const previous = document.activeElement
    closeRef.current?.focus()
    const keydown = event => {
      if(event.key==='Escape' && !savingRef.current) onClose()
      if(event.key==='Tab') {
        const focusable = Array.from(dialogRef.current?.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)') || [])
        const first=focusable[0], last=focusable[focusable.length-1]
        if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus()}
        else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus()}
      }
    }
    document.addEventListener('keydown',keydown)
    return ()=>{document.removeEventListener('keydown',keydown);previous?.focus?.()}
  },[])

  useEffect(()=>{ setManualOverride(false) },[mode,editGroomer,targetGroomer,targetDate])

  useEffect(()=>{
    if (!supabase || completed || moved || missed || !['edit','reschedule'].includes(mode)) {
      setScheduleCheck({loading:false,severity:'ok',messages:[]})
      return
    }
    const date = mode==='reschedule' ? targetDate : originalDate
    const time = mode==='reschedule' ? targetTime : editTime
    const groomer = mode==='reschedule' ? targetGroomer : editGroomer
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || !['Jen','Haley'].includes(groomer)) return
    let cancelledCheck = false
    const timer = setTimeout(async()=>{
      setScheduleCheck({loading:true,severity:'ok',messages:[]})
      try {
        const weekStart = mondayForDate(date)
        const {data,error:loadError} = await supabase.from('weekly_drafts').select('plan_json').eq('week_start',weekStart).limit(1)
        if (loadError) throw loadError
        if (cancelledCheck) return
        const rawRows = Array.isArray(data?.[0]?.plan_json) ? data[0].plan_json : []
        const existing = rawRows.filter(item=>activeScheduleRow(item)
          && String(item.Date || '').slice(0,10)===date
          && String(item.Groomer || '').trim()===groomer
          && !(weekStart===appt.weekStart && sameSourceAppointment(item,row)))
        const candidate = {...row,Date:date,Groomer:groomer,'Start Time':time,'Locked Time':editFixed?time:''}
        const candidateId = 'candidate-edit'
        const candidateStart = clockMinutesForDisplay(time)
        const candidateDuration = mode==='edit' ? scheduleRowDuration(row, serviceMinutesTotal || 60) : scheduleRowDuration(row, serviceMinutesTotal || 60)
        const messages = []
        let severity = 'ok'

        const duplicate = existing.find(item=>String(item['Household ID'] || '').trim() && String(item['Household ID'] || '').trim()===String(row['Household ID'] || '').trim())
        if (duplicate) {
          messages.push(`${appt.owner} already has another active appointment on ${date}.`)
          severity = 'danger'
        }

        for (const item of existing) {
          const otherStart = clockMinutesForDisplay(item['Start Time'] || item['Locked Time'])
          if (!Number.isFinite(otherStart) || !Number.isFinite(candidateStart)) continue
          const otherDuration = scheduleRowDuration(item,60)
          if (candidateStart < otherStart + otherDuration && candidateStart + candidateDuration > otherStart) {
            messages.push(`Overlaps ${String(item.Owner || 'another client').trim()} based on the saved service times.`)
            severity = 'danger'
          }
        }

        const lookup = clientAddressLookup(dogs)
        const routeRows = [...existing,candidate].map((item,index)=>({
          id:item===candidate?candidateId:`existing-${index}`,
          owner:String(item.Owner || '').trim(),
          time:String(item['Start Time'] || item['Locked Time'] || '').trim(),
          row:item,
          address:appointmentAddress({sourceRow:item,owner:String(item.Owner || '').trim()},lookup)
        })).filter(item=>item.owner && Number.isFinite(clockMinutesForDisplay(item.time))).sort((a,b)=>clockMinutesForDisplay(a.time)-clockMinutesForDisplay(b.time))
        const candidateIndex = routeRows.findIndex(item=>item.id===candidateId)
        if (candidateIndex>=0 && routeRows.every(item=>item.address)) {
          const signature = routeRows.map(stop=>`${stop.id}:${stop.address}:${stop.time}`).join('|')
          const cacheKey = `edit-route-check-v1:${date}:${groomer}:${signature}`
          let routePayload = null
          try {
            const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null')
            if (cached?.payload && Number(cached.savedAt) > Date.now()-15*60*1000) routePayload = cached.payload
          } catch {}
          if (!routePayload) {
            const response = await fetch('/api/google-route',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({groomer,stops:routeRows.map(({row,...stop})=>stop)})})
            const payload = await response.json().catch(()=>({}))
            if (response.ok) {
              routePayload = payload
              try { localStorage.setItem(cacheKey,JSON.stringify({savedAt:Date.now(),payload})) } catch {}
            }
          }
          if (routePayload?.legs) {
            const checkPair = (fromIndex,toIndex) => {
              if (fromIndex < 0 || toIndex < 0 || fromIndex >= routeRows.length || toIndex >= routeRows.length) return
              const from = routeRows[fromIndex], to = routeRows[toIndex]
              const leg = routePayload.legs.find(item=>item.fromId===from.id && item.toId===to.id)
              if (!leg) return
              const fromStart = clockMinutesForDisplay(from.time)
              const toStart = clockMinutesForDisplay(to.time)
              const fromDuration = from.id===candidateId ? candidateDuration : scheduleRowDuration(from.row,60)
              const estimatedArrival = fromStart + fromDuration + Number(leg.minutes || 0)
              const minutesLate = estimatedArrival - toStart
              if (minutesLate > 30) {
                messages.push(`Google route warning: ${to.owner} could be about ${Math.ceil(minutesLate)} min after the scheduled time — outside the ±30 min window.`)
                severity = 'danger'
              } else if (minutesLate > 0 && severity !== 'danger') {
                messages.push(`Tight route: Google estimates arrival to ${to.owner} about ${Math.ceil(minutesLate)} min after the scheduled time, but still inside the ±30 min window.`)
                severity = 'warning'
              }
            }
            checkPair(candidateIndex-1,candidateIndex)
            checkPair(candidateIndex,candidateIndex+1)
          }
        }
        if (!cancelledCheck) setScheduleCheck({loading:false,severity,messages})
      } catch(err) {
        if (!cancelledCheck) setScheduleCheck({loading:false,severity:'warning',messages:['Could not run the schedule conflict check right now. You can still save manually.']})
      }
    },400)
    return ()=>{cancelledCheck=true;clearTimeout(timer)}
  },[mode,targetDate,targetTime,targetGroomer,editTime,editGroomer,editFixed,originalDate,appt.weekStart])

  const submit = async event => {
    event.preventDefault()
    if (savingRef.current || completed || moved || missed) return
    if (mode==='edit') {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(editTime)) { setError('Choose a valid arrival time.'); return }
      if (!groomers.includes(editGroomer)) { setError('Choose Jen or Haley.'); return }
      if (editOverrideReasons.length && !manualOverride) { setError('Turn on Manual override to save outside the normal groomer rules.'); return }
    }
    if (mode==='reschedule') {
      const message=rescheduleValidation(targetDate,targetTime,targetGroomer,businessDateKey())
      if(message){setError(message);return}
      if(!groomers.includes(targetGroomer)){setError('Choose Jen or Haley.');return}
      if (rescheduleOverrideReasons.length && !manualOverride) { setError('Turn on Manual override to save outside the normal groomer rules.'); return }
    }
    if (mode==='services' && (!serviceRows.length || serviceRows.some(item=>!item.name || !appointmentServiceOptions.includes(item.service)))) {
      setError('Choose a service for every dog in this appointment.');return
    }
    if (mode==='services' && missingServicePrice) { setError('Add a price for each selected service on the dog profile first.'); return }
    if (mode==='services' && missingServiceMinutes) { setError('Add a time for each selected service on the dog profile first.'); return }
    savingRef.current=true;setSaving(true);setError('')
    try {
      if (!supabase) throw new Error('Your schedule connection is not configured.')
      const params = {p_week_start:appt.weekStart,p_expected_row:row}
      const {data,error:saveError} = mode==='missed'
          ? await supabase.rpc('mark_grooming_no_show',{...params,p_missed_date:originalDate})
          : mode==='services'
            ? await supabase.rpc('update_grooming_appointment_services',{...params,p_dogs:formatAppointmentDogServices(serviceRows),p_price:missingServicePrice?null:serviceTotal,p_minutes:missingServiceMinutes?null:serviceMinutesTotal})
          : mode==='edit'
            ? await supabase.rpc('update_grooming_appointment_details',{...params,p_time:editTime,p_groomer:editGroomer,p_fixed:editFixed,p_note:note.trim() || null})
          : mode==='reschedule'
            ? await supabase.rpc('reschedule_grooming_appointment_safe',{...params,p_target_date:targetDate,p_target_time:targetTime,p_target_groomer:targetGroomer,p_note:note.trim() || null})
            : await supabase.rpc('change_grooming_appointment',{...params,p_action:mode,
              p_target_date:null,p_target_time:null,p_target_groomer:null,p_note:note.trim()})
      if (saveError) {
        if (saveError.code==='PGRST202' || saveError.code==='42883') throw new Error('This action has not been enabled yet. Please finish its one-time setup first.')
        throw saveError
      }
      if (!['completed','already_completed','cancelled','already_cancelled','rescheduled','missed','already_missed','services_updated','appointment_updated'].includes(data?.status)) throw new Error('The save result could not be confirmed. Close and refresh before trying again.')
      if(data.status==='completed') onSaved(`${appt.owner} marked completed. Service history updated for ${data.dogs_updated} dog${data.dogs_updated===1?'':'s'}.`)
      else if(data.status==='services_updated') onSaved(`${appt.owner}'s services were updated for this appointment.`)
      else if(data.status==='appointment_updated') onSaved(`${appt.owner}'s appointment details were updated.`)
      else if(data.status==='already_completed') onSaved(`${appt.owner} was already completed.`)
      else if(data.status==='rescheduled') onSaved(`${appt.owner} moved to ${targetDate} at ${displayClockTime(targetTime)} with ${targetGroomer}. Review the affected draft routes in your existing planner.`)
      else if(data.status==='missed') onSaved(`${appt.owner} marked as a no-show. The service history was not advanced.`)
      else if(data.status==='already_missed') onSaved(`${appt.owner} was already marked as a no-show.`)
      else onSaved(`${appt.owner} cancelled. Review the affected draft route in your existing planner.`)
    } catch (err) {
      setError(err.message || 'Could not confirm the save. Close and refresh before trying again.')
    } finally {
      savingRef.current=false;setSaving(false)
    }
  }

  if (viewerMode) {
    return <div className="sheet-backdrop" onMouseDown={onClose}>
      <div ref={dialogRef} className="sheet" role="dialog" aria-modal="true" aria-labelledby="completion-title" onMouseDown={event=>event.stopPropagation()} style={{maxHeight:'85dvh',overflowY:'auto'}}>
        <div className="sheet-handle"/>
        <div className="sheet-title">
          <div><span>Viewer mode · read only</span><h2 id="completion-title">{appt.owner}</h2><p>{appt.dogs}</p></div>
          <button ref={closeRef} className="icon-btn" aria-label="Close appointment" onClick={onClose}><X size={18}/></button>
        </div>
        <div className="prototype-note" style={{textAlign:'left',marginBottom:14}}>This demo account can inspect appointment details, but changes and customer contact actions are disabled.</div>
        <div className="form-grid">
          <label>Date<input readOnly value={textDate(originalDate) || originalDate || '—'} /></label>
          <label>Time<input readOnly value={displayClockTime(row['Start Time'] || row['Locked Time'] || row['Original Start Time'])} /></label>
          <label>Groomer<input readOnly value={String(row.Groomer || appt.groomer || '—')} /></label>
          <label>Price<input readOnly value={Number.isFinite(Number(appt.price)) ? `$${Math.round(Number(appt.price))}` : '—'} /></label>
          <label style={{gridColumn:'1 / -1'}}>Area<input readOnly value={String(appt.area || row['Area Cluster'] || '—')} /></label>
          <label style={{gridColumn:'1 / -1'}}>Status<input readOnly value={String(row['Appointment Status'] || row.Status || 'Scheduled')} /></label>
        </div>
        <div className="sheet-actions"><button className="ghost" onClick={onClose}>Close</button></div>
      </div>
    </div>
  }

  return <div className="sheet-backdrop" onMouseDown={close}>
    <div ref={dialogRef} className="sheet" role="dialog" aria-modal="true" aria-labelledby="completion-title"
      onMouseDown={event=>event.stopPropagation()} style={{maxHeight:'85dvh',overflowY:'auto'}}>
      <div className="sheet-handle"/>
      <div className="sheet-title">
        <div><span>Appointment details</span><h2 id="completion-title">{appt.owner}</h2><p>{appt.dogs}</p></div>
        <button ref={closeRef} className="icon-btn" aria-label="Close appointment" disabled={saving} onClick={close}><X size={18}/></button>
      </div>
      <div className="prototype-note" style={{textAlign:'left',marginBottom:16}}>
        {originalDate} · {displayClockTime(appt.time) || 'Time not set'} · {row.Groomer || 'Groomer not set'}
        {row['Completed Date'] && <div>Completed: {String(row['Completed Date']).slice(0,10)}</div>}
        {row['Rescheduled To'] && <div>Moved to: {String(row['Rescheduled To']).slice(0,10)}</div>}
        {row['Status Note'] && <div>{row['Status Note']}</div>}
      </div>
      {(() => {
        const phone = phoneForScheduleRow(dogs,row)
        const message = confirmationMessage({owner:appt.owner,dogs:appt.dogs,date:originalDate,time:appt.time})
        const recordAndText = (body,type) => {
          setLastContact(saveAppointmentContact(appt,type))
          setError('')
          openSms(phone,body)
        }
        const sendSheetOnMyWay = async () => {
          if (etaLoading) return
          setEtaLoading(true); setError('')
          try {
            const eta = await googleEtaToAppointment(appt,dogs)
            recordAndText(onMyWayMessage({owner:appt.owner,arrivalTime:etaArrivalClock(eta?.etaMinutes)}),'On my way')
          } catch (err) { setError(err?.message || 'Could not get a live Google ETA.') }
          finally { setEtaLoading(false) }
        }
        return <div className="communication-card">
          <div><strong>Client communication</strong><span>{arrivalWindowLabel(appt.time) ? `Arrival window ${arrivalWindowLabel(appt.time)}` : 'Arrival window not set'}{lastContact ? ` · ${contactLabel(lastContact)}` : ''}</span></div>
          <div className="communication-actions">
            <button type="button" disabled={!phone} onClick={()=>{setShowTextMenu(value=>!value);setShowLateOptions(false)}}><MessageCircle size={14}/> Text customer ▾</button>
            <button type="button" disabled={!phone} onClick={()=>openCall(phone)}>Call</button>
            <button type="button" onClick={async()=>{
              try { await navigator.clipboard.writeText(message); setError('Confirmation text copied.') }
              catch { setError('Could not copy automatically. Use Text customer instead.') }
            }}>Copy confirmation</button>
          </div>
          {showTextMenu && <div className="quick-text-menu sheet-text-menu" aria-label="Client text options">
            <button type="button" disabled={!phone} onClick={()=>{
              if (clientConfirmationStatus(row)==='Unconfirmed' && onConfirmation) onConfirmation(appt,'Needs reply')
              recordAndText(message,'Confirmation')
            }}>Confirm</button>
            {clientConfirmationStatus(row)!=='Confirmed' && onConfirmation && <button type="button" onClick={()=>{onConfirmation(appt,'Confirmed');setShowTextMenu(false)}}>Mark confirmed ✓</button>}
            <button type="button" disabled={!phone} onClick={()=>recordAndText(reminderMessage({owner:appt.owner,dogs:appt.dogs,date:originalDate,time:appt.time}),'Reminder')}>Reminder</button>
            {originalDate===businessDateKey() && <button type="button" disabled={!phone || etaLoading} onClick={sendSheetOnMyWay}>{etaLoading?'Getting ETA…':'On my way'}</button>}
            <button type="button" disabled={!phone} onClick={()=>setShowLateOptions(value=>!value)}>Running late</button>
            {originalDate===businessDateKey() && <button type="button" disabled={!phone} onClick={()=>recordAndText(imHereMessage({owner:appt.owner}),"I'm here")}>I'm here</button>}
            {originalDate===businessDateKey() && <button type="button" disabled={!phone} onClick={()=>recordAndText(needAccessMessage({owner:appt.owner}),'Need access')}>Need access</button>}
            <button type="button" disabled={!phone} onClick={()=>recordAndText(finishedReadyMessage({owner:appt.owner,dogs:appt.dogs}),'Finished / ready')}>Finished / ready</button>
            <button type="button" disabled={!phone} onClick={()=>recordAndText(paymentReminderMessage({owner:appt.owner,total:appt.price}),'Payment')}>Payment total</button>
            <button type="button" disabled={!phone} onClick={()=>openSms(phone,'')}>Custom text</button>
            <button type="button" disabled={!phone} onClick={()=>openCall(phone)}>Call</button>
            <button type="button" disabled={!clientAddress} onClick={copyClientAddress}>Copy address</button>
            {!completed && !moved && !missed && onConfirmation && <button type="button" onClick={()=>{onConfirmation(appt,"Can't make it");setShowTextMenu(false);setMode('reschedule')}}>Can't make it…</button>}
            {!completed && !moved && !missed && <button type="button" onClick={()=>{setShowTextMenu(false);setMode('reschedule')}}>Reschedule…</button>}
          </div>}
          {showLateOptions && <div className="late-options sheet-late-options">{[10,15,20,30].map(minutes=><button key={minutes} type="button" disabled={!phone} onClick={()=>{setShowLateOptions(false);recordAndText(runningLateMessage({owner:appt.owner,minutes}),'Running late')}}>{minutes} min</button>)}</div>}
        </div>
      })()}
      {completed || moved || missed ? <div className="prototype-note">{completed?'This appointment is already completed.':moved?'Open the appointment in its new week to change it.':'This appointment is already marked as a no-show.'}</div> : <>
        <div className="segmented" aria-label="Appointment action" style={{marginBottom:16}}>
          {[['edit','Time / groomer'],['services','Services'],['reschedule','Move day'],['cancel','Cancel'],['missed','No-show']].map(([value,label])=><button
            type="button" key={value} disabled={saving || (cancelled && value==='cancel')} aria-pressed={mode===value}
            className={mode===value?'active':''} onClick={()=>{setMode(value);setError('')}}>{label}</button>)}
        </div>
        <form onSubmit={submit}>
          {mode==='edit' && <>
            <div className="prototype-note" style={{textAlign:'left',marginBottom:12}}>Change this appointment only. Client and dog profile defaults stay the same.</div>
            <div className="form-grid">
              <label>Arrival time<input type="time" value={editTime} required disabled={saving} onChange={event=>setEditTime(event.target.value)}/></label>
              <label>Groomer<select value={editGroomer} disabled={saving} onChange={event=>setEditGroomer(event.target.value)}>
                <option value="">Choose groomer</option>{groomers.map(name=><option key={name}>{name}</option>)}
              </select></label>
              <label style={{gridColumn:'1 / -1',display:'flex',alignItems:'center',gap:10}}>
                <input type="checkbox" checked={editFixed} disabled={saving} onChange={event=>setEditFixed(event.target.checked)} style={{width:20,height:20}}/> Fixed arrival time
              </label>
              <label style={{gridColumn:'1 / -1'}}>Appointment note
                <input value={note} maxLength={1000} disabled={saving} onChange={event=>setNote(event.target.value)} placeholder="Client request, access note, timing note…"/>
              </label>
            </div>
            <div className={`schedule-check ${scheduleCheck.severity}`}>
              <div className="schedule-check-title">{scheduleCheck.loading ? 'Checking schedule…' : scheduleRiskBadge(scheduleCheck.severity)}</div>
              {!scheduleCheck.loading && scheduleCheck.messages.length===0 && <div>No overlap or route-window conflict found for this change.</div>}
              {!scheduleCheck.loading && scheduleCheck.messages.map((message,index)=><div key={index}>• {message}</div>)}
            </div>
            {editOverrideReasons.length > 0 && <div className="schedule-check warning">
              <div className="schedule-check-title">Outside normal scheduling rules</div>
              {editOverrideReasons.map((reason,index)=><div key={index}>• {reason}</div>)}
              <label style={{display:'flex',gap:10,alignItems:'flex-start',marginTop:10,fontWeight:800}}>
                <input type="checkbox" checked={manualOverride} onChange={event=>setManualOverride(event.target.checked)} style={{width:20,height:20,minWidth:20}}/>
                <span>Manual override — save this appointment anyway</span>
              </label>
            </div>}
          </>}
          {mode==='services' && <>
            <div className="prototype-note" style={{textAlign:'left',marginBottom:12}}>Set what each dog is getting for this appointment only. This does not change the dog’s usual service on the client profile.</div>
            <div className="form-grid">
              {serviceRows.map((item,index)=><label key={`${item.name}-${index}`} style={{gridColumn:'1 / -1'}}>{item.name}
                <select value={item.service} disabled={saving} onChange={event=>setServiceRows(rows=>rows.map((row,i)=>i===index?{...row,service:event.target.value}:row))}>
                  {appointmentServiceOptions.map(service=><option key={service}>{service}</option>)}
                </select>
              </label>)}
            </div>
            <div className="prototype-note" style={{textAlign:'left',marginTop:12}}>{missingServicePrice ? 'Add the missing service price on the dog profile before saving so the appointment total can update.' : missingServiceMinutes ? 'Add the missing service time on the dog profile before saving so the appointment duration can update.' : `Appointment total: $${serviceTotal.toFixed(2)} · ${serviceMinutesTotal} min`}</div>
          </>}
          {mode==='reschedule' && <>
            <div className="form-grid">
              <label>New date<input type="date" min={today} value={targetDate} required disabled={saving} onChange={event=>setTargetDate(event.target.value)}/></label>
              <label>Arrival time<input type="time" value={targetTime} required disabled={saving} onChange={event=>setTargetTime(event.target.value)}/></label>
              <label style={{gridColumn:'1 / -1'}}>Groomer<select value={targetGroomer} disabled={saving} onChange={event=>setTargetGroomer(event.target.value)}>
                <option value="">Choose groomer</option>{groomers.map(name=><option key={name}>{name}</option>)}
              </select></label>
            </div>
            <div className="communication-card" style={{margin:'10px 0 12px'}}>
              <div><strong>Reschedule message preview</strong><span>{rescheduleMessage({owner:appt.owner,date:targetDate,time:targetTime})}</span></div>
              <div className="communication-actions">
                <button type="button" disabled={!phoneForScheduleRow(dogs,row)} onClick={()=>{
                  const phone = phoneForScheduleRow(dogs,row)
                  setLastContact(saveAppointmentContact(appt,'Reschedule'))
                  openSms(phone,rescheduleMessage({owner:appt.owner,date:targetDate,time:targetTime}))
                }}><MessageCircle size={14}/> Text reschedule</button>
              </div>
              <div style={{paddingTop:4,borderTop:'1px solid #dfe6ee'}}><strong>Back-in-area reply</strong><span>{backInAreaMessage({date:targetDate})}</span></div>
              <div className="communication-actions">
                <button type="button" disabled={!phoneForScheduleRow(dogs,row)} onClick={()=>{
                  const phone = phoneForScheduleRow(dogs,row)
                  setLastContact(saveAppointmentContact(appt,'Back in area'))
                  openSms(phone,backInAreaMessage({date:targetDate}))
                }}><MessageCircle size={14}/> Text area-day reply</button>
              </div>
            </div>
            <div className={`schedule-check ${scheduleCheck.severity}`}>
              <div className="schedule-check-title">{scheduleCheck.loading ? 'Checking destination day…' : scheduleRiskBadge(scheduleCheck.severity)}</div>
              {!scheduleCheck.loading && scheduleCheck.messages.length===0 && <div>No overlap or Google route-window conflict found on the destination day.</div>}
              {!scheduleCheck.loading && scheduleCheck.messages.map((message,index)=><div key={index}>• {message}</div>)}
            </div>
            {rescheduleOverrideReasons.length > 0 && <div className="schedule-check warning">
              <div className="schedule-check-title">Outside normal scheduling rules</div>
              {rescheduleOverrideReasons.map((reason,index)=><div key={index}>• {reason}</div>)}
              <label style={{display:'flex',gap:10,alignItems:'flex-start',marginTop:10,fontWeight:800}}>
                <input type="checkbox" checked={manualOverride} onChange={event=>setManualOverride(event.target.checked)} style={{width:20,height:20,minWidth:20}}/>
                <span>Manual override — move this appointment anyway</span>
              </label>
            </div>}
            <p style={{fontSize:13,lineHeight:1.6,color:'#687080'}}>The selected arrival time becomes fixed. Customer times are never changed automatically; warnings use saved service lengths, Google drive time, and your ±30-minute arrival window.</p>
          </>}
          {mode==='cancel' && <p style={{fontSize:13,lineHeight:1.6,color:'#687080'}}>Cancel this appointment for {appt.owner}? It stays in Week history, and the affected route becomes a draft for review.</p>}
          {mode==='missed' && <p style={{fontSize:13,lineHeight:1.6,color:'#687080'}}>Mark this past appointment as a no-show? It stays in history and does not advance the dog’s last-service date.</p>}
          {!['services','edit'].includes(mode) && <div className="form-grid"><label style={{gridColumn:'1 / -1'}}>Note (optional)
            <input value={note} maxLength={1000} disabled={saving} onChange={event=>setNote(event.target.value)} placeholder="Reason or client request"/>
          </label></div>}
          {error && <div className="login-message" role="alert">{error}</div>}
          <div className="sheet-actions" style={{flexWrap:'wrap'}}>
            <button type="button" className="ghost" disabled={saving} onClick={close}>Close</button>
            <button type="submit" className={mode==='cancel'?'danger':'save'} disabled={saving}>
              {saving?'Saving…':mode==='edit'?'Save changes':mode==='services'?'Save services':mode==='reschedule'?'Save reschedule':mode==='missed'?'Mark no-show':'Confirm cancellation'}
            </button>
          </div>
        </form>
      </>}
    </div>
  </div>
}

function plannerClientGroups(dogs) {
  return Object.values((dogs || []).reduce((map,row)=>{
    const household = String(row?.household_id || row?.['Household ID'] || '').trim()
    const owner = String(row?.owner || row?.Owner || '').trim()
    const dog = String(row?.dog || row?.Dog || '').trim()
    if (!owner || !dog) return map
    const key = household ? `h:${household}` : `o:${owner.toLowerCase()}`
    if (!map[key]) map[key] = {key,owner,household,rows:[]}
    map[key].rows.push(row)
    return map
  },{})).sort((a,b)=>a.owner.localeCompare(b.owner))
}

function plannerActiveRow(row,todayKey=businessDateKey()) {
  if (!row || !String(row.Owner || '').trim()) return false
  const date = String(row.Date || '').slice(0,10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < todayKey) return false
  const apptStatus = String(row['Appointment Status'] || '').trim().toLowerCase()
  const completion = String(row['Completion Status'] || '').trim().toLowerCase()
  const status = String(row.Status || '').trim().toLowerCase()
  if (completion === 'completed') return false
  if (['cancelled','canceled','moved to another week','missed','no show','no-show','noshow'].includes(apptStatus)) return false
  if (['cancelled','canceled','rescheduled','completed','missed','no show','no-show','noshow'].includes(status)) return false
  return true
}

function plannerResolveDate(text,todayKey=businessDateKey()) {
  const lower = String(text || '').toLowerCase()
  const today = new Date(`${todayKey}T12:00:00Z`)
  if (/\btoday\b/.test(lower)) return todayKey
  if (/\btomorrow\b/.test(lower)) {
    today.setUTCDate(today.getUTCDate()+1)
    return today.toISOString().slice(0,10)
  }
  const days = [
    ['sunday',0],['sun',0],['monday',1],['mon',1],['tuesday',2],['tue',2],['tues',2],
    ['wednesday',3],['wed',3],['thursday',4],['thu',4],['thur',4],['thurs',4],
    ['friday',5],['fri',5],['saturday',6],['sat',6]
  ]
  for (const [name,target] of days) {
    if (new RegExp(`\\b${name}\\b`).test(lower)) {
      const delta = (target - today.getUTCDay() + 7) % 7
      today.setUTCDate(today.getUTCDate()+delta)
      return today.toISOString().slice(0,10)
    }
  }
  const iso = lower.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/)
  if (iso) return iso[0]
  return ''
}

function plannerUsualService(row) {
  let service = canonicalServiceLabel(row?.service_pattern || row?.['Service Pattern'] || '')
  if (service === 'Service Varies' || !appointmentServiceOptions.includes(service)) {
    const next = canonicalServiceLabel(row?.next_service || row?.['Next Service'] || '')
    service = appointmentServiceOptions.includes(next) ? next : 'Groom'
  }
  return service
}

function plannerClientTotals(rows) {
  return (rows || []).reduce((acc,row)=>{
    const service = plannerUsualService(row)
    const values = serviceDefaultsForDog(row,service)
    acc.price += Number(values.price || 0)
    acc.minutes += Number(values.minutes || 0)
    acc.services.push(service)
    return acc
  },{price:0,minutes:0,services:[]})
}

function plannerQueryFilters(text,dogs) {
  const lower = String(text || '').toLowerCase().replace(/[’]/g,"'")
  const date = plannerResolveDate(lower)
  const groomer = /\bhaley\b/.test(lower) ? 'Haley' : /\bjen\b/.test(lower) ? 'Jen' : ''
  const priceMatch = lower.match(/\$\s*(\d+(?:\.\d+)?)\s*\+|(?:at least|over|more than)\s*\$?\s*(\d+(?:\.\d+)?)/)
  const minPrice = Number(priceMatch?.[1] || priceMatch?.[2] || 0)
  const hourMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:hour|hr)s?\b/)
  const minuteMatch = lower.match(/(\d+)\s*(?:minute|min)s?\b/)
  const maxMinutes = hourMatch ? Math.round(Number(hourMatch[1])*60) : minuteMatch ? Number(minuteMatch[1]) : 0
  const overdueOnly = /\boverdue\b/.test(lower)
  const unbookedOnly = /hasn['’]?t been booked|not booked back|booked back|unbooked|rebook/.test(lower)
  const service = /partial\s*groom/.test(lower) ? 'Partial Groom' : /bath\s*only/.test(lower) ? 'Bath Only' : /\bbath\b/.test(lower) ? 'Bath' : /\bgroom\b/.test(lower) ? 'Groom' : ''
  const priceLookup = /\bhow much\b|\bwhat does .+ cost\b|\bwhat(?:'s| is) (?:the )?price\b|\bprice (?:for|of)\b|\bcost (?:for|of)\b/.test(lower)
  const confirmationOnly = /needs? (?:to )?confirm|needs? confirmation|not confirmed|still needs? (?:a )?reply|who.*confirm/.test(lower)
  let lookupName = ''
  if (priceLookup) {
    const patterns = [
      /how much (?:is|for|does)\s+(.+?)(?:\s+cost)?(?:\?|$)/,
      /what does\s+(.+?)\s+cost(?:\?|$)/,
      /what(?:'s| is) (?:the )?price (?:for|of)\s+(.+?)(?:\?|$)/,
      /price (?:for|of)\s+(.+?)(?:\?|$)/,
      /cost (?:for|of)\s+(.+?)(?:\?|$)/
    ]
    const hit = patterns.map(pattern=>lower.match(pattern)).find(Boolean)
    lookupName = String(hit?.[1] || '')
      .replace(/\b(?:for a|for an|for the|for)\s+(?:groom|bath only|bath|partial groom)\b.*$/,'')
      .replace(/\b(?:groom|bath only|bath|partial groom)\b$/,'')
      .replace(/\b(?:cost|price|please|today)\b$/,'')
      .trim()
  }
  const areas = [...new Set((dogs || []).map(row=>canonicalAreaLabel(row?.area || row?.Area || '')).filter(Boolean))]
    .sort((a,b)=>b.length-a.length)
  let area = areas.find(label=>lower.includes(label.toLowerCase())) || ''
  if (!area) {
    const broad = [
      ['woodlands','The Woodlands'],['montgomery','Montgomery'],['conroe','Conroe'],['spring','Spring'],
      ['tomball','Tomball'],['magnolia','Old Magnolia'],['willis','Willis'],['woodforest','Woodforest'],
      ['cypress','Cypress'],['hockley','Hockley'],['april sound','April Sound']
    ]
    const hit = broad.find(([needle])=>lower.includes(needle))
    if (hit) area = hit[1]
  }
  const routeIntent = /route|closest|fill|opening|add|fit/.test(lower)
  return {lower,date,groomer,minPrice,maxMinutes,overdueOnly,unbookedOnly,service,area,routeIntent,priceLookup,lookupName,confirmationOnly}
}

function plannerNextBookableDate(groomer,fromKey=businessDateKey()) {
  const date = new Date(`${fromKey}T12:00:00Z`)
  for (let i=0;i<14;i+=1) {
    const day = date.getUTCDay()
    if (groomer === 'Jen' ? [2,3,4].includes(day) : [1,2,3,4,5].includes(day)) return date.toISOString().slice(0,10)
    date.setUTCDate(date.getUTCDate()+1)
  }
  return fromKey
}

function plannerDayLabel(dateKey) {
  if (!dateKey) return ''
  return new Date(`${dateKey}T12:00:00Z`).toLocaleDateString('en-US',{timeZone:'UTC',weekday:'long',month:'short',day:'numeric'})
}

function AssistantSheet({open,initial,onClose,dogs,onChoose,onClient,viewerMode=false}) {
  const [text,setText]=useState(initial||'')
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [answer,setAnswer]=useState(null)

  useEffect(()=>{
    if(open){
      setText(initial||'')
      setLoading(false)
      setError('')
      setAnswer(null)
    }
  },[open,initial])

  if(!open)return null

  const run = async (query=text) => {
    const prompt = String(query || '').trim()
    if (!prompt || loading) return
    setText(prompt)
    setLoading(true)
    setError('')
    setAnswer(null)
    try {
      if (!supabase) throw new Error('Your schedule connection is not configured.')
      const today = businessDateKey()
      const filters = plannerQueryFilters(prompt,dogs)
      const groups = plannerClientGroups(dogs)

      if (filters.priceLookup) {
        const needle = String(filters.lookupName || '').toLowerCase().trim()
        const ranked = groups.map(client=>{
          const owner = client.owner.toLowerCase()
          const dogNames = client.rows.map(row=>String(row?.dog || row?.Dog || '').trim())
          const dogNamesLower = dogNames.map(name=>name.toLowerCase())
          let matchScore = 0
          if (needle) {
            if (owner === needle) matchScore = 100
            else if (dogNamesLower.includes(needle)) matchScore = 95
            else if (owner.includes(needle) || needle.includes(owner)) matchScore = 80
            else if (dogNamesLower.some(name=>name.includes(needle) || needle.includes(name))) matchScore = 75
            else return null
          } else return null

          const matchingDogRows = client.rows.filter(row=>{
            const dogName = String(row?.dog || row?.Dog || '').trim().toLowerCase()
            return dogName && (dogName===needle || dogName.includes(needle) || needle.includes(dogName))
          })
          const rowsForPrice = matchingDogRows.length ? matchingDogRows : client.rows
          const breakdown = rowsForPrice.map(row=>{
            const dog = String(row?.dog || row?.Dog || '').trim()
            const service = filters.service || plannerUsualService(row)
            const values = serviceDefaultsForDog(row,service)
            return {dog,service,price:Number(values.price || 0),minutes:Number(values.minutes || 0)}
          })
          const price = breakdown.reduce((sum,item)=>sum+Number(item.price || 0),0)
          const minutes = breakdown.reduce((sum,item)=>sum+Number(item.minutes || 0),0)
          return {...client,matchScore,price:Math.round(price),minutes:Math.round(minutes),pricingBreakdown:breakdown}
        }).filter(Boolean).sort((a,b)=>b.matchScore-a.matchScore || a.owner.localeCompare(b.owner)).slice(0,5)

        setAnswer({mode:'price',title:ranked.length ? `Pricing for ${filters.lookupName}` : 'Client price',targetDate:'',filters,candidates:ranked,summary:''})
        return
      }

      let targetDate = filters.date
      if (!targetDate && filters.routeIntent) targetDate = today

      const startWeek = mondayForDate(today)
      const endDate = new Date(`${today}T12:00:00Z`)
      endDate.setUTCDate(endDate.getUTCDate()+84)
      const endWeek = mondayForDate(endDate.toISOString().slice(0,10))
      const {data,error:loadError} = await supabase
        .from('weekly_drafts')
        .select('week_start,plan_json')
        .gte('week_start',startWeek)
        .lte('week_start',endWeek)
        .order('week_start',{ascending:true})
      if (loadError) throw loadError

      const planRows = (data || []).flatMap(week=>Array.isArray(week.plan_json)?week.plan_json:[])
      const activeRows = planRows.filter(row=>plannerActiveRow(row,today))

      if (filters.confirmationOnly) {
        const currentWeekStart = mondayForDate(today)
        const weekEndDate = new Date(`${currentWeekStart}T12:00:00Z`)
        weekEndDate.setUTCDate(weekEndDate.getUTCDate()+4)
        const currentWeekEnd = weekEndDate.toISOString().slice(0,10)
        const rowsNeeding = activeRows.filter(row=>{
          const date = String(row.Date || '').slice(0,10)
          if (date < currentWeekStart || date > currentWeekEnd) return false
          if (filters.groomer && String(row.Groomer || '').trim() !== filters.groomer) return false
          return needsClientConfirmation(row)
        })
        const byHousehold = new Map()
        for (const row of rowsNeeding) {
          const household = String(row['Household ID'] || '').trim()
          const owner = String(row.Owner || '').trim()
          const key = household ? `h:${household}` : `o:${owner.toLowerCase()}`
          if (byHousehold.has(key)) continue
          const group = groups.find(client=>client.key===key || client.owner.toLowerCase()===owner.toLowerCase()) || {key,owner,household,rows:[]}
          byHousehold.set(key,{...group,confirmationRow:row,confirmation:clientConfirmationStatus(row),date:String(row.Date || '').slice(0,10),time:String(row['Start Time'] || row['Locked Time'] || '').trim(),price:Number(row.Price || 0),minutes:scheduleRowDuration(row,60),due:{detail:clientConfirmationStatus(row)}})
        }
        const candidates = [...byHousehold.values()].sort((a,b)=>String(a.date).localeCompare(String(b.date)) || clockMinutesForDisplay(a.time)-clockMinutesForDisplay(b.time)).slice(0,20)
        setAnswer({mode:'confirmation',title:'Clients who still need confirmation this week',targetDate:'',filters,candidates,summary:''})
        return
      }

      const bookedKeys = new Set()
      for (const row of activeRows) {
        const household = String(row['Household ID'] || '').trim()
        const owner = String(row.Owner || row.Client || '').trim()
        if (household) bookedKeys.add(`h:${household}`)
        if (owner) bookedKeys.add(`o:${owner.toLowerCase()}`)
      }

      const dayAppointments = targetDate ? todayAppointments(planRows,targetDate,'All') : []
      const weekday = targetDate ? new Date(`${targetDate}T12:00:00Z`).getUTCDay() : null
      const dayCounts = dayAppointments.reduce((acc,appt)=>{
        if (appt.groomer==='Jen' || appt.groomer==='Haley') acc[appt.groomer] += 1
        return acc
      },{Jen:0,Haley:0})
      const dayAreas = [...new Set(dayAppointments.map(appt=>canonicalAreaLabel(appt.area)).filter(Boolean))]
      const targetDay = new Date(`${targetDate || today}T12:00:00Z`)

      let candidates = groups.map(client=>{
        const ownerKey = `o:${client.owner.toLowerCase()}`
        const booked = bookedKeys.has(client.key) || bookedKeys.has(ownerKey)
        if (booked) return null

        const due = clientDueInfo(client.rows,targetDate || today)
        if (filters.overdueOnly && due.status !== 'Overdue') return null
        if (!filters.unbookedOnly && !['Overdue','Due today','Due this week','Due soon','Upcoming','Not enough data'].includes(due.status)) return null

        const lastDates = client.rows.flatMap(row=>[
          String(row?.last_groom || row?.['Last Groom'] || '').slice(0,10),
          String(row?.last_bath || row?.['Last Bath'] || '').slice(0,10)
        ]).filter(value=>/^\d{4}-\d{2}-\d{2}$/.test(value)).sort()
        const lastService = lastDates.at(-1) || ''
        if (targetDate && lastService && !filters.unbookedOnly) {
          const last = new Date(`${lastService}T12:00:00Z`)
          const daysSince = Math.floor((targetDay-last)/86400000)
          if (daysSince >= 0 && daysSince < 14) return null
        }

        const assigned = [...new Set(client.rows.map(row=>String(row?.groomer || row?.Groomer || '').trim()).filter(name=>name==='Jen' || name==='Haley'))]
        const exclusive = assigned.length===1 ? assigned[0] : ''
        let targetGroomer = filters.groomer
        if (!targetGroomer && targetDate) {
          if (weekday===1 || weekday===5) targetGroomer='Haley'
          else if (exclusive) targetGroomer=exclusive
          else targetGroomer = dayCounts.Jen <= dayCounts.Haley ? 'Jen' : 'Haley'
        }
        if (!targetGroomer && exclusive) targetGroomer = exclusive
        if (!targetGroomer) targetGroomer = 'Jen'
        if (targetDate) {
          if ((weekday===1 || weekday===5) && targetGroomer!=='Haley') return null
          if (targetGroomer==='Jen' && ![2,3,4].includes(weekday)) return null
          if (exclusive && exclusive!==targetGroomer) return null
        } else if (filters.groomer && exclusive && exclusive!==filters.groomer) return null

        const totals = plannerClientTotals(client.rows)
        const price = Math.round(totals.price || 0)
        const minutes = Math.max(30,Math.round(totals.minutes || 60))
        if (filters.minPrice && price < filters.minPrice) return null
        if (filters.maxMinutes && minutes > filters.maxMinutes) return null
        if (filters.service && !totals.services.some(service=>service===filters.service || (filters.service==='Groom' && ['Groom','Partial Groom'].includes(service)))) return null

        const area = canonicalAreaLabel(client.rows.map(row=>row?.area || row?.Area || '').find(Boolean) || '')
        if (filters.area) {
          const wanted = filters.area.toLowerCase().replace(/^the\s+/,'')
          const actual = area.toLowerCase().replace(/^the\s+/,'')
          if (!actual.includes(wanted) && !wanted.includes(actual)) return null
        }
        const suggestedTime = targetDate ? openingForDuration(dayAppointments,minutes,targetGroomer) : ''
        if (targetDate && filters.routeIntent && !suggestedTime) return null

        const duePoints = due.status==='Overdue' ? 110 : due.status==='Due today' ? 100 : due.status==='Due this week' ? 90 : due.status==='Due soon' ? 72 : due.status==='Upcoming' ? 40 : 10
        const overdueBonus = due.days < 0 ? Math.min(30,Math.abs(due.days)) : 0
        const areaPoints = filters.area ? 35 : (area && dayAreas.some(value=>value===area) ? 12 : 0)
        const groomerPoints = dayAppointments.some(appt=>appt.groomer===targetGroomer) ? 8 : 0
        const openingPoints = targetDate ? (suggestedTime ? 28 : -40) : 0
        return {...client,due,booked:false,area,targetGroomer,price,minutes,suggestedTime,lastService,totals,
          score:duePoints+overdueBonus+areaPoints+groomerPoints+openingPoints}
      }).filter(Boolean)

      candidates.sort((a,b)=>b.score-a.score || (a.due.dueDate || '9999').localeCompare(b.due.dueDate || '9999') || a.owner.localeCompare(b.owner))
      candidates = candidates.slice(0,8)

      if (targetDate && filters.routeIntent && candidates.length) {
        const lookup = clientAddressLookup(dogs)
        const cacheMs = 15*60*1000
        const fetchRoute = async (stops,groomer) => {
          if (!stops.length) return {totalMinutes:0,totalMiles:0,legs:[]}
          const signature = stops.map(stop=>`${stop.id}:${stop.address}:${stop.time}`).join('|')
          const cacheKey = `ask-planner-route-v1:${targetDate}:${groomer}:${signature}`
          try {
            const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null')
            if (cached?.payload && Number(cached.savedAt) > Date.now()-cacheMs) return cached.payload
          } catch {}
          const response = await fetch('/api/google-route',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stops,groomer})})
          const payload = await response.json().catch(()=>({}))
          if (!response.ok) throw new Error(payload?.error || `Google route check failed (${response.status}).`)
          try { localStorage.setItem(cacheKey,JSON.stringify({savedAt:Date.now(),payload})) } catch {}
          return payload
        }

        const baseByGroomer = {}
        const baseRoute = groomer => {
          if (!baseByGroomer[groomer]) {
            const existing = dayAppointments.filter(appt=>appt.groomer===groomer).slice().sort(compareAppointmentTimes)
            const stops = existing.map((appt,index)=>({id:appt.id || `existing-${index}`,owner:appt.owner,address:appointmentAddress(appt,lookup),time:String(appt.time || '').trim()}))
            baseByGroomer[groomer] = stops.some(stop=>!stop.address)
              ? Promise.resolve({unavailable:true})
              : fetchRoute(stops,groomer).catch(()=>({unavailable:true}))
          }
          return baseByGroomer[groomer]
        }

        const ranked = await Promise.all(candidates.map(async candidate=>{
          const address = candidate.rows.map(fullClientAddress).find(Boolean) || ''
          if (!address) return {...candidate,routeInfo:{unavailable:true,label:'Address needed'}}
          const existing = dayAppointments.filter(appt=>appt.groomer===candidate.targetGroomer).slice().sort(compareAppointmentTimes)
            .map((appt,index)=>({id:appt.id || `existing-${index}`,owner:appt.owner,address:appointmentAddress(appt,lookup),time:String(appt.time || '').trim(),appt}))
          if (existing.some(stop=>!stop.address)) return {...candidate,routeInfo:{unavailable:true,label:'Existing stop needs address'}}
          const candidateStop = {id:`ask-${candidate.key}`,owner:candidate.owner,address,time:candidate.suggestedTime,candidate:true}
          const proposed = [...existing,candidateStop].sort((a,b)=>{
            const first=clockMinutesForDisplay(a.time), second=clockMinutesForDisplay(b.time)
            if (!Number.isFinite(first)) return 1
            if (!Number.isFinite(second)) return -1
            return first-second
          })
          try {
            const [base,next] = await Promise.all([baseRoute(candidate.targetGroomer),fetchRoute(proposed.map(({appt,candidate,...stop})=>stop),candidate.targetGroomer)])
            if (base?.unavailable) return {...candidate,routeInfo:{unavailable:true,label:'Google route unavailable'}}
            const addedMinutes=Math.max(0,Number(next.totalMinutes||0)-Number(base.totalMinutes||0))
            const addedMiles=Math.max(0,Number(next.totalMiles||0)-Number(base.totalMiles||0))
            const candidateIndex = proposed.findIndex(stop=>stop.id===candidateStop.id)
            const previous = candidateIndex>0 ? proposed[candidateIndex-1] : null
            const following = candidateIndex>=0 && candidateIndex<proposed.length-1 ? proposed[candidateIndex+1] : null
            const legIn = (next.legs || []).find(leg=>leg.toId===candidateStop.id)
            const legOut = (next.legs || []).find(leg=>leg.fromId===candidateStop.id)
            const candidateMinutes = clockMinutesForDisplay(candidate.suggestedTime)
            const risks = []
            if (previous?.appt && Number.isFinite(candidateMinutes)) {
              const previousStart = clockMinutesForDisplay(previous.time)
              const arrival = previousStart + appointmentDurationMinutes(previous.appt) + Number(legIn?.minutes || 0)
              if (Number.isFinite(previousStart) && arrival > candidateMinutes + 30) risks.push(`${Math.ceil(arrival-(candidateMinutes+30))} min past ${candidate.owner}'s window`)
            }
            if (following?.appt && Number.isFinite(candidateMinutes)) {
              const followingStart = clockMinutesForDisplay(following.time)
              const arrival = candidateMinutes + Number(candidate.minutes || 0) + Number(legOut?.minutes || 0)
              if (Number.isFinite(followingStart) && arrival > followingStart + 30) risks.push(`${Math.ceil(arrival-(followingStart+30))} min past ${following.owner}'s window`)
            }
            const routeRisk = risks.length>0
            let routePoints = addedMinutes<=10?55:addedMinutes<=20?42:addedMinutes<=30?28:addedMinutes<=45?12:addedMinutes<=60?0:-20
            if (routeRisk) routePoints -= 65
            const label = routeRisk ? 'Route risk' : addedMinutes<=15?'Great route':addedMinutes<=30?'Good route':addedMinutes<=45?'Okay route':'Longer drive'
            return {...candidate,score:candidate.score+routePoints,routeInfo:{addedMinutes,addedMiles,label,routeRisk,risks}}
          } catch {
            return {...candidate,routeInfo:{unavailable:true,label:'Google route unavailable'}}
          }
        }))
        candidates = ranked.sort((a,b)=>b.score-a.score || a.owner.localeCompare(b.owner)).slice(0,6)
      } else {
        candidates = candidates.slice(0,6)
      }

      const title = filters.unbookedOnly && !targetDate
        ? 'Clients not booked back yet'
        : targetDate ? `Best fits for ${plannerDayLabel(targetDate)}` : 'Best client matches'
      const summaryBits = []
      if (filters.overdueOnly) summaryBits.push('overdue only')
      if (filters.area) summaryBits.push(filters.area)
      if (filters.groomer) summaryBits.push(filters.groomer)
      if (filters.minPrice) summaryBits.push(`$${filters.minPrice}+`)
      if (filters.maxMinutes) summaryBits.push(`${filters.maxMinutes} min or less`)
      if (filters.service) summaryBits.push(filters.service)
      setAnswer({title,targetDate,filters,candidates,summary:summaryBits.join(' · ')})
    } catch(err) {
      setError(err?.message || 'Ask Planner could not check your schedule.')
    } finally {
      setLoading(false)
    }
  }

  const choose = candidate => {
    if (viewerMode) {
      onClose?.()
      onClient?.({key:candidate.key,household:candidate.household || '',owner:candidate.owner})
      return
    }
    if (answer?.mode === 'confirmation') {
      onClose?.()
      onClient?.({key:candidate.key,household:candidate.household || '',owner:candidate.owner})
      return
    }
    if (answer?.targetDate || answer?.filters?.unbookedOnly) {
      const groomer = candidate.targetGroomer || 'Jen'
      const date = answer?.targetDate || plannerNextBookableDate(groomer)
      onClose?.()
      onChoose?.({
        date,
        clientKey:candidate.key,
        groomer,
        time:candidate.suggestedTime || defaultFirstStopTime(groomer),
        fixed:false,
        note:answer?.filters?.unbookedOnly ? 'Rebooked from Ask Planner' : 'Added from Ask Planner'
      })
      return
    }
    onClose?.()
    onClient?.({key:candidate.key,household:candidate.household || '',owner:candidate.owner})
  }

  const quick = [
    'Who should I add Wednesday?',
    'Who is overdue near The Woodlands?',
    "Who hasn't been booked back yet?",
    "Who still needs to confirm this week?"
  ]

  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <div className="assistant-sheet" onMouseDown={e=>e.stopPropagation()} style={{maxHeight:'90dvh',overflowY:'auto'}}>
        <div className="sheet-handle"/>
        <div className="assistant-title">
          <div className="ai-orb"><WandSparkles size={19}/></div>
          <div><span>Ask Planner</span><strong>What do you want to figure out?</strong></div>
          <button className="icon-btn" onClick={onClose}><X size={18}/></button>
        </div>
        <div className="quick-prompts">
          {quick.map(q=><button key={q} onClick={()=>run(q)}>{q}</button>)}
        </div>
        <div className="ai-input">
          <Sparkles size={18}/><input value={text} disabled={loading} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();run()}}} placeholder="Try: I need a $100+ groom Thursday…"/>
          <button disabled={loading || !text.trim()} onClick={()=>run()}>{loading?'Checking…':'Ask'}</button>
        </div>

        {loading && <div className="prototype-note" style={{marginTop:12}}>Checking clients, future bookings, schedule openings, and Google route fit…</div>}
        {error && <div className="login-message" role="alert" style={{marginTop:12}}>{error}</div>}
        {answer && !loading && (
          <div className="ai-result">
            <div className="result-head"><CheckCircle2 size={17}/><strong>{answer.title}</strong></div>
            {answer.summary && <p style={{marginTop:6}}>{answer.summary}</p>}
            {answer.candidates.length===0 ? (
              <div className="prototype-note">I couldn't find an unbooked client that matches those filters right now. Try widening the area, price, service length, or day.</div>
            ) : (
              <div className="candidate-list">
                {answer.candidates.map((candidate,index)=>{
                  const dogsLabel = candidate.rows.map(row=>String(row?.dog || row?.Dog || '').trim()).filter(Boolean).join(' + ')
                  const routeText = candidate.routeInfo?.unavailable
                    ? candidate.routeInfo.label
                    : candidate.routeInfo
                      ? `${candidate.routeInfo.label} · adds about ${Math.round(candidate.routeInfo.addedMinutes)} min${candidate.routeInfo.addedMiles>=0.1?` · ${candidate.routeInfo.addedMiles.toFixed(1)} mi`:''}`
                      : ''
                  return (
                    <button className="candidate" key={candidate.key} type="button" onClick={()=>choose(candidate)} style={{textAlign:'left',width:'100%',cursor:'pointer'}}>
                      <div className="candidate-rank">{index+1}</div>
                      <div className="candidate-main">
                        <strong>{candidate.owner} · {dogsLabel}</strong>
                        {answer.mode==='price' ? (
                          <>
                            {(candidate.pricingBreakdown || []).map(item=><span key={`${candidate.key}-${item.dog}-${item.service}`}>{item.dog}: {item.service} · {item.price>0?`$${Math.round(item.price)}`:'price not saved'}{item.minutes>0?` · ${Math.round(item.minutes)} min`:''}</span>)}
                          </>
                        ) : answer.mode==='confirmation' ? (
                          <span>{candidate.confirmation} · {plannerDayLabel(candidate.date)} · {displayClockTime(candidate.time)}</span>
                        ) : (
                          <span>{candidate.due.detail} · {candidate.area || 'Area not set'} · {candidate.minutes} min</span>
                        )}
                        {answer.targetDate && <span>{candidate.targetGroomer}{candidate.suggestedTime?` · ${displayClockTime(candidate.suggestedTime)}`:' · choose time manually'}</span>}
                        {routeText && <span style={{fontWeight:candidate.routeInfo?.routeRisk?800:700,color:candidate.routeInfo?.routeRisk?'#9a5d19':undefined}}>{routeText}</span>}
                        {candidate.routeInfo?.routeRisk && candidate.routeInfo.risks?.[0] && <span style={{color:'#9a5d19'}}>⚠ {candidate.routeInfo.risks[0]}</span>}
                      </div>
                      <div className="candidate-price">{answer.mode==='confirmation' ? candidate.confirmation : (answer.mode==='price' && candidate.price<=0?'—':`$${candidate.price}`)}</div>
                    </button>
                  )
                })}
              </div>
            )}
            {answer.candidates.length>0 && answer.targetDate && <div className="prototype-note" style={{marginTop:10}}>Tap a client to open Add Appointment with the day, client, groomer, and suggested time filled in. You can review everything before saving.</div>}
            {answer.candidates.length>0 && !answer.targetDate && answer.filters?.unbookedOnly && <div className="prototype-note" style={{marginTop:10}}>Tap a client to rebook them. Add Appointment will open with the client already selected; you can change the date, groomer, time, and services before saving.</div>}
            {answer.candidates.length>0 && !answer.targetDate && answer.mode==='price' && <div className="prototype-note" style={{marginTop:10}}>Tap the client to open their full Client Details.</div>}
            {answer.candidates.length>0 && answer.mode==='confirmation' && <div className="prototype-note" style={{marginTop:10}}>These appointments are not confirmed yet. Use the confirmation control on Week or Today to mark Confirmed, Needs reply, or Can’t make it.</div>}
            {answer.candidates.length>0 && !answer.targetDate && !answer.filters?.unbookedOnly && answer.mode!=='price' && answer.mode!=='confirmation' && <div className="prototype-note" style={{marginTop:10}}>Tap any client to open their details. Ask with a day, like “Who should I add Thursday?”, to get appointment-ready suggestions.</div>}
          </div>
        )}
        <div className="prototype-note" style={{marginTop:12,textAlign:'left'}}>Ask Planner reads your current clients and schedule. For day-specific questions it also uses your saved groomer rules, appointment lengths, and Google route data.</div>
      </div>
    </div>
  )
}


function LoginScreen({ onSignedIn }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const signIn = async (event) => {
    event.preventDefault()
    setMessage('')

    if (!supabase) {
      setMessage('Supabase is not configured yet.')
      return
    }

    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    })
    setLoading(false)

    if (error) {
      setMessage(error.message)
      return
    }

    onSignedIn(data.session)
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">GP</div>
        <div className="eyebrow">Private business dashboard</div>
        <h1>Grooming Planner</h1>
        <p className="login-copy">
          Sign in to access clients, routes, appointments and planning tools.
        </p>

        <form className="login-form" onSubmit={signIn}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {message && <div className="login-message">{message}</div>}

          <button className="login-button" type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
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
  .viewer-banner{margin:0 0 14px;padding:10px 12px;border:1px solid #d8dfea;border-radius:13px;background:#f3f6fb;color:#34415f;display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px;font-weight:750;}
  .viewer-banner strong{color:#17223f;}
  .viewer-badge{display:inline-flex;align-items:center;padding:4px 7px;border-radius:999px;background:#e8eef8;color:#30466d;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;}
  .viewer-banner button{border:1px solid #ccd5e3;background:#fff;color:#31415f;border-radius:9px;padding:6px 9px;font-weight:800;font-size:11px;}
  @media (max-width:560px){
    .day-block{margin-left:-4px;margin-right:-4px;padding-left:8px;padding-right:8px;}
    .stats-row{gap:8px!important;}
    .stat{min-width:0!important;}
  }
`

export default function App() {
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [accessMode,setAccessMode] = useState('editor')
  const [accessReady,setAccessReady] = useState(false)
  const [dogs, setDogs] = useState([])
  const [dataLoading, setDataLoading] = useState(false)
  const [dataError, setDataError] = useState('')
  const [tab,setTab]=useState('Today')
  const [editing,setEditing]=useState(null)
  const [scheduleRevision,setScheduleRevision]=useState(0)
  const [saveMessage,setSaveMessage]=useState('')
  const [completingId,setCompletingId]=useState('')
  const [confirmingId,setConfirmingId]=useState('')
  const [assistant,setAssistant]=useState({open:false,initial:''})
  const [clientJump,setClientJump]=useState(null)
  const [addAppointment,setAddAppointment]=useState({open:false,date:businessDateKey(),preset:null})
  const [fillOpening,setFillOpening]=useState({open:false,date:businessDateKey(),groomer:'All',appointments:[]})
  const ask=(initial='')=>setAssistant({open:true,initial})
  const openRebookForClient = client => {
    const assigned=[...new Set((client?.rows || []).map(row=>String(row?.groomer || row?.Groomer || '').trim()).filter(name=>name==='Jen' || name==='Haley'))]
    const groomer=assigned.length===1?assigned[0]:'Jen'
    let date=new Date(`${businessDateKey()}T12:00:00Z`)
    for(let i=0;i<8;i+=1){
      const weekday=date.getUTCDay()
      const allowed=groomer==='Jen'?[2,3,4].includes(weekday):[1,2,3,4,5].includes(weekday)
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
    if (!session || !supabase) {
      setAccessMode('editor')
      setAccessReady(true)
      return
    }
    let cancelled=false
    setAccessReady(false)
    supabase.rpc('get_grooming_access').then(({data,error})=>{
      if(cancelled) return
      setAccessMode(!error && data==='viewer' ? 'viewer' : 'editor')
      setAccessReady(true)
    })
    return ()=>{cancelled=true}
  },[session])

  const viewerMode = accessMode === 'viewer'
  const viewerNotice = () => setSaveMessage('Viewer mode is read-only. No client or schedule changes were made.')

  useEffect(() => {
    if (!session || !supabase) {
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
  }, [session,scheduleRevision])

  if (!authReady || (session && !accessReady)) {
    return (
      <div className="login-shell">
        <div className="login-card">Loading…</div>
      </div>
    )
  }

  if (!session) {
    return <LoginScreen onSignedIn={setSession} />
  }

  let body
  if (tab === 'Today') {
    body = <Today dogs={dogs} onOpen={setEditing} onComplete={viewerMode?viewerNotice:completeFromSchedule} onUndo={viewerMode?viewerNotice:undoCompleteFromSchedule} onConfirmation={viewerMode?viewerNotice:setClientConfirmation} onAddAppointment={viewerMode?viewerNotice:date=>setAddAppointment({open:true,date,preset:null})} completingId={completingId} confirmingId={confirmingId} revision={scheduleRevision} viewerMode={viewerMode}/>
  } else if (tab === 'Week') {
    body = <Week dogs={dogs} onAsk={ask} onOpen={setEditing} onComplete={viewerMode?viewerNotice:completeFromSchedule} onUndo={viewerMode?viewerNotice:undoCompleteFromSchedule} onConfirmation={viewerMode?viewerNotice:setClientConfirmation} onAddAppointment={viewerMode?viewerNotice:(date,selectedGroomer)=>setAddAppointment({open:true,date,preset:['Jen','Haley'].includes(selectedGroomer)?{groomer:selectedGroomer}:null})} onFillOpening={viewerMode?viewerNotice:payload=>setFillOpening({open:true,date:payload.date,groomer:payload.groomer,appointments:payload.appointments || []})} completingId={completingId} confirmingId={confirmingId} revision={scheduleRevision} viewerMode={viewerMode}/>
  } else if (tab === 'Month') {
    body = <Month dogs={dogs} onOpen={setEditing} revision={scheduleRevision}/>
  } else if (tab === 'Clients') {
    body = <Clients dogs={dogs} loading={dataLoading} error={dataError} onOpen={setEditing} revision={scheduleRevision} openClient={clientJump} onOpenClientHandled={()=>setClientJump(null)} onRebook={viewerMode?viewerNotice:openRebookForClient} onDataChanged={message=>{ setSaveMessage(message); setScheduleRevision(value=>value+1) }} viewerMode={viewerMode}/>
  } else {
    body = <More dogs={dogs} revision={scheduleRevision} onAsk={ask} onRebook={viewerMode?viewerNotice:openRebookForClient}/>
  }

  const nav=[['Today',Home],['Week',CalendarDays],['Month',Clock3],['Clients',Users],['More',Ellipsis]]

  return (
    <div className="app-shell">
      <style>{plannerThemeCss}</style>
      <header className="topbar">
        <div className="brand-mark">GP</div>
        <div><strong>Grooming Planner</strong><span>{viewerMode ? 'Viewer demo · read only' : 'Mobile business dashboard'}</span></div>
        <button className="top-ai" onClick={()=>ask()}><Sparkles size={16}/>Ask Planner</button>
      </header>
      <main>
        {viewerMode && <div className="viewer-banner"><div><span className="viewer-badge">Viewer</span> <strong>Read-only demo</strong> · Client phone numbers and street addresses are hidden, and changes are blocked.</div><button type="button" onClick={()=>supabase?.auth?.signOut?.()}>Sign out</button></div>}
        {saveMessage && <div className="prototype-note" role="status" style={{marginBottom:16}}>
          {saveMessage} <button className="text-btn" onClick={()=>setSaveMessage('')}>Dismiss</button>
        </div>}
        {body}
      </main>

      <button className="floating-ai" onClick={()=>ask()}>
        <Sparkles size={18}/><span>Ask Planner</span>
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
      {!viewerMode && <FillOpeningSheet open={fillOpening.open} dateKey={fillOpening.date} preferredGroomer={fillOpening.groomer} dayAppointments={fillOpening.appointments} dogs={dogs} onClose={()=>setFillOpening(current=>({...current,open:false}))} onChoose={preset=>{
        setFillOpening(current=>({...current,open:false}))
        setAddAppointment({open:true,date:preset.date,preset})
      }}/> }
      {!viewerMode && <AddAppointmentSheet open={addAppointment.open} dateKey={addAppointment.date} dogs={dogs} preset={addAppointment.preset} onClose={()=>setAddAppointment(current=>({...current,open:false,preset:null}))} onSaved={message=>{
        setAddAppointment(current=>({...current,open:false,preset:null}))
        setSaveMessage(message)
        setScheduleRevision(value=>value+1)
      }}/> }
      <AssistantSheet open={assistant.open} initial={assistant.initial} dogs={dogs} onClose={()=>setAssistant({open:false,initial:''})} onChoose={viewerMode?viewerNotice:preset=>{ setAssistant({open:false,initial:''}); setAddAppointment({open:true,date:preset.date,preset}) }} onClient={client=>{ setAssistant({open:false,initial:''}); setClientJump(client); setTab('Clients') }} viewerMode={viewerMode}/>
    </div>
  )
}
