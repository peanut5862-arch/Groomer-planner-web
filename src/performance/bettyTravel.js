import {apiFetch,currentPosition} from './shared.jsx'

export function travelQuestion(text) {
  const value=String(text || '').replace(/[’]/g,"'").trim().replace(/[?!]+$/,'')
  if (!/\b(how long|travel time|drive time|driving time|how far)\b/i.test(value)) return null
  const match=value.match(/\b(?:get|drive|travel)\s+to\s+(.+?)(?:\s+from\s+(.+))?[?.!]*$/i) || value.match(/\b(?:travel time|drive time|driving time|how far)\s+(?:is it\s+)?to\s+(.+?)(?:\s+from\s+(.+))?[?.!]*$/i)
  if(!match) return null
  const subject=match[1].replace(/'s(?:\s+(?:house|place|appointment))?$/i,'').trim()
  return subject ? {subject,originText:String(match[2] || '').trim()} : null
}

export function travelFollowup(text,pending,conversation=[]) {
  const direct=travelQuestion(text)
  if(direct) return {...direct,explicit:true}
  const value=String(text || '').trim()
  const current=/^(?:my |the |from (?:my |the )?)?current location[.!?]*$|^(?:from )?(?:here|where i am|where i am now)[.!?]*$/i.test(value)
  const yes=/^(yes|yeah|yep|please|yes please)[.!?]*$/i.test(value)
  if(pending && (yes || current || /^(?:from\s+|\d+\s)/i.test(value))) return {...pending,originText:yes || current?'current location':value.replace(/^from\s+/i,''),explicit:false}
  // Recover an unfinished drive question from an older app's conversation.
  // A bare "yes" never searches older topics; only an explicit origin can recover it.
  if(current) {
    for(const message of [...conversation].reverse()) {
      if(message.role!=='user') continue
      const request=travelQuestion(message.text)
      if(request) return {...request,originText:'current location',explicit:false}
      if(!/^(yes|yeah|yep|please|current location)[.!?]*$/i.test(String(message.text || '').trim())) break
    }
  }
  return null
}

export function matchingTravelClients(groups,subject) {
  const normalize=value=>String(value || '').toLowerCase().replace(/[’]/g,"'").replace(/'s$/,'').trim()
  const needle=normalize(subject)
  const exact=groups.filter(g=>normalize(g.owner)===needle || g.rows.some(r=>normalize(r.dog || r.Dog)===needle))
  if(exact.length) return exact
  return groups.filter(g=>normalize(g.owner).split(/\s+/)[0]===needle)
}

export async function calculateTravelEta({address,owner,originText},{locate=currentPosition,request=apiFetch}={}) {
  if(!address) throw Error(`Add a street address for ${owner} in Clients first.`)
  let origin
  if(/^current location$/i.test(originText)) {
    const position=await locate(7000)
    origin={latitude:position.coords.latitude,longitude:position.coords.longitude}
  } else {
    if(!originText || originText.length>500) throw Error('Enter a starting street address, or say “Current location”.')
    origin={address:originText}
  }
  const controller=new AbortController()
  const timer=setTimeout(()=>controller.abort(),8000)
  try {
    const response=await request('/api/google-route',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'eta',origin,destination:{address,owner}})})
    const payload=await response.json().catch(()=>({}))
    if(!response.ok) throw Error(payload.error || 'Google could not calculate the drive time.')
    if(typeof payload.etaMinutes!=='number' || !Number.isFinite(payload.etaMinutes) || payload.etaMinutes<0 || payload.source!=='Google Routes API') throw Error('Google did not return a valid drive time. Try again.')
    return payload
  } catch(e) {
    if(e.name==='AbortError') throw Error('Google took too long to respond. Please try again.')
    throw e
  } finally {clearTimeout(timer)}
}
