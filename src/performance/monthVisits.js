// Group display only: each saved appointment remains independently editable.
export function monthVisits(appointments) {
  const groups = new Map()
  for (const appt of appointments || []) {
    const row = appt.sourceRow || {}
    const household = String(row['Household ID'] || row.household_id || '').trim().toLowerCase()
    const owner = String(appt.owner || '').trim().toLowerCase()
    const key = JSON.stringify([appt.date, household ? `h:${household}` : `o:${owner}`, appt.groomer || ''])
    if (!groups.has(key)) groups.set(key, {key,owner:appt.owner,groomer:appt.groomer,appointments:[]})
    groups.get(key).appointments.push(appt)
  }
  return [...groups.values()]
}
