import React, { useState } from 'react';
import { Modal, Button, Input } from './ui';
import { logCafeWaste } from '../services/db';

export default function CafeWasteModal({ isOpen, onClose, inventory = [], baristaName = 'كاشير الكافيه' }) {
  const [selectedItemId, setSelectedItemId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('سكب / تلف أثناء التحضير');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const selectedItem = inventory.find(i => i.id === selectedItemId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedItemId || !quantity) return;
    setLoading(true);
    try {
      await logCafeWaste({
        itemId: selectedItemId,
        itemName: selectedItem?.name || '',
        quantity: Number(quantity) || 1,
        costPrice: Number(selectedItem?.costPrice) || 0,
        reason,
        reportedBy: baristaName
      });
      alert('✅ تم قيد الهالك وخصم الكمية من المخزون بنجاح!');
      onClose();
    } catch (err) {
      alert('حدث خطأ: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={true} onClose={onClose} title="🗑️ تسجيل هالك وتوالف TFG | CAFE (Wastage Log)" size="md">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: 12, borderRadius: 10, color: '#fca5a5', fontSize: 13 }}>
          يتم خصم كمية الهالك من المخزن وتوثيق تكلفتها كخسارة منفصلة لضبط دقة الجرد.
        </div>

        <div>
          <label style={{ display: 'block', color: '#c8dcf5', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>اختر الصنف التالف / المسكوب:</label>
          <select
            value={selectedItemId}
            onChange={e => setSelectedItemId(e.target.value)}
            required
            style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', color: '#fff' }}
          >
            <option value="" style={{ background: '#0a162b', color: '#94a3b8' }}>-- اختر الصنف من المخزون --</option>
            {inventory.map(i => (
              <option key={i.id} value={i.id} style={{ background: '#0a162b', color: '#fff' }}>
                {i.name} (متبقي: {i.quantity || 0})
              </option>
            ))}
          </select>
        </div>

        <Input label="الكمية التالفة" type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} required />

        <div>
          <label style={{ display: 'block', color: '#c8dcf5', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>سبب التلف والهالك:</label>
          <select
            value={reason}
            onChange={e => setReason(e.target.value)}
            style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', color: '#fff' }}
          >
            <option value="سكب / خطأ أثناء تحضير الأوردر" style={{ background: '#0a162b', color: '#fff' }}>سكب / خطأ أثناء تحضير الأوردر</option>
            <option value="انتهاء صلاحية / تلف بضاعة" style={{ background: '#0a162b', color: '#fff' }}>انتهاء صلاحية / تلف بضاعة</option>
            <option value="كسر في الأكواب أو الزجاج" style={{ background: '#0a162b', color: '#fff' }}>كسر في الأكواب أو الزجاج</option>
            <option value="أخرى" style={{ background: '#0a162b', color: '#fff' }}>أخرى</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
          <Button type="button" variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button type="submit" variant="danger" disabled={loading}>
            {loading ? 'جاري القيد...' : '🗑️ تأكيد تسجيل الهالك'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
