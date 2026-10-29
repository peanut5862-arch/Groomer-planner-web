// Historical lookups use saved completion dates, never a future due date.
const shift=(date,n)=>{const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
const monday=date=>shift(date,-((new Date(`${date}T12:00:00Z`).getUTCDay()+6)%7))
export function historyRequest(prompt,today,groomers=[]) {
 const text=String(prompt||'').toLowerCase()
 if(!/\b(groomed|groom|completed|complete|finished|finish|previous|past|history|last|ago)\b/.test(text))return null
 let start,end
 const numbers={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12}
 const weeks=text.match(/\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+weeks?\s+ago\b/)
 if(weeks){const count=Number(weeks[1])||numbers[weeks[1]];if(count<1||count>52)return null;start=shift(monday(today),-count*7);end=shift(start,6)}
 else if(/\blast week\b/.test(text)){start=shift(monday(today),-7);end=shift(start,6)}
 else if(/\bthis week\b/.test(text)){start=monday(today);end=today}
 else if(/\byesterday\b/.test(text)){start=end=shift(today,-1)}
 else if(/\btoday\b/.test(text)){start=end=today}
 else {const dates=text.match(/\b20\d{2}-\d{2}-\d{2}\b/g);if(dates?.length){start=dates[0];end=dates[1]||start;if(!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||start>end)return null}}
 if(!start)return null
 const groomer=groomers.find(name=>text.includes(String(name).toLowerCase()))||''
 return {start,end,groomer}
}
export function completedHistory(rows,request) {
 return rows.filter(row=>{
  if(['cancelled','canceled','moved to another week','no-show','no show'].includes(String(row['Appointment Status']||'').trim().toLowerCase()))return false
  const completed=String(row['Completion Status']||'').trim().toLowerCase()==='completed'||String(row['Groomer Finish Status']||'').trim().toLowerCase()==='finished'
  const date=String(row['Completed Date']||row.Date||'').slice(0,10)
  return completed&&date>=request.start&&date<=request.end&&(!request.groomer||String(row.Groomer||'').trim()===request.groomer)
 }).map(row=>({date:String(row['Completed Date']||row.Date).slice(0,10),owner:String(row.Owner||''),dogs:String(row.Dogs||''),groomer:String(row.Groomer||'')})).sort((a,b)=>a.date.localeCompare(b.date)||a.owner.localeCompare(b.owner))
}
export function historyReply(items,request) {
 const label=`Completed visits ${request.start} through ${request.end}${request.groomer?` · ${request.groomer}`:''}`
 return items.length?`${label}: ${items.length} saved visit${items.length===1?'':'s'}.\n\n${items.map(item=>`${item.date} — ${item.owner}: ${item.dogs} · ${item.groomer}`).join('\n')}`:`${label}: I found no visits marked completed in the saved records. An appointment that was only scheduled does not count as a completed groom.`
}
