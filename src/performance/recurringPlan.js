import {dueFromCompletedService} from './recurringRebuild.js'
import {timeOffReason} from './timeOff.js'
const day = value => new Date(`${value}T12:00:00Z`)
export const addDays = (value,n) => {const d=day(value);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
export function horizonDate(today){const d=day(today);const date=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+3);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(date,last));return d.toISOString().slice(0,10)}
const norm = value => String(value || '').trim().toLowerCase()
// Keep each saved service area on its own route day.
const areaDayKey = value => norm(value)
const minutes = value => {const m=/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(String(value || '').trim());if(!m)return NaN;let h=Number(m[1]);if(m[3])h=h%12+(m[3].toUpperCase()==='PM'?12:0);return h*60+Number(m[2])}
const clock = value => `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`
export function proposeRecurring({today,clients,events,groomers,buffer=0,returnHome={},requireReturnHome=false,timeOff=[],rebuild=false}){
 const until=horizonDate(today),from=addDays(today,1),proposals=[],issues=[],occupied=new Map()
 for(const e of events){if(!e.active)continue;
  const slot=minutes(e.time);if(e.date>=from){const k=`${e.date}|${e.groomer}`,list=occupied.get(k)||[];list.push(Number.isFinite(slot)&&e.duration>0?{start:slot,end:slot+e.duration,household:e.household}:{start:0,end:1440});occupied.set(k,list)}
 }
 const tasks=[],seenClients=new Set(),householdAssignments=new Map()
 for(const original of clients){
  const c={...original}
  if(!c.service){
   const previous=events.filter(e=>e.active&&e.household===c.household&&e.duration>0&&e.dogs.some(d=>norm(d)===norm(c.dog))).sort((a,b)=>a.date.localeCompare(b.date)).at(-1)
   c.service='To confirm';c.servicePending=true;c.price=0
   c.duration=previous?Math.ceil(previous.duration/Math.max(1,previous.dogs.length)):(c.duration>0?c.duration:60)
  }
  const clientKey=`${c.household}|${norm(c.dog)}`;if(seenClients.has(clientKey))continue;seenClients.add(clientKey)
  const either=!norm(c.groomer)||norm(c.groomer)==='either'
  const eligible=groomers.filter(g=>g.active!==false&&(either||g.name===c.groomer))
  const options=eligible.map(g=>({g,weekdays:new Map(g.workDays.map(wd=>[wd,1]))}))
  const reason=c.paused?'Client is paused or inactive.':!c.household?'Missing client ID.':!c.area?'Missing area.':!eligible.length?'Choose an active assigned groomer.':!c.frequency || c.frequency<1?'Missing grooming frequency.':!c.duration || c.duration<1?'Missing service length.':!c.service?'Choose a recurring service.':!options.length?'No working day available for an active groomer.':''
  if(reason){issues.push({owner:c.owner,dog:c.dog,reason});continue}
  const history=events.filter(e=>e.active && e.household===c.household && e.dogs.some(d=>norm(d)===norm(c.dog))).sort((a,b)=>a.date.localeCompare(b.date))
  const completedDue=dueFromCompletedService(c,events,today)
  if(!completedDue){issues.push({owner:c.owner,dog:c.dog,reason:'No service history or next due date.'});continue}
  const interval=Math.round(c.frequency*7)
  const cycleIndex=date=>Math.round((day(date)-day(completedDue))/86400000/interval)
  const anchors=history.filter(event=>event.date>=from)
  const bookedCycles=new Set(anchors.map(event=>{
   const prefix=`recurring:${c.household}:${norm(c.dog)}:`
   const id=(event.sourceRow?.['Recurring IDs'] || []).find?.(value=>String(value).startsWith(prefix))
   const originalDue=String(id || '').match(/(\d{4}-\d{2}-\d{2})$/)?.[1]
   return (originalDue || event.date)<completedDue?-1:cycleIndex(originalDue || event.date)
  }).filter(index=>index>=0))
  const normalizeDue=date=>{
   let next=date
   while(addDays(next,interval)<from)next=addDays(next,interval)
   // Advance by the completed-service cycle, never by a moved appointment.
   while(bookedCycles.has(cycleIndex(next)))next=addDays(next,interval)
   return next
  }
  tasks.push({c,options,either,anchors:[],normalizeDue,completedDue,due:normalizeDue(completedDue)})
 }
 while(tasks.length){tasks.sort((a,b)=>a.due.localeCompare(b.due)||a.c.owner.localeCompare(b.c.owner)||a.c.dog.localeCompare(b.c.dog));const t=tasks.shift();if(t.due>until)continue
  const {c,options,either}=t;let chosen=null
  // Same-frequency household dogs share a visit by default when their
  // due windows align. Keep offset rotations and different frequencies separate.
  const visit=[t]
  let sharedOptions=options
  for(const other of tasks){
   if(other.c.household!==c.household || other.c.frequency!==c.frequency || norm(other.c.area)!==norm(c.area) || other.due>addDays(t.due,7))continue
   const common=sharedOptions.filter(o=>other.options.some(candidate=>candidate.g.name===o.g.name))
   if(common.length){visit.push(other);sharedOptions=common}
  }
  for(const sibling of visit.slice(1))tasks.splice(tasks.indexOf(sibling),1)
  const visitDue=visit.map(item=>item.due).sort().at(-1)
  const required=visit.reduce((sum,item)=>sum+item.c.duration,0)
  const assignmentKey=`${c.household}|${visitDue}`,assigned=householdAssignments.get(assignmentKey)
  const holiday=timeOff.find(item=>!item.groomerId&&item.start<=visitDue&&item.end>=visitDue)
  const candidateDates=holiday?Array.from({length:14},(_,i)=>addDays(holiday.start,-i-1)):Array.from({length:8},(_,i)=>addDays(visitDue<from?from:visitDue,i))
  const candidates=[]
  for(const {g,weekdays} of sharedOptions){
   if(either && assigned && assigned!==g.name)continue
   for(const date of candidateDates){
    const wd=day(date).getUTCDay()
    if(date<from)continue
    if(visit.some(item=>date<addDays(item.completedDue,holiday?-14:0)))continue
    if(visit.some(item=>{const minimum=Math.max(7,Math.round(item.c.frequency*7)-(holiday?14:0));return [...events.filter(e=>e.active&&e.date>=from),...proposals].some(other=>other.household===item.c.household&&(other.dogs||[other.dog]).some(dog=>norm(typeof dog==='string'?dog:dog.dog)===norm(item.c.dog))&&Math.abs((day(other.date)-day(date))/86400000)<minimum)}))continue
    if(timeOffReason({timeOff},g,date) || date>until || !g.workDays.includes(wd) || !weekdays.has(wd))continue
    if(visit.some(item=>item.anchors.some(anchor=>anchor>=item.due && date>addDays(anchor,-Math.round(item.c.frequency*7)))))continue
    const existingAreas=[...events.filter(e=>e.active),...proposals].filter(e=>e.date===date&&norm(e.groomer)===norm(g.name)).map(e=>areaDayKey(e.area))
    if(existingAreas.some(area=>area!==areaDayKey(c.area)))continue
    const slots=[...(occupied.get(`${date}|${g.name}`)||[])].sort((a,b)=>a.start-b.start)
    let start=minutes(g.startTime),end=minutes(g.endTime)
    if(!Number.isFinite(start)||!Number.isFinite(end))continue
    const home=returnHome[`${c.household}|${g.name}`]
    if(requireReturnHome && !Number.isFinite(home))continue
    const returnMinutes=Number.isFinite(home)?Math.ceil(home):0
    const last=slots.at(-1)
    if(last){const lastHome=returnHome[`${last.household}|${g.name}`];if(requireReturnHome&&!Number.isFinite(lastHome))continue;if(last.end+Math.ceil(lastHome||0)>end)continue}
    for(const slot of slots){if(start+required+buffer<=slot.start)break;start=Math.max(start,slot.end+buffer)}
    if(start+required+returnMinutes>end)continue
    const sameArea=[...events.filter(e=>e.active),...proposals].filter(e=>e.date===date&&norm(e.groomer)===norm(g.name)&&norm(e.area)===norm(c.area)).length
    const load=slots.reduce((sum,slot)=>sum+slot.end-slot.start,0)
    candidates.push({date,time:clock(start),groomer:g.name,sameArea,weekdayStrength:weekdays.get(wd),load,returnMinutes,homeBy:g.endTime})
   }
  }
  candidates.sort((a,b)=>b.sameArea-a.sameArea || (holiday?b.date.localeCompare(a.date):a.date.localeCompare(b.date)) || b.weekdayStrength-a.weekdayStrength || a.load-b.load || a.groomer.localeCompare(b.groomer))
  chosen=candidates[0]
  if(!chosen){for(const item of visit){issues.push({owner:item.c.owner,dog:item.c.dog,reason:`No matching area-day opening that allows the drive home by the end time near ${item.due}.`});tasks.push({...item,due:item.normalizeDue(addDays(item.due,Math.round(item.c.frequency*7)))})}continue}
  let visitStart=minutes(chosen.time)
  for(const item of visit){
   const dog=item.c,id=`recurring:${dog.household}:${norm(dog.dog)}:${item.due}`
   if(item.either)householdAssignments.set(`${dog.household}|${item.due}`,chosen.groomer)
   proposals.push({...dog,...chosen,time:clock(visitStart),id,due:item.due,assignmentReason:item.either?'Suggested to group matching areas with available space.':''})
   visitStart+=dog.duration
   tasks.push({...item,due:item.normalizeDue(addDays(item.due,Math.round(dog.frequency*7)))})
  }
  const k=`${chosen.date}|${chosen.groomer}`,slots=occupied.get(k)||[],start=minutes(chosen.time)
  slots.push({start,end:start+required,household:c.household});occupied.set(k,slots)
 }
 // Dogs due on the same day for one household are one stop.
 const groups=new Map();for(const p of proposals){const key=`${p.household}|${p.date}|${p.groomer}`;const group=[...groups.values()].find(v=>v.household===p.household&&v.date===p.date&&v.groomer===p.groomer&&minutes(v.time)+v.duration===minutes(p.time));if(group && minutes(group.time)+group.duration===minutes(p.time)){group.dogs.push({dog:p.dog,service:p.service});group.duration+=p.duration;group.price+=p.price;group.ids.push(p.id);group.servicePending=Boolean(group.servicePending||p.servicePending)}else groups.set(key+':'+p.time,{...p,dogs:[{dog:p.dog,service:p.service}],ids:[p.id]})}
 return {from,until,appointments:[...groups.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)),issues}
}
