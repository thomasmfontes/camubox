import { useState, useEffect } from 'react';
import { Download, X, Smartphone } from 'lucide-react';
import './InstallPWA.css';

const InstallPWA = () => {
  const [supportsPWA, setSupportsPWA] = useState(false);
  const [promptInstall, setPromptInstall] = useState(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setSupportsPWA(true);
      setPromptInstall(e);
      
      // Show after a small delay to not annoy immediately
      setTimeout(() => {
        const dismissed = sessionStorage.getItem('pwa_banner_dismissed');
        if (!dismissed) {
          setIsVisible(true);
        }
      }, 3000);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Also check if already installed
    window.addEventListener('appinstalled', () => {
      setIsVisible(false);
      setSupportsPWA(false);
    });

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const onClickInstall = async () => {
    if (!promptInstall) return;
    
    promptInstall.prompt();
    const { outcome } = await promptInstall.userChoice;
    
    if (outcome === 'accepted') {
      setIsVisible(false);
    }
  };

  const onDismiss = () => {
    setIsVisible(false);
    sessionStorage.setItem('pwa_banner_dismissed', 'true');
  };

  if (!isVisible) return null;

  return (
    <div className="pwa-install-banner">
      <div className="pwa-content">
        <div className="pwa-icon-box">
          <Smartphone size={24} className="pwa-icon" />
          <div className="pwa-pulse" />
        </div>
        <div className="pwa-text">
          <h3>Instalar CAMUBOX</h3>
          <p>Tenha acesso rápido e notificações instalando o app.</p>
        </div>
      </div>
      <div className="pwa-actions">
        <button className="btn-pwa-dismiss" onClick={onDismiss}>
          Agora não
        </button>
        <button className="btn-pwa-install" onClick={onClickInstall}>
          <Download size={18} />
          Instalar
        </button>
      </div>
      <button className="pwa-close-x" onClick={onDismiss}>
        <X size={16} />
      </button>
    </div>
  );
};

export default InstallPWA;
