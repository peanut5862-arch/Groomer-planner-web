import {requestWithTimeout} from './requestWithTimeout.js';
import React, { useEffect, useState } from 'react';
import { businessSettings, groomerNames, groomerConfig, firstGroomer, groomerWorksOn, getBusinessContext } from './businessConfig.js';
import { supabase } from "../supabase.js";
import { Capacitor } from '@capacitor/core';
import { ChevronRight, MapPin, Route, WalletCards, MessageCircle, Share2 } from 'lucide-react';

const API_ORIGIN = 'https://groomer-planner-web.vercel.app'

function apiUrl(path) {
  const clean = String(path || '')
  return Capacitor.isNativePlatform() ? `${API_ORIGIN}${clean}` : clean
}

async function apiFetch(path, options={}) {
  const {data} = await supabase?.auth.getSession() || {data:{}}
  const token = data?.session?.access_token
  return requestWithTimeout(apiUrl(path),{...options,headers:{...options.headers,...(token ? {Authorization:`Bearer ${token}`} : {})}})
}


function dismissFormKeyboard() {
  if (typeof document === 'undefined') return
  const active = document.activeElement
  if (active?.matches('input, select, textarea, [contenteditable="true"]')) active.blur()
}

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

const clientContactLookupCache = new WeakMap()

function clientContactLookup(dogs) {
  if (!Array.isArray(dogs)) return {byHousehold:{},byOwner:{}}
  const cached = clientContactLookupCache.get(dogs)
  if (cached) return cached

  const byHousehold = {}
  const byOwner = {}
  for (const dog of dogs) {
    const household = String(dog?.household_id || dog?.['Household ID'] || '').trim().toLowerCase()
    const owner = String(dog?.owner || dog?.Owner || '').trim().toLowerCase()
    const phone = String(dog?.phone || dog?.Phone || '').trim()
    if (household && phone && !byHousehold[household]) byHousehold[household] = phone
    if (owner && phone && !byOwner[owner]) byOwner[owner] = phone
  }

  const lookup = {byHousehold,byOwner}
  clientContactLookupCache.set(dogs,lookup)
  return lookup
}

function phoneForScheduleRow(dogs,row) {
  const household = String(row?.['Household ID'] || '').trim().toLowerCase()
  const owner = String(row?.Owner || '').trim().toLowerCase()
  const lookup = clientContactLookup(dogs)
  return (household && lookup.byHousehold[household]) || (owner && lookup.byOwner[owner]) || ''
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

function paymentPreferenceKey(household,owner) {
  const householdValue = String(household || '').trim().toLowerCase()
  if (householdValue) return `h:${householdValue}`
  const ownerValue = String(owner || '').trim().toLowerCase()
  return ownerValue ? `o:${ownerValue}` : ''
}

function paymentMethodDetails(method) {
  const key=String(method || '').trim()
  const saved=businessSettings().paymentInstructions?.[key]
  if(saved) return saved
  return {'Cash/Check':'Cash or check is perfect. Thank you!','Cash':'Cash is perfect. Thank you!','Check':'A check is perfect. Thank you!'}[key] || ''
}

async function preferredPaymentForAppointment(appt) {
  if (!supabase || !appt) return ''
  const row = appt?.sourceRow || {}
  const household = row?.['Household ID'] || row?.household_id || ''
  const key = paymentPreferenceKey(household,appt?.owner || row?.Owner)
  if (!key) return ''
  const {data,error} = await supabase
    .from('client_payment_preferences')
    .select('payment_method')
    .eq('owner_key',key)
    .maybeSingle()
  if (error) throw error
  return String(data?.payment_method || '').trim()
}

function paymentReminderMessage({owner,total,paymentMethod}) {
  const first = String(owner || '').trim().split(/\s+/)[0] || 'there'
  const n = Number(total)
  const amount = Number.isFinite(n)
    ? n.toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:0,maximumFractionDigits:2})
    : '$0'
  const detail = paymentMethodDetails(paymentMethod)
  return `Hi ${first}! Today's grooming total is ${amount}. Thank you!${detail ? `\n\n${detail}` : ''}`
}

function appointmentContactKey(appt) {
  const row = appt?.sourceRow || {}
  const week = String(appt?.weekStart || row?.week_start || '').slice(0,10)
  const household = String(row?.['Household ID'] || row?.household_id || '').trim()
  const owner = String(appt?.owner || row?.Owner || '').trim()
  const date = String(appt?.date || row?.Date || '').slice(0,10)
  const time = String(appt?.time || row?.['Start Time'] || row?.['Locked Time'] || '').trim()
  return `grooming-contact-v1:${getBusinessContext().businessId}:${week}:${household || owner}:${date}:${time}`
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

function currentPosition(timeoutMs=7000) {
  return new Promise((resolve,reject)=>{
    if (!navigator.geolocation) return reject(new Error('Location is not available on this device.'))
    let settled = false
    const finish = fn => value => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn(value)
    }
    const timer = setTimeout(()=>finish(reject)(new Error('Location took too long. Check iPhone Location Services for Grooming Planner and try again.')),timeoutMs)
    navigator.geolocation.getCurrentPosition(
      finish(resolve),
      finish(()=>reject(new Error('Allow location access for Grooming Planner to calculate a live ETA.'))),
      {enableHighAccuracy:true,timeout:Math.max(3000,timeoutMs-500),maximumAge:60000}
    )
  })
}

