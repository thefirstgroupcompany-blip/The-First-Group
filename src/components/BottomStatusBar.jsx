import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { formatComputerTime, formatComputerDate, getTimeMode, setTimeMode } from '../utils/constants';
import { saveSystemInfo, watchSystemInfo } from '../services/db';

export default function BottomStatusBar({ activeShift = undefined, orgName = 'THE FIRST GROUP' }) {
  const { user } = useAuth();
  const [now, setNow] = useState(new Date());
  const [timeMode, setTimeModeState] = useState(getTimeMode());
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  // Manager/Admin check: ONLY Admin/Manager can change time!
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);

    const handleModeChange = () => setTimeModeState(getTimeMode());
    window.addEventListener('tfg_time_mode_changed', handleModeChange);

    // Sync from Firestore in real-time
    const unsub = watchSystemInfo((info) => {
      if (info?.timeMode && info.timeMode !== getTimeMode()) {
        setTimeMode(info.timeMode);
        setTimeModeState(info.timeMode);
      }
    });

    return () => {
      clearInterval(timer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('tfg_time_mode_changed', handleModeChange);
      unsub && unsub();
    };
  }, []);

  const handleToggle = async () => {
    if (!isAdmin) return;
    const nextMode = timeMode === 'dst' ? 'standard' : 'dst';
    setTimeMode(nextMode);
    setTimeModeState(nextMode);
    try {
      await saveSystemInfo({ timeMode: nextMode });
    } catch (err) {
      console.error('Failed to sync time mode to system:', err);
    }
  };

  const timeString = formatComputerTime(now, true);
  const dateString = formatComputerDate(now);

  return (
    <footer
      style={{
        position: 'relative',
        zIndex: 40,
        height: '42px',
        minHeight: '42px',
        background: 'linear-gradient(180deg, rgba(13, 23, 42, 0.98) 0%, rgba(7, 14, 27, 1) 100%)',
        backdropFilter: 'blur(12px)',
        borderTop: '1px solid rgba(59, 130, 246, 0.3)',
        boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 18px',
        fontSize: '12px',
        color: '#94a3b8',
        userSelect: 'none',
        flexShrink: 0,
        overflow: 'hidden'
      }}
    >
      {/* Right Side: Live Cairo Clock and Full Date */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Glowing Digital Cairo Time (Display Only - Managed centrally via Admin Settings) */}
        <div
          title={
            timeMode === 'standard'
              ? 'التوقيت القياسي المعتمد (محدد ومعتمد مركزياً من الإدارة العامة)'
              : 'التوقيت الصيفي المعتمد (محدد ومعتمد مركزياً من الإدارة العامة)'
          }
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(59, 130, 246, 0.15)',
            border: '1px solid rgba(59, 130, 246, 0.35)',
            borderRadius: '6px',
            padding: '3px 10px',
            color: '#60a5fa',
            fontWeight: 800,
            fontSize: '13px',
            letterSpacing: '0.5px',
            cursor: 'default',
            userSelect: 'none'
          }}
        >
          <span style={{ fontSize: '14px' }}>🕒</span>
          <span style={{ fontFamily: 'monospace', fontSize: '13px', direction: 'ltr' }}>{timeString}</span>
        </div>

        {/* Date Display */}
        <div className="hidden-on-mobile" style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#e2e8f0', fontWeight: 600 }}>
          <span style={{ fontSize: '13px' }}>📅</span>
          <span>{dateString}</span>
        </div>
      </div>

      {/* Center Side: Active Shift or System Info */}
      <div className="hidden-on-mobile" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {activeShift && activeShift.status === 'open' ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(16, 185, 129, 0.14)',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              borderRadius: '6px',
              padding: '2px 10px',
              color: '#34d399',
              fontSize: '11px',
              fontWeight: 800
            }}
          >
            <span className="pulse-dot pulse-dot-emerald" style={{ width: 7, height: 7 }} />
            <span>🟢 مناوبة نشطة: {activeShift.employeeName || activeShift.baristaName || 'جارية'}</span>
          </div>
        ) : activeShift !== undefined ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(239, 68, 68, 0.14)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '6px',
              padding: '2px 10px',
              color: '#f87171',
              fontSize: '11px',
              fontWeight: 800
            }}
          >
            <span className="pulse-dot pulse-dot-red" style={{ width: 7, height: 7 }} />
            <span>🔴 المناوبة مغلقة</span>
          </div>
        ) : (
          <span style={{ color: '#64748b', fontSize: '11px' }}>
            {orgName || "THE FIRST GROUP"}
          </span>
        )}
      </div>

      {/* Left Side: System Status & Cloud Live */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: isOnline ? '#22c55e' : '#f59e0b',
              display: 'inline-block',
              boxShadow: isOnline ? '0 0 8px #22c55e' : '0 0 8px #f59e0b'
            }}></span>
            <span style={{ color: isOnline ? '#86efac' : '#fcd34d', fontSize: '11px', fontWeight: 700 }}>
              {isOnline ? 'سحابي متصل' : 'أوفلاين (تخزين محلي)'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#38bdf8', display: 'inline-block', boxShadow: '0 0 8px #38bdf8' }}></span>
            <span style={{ color: '#bae6fd', fontSize: '11px', fontWeight: 700 }}>بوت الواتساب 🤖</span>
          </div>
        </div>

        <span className="hidden-on-mobile" style={{ color: '#475569', fontSize: '11px' }}>v2.6.0</span>
      </div>
    </footer>
  );
}
