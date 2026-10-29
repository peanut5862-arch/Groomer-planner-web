import {needsReschedulingRow} from './closureQueue.js'
const norm=value=>String(value||'').trim().toLowerCase()
const date=value=>String(value||'').slice(0,10)
const shift=(key,days)=>{const value=new Date(`${key}T12:00:00Z`);value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10)}
const names=row=>String(row.Dogs||'').split(',').map(dog=>norm(dog.replace(/\s*\([^)]*\)/g,'')))
const state=row=>[row['Appointment Status'],row.Status].map(norm)
export function rebookingNeed(client,due,rows,today){
 const householdRows=rows.filter(row=>client.household?String(row['Household ID']||row.household_id||'')===client.household||(!row['Household ID']&&norm(row.Owner)===norm(client.owner)):norm(row.Owner)===norm(client.owner))
 const active=householdRows.filter(row=>date(row.Date)>=today&&norm(row['Completion Status'])!=='completed'&&!state(row).some(value=>['cancelled','canceled','moved to another week','rescheduled','missed','no-show','no show','completed'].includes(value)))
 const missing=[]
 for(const info of due.infos||[]){
  const pet=norm(info.row.dog||info.row.Dog),booked=active.filter(row=>names(row).includes(pet))
  const overdue=['Overdue','Due today','Due this week','Due soon'].includes(info.status)
  const coversDue=booked.some(row=>!info.dueDate||date(row.Date)<=shift(info.dueDate>today?info.dueDate:today,14))
  const frequency=Number(String(info.row.frequency_weeks||info.row['Frequency Weeks']||'').replace(/[^0-9.]/g,''))
  const tolerance=frequency>0?Math.max(1,Math.min(14,Math.floor(frequency*7/2)-1)):14
  const replaces=(booking,original)=>Math.abs((new Date(date(booking.Date))-new Date(date(original.Date)))/86400000)<=tolerance
  const lastService=[info.row.last_groom,info.row.last_bath,info.row.last_groom_date,info.row.last_bath_date,info.row['Last Groom'],info.row['Last Bath']].map(date).filter(key=>/^\d{4}-\d{2}-\d{2}$/.test(key)).sort().at(-1)
  const servedAfterQueue=row=>needsReschedulingRow(row)&&row['Queued Date']&&((lastService&&lastService>=row['Queued Date'])||householdRows.some(done=>norm(done['Completion Status'])==='completed'&&names(done).includes(pet)&&date(done['Completed Date']||done.Date)>=row['Queued Date']))
  const cancellations=householdRows.filter(row=>names(row).includes(pet)&&(needsReschedulingRow(row)||state(row).some(value=>['cancelled','canceled'].includes(value)))&&/^\d{4}-\d{2}-\d{2}$/.test(date(row.Date))&&!servedAfterQueue(row)&&(needsReschedulingRow(row)||!info.dueDate||date(row.Date)>=shift(info.dueDate,-14)))
  const queued=cancellations.some(row=>needsReschedulingRow(row)&&!booked.some(booking=>replaces(booking,row)))
  const unresolved=cancellations.some(row=>!booked.some(booking=>replaces(booking,row)))
  if(overdue&&!coversDue)missing.push(info)
  else if(unresolved)missing.push({...info,status:'Needs rebooking',detail:queued?'Needs rescheduling · time off':'Cancelled · needs rebooking',rank:info.status==='Overdue'?0:2})
 }
 if(!missing.length)return null
 missing.sort((a,b)=>a.rank-b.rank||(a.dueDate||'').localeCompare(b.dueDate||''))
 const first=missing[0],overdue=missing.filter(info=>info.status==='Overdue')
 return {...first,infos:missing,detail:overdue.length>1?`${overdue.length} dogs overdue`:first.detail}
}
