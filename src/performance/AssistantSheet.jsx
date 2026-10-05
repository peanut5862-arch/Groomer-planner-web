import { businessSettings, groomerNames, groomerConfig, firstGroomer, groomerWorksOn, chooseGroomer, calendarWorkDays, getBusinessContext, setBusinessContext, useBusinessContext } from './businessConfig.js';
import React, { useEffect, useRef, useState } from 'react';
import { createBettyRequestPlan } from './bettyRequests.js'
import { supabase } from "../supabase.js";
import { X, CheckCircle2 } from 'lucide-react';
import { businessDateKey, canonicalServiceLabel, appointmentServiceOptions, serviceDefaultsForDog, canonicalAreaLabel, apiUrl, clientConfirmationStatus, needsClientConfirmation, mondayForDate, todayAppointments, clockMinutesForDisplay, displayClockTime, compareAppointmentTimes, fullClientAddress, clientAddressLookup, appointmentAddress, defaultFirstStopTime, schedulingOverrideReasons, appointmentDurationMinutes, openingForDuration, clientDueInfo, appointmentTimeInput, scheduleRowDuration, plannerClientGroups, plannerActiveRow , apiFetch } from './shared.jsx'

function plannerResolveDate(text,todayKey=businessDateKey()) {
  const lower = String(text || '').toLowerCase()
  const today = new Date(`${todayKey}T12:00:00Z`)
  if (/\btoday\b/.test(lower)) return todayKey
  if (/\btomorrow\b/.test(lower)) {
    today.setUTCDate(today.getUTCDate()+1)
    return today.toISOString().slice(0,10)
  }
  const days = [
    ['sunday',0],['sun',0],['monday',1],['mon',1],['tuesday',2],['tue',2],['tues',2],
    ['wednesday',3],['wed',3],['thursday',4],['thu',4],['thur',4],['thurs',4],
    ['friday',5],['fri',5],['saturday',6],['sat',6]
  ]
  for (const [name,target] of days) {
    if (new RegExp(`\\b${name}\\b`).test(lower)) {
      const delta = (target - today.getUTCDay() + 7) % 7
      today.setUTCDate(today.getUTCDate()+delta)
      return today.toISOString().slice(0,10)
    }
  }
  const iso = lower.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/)
  if (iso) return iso[0]
  const monthNames={january:0,jan:0,february:1,feb:1,march:2,mar:2,april:3,apr:3,may:4,june:5,jun:5,july:6,jul:6,august:7,aug:7,september:8,sep:8,sept:8,october:9,oct:9,november:10,nov:10,december:11,dec:11}
  const monthHit=lower.match(/\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?\b/)
  if(monthHit){
    const month=monthNames[monthHit[1]]
    const day=Number(monthHit[2])
    let year=Number(monthHit[3] || today.getUTCFullYear())
    let candidate=new Date(Date.UTC(year,month,day,12))
    if(!monthHit[3] && candidate < today){ candidate=new Date(Date.UTC(year+1,month,day,12)) }
    if(candidate.getUTCMonth()===month && candidate.getUTCDate()===day) return candidate.toISOString().slice(0,10)
  }
  return ''
}

function plannerUsualService(row) {
  let service = canonicalServiceLabel(row?.service_pattern || row?.['Service Pattern'] || '')
  if (service === 'Service Varies' || !appointmentServiceOptions.includes(service)) {
    const next = canonicalServiceLabel(row?.next_service || row?.['Next Service'] || '')
    service = appointmentServiceOptions.includes(next) ? next : 'Groom'
  }
  return service
}

function plannerClientTotals(rows) {
  return (rows || []).reduce((acc,row)=>{
    const service = plannerUsualService(row)
    const values = serviceDefaultsForDog(row,service)
    acc.price += Number(values.price || 0)
    acc.minutes += Number(values.minutes || 0)
    acc.services.push(service)
    return acc
  },{price:0,minutes:0,services:[]})
}

