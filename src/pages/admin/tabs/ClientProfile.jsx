import { openWhatsApp, getGenderGrammar, sendWelcomeWhatsApp, sendPaymentReceiptWhatsApp, sendSubscriptionReminderWhatsApp, sendSessionSummaryWhatsApp } from '../../../utils/whatsapp';
import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { Card, Button, Input, Select, Modal, EmptyState, Badge } from '../../../components/ui';
import { getClient, getPaymentsByClient, getClientSubscriptions, renewSubscription, deletePayment, permanentlyDeletePayment, deleteSubscription, recordWorkspaceCheckIn, recordWorkspaceCheckOut, calculateClientLoyalty, redeemClientPoints, recordPayment, getClientWalletTransactions, getAllShifts, getSystemInfo } from '../../../services/db';
import { formatCurrency, formatDate, formatHoursClock, formatDateTime } from '../../../utils/constants';
import {
  Calendar, Clock, Wallet, Sparkles, CreditCard, ArrowUpRight, ArrowDownLeft,
  User, Phone, MapPin, CheckCircle, AlertTriangle, AlertCircle, Copy, Check,
  ShieldCheck, ChevronLeft, DollarSign, Receipt, Printer
} from 'lucide-react';
import WalletTopUpModal from '../../../components/WalletTopUpModal';

