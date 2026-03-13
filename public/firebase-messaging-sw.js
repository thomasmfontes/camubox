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
  console.log('[SW] Mensagem em background recebida:', payload);
  
  if (!payload.notification) {
    console.warn('[SW] Mensagem recebida sem payload de notificação');
    return;
  }

  const notificationTitle = payload.notification.title || 'CAMUBOX';
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/pwa-icon.png',
    badge: '/pwa-icon.png',
    data: payload.data // Passa dados extras
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});
