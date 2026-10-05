import { useEffect, useRef, useState } from 'react'
import { businessDateKey, mondayForDate } from './shared.jsx'

// Saved schedules stay keyed to Monday; only the default displayed week rolls early.
export function plannerWeekForDate(dateKey) {
  const monday = mondayForDate(dateKey)
  const date = new Date(`${dateKey}T12:00:00Z`)
  if (date.getUTCDay() !== 6 && date.getUTCDay() !== 0) return monday
  const next = new Date(`${monday}T12:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 7)
  return next.toISOString().slice(0, 10)
}

function weekValue(key, dateObject) {
  if (!dateObject) return key
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function weekKey(value) {
  if (!(value instanceof Date)) return value
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

export function usePlannerWeekStart({ dateObject = false } = {}) {
  const defaultWeek = useRef(null)
  if (defaultWeek.current === null) defaultWeek.current = plannerWeekForDate(businessDateKey())
  const [week, setWeek] = useState(() => weekValue(defaultWeek.current, dateObject))

  useEffect(() => {
    const update = () => {
      const next = plannerWeekForDate(businessDateKey())
      const previous = defaultWeek.current
      if (next === previous) return
      defaultWeek.current = next
      // Preserve a week the user deliberately navigated to.
      setWeek(current => weekKey(current) === previous ? weekValue(next, dateObject) : current)
    }
    const onVisibility = () => { if (!document.hidden) update() }
    const timer = window.setInterval(update, 30000)
    window.addEventListener('focus', update)
    window.addEventListener('pageshow', update)
    document.addEventListener('visibilitychange', onVisibility)
    update()
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', update)
      window.removeEventListener('pageshow', update)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [dateObject])

  return [week, setWeek]
}
