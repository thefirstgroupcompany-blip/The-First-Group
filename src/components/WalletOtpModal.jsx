import React, { useState, useEffect, useRef } from 'react';
import { Modal, Button } from './ui';
import { ShieldCheck, Lock, AlertCircle, CheckCircle2, Delete, Smartphone } from 'lucide-react';
import { formatCurrency } from '../utils/constants';

export default function WalletOtpModal({
  isOpen,
  onClose,
  client,
  amount = 0,
  onConfirm,
  loading = false
}) {
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setOtp('');
      setError('');
      setIsShaking(false);
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 150);
    }
  }, [isOpen]);

  const handleDigitClick = (digit) => {
    if (loading) return;
    setError('');
    if (otp.length < 4) {
      setOtp(prev => prev + digit);
    }
  };

  const handleBackspace = () => {
    if (loading) return;
    setError('');
    setOtp(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    if (loading) return;
    setError('');
    setOtp('');
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (otp.length !== 4) {
      setError('يرجى إدخال الكود كاملاً (4 أرقام)');
      triggerShake();
      return;
    }

    try {
      await onConfirm(otp);
    } catch (err) {
      setError(err.message || 'فشل التحقق من كود الأمان المؤقت');
      triggerShake();
      setOtp('');
    }
  };

  const triggerShake = () => {
    setIsShaking(true);
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    setTimeout(() => setIsShaking(false), 600);
  };

  if (!isOpen || !client) return null;

  const currentBal = Number(client.walletBalance) || 0;
  const numAmount = Number(amount) || 0;
  const remBal = currentBal - numAmount;

  return (
    <Modal
      isOpen={isOpen}
      onClose={loading ? undefined : onClose}
      title=""
      size="md"
    >
      <div style={{
        textAlign: 'center',
        padding: '6px 4px 10px',
        animation: isShaking ? 'shake 0.5s ease-in-out' : 'none'
      }}>
        <style>{`
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            20%, 60% { transform: translateX(-8px); }
            40%, 80% { transform: translateX(8px); }
          }
        `}</style>

        {/* Shield Icon Header */}
        <div style={{
          width: 60, height: 60, borderRadius: '50%',
          background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(126, 34, 206, 0.35))',
          border: '1.5px solid rgba(168, 85, 247, 0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 12px',
          boxShadow: '0 0 20px rgba(168, 85, 247, 0.3)'
        }}>
          <ShieldCheck size={32} color="#c084fc" />
        </div>

        <h3 style={{ color: '#ffffff', fontSize: 18, fontWeight: 900, margin: '0 0 4px' }}>
          🔐 تأكيد كود أمان المحفظة المؤقت (OTP)
        </h3>
        <p style={{ color: '#94a3b8', fontSize: 12, margin: '0 0 16px' }}>
          لحماية أموال المشترك، يلزم إدخال الكود اللحظي الظاهر على هاتف العميل
        </p>

        {/* Transaction Summary Card */}
        <div style={{
          background: 'rgba(0, 0, 0, 0.35)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 14,
          padding: '12px 16px',
          marginBottom: 16,
          textAlign: 'right',
          display: 'flex',
          flexDirection: 'column',
          gap: 8
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#cbd5e1', fontSize: 13, fontWeight: 700 }}>
              المشترك: <strong>{client.name}</strong> <span style={{ color: '#c084fc', fontSize: 11 }}>(#{client.memberId || '—'})</span>
            </span>
            <span style={{
              background: 'rgba(168, 85, 247, 0.15)',
              color: '#d8b4fe',
              padding: '2px 8px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 800
            }}>
              خصم محفظة
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
            <span style={{ color: '#94a3b8' }}>المبلغ المطلوب سحبه:</span>
            <strong style={{ color: '#f87171', fontSize: 15, fontWeight: 900 }}>
              {formatCurrency(numAmount)}
            </strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, borderTop: '1px dashed rgba(255,255,255,0.08)', paddingTop: 6 }}>
            <span style={{ color: '#94a3b8' }}>الرصيد المتاح حالياً:</span>
            <span style={{ color: '#34d399', fontWeight: 800 }}>{formatCurrency(currentBal)}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
            <span style={{ color: '#94a3b8' }}>الرصيد المتبقي بعد الخصم:</span>
            <span style={{ color: remBal >= 0 ? '#93c5fd' : '#f87171', fontWeight: 800 }}>{formatCurrency(remBal)}</span>
          </div>
        </div>

        {/* Instructions for Barista */}
        <div style={{
          background: 'rgba(59, 130, 246, 0.08)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          borderRadius: 12,
          padding: '10px 14px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          textAlign: 'right'
        }}>
          <Smartphone size={22} style={{ color: '#60a5fa', flexShrink: 0 }} />
          <div style={{ fontSize: 11.5, color: '#bfdbfe', lineHeight: 1.5 }}>
            اطلب من العميل فتح بوابته على هاتفه والضغط على <strong>«كود الدفع بالكافيه»</strong> لإعطائك الكود المؤقت المكون من 4 أرقام.
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: 10,
            padding: '9px 12px',
            color: '#fca5a5',
            fontSize: 12,
            fontWeight: 700,
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            textAlign: 'right'
          }}>
            <AlertCircle size={16} style={{ color: '#f87171', flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* 4-Digit Display Boxes */}
        <form onSubmit={handleSubmit}>
          {/* Hidden input to capture physical keyboard input */}
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={otp}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '').slice(0, 4);
              setOtp(val);
              setError('');
            }}
            style={{
              position: 'absolute',
              opacity: 0,
              pointerEvents: 'none',
              width: 1,
              height: 1
            }}
            autoFocus
          />

          <div
            onClick={() => inputRef.current && inputRef.current.focus()}
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 12,
              marginBottom: 18,
              cursor: 'pointer',
              direction: 'ltr'
            }}
          >
            {[0, 1, 2, 3].map((index) => {
              const digit = otp[index];
              const isFilled = digit !== undefined;
              const isCurrent = index === otp.length;

              return (
                <div
                  key={index}
                  style={{
                    width: 52,
                    height: 56,
                    borderRadius: 12,
                    background: isFilled ? 'rgba(168, 85, 247, 0.18)' : 'rgba(255, 255, 255, 0.04)',
                    border: isCurrent
                      ? '2px solid #a855f7'
                      : isFilled
                        ? '1.5px solid rgba(168, 85, 247, 0.6)'
                        : '1.5px solid rgba(255, 255, 255, 0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 26,
                    fontWeight: 900,
                    color: isFilled ? '#ffffff' : 'transparent',
                    boxShadow: isCurrent ? '0 0 15px rgba(168, 85, 247, 0.4)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {digit || '•'}
                </div>
              );
            })}
          </div>

          {/* Touchscreen Numeric Keypad */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8,
            maxWidth: 280,
            margin: '0 auto 16px',
            direction: 'ltr'
          }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handleDigitClick(num.toString())}
                disabled={loading || otp.length >= 4}
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 10,
                  padding: '12px 0',
                  color: '#ffffff',
                  fontSize: 20,
                  fontWeight: 800,
                  cursor: 'pointer',
                  transition: 'background 0.15s'
                }}
                onMouseDown={e => e.currentTarget.style.background = 'rgba(168, 85, 247, 0.3)'}
                onMouseUp={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'}
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClear}
              disabled={loading || otp.length === 0}
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: 10,
                padding: '12px 0',
                color: '#fca5a5',
                fontSize: 13,
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              مسح C
            </button>
            <button
              type="button"
              onClick={() => handleDigitClick('0')}
              disabled={loading || otp.length >= 4}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 10,
                padding: '12px 0',
                color: '#ffffff',
                fontSize: 20,
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              0
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              disabled={loading || otp.length === 0}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 10,
                padding: '12px 0',
                color: '#cbd5e1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <Delete size={20} />
            </button>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={loading}
              style={{ flex: 1, padding: 11 }}
            >
              إلغاء الخصم ✕
            </Button>
            <Button
              type="submit"
              variant="success"
              disabled={loading || otp.length !== 4}
              style={{
                flex: 2,
                padding: 11,
                fontSize: 14,
                fontWeight: 900,
                background: otp.length === 4 ? 'linear-gradient(135deg, #7e22ce, #9333ea)' : undefined,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6
              }}
            >
              {loading ? 'جارٍ التحقق والخصم...' : <><Lock size={16} /> تأكيد الخصم والإتمام 🔒</>}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
