import React, { useState } from 'react';
import { Modal, Button, Badge } from './ui';
import { formatCurrency, formatDateTime, formatTime } from '../utils/constants';
import {
  Coffee, Wallet, Banknote, Zap, CreditCard, Smartphone,
  Search, Filter, Printer, ArrowDownCircle, CheckCircle2,
  Clock, ShieldCheck, User, Receipt
} from 'lucide-react';

export default function CafeShiftDetailModal({ isOpen, onClose, shift }) {
  const [filterMethod, setFilterMethod] = useState('all'); // 'all' | 'cash' | 'wallet' | 'other_digital'
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen || !shift) return null;

  const totalSales = Number(shift.totalSales) || 0;
  const totalExpenses = Number(shift.totalExpenses) || 0;
  const netProfit = totalSales - totalExpenses;
  const profitMargin = totalSales > 0 ? Math.round((netProfit / totalSales) * 100) : 0;

  const sales = shift.sales || [];
  const expenses = shift.expenses || [];

  // Granular payment categorization
  const isWalletSale = (s) => {
    const m = (s.paymentMethod || '').toLowerCase().trim();
    const b = (s.buyerName || '').toLowerCase();
    return m === 'wallet_credit' || m === 'wallet' || m.includes('محفظ') || !!s.paidWithWallet || b.includes('مدفوع بالمحفظة') || b.includes('المحفظة');
  };

  const isCashSale = (s) => {
    const m = (s.paymentMethod || '').toLowerCase().trim();
    return !isWalletSale(s) && (m === 'cash' || m === 'نقدي' || !m);
  };

  const isInstapaySale = (s) => {
    const m = (s.paymentMethod || '').toLowerCase().trim();
    return !isWalletSale(s) && !isCashSale(s) && (m === 'instapay' || m.includes('إنستا') || m.includes('انستا'));
  };

  const isVodafoneSale = (s) => {
    const m = (s.paymentMethod || '').toLowerCase().trim();
    return !isWalletSale(s) && !isCashSale(s) && (m === 'vodafone_cash' || m.includes('فودافون'));
  };

  const isVisaSale = (s) => {
    const m = (s.paymentMethod || '').toLowerCase().trim();
    return !isWalletSale(s) && !isCashSale(s) && !isInstapaySale(s) && !isVodafoneSale(s) && (m === 'visa' || m.includes('فيزا'));
  };

  const isOtherDigitalSale = (s) => {
    return isInstapaySale(s) || isVodafoneSale(s) || isVisaSale(s);
  };

  // Grouped lists
  const cashSalesList = sales.filter(isCashSale);
  const walletSalesList = sales.filter(isWalletSale);
  const instapaySalesList = sales.filter(isInstapaySale);
  const vodafoneSalesList = sales.filter(isVodafoneSale);
  const visaSalesList = sales.filter(isVisaSale);
  const otherDigitalList = sales.filter(isOtherDigitalSale);

  const cashTotal = cashSalesList.reduce((acc, s) => acc + (Number(s.total) || 0), 0);
  const walletTotal = walletSalesList.reduce((acc, s) => acc + (Number(s.total) || 0), 0);
  const instapayTotal = instapaySalesList.reduce((acc, s) => acc + (Number(s.total) || 0), 0);
  const vodafoneTotal = vodafoneSalesList.reduce((acc, s) => acc + (Number(s.total) || 0), 0);
  const visaTotal = visaSalesList.reduce((acc, s) => acc + (Number(s.total) || 0), 0);
  const otherDigitalTotal = instapayTotal + vodafoneTotal + visaTotal;

  // Filtered displayed sales
  const displayedSales = sales.filter(sale => {
    if (filterMethod === 'cash' && !isCashSale(sale)) return false;
    if (filterMethod === 'wallet' && !isWalletSale(sale)) return false;
    if (filterMethod === 'other_digital' && !isOtherDigitalSale(sale)) return false;

    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      const buyer = (sale.buyerName || '').toLowerCase();
      const idStr = (sale.id || sale.orderCode || '').toLowerCase();
      const itemsStr = (sale.items || []).map(i => i.name).join(' ').toLowerCase();
      return buyer.includes(q) || idStr.includes(q) || itemsStr.includes(q);
    }
    return true;
  });

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal open={true} onClose={onClose} title="☕ كشف حساب ومحضر مناوبة TFG | CAFE" size="xl">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Top Header Banner */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(15, 32, 64, 0.95) 100%)',
          border: '1px solid rgba(245, 158, 11, 0.35)', borderRadius: 16, padding: '16px 20px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: 'rgba(245, 158, 11, 0.2)', border: '1px solid rgba(245, 158, 11, 0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b'
              }}>
                <Coffee size={20} />
              </div>
              <div>
                <h3 style={{ color: '#fff', fontSize: 16, fontWeight: 900, margin: 0 }}>
                  وردية: {shift.baristaName || 'كاشير الكافيه'}
                </h3>
                <p style={{ color: '#cbd5e1', fontSize: 12, margin: '3px 0 0' }}>
                  فتح: {shift.openedAt ? formatDateTime(shift.openedAt) : '—'}
                  {shift.closedAt && (' | إغلاق: ' + formatTime(shift.closedAt))}
                </p>
              </div>
              <Badge color={shift.status === 'open' ? 'green' : 'amber'}>
                {shift.status === 'open' ? 'جارية الآن 🟢' : 'مغلقة ومقفلة 🔒'}
              </Badge>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" variant="ghost" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Printer size={15} /> طباعة تقرير المناوبة
            </Button>
          </div>
        </div>

        {/* Financial Highlights (3 Primary Revenue Streams + Profits) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
          {/* Total Sales */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
            <span style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700 }}>إجمالي المبيعات</span>
            <strong style={{ color: '#38bdf8', fontSize: 19, display: 'block', marginTop: 2, fontWeight: 900 }}>
              {formatCurrency(totalSales)}
            </strong>
            <span style={{ color: '#64748b', fontSize: 10 }}>({sales.length} فواتير بيع)</span>
          </div>

          {/* Cash Sales */}
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.35)', borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
            <span style={{ color: '#6ee7b7', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <Banknote size={14} /> مبيعات كاش بالدرج
            </span>
            <strong style={{ color: '#34d399', fontSize: 19, display: 'block', marginTop: 2, fontWeight: 900 }}>
              {formatCurrency(cashTotal)}
            </strong>
            <span style={{ color: '#a7f3d0', fontSize: 10 }}>({cashSalesList.length} طلبات كاش)</span>
          </div>

          {/* Digital Wallet Sales */}
          <div style={{ background: 'rgba(168, 85, 247, 0.12)', border: '1px solid rgba(168, 85, 247, 0.45)', borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
            <span style={{ color: '#d8b4fe', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <Wallet size={14} /> محفظة الأعضاء الرقمية
            </span>
            <strong style={{ color: '#c084fc', fontSize: 19, display: 'block', marginTop: 2, fontWeight: 900 }}>
              {formatCurrency(walletTotal)}
            </strong>
            <span style={{ color: '#e9d5ff', fontSize: 10 }}>({walletSalesList.length} خصم محفظة ✓)</span>
          </div>

          {/* Other Digital (Instapay / Visa / Vodafone) */}
          <div style={{ background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.35)', borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
            <span style={{ color: '#7dd3fc', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <Zap size={14} /> إنستاباي وفيزا
            </span>
            <strong style={{ color: '#38bdf8', fontSize: 19, display: 'block', marginTop: 2, fontWeight: 900 }}>
              {formatCurrency(otherDigitalTotal)}
            </strong>
            <span style={{ color: '#93c5fd', fontSize: 10 }}>({otherDigitalList.length} إلكتروني)</span>
          </div>

          {/* Expenses */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
            <span style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700 }}>إجمالي المصروفات</span>
            <strong style={{ color: '#f87171', fontSize: 19, display: 'block', marginTop: 2, fontWeight: 900 }}>
              {formatCurrency(totalExpenses)}
            </strong>
            <span style={{ color: '#64748b', fontSize: 10 }}>({expenses.length} سندات صرف)</span>
          </div>

          {/* Net Profit */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
            <span style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700 }}>صافي ربح الكافيه</span>
            <strong style={{ color: netProfit >= 0 ? '#34d399' : '#f87171', fontSize: 19, display: 'block', marginTop: 2, fontWeight: 900 }}>
              {formatCurrency(netProfit)}
            </strong>
            <span style={{ color: '#fcd34d', fontSize: 10 }}>هامش {profitMargin}%</span>
          </div>
        </div>

        {/* Cash Drawer & Reconciliation Box */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: 14, padding: 16
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <h4 style={{ color: '#fff', fontSize: 14, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldCheck size={18} color="#34d399" />
              <span>جرد ومطابقة نقدية الدرج (وفصل المحافظ الإلكترونية عن الكاش)</span>
            </h4>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>
              * مبيعات المحفظة الإلكترونية ({formatCurrency(walletTotal)}) لا تضاف لدرج النقدية لأنها مخصومة رقمياً.
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, fontSize: 13 }}>
            <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 10 }}>
              <span style={{ color: '#94a3b8', display: 'block', fontSize: 11 }}>عهدة بداية الوردية:</span>
              <strong style={{ color: '#fff', fontSize: 15 }}>{formatCurrency(shift.openingDrawer || 0)}</strong>
            </div>

            <div style={{ padding: '8px 12px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: 10 }}>
              <span style={{ color: '#a7f3d0', display: 'block', fontSize: 11 }}>(+) مبيعات كاش محصلة:</span>
              <strong style={{ color: '#34d399', fontSize: 15 }}>+{formatCurrency(cashTotal)}</strong>
            </div>

            <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 10 }}>
              <span style={{ color: '#fca5a5', display: 'block', fontSize: 11 }}>(-) مصروفات من الدرج:</span>
              <strong style={{ color: '#f87171', fontSize: 15 }}>-{formatCurrency(totalExpenses)}</strong>
            </div>

            <div style={{ padding: '8px 12px', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.35)', borderRadius: 10 }}>
              <span style={{ color: '#fcd34d', display: 'block', fontSize: 11 }}>(=) الكاش المتوقع تسليمه:</span>
              <strong style={{ color: '#fbbf24', fontSize: 16 }}>
                {formatCurrency(shift.drawerCash !== undefined ? shift.drawerCash : ((shift.openingDrawer || 0) + cashTotal - totalExpenses))}
              </strong>
            </div>

            {shift.status === 'closed' && (
              <div style={{ padding: '8px 12px', background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.4)', borderRadius: 10 }}>
                <span style={{ color: '#93c5fd', display: 'block', fontSize: 11 }}>الجرد الفعلي المسلّم:</span>
                <strong style={{ color: '#fff', fontSize: 16 }}>{formatCurrency(shift.actualClosingCount || 0)}</strong>
              </div>
            )}
          </div>
        </div>

        {/* Interactive Orders & Payment Audit Table */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12
        }}>
          {/* Controls Bar: Filters & Search */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ color: '#fff', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Receipt size={16} color="#f59e0b" />
                <span>كشف تفصيلي بالطلبات وعمليات السداد ({displayedSales.length}):</span>
              </span>

              {/* Filter Pills */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { id: 'all', label: 'الكل (' + sales.length + ')' },
                  { id: 'cash', label: '💵 كاش فقط (' + cashSalesList.length + ')' },
                  { id: 'wallet', label: '💳 محفظة رقمية (' + walletSalesList.length + ')' },
                  { id: 'other_digital', label: '⚡ إلكتروني (' + otherDigitalList.length + ')' }
                ].map(btn => (
                  <button
                    key={btn.id}
                    onClick={() => setFilterMethod(btn.id)}
                    style={{
                      padding: '5px 11px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                      border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                      background: filterMethod === btn.id ? 'linear-gradient(135deg, #1d4ed8, #3b82f6)' : 'rgba(255, 255, 255, 0.05)',
                      color: filterMethod === btn.id ? '#ffffff' : '#94a3b8'
                    }}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Search */}
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="بحث باسم العميل أو الصنف..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{
                  background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)',
                  borderRadius: 10, padding: '7px 12px 7px 32px', color: '#fff', fontSize: 12,
                  outline: 'none', minWidth: 220
                }}
              />
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            </div>
          </div>

          {/* Table Container */}
          <div style={{ maxHeight: 380, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 }}>
            {displayedSales.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                لا توجد طلبات تطابق الفلتر المحدد
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.05)', color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <th style={{ padding: '10px 12px' }}>#</th>
                    <th style={{ padding: '10px 12px' }}>العميل / الطاولة</th>
                    <th style={{ padding: '10px 12px' }}>الأصناف والكميات</th>
                    <th style={{ padding: '10px 12px' }}>المبلغ</th>
                    <th style={{ padding: '10px 12px' }}>طريقة وحالة السداد</th>
                    <th style={{ padding: '10px 12px' }}>التوقيت</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedSales.map((sale, idx) => {
                    const isW = isWalletSale(sale);
                    const isC = isCashSale(sale);
                    const isI = isInstapaySale(sale);
                    const isV = isVodafoneSale(sale);

                    return (
                      <tr
                        key={sale.id || idx}
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          background: isW ? 'rgba(168, 85, 247, 0.04)' : (isC ? 'rgba(16, 185, 129, 0.02)' : 'transparent')
                        }}
                      >
                        {/* Index / ID */}
                        <td style={{ padding: '10px 12px', color: '#94a3b8', fontFamily: 'monospace' }}>
                          {idx + 1}
                        </td>

                        {/* Customer */}
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <User size={14} style={{ color: isW ? '#c084fc' : '#38bdf8' }} />
                            <strong style={{ color: '#ffffff', fontSize: 13 }}>
                              {(sale.buyerName || 'زبون كافيه').replace(' [مدفوع بالمحفظة]', '')}
                            </strong>
                          </div>
                        </td>

                        {/* Items */}
                        <td style={{ padding: '10px 12px', color: '#e2e8f0', maxWidth: 280 }}>
                          {(sale.items && sale.items.length > 0) ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {sale.items.map((it, iIdx) => (
                                <span
                                  key={iIdx}
                                  style={{
                                    background: 'rgba(255,255,255,0.06)',
                                    borderRadius: 6, padding: '2px 6px',
                                    fontSize: 11, color: '#f1f5f9'
                                  }}
                                >
                                  {it.qty} × {it.name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>مشروب / طلب كافيه</span>
                          )}
                        </td>

                        {/* Total Amount */}
                        <td style={{ padding: '10px 12px' }}>
                          <strong style={{
                            color: isW ? '#c084fc' : (isC ? '#34d399' : '#38bdf8'),
                            fontSize: 14, fontWeight: 900
                          }}>
                            {formatCurrency(sale.total)}
                          </strong>
                        </td>

                        {/* Payment Method Badge */}
                        <td style={{ padding: '10px 12px' }}>
                          {isW ? (
                            <span style={{
                              background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(147, 51, 234, 0.3))',
                              border: '1px solid rgba(168, 85, 247, 0.55)',
                              color: '#e9d5ff', borderRadius: 8, padding: '4px 10px',
                              fontSize: 11, fontWeight: 800,
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              boxShadow: '0 2px 8px rgba(168, 85, 247, 0.25)'
                            }}>
                              <Wallet size={13} color="#c084fc" />
                              <span>المحفظة الإلكترونية</span>
                              <span style={{ color: '#34d399', fontWeight: 900 }}>✓ مخصوم</span>
                            </span>
                          ) : isC ? (
                            <span style={{
                              background: 'rgba(16, 185, 129, 0.15)',
                              border: '1px solid rgba(16, 185, 129, 0.45)',
                              color: '#6ee7b7', borderRadius: 8, padding: '4px 10px',
                              fontSize: 11, fontWeight: 800,
                              display: 'inline-flex', alignItems: 'center', gap: 6
                            }}>
                              <Banknote size={13} color="#34d399" />
                              <span>نقدي (كاش)</span>
                              <span style={{ color: '#a7f3d0', fontSize: 10 }}>بالدرج</span>
                            </span>
                          ) : isI ? (
                            <span style={{
                              background: 'rgba(56, 189, 248, 0.15)',
                              border: '1px solid rgba(56, 189, 248, 0.45)',
                              color: '#7dd3fc', borderRadius: 8, padding: '4px 10px',
                              fontSize: 11, fontWeight: 800,
                              display: 'inline-flex', alignItems: 'center', gap: 6
                            }}>
                              <Zap size={13} color="#38bdf8" />
                              <span>إنستاباي (InstaPay)</span>
                            </span>
                          ) : isV ? (
                            <span style={{
                              background: 'rgba(239, 68, 68, 0.15)',
                              border: '1px solid rgba(239, 68, 68, 0.45)',
                              color: '#fca5a5', borderRadius: 8, padding: '4px 10px',
                              fontSize: 11, fontWeight: 800,
                              display: 'inline-flex', alignItems: 'center', gap: 6
                            }}>
                              <Smartphone size={13} color="#f87171" />
                              <span>فودافون كاش</span>
                            </span>
                          ) : (
                            <span style={{
                              background: 'rgba(59, 130, 246, 0.15)',
                              border: '1px solid rgba(59, 130, 246, 0.45)',
                              color: '#93c5fd', borderRadius: 8, padding: '4px 10px',
                              fontSize: 11, fontWeight: 800,
                              display: 'inline-flex', alignItems: 'center', gap: 6
                            }}>
                              <CreditCard size={13} color="#60a5fa" />
                              <span>بطاقة فيزا</span>
                            </span>
                          )}
                        </td>

                        {/* Time */}
                        <td style={{ padding: '10px 12px', color: '#94a3b8', fontSize: 11, whiteSpace: 'nowrap' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Clock size={11} />
                            {sale.date ? formatTime(sale.date) : '—'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Expenses Table (if any recorded) */}
        {expenses.length > 0 && (
          <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 14, padding: 14 }}>
            <h4 style={{ color: '#fca5a5', fontSize: 13, fontWeight: 800, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <ArrowDownCircle size={16} />
              <span>مصروفات ومشتريات الوردية ({expenses.length}):</span>
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {expenses.map((exp, idx) => (
                <div key={exp.id || idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 8, fontSize: 12 }}>
                  <span style={{ color: '#ffffff' }}>{exp.label || exp.category}</span>
                  <strong style={{ color: '#f87171' }}>-{formatCurrency(exp.amount)}</strong>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </Modal>
  );
}
