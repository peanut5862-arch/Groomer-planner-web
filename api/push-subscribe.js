import { createClient } from '@supabase/supabase-js'

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

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*')
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization')
  if(req.method==='OPTIONS')return res.status(204).end()
  if(req.method!=='POST'){
    res.setHeader('Allow','POST')
    return send(res,405,{error:'Use POST to register this phone.'})
  }

  try{
    const token=bearer(req)
    if(!token) return send(res,401,{error:'Sign in again before enabling notifications.'})

    const admin=adminClient()
    const {data:userData,error:userError}=await admin.auth.getUser(token)
    const user=userData?.user
    if(userError || !user) return send(res,401,{error:'Your sign-in session could not be verified.'})

    const {data:member,error:memberError}=await admin.from('planner_members').select('business_id,role').eq('user_id',user.id).maybeSingle()
    if(memberError)throw memberError
    if(!member || !['owner','editor'].includes(member.role))return send(res,403,{error:'Only the owner/editor account can receive finish notifications.'})

    const subscription=typeof req.body==='string' ? JSON.parse(req.body || '{}')?.subscription : req.body?.subscription
    const endpoint=String(subscription?.endpoint || '').trim()
    const p256dh=String(subscription?.keys?.p256dh || '').trim()
    const authKey=String(subscription?.keys?.auth || '').trim()
    if(!endpoint || !p256dh || !authKey) return send(res,400,{error:'The browser did not provide a complete push subscription.'})

    const {error:saveError}=await admin.from('push_subscriptions').upsert({
      user_id:user.id,
      business_id:member.business_id,
      endpoint,
      subscription,
      enabled:true,
      user_agent:String(req.headers['user-agent'] || '').slice(0,1000),
      updated_at:new Date().toISOString()
    },{onConflict:'endpoint'})
    if(saveError) throw saveError

    return send(res,200,{ok:true})
  }catch(error){
    return send(res,500,{error:error?.message || 'Could not register this phone for notifications.'})
  }
}
