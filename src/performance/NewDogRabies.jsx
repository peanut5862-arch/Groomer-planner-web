import React from 'react'
import {supabase} from '../supabase.js'
import {getBusinessContext} from './businessConfig.js'
import {prepareDogPhoto} from './DogPhoto.jsx'
export default function NewDogRabies({dog,onChange}){
 return <fieldset style={{gridColumn:'1 / -1',border:'1px solid #d8dfea',borderRadius:12,padding:12}}><legend>Rabies record (optional)</legend><label>Rabies expiration date<input type="date" value={dog.rabies_expiry||''} onChange={e=>onChange({rabies_expiry:e.target.value})}/></label><label>Certificate photo<input type="file" accept="image/*" onChange={e=>onChange({rabies_file:e.target.files?.[0]||null})}/></label>{dog.rabies_file instanceof File&&<p>{dog.rabies_file.name} · ready to save</p>}<p style={{fontSize:12}}>You can add this later on the client card. Selected photos must be chosen again if you reload before saving.</p></fieldset>
}
export async function saveNewDogRabies(householdId,dog){
 const file=dog.rabies_file instanceof File?dog.rabies_file:null
 if(!dog.rabies_expiry&&!file)return
 const {businessId}=getBusinessContext();let path=''
 try{
  const {data,error}=await supabase.from('planner_rabies_records').select('*').eq('business_id',businessId).eq('household_id',householdId)
  if(error)throw error
  const old=data?.find(r=>r.dog_name.trim().toLowerCase()===dog.dog.trim().toLowerCase())
  if(file){const photo=await prepareDogPhoto(file),auth=await supabase.auth.getUser();if(auth.error||!auth.data?.user)throw Error('Please sign in again.');path=`${businessId}/${auth.data.user.id}/${crypto.randomUUID()}.jpg`;const upload=await supabase.storage.from('rabies-certificates').upload(path,photo,{contentType:'image/jpeg'});if(upload.error)throw upload.error}
  const saved=await supabase.from('planner_rabies_records').upsert({business_id:businessId,household_id:householdId,dog_name:old?.dog_name||dog.dog.trim(),expires_on:dog.rabies_expiry||old?.expires_on||null,certificate_path:path||old?.certificate_path||null,updated_at:new Date().toISOString()},{onConflict:'business_id,household_id,dog_name'})
  if(saved.error)throw saved.error
  const previous=old?.certificate_path;path='';if(file&&previous)await supabase.storage.from('rabies-certificates').remove([previous])
 }catch(error){if(path)await supabase.storage.from('rabies-certificates').remove([path]);throw Error(`${dog.dog}: client saved, but the rabies record could not be saved. Please retry or add it from the client card.`)}
}
