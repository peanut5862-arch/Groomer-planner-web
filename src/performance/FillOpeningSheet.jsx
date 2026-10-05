import React, { useEffect, useState } from 'react';
import { supabase } from "../supabase.js";
import { X } from 'lucide-react';
import { apiUrl, clockMinutesForDisplay, displayClockTime, compareAppointmentTimes, fullClientAddress, clientAddressLookup, appointmentAddress, defaultFirstStopTime, appointmentDurationMinutes, businessDateKey, mondayForDate, serviceDefaultsForDog, openingForDuration, canonicalServiceLabel, appointmentServiceOptions, clientDueInfo, canonicalAreaLabel } from './shared.jsx'

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

      const response = await fetch(apiUrl('/api/google-route'),{
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

export default FillOpeningSheet

