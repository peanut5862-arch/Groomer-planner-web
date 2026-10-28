import {addDays} from './recurringPlan.js'
const norm=value=>String(value || '').trim().toLowerCase()
export function earliestRecurringDate(visit,clients,events,today) {
  const first=visit[0]
  let floor=''
  for(const name of visit.flatMap(e=>e.dogs || [])) {
    const client=clients.find(c=>(first.household?c.household===first.household:norm(c.owner)===norm(first.owner))&&norm(c.dog)===norm(name))
    if(!client || !(client.frequency>0))continue
    let due=/^\d{4}-\d{2}-\d{2}$/.test(client.due || '')?client.due:''
    const prior=events.filter(e=>e.active && e.date>today && (e.originalDate || e.date)<first.date && (first.household?e.household===first.household:norm(e.owner)===norm(first.owner)) && (e.dogs || []).some(d=>norm(d)===norm(name))).map(e=>e.date).sort().at(-1)
    if(prior){const next=addDays(prior,Math.round(client.frequency*7));if(next>due)due=next}
    if(due>floor)floor=due
  }
  return floor
}
