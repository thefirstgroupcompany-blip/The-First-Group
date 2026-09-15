import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, ShieldCheck, Monitor, Smartphone, Tablet, 
  Trash2, Radio, CheckCircle, RefreshCw, X, AlertTriangle, Globe
} from 'lucide-react';
import { 
  watchActiveSessions, 
  terminateSession, 
  terminateAllOtherSessions, 
  getOrCreateSessionId 
} from '../services/sessionService';

export default function LiveSessionsModal({ isOpen, onClose }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [terminatingId, setTerminatingId] = useState(null);
  const [killingAll, setKillingAll] = useState(false);
  const currentSessionId = getOrCreateSessionId();

  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    const unsub = watchActiveSessions((activeList) => {
      setSessions(activeList);
      setLoading(false);
    });

    return () => {
      unsub && unsub();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const activeOnlineSessions = sessions.filter(s => s.isOnline);
  const terminatedOrStaleSessions = sessions.filter(s => !s.isOnline);

  const handleKillSingle = async (sessionId, userName) => {
    if (sessionId === currentSessionId) {
      if (!window.confirm('⚠️ تحذير: هذه جلستك الحالية! سيؤدي طردها إلى تسجيل خروجك فوراً من النظام. هل أنت متأكد؟')) {
        return;
      }
    } else {
      if (!window.confirm(`هل أنت متأكد من رغبتك في طرد جهاز (${userName}) وإنهاء جلسته عن بُعد فوراً؟`)) {
        return;
      }
    }

    setTerminatingId(sessionId);
    try {
      await terminateSession(sessionId, 'المدير العام');
    } catch (err) {
      console.error('Error killing session:', err);
      alert('حدث خطأ أثناء محاولة طرد الجلسة.');
    } finally {
      setTerminatingId(null);
    }
  };

  const handleKillAllOthers = async () => {
    const othersCount = activeOnlineSessions.filter(s => s.id !== currentSessionId).length;
    if (othersCount === 0) {
      alert('لا توجد أي أجهزة أخرى متصلة حالياً.');
      return;
    }

    if (!window.confirm(`⚠️ تحذير أمني: هل أنت متأكد من طرد جميع الأجهزة المتصلة الأخرى (${othersCount} جهاز) فوراً والإبقاء على هذا الجهاز فقط؟`)) {
      return;
    }

    setKillingAll(true);
    try {
      await terminateAllOtherSessions(currentSessionId);
    } catch (err) {
      console.error('Error killing all other sessions:', err);
      alert('حدث خطأ أثناء محاولة الطرد الجماعي.');
    } finally {
      setKillingAll(false);
    }
  };

  const getDeviceIcon = (deviceType) => {
    if (deviceType === 'mobile') return <Smartphone size={22} className="text-amber-400" />;
    if (deviceType === 'tablet') return <Tablet size={22} className="text-cyan-400" />;
    return <Monitor size={22} className="text-sky-400" />;
  };

  const formatLastSeen = (timestamp) => {
    if (!timestamp) return 'غير محدد';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);

    if (diffSec < 45) return 'متصل الآن 🟢';
    if (diffSec < 120) return `منذ ${diffSec} ثانية`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
    return date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(3, 7, 18, 0.82)',
      backdropFilter: 'blur(10px)',
      padding: 16
    }}>
      <div style={{
        background: 'linear-gradient(180deg, #091322 0%, #060d17 100%)',
        border: '1px solid rgba(56, 189, 248, 0.28)',
        borderRadius: 20,
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.9), 0 0 40px rgba(56, 189, 248, 0.15)',
        width: '100%',
        maxWidth: 820,
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        color: '#f8fafc',
        direction: 'rtl'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(15, 23, 42, 0.65)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#38bdf8'
            }}>
              <Radio size={24} className="animate-pulse" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#ffffff' }}>
                  رادار الأمان والأجهزة المتصلة الحية
                </h3>
                <span style={{
                  background: 'rgba(34, 197, 94, 0.15)',
                  border: '1px solid rgba(34, 197, 94, 0.4)',
                  color: '#4ade80',
                  fontSize: 11,
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: 999,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                  {activeOnlineSessions.length} أجهزة متصلة الآن
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#94a3b8' }}>
                مراقبة الجلسات الحية للمستخدمين والكاشير مع إمكانية الطرد الفوري عن بُعد عند أي اشتباه
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 10,
              color: '#94a3b8',
              cursor: 'pointer',
              padding: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Global Security Controls Bar */}
        <div style={{
          padding: '14px 24px',
          background: 'rgba(239, 68, 68, 0.06)',
          borderBottom: '1px solid rgba(239, 68, 68, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#fca5a5' }}>
            <AlertTriangle size={17} color="#ef4444" />
            <span>في حال الاشتباه في أي اختراق أو تسريب لحساب، يمكنك إغلاق كافة الجلسات الأخرى فوراً.</span>
          </div>

          <button
            onClick={handleKillAllOthers}
            disabled={killingAll || activeOnlineSessions.filter(s => s.id !== currentSessionId).length === 0}
            style={{
              background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
              border: 'none',
              borderRadius: 10,
              padding: '7px 14px',
              fontSize: 12.5,
              fontWeight: 800,
              color: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              opacity: (killingAll || activeOnlineSessions.filter(s => s.id !== currentSessionId).length === 0) ? 0.5 : 1,
              boxShadow: '0 4px 14px rgba(220, 38, 38, 0.3)'
            }}
          >
            <Trash2 size={14} />
            <span>{killingAll ? 'جاري الطرد...' : 'طرد جميع الأجهزة الأخرى'}</span>
          </button>
        </div>

        {/* Device Sessions List */}
        <div style={{
          padding: 24,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          flex: 1
        }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
              <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 10px' }} />
              <p style={{ margin: 0, fontSize: 13 }}>جاري مسح ورصد الأجهزة المتصلة...</p>
            </div>
          ) : activeOnlineSessions.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '30px 20px',
              background: 'rgba(255, 255, 255, 0.02)',
              borderRadius: 14,
              border: '1px dashed rgba(255, 255, 255, 0.1)',
              color: '#94a3b8'
            }}>
              <ShieldCheck size={36} style={{ color: '#38bdf8', margin: '0 auto 10px' }} />
              <p style={{ margin: 0, fontWeight: 700, color: '#ffffff' }}>لا توجد أجهزة متصلة في هذه اللحظة</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#38bdf8', marginBottom: 2 }}>
                الأجهزة النشطة حالياً ({activeOnlineSessions.length})
              </div>

              {activeOnlineSessions.map(session => {
                const isCurrent = session.id === currentSessionId;
                const isTerminating = terminatingId === session.id;

                return (
                  <div
                    key={session.id}
                    style={{
                      background: isCurrent ? 'rgba(56, 189, 248, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                      border: isCurrent ? '1.5px solid rgba(56, 189, 248, 0.45)' : '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: 14,
                      padding: '14px 18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 14,
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {/* Device & User Info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        background: 'rgba(15, 23, 42, 0.8)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {getDeviceIcon(session.deviceType)}
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: '#ffffff' }}>
                            {session.userName}
                          </span>
                          <span style={{
                            fontSize: 10.5,
                            padding: '1px 6px',
                            borderRadius: 6,
                            background: session.role === 'admin' ? 'rgba(234, 179, 8, 0.2)' : 'rgba(148, 163, 184, 0.15)',
                            color: session.role === 'admin' ? '#facc15' : '#cbd5e1',
                            fontWeight: 700
                          }}>
                            {session.role === 'admin' ? 'مدير' : 'موظف'}
                          </span>
                          {isCurrent && (
                            <span style={{
                              fontSize: 10.5,
                              padding: '1px 7px',
                              borderRadius: 6,
                              background: 'rgba(56, 189, 248, 0.2)',
                              color: '#38bdf8',
                              fontWeight: 800,
                              border: '1px solid rgba(56, 189, 248, 0.4)'
                            }}>
                              جهازك الحالي ⭐
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, fontSize: 11.5, color: '#94a3b8' }}>
                          <span>💻 {session.os}</span>
                          <span>🌐 {session.browser}</span>
                          <span>📐 {session.screenResolution}</span>
                          {session.currentTab && (
                            <span style={{ color: '#38bdf8' }}>
                              📍 {session.currentTab}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Status & Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ textAlign: 'left', minWidth: 100 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#4ade80' }}>
                            {formatLastSeen(session.lastHeartbeat)}
                          </span>
                        </div>
                        <span style={{ fontSize: 10, color: '#64748b', display: 'block', direction: 'ltr', textAlign: 'right' }}>
                          {session.sessionId ? session.sessionId.substring(0, 16) + '...' : ''}
                        </span>
                      </div>

                      <button
                        onClick={() => handleKillSingle(session.id, session.userName)}
                        disabled={isTerminating}
                        title={isCurrent ? "طرد الجلسة الحالية" : "طرد هذا الجهاز وإنهاء الجلسة فوراً"}
                        style={{
                          background: isCurrent ? 'rgba(255, 255, 255, 0.05)' : 'rgba(239, 68, 68, 0.15)',
                          border: isCurrent ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(239, 68, 68, 0.35)',
                          color: isCurrent ? '#94a3b8' : '#f87171',
                          borderRadius: 9,
                          padding: '7px 12px',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          transition: 'all 0.2s'
                        }}
                      >
                        <Trash2 size={13} />
                        <span>{isTerminating ? 'جاري الطرد...' : isCurrent ? 'تسجيل الخروج' : 'طرد الجلسة'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Recently Terminated / Inactive Log */}
          {terminatedOrStaleSessions.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>
                الجلسات المنتهية والمطرودة حديثاً ({terminatedOrStaleSessions.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, opacity: 0.75 }}>
                {terminatedOrStaleSessions.slice(0, 5).map(session => (
                  <div
                    key={session.id}
                    style={{
                      background: 'rgba(255, 255, 255, 0.015)',
                      border: '1px solid rgba(255, 255, 255, 0.04)',
                      borderRadius: 10,
                      padding: '8px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: 11.5,
                      color: '#94a3b8'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ color: '#f87171' }}>●</span>
                      <span style={{ fontWeight: 700, color: '#cbd5e1' }}>{session.userName}</span>
                      <span>({session.deviceType} - {session.os})</span>
                    </div>
                    <div>
                      {session.status === 'terminated' ? (
                        <span style={{ color: '#ef4444', fontWeight: 700 }}>
                          مطرود ({session.terminatedBy || 'عن بُعد'})
                        </span>
                      ) : (
                        <span style={{ color: '#64748b' }}>غير متصل</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(15, 23, 42, 0.4)',
          fontSize: 11.5,
          color: '#64748b'
        }}>
          <span>🛡️ نظام الحماية الذاتي - The First Group Security Framework</span>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              borderRadius: 8,
              padding: '6px 16px',
              fontSize: 12,
              fontWeight: 700,
              color: '#ffffff',
              cursor: 'pointer'
            }}
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
