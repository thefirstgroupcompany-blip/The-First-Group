import React, { useState } from 'react';
import { Modal, Button, Input } from './ui';
import { formatCurrency } from '../utils/constants';
import { recordYearEndClosing } from '../services/db';

export default function YearEndClosingModal({ isOpen, onClose, currentYearData }) {
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen || !currentYearData) return null;

  const { year = '', totalRevenue = 0, totalExpenses = 0, netProfit = 0, snapshot = {} } = currentYearData;

  const handleCloseYear = async (e) => {
    e.preventDefault();
    if (loading) return;
    if (!window.confirm("⚠️ تحذير: هل أنت متأكد من رغبتك في تقفيل وأرشفة السنة المالية (" + year + ")؟ سيتم حفظ أرصدة الإيرادات والمصروفات وصافي الأرباح في السجل التاريخي.")) return;

    setLoading(true);
    try {
      await recordYearEndClosing({
        year,
        totalRevenue,
        totalExpenses,
        netProfit,
        notes,
        summarySnapshot: snapshot || {}
      });
      alert("🎉 تم تقفيل وأرشفة السنة المالية (" + year + ") بنجاح!");
      onClose();
    } catch (err) {
      alert('حدث خطأ أثناء التقفيل: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={true} onClose={onClose} title={"📅 تقفيل وأرشفة السنة المالية (" + year + ")"} size="md">
      <form onSubmit={handleCloseYear} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: 'rgba(59, 130, 246, 0.12)', padding: 14, borderRadius: 12, border: '1px solid rgba(59, 130, 246, 0.3)' }}>
          <p style={{ color: '#93c5fd', fontSize: 13, margin: '0 0 10px' }}>
            تقفيل السنة المالية يقوم بأرشفة مؤشرات الأداء والأرباح والخسائر وحفظ ملخص سنوي كامل للحسابات.
          </p>

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed rgba(255,255,255,0.1)', fontSize: 13 }}>
            <span style={{ color: '#cbd5e1' }}>إجمالي إيرادات السنة:</span>
            <strong style={{ color: '#34d399' }}>{formatCurrency(totalRevenue)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed rgba(255,255,255,0.1)', fontSize: 13 }}>
            <span style={{ color: '#cbd5e1' }}>إجمالي مصروفات السنة:</span>
            <strong style={{ color: '#f87171' }}>{formatCurrency(totalExpenses)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 2px', fontSize: 14 }}>
            <span style={{ color: '#ffffff', fontWeight: 700 }}>صافي أرباح السنة:</span>
            <strong style={{ color: netProfit >= 0 ? '#34d399' : '#f87171', fontSize: 16 }}>{formatCurrency(netProfit)}</strong>
          </div>
        </div>

        <Input
          label="ملاحظات وتوصيات التقفيل السنوي"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="مثال: تم ترحيل أرباح السنة لحسابات الشركاء وتصفير العهد..."
        />

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
          <Button type="button" variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? 'جاري الأرشفة...' : '🔒 تأكيد تقفيل السنة المالية'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
