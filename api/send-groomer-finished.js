import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

function send(res,status,payload){
  res.status(status)
  res.setHeader('Cache-Control','no-store')
  res.setHeader('Content-Type','application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function bearer(req){
  const value=String(req.headers.authorization || '')
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : ''
}

function adminClient(){
  const url=String(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim()
  const key=String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if(!url || !key) throw new Error('Supabase server environment variables are not configured in Vercel.')
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
}

function clockMinutes(value){
  const text=String(value || '').trim().toUpperCase().replace(/\./g,'').replace(/\s+/g,' ')
  const match=text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/)
  if(!match) return Number.POSITIVE_INFINITY
  let hour=Number(match[1]);const minute=Number(match[2]);const period=match[3]
  if(minute>59) return Number.POSITIVE_INFINITY
  if(period){if(hour<1 || hour>12)return Number.POSITIVE_INFINITY;hour=(hour%12)+(period==='PM'?12:0)}
  if(!period && hour>23) return Number.POSITIVE_INFINITY
  return hour*60+minute
}

function displayClock(value){
  const minutes=clockMinutes(value)
  if(!Number.isFinite(minutes)) return String(value || '').trim()
  const h24=Math.floor(minutes/60)%24
  const mins=Math.floor(minutes)%60
  return `${h24%12 || 12}:${String(mins).padStart(2,'0')} ${h24>=12?'PM':'AM'}`
}

function activeRow(row){
  const status=String(row?.['Appointment Status'] || '').trim().toLowerCase()
  return String(row?.Owner || '').trim() && !['cancelled','canceled','moved to another week'].includes(status)
}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*')
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization')
  if(req.method==='OPTIONS')return res.status(204).end()
  if(req.method!=='POST'){
    res.setHeader('Allow','POST')
    return send(res,405,{error:'Use POST to send a finish notification.'})
  }

  try{
    const publicKey=String(process.env.VITE_VAPID_PUBLIC_KEY || '').trim()
    const privateKey=String(process.env.VAPID_PRIVATE_KEY || '').trim()
    if(!publicKey || !privateKey) return send(res,500,{error:'VAPID keys are not configured in Vercel.'})

    const token=bearer(req)
    if(!token) return send(res,401,{error:'Sign in again before marking a stop finished.'})

    const admin=adminClient()
    const {data:userData,error:userError}=await admin.auth.getUser(token)
    const user=userData?.user
    if(userError || !user) return send(res,401,{error:'Your sign-in session could not be verified.'})

    const {data:member,error:memberError}=await admin.from('planner_members').select('business_id,role,groomer').eq('user_id',user.id).maybeSingle()
    if(memberError)throw memberError
    const groomer=member?.role==='groomer' ? member.groomer : ''
    if(!groomer)return send(res,403,{error:'This account is not a groomer account.'})

    const body=typeof req.body==='string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const eventId=String(body.eventId || '').trim()
    if(!eventId) return send(res,400,{error:'The finish event is missing.'})

    const {data:eventRows,error:eventError}=await admin.from('groomer_finish_events')
      .select('id,groomer,week_start,row_index,owner,dogs,appointment_date,appointment_time,payment_received_type,push_sent_at')
      .eq('business_id',member.business_id).eq('id',eventId).limit(1)
    if(eventError) throw eventError
    const event=eventRows?.[0]
    if(!event || event.groomer!==groomer) return send(res,403,{error:'This finish event does not belong to your groomer account.'})
    if(event.push_sent_at) return send(res,200,{ok:true,sent:0,alreadySent:true})

    let next=null
    const {data:weekRows,error:weekError}=await admin.from('weekly_drafts').select('plan_json').eq('business_id',member.business_id).eq('week_start',event.week_start).limit(1)
    if(weekError) throw weekError
    const plan=Array.isArray(weekRows?.[0]?.plan_json) ? weekRows[0].plan_json : []
    const currentTime=clockMinutes(event.appointment_time)
    next=plan
      .filter(row=>activeRow(row) && String(row?.Groomer || '').trim()===groomer && String(row?.Date || '').slice(0,10)===String(event.appointment_date || '').slice(0,10))
      .map(row=>({owner:String(row.Owner || '').trim(),dogs:String(row.Dogs || '').trim(),time:String(row['Start Time'] || '').trim(),minutes:clockMinutes(row['Start Time'])}))
      .filter(row=>Number.isFinite(row.minutes) && row.minutes>currentTime)
      .sort((a,b)=>a.minutes-b.minutes)[0] || null

    const subject=String(process.env.VAPID_SUBJECT || req.headers.origin || 'https://grooming-planner.invalid').trim()
    webpush.setVapidDetails(subject,publicKey,privateKey)

    const {data:subscriptions,error:subscriptionError}=await admin.from('push_subscriptions')
      .select('id,subscription').eq('business_id',member.business_id).eq('enabled',true)
    if(subscriptionError) throw subscriptionError

    const dogText=String(event.dogs || '').trim()
    const paymentType=String(event.payment_received_type || '').trim()
    const finishedText=`${groomer} finished ${event.owner}${dogText ? ` · ${dogText}` : ''}.`
    const paymentText=paymentType ? ` Payment: ${paymentType}.` : ''
    const nextText=next ? ` Next: ${next.owner}${next.time ? ` at ${displayClock(next.time)}` : ''}.` : ' No more scheduled stops today.'
    const payload=JSON.stringify({
      title:`${groomer} finished a stop`,
      body:`${finishedText}${paymentText}${nextText}`,
      tag:`groomer-finished-${event.id}`,
      url:'/'
    })

    if(!(subscriptions || []).length){
      return send(res,409,{error:'No enabled owner phone subscription was found.'})
    }

    let sent=0
    const stale=[]
    const failures=[]

    await Promise.all((subscriptions || []).map(async row=>{
      try{
        await webpush.sendNotification(row.subscription,payload,{TTL:300,urgency:'high'})
        sent+=1
      }catch(error){
        const statusCode=Number(error?.statusCode || 0) || null
        const body=String(error?.body || '').trim()
        const message=String(error?.message || 'Push provider rejected the notification.').trim()

        failures.push({
          id:row.id,
          statusCode,
          message,
          body:body.slice(0,500)
        })

        if(statusCode===404 || statusCode===410) stale.push(row.id)
      }
    }))

    if(stale.length){
      await admin.from('push_subscriptions')
        .update({enabled:false,updated_at:new Date().toISOString()})
        .eq('business_id',member.business_id).in('id',stale)
    }

    if(sent>0){
      const {error:markError}=await admin
        .from('groomer_finish_events')
        .update({push_sent_at:new Date().toISOString()})
        .eq('business_id',member.business_id).eq('id',event.id)

      if(markError) throw markError

      return send(res,200,{
        ok:true,
        sent,
        next:next?{owner:next.owner,time:next.time}:null
      })
    }

    const first=failures[0] || {}
    const detail=[
      first.statusCode ? `Push service returned ${first.statusCode}.` : '',
      first.message || '',
      first.body || ''
    ].filter(Boolean).join(' ')

    return send(res,502,{
      error:detail || 'The push provider rejected the notification.',
      failures:failures.length
    })
  }catch(error){
    return send(res,500,{error:error?.message || 'Could not send the finish notification.'})
  }
}
