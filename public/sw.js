// ==============================================================================
// MediLab Service Worker for Push Notifications, Turn Alerts & Med Reminders
// ==============================================================================

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle clicking on notifications
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If a window is already open, focus it and navigate
      for (const client of windowClients) {
        if ('focus' in client) {
          if (client.url && client.url.includes(urlToOpen)) {
            return client.focus();
          }
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Handle incoming Web Push events from server
self.addEventListener('push', (event) => {
  let data = {
    title: 'MediLab Alert',
    body: 'You have a new update regarding your clinic visit or medication.',
    icon: '/logo.png',
    badge: '/logo.png',
    url: '/dashboard',
    tag: 'medilab-general',
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch (e) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/logo.png',
    badge: data.badge || '/logo.png',
    vibrate: data.vibrate || [300, 150, 300, 150, 300],
    data: { url: data.url || '/dashboard' },
    tag: data.tag || 'medilab-push',
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Allow webpage to trigger service worker notification
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    self.registration.showNotification(title, options);
  }
});