async function googleEtaToAppointment(appt,dogs) {
  const lookup = clientAddressLookup(dogs || [])
  const address = appointmentAddress(appt,lookup)
  if (!address) throw new Error(`Add a street address for ${appt?.owner || 'this client'} first.`)
  const position = await currentPosition(7000)
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const abortTimer = controller ? setTimeout(()=>controller.abort(),8000) : null
  try {
    const response = await apiFetch('/api/google-route',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      signal:controller?.signal,
      body:JSON.stringify({
        mode:'eta',
        origin:{latitude:position.coords.latitude,longitude:position.coords.longitude},
        destination:{address,owner:appt?.owner || 'Client'}
      })
    })
    const payload = await response.json().catch(()=>({}))
    if (!response.ok) throw new Error(payload?.error || `Google ETA failed (${response.status}).`)
    if (!Number.isFinite(Number(payload?.etaMinutes))) throw new Error('Google did not return an ETA. Try again in a moment.')
    return payload
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Google ETA took too long. Check your connection and try again.')
    throw error
  } finally {
    if (abortTimer) clearTimeout(abortTimer)
  }
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

function googleMapsAddressUrl(address) {
  const clean = String(address || '').trim()
  return clean ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clean)}` : ''
}

async function shareAppointmentAddress({owner,address}) {
  const cleanAddress = String(address || '').trim()
  if (!cleanAddress) throw new Error('No saved street address for this client.')
  const name = String(owner || 'Client').trim() || 'Client'
  const mapsUrl = googleMapsAddressUrl(cleanAddress)
  const text = `${name} appointment address:\n${cleanAddress}\n${mapsUrl}`
  if (navigator.share) {
    await navigator.share({title:`${name} appointment address`,text})
    return 'shared'
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return 'copied'
  }
  throw new Error('Sharing is not available on this device.')
}

function ApptCard({appt,dogs,onOpen,onComplete,onUndo,onConfirmation,onPayment,completing,confirmationSaving,paymentSaving,viewerMode=false}) {
  const [showTextMenu,setShowTextMenu] = useState(false)
  const [showLate,setShowLate] = useState(false)
  const [etaLoading,setEtaLoading] = useState(false)
  const [etaReady,setEtaReady] = useState(null)
  const [communicationError,setCommunicationError] = useState('')
  const [lastContact,setLastContact] = useState(()=>readAppointmentContact(appt))
  const row = appt?.sourceRow || {}
  const savedPaymentStatus = String(row['Payment Status'] || '').trim()
  const savedPaymentMethod = String(row['Payment Method'] || '').trim()
  const groomerPaymentType = String(row['Groomer Payment Type'] || '').trim()
  const savedTipRaw = Number(String(row.Tip ?? '').replace(/[$,]/g,'').trim())
  const savedTip = Number.isFinite(savedTipRaw) ? savedTipRaw : 0
  const savedAmountRaw = Number(String(row['Amount Paid'] ?? '').replace(/[$,]/g,'').trim())
  const savedAmount = Number.isFinite(savedAmountRaw) ? savedAmountRaw : null
  const paymentPaid = savedPaymentStatus.toLowerCase() === 'paid'
  const [showPayment,setShowPayment] = useState(false)
  const [paymentMethod,setPaymentMethod] = useState(
    savedPaymentMethod || (['Cash','Check'].includes(groomerPaymentType) ? groomerPaymentType : '')
  )
  const [tipInput,setTipInput] = useState(savedTip ? String(savedTip) : '')
  const [paymentError,setPaymentError] = useState('')
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
  const sendClientAddress = async () => {
    try {
      const result = await shareAppointmentAddress({owner:appt.owner,address:clientAddress})
      if (result === 'copied') setCommunicationError('Address and Google Maps link copied. Paste it into a message to the groomer.')
      else setCommunicationError('')
    } catch (error) {
      if (error?.name !== 'AbortError') setCommunicationError(error?.message || 'Could not share the appointment address.')
    }
  }
  useEffect(()=>{ setLastContact(readAppointmentContact(appt)); setCommunicationError(''); setEtaReady(null); setEtaLoading(false) },[appt?.id,appt?.date,appt?.time])
  useEffect(()=>{
    setPaymentMethod(savedPaymentMethod || (['Cash','Check'].includes(groomerPaymentType) ? groomerPaymentType : ''))
    setTipInput(savedTip ? String(savedTip) : '')
    setPaymentError('')
  },[appt?.id,savedPaymentMethod,savedTip,groomerPaymentType])
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
      const body = onMyWayMessage({owner:appt.owner,arrivalTime})
      setEtaReady({arrivalTime,body})
      setLastContact(saveAppointmentContact(appt,'On my way'))
      setShowTextMenu(false)
      setCommunicationError('')
      openSms(appt.phone,body)
    } catch (error) {
      setEtaReady(null)
      setCommunicationError(error?.message || 'Could not get a live Google ETA.')
    } finally {
      setEtaLoading(false)
    }
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
        {appt.services && appt.services !== appt.dogs && <div style={{fontSize:11,color:'#59616e',marginTop:4}}><strong>Services:</strong> {appt.services}</div>}
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
        {!viewerMode && groomerPaymentType && (
          <div style={{display:'inline-flex',alignItems:'center',gap:6,marginTop:8,padding:'5px 8px',borderRadius:999,background:'#f3f6fb',border:'1px solid #d8dfea',color:'#34415f',fontSize:11,fontWeight:850}}>
            <WalletCards size={13}/>{appt.groomer || 'Groomer'} noted: {groomerPaymentType}
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
              <button type="button" className="appt-text-btn" disabled={!clientAddress} onClick={sendClientAddress}>
                <Share2 size={13}/> Send address
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
                <button type="button" onClick={async()=>{
                  try {
                    const paymentMethod = await preferredPaymentForAppointment(appt)
                    sendAppointmentText(paymentReminderMessage({owner:appt.owner,total:appt.price,paymentMethod}),'Payment')
                  } catch (err) {
                    setCommunicationError(err?.message || 'Could not load the preferred payment method.')
                  }
                }}>Payment total</button>
                <button type="button" onClick={()=>openSms(appt.phone,'')}>Custom text</button>
                <button type="button" onClick={()=>openCall(appt.phone)}>Call</button>
                <button type="button" disabled={!clientAddress} onClick={sendClientAddress}><Share2 size={13}/> Send address</button>
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
        {!viewerMode && !inactive && onPayment && (
          <div
            className="appointment-payment"
            onPointerDown={event=>event.stopPropagation()}
            onTouchStart={event=>event.stopPropagation()}
            onClick={event=>event.stopPropagation()}
          >
            <button
              type="button"
              className={`appt-payment-btn ${paymentPaid?'paid':savedPaymentStatus.toLowerCase()==='unpaid'?'unpaid':''}`}
              onClick={()=>{setShowPayment(value=>!value);setPaymentError('')}}
            >
              <WalletCards size={14}/>
              {paymentPaid
                ? `${savedPaymentMethod || 'Paid'}${savedTip > 0 ? ` · +$${savedTip % 1 === 0 ? savedTip.toFixed(0) : savedTip.toFixed(2)} tip` : ''}`
                : savedPaymentStatus.toLowerCase()==='unpaid' ? 'Unpaid' : 'Payment'}
            </button>

            {showPayment && (
              <div className="payment-panel">
                <div className="payment-panel-title">Record payment</div>
                <div className="payment-service-total">
                  Service total: <strong>{Number.isFinite(appt.price) ? `$${appt.price.toFixed(2)}` : 'No price saved'}</strong>
                  {paymentPaid && savedAmount !== null && <span> · Collected ${`$${savedAmount.toFixed(2)}`}</span>}
                </div>

                <label>
                  Payment method
                  <select value={paymentMethod} onChange={event=>setPaymentMethod(event.target.value)}>
                    <option value="">Choose method…</option>
                    <option>Cash</option>
                    <option>Check</option>
                    <option>Venmo</option>
                    <option>PayPal</option>
                    <option>Cash App</option>
                    <option>Zelle</option>
                    <option>Apple Pay</option>
                  </select>
                </label>

                <label>
                  Tip
                  <div className="tip-input-wrap"><span>$</span><input inputMode="decimal" type="number" min="0" step="0.01" placeholder="0" value={tipInput} onChange={event=>setTipInput(event.target.value)}/></div>
                </label>

                {Number.isFinite(appt.price) && (
                  <div className="payment-preview">
                    Total collected if paid: <strong>${(appt.price + Math.max(0,Number(tipInput || 0) || 0)).toFixed(2)}</strong>
                  </div>
                )}

                {paymentError && <div className="communication-error">{paymentError}</div>}

                <div className="payment-actions">
                  <button
                    type="button"
                    className="save"
                    disabled={paymentSaving || !paymentMethod}
                    onClick={async()=>{
                      if(!paymentMethod){setPaymentError('Choose a payment method first.');return}
                      const tip=Math.max(0,Number(tipInput || 0) || 0)
                      const ok=await onPayment(appt,'Paid',paymentMethod,tip)
                      if(ok){setShowPayment(false);setPaymentError('')}
                    }}
                  >
                    {paymentSaving?'Saving…':'Save paid'}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={paymentSaving}
                    onClick={async()=>{
                      const ok=await onPayment(appt,'Unpaid','',0)
                      if(ok){setShowPayment(false);setPaymentError('')}
                    }}
                  >
                    Mark unpaid
                  </button>
                </div>
              </div>
            )}
          </div>
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

function businessDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone:businessSettings().timeZone || 'America/Chicago', year:'numeric', month:'2-digit', day:'2-digit'
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
  const state = routeValue(row,'state','State')
  const zip = routeValue(row,'zip','ZIP','Zip')
  if (!street) return ''
  const cityState = [city,state].filter(Boolean).join(', ')
  return [street,cityState,zip].filter(Boolean).join(' ').replace(/\s+/g,' ').trim()
}

const clientAddressLookupCache = new WeakMap()

function clientAddressLookup(dogs) {
  if (!Array.isArray(dogs)) return {}
  const cached = clientAddressLookupCache.get(dogs)
  if (cached) return cached

  const lookup = {}
  for (const row of dogs) {
    const address = fullClientAddress(row)
    if (!address) continue
    const household = routeValue(row,'household_id','Household ID')
    const owner = routeValue(row,'owner','Owner')
    if (household && !lookup[`h:${routeKey(household)}`]) lookup[`h:${routeKey(household)}`] = address
    if (owner && !lookup[`o:${routeKey(owner)}`]) lookup[`o:${routeKey(owner)}`] = address
  }
  clientAddressLookupCache.set(dogs,lookup)
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
  return groomerConfig(groomer)?.startTime || '09:00'
}

function schedulingOverrideReasons(date,groomer,assignedGroomers=[]) {
  const reasons = []
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
    if (!groomerWorksOn(groomer,date)) reasons.push(`${groomer || 'This groomer'} does not normally work on this day.`)
  }
  const assigned = [...new Set((assignedGroomers || []).filter(name=>groomerNames().includes(name)))]
  if (assigned.length === 1 && groomer && groomer !== assigned[0]) reasons.push(`This household is normally assigned to ${assigned[0]}.`)
  return reasons
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
  const profile = groomerConfig(groomer || firstGroomer())
  const startOfDay = clockMinutesForDisplay(profile?.startTime || '09:00')
  const endOfDay = clockMinutesForDisplay(profile?.endTime || '17:30')
  const buffer = businessSettings().bufferMinutes
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
    if (slot.start - cursor >= duration + buffer) return fillClockValue(cursor)
    cursor = Math.max(cursor,slot.end + buffer)
  }
  if (endOfDay - cursor >= duration) return fillClockValue(cursor)
  return ''
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

const appointmentServiceOptions = ['Groom','Bath Only','Partial Groom']

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

function scheduleRowDuration(row, fallback=60) {
  const raw = Number(String(row?.Minutes ?? row?.['Minutes'] ?? '').replace(/[^0-9.]/g,''))
  return Number.isFinite(raw) && raw > 0 ? raw : fallback
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

export { API_ORIGIN, apiUrl, apiFetch, dismissFormKeyboard, Stat, clientConfirmationStatus, confirmationTone, needsClientConfirmation, normalizedPhone, clientContactLookupCache, clientContactLookup, phoneForScheduleRow, arrivalWindowLabel, messageDateLabel, naturalPetNames, confirmationMessage, reminderMessage, runningLateMessage, onMyWayMessage, imHereMessage, needAccessMessage, finishedReadyMessage, paymentPreferenceKey, paymentMethodDetails, preferredPaymentForAppointment, paymentReminderMessage, appointmentContactKey, readAppointmentContact, saveAppointmentContact, contactLabel, currentPosition, googleEtaToAppointment, etaArrivalClock, openSms, openCall, googleMapsAddressUrl, shareAppointmentAddress, ApptCard, businessDateKey, mondayForDate, todayAppointments, clockMinutesForDisplay, displayClockTime, compareAppointmentTimes, routeValue, routeKey, fullClientAddress, clientAddressLookupCache, clientAddressLookup, appointmentAddress, serviceDefaultsForDog, defaultFirstStopTime, schedulingOverrideReasons, fillClockValue, appointmentDurationMinutes, openingForDuration, canonicalServiceLabel, appointmentServiceOptions, dogDueInfo, clientDueInfo, canonicalAreaLabel, completionBlockReason, appointmentTimeInput, scheduleRowDuration, plannerClientGroups, plannerActiveRow }

