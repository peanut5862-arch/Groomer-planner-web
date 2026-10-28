const HEX = /^#[0-9a-f]{6}$/i
// Sampled from the approved Betty header; lighter section fills are derived tones.
export const BRAND_COLORS = {navy:'#022550',teal:'#006876',cream:'#fdfaf2',gold:'#f6bf63',white:'#ffffff'}
const DEFAULTS = [BRAND_COLORS.teal,'#e9b78f',BRAND_COLORS.gold]

export function groomerColor(profile) {
  if (!profile) return BRAND_COLORS.navy
  if (HEX.test(profile?.color || '')) return profile.color.toLowerCase()
  if (profile?.id === 'jen') return DEFAULTS[0]
  if (profile?.id === 'haley') return DEFAULTS[1]
  const hash = [...String(profile?.id || profile?.name || '')].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,0)
  return DEFAULTS[hash % DEFAULTS.length]
}

export function groomerColorStyle(profile) {
  const color = groomerColor(profile)
  const rgb = [1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4)
  const luminance = .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]
  return {'--groomer-color':color,'--groomer-tint':`${color}18`,'--groomer-ink':luminance>.179?'#111111':'#ffffff'}
}

export function validGroomerColor(color) { return color === undefined || HEX.test(color) }
