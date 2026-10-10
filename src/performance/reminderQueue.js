export function nextDate(key){const d=new Date(key+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)}
export function reminderText(appt,businessName){
 const name=String(appt.owner||'').trim().split(/\s+/)[0]||'there'
 const pets=[...new Set(String(appt.dogs||'').replace(/\([^)]*\)/g,'').split(/[,+]/).map(s=>s.trim()).filter(Boolean))].join(' and ')
 const date=new Date(appt.date+'T12:00:00Z').toLocaleDateString('en-US',{timeZone:'UTC',weekday:'long',month:'short',day:'numeric'})
 const rawTime=String(appt.time||'').trim()
 const match=rawTime.match(/^(\d{1,2}):(\d{2})$/)
 const time=match?`${Number(match[1])%12||12}:${match[2]} ${Number(match[1])>=12?'PM':'AM'}`:rawTime
 return `Hi ${name}! This is ${businessName||'your groomer'} reminding you of your grooming appointment${pets?` for ${pets}`:''} on ${date}${time?` at ${time}`:''}. Please reply to confirm. Thank you!`
}
export function reminderEligible(row){return ![row.Status,row['Appointment Status']].some(s=>['cancelled','canceled','rescheduled','moved to another week','missed','no show','no-show','noshow'].includes(String(s||'').trim().toLowerCase()))&&String(row['Completion Status']||'').trim().toLowerCase()!=='completed'}
