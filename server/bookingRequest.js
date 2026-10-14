export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function cleanBookingRequest(value){
 const text=(k,max,required=false)=>{const s=String(value?.[k]??'').trim();if(s.length>max||(required&&!s))throw Error(`Check ${k}.`);return s}
 const name=text('name',100,true),phone=text('phone',40,true),email=text('email',254),address=text('address',500,true),area=text('area',100),preferences=text('preferences',2000),preferredDate=text('preferredDate',10,true)
 if(phone.replace(/\D/g,'').length<7||address.length<5||!/^\d{4}-\d{2}-\d{2}$/.test(preferredDate)||new Date(preferredDate+'T12:00:00Z').toISOString().slice(0,10)!==preferredDate)throw Error('Check your phone, address and preferred date.')
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Check your email.')
 if(value?.consent!==true)throw Error('Please allow the business to contact you about this request.')
 if(!Array.isArray(value?.dogs)||!value.dogs.length||value.dogs.length>8)throw Error('Add 1–8 dogs.')
 const dogs=value.dogs.map(d=>{const name=String(d?.name||'').trim(),details=String(d?.details||'').trim(),service=String(d?.service||'');if(!name||name.length>80||details.length>300||!['Groom','Bath','Partial Groom','Not sure'].includes(service))throw Error('Check each dog’s name and service.');return {name,details,service}})
 if(new Set(dogs.map(d=>d.name.toLowerCase())).size!==dogs.length)throw Error('Use a different name for each dog.')
 return {name,phone,email,address,area,preferences,preferredDate,dogs,consent:true}
}
