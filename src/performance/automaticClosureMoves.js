import {unplacedClosureRows} from './closureQueue.js'
import {supabase} from '../supabase.js'
import {proposeClosureMoves} from './closureMoves.js'
import {addDays,horizonDate} from './recurringPlan.js'
import {businessDateKey,mondayForDate,appointmentTimeInput,canonicalAreaLabel,fullClientAddress,apiFetch} from './shared.jsx'
import {getBusinessContext} from './businessConfig.js'
import {timeOffReason} from './timeOff.js'
const value=(row,...keys)=>keys.map(key=>row?.[key]).find(item=>item!==undefined&&item!==null&&String(item).trim()!=='') || ''
export async function moveAppointmentsOffClosures(settings,onProgress=()=>{},previousContext=null) {
 const today=businessDateKey(),from=mondayForDate(today),until=addDays(horizonDate(today),28),context=getBusinessContext()
 const [weeks,dogs]=await Promise.all([supabase.from('weekly_drafts').select('week_start,plan_json').gte('week_start',from).lte('week_start',until).order('week_start'),supabase.from('dogs').select('*')])
 if(weeks.error)throw weeks.error;if(dogs.error)throw dogs.error
 const clients=(dogs.data||[]).map(row=>({household:String(value(row,'household_id','Household ID')),owner:value(row,'owner','Owner'),dog:value(row,'dog','Dog'),groomer:value(row,'groomer','Groomer'),address:fullClientAddress(row)}))
 const events=(weeks.data||[]).flatMap(week=>(week.plan_json||[]).map(row=>({sourceRow:row,weekStart:week.week_start,household:String(value(row,'Household ID','household_id')),owner:value(row,'Owner'),dogs:String(value(row,'Dogs')).split(',').map(dog=>dog.replace(/\s*\([^)]*\)/g,'').trim()),groomer:value(row,'Groomer'),area:canonicalAreaLabel(value(row,'Area Cluster','Area')),date:String(value(row,'Date')).slice(0,10),time:appointmentTimeInput(value(row,'Start Time')),duration:Number(value(row,'Minutes')),active:!['cancelled','canceled','moved to another week','no-show','no show'].includes(String(value(row,'Appointment Status')).toLowerCase())})))
 for(const event of events)if(!event.household){const matching=clients.filter(client=>client.owner===event.owner);if(new Set(matching.map(client=>client.household)).size===1)event.household=matching[0]?.household}
 // Recheck visits this feature previously moved after the holiday, too.
 for(const event of events.filter(event=>event.active&&String(event.sourceRow['Status Note']||'').includes('Moved automatically off a closed day'))){
  const origin=events.find(old=>!old.active&&old.sourceRow['Rescheduled To']===event.date&&(event.household?old.household===event.household:old.owner===event.owner)&&String(old.sourceRow.Dogs)===String(event.sourceRow.Dogs)&&old.date<event.date&&(settings.timeOff||[]).some(item=>!item.groomerId&&item.start<=old.date&&item.end>=old.date))
  if(origin){event.closureDate=origin.date;event.closureGroomer=origin.groomer}
 }
 const affected=events.filter(event=>event.active&&event.date>=today&&event.date<=horizonDate(today)&&!/completed/i.test(event.sourceRow['Completion Status']||'')&&(event.closureDate||timeOffReason(settings,settings.groomers.find(g=>g.name===event.groomer),event.date)))
 if(!affected.length)return {moved:0,visits:0,queuedVisits:0,issues:[]}
 const jobs=new Map(),returnHome={}
 for(const event of events.filter(event=>event.active&&event.date>=today)){
  const client=clients.find(client=>client.household&&client.household===event.household),groomer=settings.groomers.find(g=>g.name===event.groomer)
  if(client&&groomer)jobs.set(`${client.household}|${groomer.name}`,{client,groomer})
 }
 for(const event of affected){const client=clients.find(client=>client.household&&client.household===event.household);if(client)for(const groomer of settings.groomers.filter(g=>g.active!==false))jobs.set(`${client.household}|${groomer.name}`,{client,groomer})}
 const queue=[...jobs],total=queue.length;let checked=0
 await Promise.all(Array.from({length:Math.min(4,queue.length)},async()=>{while(queue.length){const [key,{client,groomer}]=queue.shift();try{
  const cacheKey=`planner-return-home:${context.businessId}:${context.revision}:${key}:${client.address}`
  let cached;try{cached=JSON.parse(localStorage.getItem(cacheKey)||'null')}catch{}
  if(!cached&&previousContext?.revision&&JSON.stringify(previousContext.settings?.route)===JSON.stringify(settings.route)){const old=previousContext.settings?.groomers.find(g=>g.name===groomer.name);if(old&&old.homeAddress===groomer.homeAddress){try{cached=JSON.parse(localStorage.getItem(`planner-return-home:${context.businessId}:${previousContext.revision}:${key}:${client.address}`)||'null')}catch{}}}
  if(cached&&Date.now()-cached.at<86400000&&Number.isFinite(cached.minutes)){returnHome[key]=cached.minutes;try{localStorage.setItem(cacheKey,JSON.stringify(cached))}catch{};continue}
  if(!client.address)continue
  const response=await apiFetch('/api/google-route',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({groomer:groomer.name,stops:[{id:client.household,owner:client.owner,address:client.address}]})})
  const payload=await response.json(),minutes=Number(payload.legs?.at(-1)?.minutes)
  if(response.ok&&payload.legs?.length&&Number.isFinite(minutes)&&minutes>=0){returnHome[key]=minutes;try{localStorage.setItem(cacheKey,JSON.stringify({at:Date.now(),minutes}))}catch{}}
 }catch{}finally{checked++;onProgress(`Checking holiday moves… ${checked}/${total}`)}}}))
 const plan=proposeClosureMoves({today,events,clients,groomers:settings.groomers,timeOff:settings.timeOff||[],buffer:settings.bufferMinutes,returnHome,preferBefore:true})
 const unplaced=unplacedClosureRows(plan)
 if(!plan.moves.length&&!unplaced.length)return {moved:0,visits:0,queuedVisits:0,issues:plan.issues}
 const expected={};for(let week=from;week<=until;week=addDays(week,7))expected[week]=(weeks.data||[]).find(item=>item.week_start===week)?.plan_json||null
 const {data,error}=await supabase.rpc('move_closed_day_appointments',{p_moves:plan.moves.map(move=>({weekStart:move.event.weekStart,expectedRow:move.event.sourceRow,closedDate:move.event.closureDate||move.event.date,closedGroomer:move.event.closureGroomer||move.event.groomer,date:move.date,time:move.time,groomer:move.groomer})),p_expected_weeks:expected,p_expected_settings:settings,p_unplaced:unplaced.map(event=>({weekStart:event.weekStart,expectedRow:event.sourceRow,closedDate:event.closureDate||event.date,closedGroomer:event.closureGroomer||event.groomer}))})
 if(error)throw error;if(data?.status!=='moved')throw Error('The holiday moves could not be confirmed.')
 return {moved:data.moved,queuedVisits:new Set(unplaced.map(event=>`${event.household||event.owner}|${event.closureDate||event.date}|${event.groomer}`)).size,visits:new Set(plan.moves.map(move=>`${move.event.household||move.event.owner}|${move.event.date}|${move.event.groomer}`)).size,issues:plan.issues}
}
