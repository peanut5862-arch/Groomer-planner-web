import React, { lazy, Suspense, useEffect, useState } from 'react'

function FeatureNotice({ sheet, open, onClose, error, onRetry }) {
  if (sheet && !open) return null
  const message = error ? 'This section could not load. Please try again.' : 'Loading…'
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
  render() {
    return this.state.error
      ? <FeatureNotice {...this.props.notice} error={this.state.error} onRetry={this.props.onRetry}/>
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
    const retry = () => {
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
