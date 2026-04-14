// ============================================================
// بوابة الحدث - Service Worker for Web Push Notifications
// Handles: Push event display, notification click, subscription
// ============================================================

const NOTIFICATION_ICON = '/favicon-news.png';
const CLICK_ACTION = 'open';

// ============ PUSH EVENT: Display notification when received ============
self.addEventListener('push', (event) => {
  let data = {
    title: 'بوابة الحدث',
    body: 'خبر جديد',
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_ICON,
    url: '/',
    vibrate: [100, 50, 100],
    actions: [
      { action: 'open', title: 'اقرأ الخبر' },
      { action: 'dismiss', title: 'إغلاق' },
    ],
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch (e) {
    console.error('[SW] Failed to parse push data:', e);
    data.body = event.data ? event.data.text() : data.body;
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      image: data.image || undefined,
      vibrate: data.vibrate,
      data: {
        url: data.url || '/',
        articleId: data.data?.articleId || '',
        category: data.data?.category || '',
      },
      dir: 'rtl',
      lang: 'ar',
      actions: data.actions || [],
      tag: data.data?.articleId || 'general',
      renotify: true,
    })
  );
});

// ============ NOTIFICATION CLICK: Open article or homepage ============
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If there's already a window open, focus it
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(urlToOpen);
            return client.focus();
          }
        }
        // Otherwise open a new window
        return self.clients.openWindow(urlToOpen);
      })
  );
});

// ============ NOTIFICATION CLOSE: Track dismiss (optional) ============
self.addEventListener('notificationclose', (event) => {
  // Could track dismissal analytics here
});

// ============ INSTALL: Skip waiting to activate immediately ============
self.addEventListener('install', (event) => {
  console.log('[SW] Service Worker installed');
  self.skipWaiting();
});

// ============ ACTIVATE: Take control of all pages immediately ============
self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker activated');
  event.waitUntil(
    self.clients.claim()
  );
});
