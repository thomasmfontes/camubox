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

export const requestFirebaseToken = async () => {
  try {
    if (!('serviceWorker' in navigator)) {
      console.error('Service Workers não são suportados.');
      return null;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      console.log('[FCM] Permissão ok. Verificando Service Workers...');
      
      // Listar registros atuais para diagnosticar conflitos
      const regs = await navigator.serviceWorker.getRegistrations();
      console.log('[FCM] Registros atuais:', regs.map(r => r.active?.scriptURL || 'inaturo'));

      // Tentar encontrar o registro existente ou criar um novo
      let registration = regs.find(r => r.active?.scriptURL.includes('firebase-messaging-sw.js'));
      
      if (!registration) {
        console.log('[FCM] Registrando novo Service Worker...');
        registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      }

      // Aguardar ficar pronto
      await navigator.serviceWorker.ready;
      
      console.log('[FCM] Service Worker pronto. Registration:', registration);
      
      if (!registration.pushManager) {
        console.error('[FCM] Erro: pushManager não disponível no Service Worker.');
        return null;
      }

      console.log('[FCM] Solicitando token ao Firebase SDK...');
      const token = await getToken(messaging, {
        vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: registration
      });
      
      if (token) {
        console.log('[FCM] Token obtido com sucesso!');
        return token;
      } else {
        console.warn('[FCM] Nenhum token retornado pelo SDK.');
        return null;
      }
    } else {
      console.warn('[FCM] Permissão de notificação negada.');
      return null;
    }
  } catch (error) {
    console.error('[FCM] Erro catastrófico:', error);
    // Se o erro for pushManager, tentar forçar um re-registro
    if (error.message && error.message.includes('pushManager')) {
       console.log('[FCM] Detectado erro de pushManager. Tentando limpar cache...');
    }
    return null;
  }
};

export const onMessageListener = () =>
  new Promise((resolve) => {
    onMessage(messaging, (payload) => {
      resolve(payload);
    });
  });
