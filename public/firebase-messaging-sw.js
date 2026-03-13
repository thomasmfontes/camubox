importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Os valores abaixo serão lidos do sw-env mas como SW não acessa import.meta,
// precisamos injetar ou usar o sender ID diretamente se for estático.
// Para PWA com Vite, podemos configurar o vite-plugin-pwa ou injetar os valores.
// No Firebase, o MessagingSenderId é o principal campo necessário aqui.

firebase.initializeApp({
  messagingSenderId: "399118885219",
  apiKey: "AIzaSyBFH3kTferNsJQTmn6LQIAm87SwYlRxpAM",
  projectId: "camubox-f19b4",
  appId: "1:399118885219:web:d5b8c6c09e384d5668b356"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/pwa-icon.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
