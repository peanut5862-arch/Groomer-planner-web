// Enable after custom SMTP is connected and a confirmation email is verified.
export const CUSTOMER_SIGNUP_READY = false
export const CONFIRMATION_URL = 'https://groomer-planner-web.vercel.app/'
export function needsBusinessSetup(business) {
  return business?.role === 'owner' && Boolean(business.businessId) &&
    business.settings?.onboardingComplete !== true &&
    (business.settings?.onboardingComplete === false ||
      (business.revision === 1 && business.settings?.businessName === 'My grooming business'))
}
export async function createCustomerAccount(auth,{email,password,confirmation}) {
  if(password.length<8) throw Error('Use a password with at least 8 characters.')
  if(password!==confirmation) throw Error('Your passwords do not match.')
  const {data,error}=await auth.signUp({email:email.trim(),password,options:{emailRedirectTo:CONFIRMATION_URL}})
  if(error) throw error
  return data?.session || null
}
export async function resendConfirmation(auth,email) {
  const {error}=await auth.resend({type:'signup',email:email.trim(),options:{emailRedirectTo:CONFIRMATION_URL}})
  if(error) throw error
}
export async function saveWelcomeSettings(client,business,draft) {
  const next={...draft,businessName:draft.businessName.trim(),onboardingComplete:true,
    groomers:draft.groomers.map(g=>({...g,name:g.name.trim(),homeAddress:String(g.homeAddress||'').trim()}))}
  const {data,error}=await client.rpc('save_business_settings',{p_settings:next,p_expected_revision:business.revision})
  if(error)throw error
  if(data?.businessId!==business.businessId || data?.accountId!==business.accountId || data?.settings?.onboardingComplete!==true)
    throw Error('Your setup could not be confirmed. Please try again.')
  return data
}
