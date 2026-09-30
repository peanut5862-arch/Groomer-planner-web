function send(res, status, payload) {
  res.status(status)
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function secondsFromGoogleDuration(value) {
  const match = String(value || '').match(/^([0-9.]+)s$/)
  return match ? Number(match[1]) : 0
}

function cleanStop(stop, index) {
  return {
    id:String(stop?.id || `stop-${index}`),
    owner:String(stop?.owner || `Stop ${index + 1}`).trim(),
    address:String(stop?.address || '').trim()
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return send(res, 405, {error:'Use POST for route calculations.'})
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return send(res, 500, {error:'GOOGLE_MAPS_API_KEY is not configured in Vercel.'})

  const stops = (Array.isArray(req.body?.stops) ? req.body.stops : []).map(cleanStop)
  if (stops.length < 2) return send(res, 400, {error:'At least two client addresses are required.'})
  if (stops.length > 12) return send(res, 400, {error:'Please calculate no more than 12 stops at once.'})
  if (stops.some(stop=>!stop.address)) return send(res, 400, {error:'Every stop needs a street address.'})

  try {
    const legs = await Promise.all(stops.slice(1).map(async (destination, index) => {
      const origin = stops[index]
      const googleResponse = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'X-Goog-Api-Key':apiKey,
          'X-Goog-FieldMask':'routes.duration,routes.staticDuration,routes.distanceMeters'
        },
        body:JSON.stringify({
          origin:{address:origin.address},
          destination:{address:destination.address},
          travelMode:'DRIVE',
          routingPreference:'TRAFFIC_AWARE',
          computeAlternativeRoutes:false,
          languageCode:'en-US',
          units:'IMPERIAL'
        })
      })

      const body = await googleResponse.json().catch(()=>({}))
      if (!googleResponse.ok) {
        const message = body?.error?.message || `Google Routes returned ${googleResponse.status}.`
        throw new Error(message)
      }

      const route = body?.routes?.[0]
      if (!route) throw new Error(`Google could not find a driving route from ${origin.owner} to ${destination.owner}.`)

      const seconds = secondsFromGoogleDuration(route.duration)
      const staticSeconds = secondsFromGoogleDuration(route.staticDuration)
      const distanceMeters = Number(route.distanceMeters || 0)

      return {
        fromId:origin.id,
        toId:destination.id,
        fromOwner:origin.owner,
        toOwner:destination.owner,
        minutes:seconds / 60,
        miles:distanceMeters / 1609.344,
        trafficDelayMinutes:Math.max(0,(seconds-staticSeconds)/60)
      }
    }))

    return send(res, 200, {
      source:'Google Routes API',
      trafficAware:true,
      fetchedAt:new Date().toISOString(),
      totalMinutes:legs.reduce((sum,leg)=>sum + Number(leg.minutes || 0),0),
      totalMiles:legs.reduce((sum,leg)=>sum + Number(leg.miles || 0),0),
      legs
    })
  } catch (error) {
    return send(res, 502, {error:error?.message || 'Google route calculation failed.'})
  }
}
