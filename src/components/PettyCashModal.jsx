import React, { useState, useEffect } from 'react';
import { Modal, Button, Input } from './ui';
import { formatCurrency, formatDateTime } from '../utils/constants';
import { getPettyCashFunds, recordPettyCashMovement } from '../services/db';

export default function PettyCashModal({ isOpen, onClose }) {
  const [movements, setMovements] = useState([]);
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('deposit');
  const [custodian, setCustodian] = useState('المدير المالي');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      return getPettyCashFunds(setMovements);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentFloatBalance = movements.reduce((s, m) => {
    return s + (m.type === 'deposit' ? (Number(m.amount) || 0) : -(Number(m.amount) || 0));
  }, 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || !reason) return;
    setLoading(true);
    try {
      await recordPettyCashMovement({
        type,
        amount,
        custodian,
        reason
      });
      setAmount('');
      setReason('');
      alert('✅ تم قيد حركة العهدة النقدية بنجاح!');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={true} onClose={onClose} title="🏦 إدارة العهدة النقدية الثابتة وخزينة الطوارئ (Petty Cash Float)" size="lg">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(15, 32, 64, 0.95) 100%)',
          border: '1px solid rgba(16, 185, 129, 0.35)', borderRadius: 12, padding: '16px 20px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div>
            <span style={{ color: '#a7f3d0', fontSize: 13, fontWeight: 700 }}>الرصيد المتبقي بالعهدة الثابتة (خزينة الإدارة):</span>
            <p style={{ color: '#93c5fd', fontSize: 12, margin: '2px 0 0' }}>مستقلة تماماً عن نقدية دروج الكاشير اليومية</p>
          </div>
          <strong style={{ color: '#34d399', fontSize: 26, fontWeight: 900 }}>{formatCurrency(currentFloatBalance)}</strong>
        </div>

        <form onSubmit={handleSubmit} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h4 style={{ color: '#ffffff', fontSize: 14, fontWeight: 800, margin: 0 }}>➕ تسجيل حركة عهدة جديدة</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ display: 'block', color: '#c8dcf5', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>نوع الحركة:</label>
              <select
                value={type}
                onChange={e => setType(e.target.value)}
                style={{ width: '100%', background: '#0a162b', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', color: '#fff' }}
              >
                <option value="deposit">➕ تغذية وزيادة العهدة (إيداع)</option>
                <option value="withdrawal">➖ صرف من العهدة للطوارئ</option>
              </select>
            </div>
            <Input label="المبلغ (ج.م)" type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} required />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Input label="المسؤول عن العهدة" value={custodian} onChange={e => setCustodian(e.target.value)} required />
            <Input label="السبب والبيان" value={reason} onChange={e => setReason(e.target.value)} placeholder="مثال: شراء مستلزمات طارئة للمقر" required />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
            <Button type="submit" variant="primary" disabled={loading}>حفظ الحركة</Button>
          </div>
        </form>

        <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.05)', color: '#94a3b8' }}>
                <th style={{ padding: '8px 10px' }}>النوع</th>
                <th style={{ padding: '8px 10px' }}>المبلغ</th>
                <th style={{ padding: '8px 10px' }}>البيان</th>
                <th style={{ padding: '8px 10px' }}>المسؤول</th>
                <th style={{ padding: '8px 10px' }}>التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {movements.map(m => (
                <tr key={m.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '8px 10px', color: m.type === 'deposit' ? '#34d399' : '#f87171', fontWeight: 700 }}>
                    {m.type === 'deposit' ? '➕ إيداع' : '➖ صرف'}
                  </td>
                  <td style={{ padding: '8px 10px', fontWeight: 800, color: '#fff' }}>{formatCurrency(m.amount)}</td>
                  <td style={{ padding: '8px 10px', color: '#cbd5e1' }}>{m.reason}</td>
                  <td style={{ padding: '8px 10px', color: '#93c5fd' }}>{m.custodian}</td>
                  <td style={{ padding: '8px 10px', color: '#64748b' }}>{m.date ? formatDateTime(m.date) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
