import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { submitClientFeedback } from '../services/db';
import { registerModal } from './ui';
import { Star, X, CheckCircle2, MessageSquareHeart, Send, Coffee, Building2, Wifi, Users, GraduationCap, Sparkles } from 'lucide-react';

const SERVICE_CATEGORIES = [
  { id: 'ورك سبيس ومساحة عمل', label: 'مساحة العمل', icon: Building2 },
  { id: 'كافيه ومشروبات', label: 'الكافيه والمشروبات', icon: Coffee },
  { id: 'سرعة الإنترنت والتجهيزات', label: 'الإنترنت والكهرباء', icon: Wifi },
  { id: 'معاملة الموظفين والاستقبال', label: 'الاستقبال والتعامل', icon: Users },
  { id: 'الكورسات والمحاضرين', label: 'الكورسات والتدريب', icon: GraduationCap },
  { id: 'النظافة والراحة العامة', label: 'النظافة والراحة', icon: Sparkles }
];

const RATING_LABELS = {
  5: { text: 'ممتاز جداً وفوق التوقعات! 🌟', color: '#34d399' },
  4: { text: 'جيد جداً وتجربة رائعة! 👍', color: '#60a5fa' },
  3: { text: 'مقبول ولديك بعض الملاحظات 💬', color: '#f59e0b' },
  2: { text: 'أقل من المتوقع، نود معرفة السبب ⚠️', color: '#fb923c' },
  1: { text: 'تحتاج تحسين، نعتذر لك ونود التوضيح 💔', color: '#f87171' }
};

