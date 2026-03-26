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
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch (e) {
      payload = { notification: { title: 'CAMUBOX', body: event.data.text() } };
    }
  }

  const notification = payload.notification || {};
  const dataPayload = payload.data || {};

  // Busca ícones do payload (vindo das APIs do Vercel) ou usa defaults
  const title = notification.title || dataPayload.title || 'CAMUBOX';
  const body = notification.body || dataPayload.body || 'Você tem uma nova atualização.';
  const icon = notification.icon || dataPayload.icon || '/pwa-icon.png';
  const badge = notification.badge || dataPayload.badge || '/badge-72.png';

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

  // Se o navegador já estiver mostrando a notificação (por causa do campo 'notification' no FCM v1), 
  // este showNotification pode gerar a duplicata. 
  // Porém, em muitos navegadores, se a gente não chamar, nada aparece se o app estiver fechado.
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
