import React, { useState, useEffect } from 'react';
import { getAdminRevenues, addAdminRevenue, deleteAdminRevenue, getAllPayments, deletePayment, permanentlyDeletePayment, getTicketSales, getAllShifts, getClients, getCafeShifts } from '../../../services/db';
import { Card, Button, Input, Select, Modal, ConfirmDialog, EmptyState, Badge } from '../../../components/ui';
import { formatCurrency, formatDateTime, formatDate, REVENUE_CATEGORIES, getCurrentMonth, getMonthLabel } from '../../../utils/constants';
import { exportToExcel } from '../../../utils/excelExport';

export default function AdminRevenuesTab() {
  const [adminRevs, setAdminRevs] = useState([]);
  const [payments, setPayments] = useState([]);
  const [ticketSales, setTicketSales] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [cafeShifts, setCafeShifts] = useState([]);
  const [clients, setClients] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ type: 'cafe', label: '', amount: '', note: '' });
  const [deleteId, setDeleteId] = useState(null);
  const [deletePayId, setDeletePayId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState(getCurrentMonth());
  const [activeSubTab, setActiveSubTab] = useState('all');

  useEffect(() => { 
    const unsubR = getAdminRevenues(setAdminRevs); 
    const unsubP = getAllPayments(setPayments);
    const unsubT = getTicketSales(setTicketSales);
    const unsubS = getAllShifts(setShifts);
    const unsubCafe = getCafeShifts(setCafeShifts);
    const unsubC = getClients(setClients);
    return () => { unsubR(); unsubP(); unsubT(); unsubS(); unsubCafe(); unsubC(); };
  }, []);

  const filterByMonth = (arr, dateField = 'date') => arr.filter(r => {
    const val = r[dateField] || r.openedAt || r.createdAt;
    if (!val) return false;
    const d = val.toDate ? val.toDate() : new Date(val);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === month;
  });

  const filteredAdmin = filterByMonth(adminRevs).filter(r => !r.isCafeTransfer && r.category !== 'cafe' && !r.isDirectAdminPayment && !r.paymentId);
  const filteredPayments = filterByMonth(payments).filter(p => !p.isVoided);
  const filteredTickets = filterByMonth(ticketSales);
  const filteredShifts = filterByMonth(shifts, 'openedAt');
  const filteredCafeShifts = filterByMonth(cafeShifts, 'openedAt');
  const shiftRevenues = filteredShifts.flatMap(s => (s.revenues || []).map(r => ({ ...r, shiftEmployee: s.employeeName, shiftDate: s.openedAt })));
  const allExtraRevenues = [...filteredAdmin, ...shiftRevenues];

  // Calculate totals
  const totalAdmin = filteredAdmin.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalPayments = filteredPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalTickets = filteredTickets.reduce((s, t) => s + Number(t.total || (t.ticketPrice * t.quantity) || 0), 0);
  const totalShiftRevenues = shiftRevenues.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalCafeRevenue = filteredCafeShifts.reduce((s, c) => s + Number(c.totalSales || 0), 0);
  const totalRevenue = totalAdmin + totalPayments + totalTickets + totalShiftRevenues + totalCafeRevenue;

  // Group generic revenues by type
  const byType = {
    'الاشتراكات والدفعات': totalPayments,
    'مبيعات كافيه TFG | CAFE': totalCafeRevenue,
    'التذاكر': totalTickets,
  };
  
  filteredAdmin.forEach(r => {
    const label = r.label || REVENUE_CATEGORIES.find(c => c.value === r.type)?.label || r.type;
    byType[label] = (byType[label] || 0) + Number(r.amount);
  });
  shiftRevenues.forEach(r => {
    const label = REVENUE_CATEGORIES.find(c => c.value === r.type)?.label || r.label || r.type;
    byType[label] = (byType[label] || 0) + Number(r.amount);
  });

  const handleExportRevenuesExcel = () => {
    const headers = ['#', 'النوع', 'البيان / العميل', 'المبلغ (ج.م)', 'التاريخ', 'طريقة الدفع / الموظف'];
    const rows = [];
    let counter = 1;

    filteredPayments.forEach(p => {
      rows.push([counter++, 'اشتراك / دفعة', p.clientName || 'عميل', p.amount || 0, p.date ? formatDate(p.date) : '—', p.method === 'cash' ? 'نقدي' : p.method || 'نقدي']);
    });

    filteredCafeShifts.forEach(c => {
      rows.push([counter++, 'مبيعات كافيه', `وردية كافيه - ${c.baristaName || 'باريستا'}`, c.totalSales || 0, c.openedAt ? formatDate(c.openedAt) : '—', c.baristaName || 'باريستا']);
    });

    filteredTickets.forEach(t => {
      rows.push([counter++, 'تذكرة دخول', t.templateName || 'تذكرة', t.price || 0, t.date ? formatDate(t.date) : '—', t.soldByName || '—']);
    });

    allExtraRevenues.forEach(r => {
      rows.push([counter++, 'إيراد إضافي', r.label || r.type || 'إيراد', r.amount || 0, r.date ? formatDate(r.date) : '—', r.shiftEmployee || 'المدير']);
    });

    exportToExcel('تقرير_إيرادات_The_First_Group_' + month, headers, rows);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    const label = form.label || REVENUE_CATEGORIES.find(c => c.value === form.type)?.label || form.type;
    try {
      await addAdminRevenue({ ...form, label });
      setModal(false);
      setForm({ type: 'cafe', label: '', amount: '', note: '' });
    } finally { setLoading(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ color: '#ffffff', fontSize: 20, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>💰</span> الإيرادات الكلية
          </h2>
          <p style={{ color: '#93c5fd', fontSize: 13, marginTop: 4 }}>
            📅 شهر: <strong>{getMonthLabel(month)}</strong> — إجمالي الدخل: <strong style={{ color: '#34d399', fontSize: 16 }}>{formatCurrency(totalRevenue)}</strong>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '8px 14px', color: '#ffffff',
              fontFamily: 'Cairo, sans-serif', fontSize: 14, outline: 'none',
            }}
          />
          <Button onClick={handleExportRevenuesExcel} style={{ background: 'linear-gradient(135deg, #059669, #10b981)', color: '#fff', fontWeight: 800 }}>
            📥 تصدير إكسيل
          </Button>
          <Button onClick={() => setModal(true)} style={{ background: 'linear-gradient(135deg, #0284c7, #2563eb)', color: '#fff', fontWeight: 800 }}>
            + إضافة إيراد مباشر
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <Card style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.18) 0%, rgba(15,32,64,0.95) 100%)', border: '1px solid rgba(16,185,129,0.35)', textAlign: 'center', padding: '16px' }}>
          <span style={{ fontSize: 22 }}>💵</span>
          <p style={{ color: '#a7f3d0', fontSize: 12, marginTop: 4 }}>إجمالي إيراد الشهر الشامل</p>
          <strong style={{ color: '#34d399', fontSize: 22, fontWeight: 900 }}>{formatCurrency(totalRevenue)}</strong>
        </Card>

        <Card style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.15) 0%, rgba(15,32,64,0.95) 100%)', border: '1px solid rgba(59,130,246,0.35)', textAlign: 'center', padding: '16px' }}>
          <span style={{ fontSize: 22 }}>📦</span>
          <p style={{ color: '#93c5fd', fontSize: 12, marginTop: 4 }}>الاشتراكات والدفعات</p>
          <strong style={{ color: '#60a5fa', fontSize: 20, fontWeight: 900 }}>{formatCurrency(totalPayments)}</strong>
        </Card>

        <Card style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(5,150,105,0.25) 100%)', border: '1px solid rgba(16,185,129,0.4)', textAlign: 'center', padding: '16px' }}>
          <span style={{ fontSize: 22 }}>☕</span>
          <p style={{ color: '#a7f3d0', fontSize: 12, marginTop: 4 }}>مبيعات كافيه TFG | CAFE</p>
          <strong style={{ color: '#34d399', fontSize: 20, fontWeight: 900 }}>{formatCurrency(totalCafeRevenue)}</strong>
        </Card>

        <Card style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.15) 0%, rgba(15,32,64,0.95) 100%)', border: '1px solid rgba(168,85,247,0.35)', textAlign: 'center', padding: '16px' }}>
          <span style={{ fontSize: 22 }}>🎫</span>
          <p style={{ color: '#d8b4fe', fontSize: 12, marginTop: 4 }}>مبيعات التذاكر</p>
          <strong style={{ color: '#c084fc', fontSize: 20, fontWeight: 900 }}>{formatCurrency(totalTickets)}</strong>
        </Card>

        <Card style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', textAlign: 'center', padding: '16px' }}>
          <span style={{ fontSize: 22 }}>📊</span>
          <p style={{ color: '#fcd34d', fontSize: 12, marginTop: 4 }}>إيرادات أخرى متنوعة</p>
          <strong style={{ color: '#ffffff', fontSize: 20, fontWeight: 900 }}>{formatCurrency(totalAdmin + totalShiftRevenues)}</strong>
        </Card>
      </div>

      {/* Sub tabs navigation */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 6,
        background: 'var(--bg-surface)', padding: 4, borderRadius: 12, border: '1px solid var(--border)'
      }}>
        {[
          { id: 'all',          label: '💰 ملخص الإيرادات', count: null },
          { id: 'payments',     label: '📦 الاشتراكات',    count: filteredPayments.length },
          { id: 'cafe',         label: '☕ مبيعات الكافيه', count: filteredCafeShifts.length },
          { id: 'tickets',      label: '🎫 التذاكر',       count: filteredTickets.length },
          { id: 'extra',        label: '📊 إيرادات أخرى',   count: allExtraRevenues.length },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveSubTab(t.id)}
            style={{
              padding: '10px 6px', borderRadius: 10, fontSize: 13, fontWeight: 700,
              border: 'none', cursor: 'pointer', transition: 'all 0.2s', textAlign: 'center',
              background: activeSubTab === t.id ? 'linear-gradient(135deg, #1d4ed8, #3b82f6)' : 'transparent',
              color: activeSubTab === t.id ? '#ffffff' : '#94a3b8',
              boxShadow: activeSubTab === t.id ? '0 4px 12px rgba(59,130,246,0.35)' : 'none'
            }}
          >
            {t.label} {t.count != null ? '(' + t.count + ')' : ''}
          </button>
        ))}
      </div>

      {/* SUB TAB: ALL / SUMMARY */}
      {activeSubTab === 'all' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 }}>
            {Object.entries(byType).map(([label, amount]) => (
              <Card key={label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', textAlign: 'center', padding: '16px' }}>
                <p style={{ color: '#c8dcf5', fontSize: 13, marginBottom: 4 }}>{label}</p>
                <p style={{ color: amount > 0 ? '#34d399' : '#94a3b8', fontSize: 20, fontWeight: 800 }}>{formatCurrency(amount)}</p>
              </Card>
            ))}
          </div>

          <Card style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <h3 style={{ color: '#ffffff', fontSize: 16, fontWeight: 700, marginBottom: 12 }}>آخر الإيرادات المتنوعة المسجلة</h3>
            {allExtraRevenues.length === 0 ? <EmptyState icon="💰" message="لا توجد إيرادات متنوعة مسجلة لهذا الشهر" /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {allExtraRevenues.slice(0, 10).map((r, idx) => {
                  const label = r.label || REVENUE_CATEGORIES.find(c => c.value === r.type)?.label || r.type;
                  const rDate = r.date || r.createdAt;
                  const isAdminRev = filteredAdmin.some(ar => ar.id === r.id);
                  return (
                    <div key={r.id || idx} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 10 }}>
                      <div>
                        <p style={{ color: '#ffffff', fontWeight: 700, fontSize: 15, margin: 0 }}>{label}</p>
                        {r.note && <p style={{ color: '#93c5fd', fontSize: 12, margin: '2px 0 0' }}>{r.note}</p>}
                        <p style={{ color: '#7aa4d4', fontSize: 11, margin: '4px 0 0' }}>{rDate ? formatDateTime(rDate) : ''}</p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <span style={{ color: '#34d399', fontWeight: 800, fontSize: 16 }}>{formatCurrency(r.amount)}</span>
                        {isAdminRev && (
                          <button
                            onClick={() => setDeleteId(r.id)}
                            style={{
                              background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)',
                              color: '#f87171', borderRadius: 8, width: 30, height: 30, cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16
                            }}
                          >
                            &times;
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* SUB TAB: PAYMENTS */}
      {activeSubTab === 'payments' && (
        <Card style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <h3 style={{ color: '#ffffff', fontSize: 16, fontWeight: 700, marginBottom: 14 }}>سجل متحصلات الاشتراكات والدفعات ({filteredPayments.length})</h3>
          {filteredPayments.length === 0 ? <EmptyState icon="📦" message="لا توجد دفعات اشتراكات مسجلة في هذا الشهر" /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredPayments.map((p, idx) => {
                const c = clients.find(cl => cl.id === p.clientId);
                return (
                  <div key={p.id || idx} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 10, flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <strong style={{ color: '#ffffff', fontSize: 15 }}>{p.clientName || c?.name || 'مشترك'}</strong>
                        {(p.memberId || c?.memberId) && <Badge color="blue">{p.memberId || c?.memberId}</Badge>}
                      </div>
                      <p style={{ color: '#93c5fd', fontSize: 12, margin: '2px 0 0' }}>{p.note || 'دفعة اشتراك'}</p>
                      <p style={{ color: '#64748b', fontSize: 11, margin: '2px 0 0' }}>{p.date ? formatDateTime(p.date) : ''}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <span style={{ color: '#34d399', fontWeight: 800, fontSize: 17 }}>{formatCurrency(p.amount)}</span>
                      <button
                        onClick={() => setDeletePayId(p.id)}
                        title="حذف هذا الإيصال المالي"
                        style={{
                          background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)',
                          color: '#f87171', borderRadius: 8, width: 30, height: 30, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16
                        }}
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* SUB TAB: TICKETS */}
      {activeSubTab === 'tickets' && (
        <Card style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <h3 style={{ color: '#ffffff', fontSize: 16, fontWeight: 700, marginBottom: 14 }}>مبيعات التذاكر ({filteredTickets.length})</h3>
          {filteredTickets.length === 0 ? <EmptyState icon="🎫" message="لا توجد مبيعات تذاكر في هذا الشهر" /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredTickets.map((t, idx) => (
                <div key={t.id || idx} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 10, flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <strong style={{ color: '#ffffff', fontSize: 15 }}>{t.ticketName}</strong>
                    <span style={{ color: '#93c5fd', fontSize: 12, marginRight: 8 }}>العدد: <strong>{t.quantity}</strong></span>
                    <p style={{ color: '#64748b', fontSize: 11, margin: '2px 0 0' }}>{t.date ? formatDateTime(t.date) : ''}</p>
                  </div>
                  <span style={{ color: '#34d399', fontWeight: 800, fontSize: 17 }}>{formatCurrency(t.total || (t.quantity * t.ticketPrice))}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* SUB TAB: EXTRA REVENUES */}
      {activeSubTab === 'extra' && (
        <Card style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <h3 style={{ color: '#ffffff', fontSize: 16, fontWeight: 700, marginBottom: 14 }}>الإيرادات المتنوعة (كافيه، أنشطة، أخرى) ({allExtraRevenues.length})</h3>
          {allExtraRevenues.length === 0 ? <EmptyState icon="☕" message="لا توجد إيرادات متنوعة مسجلة لهذا الشهر" /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {allExtraRevenues.map((r, idx) => {
                const label = r.label || REVENUE_CATEGORIES.find(c => c.value === r.type)?.label || r.type;
                const rDate = r.date || r.createdAt;
                const isAdminRev = filteredAdmin.some(ar => ar.id === r.id);
                return (
                  <div key={r.id || idx} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 10, flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <p style={{ color: '#ffffff', fontWeight: 700, fontSize: 15, margin: 0 }}>{label}</p>
                      {r.note && <p style={{ color: '#93c5fd', fontSize: 12, margin: '2px 0 0' }}>{r.note}</p>}
                      <p style={{ color: '#7aa4d4', fontSize: 11, margin: '4px 0 0' }}>{rDate ? formatDateTime(rDate) : ''}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <span style={{ color: '#34d399', fontWeight: 800, fontSize: 16 }}>{formatCurrency(r.amount)}</span>
                      {isAdminRev && (
                        <button
                          onClick={() => setDeleteId(r.id)}
                          style={{
                            background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)',
                            color: '#f87171', borderRadius: 8, width: 30, height: 30, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16
                          }}
                        >
                          &times;
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* SUB TAB: CAFE REVENUES */}
      {activeSubTab === 'cafe' && (
        <Card style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <h3 style={{ color: '#ffffff', fontSize: 16, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>☕</span> سجل مبيعات وورديات TFG | CAFE ({filteredCafeShifts.length})
            </h3>
            <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.35)', borderRadius: 10, padding: '6px 14px' }}>
              <span style={{ color: '#a7f3d0', fontSize: 13, fontWeight: 700 }}>إجمالي مبيعات الكافيه للشهر: </span>
              <strong style={{ color: '#34d399', fontSize: 16, fontWeight: 900 }}>{formatCurrency(totalCafeRevenue)}</strong>
            </div>
          </div>

          {filteredCafeShifts.length === 0 ? (
            <EmptyState icon="☕" message="لا توجد مبيعات أو ورديات كافيه مسجلة لهذا الشهر" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredCafeShifts.map((cs) => {
                const totalSales = Number(cs.totalSales) || 0;
                const drawerCash = Number(cs.drawerCash) || 0;
                const walletSales = Number(cs.walletSales) || 0;
                const expenses = Number(cs.totalExpenses) || 0;
                const netProfit = totalSales - expenses;
                const isOpen = cs.status === 'open';

                return (
                  <div
                    key={cs.id}
                    style={{
                      background: 'var(--bg-card)',
                      border: isOpen ? '1.5px solid rgba(16, 185, 129, 0.5)' : '1px solid var(--border)',
                      padding: '14px 16px',
                      borderRadius: 12,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 12
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <strong style={{ color: '#ffffff', fontSize: 15, fontWeight: 800 }}>
                          {cs.baristaName || 'باريستا الكافيه'}
                        </strong>
                        <span style={{ color: '#93c5fd', fontSize: 12 }}>
                          (#{cs.id.slice(-4)})
                        </span>
                        {isOpen ? (
                          <Badge color="green">وردية نشطة ومفتوحة حالياً 🟢</Badge>
                        ) : (
                          <Badge color="blue">مغلقة ومقفلة</Badge>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 14, color: '#94a3b8', fontSize: 12, marginTop: 4, flexWrap: 'wrap' }}>
                        <span>
                          📅 فُتحت: {cs.openedAt ? formatDateTime(cs.openedAt) : '—'}
                        </span>
                        {cs.closedAt && (
                          <span>
                            🔒 أُغلقت: {formatDateTime(cs.closedAt)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                      <div style={{ textAlign: 'center' }}>
                        <span style={{ color: '#94a3b8', fontSize: 11, display: 'block' }}>إجمالي المبيعات</span>
                        <strong style={{ color: '#34d399', fontSize: 16, fontWeight: 900 }}>
                          {formatCurrency(totalSales)}
                        </strong>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <span style={{ color: '#94a3b8', fontSize: 11, display: 'block' }}>كاش بالدرج</span>
                        <strong style={{ color: '#60a5fa', fontSize: 14, fontWeight: 800 }}>
                          {formatCurrency(drawerCash)}
                        </strong>
                      </div>
                      {walletSales > 0 && (
                        <div style={{ textAlign: 'center' }}>
                          <span style={{ color: '#c084fc', fontSize: 11, display: 'block' }}>بالمحفظة الرقمية</span>
                          <strong style={{ color: '#d8b4fe', fontSize: 14, fontWeight: 800 }}>
                            {formatCurrency(walletSales)}
                          </strong>
                        </div>
                      )}
                      {expenses > 0 && (
                        <div style={{ textAlign: 'center' }}>
                          <span style={{ color: '#fca5a5', fontSize: 11, display: 'block' }}>المصروفات</span>
                          <strong style={{ color: '#f87171', fontSize: 14, fontWeight: 800 }}>
                            -{formatCurrency(expenses)}
                          </strong>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title="إضافة إيراد مباشر متنوع" size="sm">
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Select
            label="نوع الإيراد"
            value={form.type}
            onChange={e => {
              const label = REVENUE_CATEGORIES.find(c => c.value === e.target.value)?.label || '';
              setForm({ ...form, type: e.target.value, label });
            }}
          >
            {REVENUE_CATEGORIES.filter(c => c.value !== 'subscriptions').map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </Select>
          <Input
            label="وصف تفصيلي"
            value={form.label}
            onChange={e => setForm({ ...form, label: e.target.value })}
            placeholder="مثل: مبيعات كافيه، مسبح..."
          />
          <Input
            label="المبلغ (ج.م)"
            type="number"
            value={form.amount}
            onChange={e => setForm({ ...form, amount: e.target.value })}
            required
          />
          <Input
            label="ملاحظة (اختياري)"
            value={form.note}
            onChange={e => setForm({ ...form, note: e.target.value })}
          />
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <Button type="submit" variant="success" className="flex-1" disabled={loading}>
              {loading ? 'جاري الحفظ...' : 'إضافة وحفظ'}
            </Button>
            <Button type="button" variant="ghost" className="flex-1" onClick={() => setModal(false)}>إلغاء</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        title="حذف الإيراد"
        message="هل أنت متأكد من حذف هذا الإيراد؟"
        onConfirm={async () => { await deleteAdminRevenue(deleteId); setDeleteId(null); }}
        onCancel={() => setDeleteId(null)}
      />

      <ConfirmDialog
        open={!!deletePayId}
        title="حذف دفعة الاشتراك"
        message="هل أنت متأكد من حذف هذا الإيصال المالي نهائياً؟"
        onConfirm={async () => {
          try {
            await permanentlyDeletePayment(deletePayId);
          } catch (err) {
            console.error(err);
          }
          setDeletePayId(null);
        }}
        onCancel={() => setDeletePayId(null)}
      />
    </div>
  );
}
