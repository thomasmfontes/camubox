
import { useState, useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import './ReloadPrompt.css';

function ReloadPrompt() {
  const [needUpdate, setNeedUpdate] = useState(false);
  const registrationRef = useRef(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const checkForUpdate = async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return;

      await reg.update();

      if (reg.waiting && navigator.serviceWorker.controller) {
        setNeedUpdate(true);
      }
    };

    navigator.serviceWorker.ready.then((reg) => {
      registrationRef.current = reg;

      // If a SW is already waiting when the app loads
      if (reg.waiting && navigator.serviceWorker.controller) {
        setNeedUpdate(true);
      }

      // Listen for a newly installed SW entering "waiting"
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setNeedUpdate(true);
          }
        });
      });
    });

    // Check on every tab focus
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdate();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Also check every 30 minutes
    const interval = setInterval(checkForUpdate, 30 * 60 * 1000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(interval);
    };
  }, []);

  const handleUpdate = () => {
    const waiting = registrationRef.current?.waiting;
    if (waiting) {
      waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    // Reload after SW activates
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    }, { once: true });
    // Fallback reload after 1s if controllerchange doesn't fire
    setTimeout(() => window.location.reload(), 1000);
  };

  if (!needUpdate) return null;

  return (
    <div className="reload-prompt-container">
      <div className="reload-prompt-toast">
        <div className="reload-header">
          <div className="reload-icon-wrap">
            <RefreshCw size={18} />
          </div>
          <div className="reload-text">
            <strong>Nova versão disponível</strong>
            <span>Atualize para carregar as últimas melhorias.</span>
          </div>
        </div>
        <button className="reload-btn" onClick={handleUpdate}>
          Atualizar agora
        </button>
      </div>
    </div>
  );
}

export default ReloadPrompt;
