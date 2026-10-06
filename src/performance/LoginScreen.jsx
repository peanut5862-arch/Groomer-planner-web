import React,{useEffect,useState,useRef,useId} from 'react'
import {Eye,EyeOff} from 'lucide-react'
import {supabase} from '../supabase.js'
import {createCustomerAccount,resendConfirmation,CUSTOMER_SIGNUP_READY,CONFIRMATION_URL} from './customerAuth.js'
export function PasswordField({label,...props}) {
 const [visible,setVisible]=useState(false),id=useId()
 return <div><label htmlFor={id}>{label}</label><div style={{position:'relative'}}><input {...props} id={id} type={visible?'text':'password'} style={{width:'100%',paddingRight:52}}/><button type="button" aria-label={`${visible?'Hide':'Show'} ${label.toLowerCase()}`} aria-pressed={visible} disabled={props.disabled} onClick={()=>setVisible(v=>!v)} style={{position:'absolute',right:4,top:'50%',transform:'translateY(-50%)',width:44,height:44,display:'grid',placeItems:'center',border:0,background:'transparent',color:'#34415f',cursor:'pointer'}}>{visible?<EyeOff size={20}/>:<Eye size={20}/>}</button></div></div>
}
export default function LoginScreen({onSignedIn,registrationReady=CUSTOMER_SIGNUP_READY,CONFIRMATION_URL}) {
 const [mode,setMode]=useState('signin'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState('')
 const [loading,setLoading]=useState(false),[message,setMessage]=useState(''),[cooldown,setCooldown]=useState(0)
 const busy=useRef(false)
 useEffect(()=>{if(!cooldown)return;const timer=setTimeout(()=>setCooldown(n=>Math.max(0,n-1)),1000);return()=>clearTimeout(timer)},[cooldown])
 const changeMode=next=>{if(busy.current)return;setMode(next);setMessage('');setPassword('');setConfirmation('')}
 const submit=async event=>{
  event.preventDefault();if(busy.current || (mode==='signup'&&!registrationReady))return;busy.current=true;setLoading(true);setMessage('')
  try {
   if(!supabase)throw Error('The sign-in connection is unavailable. Please try again later.')
   if(mode==='reset'){
    if(cooldown)return
    const {error}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:CONFIRMATION_URL})
    if(error)throw error
    setCooldown(60);setMessage('If an account exists for that email, a reset link is on its way. Check your inbox and spam folder. Open the newest link to choose a new password.')
   }else if(mode==='signup'){
    const session=await createCustomerAccount(supabase.auth,{email,password,confirmation})
    setPassword('');setConfirmation('')
    if(session){onSignedIn(session);return}
    setMode('confirm');setCooldown(60)
    setMessage('Check your inbox and spam folder for a confirmation email. Open its link to confirm your email, then sign in here or continue on the website. If you already have an account, choose Sign in.')
   }else{
    const {data,error}=await supabase.auth.signInWithPassword({email:email.trim(),password})
    if(error)throw error
    if(!data?.session)throw Error('Sign-in could not be confirmed. Please try again.')
    setPassword('');onSignedIn(data.session)
   }
  }catch(e){setMessage(e.message||'Could not connect. Please try again.')}finally{busy.current=false;setLoading(false)}
 }
 const resend=async()=>{
  if(busy.current||cooldown)return;busy.current=true;setLoading(true);setMessage('')
  try{if(!supabase)throw Error('The sign-in connection is unavailable.');await resendConfirmation(supabase.auth,email);setCooldown(60);setMessage('If this account needs confirmation, a new email is on its way. Check your inbox and spam folder.')}
  catch(e){setMessage(e.message||'Could not send the confirmation email. Please try again.')}finally{busy.current=false;setLoading(false)}
 }
 return <div className="login-shell"><div className="login-card">
  <div className="login-brand">HB</div><div className="eyebrow">Your grooming business, organized</div><h1>Hey Betty</h1>
  <h2>{mode==='signup'?'Create your account':mode==='confirm'?'Check your email':mode==='reset'?'Reset your password':'Welcome back'}</h2>
  <p className="login-copy">{mode==='signup'?'Start your own private business dashboard. Add your groomers, clients and appointments after confirming your email.':mode==='confirm'?`We sent confirmation instructions to ${email.trim()}.`:mode==='reset'?'Enter the email you use for Hey Betty. We’ll send a link to choose a new password.':'Sign in to access your clients, routes and schedule.'}</p>
  {mode==='signup'&&!registrationReady&&<div className="login-message" role="status">Customer registration is coming soon. Please check back shortly.</div>}
  {mode!=='confirm' ? <form className="login-form" onSubmit={submit}>
   <label>Email<input type="email" autoComplete="email" required value={email} disabled={loading||(mode==='signup'&&!registrationReady)} onChange={e=>setEmail(e.target.value)}/></label>
   {mode!=='reset'&&<PasswordField key={mode} label="Password" autoComplete={mode==='signup'?'new-password':'current-password'} minLength={mode==='signup'?8:undefined} required value={password} disabled={loading||(mode==='signup'&&!registrationReady)} onChange={e=>setPassword(e.target.value)}/>}
   {mode==='signup'&&<><p className="settings-help">Use at least 8 characters.</p><PasswordField label="Confirm password" autoComplete="new-password" required value={confirmation} disabled={loading||(mode==='signup'&&!registrationReady)} onChange={e=>setConfirmation(e.target.value)}/></>}
   {message&&<div className="login-message" role="status">{message}</div>}
   <button className="login-button" type="submit" disabled={loading||(mode==='reset'&&cooldown>0)||(mode==='signup'&&!registrationReady)}>{mode==='reset'?(loading?'Sending…':cooldown?`Send again in ${cooldown}s`:'Send reset email'):mode==='signup'&&!registrationReady?'Registration opens soon':loading?(mode==='signup'?'Creating account…':'Signing in…'):(mode==='signup'?'Create account':'Sign in')}</button>
  </form> : <><div className="login-message" role="status">{message}</div><button className="login-button" type="button" disabled={loading||cooldown>0} onClick={resend}>{loading?'Sending…':cooldown?`Resend email in ${cooldown}s`:'Resend confirmation email'}</button></>}
  <div style={{display:"flex",justifyContent:"center",gap:20,flexWrap:"wrap",marginTop:20,fontSize:14}}><a href="mailto:HeyBetty.support@gmail.com">Contact support</a><a href="https://app.pawpular.dog/privacy.html" target="_blank" rel="noopener noreferrer">Privacy policy</a></div>
  <div style={{display:'grid',gap:12,marginTop:20,textAlign:'center'}}>
   <button type="button" className="text-btn" disabled={loading} onClick={()=>changeMode(mode==='signin'?'signup':'signin')}>{mode==='signin'?'New to Hey Betty? Create account':'Already have an account? Sign in'}</button>
   {mode==='signin'&&<button type="button" className="text-btn" disabled={loading} onClick={()=>changeMode('reset')}>Forgot password?</button>}
   {mode==='signin'&&<button type="button" className="text-btn" disabled={loading||!email.trim()} onClick={()=>{setMode('confirm');setMessage('Need a confirmation email? Check the email address above, then choose Resend confirmation email.')}}>Need to confirm your email?</button>}
   {mode==='confirm'&&<button type="button" className="text-btn" disabled={loading} onClick={()=>changeMode('signup')}>Use a different email</button>}
  </div>
 </div></div>
}

