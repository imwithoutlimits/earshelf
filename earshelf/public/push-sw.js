// Shows reminder notifications and opens earshelf when one is tapped.
// Loaded into the app's service worker (see workbox.importScripts in vite.config.ts).
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : '' }; }
  const icon = new URL('icons/icon-192.png', self.registration.scope).href;
  event.waitUntil(self.registration.showNotification(data.title || 'earshelf', {
    body: data.body || '',
    icon,
    badge: icon,
    tag: data.tag || 'earshelf',
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((c) => new URL(c.url).origin === self.location.origin);
    if (open) {
      // The app is already open: bring it forward and tell it, instead of reloading the page (which would stop anything that is playing).
      await open.focus();
      open.postMessage({ type: 'earshelf-open', url: target });
      return;
    }
    await self.clients.openWindow(target);
  })());
});
