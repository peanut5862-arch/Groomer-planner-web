import {requireBusiness,routeHome} from '../server/business.js'
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
    address:String(stop?.address || '').trim(),
    time:String(stop?.time || '').trim(),
    window:String(stop?.window || '').trim()
  }
}

function mapsUrl(homeAddress, clientStops) {
  const params = new URLSearchParams({
    api:'1',
    origin:homeAddress,
    destination:homeAddress,
    travelmode:'driving',
    dir_action:'navigate'
  })
  if (clientStops.length) params.set('waypoints', clientStops.map(stop=>stop.address).join('|'))
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

export default async function handler(req, res) {
  // Allow the Capacitor iPhone app to call this Vercel function.
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(204).end()

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return send(res, 405, {error:'Use POST for route calculations.'})
  }

  let business
  try {business=await requireBusiness(req)} catch(error) {return send(res,error.status || 500,{error:error.message})}
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return send(res, 500, {error:'GOOGLE_MAPS_API_KEY is not configured in Vercel.'})

  if (String(req.body?.mode || '').trim().toLowerCase() === 'eta') {
    const latitude = Number(req.body?.origin?.latitude)
    const longitude = Number(req.body?.origin?.longitude)
    const address = String(req.body?.destination?.address || '').trim()
    const owner = String(req.body?.destination?.owner || 'Client').trim()
    const originAddress=String(req.body?.origin?.address || '').trim()
    const validCoordinates=typeof req.body?.origin?.latitude==='number' && typeof req.body?.origin?.longitude==='number' && Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude)<=90 && Math.abs(longitude)<=180
    if ((!originAddress && !validCoordinates) || originAddress.length>500) return send(res,400,{error:'A valid current location or starting street address is required for live ETA.'})
    if (!address) return send(res,400,{error:'The client needs a street address for live ETA.'})
    try {
      const googleResponse = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'X-Goog-Api-Key':apiKey,
          'X-Goog-FieldMask':'routes.duration,routes.staticDuration,routes.distanceMeters'
        },
        body:JSON.stringify({
          origin:originAddress?{address:originAddress}:{location:{latLng:{latitude,longitude}}},
          destination:{address},
          travelMode:'DRIVE',
          routeModifiers:{avoidTolls:Boolean(business.settings?.route?.avoidTolls)},
          routingPreference:'TRAFFIC_AWARE',
          computeAlternativeRoutes:false,
          languageCode:'en-US',
          units:'IMPERIAL'
        })
      })
      const body = await googleResponse.json().catch(()=>({}))
      if (!googleResponse.ok) throw new Error(body?.error?.message || `Google Routes returned ${googleResponse.status}.`)
      const route = body?.routes?.[0]
      if (!route) throw new Error(`Google could not find a driving route to ${owner}.`)
      if (!/^([0-9.]+)s$/.test(String(route.duration || ''))) throw new Error('Google did not return a driving duration.')
      const seconds = secondsFromGoogleDuration(route.duration)
      const staticSeconds = secondsFromGoogleDuration(route.staticDuration)
      const distanceMeters = Number(route.distanceMeters || 0)
      return send(res,200,{
        source:'Google Routes API',
        trafficAware:true,
        fetchedAt:new Date().toISOString(),
        etaMinutes:seconds/60,
        miles:distanceMeters/1609.344,
        trafficDelayMinutes:Math.max(0,(seconds-staticSeconds)/60)
      })
    } catch (error) {
      return send(res,502,{error:error?.message || 'Google ETA calculation failed.'})
    }
  }

  const groomer = String(req.body?.groomer || '').trim()
  let homeAddress
  try {homeAddress=routeHome(business,groomer)} catch(error) {return send(res,error.status || 400,{error:error.message})}

  const clientStops = (Array.isArray(req.body?.stops) ? req.body.stops : []).map(cleanStop)
  if (clientStops.length < 1) return send(res, 400, {error:'At least one client address is required.'})
  if (clientStops.length > 10) return send(res, 400, {error:'Please calculate no more than 10 client stops at once.'})
  if (clientStops.some(stop=>!stop.address)) return send(res, 400, {error:'Every client stop needs a street address.'})

  const homeStart = {id:'home-start', owner:`${groomer} home`, address:homeAddress}
  const homeEnd = {id:'home-end', owner:`${groomer} home`, address:homeAddress}
  const routeStops = [homeStart, ...clientStops, homeEnd]

  try {
    const legs = await Promise.all(routeStops.slice(1).map(async (destination, index) => {
      const origin = routeStops[index]
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
          routeModifiers:{avoidTolls:Boolean(business.settings?.route?.avoidTolls)},
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
      groomer,
      fetchedAt:new Date().toISOString(),
      totalMinutes:legs.reduce((sum,leg)=>sum + Number(leg.minutes || 0),0),
      totalMiles:legs.reduce((sum,leg)=>sum + Number(leg.miles || 0),0),
      legs,
      mapsUrl:mapsUrl(homeAddress, clientStops)
    })
  } catch (error) {
    return send(res, 502, {error:error?.message || 'Google route calculation failed.'})
  }
}
