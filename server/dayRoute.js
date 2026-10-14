// Keep fixed anchors chronological; move flexible stops after an anchor when they cannot fit before it.
export async function optimizeDayRoute(stops,home,compute,{start=540,buffer=0}={}) {
  const anchors=stops.filter(s=>s.fixed).sort((a,b)=>a.scheduled-b.scheduled)
  const buckets=Array.from({length:anchors.length+1},()=>[])
  for(const stop of stops.filter(s=>!s.fixed)){const i=anchors.findIndex(a=>a.scheduled>stop.scheduled);buckets[i<0?anchors.length:i].push(stop)}
  const cache=new Map()
  const cached=async(a,b,m)=>{const key=JSON.stringify([a.id,b.id,m.map(s=>s.id)]);if(!cache.has(key))cache.set(key,await compute(a,b,m));return cache.get(key)}
  for(let attempt=0;attempt<=stops.length*anchors.length;attempt++){
    const arranged=buckets.flatMap((bucket,i)=>[...bucket,...(anchors[i]?[anchors[i]]:[])])
    const result=await routeSegments(arranged,home,cached)
    let cursor=result.stops[0]?.fixed?result.stops[0].scheduled:start, moved=false
    for(let i=0;i<result.stops.length;i++){
      const stop=result.stops[i];const earliest=i===0?cursor:cursor+Math.ceil(result.legs[i].minutes)
      if(stop.fixed&&!stop.completed&&earliest>stop.scheduled){
        const bucket=anchors.indexOf(stop)
        if(buckets[bucket].length){const last=result.stops.slice(0,i).reverse().find(s=>buckets[bucket].includes(s));buckets[bucket]=buckets[bucket].filter(s=>s!==last);buckets[bucket+1].unshift(last);moved=true;break}
      }
      cursor=(stop.completed?stop.scheduled:stop.fixed?Math.max(earliest,stop.scheduled):earliest)+stop.duration+buffer
    }
    if(!moved)return result
  }
  throw new Error("Could not fit the flexible stops around the fixed appointments.")
}

async function routeSegments(stops,home,compute) {
  let origin={id:'home-start',owner:'Starting address',address:home},pending=[],ordered=[],legs=[]
  for(const destination of [...stops.filter(stop=>stop.fixed),{id:'home-end',owner:'Return home',address:home}]) {
    const endIndex=destination.id==='home-end'?stops.length:stops.indexOf(destination)
    const startIndex=origin.id==='home-start'?0:stops.indexOf(origin)+1
    pending=stops.slice(startIndex,endIndex)
    const route=await compute(origin,destination,pending)
    const indices=route.optimizedIntermediateWaypointIndex || pending.map((_,index)=>index)
    if(indices.length!==pending.length || new Set(indices).size!==pending.length || indices.some(index=>!Number.isInteger(index)||index<0||index>=pending.length))throw new Error('Google returned an invalid stop order.')
    const segment=indices.map(index=>pending[index])
    if(route.legs?.length!==segment.length+1)throw new Error('Google did not return every driving leg.')
    const chain=[origin,...segment,destination]
    route.legs.forEach((leg,index)=>{
      const match=String(leg.duration || '').match(/^([0-9.]+)s$/)
      if(!match)throw new Error('Google did not return a driving duration.')
      legs.push({fromId:chain[index].id,toId:chain[index+1].id,minutes:Number(match[1])/60,miles:Number(leg.distanceMeters || 0)/1609.344})
    })
    ordered.push(...segment,...(destination.id==='home-end'?[]:[destination]))
    origin=destination
  }
  return {stops:ordered,legs,totalMinutes:legs.reduce((sum,leg)=>sum+leg.minutes,0),totalMiles:legs.reduce((sum,leg)=>sum+leg.miles,0)}
}
