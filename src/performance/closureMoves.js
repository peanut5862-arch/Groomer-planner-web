import {addDays,horizonDate} from './recurringPlan.js'
import {timeOffReason} from './timeOff.js'
const norm=value=>String(value || '').trim().toLowerCase()
const minute=value=>{const match=/^(\d{1,2}):(\d{2})$/.exec(value || '');return match?+match[1]*60+(+match[2]):NaN}
const clock=value=>`${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`
export function proposeClosureMoves({today,events,clients,groomers,timeOff=[],returnHome={},buffer=0}) {
 const settings={timeOff},groups=new Map(),issues=[]
 const affected=events.filter(event=>event.active&&event.date>=today&&event.date<=horizonDate(today)&&!/completed/i.test(event.sourceRow?.['Completion Status'] || '')&&timeOffReason(settings,groomers.find(g=>g.name===event.groomer),event.date))
 for(const event of affected){const key=JSON.stringify([event.household||norm(event.owner),event.date,event.groomer]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(event)}
 const occupied=events.filter(event=>event.active&&!affected.includes(event)).slice(),moves=[]
 for(const visit of [...groups.values()].sort((a,b)=>a[0].date.localeCompare(b[0].date)||b.reduce((n,e)=>n+e.duration,0)-a.reduce((n,e)=>n+e.duration,0))){
  const first=visit[0],duration=visit.reduce((n,e)=>n+Number(e.duration),0)+Math.max(0,visit.length-1)*buffer
  if(!first.area||visit.some(event=>norm(event.area)!==norm(first.area))||!Number.isFinite(duration)||duration<=0){issues.push({owner:first.owner,reason:'Check the household’s area and service time.'});continue}
  const names=visit.flatMap(event=>event.dogs).map(norm)
  const profiles=clients.filter(client=>(first.household?client.household===first.household:norm(client.owner)===norm(first.owner))&&names.includes(norm(client.dog)))
  const preferences=profiles.map(client=>norm(client.groomer)).filter(value=>value&&value!=='either')
  const choices=groomers.filter(g=>g.active!==false&&preferences.every(value=>value===norm(g.name))&&(names.every(name=>profiles.some(profile=>norm(profile.dog)===name))?true:g.name===first.groomer))
  let chosen=null
  for(let offset=1;offset<=21&&!chosen;offset++)for(const groomer of [...choices].sort((a,b)=>(a.name===first.groomer?-1:0)-(b.name===first.groomer?-1:0))){
   const date=addDays(first.date,offset),weekday=new Date(`${date}T12:00:00Z`).getUTCDay()
   if(!groomer.workDays.includes(weekday)||timeOffReason(settings,groomer,date))continue
   const home=returnHome[`${first.household}|${groomer.name}`];if(!Number.isFinite(home))continue
   const day=occupied.filter(event=>event.date===date&&event.groomer===groomer.name)
   if(day.some(event=>!event.area||norm(event.area)!==norm(first.area)))continue
   const slots=day.map(event=>({start:minute(event.time),end:minute(event.time)+Number(event.duration),household:event.household})).sort((a,b)=>a.start-b.start)
   if(slots.some(slot=>!Number.isFinite(slot.start)||!Number.isFinite(slot.end)||slot.end<=slot.start))continue
   let start=minute(groomer.startTime),end=minute(groomer.endTime)
   const fits=time=>time>=minute(groomer.startTime)&&time+duration+Math.ceil(home)<=end&&slots.every(slot=>time+duration+buffer<=slot.start||time>=slot.end+buffer)
   const original=Math.min(...visit.map(event=>minute(event.time)))
   if(fits(original))start=original;else for(const slot of slots){if(start+duration+buffer<=slot.start)break;start=Math.max(start,slot.end+buffer)}
   if(!fits(start))continue
   const last=slots.at(-1);if(last&&last.end>start+duration){const lastHome=returnHome[`${last.household}|${groomer.name}`];if(!Number.isFinite(lastHome)||last.end+Math.ceil(lastHome)>end)continue}
   // Never duplicate the same dog's other booking on the proposed date.
   if(occupied.some(event=>event.date===date&&(first.household?event.household===first.household:norm(event.owner)===norm(first.owner))&&event.dogs.some(dog=>names.includes(norm(dog)))))continue
   chosen={date,time:clock(start),groomer:groomer.name};break
  }
  if(!chosen){issues.push({owner:first.owner,reason:'No safe matching-area opening within 21 days after the closed date.'});continue}
  let start=minute(chosen.time)
  for(const event of visit.slice().sort((a,b)=>minute(a.time)-minute(b.time))){const move={event,date:chosen.date,time:clock(start),groomer:chosen.groomer};moves.push(move);occupied.push({...event,...chosen,time:move.time});start+=Number(event.duration)+buffer}
 }
 return {moves,issues,affected}
}