export default function ClientProfile({ client, packages = [], onBack, isEmployee, shiftId, employeeId }) {
  const { user } = useAuth();
  const handleSharePortal = () => {
    const origin = window.location.origin;
    const directLink = `${origin}/client?phone=${encodeURIComponent(client.phone || '')}&id=${encodeURIComponent(client.memberId || '')}`;
    const g = getGenderGrammar(client.gender);
    const text = `${g.welcomeToYou} ${g.titleShort} ${client.name} 👋✨

${g.ahlanToYou} THE FIRST GROUP! 🏢🌟
${g.canYou} متابعة ${g.yourSub}، رصيد ${g.yourHours} المتبقية، وسجل الحضور مباشرة عبر الرابط التالي:
🔗 ${directLink}

📱 رقم الموبايل: ${client.phone}
🆔 رقم العضوية: ${client.memberId}

${g.weWishYou}! 🏢🌟`;

    openWhatsApp(client.phone, text);
  };
  const [currentClient, setCurrentClient] = useState(client);
  const [payments, setPayments] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [walletTransactions, setWalletTransactions] = useState([]);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [renewModal, setRenewModal] = useState(false);
  const [payDebtModal, setPayDebtModal] = useState(false);
  const [payDebtForm, setPayDebtForm] = useState({
    amount: '',
    paymentMethod: 'cash',
    note: 'سداد دفعة من المديونية',
    subscriptionId: null,
    subName: '',
    subTotal: 0,
    subPaid: 0,
    subRemaining: 0
  });
  const [loading, setLoading] = useState(false);
  const [copiedField, setCopiedField] = useState(null);
  const [shifts, setShifts] = useState([]);
  const [systemInfo, setSystemInfo] = useState({ name: 'THE FIRST GROUP' });

  useEffect(() => {
    const unsub = getAllShifts(setShifts);
    getSystemInfo().then(setSystemInfo);
    return () => unsub && unsub();
  }, []);

  const shiftsMap = useMemo(() => {
    const m = {};
    (shifts || []).forEach(s => {
      m[s.id] = s.employeeName || s.baristaName || 'المدير العام (الإدارة)';
    });
    return m;
  }, [shifts]);

  const handlePrintSinglePaymentReceipt = (p) => {
    const win = window.open('', '_blank');
    if (!win) {
      alert('يرجى السماح بالنوافذ المنبثقة (Popups) في المتصفح لطباعة الإيصال');
      return;
    }
    const orgName = systemInfo?.name || 'THE FIRST GROUP';
    const shiftOwner = p.shiftEmployeeName || shiftsMap[p.shiftId] || 'المدير العام (الإدارة)';
    const methodLabel = p.paymentMethod === 'visa' ? 'فيزا 💳' : p.paymentMethod === 'vodafone_cash' ? 'فودافون كاش 📱' : p.paymentMethod === 'instapay' ? 'إنستاباي ⚡' : 'نقدي 💵';
    const dateStr = p.date?.toDate ? formatDateTime(p.date.toDate()) : new Date().toLocaleString('ar-EG');
    const receiptNo = p.receiptNo || `REC-${(p.id || '').slice(-6).toUpperCase()}`;

    win.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8">
        <title>إيصال سداد #${receiptNo}</title>
        <style>
          body { font-family: 'Cairo', Arial, sans-serif; padding: 25px; margin: 0; color: #0f172a; direction: rtl; }
          .receipt-box { max-width: 440px; margin: 0 auto; border: 2px solid #0f172a; border-radius: 12px; padding: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.06); }
          .header { text-align: center; border-bottom: 2px dashed #94a3b8; padding-bottom: 12px; margin-bottom: 15px; }
          .header h2 { margin: 0; font-size: 20px; font-weight: 900; color: #0f172a; }
          .header p { margin: 4px 0 0; font-size: 13px; color: #475569; }
          .receipt-badge { display: inline-block; background: #0f172a; color: #fff; padding: 4px 14px; border-radius: 6px; font-weight: 800; font-size: 13px; margin: 8px 0; }
          .row { display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px dashed #e2e8f0; font-size: 13px; }
          .row strong { font-weight: 800; }
          .amount-row { background: #f8fafc; border: 1.5px solid #0f172a; border-radius: 8px; padding: 12px; text-align: center; margin: 16px 0; }
          .amount-val { font-size: 24px; font-weight: 900; color: #0f172a; }
          .shift-box { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 10px 12px; margin: 14px 0; font-size: 13px; }
          .shift-title { color: #0369a1; font-weight: 800; font-size: 11px; margin-bottom: 3px; }
          .shift-name { color: #0f172a; font-weight: 900; font-size: 14px; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #64748b; border-top: 1px dashed #cbd5e1; padding-top: 10px; }
          @media print {
            body { padding: 0; }
            .receipt-box { border: none; border-radius: 0; padding: 10px; width: 100%; max-width: 100%; box-shadow: none; }
          }
        </style>
      </head>
      <body>
        <div class="receipt-box">
          <div class="header">
            <h2>${orgName}</h2>
            <p>إيصال استلام مالي رسمي</p>
            <div class="receipt-badge">رقم الإيصال: #${receiptNo}</div>
          </div>

          <div class="row">
            <span>تاريخ وتوقيت العملية:</span>
            <strong>${dateStr}</strong>
          </div>
          <div class="row">
            <span>اسم العضو / المشترك:</span>
            <strong>${client.name || '—'}</strong>
          </div>
          <div class="row">
            <span>كود العضوية:</span>
            <strong>#${client.memberId || '—'}</strong>
          </div>
          <div class="row">
            <span>رقم الهاتف:</span>
            <strong>${client.phone || '—'}</strong>
          </div>
          <div class="row">
            <span>البيان:</span>
            <strong>${p.note || 'سداد اشتراك / باقة'}</strong>
          </div>
          <div class="row">
            <span>طريقة السداد:</span>
            <strong>${methodLabel}</strong>
          </div>

          <div class="amount-row">
            <div style="font-size: 12px; color: #64748b; font-weight: 700; margin-bottom: 2px;">المبلغ المسدد بالخزينة</div>
            <div class="amount-val">${formatCurrency(p.amount)}</div>
          </div>

          <div class="shift-box">
            <div class="shift-title">المستلم المالي وصاحب المناوبة المسجلة:</div>
            <div class="shift-name">👤 ${shiftOwner}</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
              كود المناوبة: ${p.shiftId ? ('SHF-' + p.shiftId.slice(-6).toUpperCase()) : 'خزينة الإدارة'}
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; margin-top: 25px; padding-top: 10px; font-size: 12px;">
            <div style="text-align: center; width: 140px; border-top: 1px solid #475569; padding-top: 4px;">توقيع المستلم</div>
            <div style="text-align: center; width: 140px; border-top: 1px solid #475569; padding-top: 4px;">توقيع العضو</div>
          </div>

          <div class="footer">
            شكراً لثقتكم واختياركم لنا • نتمنى لكم تجربة مميزة!
          </div>
        </div>
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `);
    win.document.close();
  };

  const handleCopy = (text, field) => {
    if (!text) return;
    try {
      navigator.clipboard?.writeText(String(text));
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (e) {
      console.warn('Copy failed:', e);
    }
  };

  const calculateDefaultEndDate = (startDateStr, durationDays = 30) => {
    if (!startDateStr) return '';
    const d = new Date(startDateStr);
    d.setDate(d.getDate() + Number(durationDays || 30));
    return d.toISOString().split('T')[0];
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({
    packageId: '', packageType: 'sessions', packagePrice: '', packageSessions: '', totalHours: '',
    startDate: todayStr, endDate: calculateDefaultEndDate(todayStr, 30), durationDays: 30,
    amountPaid: '', paymentMethod: 'cash'
  });

  // Receipt / Payment Void & Delete modal state
  const [paymentActionModal, setPaymentActionModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState('');

  const handleOpenPaymentModal = (p) => {
    setSelectedPayment(p);
    setVoidReason('');
    setPaymentError('');
    setPaymentActionModal(true);
  };

  const handleVoidPayment = async () => {
    if (!selectedPayment) return;
    if (!voidReason.trim()) {
      setPaymentError('يرجى كتابة سبب الإلغاء لتوثيقه في سجل الرقابة.');
      return;
    }
    setPaymentLoading(true);
    setPaymentError('');
    try {
      await deletePayment(selectedPayment.id, voidReason.trim(), user?.name || 'المدير العام');
      setPaymentActionModal(false);
      setSelectedPayment(null);
      alert('✅ تم إلغاء الإيصال بنجاح وتحديث حساب وأرصدة العضو.');
    } catch (err) {
      setPaymentError('فشل إلغاء الإيصال: ' + (err.message || err));
    } finally {
      setPaymentLoading(false);
    }
  };

  const handlePermanentDeletePayment = async () => {
    if (!selectedPayment) return;
    if (!window.confirm(`⚠️ تحذير إداري نهائي:\nهل أنت متأكد من مسح وحذف الإيصال رقم (${selectedPayment.receiptNo || selectedPayment.id}) نهائياً من قاعدة البيانات؟\nلن يمكن استرجاع هذا الإيصال بعد الحذف.`)) {
      return;
    }
    setPaymentLoading(true);
    setPaymentError('');
    try {
      await permanentlyDeletePayment(selectedPayment.id, user?.name || 'المدير العام');
      setPaymentActionModal(false);
      setSelectedPayment(null);
      alert('✅ تم مسح وحذف الإيصال نهائياً من النظام.');
    } catch (err) {
      setPaymentError('فشل مسح الإيصال: ' + (err.message || err));
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleStartDateChange = (newStart) => {
    const pkg = (packages || []).find(p => p.id === form.packageId);
    const duration = Number(pkg?.durationDays) || Number(form.durationDays) || 30;
    const newEnd = calculateDefaultEndDate(newStart, duration);
    setForm(prev => ({ ...prev, startDate: newStart, endDate: newEnd }));
  };

  useEffect(() => {
    const unsubC = getClient(client.id, setCurrentClient);
    const unsubP = getPaymentsByClient(client.id, setPayments);
    const unsubS = getClientSubscriptions(client.id, setSubscriptions);
    const unsubW = getClientWalletTransactions(client.id, setWalletTransactions);
    return () => { unsubC(); unsubP(); unsubS(); unsubW(); };
  }, [client.id]);

  const handleOpenPaySubDebt = (sub) => {
    const remaining = sub.remainingDebt > 0 ? sub.remainingDebt : Math.max(0, (Number(sub.packagePrice) || 0) - (Number(sub.paid) || 0));
    setPayDebtForm({
      amount: remaining > 0 ? String(remaining) : '',
      paymentMethod: 'cash',
      note: `سداد متبقي اشتراك (${sub.packageName})`,
      subscriptionId: sub.id || null,
      subName: sub.packageName || 'اشتراك',
      subTotal: Number(sub.packagePrice) || 0,
      subPaid: Number(sub.paid) || 0,
      subRemaining: remaining
    });
    setPayDebtModal(true);
  };

  const handleOpenPayGeneralDebt = () => {
    setPayDebtForm({
      amount: remainingDebt > 0 ? String(remainingDebt) : '',
      paymentMethod: 'cash',
      note: 'سداد دفعة من مديونية العميل',
      subscriptionId: null,
      subName: '',
      subTotal: totalSubscriptionsPrice,
      subPaid: totalPackagePaid,
      subRemaining: remainingDebt
    });
    setPayDebtModal(true);
  };

  const handlePayDebt = async (e) => {
    e.preventDefault();
    if (loading) return;
    const amt = Number(payDebtForm.amount);
    if (amt <= 0) return alert('يرجى كتابة مبلغ صحيح');
    const isCash = !payDebtForm.paymentMethod || payDebtForm.paymentMethod === 'cash' || payDebtForm.paymentMethod === 'نقدي';
    if (isCash && !shiftId) {
      return alert('⚠️ تنبيه أمان مالي صارم: لا يمكن تحصيل نقدية لعدم وجود مناوبة مفتوحة! يُرجى فتح مناوبة أولاً لتسجيل النقدية في درج الخزينة.');
    }
    setLoading(true);
    try {
      const finalNote = payDebtForm.note || (payDebtForm.subName ? `سداد متبقي اشتراك (${payDebtForm.subName})` : 'سداد مديونية');
      await recordPayment(
        client.id,
        amt,
        shiftId || null,
        employeeId || null,
        finalNote,
        client.name,
        payDebtForm.paymentMethod || 'cash',
        'subscription',
        payDebtForm.subscriptionId || null
      );
      setPayDebtModal(false);
      setPayDebtForm({
        amount: '', paymentMethod: 'cash', note: 'سداد دفعة من المديونية',
        subscriptionId: null, subName: '', subTotal: 0, subPaid: 0, subRemaining: 0
      });
      alert(`✅ تم تحصيل وسداد مبلغ (${amt} ج.م) بنجاح وتوليد الإيصال!`);
    } catch (err) {
      alert('حدث خطأ: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRenew = async (e) => {
    e.preventDefault();
    if (loading) return;
    const isCash = !form.paymentMethod || form.paymentMethod === 'cash' || form.paymentMethod === 'نقدي';
    if (isCash && Number(form.amountPaid || 0) > 0 && !shiftId) {
      return alert('⚠️ تنبيه أمان مالي صارم: لا يمكن تجديد الاشتراك نقدياً لعدم وجود مناوبة مفتوحة! يُرجى فتح مناوبة أولاً لتسجيل النقدية بالدرج.');
    }
    setLoading(true);
    try {
      const pkg = (packages || []).find(p => p.id === form.packageId);
      const isWs = form.packageType === 'workspace' || pkg?.type === 'workspace';
      const duration = Number(pkg?.durationDays) || Number(form.durationDays) || 30;
      const endD = form.endDate || calculateDefaultEndDate(form.startDate, duration);
      await renewSubscription(
        client.id,
        {
          packageId: form.packageId,
          packageName: pkg?.name || '',
          packageType: isWs ? 'workspace' : 'sessions',
          packagePrice: form.packagePrice,
          packageSessions: !isWs ? form.packageSessions : 0,
          totalHours: isWs ? (form.totalHours || form.packageSessions) : 0,
          startDate: form.startDate,
          endDate: endD,
          durationDays: duration
        },
        form.amountPaid,
        shiftId || null,
        employeeId || null,
        form.paymentMethod || 'cash'
      );
      setRenewModal(false);
      setForm({
        packageId: '', packageType: 'sessions', packagePrice: '', packageSessions: '', totalHours: '',
        startDate: todayStr, endDate: calculateDefaultEndDate(todayStr, 30), durationDays: 30,
        amountPaid: '', paymentMethod: 'cash'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleWorkspaceAction = async (sub) => {
    if (loading) return;
    if (isEmployee && !shiftId) return alert('يجب فتح مناوبة أولاً لتسجيل حضور وانصراف مساحة العمل');
    setLoading(true);
    try {
      if (sub.currentSession?.checkIn) {
        const res = await recordWorkspaceCheckOut(client.id, sub.id, shiftId || null, employeeId || null);
        alert(`🔴 تم تسجيل خروج المشترك (${client.name}) بنجاح!\nالمدة المستهلكة: ${res.durationHours} ساعة (${res.durationMinutes} دقيقة)\nالمتبقي في الرصيد: ${res.remainingHours} ساعة`);
      } else {
        const res = await recordWorkspaceCheckIn(client.id, sub.id, shiftId || null, employeeId || null);
        alert(`🟢 تم تسجيل دخول المشترك (${client.name}) إلى مساحة العمل بنجاح!\nبدء التوقيت الآن (الرصيد المتاح: ${res.remainingHours} ساعة)`);
      }
    } catch (err) {
      alert(err.message || 'حدث خطأ أثناء العملية');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    if (status === 'paused') return <Badge color="amber">موقوف مؤقتاً</Badge>;
    if (status === 'expired') return <Badge color="red">منتهي</Badge>;
    return <Badge color="green">نشط</Badge>;
  };

  const validPayments = useMemo(() => payments.filter(p => !p.isVoided), [payments]);
  
  // فصل دقيق ومحاسبي بين سداد الباقات وبين شحن محفظة الكافيه
  const isWalletPayment = (p) => p.category === 'wallet_topup' || p.paymentCategory === 'wallet_topup' || (p.note && p.note.includes('شحن محفظة'));
  const packagePayments = useMemo(() => validPayments.filter(p => !isWalletPayment(p)), [validPayments]);
  const walletTopupPayments = useMemo(() => validPayments.filter(isWalletPayment), [validPayments]);

  const computedSubscriptions = useMemo(() => {
    // 1. Initial computation of usage, dates, and expiry
    const baseSubs = subscriptions.map(s => {
      const isWs = s.packageType === 'workspace' || !!s.totalHours;
      const total = isWs ? (Number(s.totalHours || s.packageSessions) || 0) : (Number(s.packageSessions) || 0);
      const used = isWs ? (Number(s.hoursUsed || s.sessionsUsed) || 0) : (Number(s.sessionsUsed) || 0);
      const remainingSessions = Math.max(0, parseFloat((total - used).toFixed(2)));
      const isCheckedIn = !!s.currentSession?.checkIn;

      let effectiveEndDate = s.endDate || currentClient?.endDate || client?.endDate || '';
      if (!effectiveEndDate && s.startDate) {
        const pkg = (packages || []).find(p => p.id === s.packageId);
        const days = Number(s.durationDays) || Number(pkg?.durationDays) || 30;
        const d = new Date(s.startDate);
        d.setDate(d.getDate() + days);
        effectiveEndDate = d.toISOString().split('T')[0];
      }
      const isPast = effectiveEndDate && todayStr > effectiveEndDate;
      const pPrice = Number(s.packagePrice) || 0;

      return {
        ...s,
        packagePrice: pPrice,
        paid: 0,
        remainingDebt: pPrice,
        isWorkspace: isWs,
        total,
        used,
        remaining: remainingSessions,
        isCheckedIn,
        effectiveEndDate,
        isDateExpired: isPast,
        isActive: (remainingSessions > 0 || isCheckedIn) && s.status !== 'paused' && !isPast
      };
    });

    // 2. Financial allocation: Calculate paid & remainingDebt for each subscription
    const unallocatedPayments = packagePayments.map(p => ({
      id: p.id,
      amount: Number(p.amount) || 0,
      note: p.note || '',
      subscriptionId: p.subscriptionId || null,
      date: p.date?.toDate ? p.date.toDate().getTime() : 0
    }));

    // Pass 1: Direct link by subscriptionId
    baseSubs.forEach(sub => {
      unallocatedPayments.forEach(p => {
        if (p.amount > 0 && p.subscriptionId && p.subscriptionId === sub.id) {
          const needed = sub.packagePrice - sub.paid;
          const apply = Math.min(p.amount, needed);
          sub.paid += apply;
          p.amount -= apply;
        }
      });
    });

    // Pass 2: Match by packageName mentioned in payment note (e.g. "تجديد اشتراك (ENGLISH 500)")
    baseSubs.forEach(sub => {
      if (!sub.packageName) return;
      const cleanName = sub.packageName.trim().toLowerCase();
      unallocatedPayments.forEach(p => {
        if (p.amount > 0 && p.note && p.note.toLowerCase().includes(cleanName)) {
          const needed = sub.packagePrice - sub.paid;
          const apply = Math.min(p.amount, needed);
          sub.paid += apply;
          p.amount -= apply;
        }
      });
    });

    // Pass 3: Allocate any remaining unallocated package payments chronologically
    baseSubs.forEach(sub => {
      unallocatedPayments.forEach(p => {
        if (p.amount > 0) {
          const needed = sub.packagePrice - sub.paid;
          if (needed > 0) {
            const apply = Math.min(p.amount, needed);
            sub.paid += apply;
            p.amount -= apply;
          }
        }
      });
    });

    return baseSubs.map(sub => ({
      ...sub,
      paid: Math.min(sub.packagePrice, Math.max(0, sub.paid)),
      remainingDebt: Math.max(0, sub.packagePrice - sub.paid)
    }));
  }, [subscriptions, packagePayments, packages, currentClient, todayStr]);

  const activeSubs = computedSubscriptions.filter(s => s.isActive);
  const nonCancelledSubs = subscriptions.filter(s => s.status !== 'cancelled');
  const totalSubscriptionsPrice = nonCancelledSubs.length > 0
    ? nonCancelledSubs.reduce((sum, s) => sum + (Number(s.packagePrice) || 0), 0)
    : (Number(currentClient?.packagePrice || client.packagePrice) || 0);

  const totalPackagePaid = packagePayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const totalWalletDeposited = walletTopupPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const totalPaid = totalPackagePaid; // المسدد للباقات لحساب المديونية
  const totalAllPaid = validPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const remainingDebt = Math.max(0, totalSubscriptionsPrice - totalPackagePaid);

  return (
    <div style={{ paddingBottom: 50, fontFamily: 'Cairo, sans-serif' }}>
      {/* 1. Top Navigation & Breadcrumb */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        flexWrap: 'wrap',
        gap: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Button
            variant="ghost"
            onClick={onBack}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#cbd5e1',
              borderRadius: 10,
              padding: '7px 14px'
            }}
          >
            <ChevronLeft size={16} />
            <span>العودة لقائمة الأعضاء</span>
          </Button>
          <span style={{ color: '#64748b', fontSize: 13 }}>/ تفاصيل العضو</span>
        </div>
      </div>

      {/* 2. Client Hero Profile Card - بيانات العميل واضحة ومقروءة وبارزة */}
      <Card style={{
        background: 'linear-gradient(145deg, rgba(13, 27, 49, 0.96) 0%, rgba(9, 18, 33, 0.98) 100%)',
        border: '1.5px solid rgba(56, 189, 248, 0.28)',
        borderRadius: 18,
        padding: '24px 26px',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.35)',
        marginBottom: 20
      }}>
        {/* Header line: Name, Badges, and Action Buttons */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          paddingBottom: 18,
          marginBottom: 18
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{
              width: 58,
              height: 58,
              borderRadius: 16,
              background: client.gender === 'female' ? 'linear-gradient(135deg, #ec4899, #db2777)' : 'linear-gradient(135deg, #0284c7, #2563eb)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              fontWeight: 900,
              boxShadow: '0 6px 18px rgba(0, 0, 0, 0.35)'
            }}>
              {client.name ? client.name.charAt(0).toUpperCase() : 'ع'}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h2 style={{ color: '#ffffff', fontSize: 24, fontWeight: 900, margin: 0, letterSpacing: '-0.3px' }}>
                  {client.name}
                </h2>
                {getStatusBadge(client.status)}
                
                <span
                  title="انقر لنسخ رقم العضوية"
                  onClick={() => handleCopy(client.memberId, 'memberId')}
                  style={{
                    background: 'rgba(56, 189, 248, 0.14)',
                    border: '1px solid rgba(56, 189, 248, 0.35)',
                    color: '#38bdf8',
                    borderRadius: 8,
                    padding: '3px 10px',
                    fontSize: 12,
                    fontWeight: 800,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer'
                  }}
                >
                  <CreditCard size={13} />
                  <span>عضوية:</span>
                  <strong style={{ direction: 'ltr' }}>#{client.memberId}</strong>
                  {copiedField === 'memberId' ? <Check size={12} color="#34d399" /> : <Copy size={11} style={{ opacity: 0.7 }} />}
                </span>

                <span style={{
                  background: client.gender === 'female' ? 'rgba(236, 72, 153, 0.14)' : 'rgba(59, 130, 246, 0.14)',
                  border: client.gender === 'female' ? '1px solid rgba(236, 72, 153, 0.35)' : '1px solid rgba(59, 130, 246, 0.35)',
                  color: client.gender === 'female' ? '#f472b6' : '#93c5fd',
                  borderRadius: 8,
                  padding: '3px 10px',
                  fontSize: 12,
                  fontWeight: 700
                }}>
                  {client.gender === 'female' ? '👩 أنثى (أستاذة)' : '👨 ذكر (أستاذ)'}
                </span>
              </div>
              <p style={{ color: '#94a3b8', fontSize: 13, margin: '6px 0 0' }}>
                تاريخ التسجيل بالمنظومة: <strong style={{ color: '#e2e8f0' }}>{client.createdAt?.toDate ? formatDate(client.createdAt.toDate()) : '—'}</strong>
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Button
              size="sm"
              onClick={() => setWalletModalOpen(true)}
              style={{
                background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                color: '#ffffff',
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 14px',
                borderRadius: 10
              }}
            >
              <Wallet size={15} />
              <span>شحن المحفظة 💳</span>
            </Button>

            <Button
              size="sm"
              onClick={handleSharePortal}
              style={{
                background: 'rgba(37, 211, 102, 0.15)',
                border: '1px solid rgba(37, 211, 102, 0.45)',
                color: '#25d366',
                fontWeight: 800,
                padding: '9px 14px',
                borderRadius: 10
              }}
            >
              💬 إرسال البورتال بالواتساب
            </Button>
          </div>
        </div>

        {/* Client Info Grid - واضحة ومريحة للعين */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))',
          gap: 14
        }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.035)',
            border: '1px solid rgba(255, 255, 255, 0.07)',
            borderRadius: 12,
            padding: '12px 14px'
          }}>
            <span style={{ color: '#94a3b8', fontSize: 12, display: 'block', marginBottom: 4 }}>📱 رقم الهاتف:</span>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <strong style={{ color: '#ffffff', fontSize: 16, direction: 'ltr' }}>{client.phone || '—'}</strong>
              {client.phone && (
                <a
                  href={`https://wa.me/2${client.phone.replace(/[^0-9]/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    color: '#25d366',
                    background: 'rgba(37, 211, 102, 0.12)',
                    padding: '2px 8px',
                    borderRadius: 6,
                    fontSize: 11,
                    textDecoration: 'none',
                    fontWeight: 800
                  }}
                >
                  واتساب ↗
                </a>
              )}
            </div>
          </div>

          <div style={{
            background: 'rgba(255, 255, 255, 0.035)',
            border: '1px solid rgba(255, 255, 255, 0.07)',
            borderRadius: 12,
            padding: '12px 14px'
          }}>
            <span style={{ color: '#94a3b8', fontSize: 12, display: 'block', marginBottom: 4 }}>🎂 السن / العمر:</span>
            <strong style={{ color: '#34d399', fontSize: 16 }}>{client.age ? `${client.age} سنة` : '—'}</strong>
          </div>

          <div style={{
            background: 'rgba(255, 255, 255, 0.035)',
            border: '1px solid rgba(255, 255, 255, 0.07)',
            borderRadius: 12,
            padding: '12px 14px'
          }}>
            <span style={{ color: '#94a3b8', fontSize: 12, display: 'block', marginBottom: 4 }}>📍 السكن / المنطقة:</span>
            <strong style={{ color: '#93c5fd', fontSize: 15 }}>{client.address || '—'}</strong>
          </div>

          <div style={{
            background: 'rgba(255, 255, 255, 0.035)',
            border: '1px solid rgba(255, 255, 255, 0.07)',
            borderRadius: 12,
            padding: '12px 14px'
          }}>
            <span style={{ color: '#94a3b8', fontSize: 12, display: 'block', marginBottom: 4 }}>📅 سريان الاشتراك حتى:</span>
            <strong style={{ color: currentClient?.endDate ? '#34d399' : '#94a3b8', fontSize: 15 }}>
              {currentClient?.endDate || '—'}
            </strong>
          </div>

          <div style={{
            background: 'rgba(255, 255, 255, 0.035)',
            border: '1px solid rgba(255, 255, 255, 0.07)',
            borderRadius: 12,
            padding: '12px 14px'
          }}>
            <span style={{ color: '#94a3b8', fontSize: 12, display: 'block', marginBottom: 4 }}>💵 إجمالي مدفوعات العميل:</span>
            <strong style={{ color: '#38bdf8', fontSize: 16, fontWeight: 900 }}>
              {formatCurrency(totalAllPaid || 0)}
            </strong>
          </div>
        </div>
      </Card>

      {/* 3. Financial Summary & Prominent Required Debt Box (الموقف المالي وخانة إجمالي المبالغ المطلوبة) */}
      <Card style={{
        background: 'linear-gradient(145deg, rgba(12, 24, 44, 0.95) 0%, rgba(8, 16, 30, 0.98) 100%)',
        border: '1px solid var(--border)',
        borderRadius: 18,
        padding: '22px 24px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
        marginBottom: 20
      }}>
        {/* الخانة الرئيسية المطلوبة: إجمالي المبالغ والمديونيات المطلوبة من العميل */}
        <div style={{
          background: remainingDebt > 0
            ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.16) 0%, rgba(185, 28, 28, 0.25) 100%)'
            : 'linear-gradient(135deg, rgba(16, 185, 129, 0.14) 0%, rgba(5, 150, 105, 0.2) 100%)',
          border: remainingDebt > 0 ? '2px solid rgba(239, 68, 68, 0.55)' : '1.5px solid rgba(16, 185, 129, 0.45)',
          borderRadius: 14,
          padding: '16px 22px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
          boxShadow: remainingDebt > 0 ? '0 0 24px rgba(239, 68, 68, 0.2)' : 'none',
          marginBottom: 18
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: remainingDebt > 0 ? 'rgba(239, 68, 68, 0.25)' : 'rgba(16, 185, 129, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: remainingDebt > 0 ? '#f87171' : '#34d399',
              fontSize: 24
            }}>
              {remainingDebt > 0 ? '⚠️' : '✅'}
            </div>
            <div>
              <span style={{
                color: remainingDebt > 0 ? '#fca5a5' : '#a7f3d0',
                fontSize: 13.5,
                fontWeight: 800,
                display: 'block'
              }}>
                إجمالي المبالغ والمديونيات المطلوبة من العميل:
              </span>
              <strong style={{
                color: remainingDebt > 0 ? '#ff6b6b' : '#34d399',
                fontSize: 28,
                fontWeight: 900,
                letterSpacing: '0.5px'
              }}>
                {remainingDebt > 0 ? formatCurrency(remainingDebt) : '0 ج.م (الحساب خالص بالكامل)'}
              </strong>
            </div>
          </div>

          {remainingDebt > 0 ? (
            <Button
              variant="primary"
              onClick={handleOpenPayGeneralDebt}
              style={{
                background: 'linear-gradient(135deg, #e11d48, #be123c)',
                color: '#ffffff',
                fontWeight: 900,
                fontSize: 14,
                padding: '11px 22px',
                borderRadius: 10,
                boxShadow: '0 4px 16px rgba(225, 29, 72, 0.4)'
              }}
            >
              💵 تحصيل وسداد المبلغ المطلوب الآن ({formatCurrency(remainingDebt)})
            </Button>
          ) : (
            <span style={{
              background: 'rgba(16, 185, 129, 0.2)',
              border: '1px solid rgba(16, 185, 129, 0.45)',
              color: '#6ee7b7',
              borderRadius: 8,
              padding: '7px 16px',
              fontSize: 13,
              fontWeight: 800
            }}>
              ✨ لا توجد أي مديونيات أو مبالغ مستحقة على العضو
            </span>
          )}
        </div>

        {/* 3 Overview Sub-Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))',
          gap: 14
        }}>
          {/* Subscriptions Accounting */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.07)',
            borderRadius: 12,
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8
          }}>
            <span style={{ color: '#38bdf8', fontSize: 13, fontWeight: 800 }}>📦 كشف باقات العميل</span>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: '#94a3b8' }}>إجمالي قيمة الباقات ({subscriptions.length}):</span>
              <strong style={{ color: '#ffffff' }}>{formatCurrency(totalSubscriptionsPrice)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: '#94a3b8' }}>المسدد للباقات:</span>
              <strong style={{ color: '#34d399' }}>{formatCurrency(totalPackagePaid)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 6 }}>
              <span style={{ color: remainingDebt > 0 ? '#fca5a5' : '#a7f3d0' }}>المتبقي المطلوب:</span>
              <strong style={{ color: remainingDebt > 0 ? '#f87171' : '#34d399', fontWeight: 800 }}>
                {remainingDebt > 0 ? formatCurrency(remainingDebt) : 'خالص ✅'}
              </strong>
            </div>
          </div>

          {/* Digital Wallet */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.07)',
            borderRadius: 12,
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#38bdf8', fontSize: 13, fontWeight: 800 }}>💳 محفظة الرصيد الرقمية</span>
              <Badge color="blue">مسبق الدفع</Badge>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ color: '#94a3b8', fontSize: 13 }}>الرصيد المتاح:</span>
              <strong style={{ color: '#34d399', fontSize: 20, fontWeight: 900 }}>
                {formatCurrency(currentClient?.walletBalance || 0)}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
              <span style={{ color: '#94a3b8' }}>الحركات المسجلة:</span>
              <span style={{ color: '#e2e8f0' }}>{walletTransactions.length} حركة</span>
              <button
                type="button"
                onClick={() => setWalletModalOpen(true)}
                style={{
                  background: 'rgba(56, 189, 248, 0.15)',
                  border: '1px solid rgba(56, 189, 248, 0.4)',
                  color: '#38bdf8',
                  borderRadius: 6,
                  padding: '3px 8px',
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                + شحن
              </button>
            </div>
          </div>

          {/* Loyalty & Rewards */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.07)',
            borderRadius: 12,
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8
          }}>
            {(() => {
              const loyalty = calculateClientLoyalty(client);
              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#fbbf24', fontSize: 13, fontWeight: 800 }}>🎁 برنامج الولاء (TFG Rewards)</span>
                    <Badge color="amber">{loyalty.tier.name}</Badge>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ color: '#94a3b8', fontSize: 13 }}>الرصيد الحالي:</span>
                    <strong style={{ color: '#fbbf24', fontSize: 18, fontWeight: 900 }}>{loyalty.points} نقطة</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                    <span style={{ color: '#94a3b8' }}>المشروبات المستبدلة:</span>
                    <span style={{ color: '#e2e8f0' }}>{loyalty.drinksRedeemed || 0}</span>
                    {loyalty.points >= 50 && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!window.confirm('هل تريد استبدال 50 نقطة بمشروب مجاني لهذا العضو؟')) return;
                          setLoading(true);
                          try {
                            await redeemClientPoints(client.id, 50, 'مشروب مجاني من الكافيه', user?.displayName || 'الموظف');
                            alert('🎉 تم استبدال النقاط بنجاح وتسجيل المشروب المجاني!');
                          } catch (err) {
                            alert(err.message);
                          } finally {
                            setLoading(false);
                          }
                        }}
                        style={{
                          background: 'rgba(251, 191, 36, 0.15)',
                          border: '1px solid rgba(251, 191, 36, 0.4)',
                          color: '#fbbf24',
                          borderRadius: 6,
                          padding: '3px 8px',
                          fontSize: 11,
                          fontWeight: 800,
                          cursor: 'pointer'
                        }}
                      >
                        ☕ استبدال مجاني
                      </button>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </Card>

      {/* 4. Active Subscriptions Section - إظهار القيمة والمدفوع والمتبقي لكل اشتراك */}
      <Card style={{
        background: 'var(--bg-surface)',
        borderRadius: 18,
        padding: '22px 24px',
        border: '1px solid var(--border)',
        marginBottom: 24
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          borderBottom: '1px solid var(--border)',
          paddingBottom: 12,
          flexWrap: 'wrap',
          gap: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={18} color="#38bdf8" />
            <h3 style={{ color: '#ffffff', fontSize: 17, fontWeight: 800, margin: 0 }}>
              الباقات والاشتراكات السارية ({activeSubs.length})
            </h3>
          </div>

          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              setForm({
                packageId: '', packageType: 'sessions', packagePrice: '', packageSessions: '', totalHours: '',
                startDate: todayStr, endDate: calculateDefaultEndDate(todayStr, 30), durationDays: 30,
                amountPaid: '', paymentMethod: 'cash'
              });
              setRenewModal(true);
            }}
            style={{
              background: 'linear-gradient(135deg, #0284c7, #2563eb)',
              color: '#ffffff',
              fontWeight: 800,
              borderRadius: 10
            }}
          >
            + إضافة / تجديد اشتراك جديد
          </Button>
        </div>

        {activeSubs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <p style={{ color: '#fca5a5', fontWeight: 700, fontSize: 15, margin: 0 }}>لا توجد باقات سارية حالياً لهذا العضو</p>
            <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>يمكنك إضافة وتجديد اشتراك جديد بالضغط على زر «إضافة / تجديد اشتراك» أعلاه.</p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))',
            gap: 16
          }}>
            {activeSubs.map(s => (
              <div
                key={s.id}
                style={{
                  padding: '16px 18px',
                  background: 'var(--bg-base)',
                  borderRadius: 14,
                  border: s.isCheckedIn ? '1.5px solid #10b981' : '1px solid rgba(255, 255, 255, 0.1)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10
                }}
              >
                {/* Header line of the subscription */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <strong style={{ color: '#ffffff', fontSize: 16, fontWeight: 900 }}>{s.packageName}</strong>
                    {s.isWorkspace ? <Badge color="purple">🏢 مساحة عمل</Badge> : <Badge color="blue">🏷️ باقة حصص</Badge>}
                    {s.isCheckedIn && <Badge color="green">🟢 متواجد حالياً</Badge>}
                  </div>
                  <Badge color="green">ساري</Badge>
                </div>

                {/* Remaining sessions / hours counter */}
                <div style={{
                  background: 'rgba(56, 189, 248, 0.08)',
                  border: '1px solid rgba(56, 189, 248, 0.2)',
                  borderRadius: 10,
                  padding: '8px 12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 13
                }}>
                  <span style={{ color: '#93c5fd', fontWeight: 700 }}>
                    {s.isWorkspace ? 'الرصيد الزمني المتاح:' : 'الحصص المتبقية:'}
                  </span>
                  <strong style={{ color: '#34d399', fontSize: 16, fontWeight: 900 }}>
                    {s.isWorkspace ? `${formatHoursClock(s.remaining)} من ${formatHoursClock(s.total)}` : `${s.remaining} من ${s.total} حصة`}
                  </strong>
                </div>

                {/* الخانة المالية المخصصة المطلوبة: قيمة الاشتراك - المبلغ المدفوع - المتبقي إن وُجد */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 8,
                  background: 'rgba(0, 0, 0, 0.35)',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  textAlign: 'center'
                }}>
                  <div>
                    <span style={{ fontSize: 11, color: '#94a3b8', display: 'block' }}>قيمة الاشتراك:</span>
                    <strong style={{ color: '#ffffff', fontSize: 14, fontWeight: 800 }}>
                      {formatCurrency(s.packagePrice)}
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: '#94a3b8', display: 'block' }}>المبلغ المدفوع:</span>
                    <strong style={{ color: '#34d399', fontSize: 14, fontWeight: 800 }}>
                      {formatCurrency(s.paid)}
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: s.remainingDebt > 0 ? '#fca5a5' : '#a7f3d0', display: 'block' }}>
                      {s.remainingDebt > 0 ? 'المتبقي (مديونية):' : 'حالة السداد:'}
                    </span>
                    <strong style={{
                      color: s.remainingDebt > 0 ? '#f87171' : '#34d399',
                      fontSize: 14,
                      fontWeight: 900
                    }}>
                      {s.remainingDebt > 0 ? formatCurrency(s.remainingDebt) : 'خالص ✅'}
                    </strong>
                  </div>
                </div>

                {/* زر سداد متبقي هذا الاشتراك بالتفصيل */}
                {s.remainingDebt > 0 ? (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => handleOpenPaySubDebt(s)}
                    style={{
                      background: 'linear-gradient(135deg, #e11d48, #be123c)',
                      color: '#ffffff',
                      fontWeight: 800,
                      width: '100%',
                      padding: '9px 14px',
                      borderRadius: 10,
                      boxShadow: '0 2px 10px rgba(225, 29, 72, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                  >
                    <DollarSign size={15} />
                    <span>💵 سداد متبقي هذا الاشتراك بالتفصيل ({formatCurrency(s.remainingDebt)})</span>
                  </Button>
                ) : (
                  <div style={{
                    background: 'rgba(16, 185, 129, 0.12)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: 8,
                    padding: '6px 12px',
                    textAlign: 'center',
                    color: '#6ee7b7',
                    fontSize: 12.5,
                    fontWeight: 800
                  }}>
                    ✅ هذا الاشتراك مسدد بالكامل (لا توجد مديونية)
                  </div>
                )}

                {/* Validity Dates */}
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, alignItems: 'center', color: '#94a3b8' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Calendar size={12} style={{ color: '#38bdf8' }} />
                    <span>البدء: <strong style={{ color: '#ffffff' }}>{s.startDate || '—'}</strong></span>
                  </span>
                  <span style={{
                    color: s.isDateExpired ? '#f87171' : '#34d399',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4
                  }}>
                    <Clock size={12} />
                    <span>الانتهاء: <strong>{s.effectiveEndDate || '—'}</strong></span>
                    {s.isDateExpired && <span style={{ fontSize: 10, color: '#ef4444' }}>(منتهي)</span>}
                  </span>
                </div>

                {/* Workspace Check In / Check Out Action */}
                {s.isWorkspace && (
                  <div style={{ marginTop: 4, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <Button
                      size="sm"
                      variant={s.isCheckedIn ? "danger" : "success"}
                      disabled={loading || (isEmployee && !shiftId)}
                      onClick={() => handleWorkspaceAction(s)}
                      style={{ width: '100%', fontWeight: 800 }}
                    >
                      {loading ? 'جاري التنفيذ...' : s.isCheckedIn ? '🔴 تسجيل انصراف (خروج من المساحة)' : '🟢 تسجيل دخول مساحة عمل'}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 5. Historical Ledgers Section - سجل الاشتراكات والإيصالات والمحفظة بتنسيق 3 أعمدة مريح للعين */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
        gap: 20
      }}>
        {/* العمود 1: سجل الاشتراكات والتجديدات مع القيمة والمدفوع والمتبقي لكل اشتراك */}
        <Card style={{ background: 'var(--bg-surface)', borderRadius: 16, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
            <Calendar size={18} color="#38bdf8" />
            <h3 style={{ color: '#fff', fontSize: 16, margin: 0, fontWeight: 800 }}>
              سجل الاشتراكات والتجديدات ({computedSubscriptions.length})
            </h3>
          </div>

          {computedSubscriptions.length === 0 ? (
            <EmptyState icon="📅" message="لم يتم تسجيل أي اشتراكات سابقة لهذا العضو" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {computedSubscriptions.map(s => (
                <div
                  key={s.id}
                  style={{
                    padding: '12px 14px',
                    background: 'var(--bg-base)',
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <strong style={{ color: '#ffffff', fontSize: 14 }}>{s.packageName}</strong>
                      {s.isWorkspace && <Badge color="purple">مساحة عمل</Badge>}
                    </div>
                    {getStatusBadge(s.status)}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#94a3b8', flexWrap: 'wrap', gap: 6 }}>
                    <span>البدء: {s.startDate || '—'} • الانتهاء: <strong style={{ color: s.isDateExpired ? '#f87171' : '#38bdf8' }}>{s.effectiveEndDate || s.endDate || '—'}</strong></span>
                  </div>

                  {/* خانة القيمة والمدفوع والمتبقي للاشتراك في السجل */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'rgba(0, 0, 0, 0.28)',
                    padding: '6px 10px',
                    borderRadius: 8,
                    fontSize: 12,
                    flexWrap: 'wrap',
                    gap: 6
                  }}>
                    <span>القيمة: <strong style={{ color: '#ffffff' }}>{formatCurrency(s.packagePrice)}</strong></span>
                    <span>المدفوع: <strong style={{ color: '#34d399' }}>{formatCurrency(s.paid)}</strong></span>
                    <span>المتبقي: <strong style={{ color: s.remainingDebt > 0 ? '#f87171' : '#34d399', fontWeight: 800 }}>
                      {s.remainingDebt > 0 ? formatCurrency(s.remainingDebt) : 'خالص ✅'}
                    </strong></span>
                  </div>

                  {s.remainingDebt > 0 && (
                    <Button
                      size="sm"
                      onClick={() => handleOpenPaySubDebt(s)}
                      style={{
                        background: 'linear-gradient(135deg, #e11d48, #be123c)',
                        color: '#ffffff',
                        fontWeight: 800,
                        padding: '6px 10px',
                        borderRadius: 8,
                        fontSize: 12,
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6
                      }}
                    >
                      <DollarSign size={13} />
                      <span>سداد متبقي هذا الاشتراك ({formatCurrency(s.remainingDebt)})</span>
                    </Button>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginTop: 2 }}>
                    <span style={{ color: '#93c5fd' }}>
                      {s.isWorkspace ? `المستهلك: ${formatHoursClock(s.used)} من ${formatHoursClock(s.total)}` : `المستهلك: ${s.used} من ${s.total} حصة`}
                    </span>
                    {!isEmployee && (
                      <button
                        onClick={async () => {
                          if (window.confirm('هل أنت متأكد من حذف هذا الاشتراك نهائياً؟')) {
                            await deleteSubscription(s.id, client.id);
                          }
                        }}
                        style={{ color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}
                      >
                        حذف الاشتراك
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* العمود 2: سجل المدفوعات والإيصالات */}
        <Card style={{ background: 'var(--bg-surface)', borderRadius: 16, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
            <Receipt size={18} color="#34d399" />
            <h3 style={{ color: '#fff', fontSize: 16, margin: 0, fontWeight: 800 }}>
              سجل المدفوعات والإيصالات ({payments.length})
            </h3>
          </div>

          {payments.length === 0 ? (
            <EmptyState icon="💳" message="لا توجد مدفوعات مسجلة لهذا العضو" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {payments.map(p => {
                const methodLabel = p.paymentMethod === 'visa' ? '💳 فيزا' : p.paymentMethod === 'vodafone_cash' ? '📱 فودافون كاش' : p.paymentMethod === 'instapay' ? '⚡ إنستاباي' : '💵 نقدي';
                return (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 14px',
                      background: p.isVoided ? 'rgba(239, 68, 68, 0.08)' : 'var(--bg-base)',
                      borderRadius: 12,
                      border: p.isVoided ? '1px dashed rgba(239, 68, 68, 0.4)' : '1px solid var(--border)'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{
                          color: p.isVoided ? '#94a3b8' : '#34d399',
                          fontWeight: 900,
                          fontSize: 15,
                          textDecoration: p.isVoided ? 'line-through' : 'none'
                        }}>
                          {formatCurrency(p.amount)}
                        </span>
                        <Badge color={p.isVoided ? 'red' : 'blue'}>{methodLabel}</Badge>
                        {isWalletPayment(p) ? (
                          <Badge color="purple">💳 شحن محفظة</Badge>
                        ) : (
                          <Badge color="green">📦 سداد باقة</Badge>
                        )}
                        {p.isVoided && <Badge color="red">ملغي 🚫</Badge>}
                      </div>
                      <div style={{ color: '#93c5fd', fontSize: 12, marginTop: 4 }}>
                        {p.receiptNo && <strong>#{p.receiptNo} • </strong>}
                        {p.note || 'دفعة سداد'}
                      </div>
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        color: '#38bdf8',
                        fontSize: 12,
                        marginTop: 5,
                        background: 'rgba(56, 189, 248, 0.1)',
                        border: '1px solid rgba(56, 189, 248, 0.28)',
                        padding: '3px 10px',
                        borderRadius: 6,
                        fontWeight: 700
                      }}>
                        <span>👤 صاحب المناوبة / المستلم:</span>
                        <strong style={{ color: '#ffffff' }}>
                          {p.shiftEmployeeName || shiftsMap[p.shiftId] || (p.shiftId ? 'مناوبة مفتوحة' : 'المدير العام (الإدارة)')}
                        </strong>
                      </div>
                      {p.isVoided && p.voidReason && (
                        <div style={{ color: '#fca5a5', fontSize: 11, marginTop: 2 }}>
                          سبب الإلغاء: {p.voidReason} (بواسطة: {p.voidedBy || 'الإدارة'})
                        </div>
                      )}
                      <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                        {p.date?.toDate ? formatDateTime(p.date.toDate()) : '—'}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handlePrintSinglePaymentReceipt(p)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          color: '#e2e8f0',
                          fontWeight: 700
                        }}
                        title="طباعة إيصال السداد المالي الرسمي"
                      >
                        <Printer size={14} />
                        <span>طباعة</span>
                      </Button>

                      {!isEmployee && (
                        !p.isVoided ? (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => handleOpenPaymentModal(p)}
                            style={{ fontWeight: 800 }}
                          >
                            🚫 إلغاء / مسح
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleOpenPaymentModal(p)}
                            style={{ color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.35)', fontSize: 12, fontWeight: 700 }}
                          >
                            🗑️ مسح نهائي
                          </Button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* العمود 3: سجل حركات المحفظة الرقمية */}
        <Card style={{ background: 'var(--bg-surface)', borderRadius: 16, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 10, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Wallet size={18} color="#38bdf8" />
              <h3 style={{ color: '#fff', fontSize: 16, margin: 0, fontWeight: 800 }}>
                سجل حركات المحفظة ({walletTransactions.length})
              </h3>
            </div>
            <Button
              size="sm"
              onClick={() => setWalletModalOpen(true)}
              style={{ background: 'linear-gradient(135deg, #0284c7, #2563eb)', color: '#fff', fontWeight: 800 }}
            >
              + شحن رصيد
            </Button>
          </div>

          {walletTransactions.length === 0 ? (
            <EmptyState icon="💳" message="لا توجد حركات شحن أو خصم مسجلة في محفظة العميل حتى الآن" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {walletTransactions.map(tx => {
                const isTopup = tx.type === 'topup' || tx.amount > 0;
                return (
                  <div key={tx.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px',
                    background: isTopup ? 'rgba(16, 185, 129, 0.07)' : 'rgba(239, 68, 68, 0.07)',
                    borderRadius: 12,
                    border: isTopup ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(239, 68, 68, 0.25)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 38, height: 38, borderRadius: 10,
                        background: isTopup ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: isTopup ? '#34d399' : '#f87171'
                      }}>
                        {isTopup ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            color: isTopup ? '#34d399' : '#f87171',
                            fontWeight: 900,
                            fontSize: 15,
                            direction: 'ltr'
                          }}>
                            {isTopup ? `+${formatCurrency(tx.totalCredited || tx.amount)}` : formatCurrency(tx.amount)}
                          </span>
                          <Badge color={isTopup ? 'green' : 'red'}>
                            {isTopup ? 'شحن رصيد' : 'خصم / طلب'}
                          </Badge>
                          {tx.bonusAmount > 0 && (
                            <Badge color="amber">بونص: +{formatCurrency(tx.bonusAmount)}</Badge>
                          )}
                        </div>
                        <div style={{ color: '#cbd5e1', fontSize: 12, marginTop: 2 }}>
                          {tx.notes || tx.description || 'حركة محفظة'} • بواسطة: <span style={{ color: '#93c5fd' }}>{tx.actorName || 'الاستقبال'}</span>
                        </div>
                        <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                          {tx.createdAt?.toDate ? formatDateTime(tx.createdAt.toDate()) : (tx.isoDate ? formatDateTime(tx.isoDate) : 'حديثاً')}
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'left' }}>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>الرصيد بعد الحركة:</span>
                      <div style={{ color: '#ffffff', fontWeight: 800, fontSize: 13, direction: 'ltr' }}>
                        {formatCurrency(tx.balanceAfter !== undefined ? tx.balanceAfter : currentClient?.walletBalance || 0)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>



      {/* Wallet TopUp Modal */}
      <WalletTopUpModal
        open={walletModalOpen}
        onClose={() => setWalletModalOpen(false)}
        client={currentClient || client}
        shiftId={shiftId}
        employeeId={employeeId}
        actorName={user?.name || 'الاستقبال'}
      />
      <Modal open={renewModal} onClose={() => setRenewModal(false)} title="إضافة أو تجديد اشتراك للعميل">
        <form onSubmit={handleRenew} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Select label="اختر الباقة" value={form.packageId} onChange={e => {
            const pkg = packages.find(p => p.id === e.target.value);
            const isWs = pkg?.type === 'workspace' || !!pkg?.totalHours;
            const duration = Number(pkg?.durationDays) || 30;
            const sDate = form.startDate || todayStr;
            setForm({
              ...form,
              packageId: e.target.value,
              packageType: isWs ? 'workspace' : 'sessions',
              packagePrice: pkg ? pkg.price : '',
              packageSessions: pkg ? (pkg.sessions || '') : '',
              totalHours: pkg ? (pkg.totalHours || pkg.sessions || '') : '',
              durationDays: duration,
              endDate: calculateDefaultEndDate(sDate, duration)
            });
          }} required>
            <option value="">-- اختر الباقة --</option>
            {packages.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.type === 'workspace' ? `${p.totalHours || p.sessions} ساعة` : `${p.sessions} حصة`}) - {p.price} ج.م
              </option>
            ))}
          </Select>

          <div style={{ display: 'flex', gap: 12 }}>
            <Input label="السعر (ج.م)" type="number" value={form.packagePrice} onChange={e => setForm({ ...form, packagePrice: e.target.value })} required />
            {form.packageType === 'workspace' ? (
              <Input label="عدد الساعات (Work Space)" type="number" value={form.totalHours || form.packageSessions} onChange={e => setForm({ ...form, totalHours: e.target.value, packageSessions: e.target.value })} required />
            ) : (
              <Input label="عدد الحصص" type="number" value={form.packageSessions} onChange={e => setForm({ ...form, packageSessions: e.target.value, totalHours: '' })} required />
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input label="تاريخ البدء" type="date" value={form.startDate} onChange={e => handleStartDateChange(e.target.value)} required />
            <Input label="تاريخ الانتهاء" type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} required />
          </div>
          <span style={{ fontSize: 11, color: '#93c5fd', marginTop: -6, display: 'block' }}>
            ⏳ تاريخ الانتهاء يُحسب تلقائياً حسب مدة الباقة ({form.durationDays || 30} يوم) ويمكنك تعديله يدوياً.
          </span>

          <Input label="المبلغ المدفوع الآن (اختياري - يضاف للمناوبة)" type="number" value={form.amountPaid} onChange={e => setForm({ ...form, amountPaid: e.target.value })} placeholder="0" />

          {Number(form.amountPaid) > 0 && (
            <div>
              <label style={{ display: 'block', color: '#c8dcf5', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>طريقة دفع المبلغ المسدد:</label>
              <select
                value={form.paymentMethod || 'cash'}
                onChange={e => setForm({ ...form, paymentMethod: e.target.value })}
                style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', color: '#fff', fontFamily: 'Cairo, sans-serif' }}
              >
                <option value="cash">💵 نقدي (من درج الوردية)</option>
                <option value="visa">💳 فيزا / بنك</option>
                <option value="instapay">⚡ إنستاباي InstaPay</option>
              </select>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <Button type="submit" variant="primary" className="flex-1" disabled={loading}>
              {loading ? 'جاري الحفظ...' : 'تأكيد وحفظ الاشتراك'}
            </Button>
            <Button type="button" variant="ghost" className="flex-1" onClick={() => setRenewModal(false)}>إلغاء</Button>
          </div>
        </form>
      </Modal>

      {/* Pay Debt Modal - سداد المديونية بالتفصيل لكل اشتراك أو مديونية عامة */}
      <Modal
        open={payDebtModal}
        onClose={() => setPayDebtModal(false)}
        title={payDebtForm.subName ? `💵 سداد متبقي اشتراك (${payDebtForm.subName}) - ${client.name}` : `💵 تسجيل دفعة سداد مديونية - ${client.name}`}
      >
        <form onSubmit={handlePayDebt} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* اختيار جهة وتخصيص السداد */}
          <div>
            <label style={{ display: 'block', color: '#c8dcf5', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              🎯 تخصيص وتوجيه السداد:
            </label>
            <select
              value={payDebtForm.subscriptionId || 'general'}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'general') {
                  setPayDebtForm(prev => ({
                    ...prev,
                    subscriptionId: null,
                    subName: '',
                    amount: remainingDebt > 0 ? String(remainingDebt) : '',
                    note: 'سداد دفعة من مديونية العميل',
                    subTotal: totalSubscriptionsPrice,
                    subPaid: totalPackagePaid,
                    subRemaining: remainingDebt
                  }));
                } else {
                  const targetSub = computedSubscriptions.find(s => s.id === val);
                  if (targetSub) {
                    const rem = targetSub.remainingDebt > 0 ? targetSub.remainingDebt : Math.max(0, (Number(targetSub.packagePrice) || 0) - (Number(targetSub.paid) || 0));
                    setPayDebtForm(prev => ({
                      ...prev,
                      subscriptionId: targetSub.id,
                      subName: targetSub.packageName || 'اشتراك',
                      amount: rem > 0 ? String(rem) : '',
                      note: `سداد متبقي اشتراك (${targetSub.packageName})`,
                      subTotal: Number(targetSub.packagePrice) || 0,
                      subPaid: Number(targetSub.paid) || 0,
                      subRemaining: rem
                    }));
                  }
                }
              }}
              style={{
                width: '100%',
                background: 'var(--bg-base)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '10px 12px',
                color: '#fff',
                fontFamily: 'Cairo, sans-serif',
                fontSize: 13,
                fontWeight: 700
              }}
            >
              <option value="general">🌐 سداد مديونية عامة على حساب العميل (توزيع تلقائي)</option>
              {computedSubscriptions.map(s => (
                <option key={s.id} value={s.id}>
                  📌 اشتراك: {s.packageName} {s.remainingDebt > 0 ? `(المتبقي: ${formatCurrency(s.remainingDebt)})` : '(مسدد بالكامل ✅)'}
                </option>
              ))}
            </select>
          </div>

          {/* بطاقة تفاصيل الحساب والمتبقي */}
          {payDebtForm.subscriptionId ? (
            <div style={{
              background: 'rgba(225, 29, 72, 0.1)',
              border: '1px solid rgba(225, 29, 72, 0.3)',
              borderRadius: 12,
              padding: '12px 14px'
            }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#fda4af', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>📌 تفاصيل حساب الاشتراك المحدد:</span>
                <span style={{ color: '#ffffff' }}>{payDebtForm.subName}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, textAlign: 'center' }}>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '6px 8px', borderRadius: 8 }}>
                  <span style={{ fontSize: 11, color: '#94a3b8', display: 'block' }}>إجمالي القيمة</span>
                  <strong style={{ color: '#ffffff', fontSize: 13, fontWeight: 800 }}>{formatCurrency(payDebtForm.subTotal)}</strong>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '6px 8px', borderRadius: 8 }}>
                  <span style={{ fontSize: 11, color: '#94a3b8', display: 'block' }}>المدفوع سابقاً</span>
                  <strong style={{ color: '#34d399', fontSize: 13, fontWeight: 800 }}>{formatCurrency(payDebtForm.subPaid)}</strong>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '6px 8px', borderRadius: 8 }}>
                  <span style={{ fontSize: 11, color: '#fca5a5', display: 'block' }}>المتبقي المطلوب</span>
                  <strong style={{ color: '#f87171', fontSize: 13, fontWeight: 900 }}>{formatCurrency(payDebtForm.subRemaining)}</strong>
                </div>
              </div>
            </div>
          ) : (
            <div style={{
              background: 'rgba(239, 68, 68, 0.1)',
              padding: 12,
              borderRadius: 10,
              border: '1px solid rgba(239, 68, 68, 0.25)',
              textAlign: 'center'
            }}>
              <span style={{ color: '#fca5a5', fontSize: 12 }}>إجمالي المديونية المستحقة على العميل:</span>
              <strong style={{ color: '#f87171', fontSize: 20, display: 'block', marginTop: 2 }}>{formatCurrency(remainingDebt)}</strong>
            </div>
          )}

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ color: '#c8dcf5', fontSize: 13, fontWeight: 700 }}>المبلغ المسدد الآن (ج.م):</label>
              {payDebtForm.subRemaining > 0 && (
                <button
                  type="button"
                  onClick={() => setPayDebtForm(prev => ({ ...prev, amount: String(prev.subRemaining) }))}
                  style={{
                    background: 'rgba(56, 189, 248, 0.15)',
                    border: '1px solid rgba(56, 189, 248, 0.4)',
                    color: '#38bdf8',
                    padding: '2px 8px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  سداد كامل المتبقي ({formatCurrency(payDebtForm.subRemaining)})
                </button>
              )}
            </div>
            <Input
              type="number"
              value={payDebtForm.amount}
              onChange={e => setPayDebtForm({ ...payDebtForm, amount: e.target.value })}
              placeholder="0"
              required
              autoFocus
            />
          </div>

          <div>
            <label style={{ display: 'block', color: '#c8dcf5', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>طريقة الدفع:</label>
            <select
              value={payDebtForm.paymentMethod}
              onChange={e => setPayDebtForm({ ...payDebtForm, paymentMethod: e.target.value })}
              style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', color: '#fff', fontFamily: 'Cairo, sans-serif' }}
            >
              <option value="cash">💵 نقدي (يضاف لدرج الوردية)</option>
              <option value="visa">💳 فيزا / بنك</option>
              <option value="instapay">⚡ إنستاباي InstaPay</option>
            </select>
          </div>

          <Input
            label="ملاحظات وسند السداد"
            value={payDebtForm.note}
            onChange={e => setPayDebtForm({ ...payDebtForm, note: e.target.value })}
            placeholder="مثال: سداد قسط كورس الإنجليزي"
          />

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <Button type="button" variant="ghost" onClick={() => setPayDebtModal(false)}>إلغاء</Button>
            <Button type="submit" variant="primary" disabled={loading} style={{ background: 'linear-gradient(135deg, #059669, #10b981)', color: '#fff', fontWeight: 800 }}>
              {loading ? 'جاري التحصيل...' : 'تأكيد استلام المبلغ وتوليد الإيصال'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Payment Action & Void/Delete Modal */}
      <Modal
        open={paymentActionModal}
        onClose={() => { if (!paymentLoading) { setPaymentActionModal(false); setSelectedPayment(null); } }}
        title={selectedPayment?.isVoided ? `🗑️ مسح الإيصال نهائياً #${selectedPayment?.receiptNo || ''}` : `⚙️ إدارة ومسح الإيصال #${selectedPayment?.receiptNo || ''}`}
      >
        {selectedPayment && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {paymentError && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: 10, padding: '10px 14px', color: '#fca5a5', fontSize: 13
              }}>
                ⚠️ {paymentError}
              </div>
            )}

            {/* Receipt Summary Card */}
            <div style={{
              background: 'rgba(15, 23, 42, 0.65)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#94a3b8', fontSize: 13 }}>رقم الإيصال:</span>
                <strong style={{ color: '#38bdf8', fontSize: 14 }}>#{selectedPayment.receiptNo || selectedPayment.id}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#94a3b8', fontSize: 13 }}>قيمة الإيصال:</span>
                <strong style={{ color: '#34d399', fontSize: 18 }}>{formatCurrency(selectedPayment.amount)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#94a3b8', fontSize: 13 }}>البيان:</span>
                <span style={{ color: '#ffffff', fontSize: 13 }}>{selectedPayment.note || 'دفعة سداد'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#94a3b8', fontSize: 13 }}>تاريخ الإيصال:</span>
                <span style={{ color: '#cbd5e1', fontSize: 12 }}>
                  {selectedPayment.date?.toDate ? formatDateTime(selectedPayment.date.toDate()) : '—'}
                </span>
              </div>

              <div style={{ marginTop: 6, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                {isWalletPayment(selectedPayment) ? (
                  <p style={{ color: '#c084fc', fontSize: 12, margin: 0 }}>
                    💡 هذا الإيصال خاص بـ <b>شحن المحفظة الرقمية</b>. عند الإلغاء أو المسح سيتم خصم المبلغ من رصيد المحفظة تلقائياً وتوثيق الحركة محاسبياً.
                  </p>
                ) : (
                  <p style={{ color: '#93c5fd', fontSize: 12, margin: 0 }}>
                    💡 هذا الإيصال خاص بـ <b>سداد باقة / اشتراك</b>. عند الإلغاء أو المسح سيتم خصم المبلغ من مدفوعات العضو وإعادة المديونية لحسابه.
                  </p>
                )}
              </div>
            </div>

            {!selectedPayment.isVoided ? (
              <>
                <Input
                  label="سبب الإلغاء أو المسح (لتوثيقه رقابياً)"
                  value={voidReason}
                  onChange={e => setVoidReason(e.target.value)}
                  placeholder="مثال: تسجيل خاطئ من الكاشير / استرداد نقدي بناء على طلب العميل"
                  required
                  autoFocus
                />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={paymentLoading}
                    onClick={handleVoidPayment}
                    style={{ background: 'linear-gradient(135deg, #e11d48, #be123c)', color: '#fff', fontWeight: 800, padding: '12px' }}
                  >
                    {paymentLoading ? 'جاري التنفيذ...' : '🚫 إلغاء الإيصال وتأشيره كملغي (مع بقائه بالسجل للرقابة)'}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    disabled={paymentLoading}
                    onClick={handlePermanentDeletePayment}
                    style={{ color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.35)', fontWeight: 700 }}
                  >
                    🗑️ مسح وحذف الإيصال نهائياً من النظام
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    disabled={paymentLoading}
                    onClick={() => { setPaymentActionModal(false); setSelectedPayment(null); }}
                  >
                    تراجع وإغلاق
                  </Button>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 6 }}>
                <p style={{ color: '#fca5a5', fontSize: 13, margin: 0, textAlign: 'center' }}>
                  هذا الإيصال تم إلغاؤه وتأشيره كملغي مسبقاً. هل ترغب في حذفه ومسحه نهائياً من قاعدة البيانات؟
                </p>
                <Button
                  type="button"
                  variant="danger"
                  disabled={paymentLoading}
                  onClick={handlePermanentDeletePayment}
                  style={{ background: '#dc2626', color: '#fff', fontWeight: 800, padding: '12px' }}
                >
                  {paymentLoading ? 'جاري المسح...' : '🗑️ تأكيد مسح الإيصال نهائياً من النظام'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={paymentLoading}
                  onClick={() => { setPaymentActionModal(false); setSelectedPayment(null); }}
                >
                  إلغاء
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
