import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import MainLayout from './components/MainLayout';
import LoginPage from './pages/LoginPage';
import AdminHome from './pages/AdminHome';
import LockerManagement from './pages/LockerManagement';
import UserLockerSelection from './pages/UserLockerSelection';
import DigitalContract from './pages/DigitalContract';
import PixPayment from './pages/PixPayment';
import LockerInspection from './pages/LockerInspection';
import AdminSettings from './pages/AdminSettings';
import AdminContracts from './pages/AdminContracts';
import AdminPayments from './pages/AdminPayments';
import AdminFees from './pages/AdminFees';
import UserMyLockers from './pages/UserMyLockers';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import { supabase, dbService, authService } from './services/supabaseClient';
import InstallPWA from './components/InstallPWA';
import { requestFirebaseToken, setupForegroundListener } from './services/firebase';
import ScrollToTop from './components/ScrollToTop';
import ReloadPrompt from './components/ReloadPrompt';
import { biometricService } from './services/biometricService';
import { Fingerprint, CheckCircle, X } from 'lucide-react';

// User Mock Pages
// User Home is now replaced by direct redirection to lockers

function App() {


  const location = useLocation();
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('camubox_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  const handleFCMRegistration = async (email) => {
    try {
      const token = await requestFirebaseToken();
      if (token && email) {
        await dbService.fcmTokens.upsert(email, token);
      }
    } catch (err) {
      console.error('[App] FCM Registration error:', err);
    }
  };

  const syncUserSession = async (supabaseUser) => {
    try {
      // Try to find user in our t_usuario table
      const { data: dbUser } = await dbService.users.getByEmail(supabaseUser.email);
      
      const userData = {
        uid: supabaseUser.id, // Auth UUID para FCM e referências nativas
        id_usuario: dbUser?.id_usuario || supabaseUser.id,
        name: dbUser?.nm_usuario || supabaseUser.user_metadata?.full_name || supabaseUser.email,
        email: dbUser?.dc_email || supabaseUser.email,
        isAdmin: !!dbUser?.is_adm, // Real admin check from DB
        isOAuth: true
      };

      console.log('[App] Syncing user data into state/storage:', userData);
      setUser(userData);
      localStorage.setItem('camubox_user', JSON.stringify(userData));
    } catch (err) {
      console.error('[App] Error syncing user session:', err);
    }
  };

  useEffect(() => {
    // 1. Initial Session Check
    const checkSession = async () => {
      if (!supabase) {
        setIsLoadingAuth(false);
        return;
      }

      const { data: { session } } = await authService.getSession();
      console.log('[App] Auth session check result:', session?.user ? 'Found session' : 'No session');
      if (session?.user) {
        await syncUserSession(session.user);
      }
      setIsLoadingAuth(false);
    };

    checkSession();

    // 2. Auth State Change Listener
    const { data: { subscription } } = supabase?.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        await syncUserSession(session.user);
      } else if (event === 'SIGNED_OUT') {
        // Apenas limpamos se o evento for explicitamente logout
        setUser(null);
        localStorage.removeItem('camubox_user');
      }
    }) || { data: { subscription: null } };

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    // Escutar mensagens em foreground
    const unsubscribe = setupForegroundListener();
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user?.email) {
      handleFCMRegistration(user.email);
    }
  }, [user?.email]);

  const handleLogin = (userData) => {
    setUser(userData);
    localStorage.setItem('camubox_user', JSON.stringify(userData));
    
    // Haptic feedback: vibrar duas vezes rápido no login
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([60, 100, 60]);
    }
  };

  const handleLogout = async () => {
    await authService.signOut();
    setUser(null);
    localStorage.removeItem('camubox_user');
  };

  if (isLoadingAuth) {
    return (
      <div style={{ 
        height: '100vh', 
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#003d2b',
        gap: '24px'
      }}>
        <img 
          src="/pwa-icon.png" 
          alt="CAMUBOX"
          style={{ width: '80px', height: '80px', borderRadius: '20px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }} 
        />
        <div style={{
          width: '120px',
          height: '3px',
          background: 'rgba(255,255,255,0.15)',
          borderRadius: '100px',
          overflow: 'hidden'
        }}>
          <div style={{
            height: '100%',
            background: 'rgba(255,255,255,0.8)',
            borderRadius: '100px',
            animation: 'camubox-load 1.2s ease-in-out infinite'
          }} />
        </div>
        <style>{`
          @keyframes camubox-load {
            0%   { width: 0%; margin-left: 0; }
            50%  { width: 60%; margin-left: 20%; }
            100% { width: 0%; margin-left: 100%; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <>
      <ScrollToTop />
      <Routes location={location} key={location.pathname.split('/')[1] === 'dashboard' ? 'dashboard-root' : location.pathname}>
        <Route path="/" element={<LoginPage onLogin={handleLogin} />} />
        <Route path="/privacidade" element={<PrivacyPolicy />} />
        <Route path="/termos-de-uso" element={<TermsOfService />} />

        {/* Protected Dashboard Routes */}
        <Route
          path="/dashboard/*"
          element={
            user ? (
              <DashboardLayout user={user} handleLogout={handleLogout} location={location} />
            ) : (
              <Navigate to="/" />
            )
          }
        />
      </Routes>
      <InstallPWA />
      <ReloadPrompt />
    </>
  );
}

// Separate component to help ESLint and clean up App
function DashboardLayout({ user, handleLogout, location }) {
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);
  const [biometricStatus, setBiometricStatus] = useState(null);

  useEffect(() => {
    const justLoggedIn = sessionStorage.getItem('camubox_just_logged_in') === 'true';
    if (justLoggedIn && user?.email) {
      const isSupported = biometricService.isSupported();
      const hasRegistered = biometricService.hasRegistered(user.email);
      const dismissed = localStorage.getItem(`camubox_biometric_prompt_dismissed_${user.email}`);

      console.log('[Biometrics Prompt Diagnostic]', {
        justLoggedIn,
        email: user.email,
        isSupported,
        hasRegistered,
        dismissed
      });

      if (isSupported && !hasRegistered && !dismissed) {
        const timer = setTimeout(() => {
          console.log('[Biometrics Prompt] Showing modal...');
          sessionStorage.removeItem('camubox_just_logged_in');
          setShowBiometricPrompt(true);
        }, 1200); // Pequeno delay de 1.2s para esperar o carregamento da página/efeitos de entrada
        return () => clearTimeout(timer);
      }
    } else {
      console.log('[Biometrics Prompt Diagnostic] Conditions not met:', {
        justLoggedIn,
        email: user?.email
      });
    }
  }, [user?.email]);

  return (
    <MainLayout user={user} onLogout={handleLogout}>
      <div style={{ width: '100%', height: '100%', overflow: 'visible' }}>
          <Routes location={location}>
            <Route path="/" element={user.isAdmin ? <AdminHome /> : <Navigate to="/dashboard/lockers" replace />} />
            <Route path="/admin" element={<AdminHome />} />
            <Route path="/admin/lockers" element={<LockerManagement />} />
            <Route path="/admin/contracts" element={<AdminContracts />} />
            <Route path="/admin/inspections" element={<LockerInspection />} />
            <Route path="/admin/settings" element={<AdminSettings />} />
            <Route path="/admin/payments" element={<AdminPayments />} />
            <Route path="/admin/fees" element={<AdminFees />} />
            <Route path="/lockers" element={<UserLockerSelection user={user} />} />
            <Route path="/checkout/contract" element={<DigitalContract />} />
            <Route path="/checkout/payment" element={<PixPayment user={user} />} />
            <Route path="/my-locker" element={<UserMyLockers user={user} />} />
            <Route path="*" element={<div>Página em construção...</div>} />
          </Routes>
      </div>

      {showBiometricPrompt && (
        <div className="modal-overlay" onClick={() => {
          localStorage.setItem(`camubox_biometric_prompt_dismissed_${user?.email}`, 'true');
          setShowBiometricPrompt(false);
        }}>
          <div className="password-modal" onClick={e => e.stopPropagation()}>
            <button 
              className="btn-modal-close-x"
              onClick={() => {
                localStorage.setItem(`camubox_biometric_prompt_dismissed_${user?.email}`, 'true');
                setShowBiometricPrompt(false);
              }}
            >
              <X size={20} />
            </button>
            
            <div className="modal-header">
              <div className="alert-icon-container" style={{ background: '#f0fdf4', color: 'var(--primary)', display: 'inline-flex' }}>
                <Fingerprint size={48} style={{ animation: 'pulse-ring 2s infinite ease-in-out' }} />
              </div>
              <h2>Ativar Login Digital?</h2>
              <p>
                Deseja cadastrar a digital deste dispositivo para entrar de forma rápida e segura nas próximas vezes?
              </p>
            </div>

            <div className="modal-footer-vertical">
              <button 
                className="btn-modal-confirm-primary" 
                onClick={async () => {
                  try {
                    await biometricService.register(user.email, user.name);
                    setShowBiometricPrompt(false);
                    setBiometricStatus({ message: 'Biometria ativada com sucesso!', type: 'success' });
                    setTimeout(() => setBiometricStatus(null), 5000);
                  } catch (err) {
                    console.error(err);
                    if (err.name !== 'NotAllowedError') {
                      alert(err.message || 'Erro ao registrar biometria.');
                    }
                  }
                }}
              >
                Ativar Digital
              </button>
              <button 
                className="btn-modal-cancel" 
                onClick={() => {
                  localStorage.setItem(`camubox_biometric_prompt_dismissed_${user?.email}`, 'true');
                  setShowBiometricPrompt(false);
                }}
              >
                Agora não
              </button>
            </div>
          </div>
        </div>
      )}

      {biometricStatus && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          background: biometricStatus.type === 'success' ? '#dcfce7' : '#fee2e2',
          border: `1px solid ${biometricStatus.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
          color: biometricStatus.type === 'success' ? '#15803d' : '#b91c1c',
          padding: '16px 24px',
          borderRadius: '12px',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
          zIndex: 4000,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontWeight: '600'
        }}>
          <CheckCircle size={20} />
          <span>{biometricStatus.message}</span>
        </div>
      )}
    </MainLayout>
  );
}

export default App;
