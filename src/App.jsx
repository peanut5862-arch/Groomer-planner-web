import React, { useEffect, useMemo, useState } from 'react'
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
  return (
    <button className="appt-card" onClick={onOpen}>
      <div className="time-pill">{appt.time}</div>
      <div className="appt-main">
        <div className="appt-topline">
          <strong>{appt.owner}</strong><span className={`status-dot ${appt.status}`} />
        </div>
        <div className="dogs">{appt.dogs}</div>
        <div className="meta">
          <span><MapPin size={14}/>{appt.area}</span>
          <span><Route size={14}/>{appt.drive} min</span>
          <span><WalletCards size={14}/>${appt.price}</span>
        </div>
      </div>
      <ChevronRight size={18} className="chev"/>
    </button>
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

function Week({openEditor,onAsk}) {
  const [groomer,setGroomer]=useState('All')
  const visible=groomer==='All'?demoDays:demoDays.filter(d=>d.groomer===groomer)
  return (
    <section>
      <div className="page-head">
        <div><div className="eyebrow">Sep 29 – Oct 3</div><h1>Week</h1></div>
        <button className="primary-mini"><Plus size={16}/>Add client</button>
      </div>
      <div className="segmented">{['All','Jen','Haley'].map(x=><button key={x} className={groomer===x?'active':''} onClick={()=>setGroomer(x)}>{x}</button>)}</div>
      {visible.map(d=>(
        <div className="day-block" key={`${d.day}-${d.date}`}>
          <div className="day-head">
            <div><strong>{d.day}</strong><span>{d.date}</span></div>
            <div className="day-actions">
              <button className="day-ai" onClick={()=>onAsk(`Fill an opening on ${d.day} for ${d.groomer}`)}><Sparkles size={14}/>Fill opening</button>
              <button className="day-add"><Plus size={15}/>Add</button>
            </div>
          </div>
          <div className="appt-list">{d.appointments.map((a,i)=><ApptCard key={i} appt={a} onOpen={()=>openEditor(a)}/>)}</div>
        </div>
      ))}
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

function Clients() {
  const clients=['Amber — Oakley + Indy','Nikki — Lulu','Leah — Beau','Misty — 3 dogs','Betty — Tux','Sheri Rose — Ruby','Susan Hensley — Peanut']
  return (
    <section>
      <div className="page-head"><div><div className="eyebrow">Directory</div><h1>Clients</h1></div><button className="primary-mini"><Plus size={16}/>New</button></div>
      <div className="search"><Search size={17}/><input placeholder="Search owner or dog"/></div>
      <div className="client-list">{clients.map((c,i)=><button key={i}><div className="avatar"><Dog size={18}/></div><span>{c}</span><ChevronRight size={17}/></button>)}</div>
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

  const body=useMemo(()=>{
    if(tab==='Today')return <Today openEditor={setEditing} onAsk={ask}/>
    if(tab==='Week')return <Week openEditor={setEditing} onAsk={ask}/>
    if(tab==='Month')return <Month/>
    if(tab==='Clients')return <Clients/>
    return <More/>
  },[tab])

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
