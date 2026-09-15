import React from 'react';
import { Modal, Button } from './ui';
import { formatCurrency } from '../utils/constants';
import { exportToExcel } from '../utils/excelExport';

export default function TrialBalanceModal({ isOpen, onClose, data }) {
  if (!isOpen || !data) return null;

  const {
    month = '',
    totalAssetsValue = 0,
    totalDebtsOnClients = 0,
    pettyCashBalance = 0,
    totalDueToVendors = 0,
    initialCapital = 0,
    totalRevenue = 0,
    totalExpenses = 0,
    totalSalaries = 0,
    netProfit = 0
  } = data;

  const handlePrint = () => {
    window.print();
  };

  // Accounting accounts compilation
  const accounts = [
    {
      id: 1,
      name: 'أصول ومعدات المركز الثابتة (Fixed Assets)',
      debit: Number(totalAssetsValue) || 0,
      credit: 0,
      category: 'أصول ثابتة',
      type: 'asset'
    },
    {
      id: 2,
      name: 'مديونيات المشتركين المعلقة (Accounts Receivable)',
      debit: Number(totalDebtsOnClients) || 0,
      credit: 0,
      category: 'أصول متداولة',
      type: 'asset'
    },
    {
      id: 3,
      name: 'النقدية والعهدة المركزية (Petty Cash & Float)',
      debit: (Number(pettyCashBalance) || 0) >= 0 ? (Number(pettyCashBalance) || 0) : 0,
      credit: (Number(pettyCashBalance) || 0) < 0 ? Math.abs(Number(pettyCashBalance) || 0) : 0,
      category: 'أصول متداولة ونقدية',
      type: 'asset'
    },
    {
      id: 4,
      name: 'مستحقات الموردين الآجلة (Accounts Payable)',
      debit: 0,
      credit: Number(totalDueToVendors) || 0,
      category: 'خصوم والتزامات',
      type: 'liability'
    },
    {
      id: 5,
      name: 'رأس المال التأسيسي وحقوق الشركاء (Capital & Equity)',
      debit: 0,
      credit: Number(initialCapital) || 0,
      category: 'حقوق ملكية',
      type: 'equity'
    },
    {
      id: 6,
      name: 'إجمالي الإيرادات المحققة (Total Operating Revenues)',
      debit: 0,
      credit: Number(totalRevenue) || 0,
      category: 'إيرادات تشغيلية',
      type: 'revenue'
    },
    {
      id: 7,
      name: 'المصروفات التشغيلية والنثريات (Operating Expenses)',
      debit: Number(totalExpenses) || 0,
      credit: 0,
      category: 'مصروفات تشغيلية',
      type: 'expense'
    },
    {
      id: 8,
      name: 'المرتبات والأجور الشهرية (Payroll Expenses)',
      debit: Number(totalSalaries) || 0,
      credit: 0,
      category: 'مصروفات إدارية',
      type: 'expense'
    }
  ];

  const totalDebit = accounts.reduce((s, a) => s + a.debit, 0);
  const totalCredit = accounts.reduce((s, a) => s + a.credit, 0);
  const diff = Math.abs(totalDebit - totalCredit);
  const isBalanced = diff < 0.01;

  const handleExportExcel = () => {
    const headers = ['#', 'الحساب المالي / البيان', 'المدين (Debit)', 'الدائن (Credit)', 'التصنيف المحاسبي'];
    const rows = accounts.map(a => [
      a.id,
      a.name,
      a.debit,
      a.credit,
      a.category
    ]);
    rows.push(['—', 'إجمالي ميزان المراجعة', totalDebit, totalCredit, isBalanced ? 'متزن ✅' : `فارق: ${diff} ج.م ⚠️`]);
    exportToExcel("ميزان_المراجعة_" + month, headers, rows);
  };

  return (
    <Modal open={true} onClose={onClose} title={"📊 ميزان المراجعة والأستاذ العام المحاسبي - شهر: " + month} size="xl">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Status Bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: isBalanced ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
          padding: '8px 14px',
          borderRadius: 12,
          border: `1px solid ${isBalanced ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
          flexWrap: 'wrap',
          gap: 8
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 15 }}>{isBalanced ? '✅' : '⚖️'}</span>
              <strong style={{ color: isBalanced ? '#34d399' : '#fbbf24', fontSize: 13.5 }}>
                {isBalanced ? 'ميزان المراجعة متزن محاسبياً تماماً' : `حالة التوازن: فارق ${formatCurrency(diff)}`}
              </strong>
            </div>
            <span style={{ color: '#94a3b8', fontSize: 11.5, display: 'block', marginTop: 2 }}>
              ورقة عمل محاسبية موحدة تلخص كافة الأصول والخصوم وحقوق الملكية والإيرادات والمصروفات
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" onClick={handleExportExcel} style={{ background: 'linear-gradient(135deg, #059669, #10b981)', color: '#fff', fontWeight: 800 }}>
              📥 تصدير Excel
            </Button>
            <Button size="sm" variant="ghost" onClick={handlePrint}>🖨️ طباعة</Button>
          </div>
        </div>

        {/* Balance Table */}
        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '2px solid var(--border)', color: '#94a3b8' }}>
                <th style={{ padding: '8px 10px' }}>#</th>
                <th style={{ padding: '8px 10px' }}>الحساب المالي والبيان</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', color: '#38bdf8' }}>مدين (Debit)</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', color: '#34d399' }}>دائن (Credit)</th>
                <th style={{ padding: '8px 10px' }}>النوع المحاسبي</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map(acc => (
                <tr key={acc.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '6px 10px' }}>{acc.id}</td>
                  <td style={{ padding: '6px 10px', color: '#fff', fontWeight: 700 }}>{acc.name}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'left', color: acc.debit > 0 ? '#38bdf8' : '#64748b', fontWeight: acc.debit > 0 ? 800 : 400 }}>
                    {acc.debit > 0 ? formatCurrency(acc.debit) : '—'}
                  </td>
                  <td style={{ padding: '6px 10px', textAlign: 'left', color: acc.credit > 0 ? '#34d399' : '#64748b', fontWeight: acc.credit > 0 ? 800 : 400 }}>
                    {acc.credit > 0 ? formatCurrency(acc.credit) : '—'}
                  </td>
                  <td style={{ padding: '6px 10px', color: acc.type === 'asset' ? '#93c5fd' : acc.type === 'liability' ? '#f87171' : acc.type === 'equity' ? '#c084fc' : acc.type === 'revenue' ? '#34d399' : '#fb923c', fontSize: 11.5 }}>
                    {acc.category}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'rgba(30, 41, 59, 0.9)', borderTop: '2px solid #3b82f6', fontWeight: 900, fontSize: 13 }}>
                <td colSpan={2} style={{ padding: '8px 10px', color: '#ffffff' }}>إجمالي ميزان المراجعة (Totals)</td>
                <td style={{ padding: '8px 10px', textAlign: 'left', color: '#38bdf8', fontSize: 14, fontWeight: 900 }}>
                  {formatCurrency(totalDebit)}
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'left', color: '#34d399', fontSize: 14, fontWeight: 900 }}>
                  {formatCurrency(totalCredit)}
                </td>
                <td style={{ padding: '8px 10px', color: isBalanced ? '#34d399' : '#fbbf24', fontSize: 11.5 }}>
                  {isBalanced ? 'متزن 100% ✅' : `فارق: ${formatCurrency(diff)}`}
                </td>
              </tr>
              <tr style={{ background: 'rgba(59, 130, 246, 0.15)', borderTop: '1px dashed rgba(255,255,255,0.1)', fontWeight: 800, fontSize: 12.5 }}>
                <td colSpan={2} style={{ padding: '7px 10px', color: '#93c5fd' }}>صافي الأرباح التشغيلية لشهر ({month})</td>
                <td colSpan={3} style={{ padding: '7px 10px', textAlign: 'left', color: netProfit >= 0 ? '#34d399' : '#f87171', fontSize: 14 }}>
                  {formatCurrency(netProfit)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </Modal>
  );
}
