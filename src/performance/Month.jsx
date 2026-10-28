import {timeOffReason} from './timeOff.js';
import { monthVisits } from './monthVisits.js';
import { businessSettings, groomerNames, groomerConfig, firstGroomer, groomerWorksOn, chooseGroomer, calendarWorkDays, getBusinessContext, setBusinessContext, useBusinessContext } from './businessConfig.js';
import {groomerColorStyle} from './groomerColors.js';
import RecurringPlanSheet from './RecurringPlanSheet.jsx';
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from "../supabase.js";
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { mondayForDate, Stat, ApptCard, businessDateKey, todayAppointments, plannerClientGroups, plannerActiveRow, clientDueInfo, canonicalAreaLabel } from './shared.jsx'

function monthGrid(monthKey) {
  const first = new Date(`${monthKey}-01T12:00:00Z`)
  const last = new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0,12))
  const start = new Date(`${mondayForDate(first.toISOString().slice(0,10))}T12:00:00Z`)
  const end = new Date(`${mondayForDate(last.toISOString().slice(0,10))}T12:00:00Z`)
  const days = []
  for (let week = new Date(start); week <= end; week.setUTCDate(week.getUTCDate()+7)) {
    for (const weekday of calendarWorkDays()) {
      const offset=weekday===0?6:weekday-1
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

function Month({onOpen,revision,dogs,viewerMode=false,onAddAppointment,onFillOpening}) {
  const business = useBusinessContext()
  const [recurringOpen,setRecurringOpen] = useState(false)
  const [notice,setNotice] = useState('')
  const [search,setSearch] = useState('')
  const [dueFilter,setDueFilter] = useState('Due soon')
  const [chosenClient,setChosenClient] = useState(null)
  const [month,setMonth] = useState(()=>businessDateKey().slice(0,7))
  const [groomer,setGroomer] = useState('All')
  useEffect(() => { if (groomer !== 'All' && !groomerNames().includes(groomer)) setGroomer('All') }, [business.revision,groomer])
  const [selected,setSelected] = useState(()=>businessDateKey())
  const [result,setResult] = useState(null)
  const [loading,setLoading] = useState(true)
  const [error,setError] = useState('')
  const [refresh,setRefresh] = useState(0)
  const {days,firstWeek,lastWeek} = useMemo(()=>monthGrid(month),[month])

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
          .order('week_start')
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
  const rows = useMemo(()=>weeks.flatMap(week=>Array.isArray(week.plan_json)?week.plan_json:[]),[weeks])
  const clients = useMemo(()=>plannerClientGroups(dogs).map(client=>{
    const booked = rows.filter(row=>plannerActiveRow(row)).some(row=>
      client.household ? String(row['Household ID'] || '')===client.household : String(row.Owner || '').trim().toLowerCase()===client.owner.toLowerCase())
    return {...client,booked,due:clientDueInfo(client.rows),area:canonicalAreaLabel(client.rows[0]?.area || client.rows[0]?.Area)}
  }),[dogs,rows])
  const needing = clients.filter(client=>!client.booked && `${client.owner} ${client.rows.map(row=>row.dog || row.Dog).join(' ')} ${client.area}`.toLowerCase().includes(search.toLowerCase()) &&
    (dueFilter==='On demand' ? !client.due.dueDate : dueFilter==='Overdue' ? client.due.status==='Overdue' : client.due.dueDate && client.due.days>=0 && client.due.days<=28))
  const appointmentsByDay = useMemo(()=>Object.fromEntries(
    days.map(day=>[day,todayAppointments(rows,day,groomer,dogs)])
  ),[rows,days,groomer,dogs])
  const appointmentsOn = day => appointmentsByDay[day] || []
  const monthly = useMemo(()=>days.filter(day=>day.startsWith(month)).flatMap(day=>appointmentsByDay[day] || []),[days,month,appointmentsByDay])
  const total = useMemo(()=>monthly.reduce((sum,appt)=>sum+(Number.isFinite(appt.price)?appt.price:0),0),[monthly])
  const selectedAppointments = appointmentsOn(selected)
  const selectedVisits = monthVisits(selectedAppointments)
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
        {['All',...groomerNames()].map(name=><button key={name} className={groomer===name?'active':''}
          aria-pressed={groomer===name} onClick={()=>setGroomer(name)}>{name}</button>)}
      </div>
      <div className="section-title">
        <button className="text-btn" onClick={()=>{setMonth(businessDateKey().slice(0,7));setSelected(businessDateKey())}}>This month</button>
        <button className="text-btn" disabled={loading} onClick={()=>setRefresh(value=>value+1)}>Refresh</button>
      </div>
      {!viewerMode && ['owner','editor'].includes(business.role) && <button className="primary-mini" style={{marginBottom:12}} onClick={()=>setRecurringOpen(true)}>Plan next 3 months</button>}
      {notice && <div className="prototype-note" role="status">{notice}</div>}
      {recurringOpen && <RecurringPlanSheet dogs={dogs} onClose={()=>setRecurringOpen(false)} onSaved={message=>{setNotice(message);setRefresh(v=>v+1)}}/>}
      {loading && <div className="prototype-note" role="status">Loading your month…</div>}
      {error && <div className="login-message" role="alert">{error}</div>}
      {ready && <>
        <div className="calendar month-planner-grid" style={{gridTemplateColumns:`repeat(${calendarWorkDays().length},minmax(0,1fr))`}}>
          {calendarWorkDays().map(day=>['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day]).map(day=><div className="dow" key={day}>{day}</div>)}
          {days.map(day=>{
            const inMonth = day.startsWith(month)
            const appointments = inMonth ? appointmentsOn(day) : []
            const visitCount = monthVisits(appointments).length
            return <button type="button" key={day} disabled={!inMonth}
              className={`cal-day ${appointments.length?'busy':''}`}
              aria-pressed={selected===day} aria-label={`${day}, ${visitCount} stops`}
              onClick={()=>setSelected(day)}
              style={{textAlign:'left',font:'inherit',minWidth:0,cursor:inMonth?'pointer':'default',
                opacity:inMonth?1:0.3,outline:selected===day?'2px solid #006876':'none',outlineOffset:-2}}>
              <span className="day-num">{Number(day.slice(8))}</span>
              <strong className="month-count">{visitCount} {visitCount===1?'stop':'stops'}</strong>
              <span className="month-cell-total">{new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(appointments.reduce((sum,a)=>sum+(Number(a.price)||0),0))}</span>
              <span className="month-load" aria-hidden="true" style={{background:appointments.length?'#006876':'#ddd'}}/>
              {chosenClient && appointments.some(a=>canonicalAreaLabel(a.area)===chosenClient.area) && <small>Same area</small>}

            </button>
          })}
        </div>
        <div className="month-summary">
          <Stat label="Scheduled stops" value={monthVisits(monthly).length}/>
          <Stat label="Scheduled total" value={new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(total)}/>
        </div>
        <div className="prototype-note">Saved drafts and confirmed weeks. Counts show stops, not available capacity. Check route suggestions before promising a time.
          {monthly.some(appt=>!Number.isFinite(appt.price)) && ' Total includes known prices only.'}
        </div>
        <div className="section-title"><h3>{new Date(`${selected}T12:00:00Z`).toLocaleDateString('en-US',{timeZone:'UTC',weekday:'long',month:'short',day:'numeric'})}</h3></div>
        {!viewerMode && <div className="month-actions">
          <button className="primary-mini" onClick={()=>onAddAppointment?.(selected,groomer,chosenClient?.key)}>Add appointment</button>
          <button className="ghost" onClick={()=>onFillOpening?.({date:selected,groomer,appointments:selectedAppointments})}>Find clients for this day</button>
        </div>}
        {chosenClient && <div className="prototype-note">{chosenClient.owner}: dates marked Same area share an existing route area. Drive time and appointment fit still need checking. <button className="text-btn" onClick={()=>setChosenClient(null)}>Clear selection</button></div>}
        {[...new Set((groomer==='All'?groomerNames():[groomer]).map(name=>{const reason=timeOffReason(business.settings,groomerConfig(name),selected);return reason?`${name}: ${reason}`:''}).filter(Boolean))].map(reason=><div className="login-message" key={reason}>Time off · {reason}{selectedAppointments.length?' — Review existing bookings.':''}</div>)}
        {selectedWeek && <div className="eyebrow" style={{marginBottom:12}}>{selectedWeek.status==='confirmed'?'Confirmed week':'Draft week'}</div>}
        <div className="appt-list">{selectedVisits.map(visit=>visit.appointments.length===1 ? <ApptCard key={visit.key} appt={visit.appointments[0]} dogs={dogs} viewerMode={viewerMode} onOpen={mode=>onOpen({...visit.appointments[0],_initialMode:mode || 'edit'})}/> : <div className="appt-card groomer-colored month-household" key={visit.key} style={groomerColorStyle(groomerConfig(visit.groomer))}>
          <h3>{visit.owner}</h3><p>{visit.groomer} · {visit.appointments.map(appt=>appt.dogs).join(' · ')}</p>
          <strong>{visit.appointments.some(appt=>/to confirm/i.test(appt.dogs)) ? 'Service and price to confirm' : `${new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(visit.appointments.reduce((sum,appt)=>sum+(Number(appt.price)||0),0))} total`}</strong>
          <div className="month-visit-details">{visit.appointments.map(appt=><button className="ghost" key={appt.id} onClick={()=>onOpen({...appt,_initialMode:'edit'})}>{appt.time} · {appt.dogs}{appt.completed?' · Completed':''} · View details</button>)}</div>
        </div>)}</div>
        {!selectedAppointments.length && <div className="prototype-note">{selectedWeek
          ? `No appointments scheduled${groomer==='All'?'':` for ${groomer}`} on this date.`
          : 'No saved schedule for this week yet.'}</div>}
        {!viewerMode && <div className="month-needs">
          <h3>Clients needing scheduling</h3>
          <input aria-label="Search clients needing scheduling" placeholder="Search client, dog, or area" value={search} onChange={e=>setSearch(e.target.value)}/>
          <div className="segmented">{['Due soon','Overdue','On demand'].map(filter=><button key={filter} className={dueFilter===filter?'active':''} onClick={()=>setDueFilter(filter)}>{filter}</button>)}</div>
          <p className="settings-help">Due soon covers the next 28 days. On demand includes clients without a calculated due date. Households with an active future booking are excluded.</p>
          {needing.map(client=><div className="month-client" key={client.key}>
            <button className="text-btn" onClick={()=>setChosenClient(client)}><strong>{client.owner}</strong><span>{client.rows.map(row=>row.dog || row.Dog).join(' & ')} · {client.area}</span><small>{client.due.dueDate ? `${client.due.status} · ${client.due.dueDate}` : 'No calculated due date'}</small></button>
            <button className="ghost" onClick={()=>onAddAppointment?.(selected,groomer,client.key)}>Schedule</button>
          </div>)}
          {!needing.length && <p>No clients match this filter.</p>}
        </div>}

      </>}
    </section>
  )
}

export default Month
