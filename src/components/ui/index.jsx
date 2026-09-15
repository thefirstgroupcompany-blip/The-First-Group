import React, { forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Inbox, AlertTriangle } from 'lucide-react';
import AnimatedCounter from '../AnimatedCounter';

// ============================
// CARD
// ============================
export const Card = ({ children, className = '', onClick, style = {} }) => (
  <div
    className={`dark-card ${className}`}
    onClick={onClick}
    style={{ color: '#ffffff', ...style, ...(onClick ? { cursor: 'pointer' } : {}) }}
  >
    {children}
  </div>
);

// ============================
// BUTTON
// ============================
export const Button = forwardRef(({
  children, onClick, variant = 'primary', size = 'md',
  disabled, className = '', type = 'button', ...props
}, ref) => (
  <button
    ref={ref}
    type={type}
    onClick={onClick}
    disabled={disabled}
    className={`btn btn-${variant} btn-${size} ${className}`}
    {...props}
  >
    {children}
  </button>
));
Button.displayName = 'Button';

// ============================
// INPUT
// ============================
export const Input = forwardRef(({
  label, type = 'text', value, onChange, placeholder,
  required, autoFocus, className = '', dir, min, max, containerStyle, style, ...props
}, ref) => (
  <div className="flex flex-col gap-1.5" style={{ minWidth: 0, ...containerStyle }}>
    {label && <label className="dark-label">{label}</label>}
    <input
      ref={ref}
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      required={required}
      autoFocus={autoFocus}
      dir={dir}
      min={min}
      max={max}
      className={`dark-input ${className}`}
      style={{ color: '#ffffff', ...style }}
      {...props}
    />
  </div>
));
Input.displayName = 'Input';

// ============================
// SELECT
// ============================
export const Select = ({ label, value, onChange, children, className = '', containerStyle, style }) => (
  <div className="flex flex-col gap-1.5" style={{ minWidth: 0, ...containerStyle }}>
    {label && <label className="dark-label">{label}</label>}
    <select value={value} onChange={onChange} className={`dark-select ${className}`} style={{ color: '#ffffff', background: '#0a162b', ...style }}>
      {children}
    </select>
  </div>
);

// ============================
// BADGE
// ============================
const BADGE_MAP = {
  blue: 'badge-blue', green: 'badge-green', red: 'badge-red',
  amber: 'badge-amber', purple: 'badge-purple', gray: 'badge-gray',
  // aliases
  success: 'badge-green', danger: 'badge-red', warning: 'badge-amber',
  primary: 'badge-blue',
};
export const Badge = ({ children, color = 'blue' }) => (
  <span className={`badge ${BADGE_MAP[color] || 'badge-blue'}`}>{children}</span>
);

// ============================
// MODAL STACK & GLOBAL KEYBOARD MANAGER (ESC & ENTER)
// ============================
export const modalStack = [];

export function registerModal(handler) {
  modalStack.push(handler);
  return () => {
    const idx = modalStack.indexOf(handler);
    if (idx !== -1) modalStack.splice(idx, 1);
  };
}

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    // 1. ESCAPE KEY (Esc)
    if (e.key === 'Escape') {
      if (modalStack.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        const top = modalStack[modalStack.length - 1];
        if (top && typeof top.onEscape === 'function') {
          top.onEscape(e);
        }
        return;
      }

      // If no modal is open, clear search input or blur active element
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
        if (activeEl.tagName === 'INPUT' && (activeEl.type === 'search' || activeEl.placeholder?.includes('بحث')) && activeEl.value) {
          activeEl.value = '';
          activeEl.dispatchEvent(new Event('input', { bubbles: true }));
          activeEl.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          activeEl.blur();
        }
      }
      return;
    }

    // 2. ENTER KEY (Enter)
    if (e.key === 'Enter') {
      if (modalStack.length > 0) {
        // In textarea, allow normal multiline linebreaks unless Ctrl/Cmd is pressed
        if (e.target && e.target.tagName === 'TEXTAREA' && !e.ctrlKey && !e.metaKey) {
          return;
        }

        // If user is actively focused on a button or link, let native click happen
        if (e.target && (e.target.tagName === 'BUTTON' || e.target.tagName === 'A')) {
          return;
        }

        const top = modalStack[modalStack.length - 1];
        if (top && typeof top.onEnter === 'function') {
          e.preventDefault();
          e.stopPropagation();
          top.onEnter(e);
        }
      }
    }
  }, true);
}

