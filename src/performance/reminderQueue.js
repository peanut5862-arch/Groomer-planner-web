export function reminderWindow(value){
 const match=String(value||'').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i)
 if(!match)return ''
 let hour=Number(match[1]);const minute=Number(match[2]),period=match[3]?.toUpperCase()
 if(minute>59||hour>(period?12:23)||(period&&hour<1))return ''
 if(period)hour=hour%12+(period==='PM'?12:0)
 const end=(hour+1)%24
 const label=h=>`${h%12||12} ${h>=12?'PM':'AM'}`
 return `${label(hour)}–${label(end)}`
}
export function nextDate(key){const d=new Date(key+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)}
export function reminderText(appt,businessName){
 const name=String(appt.owner||'').trim().split(/\s+/)[0]||'there'
 const pets=[...new Set(String(appt.dogs||'').replace(/\([^)]*\)/g,'').split(/[,+]/).map(s=>s.trim()).filter(Boolean))].join(' and ')
 const date=new Date(appt.date+'T12:00:00Z').toLocaleDateString('en-US',{timeZone:'UTC',weekday:'long',month:'short',day:'numeric'})
 const window=reminderWindow(appt.time)
 return `Hi ${name}! This is ${businessName||'your groomer'} reminding you of your grooming appointment${pets?` for ${pets}`:''} on ${date}${window?` between ${window}`:''}. Please reply to confirm. Thank you!`
}
export function reminderEligible(row){return ![row.Status,row['Appointment Status']].some(s=>['cancelled','canceled','rescheduled','moved to another week','missed','no show','no-show','noshow'].includes(String(s||'').trim().toLowerCase()))&&String(row['Completion Status']||'').trim().toLowerCase()!=='completed'}
