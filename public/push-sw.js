/*
 * Match reminders, shown by the service worker. vite-plugin-pwa generates the
 * worker itself; this file is pulled into it (vite.config.ts, importScripts).
 * The server sends { title, body, url, tag } - see worker/src/push.ts.
 */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Matchday', {
      body: data.body || '',
      icon: 'icons/icon-192.png',
      // Android's status bar wants a single-colour shape.
      badge: 'icons/badge-96.png',
      // A newer reminder for the same day replaces the old one rather than stacking.
      tag: data.tag || undefined,
      data: { url: data.url || './' },
    }),
  );
});

// Tapping one brings the app forward - or opens it - where the result prompt
// and the calendar take it from there.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || './', self.registration.scope).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((client) => client.url.startsWith(self.registration.scope));
      if (open) return open.focus();
      return self.clients.openWindow(target);
    })(),
  );
});
