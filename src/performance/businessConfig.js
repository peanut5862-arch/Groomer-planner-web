import { useSyncExternalStore } from 'react'

export const DEFAULT_SETTINGS = {
  businessName:'My grooming business', timeZone:'America/Chicago', bufferMinutes:15,
  route:{avoidTolls:false,maxAddedDriveMinutes:0},
  groomers:[{id:'owner',name:'Me',active:true,workDays:[1,2,3,4,5],startTime:'09:00',endTime:'17:30',homeAddress:'',commissionPercent:0}]
}
export const PAWPULAR_SETTINGS = {
  ...DEFAULT_SETTINGS,businessName:'Pawpular',legacyHomeBases:true,
  groomers:[
    {id:'jen',name:'Jen',active:true,workDays:[2,3,4],startTime:'09:00',endTime:'17:30',homeAddress:'',commissionPercent:0},
    {id:'haley',name:'Haley',active:true,workDays:[1,2,3,4,5],startTime:'08:30',endTime:'17:30',homeAddress:'',commissionPercent:50}
  ]
}
let context = {businessId:null,role:null,settings:DEFAULT_SETTINGS}
const listeners = new Set()
export function setBusinessContext(next) {
  context = next ? {...next,settings:next.settings || DEFAULT_SETTINGS} : {businessId:null,role:null,settings:DEFAULT_SETTINGS}
  listeners.forEach(fn=>fn())
}
export function getBusinessContext() { return context }
export function useBusinessContext() { return useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},getBusinessContext,getBusinessContext) }
export function businessSettings() { return context.settings }
export function groomerNames(includeInactive=false) { return businessSettings().groomers.filter(g=>includeInactive || g.active!==false).map(g=>g.name) }
export function groomerConfig(name) { return businessSettings().groomers.find(g=>g.name===name) || null }
export function firstGroomer() { return groomerNames()[0] || '' }
export function groomerWorksOn(name,dateKey) {
  const g=groomerConfig(name)
  return Boolean(g && g.active!==false && g.workDays.includes(new Date(`${dateKey}T12:00:00Z`).getUTCDay()))
}
export function chooseGroomer(dateKey,{preferred='',assigned=[],counts={}}={}) {
  if (preferred) return groomerWorksOn(preferred,dateKey) ? preferred : ''
  if (assigned.length===1) return groomerWorksOn(assigned[0],dateKey) ? assigned[0] : ''
  return groomerNames().filter(name=>groomerWorksOn(name,dateKey)).sort((a,b)=>(counts[a] || 0)-(counts[b] || 0))[0] || ''
}
export function calendarWorkDays() {
  const days=new Set(businessSettings().groomers.filter(g=>g.active!==false).flatMap(g=>g.workDays))
  return [1,2,3,4,5,6,0].filter(day=>day>=1 && day<=5 || days.has(day))
}
export function validateBusinessSettings(value) {
  const errors=[]
  if (!String(value?.businessName || '').trim()) errors.push('Enter your business name.')
  if (String(value?.businessName || '').length>100) errors.push('Keep the business name under 100 characters.')
  if (!value?.timeZone) errors.push('Choose a valid time zone.')
  try {new Intl.DateTimeFormat('en-US',{timeZone:value?.timeZone}).format()} catch {errors.push('Choose a valid time zone.')}
  if (!Number.isInteger(value?.bufferMinutes) || value.bufferMinutes<0 || value.bufferMinutes>120) errors.push('Appointment gap must be 0–120 minutes.')
  if (!Number.isInteger(value?.route?.maxAddedDriveMinutes) || value.route.maxAddedDriveMinutes<0 || value.route.maxAddedDriveMinutes>240) errors.push('Extra driving limit must be 0–240 minutes; 0 means no limit.')
  if (!Array.isArray(value?.groomers) || !value.groomers.some(g=>g.active!==false)) errors.push('Keep at least one active groomer.')
  const names=new Set(), ids=new Set()
  for (const g of value?.groomers || []) {
    const name=String(g?.name || '').trim()
    if (!name || name.length>50 || ['all','either'].includes(name.toLowerCase())) errors.push('Give each groomer a name of 1–50 characters, other than All or Either.')
    if (names.has(name.toLowerCase()) || ids.has(g.id)) errors.push('Each groomer needs a unique name.')
    names.add(name.toLowerCase());ids.add(g.id)
    if (!Array.isArray(g.workDays) || !g.workDays.length || g.workDays.some(d=>!Number.isInteger(d)||d<0||d>6)) errors.push(`${name || 'Each groomer'} needs valid working days.`)
    const valid=/^([01]\d|2[0-3]):[0-5]\d$/
    if (!valid.test(g.startTime)||!valid.test(g.endTime)||g.startTime>=g.endTime) errors.push(`${name || 'Each groomer'} needs an end time after the start time.`)
    if (String(g.homeAddress || '').length>500) errors.push('Keep starting addresses under 500 characters.')
    if (!Number.isFinite(g.commissionPercent)||g.commissionPercent<0||g.commissionPercent>100) errors.push('Service commission must be 0–100%.')
  }
  return [...new Set(errors)]
}
