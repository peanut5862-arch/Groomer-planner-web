const day = value => new Date(`${value}T12:00:00Z`)
export const addDays = (value,n) => {const d=day(value);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
export function horizonDate(today){const d=day(today);const date=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+3);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(date,last));return d.toISOString().slice(0,10)}
const norm = value => String(value || '').trim().toLowerCase()
const minutes = value => {const m=/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(String(value || '').trim());if(!m)return NaN;let h=Number(m[1]);if(m[3])h=h%12+(m[3].toUpperCase()==='PM'?12:0);return h*60+Number(m[2])}
const clock = value => `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`
export function proposeRecurring({today,clients,events,groomers,buffer=0}){
 const until=horizonDate(today),from=addDays(today,1),proposals=[],issues=[],rules=new Map(),occupied=new Map()
 for(const e of events){if(!e.active)continue;const key=`${e.groomer}|${norm(e.area)}`;if(e.area && e.date>=addDays(today,-84)){const weekdays=rules.get(key)||new Map();const wd=day(e.date).getUTCDay();weekdays.set(wd,(weekdays.get(wd)||0)+1);rules.set(key,weekdays)}
  const slot=minutes(e.time);if(e.date>=from){const k=`${e.date}|${e.groomer}`,list=occupied.get(k)||[];list.push(Number.isFinite(slot)&&e.duration>0?{start:slot,end:slot+e.duration}:{start:0,end:1440});occupied.set(k,list)}
 }
 const tasks=[],seenClients=new Set()
 for(const c of clients){
  const clientKey=`${c.household}|${norm(c.dog)}`;if(seenClients.has(clientKey))continue;seenClients.add(clientKey)
  const g=groomers.find(g=>g.active!==false&&g.name===c.groomer),weekdays=rules.get(`${c.groomer}|${norm(c.area)}`)
  const reason=c.paused?'Client is paused or inactive.':!c.household?'Missing client ID.':!c.area?'Missing area.':!g?'Choose an active assigned groomer.':!c.frequency || c.frequency<1?'Missing grooming frequency.':!c.duration || c.duration<1?'Missing service length.':!c.service?'Choose a recurring service.':!weekdays?.size?'No area weekday found in the existing schedule.':''
  if(reason){issues.push({owner:c.owner,dog:c.dog,reason});continue}
  const history=events.filter(e=>e.active && e.household===c.household && e.dogs.some(d=>norm(d)===norm(c.dog))).sort((a,b)=>a.date.localeCompare(b.date))
  const last=history.at(-1)?.date;let due=last?addDays(last,Math.round(c.frequency*7)):c.due
  if(!due){issues.push({owner:c.owner,dog:c.dog,reason:'No service history or next due date.'});continue}
  tasks.push({c,g,weekdays,due:due<from?from:due})
 }
 while(tasks.length){tasks.sort((a,b)=>a.due.localeCompare(b.due)||a.c.owner.localeCompare(b.c.owner)||a.c.dog.localeCompare(b.c.dog));const t=tasks.shift();if(t.due>until)continue
  const {c,g,weekdays}=t;let chosen=null
  const dates=Array.from({length:8},(_,i)=>addDays(t.due,i)).filter(d=>d<=until&&g.workDays.includes(day(d).getUTCDay())&&weekdays.has(day(d).getUTCDay()))
  dates.sort((a,b)=> (events.some(e=>e.active&&e.date===b&&e.groomer===g.name&&norm(e.area)===norm(c.area))?1:0)-(events.some(e=>e.active&&e.date===a&&e.groomer===g.name&&norm(e.area)===norm(c.area))?1:0)||a.localeCompare(b))
  for(const date of dates){const slots=[...(occupied.get(`${date}|${g.name}`)||[])].sort((a,b)=>a.start-b.start);let start=minutes(g.startTime),end=minutes(g.endTime);if(!Number.isFinite(start)||!Number.isFinite(end))continue
   for(const slot of slots){if(start+c.duration+buffer<=slot.start)break;start=Math.max(start,slot.end+buffer)}
   if(start+c.duration<=end){chosen={date,time:clock(start)};break}
  }
  if(!chosen){issues.push({owner:c.owner,dog:c.dog,reason:`No opening on the usual area days near ${t.due}.`});continue}
  const id=`recurring:${c.household}:${norm(c.dog)}:${t.due}`
  proposals.push({...c,...chosen,id,due:t.due});const k=`${chosen.date}|${g.name}`,slots=occupied.get(k)||[],start=minutes(chosen.time);slots.push({start,end:start+c.duration});occupied.set(k,slots)
  tasks.push({...t,due:addDays(chosen.date,Math.round(c.frequency*7))})
 }
 // Dogs due on the same day for one household are one stop.
 const groups=new Map();for(const p of proposals){const key=`${p.household}|${p.date}|${p.groomer}`;const group=[...groups.values()].find(v=>v.household===p.household&&v.date===p.date&&v.groomer===p.groomer&&minutes(v.time)+v.duration===minutes(p.time));if(group && minutes(group.time)+group.duration===minutes(p.time)){group.dogs.push({dog:p.dog,service:p.service});group.duration+=p.duration;group.price+=p.price;group.ids.push(p.id)}else groups.set(key+':'+p.time,{...p,dogs:[{dog:p.dog,service:p.service}],ids:[p.id]})}
 return {from,until,appointments:[...groups.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)),issues}
}
