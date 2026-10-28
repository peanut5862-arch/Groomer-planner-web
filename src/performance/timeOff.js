const datePattern = /^\d{4}-\d{2}-\d{2}$/
export function timeOffReason(settings,groomer,date) {
  const entry=(settings.timeOff || []).find(item=>item.start<=date && item.end>=date && (!item.groomerId || item.groomerId===groomer?.id))
  return entry ? entry.label || (entry.groomerId ? 'Groomer time off' : 'Business closed') : ''
}
export function timeOffErrors(settings) {
  if(!settings || !Array.isArray(settings.groomers))return ['Choose valid business settings.']
  if(settings.timeOff!==undefined&&!Array.isArray(settings.timeOff))return ['Invalid time-off entries.']
  return (settings.timeOff || []).flatMap(item=>{
    const errors=[]
    if(!datePattern.test(item.start)||!datePattern.test(item.end)||!Number.isFinite(Date.parse(item.start))||!Number.isFinite(Date.parse(item.end))||item.start>item.end)errors.push('Choose a valid start and end date for time off.')
    if(!String(item.label || '').trim()||String(item.label).length>100)errors.push('Give each closure or vacation a name of 1–100 characters.')
    if(item.groomerId && !settings.groomers.some(g=>g.id===item.groomerId))errors.push('Choose an existing groomer for time off.')
    return errors
  })
}
