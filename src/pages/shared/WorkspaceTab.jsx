import React, { useState, useEffect, useMemo } from 'react';
import {
  getClients, getAllClientSubscriptions, getWorkspaceSessions,
  recordWorkspaceCheckIn, recordWorkspaceCheckOut, deleteSession
} from '../../services/db';
import { Card, Button, Input, Select, Badge, EmptyState } from '../../components/ui';
import OccupancyMeterWidget from '../../components/OccupancyMeterWidget';
import { formatDateTime, formatDate, formatCurrency, formatHoursClock, formatDurationArabic } from '../../utils/constants';

export default function WorkspaceTab({ shiftId, employeeId, isEmployee = false }) {
  const [clients, setClients] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState(null);

  // Date range filters for history
  const todayStr = new Date().toISOString().split('T')[0];
  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate, setToDate] = useState(todayStr);
  const [historySearch, setHistorySearch] = useState('');
  const [historyDisplayLimit, setHistoryDisplayLimit] = useState(50);

  // Live timer tick for active visitors
  const [nowTime, setNowTime] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowTime(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsubC = getClients(setClients);
    const unsubSub = getAllClientSubscriptions(setSubscriptions);
    const unsubSess = getWorkspaceSessions(setSessions);

    return () => {
      unsubC && unsubC();
      unsubSub && unsubSub();
      unsubSess && unsubSess();
    };
  }, []);

  // Filter workspace subscriptions
  const workspaceSubs = subscriptions.filter(s => s.packageType === 'workspace' || !!s.totalHours);

  // Currently checked-in subscriptions
  const checkedInSubs = workspaceSubs.filter(s => !!s.currentSession?.checkIn);

  // Find client for a sub
  const getClientForSub = (sub) => clients.find(c => c.id === sub.clientId) || { name: 'مشترك', phone: '—', memberId: '—' };

  // Calculate elapsed time helper
  const getElapsedText = (checkInStr) => {
    if (!checkInStr) return '';
    const diffMs = Math.max(0, nowTime - new Date(checkInStr).getTime());
    const totalMinutes = Math.floor(diffMs / 60000);
    return formatDurationArabic(totalMinutes);
  };

  // Handle Quick Punch
  const handleSelectClient = (c) => {
    setSelectedClient(c);
    setActionMsg(null);
  };

  const handlePunch = async (client, sub) => {
    setLoading(true);
    setActionMsg(null);
    try {
      if (sub.currentSession?.checkIn) {
        // Check-Out
        const res = await recordWorkspaceCheckOut(client.id, sub.id, shiftId || null, employeeId || null);
        const clockRem = res.remainingClock || formatHoursClock(res.remainingHours);
        const durText = res.durationText || formatDurationArabic(res.durationMinutes);
        setActionMsg({
          type: 'danger',
          title: '🔴 تم تسجيل الانصراف بنجاح!',
          text: `العميل: ${client.name} | المدة: ${durText} | المتبقي في الرصيد: ${clockRem}`
        });
      } else {
        // Check-In
        const res = await recordWorkspaceCheckIn(client.id, sub.id, shiftId || null, employeeId || null);
        setActionMsg({
          type: 'success',
          title: '🟢 تم تسجيل الدخول بنجاح!',
          text: `العميل: ${client.name} | تم بدء التوقيت الآن | الرصيد المتاح: ${formatHoursClock(res.remainingHours)}`
        });
      }
      setSelectedClient(null);
      setSearchQuery('');
    } catch (err) {
      alert(err.message || 'حدث خطأ أثناء تسجيل الحضور والانصراف');
    } finally {
      setLoading(false);
    }
  };

  // Filtered clients for quick search
  const filteredClients = clients.filter(c => {
    if (!searchQuery.trim()) return false;
    const q = searchQuery.trim().toLowerCase();
    return c.name?.toLowerCase().includes(q) ||
           c.phone?.includes(q) ||
           c.memberId?.toLowerCase().includes(q);
  });

  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);

  // Today stats
  const todaySessions = useMemo(() => {
    return sessions.filter(s => {
      const sDate = s.date?.toDate ? s.date.toDate().toISOString().split('T')[0] : (s.checkOut || s.checkIn || '').split('T')[0];
      return sDate === todayStr;
    });
  }, [sessions, todayStr]);
  const todayHoursTotal = useMemo(() => todaySessions.reduce((sum, s) => sum + (Number(s.durationHours) || 0), 0), [todaySessions]);

  // History filtering
  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return sessions.filter(s => {
      const sDate = s.date?.toDate ? s.date.toDate().toISOString().split('T')[0] : (s.checkOut || s.checkIn || '').split('T')[0];
      const matchDate = (!fromDate || sDate >= fromDate) && (!toDate || sDate <= toDate);
      if (!matchDate) return false;
      if (!q) return true;
      const client = clientMap.get(s.clientId);
      return client?.name?.toLowerCase().includes(q) ||
             client?.memberId?.toLowerCase().includes(q) ||
             s.packageName?.toLowerCase().includes(q);
    });
  }, [sessions, fromDate, toDate, historySearch, clientMap]);

  const historyTotalHours = useMemo(() => filteredHistory.reduce((sum, s) => sum + (Number(s.durationHours) || 0), 0), [filteredHistory]);

  // Print Report
  const handlePrintReport = () => {
    const win = window.open('', '_blank');
    if (!win) {
      alert('يرجى السماح بالنوافذ المنبثقة لطباعة التقرير');
      return;
    }
    win.document.write(`
      <html dir="rtl">
        <head>
          <title>تقرير حضور وانصراف مساحة العمل (WORK SPACE)</title>
          <style>
            body { font-family: 'Cairo', sans-serif; direction: rtl; padding: 24px; color: #111; }
            h2 { text-align: center; margin-bottom: 4px; }
            p.sub { text-align: center; color: #666; font-size: 13px; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th, td { border: 1px solid #ccc; padding: 8px 10px; text-align: right; font-size: 13px; }
            th { background: #f0f4f8; font-weight: bold; }
            .summary { display: flex; justify-content: space-around; background: #f8fafc; padding: 12px; border-radius: 8px; margin-bottom: 16px; border: 1px solid #e2e8f0; font-weight: bold; }
          </style>
        </head>
        <body>
          <h2>تقرير حضور وانصراف مساحة العمل (WORK SPACE)</h2>
          <p class="sub">الفترة: من ${fromDate || 'البداية'} إلى ${toDate || 'اليوم'}</p>
          <div class="summary">
            <div>إجمالي الزيارات: ${filteredHistory.length} زيارة</div>
            <div>إجمالي الساعات المستهلكة: ${formatHoursClock(historyTotalHours)}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>اسم العميل</th>
                <th>رقم العضوية</th>
                <th>الباقة</th>
                <th>وقت الدخول</th>
                <th>وقت الخروج</th>
                <th>المدة المستهلكة</th>
              </tr>
            </thead>
            <tbody>
              ${filteredHistory.map((s, idx) => {
                const c = clientMap.get(s.clientId);
                return `
                  <tr>
                    <td>${idx + 1}</td>
                    <td><strong>${c?.name || 'مشترك'}</strong></td>
                    <td>${c?.memberId || '—'}</td>
                    <td>${s.packageName || 'Work Space'}</td>
                    <td>${s.checkIn ? new Date(s.checkIn).toLocaleTimeString('ar-EG-u-nu-latn') : '—'}</td>
                    <td>${s.checkOut ? new Date(s.checkOut).toLocaleTimeString('ar-EG-u-nu-latn') : '—'}</td>
                    <td><strong>${formatDurationArabic(s.durationMinutes || (s.durationHours * 60))} (${formatHoursClock(s.durationHours)})</strong></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `);
    win.document.close();
    win.print();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ color: '#ffffff', fontSize: 20, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🏢</span> مساحة العمل (WORK SPACE)
          </h2>
          <p style={{ color: '#93c5fd', fontSize: 13, margin: '4px 0 0' }}>
            تسجيل حضور وانصراف المشتركين واحتساب الساعات المستهلكة تلقائياً
          </p>
        </div>
      </div>

      {isEmployee && !shiftId && (
        <div style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.25)', padding: '10px 14px', borderRadius: 10, color: '#93c5fd', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>ℹ️</span> المناوبة المالية مغلقة حالياً — يمكنك تسجيل حضور وانصراف المشتركين بالساعات بشكل طبيعي وتلقائي.
        </div>
      )}

      {/* Live Venue Occupancy Meter & Peak Hours Traffic */}
      <OccupancyMeterWidget
        subscriptions={subscriptions}
        sessions={sessions}
        clients={clients}
        capacity={50}
      />

      {/* 4 Statistics Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <Card style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(15,32,64,0.95) 100%)', border: '1px solid rgba(16,185,129,0.35)', textAlign: 'center', padding: '16px' }}>
          <span style={{ fontSize: 24 }}>🟢</span>
          <p style={{ color: '#a7f3d0', fontSize: 12, marginTop: 4 }}>المتواجدون حالياً</p>
          <strong style={{ color: '#34d399', fontSize: 24, fontWeight: 900 }}>{checkedInSubs.length}</strong>
        </Card>

        <Card style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.15) 0%, rgba(15,32,64,0.95) 100%)', border: '1px solid rgba(59,130,246,0.35)', textAlign: 'center', padding: '16px' }}>
          <span style={{ fontSize: 24 }}>⏱️</span>
          <p style={{ color: '#93c5fd', fontSize: 12, marginTop: 4 }}>ساعات اليوم المستهلكة</p>
          <strong style={{ color: '#60a5fa', fontSize: 24, fontWeight: 900 }}>{formatHoursClock(todayHoursTotal)}</strong>
        </Card>

        <Card style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.15) 0%, rgba(15,32,64,0.95) 100%)', border: '1px solid rgba(168,85,247,0.35)', textAlign: 'center', padding: '16px' }}>
          <span style={{ fontSize: 24 }}>👥</span>
          <p style={{ color: '#d8b4fe', fontSize: 12, marginTop: 4 }}>زيارات اليوم</p>
          <strong style={{ color: '#c084fc', fontSize: 24, fontWeight: 900 }}>{todaySessions.length}</strong>
        </Card>

        <Card style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', textAlign: 'center', padding: '16px' }}>
          <span style={{ fontSize: 24 }}>📦</span>
          <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>اشتراكات مساحة العمل</p>
          <strong style={{ color: '#ffffff', fontSize: 24, fontWeight: 900 }}>{workspaceSubs.length}</strong>
        </Card>
      </div>

      {/* QUICK PUNCH CARD */}
      <Card style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-glow)' }}>
        <h3 style={{ color: '#ffffff', fontWeight: 800, fontSize: 16, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>⚡</span> تسجيل حضور / انصراف سريع (Work Space Punch)
        </h3>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Input
            placeholder="ابحث بالاسم، برقم الموبايل، أو برقم العضوية..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setSelectedClient(null); }}
            style={{ flex: 1, minWidth: 260 }}
            autoFocus
          />
        </div>

        {/* Autocomplete matching list */}
        {searchQuery.trim() && !selectedClient && (
          <div style={{
            marginTop: 10, background: 'var(--bg-base)', borderRadius: 12,
            border: '1px solid var(--border)', maxHeight: 220, overflowY: 'auto'
          }}>
            {filteredClients.length === 0 ? (
              <p style={{ color: '#94a3b8', padding: 14, margin: 0, textAlign: 'center', fontSize: 13 }}>لا يوجد مشترك مطابق للبحث</p>
            ) : (
              filteredClients.map(c => {
                const clientWsSubs = workspaceSubs.filter(s => s.clientId === c.id);
                const activeWsSub = clientWsSubs.find(s => s.status !== 'paused');
                const isCheckedIn = !!activeWsSub?.currentSession?.checkIn;
                const rem = activeWsSub ? Math.max(0, (activeWsSub.totalHours || 0) - (activeWsSub.hoursUsed || 0)) : 0;

                return (
                  <div
                    key={c.id}
                    onClick={() => handleSelectClient(c)}
                    style={{
                      padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      cursor: 'pointer', transition: 'background 0.2s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.1)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div>
                      <strong style={{ color: '#ffffff', fontSize: 15 }}>{c.name}</strong>
                      <span style={{ color: '#93c5fd', fontSize: 12, marginRight: 10 }}>📱 {c.phone}</span>
                      <span style={{ color: '#60a5fa', fontSize: 12, marginRight: 10 }}>🆔 {c.memberId}</span>
                    </div>
                    <div>
                      {isCheckedIn ? (
                        <Badge color="green">🟢 متواجد حالياً</Badge>
                      ) : activeWsSub ? (
                        <Badge color="purple">🏢 مساحة عمل ({formatHoursClock(rem)} متبقي)</Badge>
                      ) : (
                        <Badge color="amber">بدون باقة ساعات سارية</Badge>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Selected Client Card for Direct Punch */}
        {selectedClient && (
          <div style={{
            marginTop: 16, padding: '16px', background: 'var(--bg-base)',
            borderRadius: 14, border: '1px solid rgba(59,130,246,0.3)', animation: 'fadeIn 0.2s ease-out'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
              <div>
                <h4 style={{ color: '#ffffff', fontWeight: 800, fontSize: 17, margin: 0 }}>{selectedClient.name}</h4>
                <p style={{ color: '#93c5fd', fontSize: 13, marginTop: 4 }}>
                  📱 {selectedClient.phone} | 🆔 رقم العضوية: <strong>{selectedClient.memberId}</strong>
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setSelectedClient(null)}>إلغاء</Button>
            </div>

            {(() => {
              const clientWsSubs = workspaceSubs.filter(s => s.clientId === selectedClient.id);
              if (clientWsSubs.length === 0) {
                return (
                  <div style={{ padding: 12, background: 'rgba(239,68,68,0.12)', borderRadius: 10, color: '#fca5a5', fontSize: 13 }}>
                    ⚠️ هذا العميل ليس لديه باقة مساحة عمل مسجلة. يرجى إضافة باقة مساحة عمل له من صفحة الأعضاء أولاً.
                  </div>
                );
              }

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {clientWsSubs.map(sub => {
                    const total = Number(sub.totalHours || sub.packageSessions) || 0;
                    const used = Number(sub.hoursUsed || sub.sessionsUsed) || 0;
                    const remaining = Math.max(0, parseFloat((total - used).toFixed(2)));
                    const isCheckedIn = !!sub.currentSession?.checkIn;

                    return (
                      <div key={sub.id} style={{
                        padding: '12px 14px', background: 'var(--bg-card)', borderRadius: 10,
                        border: isCheckedIn ? '1px solid #10b981' : '1px solid var(--border)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10
                      }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <strong style={{ color: '#ffffff', fontSize: 15 }}>{sub.packageName}</strong>
                            {isCheckedIn ? <Badge color="green">🟢 متواجد حالياً</Badge> : <Badge color="purple">ساري</Badge>}
                          </div>
                          <div style={{ color: remaining <= 0 ? '#f87171' : '#34d399', fontSize: 14, marginTop: 4, fontWeight: 800 }}>
                            الرصيد المتبقي: {formatHoursClock(remaining)} من {formatHoursClock(total)}
                          </div>
                          {isCheckedIn && (
                            <div style={{ color: '#93c5fd', fontSize: 12, marginTop: 2 }}>
                              ⏰ وقت الدخول: {new Date(sub.currentSession.checkIn).toLocaleTimeString('ar-EG-u-nu-latn')} ({getElapsedText(sub.currentSession.checkIn)})
                            </div>
                          )}
                        </div>

                        <Button
                          size="md"
                          variant={isCheckedIn ? "danger" : "success"}
                          disabled={loading}
                          onClick={() => handlePunch(selectedClient, sub)}
                          style={{ minWidth: 160 }}
                        >
                          {loading ? 'جاري التسجيل...' : isCheckedIn ? '🔴 تسجيل انصراف وخروج' : '🟢 تسجيل دخول مساحة العمل'}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* Action Message Alert */}
        {actionMsg && (
          <div style={{
            marginTop: 16, padding: '14px 16px', borderRadius: 12,
            background: actionMsg.type === 'danger' ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
            border: actionMsg.type === 'danger' ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(16,185,129,0.3)',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <h4 style={{ color: actionMsg.type === 'danger' ? '#fca5a5' : '#a7f3d0', fontSize: 15, margin: '0 0 4px', fontWeight: 800 }}>
              {actionMsg.title}
            </h4>
            <p style={{ color: '#ffffff', fontSize: 14, margin: 0, fontWeight: 600 }}>
              {actionMsg.text}
            </p>
          </div>
        )}
      </Card>

      {/* SECTION: CURRENTLY INSIDE THE WORKSPACE (LIVE LIST) */}
      <Card style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ color: '#ffffff', fontWeight: 800, fontSize: 17, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🟢</span> المتواجدون حالياً في مساحة العمل ({checkedInSubs.length})
          </h3>
          <span style={{ color: '#94a3b8', fontSize: 12 }}>يتم تحديث التوقيت تلقائياً 🔄</span>
        </div>

        {checkedInSubs.length === 0 ? (
          <EmptyState icon="🏢" message="لا يوجد مشتركون متواجدون في مساحة العمل حالياً" />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 14 }}>
            {checkedInSubs.map(sub => {
              const client = getClientForSub(sub);
              const total = Number(sub.totalHours || sub.packageSessions) || 0;
              const used = Number(sub.hoursUsed || sub.sessionsUsed) || 0;
              const remaining = Math.max(0, parseFloat((total - used).toFixed(2)));

              return (
                <Card key={sub.id} style={{
                  background: 'var(--bg-card)', border: '1px solid #10b981',
                  boxShadow: '0 0 16px rgba(16,185,129,0.2)', display: 'flex', flexDirection: 'column', gap: 10
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <strong style={{ color: '#ffffff', fontSize: 16 }}>{client.name}</strong>
                      <p style={{ color: '#93c5fd', fontSize: 12, margin: '2px 0 0' }}>📱 {client.phone}</p>
                    </div>
                    <Badge color="blue">{client.memberId}</Badge>
                  </div>

                  <div style={{ background: 'var(--bg-base)', padding: '8px 10px', borderRadius: 8, fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#c8dcf5' }}>
                      <span>الباقة:</span>
                      <strong>{sub.packageName}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#34d399', marginTop: 4 }}>
                      <span>الرصيد المتبقي:</span>
                      <strong style={{ fontSize: 14 }}>{formatHoursClock(remaining)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fcd34d', marginTop: 4 }}>
                      <span>وقت الدخول:</span>
                      <strong>{new Date(sub.currentSession.checkIn).toLocaleTimeString('ar-EG-u-nu-latn')}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#60a5fa', marginTop: 4, fontWeight: 700 }}>
                      <span>متواجد منذ:</span>
                      <strong>{getElapsedText(sub.currentSession.checkIn)}</strong>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="danger"
                    disabled={loading}
                    onClick={() => handlePunch(client, sub)}
                    style={{ marginTop: 'auto', width: '100%', justifyContent: 'center' }}
                  >
                    🔴 تسجيل خروج وانصراف
                  </Button>
                </Card>
              );
            })}
          </div>
        )}
      </Card>

      {/* SECTION: ATTENDANCE & VISITS HISTORY */}
      <Card style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 style={{ color: '#ffffff', fontWeight: 800, fontSize: 17, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>📅</span> سجل زيارات مساحة العمل ({filteredHistory.length})
            </h3>
            <p style={{ color: '#93c5fd', fontSize: 12, margin: '2px 0 0' }}>
              إجمالي الساعات المسجلة في الفترة: <strong style={{ color: '#34d399' }}>{formatHoursClock(historyTotalHours)}</strong>
            </p>
          </div>

          <Button size="sm" variant="ghost" onClick={handlePrintReport}>
            🖨️ طباعة التقرير
          </Button>
        </div>

        {/* Filters bar */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#93c5fd', fontSize: 12 }}>من:</span>
            <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ width: 140 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#93c5fd', fontSize: 12 }}>إلى:</span>
            <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={{ width: 140 }} />
          </div>
          <Input
            placeholder="بحث باسم العميل أو الباقة..."
            value={historySearch}
            onChange={e => setHistorySearch(e.target.value)}
            style={{ flex: 1, minWidth: 180 }}
          />
        </div>

        {/* Table */}
        {filteredHistory.length === 0 ? (
          <EmptyState icon="📅" message="لا توجد زيارات مسجلة في هذه الفترة" />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-base)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'right', color: '#93c5fd' }}>اسم العميل</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', color: '#93c5fd' }}>رقم العضوية</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', color: '#93c5fd' }}>الباقة</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', color: '#93c5fd' }}>الدخول</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', color: '#93c5fd' }}>الخروج</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', color: '#93c5fd' }}>المدة المستهلكة</th>
                  {!isEmployee && <th style={{ padding: '10px 12px', textAlign: 'center', color: '#93c5fd' }}>إجراء</th>}
                </tr>
              </thead>
              <tbody>
                {filteredHistory.slice(0, historyDisplayLimit).map(s => {
                  const client = clientMap.get(s.clientId);
                  return (
                    <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <td style={{ padding: '10px 12px', color: '#ffffff', fontWeight: 700 }}>
                        {client?.name || 'مشترك'}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#60a5fa' }}>
                        {client?.memberId || '—'}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#c8dcf5' }}>
                        {s.packageName || 'Work Space'}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#94a3b8' }}>
                        {s.checkIn ? new Date(s.checkIn).toLocaleTimeString('ar-EG-u-nu-latn') : (s.date?.toDate ? new Date(s.date.toDate()).toLocaleTimeString('ar-EG-u-nu-latn') : '—')}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#94a3b8' }}>
                        {s.checkOut ? new Date(s.checkOut).toLocaleTimeString('ar-EG-u-nu-latn') : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#34d399', fontWeight: 800 }}>
                        {formatDurationArabic(s.durationMinutes || (s.durationHours * 60))} ({formatHoursClock(s.durationHours)})
                      </td>
                      {!isEmployee && (
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <button
                            onClick={async () => {
                              if (window.confirm('هل تريد حذف هذا السجل؟')) {
                                try {
                                  await deleteSession(s.id);
                                } catch (err) {
                                  alert('حدث خطأ أثناء حذف السجل: ' + (err.message || ''));
                                }
                              }
                            }}
                            style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 14 }}
                            title="حذف السجل"
                          >
                            🗑️
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {filteredHistory.length > historyDisplayLimit && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: '16px 0', flexWrap: 'wrap' }}>
            <Button size="sm" variant="secondary" onClick={() => setHistoryDisplayLimit(prev => prev + 50)}>
              ⬇️ عرض 50 زيارة إضافية (المتبقي: {filteredHistory.length - historyDisplayLimit} زيارة)
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setHistoryDisplayLimit(filteredHistory.length)}>
              عرض كامل الزيارات ({filteredHistory.length})
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
