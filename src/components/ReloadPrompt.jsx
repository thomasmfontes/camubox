
import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';
import './ReloadPrompt.css';

function ReloadPrompt() {
  const registrationRef = React.useRef(null);

  const {
    offlineReady: [offlineReady, setOfflineReady] = [false, () => {}],
    needUpdate: [needUpdate, setNeedUpdate] = [false, () => {}],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered: ', r);
      registrationRef.current = r;
      if (r) {
        setInterval(() => {
          r.update();
        }, 60 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  // Check for updates when user returns to the app
  React.useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && registrationRef.current) {
        registrationRef.current.update();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const close = () => {
    setOfflineReady(false);
    setNeedUpdate(false);
  };

  if (!offlineReady && !needUpdate) return null;

  return (
    <div className="reload-prompt-container">
      <div className="reload-prompt-toast">
        <div className="message">
          {offlineReady ? (
            <span>App pronto para uso offline!</span>
          ) : (
            <span>Nova versão disponível! Clique para atualizar.</span>
          )}
        </div>
        <div className="actions">
          {needUpdate && (
            <button className="reload-btn" onClick={() => updateServiceWorker(true)}>
              <RefreshCw size={16} />
              Atualizar agora
            </button>
          )}
          <button className="close-btn" onClick={() => close()}>
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default ReloadPrompt;
