import React, { useState, useEffect } from 'react';
import {
  watchShift, getAllPayments, getTicketSales,
  deleteShiftExpense, deleteShiftRevenue,
  addShiftExpense, addShiftRevenue, closeShift,
  getSystemInfo, getClients
} from '../../../services/db';
import { Card, Button, Input, Select, Modal, Badge } from '../../../components/ui';
import { formatCurrency, formatDateTime, EXPENSE_CATEGORIES, REVENUE_CATEGORIES } from '../../../utils/constants';
import { printShiftReport } from '../../../utils/printReport';
import ShiftHandoverModal from '../../../components/ShiftHandoverModal';

export default function ShiftDetailModal({ shiftId, onClose }) {
  const [shift, setShift] = useState(null);
  const [payments, setPayments] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [clients, setClients] = useState([]);
  const [systemInfo, setSystemInfo] = useState({});
  const [expenseModal, setExpenseModal] = useState(false);
  const [revenueModal, setRevenueModal] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ label: '', amount: '', type: 'other' });
  const [revenueForm, setRevenueForm] = useState({ label: '', amount: '', type: 'other' });
  const [actionLoading, setActionLoading] = useState(false);
  const [handoverModalOpen, setHandoverModalOpen] = useState(false);

  useEffect(() => {
    if (!shiftId) return;
    const unsubShift = watchShift(shiftId, setShift);
    const unsubPayments = getAllPayments((allP) => {
      setPayments(allP.filter(p => p.shiftId === shiftId));
    });
    getSystemInfo().then(setSystemInfo);
    const unsubC = getClients(setClients);
    const unsubTickets = getTicketSales((allT) => {
      setTickets(allT.filter(t => t.shiftId === shiftId));
    });

    return () => {
      unsubShift && unsubShift();
      unsubPayments && unsubPayments();
      unsubTickets && unsubTickets();
      unsubC && unsubC();
    };
  }, [shiftId]);

  if (!shift) return null;

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!expenseForm.amount) return;
    setActionLoading(true);
    try {
      await addShiftExpense(shift.id, {
        label: expenseForm.label || 'مصروف عام',
        amount: Number(expenseForm.amount),
        type: expenseForm.type || 'other'
      });
      setExpenseModal(false);
      setExpenseForm({ label: '', amount: '', type: 'other' });
    } catch (err) {
      alert('حدث خطأ أثناء إضافة المصروف: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddRevenue = async (e) => {
    e.preventDefault();
    if (!revenueForm.amount) return;
    setActionLoading(true);
    try {
      await addShiftRevenue(shift.id, {
        label: revenueForm.label || 'إيراد إضافي',
        amount: Number(revenueForm.amount),
        type: revenueForm.type || 'other'
      });
      setRevenueModal(false);
      setRevenueForm({ label: '', amount: '', type: 'other' });
    } catch (err) {
      alert('حدث خطأ أثناء إضافة الإيراد: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <>
      <Modal open={true} onClose={onClose} title={`تفاصيل وإدارة مناوبة: ${shift.employeeName}`} size="xl">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          
          {/* Shift Header & Stats */}
          <div style={{
            background: 'var(--bg-base)', padding: '14px 16px', borderRadius: 12,
            border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ color: '#fff', fontSize: 17, margin: 0, fontWeight: 700 }}>{shift.employeeName}</h3>
                  <Badge color={shift.status === 'open' ? 'amber' : 'green'}>
                    {shift.status === 'open' ? '🟡 مناوبة مفتوحة' : '✅ مغلقة'}
                  </Badge>
                </div>
                <p style={{ color: '#93c5fd', fontSize: 12, marginTop: 3, margin: 0 }}>
                  بدأت: {formatDateTime(shift.openedAt)}
                  {shift.closedAt ? ' ← أغلقت: ' + formatDateTime(shift.closedAt) : ''}
                </p>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button size="sm" variant="ghost" onClick={() => printShiftReport({ shift, payments, tickets, systemInfo, clients })}>
                  🖨️ طباعة التقرير
                </Button>
                {shift.status === 'open' && (
                  <Button size="sm" variant="danger" onClick={() => setHandoverModalOpen(true)}>
                    🔒 محضر إغلاق وتسليم النقدية
                  </Button>
                )}
              </div>
            </div>

            {/* Quick numbers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
              <div style={{ textAlign: 'center', padding: '8px', background: 'rgba(56, 189, 248, 0.1)', borderRadius: 8, border: '1px solid rgba(56, 189, 248, 0.25)' }}>
                <p style={{ fontSize: 11, color: '#bae6fd', margin: 0 }}>💵 نقدية الدرج المتوقعة</p>
                <p style={{ color: '#38bdf8', fontWeight: 800, fontSize: 15, margin: '2px 0 0' }}>
                  {formatCurrency(shift.drawerCash !== undefined ? shift.drawerCash : (shift.cashRevenue || 0))}
                </p>
              </div>
              <div style={{ textAlign: 'center', padding: '8px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: 8, border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                <p style={{ fontSize: 11, color: '#a7f3d0', margin: 0 }}>إجمالي الإيرادات</p>
                <p style={{ color: '#34d399', fontWeight: 800, fontSize: 15, margin: '2px 0 0' }}>{formatCurrency(shift.totalRevenue || 0)}</p>
              </div>
              <div style={{ textAlign: 'center', padding: '8px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: 8, border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                <p style={{ fontSize: 11, color: '#fca5a5', margin: 0 }}>إجمالي المصاريف</p>
                <p style={{ color: '#f87171', fontWeight: 800, fontSize: 15, margin: '2px 0 0' }}>{formatCurrency(shift.totalExpenses || 0)}</p>
              </div>
              <div style={{ textAlign: 'center', padding: '8px', background: 'rgba(59, 130, 246, 0.12)', borderRadius: 8, border: '1px solid rgba(59, 130, 246, 0.35)' }}>
                <p style={{ fontSize: 11, color: '#bfdbfe', margin: 0 }}>صافي المناوبة</p>
                <p style={{ fontWeight: 800, fontSize: 15, margin: '2px 0 0', color: (shift.netAmount || 0) >= 0 ? '#60a5fa' : '#f87171' }}>
                  {formatCurrency(shift.netAmount || 0)}
                </p>
              </div>
            </div>

            {/* Add extra actions */}
            {shift.status === 'open' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 2 }}>
                <Button size="sm" variant="outline" onClick={() => setExpenseModal(true)}>
                  💸 إضافة مصروف للمناوبة
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRevenueModal(true)}>
                  💰 إضافة إيراد إضافي للمناوبة
                </Button>
              </div>
            )}
          </div>

          {/* Detailed Movement Grid: 2 columns */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 12, alignItems: 'start' }}>
            {/* Payments & Subscriptions */}
            <Card style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', padding: '12px 14px' }}>
              <h4 style={{ color: '#ffffff', fontSize: 14, fontWeight: 700, margin: '0 0 8px' }}>
                💳 المدفوعات والاشتراكات المحصلة ({payments.length})
              </h4>
              {payments.length === 0 ? (
                <p style={{ color: '#94a3b8', fontSize: 12, margin: 0 }}>لا توجد مدفوعات مسجلة في هذه المناوبة</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {payments.map(p => (
                    <div key={p.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8,
                      border: '1px solid var(--border)', fontSize: 12.5
                    }}>
                      <div>
                        <strong style={{ color: '#fff' }}>{p.clientName}</strong>
                        <span style={{ color: '#93c5fd', marginRight: 8, fontSize: 11.5 }}>
                          {p.paymentMethod === 'cash' ? '💵 نقدي' : p.paymentMethod === 'visa' ? '💳 فيزا' : p.paymentMethod === 'vodafone_cash' ? '📱 فودافون كاش' : '⚡ إنستاباي'}
                        </span>
                      </div>
                      <span style={{ color: '#34d399', fontWeight: 800 }}>{formatCurrency(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Ticket Sales */}
            <Card style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', padding: '12px 14px' }}>
              <h4 style={{ color: '#ffffff', fontSize: 14, fontWeight: 700, margin: '0 0 8px' }}>
                🎟️ مبيعات التذاكر والأنشطة ({tickets.length})
              </h4>
              {tickets.length === 0 ? (
                <p style={{ color: '#94a3b8', fontSize: 12, margin: 0 }}>لا توجد تذاكر مباعة في هذه المناوبة</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {tickets.map(t => (
                    <div key={t.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8,
                      border: '1px solid var(--border)', fontSize: 12.5
                    }}>
                      <div>
                        <strong style={{ color: '#fff' }}>{t.ticketName}</strong>
                        <span style={{ color: '#93c5fd', marginRight: 8, fontSize: 11.5 }}>(عدد {t.quantity})</span>
                      </div>
                      <span style={{ color: '#34d399', fontWeight: 800 }}>{formatCurrency(t.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Shift Expenses */}
            {(shift.expenses || []).length > 0 && (
              <Card style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', padding: '12px 14px' }}>
                <h4 style={{ color: '#ffffff', fontSize: 14, fontWeight: 700, margin: '0 0 8px' }}>
                  💸 المصروفات المسجلة بالمناوبة ({(shift.expenses || []).length})
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(shift.expenses || []).map(exp => (
                    <div key={exp.id || exp.label} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '6px 10px', background: 'rgba(239,68,68,0.04)', borderRadius: 8,
                      border: '1px solid rgba(239,68,68,0.2)', fontSize: 12.5
                    }}>
                      <div>
                        <strong style={{ color: '#fff' }}>{exp.label}</strong>
                        <span style={{ color: '#fca5a5', marginRight: 8, fontSize: 11.5 }}>({exp.type || 'نثريات'})</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: '#f87171', fontWeight: 800 }}>{formatCurrency(exp.amount)}</span>
                        {shift.status === 'open' && (
                          <Button size="sm" variant="ghost" onClick={() => deleteShiftExpense(shift.id, exp.id || exp)} style={{ color: '#ef4444', padding: '2px 6px', fontSize: 11 }}>
                            حذف
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Shift Revenues */}
            {(shift.revenues || []).length > 0 && (
              <Card style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', padding: '12px 14px' }}>
                <h4 style={{ color: '#ffffff', fontSize: 14, fontWeight: 700, margin: '0 0 8px' }}>
                  💰 الإيرادات الإضافية بالمناوبة ({(shift.revenues || []).length})
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(shift.revenues || []).map(rev => (
                    <div key={rev.id || rev.label} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '6px 10px', background: 'rgba(16,185,129,0.04)', borderRadius: 8,
                      border: '1px solid rgba(16,185,129,0.2)', fontSize: 12.5
                    }}>
                      <div>
                        <strong style={{ color: '#fff' }}>{rev.label}</strong>
                        <span style={{ color: '#86efac', marginRight: 8, fontSize: 11.5 }}>({rev.type || 'إيراد'})</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: '#34d399', fontWeight: 800 }}>{formatCurrency(rev.amount)}</span>
                        {shift.status === 'open' && (
                          <Button size="sm" variant="ghost" onClick={() => deleteShiftRevenue(shift.id, rev.id || rev)} style={{ color: '#ef4444', padding: '2px 6px', fontSize: 11 }}>
                            حذف
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      </Modal>

      {/* Expense Modal */}
      <Modal open={expenseModal} onClose={() => setExpenseModal(false)} title="إضافة مصروف على المناوبة" size="sm">
        <form onSubmit={handleAddExpense} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Select label="نوع المصروف" value={expenseForm.type} onChange={e => {
            const label = EXPENSE_CATEGORIES.find(c => c.value === e.target.value)?.label || '';
            setExpenseForm({ ...expenseForm, type: e.target.value, label });
          }}>
            {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
          <Input label="وصف تفصيلي (اختياري)" value={expenseForm.label} onChange={e => setExpenseForm({ ...expenseForm, label: e.target.value })} placeholder="مثل: أدوات نظافة / نثريات" />
          <Input label="المبلغ (ج.م)" type="number" value={expenseForm.amount} onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })} required />
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <Button type="submit" variant="danger" className="flex-1" disabled={actionLoading}>إضافة المصروف</Button>
            <Button type="button" variant="ghost" className="flex-1" onClick={() => setExpenseModal(false)}>إلغاء</Button>
          </div>
        </form>
      </Modal>

      {/* Revenue Modal */}
      <Modal open={revenueModal} onClose={() => setRevenueModal(false)} title="إضافة إيراد إضافي على المناوبة" size="sm">
        <form onSubmit={handleAddRevenue} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Select label="نوع الإيراد" value={revenueForm.type} onChange={e => {
            const label = REVENUE_CATEGORIES.find(c => c.value === e.target.value)?.label || '';
            setRevenueForm({ ...revenueForm, type: e.target.value, label });
          }}>
            {REVENUE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
          <Input label="وصف تفصيلي (اختياري)" value={revenueForm.label} onChange={e => setRevenueForm({ ...revenueForm, label: e.target.value })} placeholder="مثل: كافيه، مبيعات نقدية" />
          <Input label="المبلغ (ج.م)" type="number" value={revenueForm.amount} onChange={e => setRevenueForm({ ...revenueForm, amount: e.target.value })} required />
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <Button type="submit" variant="success" className="flex-1" disabled={actionLoading}>إضافة الإيراد</Button>
            <Button type="button" variant="ghost" className="flex-1" onClick={() => setRevenueModal(false)}>إلغاء</Button>
          </div>
        </form>
      </Modal>

      {/* Handover Modal */}
      {handoverModalOpen && (
        <ShiftHandoverModal
          open={handoverModalOpen}
          shift={shift}
          mode="close"
          payments={payments}
          tickets={tickets}
          clients={clients}
          systemInfo={systemInfo}
          onClose={() => setHandoverModalOpen(false)}
          onConfirm={async (id, data) => {
            await closeShift(id, data);
            setHandoverModalOpen(false);
            onClose();
          }}
        />
      )}
    </>
  );
}
