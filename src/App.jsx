import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState } from 'react';
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

// User Mock Pages
// User Home is now replaced by direct redirection to lockers

function App() {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('camubox_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const handleLogin = (userData) => {
    setUser(userData);
    localStorage.setItem('camubox_user', JSON.stringify(userData));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('camubox_user');
  };

  return (
    <Router>
      <Routes>
        <Route path="/" element={<LoginPage onLogin={handleLogin} />} />

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
