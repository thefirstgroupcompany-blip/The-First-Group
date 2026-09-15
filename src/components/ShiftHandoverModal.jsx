import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Button, Badge } from './ui';
import { formatCurrency, formatDateTime, formatHoursClock } from '../utils/constants';
import { printShiftReport } from '../utils/printReport';

export default function ShiftHandoverModal({
  open,
  onClose,
  shift,
  mode = 'close', // 'close' | 'adjust'
  payments = [],
  tickets = [],
  clients = [],
  systemInfo = {},
  onConfirm
}) {
  // Active Payments (filter out voided ones)
  const validPayments = useMemo(() => {
    return (payments || []).filter(p => p && !p.isVoided);
  }, [payments]);

  // 1. Calculate Shift Financials (Cash vs Digital)
  const paymentsCashTotal = useMemo(() => {
    return validPayments
      .filter(p => p && (p.paymentMethod === 'cash' || p.paymentMethod === 'نقدي' || !p.paymentMethod))
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  }, [validPayments]);

  const paymentsDigitalTotal = useMemo(() => {
    return validPayments
      .filter(p => p && p.paymentMethod && p.paymentMethod !== 'cash' && p.paymentMethod !== 'نقدي')
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  }, [validPayments]);

  const ticketsCashTotal = useMemo(() => {
    return (tickets || [])
      .filter(t => t && (t.paymentMethod === 'cash' || t.paymentMethod === 'نقدي' || !t.paymentMethod))
      .reduce((sum, t) => sum + (Number(t.total) || (Number(t.quantity) * Number(t.ticketPrice)) || 0), 0);
  }, [tickets]);

  const ticketsDigitalTotal = useMemo(() => {
    return (tickets || [])
      .filter(t => t && t.paymentMethod && t.paymentMethod !== 'cash' && t.paymentMethod !== 'نقدي')
      .reduce((sum, t) => sum + (Number(t.total) || (Number(t.quantity) * Number(t.ticketPrice)) || 0), 0);
  }, [tickets]);

  const revenuesTotal = useMemo(() => {
    if (Array.isArray(shift?.revenues)) {
      return shift.revenues.reduce((sum, r) => sum + (Number(r?.amount) || 0), 0);
    }
    return Number(shift?.revenues || 0);
  }, [shift?.revenues]);

  const expensesTotal = useMemo(() => {
    if (Array.isArray(shift?.expenses)) {
      return shift.expenses.reduce((sum, e) => sum + (Number(e?.amount) || 0), 0);
    }
    return Number(shift?.expenses || shift?.totalExpenses || 0);
  }, [shift?.expenses, shift?.totalExpenses]);

  const calculatedRevenue = paymentsCashTotal + paymentsDigitalTotal + ticketsCashTotal + ticketsDigitalTotal + revenuesTotal;
  const calculatedNet = calculatedRevenue - expensesTotal;

  // Expected Cash Drawer (Actual Physical Cash to be handed over)
  const calculatedDrawerCash = (paymentsCashTotal + ticketsCashTotal + revenuesTotal) - expensesTotal;
  const systemExpectedDrawer = (mode === 'close' || shift?.expectedCash == null)
    ? calculatedDrawerCash
    : Number(shift.expectedCash || 0);
  const totalDigitalIncome = paymentsDigitalTotal + ticketsDigitalTotal;

  // 2. Open Workspace Sessions Check
  const openWorkspaceClients = useMemo(() => {
    return (clients || []).filter(c => c?.workspaceCurrentSession?.checkIn);
  }, [clients]);

  // Form State
  const [actualCash, setActualCash] = useState('');
  const [receivedBy, setReceivedBy] = useState(shift?.receivedBy || 'الإدارة / المدير العام');
  const [handoverNotes, setHandoverNotes] = useState(shift?.handoverNotes || '');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [savingLoading, setSavingLoading] = useState(false);

  useEffect(() => {
    if (shift) {
      if (mode === 'adjust' && shift.actualCash !== undefined) {
        setActualCash(String(shift.actualCash));
      } else {
        setActualCash(String(systemExpectedDrawer));
      }
      setReceivedBy(shift.receivedBy || 'الإدارة / المدير العام');
      setHandoverNotes(shift.handoverNotes || '');
      setAdjustmentReason('');
    }
  }, [shift, mode, systemExpectedDrawer]);

  // Discrepancy (Actual - Expected Drawer Cash)
  const currentActualNum = Number(actualCash) || 0;
  const discrepancy = currentActualNum - systemExpectedDrawer;

  // Print Handover Voucher
  const handlePrintVoucher = () => {
    const enrichedShift = {
      ...shift,
      totalRevenue: calculatedRevenue,
      totalExpenses: expensesTotal,
      netAmount: calculatedNet,
      drawerCash: calculatedDrawerCash,
      expectedCash: systemExpectedDrawer,
      actualCash: currentActualNum,
      cashDifference: discrepancy,
      digitalRevenue: totalDigitalIncome,
      receivedBy,
      handoverNotes: mode === 'adjust' ? `${handoverNotes} (ملاحظة التصحيح: ${adjustmentReason || 'تصحيح الإدارة'})` : handoverNotes,
      adjustedAt: mode === 'adjust' ? new Date() : shift.adjustedAt
    };

    printShiftReport({
      shift: enrichedShift,
      payments: validPayments,
      tickets,
      clients,
      systemInfo
    });
  };

  // Submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSavingLoading(true);
    try {
      const payload = {
        expectedCash: systemExpectedDrawer,
        actualCash: currentActualNum,
        cashDifference: discrepancy,
        digitalRevenue: totalDigitalIncome,
        receivedBy: receivedBy.trim() || 'الإدارة',
        handoverNotes: handoverNotes.trim(),
        employeeName: shift.employeeName || 'الموظف',
        adjustmentReason: adjustmentReason.trim()
      };

      await onConfirm(shift.id, payload);
      onClose();
    } catch (err) {
      alert('حدث خطأ: ' + err.message);
    } finally {
      setSavingLoading(false);
    }
  };

  if (!shift) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'adjust' ? '✏️ تصحيح وتعديل محضر جرد المناوبة' : '📋 محضر تقفيل وتسليم نقدية المناوبة'}
      size="lg"
    >
      <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 14, alignItems: 'start' }}>

        {/* Left Column: Summary and Warnings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Shift Meta Banner */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.85)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: 14,
            padding: '12px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8
          }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#ffffff' }}>
                👤 الموظف المسئول: <span style={{ color: '#60a5fa' }}>{shift?.employeeName || shift?.empDisplayName || 'موظف الاستقبال'}</span>
              </div>
              <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}>
                🕒 فُتحت: {formatDateTime(shift?.openedAt)}
              </div>
            </div>
            <Badge color={mode === 'adjust' ? 'purple' : 'amber'}>
              {mode === 'adjust' ? '✏️ تعديل إداري معتمد' : '🟡 جاهزة للتقفيل'}
            </Badge>
          </div>

          {/* Financial Breakdown: Physical Cash Drawer vs Digital Income */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, textAlign: 'center' }}>
            <div style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1.5px solid rgba(16, 185, 129, 0.4)', borderRadius: 12, padding: 12 }}>
              <span style={{ fontSize: 11, color: '#a7f3d0', display: 'block', fontWeight: 700 }}>💵 النقدية المفترضة بالدرج</span>
              <strong style={{ color: '#34d399', fontSize: 18, fontWeight: 900 }}>{formatCurrency(systemExpectedDrawer)}</strong>
              <span style={{ fontSize: 10, color: '#6ee7b7', display: 'block', marginTop: 2 }}>المطلوب تسليمها للخزينة</span>
            </div>

            <div style={{ background: 'rgba(59, 130, 246, 0.12)', border: '1.5px solid rgba(59, 130, 246, 0.4)', borderRadius: 12, padding: 12 }}>
              <span style={{ fontSize: 11, color: '#93c5fd', display: 'block', fontWeight: 700 }}>💳 التحويلات الرقمية</span>
              <strong style={{ color: '#60a5fa', fontSize: 18, fontWeight: 900 }}>{formatCurrency(totalDigitalIncome)}</strong>
              <span style={{ fontSize: 10, color: '#bfdbfe', display: 'block', marginTop: 2 }}>مستلمة بالحسابات الإلكترونية</span>
            </div>
          </div>

          {/* Expenses & Total Revenue Note */}
          <div style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '8px 14px', fontSize: 12, color: '#cbd5e1' }}>
            <span>إجمالي المصروفات المنصرفة: <strong style={{ color: '#f87171' }}>{formatCurrency(expensesTotal)}</strong></span>
            <span>إجمالي حركة الإيرادات الشاملة: <strong style={{ color: '#ffffff' }}>{formatCurrency(calculatedRevenue)}</strong></span>
          </div>

          {/* Open Workspace Sessions Warning */}
          {openWorkspaceClients.length > 0 && (
            <div style={{ background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.35)', borderRadius: 12, padding: '10px 14px', textAlign: 'right' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#f59e0b', fontWeight: 800, fontSize: 13, marginBottom: 4 }}>
                <span>⚠️</span> يوجد ({openWorkspaceClients.length}) مشترك متواجد حالياً في مساحة العمل:
              </div>
              <div style={{ color: '#e2e8f0', fontSize: 12, lineHeight: 1.5 }}>
                {openWorkspaceClients.map(c => c?.name || 'مشترك').join(' ، ')}
                <br />
                <span style={{ color: '#cbd5e1', fontSize: 11 }}>💡 سيتم ترحيل متابعة حضورهم تلقائياً لعهدة الوردية القادمة.</span>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Handover Inputs & Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Handover Inputs Card */}
          <div style={{
            background: 'rgba(7, 17, 31, 0.9)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 16,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}>
            <div>
              <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                💵 النقدية الفعلية المسلمة بالدرج (ج.م):
              </label>
              <input
                type="number"
                value={actualCash}
                onChange={e => setActualCash(e.target.value)}
                required
                autoFocus
                style={{
                  width: '100%',
                  background: 'rgba(15, 23, 42, 0.9)',
                  border: '1px solid rgba(59,130,246,0.4)',
                  borderRadius: 12,
                  padding: '12px 14px',
                  color: '#ffffff',
                  fontSize: 18,
                  fontWeight: 900,
                  textAlign: 'center',
                  fontFamily: 'Cairo, sans-serif',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Live Discrepancy Banner */}
            <div style={{
              padding: '10px 14px',
              borderRadius: 12,
              background: discrepancy === 0
                ? 'rgba(16, 185, 129, 0.15)'
                : discrepancy < 0
                  ? 'rgba(239, 68, 68, 0.15)'
                  : 'rgba(59, 130, 246, 0.15)',
              border: discrepancy === 0
                ? '1px solid rgba(16, 185, 129, 0.4)'
                : discrepancy < 0
                  ? '1px solid rgba(239, 68, 68, 0.4)'
                  : '1px solid rgba(59, 130, 246, 0.4)',
              color: discrepancy === 0 ? '#34d399' : discrepancy < 0 ? '#fca5a5' : '#93c5fd',
              fontSize: 13,
              fontWeight: 800,
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8
            }}>
              {discrepancy === 0 && '✅ نقدية الدرج متطابقة تماماً (0 ج.م عجز)'}
              {discrepancy < 0 && `⚠️ يوجد عجز نقدي بالدرج بمقدار: ${formatCurrency(Math.abs(discrepancy))}`}
              {discrepancy > 0 && `🟢 توجد زيادة نقدية بالدرج بمقدار: ${formatCurrency(discrepancy)}`}
            </div>

            <div>
              <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                ✍️ اسم المستلم من الإدارة:
              </label>
              <input
                type="text"
                value={receivedBy}
                onChange={e => setReceivedBy(e.target.value)}
                placeholder="مثال: أحمد حسن (المدير العام)"
                required
                style={{
                  width: '100%',
                  background: 'rgba(15, 23, 42, 0.9)',
                  border: '1px solid rgba(59,130,246,0.3)',
                  borderRadius: 10,
                  padding: '10px 14px',
                  color: '#ffffff',
                  fontSize: 13,
                  fontFamily: 'Cairo, sans-serif',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {mode === 'adjust' && (
              <div>
                <label style={{ display: 'block', color: '#f59e0b', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                  ⚠️ سبب التصحيح (يوثق في سجل الرقابة والأمان):
                </label>
                <input
                  type="text"
                  value={adjustmentReason}
                  onChange={e => setAdjustmentReason(e.target.value)}
                  placeholder="مثال: تصحيح خطأ كتابة رقم من الموظف أثناء التقفيل"
                  required
                  style={{
                    width: '100%',
                    background: 'rgba(15, 23, 42, 0.9)',
                    border: '1px solid rgba(245,158,11,0.4)',
                    borderRadius: 10,
                    padding: '10px 14px',
                    color: '#ffffff',
                    fontSize: 13,
                    fontFamily: 'Cairo, sans-serif',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            )}

            <div>
              <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                📝 ملاحظات التسليم والاستلام:
              </label>
              <textarea
                rows={2}
                value={handoverNotes}
                onChange={e => setHandoverNotes(e.target.value)}
                placeholder="أي ملاحظات أو تسويات تمت أثناء الوردية..."
                style={{
                  width: '100%',
                  background: 'rgba(15, 23, 42, 0.9)',
                  border: '1px solid rgba(59,130,246,0.3)',
                  borderRadius: 10,
                  padding: '10px 14px',
                  color: '#ffffff',
                  fontSize: 13,
                  fontFamily: 'Cairo, sans-serif',
                  outline: 'none',
                  boxSizing: 'border-box',
                  resize: 'none'
                }}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button
              type="button"
              onClick={handlePrintVoucher}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: 12,
                background: 'rgba(59, 130, 246, 0.15)',
                border: '1px solid #3b82f6',
                color: '#93c5fd',
                fontWeight: 800,
                fontSize: 14,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                fontFamily: 'Cairo, sans-serif'
              }}
            >
              <span>🖨️</span> {mode === 'adjust' ? 'طباعة السند المصحح' : 'طباعة محضر التسليم'}
            </button>

            <button
              type="submit"
              disabled={savingLoading}
              style={{
                flex: 1.5,
                padding: '12px',
                borderRadius: 12,
                background: mode === 'adjust'
                  ? 'linear-gradient(135deg, #16a34a 0%, #22c55e 100%)'
                  : 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
                color: '#ffffff',
                fontWeight: 900,
                fontSize: 14,
                border: 'none',
                cursor: savingLoading ? 'not-allowed' : 'pointer',
                boxShadow: mode === 'adjust' ? '0 4px 16px rgba(34, 197, 94, 0.4)' : '0 4px 16px rgba(239, 68, 68, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                fontFamily: 'Cairo, sans-serif'
              }}
            >
              {savingLoading ? 'جاري الحفظ...' : mode === 'adjust' ? '💾 اعتماد وتعديل الجرد' : '🔒 تأكيد تقفيل المناوبة'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
