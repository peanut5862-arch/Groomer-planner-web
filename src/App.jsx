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

function Today({openEditor,onAsk}) {
  const appointments = demoDays[1].appointments
  const revenue = appointments.reduce((s,a)=>s+a.price,0)
  return (
    <section>
      <div className="page-head">
        <div><div className="eyebrow">Tuesday · Sep 30</div><h1>Today</h1></div>
        <button className="icon-btn"><Ellipsis size={20}/></button>
      </div>

      <div className="hero-card">
        <div>
          <span className="hero-label">Jen’s route</span>
          <h2>The Woodlands → Conroe</h2>
          <p>Leave home 7:58 AM · Back around 3:05 PM</p>
        </div>
        <button className="route-btn"><Route size={17}/>Open route</button>
      </div>

      <div className="stats-row">
        <Stat label="Stops" value={appointments.length}/>
        <Stat label="Revenue" value={`$${revenue}`}/>
        <Stat label="Drive" value="52 min"/>
      </div>

      <div className="smart-callout">
        <div className="smart-icon"><Sparkles size={18}/></div>
        <div><strong>Had a cancellation?</strong><span>Ask Planner can find the best fill based on due date, area and drive time.</span></div>
        <button onClick={()=>onAsk("Fill a canceled appointment today in The Woodlands")}>Find fill</button>
      </div>

      <div className="section-title"><h3>Appointments</h3><button className="text-btn"><Plus size={16}/>Add</button></div>
      <div className="appt-list">
        {appointments.map((a,i)=><ApptCard key={i} appt={a} onOpen={()=>openEditor(a)}/>)}
      </div>
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

function Week({onAsk}) {
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
  }, [weekStart])

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

      const driveRaw =
        row['Drive From Previous Min'] ??
        row['Drive Minutes'] ??
        row['Drive From Previous Minutes']

      return {
        id: `${row['Household ID'] || row.Owner}-${row.Date || index}-${index}`,
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
        statusClass
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
        const revenue = dayAppointments.reduce((sum,a)=>sum+(Number.isFinite(a.price)?a.price:0),0)

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
                  {dayAppointments.length} stop{dayAppointments.length===1?'':'s'} · ${Math.round(revenue)}
                </div>
                <div className="appt-list">
                  {dayAppointments
                    .slice()
                    .sort(compareAppointmentTimes)
                    .map(appt=>(
                      <ApptCard key={appt.id} appt={appt}/>
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
          This first live Week view is read-only so we can verify it matches your existing planner before allowing changes.
        </div>
      )}
    </section>
  )
}

function Month() {
  const [groomer,setGroomer]=useState('Jen')
  const names=groomer==='Jen'
    ? ['Oakley','Lulu','Beau','Misty','Tux','Ruby','Peanut']
    : ['Gus','Bella','Charlotte','Summer','Cookie','Oliver']
  return (
    <section>
      <div className="page-head">
        <div><div className="eyebrow">Planner</div><h1>October 2026</h1></div>
        <div className="month-arrows"><button className="icon-btn"><ChevronLeft size={18}/></button><button className="icon-btn"><ChevronRight size={18}/></button></div>
      </div>
      <div className="segmented wide">{['Jen','Haley'].map(x=><button key={x} className={groomer===x?'active':''} onClick={()=>setGroomer(x)}>{x}</button>)}</div>
      <div className="calendar">
        {['M','T','W','T','F'].map((x,i)=><div className="dow" key={i}>{x}</div>)}
        {Array.from({length:25},(_,i)=>{
          const day=i+1, has=[1,2,5,7,8,12,14,15,20,22,26].includes(day), second=[7,14,22].includes(day)
          return <div className={`cal-day ${has?'busy':''}`} key={day}>
            <span className="day-num">{day}</span>
            {has&&<div className="tiny-appt">{names[day%names.length]}</div>}
            {second&&<div className="tiny-appt muted">{names[(day+2)%names.length]}</div>}
          </div>
        })}
      </div>
      <div className="month-summary"><Stat label="Scheduled" value="18 stops"/><Stat label="Projected" value="6 stops" subtle/></div>
    </section>
  )
}

function Clients({ dogs, loading, error }) {
  const [query, setQuery] = useState('')
  const [selectedClient, setSelectedClient] = useState(null)

  const valueOf = (row, ...keys) => {
    for (const key of keys) {
      if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== '') {
        return row[key]
      }
    }
    return ''
  }

  const grouped = Object.values(
    (dogs || []).reduce((acc, row) => {
      const owner = valueOf(row, 'owner', 'Owner') || 'Unknown owner'
      const dog = valueOf(row, 'dog', 'Dog') || 'Unnamed dog'
      const household = valueOf(row, 'household_id', 'Household ID') || owner
      const key = String(household || owner)

      if (!acc[key]) {
        acc[key] = {
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
          <div className="sheet" onMouseDown={event => event.stopPropagation()}>
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
              <div className="eyebrow" style={{marginBottom:8}}>Dogs & service details</div>
              <div className="client-list">
                {selectedClient.rows.map((row, index) => {
                  const dog = valueOf(row, 'dog', 'Dog') || 'Unnamed dog'
                  const servicePattern = valueOf(row, 'service_pattern', 'Service Pattern')
                  const nextService = valueOf(row, 'next_service', 'Next Service')
                  const price = valueOf(row, 'price', 'Price')
                  const minutes = valueOf(row, 'minutes', 'Minutes')
                  const frequency = valueOf(row, 'frequency_weeks', 'Frequency Weeks')

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
                      <strong style={{display:'block',marginBottom:4}}>{dog}</strong>
                      <div style={{fontSize:12,color:'#7b828e',lineHeight:1.5}}>
                        {[servicePattern, nextService && `Next: ${nextService}`].filter(Boolean).join(' · ') || 'Service details not set'}
                      </div>
                      <div style={{fontSize:12,color:'#7b828e',marginTop:3}}>
                        {[
                          price !== '' ? `$${price}` : '',
                          minutes !== '' ? `${minutes} min` : '',
                          frequency !== '' ? `Every ${frequency} wks` : ''
                        ].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  )
                })}
              </div>
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

function EditorSheet({appt,onClose}) {
  if(!appt)return null
  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <div className="sheet" onMouseDown={e=>e.stopPropagation()}>
        <div className="sheet-handle"/>
        <div className="sheet-title">
          <div><span>Edit appointment</span><h2>{appt.owner}</h2><p>{appt.dogs}</p></div>
          <button className="icon-btn" onClick={onClose}><X size={18}/></button>
        </div>
        <div className="form-grid">
          <label>Arrival time<input type="time" defaultValue="08:30"/></label>
          <label>Date<input type="date" defaultValue="2026-09-30"/></label>
          <label>Groomer<select defaultValue="Jen"><option>Jen</option><option>Haley</option></select></label>
          <label>Status<select defaultValue="Confirmed"><option>Confirmed</option><option>Awaiting reply</option><option>Cancelled</option></select></label>
        </div>
        <div className="sheet-actions"><button className="danger">Cancel appointment</button><button className="save">Save changes</button></div>
      </div>
    </div>
  )
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
  }, [session])

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
    body = <Today openEditor={setEditing} onAsk={ask}/>
  } else if (tab === 'Week') {
    body = <Week onAsk={ask}/>
  } else if (tab === 'Month') {
    body = <Month/>
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
      <main>{body}</main>

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

      <EditorSheet appt={editing} onClose={()=>setEditing(null)}/>
      <AssistantSheet open={assistant.open} initial={assistant.initial} onClose={()=>setAssistant({open:false,initial:''})}/>
    </div>
  )
}
