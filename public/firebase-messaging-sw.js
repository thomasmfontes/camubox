importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  messagingSenderId: "399118885219",
  apiKey: "AIzaSyBFH3kTferNsJQTmn6LQIAm87SwYlRxpAM",
  projectId: "camubox-f19b4",
  appId: "1:399118885219:web:d5b8c6c09e384d5668b356"
});

const messaging = firebase.messaging();

// Este evento dispara quando o app está em BACKGROUND ou FECHADO
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Mensagem recebida:', payload);
  
  // Extrair dados com fallbacks
  const title = payload.notification?.title || payload.data?.title || 'CAMUBOX';
  const body = payload.notification?.body || payload.data?.body || 'Você tem uma nova mensagem.';
  
  const notificationOptions = {
    body: body,
    icon: '/pwa-icon.png',
    badge: '/pwa-icon.png',
    data: payload.data,
    tag: 'camubox-notification' // Evita duplicatas
  };

  // Garante que uma notificação seja SEMPRE exibida (evita mensagem genérica do Chrome)
  return self.registration.showNotification(title, notificationOptions);
});

// Adicionar listener de clique na notificação
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.link || '/dashboard/lockers';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url === urlToOpen && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(urlToOpen);
    })
  );
});
