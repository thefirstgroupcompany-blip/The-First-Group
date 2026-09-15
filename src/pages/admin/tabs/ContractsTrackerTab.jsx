import React, { useState, useEffect, useMemo } from 'react';
import {
  getContracts, addContract, updateContract, deleteContract,
  recordContractPayment, getContractPayments, deleteContractPayment, getAllShifts
} from '../../../services/db';
import { Card, StatCard, EmptyState, Button, Input, Modal, Badge, ConfirmDialog } from '../../../components/ui';
import { formatCurrency, formatDate, formatDateTime } from '../../../utils/constants';

const CONTRACT_TYPES = [
  'إيجار مقر السنتر',
  'فاتورة الكهرباء والمياه',
  'اشتراك الإنترنت الفايبر',
  'عقد صيانة التكييفات',
  'عقد نظافة وخدمات',
  'أخرى'
];

export default function ContractsTrackerTab() {
  const [contracts, setContracts] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [contractPayments, setContractPayments] = useState([]);
  const [modal, setModal] = useState(false);
  const [editContract, setEditContract] = useState(null);
  const [form, setForm] = useState({
    title: '', type: 'إيجار مقر السنتر', partyName: '', phone: '',
    amount: '', dueDayOfMonth: '1', startDate: '', endDate: '', notes: ''
  });

  const [payModal, setPayModal] = useState(null);
  const [payForm, setPayForm] = useState({
    amount: '',
    month: new Date().toISOString().slice(0, 7),
    paymentMethod: 'cash',
    treasury: 'central', // 'central' | 'shift'
    notes: ''
  });

  const [deleteId, setDeleteId] = useState(null);
  const [deletePayId, setDeletePayId] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsubC = getContracts(setContracts);
    const unsubS = getAllShifts(setShifts);
    const unsubP = getContractPayments(setContractPayments);
    return () => { unsubC(); unsubS(); unsubP(); };
  }, []);

  const openShift = shifts.find(s => s.status === 'open');

  const totalMonthlyCommitments = useMemo(() => contracts.reduce((s, c) => s + (Number(c.amount) || 0), 0), [contracts]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (loading) return;
    if (!form.title || !form.amount) return;
    setLoading(true);
    try {
      if (editContract) {
        await updateContract(editContract.id, form);
      } else {
        await addContract(form);
      }
      setModal(false);
    } finally {
      setLoading(false);
    }
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (loading) return;
    if (!payModal || !payForm.amount) return;
    setLoading(true);
    try {
      const shiftIdToUse = payForm.treasury === 'shift' && openShift ? openShift.id : null;
      await recordContractPayment(payModal.id, {
        contractTitle: payModal.title,
        amount: payForm.amount,
        month: payForm.month,
        paymentMethod: payForm.paymentMethod,
        notes: payForm.notes
      }, shiftIdToUse);
      setPayModal(null);
      alert('✅ تم تسجيل سداد الالتزام وقيده كمصروف رسمي في الحسابات بنجاح!');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ color: '#ffffff', fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🏢</span> عقود الإيجار والالتزامات والمرافق الدورية
          </h2>
          <p style={{ color: '#93c5fd', fontSize: 13, margin: '4px 0 0' }}>
            تتبع مواعيد استحقاق إيجار المقر، فواتير الكهرباء، واشتراكات الإنترنت وسدادها
          </p>
        </div>

        <Button size="sm" variant="primary" onClick={() => { setEditContract(null); setForm({ title: '', type: 'إيجار مقر السنتر', partyName: '', phone: '', amount: '', dueDayOfMonth: '1', startDate: '', endDate: '', notes: '' }); setModal(true); }}>
          + إضافة عقد / التزام جديد
        </Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <StatCard icon="🏢" label="إجمالي العقود والالتزامات" value={contracts.length} color="blue" />
        <StatCard icon="💸" label="إجمالي الالتزامات الشهرية الثابتة" value={formatCurrency(totalMonthlyCommitments)} color="red" />
      </div>

      {contracts.length === 0 ? <EmptyState icon="🏢" message="لا توجد عقود أو التزامات مسجلة بعد" /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 16 }}>
          {contracts.map(c => (
            <Card key={c.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ color: '#ffffff', fontWeight: 800, fontSize: 16, margin: 0 }}>{c.title}</h3>
                  <p style={{ color: '#93c5fd', fontSize: 12, margin: '2px 0 0' }}>🏷️ {c.type}</p>
                </div>
                <Badge color="amber">يوم {c.dueDayOfMonth} شهرياً</Badge>
              </div>

              {c.partyName && <p style={{ color: '#cbd5e1', fontSize: 13, margin: 0 }}>👤 الطرف المستفيد: {c.partyName}</p>}
              {c.phone && <p style={{ color: '#94a3b8', fontSize: 12, margin: 0 }}>📞 {c.phone}</p>}

              <div style={{
                background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: 10, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <span style={{ fontSize: 12, color: '#fca5a5' }}>القيمة الشهرية:</span>
                <strong style={{ fontSize: 18, color: '#f87171', fontWeight: 900 }}>{formatCurrency(c.amount)}</strong>
              </div>

              {/* Paid Months history badges */}
              {(() => {
                const cPays = contractPayments.filter(cp => cp.contractId === c.id);
                if (cPays.length === 0) return null;
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: '#93c5fd', fontWeight: 600 }}>الأشهر المسددة مؤخراً:</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {cPays.slice(0, 3).map(p => (
                        <Badge key={p.id} color="green" style={{ fontSize: 11 }}>
                          ✓ {p.month} ({formatCurrency(p.amount)})
                        </Badge>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div style={{ display: 'flex', gap: 6, marginTop: 'auto', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <Button size="sm" variant="success" onClick={() => { setPayModal(c); setPayForm({ amount: String(c.amount), month: new Date().toISOString().slice(0, 7), paymentMethod: 'cash', treasury: openShift ? 'shift' : 'central', notes: '' }); }} style={{ flex: 1 }}>
                  💵 سداد الشهر
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditContract(c); setForm(c); setModal(true); }}>تعديل</Button>
                <Button size="sm" variant="danger" onClick={() => setDeleteId(c.id)}>حذف</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Contract Payments Ledger Table */}
      {contractPayments.length > 0 && (
        <Card style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', marginTop: 10 }}>
          <h3 style={{ color: '#ffffff', fontSize: 16, fontWeight: 800, margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>📑</span> سجل إيصالات سداد الالتزامات الدورية ({contractPayments.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
            {contractPayments.map(p => (
              <div key={p.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                padding: '10px 14px', borderRadius: 10, flexWrap: 'wrap', gap: 8
              }}>
                <div>
                  <strong style={{ color: '#ffffff', fontSize: 14 }}>{p.contractTitle}</strong>
                  <span style={{ color: '#93c5fd', fontSize: 12, marginRight: 8 }}>عن شهر: <strong>{p.month}</strong></span>
                  {p.shiftId && <Badge color="amber" style={{ marginRight: 6 }}>من درج المناوبة</Badge>}
                  {!p.shiftId && <Badge color="blue" style={{ marginRight: 6 }}>من الخزينة المركزية</Badge>}
                  {p.notes && <p style={{ color: '#94a3b8', fontSize: 12, margin: '2px 0 0' }}>{p.notes}</p>}
                  <p style={{ color: '#64748b', fontSize: 11, margin: '2px 0 0' }}>{p.date ? formatDateTime(p.date) : ''}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ color: '#f87171', fontWeight: 800, fontSize: 16 }}>{formatCurrency(p.amount)}</span>
                  <Button size="sm" variant="danger" onClick={() => setDeletePayId(p.id)} title="إلغاء السداد وعكس الأثر المالي">
                    🗑️
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editContract ? 'تعديل عقد / التزام' : 'إضافة عقد / التزام شهري جديد'}>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Input label="عنوان العقد / الالتزام" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="مثال: إيجار مقر السنتر الرئيسي" required />
          <div>
            <label style={{ display: 'block', color: '#c8dcf5', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>نوع الالتزام:</label>
            <select
              value={form.type}
              onChange={e => setForm({ ...form, type: e.target.value })}
              style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', color: '#fff' }}
            >
              {CONTRACT_TYPES.map(t => <option key={t} value={t} style={{ background: '#0a162b', color: '#fff' }}>{t}</option>)}
            </select>
          </div>
          <Input label="القيمة المستحقة شهرياً (ج.م)" type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required />
          <Input label="يوم الاستحقاق في الشهر (1 - 31)" type="number" min="1" max="31" value={form.dueDayOfMonth} onChange={e => setForm({ ...form, dueDayOfMonth: e.target.value })} required />
          <Input label="الطرف المستحق / المؤجر" value={form.partyName} onChange={e => setForm({ ...form, partyName: e.target.value })} placeholder="اسم المالك أو الشركة" />
          <Input label="رقم الهاتف للتواصل" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          <Input label="ملاحظات" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <Button type="button" variant="ghost" onClick={() => setModal(false)}>إلغاء</Button>
            <Button type="submit" variant="primary" disabled={loading}>حفظ الالتزام</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!payModal} onClose={() => setPayModal(null)} title={payModal ? ("سداد التزام: " + payModal.title) : ""}>
        {payModal && (
          <form onSubmit={handleRecordPayment} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Input label="المبلغ المسدد (ج.م)" type="number" value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} required />
            <Input label="عن شهر (السنة-الشهر)" type="month" value={payForm.month} onChange={e => setPayForm({ ...payForm, month: e.target.value })} required />

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
              <label style={{ display: 'block', color: '#c8dcf5', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>جهة السداد والخصم:</label>
              <select
                value={payForm.treasury}
                onChange={e => setPayForm({ ...payForm, treasury: e.target.value })}
                style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', color: '#fff' }}
              >
                <option value="central" style={{ background: '#0a162b', color: '#fff' }}>🏦 الخزينة المركزية للإدارة (سداد مباشر)</option>
                {openShift ? (
                  <option value="shift" style={{ background: '#0a162b', color: '#fff' }}>🚪 من درج الوردية المفتوحة ({openShift.employeeName})</option>
                ) : (
                  <option value="shift" disabled style={{ background: '#0a162b', color: '#64748b' }}>🚪 درج الوردية (لا توجد مناوبة مفتوحة الآن)</option>
                )}
              </select>
            </div>

            <Input label="ملاحظات" value={payForm.notes} onChange={e => setPayForm({ ...payForm, notes: e.target.value })} placeholder="مثال: سداد إيجار شهر سبتمبر" />

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
              <Button type="button" variant="ghost" onClick={() => setPayModal(null)}>إلغاء</Button>
              <Button type="submit" variant="success" disabled={loading}>تأكيد صرف وسداد المبلغ</Button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={async () => {
          if (loading) return;
          setLoading(true);
          try {
            await deleteContract(deleteId);
            setDeleteId(null);
          } finally {
            setLoading(false);
          }
        }}
        title="حذف العقد"
        message="هل أنت متأكد من حذف هذا العقد / الالتزام من السجلات؟"
      />

      <ConfirmDialog
        open={!!deletePayId}
        onClose={() => setDeletePayId(null)}
        onConfirm={async () => {
          if (loading) return;
          setLoading(true);
          try {
            await deleteContractPayment(deletePayId);
            setDeletePayId(null);
          } finally {
            setLoading(false);
          }
        }}
        title="إلغاء سداد الالتزام"
        message="هل أنت متأكد من إلغاء سداد هذا القسط؟ سيتم حذف الإيصال وعكس الأثر المالي تلقائياً."
      />
    </div>
  );
}
