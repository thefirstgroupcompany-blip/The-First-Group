import React, { useState, useEffect } from 'react';
import { Clock, Timer } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { formatComputerTime, formatComputerDate, getTimeMode, setTimeMode } from '../utils/constants';
import { saveSystemInfo, watchSystemInfo } from '../services/db';

export default function HeaderLiveWidget({ shift = null, role = 'admin' }) {
  const { user } = useAuth();
  const [now, setNow] = useState(new Date());
  const [timeMode, setTimeModeState] = useState(getTimeMode());

  // Manager/Admin check: ONLY Admin/Manager can change time!
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  useEffect(() => {
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
      window.removeEventListener('tfg_time_mode_changed', handleModeChange);
      unsub && unsub();
    };
  }, []);

  const handleToggle = async () => {
    if (!isAdmin || role !== 'admin') return;
    const nextMode = timeMode === 'dst' ? 'standard' : 'dst';
    const label = nextMode === 'dst' ? 'التوقيت الصيفي (+1 ساعة)' : 'التوقيت القياسي المعتمد (الشتوي)';
    if (!window.confirm(`⚙️ تأكيد من الإدارة العامة:\nهل ترغب في تغيير توقيت النظام بالكامل إلى ${label}؟\nسيتم تطبيق التوقيت المعتمد فورياً على كافة مناوبات الموظفين والأجهزة.`)) {
      return;
    }
    setTimeMode(nextMode);
    setTimeModeState(nextMode);
    try {
      await saveSystemInfo({ timeMode: nextMode });
    } catch (err) {
      console.error('Failed to sync time mode to system:', err);
    }
  };

  // Format live clock string
  const timeString = formatComputerTime(now, true);
  const dateString = formatComputerDate(now);

  // Safely parse shift.openedAt to avoid any NaN:NaN:NaN
  let elapsedShift = null;
  let openedTimeFormatted = null;

  if (shift && shift.status === 'open' && shift.openedAt) {
    const raw = shift.openedAt;
    let openedDate = null;
    if (raw?.toDate) openedDate = raw.toDate();
    else if (raw?.seconds) openedDate = new Date(raw.seconds * 1000);
    else if (raw instanceof Date) openedDate = raw;
    else if (typeof raw === 'string' || typeof raw === 'number') {
      const parsed = new Date(raw);
      if (!isNaN(parsed.getTime())) openedDate = parsed;
    }

    if (openedDate && !isNaN(openedDate.getTime())) {
      openedTimeFormatted = formatComputerTime(openedDate, false);
      const diffMs = Math.max(0, now.getTime() - openedDate.getTime());
      const diffSecs = Math.floor(diffMs / 1000);
      const hrs = String(Math.floor(diffSecs / 3600)).padStart(2, '0');
      const mins = String(Math.floor((diffSecs % 3600) / 60)).padStart(2, '0');
      const secs = String(diffSecs % 60).padStart(2, '0');
      elapsedShift = `${hrs}:${mins}:${secs}`;
    }
  }

  const isShiftOpen = shift?.status === 'open';

  return (
    <div
      className="header-live-capsule"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 12px',
        borderRadius: 20,
        background: 'rgba(255, 255, 255, 0.05)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderTop: '1px solid rgba(255, 255, 255, 0.28)',
        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)',
        fontSize: 12,
        fontFamily: "'Cairo', sans-serif"
      }}
    >
      {/* 1. Live Digital Clock (Editable ONLY by Admin/Manager, read-only for employees) */}
      <div
        onClick={(isAdmin && role === 'admin') ? handleToggle : undefined}
        title={
          (isAdmin && role === 'admin')
            ? (timeMode === 'standard'
                ? 'التوقيت القياسي المعتمد (انقر كمدير للتبديل للتوقيت الصيفي للنظام بالكامل)'
                : 'التوقيت الصيفي المعتمد (انقر كمدير للتبديل للتوقيت القياسي للنظام بالكامل)')
            : (timeMode === 'standard'
                ? 'التوقيت القياسي (محدد ومعتمد مركزياً من الإدارة العامة)'
                : 'التوقيت الصيفي (محدد ومعتمد مركزياً من الإدارة العامة)')
        }
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: '#38bdf8',
          fontWeight: 800,
          cursor: (isAdmin && role === 'admin') ? 'pointer' : 'default',
          userSelect: 'none'
        }}
      >
        <span className="pulse-dot pulse-dot-cyan" style={{ width: 6, height: 6 }} />
        <Clock size={13} color="#38bdf8" />
        <span className="tabular-nums" style={{ letterSpacing: '0.5px' }}>
          {timeString}
        </span>
        {(isAdmin && role === 'admin') && (
          <span style={{ fontSize: '10px', opacity: 0.75 }} title="تعديل توقيت النظام كمدير">⚙️</span>
        )}
      </div>

      {/* 2. Elapsed Shift Timer (if active shift) */}
      {isShiftOpen && elapsedShift && (
        <>
          <div
            style={{
              width: 1,
              height: 12,
              background: 'rgba(255, 255, 255, 0.15)'
            }}
          />
          <div
            title={`المناوبة بدأت في: ${openedTimeFormatted || 'بداية اليوم'}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              color: '#34d399',
              fontWeight: 800
            }}
          >
            <Timer size={13} color="#34d399" />
            <span className="tabular-nums" style={{ letterSpacing: '0.5px' }}>
              {elapsedShift}
            </span>
          </div>
        </>
      )}

      {/* 3. Closed Shift Indicator for employee/cafe when shift is closed */}
      {!isShiftOpen && (role === 'employee' || role === 'cafe') && (
        <>
          <div
            style={{
              width: 1,
              height: 12,
              background: 'rgba(255, 255, 255, 0.15)'
            }}
          />
          <span style={{ color: '#f87171', fontWeight: 800, fontSize: 11 }}>
            {role === 'cafe' ? 'الوردية مغلقة' : 'المناوبة مغلقة'}
          </span>
        </>
      )}

      {/* 4. Live Date */}
      <div
        className="hidden-on-mobile"
        style={{
          width: 1,
          height: 12,
          background: 'rgba(255, 255, 255, 0.15)'
        }}
      />

      <span
        className="hidden-on-mobile"
        style={{
          color: 'var(--text-secondary)',
          fontSize: 11,
          fontWeight: 600
        }}
      >
        {dateString}
      </span>
    </div>
  );
}
