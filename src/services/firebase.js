import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

export { messaging };

export const requestFirebaseToken = async () => {
  try {
    if (!('serviceWorker' in navigator)) return null;

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const regs = await navigator.serviceWorker.getRegistrations();
      let registration = regs.find(r => r.active?.scriptURL.includes('sw.js'));
      
      if (!registration) {
        // Se o Vite PWA ainda não o registrou, fazemos aqui
        registration = await navigator.serviceWorker.register('/sw.js');
      }

      await navigator.serviceWorker.ready;
      
      if (!registration.pushManager) return null;

      return await getToken(messaging, {
        vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: registration
      });
    }
    return null;
  } catch {
    return null;
  }
};

export const setupForegroundListener = () => {
  return onMessage(messaging, (payload) => {
    // Tenta mostrar notificação nativa mesmo em foreground
    if (Notification.permission === 'granted' && payload.notification) {
      const { title, body, icon, badge } = payload.notification;
      new Notification(title || 'CAMUBOX', {
        body,
        icon: icon || '/pwa-icon.png',
        badge: badge || '/badge-72.png'
      });
    }
  });
};
