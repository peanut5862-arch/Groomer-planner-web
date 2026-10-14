import {reminderWindow} from './reminderQueue.js'
export function bookingReplyText({request,business,intent='question',date='',time=''}){
 const name=String(request.owner_name||'').trim().split(/\s+/)[0]||'there',pets=(request.dogs||[]).map(d=>d.name).filter(Boolean).join(' and '),intro=`Hi ${name}! This is ${business||'your groomer'}.`
 if(intent==='question')return `${intro} Thanks for your grooming request${pets?` for ${pets}`:''}. What days work best for you?`
 if(intent==='confirm'){
  if(request.status!=='scheduled')return ''
  date=request.appointment?.date||'';time=request.appointment?.time||''
 }
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return ''
 const day=new Date(date+'T12:00:00Z'),window=reminderWindow(time)
 if(!Number.isFinite(day.getTime())||day.toISOString().slice(0,10)!==date||!window)return ''
 const label=day.toLocaleDateString('en-US',{timeZone:'UTC',weekday:'long',month:'short',day:'numeric'})
 if(intent==='offer')return `${intro} Would ${label} between ${window} work for ${pets||'your dog'}’s grooming visit? Please reply to let us know. This is a proposed time; we’ll confirm once arranged.`
 if(intent==='confirm')return `${intro} Your grooming appointment${pets?` for ${pets}`:''} is scheduled for ${label} between ${window}. Please reply to confirm. Thank you!`
 return ''
}
