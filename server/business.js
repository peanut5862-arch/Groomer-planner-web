import {createClient} from '@supabase/supabase-js'
export async function requireBusiness(req) {
 const token=String(req.headers?.authorization || '').replace(/^Bearer\s+/i,'').trim()
 if(!token){const e=Error('Please sign in again.');e.status=401;throw e}
 const url=process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
 const key=process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
 if(!url || !key){const e=Error('The business connection is not configured.');e.status=503;throw e}
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${token}`}}})
 const {data,error}=await client.rpc('get_business_context')
 if(error || !data?.businessId){const e=Error('Your business could not be verified. Please sign in again.');e.status=401;throw e}
 return data
}
export function routeHome(context,name) {
 if(context.role==='viewer' || (context.role==='groomer' && context.groomer!==name))throw Object.assign(Error('This route is not available to your account.'),{status:403})
 const g=context.settings?.groomers?.find(g=>g.name===name)
 if(!g)throw Object.assign(Error('Choose one of your groomers.'),{status:400})
 let home=String(g.homeAddress || '').trim()
 if(!home && context.settings.legacyHomeBases && ['jen','haley'].includes(g.id))home=String(process.env[g.id==='jen'?'JEN_HOME_ADDRESS':'HALEY_HOME_ADDRESS'] || '').trim()
 if(!home)throw Object.assign(Error(`Add ${name}’s starting address in More → Route settings.`),{status:400})
 return home
}
