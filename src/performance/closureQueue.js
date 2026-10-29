// Keep the original appointment as history; only successfully placed visits
// remain on a working calendar. Unplaced rows are retained in the rebooking queue.
export function unplacedClosureRows(plan){
 const placed=new Set(plan.moves.map(move=>move.event))
 return plan.affected.filter(event=>!placed.has(event))
}
export function needsReschedulingRow(row){
 return String(row?.Status||'').trim().toLowerCase()==='needs rescheduling'
}
