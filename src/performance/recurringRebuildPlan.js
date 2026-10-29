import {proposeRecurring,horizonDate} from './recurringPlan.js'
import {dueFromCompletedService,replaceableRecurring} from './recurringRebuild.js'
const norm=value=>String(value || '').trim().toLowerCase()
const key=record=>record.household || `owner:${norm(record.owner)}`
// If any visit in a household's rebuilt series cannot be placed, keep that
// household's entire saved series and retry the others around those bookings.
export function proposeRecurringRebuild(options) {
 const {today,events,clients}=options,until=horizonDate(today)
 const candidates=events.filter(event=>replaceableRecurring(event,today,until,events))
 const households=new Set(candidates.map(key)),retained=new Map()
 for(const event of candidates)for(const dog of event.dogs){
  if(!clients.some(client=>key(client)===key(event)&&norm(client.dog)===norm(dog)))retained.set(key(event),'A scheduled dog could not be matched to its client profile.')
 }
 let result,replaced=[]
 for(let pass=0;pass<=households.size;pass++) {
  replaced=candidates.filter(event=>!retained.has(key(event)))
  const removed=new Set(replaced)
  const included=clients.filter(client=>households.has(key(client))&&!retained.has(key(client)))
  result=proposeRecurring({...options,rebuild:true,events:events.filter(event=>!removed.has(event)),clients:included})
  const additions=new Map()
  for(const issue of result.issues){
   for(const client of included.filter(client=>norm(client.owner)===norm(issue.owner)&&norm(client.dog)===norm(issue.dog)))additions.set(key(client),issue.reason)
  }
  for(const event of replaced)for(const dog of event.dogs){
   if(!additions.has(key(event))&&!result.appointments.some(stop=>key(stop)===key(event)&&stop.dogs.some(pet=>norm(pet.dog)===norm(dog))))additions.set(key(event),'No safe replacement visit is available in this planning window.')
  }
  if(!additions.size)break
  for(const [household,reason] of additions)retained.set(household,reason)
 }
 return {...result,replaced,retained:candidates.filter(event=>retained.has(key(event))),keptHouseholds:[...retained].map(([household,reason])=>({household,owner:candidates.find(event=>key(event)===household)?.owner,reason}))}
}

// Fresh preview: remove all eligible automatic drafts together, then plan around
// protected bookings. Unplaced visits remain as explicit rescheduling records.
export function proposeFreshRecurring(options){
 const {today,events,clients}=options,until=horizonDate(today)
 const replaced=events.filter(event=>replaceableRecurring(event,today,until,events))
 const removed=new Set(replaced),retained=events.filter(event=>!removed.has(event))
 const result=proposeRecurring({...options,rebuild:true,events:retained})
 const queued=replaced.filter(event=>event.dogs.some(dog=>{
  const client=clients.find(client=>key(client)===key(event)&&norm(client.dog)===norm(dog))
  if(!client||!(client.frequency>0))return true
  const interval=Math.round(client.frequency*7)
  const base=dueFromCompletedService(client,events,today)
  if(!base)return true
  const cycle=record=>{
   const prefix=`recurring:${client.household}:${norm(client.dog)}:`
   const id=(record.sourceRow?.['Recurring IDs']||record.ids||[]).find?.(id=>String(id).startsWith(prefix))
   const due=String(id||'').match(/(\d{4}-\d{2}-\d{2})$/)?.[1]||record.date
   return Math.max(0,Math.round((new Date(due)-new Date(base))/86400000/interval))
  }
  const sameCycle=record=>key(record)===key(event)&&cycle(record)===cycle(event)
  const covered=result.appointments.some(stop=>sameCycle(stop)&&stop.dogs.some(pet=>norm(pet.dog)===norm(dog)))||retained.some(other=>other.active&&other.date>today&&sameCycle(other)&&other.dogs.some(pet=>norm(pet)===norm(dog)))
  return !covered
 }))
 return {...result,replaced,retained,queued,keptHouseholds:[]}
}
