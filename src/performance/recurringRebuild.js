export function replaceableRecurring(event,today,until) {
 const row=event.sourceRow
 return Boolean(event.weekStatus!=='confirmed' && event.active && event.date>today && event.date<=until && row && !row['Locked Time'] && !/completed/i.test(row['Completion Status'] || '') && !/^(confirmed|yes)$/i.test(String(row['Client Confirmation'] || '').trim()) && (Array.isArray(row['Recurring IDs']) || /^Recurring draft/i.test(row['Status Note'] || '')))
}
