/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

firebase.initializeApp({
  messagingSenderId: "399118885219",
  apiKey: "AIzaSyBFH3kTferNsJQTmn6LQIAm87SwYlRxpAM",
  projectId: "camubox-f19b4",
  appId: "1:399118885219:web:d5b8c6c09e384d5668b356"
});

const messaging = firebase.messaging();

// Força a ativação imediata do novo Service Worker
self.addEventListener('install', () => {
  self.skipWaiting();
});

// Removido clients.claim() para evitar loops de refresh com vite-plugin-pwa
// self.addEventListener('activate', (event) => { event.waitUntil(clients.claim()); });

self.addEventListener('push', (event) => {
  console.log('[SW] Push bruto recebido:', event);

  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { notification: { title: 'CAMUBOX', body: event.data.text() } };
    }
  }

  console.log('[SW] Dados processados:', data);

  // Extração agressiva de conteúdo (Firebase pode mandar de várias formas)
  const notification = data.notification || {};
  const dataPayload = data.data || {};

  const title = notification.title || dataPayload.title || 'CAMUBOX';
  const body = notification.body || dataPayload.body || 'Você tem uma nova atualização.';

  const options = {
    body: body,
    icon: '/pwa-icon.png',
    badge: '/pwa-icon.png',
    vibrate: [100, 50, 100],
    data: dataPayload,
    tag: 'camubox-push-id' // Agrupa notificações
  };

  // O pulo do gato: Retornar a promise do showNotification
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Listener do SDK (opcional, mas ajuda com logs)
messaging.onBackgroundMessage((payload) => {
  console.log('[SW SDK] Payload recebido via SDK:', payload);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes('camubox.com') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(link);
    })
  );
});
