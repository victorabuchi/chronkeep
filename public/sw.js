// Shows ChronKeep reminders as system notifications, even when no ChronKeep tab is open.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch { m = { title: 'ChronKeep', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(m.title || 'ChronKeep', {
    body: m.body || '',
    tag: m.tag || undefined,
    icon: '/icon-192.png',
    badge: '/favicon-32.png',
    data: { url: m.url || '/app' },
    requireInteraction: false,
  }));
});

// Clicking one opens the item (or brings the open ChronKeep tab to the front).
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/app';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((all) => {
    const open = all.find((c) => new URL(c.url).pathname.startsWith('/app'));
    if (open) { open.navigate(url); return open.focus(); }
    return self.clients.openWindow(url);
  }));
});
