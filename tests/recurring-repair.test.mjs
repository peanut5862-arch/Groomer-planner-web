import test from 'node:test'
import assert from 'node:assert/strict'
import {earliestRecurringDate,latestRecurringDate} from '../src/performance/recurringCadence.js'
import {proposeAreaRepair,validateRepairSelection} from '../src/performance/areaRepair.js'
const today='2026-10-28'
const event=(date,household='p',dog='Bo',area='Montgomery',extra={})=>({date,household,owner:household,dogs:[dog],area,groomer:'Haley',time:'09:00',duration:60,active:true,sourceRow:{'Recurring IDs':[`${household}:${date}`],'Client Confirmation':'Unconfirmed'},...extra})
const client={household:'p',owner:'p',dog:'Bo',frequency:2,due:'2026-10-28',groomer:'Either'}
const groomers=[{name:'Haley',active:true,workDays:[1,2,3,4,5],startTime:'08:30',endTime:'17:00'}]
test('Pape cannot repeat one week after October 30',()=>{
 const prior=event('2026-10-30'),next=event('2026-11-06')
 assert.equal(earliestRecurringDate([next],[client],[prior,next],today),'2026-11-13')
 const plan=proposeAreaRepair({today,events:[prior,next],clients:[client],groomers,returnHome:{'p|Haley':15}})
 assert.equal(plan.moves.length,1);assert.equal(plan.moves[0].date,'2026-11-13')
 assert.equal(validateRepairSelection([prior,next],plan.moves), '')
})
test('area repair cannot squeeze a visit against the next booking',()=>{
 const current=event('2026-11-06'),following=event('2026-11-20')
 assert.equal(latestRecurringDate([current],[client],[current,following],today),'2026-11-06')
 const move={event:current,date:'2026-11-13',time:'09:00',groomer:'Haley',area:'Montgomery',cadenceClients:[client],cadenceToday:today}
 assert.match(validateRepairSelection([current,following],[move]),/too close/)
})
test('each pet keeps its own frequency for rotating dogs',()=>{
 const doodle=event('2026-10-24','wear','Doodle'),shih=event('2026-10-31','wear','Shih Tzu'),next=event('2026-11-21','wear','Doodle')
 const clients=[{household:'wear',dog:'Doodle',frequency:4,due:'2026-11-21'}]
 assert.equal(earliestRecurringDate([next],clients,[doodle,shih,next],today),'2026-11-21')
})
test('saved due date remains the earliest allowed date without a future prior visit',()=>{
 const amy=event('2026-11-06','amy','Jerzi')
 assert.equal(earliestRecurringDate([amy],[{household:'amy',dog:'Jerzi',frequency:4,due:'2026-11-11'}],[amy],today),'2026-11-11')
})
test('area repair preserves confirmed and fixed bookings',()=>{
 const confirmed=event('2026-11-06','p','Bo','Montgomery',{sourceRow:{'Recurring IDs':['p'],'Client Confirmation':'Confirmed'}})
 const fixed=event('2026-11-06','q','Henry','Magnolia',{sourceRow:{'Recurring IDs':['q'],'Locked Time':true}})
 assert.equal(proposeAreaRepair({today,events:[confirmed,fixed],clients:[client],groomers,returnHome:{'p|Haley':15,'q|Haley':15}}).moves.length,0)
})
test('destination week household collision blocks the move',()=>{
 const current=event('2026-11-06'),other=event('2026-11-12','p','Other dog')
 assert.match(validateRepairSelection([current,other],[{event:current,date:'2026-11-13',time:'09:00',groomer:'Haley',area:'Montgomery'}]),/household/)
})
import {replaceableRecurring} from '../src/performance/recurringRebuild.js'
import {proposeRecurring} from '../src/performance/recurringPlan.js'
test('rebuild removes only eligible drafts, keeping protected records',()=>{
 const draft=event('2026-12-22'),manual=event('2026-12-22','m','Dog','Tomball',{sourceRow:{}})
 assert.equal(replaceableRecurring(draft,today,'2027-01-28'),true)
 for(const e of [manual,{...draft,date:today},{...draft,sourceRow:{...draft.sourceRow,'Locked Time':true}},{...draft,sourceRow:{...draft.sourceRow,'Client Confirmation':'Confirmed'}},{...draft,sourceRow:{...draft.sourceRow,'Completion Status':'Completed'}}])assert.equal(replaceableRecurring(e,today,'2027-01-28'),false)
})
test('rebuild groups nearby due dates for same-frequency household dogs',()=>{
 const dogs=['One','Two'].map((dog,i)=>({...client,household:'family',dog,due:`2026-11-0${2+i}`,area:'Montgomery',service:'Groom',duration:60,price:80}))
 const plan=proposeRecurring({today,clients:dogs,events:[],groomers,rebuild:true})
 assert.ok(plan.appointments.length>0)
 assert.ok(plan.appointments.every(a=>a.dogs.length===2))
 for(let i=1;i<plan.appointments.length;i++)assert.ok(new Date(plan.appointments[i].date)-new Date(plan.appointments[i-1].date)>=14*86400000)
})
test('rebuild fills before protected anchors without booking too close',()=>{
 const anchor=event('2026-12-04')
 const plan=proposeRecurring({today,clients:[{...client,due:'2026-10-30',area:'Montgomery',service:'Groom',duration:60,price:80}],events:[anchor],groomers,rebuild:true})
 assert.ok(plan.appointments.some(a=>a.date<'2026-12-04'))
 const dates=[anchor.date,...plan.appointments.map(a=>a.date)].sort()
 for(let i=1;i<dates.length;i++)assert.ok(new Date(dates[i])-new Date(dates[i-1])>=14*86400000,`${dates[i-1]} / ${dates[i]}`)
})
test('rebuild never mixes service areas on a groomer day',()=>{
 const clients=['Montgomery','Tomball','April Sound','Magnolia'].map((area,i)=>({...client,household:`h${i}`,owner:`h${i}`,dog:'Dog',area,due:'2026-11-02',service:'Groom',duration:60,price:80}))
 const plan=proposeRecurring({today,clients,events:[],groomers,rebuild:true})
 const days=new Map()
 for(const a of plan.appointments){const key=a.date+'|'+a.groomer;if(!days.has(key))days.set(key,new Set());days.get(key).add(a.area)}
 assert.ok([...days.values()].every(areas=>areas.size===1))
})
import {dueFromCompletedService} from '../src/performance/recurringRebuild.js'
test('six weeks comes from the completed groom, never an old draft',()=>{
 const dog={...client,frequency:6,due:'2026-10-01'}
 const done=event('2026-10-24','p','Bo','Montgomery',{sourceRow:{'Completion Status':'Completed'}})
 const staleDraft=event('2026-10-26')
 assert.equal(dueFromCompletedService(dog,[done,staleDraft],today),'2026-12-05')
 assert.equal(dueFromCompletedService({...dog,due:'2027-01-05'},[done,staleDraft],today),'2026-12-05')
})
test('completion history belongs to the dog, not the other dog in its household',()=>{
 const dog={...client,frequency:6,due:'2026-12-05'}
 const sibling=event('2026-10-27','p','Other dog','Montgomery',{sourceRow:{'Completion Status':'Completed'}})
 assert.equal(dueFromCompletedService(dog,[sibling],today),'2026-12-05')
})
