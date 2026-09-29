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

function ApptCard({appt,onOpen}) {
  const Wrapper = onOpen ? 'button' : 'div'
  return (
    <Wrapper className="appt-card" {...(onOpen ? {onClick:onOpen} : {})}>
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
      </div>
      {onOpen && <ChevronRight size={18} className="chev"/>}
    </Wrapper>
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
        statusClass:completed ? 'confirmed' : locked ? 'locked' : 'pending',
        note:[String(row.Groomer || '').trim(),
          completed ? 'Completed' : String(row.Status || '').trim(),
          locked ? 'Fixed time' : '',row['Route Review Needed'] ? 'Review route' : ''].filter(Boolean).join(' · ')
      }
    })
    .sort(compareAppointmentTimes)
}

function Today({onOpen,revision}) {
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
            <div className="appt-list">{appointments.map(appt=><ApptCard key={appt.id} appt={appt} onOpen={()=>onOpen(appt)}/>)}</div>
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

function Week({onAsk,onOpen,revision}) {
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
      } else if (locked) {
        note = note ? `${note} · Fixed time` : 'Fixed time'
        statusClass = 'locked'
      } else if (/overdue/i.test(rawStatus)) {
        statusClass = 'pending'
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
        inactive:['cancelled','canceled','moved to another week'].includes(apptStatus.toLowerCase())
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
                      <ApptCard key={appt.id} appt={appt} onOpen={()=>onOpen(appt)}/>
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
          Tap an appointment to complete, cancel, or reschedule. Changed routes need review in your existing planner.
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

function Clients({ dogs, loading, error }) {
  const [query, setQuery] = useState('')
  const [selectedClient, setSelectedClient] = useState(null)
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')

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
          area: valueOf(row, 'area', 'Area'),
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

  const filtered = grouped.filter(client => {
    const haystack = `${client.owner} ${client.dogs.join(' ')} ${client.area} ${client.groomer}`.toLowerCase()
    return haystack.includes(query.trim().toLowerCase())
  })

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
            const suppressOperationalStatus = ['overdue','due','due soon'].some(value =>
              rawStatusLower === value || rawStatusLower.startsWith(`${value} `)
            )
            const note = statusNote || (suppressOperationalStatus ? '' : rawStatus)

            return {
              id:`${item.weekStart}-${row['Household ID'] || row.Owner}-${item.index}`,
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
  }, [selectedClient])

  return (
    <section>
      <div className="page-head">
        <div>
          <div className="eyebrow">Live Supabase data</div>
          <h1>Clients</h1>
        </div>
        <button className="primary-mini"><Plus size={16}/>New</button>
      </div>

      <div className="search">
        <Search size={17}/>
        <input
          placeholder="Search owner or dog"
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
      </div>

      {loading && <div className="prototype-note">Loading your clients…</div>}
      {error && <div className="login-message">{error}</div>}
      {!loading && !error && filtered.length === 0 && (
        <div className="prototype-note">No matching clients found.</div>
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
            </span>
            <ChevronRight size={17}/>
          </button>
        ))}
      </div>

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

              <label>
                Area
                <input readOnly value={selectedClient.area || '—'} />
              </label>

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
                  const nextService = valueOf(row, 'next_service', 'Next Service', 'next_service_date', 'Next Service Date')
                  const price = valueOf(row, 'price', 'Price')
                  const minutes = valueOf(row, 'minutes', 'Minutes')
                  const frequency = valueOf(row, 'frequency_weeks', 'Frequency Weeks')
                  const lastGroom = valueOf(row, 'last_groom', 'Last Groom', 'last_groom_date', 'Last Groom Date')
                  const lastBath = valueOf(row, 'last_bath', 'Last Bath', 'last_bath_date', 'Last Bath Date')

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
                      <div style={{fontSize:12,color:'#59616e',lineHeight:1.65}}>
                        <div><strong>Last groom:</strong> {lastGroom ? textDate(lastGroom) : '—'}</div>
                        <div><strong>Last bath:</strong> {lastBath ? textDate(lastBath) : '—'}</div>
                        <div><strong>Next service:</strong> {nextService ? textDate(nextService) : '—'}</div>
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

            <div style={{marginTop:18}}>
              <div className="eyebrow" style={{marginBottom:8}}>Appointment history</div>
              {historyLoading && <div className="prototype-note">Loading appointment history…</div>}
              {historyError && <div className="login-message">{historyError}</div>}
              {!historyLoading && !historyError && history.length === 0 && (
                <div className="prototype-note">No completed, cancelled, rescheduled, or past appointments found yet.</div>
              )}
              {!historyLoading && !historyError && history.length > 0 && (
                <div className="appt-list">
                  {history.slice(0,20).map(item => (
                    <div className="appt-card" key={item.id}>
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
                      </div>
                    </div>
                  ))}
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
  if (date>today) return 'This appointment is in the future. Use Reschedule if the service happened early.'
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
  const [mode,setMode] = useState('complete')
  const [completedDate,setCompletedDate] = useState(originalDate)
  const [targetDate,setTargetDate] = useState(originalDate<today?today:originalDate)
  const [targetTime,setTargetTime] = useState(()=>appointmentTimeInput(row['Start Time'] || row['Locked Time'] || row['Original Start Time']))
  const [targetGroomer,setTargetGroomer] = useState(String(row.Groomer || '').trim())
  const [note,setNote] = useState('')
  const [saving,setSaving] = useState(false)
  const [error,setError] = useState('')
  const savingRef = React.useRef(false)
  const closeRef = React.useRef(null)
  const dialogRef = React.useRef(null)
  const blocked = completionBlockReason(row,today)
  const completed = String(row['Completion Status'] || '').trim().toLowerCase()==='completed'
  const moved = String(row['Appointment Status'] || '').trim().toLowerCase()==='moved to another week'
  const cancelled = ['cancelled','canceled'].includes(String(row['Appointment Status'] || '').trim().toLowerCase())
  const householdDogs = (dogs || []).filter(dog=>String(dog.household_id || dog['Household ID'] || '').trim()===String(row['Household ID'] || '').trim())
  const restrictions = householdDogs.map(dog=>String(dog.groomer || dog.Groomer || '').trim()).filter(name=>['Jen','Haley'].includes(name))
  const groomers = ['Jen','Haley'].filter(name=>restrictions.every(assigned=>assigned===name))
  const close = () => { if (!savingRef.current) onClose() }

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
    if (savingRef.current || completed || moved) return
    if (mode==='complete' && blocked) return
    if (mode==='complete' && (!completedDate || completedDate>businessDateKey())) {
      setError('Choose a completion date that is today or earlier.');return
    }
    if (mode==='reschedule') {
      const message=rescheduleValidation(targetDate,targetTime,targetGroomer,businessDateKey())
      if(message){setError(message);return}
      if(!groomers.includes(targetGroomer)){setError('Choose the household’s assigned groomer.');return}
    }
    savingRef.current=true;setSaving(true);setError('')
    try {
      if (!supabase) throw new Error('Your schedule connection is not configured.')
      const params = {p_week_start:appt.weekStart,p_expected_row:row}
      const {data,error:saveError} = mode==='complete'
        ? await supabase.rpc('complete_grooming_appointment',{...params,p_completed_date:completedDate})
        : await supabase.rpc('change_grooming_appointment',{...params,p_action:mode,
          p_target_date:mode==='reschedule'?targetDate:null,
          p_target_time:mode==='reschedule'?targetTime:null,
          p_target_groomer:mode==='reschedule'?targetGroomer:null,p_note:note.trim()})
      if (saveError) {
        if (saveError.code==='PGRST202' || saveError.code==='42883') throw new Error('This action has not been enabled yet. Please finish its one-time setup first.')
        throw saveError
      }
      if (!['completed','already_completed','cancelled','already_cancelled','rescheduled'].includes(data?.status)) throw new Error('The save result could not be confirmed. Close and refresh before trying again.')
      if(data.status==='completed') onSaved(`${appt.owner} marked completed. Service history updated for ${data.dogs_updated} dog${data.dogs_updated===1?'':'s'}.`)
      else if(data.status==='already_completed') onSaved(`${appt.owner} was already completed.`)
      else if(data.status==='rescheduled') onSaved(`${appt.owner} moved to ${targetDate} at ${targetTime} with ${targetGroomer}. Review the affected draft routes in your existing planner.`)
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
      {completed || moved ? <div className="prototype-note">{completed?'This appointment is already completed.':'Open the appointment in its new week to change it.'}</div> : <>
        <div className="segmented" aria-label="Appointment action" style={{marginBottom:16}}>
          {[['complete','Complete'],['reschedule','Reschedule'],['cancel','Cancel']].map(([value,label])=><button
            type="button" key={value} disabled={saving || (cancelled && value==='cancel')} aria-pressed={mode===value}
            className={mode===value?'active':''} onClick={()=>{setMode(value);setError('')}}>{label}</button>)}
        </div>
        {mode==='complete' && blocked ? <div className="prototype-note">{blocked}{cancelled && ' Use Reschedule to book it again.'}</div> : <form onSubmit={submit}>
          {mode==='complete' && <>
            <div className="form-grid"><label style={{gridColumn:'1 / -1'}}>Date services were completed
              <input type="date" value={completedDate} max={today} required disabled={saving} onChange={event=>setCompletedDate(event.target.value)}/>
            </label></div>
            <p style={{fontSize:13,lineHeight:1.6,color:'#687080'}}>Marks every listed service completed. Baths update bath history; full grooms update both bath and groom history.</p>
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
          {mode!=='complete' && <div className="form-grid"><label style={{gridColumn:'1 / -1'}}>Note (optional)
            <input value={note} maxLength={1000} disabled={saving} onChange={event=>setNote(event.target.value)} placeholder="Reason or client request"/>
          </label></div>}
          {error && <div className="login-message" role="alert">{error}</div>}
          <div className="sheet-actions">
            <button type="button" className="ghost" disabled={saving} onClick={close}>Close</button>
            <button type="submit" className={mode==='cancel'?'danger':'save'} disabled={saving}>
              {saving?'Saving…':mode==='complete'?'Mark completed':mode==='reschedule'?'Save reschedule':'Confirm cancellation'}
            </button>
          </div>
        </form>}
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
  const [assistant,setAssistant]=useState({open:false,initial:''})
  const ask=(initial='')=>setAssistant({open:true,initial})

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
    body = <Today onOpen={setEditing} revision={scheduleRevision}/>
  } else if (tab === 'Week') {
    body = <Week onAsk={ask} onOpen={setEditing} revision={scheduleRevision}/>
  } else if (tab === 'Month') {
    body = <Month onOpen={setEditing} revision={scheduleRevision}/>
  } else if (tab === 'Clients') {
    body = <Clients dogs={dogs} loading={dataLoading} error={dataError}/>
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
