import React, { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import {
  CalendarDays, ChevronLeft, ChevronRight, Clock3, Dog, Ellipsis, Home,
  MapPin, Plus, Route, Search, Settings, Sparkles, Users, WalletCards, X,
  CheckCircle2, MessageCircle, WandSparkles
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
  return <div className={`stat ${subtle?'subtle':''}`}><span>{label}</span><strong>{value}</strong></div>
}

function ApptCard({appt,onOpen,onComplete,onUndo,completing}) {
  const row = appt?.sourceRow || {}
  const today = businessDateKey()
  const date = String(row.Date || appt?.date || '').slice(0,10)
  const completed = appt?.completed || String(row['Completion Status'] || '').trim().toLowerCase()==='completed'
  const inactive = appt?.inactive || ['cancelled','canceled','moved to another week'].includes(String(row['Appointment Status'] || '').trim().toLowerCase())
  const canComplete = Boolean(onComplete) && !completed && !inactive && /^\d{4}-\d{2}-\d{2}$/.test(date)
  const hasUndoSnapshot = Boolean(row['Completion Snapshot'] && typeof row['Completion Snapshot'] === 'object')
  const canUndo = Boolean(onUndo) && completed && !inactive && hasUndoSnapshot
  return (
    <div className="appt-card" style={{cursor:onOpen?'pointer':'default'}} onClick={onOpen} role={onOpen?'button':undefined} tabIndex={onOpen?0:undefined}
      onKeyDown={onOpen ? event=>{ if(event.key==='Enter' || event.key===' '){event.preventDefault();onOpen()} } : undefined}>
      <div className="time-pill">{appt.time || '—'}</div>
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
        {!inactive && canComplete && (
          <button
            type="button"
            disabled={completing}
            onClick={event=>{
              event.stopPropagation()
              onComplete(appt)
            }}
            style={{
              marginTop:9, padding:0, border:0, background:'transparent', cursor:completing?'default':'pointer',
              fontSize:12, fontWeight:800, color:'#17223f', textDecoration:'underline',
              textUnderlineOffset:3
            }}
          >
            {completing ? 'Saving...' : 'Complete'}
          </button>
        )}
        {!inactive && completed && canUndo && (
          <button
            type="button"
            disabled={completing}
            onClick={event=>{
              event.stopPropagation()
              onUndo(appt)
            }}
            style={{
              marginTop:9, padding:0, border:0, background:'transparent', cursor:completing?'default':'pointer',
              fontSize:12, fontWeight:800, color:'#267447', textDecoration:'underline',
              textUnderlineOffset:3
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

function todayAppointments(rows, dateKey, groomer) {
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

function Today({onOpen,onComplete,onUndo,completingId,revision}) {
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
  const appointments = todayAppointments(record?.plan_json,dateKey,groomer)
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
        <button className="text-btn" disabled={loading} onClick={()=>setRefresh(value=>value+1)}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
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
          <div className="section-title"><h3>Appointments</h3></div>
          {appointments.length ? (
            <div className="appt-list">{appointments.map(appt=><ApptCard key={appt.id} appt={appt} onOpen={()=>onOpen(appt)} onComplete={onComplete} onUndo={onUndo} completing={completingId===appt.id}/>)}</div>
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

function compareAppointmentTimes(a, b) {
  const first = clockMinutesForDisplay(a?.time)
  const second = clockMinutesForDisplay(b?.time)
  // Equal or missing times retain their saved order. Missing times go last.
  if (first === second) return 0
  return first < second ? -1 : 1
}

function Week({onAsk,onOpen,onComplete,onUndo,completingId,revision}) {
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
  const visibleAppointments =
    groomer === 'All'
      ? appointments
      : appointments.filter(a => a.groomer === groomer)

  const statusLabel = weekRecord?.status === 'confirmed' ? 'Confirmed week' : 'Draft week'
  const weekEnd = addDays(weekStart,4)

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
            className={groomer===x?'active':''}
            onClick={()=>setGroomer(x)}
          >
            {x}
          </button>
        ))}
      </div>

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

              <div className="day-actions">
                <button
                  className="day-ai"
                  onClick={()=>onAsk(`Fill an opening on ${displayDay(dayDate)} ${displayDate(dayDate)}`)}
                >
                  <Sparkles size={14}/>Fill opening
                </button>
              </div>
            </div>

            {dayAppointments.length > 0 ? (
              <>
                <div style={{fontSize:11,color:'#8a8f99',margin:'0 0 8px 2px'}}>
                  {activeAppointments.length} stop{activeAppointments.length===1?'':'s'} · ${Math.round(revenue)}
                </div>
                <div className="appt-list">
                  {dayAppointments
                    .slice()
                    .sort(compareAppointmentTimes)
                    .map(appt=>(
                      <ApptCard key={appt.id} appt={appt} onOpen={()=>onOpen(appt)} onComplete={onComplete} onUndo={onUndo} completing={completingId===appt.id}/>
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
          Tap an appointment to edit, change services, cancel, reschedule, or mark a no-show. Use Complete directly on the schedule card.
        </div>
      )}
    </section>
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

function Month({onOpen,revision}) {
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
        <div className="appt-list">{selectedAppointments.map(appt=><ApptCard key={appt.id} appt={appt} onOpen={()=>onOpen(appt)}/>)}</div>
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
    return { dueDate:'', status:'Not enough data', detail:'Add a last service date and frequency', rank:5, days:null, nextLabel }
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

function clientDueInfo(rows) {
  const infos = (rows || []).map(row => ({row, ...dogDueInfo(row)}))
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

function Clients({ dogs, loading, error, onOpen, revision, onDataChanged }) {
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
    const status = scheduleInfo.date === today
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

  const blankDogForm = (client = null) => ({
    household_id:client?.household || '', owner:client?.owner || '', original_dog:'', dog:'',
    phone:client?.phone || '', groomer:client?.groomer || '', area:client?.area || '',
    address:client?.address || '', city:client?.city || '', state:client?.state || 'TX', zip:client?.zip || '',
    service:'Groom', groom_price:'', bath_price:'', partial_groom_price:'', groom_minutes:'', bath_minutes:'', partial_groom_minutes:'', frequency_weeks:'', last_groom:'', last_bath:''
  })

  const editDog = row => {
    const client = selectedClient
    setDogEditor({
    household_id:selectedClient.household || '', owner:selectedClient.owner || '',
    original_dog:valueOf(row,'dog','Dog') || '', dog:valueOf(row,'dog','Dog') || '',
    phone:selectedClient.phone || '', groomer:valueOf(row,'groomer','Groomer') || selectedClient.groomer || '',
    area:selectedClient.area || '', address:selectedClient.address || '', city:selectedClient.city || '',
    state:selectedClient.state || 'TX', zip:selectedClient.zip || '',
    service:canonicalServiceLabel(valueOf(row,'service_pattern','Service Pattern')) || 'Groom',
    groom_price:valueOf(row,'groom_price','Groom Price') || (['Groom','Service Varies'].includes(canonicalServiceLabel(valueOf(row,'service_pattern','Service Pattern'))) ? valueOf(row,'price','Price') : ''),
    bath_price:valueOf(row,'bath_price','Bath Price') || (['Bath','Bath Only'].includes(canonicalServiceLabel(valueOf(row,'service_pattern','Service Pattern'))) ? valueOf(row,'price','Price') : ''),
    partial_groom_price:valueOf(row,'partial_groom_price','Partial Groom Price') || (canonicalServiceLabel(valueOf(row,'service_pattern','Service Pattern'))==='Partial Groom' ? valueOf(row,'price','Price') : ''),
    groom_minutes:valueOf(row,'groom_minutes','Groom Minutes') || (['Groom','Service Varies'].includes(canonicalServiceLabel(valueOf(row,'service_pattern','Service Pattern'))) ? valueOf(row,'minutes','Minutes') : ''),
    bath_minutes:valueOf(row,'bath_minutes','Bath Minutes') || (['Bath','Bath Only'].includes(canonicalServiceLabel(valueOf(row,'service_pattern','Service Pattern'))) ? valueOf(row,'minutes','Minutes') : ''),
    partial_groom_minutes:valueOf(row,'partial_groom_minutes','Partial Groom Minutes') || (canonicalServiceLabel(valueOf(row,'service_pattern','Service Pattern'))==='Partial Groom' ? valueOf(row,'minutes','Minutes') : ''),
    frequency_weeks:valueOf(row,'frequency_weeks','Frequency Weeks'),
    last_groom:String(valueOf(row,'last_groom','Last Groom','last_groom_date','Last Groom Date') || '').slice(0,10),
    last_bath:String(valueOf(row,'last_bath','Last Bath','last_bath_date','Last Bath Date') || '').slice(0,10)
    })
    setSelectedClient(null)
  }

  const saveDogForm = async (form, closeNew=false) => {
    if (!supabase || dogSaving) return
    if (!String(form.owner||'').trim() || !String(form.dog||'').trim()) { setDogMessage('Owner and dog name are required.'); return }
    setDogSaving(true); setDogMessage('')
    try {
      const num = v => String(v ?? '').trim()==='' ? null : Number(v)
      const {data,error:saveError} = await supabase.rpc('save_grooming_dog', {
        p_household_id:String(form.household_id||'').trim() || null,
        p_owner:String(form.owner||'').trim(), p_original_dog:String(form.original_dog||'').trim() || null,
        p_dog:String(form.dog||'').trim(), p_phone:String(form.phone||'').trim() || null,
        p_groomer:String(form.groomer||'').trim() || null, p_area:canonicalAreaLabel(form.area) || null,
        p_address:String(form.address||'').trim() || null, p_city:String(form.city||'').trim() || null,
        p_state:String(form.state||'').trim() || null, p_zip:String(form.zip||'').trim() || null,
        p_service:form.service || 'Groom', p_price:num(form.groom_price || form.bath_price || form.partial_groom_price),
        p_groom_price:num(form.groom_price), p_bath_price:num(form.bath_price), p_partial_groom_price:num(form.partial_groom_price),
        p_groom_minutes:num(form.groom_minutes), p_bath_minutes:num(form.bath_minutes), p_partial_groom_minutes:num(form.partial_groom_minutes),
        p_minutes:num(form.groom_minutes || form.bath_minutes || form.partial_groom_minutes),
        p_frequency_weeks:num(form.frequency_weeks), p_last_groom:form.last_groom || null, p_last_bath:form.last_bath || null
      })
      if (saveError) throw saveError
      setDogEditor(null); if (closeNew) setNewClientOpen(false)
      onDataChanged?.(`${form.dog} saved.`)
      if (selectedClient) setSelectedClient(null)
    } catch(err) { setDogMessage(err?.message || 'Could not save dog.') }
    finally { setDogSaving(false) }
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
              status = 'Missed'
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
        <button className="primary-mini" onClick={() => { setDogMessage(''); setNewClientOpen(true); setDogEditor(blankDogForm()) }}><Plus size={16}/>New</button>
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
        {filtered.map((client, index) => (
          <button
            key={`${client.owner}-${index}`}
            onClick={() => setSelectedClient(client)}
          >
            <div className="avatar"><Dog size={18}/></div>
            <span>
              {client.owner} — {client.dogs.join(' + ')}
              {(client.area || client.groomer) && (
                <small style={{display:'block',fontWeight:500,color:'#7b828e',marginTop:2}}>
                  {[client.area, client.groomer].filter(Boolean).join(' · ')}
                </small>
              )}
              <small style={{display:'block',fontWeight:700,marginTop:4,color:
                client.dueInfo.status === 'Overdue' ? '#b63b36' :
                ['Due today','Due this week'].includes(client.dueInfo.status) ? '#9a6b18' :
                client.dueInfo.status === 'Due soon' ? '#53617a' : '#7b828e'}}>
                {client.dueInfo.status}{client.dueInfo.scheduled
                  ? ` · ${textDate(client.dueInfo.scheduleDate)}`
                  : client.dueInfo.dueDate ? ` · ${textDate(client.dueInfo.dueDate)}` : ''}
              </small>
            </span>
            <ChevronRight size={17}/>
          </button>
        ))}
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
              <label>Groomer<input value={dogEditor.groomer} onChange={e=>setDogEditor({...dogEditor,groomer:e.target.value})}/></label>
              <label style={{gridColumn:'1 / -1'}}>Area<input value={dogEditor.area} placeholder="Example: Conroe" onChange={e=>setDogEditor({...dogEditor,area:e.target.value})}/></label>
              <label style={{gridColumn:'1 / -1'}}>Address<input value={dogEditor.address} onChange={e=>setDogEditor({...dogEditor,address:e.target.value})}/></label>
              <label>City<input value={dogEditor.city} onChange={e=>setDogEditor({...dogEditor,city:e.target.value})}/></label>
              <label>ZIP<input value={dogEditor.zip} onChange={e=>setDogEditor({...dogEditor,zip:e.target.value})}/></label>
              <label style={{gridColumn:'1 / -1'}}>Service<select value={dogEditor.service} onChange={e=>setDogEditor({...dogEditor,service:e.target.value})}><option>Groom</option><option>Bath Only</option><option>Bath</option><option>Partial Groom</option><option>Service Varies</option></select></label>
              <label>Groom price<input type="number" inputMode="decimal" value={dogEditor.groom_price} onChange={e=>setDogEditor({...dogEditor,groom_price:e.target.value})}/></label>
              <label>Bath price<input type="number" inputMode="decimal" value={dogEditor.bath_price} onChange={e=>setDogEditor({...dogEditor,bath_price:e.target.value})}/></label>
              <label>Partial Groom price<input type="number" inputMode="decimal" value={dogEditor.partial_groom_price} onChange={e=>setDogEditor({...dogEditor,partial_groom_price:e.target.value})}/></label>
              <label>Groom time (min)<input type="number" inputMode="numeric" value={dogEditor.groom_minutes} onChange={e=>setDogEditor({...dogEditor,groom_minutes:e.target.value})}/></label>
              <label>Bath time (min)<input type="number" inputMode="numeric" value={dogEditor.bath_minutes} onChange={e=>setDogEditor({...dogEditor,bath_minutes:e.target.value})}/></label>
              <label>Partial Groom time (min)<input type="number" inputMode="numeric" value={dogEditor.partial_groom_minutes} onChange={e=>setDogEditor({...dogEditor,partial_groom_minutes:e.target.value})}/></label>
              <label>Frequency (weeks)<input type="number" inputMode="numeric" value={dogEditor.frequency_weeks} onChange={e=>setDogEditor({...dogEditor,frequency_weeks:e.target.value})}/></label>
              <label>Last groom<input type="date" value={dogEditor.last_groom} onChange={e=>setDogEditor({...dogEditor,last_groom:e.target.value})}/></label>
              <label>Last bath<input type="date" value={dogEditor.last_bath} onChange={e=>setDogEditor({...dogEditor,last_bath:e.target.value})}/></label>
            </div>
            <div className="prototype-note" style={{marginTop:12}}>Usual service: Groom, Bath Only, Bath, Partial Groom, or Service Varies. Each service can have its own price and time. Bath Only uses the Bath price and Bath time. Choose Service Varies when the dog comes on a regular schedule but the owner decides that week's service later. Last groom and last bath stay separate.</div>
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

            <div className="form-grid">
              <label>
                Phone
                <input readOnly value={selectedClient.phone || '—'} />
              </label>

              <label>
                Groomer
                <input readOnly value={selectedClient.groomer || '—'} />
              </label>

              <label style={{gridColumn:'1 / -1'}}>
                Address
                <input
                  readOnly
                  value={
                    [
                      selectedClient.address,
                      selectedClient.city,
                      selectedClient.state,
                      selectedClient.zip
                    ].filter(Boolean).join(', ') || '—'
                  }
                />
              </label>

              <label style={{gridColumn:'1 / -1'}}>
                Area
                <select
                  value={addingArea ? '__new__' : areaEditValue}
                  disabled={areaSaving}
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

              {addingArea ? (
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
              )}

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
              <div className="eyebrow" style={{marginBottom:8}}>Dogs & service history</div>
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
                      <strong style={{display:'block',marginBottom:6}}>{dog}</strong>
                      <div style={{display:'flex',gap:8,marginBottom:8}}>
                        <button type="button" className="secondary-btn" onClick={() => { setDogMessage(''); editDog(row) }}>Edit Dog</button>
                      </div>
                      <div style={{fontSize:12,color:'#59616e',lineHeight:1.65}}>
                        <div><strong>Last groom:</strong> {lastGroom ? textDate(lastGroom) : '—'}</div>
                        <div><strong>Last bath:</strong> {lastBath ? textDate(lastBath) : '—'}</div>
                        <div><strong>{nextService === 'Service Varies' ? 'Usual service:' : 'Next service:'}</strong> {nextService || '—'}</div>
                        <div><strong>Next due:</strong> {due.dueDate ? textDate(due.dueDate) : '—'}</div>
                        <div style={{fontWeight:700,color:
                          due.status === 'Overdue' ? '#b63b36' :
                          ['Due today','Due this week'].includes(due.status) ? '#9a6b18' :
                          due.status === 'Due soon' ? '#53617a' : '#7b828e'}}>
                          {due.status}{due.detail && due.status !== due.detail ? ` · ${due.detail}` : ''}
                        </div>
                      </div>
                      <div style={{fontSize:12,color:'#7b828e',marginTop:6,lineHeight:1.5}}>
                        {[servicePattern,
                          price !== '' ? `$${price}` : '',
                          minutes !== '' ? `${minutes} min` : '',
                          frequency !== '' ? `Every ${frequency} wks` : ''
                        ].filter(Boolean).join(' · ') || 'Service details not set'}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{display:'flex',justifyContent:'flex-end',marginTop:10}}>
              <button type="button" className="primary-mini" onClick={() => { const form=blankDogForm(selectedClient); setDogMessage(''); setDogEditor(form); setSelectedClient(null) }}><Plus size={15}/>Add Dog</button>
            </div>

            <div style={{marginTop:18}}>
              <div className="eyebrow" style={{marginBottom:8}}>Appointment history</div>
              {historyLoading && <div className="prototype-note">Loading appointment history…</div>}
              {historyError && <div className="login-message">{historyError}</div>}
              {!historyLoading && !historyError && history.length === 0 && (
                <div className="prototype-note">No completed, cancelled, rescheduled, or past appointments found yet.</div>
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
                      style={needsReview ? {width:'100%',textAlign:'left',cursor:'pointer',font:'inherit',color:'inherit'} : undefined}
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

function More() {
  return (
    <section>
      <div className="page-head"><div><div className="eyebrow">Business</div><h1>More</h1></div></div>
      <div className="menu-list">
        <button><Settings size={19}/><span>Scheduling settings</span><ChevronRight size={17}/></button>
        <button><Route size={19}/><span>Route settings</span><ChevronRight size={17}/></button>
        <button><WalletCards size={19}/><span>Revenue & reports</span><ChevronRight size={17}/></button>
      </div>
    </section>
  )
}

function completionBlockReason(row,today) {
  if (String(row?.['Completion Status'] || '').trim().toLowerCase()==='completed') return 'This appointment is already completed.'
  if (['cancelled','canceled','moved to another week'].includes(String(row?.['Appointment Status'] || '').trim().toLowerCase())) return 'Cancelled or moved appointments cannot be completed.'
  const date = String(row?.Date || '').slice(0,10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'This appointment needs a valid scheduled date.'
  if (!String(row?.['Household ID'] || '').trim() || !String(row?.Dogs || '').trim()) return 'Household or service details are missing. Update this appointment in the existing planner first.'
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
  if (groomer==='Jen' && ![2,3,4].includes(day)) return 'Jen works Tuesday through Thursday.'
  if (!['Jen','Haley'].includes(groomer)) return 'Choose a groomer.'
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return 'Choose a valid arrival time.'
  return ''
}

function CompletionSheet({appt,dogs,onClose,onSaved}) {
  const row = appt.sourceRow
  const today = businessDateKey()
  const originalDate = String(row.Date || today).slice(0,10)
  const [mode,setMode] = useState('edit')
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
  const groomers = ['Jen','Haley'].filter(name=>restrictions.every(assigned=>assigned===name))
  const close = () => { if (!savingRef.current) onClose() }


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

  const submit = async event => {
    event.preventDefault()
    if (savingRef.current || completed || moved || missed) return
    if (mode==='edit') {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(editTime)) { setError('Choose a valid arrival time.'); return }
      if (!groomers.includes(editGroomer)) { setError('Choose the household’s assigned groomer.'); return }
    }
    if (mode==='reschedule') {
      const message=rescheduleValidation(targetDate,targetTime,targetGroomer,businessDateKey())
      if(message){setError(message);return}
      if(!groomers.includes(targetGroomer)){setError('Choose the household’s assigned groomer.');return}
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
            : await supabase.rpc('change_grooming_appointment',{...params,p_action:mode,
              p_target_date:mode==='reschedule'?targetDate:null,
              p_target_time:mode==='reschedule'?targetTime:null,
              p_target_groomer:mode==='reschedule'?targetGroomer:null,p_note:note.trim()})
      if (saveError) {
        if (saveError.code==='PGRST202' || saveError.code==='42883') throw new Error('This action has not been enabled yet. Please finish its one-time setup first.')
        throw saveError
      }
      if (!['completed','already_completed','cancelled','already_cancelled','rescheduled','missed','already_missed','services_updated','appointment_updated'].includes(data?.status)) throw new Error('The save result could not be confirmed. Close and refresh before trying again.')
      if(data.status==='completed') onSaved(`${appt.owner} marked completed. Service history updated for ${data.dogs_updated} dog${data.dogs_updated===1?'':'s'}.`)
      else if(data.status==='services_updated') onSaved(`${appt.owner}'s services were updated for this appointment.`)
      else if(data.status==='appointment_updated') onSaved(`${appt.owner}'s appointment details were updated.`)
      else if(data.status==='already_completed') onSaved(`${appt.owner} was already completed.`)
      else if(data.status==='rescheduled') onSaved(`${appt.owner} moved to ${targetDate} at ${targetTime} with ${targetGroomer}. Review the affected draft routes in your existing planner.`)
      else if(data.status==='missed') onSaved(`${appt.owner} marked as a no-show. The service history was not advanced.`)
      else if(data.status==='already_missed') onSaved(`${appt.owner} was already marked as a no-show.`)
      else onSaved(`${appt.owner} cancelled. Review the affected draft route in your existing planner.`)
    } catch (err) {
      setError(err.message || 'Could not confirm the save. Close and refresh before trying again.')
    } finally {
      savingRef.current=false;setSaving(false)
    }
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
        {originalDate} · {appt.time || 'Time not set'} · {row.Groomer || 'Groomer not set'}
        {row['Completed Date'] && <div>Completed: {String(row['Completed Date']).slice(0,10)}</div>}
        {row['Rescheduled To'] && <div>Moved to: {String(row['Rescheduled To']).slice(0,10)}</div>}
        {row['Status Note'] && <div>{row['Status Note']}</div>}
      </div>
      {completed || moved || missed ? <div className="prototype-note">{completed?'This appointment is already completed.':moved?'Open the appointment in its new week to change it.':'This appointment is already marked as a no-show.'}</div> : <>
        <div className="segmented" aria-label="Appointment action" style={{marginBottom:16}}>
          {[['edit','Edit'],['services','Services'],['reschedule','Reschedule'],['cancel','Cancel'],['missed','No-show']].map(([value,label])=><button
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
            <p style={{fontSize:13,lineHeight:1.6,color:'#687080'}}>The selected arrival time becomes fixed. Saved service lengths and travel buffers are checked for conflicts. Review the affected draft routes in your existing planner after saving.</p>
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

function AssistantSheet({open,initial,onClose}) {
  const [text,setText]=useState(initial||'')
  const [asked,setAsked]=useState(Boolean(initial))
  React.useEffect(()=>{ if(open){setText(initial||'');setAsked(Boolean(initial))} },[open,initial])
  if(!open)return null
  const run=()=>{ if(text.trim())setAsked(true) }
  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <div className="assistant-sheet" onMouseDown={e=>e.stopPropagation()}>
        <div className="sheet-handle"/>
        <div className="assistant-title">
          <div className="ai-orb"><WandSparkles size={19}/></div>
          <div><span>Ask Planner</span><strong>What do you want to do?</strong></div>
          <button className="icon-btn" onClick={onClose}><X size={18}/></button>
        </div>
        <div className="quick-prompts">
          {["Fill Thursday’s cancellation","Who is overdue near The Woodlands?","Move Leah to 9:30 and reroute"].map(q=>
            <button key={q} onClick={()=>{setText(q);setAsked(true)}}>{q}</button>
          )}
        </div>
        <div className="ai-input">
          <Sparkles size={18}/><input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==='Enter'&&run()} placeholder="Ask me to fill, move, route, or find clients…"/>
          <button onClick={run}>Ask</button>
        </div>
        {asked&&(
          <div className="ai-result">
            <div className="result-head"><CheckCircle2 size={17}/><strong>Best options for this opening</strong></div>
            <p>I’d keep this opening in The Woodlands and contact these clients first:</p>
            <div className="candidate-list">
              {fillCandidates.map((c,i)=>(
                <button className="candidate" key={c.owner}>
                  <div className="candidate-rank">{i+1}</div>
                  <div className="candidate-main"><strong>{c.owner} · {c.dogs}</strong><span>{c.due} · {c.minutes} min · {c.drive} min drive</span></div>
                  <div className="candidate-price">${c.price}</div>
                </button>
              ))}
            </div>
            <div className="ai-actions"><button className="ghost"><MessageCircle size={16}/>Draft texts</button><button className="save"><Sparkles size={16}/>Add top choice</button></div>
          </div>
        )}
        <div className="prototype-note">Prototype: this shows the intended AI workflow. The production version would connect this bar to the scheduling engine and AI backend.</div>
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

export default function App() {
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [dogs, setDogs] = useState([])
  const [dataLoading, setDataLoading] = useState(false)
  const [dataError, setDataError] = useState('')
  const [tab,setTab]=useState('Today')
  const [editing,setEditing]=useState(null)
  const [scheduleRevision,setScheduleRevision]=useState(0)
  const [saveMessage,setSaveMessage]=useState('')
  const [completingId,setCompletingId]=useState('')
  const [assistant,setAssistant]=useState({open:false,initial:''})
  const ask=(initial='')=>setAssistant({open:true,initial})
  const completeFromSchedule = async (appt) => {
    if (!appt || completingId) return
    const row = appt.sourceRow || {}
    const today = businessDateKey()
    const blocked = completionBlockReason(row,today)
    if (blocked) { setSaveMessage(blocked); window.alert(blocked); return }
    const scheduledDate = String(row.Date || '').slice(0,10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate) && scheduledDate > today) {
      const label = textDate(scheduledDate)
      if (!window.confirm(`This appointment is scheduled for ${label}. Mark it complete early?`)) return
    }
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

  if (!authReady) {
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
    body = <Today onOpen={setEditing} onComplete={completeFromSchedule} onUndo={undoCompleteFromSchedule} completingId={completingId} revision={scheduleRevision}/>
  } else if (tab === 'Week') {
    body = <Week onAsk={ask} onOpen={setEditing} onComplete={completeFromSchedule} onUndo={undoCompleteFromSchedule} completingId={completingId} revision={scheduleRevision}/>
  } else if (tab === 'Month') {
    body = <Month onOpen={setEditing} revision={scheduleRevision}/>
  } else if (tab === 'Clients') {
    body = <Clients dogs={dogs} loading={dataLoading} error={dataError} onOpen={setEditing} revision={scheduleRevision} onDataChanged={message=>{ setSaveMessage(message); setScheduleRevision(value=>value+1) }}/>
  } else {
    body = <More/>
  }

  const nav=[['Today',Home],['Week',CalendarDays],['Month',Clock3],['Clients',Users],['More',Ellipsis]]

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-mark">GP</div>
        <div><strong>Grooming Planner</strong><span>Mobile business dashboard</span></div>
        <button className="top-ai" onClick={()=>ask()}><Sparkles size={16}/>Ask Planner</button>
      </header>
      <main>
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

      {editing && <CompletionSheet appt={editing} dogs={dogs} onClose={()=>setEditing(null)} onSaved={message=>{
        setEditing(null)
        setSaveMessage(message)
        setScheduleRevision(value=>value+1)
      }}/>}
      <AssistantSheet open={assistant.open} initial={assistant.initial} onClose={()=>setAssistant({open:false,initial:''})}/>
    </div>
  )
}

