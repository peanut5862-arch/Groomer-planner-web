export function bookingSuggestions({request,rows,groomers,minutes=60,today}){
 const area=String(request.area||'').trim().toLowerCase(),start=request.preferred_date>today?request.preferred_date:today,out=[]
 for(let n=0;n<21;n++){
  const d=new Date(start+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);const date=d.toISOString().slice(0,10),weekday=d.getUTCDay()
  for(const g of groomers.filter(g=>g.active!==false&&g.workDays.includes(weekday))){
   const active=rows.filter(r=>r.Date===date&&r.Groomer===g.name&&!['cancelled','canceled','rescheduled','moved to another week','missed','no-show','no show'].includes(String(r['Appointment Status']||r.Status||'').toLowerCase()))
   const matching=area?active.filter(r=>String(r.Area||'').trim().toLowerCase()===area).length:0
   const history=area?rows.filter(r=>r.Groomer===g.name&&String(r.Area||'').trim().toLowerCase()===area&&new Date(r.Date+'T12:00:00Z').getUTCDay()===weekday).length:0
   const clock=t=>{const m=String(t||'').match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);if(!m)return null;let h=+m[1];if(m[3])h=h%12+(m[3].toUpperCase()==='PM'?12:0);return h*60+(+m[2])}
   const startTime=clock(g.startTime)||540,end=clock(g.endTime)||1020
   const last=active.reduce((v,r)=>Math.max(v,clock(r.EndTime)||((clock(r.StartTime||r.LockedTime)||startTime)+(Number(r.Minutes||r['Service Minutes'])||60))),startTime)
   const arrival=last+(active.length?15:0)
   if(arrival+minutes>end)continue
   out.push({date,groomer:g.name,time:`${String(Math.floor(arrival/60)).padStart(2,'0')}:${String(arrival%60).padStart(2,'0')}`,matching,history,stops:active.length,score:matching*100+Math.min(history,10)*5-n-active.length*2})
  }
 }
 return out.sort((a,b)=>b.score-a.score||a.date.localeCompare(b.date)||a.groomer.localeCompare(b.groomer)).slice(0,3)
}
