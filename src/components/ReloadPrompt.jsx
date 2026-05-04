
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
    setNeedUpdate(false); // Esconde a mensagem instantaneamente para evitar sensação de clique duplo
    
    const waiting = registrationRef.current?.waiting;
    if (!waiting) {
      window.location.reload();
      return;
    }

    let refreshed = false;
    
    // Recarrega a página assim que o novo Service Worker assumir o controle
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshed) {
        refreshed = true;
        window.location.reload();
      }
    });

    // Avisa o Service Worker para pular a fila
    waiting.postMessage({ type: 'SKIP_WAITING' });

    // Fallback de segurança maior para caso o controllerchange falhe (evita recarregar com o SW ainda em waiting)
    setTimeout(() => {
      if (!refreshed) {
        refreshed = true;
        window.location.reload();
      }
    }, 3000);
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
