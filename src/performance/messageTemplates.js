export const MESSAGE_TEMPLATES={
 confirmation:{label:'Confirmation',text:'Hi {name}! Just confirming your grooming appointment{pets_phrase} on {date}.{window_phrase} Please reply to confirm. Thank you!'},
 reminder:{label:'Reminder',text:'Hi {name}! This is {business} reminding you of your grooming appointment{pets_phrase} on {date}.{window_phrase} Please reply to confirm. Thank you!'},
 reschedule:{label:'Reschedule',text:'Hi {name}! I need to move your grooming appointment. Would {date}{time_phrase} work for you instead?'},
 area:{label:'Back in your area',text:'No problem! We will be back in the area {date}.'}
}
export const TEMPLATE_TOKENS=['name','pets','pets_phrase','business','date','window','window_phrase','time_phrase']
export function templateErrors(templates={}){
 const errors=[]
 for(const [key,value] of Object.entries(templates||{})){
  if(!MESSAGE_TEMPLATES[key])continue
  if(typeof value!=='string'||!value.trim()||value.length>1000){errors.push(`${MESSAGE_TEMPLATES[key].label}: enter 1–1,000 characters.`);continue}
  const stripped=value.replace(/\{([a-z_]+)\}/g,(token,name)=>{if(!TEMPLATE_TOKENS.includes(name))errors.push(`Unknown field ${token}.`);return ''})
  if(/[{}]/.test(stripped))errors.push('Use complete fields such as {name} and {date}.')
 }
 return [...new Set(errors)]
}
export function renderMessage(key,values={},templates={}){
 const custom=templates?.[key],text=typeof custom==='string'&&custom.trim()&&!templateErrors({[key]:custom}).length?custom:MESSAGE_TEMPLATES[key].text
 const data={...values,pets_phrase:values.pets?` for ${values.pets}`:'',window_phrase:values.window?` Arrival between ${values.window}.`:''}
 return text.replace(/\{([a-z_]+)\}/g,(_,name)=>String(data[name]??''))
}
