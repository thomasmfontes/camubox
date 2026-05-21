import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

let messaging = null;

// Safe async initialization of messaging to avoid throwing errors on unsupported browsers (e.g. Safari tabs, Private windows)
const getSafeMessaging = async () => {
  if (messaging) return messaging;
  try {
    const supported = await isSupported();
    if (supported) {
      messaging = getMessaging(app);
      return messaging;
    }
  } catch (err) {
    console.warn('[Firebase] Safe messaging initialization failed or unsupported:', err);
  }
  return null;
};

export const requestFirebaseToken = async () => {
  try {
    if (!('serviceWorker' in navigator)) return null;

    const messagingInstance = await getSafeMessaging();
    if (!messagingInstance) {
      console.warn('[Firebase] Messaging not supported on this browser context.');
      return null;
    }

    // Rely on permission being checked/granted before calling this
    const permission = Notification.permission;
    if (permission !== 'granted') {
      console.warn('[Firebase] Notification permission not granted yet.');
      return null;
    }

    const regs = await navigator.serviceWorker.getRegistrations();
    let registration = regs.find(r => 
      r.active?.scriptURL.includes('sw.js') || 
      r.active?.scriptURL.includes('dev-sw.js')
    );
    
    if (!registration) {
      if (import.meta.env.DEV) {
        registration = await navigator.serviceWorker.register('/dev-sw.js', { type: 'module' });
      } else {
        registration = await navigator.serviceWorker.register('/sw.js');
      }
    }

    await navigator.serviceWorker.ready;
    
    if (!registration.pushManager) return null;

    return await getToken(messagingInstance, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration
    });
  } catch (err) {
    console.error('[Firebase] Error requesting Firebase token:', err);
    return null;
  }
};

export const setupForegroundListener = (onMessageReceived) => {
  let unsubscribe = () => {};

  getSafeMessaging().then((messagingInstance) => {
    if (!messagingInstance) return;

    unsubscribe = onMessage(messagingInstance, (payload) => {
      console.log('[Firebase Foreground] Push received in foreground:', payload);
      
      if (onMessageReceived) {
        onMessageReceived(payload);
      } else if (Notification.permission === 'granted' && payload.notification) {
        const { title, body, icon, badge } = payload.notification;
        new Notification(title || 'CAMUBOX', {
          body,
          icon: icon || '/pwa-icon.png',
          badge: badge || '/badge-72.png'
        });
      }
    });
  });

  return () => unsubscribe();
};
