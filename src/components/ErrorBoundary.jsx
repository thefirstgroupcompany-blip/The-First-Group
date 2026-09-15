import React from 'react';
import { logSystemDiagnostic } from '../services/diagnosticsService';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, cleaning: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('App Error Caught by ErrorBoundary:', error, errorInfo);
    // Report crash to cloud diagnostics
    try {
      logSystemDiagnostic({
        message: error?.message || String(error),
        stack: error?.stack,
        component: errorInfo?.componentStack || 'ErrorBoundary'
      });
    } catch (_) {}

    // Auto unregister SW and clear caches on error to prepare clean reload
    try {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(regs => {
          for (const r of regs) r.unregister();
        });
      }
      if ('caches' in window) {
        caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
      }
    } catch (e) {}
  }

  handleReload = async () => {
    this.setState({ cleaning: true });
    try {
      sessionStorage.clear();
      localStorage.removeItem('tfg_app_version');
      localStorage.removeItem('tfg_chunk_reloaded');
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch (e) {
      console.error(e);
    }
    // Hard navigate with cache buster to completely bypass browser disk cache
    window.location.replace(window.location.origin + window.location.pathname + '?v=' + Date.now());
  };

  render() {
    if (this.state.hasError) {
      const errorMsg = String(this.state.error?.message || this.state.error || '');
      return (
        <div style={{
          minHeight: '100vh',
          width: '100vw',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0C1A2E',
          fontFamily: 'Cairo, sans-serif',
          color: '#ffffff',
          padding: 20,
          boxSizing: 'border-box'
        }}>
          <div style={{
            maxWidth: 480,
            width: '100%',
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: 20,
            padding: '32px 28px',
            textAlign: 'center',
            boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
          }}>
            <img
              src="/logo.png"
              alt="THE FIRST GROUP"
              style={{
                width: 90,
                height: 90,
                objectFit: 'contain',
                margin: '0 auto 16px',
                filter: 'drop-shadow(0 0 20px rgba(56, 189, 248, 0.5))'
              }}
            />
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 10px', color: '#38bdf8' }}>
              تم إطلاق التحديث الجديد لـ THE FIRST GROUP
            </h2>
            <p style={{ fontSize: 14, color: '#94a3b8', margin: '0 0 20px', lineHeight: 1.6 }}>
              يرجى الضغط على الزر أدناه لتنظيف الذاكرة المؤقتة وتشغيل التحديث فوراً.
            </p>
            <button
              type="button"
              disabled={this.state.cleaning}
              onClick={this.handleReload}
              style={{
                background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 12,
                padding: '12px 28px',
                fontSize: 15,
                fontWeight: 800,
                cursor: this.state.cleaning ? 'wait' : 'pointer',
                boxShadow: '0 4px 20px rgba(2, 132, 199, 0.4)',
                opacity: this.state.cleaning ? 0.7 : 1
              }}
            >
              {this.state.cleaning ? 'جاري التحديث والتنظيف...' : '🔄 تحديث وتشغيل النظام الآن'}
            </button>

            {errorMsg && (
              <details style={{ marginTop: 20, textAlign: 'left', direction: 'ltr' }}>
                <summary style={{ fontSize: 11, color: '#64748b', cursor: 'pointer' }}>تفاصيل الخطأ الفني (Technical Details)</summary>
                <pre style={{
                  fontSize: 11,
                  color: '#f87171',
                  background: 'rgba(0,0,0,0.5)',
                  padding: 10,
                  borderRadius: 8,
                  overflowX: 'auto',
                  marginTop: 6,
                  whiteSpace: 'pre-wrap'
                }}>
                  {errorMsg}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
