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
import UserMyLockers from './pages/UserMyLockers';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import { supabase, dbService, authService } from './services/supabaseClient';
import InstallPWA from './components/InstallPWA';
import { requestFirebaseToken, setupForegroundListener } from './services/firebase';
import { useRegisterSW } from 'virtual:pwa-register/react';
import ScrollToTop from './components/ScrollToTop';

// User Mock Pages
// User Home is now replaced by direct redirection to lockers

function App() {
  const { updateServiceWorker } = useRegisterSW({
    onRegistered(r) {
      // Verifica atualizações a cada hora (opcional, mas bom ter)
      r && setInterval(() => {
        r.update();
      }, 60 * 60 * 1000);
    }
  });

  // Efeito para checar atualização sempre que o usuário "volta" para o app
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        updateServiceWorker(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [updateServiceWorker]);

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
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#0f172a',
        color: 'white',
        fontFamily: 'system-ui'
      }}>
        <div className="loading-spinner">Carregando...</div>
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
    </>
  );
}

// Separate component to help ESLint and clean up App
function DashboardLayout({ user, handleLogout, location }) {
  return (
    <MainLayout user={user} onLogout={handleLogout}>
      <div style={{ width: '100%', height: '100%' }}>
          <Routes location={location}>
            <Route path="/" element={user.isAdmin ? <AdminHome /> : <Navigate to="/dashboard/lockers" replace />} />
            <Route path="/admin" element={<AdminHome />} />
            <Route path="/admin/lockers" element={<LockerManagement />} />
            <Route path="/admin/contracts" element={<AdminContracts />} />
            <Route path="/admin/inspections" element={<LockerInspection />} />
            <Route path="/admin/settings" element={<AdminSettings />} />
            <Route path="/lockers" element={<UserLockerSelection user={user} />} />
            <Route path="/checkout/contract" element={<DigitalContract />} />
            <Route path="/checkout/payment" element={<PixPayment user={user} />} />
            <Route path="/my-locker" element={<UserMyLockers user={user} />} />
            <Route path="/payments" element={<div>Pagamentos (Em breve)</div>} />
            <Route path="*" element={<div>Página em construção...</div>} />
          </Routes>
      </div>
    </MainLayout>
  );
}

export default App;
