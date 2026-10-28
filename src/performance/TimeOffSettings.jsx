import React from 'react'
export default function TimeOffSettings({settings,onChange}) {
  const entries=settings.timeOff || []
  const change=(index,values)=>onChange(entries.map((entry,i)=>i===index?{...entry,...values}:entry))
  return <div className="settings-card"><h3>Holidays &amp; time off</h3><p className="settings-help">Close the whole business or block one groomer for a vacation or day off. Saving moves affected appointments to matching-area openings in the week before the holiday when space is available. Any visit that cannot move safely stays saved and is listed for review. Completed service history stays unchanged.</p>
    {entries.map((entry,index)=><div className="settings-card" key={entry.id || index}>
      <label>Holiday or reason<input maxLength={100} value={entry.label} onChange={e=>change(index,{label:e.target.value})}/></label>
      <label>Applies to<select value={entry.groomerId || ''} onChange={e=>change(index,{groomerId:e.target.value})}><option value="">Whole business</option>{settings.groomers.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
      <label>First day off<input type="date" value={entry.start} onChange={e=>change(index,{start:e.target.value})}/></label>
      <label>Last day off<input type="date" min={entry.start} value={entry.end} onChange={e=>change(index,{end:e.target.value})}/></label>
      <button className="ghost" type="button" onClick={()=>onChange(entries.filter((_,i)=>i!==index))}>Remove time off</button>
    </div>)}
    <button className="ghost" type="button" onClick={()=>onChange([...entries,{id:crypto.randomUUID(),label:'',groomerId:'',start:'',end:''}])}>+ Add holiday or time off</button>
  </div>
}
