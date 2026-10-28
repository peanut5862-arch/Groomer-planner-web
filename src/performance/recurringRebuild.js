export function replaceableRecurring(event,today,until) {
 const row=event.sourceRow
 return Boolean(event.weekStatus!=='confirmed' && event.active && event.date>today && event.date<=until && row && !row['Locked Time'] && !/completed/i.test(row['Completion Status'] || '') && !/^(confirmed|yes)$/i.test(String(row['Client Confirmation'] || '').trim()) && (Array.isArray(row['Recurring IDs']) || /^Recurring draft/i.test(row['Status Note'] || '')))
}

export function dueFromCompletedService(client,events,today) {
 const norm=value=>String(value || '').trim().toLowerCase()
 const completed=events.filter(event=>event.date<=today && String(event.sourceRow?.['Completion Status'] || '').toLowerCase()==='completed' && (client.household?event.household===client.household:norm(event.owner)===norm(client.owner)) && event.dogs.some(dog=>norm(dog)===norm(client.dog))).map(event=>event.date)
 const last=[client.lastServiceDate,...completed].filter(date=>/^\d{4}-\d{2}-\d{2}$/.test(date || '')&&date<=today).sort().at(-1)
 if(!last || !(client.frequency>0))return client.due
 const date=new Date(`${last}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+Math.round(client.frequency*7))
 return [client.due,date.toISOString().slice(0,10)].filter(Boolean).sort().at(-1)
}
