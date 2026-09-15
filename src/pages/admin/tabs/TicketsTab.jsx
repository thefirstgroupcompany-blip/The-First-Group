import React, { useState, useEffect } from 'react';
import { getTickets, addTicket, updateTicket, deleteTicket, sellTicket, getTicketSales, deleteTicketSale } from '../../../services/db';
import { Card, Button, Input, Modal, ConfirmDialog, EmptyState, Badge } from '../../../components/ui';
import { formatCurrency, formatDateTime } from '../../../utils/constants';
import { useAuth } from '../../../contexts/AuthContext';

export default function TicketsTab({ shiftId, employeeId, isEmployee = false }) {
  const { user } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [modal, setModal] = useState(false);
  const [editTicket, setEditTicket] = useState(null);
  const [form, setForm] = useState({ name: '', price: '', description: '' });
  const [deleteId, setDeleteId] = useState(null);

  // Sell Modal State
  const [sellModal, setSellModal] = useState(null);
  const [quantity, setQuantity] = useState('1');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [soldMsg, setSoldMsg] = useState('');
  
  const [historyModal, setHistoryModal] = useState(false);
  const [ticketSales, setTicketSales] = useState([]);
  const [deleteSaleId, setDeleteSaleId] = useState(null);

  useEffect(() => { return getTickets(setTickets); }, []);
  
  useEffect(() => {
    if (historyModal) {
      const unsub = getTicketSales(setTicketSales);
      return unsub;
    } else {
      setTicketSales([]);
    }
  }, [historyModal]);

  const openAdd = () => { setEditTicket(null); setForm({ name: '', price: '', description: '' }); setModal(true); };
  const openEdit = (t) => { setEditTicket(t); setForm({ name: t.name, price: t.price, description: t.description || '' }); setModal(true); };

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editTicket) await updateTicket(editTicket.id, { ...form, price: Number(form.price) });
      else await addTicket(form);
      setModal(false);
    } catch (err) {
      alert('حدث خطأ أثناء حفظ فئة التذكرة: ' + (err.message || ''));
    } finally { setLoading(false); }
  };

  const handleSell = async (e) => {
    e.preventDefault();
    if (!sellModal || !quantity) return;
    const isCash = !paymentMethod || paymentMethod === 'cash' || paymentMethod === 'نقدي';
    if (isCash && !shiftId) {
      return alert('⚠️ تنبيه أمان مالي صارم: لا يمكن بيع التذاكر نقداً لعدم وجود مناوبة مفتوحة! يُرجى فتح مناوبة أولاً لتسجيل النقدية بالدرج.');
    }
    setLoading(true);
    try {
      const totalAmount = Number(sellModal.price) * Number(quantity);
      await sellTicket(
        sellModal.id,
        sellModal.name,
        sellModal.price,
        shiftId || null,
        employeeId || null,
        quantity,
        paymentMethod,
        buyerName,
        buyerPhone
      );
      setSoldMsg("✅ تم بيع " + quantity + " تذكرة (" + sellModal.name + ") بإجمالي " + formatCurrency(totalAmount) + " [" + (paymentMethod === 'cash' ? 'نقدي 💵' : paymentMethod === 'visa' ? 'فيزا 💳' : paymentMethod === 'vodafone_cash' ? 'فودافون كاش 📱' : 'إنستاباي ⚡') + "]");
      setQuantity('1');
      setBuyerName('');
      setBuyerPhone('');
      setPaymentMethod('cash');
      setSellModal(null);
    } catch (err) {
      alert('حدث خطأ أثناء بيع التذكرة: ' + (err.message || ''));
    } finally { setLoading(false); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ color: '#ffffff', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
            <span>🎟️</span> تذاكر الدخول اليومي والأنشطة الفردية
          </h2>
          <p style={{ color: '#93c5fd', fontSize: 13, margin: '4px 0 0' }}>
            بيع تذاكر Day Pass والأنشطة والخدمات السريعة مع اختيار طريقة الدفع
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={() => setHistoryModal(true)} variant="outline">📋 سجل مبيعات التذاكر</Button>
          {!isEmployee && (
            <Button onClick={openAdd} variant="primary">+ إضافة فئة تذاكر جديدة</Button>
          )}
        </div>
      </div>

      {isEmployee && !shiftId && (
        <div style={{
          marginBottom: 16, padding: '14px 18px', borderRadius: 12,
          background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.3)',
          color: '#fcd34d', fontSize: 14, fontWeight: 600,
        }}>
          ⚠️ يجب فتح مناوبة أولاً لبيع التذاكر وتسجيل الإيراد في درج النقدية
        </div>
      )}

      {soldMsg && (
        <div style={{
          marginBottom: 16, padding: '12px 18px', borderRadius: 12,
          background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)',
          color: '#6ee7b7', fontSize: 14, fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <span>{soldMsg}</span>
          <button onClick={() => setSoldMsg('')} style={{ background: 'none', border: 'none', color: '#6ee7b7', fontSize: 20, cursor: 'pointer' }}>&times;</button>
        </div>
      )}

      {tickets.length === 0 ? <EmptyState icon="🎫" message="لا توجد فئات تذاكر مضافة بعد" /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: 16 }}>
          {tickets.map(ticket => (
            <Card key={ticket.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <h3 style={{ color: '#ffffff', fontWeight: 800, fontSize: 17 }}>{ticket.name}</h3>
                <Badge color="purple">تذكرة 🎫</Badge>
              </div>

              {ticket.description && (
                <p style={{ color: '#93c5fd', fontSize: 13 }}>{ticket.description}</p>
              )}

              <p style={{ color: '#c4b5fd', fontSize: 24, fontWeight: 900 }}>{formatCurrency(ticket.price)}</p>

              <div style={{ display: 'flex', gap: 8, marginTop: 'auto', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <Button size="sm" variant="primary" onClick={() => { setSellModal(ticket); setQuantity('1'); setPaymentMethod('cash'); }} disabled={isEmployee && !shiftId} style={{ flex: 1 }}>
                  🎫 بيع الآن
                </Button>
                {!isEmployee && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(ticket)}>تعديل</Button>
                    <Button size="sm" variant="danger" onClick={() => setDeleteId(ticket.id)}>حذف</Button>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Sell Modal with Payment Method & Buyer Info */}
      <Modal open={!!sellModal} onClose={() => setSellModal(null)} title={sellModal ? ("بيع تذكرة: " + sellModal.name) : ""} size="md">
        {sellModal && (
          <form onSubmit={handleSell} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: 'rgba(56, 189, 248, 0.1)', padding: 10, borderRadius: 10, border: '1px solid rgba(56, 189, 248, 0.25)', textAlign: 'center' }}>
              <span style={{ color: '#93c5fd', fontSize: 12 }}>سعر التذكرة الفردية:</span>
              <strong style={{ color: '#38bdf8', fontSize: 18, display: 'block', marginTop: 2 }}>{formatCurrency(sellModal.price)}</strong>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ display: 'block', color: '#c8dcf5', fontSize: 12.5, fontWeight: 700, marginBottom: 5 }}>
                  🔢 عدد التذاكر المطلوبة:
                </label>
                <Input
                  type="number"
                  min="1"
                  max="50"
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', color: '#c8dcf5', fontSize: 12.5, fontWeight: 700, marginBottom: 5 }}>
                  💳 طريقة الدفع:
                </label>
                <select
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value)}
                  style={{
                    width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)',
                    borderRadius: 10, padding: '10px 12px', color: '#ffffff', fontSize: 13, outline: 'none'
                  }}
                >
                  <option value="cash" style={{ background: '#0a162b', color: '#fff' }}>💵 نقدي (كاش في الدرج)</option>
                  <option value="visa" style={{ background: '#0a162b', color: '#fff' }}>💳 فيزا / بطاقة بنكية</option>
                  <option value="instapay" style={{ background: '#0a162b', color: '#fff' }}>⚡ تطبيق إنستاباي InstaPay</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ display: 'block', color: '#c8dcf5', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  اسم العميل (اختياري):
                </label>
                <Input
                  placeholder="اسم العميل..."
                  value={buyerName}
                  onChange={e => setBuyerName(e.target.value)}
                />
              </div>
              <div>
                <label style={{ display: 'block', color: '#c8dcf5', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  رقم الموبايل (اختياري):
                </label>
                <Input
                  placeholder="010xxxxxxxx"
                  value={buyerPhone}
                  onChange={e => setBuyerPhone(e.target.value)}
                />
              </div>
            </div>

            <div style={{
              background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: 12, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <span style={{ color: '#a7f3d0', fontSize: 13, fontWeight: 700 }}>المبلغ المطلوب تحصيله:</span>
              <strong style={{ color: '#34d399', fontSize: 18, fontWeight: 900 }}>
                {formatCurrency((Number(sellModal.price) || 0) * (Number(quantity) || 1))}
              </strong>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
              <Button type="button" variant="ghost" onClick={() => setSellModal(null)}>إلغاء</Button>
              <Button type="submit" variant="primary" disabled={loading}>
                {loading ? 'جاري التحصيل...' : '✅ تأكيد التحصيل وطباعة/حفظ'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Add/Edit Ticket Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editTicket ? 'تعديل فئة تذاكر' : 'إضافة فئة تذاكر جديدة'}>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Input label="اسم الفئة / التذكرة" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
          <Input label="سعر التذكرة (ج.م)" type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} required />
          <Input label="الوصف والمميزات" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <Button type="button" variant="ghost" onClick={() => setModal(false)}>إلغاء</Button>
            <Button type="submit" variant="primary" disabled={loading}>حفظ التذكرة</Button>
          </div>
        </form>
      </Modal>

      {/* Sales History Modal */}
      <Modal open={historyModal} onClose={() => setHistoryModal(false)} title="📋 سجل مبيعات التذاكر والأنشطة" size="lg">
        <div>
          {ticketSales.length === 0 ? <EmptyState icon="🎟️" message="لا توجد مبيعات تذاكر سابقة" /> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: '#94a3b8' }}>
                  <th style={{ padding: '10px' }}>التذكرة</th>
                  <th style={{ padding: '10px' }}>العدد</th>
                  <th style={{ padding: '10px' }}>الإجمالي</th>
                  <th style={{ padding: '10px' }}>طريقة الدفع</th>
                  <th style={{ padding: '10px' }}>العميل</th>
                  <th style={{ padding: '10px' }}>التاريخ</th>
                  {!isEmployee && <th style={{ padding: '10px' }}>حذف</th>}
                </tr>
              </thead>
              <tbody>
                {ticketSales.map(s => (
                  <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '10px', color: '#fff', fontWeight: 700 }}>{s.ticketName}</td>
                    <td style={{ padding: '10px', color: '#93c5fd' }}>{s.quantity}</td>
                    <td style={{ padding: '10px', color: '#34d399', fontWeight: 800 }}>{formatCurrency(s.total)}</td>
                    <td style={{ padding: '10px' }}>
                      <span style={{ fontSize: 12, color: '#bae6fd' }}>
                        {s.paymentMethod === 'cash' ? '💵 نقدي' : s.paymentMethod === 'visa' ? '💳 فيزا' : s.paymentMethod === 'vodafone_cash' ? '📱 فودافون كاش' : '⚡ إنستاباي'}
                      </span>
                    </td>
                    <td style={{ padding: '10px', color: '#cbd5e1' }}>{s.buyerName || '—'}</td>
                    <td style={{ padding: '10px', color: '#94a3b8', fontSize: 12 }}>
                      {s.date ? formatDateTime(s.date) : '—'}
                    </td>
                    {!isEmployee && (
                      <td style={{ padding: '10px' }}>
                        <Button size="sm" variant="danger" onClick={() => setDeleteSaleId(s.id)}>حذف</Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={async () => {
          try {
            await deleteTicket(deleteId);
          } catch (err) {
            alert('حدث خطأ أثناء حذف التذكرة: ' + (err.message || ''));
          } finally {
            setDeleteId(null);
          }
        }}
        title="حذف فئة التذاكر"
        message="هل أنت متأكد من حذف فئة التذاكر هذه؟"
      />

      <ConfirmDialog
        open={!!deleteSaleId}
        onClose={() => setDeleteSaleId(null)}
        onConfirm={async () => {
          try {
            await deleteTicketSale(deleteSaleId);
          } catch (err) {
            alert('حدث خطأ أثناء حذف حركة البيع: ' + (err.message || ''));
          } finally {
            setDeleteSaleId(null);
          }
        }}
        title="حذف حركة بيع تذكرة"
        message="هل أنت متأكد من حذف حركة البيع هذه؟ سيتم خصم قيمتها من إجمالي المناوبة والدرج."
      />
    </div>
  );
}