// ============================
// MODAL
// ============================
export const Modal = ({ open, onClose, title, children, size = 'md' }) => {
  const modalBoxRef = React.useRef(null);
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;
  const hasFocusedRef = React.useRef(false);

  React.useEffect(() => {
    if (!open) {
      hasFocusedRef.current = false;
      return;
    }

    const prevOverflow = document.body.style.overflow;
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden';
    }

    const handler = {
      onEscape: () => {
        if (typeof onCloseRef.current === 'function') onCloseRef.current();
      },
      onEnter: (e) => {
        if (!modalBoxRef.current) return;

        // 1. Look for form inside modal
        const form = modalBoxRef.current.querySelector('form');
        if (form) {
          const submitBtn = form.querySelector('button[type="submit"]:not(:disabled), button.btn-primary:not(:disabled)');
          if (submitBtn) {
            submitBtn.click();
            return;
          }
          if (typeof form.requestSubmit === 'function') {
            form.requestSubmit();
            return;
          }
          form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
          return;
        }

        // 2. If no form, trigger primary or confirm button in modal box
        const primaryBtn = modalBoxRef.current.querySelector(
          'button.btn-primary:not(:disabled), button.btn-danger:not(:disabled), button[type="submit"]:not(:disabled)'
        );
        if (primaryBtn) {
          primaryBtn.click();
        }
      }
    };

    const unregister = registerModal(handler);

    // Auto-focus first interactive element ONCE on initial open only
    let focusTimer;
    if (!hasFocusedRef.current) {
      hasFocusedRef.current = true;
      focusTimer = setTimeout(() => {
        if (modalBoxRef.current) {
          const isFocusedInside = modalBoxRef.current.contains(document.activeElement);
          if (!isFocusedInside) {
            const firstInput = modalBoxRef.current.querySelector(
              'input:not([type="hidden"]):not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled])'
            );
            if (firstInput && typeof firstInput.focus === 'function') {
              firstInput.focus();
            }
          }
        }
      }, 50);
    }

    return () => {
      if (focusTimer) clearTimeout(focusTimer);
      if (typeof document !== 'undefined') {
        document.body.style.overflow = prevOverflow;
      }
      unregister();
    };
  }, [open]);

  if (!open) return null;
  const sizeClass = {
    sm: 'modal-sm',
    md: 'modal-md',
    lg: 'modal-lg',
    xl: 'modal-xl',
    full: 'modal-full'
  }[size] || 'modal-md';

  const modalContent = (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div ref={modalBoxRef} className={`modal-box ${sizeClass}`}>
        {title && (
          <div className="flex items-center justify-between mb-3.5">
            <h3 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 16 }}>{title}</h3>
            <button
              type="button"
              onClick={onClose}
              title="إغلاق (Esc)"
              style={{
                color: 'var(--text-muted)',
                background: 'var(--bg-elevated)', borderRadius: 8, width: 28, height: 28,
                display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)',
                cursor: 'pointer'
              }}
            ><X size={16} /></button>
          </div>
        )}
        {children}
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
};

// ============================
// STAT CARD
// Helper to safely render icons (Lucide forwardRef objects, functional components, JSX elements, or text/emojis)
const renderDynamicIcon = (icon, defaultSize = 20) => {
  if (!icon) return null;
  if (React.isValidElement(icon)) return icon;
  if (
    typeof icon === 'function' ||
    (typeof icon === 'object' && icon !== null && (icon.$$typeof || icon.render))
  ) {
    try {
      return React.createElement(icon, { size: defaultSize });
    } catch (e) {
      console.warn('Failed to render icon component:', e);
      return null;
    }
  }
  return <span style={{ fontSize: defaultSize }}>{String(icon)}</span>;
};

