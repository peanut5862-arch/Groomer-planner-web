import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Preserve recovery intent before the auth client consumes and clears URL tokens.
if (typeof window !== 'undefined') {
  const callback = new URLSearchParams(window.location.hash.slice(1))
  if (callback.get('type') === 'recovery' && callback.has('access_token')) {
    sessionStorage.setItem('hey-betty-recovery', '1')
  }
}

export const supabase =
  url && publishableKey
    ? createClient(url, publishableKey)
    : null

// Initialization may finish before React mounts its auth listener.
if (supabase) {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') sessionStorage.setItem('hey-betty-recovery', '1')
    if (event === 'SIGNED_OUT') sessionStorage.removeItem('hey-betty-recovery')
  })
}
