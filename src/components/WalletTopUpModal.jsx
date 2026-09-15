import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { topUpClientWallet } from '../services/db';
import { formatCurrency } from '../utils/constants';
import {
  Wallet, Plus, Sparkles, X, CheckCircle2, AlertCircle,
  CreditCard, Banknote, Smartphone, Zap, ArrowRight
} from 'lucide-react';

const QUICK_AMOUNTS = [50, 100, 200, 500, 1000];
const BONUS_PRESETS = [
  { label: 'بدون بونص', percent: 0 },
  { label: '+5% بونص', percent: 0.05 },
  { label: '+10% بونص', percent: 0.10 },
  { label: '+15% بونص', percent: 0.15 }
];

export default function WalletTopUpModal({
  open,
  onClose,
  client,
  shiftId = null,
  employeeId = null,
  actorName = 'الاستقبال',
  onSuccess = null
}) {
  const [amount, setAmount] = useState('');
  const [bonusAmount, setBonusAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successData, setSuccessData] = useState(null);

  React.useEffect(() => {
    if (open) {
      setAmount('');
      setBonusAmount(0);
      setPaymentMethod('cash');
      setNotes('');
      setError('');
      setSuccessData(null);
      setLoading(false);
    }
  }, [open]);

  React.useEffect(() => {
    if (open && typeof document !== 'undefined') {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [open]);

  if (!open || !client) return null;

  const currentBalance = Number(client.walletBalance || 0);
  const depositVal = Number(amount || 0);
  const bonusVal = Number(bonusAmount || 0);
  const totalCredited = depositVal + bonusVal;
  const newBalance = currentBalance + totalCredited;

  const handleApplyPresetBonus = (pct) => {
    if (depositVal > 0) {
      setBonusAmount(Math.round(depositVal * pct));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (depositVal <= 0 && bonusVal <= 0) {
      setError('يرجى إدخال مبلغ صحيح للشحن');
      return;
    }

    setLoading(true);
    try {
      const res = await topUpClientWallet({
        clientId: client.id,
        amount: depositVal,
        bonusAmount: bonusVal,
        paymentMethod,
        shiftId,
        employeeId,
        notes,
        actorName
      });
      setSuccessData(res);
      if (onSuccess) onSuccess(res);
      setTimeout(() => {
        onClose();
      }, 1800);
    } catch (err) {
      console.error('Wallet topup error:', err);
      setError(err.message || 'حدث خطأ أثناء شحن المحفظة');
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.85)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      direction: 'rtl',
      fontFamily: 'Cairo, sans-serif'
    }}>
      <div style={{
        background: 'linear-gradient(145deg, #09172a 0%, #030a16 100%)',
        border: '1.5px solid rgba(56, 189, 248, 0.45)',
        borderRadius: 24,
        padding: '24px',
        width: '100%',
        maxWidth: 480,
        boxShadow: '0 25px 50px rgba(0,0,0,0.8), 0 0 40px rgba(2,132,199,0.25)',
        position: 'relative',
        color: '#ffffff'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)'
            }}>
              <Wallet size={22} color="#ffffff" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: '#ffffff' }}>
                شحن محفظة الرصيد الرقمية
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#93c5fd' }}>
                للمشترك: <strong>{client.name}</strong> • (#{client.memberId})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              borderRadius: 10,
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#94a3b8',
              cursor: 'pointer'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Success Confirmation Animation */}
        {successData ? (
          <div style={{ padding: '30px 20px', textAlign: 'center' }}>
            <div style={{
              width: 60,
              height: 60,
              borderRadius: '50%',
              background: 'rgba(16, 185, 129, 0.2)',
              border: '2px solid #10b981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: '#34d399'
            }}>
              <CheckCircle2 size={36} />
            </div>
            <h4 style={{ margin: '0 0 6px', color: '#ffffff', fontSize: 18, fontWeight: 900 }}>
              تم شحن المحفظة بنجاح! 💳✨
            </h4>
            <p style={{ color: '#93c5fd', fontSize: 13, margin: '0 0 14px' }}>
              تم إضافة <strong>{formatCurrency(successData.totalCredited)}</strong> إلى حساب {client.name}
            </p>
            <div style={{
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: 14,
              padding: '10px 16px',
              display: 'inline-block',
              fontSize: 14,
              color: '#34d399',
              fontWeight: 900
            }}>
              الرصيد المتاح الجديد: {formatCurrency(successData.balanceAfter)}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Current Balance Bar */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 14,
              padding: '10px 16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>
                رصيد المحفظة الحالي:
              </span>
              <strong style={{ fontSize: 16, color: '#34d399', fontWeight: 900 }}>
                {formatCurrency(currentBalance)}
              </strong>
            </div>

            {/* Amount Input */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#e2e8f0', marginBottom: 6 }}>
                المبلغ المراد شحنه (المقبوض من العميل):
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  placeholder="مثال: 500"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(15, 23, 42, 0.9)',
                    border: '1.5px solid rgba(56, 189, 248, 0.4)',
                    borderRadius: 12,
                    padding: '12px 16px 12px 60px',
                    color: '#ffffff',
                    fontSize: 17,
                    fontWeight: 900,
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                <span style={{
                  position: 'absolute',
                  left: 16,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#93c5fd',
                  fontSize: 13,
                  fontWeight: 800
                }}>
                  ج.م
                </span>
              </div>

              {/* Quick Amount Buttons */}
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {QUICK_AMOUNTS.map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setAmount(val.toString())}
                    style={{
                      flex: 1,
                      minWidth: 60,
                      background: depositVal === val ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                      border: depositVal === val ? '1.5px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                      color: depositVal === val ? '#38bdf8' : '#cbd5e1',
                      borderRadius: 8,
                      padding: '6px 8px',
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    +{val} ج
                  </button>
                ))}
              </div>
            </div>

            {/* Bonus / Cashback Promotion */}
            <div style={{
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              borderRadius: 14,
              padding: '10px 14px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#fcd34d', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Sparkles size={14} color="#f59e0b" />
                  <span>بونص كاش باك تشجيعي (رصيد مجاني إضافي):</span>
                </span>
                <span style={{ fontSize: 13, fontWeight: 900, color: '#f59e0b' }}>
                  +{bonusVal} ج.م
                </span>
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                {BONUS_PRESETS.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleApplyPresetBonus(p.percent)}
                    style={{
                      flex: 1,
                      background: (p.percent === 0 && bonusVal === 0) || (p.percent > 0 && Math.round(depositVal * p.percent) === bonusVal && bonusVal > 0)
                        ? 'rgba(245, 158, 11, 0.3)'
                        : 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      color: '#fef08a',
                      borderRadius: 8,
                      padding: '5px 8px',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Payment Method Selector */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#cbd5e1', marginBottom: 6 }}>
                طريقة استلام المبلغ بالخزينة:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
                {[
                  { id: 'cash', label: 'نقدي (كاش بالدرج)', icon: Banknote, color: '#34d399' },
                  { id: 'instapay', label: 'إنستاباي (InstaPay)', icon: Zap, color: '#a855f7' },
                  { id: 'visa', label: 'فيزا / بطاقة', icon: CreditCard, color: '#60a5fa' }
                ].map(pm => {
                  const Icon = pm.icon;
                  const isSel = paymentMethod === pm.id;
                  return (
                    <button
                      key={pm.id}
                      type="button"
                      onClick={() => setPaymentMethod(pm.id)}
                      style={{
                        background: isSel ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                        border: isSel ? '1.5px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: 10,
                        padding: '8px 10px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        color: isSel ? '#ffffff' : '#94a3b8',
                        fontSize: 12,
                        fontWeight: isSel ? 900 : 700,
                        cursor: 'pointer'
                      }}
                    >
                      <Icon size={16} color={pm.color} />
                      <span>{pm.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Live Calculation Summary */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.15) 0%, rgba(30, 41, 59, 0.6) 100%)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: 14,
              padding: '12px 16px',
              fontSize: 12
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: '#94a3b8' }}>المبلغ المودع بالخزينة:</span>
                <strong style={{ color: '#ffffff' }}>{formatCurrency(depositVal)}</strong>
              </div>
              {bonusVal > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#f59e0b' }}>
                  <span>بونص كاش باك مجاني:</span>
                  <strong>+{formatCurrency(bonusVal)}</strong>
                </div>
              )}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                borderTop: '1px solid rgba(255,255,255,0.1)',
                paddingTop: 6,
                marginTop: 6
              }}>
                <span style={{ color: '#38bdf8', fontWeight: 800 }}>الرصيد الإجمالي الجديد بعد الشحن:</span>
                <strong style={{ color: '#34d399', fontSize: 15, fontWeight: 900 }}>
                  {formatCurrency(newBalance)}
                </strong>
              </div>
            </div>

            {error && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid #ef4444',
                color: '#fca5a5',
                borderRadius: 10,
                padding: '8px 12px',
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}>
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}

            {/* Submit Buttons */}
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#94a3b8',
                  borderRadius: 12,
                  padding: '12px',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer'
                }}
              >
                إلغاء
              </button>

              <button
                type="submit"
                disabled={loading || (depositVal <= 0 && bonusVal <= 0)}
                style={{
                  flex: 2,
                  background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
                  border: 'none',
                  color: '#ffffff',
                  borderRadius: 12,
                  padding: '12px',
                  fontWeight: 900,
                  fontSize: 14,
                  cursor: loading || (depositVal <= 0 && bonusVal <= 0) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  boxShadow: '0 4px 16px rgba(2, 132, 199, 0.4)'
                }}
              >
                {loading ? 'جاري الشحن والتسجيل...' : (
                  <>
                    <Wallet size={16} />
                    <span>تأكيد شحن {formatCurrency(totalCredited)}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
