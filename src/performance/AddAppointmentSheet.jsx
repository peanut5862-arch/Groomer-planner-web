import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from "../supabase.js";
import { X } from 'lucide-react';
import { businessDateKey, displayClockTime, serviceDefaultsForDog, defaultFirstStopTime, schedulingOverrideReasons, canonicalServiceLabel, appointmentServiceOptions, canonicalAreaLabel } from './shared.jsx'

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

  const clients = useMemo(()=>Object.values((dogs || []).reduce((map,row) => {
    const owner = ownerOf(row)
    const dog = dogOf(row)
    if (!owner || !dog) return map
    const key = keyOf(row)
    if (!map[key]) map[key] = {key,owner,household:String(row?.household_id || row?.['Household ID'] || '').trim(),rows:[]}
    map[key].rows.push(row)
    return map
  },{})).sort((a,b)=>a.owner.localeCompare(b.owner)),[dogs])

  const client = useMemo(()=>clients.find(item=>item.key===clientKey) || null,[clients,clientKey])

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

export default AddAppointmentSheet

