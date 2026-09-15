import React, { useState, useEffect, useRef } from 'react';
import { getClients, getPackages, recordSession, getClientSubscriptionsOnce, recordWorkspaceCheckIn, recordWorkspaceCheckOut } from '../../services/db';
import { Button, Input, Card, Badge } from '../../components/ui';

export default function ClientScanTab({ shiftId, employeeId, isEmployee = false }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [clients, setClients] = useState([]);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sessionLoadingId, setSessionLoadingId] = useState(null);
  const [sessionDoneMsg, setSessionDoneMsg] = useState('');
  const inputRef = useRef();

  useEffect(() => {
    const unsubC = getClients(setClients);
    const unsubP = getPackages(setPackages);
    return () => { unsubC(); unsubP(); };
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
      const normalizeDigits = (str) => String(str || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '');
      const qDigits = normalizeDigits(q);
      const cleanQ = q.replace('#', '').trim();

      const found = clients.find(c => {
        const cMemberId = String(c.memberId || '').replace('#', '').trim().toLowerCase();
        const cId = String(c.id || '').toLowerCase();
        const cPhone = normalizeDigits(c.phone);
        const cName = (c.name || '').toLowerCase();

        return (
          cMemberId === cleanQ ||
          cId === cleanQ ||
          (cleanQ.length >= 4 && cId.startsWith(cleanQ)) ||
          cName.includes(cleanQ) ||
          (qDigits && (cPhone === qDigits || (qDigits.length >= 8 && cPhone.endsWith(qDigits.slice(-8)))))
        );
      });

      if (!found) {
        setResult({ notFound: true });
        return;
      }

      // Fetch all subscriptions for this client
      let subs = await getClientSubscriptionsOnce(found.id);

      // Fallback if no subscriptions collection docs exist yet for this client
      if (subs.length === 0 && found.packageName) {
        subs = [{
          id: null,
          packageName: found.packageName,
          packageSessions: found.packageSessions || 0,
          sessionsUsed: found.sessionsUsed || 0,
          status: found.status || 'active'
        }];
      }

      // Compute status for each subscription (Workspace Hours vs Course Sessions)
      const computedSubs = subs.map(s => {
        const isWs = s.packageType === 'workspace' || !!s.totalHours || s.packageName?.includes('ساعة') || s.packageName?.toLowerCase().includes('workspace');
        const total = isWs ? (Number(s.totalHours || s.packageSessions) || 0) : (Number(s.packageSessions) || 0);
        const used = isWs ? (Number(s.hoursUsed || s.sessionsUsed) || 0) : (Number(s.sessionsUsed) || 0);
        const remaining = Math.max(0, parseFloat((total - used).toFixed(2)));
        const isCheckedIn = !!s.currentSession?.checkIn || (isWs && !!found.workspaceCurrentSession?.checkIn);
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

  const handleWorkspacePunch = async (sub) => {
    if (!result?.client) return;

    setSessionLoadingId(sub.id || 'ws');
    try {
      if (sub.isCheckedIn) {
        const res = await recordWorkspaceCheckOut(result.client.id, sub.id, shiftId || null, employeeId || null);
        setSessionDoneMsg(`🔴 تم تسجيل خروج المشترك (${result.client.name}) بنجاح!\nالمدة: ${res.durationHours} ساعة (${res.durationMinutes} دقيقة) - المتبقي: ${res.remainingHours} ساعة`);
      } else {
        const res = await recordWorkspaceCheckIn(result.client.id, sub.id, shiftId || null, employeeId || null);
        setSessionDoneMsg(`🟢 تم تسجيل دخول المشترك (${result.client.name}) لمساحة العمل بنجاح!\nبدء احتساب الوقت الآن (الرصيد المتاح: ${res.remainingHours} ساعة)`);
      }
      // Re-fetch subscriptions
      const updatedSubs = await getClientSubscriptionsOnce(result.client.id);
      const recomputed = updatedSubs.map(s => {
        const isWs = s.packageType === 'workspace' || !!s.totalHours;
        const total = isWs ? (Number(s.totalHours || s.packageSessions) || 0) : (Number(s.packageSessions) || 0);
        const used = isWs ? (Number(s.hoursUsed || s.sessionsUsed) || 0) : (Number(s.sessionsUsed) || 0);
        const rem = Math.max(0, parseFloat((total - used).toFixed(2)));
        const isCheckedIn = !!s.currentSession?.checkIn;
        return { ...s, isWorkspace: isWs, total, used, remaining: rem, isCheckedIn, isActive: (rem > 0 || isCheckedIn) && s.status !== 'paused' };
      });
      setResult(prev => ({ ...prev, subs: recomputed, activeSubs: recomputed.filter(s => s.isActive) }));
    } catch (err) {
      alert('حدث خطأ: ' + err.message);
    } finally {
      setSessionLoadingId(null);
    }
  };

  const handleSessionForSub = async (sub) => {
    if (!result?.client) return;

    setSessionLoadingId(sub.id || 'default');
    try {
      await recordSession(result.client.id, shiftId || null, employeeId || null, sub.id || null);
      
      const newRemaining = Math.max(0, sub.remaining - 1);
      setSessionDoneMsg(`✅ تم تسجيل الحصة بنجاح في باقة "${sub.packageName}"! (المتبقي: ${newRemaining} حصة)`);

      // Update local state
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
    <div style={{ maxWidth: 650, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {isEmployee && !shiftId && (
        <div style={{
          padding: '14px 18px', borderRadius: 12,
          background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.3)',
          color: '#fcd34d', fontSize: 14, fontWeight: 600,
        }}>
          ⚠️ يجب فتح مناوبة أولاً لتتمكن من خصم حصة لعميل
        </div>
      )}

      <Card style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <h2 style={{ color: '#ffffff', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span>🔍</span> فحص اشتراك العميل
        </h2>
        
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <Input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="أدخل رقم الهاتف أو اسم العميل"
              autoFocus
            />
          </div>
          <Button type="submit" variant="primary" disabled={loading} style={{ minWidth: 100 }}>
            {loading ? 'جاري البحث...' : 'بحث'}
          </Button>
        </form>
      </Card>

      {/* Result */}
      {result && (
        <Card style={{ 
          background: 'var(--bg-card)', border: '1px solid var(--border-glow)',
          animation: 'fadeIn 0.3s ease-out'
        }}>
          {result.notFound && (
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <div style={{ fontSize: 36, marginBottom: 6 }}>❓</div>
              <p style={{ color: '#ffffff', fontWeight: 700, fontSize: 18 }}>لم يتم العثور على العميل</p>
              <p style={{ color: '#7aa4d4', fontSize: 13, marginTop: 4 }}>تأكد من كتابة الاسم أو الرقم بشكل صحيح</p>
            </div>
          )}

          {result.isPaused && (
            <div style={{ textAlign: 'center', padding: '20px', background: 'rgba(245, 158, 11, 0.1)', borderRadius: 12 }}>
              <div style={{ fontSize: 36, marginBottom: 6 }}>⏸️</div>
              <p style={{ color: '#ffffff', fontWeight: 800, fontSize: 18 }}>{result.client.name}</p>
              <p style={{ color: '#fcd34d', fontWeight: 600, marginTop: 4 }}>الاشتراك موقوف مؤقتاً</p>
              <p style={{ color: '#93c5fd', fontSize: 13, marginTop: 2 }}>يرجى مراجعة إدارة المنشأة</p>
            </div>
          )}

          {!result.notFound && !result.isPaused && result.allExpired && (
            <div style={{ textAlign: 'center', padding: '20px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: 12 }}>
              <div style={{ fontSize: 36, marginBottom: 6 }}>❌</div>
              <p style={{ color: '#ffffff', fontWeight: 800, fontSize: 18 }}>{result.client.name}</p>
              <p style={{ color: '#fca5a5', fontWeight: 700, marginTop: 4 }}>جميع الاشتراكات منتهية!</p>
              <p style={{ color: '#f87171', fontSize: 13, marginTop: 4 }}>لا توجد حصص متبقية في أي باقة - يرجى تجديد الاشتراك</p>
            </div>
          )}

          {!result.notFound && !result.isPaused && (result.activeSubs.length > 0 || sessionDoneMsg) && (
            <div>
              {/* Header Profile */}
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{ fontSize: 40, marginBottom: 6 }}>👤</div>
                <h3 style={{ color: '#ffffff', fontWeight: 800, fontSize: 22, margin: 0 }}>{result.client.name}</h3>
                {result.client.phone && <p style={{ color: '#93c5fd', fontSize: 13, marginTop: 4 }}>📞 {result.client.phone}</p>}
              </div>

              {/* Success Message Banner */}
              {sessionDoneMsg && (
                <div style={{
                  marginBottom: 16, padding: '14px 18px', borderRadius: 12,
                  background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)',
                  color: '#6ee7b7', fontSize: 15, fontWeight: 700, textAlign: 'center'
                }}>
                  {sessionDoneMsg}
                </div>
              )}

              {/* Active Subscriptions Selection */}
              {result.activeSubs.length > 0 && (
                <div>
                  <p style={{ color: '#c8dcf5', fontWeight: 700, fontSize: 15, marginBottom: 12 }}>
                    {result.activeSubs.length > 1 ? '🎯 اختر الباقة المراد تسجيل الحصة بها:' : '📦 الباقة السارية:'}
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {result.activeSubs.map(sub => (
                      <div
                        key={sub.id || sub.packageName}
                        style={{
                          background: 'var(--bg-base)', border: '1px solid var(--border)',
                          borderRadius: 14, padding: '16px 18px',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          flexWrap: 'wrap', gap: 12
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ color: '#ffffff', fontWeight: 800, fontSize: 17 }}>{sub.packageName}</span>
                            <Badge color="green">ساري</Badge>
                          </div>
                          <div style={{ color: '#93c5fd', fontSize: 13, marginTop: 4 }}>
                            الحصص المتبقية: <strong style={{ color: '#34d399', fontSize: 15 }}>{sub.remaining}</strong> من {sub.total} حصة
                          </div>
                        </div>

                        <Button
                          variant="success"
                          size="md"
                          onClick={() => handleSessionForSub(sub)}
                          disabled={sessionLoadingId === (sub.id || 'default')}
                          style={{ minWidth: 160 }}
                        >
                          {sessionLoadingId === (sub.id || 'default') ? 'جاري التسجيل...' : `✅ خصم حصة (${sub.packageName})`}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Expired Subscriptions if any */}
              {result.expiredSubs.length > 0 && (
                <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                  <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 8 }}>الباقات المنتهية لهذا العميل:</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {result.expiredSubs.map(sub => (
                      <div key={sub.id || sub.packageName} style={{
                        padding: '6px 12px', background: 'rgba(239, 68, 68, 0.08)',
                        border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 8,
                        fontSize: 12, color: '#fca5a5'
                      }}>
                        {sub.packageName} (منتهية - 0 حصة)
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: 20, textAlign: 'center', borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <button
              onClick={reset}
              style={{ background: 'none', border: 'none', color: '#7aa4d4', fontSize: 14, cursor: 'pointer', fontWeight: 600 }}
            >
              🔄 مسح / بحث عميل آخر
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}