function plannerQueryFilters(text,dogs) {
  const lower = String(text || '').toLowerCase().replace(/[’]/g,"'")
  const date = plannerResolveDate(lower)
  const groomer = groomerNames(true).sort((a,b)=>b.length-a.length).find(name=>` ${lower.replace(/[^\p{L}\p{N}]+/gu,' ')} `.includes(` ${name.toLowerCase()} `)) || ''
  const priceMatch = lower.match(/\$\s*(\d+(?:\.\d+)?)\s*\+|(?:at least|over|more than)\s*\$?\s*(\d+(?:\.\d+)?)/)
  const minPrice = Number(priceMatch?.[1] || priceMatch?.[2] || 0)
  const hourMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:hour|hr)s?\b/)
  const minuteMatch = lower.match(/(\d+)\s*(?:minute|min)s?\b/)
  const maxMinutes = hourMatch ? Math.round(Number(hourMatch[1])*60) : minuteMatch ? Number(minuteMatch[1]) : 0
  const overdueOnly = /\boverdue\b/.test(lower)
  const unbookedOnly = /hasn['’]?t been booked|not booked back|booked back|unbooked|rebook/.test(lower)
  const service = /partial\s*groom/.test(lower) ? 'Partial Groom' : /bath\s*only/.test(lower) ? 'Bath Only' : /\bbath\b/.test(lower) ? 'Bath' : /\bgroom\b/.test(lower) ? 'Groom' : ''
  const priceLookup = /\bhow much\b|\bwhat does .+ cost\b|\bwhat(?:'s| is) (?:the )?price\b|\bprice (?:for|of)\b|\bcost (?:for|of)\b/.test(lower)
  const confirmationOnly = /needs? (?:to )?confirm|needs? confirmation|not confirmed|still needs? (?:a )?reply|who.*confirm/.test(lower)
  let lookupName = ''
  if (priceLookup) {
    const patterns = [
      /how much (?:is|for|does)\s+(.+?)(?:\s+cost)?(?:\?|$)/,
      /what does\s+(.+?)\s+cost(?:\?|$)/,
      /what(?:'s| is) (?:the )?price (?:for|of)\s+(.+?)(?:\?|$)/,
      /price (?:for|of)\s+(.+?)(?:\?|$)/,
      /cost (?:for|of)\s+(.+?)(?:\?|$)/
    ]
    const hit = patterns.map(pattern=>lower.match(pattern)).find(Boolean)
    lookupName = String(hit?.[1] || '')
      .replace(/\b(?:for a|for an|for the|for)\s+(?:groom|bath only|bath|partial groom)\b.*$/,'')
      .replace(/\b(?:groom|bath only|bath|partial groom)\b$/,'')
      .replace(/\b(?:cost|price|please|today)\b$/,'')
      .trim()
  }
  const areas = [...new Set((dogs || []).map(row=>canonicalAreaLabel(row?.area || row?.Area || '')).filter(Boolean))]
    .sort((a,b)=>b.length-a.length)
  let area = areas.find(label=>lower.includes(label.toLowerCase())) || ''
  if (!area) {
    const broad = [
      ['woodlands','The Woodlands'],['montgomery','Montgomery'],['conroe','Conroe'],['spring','Spring'],
      ['tomball','Tomball'],['magnolia','Old Magnolia'],['willis','Willis'],['woodforest','Woodforest'],
      ['cypress','Cypress'],['hockley','Hockley'],['april sound','April Sound']
    ]
    const hit = broad.find(([needle])=>lower.includes(needle))
    if (hit) area = hit[1]
  }
  const routeIntent = /route|closest|fill|opening|add|fit/.test(lower)
  return {lower,date,groomer,minPrice,maxMinutes,overdueOnly,unbookedOnly,service,area,routeIntent,priceLookup,lookupName,confirmationOnly}
}

function plannerNextBookableDate(groomer,fromKey=businessDateKey()) {
  const date = new Date(`${fromKey}T12:00:00Z`)
  for (let i=0;i<14;i+=1) {
    const day = date.getUTCDay()
    if (groomerWorksOn(groomer,date.toISOString().slice(0,10))) return date.toISOString().slice(0,10)
    date.setUTCDate(date.getUTCDate()+1)
  }
  return fromKey
}

function plannerDayLabel(dateKey) {
  if (!dateKey) return ''
  return new Date(`${dateKey}T12:00:00Z`).toLocaleDateString('en-US',{timeZone:'UTC',weekday:'long',month:'short',day:'numeric'})
}

function bettyRescheduleRequest(text) {
  const raw = String(text || '').trim()
  const lower = raw.toLowerCase().replace(/[’]/g,"'")
  if (!/\b(move|reschedule|change)\b/.test(lower)) return null
  const targetDate = plannerResolveDate(lower)
  if (!targetDate) return null
  const dateWords = '(?:today|tomorrow|sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat|20\\d{2}-\\d{2}-\\d{2})'
  const patterns = [
    new RegExp(`(?:can\\s+you\\s+|could\\s+you\\s+|please\\s+)?(?:move|reschedule|change)\\s+(?:the\\s+)?(?:appointment\\s+for\\s+)?(.+?)\\s+(?:to|for|on)\\s+(?:next\\s+)?${dateWords}(?:\\?|$)`,'i'),
    new RegExp(`(?:move|reschedule|change)\\s+(.+?)\\s+(?:appointment\\s+)?(?:to|for|on)\\s+(?:next\\s+)?${dateWords}(?:\\?|$)`,'i')
  ]
  const hit = patterns.map(pattern=>raw.match(pattern)).find(Boolean)
  let subject = String(hit?.[1] || '').trim()
  subject = subject.replace(/^(?:the|my)\s+/i,'').replace(/\s+(?:appointment|appt)$/i,'').trim()
  if (!subject) return null
  return {subject,targetDate}
}

function bettySpecificBookingRequest(text) {
  const raw=String(text || '').trim()
  const lower=raw.toLowerCase().replace(/[’]/g,"'")
  if (!/\b(add|book|schedule)\b/.test(lower)) return null
  if (/\b(who|which|anyone|somebody|someone|clients?|dogs?)\b/.test(lower) && !/\b(?:add|book|schedule)\s+(?:client\s+)?[a-z]/i.test(raw)) return null
  const targetDate=plannerResolveDate(lower)
  if(!targetDate) return null
  const patterns=[
    /(?:can\s+you\s+|could\s+you\s+|please\s+)?(?:add|book|schedule)\s+(?:an?\s+appointment\s+for\s+)?(.+?)\s+(?:to|for|on)\s+(?:next\s+)?(?:today|tomorrow|sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat|20\d{2}-\d{2}-\d{2}|(?:january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*20\d{2})?)(?:\?|$)/i,
    /(?:add|book|schedule)\s+(.+?)\s+(?:appointment\s+)?(?:to|for|on)\s+.+$/i
  ]
  const hit=patterns.map(pattern=>raw.match(pattern)).find(Boolean)
  let subject=String(hit?.[1] || '').trim().replace(/^(?:the|my)\s+/i,'').replace(/\s+(?:appointment|appt)$/i,'').trim()
  if(!subject) return null
  return {subject,targetDate}
}

function bettyScheduleLookupRequest(text,todayKey=businessDateKey()) {
  const lower=String(text || '').toLowerCase().replace(/[’]/g,"'")
  const asksExisting=/\b(what|which|show|list|tell me|who)\b/.test(lower) && /\b(dogs?|clients?|appointments?|stops?|schedule|booked|on)\b/.test(lower)
  if(!asksExisting) return null
  if(/\b(add|fill|opening|should i add|can i add|need to add|move|reschedule|change)\b/.test(lower)) return null
  const today=new Date(`${todayKey}T12:00:00Z`)
  const thisMonday=new Date(today); thisMonday.setUTCDate(today.getUTCDate()-((today.getUTCDay()+6)%7))
  let start='',end='',label=''
  if(/\bnext week\b/.test(lower)){
    const d=new Date(thisMonday); d.setUTCDate(d.getUTCDate()+7); start=d.toISOString().slice(0,10)
    const e=new Date(d); e.setUTCDate(e.getUTCDate()+6); end=e.toISOString().slice(0,10); label='Next week'
  } else if(/\bthis week\b/.test(lower)){
    start=thisMonday.toISOString().slice(0,10); const e=new Date(thisMonday); e.setUTCDate(e.getUTCDate()+6); end=e.toISOString().slice(0,10); label='This week'
  } else {
    const date=plannerResolveDate(lower,todayKey)
    if(!date) return null
    start=end=date; label=plannerDayLabel(date)
  }
  return {start,end,label}
}

function bettyExplicitSuggestionRequest(text,hasPreviousPlannerResult=false) {
  const lower=String(text || '').toLowerCase().replace(/[’]/g,"'")
  if(hasPreviousPlannerResult && /\b(instead|what about|which one|another|more|cheaper|closest|pays? the most)\b/.test(lower)) return true
  return /\b(who|which client|which dog|anyone|someone)\b/.test(lower) && /\b(add|book|schedule|fill|fit|opening|overdue|rebook|not booked|booked back)\b/.test(lower)
}

function bettyAppointmentMatchScore(row, subject) {
  const needle = String(subject || '').toLowerCase().trim()
  if (!needle) return 0
  const owner = String(row?.Owner || '').toLowerCase().trim()
  const dogs = String(row?.Dogs || '').toLowerCase().replace(/\s*\([^)]*\)/g,'').trim()
  const dogNames = dogs.split(/\s*[+,]&?\s*|\s+and\s+/).map(value=>value.trim()).filter(Boolean)
  if (owner === needle) return 120
  if (dogNames.includes(needle)) return 115
  if (owner.startsWith(needle) || needle.startsWith(owner)) return 100
  if (dogNames.some(name=>name.startsWith(needle) || needle.startsWith(name))) return 95
  if (owner.includes(needle) || needle.includes(owner)) return 80
  if (dogNames.some(name=>name.includes(needle) || needle.includes(name))) return 75
  return 0
}

function AssistantSheet({open,initial,onClose,dogs,onChoose,onClient,onScheduleChanged,viewerMode=false}) {
  const memoryKey=`grooming-ask-betty-session-v3:${getBusinessContext().businessId}`
  const readMemory=()=>{
    if(typeof window==='undefined') return null
    try { return JSON.parse(sessionStorage.getItem(memoryKey) || 'null') } catch { return null }
  }
  const initialMemory=readMemory()
  const [text,setText]=useState(initial||initialMemory?.text||'')
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [answer,setAnswer]=useState(initialMemory?.answer||null)
  const [conversation,setConversation]=useState(Array.isArray(initialMemory?.conversation)?initialMemory.conversation:[])
  const sheetRef=useRef(null)
  const savedScrollRef=useRef(Number(initialMemory?.scrollTop || 0))
  const shouldAutoScrollRef=useRef(false)

  const scrollBettyToBottom=(behavior='smooth')=>{
    if(typeof window==='undefined') return
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      const sheet=sheetRef.current
      if(!sheet) return
      const top=Math.max(0,sheet.scrollHeight-sheet.clientHeight)
      try { sheet.scrollTo({top,behavior}) } catch { sheet.scrollTop=top }
      savedScrollRef.current=top
    }))
  }

  const saveMemory=(overrides={})=>{
    if(typeof window==='undefined') return
    try {
      const payload={
        text,
        answer,
        conversation,
        scrollTop:Number(sheetRef.current?.scrollTop ?? savedScrollRef.current ?? 0),
        ...overrides
      }
      sessionStorage.setItem(memoryKey,JSON.stringify(payload))
    } catch {}
  }

  const clearAndClose=()=>{
    try { sessionStorage.removeItem(memoryKey) } catch {}
    setText('')
    setLoading(false)
    setError('')
    setAnswer(null)
    setConversation([])
    savedScrollRef.current=0
    onClose?.()
  }

  useEffect(()=>{
    if(!open) return
    const saved=readMemory()
    if(initial){
      setText(initial)
      setLoading(false)
      setError('')
      setAnswer(null)
      savedScrollRef.current=0
    } else if(saved){
      setText(String(saved.text || ''))
      setLoading(false)
      setError('')
      setAnswer(saved.answer || null)
      setConversation(Array.isArray(saved.conversation)?saved.conversation:[])
      savedScrollRef.current=Number(saved.scrollTop || 0)
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        if(sheetRef.current) sheetRef.current.scrollTop=savedScrollRef.current
      }))
    } else {
      setText('')
      setLoading(false)
      setError('')
      setAnswer(null)
      setConversation([])
      savedScrollRef.current=0
    }
  },[open,initial])

  useEffect(()=>{
    if(!open) return
    saveMemory()
    if(shouldAutoScrollRef.current){
      shouldAutoScrollRef.current=false
      scrollBettyToBottom('smooth')
    }
  },[open,text,answer,conversation])

  useEffect(()=>{
    if(typeof window==='undefined' || typeof document==='undefined') return
    const save=()=>saveMemory()
    const visibility=()=>{ if(document.visibilityState==='hidden') save() }
    window.addEventListener('pagehide',save)
    document.addEventListener('visibilitychange',visibility)
    return()=>{
      window.removeEventListener('pagehide',save)
      document.removeEventListener('visibilitychange',visibility)
    }
  },[text,answer,conversation])

  if(!open)return null

  const run = async (query=text) => {
    const prompt = String(query || '').trim()
    if (!prompt || loading) return
    const previousAnswer = answer
    shouldAutoScrollRef.current=true
    setText('')
    setLoading(true)
    setError('')
    setAnswer(null)
    try {
      if (!supabase) throw new Error('Your schedule connection is not configured.')
      const today = businessDateKey()
      let filters = plannerQueryFilters(prompt,dogs)
      const groups = plannerClientGroups(dogs)
      const specificBookingRequest=bettySpecificBookingRequest(prompt)
      const scheduleLookupRequest=bettyScheduleLookupRequest(prompt,today)

      // Action requests are handled before the suggestion router so a day name
      // like "Thursday" cannot accidentally turn "move Nikki to Thursday" into
      // a "Best fits for Thursday" search.
      const rescheduleRequest = bettyRescheduleRequest(prompt)
      if (rescheduleRequest) {
        const rangeStart = mondayForDate(today)
        const endDate = new Date(`${today}T12:00:00Z`)
        endDate.setUTCDate(endDate.getUTCDate()+84)
        const rangeEnd = mondayForDate(endDate.toISOString().slice(0,10))
        const {data:weeks,error:weekError} = await supabase
          .from('weekly_drafts')
          .select('week_start,plan_json')
          .gte('week_start',rangeStart)
          .lte('week_start',rangeEnd)
          .order('week_start',{ascending:true})
        if (weekError) throw weekError

        const matches=[]
        for (const week of (weeks || [])) {
          for (const row of (Array.isArray(week?.plan_json) ? week.plan_json : [])) {
            if (!plannerActiveRow(row,today)) continue
            const score=bettyAppointmentMatchScore(row,rescheduleRequest.subject)
            if (score>0) matches.push({row,weekStart:String(week.week_start || '').slice(0,10),score})
          }
        }
        matches.sort((a,b)=>b.score-a.score || String(a.row?.Date || '').localeCompare(String(b.row?.Date || '')))
        const best=matches[0]
        if (!best) {
          const reply=`I couldn't find an active appointment for ${rescheduleRequest.subject}. Try the client or dog name exactly as it appears in the planner.`
          const nextConversation=[...conversation.slice(-12),{role:'user',text:prompt},{role:'assistant',text:reply}].slice(-16)
          shouldAutoScrollRef.current=true
          setConversation(nextConversation)
          setAnswer({mode:'ai',title:'Betty',text:reply,targetDate:'',filters:{},candidates:[],summary:''})
          return
        }

        const row=best.row
        const sourceDate=String(row.Date || '').slice(0,10)
        const targetDate=rescheduleRequest.targetDate
        const targetGroomer=String(row.Groomer || '').trim() || firstGroomer()
        const targetTime=appointmentTimeInput(String(row['Start Time'] || row['Locked Time'] || '')) || defaultFirstStopTime(targetGroomer)
        const household=String(row['Household ID'] || '').trim().toLowerCase()
        const owner=String(row.Owner || '').trim()
        const clientRows=(dogs || []).filter(client=>{
          const clientHousehold=String(client?.household_id || client?.['Household ID'] || '').trim().toLowerCase()
          const clientOwner=String(client?.owner || client?.Owner || '').trim().toLowerCase()
          return (household && clientHousehold===household) || (!household && clientOwner===owner.toLowerCase())
        })
        const assignedGroomers=[...new Set(clientRows.map(client=>String(client?.groomer || client?.Groomer || '').trim()).filter(name=>groomerNames(true).includes(name)))]
        const ruleWarnings=schedulingOverrideReasons(targetDate,targetGroomer,assignedGroomers)
        const proposal=`${owner} is currently ${plannerDayLabel(sourceDate)} at ${displayClockTime(targetTime)} with ${targetGroomer}. Move ${owner} to ${plannerDayLabel(targetDate)} at ${displayClockTime(targetTime)} with ${targetGroomer}?`
        const nextConversation=[...conversation.slice(-12),{role:'user',text:prompt},{role:'assistant',text:proposal}].slice(-16)
        shouldAutoScrollRef.current=true
        setConversation(nextConversation)
        setAnswer({
          mode:'reschedule',title:'Move appointment',text:proposal,targetDate,filters:{},candidates:[],summary:'',
          reschedule:{
            owner,dogs:String(row.Dogs || '').trim(),sourceDate,targetDate,targetTime,targetGroomer,
            weekStart:best.weekStart,sourceRow:row,ruleWarnings
          }
        })
        return
      }

      const summarizePlannerAnswer = value => {
        if (!value || value.mode === 'ai') return null
        return {
          mode:value.mode || 'planner',
          title:value.title || '',
          targetDate:value.targetDate || '',
          filters:value.filters || {},
          summary:value.summary || '',
          candidates:(value.candidates || []).slice(0,8).map(candidate=>({
            owner:candidate.owner || '',
            dogs:(candidate.rows || []).map(row=>String(row?.dog || row?.Dog || '').trim()).filter(Boolean),
            price:Number(candidate.price || 0) || 0,
            minutes:Number(candidate.minutes || 0) || 0,
            groomer:candidate.targetGroomer || '',
            suggestedTime:candidate.suggestedTime || '',
            area:candidate.area || '',
            due:candidate.due?.detail || '',
            routeLabel:candidate.routeInfo?.label || '',
            addedMinutes:Number(candidate.routeInfo?.addedMinutes || 0) || 0
          }))
        }
      }
      const previousPlannerResult = summarizePlannerAnswer(previousAnswer)
      const priorConversation = conversation.slice(-12)
      const explicitSuggestionRequest=bettyExplicitSuggestionRequest(prompt,Boolean(previousPlannerResult))

      const obviousWeather = /\b(weather|forecast|rain|storm|temperature|temp|heat index|cold front)\b/i.test(prompt)
      const obviousGeneral = /\b(commission|earnings?|make (?:today|tomorrow|this week)|what time|time is it|revenue|sales total|my share|haley(?:'s)? share)\b/i.test(prompt)
      // These locally recognized requests already overrode the router's result
      // below. Skip the round trip that could not affect their behavior.
      const knownIntent = specificBookingRequest || scheduleLookupRequest
        ? 'general' : obviousWeather ? 'weather' : obviousGeneral ? 'general' : ''
      const requests = createBettyRequestPlan({
        knownIntent,
        // Price questions and obvious weather keep their no-schedule fast path.
        preloadSchedule: knownIntent === 'general' || (!knownIntent && !filters.priceLookup),
        loadSchedule: () => {
          const startWeek = mondayForDate(today)
          const endDate = new Date(`${today}T12:00:00Z`)
          endDate.setUTCDate(endDate.getUTCDate()+84)
          const endWeek = mondayForDate(endDate.toISOString().slice(0,10))
          return supabase.from('weekly_drafts').select('week_start,plan_json')
            .gte('week_start',startWeek).lte('week_start',endWeek).order('week_start',{ascending:true})
        },
        routeRequest: async () => {
          const routeResponse = await apiFetch('/api/ask-betty',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
              mode:'route',
              message:prompt,
              context:{conversation:priorConversation,previousPlannerResult}
            })
          })
          const routePayload = await routeResponse.json().catch(()=>({}))
          return routeResponse.ok ? routePayload?.intent : 'general'
        }
      })
      let bettyIntent = await requests.intent
      if (specificBookingRequest || scheduleLookupRequest) bettyIntent='general'
      if (bettyIntent==='planner_schedule' && !explicitSuggestionRequest) bettyIntent='general'

      if (bettyIntent === 'planner_schedule' && previousPlannerResult) {
        const prior = previousPlannerResult.filters || {}
        const inherit = key => {
          if ((filters[key] === '' || filters[key] === 0 || filters[key] === false || filters[key] == null) && prior[key]) filters[key] = prior[key]
        }
        ;['date','area','service','minPrice','maxMinutes'].forEach(inherit)
        if (!filters.groomer && prior.groomer) filters.groomer = prior.groomer
        if (!filters.routeIntent && prior.routeIntent) filters.routeIntent = true
        if (!filters.unbookedOnly && prior.unbookedOnly) filters.unbookedOnly = true
        if (!filters.overdueOnly && prior.overdueOnly) filters.overdueOnly = true
      }

      if (bettyIntent === 'weather') {
        const response = await apiFetch('/api/ask-betty',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({mode:'weather',message:prompt})
        })
        const payload = await response.json().catch(()=>({}))
        if (!response.ok) throw new Error(payload?.error || `Betty could not check the weather (${response.status}).`)
        const reply=String(payload?.answer || '').trim() || 'Betty could not return the weather.'
        const nextConversation=[...priorConversation,{role:'user',text:prompt},{role:'assistant',text:reply}].slice(-16)
        shouldAutoScrollRef.current=true
        setConversation(nextConversation)
        setAnswer({mode:'ai',title:'Betty',text:reply,targetDate:'',filters:{},candidates:[],summary:''})
        return
      }

      if (bettyIntent === 'client_price') {
        const needle = String(filters.lookupName || '').toLowerCase().trim()
        const ranked = groups.map(client=>{
          const owner = client.owner.toLowerCase()
          const dogNames = client.rows.map(row=>String(row?.dog || row?.Dog || '').trim())
          const dogNamesLower = dogNames.map(name=>name.toLowerCase())
          let matchScore = 0
          if (needle) {
            if (owner === needle) matchScore = 100
            else if (dogNamesLower.includes(needle)) matchScore = 95
            else if (owner.includes(needle) || needle.includes(owner)) matchScore = 80
            else if (dogNamesLower.some(name=>name.includes(needle) || needle.includes(name))) matchScore = 75
            else return null
          } else return null

          const matchingDogRows = client.rows.filter(row=>{
            const dogName = String(row?.dog || row?.Dog || '').trim().toLowerCase()
            return dogName && (dogName===needle || dogName.includes(needle) || needle.includes(dogName))
          })
          const rowsForPrice = matchingDogRows.length ? matchingDogRows : client.rows
          const breakdown = rowsForPrice.map(row=>{
            const dog = String(row?.dog || row?.Dog || '').trim()
            const service = filters.service || plannerUsualService(row)
            const values = serviceDefaultsForDog(row,service)
            return {dog,service,price:Number(values.price || 0),minutes:Number(values.minutes || 0)}
          })
          const price = breakdown.reduce((sum,item)=>sum+Number(item.price || 0),0)
          const minutes = breakdown.reduce((sum,item)=>sum+Number(item.minutes || 0),0)
          return {...client,matchScore,price:Math.round(price),minutes:Math.round(minutes),pricingBreakdown:breakdown}
        }).filter(Boolean).sort((a,b)=>b.matchScore-a.matchScore || a.owner.localeCompare(b.owner)).slice(0,5)

        setAnswer({mode:'price',title:ranked.length ? `Pricing for ${filters.lookupName}` : 'Client price',targetDate:'',filters,candidates:ranked,summary:''})
        return
      }

      let targetDate = filters.date || (bettyIntent === 'planner_schedule' ? previousPlannerResult?.targetDate || '' : '')
      if (!targetDate && filters.routeIntent) targetDate = today

      const {data,error:loadError} = await requests.schedule()
      if (loadError) throw loadError

      const planRows = (data || []).flatMap(week=>Array.isArray(week.plan_json)?week.plan_json:[])
      const activeRows = planRows.filter(row=>plannerActiveRow(row,today))

      if (scheduleLookupRequest) {
        const rows=activeRows.filter(row=>{
          const date=String(row?.Date || '').slice(0,10)
          return date>=scheduleLookupRequest.start && date<=scheduleLookupRequest.end
        }).sort((a,b)=>String(a.Date || '').localeCompare(String(b.Date || '')) || clockMinutesForDisplay(String(a['Start Time'] || a['Locked Time'] || ''))-clockMinutesForDisplay(String(b['Start Time'] || b['Locked Time'] || '')))
        const items=rows.map(row=>({
          date:String(row.Date || '').slice(0,10),
          time:String(row['Start Time'] || row['Locked Time'] || '').trim(),
          owner:String(row.Owner || '').trim(),
          dogs:String(row.Dogs || '').trim(),
          groomer:String(row.Groomer || '').trim(),
          area:String(row['Area Cluster'] || row.Area || '').trim(),
          price:Number(row.Price || 0) || 0,
          confirmation:clientConfirmationStatus(row)
        }))
        const reply=items.length ? `${scheduleLookupRequest.label}: ${items.length} appointment${items.length===1?'':'s'} on the schedule.` : `${scheduleLookupRequest.label}: no appointments are currently scheduled.`
        const nextConversation=[...priorConversation,{role:'user',text:prompt},{role:'assistant',text:reply}].slice(-16)
        setConversation(nextConversation)
        setAnswer({mode:'schedule_list',title:scheduleLookupRequest.label,text:reply,scheduleItems:items,targetDate:'',filters:{},candidates:[],summary:''})
        return
      }

      if (specificBookingRequest) {
        const ranked=groups.map(client=>({client,score:bettyAppointmentMatchScore({Owner:client.owner,Dogs:client.rows.map(row=>row?.dog || row?.Dog || '').join(' + ')},specificBookingRequest.subject)})).filter(item=>item.score>0).sort((a,b)=>b.score-a.score)
        const match=ranked[0]?.client
        if(!match){
          const reply=`I couldn't find ${specificBookingRequest.subject} in your client list. Try the owner or dog name exactly as it appears.`
          const nextConversation=[...priorConversation,{role:'user',text:prompt},{role:'assistant',text:reply}].slice(-16)
          setConversation(nextConversation); setAnswer({mode:'ai',title:'Betty',text:reply,targetDate:'',filters:{},candidates:[],summary:''}); return
        }
        const existing=activeRows.filter(row=>{
          const h=String(row?.['Household ID'] || '').trim(); const owner=String(row?.Owner || '').trim().toLowerCase()
          return (match.household && h===match.household) || (!match.household && owner===match.owner.toLowerCase())
        }).sort((a,b)=>String(a.Date || '').localeCompare(String(b.Date || '')))
        const assigned=[...new Set(match.rows.map(row=>String(row?.groomer || row?.Groomer || '').trim()).filter(name=>groomerNames(true).includes(name)))]
        const targetDate=specificBookingRequest.targetDate
        const weekday=new Date(`${targetDate}T12:00:00Z`).getUTCDay()
        const targetGroomer=chooseGroomer(targetDate || businessDateKey(),{assigned}) || assigned[0] || firstGroomer()
        const dayAppointments=todayAppointments(planRows,targetDate,'All')
        const totals=plannerClientTotals(match.rows)
        const minutes=Math.max(30,Math.round(totals.minutes || 60))
        const suggestedTime=openingForDuration(dayAppointments,minutes,targetGroomer) || defaultFirstStopTime(targetGroomer)
        const warnings=schedulingOverrideReasons(targetDate,targetGroomer,assigned)
        const existingOther=existing.find(row=>String(row.Date || '').slice(0,10)!==targetDate)
        const proposal=existingOther
          ? `${match.owner} already has an appointment ${plannerDayLabel(String(existingOther.Date || '').slice(0,10))}. I can set up another appointment for ${plannerDayLabel(targetDate)} at ${displayClockTime(suggestedTime)} with ${targetGroomer}, or you can ask me to move the existing appointment instead.`
          : `Set up ${match.owner} for ${plannerDayLabel(targetDate)} at ${displayClockTime(suggestedTime)} with ${targetGroomer}?`
        const nextConversation=[...priorConversation,{role:'user',text:prompt},{role:'assistant',text:proposal}].slice(-16)
        setConversation(nextConversation)
        setAnswer({mode:'booking',title:'Add appointment',text:proposal,targetDate,filters:{},candidates:[],summary:'',booking:{clientKey:match.key,owner:match.owner,dogs:match.rows.map(row=>String(row?.dog || row?.Dog || '').trim()).filter(Boolean).join(' + '),targetDate,targetGroomer,suggestedTime,warnings,existingDate:existingOther?String(existingOther.Date || '').slice(0,10):''}})
        return
      }

      const attentionIntent = bettyIntent === 'brief'

      // Betty decides the intent first. Only purpose-built planner questions use
      // deterministic planner cards; everything else goes to the conversational AI.
      if (bettyIntent === 'general') {
        const needsClientDetails = /\b(client|dog|price|cost|book|schedule|appointment|overdue|due|rebook|area|service|groom|bath|partial|route|opening|fill|confirm)\b/i.test(prompt)
        const clientContext = (needsClientDetails ? groups.slice(0,120) : []).map(client=>({
          owner:client.owner,
          household:client.household || '',
          dogs:client.rows.map(row=>({
            name:String(row?.dog || row?.Dog || '').trim(),
            area:canonicalAreaLabel(row?.area || row?.Area || ''),
            groomer:String(row?.groomer || row?.Groomer || '').trim(),
            service:String(row?.service_pattern || row?.['Service Pattern'] || '').trim(),
            nextService:String(row?.next_service || row?.['Next Service'] || '').trim(),
            groomPrice:Number(row?.groom_price || row?.['Groom Price'] || 0) || 0,
            bathPrice:Number(row?.bath_price || row?.['Bath Price'] || 0) || 0,
            partialPrice:Number(row?.partial_groom_price || row?.['Partial Groom Price'] || 0) || 0,
            groomMinutes:Number(row?.groom_minutes || row?.['Groom Minutes'] || 0) || 0,
            bathMinutes:Number(row?.bath_minutes || row?.['Bath Minutes'] || 0) || 0,
            partialMinutes:Number(row?.partial_groom_minutes || row?.['Partial Groom Minutes'] || 0) || 0,
            lastGroom:String(row?.last_groom || row?.['Last Groom'] || '').slice(0,10),
            lastBath:String(row?.last_bath || row?.['Last Bath'] || '').slice(0,10),
            frequency:String(row?.frequency || row?.Frequency || '').trim()
          }))
        }))
        const scheduleContext = activeRows.slice(0,140).map(row=>({
          date:String(row?.Date || '').slice(0,10),
          time:String(row?.['Start Time'] || row?.['Locked Time'] || '').trim(),
          groomer:String(row?.Groomer || '').trim(),
          owner:String(row?.Owner || '').trim(),
          dogs:String(row?.Dogs || '').trim(),
          area:String(row?.['Area Cluster'] || row?.Area || '').trim(),
          price:Number(row?.Price || 0) || 0,
          confirmation:clientConfirmationStatus(row),
          status:String(row?.['Appointment Status'] || row?.Status || '').trim()
        }))

        const now=new Date()
        const timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local device time'
        const localDateTime=now.toLocaleString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit',timeZone:businessSettings().timeZone,timeZoneName:'short'})
        const localTime=now.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})
        const response = await apiFetch('/api/ask-betty',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            message:prompt,
            context:{
              today,
              currentLocalDateTime:localDateTime,
              currentLocalTime:localTime,
              timeZone,
              utcOffsetMinutes:-now.getTimezoneOffset(),
              conversation:priorConversation,
              previousPlannerResult,
              responsePreferences:{
                phoneFriendly:true,
                concise:true,
                askOneQuestionAtATime:true,
                useConversationForFollowUps:true
              },
              currentCapabilities:{
                canReadPlannerData:true,
                canSuggestAppointments:true,
                canSaveAppointments:false,
                canSendCustomerMessages:false,
                note:'For booking or rescheduling requests, gather only the next missing detail, one question at a time. You may propose a specific appointment, but do not claim it was saved or sent.'
              },
              business:businessSettings().businessName,
              groomers:groomerNames(),
              schedulingRules:businessSettings().groomers.map(g=>({name:g.name,active:g.active,workDays:g.workDays,startTime:g.startTime,endTime:g.endTime})),
              appointmentGapMinutes:businessSettings().bufferMinutes,
              compensationRules:businessSettings().groomers.map(g=>({name:g.name,commissionPercent:g.commissionPercent,tips:'Keeps all received tips; tips are separate from service commission.'})),
              clients:clientContext,
              upcomingSchedule:scheduleContext
            }
          })
        })
        const payload = await response.json().catch(()=>({}))
        if (!response.ok) throw new Error(payload?.error || `Betty could not answer (${response.status}).`)
        const reply=String(payload?.answer || '').trim() || 'Betty did not return an answer.'
        const nextConversation=[...priorConversation,{role:'user',text:prompt},{role:'assistant',text:reply}].slice(-16)
        shouldAutoScrollRef.current=true
        setConversation(nextConversation)
        setAnswer({mode:'ai',title:'Betty',text:reply,targetDate:'',filters,candidates:[],summary:''})
        return
      }

      if (attentionIntent) {
        const currentWeekStart = mondayForDate(today)
        const weekEndDate = new Date(`${currentWeekStart}T12:00:00Z`)
        weekEndDate.setUTCDate(weekEndDate.getUTCDate()+6)
        const currentWeekEnd = weekEndDate.toISOString().slice(0,10)

        const confirmationRows = activeRows.filter(row=>{
          const date = String(row.Date || '').slice(0,10)
          return date >= currentWeekStart && date <= currentWeekEnd && needsClientConfirmation(row)
        })

        const bookedKeys = new Set()
        for (const row of activeRows) {
          const household = String(row['Household ID'] || '').trim()
          const owner = String(row.Owner || row.Client || '').trim()
          if (household) bookedKeys.add(`h:${household}`)
          if (owner) bookedKeys.add(`o:${owner.toLowerCase()}`)
        }

        const overdueUnbooked = groups.map(client=>{
          const ownerKey = `o:${client.owner.toLowerCase()}`
          const booked = bookedKeys.has(client.key) || bookedKeys.has(ownerKey)
          if (booked) return null
          const due = clientDueInfo(client.rows,today)
          return due.status === 'Overdue' ? {...client,due} : null
        }).filter(Boolean)

        const todayRows = activeRows.filter(row=>String(row.Date || '').slice(0,10)===today)
        const incompleteToday = todayRows.filter(row=>String(row?.['Completion Status'] || '').trim().toLowerCase()!=='completed')
        const todayRevenue = todayRows.reduce((sum,row)=>sum+Number(row.Price || 0),0)

        const tomorrowDate = new Date(`${today}T12:00:00Z`)
        tomorrowDate.setUTCDate(tomorrowDate.getUTCDate()+1)
        const tomorrow = tomorrowDate.toISOString().slice(0,10)
        const tomorrowRows = activeRows.filter(row=>String(row.Date || '').slice(0,10)===tomorrow)
        const tomorrowUnconfirmed = tomorrowRows.filter(row=>needsClientConfirmation(row))

        const weekRows = activeRows.filter(row=>{
          const date = String(row.Date || '').slice(0,10)
          return date >= currentWeekStart && date <= currentWeekEnd
        })
        const weekRevenue = weekRows.reduce((sum,row)=>sum+Number(row.Price || 0),0)

        const brief = [
          {label:'Still needs confirmation',value:confirmationRows.length,detail:confirmationRows.length?`${confirmationRows.length} appointment${confirmationRows.length===1?'':'s'} this week`:'Everyone this week is handled',tone:confirmationRows.length?'warn':'good'},
          {label:'Overdue + not rebooked',value:overdueUnbooked.length,detail:overdueUnbooked.length?`${overdueUnbooked.length} client${overdueUnbooked.length===1?'':'s'} to contact`:'No overdue unbooked clients',tone:overdueUnbooked.length?'warn':'good'},
          {label:'Today',value:`${incompleteToday.length}/${todayRows.length}`,detail:`remaining · $${Math.round(todayRevenue)} scheduled`,tone:incompleteToday.length?'normal':'good'},
          {label:'Tomorrow',value:tomorrowRows.length,detail:tomorrowUnconfirmed.length?`${tomorrowUnconfirmed.length} still unconfirmed`:'all confirmed / no stops',tone:tomorrowUnconfirmed.length?'warn':'normal'},
          {label:'Week scheduled',value:`$${Math.round(weekRevenue)}`,detail:`${weekRows.length} stop${weekRows.length===1?'':'s'} on the books`,tone:'normal'}
        ]

        setAnswer({mode:'brief',title:'What needs your attention',targetDate:'',filters,candidates:[],brief,summary:'Here is the business snapshot Betty would check first.'})
        return
      }

      if (bettyIntent === 'confirmations') {
        const currentWeekStart = mondayForDate(today)
        const weekEndDate = new Date(`${currentWeekStart}T12:00:00Z`)
        weekEndDate.setUTCDate(weekEndDate.getUTCDate()+6)
        const currentWeekEnd = weekEndDate.toISOString().slice(0,10)
        const rowsNeeding = activeRows.filter(row=>{
          const date = String(row.Date || '').slice(0,10)
          if (date < currentWeekStart || date > currentWeekEnd) return false
          if (filters.groomer && String(row.Groomer || '').trim() !== filters.groomer) return false
          return needsClientConfirmation(row)
        })
        const byHousehold = new Map()
        for (const row of rowsNeeding) {
          const household = String(row['Household ID'] || '').trim()
          const owner = String(row.Owner || '').trim()
          const key = household ? `h:${household}` : `o:${owner.toLowerCase()}`
          if (byHousehold.has(key)) continue
          const group = groups.find(client=>client.key===key || client.owner.toLowerCase()===owner.toLowerCase()) || {key,owner,household,rows:[]}
          byHousehold.set(key,{...group,confirmationRow:row,confirmation:clientConfirmationStatus(row),date:String(row.Date || '').slice(0,10),time:String(row['Start Time'] || row['Locked Time'] || '').trim(),price:Number(row.Price || 0),minutes:scheduleRowDuration(row,60),due:{detail:clientConfirmationStatus(row)}})
        }
        const candidates = [...byHousehold.values()].sort((a,b)=>String(a.date).localeCompare(String(b.date)) || clockMinutesForDisplay(a.time)-clockMinutesForDisplay(b.time)).slice(0,20)
        setAnswer({mode:'confirmation',title:'Clients who still need confirmation this week',targetDate:'',filters,candidates,summary:''})
        return
      }

      const bookedKeys = new Set()
      for (const row of activeRows) {
        const household = String(row['Household ID'] || '').trim()
        const owner = String(row.Owner || row.Client || '').trim()
        if (household) bookedKeys.add(`h:${household}`)
        if (owner) bookedKeys.add(`o:${owner.toLowerCase()}`)
      }

      const dayAppointments = targetDate ? todayAppointments(planRows,targetDate,'All') : []
      const weekday = targetDate ? new Date(`${targetDate}T12:00:00Z`).getUTCDay() : null
      const dayCounts = dayAppointments.reduce((acc,appt)=>{
        if (groomerNames(true).includes(appt.groomer)) acc[appt.groomer] = (acc[appt.groomer] || 0)+1
        return acc
      },{})
      const dayAreas = [...new Set(dayAppointments.map(appt=>canonicalAreaLabel(appt.area)).filter(Boolean))]
      const targetDay = new Date(`${targetDate || today}T12:00:00Z`)

      let candidates = groups.map(client=>{
        const ownerKey = `o:${client.owner.toLowerCase()}`
        const booked = bookedKeys.has(client.key) || bookedKeys.has(ownerKey)
        if (booked) return null

        const due = clientDueInfo(client.rows,targetDate || today)
        if (filters.overdueOnly && due.status !== 'Overdue') return null
        if (!filters.unbookedOnly && !['Overdue','Due today','Due this week','Due soon','Upcoming','Not enough data'].includes(due.status)) return null

        const lastDates = client.rows.flatMap(row=>[
          String(row?.last_groom || row?.['Last Groom'] || '').slice(0,10),
          String(row?.last_bath || row?.['Last Bath'] || '').slice(0,10)
        ]).filter(value=>/^\d{4}-\d{2}-\d{2}$/.test(value)).sort()
        const lastService = lastDates.at(-1) || ''
        if (targetDate && lastService && !filters.unbookedOnly) {
          const last = new Date(`${lastService}T12:00:00Z`)
          const daysSince = Math.floor((targetDay-last)/86400000)
          if (daysSince >= 0 && daysSince < 14) return null
        }

        const assigned = [...new Set(client.rows.map(row=>String(row?.groomer || row?.Groomer || '').trim()).filter(name=>groomerNames(true).includes(name)))]
        const exclusive = assigned.length===1 ? assigned[0] : ''
        const targetGroomer = targetDate ? chooseGroomer(targetDate,{preferred:filters.groomer,assigned,counts:dayCounts}) : filters.groomer || exclusive || firstGroomer()
        if (!targetGroomer || (exclusive && exclusive!==targetGroomer)) return null

        const totals = plannerClientTotals(client.rows)
        const price = Math.round(totals.price || 0)
        const minutes = Math.max(30,Math.round(totals.minutes || 60))
        if (filters.minPrice && price < filters.minPrice) return null
        if (filters.maxMinutes && minutes > filters.maxMinutes) return null
        if (filters.service && !totals.services.some(service=>service===filters.service || (filters.service==='Groom' && ['Groom','Partial Groom'].includes(service)))) return null

        const area = canonicalAreaLabel(client.rows.map(row=>row?.area || row?.Area || '').find(Boolean) || '')
        if (filters.area) {
          const wanted = filters.area.toLowerCase().replace(/^the\s+/,'')
          const actual = area.toLowerCase().replace(/^the\s+/,'')
          if (!actual.includes(wanted) && !wanted.includes(actual)) return null
        }
        const suggestedTime = targetDate ? openingForDuration(dayAppointments,minutes,targetGroomer) : ''
        if (targetDate && filters.routeIntent && !suggestedTime) return null

        const duePoints = due.status==='Overdue' ? 110 : due.status==='Due today' ? 100 : due.status==='Due this week' ? 90 : due.status==='Due soon' ? 72 : due.status==='Upcoming' ? 40 : 10
        const overdueBonus = due.days < 0 ? Math.min(30,Math.abs(due.days)) : 0
        const areaPoints = filters.area ? 35 : (area && dayAreas.some(value=>value===area) ? 12 : 0)
        const groomerPoints = dayAppointments.some(appt=>appt.groomer===targetGroomer) ? 8 : 0
        const openingPoints = targetDate ? (suggestedTime ? 28 : -40) : 0
        return {...client,due,booked:false,area,targetGroomer,price,minutes,suggestedTime,lastService,totals,
          score:duePoints+overdueBonus+areaPoints+groomerPoints+openingPoints}
      }).filter(Boolean)

      candidates.sort((a,b)=>b.score-a.score || (a.due.dueDate || '9999').localeCompare(b.due.dueDate || '9999') || a.owner.localeCompare(b.owner))
      candidates = candidates.slice(0,8)

      if (targetDate && filters.routeIntent && candidates.length) {
        const lookup = clientAddressLookup(dogs)
        const cacheMs = 15*60*1000
        const fetchRoute = async (stops,groomer) => {
          if (!stops.length) return {totalMinutes:0,totalMiles:0,legs:[]}
          const signature = stops.map(stop=>`${stop.id}:${stop.address}:${stop.time}`).join('|')
          const cacheKey = `${getBusinessContext().businessId}:${getBusinessContext().revision}:ask-planner-route-v1:${targetDate}:${groomer}:${signature}`
          try {
            const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null')
            if (cached?.payload && Number(cached.savedAt) > Date.now()-cacheMs) return cached.payload
          } catch {}
          const response = await apiFetch('/api/google-route',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stops,groomer})})
          const payload = await response.json().catch(()=>({}))
          if (!response.ok) throw new Error(payload?.error || `Google route check failed (${response.status}).`)
          try { localStorage.setItem(cacheKey,JSON.stringify({savedAt:Date.now(),payload})) } catch {}
          return payload
        }

        const baseByGroomer = {}
        const baseRoute = groomer => {
          if (!baseByGroomer[groomer]) {
            const existing = dayAppointments.filter(appt=>appt.groomer===groomer).slice().sort(compareAppointmentTimes)
            const stops = existing.map((appt,index)=>({id:appt.id || `existing-${index}`,owner:appt.owner,address:appointmentAddress(appt,lookup),time:String(appt.time || '').trim()}))
            baseByGroomer[groomer] = stops.some(stop=>!stop.address)
              ? Promise.resolve({unavailable:true})
              : fetchRoute(stops,groomer).catch(()=>({unavailable:true}))
          }
          return baseByGroomer[groomer]
        }

        const ranked = await Promise.all(candidates.map(async candidate=>{
          const address = candidate.rows.map(fullClientAddress).find(Boolean) || ''
          if (!address) return {...candidate,routeInfo:{unavailable:true,label:'Address needed'}}
          const existing = dayAppointments.filter(appt=>appt.groomer===candidate.targetGroomer).slice().sort(compareAppointmentTimes)
            .map((appt,index)=>({id:appt.id || `existing-${index}`,owner:appt.owner,address:appointmentAddress(appt,lookup),time:String(appt.time || '').trim(),appt}))
          if (existing.some(stop=>!stop.address)) return {...candidate,routeInfo:{unavailable:true,label:'Existing stop needs address'}}
          const candidateStop = {id:`ask-${candidate.key}`,owner:candidate.owner,address,time:candidate.suggestedTime,candidate:true}
          const proposed = [...existing,candidateStop].sort((a,b)=>{
            const first=clockMinutesForDisplay(a.time), second=clockMinutesForDisplay(b.time)
            if (!Number.isFinite(first)) return 1
            if (!Number.isFinite(second)) return -1
            return first-second
          })
          try {
            const [base,next] = await Promise.all([baseRoute(candidate.targetGroomer),fetchRoute(proposed.map(({appt,candidate,...stop})=>stop),candidate.targetGroomer)])
            if (base?.unavailable) return {...candidate,routeInfo:{unavailable:true,label:'Google route unavailable'}}
            const addedMinutes=Math.max(0,Number(next.totalMinutes||0)-Number(base.totalMinutes||0))
            const addedMiles=Math.max(0,Number(next.totalMiles||0)-Number(base.totalMiles||0))
            const candidateIndex = proposed.findIndex(stop=>stop.id===candidateStop.id)
            const previous = candidateIndex>0 ? proposed[candidateIndex-1] : null
            const following = candidateIndex>=0 && candidateIndex<proposed.length-1 ? proposed[candidateIndex+1] : null
            const legIn = (next.legs || []).find(leg=>leg.toId===candidateStop.id)
            const legOut = (next.legs || []).find(leg=>leg.fromId===candidateStop.id)
            const candidateMinutes = clockMinutesForDisplay(candidate.suggestedTime)
            const risks = []
            if (previous?.appt && Number.isFinite(candidateMinutes)) {
              const previousStart = clockMinutesForDisplay(previous.time)
              const arrival = previousStart + appointmentDurationMinutes(previous.appt) + Number(legIn?.minutes || 0)
              if (Number.isFinite(previousStart) && arrival > candidateMinutes + 30) risks.push(`${Math.ceil(arrival-(candidateMinutes+30))} min past ${candidate.owner}'s window`)
            }
            if (following?.appt && Number.isFinite(candidateMinutes)) {
              const followingStart = clockMinutesForDisplay(following.time)
              const arrival = candidateMinutes + Number(candidate.minutes || 0) + Number(legOut?.minutes || 0)
              if (Number.isFinite(followingStart) && arrival > followingStart + 30) risks.push(`${Math.ceil(arrival-(followingStart+30))} min past ${following.owner}'s window`)
            }
            const driveLimit=Number(businessSettings().route.maxAddedDriveMinutes || 0)
            if(driveLimit && addedMinutes>driveLimit)risks.push(`Exceeds your ${driveLimit} minute extra driving limit`)
            const routeRisk = risks.length>0
            let routePoints = addedMinutes<=10?55:addedMinutes<=20?42:addedMinutes<=30?28:addedMinutes<=45?12:addedMinutes<=60?0:-20
            if (routeRisk) routePoints -= 65
            const label = routeRisk ? 'Route risk' : addedMinutes<=15?'Great route':addedMinutes<=30?'Good route':addedMinutes<=45?'Okay route':'Longer drive'
            return {...candidate,score:candidate.score+routePoints,routeInfo:{addedMinutes,addedMiles,label,routeRisk,risks}}
          } catch {
            return {...candidate,routeInfo:{unavailable:true,label:'Google route unavailable'}}
          }
        }))
        candidates = ranked.sort((a,b)=>b.score-a.score || a.owner.localeCompare(b.owner)).slice(0,6)
      } else {
        candidates = candidates.slice(0,6)
      }

      const title = filters.unbookedOnly && !targetDate
        ? 'Clients not booked back yet'
        : targetDate ? `Best fits for ${plannerDayLabel(targetDate)}` : 'Best client matches'
      const summaryBits = []
      if (filters.overdueOnly) summaryBits.push('overdue only')
      if (filters.area) summaryBits.push(filters.area)
      if (filters.groomer) summaryBits.push(filters.groomer)
      if (filters.minPrice) summaryBits.push(`$${filters.minPrice}+`)
      if (filters.maxMinutes) summaryBits.push(`${filters.maxMinutes} min or less`)
      if (filters.service) summaryBits.push(filters.service)
      setAnswer({title,targetDate,filters,candidates,summary:summaryBits.join(' · ')})
    } catch(err) {
      setError(err?.message || 'Ask Betty could not check your schedule.')
    } finally {
      setLoading(false)
    }
  }

  const confirmBettyReschedule = async () => {
    const move=answer?.reschedule
    if (!move || loading || viewerMode) return
    if ((move.ruleWarnings || []).length) return
    setLoading(true)
    setError('')
    shouldAutoScrollRef.current=true
    try {
      const {data,error:saveError}=await supabase.rpc('reschedule_grooming_appointment_safe',{
        p_week_start:move.weekStart,
        p_expected_row:move.sourceRow,
        p_target_date:move.targetDate,
        p_target_time:move.targetTime,
        p_target_groomer:move.targetGroomer,
        p_note:null
      })
      if (saveError) {
        if (saveError.code==='PGRST202' || saveError.code==='42883') throw new Error('Rescheduling has not been enabled in Supabase yet.')
        throw saveError
      }
      if (data?.status!=='rescheduled') throw new Error('The move could not be confirmed. Refresh the planner before trying again.')
      const success=`Done — ${move.owner} was moved to ${plannerDayLabel(move.targetDate)} at ${displayClockTime(move.targetTime)} with ${move.targetGroomer}.`
      const nextConversation=[...conversation.slice(-12),{role:'user',text:'Confirm move'},{role:'assistant',text:success}].slice(-16)
      setConversation(nextConversation)
      setAnswer({mode:'ai',title:'Betty',text:success,targetDate:'',filters:{},candidates:[],summary:''})
      onScheduleChanged?.(success)
    } catch(err) {
      setError(err?.message || 'Betty could not move the appointment.')
    } finally {
      setLoading(false)
    }
  }

  const confirmBettyBooking = () => {
    const booking=answer?.booking
    if(!booking || viewerMode || (booking.warnings || []).length) return
    onClose?.()
    onChoose?.({date:booking.targetDate,clientKey:booking.clientKey,groomer:booking.targetGroomer,time:booking.suggestedTime,fixed:false,note:'Added from Ask Betty'})
  }

  const choose = candidate => {
    if (viewerMode) {
      onClose?.()
      onClient?.({key:candidate.key,household:candidate.household || '',owner:candidate.owner})
      return
    }
    if (answer?.mode === 'confirmation') {
      onClose?.()
      onClient?.({key:candidate.key,household:candidate.household || '',owner:candidate.owner})
      return
    }
    if (answer?.targetDate || answer?.filters?.unbookedOnly) {
      const groomer = candidate.targetGroomer || firstGroomer()
      const date = answer?.targetDate || plannerNextBookableDate(groomer)
      onClose?.()
      onChoose?.({
        date,
        clientKey:candidate.key,
        groomer,
        time:candidate.suggestedTime || defaultFirstStopTime(groomer),
        fixed:false,
        note:answer?.filters?.unbookedOnly ? 'Rebooked from Ask Betty' : 'Added from Ask Betty'
      })
      return
    }
    onClose?.()
    onClient?.({key:candidate.key,household:candidate.household || '',owner:candidate.owner})
  }

  const quick = [
    'What needs my attention?',
    'Who should I add Wednesday?',
    'Who is overdue near The Woodlands?',
    "Who hasn't been booked back yet?",
    "Who still needs to confirm this week?"
  ]

  return (
    <div
      className="sheet-backdrop"
      onPointerDown={event=>{ if(event.target===event.currentTarget) onClose?.() }}
      style={{zIndex:200,pointerEvents:'auto'}}
    >
      <div
        ref={sheetRef}
        className="assistant-sheet"
        onPointerDown={event=>event.stopPropagation()}
        onScroll={event=>{ savedScrollRef.current=event.currentTarget.scrollTop; saveMemory({scrollTop:event.currentTarget.scrollTop}) }}
        style={{maxHeight:'90dvh',overflowY:'auto',position:'relative',zIndex:201,pointerEvents:'auto',touchAction:'manipulation'}}
      >
        <div className="sheet-handle"/>
        <div className="assistant-title">
          <div className="ai-orb" aria-hidden="true">🐾</div>
          <div><span>🐾 Ask Betty</span><strong>Your AI grooming business assistant</strong></div>
          <button className="icon-btn" onClick={clearAndClose} aria-label="Close and clear Betty conversation"><X size={18}/></button>
        </div>
        <div className="quick-prompts">
          {quick.map(q=><button key={q} onClick={()=>run(q)}>{q}</button>)}
        </div>
        {loading && <div className="ai-result" style={{marginTop:12}}><div className="result-head"><CheckCircle2 size={17}/><strong>Betty</strong></div><div style={{display:'flex',justifyContent:'flex-start',marginTop:10}}><div style={{maxWidth:'88%',padding:'10px 12px',border:'1px solid #e6e8ed',borderRadius:12,background:'#f8f9fb',fontSize:13,lineHeight:1.5,color:'#6b7280'}}>Betty is thinking…</div></div></div>}
        {error && <div className="login-message" role="alert" style={{marginTop:12}}>{error}</div>}
        {answer && !loading && (
          <div className="ai-result">
            <div className="result-head"><CheckCircle2 size={17}/><strong>{answer.title}</strong></div>
            {answer.summary && <p style={{marginTop:6}}>{answer.summary}</p>}
            {answer.mode==='booking' ? (
              <div style={{display:'grid',gap:10,marginTop:10}}>
                <div style={{padding:'12px',border:'1px solid #cfe0d4',borderRadius:12,background:'#f1faf3'}}>
                  <div style={{fontSize:12,color:'#4f7b5e',marginBottom:7}}>PROPOSED APPOINTMENT</div>
                  <strong style={{display:'block',fontSize:14}}>{answer.booking.owner} · {answer.booking.dogs}</strong>
                  <span style={{display:'block',marginTop:4,fontSize:12,color:'#566071'}}>{plannerDayLabel(answer.booking.targetDate)} · {displayClockTime(answer.booking.suggestedTime)} · {answer.booking.targetGroomer}</span>
                </div>
                {answer.booking.existingDate && <div className="schedule-check warning" style={{margin:0}}><div className="schedule-check-title">Already on the schedule</div><div>{answer.booking.owner} also has an active appointment {plannerDayLabel(answer.booking.existingDate)}. Use “move” if you meant to replace that appointment.</div></div>}
                {(answer.booking.warnings || []).length>0 ? <div className="schedule-check warning" style={{margin:0}}>{(answer.booking.warnings || []).map((warning,index)=><div key={index}>• {warning}</div>)}</div> : !viewerMode ? <button type="button" className="login-button" onClick={confirmBettyBooking}>Review appointment</button> : <div className="prototype-note">Viewer mode is read-only.</div>}
                <div className="prototype-note">Review appointment opens Add Appointment with the client, date, groomer, and suggested time filled in. Nothing is saved until you tap Add appointment.</div>
              </div>
            ) : answer.mode==='schedule_list' ? (
              <div style={{display:'grid',gap:8,marginTop:10}}>
                {(answer.scheduleItems || []).length===0 ? <div className="prototype-note">No appointments are scheduled for that period.</div> : (answer.scheduleItems || []).map((item,index)=><div key={`${item.date}-${item.time}-${item.owner}-${index}`} style={{padding:'10px 12px',border:'1px solid #e6e8ed',borderRadius:12,background:'#f8f9fb'}}><strong style={{display:'block',fontSize:13}}>{plannerDayLabel(item.date)} · {displayClockTime(item.time)}</strong><span style={{display:'block',marginTop:3,fontSize:12,color:'#566071'}}>{item.owner} · {item.dogs}</span><span style={{display:'block',marginTop:2,fontSize:11,color:'#7b828e'}}>{[item.groomer,item.area,item.confirmation,item.price?`$${Math.round(item.price)}`:''].filter(Boolean).join(' · ')}</span></div>)}
              </div>
            ) : answer.mode==='reschedule' ? (
              <div style={{display:'grid',gap:10,marginTop:10}}>
                <div style={{padding:'12px',border:'1px solid #e6e8ed',borderRadius:12,background:'#f8f9fb'}}>
                  <div style={{fontSize:12,color:'#7b828e',marginBottom:7}}>CURRENT</div>
                  <strong style={{display:'block',fontSize:14}}>{answer.reschedule.owner} · {answer.reschedule.dogs}</strong>
                  <span style={{display:'block',marginTop:4,fontSize:12,color:'#566071'}}>{plannerDayLabel(answer.reschedule.sourceDate)} · {displayClockTime(answer.reschedule.targetTime)} · {answer.reschedule.targetGroomer}</span>
                </div>
                <div style={{padding:'12px',border:'1px solid #cfe0d4',borderRadius:12,background:'#f1faf3'}}>
                  <div style={{fontSize:12,color:'#4f7b5e',marginBottom:7}}>PROPOSED MOVE</div>
                  <strong style={{display:'block',fontSize:14}}>{plannerDayLabel(answer.reschedule.targetDate)}</strong>
                  <span style={{display:'block',marginTop:4,fontSize:12,color:'#566071'}}>{displayClockTime(answer.reschedule.targetTime)} · {answer.reschedule.targetGroomer}</span>
                </div>
                {(answer.reschedule.ruleWarnings || []).length>0 ? (
                  <div className="schedule-check warning" style={{margin:0}}>
                    <div className="schedule-check-title">Needs manual review</div>
                    {(answer.reschedule.ruleWarnings || []).map((warning,index)=><div key={index}>• {warning}</div>)}
                    <div style={{marginTop:6}}>Betty will not override your standing scheduling rules automatically.</div>
                  </div>
                ) : !viewerMode ? (
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:9}}>
                    <button type="button" className="login-button" disabled={loading} onClick={confirmBettyReschedule}>{loading?'Moving…':'Confirm move'}</button>
                    <button type="button" className="ghost" disabled={loading} onClick={()=>{const reply='Okay — I did not move it.';setConversation(current=>[...current,{role:'user',text:'Cancel move'},{role:'assistant',text:reply}].slice(-16));setAnswer({mode:'ai',title:'Betty',text:reply,targetDate:'',filters:{},candidates:[],summary:''})}}>Cancel</button>
                  </div>
                ) : (
                  <div className="prototype-note">Viewer mode is read-only, so the move cannot be saved.</div>
                )}
              </div>
            ) : answer.mode==='ai' ? (
              <div style={{display:'grid',gap:8,marginTop:10}}>
                {(conversation.length?conversation.slice(-8):[{role:'assistant',text:answer.text || 'Betty did not return an answer.'}]).map((message,index)=>(
                  <div key={`${message.role}-${index}`} style={{display:'flex',justifyContent:message.role==='user'?'flex-end':'flex-start'}}>
                    <div style={{maxWidth:'88%',padding:'10px 12px',border:'1px solid #e6e8ed',borderRadius:12,background:message.role==='user'?'#eef2fb':'#f8f9fb',fontSize:13,lineHeight:1.5,color:'#2f3748',whiteSpace:'pre-wrap'}}>
                      {message.text}
                    </div>
                  </div>
                ))}
              </div>
            ) : answer.mode==='brief' ? (
              <div style={{display:'grid',gap:8,marginTop:10}}>
                {(answer.brief || []).map(item=>(
                  <div key={item.label} style={{display:'grid',gridTemplateColumns:'1fr auto',gap:10,alignItems:'center',padding:'11px 12px',border:'1px solid #e6e8ed',borderRadius:12,background:item.tone==='warn'?'#fff9ec':item.tone==='good'?'#effaf2':'#f8f9fb'}}>
                    <div><strong style={{display:'block',fontSize:13}}>{item.label}</strong><span style={{fontSize:11,color:'#7b828e'}}>{item.detail}</span></div>
                    <strong style={{fontSize:18,color:item.tone==='warn'?'#8a651e':item.tone==='good'?'#267447':'#172038'}}>{item.value}</strong>
                  </div>
                ))}
                <div className="prototype-note" style={{marginTop:2}}>Tap another Betty prompt for the actual client list, route fit, pricing, or rebooking suggestions.</div>
              </div>
            ) : answer.candidates.length===0 ? (
              <div className="prototype-note">I couldn't find an unbooked client that matches those filters right now. Try widening the area, price, service length, or day.</div>
            ) : (
              <div className="candidate-list">
                {answer.candidates.map((candidate,index)=>{
                  const dogsLabel = candidate.rows.map(row=>String(row?.dog || row?.Dog || '').trim()).filter(Boolean).join(' + ')
                  const routeText = candidate.routeInfo?.unavailable
                    ? candidate.routeInfo.label
                    : candidate.routeInfo
                      ? `${candidate.routeInfo.label} · adds about ${Math.round(candidate.routeInfo.addedMinutes)} min${candidate.routeInfo.addedMiles>=0.1?` · ${candidate.routeInfo.addedMiles.toFixed(1)} mi`:''}`
                      : ''
                  return (
                    <button className="candidate" key={candidate.key} type="button" onClick={()=>choose(candidate)} style={{textAlign:'left',width:'100%',cursor:'pointer'}}>
                      <div className="candidate-rank">{index+1}</div>
                      <div className="candidate-main">
                        <strong>{candidate.owner} · {dogsLabel}</strong>
                        {answer.mode==='price' ? (
                          <>
                            {(candidate.pricingBreakdown || []).map(item=><span key={`${candidate.key}-${item.dog}-${item.service}`}>{item.dog}: {item.service} · {item.price>0?`$${Math.round(item.price)}`:'price not saved'}{item.minutes>0?` · ${Math.round(item.minutes)} min`:''}</span>)}
                          </>
                        ) : answer.mode==='confirmation' ? (
                          <span>{candidate.confirmation} · {plannerDayLabel(candidate.date)} · {displayClockTime(candidate.time)}</span>
                        ) : (
                          <span>{candidate.due.detail} · {candidate.area || 'Area not set'} · {candidate.minutes} min</span>
                        )}
                        {answer.targetDate && <span>{candidate.targetGroomer}{candidate.suggestedTime?` · ${displayClockTime(candidate.suggestedTime)}`:' · choose time manually'}</span>}
                        {routeText && <span style={{fontWeight:candidate.routeInfo?.routeRisk?800:700,color:candidate.routeInfo?.routeRisk?'#9a5d19':undefined}}>{routeText}</span>}
                        {candidate.routeInfo?.routeRisk && candidate.routeInfo.risks?.[0] && <span style={{color:'#9a5d19'}}>⚠ {candidate.routeInfo.risks[0]}</span>}
                      </div>
                      <div className="candidate-price">{answer.mode==='confirmation' ? candidate.confirmation : (answer.mode==='price' && candidate.price<=0?'—':`$${candidate.price}`)}</div>
                    </button>
                  )
                })}
              </div>
            )}
            {!['brief','ai','booking','schedule_list','reschedule'].includes(answer.mode) && answer.candidates.length>0 && answer.targetDate && <div className="prototype-note" style={{marginTop:10}}>Tap a client to open Add Appointment with the day, client, groomer, and suggested time filled in. You can review everything before saving.</div>}
            {!['brief','ai','booking','schedule_list','reschedule'].includes(answer.mode) && answer.candidates.length>0 && !answer.targetDate && answer.filters?.unbookedOnly && <div className="prototype-note" style={{marginTop:10}}>Tap a client to rebook them. Add Appointment will open with the client already selected; you can change the date, groomer, time, and services before saving.</div>}
            {answer.mode==='price' && answer.candidates.length>0 && !answer.targetDate && <div className="prototype-note" style={{marginTop:10}}>Tap the client to open their full Client Details.</div>}
            {answer.candidates.length>0 && answer.mode==='confirmation' && <div className="prototype-note" style={{marginTop:10}}>These appointments are not confirmed yet. Use the confirmation control on Week or Today to mark Confirmed, Needs reply, or Can’t make it.</div>}
            {!['brief','ai','booking','schedule_list','reschedule','price','confirmation'].includes(answer.mode) && answer.candidates.length>0 && !answer.targetDate && !answer.filters?.unbookedOnly && <div className="prototype-note" style={{marginTop:10}}>Tap any client to open their details. Ask with a day, like “Who should I add Thursday?”, to get appointment-ready suggestions.</div>}
          </div>
        )}
        <div style={{position:'sticky',bottom:0,zIndex:8,background:'linear-gradient(180deg,rgba(255,255,255,0) 0%,#fff 18%,#fff 100%)',padding:'18px 0 max(10px, env(safe-area-inset-bottom))',marginTop:10}}>
          <div className="ai-input" style={{margin:0,boxShadow:'0 -8px 20px rgba(23,32,56,.05)'}}>
            <input
              value={text}
              disabled={loading}
              onChange={e=>setText(e.target.value)}
              onFocus={()=>{ setTimeout(()=>scrollBettyToBottom('smooth'),300) }}
              onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();run()}}}
              placeholder='Message Betty…'
            />
            <button disabled={loading || !text.trim()} onClick={()=>run()}>Send</button>
          </div>
        </div>
        <div className="prototype-note" style={{marginTop:4,textAlign:'left'}}>Betty reads your current clients and schedule. Tap X when you want to end and clear this conversation.</div>
      </div>
    </div>
  )
}

export default AssistantSheet
