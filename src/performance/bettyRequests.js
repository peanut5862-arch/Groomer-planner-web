const allowedIntents = new Set(['planner_schedule', 'client_price', 'confirmations', 'brief', 'weather', 'general'])

// The lifetime is one submitted question: no answers or schedule data are
// cached between questions. Starting both reads removes a serial network wait.
export function createBettyRequestPlan({ knownIntent = '', preloadSchedule = false, routeRequest, loadSchedule }) {
  let scheduleResult
  const startSchedule = () => {
    if (!scheduleResult) {
      // Capture rejection immediately even when routing finishes later or the
      // chosen intent does not need schedule data (e.g. weather or pricing).
      scheduleResult = Promise.resolve().then(loadSchedule).then(
        value => ({ value }),
        error => ({ error })
      )
    }
    return scheduleResult
  }
  if (preloadSchedule) startSchedule()

  const intent = knownIntent
    ? Promise.resolve(knownIntent)
    : Promise.resolve().then(routeRequest).then(
      value => allowedIntents.has(value) ? value : 'general',
      () => 'general'
    )

  return {
    intent,
    async schedule() {
      const result = await startSchedule()
      if ('error' in result) throw result.error
      return result.value
    }
  }
}
