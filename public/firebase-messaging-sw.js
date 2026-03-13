/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

// Configuração idêntica ao frontend para o Service Worker
firebase.initializeApp({
  messagingSenderId: "399118885219",
  apiKey: "AIzaSyBFH3kTferNsJQTmn6LQIAm87SwYlRxpAM",
  projectId: "camubox-f19b4",
  appId: "1:399118885219:web:d5b8c6c09e384d5668b356"
});

const messaging = firebase.messaging();

/**
 * IMPORTANTE: Para evitar que o Chrome mostre a mensagem 
 * "Este site foi atualizado em segundo plano", precisamos garantir que 
 * showNotification seja chamado e retornado como uma Promise.
 */

// Interceptador nativo (Camada 1 - Segurança máxima)
self.addEventListener('push', (event) => {
  console.log('[SW] Evento PUSH nativo detectado:', event);

  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch (e) {
      console.warn('[SW] Push sem JSON válido ou vazio. Tentando texto...');
      payload = { notification: { title: 'CAMUBOX', body: event.data.text() } };
    }
  }

  console.log('[SW] Payload extraído:', payload);

  const title = payload.notification?.title || payload.data?.title || 'CAMUBOX';
  const body = payload.notification?.body || payload.data?.body || 'Nova atualização do sistema.';

  const promiseChain = self.registration.showNotification(title, {
    body: body,
    icon: '/pwa-icon.png',
    badge: '/pwa-icon.png',
    data: payload.data || {},
    tag: 'camubox-alert' // Agrupa notificações similares
  });

  event.waitUntil(promiseChain);
});

// Listener do SDK (Camada 2 - Pode disparar em paralelo, o 'tag' acima evita duplicados)
messaging.onBackgroundMessage((payload) => {
  console.log('[SW SDK] Background message:', payload);
});

// Handler de clique
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link || '/dashboard/lockers';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Se já tiver uma aba aberta, foca nela
      for (const client of windowClients) {
        if (client.url.includes('camubox.com') && 'focus' in client) {
          return client.focus();
        }
      }
      // Senão abre nova
      if (clients.openWindow) return clients.openWindow(link);
    })
  );
});
