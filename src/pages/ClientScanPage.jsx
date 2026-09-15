import React, { useState, useEffect, useRef } from 'react';
import { getClients, recordSession, recordWorkspaceCheckIn, recordWorkspaceCheckOut, getClientSubscriptionsOnce } from '../services/db';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui';
import { Search, HelpCircle, PauseCircle, XCircle, Phone, CheckCircle2, ArrowRight, RefreshCw } from 'lucide-react';

export default function ClientScanPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sessionLoadingId, setSessionLoadingId] = useState(null);
  const [sessionDoneMsg, setSessionDoneMsg] = useState('');
  const inputRef = useRef();

  useEffect(() => {
    const unsubC = getClients(setClients);
    return () => unsubC();
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSearch = async (e) => {
    e?.preventDefault();
    setSessionDoneMsg('');
    setResult(null);
    const q = query.trim().toLowerCase();
    if (!q) return;

    setLoading(true);
    try {
      const found = clients.find(c =>
        c.phone === q ||
        c.name?.toLowerCase() === q ||
        c.phone?.includes(q) ||
        c.name?.toLowerCase().includes(q)
      );

      if (!found) {
        setResult({ notFound: true });
        return;
      }

      let subs = await getClientSubscriptionsOnce(found.id);

      if (subs.length === 0 && found.packageName) {
        subs = [{
          id: null,
          packageName: found.packageName,
          packageSessions: found.packageSessions || 0,
          sessionsUsed: found.sessionsUsed || 0,
          status: found.status || 'active'
        }];
      }

      const computedSubs = subs.map(s => {
        const isWs = s.packageType === 'workspace' || !!s.totalHours;
        const total = isWs ? (Number(s.totalHours || s.packageSessions) || 0) : (Number(s.packageSessions) || 0);
        const used = isWs ? (Number(s.hoursUsed || s.sessionsUsed) || 0) : (Number(s.sessionsUsed) || 0);
        const remaining = Math.max(0, parseFloat((total - used).toFixed(2)));
        const isCheckedIn = !!s.currentSession?.checkIn;
        return {
          ...s,
          isWorkspace: isWs,
          total,
          used,
          remaining,
          isCheckedIn,
          isExpired: remaining <= 0 && !isCheckedIn,
          isActive: (remaining > 0 || isCheckedIn) && s.status !== 'paused'
        };
      });

      const isPaused = found.status === 'paused';
      const activeSubs = computedSubs.filter(s => s.isActive);
      const expiredSubs = computedSubs.filter(s => s.isExpired);
      const allExpired = computedSubs.length > 0 && activeSubs.length === 0;

      setResult({
        client: found,
        subs: computedSubs,
        activeSubs,
        expiredSubs,
        isPaused,
        allExpired
      });
    } finally {
      setLoading(false);
    }
  };

  const handleWorkspaceAction = async (sub) => {
    if (!result?.client) return;
    setSessionLoadingId(sub.id || 'default');
    try {
      if (sub.isCheckedIn) {
        const res = await recordWorkspaceCheckOut(result.client.id, sub.id, null, null);
        setSessionDoneMsg(`تم تسجيل خروج ${result.client.name}! المدة: ${res.durationHours} ساعة (${res.durationMinutes} دقيقة) - المتبقي: ${res.remainingHours} ساعة`);
      } else {
        const res = await recordWorkspaceCheckIn(result.client.id, sub.id, null, null);
        setSessionDoneMsg(`تم تسجيل دخول ${result.client.name} إلى مساحة العمل! (الرصيد المتاح: ${res.remainingHours} ساعة)`);
      }
      handleSearch();
    } catch (err) {
      alert(err.message || 'حدث خطأ أثناء تسجيل مساحة العمل');
    } finally {
      setSessionLoadingId(null);
    }
  };

  const handleSessionForSub = async (sub) => {
    if (!result?.client) return;
    setSessionLoadingId(sub.id || 'default');
    try {
      await recordSession(result.client.id, null, null, sub.id || null);
      
      const newRemaining = Math.max(0, sub.remaining - 1);
      setSessionDoneMsg(`تم تسجيل الحصة بنجاح في باقة "${sub.packageName}"! (المتبقي: ${newRemaining} حصة)`);

      setResult(prev => {
        if (!prev) return null;
        const nextSubs = prev.subs.map(s => {
          if (s.id === sub.id) {
            const nextUsed = s.used + 1;
            const nextRem = Math.max(0, s.total - nextUsed);
            return {
              ...s,
              used: nextUsed,
              remaining: nextRem,
              isExpired: nextRem <= 0,
              isActive: nextRem > 0 && s.status !== 'paused'
            };
          }
          return s;
        });

        const nextActive = nextSubs.filter(s => s.isActive);
        const nextExpired = nextSubs.filter(s => s.isExpired);

        return {
          ...prev,
          subs: nextSubs,
          activeSubs: nextActive,
          expiredSubs: nextExpired,
          allExpired: nextActive.length === 0
        };
      });
    } finally {
      setSessionLoadingId(null);
    }
  };

  const reset = () => {
    setQuery('');
    setResult(null);
    setSessionDoneMsg('');
    inputRef.current?.focus();
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      fontFamily: 'Cairo, sans-serif'
    }}>
      <div className="glass-card" style={{
        padding: '40px 32px', width: '100%', maxWidth: 480,
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
          <h1 style={{ color: '#ffffff', fontWeight: 800, fontSize: 22, marginBottom: 4 }}>فحص اشتراك العميل</h1>
          <p style={{ color: '#93c5fd', fontSize: 13, margin: 0 }}>أدخل اسم العميل أو رقم الهاتف للتحقق الفوري</p>
        </div>

        <form onSubmit={handleSearch} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="مثال: أحمد أو 01012345678"
            autoFocus
            className="glass-input"
            style={{ direction: 'rtl', textAlign: 'center' }}
          />
          <button type="submit" className="glass-btn-primary" disabled={loading} style={{ width: '100%' }}>
            <Search size={16} />
            <span>{loading ? 'جاري الفحص...' : 'فحص العضوية'}</span>
          </button>
        </form>

        {result && (
          <div style={{ marginTop: 24, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 20, animation: 'fadeIn 0.3s ease-out' }}>
            {result.notFound && (
              <div style={{ textAlign: 'center', padding: 16 }}>
                <HelpCircle size={36} style={{ color: '#93c5fd', margin: '0 auto 8px', opacity: 0.8 }} />
                <p style={{ color: '#ffffff', fontWeight: 700, fontSize: 16 }}>لم يتم العثور على العميل</p>
                <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>تأكد من صحة الاسم أو رقم الهاتف المدخل</p>
              </div>
            )}

            {result.isPaused && (
              <div style={{ textAlign: 'center', padding: 16, background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: 14 }}>
                <PauseCircle size={36} style={{ color: '#f59e0b', margin: '0 auto 8px' }} />
                <p style={{ color: '#ffffff', fontWeight: 800, fontSize: 17 }}>{result.client.name}</p>
                <p style={{ color: '#fcd34d', fontWeight: 600, marginTop: 4 }}>الاشتراك موقوف مؤقتاً</p>
              </div>
            )}

            {!result.notFound && !result.isPaused && result.allExpired && (
              <div style={{ textAlign: 'center', padding: 16, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 14 }}>
                <XCircle size={36} style={{ color: '#ef4444', margin: '0 auto 8px' }} />
                <p style={{ color: '#ffffff', fontWeight: 800, fontSize: 17 }}>{result.client.name}</p>
                <p style={{ color: '#fca5a5', fontWeight: 700, marginTop: 4 }}>الاشتراكات منتهية</p>
                <p style={{ color: '#f87171', fontSize: 12, marginTop: 2 }}>لا توجد حصص متبقية في أي باقة</p>
              </div>
            )}

            {!result.notFound && !result.isPaused && (result.activeSubs.length > 0 || sessionDoneMsg) && (
              <div>
                <div style={{ textAlign: 'center', marginBottom: 16 }}>
                  <p style={{ color: '#ffffff', fontWeight: 800, fontSize: 19, margin: 0 }}>{result.client.name}</p>
                  {result.client.phone && (
                    <p style={{ color: '#93c5fd', fontSize: 13, marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Phone size={13} style={{ color: '#38bdf8' }} />
                      {result.client.phone}
                    </p>
                  )}
                </div>

                {sessionDoneMsg && (
                  <div style={{
                    marginBottom: 14, padding: '12px 14px', borderRadius: 12,
                    background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: '#6ee7b7', fontSize: 14, fontWeight: 700, textAlign: 'center',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                  }}>
                    <CheckCircle2 size={16} />
                    <span>{sessionDoneMsg}</span>
                  </div>
                )}

                {result.activeSubs.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {result.activeSubs.map(sub => (
                      <div
                        key={sub.id || sub.packageName}
                        style={{
                          background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: 14, padding: '12px 16px',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                        }}
                      >
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ color: '#ffffff', fontWeight: 700, fontSize: 15 }}>{sub.packageName}</span>
                          <div style={{ color: '#34d399', fontSize: 13, marginTop: 2, fontWeight: 700 }}>
                            {sub.isWorkspace || sub.packageType === 'workspace' ? `${sub.remaining} ساعة متبقية` : `${sub.remaining} من ${sub.total} حصة`}
                          </div>
                        </div>

                        {sub.isWorkspace || sub.packageType === 'workspace' ? (
                          <Button
                            variant={sub.isCheckedIn ? "danger" : "primary"}
                            size="sm"
                            onClick={() => handleWorkspaceAction(sub)}
                            disabled={sessionLoadingId === (sub.id || 'default')}
                            style={{ borderRadius: 10 }}
                          >
                            {sessionLoadingId === (sub.id || 'default') ? '...' : (sub.isCheckedIn ? 'تسجيل خروج' : 'تسجيل دخول')}
                          </Button>
                        ) : (
                          <Button
                            variant="success"
                            size="sm"
                            onClick={() => handleSessionForSub(sub)}
                            disabled={sessionLoadingId === (sub.id || 'default')}
                            style={{ borderRadius: 10 }}
                          >
                            {sessionLoadingId === (sub.id || 'default') ? '...' : `خصم حصة`}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ marginTop: 20, textAlign: 'center' }}>
              <button
                onClick={reset}
                style={{
                  background: 'none', border: 'none', color: '#93c5fd', fontSize: 13,
                  cursor: 'pointer', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6
                }}
              >
                <RefreshCw size={14} />
                <span>فحص عميل آخر</span>
              </button>
            </div>
          </div>
        )}

        <div style={{ marginTop: 24, textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16 }}>
          <Button variant="ghost" size="sm" onClick={() => navigate('/login')} style={{ color: 'rgba(200, 220, 245, 0.7)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <ArrowRight size={14} />
            <span>العودة لتسجيل الدخول</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
