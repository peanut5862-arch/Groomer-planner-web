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
test('destination week duplicate dog blocks the move',()=>{
 const current=event('2026-11-06'),other=event('2026-11-12','p','Bo')
 assert.match(validateRepairSelection([current,other],[{event:current,date:'2026-11-13',time:'09:00',groomer:'Haley',area:'Montgomery'}]),/dog/)
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
 const anchor=event('2026-12-11')
 const plan=proposeRecurring({today,clients:[{...client,due:'2026-10-30',area:'Montgomery',service:'Groom',duration:60,price:80}],events:[anchor],groomers,rebuild:true})
 assert.ok(plan.appointments.some(a=>a.date<'2026-12-11'))
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
test('household visit adds each dog’s service time and price with one groomer',()=>{
 const dogs=[{...client,dog:'Bo',area:'Montgomery',due:'2026-11-02',service:'Groom',duration:90,price:110,groomer:'Haley'},{...client,dog:'Bella',area:'Montgomery',due:'2026-11-02',service:'Bath',duration:45,price:50,groomer:'Either'}]
 const plan=proposeRecurring({today,clients:dogs,events:[],groomers,rebuild:true})
 assert.ok(plan.appointments.length>0)
 for(const stop of plan.appointments){assert.equal(stop.groomer,'Haley');assert.equal(stop.dogs.length,2);assert.equal(stop.duration,135);assert.equal(stop.price,160)}
})
test('same household with intentionally offset four-week cycles stays separate',()=>{
 const dogs=['Doodle','Shih Tzu'].map((dog,i)=>({...client,household:'wear',dog,frequency:4,area:'Montgomery',due:i?'2026-11-16':'2026-11-02',service:'Groom',duration:60,price:80}))
 const plan=proposeRecurring({today,clients:dogs,events:[],groomers,rebuild:true})
 assert.ok(plan.appointments.length>1)
 assert.ok(plan.appointments.every(stop=>stop.dogs.length===1))
 const visits=plan.appointments.slice(0,2).map(stop=>stop.dogs[0].dog)
 assert.deepEqual(visits,['Doodle','Shih Tzu'])
})
test('different household frequencies do not get merged into the same cycle',()=>{
 const dogs=[2,6].map((frequency,i)=>({...client,dog:`Dog ${i}`,frequency,area:'Montgomery',due:'2026-11-02',service:'Groom',duration:60,price:80}))
 const plan=proposeRecurring({today,clients:dogs,events:[],groomers,rebuild:true})
 const datesFor=name=>plan.appointments.filter(stop=>stop.dogs.some(dog=>dog.dog===name)).map(stop=>stop.date)
 const frequent=datesFor('Dog 0'),lessFrequent=datesFor('Dog 1')
 assert.ok(frequent.length>lessFrequent.length)
 for(const [dates,days] of [[frequent,14],[lessFrequent,42]])for(let i=1;i<dates.length;i++)assert.ok(new Date(dates[i])-new Date(dates[i-1])>=days*86400000)
})
import {proposeRecurringRebuild} from '../src/performance/recurringRebuildPlan.js'
test('incomplete household keeps all old bookings while complete households rebuild',()=>{
 const oldA=event('2026-12-22','a','One','Montgomery'),oldB=event('2026-12-22','b','Two','Tomball')
 const clients=[{...client,household:'a',owner:'a',dog:'One',frequency:0,area:'Montgomery',due:'2026-12-22',service:'Groom',duration:60,price:80},{...client,household:'b',owner:'b',dog:'Two',frequency:6,area:'Tomball',due:'2026-12-22',service:'Groom',duration:60,price:80}]
 const plan=proposeRecurringRebuild({today,events:[oldA,oldB],clients,groomers})
 assert.ok(plan.retained.includes(oldA));assert.ok(!plan.replaced.includes(oldA));assert.ok(plan.replaced.includes(oldB));assert.ok(plan.appointments.some(stop=>stop.household==='b'))
 assert.ok(plan.appointments.every(stop=>stop.household!=='a'))
})
test('a missing sibling profile preserves the whole household',()=>{
 const old=event('2026-12-22','a','One','Montgomery',{dogs:['One','Missing sibling']})
 const plan=proposeRecurringRebuild({today,events:[old],clients:[{...client,household:'a',dog:'One',area:'Montgomery',service:'Groom',duration:60,price:80}],groomers})
 assert.equal(plan.replaced.length,0);assert.deepEqual(plan.retained,[old]);assert.equal(plan.appointments.length,0)
})

test('moving a planned appointment does not reset the six-week cycle',()=>{
 const dog={...client,frequency:6,lastServiceDate:'2026-10-24',due:'2026-12-05',area:'Montgomery',service:'Groom',duration:60,price:80}
 const moved=event('2026-12-08','p','Bo','Montgomery',{sourceRow:{'Recurring IDs':['recurring:p:bo:2026-12-05']}})
 const plan=proposeRecurring({today,clients:[dog],events:[moved],groomers})
 assert.ok(plan.appointments.length)
 assert.equal(plan.appointments[0].due,'2027-01-16')
 assert.ok(!plan.appointments.some(stop=>stop.due==='2027-01-19'))
})
test('a late suggested day does not shift subsequent planned due dates',()=>{
 const dog={...client,frequency:6,lastServiceDate:'2026-10-24',area:'Montgomery',service:'Groom',duration:60,price:80}
 const plan=proposeRecurring({today,clients:[dog],events:[],groomers,rebuild:true})
 assert.equal(plan.appointments[0].due,'2026-12-05')
 assert.equal(plan.appointments[1].due,'2027-01-16')
})
test('a groom completed one week late resets six weeks from actual completion',()=>{
 const dog={...client,frequency:6,due:'2026-12-15'}
 const late=event('2026-11-03','p','Bo','Montgomery',{sourceRow:{'Completion Status':'Completed','Completed Date':'2026-11-10'}})
 assert.equal(dueFromCompletedService(dog,[late],'2026-11-11'),'2026-12-22')
})
import {proposeClosureMoves} from '../src/performance/closureMoves.js'
test('saved Thanksgiving closure moves the household together past both closed dates',()=>{
 const events=[event('2026-11-26','p','Bo'),event('2026-11-26','p','Bella','Montgomery',{time:'10:05'})]
 const plan=proposeClosureMoves({today,events,clients:[{...client,groomer:'Haley'},{...client,dog:'Bella',groomer:'Haley'}],groomers,timeOff:[{start:'2026-11-26',end:'2026-11-27',groomerId:''}],returnHome:{'p|Haley':15},buffer:5})
 assert.equal(plan.moves.length,2);assert.ok(plan.moves.every(move=>move.date==='2026-11-30'&&move.groomer==='Haley'))
 assert.deepEqual(plan.moves.map(move=>move.time),['09:00','10:05'])
})
test('Christmas closure includes December 28 and does not move completed work',()=>{
 const events=[event('2026-12-28'),event('2026-12-25','done','Dog','Montgomery',{sourceRow:{'Completion Status':'Completed'}})]
 const plan=proposeClosureMoves({today,events,clients:[client],groomers,timeOff:[{start:'2026-12-25',end:'2026-12-28',groomerId:''}],returnHome:{'p|Haley':15}})
 assert.equal(plan.moves.length,1);assert.equal(plan.moves[0].date,'2026-12-29')
})
test('holiday preference moves the whole household before Thanksgiving',()=>{
 const events=[event('2026-11-26','p','Bo'),event('2026-11-27','p','Bella','Montgomery',{time:'10:05'})]
 const plan=proposeClosureMoves({today,events,clients:[client,{...client,dog:'Bella'}],groomers,timeOff:[{start:'2026-11-26',end:'2026-11-27'}],returnHome:{'p|Haley':15},buffer:5,preferBefore:true})
 assert.equal(plan.moves.length,2);assert.ok(plan.moves.every(move=>move.date==='2026-11-25'))
})
test('a visit previously moved after Christmas can be moved before Christmas',()=>{
 const moved=event('2026-12-29','p','Bo','Montgomery',{closureDate:'2026-12-25',closureGroomer:'Haley'})
 const plan=proposeClosureMoves({today,events:[moved],clients:[client],groomers,timeOff:[{start:'2026-12-25',end:'2026-12-28'}],returnHome:{'p|Haley':15},preferBefore:true})
 assert.equal(plan.moves.length,1);assert.equal(plan.moves[0].date,'2026-12-24')
})
test('holiday fallback uses the preceding week when the nearest week is full',()=>{
 const holiday=event('2026-11-26')
 const occupied=[19,20,23,24,25].map(day=>event(`2026-11-${day}`,'other'+day,'Dog','Other area'))
 const plan=proposeClosureMoves({today,events:[holiday,...occupied],clients:[client],groomers,timeOff:[{start:'2026-11-26',end:'2026-11-27'}],returnHome:{'p|Haley':15},preferBefore:true})
 assert.equal(plan.moves.length,1);assert.equal(plan.moves[0].date,'2026-11-18')
})
test('groomer vacation can transfer an Either household together on the same date',()=>{
 const team=[{...groomers[0],id:'haley'},{...groomers[0],id:'jen',name:'Jen'}]
 const visits=[event('2026-11-10'),event('2026-11-10','p','Bella','Montgomery',{time:'10:05'})]
 const plan=proposeClosureMoves({today,events:visits,clients:[client,{...client,dog:'Bella'}],groomers:team,timeOff:[{start:'2026-11-09',end:'2026-11-13',groomerId:'haley'}],returnHome:{'p|Haley':15,'p|Jen':15},buffer:5,preferBefore:true})
 assert.equal(plan.moves.length,2);assert.ok(plan.moves.every(move=>move.groomer==='Jen'&&move.date==='2026-11-10'))
})
test('groomer-specific client moves to an open date with their required groomer',()=>{
 const team=[{...groomers[0],id:'haley'},{...groomers[0],id:'jen',name:'Jen'}]
 const untouched=event('2026-11-10','other','Other dog','Montgomery',{groomer:'Jen'})
 const plan=proposeClosureMoves({today,events:[event('2026-11-10'),untouched],clients:[{...client,groomer:'Haley'}],groomers:team,timeOff:[{start:'2026-11-09',end:'2026-11-13',groomerId:'haley'}],returnHome:{'p|Haley':15,'p|Jen':15},preferBefore:true})
 assert.equal(plan.moves.length,1);assert.equal(plan.moves[0].groomer,'Haley');assert.equal(plan.moves[0].date,'2026-11-06');assert.ok(!plan.moves.some(move=>move.event===untouched))
})
test('an unmoved affected booking still occupies its original slot',()=>{
 const stuck=event('2026-12-29','stuck','Dog','Other area',{closureDate:'2026-12-25',closureGroomer:'Haley'})
 const next=event('2026-12-28','next','Other dog','Montgomery')
 const plan=proposeClosureMoves({today,events:[stuck,next],clients:[{...client,household:'stuck',dog:'Dog'},{...client,household:'next',dog:'Other dog'}],groomers,timeOff:[{start:'2026-12-25',end:'2026-12-28'}],returnHome:{'next|Haley':15},preferBefore:false})
 assert.ok(plan.issues.some(issue=>issue.owner==='stuck'));assert.equal(plan.moves[0].date,'2026-12-30')
})

test('time-off move skips a destination with pre-existing overlapping bookings',()=>{
 const bookings=[event('2026-11-25','a','Dog','Montgomery'),event('2026-11-25','b','Dog','Montgomery',{time:'09:30'})]
 const plan=proposeClosureMoves({today,events:[event('2026-11-26'),...bookings],clients:[client],groomers,timeOff:[{start:'2026-11-26',end:'2026-11-27'}],returnHome:{'p|Haley':15,'a|Haley':15,'b|Haley':15},preferBefore:true})
 assert.equal(plan.moves.length,1);assert.equal(plan.moves[0].date,'2026-11-24')
})

test('refresh preserves a household visit already moved by the owner',()=>{
 const old=event('2026-11-23','p','Bo','Montgomery',{active:false,sourceRow:{'Appointment Status':'Moved to another week','Rescheduled To':'2026-11-25'}})
 const moved=event('2026-11-25')
 assert.equal(replaceableRecurring(moved,today,'2027-01-28',[old,moved]),false)
 assert.equal(replaceableRecurring(event('2026-12-09'),today,'2027-01-28',[old,moved]),true)
})
import {rebookingNeed} from '../src/performance/rebooking.js'
const dueFor=(dog='Bo',extra={})=>({infos:[{row:{dog},dueDate:'2026-11-10',status:'Upcoming',detail:'Due in 13 days',rank:3,...extra}]})
const booking=(date,dogs,status='Scheduled')=>({Owner:'p','Household ID':'p',Date:date,Dogs:dogs,'Appointment Status':status})
test('cancelled visit stays in rebooking even with a later-cycle appointment',()=>{
 const rows=[booking('2026-11-10','Bo (Groom)','Cancelled'),booking('2026-12-22','Bo (Groom)')]
 assert.equal(rebookingNeed(client,dueFor(),rows,today).detail,'Cancelled · needs rebooking')
 assert.equal(rebookingNeed(client,dueFor(),[...rows,booking('2026-11-12','Bo (Groom)')],today),null)
})
test('booking another household dog does not hide the cancelled dog',()=>{
 assert.ok(rebookingNeed(client,dueFor(),[booking('2026-11-10','Bo (Groom)','Cancelled'),booking('2026-11-10','Bella (Bath)')],today))
})
test('a completed new cycle clears an old cancelled visit',()=>{
 assert.equal(rebookingNeed(client,dueFor('Bo',{dueDate:'2026-12-22'}),[booking('2026-11-10','Bo (Groom)','Cancelled')],today),null)
})
test('an unrebooked cancelled dog becomes overdue on its original due date',()=>{
 assert.equal(rebookingNeed(client,dueFor('Bo',{dueDate:'2026-10-20',status:'Overdue',rank:0,detail:'8 days overdue'}),[booking('2026-10-20','Bo (Groom)','Cancelled')],today).status,'Overdue')
})
import {unplacedClosureRows,needsReschedulingRow} from '../src/performance/closureQueue.js'
test('only unplaced closure visits enter the rescheduling queue',()=>{
 const first=event('2026-11-10'),second=event('2026-11-10','q','Other dog')
 assert.deepEqual(unplacedClosureRows({affected:[first,second],moves:[{event:first,date:'2026-11-06'}]}),[second])
})
test('queued time-off visits are inactive calendar history but remain available for rebooking',()=>{
 const queued={...booking('2026-11-10','Bo (Groom)','Moved to another week'),Status:'Needs rescheduling','Needs Rescheduling Reason':'Jen vacation'}
 const saved=JSON.stringify(queued)
 assert.equal(needsReschedulingRow(queued),true)
 assert.equal(rebookingNeed(client,dueFor(),[queued],today).detail,'Needs rescheduling · time off')
 assert.equal(rebookingNeed(client,dueFor(),[queued,booking('2026-11-12','Bo (Groom)')],today),null)
 assert.equal(JSON.stringify(queued),saved)
})

test('the prior two-week cycle does not hide a queued holiday visit',()=>{
 const queued={...booking('2026-11-27','Bo (Groom)','Moved to another week'),Status:'Needs rescheduling','Queued Date':'2026-10-29'}
 const due={infos:[{row:{dog:'Bo',frequency_weeks:2},dueDate:'2026-12-11',status:'Upcoming',rank:3,detail:'Upcoming'}]}
 assert.equal(rebookingNeed(client,due,[queued,booking('2026-11-13','Bo (Groom)')],'2026-10-29').detail,'Needs rescheduling · time off')
 assert.equal(rebookingNeed(client,due,[queued,booking('2026-11-24','Bo (Groom)')],'2026-10-29'),null)
})
test('a new completed service resolves the earlier time-off queue entry',()=>{
 const queued={...booking('2026-11-27','Bo (Groom)','Moved to another week'),Status:'Needs rescheduling','Queued Date':'2026-10-29'}
 const due={infos:[{row:{dog:'Bo',last_groom:'2026-11-24',frequency_weeks:2},dueDate:'2026-12-08',status:'Upcoming',rank:3}]}
 assert.equal(rebookingNeed(client,due,[queued],'2026-11-25'),null)
})
test('area repair moves a two-row Willis household together away from protected HMR stops',()=>{
 const family=[event('2026-12-10','dentler','Bailey','Willis',{groomer:'Jen',duration:28,time:'10:55'}),event('2026-12-10','dentler','Duncan','Willis',{groomer:'Jen',duration:50,time:'11:23'})]
 const hmr=event('2026-12-10','kari','Oliver','HMR',{groomer:'Jen',sourceRow:{'Locked Time':'09:00'}})
 const clients=family.map(e=>({household:'dentler',owner:'dentler',dog:e.dogs[0],groomer:'Jen',frequency:4,due:'2026-12-10'}))
 const plan=proposeAreaRepair({today,events:[hmr,...family],clients,groomers:[{...groomers[0],name:'Jen',workDays:[2,3,4]}],returnHome:{'dentler|Jen':15,'kari|Jen':15},buffer:5})
 assert.equal(plan.moves.length,2)
 assert.ok(plan.moves.every(move=>move.date==='2026-12-15'&&move.groomer==='Jen'))
 assert.equal(validateRepairSelection([hmr,...family],plan.moves,5),'')
 assert.equal(plan.conflicts.length,0)
})
test('add-only recurring planning will not add to a mixed or unknown existing area day',()=>{
 const c={...client,area:'HMR',service:'Groom',duration:60,price:80,due:'2026-12-10',groomer:'Haley',frequency:6}
 for(const existing of [event('2026-12-10','x','Dog','Willis',{groomer:' Haley '}),event('2026-12-10','x','Dog','')]){
  const plan=proposeRecurring({today,clients:[c],events:[existing],groomers})
  assert.ok(plan.appointments.length)
  assert.ok(!plan.appointments.some(a=>a.date==='2026-12-10'))
 }
})
import {proposeFreshRecurring} from '../src/performance/recurringRebuildPlan.js'
test('fresh rebuild removes all eligible mixed-area drafts together and queues unplaced rows',()=>{
 const hmr=event('2026-12-10','hmr','Oliver','HMR'),willis=event('2026-12-10','willis','Bailey','Willis'),missing=event('2026-12-10','missing','Unknown','Spring')
 const clients=[['hmr','Oliver','HMR'],['willis','Bailey','Willis']].map(([household,dog,area])=>({...client,household,owner:household,dog,area,frequency:6,due:'2026-12-10',service:'Groom',duration:60,price:80}))
 const plan=proposeFreshRecurring({today,events:[hmr,willis,missing],clients,groomers})
 assert.equal(plan.replaced.length,3);assert.ok(plan.queued.includes(missing));assert.equal(plan.retained.length,0)
 for(const stop of plan.appointments)assert.ok(plan.appointments.filter(other=>other.date===stop.date&&other.groomer===stop.groomer).every(other=>other.area===stop.area))
})
test('fresh rebuild preserves owner-moved and confirmed appointments as anchors',()=>{
 const protectedVisit=event('2026-12-10','a','One','HMR',{sourceRow:{'Client Confirmation':'Confirmed','Recurring IDs':['a']}})
 const draft=event('2026-12-10','b','Two','Willis')
 const clients=[{...client,household:'b',owner:'b',dog:'Two',area:'Willis',frequency:6,due:'2026-12-10',service:'Groom',duration:60,price:80}]
 const plan=proposeFreshRecurring({today,events:[protectedVisit,draft],clients,groomers})
 assert.deepEqual(plan.replaced,[draft]);assert.ok(plan.retained.includes(protectedVisit));assert.ok(plan.appointments.every(stop=>stop.date!=='2026-12-10'))
})
test('fresh preview discloses mixed-area days retained by protected bookings',()=>{
 const protectedVisits=['HMR','Willis'].map((area,i)=>event('2026-12-10',`h${i}`,'Dog',area,{sourceRow:{'Client Confirmation':'Confirmed','Recurring IDs':['x']}}))
 const plan=proposeFreshRecurring({today,events:protectedVisits,clients:[],groomers})
 assert.equal(plan.protectedVisits,2);assert.equal(plan.protectedConflicts.length,1)
 assert.deepEqual(plan.protectedConflicts[0].areas,['HMR','Willis'])
 assert.equal(plan.replaced.length,0)
})
