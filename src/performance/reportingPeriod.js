export function monthRange(month){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('Choose a valid month.')
 const [year,number]=month.split('-').map(Number)
 return {from:`${month}-01`,until:new Date(Date.UTC(year,number,0,12)).toISOString().slice(0,10)}
}
export function reportRows(weeks,from,until){return weeks.flatMap(w=>Array.isArray(w?.plan_json)?w.plan_json:[]).filter(row=>{const date=String(row?.Date||'').slice(0,10);return date>=from&&date<=until})}
