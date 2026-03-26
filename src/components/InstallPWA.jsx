import { useState, useEffect } from 'react';
import { Download, X, Smartphone } from 'lucide-react';
import './InstallPWA.css';

const InstallPWA = () => {
  const [promptInstall, setPromptInstall] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
    // Let the slideDown animation play (0.5s)
    setTimeout(() => {
      setIsVisible(false);
      setIsClosing(false);
    }, 500);
  };

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
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
      handleClose();
    });

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const onClickInstall = async () => {
    if (!promptInstall) return;
    
    promptInstall.prompt();
    const { outcome } = await promptInstall.userChoice;
    
    if (outcome === 'accepted') {
      handleClose();
    }
  };

  const onDismiss = () => {
    sessionStorage.setItem('pwa_banner_dismissed', 'true');
    handleClose();
  };

  if (!isVisible) return null;

  return (
    <div className={`pwa-install-banner ${isClosing ? 'closing' : ''}`}>
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
    </div>
  );
};

export default InstallPWA;