// ============================
// STAT CARD
// ============================
export const StatCard = ({ label, title, value, icon, color = 'blue', sub, subtitle }) => {
  const displayLabel = label || title;
  const displaySub = sub || subtitle;
  const colorClass = {
    blue: 'stat-blue', green: 'stat-green', emerald: 'stat-green', amber: 'stat-amber',
    red: 'stat-red', purple: 'stat-purple', teal: 'stat-teal'
  }[color] || 'stat-blue';

  const renderAnimatedValue = (val) => {
    if (val === null || val === undefined) return '0';
    if (typeof val === 'number') {
      return <AnimatedCounter value={val} />;
    }
    if (typeof val === 'string') {
      if (val.includes('ج.م')) {
        const isNegative = val.includes('-') || val.startsWith('-');
        const cleanNum = parseFloat(val.replace(/[^\d.]/g, ''));
        if (!isNaN(cleanNum)) {
          const finalNum = isNegative ? -cleanNum : cleanNum;
          return (
            <AnimatedCounter
              value={finalNum}
              formatter={(n) => `${Number(n).toLocaleString('ar-EG-u-nu-latn')} ج.م`}
            />
          );
        }
      }
      const rawInt = Number(val);
      if (!isNaN(rawInt) && val.trim() !== '') {
        return <AnimatedCounter value={rawInt} />;
      }
    }
    return val;
  };

  return (
    <div
      className={`${colorClass} stat-card-glow`}
      style={{
        borderRadius: 20, padding: '22px', display: 'flex', flexDirection: 'column', gap: 8,
        backdropFilter: 'blur(24px) saturate(190%)',
        WebkitBackdropFilter: 'blur(24px) saturate(190%)',
        position: 'relative', overflow: 'hidden',
        boxShadow: '0 15px 35px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.22)',
        transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s ease'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ color: 'rgba(255,255,255,0.92)', fontSize: 13.5, fontWeight: 700 }}>{displayLabel}</p>
        {icon && (
          <div style={{
            width: 42, height: 42, borderRadius: 14,
            background: 'rgba(255,255,255,0.18)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#ffffff', flexShrink: 0,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
          }}>
            {renderDynamicIcon(icon, 20)}
          </div>
        )}
      </div>
      <p className="tabular-nums" style={{ color: '#ffffff', fontSize: 26, fontWeight: 900, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
        {renderAnimatedValue(value)}
      </p>
      {displaySub && <p style={{ color: 'rgba(255,255,255,0.82)', fontSize: 12, fontWeight: 600 }}>{displaySub}</p>}
    </div>
  );
};

// ============================
// SPINNER
// ============================
export const Spinner = ({ size = 32 }) => {
  const sizeValue = typeof size === 'number' ? `${size}px` : (size === 'sm' ? '20px' : size === 'lg' ? '48px' : size === 'xl' ? '64px' : size);
  return (
    <div
      style={{
        width: sizeValue, height: sizeValue,
        border: '3px solid var(--border)',
        borderTopColor: 'var(--accent)',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
        margin: '0 auto',
      }}
    />
  );
};

// ============================
// EMPTY STATE
// ============================
export const EmptyState = ({ icon, message = 'لا توجد بيانات' }) => (
  <div style={{
    textAlign: 'center', padding: '48px 24px',
    color: '#7aa4d4',
  }}>
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12, opacity: 0.85 }}>
      {icon ? (
        renderDynamicIcon(icon, 46)
      ) : (
        <Inbox size={46} strokeWidth={1.5} color="var(--accent)" />
      )}
    </div>
    <p style={{ fontSize: 15, fontWeight: 500 }}>{message}</p>
  </div>
);

// ============================
// CONFIRM DIALOG
// ============================
export const ConfirmDialog = ({ open, title, message, onConfirm, onCancel, confirmText = 'تأكيد', cancelText = 'إلغاء', variant = 'danger' }) => {
  const confirmBtnRef = React.useRef(null);
  const onConfirmRef = React.useRef(onConfirm);
  onConfirmRef.current = onConfirm;
  const onCancelRef = React.useRef(onCancel);
  onCancelRef.current = onCancel;

  React.useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden';
    }

    const handler = {
      onEscape: () => {
        if (typeof onCancelRef.current === 'function') onCancelRef.current();
      },
      onEnter: (e) => {
        if (typeof onConfirmRef.current === 'function') onConfirmRef.current();
      }
    };

    const unregister = registerModal(handler);

    const focusTimer = setTimeout(() => {
      if (confirmBtnRef.current) {
        confirmBtnRef.current.focus();
      }
    }, 40);

    return () => {
      clearTimeout(focusTimer);
      if (typeof document !== 'undefined') {
        document.body.style.overflow = prevOverflow;
      }
      unregister();
    };
  }, [open]);

  if (!open) return null;
  const dialogContent = (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onCancel && onCancel()}>
      <div className="modal-box modal-sm">
        <div style={{ textAlign: 'center', paddingBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <div style={{
              width: 54, height: 54, borderRadius: '50%', background: 'rgba(245,158,11,0.15)',
              border: '1px solid rgba(245,158,11,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <AlertTriangle size={26} color="#f59e0b" />
            </div>
          </div>
          {title && <h3 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 18, marginBottom: 8 }}>{title}</h3>}
          {message && <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>{message}</p>}
          <div style={{ display: 'flex', gap: 12 }}>
            <Button
              ref={confirmBtnRef}
              variant={variant}
              className="flex-1"
              onClick={onConfirm}
              title="تأكيد (Enter)"
            >
              {confirmText} (Enter ↵)
            </Button>
            <Button
              variant="ghost"
              className="flex-1"
              onClick={onCancel}
              title="إلغاء (Esc)"
            >
              {cancelText} (Esc)
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(dialogContent, document.body);
  }
  return dialogContent;
};

// ============================
// ALERT
// ============================
export const Alert = ({ type = 'error', message }) => {
  if (!message) return null;
  const styles = {
    error:   { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', text: '#fca5a5' },
    success: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', text: '#6ee7b7' },
    warning: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', text: '#fcd34d' },
  };
  const s = styles[type] || styles.error;
  return (
    <div style={{
      background: s.bg, border: `1px solid ${s.border}`, borderRadius: 10,
      padding: '10px 14px', color: s.text, fontSize: 13
    }}>
      {message}
    </div>
  );
};

// ============================
// SKELETON LOADERS
// ============================
export * from './Skeleton';
export { default as DateInputDMY } from './DateInputDMY';


