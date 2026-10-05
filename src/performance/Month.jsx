import { businessSettings, groomerNames, groomerConfig, firstGroomer, groomerWorksOn, chooseGroomer, calendarWorkDays, getBusinessContext, setBusinessContext, useBusinessContext } from './businessConfig.js';
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from "../supabase.js";
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { mondayForDate, Stat, ApptCard, businessDateKey, todayAppointments } from './shared.jsx'

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

function Month({onOpen,revision,dogs}) {
  const [month,setMonth] = useState(()=>businessDateKey().slice(0,7))
  const [groomer,setGroomer] = useState('All')
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
  const rows = useMemo(()=>weeks.flatMap(week=>Array.isArray(week.plan_json)?week.plan_json:[]),[weeks])
  const appointmentsByDay = useMemo(()=>Object.fromEntries(
    days.map(day=>[day,todayAppointments(rows,day,groomer,dogs)])
  ),[rows,days,groomer,dogs])
  const appointmentsOn = day => appointmentsByDay[day] || []
  const monthly = useMemo(()=>days.filter(day=>day.startsWith(month)).flatMap(day=>appointmentsByDay[day] || []),[days,month,appointmentsByDay])
  const total = useMemo(()=>monthly.reduce((sum,appt)=>sum+(Number.isFinite(appt.price)?appt.price:0),0),[monthly])
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
        {['All',...groomerNames(true)].map(name=><button key={name} className={groomer===name?'active':''}
          aria-pressed={groomer===name} onClick={()=>setGroomer(name)}>{name}</button>)}
      </div>
      <div className="section-title">
        <button className="text-btn" onClick={()=>{setMonth(businessDateKey().slice(0,7));setSelected(businessDateKey())}}>This month</button>
        <button className="text-btn" disabled={loading} onClick={()=>setRefresh(value=>value+1)}>Refresh</button>
      </div>
      {loading && <div className="prototype-note" role="status">Loading your month…</div>}
      {error && <div className="login-message" role="alert">{error}</div>}
      {ready && <>
        <div className="calendar" style={{gridTemplateColumns:`repeat(${calendarWorkDays().length},minmax(0,1fr))`}}>
          {calendarWorkDays().map(day=>['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day]).map(day=><div className="dow" key={day}>{day}</div>)}
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

export default Month

