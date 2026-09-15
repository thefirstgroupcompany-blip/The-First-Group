import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, BellRing, X } from 'lucide-react';
import { playChimeSound } from '../utils/notifications';

// Global Event Dispatcher for Toasts
const TOAST_EVENT = 'tfg_app_toast';

export function showToast(message, type = 'success', duration = 3200) {
  if (typeof window !== 'undefined') {
    const event = new CustomEvent(TOAST_EVENT, {
      detail: {
        id: Date.now() + Math.random(),
        message,
        type,
        duration
      }
    });
    window.dispatchEvent(event);
  }
}

// Expose globally for convenience
if (typeof window !== 'undefined') {
  window.showToast = showToast;
}

export default function DynamicIslandToast() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handleToast = (e) => {
      const newToast = e.detail;
      setToasts((prev) => [...prev.slice(-2), newToast]);

      if (newToast.type === 'success') {
        playChimeSound();
      }

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
      }, newToast.duration || 3200);
    };

    window.addEventListener(TOAST_EVENT, handleToast);
    return () => window.removeEventListener(TOAST_EVENT, handleToast);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        pointerEvents: 'none',
        width: 'auto',
        maxWidth: '92vw'
      }}
    >
      {toasts.map((toast) => {
        const isSuccess = toast.type === 'success';
        const isError = toast.type === 'error' || toast.type === 'danger';
        const isWarning = toast.type === 'warning';

        const glowColor = isSuccess
          ? 'rgba(16, 185, 129, 0.40)'
          : isError
          ? 'rgba(239, 68, 68, 0.40)'
          : isWarning
          ? 'rgba(245, 158, 11, 0.40)'
          : 'rgba(56, 189, 248, 0.40)';

        const borderColor = isSuccess
          ? 'rgba(52, 211, 153, 0.5)'
          : isError
          ? 'rgba(248, 113, 113, 0.5)'
          : isWarning
          ? 'rgba(251, 191, 36, 0.5)'
          : 'rgba(56, 189, 248, 0.5)';

        const iconBg = isSuccess
          ? 'rgba(16, 185, 129, 0.2)'
          : isError
          ? 'rgba(239, 68, 68, 0.2)'
          : isWarning
          ? 'rgba(245, 158, 11, 0.2)'
          : 'rgba(56, 189, 248, 0.2)';

        return (
          <div
            key={toast.id}
            className="dynamic-island-toast"
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '9px 18px',
              borderRadius: 9999,
              background: 'rgba(10, 22, 44, 0.94)',
              backdropFilter: 'blur(28px) saturate(200%)',
              WebkitBackdropFilter: 'blur(28px) saturate(200%)',
              border: `1px solid ${borderColor}`,
              borderTop: '1px solid rgba(255, 255, 255, 0.45)',
              boxShadow: `0 20px 45px -10px rgba(0, 0, 0, 0.85), 0 0 25px ${glowColor}`,
              color: '#ffffff',
              fontSize: 13.5,
              fontWeight: 700,
              fontFamily: "'Cairo', sans-serif",
              cursor: 'pointer',
              userSelect: 'none',
              animation: 'dynamicIslandDrop 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards'
            }}
            onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
          >
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                background: iconBg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              {isSuccess && <CheckCircle2 size={16} color="#34d399" />}
              {isError && <AlertCircle size={16} color="#f87171" />}
              {isWarning && <BellRing size={16} color="#fbbf24" />}
              {!isSuccess && !isError && !isWarning && <Info size={16} color="#38bdf8" />}
            </div>

            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '75vw' }}>
              {toast.message}
            </span>

            <button
              onClick={(e) => {
                e.stopPropagation();
                setToasts((prev) => prev.filter((t) => t.id !== toast.id));
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.5)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: 0,
                marginRight: -4
              }}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
