const lower=value=>String(value??'').trim().toLowerCase()
const amount=value=>{const text=String(value??'').replace(/[$,]/g,'').trim();const n=Number(text);return text!==''&&Number.isFinite(n)&&n>=0?n:null}
export function dailyCloseout(rows,date,groomers=[]){
 const active=(Array.isArray(rows)?rows:[]).filter(r=>r&&String(r.Owner||'').trim()&&String(r.Date||'').slice(0,10)===date&&![r.Status,r['Appointment Status']].some(s=>['cancelled','canceled','rescheduled','moved to another week','missed','no show','no-show','noshow'].includes(lower(s))))
 const issues=[],team=new Map();let completed=0,service=0,received=0,tips=0,unpaid=0
 for(const row of active){
  const done=lower(row['Completion Status'])==='completed',paid=lower(row['Payment Status'])==='paid',price=amount(row.Price),tip=amount(row.Tip)||0,method=String(row['Payment Method']||'').trim()
  const reasons=[];if(!done)reasons.push('Not finished');if(done&&!paid)reasons.push(lower(row['Payment Status'])==='unpaid'?'Unpaid':'Payment not recorded');if(paid&&!method)reasons.push('Payment method missing');if(price===null)reasons.push('Service price missing');
  if(reasons.length)issues.push({row,reasons})
  if(paid){received+=price||0;tips+=tip}
  if(!done)continue
  completed++;service+=price||0;if(!paid)unpaid+=price||0
  const name=String(row.Groomer||'').trim()||'Unassigned',config=groomers.find(g=>g.name===name),saved=amount(row['Commission Percent']),rate=saved??amount(config?.commissionPercent)
  const item=team.get(name)||{name,commission:0,tips:0,missingRate:false};if(rate===null)item.missingRate=true;else item.commission+=(price||0)*rate/100;if(paid)item.tips+=tip;team.set(name,item)
 }
 return {stops:active.length,completed,service,received,tips,unpaid,issues,team:[...team.values()].map(t=>({...t,payout:t.commission+t.tips}))}
}
