import React, { useState, useEffect, useMemo } from 'react';
import {
  getVendors, addVendor, updateVendor, deleteVendor,
  getAllVendorInvoices, addVendorInvoice, recordVendorPayment, getAllShifts
} from '../../../services/db';
import { Card, StatCard, EmptyState, Button, Input, Modal, Badge, ConfirmDialog } from '../../../components/ui';
import { formatCurrency, formatDate } from '../../../utils/constants';
import { exportToExcel } from '../../../utils/excelExport';

const VENDOR_CATEGORIES = [
  'كافيه وبن ومشروبات',
  'صيانة وتكييفات وأجهزة',
  'إنترنت وشبكات وكاميرات',
  'مطبوعات ودعاية وأدوات مكتبية',
  'نظافة ومستلزمات عامة',
  'أخرى'
];

export default function VendorsTab() {
  const [vendors, setVendors] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [activeSubTab, setActiveSubTab] = useState('vendors'); // 'vendors', 'invoices'

  // Modal States
  const [vendorModal, setVendorModal] = useState(false);
  const [editVendor, setEditVendor] = useState(null);
  const [vendorForm, setVendorForm] = useState({
    name: '', category: 'كافيه وبن ومشروبات', phone: '', address: '', notes: '', openingBalance: ''
  });

  const [invoiceModal, setInvoiceModal] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({
    vendorId: '', invoiceNo: '', itemsSummary: '', total: '', paid: '', paymentMethod: 'cash'
  });

  const [paymentModal, setPaymentModal] = useState(null);
  const [payForm, setPayForm] = useState({ amount: '', paymentMethod: 'cash', notes: '' });
  const [invoiceShiftId, setInvoiceShiftId] = useState('');
  const [payShiftId, setPayShiftId] = useState('');

  const [deleteVendorId, setDeleteVendorId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const unsubV = getVendors(setVendors);
    const unsubI = getAllVendorInvoices(setInvoices);
    const unsubS = getAllShifts(setShifts);
    return () => { unsubV(); unsubI(); unsubS(); };
  }, []);

  const openShifts = useMemo(() => shifts.filter(s => s.status === 'open'), [shifts]);

  // KPI calculations
  const totalVendors = vendors.length;
  const totalBalanceDue = useMemo(() => vendors.reduce((s, v) => s + (Number(v.balanceDue) || 0), 0), [vendors]);
  const totalInvoicesSum = useMemo(() => invoices.reduce((s, i) => s + (Number(i.total) || 0), 0), [invoices]);
  const totalPaidToVendors = useMemo(() => invoices.reduce((s, i) => s + (Number(i.paid) || 0), 0), [invoices]);

  const filteredVendors = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return vendors;
    return vendors.filter(v =>
      (v.name || '').toLowerCase().includes(q) ||
      (v.phone || '').includes(q) ||
      (v.category || '').toLowerCase().includes(q)
    );
  }, [vendors, search]);

  const handleSaveVendor = async (e) => {
    e.preventDefault();
    if (!vendorForm.name) return;
    setLoading(true);
    try {
      if (editVendor) {
        await updateVendor(editVendor.id, vendorForm);
      } else {
        await addVendor(vendorForm);
      }
      setVendorModal(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveInvoice = async (e) => {
    e.preventDefault();
    if (!invoiceForm.vendorId || !invoiceForm.total) return;
    const foundVendor = vendors.find(v => v.id === invoiceForm.vendorId);
    setLoading(true);
    try {
      await addVendorInvoice({
        ...invoiceForm,
        vendorName: foundVendor?.name || 'مورد'
      }, invoiceShiftId || null);
      setInvoiceModal(false);
      setInvoiceForm({ vendorId: '', invoiceNo: '', itemsSummary: '', total: '', paid: '', paymentMethod: 'cash' });
      setInvoiceShiftId('');
    } finally {
      setLoading(false);
    }
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!paymentModal || !payForm.amount) return;
    setLoading(true);
    try {
      await recordVendorPayment(paymentModal.id, {
        vendorName: paymentModal.name,
        amount: payForm.amount,
        paymentMethod: payForm.paymentMethod,
        notes: payForm.notes
      }, payShiftId || null);
      setPaymentModal(null);
      setPayForm({ amount: '', paymentMethod: 'cash', notes: '' });
      setPayShiftId('');
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = () => {
    const headers = ['#', 'اسم المورد', 'التصنيف', 'الموبايل', 'العنوان', 'المديونية المستحقة (ج.م)', 'ملاحظات'];
    const rows = filteredVendors.map((v, i) => [
      i + 1,
      v.name,
      v.category,
      v.phone || '—',
      v.address || '—',
      Number(v.balanceDue || 0),
      v.notes || '—'
    ]);
    exportToExcel("سجل_الموردين_والمشتريات", headers, rows);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ color: '#ffffff', fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🚚</span> إدارة الموردين والمشتريات والديون الآجلة
          </h2>
          <p style={{ color: '#93c5fd', fontSize: 13, margin: '4px 0 0' }}>
            متابعة حسابات الموردين وفواتير المشتريات والمدفوعات والديون المستحقة
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button size="sm" onClick={handleExportExcel} style={{ background: 'linear-gradient(135deg, #059669, #10b981)', color: '#fff', fontWeight: 800 }}>
            📥 تصدير Excel
          </Button>
          <Button size="sm" onClick={() => { setInvoiceModal(true); }} style={{ background: 'linear-gradient(135deg, #d97706, #f59e0b)', color: '#fff', fontWeight: 800 }}>
            🧾 تسجيل فاتورة مشتريات
          </Button>
          <Button size="sm" variant="primary" onClick={() => { setEditVendor(null); setVendorForm({ name: '', category: 'كافيه وبن ومشروبات', phone: '', address: '', notes: '', openingBalance: '' }); setVendorModal(true); }}>
            + إضافة مورد جديد
          </Button>
        </div>
      </div>

      {/* KPI Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        <StatCard icon="🚚" label="إجمالي الموردين المسجلين" value={totalVendors} color="blue" />
        <StatCard icon="⚠️" label="إجمالي الديون الآجلة للموردين" value={formatCurrency(totalBalanceDue)} color={totalBalanceDue > 0 ? "red" : "green"} />
        <StatCard icon="🧾" label="إجمالي فواتير المشتريات" value={formatCurrency(totalInvoicesSum)} color="purple" />
        <StatCard icon="💰" label="إجمالي المسدد للموردين" value={formatCurrency(totalPaidToVendors)} color="green" />
      </div>

      {/* Sub Tabs Toggle */}
      <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
        <button
          onClick={() => setActiveSubTab('vendors')}
          style={{
            background: activeSubTab === 'vendors' ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
            color: activeSubTab === 'vendors' ? '#60a5fa' : '#94a3b8',
            border: activeSubTab === 'vendors' ? '1px solid #3b82f6' : '1px solid transparent',
            padding: '8px 18px', borderRadius: 10, fontWeight: 800, cursor: 'pointer', fontFamily: 'Cairo, sans-serif'
          }}
        >
          👥 قائمة الموردين والحسابات ({vendors.length})
        </button>
        <button
          onClick={() => setActiveSubTab('invoices')}
          style={{
            background: activeSubTab === 'invoices' ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
            color: activeSubTab === 'invoices' ? '#60a5fa' : '#94a3b8',
            border: activeSubTab === 'invoices' ? '1px solid #3b82f6' : '1px solid transparent',
            padding: '8px 18px', borderRadius: 10, fontWeight: 800, cursor: 'pointer', fontFamily: 'Cairo, sans-serif'
          }}
        >
          📋 سجل فواتير المشتريات ({invoices.length})
        </button>
      </div>

      {activeSubTab === 'vendors' ? (
        <>
          <div style={{ maxWidth: 360 }}>
            <Input
              placeholder="🔍 بحث باسم المورد أو الهاتف..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {filteredVendors.length === 0 ? <EmptyState icon="🚚" message="لا يوجد موردون مسجلون" /> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 16 }}>
              {filteredVendors.map(v => (
                <Card key={v.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h3 style={{ color: '#ffffff', fontWeight: 800, fontSize: 16, margin: 0 }}>{v.name}</h3>
                      <p style={{ color: '#93c5fd', fontSize: 12, margin: '2px 0 0' }}>🏷️ {v.category}</p>
                    </div>
                    <Badge color={Number(v.balanceDue) > 0 ? "red" : "green"}>
                      {Number(v.balanceDue) > 0 ? "⚠️ مديونية معلقة" : "خالص ✅"}
                    </Badge>
                  </div>

                  {v.phone && <p style={{ color: '#cbd5e1', fontSize: 13, margin: 0 }}>📞 {v.phone}</p>}
                  {v.address && <p style={{ color: '#94a3b8', fontSize: 12, margin: 0 }}>📍 {v.address}</p>}

                  <div style={{
                    background: Number(v.balanceDue) > 0 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                    border: Number(v.balanceDue) > 0 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
                    padding: '8px 12px', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}>
                    <span style={{ fontSize: 12, color: Number(v.balanceDue) > 0 ? '#fca5a5' : '#a7f3d0' }}>المتبقي له بذمتنا:</span>
                    <strong style={{ fontSize: 16, color: Number(v.balanceDue) > 0 ? '#f87171' : '#34d399' }}>{formatCurrency(v.balanceDue || 0)}</strong>
                  </div>

                  <div style={{ display: 'flex', gap: 6, marginTop: 'auto', borderTop: '1px solid var(--border)', paddingTop: 10, flexWrap: 'wrap' }}>
                    {Number(v.balanceDue) > 0 && (
                      <Button size="sm" variant="success" onClick={() => { setPaymentModal(v); setPayForm({ amount: String(v.balanceDue), paymentMethod: 'cash', notes: '' }); }} style={{ flex: 1 }}>
                        💵 سداد دفعة
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => { setEditVendor(v); setVendorForm(v); setVendorModal(true); }}>تعديل</Button>
                    <Button size="sm" variant="danger" onClick={() => setDeleteVendorId(v.id)}>حذف</Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        /* Invoices List */
        <Card style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: 0, overflow: 'hidden' }}>
          {invoices.length === 0 ? <EmptyState icon="🧾" message="لا توجد فواتير مشتريات مسجلة بعد" /> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid var(--border)', color: '#94a3b8' }}>
                    <th style={{ padding: '12px' }}>رقم الفاتورة</th>
                    <th style={{ padding: '12px' }}>المورد</th>
                    <th style={{ padding: '12px' }}>البيان والأصناف</th>
                    <th style={{ padding: '12px' }}>إجمالي الفاتورة</th>
                    <th style={{ padding: '12px' }}>المسدد فورياً</th>
                    <th style={{ padding: '12px' }}>المتبقي الآجل</th>
                    <th style={{ padding: '12px' }}>التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '12px', color: '#60a5fa', fontWeight: 700 }}>{inv.invoiceNo || '—'}</td>
                      <td style={{ padding: '12px', color: '#ffffff', fontWeight: 800 }}>{inv.vendorName}</td>
                      <td style={{ padding: '12px', color: '#cbd5e1' }}>{inv.itemsSummary || '—'}</td>
                      <td style={{ padding: '12px', color: '#38bdf8', fontWeight: 800 }}>{formatCurrency(inv.total)}</td>
                      <td style={{ padding: '12px', color: '#34d399', fontWeight: 700 }}>{formatCurrency(inv.paid)}</td>
                      <td style={{ padding: '12px', color: Number(inv.remaining) > 0 ? '#f87171' : '#a7f3d0', fontWeight: 800 }}>
                        {Number(inv.remaining) > 0 ? formatCurrency(inv.remaining) : 'مسددة بالكامل ✅'}
                      </td>
                      <td style={{ padding: '12px', color: '#94a3b8', fontSize: 12 }}>
                        {inv.date ? formatDate(inv.date) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Add / Edit Vendor Modal */}
      <Modal open={vendorModal} onClose={() => setVendorModal(false)} title={editVendor ? 'تعديل بيانات مورد' : 'إضافة مورد جديد'} size="md">
        <form onSubmit={handleSaveVendor} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input label="اسم المورد / الشركة" value={vendorForm.name} onChange={e => setVendorForm({ ...vendorForm, name: e.target.value })} required />
            <div>
              <label style={{ display: 'block', color: '#c8dcf5', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>التصنيف والنشاط:</label>
              <select
                value={vendorForm.category}
                onChange={e => setVendorForm({ ...vendorForm, category: e.target.value })}
                style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', color: '#fff', fontSize: 13 }}
              >
                {VENDOR_CATEGORIES.map(c => <option key={c} value={c} style={{ background: '#0a162b', color: '#fff' }}>{c}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input label="رقم الموبايل / الهاتف" value={vendorForm.phone} onChange={e => setVendorForm({ ...vendorForm, phone: e.target.value })} />
            <Input label="العنوان / المقر" value={vendorForm.address} onChange={e => setVendorForm({ ...vendorForm, address: e.target.value })} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: !editVendor ? '1fr 1fr' : '1fr', gap: 12 }}>
            {!editVendor && (
              <Input label="رصيد مديونية افتتاحي (إن وجد)" type="number" value={vendorForm.openingBalance} onChange={e => setVendorForm({ ...vendorForm, openingBalance: e.target.value })} placeholder="0" />
            )}
            <Input label="ملاحظات إضافية" value={vendorForm.notes} onChange={e => setVendorForm({ ...vendorForm, notes: e.target.value })} />
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <Button type="button" variant="ghost" onClick={() => setVendorModal(false)}>إلغاء</Button>
            <Button type="submit" variant="primary" disabled={loading}>حفظ المورد</Button>
          </div>
        </form>
      </Modal>

      {/* Record Invoice Modal */}
      <Modal open={invoiceModal} onClose={() => setInvoiceModal(false)} title="🧾 تسجيل فاتورة مشتريات من مورد" size="lg">
        <form onSubmit={handleSaveInvoice} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', color: '#c8dcf5', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>اختر المورد:</label>
              <select
                value={invoiceForm.vendorId}
                onChange={e => setInvoiceForm({ ...invoiceForm, vendorId: e.target.value })}
                required
                style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', color: '#fff', fontSize: 13 }}
              >
                <option value="" style={{ background: '#0a162b', color: '#fff' }}>-- اختر المورد --</option>
                {vendors.map(v => <option key={v.id} value={v.id} style={{ background: '#0a162b', color: '#fff' }}>{v.name} ({v.category})</option>)}
              </select>
            </div>
            <Input label="رقم الفاتورة الورقية (اختياري)" value={invoiceForm.invoiceNo} onChange={e => setInvoiceForm({ ...invoiceForm, invoiceNo: e.target.value })} placeholder="INV-001" />
          </div>

          <Input label="بيان المشتريات والأصناف" value={invoiceForm.itemsSummary} onChange={e => setInvoiceForm({ ...invoiceForm, itemsSummary: e.target.value })} placeholder="مثال: 5 كيلو بن + 2 كرتونة كبايات ورقية" required />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input label="إجمالي قيمة الفاتورة (ج.م)" type="number" value={invoiceForm.total} onChange={e => setInvoiceForm({ ...invoiceForm, total: e.target.value })} required />
            <Input label="المبلغ المسدد الآن (ج.م)" type="number" value={invoiceForm.paid} onChange={e => setInvoiceForm({ ...invoiceForm, paid: e.target.value })} placeholder="0" />
          </div>

          {Number(invoiceForm.paid) > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', color: '#c8dcf5', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>طريقة دفع المسدد:</label>
                <select
                  value={invoiceForm.paymentMethod}
                  onChange={e => setInvoiceForm({ ...invoiceForm, paymentMethod: e.target.value })}
                  style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', color: '#fff', fontSize: 13 }}
                >
                  <option value="cash" style={{ background: '#0a162b', color: '#fff' }}>💵 نقدي</option>
                  <option value="visa" style={{ background: '#0a162b', color: '#fff' }}>💳 فيزا / بنك</option>
                  <option value="instapay" style={{ background: '#0a162b', color: '#fff' }}>⚡ إنستاباي InstaPay</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', color: '#c8dcf5', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>خصم المدفوع من الخزينة / الوردية:</label>
                <select
                  value={invoiceShiftId}
                  onChange={e => setInvoiceShiftId(e.target.value)}
                  style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', color: '#fff', fontSize: 13 }}
                >
                  <option value="" style={{ background: '#0a162b', color: '#fff' }}>🏢 الخزينة الرئيسية (خارج الورديات)</option>
                  {openShifts.map(s => (
                    <option key={s.id} value={s.id} style={{ background: '#0a162b', color: '#fff' }}>
                      🟢 وردية نشطة: {s.employeeName || 'موظف'} ({s.branch || 'الفرع الرئيسي'})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <Button type="button" variant="ghost" onClick={() => setInvoiceModal(false)}>إلغاء</Button>
            <Button type="submit" variant="primary" disabled={loading}>حفظ الفاتورة وقيد الحساب</Button>
          </div>
        </form>
      </Modal>

      {/* Pay Vendor Modal */}
      <Modal open={!!paymentModal} onClose={() => setPaymentModal(null)} title={paymentModal ? ("سداد دفعة للمورد: " + paymentModal.name) : ""}>
        {paymentModal && (
          <form onSubmit={handleRecordPayment} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: 12, borderRadius: 10, border: '1px solid rgba(239, 68, 68, 0.25)', textAlign: 'center' }}>
              <span style={{ color: '#fca5a5', fontSize: 12 }}>الرصيد المستحق للمورد حالياً:</span>
              <strong style={{ color: '#f87171', fontSize: 20, display: 'block', marginTop: 2 }}>{formatCurrency(paymentModal.balanceDue || 0)}</strong>
            </div>

            <Input label="المبلغ المراد سداده (ج.م)" type="number" value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} required />

            <div>
              <label style={{ display: 'block', color: '#c8dcf5', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>طريقة الدفع:</label>
              <select
                value={payForm.paymentMethod}
                onChange={e => setPayForm({ ...payForm, paymentMethod: e.target.value })}
                style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', color: '#fff' }}
              >
                <option value="cash" style={{ background: '#0a162b', color: '#fff' }}>💵 نقدي</option>
                <option value="visa" style={{ background: '#0a162b', color: '#fff' }}>💳 فيزا / بنك</option>
                <option value="instapay" style={{ background: '#0a162b', color: '#fff' }}>⚡ إنستاباي InstaPay</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', color: '#c8dcf5', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>الصرف من الخزينة / الوردية:</label>
              <select
                value={payShiftId}
                onChange={e => setPayShiftId(e.target.value)}
                style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', color: '#fff' }}
              >
                <option value="" style={{ background: '#0a162b', color: '#fff' }}>🏢 الخزينة الرئيسية (خارج الورديات)</option>
                {openShifts.map(s => (
                  <option key={s.id} value={s.id} style={{ background: '#0a162b', color: '#fff' }}>
                    🟢 وردية نشطة: {s.employeeName || 'موظف'} ({s.branch || 'الفرع الرئيسي'})
                  </option>
                ))}
              </select>
            </div>

            <Input label="ملاحظات السداد" value={payForm.notes} onChange={e => setPayForm({ ...payForm, notes: e.target.value })} placeholder="مثال: سداد دفعة عن فاتورة البن" />

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
              <Button type="button" variant="ghost" onClick={() => setPaymentModal(null)}>إلغاء</Button>
              <Button type="submit" variant="success" disabled={loading}>تأكيد صرف وسداد المبلغ</Button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteVendorId}
        onClose={() => setDeleteVendorId(null)}
        onConfirm={async () => { await deleteVendor(deleteVendorId); setDeleteVendorId(null); }}
        title="حذف المورد"
        message="هل أنت متأكد من حذف هذا المورد من السجلات؟"
      />
    </div>
  );
}
