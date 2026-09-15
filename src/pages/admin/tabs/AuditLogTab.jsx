import React, { useState, useEffect, useMemo } from 'react';
import { getAuditLogs, getEmployees } from '../../../services/db';
import { Card, StatCard, EmptyState, Button, Input, Select, Badge } from '../../../components/ui';
import { formatCurrency, formatDateTime, formatDate, getCurrentMonth, getMonthLabel } from '../../../utils/constants';
import { exportToExcel } from '../../../utils/excelExport';

export default function AuditLogTab() {
  const [logs, setLogs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [actorFilter, setActorFilter] = useState('all');
  const [datePreset, setDatePreset] = useState('today'); // 'today', 'this_week', 'this_month', 'all'
  const [searchQuery, setSearchQuery] = useState('');
  const [displayLimit, setDisplayLimit] = useState(25);

  useEffect(() => {
    const unsubL = getAuditLogs(setLogs);
    const unsubE = getEmployees(setEmployees);
    return () => { unsubL(); unsubE(); };
  }, []);

  const filteredLogs = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);
    const sevenDaysAgoTime = sevenDaysAgo.getTime();

    const curMonthStr = getCurrentMonth();

    return logs.filter(log => {
      // 1. Category filter
      if (categoryFilter !== 'all' && log.category !== categoryFilter) return false;

      // 2. Actor filter
      if (actorFilter !== 'all') {
        if (actorFilter === 'ADMIN' && log.actorRole !== 'admin' && log.actorId !== 'ADMIN') return false;
        if (actorFilter !== 'ADMIN' && log.actorId !== actorFilter && log.actorName !== actorFilter) return false;
      }

      // 3. Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const details = (log.details || '').toLowerCase();
        const actor = (log.actorName || '').toLowerCase();
        const action = (log.action || '').toLowerCase();
        if (!details.includes(q) && !actor.includes(q) && !action.includes(q)) return false;
      }

      // 4. Date filtering
      const logDate = log.timestamp 
        ? (log.timestamp.toDate ? log.timestamp.toDate() : new Date(log.timestamp))
        : new Date();
      const logTime = logDate.getTime();
      const logMonthStr = `${logDate.getFullYear()}-${String(logDate.getMonth() + 1).padStart(2, '0')}`;

      if (datePreset === 'today') {
        return logTime >= startOfToday && logTime <= endOfToday;
      } else if (datePreset === 'this_week') {
        return logTime >= sevenDaysAgoTime;
      } else if (datePreset === 'this_month') {
        return logMonthStr === curMonthStr;
      } else if (datePreset === 'all') {
        return true;
      }

      return true;
    });
  }, [logs, categoryFilter, actorFilter, datePreset, searchQuery]);

  const visibleLogs = filteredLogs.slice(0, displayLimit);

  const totalFinancialActions = logs.filter(l => l.category === 'financial').length;
  const totalDeletions = logs.filter(l => l.action?.includes('DELETE')).length;
  const totalCheckIns = logs.filter(l => l.action?.includes('CHECK')).length;

  const handleExportAuditExcel = () => {
    const headers = ['#', 'نوع العملية', 'التصنيف', 'البيان وتفاصيل العملية', 'المسؤول / الموظف', 'الدور', 'التاريخ والوقت'];
    const rows = filteredLogs.map((l, idx) => [
      idx + 1,
      l.action || 'عملية',
      l.category || 'عام',
      l.details || '—',
      l.actorName || '—',
      l.actorRole === 'admin' ? 'مدير عام' : 'موظف',
      l.timestamp ? formatDateTime(l.timestamp) : '—'
    ]);

    exportToExcel(`سجل_الأمان_والنشاطات_${datePreset}_${new Date().toISOString().split('T')[0]}`, headers, rows);
  };

  const getActionBadge = (action, category) => {
    if (action?.includes('DELETE')) return <Badge color="red">حذف 🗑️</Badge>;
    if (action?.includes('CREATE') || action?.includes('ADD')) return <Badge color="green">إضافة ➕</Badge>;
    if (action?.includes('CHECKIN')) return <Badge color="green">دخول 🟢</Badge>;
    if (action?.includes('CHECKOUT')) return <Badge color="blue">خروج 🔴</Badge>;
    if (action?.includes('OPEN')) return <Badge color="amber">فتح مناوبة 🔓</Badge>;
    if (action?.includes('CLOSE')) return <Badge color="gray">تقفيل 🔒</Badge>;
    if (category === 'financial') return <Badge color="emerald">مالي 💰</Badge>;
    return <Badge color="blue">عملية 📌</Badge>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ color: '#ffffff', fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🛡️</span> سجل الأمان والرقابة (Audit Trail)
          </h2>
          <p style={{ color: '#93c5fd', fontSize: 13, margin: '4px 0 0' }}>
            توثيق كامل لكافة الحركات، التعديلات، الحذف، والأنشطة المالية التي تمت بواسطة الموظفين أو الإدارة
          </p>
        </div>

        <Button size="sm" onClick={handleExportAuditExcel} style={{ background: 'linear-gradient(135deg, #059669, #10b981)', color: '#fff', fontWeight: 800 }}>
          📥 تصدير السجل Excel
        </Button>
      </div>

      {/* KPI Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        <StatCard icon="🛡️" label="إجمالي النشاطات الموثقة" value={logs.length} color="blue" />
        <StatCard icon="💰" label="أنشطة مالية وتحصيل" value={totalFinancialActions} color="green" />
        <StatCard icon="🏢" label="تسجيلات دخول وخروج" value={totalCheckIns} color="cyan" />
        <StatCard icon="🗑️" label="عمليات مسح وإلغاء" value={totalDeletions} color="red" />
      </div>

      {/* Filter Controls Card */}
      <Card style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '18px 20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Top Row: Date Presets */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 700 }}>📅 الفترة:</span>
            {[
              ['today', 'اليوم 📅'],
              ['this_week', 'آخر 7 أيام 🗓️'],
              ['this_month', 'هذا الشهر 📊'],
              ['all', 'كافة السجلات ♾️']
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => { setDatePreset(key); setDisplayLimit(25); }}
                style={{
                  padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                  fontFamily: 'Cairo, sans-serif', border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                  background: datePreset === key ? 'linear-gradient(135deg, #1d4ed8, #3b82f6)' : 'rgba(255,255,255,0.05)',
                  color: datePreset === key ? '#ffffff' : '#94a3b8',
                  boxShadow: datePreset === key ? '0 0 12px rgba(59,130,246,0.35)' : 'none'
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Bottom Row: Category, Actor, and Search */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, alignItems: 'center' }}>
            <Select
              label="تصنيف العملية"
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
            >
              <option value="all">كافة التصنيفات</option>
              <option value="financial">💰 معاملات مالية ومدفوعات</option>
              <option value="clients">👥 اشتراكات وأعضاء</option>
              <option value="shifts">🔄 مناوبات وخزينة</option>
              <option value="workspace">🏢 مساحة العمل ودخول/خروج</option>
              <option value="tickets">🎫 تذاكر ومبيعات</option>
              <option value="system">⚙️ إعدادات النظام</option>
            </Select>

            <Select
              label="الموظف / المسؤول"
              value={actorFilter}
              onChange={e => setActorFilter(e.target.value)}
            >
              <option value="all">كافة المستخدمين</option>
              <option value="ADMIN">👑 المدير العام فقط</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.name}>
                  {emp.name} ({emp.memberId || 'موظف'})
                </option>
              ))}
            </Select>

            <Input
              label="بحث في تفاصيل العملية"
              placeholder="مثال: سداد، حذف، أحمد، إيجار..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </Card>

      {/* Log List Table */}
      {filteredLogs.length === 0 ? (
        <EmptyState icon="🛡️" message="لا توجد حركات مسجلة مطابقة للفترة والتصنيف المحددين" />
      ) : (
        <Card style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid var(--border)', color: '#94a3b8' }}>
                  <th style={{ padding: '12px 16px', width: 40 }}>#</th>
                  <th style={{ padding: '12px 16px', width: 110 }}>نوع الإجراء</th>
                  <th style={{ padding: '12px 16px' }}>تفاصيل العملية وبيانات الحركة</th>
                  <th style={{ padding: '12px 16px', width: 140 }}>المسؤول / الموظف</th>
                  <th style={{ padding: '12px 16px', width: 170 }}>التاريخ والوقت</th>
                </tr>
              </thead>
              <tbody>
                {visibleLogs.map((log, idx) => (
                  <tr
                    key={log.id || idx}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'
                    }}
                  >
                    <td style={{ padding: '12px 16px', color: '#64748b', fontWeight: 700 }}>{idx + 1}</td>
                    <td style={{ padding: '12px 16px' }}>
                      {getActionBadge(log.action, log.category)}
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#f8fafc', lineHeight: 1.5 }}>
                      {log.details}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        color: log.actorRole === 'admin' ? '#fbbf24' : '#60a5fa',
                        fontWeight: 700, fontSize: 12
                      }}>
                        {log.actorRole === 'admin' ? '👑 ' : '👔 '}{log.actorName || 'المسؤول'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: 12 }}>
                      {log.timestamp ? formatDateTime(log.timestamp) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Professional Dynamic Pagination */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '14px 18px', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: 12,
            background: 'rgba(255,255,255,0.02)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8', fontSize: 13 }}>
              <span>عرض:</span>
              <select
                value={displayLimit}
                onChange={e => setDisplayLimit(Number(e.target.value))}
                style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border)',
                  color: '#fff', borderRadius: 8, padding: '4px 8px', fontSize: 12, outline: 'none'
                }}
              >
                <option value={25} style={{ background: '#0a162b', color: '#fff' }}>25 سجل</option>
                <option value={50} style={{ background: '#0a162b', color: '#fff' }}>50 سجل</option>
                <option value={100} style={{ background: '#0a162b', color: '#fff' }}>100 سجل</option>
                <option value={1000} style={{ background: '#0a162b', color: '#fff' }}>عرض الكل</option>
              </select>
              <span>من إجمالي <strong>{filteredLogs.length}</strong> حركة</span>
            </div>

            {filteredLogs.length > displayLimit && (
              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDisplayLimit(prev => prev + 50)}
                  style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', fontWeight: 700 }}
                >
                  🔄 تحميل 50 سجل إضافي (متبقي {filteredLogs.length - displayLimit})
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
