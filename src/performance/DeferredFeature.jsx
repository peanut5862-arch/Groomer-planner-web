import React, { lazy, Suspense, useEffect, useState } from 'react'

export function staleFeatureError(error) {
  return /failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module|loading chunk .*failed|unable to preload css/i.test(String(error?.message || error || ''))
}
export function recoverStaleFeature({storage,reload=()=>window.location.reload(),online=window.navigator.onLine,now=Date.now()}={}) {
  if(online===false)return false
  try {
    storage=storage||window.sessionStorage
    const key='hey-betty:feature-recovery',last=Number(storage.getItem(key)||0)
    if(last && now-last<300000)return false
    storage.setItem(key,String(now));reload();return true
  } catch { return false }
}

function FeatureNotice({ sheet, open, onClose, error, onRetry }) {
  if (sheet && !open) return null
  const message = error ? (staleFeatureError(error)?'This page needs the latest app update. Tap Try again to reload.':'This section could not load. Please try again.') : 'Loading…'
  const content = <div className="prototype-note" role={error ? 'alert' : 'status'}>
    {message}
    {error && <button type="button" className="text-btn" onClick={onRetry}>Try again</button>}
  </div>
  if (!sheet) return content
  return <div className="sheet-backdrop">
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Loading section">
      {content}
      <div className="sheet-actions"><button type="button" className="ghost" onClick={onClose}>Close</button></div>
    </div>
  </div>
}

class FeatureErrorBoundary extends React.Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error) {
    if(!this.props.notice.sheet && staleFeatureError(error))recoverStaleFeature()
  }
  render() {
    return this.state.error
      ? <FeatureNotice {...this.props.notice} error={this.state.error} onRetry={()=>this.props.onRetry(this.state.error)}/>
      : this.props.children
  }
}

function PageReady({ children }) {
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event('grooming-section-ready'))
    })
    return () => window.cancelAnimationFrame(frame)
  }, [])
  return children
}

// Each import is a literal local path so Vite includes its chunk in dist and
// Capacitor copies it into the iOS app with the rest of the web assets.
export function createLazyFeature(loader, { sheet = false } = {}) {
  // Created at module scope by App.jsx; reused when a tab is revisited.
  let cachedComponent = lazy(loader)
  function LazyFeature(props) {
    const [attempt, setAttempt] = useState(0)
    const [Component, setComponent] = useState(() => cachedComponent)
    const notice = { sheet, open: Boolean(props.open ?? props.appt), onClose: props.onClose }
    const content = <Component {...props}/>
    const retry = error => {
      if(staleFeatureError(error)){window.location.reload();return}
      cachedComponent = lazy(loader)
      setComponent(() => cachedComponent)
      setAttempt(value => value + 1)
    }
    return <FeatureErrorBoundary key={attempt} notice={notice} onRetry={retry}>
      <Suspense fallback={<FeatureNotice {...notice}/>}>{sheet ? content : <PageReady>{content}</PageReady>}</Suspense>
    </FeatureErrorBoundary>
  }
  return LazyFeature
}

// Delay the first mount until a sheet is requested, then retain its state and
// existing close/pagehide effects through subsequent opens and closes.
export function DeferredSheet({ open, children }) {
  const [hasOpened, setHasOpened] = useState(Boolean(open))
  if (open && !hasOpened) setHasOpened(true)
  return open || hasOpened ? children : null
}
