import {addDays} from './recurringPlan.js'
import {timeOffReason} from './timeOff.js'
const norm=value=>String(value || '').trim().toLowerCase()
const minute=value=>{const m=/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(String(value || '').trim());if(!m)return NaN;let h=+m[1];if(m[3])h=h%12+(m[3].toUpperCase()==='PM'?12:0);return h*60+(+m[2])}
const clock=value=>`${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`
export function proposeAreaRepair({today,events,groomers,clients=[],returnHome={},timeOff=[],buffer=0,until='9999-12-31'}) {
  const active=events.filter(e=>e.active&&e.date>today).map((e,index)=>({...e,repairKey:index}))
  const movable=e=>e.sourceRow && !e.sourceRow['Locked Time'] && !/completed/i.test(e.sourceRow['Completion Status'] || '') && !/^(confirmed|yes)$/i.test(String(e.sourceRow['Client Confirmation'] || '').trim()) && (Array.isArray(e.sourceRow['Recurring IDs']) || /^Recurring draft/i.test(e.sourceRow['Status Note'] || ''))
  const groups=new Map(),issues=[],moves=[]
  for(const event of active.filter(e=>movable(e)&&e.date<=until)) {
    const areas=new Set(active.filter(other=>other.date===event.date&&other.groomer===event.groomer).map(other=>norm(other.area)).filter(Boolean))
    if(areas.size<=1 && !timeOffReason({timeOff},groomers.find(g=>g.name===event.groomer),event.date))continue
    const key=JSON.stringify([event.household || norm(event.owner),event.date,event.groomer,norm(event.area)])
    if(!groups.has(key))groups.set(key,[])
    groups.get(key).push(event)
  }
  for(const visit of [...groups.values()].sort((a,b)=>a[0].date.localeCompare(b[0].date)||norm(a[0].area).localeCompare(norm(b[0].area)))) {
    const first=visit[0]
    const scheduledDogs=visit.flatMap(e=>e.dogs).map(norm)
    const preferences=clients.filter(c=>(c.household===first.household || (!first.household&&norm(c.owner)===norm(first.owner)))&&scheduledDogs.includes(norm(c.dog))).map(c=>norm(c.groomer)).filter(name=>name&&name!=='either')
    const eligible=groomers.filter(g=>g.active!==false&&preferences.every(name=>name===norm(g.name)))
    const duration=visit.reduce((sum,e)=>sum+Number(e.duration || 0),0)
    if(!eligible.length || !first.area || !duration){issues.push({owner:first.owner,reason:'Needs an active groomer, area, service length, and verified drive home.'});continue}
    const keys=new Set(visit.map(e=>e.repairKey)),others=active.filter(e=>!keys.has(e.repairKey)),candidates=[]
    for(const g of eligible){
     const home=returnHome[`${first.household}|${g.name}`];if(!Number.isFinite(home))continue
     for(let offset=0;offset<=7;offset++) {
      const date=addDays(first.date,offset),wd=new Date(`${date}T12:00:00Z`).getUTCDay()
      if(!g.workDays.includes(wd)||timeOffReason({timeOff},g,date))continue
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
    if(!chosen){issues.push({owner:first.owner,reason:`No matching-area space within 7 days of ${first.date}.`});continue}
    let start=chosen.start
    for(const event of visit.slice().sort((a,b)=>minute(a.time)-minute(b.time))) {
      const time=clock(start)
      if(event.date!==chosen.date || minute(event.time)!==start || event.groomer!==chosen.groomer)moves.push({event,date:chosen.date,time,owner:event.owner,area:event.area,groomer:chosen.groomer})
      const index=active.findIndex(e=>e.repairKey===event.repairKey)
      active[index]={...event,date:chosen.date,time,groomer:chosen.groomer};start+=Number(event.duration)
    }
  }
  const conflicts=[]
  const byDay=new Map()
  for(const e of active){const key=`${e.date}|${e.groomer}`;if(!byDay.has(key))byDay.set(key,new Set());if(e.area)byDay.get(key).add(e.area)}
  for(const [key,areas] of byDay)if(areas.size>1)conflicts.push({key,areas:[...areas]})
  return {moves,issues,conflicts}
}

export function validateRepairSelection(events,moves,buffer=0) {
  const projected=events.filter(e=>e.active).map(event=>{const move=moves.find(m=>m.event.sourceRow===event.sourceRow);return move?{...event,date:move.date,time:move.time,groomer:move.groomer}:event})
  for(const move of moves){
    const day=projected.filter(e=>e.date===move.date&&e.groomer===move.groomer)
    if(day.some(e=>norm(e.area)!==norm(move.area)))return 'Some selected moves depend on other moves. Keep the complete proposal selected or rebuild the review.'
    const slots=day.map(e=>({start:minute(e.time),end:minute(e.time)+Number(e.duration)})).sort((a,b)=>a.start-b.start)
    if(slots.some((slot,index)=>!Number.isFinite(slot.start)||!Number.isFinite(slot.end)||(index>0&&slots[index-1].end+buffer>slot.start)))return 'The selected moves leave a time overlap. Keep the complete proposal selected or rebuild the review.'
  }
  return ''
}
