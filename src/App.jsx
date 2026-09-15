import React, { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { getSettings, watchSystemInfo } from './services/db';
import { Spinner } from './components/ui';
import DynamicIslandToast from './components/DynamicIslandToast';
import { getTimeMode, setTimeMode } from './utils/constants';
import ErrorBoundary from './components/ErrorBoundary';

if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (e) => {
    console.warn('Vite preload chunk error, reloading page to fetch latest build...', e);
    window.location.reload();
  });
}

// Lazy load — تحميل الصفحات عند الطلب فقط
const SetupPage            = lazy(() => import('./pages/SetupPage'));
const LoginPage            = lazy(() => import('./pages/LoginPage'));
const AdminLayout          = lazy(() => import('./pages/admin/AdminLayout'));
const EmployeeLayout       = lazy(() => import('./pages/employee/EmployeeLayout'));
const AttendancePage       = lazy(() => import('./pages/AttendancePage'));
const ClientScanPage       = lazy(() => import('./pages/ClientScanPage'));
const ClientPortalPage     = lazy(() => import('./pages/ClientPortalPage'));
const InstructorPortalPage = lazy(() => import('./pages/InstructorPortalPage'));
const CafePortalPage       = lazy(() => import('./pages/CafePortalPage'));
const MenuPage             = lazy(() => import('./pages/MenuPage'));
const FeedbackPage         = lazy(() => import('./pages/FeedbackPage'));

// شاشة تحميل موحدة أثناء انتظار الـ chunk
function PageLoader() {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      width: '100vw',
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0B1528',
      zIndex: 99999
    }}>
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <img src="/logo.png" alt="THE FIRST GROUP" style={{ width: 100, height: 100, objectFit: 'contain', mixBlendMode: 'screen', filter: 'drop-shadow(0 0 20px rgba(56,189,248,0.65))' }} />
        <Spinner size="lg" />
        <p style={{ color: '#93c5fd', fontSize: 14, fontWeight: 700, margin: 0 }}>جاري التحميل...</p>
      </div>
    </div>
  );
}


function AppRouter() {
  const { user } = useAuth();
  const [settings, setSettings] = useState(() => {
    try {
      const cached = localStorage.getItem('tfg_cached_settings');
      return cached ? JSON.parse(cached) : null;
    } catch (e) {
      return null;
    }
  });
  const [loading, setLoading] = useState(() => !settings);

  useEffect(() => {
    getSettings().then(s => {
      if (s) {
        setSettings(s);
        try { localStorage.setItem('tfg_cached_settings', JSON.stringify(s)); } catch (e) {}
      }
      setLoading(false);
    }).catch(err => {
      console.error('Firebase connection error:', err);
      setLoading(false);
    });

    const unsubSys = watchSystemInfo((info) => {
      if (info?.timeMode && info.timeMode !== getTimeMode()) {
        setTimeMode(info.timeMode);
      }
    });

    return () => unsubSys && unsubSys();
  }, []);

  if (loading) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0B1528',
        zIndex: 99999
      }}>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 180,
            height: 80,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'pulse 2s infinite'
          }}>
            <img
              src="/logo.png"
              alt="THE FIRST GROUP"
              onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                mixBlendMode: 'screen',
                filter: 'drop-shadow(0 0 20px rgba(56, 189, 248, 0.65))'
              }}
            />
          </div>
          <Spinner size="lg" />
          <p style={{ color: '#93c5fd', fontSize: 14, fontWeight: 700, margin: 0 }}>
            جاري الاتصال بـ THE FIRST GROUP...
          </p>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/attendance" element={<AttendancePage />} />
        <Route path="/scan" element={<ClientScanPage />} />
        <Route path="/client" element={<ClientPortalPage />} />
        <Route path="/portal" element={<ClientPortalPage />} />
        <Route path="/member" element={<ClientPortalPage />} />
        <Route path="/instructor" element={<InstructorPortalPage />} />
        <Route path="/portal/instructor" element={<InstructorPortalPage />} />
        <Route path="/teacher" element={<InstructorPortalPage />} />
        <Route path="/cafe" element={!user ? <Navigate to="/" /> : (user.role === 'employee' ? <Navigate to="/employee" /> : <CafePortalPage />)} />
        <Route path="/barista" element={!user ? <Navigate to="/" /> : (user.role === 'employee' ? <Navigate to="/employee" /> : <CafePortalPage />)} />
        <Route path="/pos" element={!user ? <Navigate to="/" /> : (user.role === 'employee' ? <Navigate to="/employee" /> : <CafePortalPage />)} />
        <Route path="/menu" element={<MenuPage />} />
        <Route path="/cafe/menu" element={<MenuPage />} />
        <Route path="/feedback" element={<FeedbackPage />} />
        <Route path="/rate" element={<FeedbackPage />} />
        <Route path="/review" element={<FeedbackPage />} />
        <Route path="/survey" element={<FeedbackPage />} />
        <Route
          path="/"
          element={
            !settings?.adminCreated
              ? <SetupPage onSetupComplete={() => window.location.reload()} />
              : user
                ? <Navigate to={user.role === 'admin' ? '/admin' : (user.role === 'cafe' || user.role === 'barista' ? '/cafe' : '/employee')} />
                : <LoginPage />
          }
        />
        <Route
          path="/admin/*"
          element={user?.role === 'admin' ? <AdminLayout /> : <Navigate to="/" />}
        />
        <Route
          path="/employee/*"
          element={(user?.role === 'employee' || user?.role === 'manager' || user?.role === 'admin') ? <EmployeeLayout /> : <Navigate to="/" />}
        />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', width: '100%' }}>
            <DynamicIslandToast />
            <ErrorBoundary>
              <AppRouter />
            </ErrorBoundary>
          </div>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
