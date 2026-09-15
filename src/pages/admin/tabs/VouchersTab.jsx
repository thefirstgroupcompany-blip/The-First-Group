import React, { useState, useEffect, useMemo } from 'react';
import { getVouchers, addVoucher, deleteVoucher, getAllShifts, getSystemInfo } from '../../../services/db';
import { Card, StatCard, EmptyState, Button, Input, Modal, Badge, ConfirmDialog } from '../../../components/ui';
import { formatCurrency, formatDate } from '../../../utils/constants';
import { exportToExcel } from '../../../utils/excelExport';
import { printThermalReceipt } from '../../../utils/thermalPrinter';

export default function VouchersTab({ shiftId, employeeId, isEmployee = false }) {
  const [vouchers, setVouchers] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [systemInfo, setSystemInfo] = useState({ name: 'THE FIRST GROUP' });
  const [modal, setModal] = useState(false);
  const [voucherType, setVoucherType] = useState('receipt'); // 'receipt' (قبض) or 'payment' (صرف)
  const [targetShiftId, setTargetShiftId] = useState(shiftId || '');
  const [form, setForm] = useState({
    personName: '', phone: '', amount: '', paymentMethod: 'cash',
    category: 'إيرادات عامة', reason: '', notes: ''
  });
  const [deleteId, setDeleteId] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsubV = getVouchers(setVouchers);
    const unsubS = getAllShifts(setShifts);
    getSystemInfo().then(setSystemInfo);
    return () => { unsubV(); unsubS(); };
  }, []);

  const openShifts = useMemo(() => shifts.filter(s => s.status === 'open' && !s.isAdminShift), [shifts]);

  const totalReceipts = useMemo(() => vouchers.filter(v => v.type === 'receipt').reduce((s, v) => s + (Number(v.amount) || 0), 0), [vouchers]);
  const totalPayments = useMemo(() => vouchers.filter(v => v.type === 'payment').reduce((s, v) => s + (Number(v.amount) || 0), 0), [vouchers]);

  const handleOpenAdd = (type) => {
    setVoucherType(type);
    setTargetShiftId(shiftId || '');
    setForm({
      personName: '',
      phone: '',
      amount: '',
      paymentMethod: 'cash',
      category: type === 'receipt' ? 'إيرادات عامة ونثريات' : 'مصروفات عامة ونثريات',
      reason: '',
      notes: ''
    });
    setModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (loading || !form.personName || !form.amount) return;
    const activeShiftId = shiftId || (targetShiftId ? targetShiftId : null);
    const isCash = !form.paymentMethod || form.paymentMethod === 'cash' || form.paymentMethod === 'نقدي';
    if (voucherType === 'receipt' && isCash && !activeShiftId) {
      return alert('⚠️ تنبيه أمان مالي صارم: لا يمكن استلام سند قبض نقدي لعدم وجود مناوبة مفتوحة! يُرجى فتح أو اختيار مناوبة مفتوحة أولاً.');
    }
    setLoading(true);
    try {
      const vNo = `VCH-${Date.now().toString().slice(-6)}`;
      await addVoucher({
        ...form,
        type: voucherType,
        voucherNo: vNo
      }, activeShiftId, employeeId || null);
      setModal(false);
      window.showToast?.(voucherType === 'receipt' ? '✅ تم حفظ سند القبض بنجاح' : '✅ تم حفظ سند الصرف بنجاح', 'success');
    } catch (err) {
      console.error('Error saving voucher:', err);
      window.showToast?.('حدث خطأ أثناء حفظ السند: ' + (err?.message || 'يرجى المحاولة'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleThermalPrint = (v, paperWidth = '80mm') => {
    printThermalReceipt({
      type: 'voucher',
      paperWidth,
      data: {
        voucherNo: v.voucherNo,
        voucherType: v.type,
        beneficiary: v.personName,
        amount: v.amount,
        category: v.category,
        notes: v.reason || v.notes,
        cashierName: v.employeeName || v.actorName || 'الخزينة'
      },
      orgName: systemInfo?.name || 'THE FIRST GROUP'
    });
  };

  const handlePrint = (v) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('يرجى السماح بالنوافذ المنبثقة (Popups) في المتصفح لطباعة السند');
      return;
    }
    const isReceipt = v.type === 'receipt';
    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <title>سند ${isReceipt ? 'قبض' : 'صرف'} - ${v.voucherNo || ''}</title>
        <style>
          body { font-family: 'Cairo', sans-serif; padding: 30px; margin: 0; color: #111; direction: rtl; }
          .voucher-box { border: 2px solid #222; border-radius: 12px; padding: 24px; max-width: 650px; margin: 0 auto; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #333; padding-bottom: 14px; margin-bottom: 20px; }
          .title { font-size: 22px; font-weight: 900; color: #0f172a; text-align: center; margin: 10px 0; }
          .field { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #ccc; font-size: 15px; }
          .amount-box { background: #f1f5f9; border: 2px solid #0f172a; border-radius: 8px; padding: 12px; text-align: center; font-size: 22px; font-weight: 900; margin: 20px 0; }
          .signatures { display: flex; justify-content: space-between; margin-top: 40px; padding-top: 20px; }
          .sig-box { text-align: center; width: 180px; border-top: 1px solid #333; padding-top: 6px; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="voucher-box">
          <div class="header">
            <div>
              <h2 style="margin:0; font-size: 18px;">${systemInfo?.name || 'THE FIRST GROUP'}</h2>
              <p style="margin:2px 0; font-size: 12px; color: #666;">سوهاج - إدارة العمليات المالية</p>
            </div>
            <div style="text-align: left;">
              <p style="margin:0; font-weight: bold; font-size: 14px;">رقم السند: ${v.voucherNo || '—'}</p>
              <p style="margin:2px 0; font-size: 12px; color: #666;">التاريخ: ${v.date ? formatDate(v.date) : formatDate(new Date())}</p>
            </div>
          </div>

          <div class="title">${isReceipt ? 'سـنـد قـبـض نـقـديـة (Official Receipt)' : 'سـنـد صـرف نـقـديـة (Payment Voucher)'}</div>

          <div class="amount-box">
            المبلغ: ${Number(v.amount).toLocaleString('ar-EG-u-nu-latn')} ج.م
          </div>

          <div class="field">
            <span>${isReceipt ? 'استلمنا من السيد/ة:' : 'اصرفوا إلى السيد/ة:'}</span>
            <strong>${v.personName}</strong>
          </div>
          ${v.phone ? `<div class="field"><span>رقم الهاتف:</span><strong>${v.phone}</strong></div>` : ''}
          <div class="field">
            <span>وذلك مقابل / السبب:</span>
            <strong>${v.reason || 'نثريات ومعاملات إدارية'}</strong>
          </div>
          <div class="field">
            <span>طريقة الدفع:</span>
            <strong>${v.paymentMethod === 'cash' ? 'نقدي 💵' : v.paymentMethod === 'visa' ? 'فيزا 💳' : v.paymentMethod === 'vodafone_cash' ? 'فودافون كاش 📱' : 'إنستاباي ⚡'}</strong>
          </div>
          ${v.notes ? `<div class="field"><span>ملاحظات إضافية:</span><span>${v.notes}</span></div>` : ''}

          <div class="signatures">
            <div class="sig-box">${isReceipt ? 'المستلم (الخزينة)' : 'المستلم'}</div>
            <div class="sig-box">توقيع المسؤول / المدير</div>
          </div>
        </div>
        <script>
          window.print();
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleExportExcel = () => {
    if (vouchers.length === 0) {
      alert('لا توجد سندات لتصديرها');
      return;
    }
    const data = vouchers.map(v => ({
      'رقم السند': v.voucherNo || '—',
      'النوع': v.type === 'receipt' ? 'سند قبض' : 'سند صرف',
      'الطرف / الاسم': v.personName || '—',
      'المبلغ': Number(v.amount) || 0,
      'السبب والبيان': v.reason || '—',
      'طريقة الدفع': v.paymentMethod === 'cash' ? 'نقدي' : v.paymentMethod === 'visa' ? 'فيزا' : v.paymentMethod === 'vodafone_cash' ? 'فودافون كاش' : 'إنستاباي',
      'رقم الهاتف': v.phone || '—',
      'ملاحظات': v.notes || '—',
      'التاريخ': v.date ? formatDate(v.date) : '—'
    }));
    exportToExcel(data, `سندات_القبض_والصرف_${new Date().toISOString().slice(0, 10)}`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ color: '#ffffff', fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>📜</span> مولد سندات القبض والصرف الحرّة (Receipts & Vouchers)
          </h2>
          <p style={{ color: '#93c5fd', fontSize: 13, margin: '4px 0 0' }}>
            إصدار وطباعة سندات قبض نقدية وسندات صرف نثريات فورية قابلة للتوثيق والطباعة
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button size="sm" variant="ghost" onClick={handleExportExcel} style={{ border: '1px solid var(--border)', color: '#38bdf8' }}>
            📥 تصدير إكسيل
          </Button>
          <Button size="sm" onClick={() => handleOpenAdd('receipt')} style={{ background: 'linear-gradient(135deg, #059669, #10b981)', color: '#fff', fontWeight: 800 }}>
            💰 + سند قبض نقدية
          </Button>
          <Button size="sm" onClick={() => handleOpenAdd('payment')} style={{ background: 'linear-gradient(135deg, #dc2626, #ef4444)', color: '#fff', fontWeight: 800 }}>
            💸 + سند صرف نثريات
          </Button>
        </div>
      </div>

      {/* KPI Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <StatCard icon="📜" label="إجمالي السندات الصادرة" value={vouchers.length} color="blue" />
        <StatCard icon="💰" label="إجمالي المقبوضات بالسندات" value={formatCurrency(totalReceipts)} color="green" />
        <StatCard icon="💸" label="إجمالي المصروفات بالسندات" value={formatCurrency(totalPayments)} color="red" />
      </div>

      {/* Vouchers Table */}
      <Card style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: 0, overflow: 'hidden' }}>
        {vouchers.length === 0 ? <EmptyState icon="📜" message="لا توجد سندات صادرة بعد" /> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid var(--border)', color: '#94a3b8' }}>
                  <th style={{ padding: '12px' }}>رقم السند</th>
                  <th style={{ padding: '12px' }}>النوع</th>
                  <th style={{ padding: '12px' }}>الطرف / الاسم</th>
                  <th style={{ padding: '12px' }}>المبلغ</th>
                  <th style={{ padding: '12px' }}>السبب والبيان</th>
                  <th style={{ padding: '12px' }}>طريقة الدفع</th>
                  <th style={{ padding: '12px' }}>التاريخ</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {vouchers.map(v => {
                  const isReceipt = v.type === 'receipt';
                  return (
                    <tr key={v.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '12px', color: '#60a5fa', fontWeight: 700 }}>{v.voucherNo}</td>
                      <td style={{ padding: '12px' }}>
                        <Badge color={isReceipt ? "green" : "red"}>
                          {isReceipt ? "💰 سند قبض" : "💸 سند صرف"}
                        </Badge>
                      </td>
                      <td style={{ padding: '12px', color: '#ffffff', fontWeight: 800 }}>{v.personName}</td>
                      <td style={{ padding: '12px', color: isReceipt ? '#34d399' : '#f87171', fontWeight: 900 }}>
                        {formatCurrency(v.amount)}
                      </td>
                      <td style={{ padding: '12px', color: '#cbd5e1' }}>{v.reason || '—'}</td>
                      <td style={{ padding: '12px', color: '#bae6fd' }}>
                        {v.paymentMethod === 'cash' ? '💵 نقدي' : v.paymentMethod === 'visa' ? '💳 فيزا' : v.paymentMethod === 'vodafone_cash' ? '📱 فودافون كاش' : '⚡ إنستاباي'}
                      </td>
                      <td style={{ padding: '12px', color: '#94a3b8', fontSize: 12 }}>
                        {v.date ? formatDate(v.date) : '—'}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <Button size="sm" variant="ghost" onClick={() => handlePrint(v)} style={{ color: '#60a5fa' }} title="طباعة سند رسمي A4">
                            🖨️ A4
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleThermalPrint(v, '80mm')} style={{ color: '#38bdf8', background: 'rgba(56, 189, 248, 0.1)' }} title="طباعة إيصال حراري 80mm">
                            🧾 حراري
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => setDeleteId(v.id)}>
                            حذف
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add Voucher Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={voucherType === 'receipt' ? '💰 إصدار سند قبض نقدية جديد' : '💸 إصدار سند صرف نثريات جديد'} size="md">
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input
              label={voucherType === 'receipt' ? 'اسم الطرف المسلم / العميل' : 'اسم المستلم / الموظف'}
              value={form.personName}
              onChange={e => setForm({ ...form, personName: e.target.value })}
              required
            />
            <Input label="رقم الموبايل (اختياري)" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input label="المبلغ (ج.م)" type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required />
            <div>
              <label style={{ display: 'block', color: '#c8dcf5', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>طريقة الدفع:</label>
              <select
                value={form.paymentMethod}
                onChange={e => setForm({ ...form, paymentMethod: e.target.value })}
                style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', color: '#fff', fontSize: 13 }}
              >
                <option value="cash" style={{ background: '#0a162b', color: '#fff' }}>💵 نقدي (الخزينة / الدرج)</option>
                <option value="visa" style={{ background: '#0a162b', color: '#fff' }}>💳 فيزا / بطاقة بنكية</option>
                <option value="instapay" style={{ background: '#0a162b', color: '#fff' }}>⚡ تطبيق إنستاباي InstaPay</option>
              </select>
            </div>
          </div>

          {!isEmployee && openShifts.length > 0 && (
            <div>
              <label style={{ display: 'block', color: '#c8dcf5', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>توجيه السند المحاسبي:</label>
              <select
                value={targetShiftId}
                onChange={e => setTargetShiftId(e.target.value)}
                style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', color: '#fff', fontSize: 13 }}
              >
                <option value="" style={{ background: '#0a162b', color: '#fff' }}>🏢 حسابات وخزينة الإدارة المركزية (عام)</option>
                {openShifts.map(s => (
                  <option key={s.id} value={s.id} style={{ background: '#0a162b', color: '#fff' }}>
                    🟢 مناوبة موظف مفتوحة: {s.employeeName || 'استقبال'} (#{s.id?.slice(-6)})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input label="السبب والبيان" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="مثال: رسوم طباعة ملازم" required />
            <Input label="ملاحظات إضافية" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <Button type="button" variant="ghost" onClick={() => setModal(false)}>إلغاء</Button>
            <Button type="submit" variant={voucherType === 'receipt' ? "success" : "primary"} disabled={loading}>
              {loading ? 'جاري الإصدار...' : (voucherType === 'receipt' ? '✅ تأكيد وإصدار سند القبض' : '✅ تأكيد وإصدار سند الصرف')}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={async () => {
          try {
            await deleteVoucher(deleteId);
            alert('✅ تم حذف السند وعكس أثره بنجاح.');
          } catch (err) {
            console.error('Error deleting voucher:', err);
            alert(err.message || 'حدث خطأ أثناء حذف السند');
          } finally {
            setDeleteId(null);
          }
        }}
        title="حذف السند"
        message="هل أنت متأكد من حذف هذا السند؟"
      />
    </div>
  );
}