export default function ClientFeedbackModal({
  open,
  onClose,
  initialClientName = '',
  initialClientPhone = '',
  memberId = '',
  tableNumber = '',
  defaultService = 'ورك سبيس ومساحة عمل',
  source = 'portal',
  onFeedbackSubmitted
}) {
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [serviceRated, setServiceRated] = useState(defaultService);
  const [clientName, setClientName] = useState(initialClientName);
  const [clientPhone, setClientPhone] = useState(initialClientPhone);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  React.useEffect(() => {
    if (open) {
      setClientName(prev => prev || initialClientName || '');
      setClientPhone(prev => prev || initialClientPhone || '');
      setServiceRated(prev => prev || defaultService || 'ورك سبيس ومساحة عمل');
      setRating(prev => prev || 5);
      setSuccess(false);
      setLoading(false);
    }
  }, [open, initialClientName, initialClientPhone, defaultService]);

  React.useEffect(() => {
    if (!open) return;
    const prevOverflow = typeof document !== 'undefined' ? document.body.style.overflow : '';
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden';
    }

    const handler = {
      onEscape: () => {
        onClose();
      },
      onEnter: () => {
        if (!loading && !success) {
          const submitBtn = document.querySelector('.feedback-modal-box button[type="submit"]');
          if (submitBtn) submitBtn.click();
        }
      }
    };

    const unregister = registerModal(handler);

    return () => {
      if (typeof document !== 'undefined') {
        document.body.style.overflow = prevOverflow;
      }
      unregister();
    };
  }, [open, onClose, loading, success]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await submitClientFeedback({
        clientName: clientName.trim() || 'عميل مجهول',
        clientPhone: clientPhone.trim() || '',
        memberId: memberId || '',
        tableNumber: tableNumber || '',
        source,
        rating,
        serviceRated,
        comment: comment.trim()
      });

      try {
        localStorage.setItem('tfg_feedback_submitted', 'true');
        if (source) {
          localStorage.setItem(`tfg_feedback_submitted_${source}`, 'true');
        }
        if (memberId) {
          localStorage.setItem(`tfg_feedback_submitted_member_${memberId}`, 'true');
        }
        localStorage.setItem('tfg_feedback_submitted_at', String(Date.now()));
      } catch (storageErr) {
        console.warn('Could not save feedback state to localStorage:', storageErr);
      }

      if (typeof onFeedbackSubmitted === 'function') {
        try {
          onFeedbackSubmitted({ rating, serviceRated, comment });
        } catch (callbackErr) {
          console.error('Error in onFeedbackSubmitted callback:', callbackErr);
        }
      }

      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      alert('حدث خطأ أثناء إرسال التقييم: ' + (err.message || ''));
    } finally {
      setLoading(false);
    }
  };

  const activeRating = hoverRating || rating;
  const ratingInfo = RATING_LABELS[activeRating] || RATING_LABELS[5];

  const handleStarSelect = (num) => {
    setRating(num);
    setHoverRating(0);
  };

  const modalContent = (
    <div
      className="feedback-modal-overlay"
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        minHeight: '100dvh',
        background: 'rgba(2, 6, 20, 0.85)',
        backdropFilter: 'blur(16px) saturate(180%)',
        WebkitBackdropFilter: 'blur(16px) saturate(180%)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: 0,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        boxSizing: 'border-box'
      }}
    >
      <div
        className="feedback-modal-box"
        style={{
          background: 'linear-gradient(180deg, #0d1b32 0%, #060d1b 100%)',
          border: '1px solid rgba(255, 255, 255, 0.18)',
          borderTop: '2px solid rgba(245, 158, 11, 0.7)',
          borderRadius: '24px 24px 0 0',
          width: '100%',
          maxWidth: 480,
          maxHeight: 'calc(88dvh - env(safe-area-inset-top, 0px))',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          boxShadow: '0 -15px 50px rgba(0, 0, 0, 0.95), 0 0 35px rgba(245, 158, 11, 0.2)',
          fontFamily: 'Cairo, sans-serif',
          direction: 'rtl',
          boxSizing: 'border-box',
          position: 'relative'
        }}
      >
        {/* Sticky Header with Drag Bar */}
        <div style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          background: 'rgba(13, 27, 50, 0.98)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '6px 16px 8px',
          flexShrink: 0
        }}>
          {/* Mobile Drag Bar */}
          <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 6 }}>
            <div style={{ width: 38, height: 4, borderRadius: 2, background: 'rgba(255, 255, 255, 0.25)' }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 9,
                background: 'rgba(245, 158, 11, 0.18)',
                border: '1px solid rgba(245, 158, 11, 0.45)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#f59e0b', flexShrink: 0
              }}>
                <MessageSquareHeart size={16} />
              </div>
              <div>
                <h3 style={{ margin: 0, color: '#ffffff', fontWeight: 900, fontSize: 13.5 }}>
                  استبيان وتقييم تجربة المكان
                </h3>
                <p style={{ margin: 0, color: '#93c5fd', fontSize: 10.5, fontWeight: 600 }}>
                  The First Group — رأيك يصنع الفارق دائماً ✨
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#cbd5e1', borderRadius: 8, width: 28, height: 28,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer'
              }}
              title="إغلاق"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {success ? (
          <div style={{ textAlign: 'center', padding: '32px 16px' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'rgba(16, 185, 129, 0.18)',
              border: '2px solid rgba(16, 185, 129, 0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 12px', color: '#34d399',
              boxShadow: '0 0 24px rgba(16, 185, 129, 0.3)'
            }}>
              <CheckCircle2 size={32} />
            </div>
            <h3 style={{ color: '#ffffff', fontWeight: 900, fontSize: 18, margin: '0 0 6px' }}>
              شكراً جزيلاً لرأيك الغالي! ❤️
            </h3>
            <p style={{ color: '#93c5fd', fontSize: 13, margin: '0 0 14px', lineHeight: 1.5 }}>
              تم استلام تقييمك وملاحظاتك بنجاح، ووصلت مباشرة لإدارة <strong>The First Group</strong>.
            </p>
            <div style={{
              display: 'inline-block',
              background: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: 8, padding: '6px 14px', color: '#38bdf8', fontSize: 11.5, fontWeight: 700
            }}>
              سيتم إغلاق النافذة تلقائياً...
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            {/* Form Fields Container */}
            <div style={{
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              flex: 1
            }}>
              {/* Compact Stars Rating Card */}
              <div style={{
                background: 'rgba(15, 23, 42, 0.75)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                borderRadius: 14,
                padding: '10px 10px',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4
              }}>
                <label style={{ color: '#cbd5e1', fontSize: 12, fontWeight: 800 }}>
                  ما هو تقييمك العام لتجربتك معنا اليوم؟
                </label>

                {/* 5 Touch-Friendly Stars with Clear Numbers */}
                <div
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '2px 0' }}
                  onMouseLeave={() => setHoverRating(0)}
                >
                  {[1, 2, 3, 4, 5].map(starNum => {
                    const isFilled = starNum <= activeRating;
                    return (
                      <button
                        key={starNum}
                        type="button"
                        onClick={() => handleStarSelect(starNum)}
                        onMouseEnter={() => {
                          if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(hover: hover)').matches) {
                            setHoverRating(starNum);
                          }
                        }}
                        style={{
                          background: isFilled ? 'rgba(245, 158, 11, 0.18)' : 'rgba(255, 255, 255, 0.04)',
                          border: isFilled ? '1px solid rgba(245, 158, 11, 0.5)' : '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: 10,
                          width: 42,
                          height: 42,
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 1,
                          transition: 'all 0.15s ease',
                          transform: isFilled ? 'scale(1.05)' : 'scale(1)',
                          filter: isFilled ? 'drop-shadow(0 0 6px rgba(245, 158, 11, 0.4))' : 'none'
                        }}
                        title={`${starNum} من 5`}
                      >
                        <Star
                          size={20}
                          fill={isFilled ? '#f59e0b' : 'none'}
                          color={isFilled ? '#f59e0b' : 'rgba(255, 255, 255, 0.3)'}
                          strokeWidth={2}
                        />
                        <span style={{ fontSize: 9, fontWeight: 900, color: isFilled ? '#fcd34d' : 'rgba(255,255,255,0.4)' }}>
                          {starNum}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div style={{ color: ratingInfo.color, fontSize: 11.5, fontWeight: 800 }}>
                  {ratingInfo.text}
                </div>
              </div>

              {/* Service Category (Compact 3-Column Grid) */}
              <div>
                <label style={{ display: 'block', color: '#c8dcf5', fontSize: 11.5, fontWeight: 700, marginBottom: 4 }}>
                  الجانب المراد تقييمه:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5 }}>
                  {SERVICE_CATEGORIES.map(cat => {
                    const Icon = cat.icon;
                    const isSelected = serviceRated === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setServiceRated(cat.id)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                          padding: '6px 4px', borderRadius: 9,
                          background: isSelected ? 'rgba(56, 189, 248, 0.25)' : 'rgba(15, 23, 42, 0.6)',
                          border: isSelected ? '1.5px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                          color: isSelected ? '#ffffff' : '#94a3b8',
                          fontWeight: isSelected ? 800 : 600,
                          fontSize: 11, cursor: 'pointer', fontFamily: 'Cairo, sans-serif',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <Icon size={12} style={{ color: isSelected ? '#38bdf8' : '#64748b', flexShrink: 0 }} />
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Client Info (Side by Side in 1 Row) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ display: 'block', color: '#cbd5e1', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>
                    الاسم (اختياري):
                  </label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={e => setClientName(e.target.value)}
                    placeholder="اسمك الكريم"
                    style={{
                      width: '100%', background: 'rgba(15, 23, 42, 0.85)',
                      border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: 9,
                      padding: '7px 10px', color: '#ffffff', fontSize: 16,
                      fontFamily: 'Cairo, sans-serif', outline: 'none', boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', color: '#cbd5e1', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>
                    الموبايل (اختياري):
                  </label>
                  <input
                    type="tel"
                    value={clientPhone}
                    onChange={e => setClientPhone(e.target.value)}
                    placeholder="010xxxxxxxx"
                    style={{
                      width: '100%', background: 'rgba(15, 23, 42, 0.85)',
                      border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: 9,
                      padding: '7px 10px', color: '#ffffff', fontSize: 16,
                      fontFamily: 'Cairo, sans-serif', outline: 'none', boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              {/* Detailed Comment */}
              <div>
                <label style={{ display: 'block', color: '#cbd5e1', fontSize: 11, fontWeight: 700, marginBottom: 2 }}>
                  ملاحظاتك أو مقترحاتك للإدارة:
                </label>
                <textarea
                  rows={2}
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="اكتب هنا أي تفاصيل أو مقترحات تود مشاركتها معنا لتطوير المكان..."
                  style={{
                    width: '100%', background: 'rgba(15, 23, 42, 0.85)',
                    border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: 9,
                    padding: '8px 10px', color: '#ffffff', fontSize: 16,
                    fontFamily: 'Cairo, sans-serif', outline: 'none', boxSizing: 'border-box',
                    resize: 'none'
                  }}
                />
              </div>
            </div>

            {/* STICKY ACTION FOOTER: PINNED AT BOTTOM OF THE MODAL */}
            <div style={{
              position: 'sticky',
              bottom: 0,
              zIndex: 30,
              background: 'rgba(10, 22, 44, 0.98)',
              backdropFilter: 'blur(12px)',
              borderTop: '1px solid rgba(255, 255, 255, 0.12)',
              padding: '10px 16px calc(14px + env(safe-area-inset-bottom, 0px))',
              display: 'flex',
              gap: 8,
              boxShadow: '0 -8px 20px rgba(0,0,0,0.6)',
              flexShrink: 0
            }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  borderRadius: 10,
                  background: 'rgba(255, 255, 255, 0.07)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#cbd5e1',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'Cairo, sans-serif',
                  fontSize: 12
                }}
              >
                إلغاء
              </button>

              <button
                type="submit"
                disabled={loading}
                style={{
                  flex: 2,
                  padding: '9px 16px',
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 900,
                  fontSize: 13,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontFamily: 'Cairo, sans-serif',
                  boxShadow: '0 4px 16px rgba(245, 158, 11, 0.4)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                }}
              >
                {loading ? 'جاري الإرسال...' : <><Send size={14} /> إرسال التقييم للإدارة</>}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
}
