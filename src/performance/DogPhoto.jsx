import React, {useEffect, useRef, useState} from 'react'
import {supabase} from '../supabase.js'
import {getBusinessContext} from './businessConfig.js'

const BUCKET='dog-photos'
export async function prepareDogPhoto(file) {
  if (!file || !file.type.startsWith('image/')) throw new Error('Choose a photo file.')
  if (file.size>20*1024*1024) throw new Error('Choose a photo smaller than 20 MB.')
  const url=URL.createObjectURL(file)
  try {
    const img=new Image()
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('This photo could not be opened. Try a JPEG or PNG.'));img.src=url})
    const scale=Math.min(1,1200/Math.max(img.naturalWidth,img.naturalHeight))
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale))
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height)
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.85))
    if (!blob || blob.size>5*1024*1024) throw new Error('This photo could not be prepared. Try another photo.')
    return blob
  } finally {URL.revokeObjectURL(url)}
}
export default function DogPhoto({householdId,dogName,editable=false,removable=editable}) {
  const [photo,setPhoto]=useState(null),[url,setUrl]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[loading,setLoading]=useState(true),[changing,setChanging]=useState(false)
  const camera=useRef(null),library=useRef(null),generation=useRef(0)
  const businessId=getBusinessContext().businessId
  useEffect(()=>{
    const current=++generation.current;setPhoto(null);setUrl('');setMessage('');setLoading(true);setChanging(false)
    if (!businessId || !householdId || !dogName) {setLoading(false);return}
    ;(async()=>{
      const {data,error}=await supabase.from('planner_dog_photos').select('object_path,dog_name').eq('household_id',householdId)
      if(current!==generation.current)return
      if(error){setLoading(false);setMessage(editable?'Photos are not available yet.':'');return}
      const matches=(data || []).filter(p=>String(p.dog_name || '').trim().toLowerCase()===String(dogName).trim().toLowerCase());
      const saved=matches.find(p=>p.dog_name===dogName) || matches[0]
      if(saved){const result=await supabase.storage.from(BUCKET).createSignedUrl(saved.object_path,3600);if(current===generation.current){setPhoto(saved);setUrl(result.data?.signedUrl || '');if(result.error)setMessage('Could not load the saved photo.')}}
      if(current===generation.current)setLoading(false)
    })().catch(()=>{if(current===generation.current){setLoading(false);setMessage('Could not load the photo. Please try again.')}})
    return ()=>{generation.current++}
  },[businessId,householdId,dogName,editable])
  async function upload(event){
    const file=event.target.files?.[0];event.target.value='';if(!file || busy)return
    setBusy(true);setMessage('');let path=''
    try {
      const blob=await prepareDogPhoto(file);const {data:auth,error:authError}=await supabase.auth.getUser();if(authError || !auth.user)throw new Error('Please sign in again.');path=`${businessId}/${auth.user.id}/${crypto.randomUUID()}.jpg`
      const uploaded=await supabase.storage.from(BUCKET).upload(path,blob,{contentType:'image/jpeg',upsert:false});if(uploaded.error)throw uploaded.error
      const saved=await supabase.from('planner_dog_photos').upsert({business_id:businessId,household_id:householdId,dog_name:photo?.dog_name || dogName,object_path:path},{onConflict:'business_id,household_id,dog_name'});if(saved.error)throw saved.error
      const oldPath=photo?.object_path;setPhoto({object_path:path});setChanging(false)
      const signed=await supabase.storage.from(BUCKET).createSignedUrl(path,3600);setUrl(signed.data?.signedUrl || '')
      if(oldPath)await supabase.storage.from(BUCKET).remove([oldPath])
      setMessage('Photo saved.');path=''
    } catch(error){if(path)await supabase.storage.from(BUCKET).remove([path]);setMessage('Could not save the photo. Please try again.')} finally{setBusy(false)}
  }
  async function remove(){
    if(!photo || busy || !window.confirm(`Remove ${dogName}’s photo?`))return
    setBusy(true);setMessage('')
    const {error}=await supabase.from('planner_dog_photos').delete().eq('household_id',householdId).eq('dog_name',photo.dog_name || dogName)
    if(error)setMessage('Could not remove the photo. Please try again.')
    else{await supabase.storage.from(BUCKET).remove([photo.object_path]);setPhoto(null);setUrl('');setMessage('Photo removed.')}
    setBusy(false)
  }
  if(!householdId || !dogName)return null
  if(!editable && !url)return null
  return <div style={{marginTop:10}}>
    {url && <img src={url} alt={dogName} style={{width:140,height:140,objectFit:'cover',borderRadius:14,display:'block',marginBottom:8}}/>}
    {loading && <div role="status" style={{fontSize:12}}>Loading photo…</div>}
    {editable && !loading && photo && !changing && <button type="button" className="secondary-btn" onClick={()=>setChanging(true)}>Change photo</button>}
    {editable && !loading && (!photo || changing) && <><input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={upload}/><input ref={library} type="file" accept="image/*" hidden onChange={upload}/><div className="dog-photo-actions"><button type="button" className="secondary-btn" disabled={busy} onClick={()=>camera.current.click()}>Take photo</button><button type="button" className="secondary-btn" disabled={busy} onClick={()=>library.current.click()}>{photo?'Replace photo':'Choose photo'}</button>{photo && <button type="button" className="secondary-btn" disabled={busy} onClick={()=>setChanging(false)}>Cancel</button>}{photo && removable && <button type="button" className="secondary-btn" disabled={busy} onClick={remove}>Remove photo</button>}</div></>}
    {(busy || message) && <div role="status" className="photo-message">{busy?'Saving photo…':message}</div>}
  </div>
}
export function AppointmentDogPhotos({appt,householdId:resolvedHouseholdId}) {
  const householdId=resolvedHouseholdId || appt.sourceRow?.['Household ID'] || appt.sourceRow?.household_id
  return <div className="dog-photo-list">{String(appt.dogs || '').split(',').map(part=>part.replace(/\s*\([^)]*\)/g,'').trim()).filter(Boolean).map(dog=><div key={dog}><strong style={{fontSize:12}}>{dog}</strong><DogPhoto householdId={householdId} dogName={dog} editable removable={false}/></div>)}</div>
}
