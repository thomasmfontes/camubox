/* eslint-disable no-undef */
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

// Precaching automático do Vite PWA
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// --- INÍCIO LÓGICA FIREBASE ---
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

firebase.initializeApp({
  messagingSenderId: "399118885219",
  apiKey: "AIzaSyBFH3kTferNsJQTmn6LQIAm87SwYlRxpAM",
  projectId: "camubox-f19b4",
  appId: "1:399118885219:web:d5b8c6c09e384d5668b356"
});

const messaging = firebase.messaging();

// Interceptação nativa ultra-robusta (Garante que a notificação apareça com os ícones corretos)
self.addEventListener('push', (event) => {
  console.log('[SW] Push received!', event);
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
      console.log('[SW] Payload JSON:', payload);
    } catch (e) {
      console.error('[SW] Error parsing payload:', e);
      payload = { data: { title: 'CAMUBOX', body: event.data.text() } };
    }
  }

  const notification = payload.notification || {};
  const dataPayload = payload.data || {};

  // Se o payload for data-only (FCM v1), as infos virão em dataPayload
  const title = notification.title || dataPayload.title || 'CAMUBOX';
  const body = notification.body || dataPayload.body || 'Você tem uma nova atualização.';
  const icon = notification.icon || dataPayload.icon || '/pwa-icon.png';
  const badge = notification.badge || dataPayload.badge || '/badge-72.png';

  console.log('[SW] Displaying notification with:', { title, icon, badge });

  const options = {
    body,
    icon,
    badge,
    vibrate: [100, 50, 100],
    data: {
      ...dataPayload,
      link: dataPayload.url || dataPayload.link || '/'
    },
    tag: 'camubox-push-id'
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes('camubox.com') && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(link);
    })
  );
});
// --- FIM LÓGICA FIREBASE ---

// Lógica de atualização automática (skipWaiting)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
