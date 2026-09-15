import React, { useState, useEffect, useMemo } from 'react';
import { getInventory, addInventoryItem, updateInventoryItem, deleteInventoryItem, adjustInventoryStock } from '../../../services/db';
import { Card, StatCard, EmptyState, Button, Input, Modal, Badge, ConfirmDialog } from '../../../components/ui';
import { formatCurrency, formatDateTime } from '../../../utils/constants';
import { exportToExcel } from '../../../utils/excelExport';
import MenuQrModal from '../../../components/MenuQrModal';
import { getDrinkImage, getDrinkFallbackEmoji } from '../../../utils/drinkImages';
import { TrendingUp, DollarSign, Percent, Sparkles, Filter, Calculator, ArrowUpDown, Award, AlertCircle } from 'lucide-react';

const INVENTORY_CATEGORIES = [
  'مشروبات وبن',
  'أكواب وأدوات ضيافة',
  'أدوات مكتبية ومطبوعات',
  'منظفات ومستلزمات',
  'أخرى'
];

export default function InventoryTab() {
  const [items, setItems] = useState([]);
  const [modal, setModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({
    name: '', category: 'مشروبات وبن', quantity: '', minQuantityAlert: '5',
    unitPrice: '', costPrice: '', unit: 'علبة / كرتونة', notes: ''
  });

  const [adjustModal, setAdjustModal] = useState(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('شراء بضاعة جديدة (إضافة)');
  const [adjustType, setAdjustType] = useState('add');

  const [deleteId, setDeleteId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [qrModalOpen, setQrModalOpen] = useState(false);

  // Profit Margin Engine Filters & Sorters
  const [marginFilter, setMarginFilter] = useState('all'); // all | high | medium | low | lowStock | missing
  const [sortBy, setSortBy] = useState('marginDesc'); // marginDesc | profitDesc | totalProfitDesc | priceDesc | stockDesc | name

  useEffect(() => {
    return getInventory(setItems);
  }, []);

  // Helper to compute profit metrics for an item
  const getItemStats = (item) => {
    const cost = Number(item.costPrice) || 0;
    const price = Number(item.unitPrice) || 0;
    const profit = price - cost;
    const margin = price > 0 ? Math.round((profit / price) * 100) : 0;
    const markup = cost > 0 ? Math.round((profit / cost) * 100) : 0;
    const qty = Number(item.quantity) || 0;
    const itemTotalProfit = qty * profit;
    const itemTotalCost = qty * cost;
    const itemTotalRetail = qty * price;
    return {
      cost,
      price,
      profit,
      margin,
      markup,
      qty,
      itemTotalProfit,
      itemTotalCost,
      itemTotalRetail
    };
  };

  // Overall Financial Totals
  const totalItems = items.length;
  const totalStockCost = useMemo(() => items.reduce((s, i) => s + ((Number(i.quantity) || 0) * (Number(i.costPrice) || 0)), 0), [items]);
  const totalRetailValue = useMemo(() => items.reduce((s, i) => s + ((Number(i.quantity) || 0) * (Number(i.unitPrice) || 0)), 0), [items]);
  const totalPotentialProfit = totalRetailValue - totalStockCost;
  const avgMarginPercent = totalRetailValue > 0 ? Math.round((totalPotentialProfit / totalRetailValue) * 100) : 0;
  const lowStockItems = useMemo(() => items.filter(i => (Number(i.quantity) || 0) <= (Number(i.minQuantityAlert) || 5)), [items]);

  // Counts for filters
  const highMarginCount = useMemo(() => items.filter(i => getItemStats(i).margin >= 50 && Number(i.unitPrice) > 0).length, [items]);
  const mediumMarginCount = useMemo(() => items.filter(i => {
    const m = getItemStats(i).margin;
    return m >= 30 && m < 50 && Number(i.unitPrice) > 0;
  }).length, [items]);
  const lowMarginCount = useMemo(() => items.filter(i => getItemStats(i).margin < 30 && Number(i.unitPrice) > 0).length, [items]);
  const missingCostCount = useMemo(() => items.filter(i => !i.costPrice || Number(i.costPrice) === 0).length, [items]);

  // Filtered & Sorted Items
  const filteredAndSortedItems = useMemo(() => {
    let list = items;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(i =>
        (i.name || '').toLowerCase().includes(q) ||
        (i.category || '').toLowerCase().includes(q)
      );
    }

    if (marginFilter === 'high') {
      list = list.filter(i => getItemStats(i).margin >= 50 && Number(i.unitPrice) > 0);
    } else if (marginFilter === 'medium') {
      list = list.filter(i => {
        const m = getItemStats(i).margin;
        return m >= 30 && m < 50 && Number(i.unitPrice) > 0;
      });
    } else if (marginFilter === 'low') {
      list = list.filter(i => getItemStats(i).margin < 30 && Number(i.unitPrice) > 0);
    } else if (marginFilter === 'missing') {
      list = list.filter(i => !i.costPrice || Number(i.costPrice) === 0);
    } else if (marginFilter === 'lowStock') {
      list = list.filter(i => (Number(i.quantity) || 0) <= (Number(i.minQuantityAlert) || 5));
    }

    return [...list].sort((a, b) => {
      const sa = getItemStats(a);
      const sb = getItemStats(b);
      if (sortBy === 'marginDesc') return sb.margin - sa.margin;
      if (sortBy === 'profitDesc') return sb.profit - sa.profit;
      if (sortBy === 'totalProfitDesc') return sb.itemTotalProfit - sa.itemTotalProfit;
      if (sortBy === 'priceDesc') return sb.price - sa.price;
      if (sortBy === 'stockDesc') return sb.qty - sa.qty;
      return (a.name || '').localeCompare(b.name || '', 'ar');
    });
  }, [items, search, marginFilter, sortBy]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name) return;
    setLoading(true);
    try {
      const payload = {
        name: form.name.trim(),
        category: form.category || 'مشروبات وبن',
        quantity: Number(form.quantity) || 0,
        minQuantityAlert: Number(form.minQuantityAlert) || 5,
        unitPrice: Number(form.unitPrice) || 0,
        costPrice: Number(form.costPrice) || 0,
        unit: form.unit || 'علبة / كرتونة',
        notes: form.notes || ''
      };
      if (editItem) {
        await updateInventoryItem(editItem.id, payload);
      } else {
        await addInventoryItem(payload);
      }
      setModal(false);
      setEditItem(null);
    } catch (err) {
      alert('حدث خطأ أثناء حفظ بيانات الصنف: ' + (err.message || ''));
    } finally {
      setLoading(false);
    }
  };

  const handleAdjust = async (e) => {
    e.preventDefault();
    if (!adjustModal || !adjustAmount) return;
    setLoading(true);
    try {
      const delta = adjustType === 'add' ? Math.abs(Number(adjustAmount)) : -Math.abs(Number(adjustAmount));
      await adjustInventoryStock(adjustModal.id, delta, adjustReason);
      setAdjustModal(null);
      setAdjustAmount('');
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = () => {
    const headers = [
      '#', 'اسم الصنف', 'التصنيف', 'الرصيد بالمخزن', 'الوحدة', 'حد الطلب الأدنى',
      'سعر الشراء / التكلفة (ج.م)', 'سعر البيع (ج.م)', 'صافي ربح القطعة (ج.م)',
      'نسبة هامش الربح (%)', 'إجمالي تكلفة الرصيد (ج.م)', 'إجمالي القيمة البيعية (ج.م)',
      'إجمالي الأرباح المتوقعة (ج.م)'
    ];
    const rows = filteredAndSortedItems.map((item, idx) => {
      const stats = getItemStats(item);
      return [
        idx + 1,
        item.name,
        item.category,
        stats.qty,
        item.unit || 'علبة',
        Number(item.minQuantityAlert) || 5,
        stats.cost,
        stats.price,
        stats.profit,
        `${stats.margin}%`,
        stats.itemTotalCost,
        stats.itemTotalRetail,
        stats.itemTotalProfit
      ];
    });
    exportToExcel("تحليل_هوامش_أرباح_المخزون_والكافيه", headers, rows);
  };

  // Form Live Margin Computations
  const formCost = Number(form.costPrice) || 0;
  const formPrice = Number(form.unitPrice) || 0;
  const formProfit = formPrice - formCost;
  const formMargin = formPrice > 0 ? Math.round((formProfit / formPrice) * 100) : 0;
  const formMarkup = formCost > 0 ? Math.round((formProfit / formCost) * 100) : 0;

  const applyTargetMargin = (targetMarginPercent) => {
    if (formCost <= 0) return;
    const factor = 1 - (targetMarginPercent / 100);
    const calculated = Math.ceil(formCost / factor);
    setForm(prev => ({ ...prev, unitPrice: String(calculated) }));
  };

  const applyTargetMarkup = (targetMarkupPercent) => {
    if (formCost <= 0) return;
    const calculated = Math.ceil(formCost * (1 + (targetMarkupPercent / 100)));
    setForm(prev => ({ ...prev, unitPrice: String(calculated) }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ color: '#ffffff', fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>☕</span> مخزون TFG | CAFE ومحرك هوامش الأرباح (Profit Margin Engine)
          </h2>
          <p style={{ color: '#93c5fd', fontSize: 13, margin: '4px 0 0' }}>
            تحليل تكلفة المشروبات والخامات (COGS) وحساب هوامش الربح والتسعير الذكي للمنيو
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button size="sm" onClick={() => setQrModalOpen(true)} style={{ background: 'linear-gradient(135deg, #d97706, #f59e0b)', color: '#fff', fontWeight: 800 }}>
            📱 طباعة ستاند QR للمنيو
          </Button>
          <Button size="sm" onClick={handleExportExcel} style={{ background: 'linear-gradient(135deg, #059669, #10b981)', color: '#fff', fontWeight: 800 }}>
            📥 تصدير تحليل الأرباح Excel
          </Button>
          <Button size="sm" variant="primary" onClick={() => { setEditItem(null); setForm({ name: '', category: 'مشروبات وبن', quantity: '', minQuantityAlert: '5', unitPrice: '', costPrice: '', unit: 'علبة / كرتونة', notes: '' }); setModal(true); }}>
            + إضافة صنف مخزون جديد
          </Button>
        </div>
      </div>

      {/* 4 Financial Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <StatCard icon="📦" label="إجمالي الأصناف بالمخزن" value={`${totalItems} صنف`} color="blue" />
        <StatCard icon="💸" label="إجمالي تكلفة البضاعة (COGS)" value={formatCurrency(totalStockCost)} color="purple" subtitle="قيمة الشراء للمخزون الحالي" />
        <StatCard icon="📈" label="إجمالي القيمة البيعية للمخزون" value={formatCurrency(totalRetailValue)} color="green" subtitle="المبيعات المتوقعة عند البيع" />
        <StatCard
          icon="🏆"
          label="صافي الأرباح التقديرية"
          value={formatCurrency(totalPotentialProfit)}
          color={totalPotentialProfit >= 0 ? "teal" : "red"}
          subtitle={`متوسط هامش الربح: ${avgMarginPercent}%`}
        />
      </div>

      {/* Low stock alert */}
      {lowStockItems.length > 0 && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.35)',
          borderRadius: 12, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12, color: '#fca5a5', fontSize: 13
        }}>
          <span style={{ fontSize: 20 }}>⚠️</span>
          <div>
            <strong>تنبيه نقص المخزون:</strong> يوجد عدد ({lowStockItems.length}) أصناف وصلت للحد الأدنى، يرجى طلب توريد جديد:
            <span style={{ color: '#ffffff', marginRight: 6 }}>
              {lowStockItems.map(i => i.name + " (متبقي: " + i.quantity + ")").join(' | ')}
            </span>
          </div>
        </div>
      )}

      {/* Profit Filter Buttons & Search Bar */}
      <div style={{
        background: 'rgba(12, 26, 46, 0.65)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 14,
        padding: '14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          {/* Quick Filters */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Filter size={14} /> تصفية الربحية:
            </span>
            <button
              type="button"
              onClick={() => setMarginFilter('all')}
              style={{
                fontSize: 12, borderRadius: 8, padding: '5px 10px', cursor: 'pointer',
                background: marginFilter === 'all' ? '#2563eb' : 'rgba(255,255,255,0.06)',
                color: '#fff', border: '1px solid ' + (marginFilter === 'all' ? '#3b82f6' : 'rgba(255,255,255,0.12)')
              }}
            >
              الكل ({items.length})
            </button>
            <button
              type="button"
              onClick={() => setMarginFilter('high')}
              style={{
                fontSize: 12, borderRadius: 8, padding: '5px 10px', cursor: 'pointer',
                background: marginFilter === 'high' ? '#059669' : 'rgba(16, 185, 129, 0.1)',
                color: marginFilter === 'high' ? '#fff' : '#6ee7b7',
                border: '1px solid ' + (marginFilter === 'high' ? '#10b981' : 'rgba(16, 185, 129, 0.3)')
              }}
            >
              🏆 عالية الربحية ≥ 50% ({highMarginCount})
            </button>
            <button
              type="button"
              onClick={() => setMarginFilter('medium')}
              style={{
                fontSize: 12, borderRadius: 8, padding: '5px 10px', cursor: 'pointer',
                background: marginFilter === 'medium' ? '#0284c7' : 'rgba(56, 189, 248, 0.1)',
                color: marginFilter === 'medium' ? '#fff' : '#7dd3fc',
                border: '1px solid ' + (marginFilter === 'medium' ? '#38bdf8' : 'rgba(56, 189, 248, 0.3)')
              }}
            >
              👍 ربحية متوسطة 30-49% ({mediumMarginCount})
            </button>
            <button
              type="button"
              onClick={() => setMarginFilter('low')}
              style={{
                fontSize: 12, borderRadius: 8, padding: '5px 10px', cursor: 'pointer',
                background: marginFilter === 'low' ? '#d97706' : 'rgba(245, 158, 11, 0.1)',
                color: marginFilter === 'low' ? '#fff' : '#fcd34d',
                border: '1px solid ' + (marginFilter === 'low' ? '#f59e0b' : 'rgba(245, 158, 11, 0.3)')
              }}
            >
              ⚠️ ربحية منخفضة &lt; 30% ({lowMarginCount})
            </button>
            {missingCostCount > 0 && (
              <button
                type="button"
                onClick={() => setMarginFilter('missing')}
                style={{
                  fontSize: 12, borderRadius: 8, padding: '5px 10px', cursor: 'pointer',
                  background: marginFilter === 'missing' ? '#dc2626' : 'rgba(239, 68, 68, 0.1)',
                  color: marginFilter === 'missing' ? '#fff' : '#fca5a5',
                  border: '1px solid ' + (marginFilter === 'missing' ? '#ef4444' : 'rgba(239, 68, 68, 0.3)')
                }}
              >
                ❓ بدون تكلفة ({missingCostCount})
              </button>
            )}
            {lowStockItems.length > 0 && (
              <button
                type="button"
                onClick={() => setMarginFilter('lowStock')}
                style={{
                  fontSize: 12, borderRadius: 8, padding: '5px 10px', cursor: 'pointer',
                  background: marginFilter === 'lowStock' ? '#dc2626' : 'rgba(239, 68, 68, 0.1)',
                  color: marginFilter === 'lowStock' ? '#fff' : '#fca5a5',
                  border: '1px solid ' + (marginFilter === 'lowStock' ? '#ef4444' : 'rgba(239, 68, 68, 0.3)')
                }}
              >
                📦 رصيد منخفض ({lowStockItems.length})
              </button>
            )}
          </div>

          {/* Sorter Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
              <ArrowUpDown size={14} /> الترتيب:
            </span>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              style={{
                background: '#0a162b',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#fff',
                fontSize: 12,
                borderRadius: 8,
                padding: '5px 10px',
                cursor: 'pointer'
              }}
            >
              <option value="marginDesc">نسبة هامش الربح % (الأعلى للأقل)</option>
              <option value="profitDesc">صافي ربح القطعة (ج.م)</option>
              <option value="totalProfitDesc">إجمالي أرباح الرصيد المتوفر</option>
              <option value="priceDesc">سعر البيع (الأعلى للأقل)</option>
              <option value="stockDesc">الرصيد المتوفر بالمخزن</option>
              <option value="name">الاسم أبجدياً</option>
            </select>
          </div>
        </div>

        {/* Search */}
        <div style={{ maxWidth: 400 }}>
          <Input placeholder="🔍 بحث بالاسم أو التصنيف (مشروبات، بن، حلويات...)" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Grid of Items */}
      {filteredAndSortedItems.length === 0 ? (
        <EmptyState icon="☕" message="لا توجد أصناف مطابقة للبحث أو التصفية الحالية" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: 16 }}>
          {filteredAndSortedItems.map(item => {
            const isLow = (Number(item.quantity) || 0) <= (Number(item.minQuantityAlert) || 5);
            const stats = getItemStats(item);

            let marginBadgeColor = 'gray';
            let marginBadgeText = 'غير محدد';
            if (stats.price > 0) {
              if (stats.margin >= 50) {
                marginBadgeColor = 'green';
                marginBadgeText = `🏆 هامش ممتاز ${stats.margin}%`;
              } else if (stats.margin >= 30) {
                marginBadgeColor = 'blue';
                marginBadgeText = `👍 هامش جيد ${stats.margin}%`;
              } else if (stats.margin > 0) {
                marginBadgeColor = 'amber';
                marginBadgeText = `⚠️ هامش قليل ${stats.margin}%`;
              } else {
                marginBadgeColor = 'red';
                marginBadgeText = '⛔ بدون ربح / خسارة';
              }
            }

            return (
              <Card
                key={item.id}
                style={{
                  background: 'var(--bg-card)',
                  border: isLow ? '1.5px solid rgba(239,68,68,0.45)' : '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  borderRadius: 16,
                  padding: 16,
                  position: 'relative'
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 48, height: 48, flexShrink: 0,
                      borderRadius: 12,
                      background: 'radial-gradient(circle, rgba(30,58,138,0.35) 0%, rgba(15,23,42,0.9) 100%)',
                      border: '1px solid rgba(59,130,246,0.25)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4
                    }}>
                      {getDrinkImage(item) ? (
                        <img src={getDrinkImage(item)} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      ) : (
                        <span style={{ fontSize: 24 }}>{getDrinkFallbackEmoji(item)}</span>
                      )}
                    </div>
                    <div>
                      <h3 style={{ color: '#ffffff', fontWeight: 800, fontSize: 16, margin: 0 }}>{item.name}</h3>
                      <p style={{ color: '#93c5fd', fontSize: 12, margin: '2px 0 0' }}>🏷️ {item.category}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <Badge color={marginBadgeColor}>{marginBadgeText}</Badge>
                    {isLow && <Badge color="red">⚠️ منخفض</Badge>}
                  </div>
                </div>

                {/* Stock Level Bar */}
                <div style={{
                  background: isLow ? 'rgba(239, 68, 68, 0.1)' : 'rgba(56, 189, 248, 0.08)',
                  border: isLow ? '1px solid rgba(239, 68, 68, 0.25)' : '1px solid rgba(56, 189, 248, 0.2)',
                  borderRadius: 10, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <span style={{ fontSize: 12, color: isLow ? '#fca5a5' : '#bae6fd' }}>الرصيد المتاح:</span>
                  <strong style={{ fontSize: 18, color: isLow ? '#f87171' : '#38bdf8', fontWeight: 900 }}>
                    {item.quantity} <span style={{ fontSize: 11, fontWeight: 600 }}>{item.unit || 'علبة'}</span>
                  </strong>
                </div>

                {/* Profit Margin Engine Breakdown Box */}
                <div style={{
                  background: 'rgba(15, 23, 42, 0.65)',
                  border: '1px solid rgba(255, 255, 255, 0.07)',
                  borderRadius: 12,
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8
                }}>
                  {/* Prices row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, textAlign: 'center' }}>
                    <div>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>سعر التكلفة</span>
                      <strong style={{ display: 'block', color: '#cbd5e1', fontSize: 13 }}>
                        {formatCurrency(stats.cost)}
                      </strong>
                    </div>
                    <div>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>سعر البيع</span>
                      <strong style={{ display: 'block', color: '#ffffff', fontSize: 13, fontWeight: 800 }}>
                        {formatCurrency(stats.price)}
                      </strong>
                    </div>
                    <div>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>صافي الربح</span>
                      <strong style={{ display: 'block', color: stats.profit >= 0 ? '#34d399' : '#f87171', fontSize: 13, fontWeight: 800 }}>
                        {stats.profit >= 0 ? `+${stats.profit}` : stats.profit} ج.م
                      </strong>
                    </div>
                  </div>

                  {/* Visual Progress Bar for Margin */}
                  {stats.price > 0 && (
                    <div style={{ marginTop: 2 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#94a3b8', marginBottom: 3 }}>
                        <span>نسبة الربح من سعر البيع:</span>
                        <strong style={{ color: stats.margin >= 50 ? '#34d399' : '#38bdf8' }}>{stats.margin}%</strong>
                      </div>
                      <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${Math.min(100, Math.max(0, stats.margin))}%`,
                            height: '100%',
                            background: stats.margin >= 50 ? 'linear-gradient(90deg, #10b981, #059669)' : (stats.margin >= 30 ? 'linear-gradient(90deg, #38bdf8, #2563eb)' : 'linear-gradient(90deg, #f59e0b, #ef4444)'),
                            borderRadius: 4
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Potential Stock Profit */}
                  <div style={{
                    borderTop: '1px dashed rgba(255,255,255,0.1)',
                    paddingTop: 6,
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 11,
                    color: '#93c5fd'
                  }}>
                    <span>ربح الرصيد المتوفر ({stats.qty}):</span>
                    <strong style={{ color: stats.itemTotalProfit >= 0 ? '#6ee7b7' : '#fca5a5' }}>
                      +{formatCurrency(stats.itemTotalProfit)}
                    </strong>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6, marginTop: 'auto', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  <Button size="sm" variant="success" onClick={() => { setAdjustModal(item); setAdjustAmount('1'); setAdjustType('add'); setAdjustReason('شراء بضاعة جديدة (إضافة)'); }} style={{ flex: 1 }}>
                    ➕ توريد
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setAdjustModal(item); setAdjustAmount('1'); setAdjustType('subtract'); setAdjustReason('استهلاك / بيع'); }} style={{ flex: 1 }}>
                    ➖ صرف
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setEditItem(item); setForm(item); setModal(true); }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      background: 'rgba(56, 189, 248, 0.12)',
                      color: '#38bdf8',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      fontWeight: 700
                    }}
                    title="تعديل بيانات الصنف والأسعار"
                  >
                    ✏️ تعديل
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => setDeleteId(item.id)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      background: 'rgba(239, 68, 68, 0.12)',
                      color: '#f87171',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      fontWeight: 700
                    }}
                    title="حذف الصنف نهائياً"
                  >
                    🗑️ حذف
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal: Add/Edit Item with Interactive Profit Engine */}
      <Modal open={modal} onClose={() => setModal(false)} title={editItem ? 'تعديل صنف مخزون وتحديد هوامش الربح' : 'إضافة صنف جديد وحساب الربحية'}>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Input label="اسم الصنف / المشروب" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
          <div>
            <label style={{ display: 'block', color: '#c8dcf5', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>التصنيف:</label>
            <select
              value={form.category}
              onChange={e => setForm({ ...form, category: e.target.value })}
              style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', color: '#fff' }}
            >
              {INVENTORY_CATEGORIES.map(c => <option key={c} value={c} style={{ background: '#0a162b', color: '#fff' }}>{c}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Input label="الرصيد المتاح حالياً" type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} required />
            <Input label="حد التنبيه الأدنى" type="number" value={form.minQuantityAlert} onChange={e => setForm({ ...form, minQuantityAlert: e.target.value })} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Input label="سعر التكلفة (ج.م) [Cost]" type="number" value={form.costPrice} onChange={e => setForm({ ...form, costPrice: e.target.value })} placeholder="مثال: 15" />
            <Input label="سعر البيع للجمهور (ج.م) [Price]" type="number" value={form.unitPrice} onChange={e => setForm({ ...form, unitPrice: e.target.value })} placeholder="مثال: 35" />
          </div>

          {/* Interactive Profit Calculator in Modal */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.85)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: 12,
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 6 }}>
                🧮 حاسبة وتحليل هامش الربح (Profit Calculator)
              </span>
              {formPrice > 0 && (
                <Badge color={formMargin >= 50 ? 'green' : (formMargin >= 30 ? 'blue' : (formMargin > 0 ? 'amber' : 'red'))}>
                  {formMargin >= 50 ? '🏆 ربحية ممتازة' : (formMargin >= 30 ? '👍 ربحية جيدة' : (formMargin > 0 ? '⚠️ ربحية منخفضة' : '⛔ خسارة'))}
                </Badge>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center', background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 8 }}>
              <div>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>صافي ربح القطعة</span>
                <strong style={{ display: 'block', fontSize: 15, color: formProfit >= 0 ? '#34d399' : '#f87171' }}>
                  {formProfit >= 0 ? `+${formProfit}` : formProfit} ج.م
                </strong>
              </div>
              <div>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>هامش الربح (Margin)</span>
                <strong style={{ display: 'block', fontSize: 15, color: '#38bdf8' }}>
                  {formMargin}%
                </strong>
              </div>
              <div>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>الزيادة على التكلفة (Markup)</span>
                <strong style={{ display: 'block', fontSize: 15, color: '#fbbf24' }}>
                  {formMarkup}%
                </strong>
              </div>
            </div>

            {/* Quick Pricing Suggestions */}
            {formCost > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>⚡ اقتراحات تسعير ذكية لتحديد سعر البيع تلقائياً بناءً على التكلفة ({formCost} ج.م):</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => applyTargetMargin(50)}
                    style={{
                      fontSize: 11, background: 'rgba(56, 189, 248, 0.15)', border: '1px solid rgba(56, 189, 248, 0.3)',
                      borderRadius: 6, padding: '4px 8px', color: '#bae6fd', cursor: 'pointer'
                    }}
                  >
                    هامش 50% ({Math.ceil(formCost / 0.5)} ج.م)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTargetMargin(65)}
                    style={{
                      fontSize: 11, background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)',
                      borderRadius: 6, padding: '4px 8px', color: '#6ee7b7', cursor: 'pointer'
                    }}
                  >
                    هامش 65% ({Math.ceil(formCost / 0.35)} ج.م)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTargetMargin(75)}
                    style={{
                      fontSize: 11, background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)',
                      borderRadius: 6, padding: '4px 8px', color: '#fcd34d', cursor: 'pointer'
                    }}
                  >
                    هامش 75% ({Math.ceil(formCost / 0.25)} ج.م)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTargetMarkup(100)}
                    style={{
                      fontSize: 11, background: 'rgba(168, 85, 247, 0.15)', border: '1px solid rgba(168, 85, 247, 0.3)',
                      borderRadius: 6, padding: '4px 8px', color: '#d8b4fe', cursor: 'pointer'
                    }}
                  >
                    ضعف التكلفة 2X ({formCost * 2} ج.م)
                  </button>
                </div>
              </div>
            )}
          </div>

          <Input label="الوحدة (علبة / كرتونة / كيلو / كوب)" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} />
          <Input label="ملاحظات" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <Button type="button" variant="ghost" onClick={() => setModal(false)}>إلغاء</Button>
            <Button type="submit" variant="primary" disabled={loading}>حفظ الصنف</Button>
          </div>
        </form>
      </Modal>

      {/* Adjust Stock Modal */}
      <Modal open={!!adjustModal} onClose={() => setAdjustModal(null)} title={adjustModal ? ("تعديل رصيد: " + adjustModal.name) : ""}>
        {adjustModal && (
          <form onSubmit={handleAdjust} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: 'rgba(56, 189, 248, 0.1)', padding: 12, borderRadius: 10, textAlign: 'center' }}>
              <span style={{ color: '#93c5fd', fontSize: 12 }}>الرصيد الحالي بالمخزن:</span>
              <strong style={{ color: '#38bdf8', fontSize: 20, display: 'block' }}>{adjustModal.quantity} {adjustModal.unit || 'علبة'}</strong>
            </div>

            <Input label="الكمية المراد تعديلها" type="number" min="1" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)} required />
            <Input label="السبب والبيان" value={adjustReason} onChange={e => setAdjustReason(e.target.value)} required />

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
              <Button type="button" variant="ghost" onClick={() => setAdjustModal(null)}>إلغاء</Button>
              <Button type="submit" variant={adjustType === 'add' ? "success" : "primary"} disabled={loading}>
                {adjustType === 'add' ? '✅ تأكيد إضافة الرصيد' : '✅ تأكيد صرف الرصيد'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={!!deleteId}
        onCancel={() => setDeleteId(null)}
        onConfirm={async () => {
          const itemToDelete = items.find(i => i.id === deleteId);
          await deleteInventoryItem(deleteId, itemToDelete?.name || '');
          setDeleteId(null);
        }}
        title="حذف صنف من المخزون"
        message="هل أنت متأكد من حذف هذا الصنف نهائياً من سجلات المخزون ومحرك هوامش الأرباح؟"
      />

      {/* QR Table Stand Modal */}
      <MenuQrModal isOpen={qrModalOpen} onClose={() => setQrModalOpen(false)} orgName="TFG | CAFE" />
    </div>
  );
}
