import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
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

// User Mock Pages
// User Home is now replaced by direct redirection to lockers

function App() {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('camubox_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  useEffect(() => {
    // 1. Initial Session Check
    const checkSession = async () => {
      if (!supabase) {
        setIsLoadingAuth(false);
        return;
      }

      const { data: { session } } = await authService.getSession();
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

  const syncUserSession = async (supabaseUser) => {
    try {
      // Try to find user in our t_usuario table
      const { data: dbUser } = await dbService.users.getByEmail(supabaseUser.email);
      
      const userData = {
        id_usuario: dbUser?.id_usuario || supabaseUser.id,
        name: dbUser?.nm_usuario || supabaseUser.user_metadata?.full_name || supabaseUser.email,
        email: dbUser?.dc_email || supabaseUser.email,
        isAdmin: !!dbUser?.id_usuario, // For now, if they are in t_usuario we consider them known
        isOAuth: true
      };

      setUser(userData);
      localStorage.setItem('camubox_user', JSON.stringify(userData));
    } catch (err) {
      console.error('Error syncing user session:', err);
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
    <Router>
      <Routes>
        <Route path="/" element={<LoginPage onLogin={handleLogin} />} />
        <Route path="/privacidade" element={<PrivacyPolicy />} />
        <Route path="/termos-de-uso" element={<TermsOfService />} />

        {/* Protected Dashboard Routes */}
        <Route
          path="/dashboard/*"
          element={
            user ? (
              <MainLayout user={user} onLogout={handleLogout}>
                <Routes>
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
                  {/* Add other sub-routes here as they are implemented */}
                  <Route path="*" element={<div>Página em construção...</div>} />
                </Routes>
              </MainLayout>
            ) : (
              <Navigate to="/" />
            )
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
