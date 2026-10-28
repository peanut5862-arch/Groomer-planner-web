import {earliestRecurringDate} from './recurringCadence.js'
import {addDays} from './recurringPlan.js'
import {timeOffReason} from './timeOff.js'
const norm=value=>String(value || '').trim().toLowerCase()
const minute=value=>{const m=/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(String(value || '').trim());if(!m)return NaN;let h=+m[1];if(m[3])h=h%12+(m[3].toUpperCase()==='PM'?12:0);return h*60+(+m[2])}
const weekOf=date=>{const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10)}
const sameClient=(a,b)=>a.household&&b.household?a.household===b.household:norm(a.owner)===norm(b.owner)
const clock=value=>`${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`
export function proposeAreaRepair({today,events,groomers,clients=[],returnHome={},timeOff=[],buffer=0,until='9999-12-31'}) {
  let active=events.filter(e=>e.active&&e.date>today).map((e,index)=>({...e,repairKey:index}))
  const movable=e=>e.sourceRow && !e.sourceRow['Locked Time'] && !/completed/i.test(e.sourceRow['Completion Status'] || '') && !/^(confirmed|yes)$/i.test(String(e.sourceRow['Client Confirmation'] || '').trim()) && (Array.isArray(e.sourceRow['Recurring IDs']) || /^Recurring draft/i.test(e.sourceRow['Status Note'] || ''))
  const groups=new Map(),issues=[]
  let moves=[]
  for(const event of active.filter(e=>movable(e)&&e.date<=until)) {
    const areas=new Set(active.filter(other=>other.date===event.date&&other.groomer===event.groomer).map(other=>norm(other.area)).filter(Boolean))
    if(areas.size<=1 && !timeOffReason({timeOff},groomers.find(g=>g.name===event.groomer),event.date) && earliestRecurringDate([event],clients,active,today)<=event.date)continue
    const key=JSON.stringify([event.household || norm(event.owner),event.date,event.groomer,norm(event.area)])
    if(!groups.has(key))groups.set(key,[])
    groups.get(key).push(event)
  }
  const relocating=new Set([...groups.values()].flat().map(e=>e.repairKey))
  active=active.filter(e=>!relocating.has(e.repairKey))
  for(const visit of [...groups.values()].sort((a,b)=>a[0].date.localeCompare(b[0].date)||norm(a[0].area).localeCompare(norm(b[0].area)))) {
    const first=visit[0]
    if(visit.length>1){issues.push({owner:first.owner,reason:'This household has separate dog appointments that need to be combined before moving together.'});active.push(...visit);continue}
    const scheduledDogs=visit.flatMap(e=>e.dogs).map(norm)
    const preferences=clients.filter(c=>(c.household===first.household || (!first.household&&norm(c.owner)===norm(first.owner)))&&scheduledDogs.includes(norm(c.dog))).map(c=>norm(c.groomer)).filter(name=>name&&name!=='either')
    const eligible=groomers.filter(g=>g.active!==false&&preferences.every(name=>name===norm(g.name)))
    const duration=visit.reduce((sum,e)=>sum+Number(e.duration || 0),0)
    if(!eligible.length || !first.area || !duration){issues.push({owner:first.owner,reason:'Needs an active groomer, area, service length, and verified drive home.'});active.push(...visit);continue}
    const cadenceFloor=earliestRecurringDate(visit,clients,[...active,...events.filter(e=>!active.some(a=>a.sourceRow===e.sourceRow))],today)
    const baseDate=cadenceFloor>first.date?cadenceFloor:first.date
    const keys=new Set(visit.map(e=>e.repairKey)),others=active.filter(e=>!keys.has(e.repairKey)),candidates=[]
    for(const g of eligible){
     const home=returnHome[`${first.household}|${g.name}`];if(!Number.isFinite(home))continue
     for(let offset=0;offset<=7;offset++) {
      const date=addDays(baseDate,offset),wd=new Date(`${date}T12:00:00Z`).getUTCDay()
      if(!g.workDays.includes(wd)||timeOffReason({timeOff},g,date))continue
      if(others.some(e=>sameClient(e,first)&&weekOf(e.date)===weekOf(date)))continue
      const sameDay=others.filter(e=>e.date===date&&e.groomer===g.name)
      // Unknown or mixed areas must be reviewed, never treated as open capacity.
      if(sameDay.some(e=>!e.area || norm(e.area)!==norm(first.area)))continue
      const slots=sameDay.map(e=>({start:minute(e.time),end:minute(e.time)+Number(e.duration),household:e.household})).sort((a,b)=>a.start-b.start)
      if(slots.some(slot=>!Number.isFinite(slot.start)||!Number.isFinite(slot.end)||slot.end<=slot.start))continue
      let start=minute(g.startTime),end=minute(g.endTime)
      if(!Number.isFinite(start)||!Number.isFinite(end))continue
      // Keep time on a valid original day when that visit can stay unchanged.
      const originalStart=Math.min(...visit.map(e=>minute(e.time)))
      const fits=time=>time>=minute(g.startTime)&&time+duration+Math.ceil(home)<=end&&slots.every(slot=>time+duration+buffer<=slot.start || time>=slot.end+buffer)
      if(offset===0&&fits(originalStart))start=originalStart
      else {for(const slot of slots){if(start+duration+buffer<=slot.start)break;start=Math.max(start,slot.end+buffer)}}
      if(!fits(start))continue
      const last=slots.at(-1)
      if(last && last.end>start+duration){const lastHome=returnHome[`${last.household}|${g.name}`];if(!Number.isFinite(lastHome)||last.end+Math.ceil(lastHome)>end)continue}
      candidates.push({date,start,groomer:g.name,sameArea:sameDay.length})
    }
    }
    candidates.sort((a,b)=>(a.date===first.date?-1:0)-(b.date===first.date?-1:0)||b.sameArea-a.sameArea||a.date.localeCompare(b.date)||(a.groomer===first.groomer?-1:0)-(b.groomer===first.groomer?-1:0))
    const chosen=candidates[0]
    if(!chosen){issues.push({owner:first.owner,reason:`No matching-area space within 7 days of ${baseDate}.`});active.push(...visit);continue}
    let start=chosen.start
    for(const event of visit.slice().sort((a,b)=>minute(a.time)-minute(b.time))) {
      const time=clock(start)
      if(event.date!==chosen.date || minute(event.time)!==start || event.groomer!==chosen.groomer)moves.push({event,date:chosen.date,time,owner:event.owner,area:event.area,groomer:chosen.groomer})
      const index=active.findIndex(e=>e.repairKey===event.repairKey)
      const placed={...event,originalDate:event.originalDate || event.date,date:chosen.date,time,groomer:chosen.groomer};if(index>=0)active[index]=placed;else active.push(placed);start+=Number(event.duration)
    }
  }
  // An unplaced visit remains on its original day. Remove dependent moves
  // until the offered subset also works with every visit that stays put.
  const maxPass=moves.length
  for(let pass=0;pass<=maxPass;pass++) {
    const projected=events.filter(e=>e.active&&e.date>today).map(event=>{const move=moves.find(m=>m.event.sourceRow===event.sourceRow);return move?{...event,date:move.date,time:move.time,groomer:move.groomer}:event})
    const invalid=new Set()
    for(const move of moves){const day=projected.filter(e=>e.date===move.date&&e.groomer===move.groomer);const slots=day.map(e=>({start:minute(e.time),end:minute(e.time)+Number(e.duration)})).sort((a,b)=>a.start-b.start)
      if(projected.some(e=>e.sourceRow!==move.event.sourceRow&&sameClient(e,move.event)&&weekOf(e.date)===weekOf(move.date))||day.some(e=>norm(e.area)!==norm(move.area))||slots.some((slot,index)=>!Number.isFinite(slot.start)||!Number.isFinite(slot.end)||(index>0&&slots[index-1].end+buffer>slot.start)))invalid.add(`${move.date}|${move.groomer}`)
    }
    if(!invalid.size)break
    const rejected=moves.filter(m=>invalid.has(`${m.date}|${m.groomer}`))
    for(const m of rejected)issues.push({owner:m.owner,reason:'This move depends on another visit that could not be placed. Review manually.'})
    moves=moves.filter(m=>!invalid.has(`${m.date}|${m.groomer}`))
  }
  const pending=[...moves],ordered=[]
  let current=events.filter(e=>e.active&&e.date>today).slice()
  while(pending.length){
    const index=pending.findIndex(move=>!validateRepairSelection(current,[move],buffer))
    if(index<0){for(const move of pending)issues.push({owner:move.owner,reason:'Needs coordinated moves with another appointment. Review manually.'});break}
    const [move]=pending.splice(index,1);ordered.push(move)
    current=current.map(event=>event.sourceRow===move.event.sourceRow?{...event,date:move.date,time:move.time,groomer:move.groomer}:event)
  }
  moves=ordered
  const conflicts=[],byDay=new Map()
  for(const event of events.filter(e=>e.active&&e.date>today)){const move=moves.find(m=>m.event.sourceRow===event.sourceRow),e=move?{...event,date:move.date,groomer:move.groomer}:event;const key=`${e.date}|${e.groomer}`;if(!byDay.has(key))byDay.set(key,new Set());if(e.area)byDay.get(key).add(e.area)}
  for(const [key,areas] of byDay)if(areas.size>1)conflicts.push({key,areas:[...areas]})
  return {moves,issues,conflicts}
}

export function validateRepairSelection(events,moves,buffer=0) {
  const projected=events.filter(e=>e.active).map(event=>{const move=moves.find(m=>m.event.sourceRow===event.sourceRow);return move?{...event,date:move.date,time:move.time,groomer:move.groomer}:event})
  for(const move of moves){
    if(projected.some(e=>e.sourceRow!==move.event.sourceRow&&sameClient(e,move.event)&&weekOf(e.date)===weekOf(move.date)))return 'This household already has another active appointment in the proposed week. Rebuild the review.'
    const day=projected.filter(e=>e.date===move.date&&e.groomer===move.groomer)
    if(day.some(e=>norm(e.area)!==norm(move.area)))return 'Some selected moves depend on other moves. Keep the complete proposal selected or rebuild the review.'
    const slots=day.map(e=>({start:minute(e.time),end:minute(e.time)+Number(e.duration)})).sort((a,b)=>a.start-b.start)
    if(slots.some((slot,index)=>!Number.isFinite(slot.start)||!Number.isFinite(slot.end)||(index>0&&slots[index-1].end+buffer>slot.start)))return 'The selected moves leave a time overlap. Keep the complete proposal selected or rebuild the review.'
  }
  return ''
}
