import React, { useState } from 'react';
import { recordAttendance } from '../services/db';
import { Button, Alert } from '../components/ui';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Clock, Info, ArrowRight, UserCheck } from 'lucide-react';

export default function AttendancePage() {
  const navigate = useNavigate();
  const [memberId, setMemberId] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleScan = async (e) => {
    e.preventDefault();
    if (!memberId.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await recordAttendance(memberId.trim());
      setResult(res);
      setMemberId('');
    } catch (err) {
      setError('رقم العضوية غير صحيح أو حدث خطأ');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      fontFamily: 'Cairo, sans-serif'
    }}>
      <div className="glass-card" style={{
        padding: '40px 32px', width: '100%', maxWidth: 420,
        textAlign: 'center'
      }}>
        <div style={{ marginBottom: 26 }}>
          <div style={{
            width: 160, height: 80, margin: '0 auto 12px',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <img
              src="/logo.png"
              alt="TFG"
              onError={(e) => { e.target.onerror = null; e.target.src = '/logo.png'; }}
              style={{
                width: '100%', height: '100%', objectFit: 'contain',
                mixBlendMode: 'screen', filter: 'drop-shadow(0 0 18px rgba(56,189,248,0.75))'
              }}
            />
          </div>
          <h1 style={{ color: '#ffffff', fontWeight: 800, fontSize: 22, marginBottom: 4 }}>تسجيل الحضور والانصراف</h1>
          <p style={{ color: '#93c5fd', fontSize: 13, margin: 0 }}>أدخل رقم عضويتك أو كود الموظف للتسجيل الفوري</p>
        </div>

        <form onSubmit={handleScan} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input
            value={memberId}
            onChange={e => setMemberId(e.target.value)}
            placeholder="رقم العضوية (EMP001)"
            className="glass-input"
            style={{ textAlign: 'center', fontWeight: 700, fontSize: 16 }}
            autoFocus
          />
          <button type="submit" className="glass-btn-primary" disabled={loading} style={{ width: '100%' }}>
            <UserCheck size={17} />
            <span>{loading ? 'جاري التسجيل...' : 'تأكيد التسجيل'}</span>
          </button>
        </form>

        {error && <div style={{ marginTop: 14 }}><Alert type="error" message={error} /></div>}

        {result && (
          <div style={{
            marginTop: 20, borderRadius: 16, padding: '20px', textAlign: 'center',
            background: result.type === 'checkin' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(56, 189, 248, 0.12)',
            border: `1px solid ${result.type === 'checkin' ? 'rgba(16, 185, 129, 0.35)' : 'rgba(56, 189, 248, 0.35)'}`,
            backdropFilter: 'blur(10px)'
          }}>
            {result.type === 'checkin' && (
              <>
                <CheckCircle2 size={36} style={{ color: '#34d399', margin: '0 auto 8px' }} />
                <p style={{ color: '#6ee7b7', fontWeight: 800, fontSize: 18, margin: 0 }}>تم تسجيل الحضور بنجاح</p>
                <p style={{ color: '#c8dcf5', fontSize: 13, marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Clock size={13} style={{ color: '#38bdf8' }} />
                  <span>الساعة: {result.time}</span>
                </p>
              </>
            )}
            {result.type === 'checkout' && (
              <>
                <CheckCircle2 size={36} style={{ color: '#38bdf8', margin: '0 auto 8px' }} />
                <p style={{ color: '#93c5fd', fontWeight: 800, fontSize: 18, margin: 0 }}>تم تسجيل الانصراف بنجاح</p>
                <p style={{ color: '#c8dcf5', fontSize: 13, marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Clock size={13} style={{ color: '#38bdf8' }} />
                  <span>الساعة: {result.time}</span>
                </p>
                <p style={{ color: '#34d399', fontWeight: 700, fontSize: 14, marginTop: 6 }}>مدة العمل: {result.hours} ساعة</p>
              </>
            )}
            {result.type === 'already' && (
              <>
                <Info size={36} style={{ color: '#f59e0b', margin: '0 auto 8px' }} />
                <p style={{ color: '#fcd34d', fontWeight: 700, margin: 0 }}>تم تسجيل الحضور والانصراف مسبقاً لهذا اليوم</p>
              </>
            )}
          </div>
        )}

        <div style={{ marginTop: 24, textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16 }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
            style={{ color: 'rgba(200, 220, 245, 0.7)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <ArrowRight size={14} />
            <span>العودة لتسجيل الدخول</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
