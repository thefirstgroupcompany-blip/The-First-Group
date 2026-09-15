import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

const recentErrors = new Set();

export const logSystemDiagnostic = async (errorData = {}) => {
  try {
    const errorKey = `${errorData.message}_${errorData.url}_${errorData.component || ''}`;
    // Deduplicate identical errors within 1 minute
    if (recentErrors.has(errorKey)) return;
    recentErrors.add(errorKey);
    setTimeout(() => recentErrors.delete(errorKey), 60000);

    let activeUser = null;
    try {
      const stored = sessionStorage.getItem('ms_user') || localStorage.getItem('ms_user');
      if (stored) {
        const parsed = JSON.parse(stored);
        activeUser = {
          id: parsed.id || parsed.uid || null,
          username: parsed.username || null,
          role: parsed.role || null
        };
      }
    } catch (_) {}

    await addDoc(collection(db, 'system_diagnostics'), {
      message: String(errorData.message || 'Unknown Error').slice(0, 500),
      stack: String(errorData.stack || '').slice(0, 2000),
      component: String(errorData.component || '').slice(0, 200),
      url: window.location.href,
      pathname: window.location.pathname,
      userAgent: navigator.userAgent,
      user: activeUser,
      resolved: false,
      timestamp: serverTimestamp(),
      createdAt: new Date().toISOString()
    });
  } catch (err) {
    console.warn('[Diagnostics] Failed to report error to cloud:', err);
  }
};

// Global error handlers for uncaught promises and window errors
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    if (event.error) {
      logSystemDiagnostic({
        message: event.error.message || event.message,
        stack: event.error.stack,
        component: 'window.onerror'
      });
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    logSystemDiagnostic({
      message: event.reason?.message || String(event.reason || 'Unhandled Promise Rejection'),
      stack: event.reason?.stack,
      component: 'unhandledrejection'
    });
  });
}
