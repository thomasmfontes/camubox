import { useState, useEffect } from 'react';
import { Bell, Smartphone, AlertTriangle, CheckCircle, X, Loader2, Info } from 'lucide-react';
import { requestFirebaseToken } from '../services/firebase';
import { dbService } from '../services/supabaseClient';
import './PushNotificationPrompt.css';

const PushNotificationPrompt = ({ user }) => {
  const [permission, setPermission] = useState('default');
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [hasSupport, setHasSupport] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [registrationError, setRegistrationError] = useState(null);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // 1. Check support
    const hasNotificationSupport = typeof window !== 'undefined' && 'Notification' in window;
    setHasSupport(hasNotificationSupport);
    
    if (hasNotificationSupport) {
      setPermission(Notification.permission);
    } else {
      setPermission('denied');
    }

    // 2. Check environment
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    
    setIsIOS(isIOSDevice);
    setIsStandalone(isStandaloneMode);

    // 3. Check if user dismissed it for this session
    const dismissed = sessionStorage.getItem('push_prompt_dismissed');
    if (dismissed) {
      setIsDismissed(true);
    }
  }, []);

  useEffect(() => {
    console.log('[PushNotificationPrompt] Diagnostic State Changed:', {
      permission,
      isIOS,
      isStandalone,
      hasSupport,
      isDismissed,
      isDev: import.meta.env.DEV
    });
  }, [permission, isIOS, isStandalone, hasSupport, isDismissed]);

  const handleEnableNotifications = async () => {
    if (!hasSupport) return;
    setIsRegistering(true);
    setRegistrationError(null);

    try {
      // Direct user gesture starts permission request
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);

      if (permissionResult === 'granted') {
        // Request token (safe messaging inside firebase.js)
        const token = await requestFirebaseToken();
        
        if (token && user?.email) {
          const res = await dbService.fcmTokens.upsert(user.email, token);
          if (res.error) {
            console.error('[PushNotification] Error syncing token with DB:', res.error);
          } else {
            console.log('[PushNotification] Token successfully synced.');
          }
        }
        setRegistrationSuccess(true);
      } else if (permissionResult === 'denied') {
        setRegistrationError('Permissão recusada nas configurações do navegador.');
      }
    } catch (err) {
      console.error('[PushNotification] Registration error:', err);
      setRegistrationError('Houve um erro ao solicitar permissão. Tente novamente.');
    } finally {
      setIsRegistering(false);
    }
  };

  const handleDismiss = () => {
    sessionStorage.setItem('push_prompt_dismissed', 'true');
    setIsDismissed(true);
  };

  // Do not show if dismissed
  if (isDismissed) return null;

  // State: Development Mode helper when notifications are not supported (e.g. Insecure HTTP Network / Dev environment)
  if (!hasSupport && !isIOS) {
    if (import.meta.env.DEV) {
      return (
        <div className="push-prompt-container dev-warning-card">
          <div className="push-prompt-glass" />
          <div className="push-prompt-content">
            <div className="push-icon-circle dev-warning animate-pulse-accent">
              <AlertTriangle size={22} className="warning-icon" />
            </div>
            <div className="push-text-details">
              <h4>Modo Dev: Notificações Indisponíveis (Ambiente Inseguro) ⚠️</h4>
              <p>
                A API de <code>Notification</code> não está ativa. Isso é comum ao acessar por IP de rede local (ex: <code>http://192.168.x.x:5173</code>) no celular ou em guias anônimas que desativam permissões.
              </p>
              <div className="push-settings-guide">
                <span>Para testar notificações no celular, use HTTPS (ex: Cloudflare Tunnel, ngrok) ou acesse via <strong>localhost</strong>.</span>
              </div>
            </div>
          </div>
          <button className="btn-dismiss-x" onClick={handleDismiss} title="Fechar">
            <X size={16} />
          </button>
        </div>
      );
    }
    return null;
  }

  // State 1: Permission is already granted, or was just granted in this session
  if (permission === 'granted' || registrationSuccess) {
    return (
      <div className="push-prompt-container success-card">
        <div className="push-prompt-glass" />
        <div className="push-prompt-content">
          <div className="push-icon-circle success animate-pulse-green">
            <CheckCircle size={22} className="success-icon" />
          </div>
          <div className="push-text-details">
            <h4>Notificações Ativas! 🔔</h4>
            <p>Excelente! Você agora receberá alertas importantes sobre prazos de locações, senhas e manutenções em tempo real.</p>
          </div>
        </div>
        <button className="btn-dismiss-x" onClick={handleDismiss} title="Fechar">
          <X size={16} />
        </button>
      </div>
    );
  }

  // State 2: Permission is denied (blocked)
  if (permission === 'denied') {
    return (
      <div className="push-prompt-container blocked-card">
        <div className="push-prompt-glass" />
        <div className="push-prompt-content">
          <div className="push-icon-circle blocked">
            <AlertTriangle size={22} className="blocked-icon" />
          </div>
          <div className="push-text-details">
            <h4>Notificações Bloqueadas ⚠️</h4>
            <p>
              O CAMUBOX está impedido de enviar notificações. Para receber avisos urgentes:
            </p>
            <div className="push-settings-guide">
              {isIOS ? (
                <span>Vá em <strong>Ajustes &gt; Notificações &gt; Safari / CAMUBOX</strong> e ative "Permitir Notificações".</span>
              ) : (
                <span>Clique no ícone de cadeado/configurações ao lado da barra de URL do seu navegador e altere "Notificações" para "Permitir".</span>
              )}
            </div>
          </div>
        </div>
        <button className="btn-dismiss-x" onClick={handleDismiss} title="Fechar">
          <X size={16} />
        </button>
      </div>
    );
  }

  // State 3: iOS but NOT installed as PWA (standalone)
  if (isIOS && !isStandalone) {
    return (
      <div className="push-prompt-container ios-helper-card">
        <div className="push-prompt-glass" />
        <div className="push-prompt-content">
          <div className="push-icon-circle info-ios">
            <Smartphone size={22} className="info-icon" />
          </div>
          <div className="push-text-details">
            <h4>Alertas no iPhone 📱</h4>
            <p>
              Para ativar notificações no iPhone, você precisa instalar o aplicativo primeiro. 
              Use o banner na parte inferior da tela para <strong>"Adicionar à Tela de Início"</strong>. 
              Após abrir o app instalado, você poderá habilitar as notificações com um clique!
            </p>
          </div>
        </div>
        <div className="ios-badge-indicator">
          <Info size={14} />
          <span>Requisito do sistema iOS da Apple</span>
        </div>
      </div>
    );
  }

  // State 4: Default/Prompt State (PWA installed on iOS, or any other browser/Android)
  return (
    <div className="push-prompt-container opt-in-card">
      <div className="push-prompt-glass" />
      <div className="push-prompt-content">
        <div className="push-icon-circle alert animate-pulse-accent">
          <Bell size={22} className="alert-icon" />
        </div>
        <div className="push-text-details">
          <h4>Deseja receber avisos sobre seus armários? 🔔</h4>
          <p>
            Ative as notificações para receber alertas imediatos quando seu contrato estiver prestes a vencer, quando vistorias forem agendadas ou se sua senha for alterada.
          </p>
          {registrationError && (
            <div className="registration-error-text">
              <AlertTriangle size={12} style={{ marginRight: '4px' }} />
              {registrationError}
            </div>
          )}
        </div>
      </div>
      <div className="push-prompt-actions">
        <button className="btn-push-later" onClick={handleDismiss}>
          Mais tarde
        </button>
        <button 
          className="btn-push-enable" 
          onClick={handleEnableNotifications}
          disabled={isRegistering}
        >
          {isRegistering ? (
            <>
              <Loader2 className="spinner-loader" size={16} />
              <span>Ativando...</span>
            </>
          ) : (
            <span>Ativar Notificações</span>
          )}
        </button>
      </div>
    </div>
  );
};

export default PushNotificationPrompt;
