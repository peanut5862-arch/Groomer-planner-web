self.addEventListener('push', event => {
  let data = {}

  try {
    data = event.data?.json?.() || {}
  } catch {
    data = {
      body: event.data?.text?.() || ''
    }
  }

  const title = data.title || 'Grooming Planner'

  const options = {
    body: data.body || 'A groomer finished a stop.',
    tag: data.tag || 'grooming-planner-finish',
    renotify: true,
    data: {
      url: data.url || '/'
    },
    badge: '/favicon.ico'
  }

  event.waitUntil(
    self.registration.showNotification(title, options)
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()

  const target =
    event.notification?.data?.url || '/'

  event.waitUntil((async () => {
    const windows = await clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    })

    for (const client of windows) {
      if ('focus' in client) {
        if ('navigate' in client) {
          await client.navigate(target)
        }

        return client.focus()
      }
    }

    if (clients.openWindow) {
      return clients.openWindow(target)
    }
  })())
})
