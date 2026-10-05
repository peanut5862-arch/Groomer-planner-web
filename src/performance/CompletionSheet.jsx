import React, { useEffect, useState } from 'react';
import { supabase } from "../supabase.js";
import { X, MessageCircle, Share2 } from 'lucide-react';
import { messageDateLabel, arrivalWindowLabel, canonicalServiceLabel, appointmentServiceOptions, appointmentTimeInput, apiUrl, clientConfirmationStatus, phoneForScheduleRow, confirmationMessage, reminderMessage, runningLateMessage, onMyWayMessage, imHereMessage, needAccessMessage, finishedReadyMessage, preferredPaymentForAppointment, paymentReminderMessage, readAppointmentContact, saveAppointmentContact, contactLabel, googleEtaToAppointment, etaArrivalClock, openSms, openCall, shareAppointmentAddress, businessDateKey, mondayForDate, clockMinutesForDisplay, displayClockTime, clientAddressLookup, appointmentAddress, schedulingOverrideReasons, completionBlockReason, scheduleRowDuration } from './shared.jsx'

// The original viewer sheet referenced Clients' private textDate helper.
// Keep the identical date format available in this sheet's own module.
function textDate(value) {
  if (!value) return ''
  const key = String(value).slice(0,10)
  const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return String(value)
  const date = new Date(`${key}T12:00:00Z`)
  return date.toLocaleDateString('en-US',{timeZone:'UTC',month:'short',day:'numeric',year:'numeric'})
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
  const sendClientAddress = async () => {
    try {
      const result = await shareAppointmentAddress({owner:appt.owner,address:clientAddress})
      if (result === 'copied') setError('Address and Google Maps link copied. Paste it into a message to the groomer.')
      else setError('')
    } catch (error) {
      if (error?.name !== 'AbortError') setError(error?.message || 'Could not share the appointment address.')
    }
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
            const response = await fetch(apiUrl('/api/google-route'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({groomer,stops:routeRows.map(({row,...stop})=>stop)})})
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
            <button type="button" disabled={!clientAddress} onClick={sendClientAddress}><Share2 size={14}/> Send address</button>
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
            <button type="button" disabled={!phone} onClick={async()=>{
              try {
                const paymentMethod = await preferredPaymentForAppointment(appt)
                recordAndText(paymentReminderMessage({owner:appt.owner,total:appt.price,paymentMethod}),'Payment')
              } catch (err) {
                setError(err?.message || 'Could not load the preferred payment method.')
              }
            }}>Payment total</button>
            <button type="button" disabled={!phone} onClick={()=>openSms(phone,'')}>Custom text</button>
            <button type="button" disabled={!phone} onClick={()=>openCall(phone)}>Call</button>
            <button type="button" disabled={!clientAddress} onClick={sendClientAddress}><Share2 size={13}/> Send address</button>
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

export default CompletionSheet
