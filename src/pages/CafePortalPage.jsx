import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSystemInfo, getActiveCafeShift } from '../services/db';
import { useAuth } from '../contexts/AuthContext';
import CafePosTab from './shared/CafePosTab';
import BottomStatusBar from '../components/BottomStatusBar';
import HeaderLiveWidget from '../components/HeaderLiveWidget';
import { formatCurrency } from '../utils/constants';
import { Coffee, LogOut, Clock, Home, User } from 'lucide-react';

export default function CafePortalPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [systemInfo, setSystemInfo] = useState({ name: 'THE FIRST GROUP', logoUrl: '' });
  const [activeShift, setActiveShift] = useState(null);

  useEffect(() => {
    if (!user) {
      navigate('/');
      return;
    }
    if (user.role === 'employee') {
      navigate('/employee');
      return;
    }
    getSystemInfo().then(setSystemInfo);
    const unsub = getActiveCafeShift(setActiveShift);
    return () => unsub && unsub();
  }, [user]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'Cairo, sans-serif',
      color: '#ffffff',
      background: 'transparent',
      overflow: 'hidden'
    }}>
      {/* Top Main Navigation Bar */}
      <header
        className="dark-header no-print"
        style={{
          height: 64,
          padding: '0 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(9, 19, 34, 0.96)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(56, 189, 248, 0.16)',
          zIndex: 60,
          position: 'relative',
          flexShrink: 0
        }}
      >
        {/* Right side: Logo & Brand (Balanced & Crisp) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img
            src="/logo.png"
            alt={systemInfo?.name || "THE FIRST GROUP"}
            onError={(e) => { e.target.onerror = null; e.target.src = '/logo.png'; }}
            style={{
              height: 38,
              width: 'auto',
              maxWidth: 150,
              objectFit: 'contain'
            }}
          />
          <div style={{ width: 1, height: 20, background: 'rgba(255, 255, 255, 0.12)' }} />
          <span style={{
            background: 'rgba(52, 211, 153, 0.15)',
            border: '1px solid rgba(52, 211, 153, 0.35)',
            color: '#34d399',
            padding: '3px 8px',
            borderRadius: 7,
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 0.5
          }}>
            CAFE
          </span>
        </div>

        {/* Center: Module Title */}
        <div className="hidden-on-mobile" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 16px', borderRadius: 10,
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            color: '#34d399', fontWeight: 800, fontSize: 13
          }}>
            <Coffee size={17} />
            <span>بوابة كاشير وباريستا TFG | CAFE</span>
          </div>
        </div>

        {/* Left side: Home + Logout + Live Widget */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <a
            href="/"
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#cbd5e1',
              textDecoration: 'none',
              fontSize: 12,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s ease'
            }}
          >
            <Home size={14} />
            <span className="hidden-on-mobile">الرئيسية</span>
          </a>

          <button
            onClick={() => { logout(); navigate('/'); }}
            title="تسجيل الخروج وإغلاق الجلسة"
            className="btn btn-ghost btn-sm no-print"
            style={{
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              padding: '6px 10px',
              borderRadius: 8,
              cursor: 'pointer',
              color: '#f87171'
            }}
          >
            <LogOut size={15} />
          </button>

          <HeaderLiveWidget shift={activeShift} role="cafe" />
        </div>
      </header>

      {/* Sub-Header Bar: Active Breadcrumb & Live Shift Indicators */}
      <div
        className="no-print"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 20px',
          background: 'rgba(12, 22, 38, 0.75)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span
            className={`pulse-dot ${activeShift?.status === 'open' ? 'pulse-dot-emerald' : 'pulse-dot-red'}`}
            title={activeShift?.status === 'open' ? "وردية الكافيه نشطة وجارية" : "وردية الكافيه مغلقة"}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span style={{ color: '#64748b', fontSize: 12.5 }}>بوابة الكافيه</span>
            <span style={{ color: '#475569', fontSize: 12 }}>/</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Coffee size={16} style={{ color: '#34d399', flexShrink: 0 }} />
              <h2 className="titanium-title" style={{ fontWeight: 800, fontSize: 14.5, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                نقطة البيع واستلام الطلبات والوردية النشطة
              </h2>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {activeShift?.status === 'open' ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(16, 185, 129, 0.16)', border: '1.5px solid rgba(16, 185, 129, 0.45)',
              padding: '5px 12px', borderRadius: 8, color: '#34d399', fontWeight: 800, fontSize: 12.5,
              boxShadow: '0 0 12px rgba(16, 185, 129, 0.2)'
            }}>
              <span className="pulse-dot pulse-dot-emerald" style={{ width: 8, height: 8 }} />
              <span>🟢 وردية كافيه مفتوحة (#{activeShift.id.slice(-4)}) · الدرج: {formatCurrency(activeShift.drawerCash || 0)}</span>
            </div>
          ) : (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(239, 68, 68, 0.16)', border: '1.5px solid rgba(239, 68, 68, 0.45)',
              padding: '5px 12px', borderRadius: 8, color: '#f87171', fontWeight: 800, fontSize: 12.5,
              boxShadow: '0 0 12px rgba(239, 68, 68, 0.2)'
            }}>
              <span className="pulse-dot pulse-dot-red" style={{ width: 8, height: 8 }} />
              <span>🔴 وردية الكافيه مغلقة</span>
            </div>
          )}

          {/* Prominent Barista Name Badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'linear-gradient(135deg, rgba(5, 150, 105, 0.18), rgba(16, 185, 129, 0.12))',
            border: '1.5px solid rgba(16, 185, 129, 0.45)',
            padding: '5px 14px',
            borderRadius: 10,
            boxShadow: '0 2px 10px rgba(16, 185, 129, 0.15)'
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%',
              background: 'rgba(16, 185, 129, 0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <User size={13} color="#34d399" />
            </div>
            <span style={{ color: '#ffffff', fontWeight: 900, fontSize: 14.5, letterSpacing: '0.3px' }}>
              {user?.name}
            </span>
            <span style={{
              color: '#34d399',
              fontSize: 11,
              fontWeight: 800,
              background: 'rgba(16, 185, 129, 0.18)',
              padding: '2px 8px',
              borderRadius: 6,
              border: '1px solid rgba(16, 185, 129, 0.3)'
            }}>
              {user?.jobTitle || 'باريستا'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Area: 100% Full Width */}
      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '16px 20px',
          width: '100%',
          boxSizing: 'border-box',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        <CafePosTab />
      </main>

      {/* Bottom Status Bar */}
      <BottomStatusBar activeShift={activeShift} orgName={systemInfo?.name} />

      <style>{`
        @media (max-width: 1024px) {
          .hidden-on-mobile {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
