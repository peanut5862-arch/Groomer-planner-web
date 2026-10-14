import {createClient} from '@supabase/supabase-js'
import {createHmac} from 'node:crypto'
import {UUID,cleanBookingRequest} from '../server/bookingRequest.js'
export function createBookingHandler(makeClient=createClient,env=process.env){return async(req,res)=>{
 const send=(code,body)=>{res.status(code);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body))}
 res.setHeader('Cache-Control','no-store');res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type')
 if(req.method==='OPTIONS')return res.status(204).end()
 if(!['GET','POST'].includes(req.method))return send(405,{error:'Method not supported.'})
 const url=env.SUPABASE_URL||env.VITE_SUPABASE_URL,key=env.SUPABASE_SERVICE_ROLE_KEY
 if(!url||!key)return send(503,{error:'Booking requests are not available yet.'})
 try{
  let body={};if(req.method==='POST'){try{body=typeof req.body==='string'?JSON.parse(req.body):req.body||{}}catch{return send(400,{error:'Invalid request.'})};if(JSON.stringify(body).length>12000)return send(413,{error:'Keep your request shorter.'})}
  const token=String(req.method==='GET'?req.query?.token:body.token||'')
  if(!UUID.test(token))return send(404,{error:'This booking link is unavailable.'})
  const client=makeClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
  if(req.method==='GET'){
   const {data,error}=await client.rpc('booking_link_info',{p_token:token})
   if(error)return send(503,{error:'Could not open booking requests. Please try again.'})
   return data?send(200,{name:data.name,timeZone:data.timeZone}):send(404,{error:'This business is not taking online requests right now.'})
  }
  if(body.website)return send(400,{error:'Could not send this request.'})
  if(!UUID.test(String(body.submissionId||'')))return send(400,{error:'Reload the form and try again.'})
  let payload;try{payload=cleanBookingRequest(body)}catch(e){return send(400,{error:e.message})}
  const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim()
  const hash=createHmac('sha256',key).update(ip).digest('hex')
  const {data,error}=await client.rpc('submit_booking_request',{p_token:token,p_submission:body.submissionId,p_payload:payload,p_sender_hash:hash})
  if(error)return send(400,{error:['P0001'].includes(error.code)?error.message:'Could not send your request. Please contact the business or try again.'})
  return send(200,{received:Boolean(data)})
 }catch{return send(503,{error:'Could not connect. Your request may have arrived; retry with this same form to avoid duplicates.'})}
}}
export default createBookingHandler()
