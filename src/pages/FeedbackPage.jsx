import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { submitClientFeedback, getSystemInfo } from '../services/db';
import { Star, CheckCircle2, MessageSquareHeart, Send, Coffee, Building2, Wifi, Users, GraduationCap, Sparkles, ArrowRight } from 'lucide-react';

const SERVICE_CATEGORIES = [
  { id: 'ورك سبيس ومساحة عمل', label: 'مساحة العمل والهدوء', icon: Building2 },
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
  1: { text: 'تجربة تحتاج تحسين، نعتذر لك ونود التوضيح 💔', color: '#f87171' }
};

export default function FeedbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [systemInfo, setSystemInfo] = useState({ name: 'THE FIRST GROUP' });

  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [serviceRated, setServiceRated] = useState('ورك سبيس ومساحة عمل');
  const [clientName, setClientName] = useState(searchParams.get('name') || '');
  const [clientPhone, setClientPhone] = useState(searchParams.get('phone') || '');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const memberId = searchParams.get('m') || searchParams.get('memberId') || '';
  const tableNumber = searchParams.get('t') || searchParams.get('table') || '';
  const source = searchParams.get('source') || 'direct_link';

  useEffect(() => {
    getSystemInfo().then(setSystemInfo).catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await submitClientFeedback({
        clientName: clientName.trim() || 'عميل مجهول',
        clientPhone: clientPhone.trim() || '',
        memberId,
        tableNumber,
        source,
        rating,
        serviceRated,
        comment: comment.trim()
      });

      try {
        localStorage.setItem('tfg_feedback_submitted', 'true');
        localStorage.setItem('tfg_feedback_submitted_at', String(Date.now()));
      } catch {}

      setSuccess(true);
    } catch (err) {
      alert('حدث خطأ أثناء إرسال التقييم: ' + (err.message || ''));
    } finally {
      setLoading(false);
    }
  };

  const activeRating = hoverRating || rating;
  const ratingInfo = RATING_LABELS[activeRating] || RATING_LABELS[5];

  return (
    <div style={{
      minHeight: '100vh',
      minHeight: '100dvh',
      background: 'transparent',
      fontFamily: 'Cairo, sans-serif',
      color: '#ffffff',
      padding: 'calc(16px + env(safe-area-inset-top, 0px)) 12px calc(40px + env(safe-area-inset-bottom, 0px))',
      direction: 'rtl',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{
        width: '100%',
        maxWidth: 540,
        background: 'rgba(10, 22, 44, 0.94)',
        border: '1px solid rgba(255, 255, 255, 0.16)',
        borderTop: '1px solid rgba(255, 255, 255, 0.4)',
        borderRadius: 24,
        padding: '24px 18px',
        boxShadow: '0 25px 70px rgba(0, 0, 0, 0.9), 0 0 40px rgba(56, 189, 248, 0.16)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxSizing: 'border-box'
      }}>
        {/* Header Branding */}
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ width: 140, height: 60, margin: '0 auto 8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img
              src="/logo.png"
              alt="THE FIRST GROUP"
              onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }}
              style={{ width: '100%', height: '100%', objectFit: 'contain', mixBlendMode: 'screen', filter: 'drop-shadow(0 0 16px rgba(56,189,248,0.7))' }}
            />
          </div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#ffffff' }}>
            استبيان وتقييم تجربة العميل
          </h1>
          <p style={{ margin: '4px 0 0', color: '#fcd34d', fontSize: 12, fontWeight: 700 }}>
            {systemInfo?.name || 'THE FIRST GROUP'} • رأيك يصنع الفرق دائماً
          </p>
        </div>

        {success ? (
          <div style={{ textAlign: 'center', padding: '30px 10px' }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: 'rgba(16, 185, 129, 0.18)',
              border: '2px solid rgba(16, 185, 129, 0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px', color: '#34d399',
              boxShadow: '0 0 30px rgba(16, 185, 129, 0.3)'
            }}>
              <CheckCircle2 size={40} />
            </div>
            <h2 style={{ color: '#ffffff', fontWeight: 900, fontSize: 20, margin: '0 0 8px' }}>
              شكراً جزيلاً لرأيك الغالي! ❤️
            </h2>
            <p style={{ color: '#93c5fd', fontSize: 14, margin: '0 0 24px', lineHeight: 1.7 }}>
              تم استلام تقييمك وملاحظاتك بنجاح، ووصلت مباشرة إلى إدارة <strong>The First Group</strong>.
              <br />
              نسعى دوماً لتقديم أعلى معايير الجودة والراحة لك!
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => navigate('/portal')}
                style={{
                  background: 'rgba(56, 189, 248, 0.15)',
                  border: '1px solid rgba(56, 189, 248, 0.4)',
                  borderRadius: 12, padding: '10px 18px',
                  color: '#bae6fd', fontSize: 13, fontWeight: 800, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontFamily: 'Cairo, sans-serif'
                }}
              >
                <ArrowRight size={15} />
                <span>العودة لحساب المشترك</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/menu')}
                style={{
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  border: 'none', borderRadius: 12, padding: '10px 18px',
                  color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontFamily: 'Cairo, sans-serif'
                }}
              >
                <Coffee size={15} />
                <span>منيو الكافيه</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Stars Rating Card */}
            <div style={{
              background: 'rgba(15, 23, 42, 0.85)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: 16,
              padding: '16px 12px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8
            }}>
              <label style={{ color: '#cbd5e1', fontSize: 13, fontWeight: 700 }}>
                ما هو تقييمك العام لتجربتك معنا اليوم؟
              </label>

              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '4px 0' }}
                onMouseLeave={() => setHoverRating(0)}
              >
                {[1, 2, 3, 4, 5].map(starNum => {
                  const isFilled = starNum <= activeRating;
                  return (
                    <button
                      key={starNum}
                      type="button"
                      onClick={() => { setRating(starNum); setHoverRating(0); }}
                      onMouseEnter={() => {
                        if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(hover: hover)').matches) {
                          setHoverRating(starNum);
                        }
                      }}
                      style={{
                        background: isFilled ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                        border: isFilled ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: 12,
                        width: 48,
                        height: 48,
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 2,
                        transition: 'all 0.15s ease',
                        transform: isFilled ? 'scale(1.05)' : 'scale(1)',
                        filter: isFilled ? 'drop-shadow(0 0 8px rgba(245, 158, 11, 0.5))' : 'none'
                      }}
                      title={`${starNum} من 5`}
                    >
                      <Star
                        size={22}
                        fill={isFilled ? '#f59e0b' : 'none'}
                        color={isFilled ? '#f59e0b' : 'rgba(255, 255, 255, 0.3)'}
                        strokeWidth={2}
                      />
                      <span style={{ fontSize: 9.5, fontWeight: 900, color: isFilled ? '#fcd34d' : 'rgba(255,255,255,0.4)' }}>
                        {starNum}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div style={{ color: ratingInfo.color, fontSize: 13.5, fontWeight: 800, transition: 'all 0.2s' }}>
                {ratingInfo.text}
              </div>
            </div>

            {/* Service Category */}
            <div>
              <label style={{ display: 'block', color: '#c8dcf5', fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>
                الجانب أو الخدمة المراد تقييمها:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 6 }}>
                {SERVICE_CATEGORIES.map(cat => {
                  const Icon = cat.icon;
                  const isSelected = serviceRated === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setServiceRated(cat.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '8px 10px', borderRadius: 10,
                        background: isSelected ? 'rgba(56, 189, 248, 0.2)' : 'rgba(15, 23, 42, 0.65)',
                        border: isSelected ? '1.5px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                        color: isSelected ? '#ffffff' : '#94a3b8',
                        fontWeight: isSelected ? 800 : 600,
                        fontSize: 12, cursor: 'pointer', fontFamily: 'Cairo, sans-serif',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <Icon size={14} style={{ color: isSelected ? '#38bdf8' : '#64748b', flexShrink: 0 }} />
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Client Info */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
              <div>
                <label style={{ display: 'block', color: '#cbd5e1', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  اسمك الكريم (اختياري):
                </label>
                <input
                  type="text"
                  value={clientName}
                  onChange={e => setClientName(e.target.value)}
                  placeholder="مثال: أحمد محمد"
                  style={{
                    width: '100%', background: 'rgba(15, 23, 42, 0.85)',
                    border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: 10,
                    padding: '9px 12px', color: '#ffffff', fontSize: 16,
                    fontFamily: 'Cairo, sans-serif', outline: 'none', boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', color: '#cbd5e1', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  رقم الموبايل (اختياري):
                </label>
                <input
                  type="tel"
                  value={clientPhone}
                  onChange={e => setClientPhone(e.target.value)}
                  placeholder="010xxxxxxxx"
                  style={{
                    width: '100%', background: 'rgba(15, 23, 42, 0.85)',
                    border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: 10,
                    padding: '9px 12px', color: '#ffffff', fontSize: 16,
                    fontFamily: 'Cairo, sans-serif', outline: 'none', boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            {/* Detailed Comment */}
            <div>
              <label style={{ display: 'block', color: '#cbd5e1', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                ملاحظاتك، مقترحاتك، أو أي شكوى ترغب في إيصالها للإدارة:
              </label>
              <textarea
                rows={3}
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="اكتب هنا أي تفاصيل أو مقترحات تود مشاركتها معنا لتطوير المكان..."
                style={{
                  width: '100%', background: 'rgba(15, 23, 42, 0.85)',
                  border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: 10,
                  padding: '10px 12px', color: '#ffffff', fontSize: 16,
                  fontFamily: 'Cairo, sans-serif', outline: 'none', boxSizing: 'border-box',
                  resize: 'none'
                }}
              />
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => navigate('/portal')}
                style={{
                  flex: 1, minWidth: 100, padding: '10px 16px', borderRadius: 12,
                  background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#94a3b8', fontWeight: 700, cursor: 'pointer', fontFamily: 'Cairo, sans-serif', fontSize: 13
                }}
              >
                العودة للبوابة
              </button>

              <button
                type="submit"
                disabled={loading}
                style={{
                  flex: 2, minWidth: 180, padding: '10px 20px', borderRadius: 12,
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  color: '#ffffff', border: 'none', fontWeight: 900, fontSize: 13.5,
                  cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'Cairo, sans-serif',
                  boxShadow: '0 4px 16px rgba(245, 158, 11, 0.35)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8
                }}
              >
                {loading ? 'جاري الإرسال...' : <><Send size={15} /> إرسال التقييم للإدارة</>}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
