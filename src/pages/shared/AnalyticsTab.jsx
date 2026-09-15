import React, { useState, useEffect, useMemo } from 'react';
import { getClients, getAllClientSubscriptions, getPackages, getAllPayments, getSessions } from '../../services/db';
import { Card, Button, Badge, EmptyState } from '../../components/ui';
import { exportToExcel } from '../../utils/excelExport';
import { openWhatsApp, getGenderGrammar } from '../../utils/whatsapp';

const SOHAG_DISTRICTS = [
  'الشهيد',
  'الزهراء',
  'سيتي',
  'شارع 15',
  'شارع الجمهورية',
  'شارع أسيوط',
  'ميدان الثقافة / التحرير',
  'الكورنيش الشرقي',
  'الكورنيش الغربي',
  'ميدان المحطة',
  'ترعة باجا',
  'شارع الكاشف',
  'شارع المخبز الآلي',
  'نجع أبو شجرة',
  'حي راشد',
  'حي الكوثر',
  'سوهاج الجديدة (الجامعة)',
  'أخميم'
];

export default function AnalyticsTab() {
  const [clients, setClients] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [packages, setPackages] = useState([]);
  const [payments, setPayments] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [retentionFilter, setRetentionFilter] = useState('all');

  useEffect(() => {
    const unsubC = getClients(setClients);
    const unsubS = getAllClientSubscriptions(setSubscriptions);
    const unsubP = getPackages(setPackages);
    const unsubPay = getAllPayments(setPayments);
    const unsubSess = getSessions ? getSessions(setSessions) : () => {};

    return () => {
      unsubC && unsubC();
      unsubS && unsubS();
      unsubP && unsubP();
      unsubPay && unsubPay();
      unsubSess && unsubSess();
    };
  }, []);

  const totalClients = clients.length;

  // 1. AGE DEMOGRAPHICS
  // 1. AGE DEMOGRAPHICS
  const clientsWithAge = useMemo(() => clients.filter(c => Number(c.age) > 0), [clients]);
  const totalAgeSum = useMemo(() => clientsWithAge.reduce((sum, c) => sum + Number(c.age), 0), [clientsWithAge]);
  const averageAge = clientsWithAge.length > 0 ? (totalAgeSum / clientsWithAge.length).toFixed(1) : 0;

  const ageBrackets = useMemo(() => {
    const brackets = {
      under18: { label: 'أقل من 18 سنة (ناشئين ومدرسي)', count: 0, color: '#38bdf8' },
      age18to24: { label: '18 - 24 سنة (شباب / جامعة)', count: 0, color: '#34d399' },
      age25to34: { label: '25 - 34 سنة (خريجين وموظفين)', count: 0, color: '#60a5fa' },
      age35to49: { label: '35 - 49 سنة (فئة متوسطة)', count: 0, color: '#fbbf24' },
      above50: { label: '50 سنة فأكثر', count: 0, color: '#f87171' },
      unknown: { label: 'غير محدد السن', count: 0, color: '#94a3b8' }
    };

    clients.forEach(c => {
      const age = Number(c.age);
      if (!age || isNaN(age)) brackets.unknown.count += 1;
      else if (age < 18) brackets.under18.count += 1;
      else if (age <= 24) brackets.age18to24.count += 1;
      else if (age <= 34) brackets.age25to34.count += 1;
      else if (age <= 49) brackets.age35to49.count += 1;
      else brackets.above50.count += 1;
    });

    return brackets;
  }, [clients]);

  // 2. GEOGRAPHIC DISTRIBUTION (SOHAG DISTRICTS)
  const { areaCounts, sortedAreas, topArea } = useMemo(() => {
    const counts = {};
    clients.forEach(c => {
      const rawAddr = (c.address || '').trim();
      if (!rawAddr) {
        counts['غير محدد'] = (counts['غير محدد'] || 0) + 1;
        return;
      }
      const matched = SOHAG_DISTRICTS.find(d => rawAddr.includes(d) || d.includes(rawAddr)) || rawAddr;
      counts[matched] = (counts[matched] || 0) + 1;
    });

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const top = sorted.length > 0 && sorted[0][0] !== 'غير محدد' ? sorted[0] : (sorted[1] || ['—', 0]);
    return { areaCounts: counts, sortedAreas: sorted, topArea: top };
  }, [clients]);

  // 3. RETENTION & INACTIVE MEMBERS RADAR
  const clientLastSessionMap = useMemo(() => {
    const map = new Map();
    sessions.forEach(s => {
      if (!s.clientId) return;
      const d = s.date?.toDate ? s.date.toDate() : (s.date ? new Date(s.date) : null);
      if (!d || isNaN(d.getTime())) return;
      const existing = map.get(s.clientId);
      if (!existing || d > existing) {
        map.set(s.clientId, d);
      }
    });
    return map;
  }, [sessions]);

  const analyzedClients = useMemo(() => {
    const now = new Date();
    return clients.map(c => {
      let lastDate = c.createdAt?.toDate ? c.createdAt.toDate() : (c.createdAt ? new Date(c.createdAt) : null);
      
      const sessionDate = clientLastSessionMap.get(c.id);
      if (sessionDate && (!lastDate || sessionDate > lastDate)) {
        lastDate = sessionDate;
      }

      const diffDays = lastDate ? Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)) : 999;
      
      let status = 'active';
      let statusLabel = 'نشط مؤخراً 🟢';
      let statusColor = 'green';
      if (diffDays > 30) {
        status = 'dormant';
        statusLabel = 'خامل جداً (+30 يوم) 🔴';
        statusColor = 'red';
      } else if (diffDays > 15) {
        status = 'at_risk';
        statusLabel = 'غائب (+15 يوم) 🟡';
        statusColor = 'amber';
      }

      return {
        ...c,
        lastDate,
        diffDays,
        retentionStatus: status,
        statusLabel,
        statusColor
      };
    });
  }, [clients, clientLastSessionMap]);

  const activeRetentionCount = useMemo(() => analyzedClients.filter(c => c.retentionStatus === 'active').length, [analyzedClients]);
  const atRiskCount = useMemo(() => analyzedClients.filter(c => c.retentionStatus === 'at_risk').length, [analyzedClients]);
  const dormantCount = useMemo(() => analyzedClients.filter(c => c.retentionStatus === 'dormant').length, [analyzedClients]);

  const filteredRetentionClients = useMemo(() => {
    return analyzedClients.filter(c => {
      if (retentionFilter === 'all') return true;
      return c.retentionStatus === retentionFilter;
    });
  }, [analyzedClients, retentionFilter]);

    const handleSendRetentionMessage = (client) => {
    const origin = window.location.origin;
    const directLink = origin + '/client?phone=' + encodeURIComponent(client.phone || '') + '&id=' + encodeURIComponent(client.memberId || '');
    const g = getGenderGrammar(client.gender);

    const message = `مرحباً ${g.titleShort} ${client.name} 👋✨

${g.missYou} في The First Group (TFG)! 🏢🌟
لاحظنا غيابك من فترة و${g.hopeYouAreWell}. ${g.giftYou} جلسة مجانية / خصم خاص على ${g.yourSub} القادم بمناسبة عودتك! 🎁

${g.canYou} مراجعة ${g.yourBalance} و${g.yourSub} عبر رابطك المباشر:
🔗 ${directLink}

مستنيين ${g.yourVisit} و${g.weWishYou}! ☕✨`;

    openWhatsApp(client.phone, message);
  };

  // 4. EXCEL EXPORT
  const handleExportAnalyticsExcel = () => {
    const headers = ['#', 'اسم العميل', 'رقم العضوية', 'الهاتف', 'المنطقة (سوهاج)', 'السن', 'حالة النشاط', 'أيام الغياب', 'إجمالي المدفوع'];
    const rows = analyzedClients.map((c, idx) => [
      idx + 1,
      c.name,
      c.memberId || '—',
      c.phone || '—',
      c.address || '—',
      c.age || '—',
      c.retentionStatus === 'active' ? 'نشط' : c.retentionStatus === 'at_risk' ? 'غائب (+15 يوم)' : 'خامل (+30 يوم)',
      c.diffDays >= 999 ? 'غير مسجل' : c.diffDays + ' يوم',
      c.totalPaid || 0
    ]);
    exportToExcel('تقرير_رادار_العملاء_والإحصائيات_TFG', headers, rows);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ color: '#ffffff', fontSize: 20, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>📊</span> الإحصائيات ورادار العملاء (TFG)
          </h2>
          <p style={{ color: '#93c5fd', fontSize: 13, margin: '4px 0 0' }}>
            تحليل ديموغرافي لمناطق سوهاج، متوسط الأعمار، ونظام إعادة جذب المشتركين
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button size="sm" onClick={handleExportAnalyticsExcel} style={{ background: 'linear-gradient(135deg, #059669, #10b981)', color: '#fff', fontWeight: 700 }}>
            📥 تصدير التقرير إلى Excel
          </Button>
        </div>
      </div>

      {/* TOP SUMMARY CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <Card style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.15) 0%, rgba(15,32,64,0.95) 100%)', border: '1px solid rgba(59,130,246,0.35)', textAlign: 'center', padding: '16px' }}>
          <span style={{ fontSize: 24 }}>👥</span>
          <p style={{ color: '#93c5fd', fontSize: 12, marginTop: 4 }}>إجمالي المشتركين</p>
          <strong style={{ color: '#ffffff', fontSize: 24, fontWeight: 900 }}>{totalClients}</strong>
        </Card>

        <Card style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(15,32,64,0.95) 100%)', border: '1px solid rgba(16,185,129,0.35)', textAlign: 'center', padding: '16px' }}>
          <span style={{ fontSize: 24 }}>🎂</span>
          <p style={{ color: '#a7f3d0', fontSize: 12, marginTop: 4 }}>متوسط الأعمار</p>
          <strong style={{ color: '#34d399', fontSize: 24, fontWeight: 900 }}>{averageAge} <span style={{ fontSize: 14 }}>سنة</span></strong>
        </Card>

        <Card style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.15) 0%, rgba(15,32,64,0.95) 100%)', border: '1px solid rgba(168,85,247,0.35)', textAlign: 'center', padding: '16px' }}>
          <span style={{ fontSize: 24 }}>📍</span>
          <p style={{ color: '#d8b4fe', fontSize: 12, marginTop: 4 }}>أكثر الأحياء إقبالاً</p>
          <strong style={{ color: '#c084fc', fontSize: 18, fontWeight: 800 }}>{topArea[0]}</strong>
          <span style={{ color: '#93c5fd', fontSize: 11, display: 'block', marginTop: 2 }}>{topArea[1]} مشترك</span>
        </Card>

        <Card style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(15,32,64,0.95) 100%)', border: '1px solid rgba(239,68,68,0.35)', textAlign: 'center', padding: '16px' }}>
          <span style={{ fontSize: 24 }}>🎯</span>
          <p style={{ color: '#fca5a5', fontSize: 12, marginTop: 4 }}>رادار الغياب والخمول</p>
          <strong style={{ color: '#f87171', fontSize: 20, fontWeight: 900 }}>{atRiskCount + dormantCount} <span style={{ fontSize: 12 }}>بحاجة لتواصل</span></strong>
        </Card>
      </div>

      {/* CUSTOMER RETENTION RADAR SECTION */}
      <Card style={{ background: 'var(--bg-surface)', border: '1px solid rgba(59,130,246,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h3 style={{ color: '#ffffff', fontWeight: 800, fontSize: 17, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🎯</span> رادار متابعة العملاء وحملات إعادة الجذب (Retention Radar)
            </h3>
            <p style={{ color: '#93c5fd', fontSize: 12, margin: '4px 0 0' }}>
              متابعة المشتركين الغائبين وإرسال رسائل ودية بالواتساب مع عروض تجديد بضغطة زر واحدة
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: 'الكل (' + analyzedClients.length + ')' },
              { id: 'at_risk', label: 'غائب +15 يوم (' + atRiskCount + ') 🟡' },
              { id: 'dormant', label: 'خامل +30 يوم (' + dormantCount + ') 🔴' },
              { id: 'active', label: 'نشط مؤخراً (' + activeRetentionCount + ') 🟢' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setRetentionFilter(tab.id)}
                style={{
                  padding: '6px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                  border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                  background: retentionFilter === tab.id ? 'linear-gradient(135deg, #1d4ed8, #3b82f6)' : 'rgba(255,255,255,0.06)',
                  color: retentionFilter === tab.id ? '#ffffff' : '#94a3b8',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {filteredRetentionClients.length === 0 ? (
          <EmptyState icon="🎯" message="لا يوجد عملاء في هذه الفئة حالياً" />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 12 }}>
            {filteredRetentionClients.map(client => (
              <div key={client.id} style={{
                background: 'var(--bg-card)', padding: '14px', borderRadius: 12,
                border: client.retentionStatus === 'dormant' ? '1px solid rgba(239,68,68,0.3)' : client.retentionStatus === 'at_risk' ? '1px solid rgba(245,158,11,0.3)' : '1px solid var(--border)',
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 10
              }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <strong style={{ color: '#ffffff', fontSize: 15 }}>{client.name}</strong>
                    <Badge color={client.statusColor}>{client.statusLabel}</Badge>
                  </div>
                  <div style={{ display: 'flex', gap: 10, color: '#93c5fd', fontSize: 12, marginBottom: 4 }}>
                    <span>🆔 عضوية: {client.memberId || '—'}</span>
                    <span>📍 {client.address || 'سوهاج'}</span>
                    {client.age && <span>🎂 {client.age} سنة</span>}
                  </div>
                  <p style={{ color: '#64748b', fontSize: 11, margin: 0 }}>
                    آخر ظهور: {client.diffDays >= 999 ? 'لم يحضر بعد' : 'منذ ' + client.diffDays + ' يوم'}
                  </p>
                </div>

                <Button
                  size="sm"
                  onClick={() => handleSendRetentionMessage(client)}
                  style={{
                    background: 'rgba(37, 211, 102, 0.15)', border: '1px solid rgba(37, 211, 102, 0.4)',
                    color: '#25d366', fontWeight: 700, width: '100%', justifyContent: 'center'
                  }}
                >
                  💬 إرسال عرض إعادة الجذب بالواتساب
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* GEOGRAPHIC & AGE DEMOGRAPHICS GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 20 }}>
        {/* GEOGRAPHIC DISTRIBUTION CARD */}
        <Card style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ color: '#ffffff', fontWeight: 800, fontSize: 16, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>📍</span> توزيع المشتركين على أحياء وشوارع سوهاج
            </h3>
            <Badge color="blue">{sortedAreas.length} منطقة</Badge>
          </div>

          {sortedAreas.length === 0 ? (
            <EmptyState icon="📍" message="لا توجد بيانات مناطق مسجلة بعد" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {sortedAreas.map(([area, count]) => {
                const pct = totalClients > 0 ? Math.round((count / totalClients) * 100) : 0;
                return (
                  <div key={area} style={{ background: 'var(--bg-base)', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <strong style={{ color: '#ffffff', fontSize: 13 }}>{area}</strong>
                      <span style={{ color: '#93c5fd', fontSize: 12, fontWeight: 700 }}>
                        {count} مشترك <strong style={{ color: '#34d399', marginRight: 4 }}>({pct}%)</strong>
                      </span>
                    </div>
                    <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{
                        width: pct + '%', height: '100%',
                        background: 'linear-gradient(90deg, #1d4ed8, #38bdf8)',
                        borderRadius: 4, transition: 'width 0.5s ease-out'
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* AGE DISTRIBUTION CARD */}
        <Card style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ color: '#ffffff', fontWeight: 800, fontSize: 16, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🎂</span> تحليل الفئات العمرية للمشتركين
            </h3>
            <Badge color="green">متوسط: {averageAge} سنة</Badge>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Object.entries(ageBrackets).map(([key, item]) => {
              const pct = totalClients > 0 ? Math.round((item.count / totalClients) * 100) : 0;
              return (
                <div key={key} style={{ background: 'var(--bg-base)', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <strong style={{ color: '#ffffff', fontSize: 13 }}>{item.label}</strong>
                    <span style={{ color: '#93c5fd', fontSize: 12, fontWeight: 700 }}>
                      {item.count} مشترك <strong style={{ color: item.color, marginRight: 4 }}>({pct}%)</strong>
                    </span>
                  </div>
                  <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      width: pct + '%', height: '100%',
                      background: item.color,
                      borderRadius: 4, transition: 'width 0.5s ease-out'
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
