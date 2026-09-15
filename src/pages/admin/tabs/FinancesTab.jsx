import React, { useState, useEffect, useMemo } from 'react';
import { 
  getAllShifts, getPayments, getTicketSales, getAdminRevenues, getAdminExpenses, 
  getAllSalaries, getAssets, getVendors, getCafeShifts, getClients, getCapitalSettings, getPettyCashFunds 
} from '../../../services/db';
import TrialBalanceModal from '../../../components/TrialBalanceModal';
import YearEndClosingModal from '../../../components/YearEndClosingModal';
import PettyCashModal from '../../../components/PettyCashModal';
import { Card, StatCard, EmptyState, Button, Input, Select, Badge } from '../../../components/ui';
import { formatCurrency, formatDateTime, formatDate, getCurrentMonth, getMonthLabel, EXPENSE_CATEGORIES, REVENUE_CATEGORIES } from '../../../utils/constants';
import { exportToExcel } from '../../../utils/excelExport';

export default function FinancesTab() {
  const [shifts, setShifts] = useState([]);
  const [payments, setPayments] = useState([]);
  const [ticketSales, setTicketSales] = useState([]);
  const [adminRevenues, setAdminRevenues] = useState([]);
  const [adminExpenses, setAdminExpenses] = useState([]);
  const [clients, setClients] = useState([]);
  const [capitalSettings, setCapitalSettings] = useState(null);
  const [pettyCashFunds, setPettyCashFunds] = useState([]);
  const [month, setMonth] = useState(getCurrentMonth());
  const [viewMode, setViewMode] = useState('summary'); // 'summary' or 'search_ledger'

  // Search & Audit States
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState('all'); // 'all', 'expense', 'revenue'
  const [searchMonth, setSearchMonth] = useState(getCurrentMonth());
  const [searchAllTime, setSearchAllTime] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [ledgerDisplayLimit, setLedgerDisplayLimit] = useState(50);
  const [monthSalaries, setMonthSalaries] = useState([]);
  const [assets, setAssets] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [cafeShifts, setCafeShifts] = useState([]);
  const [trialBalanceOpen, setTrialBalanceOpen] = useState(false);
  const [yearEndOpen, setYearEndOpen] = useState(false);
  const [pettyCashOpen, setPettyCashOpen] = useState(false);

  useEffect(() => {
    const unsubS = getAllShifts(setShifts);
    const unsubP = getPayments(setPayments);
    const unsubT = getTicketSales(setTicketSales);
    const unsubA = getAdminRevenues(setAdminRevenues);
    const unsubAE = getAdminExpenses(setAdminExpenses);
    const unsubAss = getAssets(setAssets);
    const unsubV = getVendors(setVendors);
    const unsubC = getCafeShifts(setCafeShifts);
    const unsubCli = getClients(setClients);
    const unsubCap = getCapitalSettings(setCapitalSettings);
    const unsubPetty = getPettyCashFunds(setPettyCashFunds);
    return () => { 
      unsubS(); unsubP(); unsubT(); unsubA(); unsubAE(); unsubAss(); 
      unsubV(); unsubC(); unsubCli(); unsubCap(); unsubPetty(); 
    };
  }, []);

  useEffect(() => {
    getAllSalaries(month).then(setMonthSalaries).catch(() => {});
  }, [month]);

  // 1. MONTHLY SUMMARY DATA (Strict Audit Breakdown)
  const monthShifts = shifts.filter(s => {
    if (!s.openedAt) return false;
    const d = s.openedAt?.toDate ? s.openedAt.toDate() : new Date(s.openedAt);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` === month;
  });

  // Filter out voided payments
  const monthPayments = payments.filter(p => {
    if (!p.date || p.isVoided) return false;
    const d = p.date?.toDate ? p.date.toDate() : new Date(p.date);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` === month;
  });

  const monthTickets = ticketSales.filter(t => {
    if (!t.date) return false;
    const d = t.date?.toDate ? t.date.toDate() : new Date(t.date);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` === month;
  });

  const monthAdminRevs = adminRevenues.filter(r => {
    if (!r.date) return false;
    const d = r.date?.toDate ? r.date.toDate() : new Date(r.date);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` === month;
  });

  const monthAdminExps = adminExpenses.filter(e => {
    const val = e.date || e.createdAt;
    if (!val) return false;
    const d = val?.toDate ? val.toDate() : new Date(val);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` === month;
  });

  const totalPayments = monthPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const totalTicketsRevenue = monthTickets.reduce((s, t) => s + (Number(t.total) || (Number(t.quantity) * Number(t.ticketPrice)) || 0), 0);
  // Direct admin revenues (excluding internal cash transfers/drops from cafe to avoid double-counting)
  const totalAdminRevenues = monthAdminRevs
    .filter(r => !r.isCafeTransfer && r.category !== 'cafe' && !r.isDirectAdminPayment && !r.paymentId)
    .reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const totalAdminExpenses = monthAdminExps
    .filter(e => !e.salaryMonth && e.category !== 'رواتب وأجور')
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const allRevenues = monthShifts.flatMap(s => s.revenues || []);
  const allExpenses = monthShifts.flatMap(s => s.expenses || []);
  const totalExtraRevenue = allRevenues.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalSalariesPaid = monthSalaries
    .filter(sal => sal.disbursed)
    .reduce((s, sal) => s + (Number(sal.net) || 0), 0);

  // Month Cafe Shifts Aggregation
  const monthCafeShifts = cafeShifts.filter(s => {
    if (!s.openedAt) return false;
    const d = s.openedAt.toDate ? s.openedAt.toDate() : new Date(s.openedAt);
    return (d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0')) === month;
  });
  const totalCafeRevenue = monthCafeShifts.reduce((s, c) => s + (Number(c.totalSales) || 0), 0);
  const totalCafeExpenses = monthCafeShifts.reduce((s, c) => s + (Number(c.totalExpenses) || 0), 0);

  const totalExpenses = allExpenses.reduce((s, e) => s + Number(e.amount || 0), 0) + totalSalariesPaid + totalCafeExpenses + totalAdminExpenses;

  // Unified Comprehensive Total Revenue (Including Cafe Shifts)
  const totalRevenue = totalPayments + totalTicketsRevenue + totalExtraRevenue + totalAdminRevenues + totalCafeRevenue;
  const net = totalRevenue - totalExpenses;

  // Group expenses by category
  const expenseByCategory = {};
  allExpenses.forEach(e => {
    const cat = EXPENSE_CATEGORIES.find(c => c.value === e.type)?.label || e.type || 'نثريات';
    expenseByCategory[cat] = (expenseByCategory[cat] || 0) + Number(e.amount || 0);
  });
  monthAdminExps.forEach(e => {
    if (e.salaryMonth || e.category === 'رواتب وأجور') return;
    const cat = e.category || 'مصروفات إدارة وعقود';
    expenseByCategory[cat] = (expenseByCategory[cat] || 0) + Number(e.amount || 0);
  });
  if (totalSalariesPaid > 0) {
    expenseByCategory['رواتب وأجور'] = (expenseByCategory['رواتب وأجور'] || 0) + totalSalariesPaid;
  }

  const revenueByCategory = {
    'اشتراكات وباقات': totalPayments,
    'مبيعات كافيه TFG | CAFE': totalCafeRevenue,
    'تذاكر وأنشطة فردية': totalTicketsRevenue,
    'إيرادات إدارية وعقود': totalAdminRevenues
  };
  allRevenues.forEach(r => {
    const cat = REVENUE_CATEGORIES.find(c => c.value === r.type)?.label || r.label || r.title || r.type || 'إيرادات أخرى';
    revenueByCategory[cat] = (revenueByCategory[cat] || 0) + Number(r.amount || 0);
  });

  // 2. MASTER AUDIT LEDGER COMPILATION (All Items Across All Shifts)
  const shiftMap = useMemo(() => new Map(shifts.map(s => [s.id, s])), [shifts]);

  const masterLedger = useMemo(() => {
    const list = [];

    shifts.forEach(shift => {
      const sDate = shift.openedAt ? (shift.openedAt.toDate ? shift.openedAt.toDate() : new Date(shift.openedAt)) : new Date();
      const sMonth = `${sDate.getFullYear()}-${String(sDate.getMonth()+1).padStart(2,'0')}`;

      // A. Shift Expenses
      (shift.expenses || []).forEach(exp => {
        list.push({
          id: exp.id || Math.random().toString(),
          type: 'expense',
          typeLabel: 'مصروف',
          category: EXPENSE_CATEGORIES.find(c => c.value === exp.type)?.label || exp.type || 'مصروف إداري / تشغيلي',
          title: exp.label || exp.title || 'مصروف',
          amount: Number(exp.amount || 0),
          date: exp.date || sDate,
          month: sMonth,
          shiftId: shift.id,
          employeeName: shift.employeeName || '—',
          isAdminShift: shift.employeeId === 'ADMIN' || shift.isAdminShift,
          shiftStatus: shift.status
        });
      });

      // B. Shift Side Revenues
      (shift.revenues || []).forEach(rev => {
        list.push({
          id: rev.id || Math.random().toString(),
          type: 'revenue',
          typeLabel: 'إيراد جانبي',
          category: REVENUE_CATEGORIES.find(c => c.value === rev.type)?.label || rev.type || 'إيراد كافيه / خدمات',
          title: rev.title || rev.label || 'إيراد جانبي',
          amount: Number(rev.amount || 0),
          date: rev.date || sDate,
          month: sMonth,
          shiftId: shift.id,
          employeeName: shift.employeeName || '—',
          isAdminShift: shift.employeeId === 'ADMIN' || shift.isAdminShift,
          shiftStatus: shift.status
        });
      });
    });

    // C. Client Payments
    payments.forEach(p => {
      const pDate = p.date ? (p.date.toDate ? p.date.toDate() : new Date(p.date)) : new Date();
      const pMonth = `${pDate.getFullYear()}-${String(pDate.getMonth()+1).padStart(2,'0')}`;
      const parentShift = shiftMap.get(p.shiftId);

      list.push({
        id: p.id,
        type: 'revenue',
        typeLabel: 'دفعة اشتراك',
        category: 'اشتراكات وباقات',
        title: `دفعة اشتراك للعميل: ${p.clientName || 'عميل'} (${p.note || 'سداد'})`,
        amount: Number(p.amount || 0),
        date: pDate,
        month: pMonth,
        shiftId: p.shiftId || null,
        employeeName: parentShift ? parentShift.employeeName : 'الإدارة المباشرة',
        isAdminShift: !parentShift || parentShift.employeeId === 'ADMIN',
        shiftStatus: parentShift ? parentShift.status : 'closed'
      });
    });

    // D. Ticket Sales
    ticketSales.forEach(t => {
      const tDate = t.date ? (t.date.toDate ? t.date.toDate() : new Date(t.date)) : new Date();
      const tMonth = `${tDate.getFullYear()}-${String(tDate.getMonth()+1).padStart(2,'0')}`;
      const parentShift = shiftMap.get(t.shiftId);

      list.push({
        id: t.id,
        type: 'revenue',
        typeLabel: 'تذكرة دخول',
        category: 'مبيعات التذاكر',
        title: `بيع ${t.templateName || t.type || 'تذكرة دخول يومية'}`,
        amount: Number(t.price || t.amount || 0),
        date: tDate,
        month: tMonth,
        shiftId: t.shiftId || null,
        employeeName: parentShift ? parentShift.employeeName : (t.soldByName || '—'),
        isAdminShift: parentShift?.employeeId === 'ADMIN',
        shiftStatus: parentShift ? parentShift.status : 'closed'
      });
    });

    // E. Central Safe Expenses
    adminExpenses.forEach(ae => {
      const aeDate = ae.date ? (ae.date.toDate ? ae.date.toDate() : new Date(ae.date)) : new Date();
      const aeMonth = `${aeDate.getFullYear()}-${String(aeDate.getMonth()+1).padStart(2,'0')}`;

      list.push({
        id: ae.id,
        type: 'expense',
        typeLabel: 'مصروف إدارة مركزي',
        category: ae.category || 'مصروفات إدارة وعقود',
        title: ae.title || ae.description || 'مصروف من الخزينة المركزية',
        amount: Number(ae.amount || 0),
        date: aeDate,
        month: aeMonth,
        shiftId: null,
        employeeName: 'الخزينة المركزية (الإدارة)',
        isAdminShift: true,
        shiftStatus: 'closed'
      });
    });

    // E. Cafe Shifts Sales & Expenses
    cafeShifts.forEach(cs => {
      const cDate = cs.openedAt ? (cs.openedAt.toDate ? cs.openedAt.toDate() : new Date(cs.openedAt)) : new Date();
      const cMonth = `${cDate.getFullYear()}-${String(cDate.getMonth()+1).padStart(2,'0')}`;
      const cSales = Number(cs.totalSales || 0);
      const cExp = Number(cs.totalExpenses || 0);

      if (cSales > 0) {
        list.push({
          id: `cafe-sale-${cs.id}`,
          type: 'revenue',
          typeLabel: 'مبيعات كافيه',
          category: 'مبيعات كافيه TFG | CAFE',
          title: `مبيعات وردية كافيه #${cs.id.slice(-4)} (${cs.baristaName || 'باريستا'})`,
          amount: cSales,
          date: cDate,
          month: cMonth,
          shiftId: cs.id,
          employeeName: cs.baristaName || 'باريستا الكافيه',
          isAdminShift: false,
          shiftStatus: cs.status || 'closed'
        });
      }

      if (cExp > 0) {
        list.push({
          id: `cafe-exp-${cs.id}`,
          type: 'expense',
          typeLabel: 'مصروف كافيه',
          category: 'مصروفات كافيه TFG | CAFE',
          title: `مصروفات وردية كافيه #${cs.id.slice(-4)} (${cs.baristaName || 'باريستا'})`,
          amount: cExp,
          date: cDate,
          month: cMonth,
          shiftId: cs.id,
          employeeName: cs.baristaName || 'باريستا الكافيه',
          isAdminShift: false,
          shiftStatus: cs.status || 'closed'
        });
      }
    });

    return list;
  }, [shifts, payments, ticketSales, adminExpenses, shiftMap, cafeShifts]);

  // FILTERED LEDGER RESULTS
  const filteredLedger = useMemo(() => {
    return masterLedger.filter(item => {
      // Month filter
      if (!searchAllTime && item.month !== searchMonth) return false;
      // Type filter
      if (searchType !== 'all' && item.type !== searchType) return false;
      // Category filter
      if (selectedCategory !== 'all' && !item.category.includes(selectedCategory) && item.category !== selectedCategory) return false;
      // Keyword search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = item.title?.toLowerCase().includes(q);
        const matchCat = item.category?.toLowerCase().includes(q);
        const matchEmp = item.employeeName?.toLowerCase().includes(q);
        const matchAmount = String(item.amount).includes(q);
        if (!matchTitle && !matchCat && !matchEmp && !matchAmount) return false;
      }
      return true;
    }).sort((a, b) => {
      const da = a.date?.getTime ? a.date.getTime() : new Date(a.date).getTime();
      const db = b.date?.getTime ? b.date.getTime() : new Date(b.date).getTime();
      return db - da;
    });
  }, [masterLedger, searchAllTime, searchMonth, searchType, selectedCategory, searchQuery]);

  const totalFilteredAmount = filteredLedger.reduce((sum, item) => sum + item.amount, 0);
  const totalFilteredExpenses = filteredLedger.filter(i => i.type === 'expense').reduce((sum, i) => sum + i.amount, 0);
  const totalFilteredRevenues = filteredLedger.filter(i => i.type === 'revenue').reduce((sum, i) => sum + i.amount, 0);

  // EXPORT AUDIT SEARCH RESULTS TO EXCEL
  const handleExportSearchExcel = () => {
    const headers = ['#', 'النوع', 'البيان / تفاصيل البند', 'التصنيف', 'المبلغ (ج.م)', 'التاريخ والوقت', 'المسؤول / المناوبة', 'حالة المناوبة'];
    const rows = filteredLedger.map((item, idx) => [
      idx + 1,
      item.typeLabel,
      item.title,
      item.category,
      item.amount,
      item.date ? formatDateTime(item.date) : '—',
      item.isAdminShift ? `👑 مناوبة الإدارة (${item.employeeName})` : item.employeeName,
      item.shiftStatus === 'open' ? 'مفتوحة 🟢' : 'مغلقة 🔒'
    ]);

    exportToExcel(`تقرير_تدقيق_البنود_${searchQuery ? searchQuery + '_' : ''}${searchAllTime ? 'كافة_الأوقات' : searchMonth}`, headers, rows);
  };

  // Full Year Metrics for Year-End Closing
  const selectedYear = month.split('-')[0] || new Date().getFullYear().toString();
  const yearPayments = payments.filter(p => {
    if (!p.date || p.isVoided) return false;
    const d = p.date?.toDate ? p.date.toDate() : new Date(p.date);
    return String(d.getFullYear()) === selectedYear;
  });
  const yearTickets = ticketSales.filter(t => {
    if (!t.date) return false;
    const d = t.date?.toDate ? t.date.toDate() : new Date(t.date);
    return String(d.getFullYear()) === selectedYear;
  });
  const yearAdminRevs = adminRevenues.filter(r => {
    if (!r.date || r.isCafeTransfer || r.category === 'cafe') return false;
    const d = r.date?.toDate ? r.date.toDate() : new Date(r.date);
    return String(d.getFullYear()) === selectedYear;
  });
  const yearAdminExps = adminExpenses.filter(e => {
    if (!e.date) return false;
    const d = e.date?.toDate ? e.date.toDate() : new Date(e.date);
    return String(d.getFullYear()) === selectedYear;
  });
  const yearShifts = shifts.filter(s => {
    if (!s.openedAt) return false;
    const d = s.openedAt?.toDate ? s.openedAt.toDate() : new Date(s.openedAt);
    return String(d.getFullYear()) === selectedYear;
  });
  const yearCafeShifts = cafeShifts.filter(s => {
    if (!s.openedAt) return false;
    const d = s.openedAt?.toDate ? s.openedAt.toDate() : new Date(s.openedAt);
    return String(d.getFullYear()) === selectedYear;
  });

  const yearTotalPayments = yearPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const yearTotalTickets = yearTickets.reduce((s, t) => s + (Number(t.total) || (Number(t.quantity) * Number(t.ticketPrice)) || 0), 0);
  const yearTotalAdminRevenues = yearAdminRevs.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const yearTotalAdminExpenses = yearAdminExps.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const yearTotalExtraRevenue = yearShifts.flatMap(s => s.revenues || []).reduce((s, r) => s + Number(r.amount || 0), 0);
  const yearTotalShiftExpenses = yearShifts.flatMap(s => s.expenses || []).reduce((s, e) => s + Number(e.amount || 0), 0);
  const yearCafeRevenue = yearCafeShifts.reduce((s, c) => s + (Number(c.totalSales) || 0), 0);
  const yearCafeExpenses = yearCafeShifts.reduce((s, c) => s + (Number(c.totalExpenses) || 0), 0);

  const yearTotalRevenue = yearTotalPayments + yearTotalTickets + yearTotalAdminRevenues + yearTotalExtraRevenue + yearCafeRevenue;
  const yearTotalExpenses = yearTotalShiftExpenses + totalSalariesPaid + yearCafeExpenses + yearTotalAdminExpenses;
  const yearNetProfit = yearTotalRevenue - yearTotalExpenses;

  // Real client receivables & Petty cash float balance
  const totalDebtsOnClients = clients.reduce((sum, c) => {
    const debt = Number(c.balanceDue) > 0 ? Number(c.balanceDue) : Math.max(0, (Number(c.packagePrice) || 0) - (Number(c.totalPaid) || 0));
    return sum + debt;
  }, 0);
  const pettyCashBalance = pettyCashFunds.reduce((sum, m) => sum + (m.type === 'deposit' ? (Number(m.amount) || 0) : -(Number(m.amount) || 0)), 0);

  // Export monthly financial summary to Excel
  const handleExportMonthlySummary = () => {
    const summarySheets = [
      {
        sheetName: 'ملخص الحسابات الشهرية',
        headers: ['البند المالي', 'القيمة (ج.م)'],
        rows: [
          ['إيرادات الاشتراكات والباقات', totalPayments],
          ['إيرادات التذاكر والأنشطة الفردية', totalTicketsRevenue],
          ['إيرادات إدارية وعقود مركزية', totalAdminRevenues],
          ['إيرادات إضافية بالمناوبات والكافيه', totalExtraRevenue + totalCafeRevenue],
          ['إجمالي الإيرادات الشاملة', totalRevenue],
          ['مصروفات المناوبات والكافيه', allExpenses.reduce((s, e) => s + Number(e.amount || 0), 0) + totalCafeExpenses],
          ['مصروفات الإدارة والعقود المركزية', totalAdminExpenses],
          ['إجمالي الرواتب والأجور الشهرية', totalSalariesPaid],
          ['إجمالي المصروفات والتشغيل الشاملة', totalExpenses],
          ['الصافي النهائي للشهر', net]
        ]
      },
      {
        sheetName: 'تفصيل المصروفات حسب التصنيف',
        headers: ['تصنيف المصروف', 'القيمة الإجمالية (ج.م)'],
        rows: Object.entries(expenseByCategory).map(([cat, val]) => [cat, val])
      }
    ];
    exportToExcel(`التقرير_المالي_الشهري_${month}`, summarySheets);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top View Mode Switcher */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ color: '#ffffff', fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>📊</span> الإدارة المالية والتدقيق
          </h2>
          <p style={{ color: '#93c5fd', fontSize: 13, margin: '4px 0 0' }}>
            التقارير المالية الشهرية، الأرباح، والبحث التفصيلي في كافة بنود المصروفات والإيرادات
          </p>
        </div>

        <div style={{ display: 'flex', gap: 6, background: 'var(--bg-surface)', padding: 4, borderRadius: 12, border: '1px solid var(--border)' }}>
          <button
            onClick={() => setViewMode('summary')}
            style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
              background: viewMode === 'summary' ? 'linear-gradient(135deg, #1d4ed8, #3b82f6)' : 'transparent',
              color: viewMode === 'summary' ? '#ffffff' : '#94a3b8',
              boxShadow: viewMode === 'summary' ? '0 0 12px rgba(59,130,246,0.3)' : 'none'
            }}
          >
            📊 التقرير المالي والأرباح
          </button>
          <button
            onClick={() => setViewMode('search_ledger')}
            style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
              background: viewMode === 'search_ledger' ? 'linear-gradient(135deg, #d97706, #f59e0b)' : 'transparent',
              color: viewMode === 'search_ledger' ? '#000000' : '#94a3b8',
              boxShadow: viewMode === 'search_ledger' ? '0 0 12px rgba(245,158,11,0.3)' : 'none'
            }}
          >
            🔍 دفتر التدقيق والبحث في البنود
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 1. SUMMARY VIEW MODE */}
      {/* ========================================================= */}
      {viewMode === 'summary' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, background: 'var(--bg-surface)', padding: '12px 16px', borderRadius: 14, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ color: '#c8dcf5', fontSize: 14 }}>
                📅 تقرير شهر: <strong style={{ color: '#ffffff' }}>{getMonthLabel(month)}</strong> — <strong style={{ color: '#60a5fa' }}>{monthShifts.length}</strong> مناوبة مسجلة
              </span>
              <input
                type="month"
                value={month}
                onChange={e => setMonth(e.target.value)}
                style={{
                  background: '#0a162b', border: '1px solid var(--border)',
                  borderRadius: 10, padding: '7px 12px', color: '#ffffff',
                  fontFamily: 'Cairo, sans-serif', fontSize: 13, outline: 'none',
                }}
              />
            </div>

            {/* Accounting Tools Action Bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Button
                size="sm"
                onClick={() => setTrialBalanceOpen(true)}
                style={{ background: 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff', fontWeight: 800 }}
              >
                📊 ميزان المراجعة
              </Button>
              <Button
                size="sm"
                onClick={() => setPettyCashOpen(true)}
                style={{ background: 'linear-gradient(135deg, #0d9488, #14b8a6)', color: '#fff', fontWeight: 800 }}
              >
                🏦 العهدة وخزينة الإدارة
              </Button>
              <Button
                size="sm"
                onClick={() => setYearEndOpen(true)}
                style={{ background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)', color: '#fff', fontWeight: 800 }}
              >
                📅 تقفيل السنة ({selectedYear})
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleExportMonthlySummary}
                style={{ border: '1px solid #059669', color: '#34d399', fontWeight: 800 }}
              >
                📥 إكسل شهري
              </Button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <StatCard icon="💳" label="إيرادات الاشتراكات" value={formatCurrency(totalPayments)} color="green" />
            <StatCard icon="🏪" label="إيرادات إضافية وكافيه" value={formatCurrency(totalExtraRevenue)} color="blue" />
            <StatCard icon="💸" label="إجمالي المصاريف" value={formatCurrency(totalExpenses)} color="red" />
            <StatCard icon="✨" label="الصافي النهائي" value={formatCurrency(net)} color={net >= 0 ? 'green' : 'red'} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 20 }}>
            {/* Revenue breakdown */}
            <Card style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <h3 style={{ color: '#34d399', fontWeight: 700, fontSize: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>📈</span> تفصيل الإيرادات
              </h3>
              {Object.keys(revenueByCategory).length === 0 ? (
                <EmptyState icon="📈" message="لا توجد إيرادات مسجلة" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {Object.entries(revenueByCategory).map(([cat, amount]) => (
                    <div
                      key={cat}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '12px 14px', borderRadius: 12,
                        background: 'rgba(16, 185, 129, 0.08)',
                        border: '1px solid rgba(16, 185, 129, 0.2)',
                      }}
                    >
                      <span style={{ color: '#c8dcf5', fontSize: 14 }}>{cat}</span>
                      <span style={{ color: '#34d399', fontWeight: 800, fontSize: 15 }}>{formatCurrency(amount)}</span>
                    </div>
                  ))}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '14px 16px', borderRadius: 12,
                    background: 'rgba(16, 185, 129, 0.18)',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    marginTop: 4,
                  }}>
                    <span style={{ color: '#ffffff', fontWeight: 700, fontSize: 15 }}>إجمالي الإيرادات</span>
                    <span style={{ color: '#6ee7b7', fontWeight: 900, fontSize: 18 }}>{formatCurrency(totalRevenue)}</span>
                  </div>
                </div>
              )}
            </Card>

            {/* Expense breakdown */}
            <Card style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <h3 style={{ color: '#f87171', fontWeight: 700, fontSize: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>📉</span> تفصيل المصاريف
              </h3>
              {Object.keys(expenseByCategory).length === 0 ? (
                <EmptyState icon="📉" message="لا توجد مصاريف مسجلة" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {Object.entries(expenseByCategory).map(([cat, amount]) => (
                    <div
                      key={cat}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '12px 14px', borderRadius: 12,
                        background: 'rgba(239, 68, 68, 0.08)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                      }}
                    >
                      <span style={{ color: '#c8dcf5', fontSize: 14 }}>{cat}</span>
                      <span style={{ color: '#f87171', fontWeight: 800, fontSize: 15 }}>{formatCurrency(amount)}</span>
                    </div>
                  ))}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '14px 16px', borderRadius: 12,
                    background: 'rgba(239, 68, 68, 0.18)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    marginTop: 4,
                  }}>
                    <span style={{ color: '#ffffff', fontWeight: 700, fontSize: 15 }}>إجمالي المصاريف</span>
                    <span style={{ color: '#fca5a5', fontWeight: 900, fontSize: 18 }}>{formatCurrency(totalExpenses)}</span>
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* Net summary */}
          <Card
            style={{
              background: net >= 0 ? 'rgba(59, 130, 246, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              border: `1px solid ${net >= 0 ? 'rgba(59, 130, 246, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
              boxShadow: net >= 0 ? '0 0 30px rgba(59, 130, 246, 0.15)' : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <span style={{ color: '#ffffff', fontSize: 16, fontWeight: 700 }}>🏆 الصافي النهائي للشهر</span>
              <span style={{ fontSize: 26, fontWeight: 900, color: net >= 0 ? '#60a5fa' : '#f87171' }}>
                {formatCurrency(net)}
              </span>
            </div>
          </Card>
        </>
      )}

      {/* ========================================================= */}
      {/* 2. SEARCH & AUDIT LEDGER VIEW MODE */}
      {/* ========================================================= */}
      {viewMode === 'search_ledger' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Search Controls Card */}
          <Card style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '18px 20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, alignItems: 'center' }}>
              <Input
                label="بحث بكلمة مفتاحية (بند، اسم، فاتورة...)"
                placeholder="مثال: كهرباء، إنترنت، إيجار، شاي، صيانة..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />

              <Select
                label="نوع المعاملة"
                value={searchType}
                onChange={e => setSearchType(e.target.value)}
              >
                <option value="all">الكل (مصروفات وإيرادات)</option>
                <option value="expense">📉 المصروفات فقط</option>
                <option value="revenue">📈 الإيرادات والاشتراكات فقط</option>
              </Select>

              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#94a3b8', marginBottom: 6, fontWeight: 600 }}>
                  تاريخ البحث
                </label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="month"
                    value={searchMonth}
                    disabled={searchAllTime}
                    onChange={e => setSearchMonth(e.target.value)}
                    style={{
                      flex: 1, background: 'var(--bg-surface)', border: '1px solid var(--border)',
                      borderRadius: 10, padding: '7px 12px', color: searchAllTime ? '#64748b' : '#ffffff',
                      fontFamily: 'Cairo, sans-serif', fontSize: 13, outline: 'none',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setSearchAllTime(!searchAllTime)}
                    style={{
                      padding: '7px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                      border: searchAllTime ? '1px solid #3b82f6' : '1px solid var(--border)',
                      background: searchAllTime ? 'linear-gradient(135deg, #1d4ed8, #3b82f6)' : 'rgba(255,255,255,0.05)',
                      color: searchAllTime ? '#fff' : '#94a3b8', cursor: 'pointer'
                    }}
                  >
                    {searchAllTime ? 'كافة الشهور ♾️' : 'شهر محدد 📅'}
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Keyword Shortcuts Bar */}
            <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>اختصارات شائعة:</span>
              {['كهرباء', 'إنترنت', 'إيجار', 'بوفيه', 'نظافة', 'صيانة', 'مرتبات', 'كافيه', 'اشتراك'].map(tag => (
                <button
                  key={tag}
                  onClick={() => setSearchQuery(tag)}
                  style={{
                    background: searchQuery === tag ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255,255,255,0.05)',
                    border: searchQuery === tag ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                    color: searchQuery === tag ? '#60a5fa' : '#cbd5e1',
                    borderRadius: 8, padding: '3px 10px', fontSize: 11, cursor: 'pointer'
                  }}
                >
                  {tag}
                </button>
              ))}
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{ background: 'transparent', border: 'none', color: '#f87171', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}
                >
                  مسح البحث ✕
                </button>
              )}
            </div>
          </Card>

          {/* Search Result Summary Banner */}
          <Card style={{
            background: 'linear-gradient(135deg, rgba(30, 58, 138, 0.25) 0%, var(--bg-card) 100%)',
            border: '1px solid rgba(59, 130, 246, 0.35)', padding: '16px 20px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
              <div>
                <h3 style={{ margin: 0, color: '#fff', fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>🔍</span> نتائج تدقيق البند: <strong style={{ color: '#fbbf24' }}>{searchQuery || 'كافة البنود'}</strong>
                </h3>
                <p style={{ margin: '4px 0 0', color: '#93c5fd', fontSize: 12 }}>
                  الفترة: <strong>{searchAllTime ? 'كافة الأوقات والشهور' : getMonthLabel(searchMonth)}</strong> — تم العثور على <strong style={{ color: '#fff' }}>{filteredLedger.length}</strong> حركة مالية مسجلة
                </p>
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ background: 'rgba(255,255,255,0.06)', padding: '6px 14px', borderRadius: 10, textAlign: 'center' }}>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>إجمالي المبلغ المبحوث</span>
                  <strong style={{ display: 'block', fontSize: 16, color: '#34d399', marginTop: 2 }}>{formatCurrency(totalFilteredAmount)}</strong>
                </div>

                <Button size="sm" onClick={handleExportSearchExcel} style={{ background: 'linear-gradient(135deg, #059669, #10b981)', color: '#fff', fontWeight: 800 }}>
                  📥 تصدير النتائج Excel
                </Button>
              </div>
            </div>
          </Card>

          {/* Results Table */}
          {filteredLedger.length === 0 ? (
            <EmptyState icon="🔍" message="لا توجد حركات مالية مطابقة لبحثك في هذه الفترة" />
          ) : (
            <Card style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid var(--border)', color: '#94a3b8' }}>
                      <th style={{ padding: '12px 16px' }}>#</th>
                      <th style={{ padding: '12px 16px' }}>النوع</th>
                      <th style={{ padding: '12px 16px' }}>البيان / تفاصيل البند</th>
                      <th style={{ padding: '12px 16px' }}>التصنيف</th>
                      <th style={{ padding: '12px 16px' }}>المبلغ</th>
                      <th style={{ padding: '12px 16px' }}>التاريخ والوقت</th>
                      <th style={{ padding: '12px 16px' }}>المناوبة / المسؤول</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLedger.slice(0, ledgerDisplayLimit).map((item, idx) => (
                      <tr
                        key={item.id + '_' + idx}
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'
                        }}
                      >
                        <td style={{ padding: '12px 16px', color: '#64748b', fontWeight: 700 }}>{idx + 1}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <Badge color={item.type === 'expense' ? 'red' : 'green'}>
                            {item.type === 'expense' ? '📉 مصروف' : '📈 إيراد'}
                          </Badge>
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#f8fafc' }}>
                          {item.title}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#93c5fd' }}>
                          {item.category}
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 800, fontSize: 14, color: item.type === 'expense' ? '#f87171' : '#34d399' }}>
                          {item.type === 'expense' ? '-' : '+'}{formatCurrency(item.amount)}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#cbd5e1', fontSize: 12 }}>
                          {item.date ? formatDateTime(item.date) : '—'}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ color: item.isAdminShift ? '#fbbf24' : '#ffffff', fontWeight: 600 }}>
                              {item.isAdminShift ? '👑 مناوبة الإدارة' : item.employeeName}
                            </span>
                            {item.shiftStatus === 'open' && <span style={{ fontSize: 10, color: '#34d399' }}>● مفتوحة</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredLedger.length > ledgerDisplayLimit && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: '16px 0', flexWrap: 'wrap' }}>
                  <Button size="sm" variant="secondary" onClick={() => setLedgerDisplayLimit(prev => prev + 50)}>
                    ⬇️ عرض 50 حركة إضافية (المتبقي: {filteredLedger.length - ledgerDisplayLimit} حركة)
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setLedgerDisplayLimit(filteredLedger.length)}>
                    عرض كامل السجلات ({filteredLedger.length})
                  </Button>
                </div>
              )}
            </Card>
          )}
        </div>
      )}
      {/* Trial Balance Modal */}
      {trialBalanceOpen && (
        <TrialBalanceModal
          isOpen={true}
          onClose={() => setTrialBalanceOpen(false)}
          data={{
            month,
            totalAssetsValue: assets.reduce((s, a) => s + (Number(a.cost) || 0), 0),
            totalDebtsOnClients,
            pettyCashBalance,
            totalDueToVendors: vendors.reduce((s, v) => s + (Number(v.balanceDue) || 0), 0),
            initialCapital: Number(capitalSettings?.initialCapital) || 0,
            totalRevenue,
            totalExpenses: totalExpenses - totalSalariesPaid,
            totalSalaries: totalSalariesPaid,
            netProfit: net
          }}
        />
      )}

      {/* Petty Cash Modal */}
      {pettyCashOpen && (
        <PettyCashModal
          isOpen={true}
          onClose={() => setPettyCashOpen(false)}
        />
      )}

      {/* Year End Closing Modal */}
      {yearEndOpen && (
        <YearEndClosingModal
          isOpen={true}
          onClose={() => setYearEndOpen(false)}
          currentYearData={{
            year: selectedYear,
            totalRevenue: yearTotalRevenue,
            totalExpenses: yearTotalExpenses,
            netProfit: yearNetProfit,
            snapshot: { 
              year: selectedYear, 
              totalRevenue: yearTotalRevenue, 
              totalExpenses: yearTotalExpenses, 
              netProfit: yearNetProfit,
              totalSalariesPaid 
            }
          }}
        />
      )}
    </div>
  );
}
