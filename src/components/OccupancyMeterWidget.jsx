import React, { useState, useMemo } from 'react';
import { Card, Badge, Button } from './ui';
import { formatDateTime } from '../utils/constants';
import AnimatedCounter from './AnimatedCounter';

export default function OccupancyMeterWidget({
  subscriptions = [],
  sessions = [],
  clients = [],
  capacity = 50,
  compact = false
}) {
  const [showActiveDetails, setShowActiveDetails] = useState(false);
  const [filterType, setFilterType] = useState('all'); // 'all', 'workspace', 'courses'

  // 1. Calculate Active Clients Currently Checked-In (Workspace + Courses + Tickets)
  const activeAttendees = useMemo(() => {
    const activeList = [];
    const now = Date.now();
    const TWO_HOURS_MS = 2.5 * 60 * 60 * 1000; // Average course lecture duration is 2.5 hours
    const clientMap = new Map((clients || []).map(c => [c.id, c]));

    // A. Active Workspace Sessions from Subscriptions
    (subscriptions || []).forEach(sub => {
      if (sub.currentSession?.checkIn) {
        const client = clientMap.get(sub.clientId) || {};
        activeList.push({
          id: 'ws_sub_' + sub.id,
          name: client.name || sub.clientName || 'مشترك',
          phone: client.phone || '—',
          memberId: client.memberId || '—',
          packageName: sub.packageName || 'مساحة عمل بالساعات',
          category: 'workspace',
          categoryLabel: '🏢 مساحة عمل',
          badgeColor: 'purple',
          checkInTime: sub.currentSession.checkIn
        });
      }
    });

    const activeIds = new Set(activeList.map(a => a.id));
    const activeMemberWorkspaces = new Set(activeList.filter(a => a.category === 'workspace').map(a => a.memberId).filter(m => m && m !== '—'));

    // B. Sessions from sessions collection (Workspace open sessions + Course attendance + Tickets)
    (sessions || []).forEach(sess => {
      const sessDate = sess.date?.toDate ? sess.date.toDate() : sess.date ? new Date(sess.date) : (sess.checkIn ? new Date(sess.checkIn) : null);
      const sessTime = sessDate && !isNaN(sessDate.getTime()) ? sessDate.getTime() : null;
      const isToday = sessDate ? (new Date().toDateString() === sessDate.toDateString()) : false;

      // 1. Workspace open check-ins
      if (sess.checkIn && !sess.checkOut) {
        const mId = sess.memberId || '';
        const already = activeIds.has(sess.id) || (mId && activeMemberWorkspaces.has(mId));
        if (!already) {
          const client = clientMap.get(sess.clientId) || {};
          activeList.push({
            id: sess.id || 'sess_' + Math.random(),
            name: sess.clientName || client.name || 'مشترك',
            phone: sess.clientPhone || client.phone || '—',
            memberId: sess.memberId || client.memberId || '—',
            packageName: sess.packageName || (sess.type === 'ticket' ? 'تذكرة دخول يومية' : 'مساحة عمل'),
            category: 'workspace',
            categoryLabel: sess.type === 'ticket' ? '🎟️ تذكرة دخول' : '🏢 مساحة عمل',
            badgeColor: 'purple',
            checkInTime: sess.checkIn
          });
        }
      } 
      // 2. Course session attendance logged in the last 2.5 hours today
      else if (isToday && sessTime && (now - sessTime <= TWO_HOURS_MS) && sess.type !== 'workspace_checkout') {
        const client = clientMap.get(sess.clientId) || {};
        const cMember = sess.memberId || client.memberId;
        const already = activeIds.has(sess.id);
        if (!already) {
          activeList.push({
            id: sess.id || 'course_' + Math.random(),
            name: sess.clientName || client.name || 'طالب / متدرب',
            phone: sess.clientPhone || client.phone || '—',
            memberId: cMember || '—',
            packageName: sess.packageName || 'حصة كورس تدريبي',
            category: 'course',
            categoryLabel: '📚 كورس / محاضرة',
            badgeColor: 'blue',
            checkInTime: sess.checkIn || sessDate.toISOString()
          });
        }
      }
    });

    return activeList;
  }, [subscriptions, sessions, clients]);

  const activeCount = activeAttendees.length;
  const workspaceCount = activeAttendees.filter(a => a.category === 'workspace').length;
  const courseCount = activeAttendees.filter(a => a.category === 'course').length;

  const occupancyPercent = capacity > 0 ? Math.min(100, Math.round((activeCount / capacity) * 100)) : 0;
  const availableSeats = Math.max(0, capacity - activeCount);

  // Filter active attendees by tab
  const displayedAttendees = useMemo(() => {
    if (filterType === 'workspace') return activeAttendees.filter(a => a.category === 'workspace');
    if (filterType === 'courses') return activeAttendees.filter(a => a.category === 'course');
    return activeAttendees;
  }, [activeAttendees, filterType]);

  // 2. Peak Hours Analysis (Hourly Distribution from ALL sessions)
  const peakHoursData = useMemo(() => {
    const hoursCount = Array(24).fill(0);
    sessions.forEach(s => {
      const d = s.date?.toDate ? s.date.toDate() : s.date ? new Date(s.date) : (s.checkIn ? new Date(s.checkIn) : null);
      if (d && !isNaN(d.getTime())) {
        const hr = d.getHours();
        hoursCount[hr]++;
      }
    });

    const maxCount = Math.max(...hoursCount, 1);
    const relevantHours = [];
    for (let h = 9; h <= 23; h++) {
      const label = h === 12 ? '12م' : h > 12 ? `${h - 12}م` : `${h}ص`;
      relevantHours.push({
        hour: h,
        label,
        count: hoursCount[h],
        percent: hoursCount[h] > 0 ? Math.round((hoursCount[h] / maxCount) * 100) : 0
      });
    }
    return relevantHours;
  }, [sessions]);

  // Status Styling
  const statusColor = occupancyPercent > 75 ? '#ef4444' : occupancyPercent > 35 ? '#f59e0b' : '#10b981';
  const statusBg = occupancyPercent > 75 ? 'rgba(239,68,68,0.15)' : occupancyPercent > 35 ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)';
  const statusBorder = occupancyPercent > 75 ? 'rgba(239,68,68,0.35)' : occupancyPercent > 35 ? 'rgba(245,158,11,0.35)' : 'rgba(16,185,129,0.35)';
  const statusText = occupancyPercent > 75
    ? '🔴 وقت ذروة (إشغال مرتفع)'
    : occupancyPercent > 35
      ? '🟡 نشاط متوسط (مستقر)'
      : '🟢 هادئ (مساحات واسعة متاحة)';

  if (compact) {
    return (
      <div style={{
        background: 'rgba(15, 23, 42, 0.85)',
        border: `1px solid ${statusBorder}`,
        borderRadius: 14,
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 8
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 12, height: 12, borderRadius: '50%',
            background: statusColor,
            boxShadow: `0 0 10px ${statusColor}`
          }} />
          <div>
            <span style={{ color: '#ffffff', fontWeight: 800, fontSize: 13 }}>
              🚦 إشغال المكان الآن: <strong style={{ color: statusColor }}>{activeCount}</strong> من {capacity} مقعد ({occupancyPercent}%)
            </span>
            <span style={{ color: '#93c5fd', fontSize: 11, marginRight: 8 }}>
              • {availableSeats} مقعد شاغر (🏢 {workspaceCount} مساحة عمل | 📚 {courseCount} كورسات)
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowActiveDetails(!showActiveDetails)}
          style={{
            background: statusBg, border: `1px solid ${statusBorder}`, color: '#ffffff',
            borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'Cairo, sans-serif'
          }}
        >
          {showActiveDetails ? 'إخفاء المتواجدين ⬆️' : `عرض المتواجدين (${activeCount}) 👥`}
        </button>
      </div>
    );
  }

  return (
    <Card
      className="bento-card"
      style={{
        background: 'radial-gradient(ellipse at 80% 20%, rgba(30, 58, 138, 0.35) 0%, rgba(15, 23, 42, 0.95) 70%)',
        border: `1.5px solid ${statusBorder}`,
        boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
        padding: '20px'
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 20 }}>🚦</span>
            <h3 style={{ margin: 0, color: 'var(--text-primary)', fontWeight: 900, fontSize: 17 }}>
              رادار وعداد الإشغال اللحظي الشامل (مساحة العمل + الكورسات)
            </h3>
            <Badge color={occupancyPercent > 75 ? 'red' : occupancyPercent > 35 ? 'amber' : 'green'}>
              {statusText}
            </Badge>
          </div>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 12 }}>
            حصر حي فوري لكافة الطلاب والمشتركين المتواجدين داخل السنتر بالقاعات ومساحات العمل
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowActiveDetails(!showActiveDetails)}
            style={{ background: 'rgba(27, 77, 62, 0.12)', border: '1px solid rgba(27, 77, 62, 0.3)', color: 'var(--accent)' }}
          >
            {showActiveDetails ? 'إخفاء القائمة ⬆️' : `👥 المتواجدون الآن (${activeCount})`}
          </Button>
        </div>
      </div>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 16px', textAlign: 'center' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 12, display: 'block' }}>إجمالي المتواجدين بالداخل</span>
          <strong className="tabular-nums" style={{ color: statusColor, fontSize: 26, fontWeight: 900 }}>
            <AnimatedCounter value={activeCount} />
          </strong>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>شخص في السنتر</span>
        </div>

        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 16px', textAlign: 'center' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 12, display: 'block' }}>🏢 رواد مساحة العمل</span>
          <strong className="tabular-nums" style={{ color: '#9333ea', fontSize: 26, fontWeight: 900 }}>
            <AnimatedCounter value={workspaceCount} />
          </strong>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>مشترك بالساعات</span>
        </div>

        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 16px', textAlign: 'center' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 12, display: 'block' }}>📚 طلاب الكورسات والمحاضرات</span>
          <strong className="tabular-nums" style={{ color: 'var(--accent)', fontSize: 26, fontWeight: 900 }}>
            <AnimatedCounter value={courseCount} />
          </strong>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>طالب في القاعات</span>
        </div>

        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 16px', textAlign: 'center' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 12, display: 'block' }}>المقاعد المتاحة والشاغرة</span>
          <strong className="tabular-nums" style={{ color: '#059669', fontSize: 26, fontWeight: 900 }}>
            <AnimatedCounter value={availableSeats} />
          </strong>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>من سعة {capacity} مقعد</span>
        </div>
      </div>

      {/* Progress Bar Gauge */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', fontSize: 12, marginBottom: 6 }}>
          <span>السعة الإجمالية للمركز</span>
          <strong style={{ color: statusColor }}>{activeCount} / {capacity} مقعد ({occupancyPercent}%)</strong>
        </div>
        <div style={{ width: '100%', height: 12, background: 'rgba(255,255,255,0.08)', borderRadius: 6, overflow: 'hidden' }}>
          <div style={{
            width: `${occupancyPercent}%`, height: '100%',
            background: occupancyPercent > 75
              ? 'linear-gradient(90deg, #dc2626, #ef4444)'
              : occupancyPercent > 35
                ? 'linear-gradient(90deg, #d97706, #f59e0b)'
                : 'linear-gradient(90deg, #059669, #10b981)',
            transition: 'width 0.5s ease-in-out'
          }} />
        </div>
      </div>

      {/* Peak Hours Traffic Heatmap */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ color: '#93c5fd', fontSize: 12, fontWeight: 700 }}>
            📈 خريطة ساعات الذروة والازدحام لكافة الأنشطة (Peak Hours Traffic):
          </span>
          <span style={{ color: '#64748b', fontSize: 11 }}>من 9 صباحاً حتى 11 مساءً</span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(15, 1fr)',
          gap: 4,
          background: 'rgba(7, 17, 31, 0.8)',
          padding: '12px 8px 8px',
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.06)'
        }}>
          {peakHoursData.map(item => (
            <div key={item.hour} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                height: 40, width: '100%',
                display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                background: 'rgba(255,255,255,0.03)', borderRadius: 4
              }}>
                <div
                  title={`${item.label}: ${item.count} زيارة وحضور`}
                  style={{
                    width: '80%',
                    height: item.count > 0 ? `${Math.max(15, item.percent)}%` : '4px',
                    background: item.count === 0 ? 'rgba(255,255,255,0.06)' : item.percent > 70 ? '#ef4444' : item.percent > 40 ? '#f59e0b' : '#3b82f6',
                    borderRadius: '3px 3px 0 0',
                    transition: 'height 0.3s ease'
                  }}
                />
              </div>
              <span style={{ color: '#94a3b8', fontSize: 10 }}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Expandable Active Clients List */}
      {showActiveDetails && (
        <div style={{ marginTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <h4 style={{ color: '#ffffff', fontSize: 14, fontWeight: 800, margin: 0 }}>
              👥 تفاصيل المتواجدين حالياً داخل السنتر ({activeAttendees.length}):
            </h4>

            {/* Filter Buttons */}
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={() => setFilterType('all')}
                style={{
                  padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'Cairo, sans-serif',
                  background: filterType === 'all' ? '#2563eb' : 'rgba(15, 23, 42, 0.8)',
                  color: '#fff', border: filterType === 'all' ? '1px solid #60a5fa' : '1px solid rgba(255,255,255,0.1)'
                }}
              >
                الكل ({activeAttendees.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('workspace')}
                style={{
                  padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'Cairo, sans-serif',
                  background: filterType === 'workspace' ? '#9333ea' : 'rgba(15, 23, 42, 0.8)',
                  color: '#fff', border: filterType === 'workspace' ? '1px solid #c084fc' : '1px solid rgba(255,255,255,0.1)'
                }}
              >
                🏢 مساحة عمل ({workspaceCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('courses')}
                style={{
                  padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'Cairo, sans-serif',
                  background: filterType === 'courses' ? '#0284c7' : 'rgba(15, 23, 42, 0.8)',
                  color: '#fff', border: filterType === 'courses' ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.1)'
                }}
              >
                📚 كورسات ({courseCount})
              </button>
            </div>
          </div>

          {displayedAttendees.length === 0 ? (
            <p style={{ color: '#64748b', fontSize: 12, textAlign: 'center', padding: 10 }}>
              لا يوجد أي شخص متواجد حالياً في هذا القسم
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
              {displayedAttendees.map((a, idx) => (
                <div key={a.id || idx} style={{
                  background: 'rgba(15, 23, 42, 0.9)',
                  border: a.category === 'workspace' ? '1px solid rgba(147, 51, 234, 0.35)' : '1px solid rgba(59, 130, 246, 0.35)',
                  borderRadius: 10,
                  padding: '8px 12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 8
                }}>
                  <div>
                    <strong style={{ color: '#ffffff', fontSize: 13 }}>{a.name}</strong>
                    <span style={{ color: '#93c5fd', fontSize: 11, marginRight: 8 }}>
                      (عضوية: #{a.memberId} | 📱 {a.phone})
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Badge color={a.badgeColor}>{a.categoryLabel}</Badge>
                    <Badge color="gray">{a.packageName}</Badge>
                    <span style={{ color: '#34d399', fontSize: 11 }}>
                      🕒 {formatDateTime(a.checkInTime)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