export function PasswordRecoveryScreen({onComplete}) {
 const [password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[message,setMessage]=useState(''),[loading,setLoading]=useState(false),[saved,setSaved]=useState(false)
 const busy=useRef(false)
 const submit=async event=>{
  event.preventDefault();if(busy.current)return
  if(password.length<8){setMessage('Use at least 8 characters.');return}
  if(password!==confirmation){setMessage('Your passwords do not match.');return}
  busy.current=true;setLoading(true);setMessage('')
  try{
   if(!supabase)throw Error('The sign-in connection is unavailable.')
   const {error}=await supabase.auth.updateUser({password})
   if(error)throw error
   setPassword('');setConfirmation('');setSaved(true)
   setMessage('Your password has been updated. Continue to your planner.')
  }catch(error){setMessage(error.message||'Could not update your password. Request a new reset email and try again.')}
  finally{busy.current=false;setLoading(false)}
 }
 return <div className="login-shell"><div className="login-card"><div className="login-brand">HB</div><h1>Hey Betty</h1><h2>{saved?'Password updated':'Choose a new password'}</h2>
 {saved?<><p role="status">{message}</p><button className="login-button" onClick={onComplete}>Continue to planner</button></>:<form className="login-form" onSubmit={submit}><PasswordField label="New password" autoComplete="new-password" minLength={8} required value={password} disabled={loading} onChange={e=>setPassword(e.target.value)}/><p>Use at least 8 characters.</p><PasswordField label="Confirm new password" autoComplete="new-password" required value={confirmation} disabled={loading} onChange={e=>setConfirmation(e.target.value)}/>{message&&<p role="alert">{message}</p>}<button className="login-button" disabled={loading}>{loading?'Saving…':'Save new password'}</button></form>}
 </div></div>
}
