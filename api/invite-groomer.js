import {createClient} from '@supabase/supabase-js'
const REDIRECT='https://groomer-planner-web.vercel.app/'
export function createInviteHandler(makeClient=createClient,env=process.env){
 return async function handler(req,res){
  const send=(status,payload)=>{res.status(status);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(payload))}
  res.setHeader('Cache-Control','no-store');res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization')
  if(req.method==='OPTIONS')return res.status(204).end()
  if(req.method!=='POST')return send(405,{error:'Use POST to send an invitation.'})
  const token=String(req.headers.authorization||'').match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if(!token)return send(401,{error:'Sign in again before inviting a groomer.'})
  let body;try{body=typeof req.body==='string'?JSON.parse(req.body):req.body}catch{return send(400,{error:'Invalid invitation.'})}
  const email=String(body?.email||'').trim().toLowerCase(),groomerId=String(body?.groomerId||'').trim()
  if(!groomerId||groomerId.length>100||email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email))return send(400,{error:'Choose a saved groomer and enter a valid email address.'})
  try{
   const url=env.SUPABASE_URL||env.VITE_SUPABASE_URL,key=env.SUPABASE_SERVICE_ROLE_KEY
   if(!url||!key)return send(503,{error:'Invitations are not configured yet. Please try again later.'})
   const admin=makeClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
   const {data:identity,error:authError}=await admin.auth.getUser(token)
   if(authError||!identity?.user)return send(401,{error:'Your sign-in expired. Please sign in again.'})
   const {data:invite,error:reserveError}=await admin.rpc('reserve_groomer_invite',{p_owner:identity.user.id,p_groomer_id:groomerId,p_email:email})
   if(reserveError)return send(400,{error:reserveError.code==='PGRST202'?'Invitations are being set up. Please try again shortly.':reserveError.message})
   if(invite?.alreadyConnected)return send(200,{alreadyConnected:true,message:'This groomer already has access. They can sign in with their existing password.'})
   if(!invite?.id||invite.email!==email)throw Error('Invalid reservation')
   const result=invite.existingUser
    ?await admin.auth.resetPasswordForEmail(email,{redirectTo:REDIRECT})
    :await admin.auth.admin.inviteUserByEmail(email,{redirectTo:REDIRECT})
   if(result.error)return send(502,{error:'The email could not be sent. Wait a minute, then try Resend invitation.'})
   const {error:markError}=await admin.rpc('mark_groomer_invite_sent',{p_id:invite.id})
   return send(200,{sent:true,message:markError?'Email sent. Refresh settings to update its status.':invite.existingUser?'Setup email sent. The password link will open their groomer setup.':'Invitation sent. They can open the email to choose a password and join your team.'})
  }catch{return send(500,{error:'Could not send the invitation. Please try again shortly.'})}
 }
}
export default createInviteHandler()
