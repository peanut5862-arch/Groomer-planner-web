// Short-lived, in-memory reads only. Never cache writes or failed responses.
const entries=new Map()
export function clearScheduleReads(){entries.clear()}
export function readScheduleWeek({businessId,role,week,revision=0,refresh=0,load,now=Date.now}){
 if(!businessId||!role)return Promise.reject(Error('Your business could not be verified.'))
 const key=JSON.stringify([businessId,role,week,revision,refresh]),existing=entries.get(key)
 if(existing&&existing.expires>now())return existing.promise
 const entry={expires:now()+15000,promise:null}
 entry.promise=Promise.resolve().then(load).then(result=>{if(result?.error){if(entries.get(key)===entry)entries.delete(key)}else entry.expires=now()+15000;return result},error=>{if(entries.get(key)===entry)entries.delete(key);throw error})
 entries.set(key,entry)
 if(entries.size>30){for(const [k,e] of entries){if(k!==key&&e.expires<=now())entries.delete(k)}if(entries.size>30)entries.delete(entries.keys().next().value)}
 return entry.promise
}
const waiting=[];let active=0
function drain(){while(active<2&&waiting.length){const {run,resolve,reject}=waiting.shift();active++;Promise.resolve().then(run).then(resolve,reject).finally(()=>{active--;drain()})}}
export function queueRouteRead(run){return new Promise((resolve,reject)=>{waiting.push({run,resolve,reject});drain()})}
