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
import { motion, AnimatePresence } from 'framer-motion';
import { requestFirebaseToken } from './services/firebase';

// User Mock Pages
// User Home is now replaced by direct redirection to lockers

function App() {
  const location = useLocation();
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('camubox_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  useEffect(() => {
    // 1. Initial Session Check
    const checkSession = async () => {
      console.log('[App] Checking session...');
      if (!supabase) {
        console.warn('[App] Supabase client not initialized');
        setIsLoadingAuth(false);
        return;
      }

      const { data: { session } } = await authService.getSession();
      console.log('[App] Session check result:', session ? 'Session found' : 'No session');
      if (session?.user) {
        console.log('[App] Found user in session:', session.user.email);
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
    console.log('[App] Auth UID trigger:', user?.uid ? `Authenticated: ${user.uid}` : 'Not authenticated');
    if (user?.uid) {
      console.log('[App] Starting FCM registration process...');
      handleFCMRegistration(user.uid);
    }
  }, [user?.uid]);

  const handleFCMRegistration = async (userId) => {
    console.log('[App] handleFCMRegistration called with ID:', userId);
    try {
      const token = await requestFirebaseToken();
      console.log('[App] requestFirebaseToken output:', token ? 'Token exists' : 'Token is NULL');
      if (token) {
        console.log('[App] Sending token to database...');
        await dbService.fcmTokens.upsert(userId, token);
        console.log('[App] Token saved successfully in Supabase');
      }
    } catch (err) {
      console.error('[App] Critical FCM Error:', err);
    }
  };

  const syncUserSession = async (supabaseUser) => {
    console.log('[App] Syncing user session for:', supabaseUser.email);
    try {
      // Try to find user in our t_usuario table
      const { data: dbUser } = await dbService.users.getByEmail(supabaseUser.email);
      console.log('[App] DB user search result:', dbUser ? 'Found in t_usuario' : 'Not found in t_usuario');
      
      const userData = {
        uid: supabaseUser.id, // Auth UUID para FCM e referências nativas
        id_usuario: dbUser?.id_usuario || supabaseUser.id,
        name: dbUser?.nm_usuario || supabaseUser.user_metadata?.full_name || supabaseUser.email,
        email: dbUser?.dc_email || supabaseUser.email,
        isAdmin: !!dbUser?.id_usuario, // For now, if they are in t_usuario we consider them known
        isOAuth: true
      };

      console.log('[App] Setting user state with UID:', userData.uid);
      setUser(userData);
      localStorage.setItem('camubox_user', JSON.stringify(userData));
    } catch (err) {
      console.error('[App] Error syncing user session:', err);
    }
  };

  const handleLogin = (userData) => {
    setUser(userData);
    localStorage.setItem('camubox_user', JSON.stringify(userData));
  };

  const handleLogout = async () => {
    await authService.signOut();
    setUser(null);
    localStorage.removeItem('camubox_user');
  };

  return (
    <>
      <Routes location={location} key={location.pathname.split('/')[1] === 'dashboard' ? 'dashboard-root' : location.pathname}>
        <Route path="/" element={<LoginPage onLogin={handleLogin} />} />
        <Route path="/privacidade" element={<PrivacyPolicy />} />
        <Route path="/termos-de-uso" element={<TermsOfService />} />

        {/* Protected Dashboard Routes */}
        <Route
          path="/dashboard/*"
          element={
            user ? (
              <MainLayout user={user} onLogout={handleLogout}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={location.pathname}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    style={{ width: '100%', height: '100%' }}
                  >
                    <Routes location={location}>
                      <Route path="/" element={user.isAdmin ? <AdminHome /> : <Navigate to="/dashboard/lockers" replace />} />
                      <Route path="/admin" element={<AdminHome />} />
                      <Route path="/admin/lockers" element={<LockerManagement />} />
                      <Route path="/admin/contracts" element={<AdminContracts />} />
                      <Route path="/admin/inspections" element={<LockerInspection />} />
                      <Route path="/admin/settings" element={<AdminSettings />} />
                      <Route path="/lockers" element={<UserLockerSelection />} />
                      <Route path="/checkout/contract" element={<DigitalContract />} />
                      <Route path="/checkout/payment" element={<PixPayment user={user} />} />
                      <Route path="/my-locker" element={<UserMyLockers user={user} />} />
                      <Route path="/payments" element={<div>Pagamentos (Em breve)</div>} />
                      <Route path="*" element={<div>Página em construção...</div>} />
                    </Routes>
                  </motion.div>
                </AnimatePresence>
              </MainLayout>
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

export default App;
