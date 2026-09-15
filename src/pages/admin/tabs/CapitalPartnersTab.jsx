import React, { useState, useEffect, useMemo } from 'react';
import { 
  getCapitalSettings, updateCapitalSettings, getPartners, addPartner, updatePartner, deletePartner,
  getPartnerTransactions, addPartnerTransaction, deletePartnerTransaction, getAssets, getAllShifts,
  getAdminExpenses, getAdminRevenues, getCafeShifts, distributeMonthlyPartnerDividends
} from '../../../services/db';
import { Card, Button, Input, Modal, Badge, EmptyState } from '../../../components/ui';
import { formatCurrency, formatDateTime, formatDate, getCurrentMonth, getMonthLabel } from '../../../utils/constants';
import { exportToExcel } from '../../../utils/excelExport';

export default function CapitalPartnersTab({ shiftId, employeeId }) {
  const [settings, setSettings] = useState({
    initialCapital: 0,
    securityDeposit: 0,
    prepaidRent: 0,
    operatingReserveTarget: 20000,
    startDate: new Date().toISOString().split('T')[0]
  });
  const [partners, setPartners] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [assets, setAssets] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [cafeShifts, setCafeShifts] = useState([]);
  const [adminExpenses, setAdminExpenses] = useState([]);
  const [adminRevenues, setAdminRevenues] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [settingsModal, setSettingsModal] = useState(false);
  const [partnerModal, setPartnerModal] = useState(false);
  const [editPartner, setEditPartner] = useState(null);
  const [withdrawModal, setWithdrawModal] = useState(null); // Partner object
  const [distributeModal, setDistributeModal] = useState(false);

  // Forms
  const [settingsForm, setSettingsForm] = useState({
    initialCapital: '',
    securityDeposit: '',
    operatingReserveTarget: '',
    startDate: ''
  });
  const [partnerForm, setPartnerForm] = useState({
    name: '',
    phone: '',
    capitalContributed: '',
    equityPercentage: '',
    notes: ''
  });
  const [withdrawForm, setWithdrawForm] = useState({
    amount: '',
    month: getCurrentMonth(),
    notes: ''
  });
  const [distributeMonth, setDistributeMonth] = useState(getCurrentMonth());
  const [distributeReservePercent, setDistributeReservePercent] = useState(10);
  const [distributeNotes, setDistributeNotes] = useState('');
  const [generatedVouchers, setGeneratedVouchers] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const unsubSet = getCapitalSettings(data => {
      setSettings(data);
      setSettingsForm({
        initialCapital: String(data.initialCapital || 0),
        securityDeposit: String(data.securityDeposit || 0),
        operatingReserveTarget: String(data.operatingReserveTarget || 20000),
        startDate: data.startDate || new Date().toISOString().split('T')[0]
      });
    });
    const unsubP = getPartners(setPartners);
    const unsubT = getPartnerTransactions(setTransactions);
    const unsubA = getAssets(setAssets);
    const unsubS = getAllShifts(data => {
      setShifts(data);
      setLoading(false);
    });
    const unsubCafe = getCafeShifts(setCafeShifts);
    const unsubAE = getAdminExpenses(setAdminExpenses);
    const unsubAR = getAdminRevenues(setAdminRevenues);

    return () => { 
      unsubSet(); unsubP(); unsubT(); unsubA(); unsubS(); 
      unsubCafe && unsubCafe(); unsubAE && unsubAE(); unsubAR && unsubAR(); 
    };
  }, []);

  // 1. FINANCIAL & ROI METRICS
  const totalAssetsValue = useMemo(() => assets.reduce((sum, a) => sum + (Number(a.cost) || 0), 0), [assets]);
  const securityDeposit = Number(settings.securityDeposit) || 0;
  const initialCash = Number(settings.initialCapital) || 0;
  const totalInvestedCapital = totalAssetsValue + securityDeposit + initialCash;

  // Lifetime Cumulative Profit (Unified: Workspace Shifts + Cafe Shifts + Admin Revenues - Admin Expenses)
  const lifetimeShiftRev = useMemo(() => shifts.reduce((s, sh) => s + (Number(sh.totalRevenue) || 0), 0), [shifts]);
  const lifetimeCafeRev = useMemo(() => cafeShifts.reduce((s, c) => s + (Number(c.totalSales) || 0), 0), [cafeShifts]);
  const lifetimeAdminRev = useMemo(() => adminRevenues.filter(r => !r.isCafeTransfer && r.category !== 'cafe' && r.category !== 'إيداع رأس مال الشركاء').reduce((s, r) => s + (Number(r.amount) || 0), 0), [adminRevenues]);
  const lifetimeRevenue = lifetimeShiftRev + lifetimeCafeRev + lifetimeAdminRev;

  const lifetimeShiftExp = useMemo(() => shifts.reduce((s, sh) => s + (Number(sh.totalExpenses) || 0), 0), [shifts]);
  const lifetimeCafeExp = useMemo(() => cafeShifts.reduce((s, c) => s + (Number(c.totalExpenses) || 0), 0), [cafeShifts]);
  const lifetimeAdminExp = useMemo(() => adminExpenses.filter(e => e.category !== 'مسحوبات أرباح الشركاء' && e.category !== 'توزيعات أرباح الشركاء').reduce((s, e) => s + (Number(e.amount) || 0), 0), [adminExpenses]);
  const lifetimeExpenses = lifetimeShiftExp + lifetimeCafeExp + lifetimeAdminExp;

  const lifetimeNetProfit = lifetimeRevenue - lifetimeExpenses;

  // ROI % & Payback Period
  const isCapitalConfigured = totalInvestedCapital > 0;
  const isBrokenEven = isCapitalConfigured && lifetimeNetProfit >= totalInvestedCapital;
  const recoveryRate = isCapitalConfigured 
    ? Math.min(100, Math.round((Math.max(0, lifetimeNetProfit) / totalInvestedCapital) * 100)) 
    : 0;
  const remainingToBreakEven = isCapitalConfigured
    ? Math.max(0, totalInvestedCapital - Math.max(0, lifetimeNetProfit))
    : 0;

  // Current Month Performance
  const currentMonth = getCurrentMonth();
  const thisMonthShifts = useMemo(() => {
    return shifts.filter(s => {
      if (!s.openedAt) return false;
      const d = s.openedAt?.toDate ? s.openedAt.toDate() : new Date(s.openedAt);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === currentMonth;
    });
  }, [shifts, currentMonth]);

  const thisMonthShiftRev = thisMonthShifts.reduce((s, sh) => s + (Number(sh.totalRevenue) || 0), 0);
  const thisMonthCafeRev = useMemo(() => {
    return cafeShifts.filter(c => {
      if (!c.openedAt) return false;
      const d = c.openedAt?.toDate ? c.openedAt.toDate() : new Date(c.openedAt);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === currentMonth;
    }).reduce((s, c) => s + (Number(c.totalSales) || 0), 0);
  }, [cafeShifts, currentMonth]);
  const thisMonthAdminRev = useMemo(() => {
    return adminRevenues.filter(r => {
      const val = r.date || r.createdAt;
      if (!val || r.isCafeTransfer || r.category === 'cafe' || r.category === 'إيداع رأس مال الشركاء') return false;
      const d = val?.toDate ? val.toDate() : new Date(val);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === currentMonth;
    }).reduce((s, r) => s + (Number(r.amount) || 0), 0);
  }, [adminRevenues, currentMonth]);
  const thisMonthRevenue = thisMonthShiftRev + thisMonthCafeRev + thisMonthAdminRev;

  const thisMonthShiftExp = thisMonthShifts.reduce((s, sh) => s + (Number(sh.totalExpenses) || 0), 0);
  const thisMonthCafeExp = useMemo(() => {
    return cafeShifts.filter(c => {
      if (!c.openedAt) return false;
      const d = c.openedAt?.toDate ? c.openedAt.toDate() : new Date(c.openedAt);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === currentMonth;
    }).reduce((s, c) => s + (Number(c.totalExpenses) || 0), 0);
  }, [cafeShifts, currentMonth]);
  const thisMonthAdminExp = useMemo(() => {
    return adminExpenses.filter(e => {
      const val = e.date || e.createdAt;
      if (!val || e.category === 'مسحوبات أرباح الشركاء' || e.category === 'توزيعات أرباح الشركاء') return false;
      const d = val?.toDate ? val.toDate() : new Date(val);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === currentMonth;
    }).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  }, [adminExpenses, currentMonth]);
  const thisMonthExpenses = thisMonthShiftExp + thisMonthCafeExp + thisMonthAdminExp;

  const thisMonthNetProfit = thisMonthRevenue - thisMonthExpenses;

  // Months active for forecast
  const monthsActiveCount = useMemo(() => {
    if (!settings.startDate) return 1;
    const start = new Date(settings.startDate);
    const now = new Date();
    const diff = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + 1;
    return Math.max(1, diff);
  }, [settings.startDate]);

  const averageMonthlyProfit = monthsActiveCount > 0 ? (lifetimeNetProfit / monthsActiveCount) : 0;
  const forecastMonthsLeft = (averageMonthlyProfit > 0 && remainingToBreakEven > 0)
    ? Math.ceil(remainingToBreakEven / averageMonthlyProfit)
    : 0;

  // Total partner equity percentage sum
  const totalEquitySum = useMemo(() => partners.reduce((s, p) => s + (Number(p.equityPercentage) || 0), 0), [partners]);

  // Partner calculations
  const partnersWithFinancials = useMemo(() => {
    return partners.map(p => {
      const eqPercent = Number(p.equityPercentage) || 0;
      const lifetimeShare = Math.max(0, lifetimeNetProfit) * (eqPercent / 100);
      const currentMonthShare = Math.max(0, thisMonthNetProfit) * (eqPercent / 100);
      
      const partnerTx = transactions.filter(t => t.partnerId === p.id);
      const totalWithdrawn = partnerTx
        .filter(t => t.type === 'profit_withdrawal')
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      
      const currentBalance = Math.max(0, lifetimeShare - totalWithdrawn);

      return {
        ...p,
        lifetimeShare,
        currentMonthShare,
        totalWithdrawn,
        currentBalance,
        transactionsCount: partnerTx.length
      };
    });
  }, [partners, lifetimeNetProfit, thisMonthNetProfit, transactions]);

  // Month performance for automated dividend distributor
  const targetDistributeShifts = useMemo(() => {
    return shifts.filter(s => {
      if (!s.openedAt) return false;
      const d = s.openedAt?.toDate ? s.openedAt.toDate() : new Date(s.openedAt);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === distributeMonth;
    });
  }, [shifts, distributeMonth]);

  const targetDistributeCafeShifts = useMemo(() => {
    return cafeShifts.filter(c => {
      if (!c.openedAt) return false;
      const d = c.openedAt?.toDate ? c.openedAt.toDate() : new Date(c.openedAt);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === distributeMonth;
    });
  }, [cafeShifts, distributeMonth]);

  const targetDistributeAdminRev = useMemo(() => {
    return adminRevenues.filter(r => {
      const val = r.date || r.createdAt;
      if (!val || r.isCafeTransfer || r.category === 'cafe' || r.category === 'إيداع رأس مال الشركاء') return false;
      const d = val?.toDate ? val.toDate() : new Date(val);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === distributeMonth;
    }).reduce((s, r) => s + (Number(r.amount) || 0), 0);
  }, [adminRevenues, distributeMonth]);

  const distShiftRev = targetDistributeShifts.reduce((s, sh) => s + (Number(sh.totalRevenue) || 0), 0);
  const distCafeRev = targetDistributeCafeShifts.reduce((s, c) => s + (Number(c.totalSales) || 0), 0);
  const distTotalRev = distShiftRev + distCafeRev + targetDistributeAdminRev;

  const distShiftExp = targetDistributeShifts.reduce((s, sh) => s + (Number(sh.totalExpenses) || 0), 0);
  const distCafeExp = targetDistributeCafeShifts.reduce((s, c) => s + (Number(c.totalExpenses) || 0), 0);
  const distAdminExp = useMemo(() => {
    return adminExpenses.filter(e => {
      const val = e.date || e.createdAt;
      if (!val || e.category === 'مسحوبات أرباح الشركاء' || e.category === 'توزيعات أرباح الشركاء') return false;
      const d = val?.toDate ? val.toDate() : new Date(val);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === distributeMonth;
    }).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  }, [adminExpenses, distributeMonth]);
  const distTotalExp = distShiftExp + distCafeExp + distAdminExp;

  const distNetProfit = distTotalRev - distTotalExp;
  const distReserveAmount = Math.max(0, Math.round(distNetProfit * (distributeReservePercent / 100)));
  const distDistributableProfit = Math.max(0, distNetProfit - distReserveAmount);

  // Splits per partner with zero rounding leakage
  const partnerSplits = useMemo(() => {
    if (distDistributableProfit <= 0 || partners.length === 0) return [];
    let allocated = 0;
    return partners.map((p, idx) => {
      const eq = Number(p.equityPercentage) || 0;
      let amount = Math.round(distDistributableProfit * (eq / 100));
      if (idx === partners.length - 1) {
        amount = Math.max(0, distDistributableProfit - allocated);
      } else {
        allocated += amount;
      }
      return {
        partnerId: p.id,
        partnerName: p.name,
        equityPercentage: eq,
        amount
      };
    });
  }, [partners, distDistributableProfit]);

  const handleConfirmDistributeDividends = async () => {
    if (submitting) return;
    if (distDistributableProfit <= 0) {
      return alert('لا يوجد صافي ربح قابل للتوزيع عن هذا الشهر (صافي الربح أقل من أو يساوي صفر)');
    }
    if (partnerSplits.length === 0) {
      return alert('يرجى إضافة الشركاء أولاً');
    }
    if (!window.confirm(`هل أنت متأكد من اعتماد وتوزيع أرباح شهر (${getMonthLabel(distributeMonth)}) بقيمة إجمالية (${formatCurrency(distDistributableProfit)}) على الشركاء؟`)) {
      return;
    }

    setSubmitting(true);
    try {
      const vouchers = await distributeMonthlyPartnerDividends({
        month: distributeMonth,
        netProfit: distNetProfit,
        reservePercent: distributeReservePercent,
        reserveAmount: distReserveAmount,
        distributableProfit: distDistributableProfit,
        partnerSplits,
        notes: distributeNotes,
        actorName: 'الإدارة'
      });
      setGeneratedVouchers(vouchers);
      alert(`🎉 تم اعتماد وتوزيع أرباح شهر (${distributeMonth}) بنجاح وإصدار (${vouchers.length}) سند معتمد!`);
    } catch (err) {
      alert('حدث خطأ: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Handlers
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await updateCapitalSettings({
        initialCapital: Number(settingsForm.initialCapital) || 0,
        securityDeposit: Number(settingsForm.securityDeposit) || 0,
        operatingReserveTarget: Number(settingsForm.operatingReserveTarget) || 20000,
        startDate: settingsForm.startDate || new Date().toISOString().split('T')[0]
      });
      setSettingsModal(false);
      alert('✅ تم حفظ وضبط إعدادات رأس المال والتشغيل بنجاح!');
    } catch (err) {
      alert('حدث خطأ: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenPartnerModal = (partner = null) => {
    setEditPartner(partner);
    if (partner) {
      setPartnerForm({
        name: partner.name || '',
        phone: partner.phone || '',
        capitalContributed: String(partner.capitalContributed || ''),
        equityPercentage: String(partner.equityPercentage || ''),
        notes: partner.notes || ''
      });
    } else {
      const remainingPercent = Math.max(0, 100 - totalEquitySum);
      setPartnerForm({
        name: '',
        phone: '',
        capitalContributed: '',
        equityPercentage: remainingPercent > 0 ? String(remainingPercent) : '',
        notes: ''
      });
    }
    setPartnerModal(true);
  };

  const handleSavePartner = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const pData = {
        name: partnerForm.name.trim(),
        phone: partnerForm.phone.trim(),
        capitalContributed: Number(partnerForm.capitalContributed) || 0,
        equityPercentage: Number(partnerForm.equityPercentage) || 0,
        notes: partnerForm.notes || ''
      };
      if (selectedPartner) {
        await updatePartner(selectedPartner.id, pData);
        alert('✅ تم تعديل بيانات الشريك بنجاح!');
      } else {
        await addPartner(pData);
        alert('🎉 تم إضافة الشريك الجديد بنجاح!');
      }
      setPartnerModal(false);
      setSelectedPartner(null);
      setPartnerForm({ name: '', phone: '', capitalContributed: '', equityPercentage: '', notes: '' });
    } catch (err) {
      alert('حدث خطأ: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePartner = async (p) => {
    if (submitting) return;
    if (!window.confirm(`هل أنت متأكد من حذف الشريك (${p.name})؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    setSubmitting(true);
    try {
      await deletePartner(p.id, p.name);
      alert('🗑️ تم حذف الشريك بنجاح');
    } catch (err) {
      alert('حدث خطأ: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenWithdraw = (partner) => {
    setWithdrawModal(partner);
    setWithdrawForm({
      amount: partner.currentBalance > 0 ? String(Math.round(partner.currentBalance)) : '',
      month: getCurrentMonth(),
      notes: `سحب أرباح لشهر ${getMonthLabel(getCurrentMonth())}`
    });
  };

  const handleConfirmWithdraw = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!withdrawModal) return;
    const amt = Number(withdrawForm.amount);
    if (isNaN(amt) || amt <= 0) return alert('يرجى إدخال مبلغ صحيح أكبر من صفر');

    setSubmitting(true);
    try {
      await addPartnerTransaction({
        partnerId: withdrawModal.id,
        partnerName: withdrawModal.name,
        type: 'profit_withdrawal',
        amount: amt,
        month: withdrawForm.month,
        notes: withdrawForm.notes,
        shiftId: shiftId || null,
        actorName: 'الإدارة'
      });
      setWithdrawModal(null);
      alert(`💸 تم تسجيل صرف وسحب أرباح بقيمة (${formatCurrency(amt)}) للشريك (${withdrawModal.name}) بنجاح!`);
    } catch (err) {
      alert('حدث خطأ: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Print Partner Payment / Dividend Voucher
  const handlePrintVoucher = (tx) => {
    const win = window.open('', '_blank');
    if (!win) return alert('يرجى السماح بالنوافذ المنبثقة لطباعة السند');
    const isDist = tx.type === 'profit_distribution';
    win.document.write(`
      <html dir="rtl">
        <head>
          <title>${isDist ? 'سند استحقاق وتوزيع أرباح' : 'سند صرف أرباح شريك'} - THE FIRST GROUP</title>
          <style>
            body { font-family: 'Cairo', sans-serif; direction: rtl; padding: 30px; color: #111; }
            .box { border: 2px solid #1e3a8a; border-radius: 12px; padding: 24px; max-width: 650px; margin: 0 auto; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
            .header { text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 20px; }
            .title { font-size: 22px; font-weight: 900; color: #1e3a8a; }
            .voucher-no { font-size: 13px; color: #475569; font-weight: bold; margin-top: 4px; }
            .row { display: flex; justify-content: space-between; margin: 10px 0; font-size: 15px; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px; }
            .amount { font-size: 26px; font-weight: 900; color: #16a34a; text-align: center; margin: 20px 0; background: #f0fdf4; border: 1px solid #bbf7d0; padding: 12px; border-radius: 8px; }
            .meta-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin: 15px 0; font-size: 13px; }
            .signatures { display: flex; justify-content: space-between; margin-top: 35px; border-top: 1px dashed #cbd5e1; padding-top: 20px; }
            .sig { text-align: center; width: 45%; font-size: 14px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="box">
            <div class="header">
              <div class="title">THE FIRST GROUP 🏢</div>
              <div style="font-size: 16px; font-weight: 700; color: #0f172a; margin-top: 4px;">
                ${isDist ? 'سند وإشعار استحقاق أرباح شهرية معتمد' : 'سند صرف ومسحوبات أرباح شريك معتمد'}
              </div>
              <div class="voucher-no">رقم السند: ${tx.voucherNumber || ('VCH-' + (tx.id || '').slice(0, 8))} | تاريخ السند: ${formatDate(new Date())}</div>
            </div>

            <div class="row">
              <span>اسم الشريك:</span>
              <strong>${tx.partnerName} ${tx.equityPercentage ? `(${tx.equityPercentage}%)` : ''}</strong>
            </div>
            <div class="row">
              <span>عن أرباح شهر:</span>
              <strong>${getMonthLabel(tx.month || '') || tx.month}</strong>
            </div>
            <div class="row">
              <span>نوع المعاملة:</span>
              <strong>${isDist ? 'استحقاق وتوزيع أرباح رسمية' : 'سحب وصرف نقدي من الأرباح'}</strong>
            </div>

            ${isDist && tx.netProfitMonth ? `
              <div class="meta-box">
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                  <span>صافي أرباح المكان للشهر:</span>
                  <strong>${formatCurrency(tx.netProfitMonth)}</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                  <span>احتياطي الطوارئ والتشغيل المحتجز (${tx.reservePercent || 10}%):</span>
                  <strong style="color: #ea580c;">- ${formatCurrency(tx.reserveDeduction || 0)}</strong>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span>صافي الأرباح القابلة للتوزيع:</span>
                  <strong style="color: #16a34a;">${formatCurrency(tx.distributableProfitTotal || 0)}</strong>
                </div>
              </div>
            ` : ''}

            <div class="amount">
              ${isDist ? 'حصة الشريك المستحقة: ' : 'المبلغ المنصرف: '} ${formatCurrency(tx.amount)}
            </div>

            ${tx.notes ? `<div class="row"><span>ملاحظات:</span><span>${tx.notes}</span></div>` : ''}

            <div class="signatures">
              <div class="sig">
                <div>توقيع الشريك:</div>
                <div style="margin-top: 40px;">...................................</div>
              </div>
              <div class="sig">
                <div>اعتماد الإدارة العامة:</div>
                <div style="margin-top: 40px;">...................................</div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `);
    win.document.close();
    win.print();
  };

  // Export to Excel
  const handleExportExcel = () => {
    const partnerHeaders = ['#', 'اسم الشريك', 'الهاتف', 'رأس المال المدفوع (ج.م)', 'نسبة الشراكة (%)', 'إجمالي حصته من الأرباح (ج.م)', 'إجمالي المسحوبات (ج.م)', 'الرصيد المتاح للصرف (ج.م)', 'ملاحظات'];
    const partnerRows = partnersWithFinancials.map((p, idx) => [
      idx + 1,
      p.name,
      p.phone || '—',
      p.capitalContributed || 0,
      `${p.equityPercentage}%`,
      Math.round(p.lifetimeShare),
      p.totalWithdrawn,
      Math.round(p.currentBalance),
      p.notes || '—'
    ]);

    const txHeaders = ['#', 'تاريخ المعاملة', 'اسم الشريك', 'نوع الحركة', 'المبلغ (ج.م)', 'عن شهر', 'ملاحظات', 'المسؤول'];
    const txRows = transactions.map((t, idx) => [
      idx + 1,
      t.date?.toDate ? formatDate(t.date.toDate()) : '—',
      t.partnerName,
      t.type === 'profit_withdrawal' ? 'سحب أرباح' : 'إيداع / توزيع',
      t.amount,
      t.month || '—',
      t.notes || '—',
      t.actorName || 'الإدارة'
    ]);

    exportToExcel({
      filename: 'تقرير_رأس_المال_وحصص_الشركاء_THE_FIRST_GROUP',
      sheets: [
        { title: 'حصص الشركاء والأرباح', headers: partnerHeaders, rows: partnerRows },
        { title: 'سجل المسحوبات والمعاملات', headers: txHeaders, rows: txRows }
      ]
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontFamily: 'Cairo, sans-serif' }}>
      
      {/* Top Banner & Main Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>💼</span> رأس المال، الشركاء، ورادار استرداد الاستثمار (ROI)
          </h2>
          <p style={{ margin: '4px 0 0', color: '#93c5fd', fontSize: 13 }}>
            حساب نقطة التعادل، توزيع الأرباح الشهرية، وحماية أصول وسيولة المكان
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="ghost" onClick={handleExportExcel} style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
            📊 تصدير Excel
          </Button>
          <Button variant="ghost" onClick={() => setSettingsModal(true)} style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#93c5fd', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
            ⚙️ ضبط رأس المال والتأمين
          </Button>
          <Button variant="primary" onClick={() => { setDistributeModal(true); setGeneratedVouchers(null); }} style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', fontWeight: 800, boxShadow: '0 4px 16px rgba(16,185,129,0.35)', display: 'flex', alignItems: 'center', gap: 6 }}>
            🤝 حاسبة وتوزيع أرباح الشهر الآلية
          </Button>
          <Button variant="primary" onClick={() => handleOpenPartnerModal()} style={{ boxShadow: '0 4px 16px rgba(37,99,235,0.4)' }}>
            ➕ إضافة شريك جديد
          </Button>
        </div>
      </div>

      {/* 4 Big KPI Cards (Capital, Lifetime Profit, ROI, Breakeven) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        
        {/* Total Invested Capital */}
        <Card style={{ background: 'rgba(15, 23, 42, 0.85)', border: '1px solid rgba(59, 130, 246, 0.35)', padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#93c5fd', fontSize: 12, fontWeight: 700 }}>💰 إجمالي رأس المال المستثمر</span>
            <span style={{ fontSize: 18 }}>🏢</span>
          </div>
          <strong style={{ color: '#ffffff', fontSize: 24, fontWeight: 900, display: 'block', margin: '6px 0 4px' }}>
            {formatCurrency(totalInvestedCapital)}
          </strong>
          <span style={{ color: '#64748b', fontSize: 11, display: 'block' }}>
            🖥️ أصول ({formatCurrency(totalAssetsValue)}) + 🏢 تأمين ({formatCurrency(securityDeposit)})
          </span>
        </Card>

        {/* Lifetime Cumulative Profit */}
        <Card style={{ background: 'rgba(15, 23, 42, 0.85)', border: lifetimeNetProfit >= 0 ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(239, 68, 68, 0.35)', padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: lifetimeNetProfit >= 0 ? '#a7f3d0' : '#fca5a5', fontSize: 12, fontWeight: 700 }}>📈 صافي الأرباح التراكمية</span>
            <span style={{ fontSize: 18 }}>💵</span>
          </div>
          <strong style={{ color: lifetimeNetProfit >= 0 ? '#34d399' : '#f87171', fontSize: 24, fontWeight: 900, display: 'block', margin: '6px 0 4px' }}>
            {formatCurrency(lifetimeNetProfit)}
          </strong>
          <span style={{ color: '#64748b', fontSize: 11, display: 'block' }}>
            أرباح الشهر الحالي: <strong style={{ color: thisMonthNetProfit >= 0 ? '#34d399' : '#f87171' }}>{formatCurrency(thisMonthNetProfit)}</strong>
          </span>
        </Card>

        {/* ROI Recovery Rate */}
        <Card style={{ background: 'radial-gradient(ellipse at 80% 20%, rgba(30, 58, 138, 0.35) 0%, rgba(15, 23, 42, 0.95) 70%)', border: '1px solid rgba(56, 189, 248, 0.35)', padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#38bdf8', fontSize: 12, fontWeight: 700 }}>🎯 نسبة استرداد رأس المال</span>
            <Badge color={isCapitalConfigured ? "blue" : "gray"}>
              {isCapitalConfigured ? `${recoveryRate}% مسترد` : 'لم يُحدد رأس المال'}
            </Badge>
          </div>
          <strong style={{ color: '#38bdf8', fontSize: 24, fontWeight: 900, display: 'block', margin: '6px 0 4px' }}>
            {isCapitalConfigured ? `${recoveryRate}%` : '—'}
          </strong>
          <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden', marginTop: 4 }}>
            <div style={{ width: `${recoveryRate}%`, height: '100%', background: 'linear-gradient(90deg, #0284c7, #38bdf8)' }} />
          </div>
        </Card>

        {/* Payback Forecast */}
        <Card style={{ background: 'rgba(15, 23, 42, 0.85)', border: !isCapitalConfigured ? '1px solid rgba(148, 163, 184, 0.25)' : isBrokenEven ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(245, 158, 11, 0.35)', padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: !isCapitalConfigured ? '#94a3b8' : isBrokenEven ? '#a7f3d0' : '#fcd34d', fontSize: 12, fontWeight: 700 }}>
              {!isCapitalConfigured 
                ? '⚙️ إعداد رأس المال' 
                : isBrokenEven 
                  ? '🎉 تم كسر نقطة التعادل!' 
                  : '⏳ المتبقي لاسترداد رأس المال'}
            </span>
            <span style={{ fontSize: 18 }}>{!isCapitalConfigured ? '⚙️' : isBrokenEven ? '🏆' : '⏳'}</span>
          </div>
          <strong style={{ color: !isCapitalConfigured ? '#94a3b8' : isBrokenEven ? '#34d399' : '#fbbf24', fontSize: 24, fontWeight: 900, display: 'block', margin: '6px 0 4px' }}>
            {!isCapitalConfigured 
              ? 'لم يُحدد بعد' 
              : isBrokenEven 
                ? 'أرباح صافية 100%' 
                : formatCurrency(remainingToBreakEven)}
          </strong>
          <span style={{ color: '#94a3b8', fontSize: 11, display: 'block' }}>
            {!isCapitalConfigured
              ? 'اضغط "ضبط رأس المال والتأمين" لتحديد القيمة'
              : isBrokenEven 
                ? 'تم استرداد كامل رأس المال بنجاح' 
                : forecastMonthsLeft > 0 
                  ? `متوقع التعافي الكامل خلال: ${forecastMonthsLeft} شهور تقريباً` 
                  : 'يتم احتساب التوقعات بناءً على أرباح الشهور'}
          </span>
        </Card>
      </div>

      {/* Liquidity vs Profit Shield Card */}
      <Card style={{
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 58, 138, 0.4))',
        border: '1.5px solid rgba(59, 130, 246, 0.35)',
        padding: '18px 22px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>🛡️</span>
            <div>
              <h3 style={{ margin: 0, color: '#ffffff', fontSize: 16, fontWeight: 900 }}>
                جدار حماية السيولة وفصل الأرباح عن مصاريف التشغيل (Liquidity Shield)
              </h3>
              <p style={{ margin: '2px 0 0', color: '#93c5fd', fontSize: 12 }}>
                لمنع سحب مبالغ التشغيل والتأكد من توفر سيولة للإيجار والكهرباء والرواتب
              </p>
            </div>
          </div>

          <Badge color={thisMonthNetProfit > (Number(settings.operatingReserveTarget) || 20000) ? 'green' : 'amber'}>
            {thisMonthNetProfit > (Number(settings.operatingReserveTarget) || 20000)
              ? '🟢 وضع السيولة آمن جداً للتوزيع'
              : '⚠️ يُنصح بالاحتفاظ باحتياطي التشغيل'}
          </Badge>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <div style={{ background: 'rgba(7, 17, 31, 0.7)', borderRadius: 12, padding: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ color: '#94a3b8', fontSize: 12, display: 'block' }}>🛡️ احتياطي التشغيل الإلزامي الموصى به:</span>
            <strong style={{ color: '#fbbf24', fontSize: 18, fontWeight: 900 }}>{formatCurrency(settings.operatingReserveTarget || 20000)}</strong>
            <span style={{ fontSize: 10, color: '#64748b', display: 'block' }}>لتغطية التزامات الشهر القادم</span>
          </div>

          <div style={{ background: 'rgba(7, 17, 31, 0.7)', borderRadius: 12, padding: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ color: '#94a3b8', fontSize: 12, display: 'block' }}>💵 صافي أرباح الشهر الحالي:</span>
            <strong style={{ color: thisMonthNetProfit >= 0 ? '#34d399' : '#f87171', fontSize: 18, fontWeight: 900 }}>{formatCurrency(thisMonthNetProfit)}</strong>
            <span style={{ fontSize: 10, color: '#64748b', display: 'block' }}>عن شهر {getMonthLabel(currentMonth)}</span>
          </div>

          <div style={{ background: 'rgba(7, 17, 31, 0.7)', borderRadius: 12, padding: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ color: '#94a3b8', fontSize: 12, display: 'block' }}>🎯 الفائض القابل للتوزيع بأمان:</span>
            <strong style={{ color: '#38bdf8', fontSize: 18, fontWeight: 900 }}>
              {formatCurrency(Math.max(0, thisMonthNetProfit - (Number(settings.operatingReserveTarget) || 20000)))}
            </strong>
            <span style={{ fontSize: 10, color: '#64748b', display: 'block' }}>بعد استقطاع احتياطي الطوارئ</span>
          </div>
        </div>
      </Card>

      {/* Partners Section */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h3 style={{ margin: 0, color: '#ffffff', fontSize: 18, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>👥</span> الشركاء وحصص الأرباح والمسحوبات ({partners.length})
            </h3>
            <p style={{ margin: '4px 0 0', color: '#93c5fd', fontSize: 12 }}>
              إجمالي نسب الشراكة المسجلة: <strong style={{ color: totalEquitySum === 100 ? '#34d399' : '#fbbf24' }}>{totalEquitySum}%</strong>
              {totalEquitySum !== 100 && ` (متبقي ${100 - totalEquitySum}% غير موزعة)`}
            </p>
          </div>

          <Button variant="primary" onClick={() => handleOpenPartnerModal()} style={{ background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)' }}>
            ➕ إضافة شريك
          </Button>
        </div>

        {partnersWithFinancials.length === 0 ? (
          <EmptyState icon="👥" message="لم يتم تسجيل أي شركاء حتى الآن. أضف الشركاء لتوزيع الأرباح بدقة." />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 14 }}>
            {partnersWithFinancials.map(partner => (
              <Card key={partner.id} style={{
                background: 'rgba(15, 23, 42, 0.85)',
                border: '1.5px solid rgba(59, 130, 246, 0.3)',
                borderRadius: 16,
                padding: 18,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 14
              }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <h4 style={{ margin: 0, color: '#ffffff', fontSize: 16, fontWeight: 900 }}>
                        {partner.name}
                      </h4>
                      <span style={{ color: '#93c5fd', fontSize: 12 }}>
                        📱 {partner.phone || '—'}
                      </span>
                    </div>
                    <Badge color="blue" style={{ fontSize: 13, fontWeight: 900 }}>
                      {partner.equityPercentage}% حصة
                    </Badge>
                  </div>

                  {/* Partner Financial Breakdown */}
                  <div style={{ background: 'rgba(7, 17, 31, 0.75)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>رأس المال المدفوع:</span>
                      <strong style={{ color: '#ffffff' }}>{formatCurrency(partner.capitalContributed || 0)}</strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>إجمالي نصيبه التراكمي من الأرباح:</span>
                      <strong style={{ color: '#34d399' }}>{formatCurrency(Math.round(partner.lifetimeShare))}</strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>إجمالي ما تم سحبه وصرفه:</span>
                      <strong style={{ color: '#f87171' }}>{formatCurrency(partner.totalWithdrawn)}</strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 6, marginTop: 2 }}>
                      <span style={{ color: '#38bdf8', fontWeight: 800 }}>الرصيد المتاح للصرف الآن:</span>
                      <strong style={{ color: '#38bdf8', fontSize: 15, fontWeight: 900 }}>
                        {formatCurrency(Math.round(partner.currentBalance))}
                      </strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#93c5fd', fontSize: 11, marginTop: 4 }}>
                      <span>نصيب أرباح هذا الشهر ({getMonthLabel(currentMonth)}):</span>
                      <strong>{formatCurrency(Math.round(partner.currentMonthShare))}</strong>
                    </div>
                  </div>

                  {partner.notes && (
                    <p style={{ margin: '8px 0 0', fontSize: 11, color: '#94a3b8' }}>
                      📝 {partner.notes}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => handleOpenWithdraw(partner)}
                    style={{ flex: 1.6, fontSize: 12, background: 'linear-gradient(135deg, #16a34a, #22c55e)' }}
                  >
                    💵 صرف أرباح للشريك
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleOpenPartnerModal(partner)} style={{ padding: '4px 8px' }}>
                    ✏️
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => handleDeletePartner(partner)} style={{ padding: '4px 8px' }}>
                    🗑️
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Partner Transactions Ledger */}
      <div style={{ marginTop: 10 }}>
        <h3 style={{ color: '#ffffff', fontSize: 17, fontWeight: 900, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>📜</span> سجل مسحوبات ومعاملات الشركاء الموثقة ({transactions.length})
        </h3>

        {transactions.length === 0 ? (
          <EmptyState icon="📜" message="لا توجد مسحوبات أو معاملات سابقة للشركاء" />
        ) : (
          <Card style={{ background: 'rgba(15, 23, 42, 0.85)', padding: 0, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'rgba(7, 17, 31, 0.95)', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#93c5fd' }}>
                    <th style={{ padding: '12px 14px' }}>#</th>
                    <th style={{ padding: '12px 14px' }}>التاريخ</th>
                    <th style={{ padding: '12px 14px' }}>اسم الشريك</th>
                    <th style={{ padding: '12px 14px' }}>المبلغ</th>
                    <th style={{ padding: '12px 14px' }}>عن شهر</th>
                    <th style={{ padding: '12px 14px' }}>البيان / ملاحظات</th>
                    <th style={{ padding: '12px 14px' }}>المسؤول</th>
                    <th style={{ padding: '12px 14px', textAlign: 'center' }}>سند الصرف</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx, idx) => (
                    <tr key={tx.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#e2e8f0' }}>
                      <td style={{ padding: '10px 14px' }}>{idx + 1}</td>
                      <td style={{ padding: '10px 14px' }}>
                        {tx.date?.toDate ? formatDateTime(tx.date.toDate()) : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 800, color: '#ffffff' }}>
                        {tx.partnerName}
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 900, color: '#34d399' }}>
                        {formatCurrency(tx.amount)}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#93c5fd' }}>
                        {getMonthLabel(tx.month || '') || tx.month}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#94a3b8' }}>
                        {tx.notes || '—'}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>
                        {tx.actorName || 'الإدارة'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <Button size="sm" variant="ghost" onClick={() => handlePrintVoucher(tx)} style={{ padding: '3px 8px', fontSize: 11, background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>
                          🖨️ طباعة سند
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {/* Settings Modal */}
      <Modal open={settingsModal} onClose={() => setSettingsModal(false)} title="⚙️ ضبط إعدادات رأس المال والتأمين والتشغيل">
        <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              🏢 مبلغ تأمين المقر المسترد (ج.م):
            </label>
            <Input
              type="number"
              placeholder="مثال: 50000"
              value={settingsForm.securityDeposit}
              onChange={e => setSettingsForm({ ...settingsForm, securityDeposit: e.target.value })}
            />
            <span style={{ fontSize: 11, color: '#64748b' }}>مبلغ التأمين المسترد عند انتهاء عقد إيجار المقر</span>
          </div>

          <div>
            <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              💵 السيولة النقدية المبدئية عند التأسيس (ج.م):
            </label>
            <Input
              type="number"
              placeholder="مثال: 20000"
              value={settingsForm.initialCapital}
              onChange={e => setSettingsForm({ ...settingsForm, initialCapital: e.target.value })}
            />
            <span style={{ fontSize: 11, color: '#64748b' }}>مبلغ السيولة الكاش المتبقي في الخزنة لبدء التشغيل بخلاف قيمة الأجهزة</span>
          </div>

          <div>
            <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              🛡️ هدف احتياطي التشغيل والطوارئ (ج.م):
            </label>
            <Input
              type="number"
              placeholder="20000"
              value={settingsForm.operatingReserveTarget}
              onChange={e => setSettingsForm({ ...settingsForm, operatingReserveTarget: e.target.value })}
            />
            <span style={{ fontSize: 11, color: '#64748b' }}>المبلغ الموصى بالاحتفاظ به في الخزنة وعدم توزيعه لتغطية إيجار ورواتب الشهر التالي</span>
          </div>

          <div>
            <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              📅 تاريخ بدء وافتتاح المشروع:
            </label>
            <Input
              type="date"
              value={settingsForm.startDate}
              onChange={e => setSettingsForm({ ...settingsForm, startDate: e.target.value })}
            />
            <span style={{ fontSize: 11, color: '#64748b' }}>لحساب مدة التشغيل الفعلية ومعدل الاسترداد الشهري</span>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <Button variant="ghost" type="button" onClick={() => setSettingsModal(false)} style={{ flex: 1 }}>إلغاء</Button>
            <Button variant="primary" type="submit" disabled={submitting} style={{ flex: 1.5 }}>
              {submitting ? 'جاري الحفظ...' : '💾 حفظ الإعدادات'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add / Edit Partner Modal */}
      <Modal open={partnerModal} onClose={() => setPartnerModal(false)} title={editPartner ? '✏️ تعديل بيانات الشريك' : '➕ إضافة شريك جديد'}>
        <form onSubmit={handleSavePartner} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              اسم الشريك:
            </label>
            <Input
              placeholder="مثال: أ. أحمد حسن"
              value={partnerForm.name}
              onChange={e => setPartnerForm({ ...partnerForm, name: e.target.value })}
              required
              autoFocus
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>رقم الهاتف:</label>
              <Input
                placeholder="01xxxxxxxxx"
                value={partnerForm.phone}
                onChange={e => setPartnerForm({ ...partnerForm, phone: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>نسبة الشراكة (%):</label>
              <Input
                type="number"
                step="0.01"
                min="0.1"
                max="100"
                placeholder="مثال: 50"
                value={partnerForm.equityPercentage}
                onChange={e => setPartnerForm({ ...partnerForm, equityPercentage: e.target.value })}
                required
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>رأس المال المدفوع من الشريك (ج.م):</label>
            <Input
              type="number"
              placeholder="0"
              value={partnerForm.capitalContributed}
              onChange={e => setPartnerForm({ ...partnerForm, capitalContributed: e.target.value })}
            />
          </div>

          <div>
            <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>ملاحظات وشروط الاتفاق:</label>
            <Input
              placeholder="مثال: شريك مؤسس، توزيع الأرباح كل أول شهر..."
              value={partnerForm.notes}
              onChange={e => setPartnerForm({ ...partnerForm, notes: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <Button variant="ghost" type="button" onClick={() => setPartnerModal(false)} style={{ flex: 1 }}>إلغاء</Button>
            <Button variant="primary" type="submit" disabled={submitting} style={{ flex: 1.5 }}>
              {submitting ? 'جاري الحفظ...' : editPartner ? '💾 حفظ التعديلات' : '➕ إضافة الشريك'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Withdraw Profits Modal */}
      <Modal open={!!withdrawModal} onClose={() => setWithdrawModal(null)} title={`💵 صرف وتوزيع أرباح - ${withdrawModal?.name || ''}`}>
        <form onSubmit={handleConfirmWithdraw} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: 'rgba(15, 23, 42, 0.85)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: 12, padding: '12px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: '#94a3b8', fontSize: 12 }}>الشريك:</span>
              <strong style={{ color: '#ffffff' }}>{withdrawModal?.name} ({withdrawModal?.equityPercentage}%)</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#94a3b8', fontSize: 12 }}>الرصيد المتاح للصرف:</span>
              <strong style={{ color: '#34d399', fontSize: 15 }}>{formatCurrency(Math.round(withdrawModal?.currentBalance || 0))}</strong>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 10 }}>
            <div>
              <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                المبلغ المراد صرفه (ج.م):
              </label>
              <Input
                type="number"
                placeholder="0"
                value={withdrawForm.amount}
                onChange={e => setWithdrawForm({ ...withdrawForm, amount: e.target.value })}
                required
                autoFocus
              />
            </div>

            <div>
              <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>عن شهر:</label>
              <Input
                type="month"
                value={withdrawForm.month}
                onChange={e => setWithdrawForm({ ...withdrawForm, month: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>ملاحظات / طريقة السداد:</label>
            <Input
              placeholder="مثال: تحويل بنكي / كاش من الدرج..."
              value={withdrawForm.notes}
              onChange={e => setWithdrawForm({ ...withdrawForm, notes: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <Button variant="ghost" type="button" onClick={() => setWithdrawModal(null)} style={{ flex: 1 }}>إلغاء</Button>
            <Button variant="primary" type="submit" disabled={submitting} style={{ flex: 1.6, background: 'linear-gradient(135deg, #16a34a, #22c55e)' }}>
              {submitting ? 'جاري الصرف...' : '💵 تأكيد صرف الأرباح'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Instant Monthly Partner Dividend Splitter Modal */}
      <Modal open={distributeModal} onClose={() => setDistributeModal(false)} title="🤝 حاسبة وتوزيع أرباح الشركاء الآلية (Instant Dividend Splitter)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          
          {/* Month Selector & Instructions */}
          <div style={{ background: 'rgba(15, 23, 42, 0.85)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <strong style={{ color: '#ffffff', fontSize: 15, display: 'block' }}>شهر التوزيع المالي:</strong>
                <span style={{ color: '#93c5fd', fontSize: 12 }}>حساب تلقائي لصافي أرباح المكان بعد المصاريف وحجز الطوارئ</span>
              </div>
              <Input
                type="month"
                value={distributeMonth}
                onChange={e => { setDistributeMonth(e.target.value); setGeneratedVouchers(null); }}
                style={{ width: 170, fontWeight: 700 }}
              />
            </div>
          </div>

          {/* Financial Breakdown Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(59,130,246,0.2)', padding: '10px 12px', borderRadius: 10, textAlign: 'center' }}>
              <span style={{ color: '#94a3b8', fontSize: 11, display: 'block' }}>إجمالي الإيرادات</span>
              <strong style={{ color: '#60a5fa', fontSize: 15, fontWeight: 900 }}>{formatCurrency(distTotalRev)}</strong>
            </div>

            <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(239,68,68,0.2)', padding: '10px 12px', borderRadius: 10, textAlign: 'center' }}>
              <span style={{ color: '#94a3b8', fontSize: 11, display: 'block' }}>المصاريف التشغيلية</span>
              <strong style={{ color: '#f87171', fontSize: 15, fontWeight: 900 }}>{formatCurrency(distTotalExp)}</strong>
            </div>

            <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(16,185,129,0.2)', padding: '10px 12px', borderRadius: 10, textAlign: 'center' }}>
              <span style={{ color: '#94a3b8', fontSize: 11, display: 'block' }}>صافي الربح الفعلي</span>
              <strong style={{ color: distNetProfit >= 0 ? '#34d399' : '#f87171', fontSize: 15, fontWeight: 900 }}>
                {formatCurrency(distNetProfit)}
              </strong>
            </div>

            <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(249,115,22,0.2)', padding: '10px 12px', borderRadius: 10, textAlign: 'center' }}>
              <span style={{ color: '#94a3b8', fontSize: 11, display: 'block' }}>احتياطي الطوارئ ({distributeReservePercent}%)</span>
              <strong style={{ color: '#fb923c', fontSize: 15, fontWeight: 900 }}>{formatCurrency(distReserveAmount)}</strong>
            </div>
          </div>

          {/* Reserve Adjustment Controls */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr', gap: 10, alignItems: 'center' }}>
            <div>
              <label style={{ display: 'block', color: '#cbd5e1', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                نسبة احتياطي الطوارئ والتشغيل (%):
              </label>
              <Input
                type="number"
                min="0"
                max="50"
                value={distributeReservePercent}
                onChange={e => { setDistributeReservePercent(Math.max(0, Math.min(50, Number(e.target.value) || 0))); setGeneratedVouchers(null); }}
              />
            </div>
            <div>
              <label style={{ display: 'block', color: '#cbd5e1', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                ملاحظات التوزيع (تظهر في السند الرسمي):
              </label>
              <Input
                placeholder="مثال: اعتماد أرباح الربع الثالث..."
                value={distributeNotes}
                onChange={e => setDistributeNotes(e.target.value)}
              />
            </div>
          </div>

          {/* Distributable Profit Big Alert */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(15,23,42,0.9) 100%)',
            border: '1px solid rgba(16,185,129,0.4)',
            borderRadius: 12,
            padding: '12px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <span style={{ color: '#a7f3d0', fontSize: 12, fontWeight: 700 }}>💰 صافي الأرباح القابلة للتوزيع على الشركاء:</span>
              <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>بعد خصم المصاريف وتجنيب احتياطي الطوارئ</div>
            </div>
            <strong style={{ color: '#34d399', fontSize: 22, fontWeight: 900 }}>
              {formatCurrency(distDistributableProfit)}
            </strong>
          </div>

          {/* Partner Share Split Table */}
          <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'right' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.04)', color: '#93c5fd' }}>
                  <th style={{ padding: '8px 12px' }}>اسم الشريك</th>
                  <th style={{ padding: '8px 12px' }}>نسبة الشراكة</th>
                  <th style={{ padding: '8px 12px' }}>الحصة المستحقة (ج.م)</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center' }}>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {partnerSplits.map(p => (
                  <tr key={p.partnerId} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '10px 12px', color: '#ffffff', fontWeight: 700 }}>{p.partnerName}</td>
                    <td style={{ padding: '10px 12px', color: '#93c5fd' }}>{p.equityPercentage}%</td>
                    <td style={{ padding: '10px 12px', color: '#34d399', fontWeight: 900 }}>{formatCurrency(p.amount)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <Badge color="green">مستحق</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Action or Generated Vouchers */}
          {generatedVouchers ? (
            <div style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: 12, padding: 14 }}>
              <div style={{ color: '#a7f3d0', fontWeight: 800, fontSize: 14, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🎉</span> تم اعتماد وتوزيع الأرباح بنجاح! يمكنك الآن طباعة السندات الرسمية:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {generatedVouchers.map(v => (
                  <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(15,23,42,0.6)', padding: '8px 12px', borderRadius: 8 }}>
                    <div>
                      <strong style={{ color: '#ffffff', fontSize: 13 }}>{v.partnerName}</strong>
                      <span style={{ color: '#34d399', fontSize: 13, marginRight: 8, fontWeight: 700 }}>({formatCurrency(v.amount)})</span>
                      <span style={{ color: '#64748b', fontSize: 11, marginRight: 6 }}>رقم: {v.voucherNumber}</span>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => handlePrintVoucher(v)} style={{ color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)' }}>
                      🖨️ طباعة السند
                    </Button>
                  </div>
                ))}
              </div>
              <Button onClick={() => setDistributeModal(false)} style={{ width: '100%', marginTop: 12 }} variant="primary">
                إغلاق
              </Button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setDistributeModal(false)} style={{ flex: 1 }}>إلغاء</Button>
              <Button
                variant="primary"
                disabled={submitting || distDistributableProfit <= 0 || partnerSplits.length === 0}
                onClick={handleConfirmDistributeDividends}
                style={{ flex: 2, background: 'linear-gradient(135deg, #10b981, #059669)', fontWeight: 800, fontSize: 15 }}
              >
                {submitting ? 'جاري الاعتماد والتوزيع...' : `🚀 اعتماد وتوزيع الأرباح رسمياً (${formatCurrency(distDistributableProfit)})`}
              </Button>
            </div>
          )}

        </div>
      </Modal>

    </div>
  );
}
