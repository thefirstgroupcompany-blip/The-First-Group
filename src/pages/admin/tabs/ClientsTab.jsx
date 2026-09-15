import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  getClients, getPackages, getAllSubscriptions, getClientSubscriptions, addClient, updateClient, deleteClient, getCourseSchedules,
  recordPayment, recordSession, recordWorkspaceCheckIn, recordWorkspaceCheckOut,
  toggleClientStatus, resetClientPin, freezeSubscription, unfreezeSubscription,
  getMonthlyFreezeQuota
} from '../../../services/db';
import { Card, Button, Input, Select, Modal, ConfirmDialog, EmptyState, Badge, DateInputDMY } from '../../../components/ui';
import { formatCurrency, formatHoursClock } from '../../../utils/constants';
import { exportToExcel } from '../../../utils/excelExport';
import { openWhatsApp, getGenderGrammar } from '../../../utils/whatsapp';
import ClientProfile from './ClientProfile';
import {
  Users, User, Phone, Clock, CreditCard, MessageCircle, AlertCircle,
  Snowflake, Flame, RotateCcw, Pencil, Trash2, Pause, Play, Calendar,
  FileSpreadsheet, Plus, CheckCircle2, AlertTriangle, XCircle, PauseCircle
} from 'lucide-react';

export default function ClientsTab({ shiftId, employeeId, isEmployee = false }) {
  const [clients, setClients] = useState([]);
  const [packages, setPackages] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [courseSchedules, setCourseSchedules] = useState([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'active', 'debts', 'expired', 'paused'

  // Modals
  const [modal, setModal] = useState(false);
  const [payModal, setPayModal] = useState(null);
  const [freezeModalClient, setFreezeModalClient] = useState(null);
  const [freezeDays, setFreezeDays] = useState(14);
  const [freezeReason, setFreezeReason] = useState('فترة امتحانات');
  const [freezeLoading, setFreezeLoading] = useState(false);
  const [sessionModal, setSessionModal] = useState(null);
  const [clientSubsForSession, setClientSubsForSession] = useState([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [editClient, setEditClient] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [createdClientModal, setCreatedClientModal] = useState(null);

  // Form States
  const [form, setForm] = useState({
    memberId: '', name: '', phone: '', age: '', birthDate: '', address: '', gender: 'male', scheduleId: '', scheduleDays: '', scheduleTime: '', scheduleRoom: '',
    packageId: '', packageType: 'sessions', totalHours: '', totalPaid: '',
    packagePrice: '', startDate: '', packageSessions: '', paymentMethod: 'cash'
  });
  const [payAmount, setPayAmount] = useState('');
  const [payNote, setPayNote] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsubC = getClients(setClients);
    const unsubP = getPackages(setPackages);
    const unsubSubs = getAllSubscriptions(setSubscriptions);
    const unsubSched = getCourseSchedules(setCourseSchedules);
    return () => { unsubC(); unsubP(); unsubSubs(); unsubSched(); };
  }, []);

  const packagesMap = useMemo(() => {
    const map = new Map();
    for (const p of packages) map.set(p.id, p);
    return map;
  }, [packages]);

  const getPkg = useCallback((id) => packagesMap.get(id), [packagesMap]);

  const subsByClient = useMemo(() => {
    const map = new Map();
    for (const s of subscriptions) {
      if (s.status === 'cancelled') continue;
      const cid = s.clientId;
      if (!cid) continue;
      if (!map.has(cid)) map.set(cid, []);
      map.get(cid).push(s);
    }
    return map;
  }, [subscriptions]);

  const getClientTotalSubPrice = useCallback((client) => {
    if (!client) return 0;
    const clientSubs = subsByClient.get(client.id);
    if (clientSubs && clientSubs.length > 0) {
      return clientSubs.reduce((sum, s) => sum + (Number(s.packagePrice) || 0), 0);
    }
    const pkg = packagesMap.get(client.packageId);
    return Number(client.packagePrice || pkg?.price || 0);
  }, [subsByClient, packagesMap]);

  const getClientBalance = useCallback((client) => {
    if (!client) return 0;
    const totalPrice = getClientTotalSubPrice(client);
    const totalPaid = Number(client.totalPackagePaid !== undefined ? client.totalPackagePaid : client.totalPaid || 0);
    return Math.max(0, totalPrice - totalPaid);
  }, [getClientTotalSubPrice]);

  const getClientStatus = useCallback((client) => {
    if (client.status === 'paused') return 'paused';
    const remaining = (client.packageSessions || 0) - (client.sessionsUsed || 0);
    const today = new Date().toISOString().split('T')[0];
    let endD = client.endDate;
    if (!endD && client.startDate) {
      const pkg = packagesMap.get(client.packageId);
      const days = Number(pkg?.durationDays) || 30;
      const d = new Date(client.startDate);
      d.setDate(d.getDate() + days);
      endD = d.toISOString().split('T')[0];
    }
    const isPast = endD && today > endD;
    if (isPast) return 'expired';
    if (remaining <= 0 && (client.packageSessions || 0) > 0) return 'expired';
    return 'active';
  }, [packagesMap]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return clients.filter(c => {
      const matchSearch = !q || 
                          (c.name || '').toLowerCase().includes(q) || 
                          (c.phone || '').includes(q) || 
                          (c.memberId || '').includes(q);
      if (!matchSearch) return false;

      if (filterStatus === 'all') return true;
      if (filterStatus === 'debts') return getClientBalance(c) > 0;
      const status = getClientStatus(c);
      if (filterStatus === 'active') return status === 'active';
      if (filterStatus === 'expired') return status === 'expired';
      if (filterStatus === 'paused') return status === 'paused';
      return true;
    });
  }, [clients, search, filterStatus, getClientBalance, getClientStatus]);

  // Overall Stats
  const { totalDebtorsCount, totalOutstandingDebts } = useMemo(() => {
    let count = 0;
    let debts = 0;
    for (const c of clients) {
      const bal = getClientBalance(c);
      if (bal > 0) {
        count++;
        debts += bal;
      }
    }
    return { totalDebtorsCount: count, totalOutstandingDebts: debts };
  }, [clients, getClientBalance]);

  // High Performance Pagination (24 items per page)
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 24;

  useEffect(() => {
    setPage(1);
  }, [search, filterStatus]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const paginatedClients = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const getNextMemberId = () => {
    const existingIds = clients
      .map(c => parseInt(c.memberId, 10))
      .filter(n => !isNaN(n) && n >= 1000);
    const max = existingIds.length > 0 ? Math.max(...existingIds) : 1000;
    return String(max + 1);
  };

    const handleResetClientPin = async (client) => {
    if (!window.confirm(`⚠️ هل أنت متأكد من إعادة تهيئة وتصفير كلمة المرور للعضو (${client.name})؟\nسيتمكن المشترك من تعيين كلمة مرور جديدة بنفسه فور فتح الرابط.`)) return;
    try {
      await resetClientPin(client.id, client.name);
      alert(`✅ تمت إعادة تهيئة كلمة المرور للعضو (${client.name}) بنجاح!\nسيتم الآن فتح الواتساب لإرسال رابط التعيين الجديد له.`);
      handleSharePortal(client, true);
    } catch (err) {
      alert('حدث خطأ أثناء إعادة التعيين: ' + err.message);
    }
  };

  const handleOpenFreeze = (client) => {
    const pkg = getPkg(client.packageId);
    const isWs = client.packageType === 'workspace' || pkg?.type === 'workspace' || (client.totalHours > 0) || pkg?.name?.includes('ساعة');
    if (!isWs) {
      return alert('⚠️ خاصية التجميد مخصصة فقط لاشتراكات مساحة العمل (Work Space) ولا تنطبق على باقات الكورسات والحصص.');
    }
    const clientSubs = subscriptions.filter(s => s.clientId === client.id && s.status !== 'cancelled');
    const activeSub = clientSubs[0];
    const quota = getMonthlyFreezeQuota(activeSub);
    if (!quota.canFreeze) {
      return alert(`⚠️ لا يمكن تجميد الاشتراك حالياً: رصيد التجميد المتبقي للمشترك هذا الشهر هو (${quota.remainingDays} يوم) والحد الأدنى للمرة الواحدة هو 3 أيام.\n(المستهلك: ${quota.usedThisMonth} من 10 أيام هذا الشهر).`);
    }
    setFreezeModalClient(client);
    setFreezeDays(Math.min(3, quota.remainingDays));
    setFreezeReason('فترة امتحانات');
  };

  const handleConfirmFreeze = async (e) => {
    e.preventDefault();
    if (!freezeModalClient) return;

    const clientSubs = subscriptions.filter(s => s.clientId === freezeModalClient.id && s.status !== 'cancelled');
    const activeSub = clientSubs[0];
    const quota = getMonthlyFreezeQuota(activeSub);

    if (freezeDays < 3) {
      return alert('⚠️ الحد الأدنى للتجميد هو 3 أيام للمرة الواحدة.');
    }
    if (freezeDays > quota.remainingDays) {
      return alert(`⚠️ تجاوزت الرصيد المتاح لهذا الشهر (${quota.remainingDays} يوم).`);
    }

    setFreezeLoading(true);
    try {
      if (clientSubs.length > 0) {
        for (const sub of clientSubs) {
          await freezeSubscription(sub.id, { days: freezeDays, reason: freezeReason, actorName: 'الإدارة' });
        }
      } else {
        // Direct update client doc
        await updateClient(freezeModalClient.id, { status: 'paused', isFrozen: true, freezeReason });
      }
      alert(`❄️ تم تجميد اشتراك (${freezeModalClient.name}) بنجاح لمدة ${freezeDays} يوم.\nتم تمديد تاريخ نهاية الاشتراك بمقدار ${freezeDays} يوم.`);
      setFreezeModalClient(null);
    } catch (err) {
      alert('حدث خطأ أثناء التجميد: ' + err.message);
    } finally {
      setFreezeLoading(false);
    }
  };

  const handleUnfreeze = async (client) => {
    if (!window.confirm(`هل تريد إلغاء تجميد اشتراك (${client.name}) الآن؟\n\n📌 ملاحظة: يتم احتساب مدة التجميد الفعلية (بحد أدنى 3 أيام)، ويتم استرجاع أي أيام متبقية غير مستخدمة إلى رصيد تجميد المشترك الشهري تلقائياً.`)) return;
    try {
      const clientSubs = subscriptions.filter(s => s.clientId === client.id && (s.isFrozen || s.status === 'paused'));
      if (clientSubs.length > 0) {
        for (const sub of clientSubs) {
          await unfreezeSubscription(sub.id, 'الإدارة');
        }
      } else {
        await updateClient(client.id, { status: 'active', isFrozen: false });
      }
      alert(`🔥 تم إلغاء التجميد وتفعيل اشتراك (${client.name}) بنجاح!\nتم تمديد تاريخ الصلاحية بالأيام الفعلية المستهلكة وإعادة الأيام المتبقية لرصيد الشهر.`);
    } catch (err) {
      alert('حدث خطأ: ' + err.message);
    }
  };

      const handleSharePortal = (client, isReset = false) => {
    const origin = window.location.origin;
    const directLink = `${origin}/client?phone=${encodeURIComponent(client.phone || '')}&id=${encodeURIComponent(client.memberId || '')}`;
    const g = getGenderGrammar(client.gender);
    const pkg = getPkg(client.packageId);
    const balance = getClientBalance(client);
    const sub = subscriptions.find(s => s.clientId === client.id) || {};

    const scheduleDetails = client.scheduleDays ? `\n📅 موعد الكورس: ${client.scheduleDays} (${client.scheduleTime})\n🚪 القاعة: ${client.scheduleRoom || 'قاعة التدريب'}` : '';

    const text = isReset
      ? `مرحباً ${g.titleShort} ${client.name} 👋✨
تمت إعادة تهيئة كلمة المرور الخاصة ${g.toYou} في THE FIRST GROUP 🏢

رقم العضوية: ${client.memberId}
رابط بوابتك الإلكترونية:
🔗 ${directLink}

🔒 يرجى فتح الرابط وتعيين كلمة مرور جديدة من اختيارك لمتابعة رصيدك وحصصك في أي وقت.

${g.weAreGladForYourPresence}! 🌟`
      : `${g.welcomeToYou} ${g.titleShort} ${client.name} 👋✨
${g.ahlanToYou} THE FIRST GROUP! 🏢🌟

📋 **تفاصيل اشتراكك وعضويتك:**
🆔 رقم العضوية: #${client.memberId}
📦 الباقة / الكورس: ${pkg?.name || client.packageName || 'اشتراك جديد'}
💰 المبلغ المدفوع: ${formatCurrency(client.totalPaid || sub?.totalPaid || 0)}${balance > 0 ? ` (المتبقي: ${formatCurrency(balance)})` : ' (مسدد بالكامل ✅)'}${scheduleDetails}
📅 تاريخ البدء: ${client.startDate || '—'}
⏳ تاريخ الانتهاء: ${client.endDate || '—'}

🔗 **رابط بوابتك الإلكترونية لمتابعة الحصص والحضور:**
${directLink}

🔒 عند فتح الرابط لأول مرة، يمكنك تعيين كلمة مرور خاصة ${g.toYou} لحماية ${g.yourAccount}.

${g.weAreGladForYourPresence}! 🏢🌟`;

    openWhatsApp(client.phone, text);
  };

  const handleSendDebtReminder = (client, balance) => {
    const origin = window.location.origin;
    const directLink = `${origin}/client?phone=${encodeURIComponent(client.phone || '')}&id=${encodeURIComponent(client.memberId || '')}`;
    const g = getGenderGrammar(client.gender);
    const text = `مرحباً ${g.titleShort} ${client.name} 👋✨
تذكير ودي من THE FIRST GROUP 🏢
${g.informYou} بأن المبلغ المتبقي على ${g.yourSub} هو (${formatCurrency(balance)}).

رابط ${g.yourAccount} المباشر:
🔗 ${directLink}

${g.canYou} السداد في ${g.yourVisit} القادمة. خالص الشكر ${g.toYou}! 🙏✨`;
    openWhatsApp(client.phone, text);
  };

  const calculateDefaultEndDate = (startDateStr, durationDays = 30) => {
    if (!startDateStr) return '';
    const d = new Date(startDateStr);
    d.setDate(d.getDate() + Number(durationDays || 30));
    return d.toISOString().split('T')[0];
  };

  const handleExportClientsExcel = () => {
    const headers = ['#', 'رقم العضوية', 'الاسم', 'رقم الهاتف', 'السن', 'العنوان', 'الباقة', 'نوع الباقة', 'تاريخ البدء', 'تاريخ الانتهاء', 'المدفوع', 'المتبقي', 'الحالة'];
    const rows = filtered.map((c, idx) => {
      const pkg = getPkg(c.packageId);
      const bal = getClientBalance(c);
      const st = getClientStatus(c);
      return [
        idx + 1,
        c.memberId || '—',
        c.name || '—',
        c.phone || '—',
        c.age || '—',
        c.address || '—',
        pkg?.name || c.packageName || '—',
        c.packageType === 'workspace' ? 'مساحة عمل' : 'حصص/كورس',
        c.startDate || '—',
        c.endDate || '—',
        c.totalPaid || 0,
        bal,
        st === 'active' ? 'نشط' : st === 'paused' ? 'موقوف' : 'منتهي'
      ];
    });

    exportToExcel('سجل_الأعضاء_والعملاء_' + new Date().toISOString().split('T')[0], headers, rows);
  };

  const openAdd = () => {
    setEditClient(null);
    const todayStr = new Date().toISOString().split('T')[0];
    const initialPkg = packages[0];
    const initialDuration = Number(initialPkg?.durationDays) || 30;
    setForm({
      memberId: getNextMemberId(),
      name: '', phone: '', age: '', birthDate: '', address: '',
      gender: 'male',
      scheduleId: '', scheduleDays: '', scheduleTime: '', scheduleRoom: '', instructorName: '',
      packageId: initialPkg?.id || '',
      packageType: initialPkg?.type || 'sessions',
      totalHours: initialPkg?.totalHours || '',
      totalPaid: '', packagePrice: initialPkg?.price || '',
      startDate: todayStr,
      endDate: calculateDefaultEndDate(todayStr, initialDuration),
      durationDays: initialDuration,
      packageSessions: initialPkg?.sessions || ''
    });
    setModal(true);
  };

  const openEdit = (client) => {
    setEditClient(client);
    const todayStr = new Date().toISOString().split('T')[0];
    const sDate = client.startDate || todayStr;
    const pkg = getPkg(client.packageId);
    const duration = Number(pkg?.durationDays) || 30;
    const eDate = client.endDate || calculateDefaultEndDate(sDate, duration);
    setForm({
      memberId: client.memberId || '',
      name: client.name || '',
      phone: client.phone || '',
      age: client.age || '',
      birthDate: client.birthDate || '',
      address: client.address || '',
      gender: client.gender || 'male',
      scheduleId: client.scheduleId || '',
      scheduleDays: client.scheduleDays || '',
      scheduleTime: client.scheduleTime || '',
      scheduleRoom: client.scheduleRoom || '',
      instructorName: client.instructorName || '',
      packageId: client.packageId || '',
      packageType: client.packageType || 'sessions',
      totalHours: client.totalHours || '',
      totalPaid: client.totalPaid || '',
      packagePrice: client.packagePrice || '',
      startDate: sDate,
      endDate: eDate,
      durationDays: duration,
      packageSessions: client.packageSessions || ''
    });
    setModal(true);
  };

  const handleStartDateChange = (newStart) => {
    const pkg = getPkg(form.packageId);
    const duration = Number(pkg?.durationDays) || Number(form.durationDays) || 30;
    const newEnd = calculateDefaultEndDate(newStart, duration);
    setForm(prev => ({ ...prev, startDate: newStart, endDate: newEnd }));
  };

  const handleScheduleChange = (schedId) => {
    const sched = courseSchedules.find(s => s.id === schedId);
    if (sched) {
      setForm(prev => ({
        ...prev,
        scheduleId: sched.id,
        scheduleDays: sched.days || '',
        scheduleTime: `${sched.startTime} - ${sched.endTime}`,
        scheduleRoom: sched.room || '',
        instructorName: sched.instructorName || prev.instructorName || '',
        packagePrice: prev.packagePrice || sched.price || ''
      }));
    } else {
      setForm(prev => ({
        ...prev,
        scheduleId: '',
        scheduleDays: '',
        scheduleTime: '',
        scheduleRoom: ''
      }));
    }
  };

  const handlePackageChange = (pkgId) => {
    const pkg = getPkg(pkgId);
    if (!pkg) return;
    const isWs = pkg.type === 'workspace' || !!pkg.totalHours;
    const duration = Number(pkg.durationDays) || 30;
    const sDate = form.startDate || new Date().toISOString().split('T')[0];
    setForm(prev => ({
      ...prev,
      packageId: pkgId,
      packageType: isWs ? 'workspace' : 'sessions',
      packagePrice: pkg.price || '',
      packageSessions: !isWs ? (pkg.sessions || '') : '',
      totalHours: isWs ? (pkg.totalHours || pkg.sessions || '') : '',
      totalPaid: prev.totalPaid || pkg.price || '',
      durationDays: duration,
      endDate: calculateDefaultEndDate(sDate, duration)
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const isWs = form.packageType === 'workspace';
      const pkg = getPkg(form.packageId);
      const data = {
        memberId: form.memberId?.trim() || getNextMemberId(),
        name: form.name?.trim(),
        phone: form.phone?.trim(),
        age: form.age ? Number(form.age) : null,
        birthDate: form.birthDate || '',
        gender: form.gender || 'male',
        address: form.address?.trim() || '',
        scheduleId: form.scheduleId || null,
        scheduleDays: form.scheduleDays || '',
        scheduleTime: form.scheduleTime || '',
        scheduleRoom: form.scheduleRoom || '',
        instructorName: form.instructorName || '',
        packageId: form.packageId,
        packageName: pkg?.name || '',
        packageType: isWs ? 'workspace' : 'sessions',
        packagePrice: Number(form.packagePrice) || 0,
        packageSessions: !isWs ? (Number(form.packageSessions) || 0) : 0,
        totalHours: isWs ? (Number(form.totalHours || form.packageSessions) || 0) : 0,
        startDate: form.startDate || new Date().toISOString().split('T')[0],
        endDate: form.endDate || calculateDefaultEndDate(form.startDate, pkg?.durationDays || 30),
        durationDays: Number(pkg?.durationDays) || Number(form.durationDays) || 30,
        totalPaid: Number(form.totalPaid) || 0,
        paymentMethod: form.paymentMethod || 'cash',
        status: 'active'
      };

      if (editClient) {
        await updateClient(editClient.id, data);
      } else {
        const isCash = !data.paymentMethod || data.paymentMethod === 'cash' || data.paymentMethod === 'نقدي';
        if (isCash && !shiftId && (Number(data.totalPaid) > 0)) {
          alert('⚠️ تنبيه أمان مالي صارم: لا يمكن استلام أو توريد نقدية لعدم وجود مناوبة مفتوحة! يُرجى فتح مناوبة أولاً لتسجيل واستقرار النقدية في الدرج والعهدة.');
          setLoading(false);
          return;
        }
        const newClientRef = await addClient(data, shiftId || null, employeeId || null);
        setCreatedClientModal({ ...data, id: newClientRef?.id || 'new' });
      }
      setModal(false);
    } catch (err) {
      console.error('Save client error:', err);
      alert('حدث خطأ أثناء حفظ بيانات العضو: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (client) => {
    try {
      const newStatus = client.status === 'paused' ? 'active' : 'paused';
      await toggleClientStatus(client.id, newStatus);
    } catch (err) {
      console.error('Error toggling client status:', err);
      alert('حدث خطأ أثناء تغيير حالة العميل: ' + (err.message || 'يرجى المحاولة لاحقاً'));
    }
  };

  const openSessionModalForClient = async (client) => {
    setSessionModal(client);
    setSubsLoading(true);
    try {
      const unsub = getClientSubscriptions(client.id, (subs) => {
        const computed = subs.map(s => {
          const isWs = s.packageType === 'workspace' || !!s.totalHours;
          const total = isWs ? (Number(s.totalHours || s.packageSessions) || 0) : (Number(s.packageSessions) || 0);
          const used = isWs ? (Number(s.hoursUsed || s.sessionsUsed) || 0) : (Number(s.sessionsUsed) || 0);
          const rem = Math.max(0, parseFloat((total - used).toFixed(2)));
          const isCheckedIn = !!s.currentSession?.checkIn;
          return {
            ...s,
            isWorkspace: isWs,
            total,
            used,
            remaining: rem,
            isCheckedIn,
            isActive: (rem > 0 || isCheckedIn) && s.status !== 'paused'
          };
        });
        setClientSubsForSession(computed);
        setSubsLoading(false);
      });
      return () => unsub();
    } catch (e) {
      setSubsLoading(false);
    }
  };

  const handleWorkspaceAction = async (sub) => {
    if (!sessionModal) return;
    setLoading(true);
    try {
      if (sub.isCheckedIn) {
        const res = await recordWorkspaceCheckOut(sessionModal.id, sub.id, shiftId || null, employeeId || null);
        alert('🔴 تم تسجيل خروج المشترك (' + sessionModal.name + ') بنجاح!\nالمدة المستهلكة: ' + res.durationHours + ' ساعة (' + res.durationMinutes + ' دقيقة)\nالمتبقي في الرصيد: ' + res.remainingHours + ' ساعة');
      } else {
        const res = await recordWorkspaceCheckIn(sessionModal.id, sub.id, shiftId || null, employeeId || null);
        alert('🟢 تم تسجيل دخول المشترك (' + sessionModal.name + ') إلى مساحة العمل بنجاح!\nبدء التوقيت الآن (الرصيد المتاح: ' + res.remainingHours + ' ساعة)');
      }
      setSessionModal(null);
      setClientSubsForSession([]);
    } catch (err) {
      alert(err.message || 'حدث خطأ أثناء العملية');
    } finally {
      setLoading(false);
    }
  };

  const handleRecordSessionForSub = async (sub) => {
    if (!sessionModal) return;
    setLoading(true);
    try {
      await recordSession(sessionModal.id, shiftId || null, employeeId || null, sub.id || null);
      alert('✅ تم تسجيل حضور حصة بنجاح للمشترك (' + sessionModal.name + ')');
      setSessionModal(null);
      setClientSubsForSession([]);
    } catch (err) {
      alert(err.message || 'حدث خطأ أثناء العملية');
    } finally {
      setLoading(false);
    }
  };

  const handlePay = async (e) => {
    e.preventDefault();
    if (!payModal) return;
    const isCash = !payMethod || payMethod === 'cash' || payMethod === 'نقدي';
    if (isCash && Number(payAmount) > 0 && !shiftId) {
      alert('⚠️ تنبيه أمان مالي صارم: لا يمكن تحصيل مبالغ نقدية لعدم وجود مناوبة مفتوحة! يُرجى فتح مناوبة أولاً لتسجيل النقدية في درج الخزينة.');
      return;
    }
    setLoading(true);
    try {
      await recordPayment(
        payModal.id,
        payAmount,
        shiftId || null,
        employeeId || null,
        payNote || 'تحصيل دفعة من العضو',
        payModal.name,
        payMethod || 'cash'
      );
      setPayModal(null);
      setPayAmount('');
      setPayNote('');
    } finally {
      setLoading(false);
    }
  };

  if (selectedProfile) {
    return (
      <ClientProfile
        client={selectedProfile}
        packages={packages}
        onBack={() => setSelectedProfile(null)}
        isEmployee={isEmployee}
        shiftId={shiftId}
        employeeId={employeeId}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ color: '#ffffff', fontSize: 18, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={22} style={{ color: '#38bdf8' }} />
            <span>إدارة الأعضاء والمشتركين</span>
          </h2>
          <p style={{ color: '#93c5fd', fontSize: 13, margin: '4px 0 0' }}>
            إجمالي الأعضاء: <strong style={{ color: '#fff' }}>{clients.length}</strong> • 
            النشطين: <strong style={{ color: '#34d399' }}>{clients.filter(c => getClientStatus(c) === 'active').length}</strong> • 
            المديونيات: <strong style={{ color: '#f87171' }}>{formatCurrency(totalOutstandingDebts)}</strong>
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button
            size="sm"
            onClick={handleExportClientsExcel}
            style={{
              background: 'linear-gradient(135deg, #059669, #10b981)', color: '#fff', fontWeight: 800,
              display: 'inline-flex', alignItems: 'center', gap: 6
            }}
          >
            <FileSpreadsheet size={15} />
            <span>تصدير Excel</span>
          </Button>
          <Button
            onClick={openAdd}
            variant="primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 800 }}
          >
            <Plus size={16} />
            <span>إضافة عضو جديد</span>
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar Card */}
      <Card style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '16px 18px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Filter Status Pills */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 700 }}>تصفية:</span>
            {[
              ['all', 'كافة الأعضاء', Users],
              ['active', 'نشطين فقط', CheckCircle2],
              ['debts', 'عليهم متبقي (' + totalDebtorsCount + ')', AlertTriangle],
              ['expired', 'باقات منتهية', XCircle],
              ['paused', 'موقوفين مؤقتاً', PauseCircle]
            ].map(([key, label, IconComp]) => (
              <button
                key={key}
                onClick={() => setFilterStatus(key)}
                style={{
                  padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                  fontFamily: 'Cairo, sans-serif', border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: filterStatus === key ? 'linear-gradient(135deg, #1d4ed8, #3b82f6)' : 'rgba(255,255,255,0.05)',
                  color: filterStatus === key ? '#ffffff' : '#94a3b8',
                  boxShadow: filterStatus === key ? '0 0 12px rgba(59,130,246,0.35)' : 'none'
                }}
              >
                <IconComp size={13} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div style={{ position: 'relative' }}>
            <Input
              placeholder="ابحث بالاسم، رقم الهاتف، أو كود العضوية..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
      </Card>

      {/* Clients Cards Grid */}
      {filtered.length === 0 ? (
        <EmptyState icon={<Users size={36} style={{ color: '#94a3b8' }} />} message="لا يوجد أعضاء مطابقين للبحث أو التصفية الحالية" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 16 }}>
          {paginatedClients.map(client => {
            const pkg = getPkg(client.packageId);
            const isWs = client.packageType === 'workspace' || client.totalHours;
            const remaining = (client.packageSessions || 0) - (client.sessionsUsed || 0);
            const balance = getClientBalance(client);
            const clientStatus = getClientStatus(client);

            return (
              <Card
                key={client.id}
                style={{
                  background: 'var(--bg-card)',
                  border: balance > 0 ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid var(--border)',
                  borderRight: '4px solid ' + (clientStatus === 'active' ? '#10b981' : clientStatus === 'paused' ? '#f59e0b' : '#ef4444'),
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  padding: '16px 18px',
                  borderRadius: '16px',
                  boxSizing: 'border-box'
                }}
              >
                {/* Header: Name, Phone, Member ID, Status Badge & Admin Tools */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div>
                    <h3 style={{ margin: '0 0 4px', fontSize: 16, color: '#f8fafc', fontWeight: 800 }}>
                      {client.name}
                    </h3>
                    <span style={{ color: '#94a3b8', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Phone size={12} style={{ color: '#38bdf8' }} />
                      <span>{client.phone || 'بدون هاتف'}</span>
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {!isEmployee && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <button
                            type="button"
                            onClick={() => openEdit(client)}
                            title="تعديل بيانات العضو"
                            style={{
                              background: 'rgba(255, 255, 255, 0.07)', border: '1px solid rgba(255, 255, 255, 0.15)',
                              borderRadius: 6, width: 26, height: 26, display: 'flex', alignItems: 'center',
                              justifyContent: 'center', color: '#93c5fd', cursor: 'pointer'
                            }}
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(client)}
                            title={clientStatus === 'paused' ? 'تفعيل العضو' : 'إيقاف مؤقت'}
                            style={{
                              background: 'rgba(255, 255, 255, 0.07)', border: '1px solid rgba(255, 255, 255, 0.15)',
                              borderRadius: 6, width: 26, height: 26, display: 'flex', alignItems: 'center',
                              justifyContent: 'center', color: clientStatus === 'paused' ? '#34d399' : '#fbbf24', cursor: 'pointer'
                            }}
                          >
                            {clientStatus === 'paused' ? <Play size={12} /> : <Pause size={12} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteId(client.id)}
                            title="حذف العضو"
                            style={{
                              background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)',
                              borderRadius: 6, width: 26, height: 26, display: 'flex', alignItems: 'center',
                              justifyContent: 'center', color: '#f87171', cursor: 'pointer'
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                      <div style={{
                        background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.35)',
                        padding: '2px 8px', borderRadius: 6, color: '#60a5fa', fontWeight: 800, fontSize: 12
                      }}>
                        #{client.memberId || '—'}
                      </div>
                    </div>
                    <Badge color={clientStatus === 'active' ? 'green' : clientStatus === 'paused' ? 'amber' : 'red'}>
                      {clientStatus === 'active' ? 'نشط' : clientStatus === 'paused' ? 'موقوف' : 'منتهي'}
                    </Badge>
                  </div>
                </div>

                {/* Info Grid (2x2) */}
                <div style={{
                  background: 'rgba(10, 22, 43, 0.6)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 10,
                  padding: '10px 12px',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px 12px',
                  fontSize: 12
                }}>
                  <div>
                    <span style={{ color: '#64748b', display: 'block' }}>الباقة:</span>
                    <strong style={{ color: '#93c5fd', fontSize: 13 }}>{pkg?.name || client.packageName || 'غير محدد'}</strong>
                  </div>

                  <div>
                    <span style={{ color: '#64748b', display: 'block' }}>الرصيد المتبقي:</span>
                    <strong style={{ color: remaining <= 0 ? '#f87171' : '#34d399', fontSize: 13 }}>
                      {isWs ? formatHoursClock(remaining) : (remaining + ' حصة')}
                    </strong>
                  </div>

                  <div>
                    <span style={{ color: '#64748b', display: 'block' }}>المدفوع:</span>
                    <strong style={{ color: '#e2e8f0' }}>{formatCurrency(client.totalPaid || 0)}</strong>
                  </div>

                  <div>
                    <span style={{ color: '#64748b', display: 'block' }}>المتبقي (المديونية):</span>
                    <strong style={{ color: balance > 0 ? '#f87171' : '#10b981', fontWeight: 800 }}>
                      {formatCurrency(balance)}
                    </strong>
                  </div>
                </div>

                {/* Subscription Dates Bar */}
                {(() => {
                  const today = new Date().toISOString().split('T')[0];
                  let endD = client.endDate;
                  if (!endD && client.startDate) {
                    const days = Number(pkg?.durationDays) || 30;
                    const d = new Date(client.startDate);
                    d.setDate(d.getDate() + days);
                    endD = d.toISOString().split('T')[0];
                  }
                  const isPast = endD && today > endD;
                  return (
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: 'rgba(15, 23, 42, 0.65)', border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 10, padding: '7px 12px', fontSize: 12, flexWrap: 'wrap', gap: 6
                    }}>
                      <span style={{ color: '#93c5fd', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Calendar size={12} style={{ color: '#38bdf8' }} />
                        <span>البدء: <strong>{client.startDate || '—'}</strong></span>
                      </span>
                      <span style={{
                        color: isPast ? '#f87171' : '#34d399',
                        fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4
                      }}>
                        <Clock size={12} />
                        <span>الانتهاء: <strong>{endD || '—'}</strong></span>
                        {isPast && <span style={{ fontSize: 10, color: '#ef4444' }}>(منتهي)</span>}
                      </span>
                    </div>
                  );
                })()}

                {/* Primary Actions: Profile & Attendance */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 'auto' }}>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => setSelectedProfile(client)}
                    style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    <User size={14} />
                    <span>الملف الشخصي</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openSessionModalForClient(client)}
                    style={{
                      background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.35)',
                      color: '#34d399', fontWeight: 700, display: 'inline-flex', alignItems: 'center',
                      justifyContent: 'center', gap: 6
                    }}
                  >
                    <Clock size={14} />
                    <span>تسجيل حضور</span>
                  </Button>
                </div>

                {/* Secondary Quick Actions Toolbar */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  paddingTop: 10,
                  borderTop: '1px solid rgba(255,255,255,0.06)'
                }}>
                  {/* Row 1: Finance & WhatsApp Communication */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setPayModal(client)}
                      style={{
                        flex: 1, padding: '5px 6px', fontSize: 11, fontWeight: 700,
                        background: 'rgba(59, 130, 246, 0.12)', color: '#93c5fd',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4
                      }}
                    >
                      <CreditCard size={12} />
                      <span>تحصيل</span>
                    </Button>

                    <Button
                      size="sm"
                      onClick={() => handleSharePortal(client)}
                      style={{
                        flex: 1, padding: '5px 6px', fontSize: 11, fontWeight: 700,
                        background: 'rgba(37, 211, 102, 0.15)', color: '#25d366',
                        border: '1px solid rgba(37, 211, 102, 0.35)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4
                      }}
                      title="إرسال رسالة الاشتراك والترحيب ورابط البوابة"
                    >
                      <MessageCircle size={12} />
                      <span>واتساب</span>
                    </Button>

                    {balance > 0 && (
                      <Button
                        size="sm"
                        onClick={() => handleSendDebtReminder(client, balance)}
                        style={{
                          flex: 1, padding: '5px 6px', fontSize: 11, fontWeight: 700,
                          background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5',
                          border: '1px solid rgba(239, 68, 68, 0.35)',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4
                        }}
                        title="إرسال تذكير بالمديونية المتبقية"
                      >
                        <AlertCircle size={12} />
                        <span>مطالبة</span>
                      </Button>
                    )}
                  </div>

                  {/* Row 2: Freeze Subscription & Reset PIN */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    {client.isFrozen || clientStatus === 'paused' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleUnfreeze(client)}
                        title="إلغاء التجميد وتفعيل الاشتراك وتمديد المدة"
                        style={{
                          flex: 1, padding: '5px 6px', fontSize: 11, fontWeight: 700,
                          background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e',
                          border: '1px solid rgba(34, 197, 94, 0.3)',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4
                        }}
                      >
                        <Flame size={12} />
                        <span>إلغاء التجميد</span>
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleOpenFreeze(client)}
                        title="تجميد الاشتراك مؤقتاً (سفر / امتحانات) وتمديد تاريخ الانتهاء"
                        style={{
                          flex: 1, padding: '5px 6px', fontSize: 11, fontWeight: 700,
                          background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8',
                          border: '1px solid rgba(56, 189, 248, 0.3)',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4
                        }}
                      >
                        <Snowflake size={12} />
                        <span>تجميد</span>
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleResetClientPin(client)}
                      title="إعادة تهيئة وتصفير كلمة المرور للعضو ليعين كلمة سر جديدة بنفسه"
                      style={{
                        flex: 1, padding: '5px 6px', fontSize: 11, fontWeight: 700,
                        background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4
                      }}
                    >
                      <RotateCcw size={12} />
                      <span>تصفير الـ PIN</span>
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          padding: '14px 18px',
          background: 'var(--bg-card)',
          borderRadius: 14,
          border: '1px solid var(--border)'
        }}>
          <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 700 }}>
            عرض {((page - 1) * PAGE_SIZE) + 1} - {Math.min(page * PAGE_SIZE, filtered.length)} من إجمالي {filtered.length} عضو
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12.5 }}
            >
              السابق
            </Button>
            
            <div style={{
              background: 'rgba(56, 189, 248, 0.15)',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              color: '#38bdf8',
              fontWeight: 800,
              fontSize: 13,
              padding: '6px 12px',
              borderRadius: 8
            }}>
              صفحة {page} من {totalPages}
            </div>

            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12.5 }}
            >
              التالي
            </Button>
          </div>
        </div>
      )}

      {/* Add / Edit Client Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editClient ? 'تعديل بيانات العضو' : 'إضافة عضو جديد'} size="lg">
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            <Input label="رقم العضوية (تلقائي)" value={form.memberId} onChange={e => setForm({ ...form, memberId: e.target.value })} required />
            <Input label="اسم العضو" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="الاسم ثلاثي" required />
            <Input label="رقم الهاتف" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="01xxxxxxxxx" required />
            <Input label="العنوان / المنطقة" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="المدينة / المنطقة" />
          </div>

          {/* Gender, Age, and Birthday Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.9fr 1.1fr', gap: 10 }}>
            <div>
              <label style={{ display: 'block', color: '#cbd5e1', fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>
                النوع / الجنس (لتوجيه رسائل الواتساب):
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, gender: 'male' })}
                  style={{
                    flex: 1, padding: '7px 8px', borderRadius: 8,
                    background: (form.gender || 'male') === 'male' ? 'linear-gradient(135deg, #1d4ed8, #2563eb)' : 'rgba(15, 23, 42, 0.8)',
                    color: '#ffffff',
                    border: (form.gender || 'male') === 'male' ? '2px solid #60a5fa' : '1px solid rgba(255,255,255,0.15)',
                    fontWeight: 800, fontSize: 12.5, cursor: 'pointer', fontFamily: 'Cairo, sans-serif',
                    boxShadow: (form.gender || 'male') === 'male' ? '0 0 10px rgba(37,99,235,0.4)' : 'none'
                  }}
                >
                  👨 ذكر (أستاذ)
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, gender: 'female' })}
                  style={{
                    flex: 1, padding: '7px 8px', borderRadius: 8,
                    background: form.gender === 'female' ? 'linear-gradient(135deg, #be185d, #db2777)' : 'rgba(15, 23, 42, 0.8)',
                    color: '#ffffff',
                    border: form.gender === 'female' ? '2px solid #f472b6' : '1px solid rgba(255,255,255,0.15)',
                    fontWeight: 800, fontSize: 12.5, cursor: 'pointer', fontFamily: 'Cairo, sans-serif',
                    boxShadow: form.gender === 'female' ? '0 0 10px rgba(219,39,119,0.4)' : 'none'
                  }}
                >
                  👩 أنثى (أستاذة)
                </button>
              </div>
            </div>

            <div>
              <Input
                label="العمر / السن"
                type="number"
                value={form.age}
                onChange={e => setForm({ ...form, age: e.target.value })}
                placeholder="مثال: 22"
              />
            </div>

            <div>
              <DateInputDMY
                label="🎂 تاريخ الميلاد (للهدايا)"
                value={form.birthDate || ''}
                onChange={e => {
                  const bVal = e.target.value;
                  let calculatedAge = form.age;
                  if (bVal) {
                    const bYear = new Date(bVal).getFullYear();
                    const nowYear = new Date().getFullYear();
                    if (bYear && bYear > 1900 && bYear <= nowYear) {
                      calculatedAge = nowYear - bYear;
                    }
                  }
                  setForm({ ...form, birthDate: bVal, age: calculatedAge });
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: form.packageType !== 'workspace' ? '1fr 1fr' : '1fr', gap: 10 }}>
            <Select
              label="اختر الباقة / الكورس"
              value={form.packageId}
              onChange={e => handlePackageChange(e.target.value)}
              required
            >
              {packages.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} — {formatCurrency(p.price)} ({p.type === 'workspace' ? ((p.totalHours || p.sessions) + ' ساعة') : (p.sessions + ' حصة')})
                </option>
              ))}
            </Select>

            {form.packageType !== 'workspace' && (
              <div>
                <label style={{ display: 'block', color: '#93c5fd', fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>
                  📅 ميعاد الكورس والقاعة:
                </label>
                <Select
                  value={form.scheduleId || ''}
                  onChange={e => handleScheduleChange(e.target.value)}
                >
                  <option value="">-- بدون تحديد ميعاد حالياً (مجموعة مفتوحة) --</option>
                  {courseSchedules.filter(s => s.status !== 'cancelled').map(s => (
                    <option key={s.id} value={s.id}>
                      {s.courseName} — {s.days} ({s.startTime} إلى {s.endTime}) [🚪 {s.room || 'قاعة 1'}] [متبقي {s.availableSeats} مقاعد]
                    </option>
                  ))}
                </Select>
                {form.scheduleDays && (
                  <span style={{ fontSize: 10.5, color: '#34d399', display: 'block', marginTop: 2 }}>
                    ✅ مرتبط بمجموعة: {form.scheduleDays} ({form.scheduleTime}) - {form.scheduleRoom}
                  </span>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input label="سعر الباقة الإجمالي (ج.م)" type="number" value={form.packagePrice} onChange={e => setForm({ ...form, packagePrice: e.target.value })} required />
            <Input label="المبلغ المسدد الآن (ج.م)" type="number" value={form.totalPaid} onChange={e => setForm({ ...form, totalPaid: e.target.value })} placeholder="0" required />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <DateInputDMY
              label="تاريخ بدء الاشتراك"
              value={form.startDate}
              onChange={e => handleStartDateChange(e.target.value)}
              required
            />
            <DateInputDMY
              label="تاريخ انتهاء الاشتراك"
              value={form.endDate}
              onChange={e => setForm({ ...form, endDate: e.target.value })}
              required
            />
          </div>
          <span style={{ fontSize: 11, color: '#93c5fd', marginTop: -6, display: 'block' }}>
            ⏳ تاريخ الانتهاء يُحسب تلقائياً حسب مدة الباقة ({form.durationDays || 30} يوم) ويمكنك تعديله يدوياً لأي موعد تريده.
          </span>

          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <Button type="submit" variant="primary" className="flex-1" disabled={loading}>
              {loading ? 'جاري الحفظ...' : 'حفظ بيانات العضو'}
            </Button>
            <Button type="button" variant="ghost" className="flex-1" onClick={() => setModal(false)}>
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

            {/* Post Registration WhatsApp Welcome Modal */}
      {createdClientModal && (
        <Modal
          open={!!createdClientModal}
          onClose={() => setCreatedClientModal(null)}
          title="🎉 تم تسجيل العضو والاشتراك بنجاح!"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: 'rgba(34, 197, 94, 0.12)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: 14, padding: 14, textAlign: 'right' }}>
              <strong style={{ color: '#34d399', fontSize: 15, display: 'block', marginBottom: 4 }}>
                👤 {createdClientModal.name} (عضوية #{createdClientModal.memberId})
              </strong>
              <p style={{ margin: 0, color: '#e2e8f0', fontSize: 13, lineHeight: 1.6 }}>
                تم إنشاء الحساب وحفظ الباقة والمدفوعات وتزامن المقاعد بالقاعة بنجاح. يمكنك الآن إرسال رسالة الترحيب ورابط البوابة للعميل عبر الواتساب فوراً.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <Button
                variant="primary"
                onClick={() => {
                  handleSharePortal(createdClientModal);
                  setCreatedClientModal(null);
                }}
                style={{ flex: 1, background: '#25d366', color: '#ffffff', fontWeight: 800, padding: '12px', fontSize: 14 }}
              >
                📲 إرسال رسالة الاشتراك بالواتساب الآن
              </Button>
              <Button
                variant="ghost"
                onClick={() => setCreatedClientModal(null)}
                style={{ border: '1px solid rgba(255,255,255,0.15)' }}
              >
                إغلاق
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Pay Modal */}
      {payModal && (
        <Modal open={!!payModal} onClose={() => setPayModal(null)} title={'تحصيل دفعة نقدية — ' + payModal.name}>
          <form onSubmit={handlePay} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: 12, borderRadius: 8, color: '#93c5fd', fontSize: 13 }}>
              المبلغ المتبقي على العضو: <strong>{formatCurrency(getClientBalance(payModal))}</strong>
            </div>

            <Input
              label="المبلغ المحصل (ج.م)"
              type="number"
              value={payAmount}
              onChange={e => setPayAmount(e.target.value)}
              placeholder="مثال: 200"
              required
              autoFocus
            />

            <Input
              label="ملاحظات / بيان الإيصال"
              value={payNote}
              onChange={e => setPayNote(e.target.value)}
              placeholder="سداد قسط / جزء من الاشتراك"
            />

            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <Button type="submit" variant="primary" className="flex-1" disabled={loading}>
                {loading ? 'جاري التحصيل...' : 'تأكيد واستلام الدفعة'}
              </Button>
              <Button type="button" variant="ghost" className="flex-1" onClick={() => setPayModal(null)}>
                إلغاء
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Session Modal */}
      {sessionModal && (
        <Modal open={!!sessionModal} onClose={() => setSessionModal(null)} title={'تسجيل حضور — ' + sessionModal.name}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {subsLoading ? (
              <p style={{ color: '#94a3b8', textAlign: 'center' }}>جاري تحميل الباقات...</p>
            ) : clientSubsForSession.length === 0 ? (
              <p style={{ color: '#f87171', textAlign: 'center' }}>لا توجد باقات نشطة لهذا المشترك</p>
            ) : (
              clientSubsForSession.map(sub => (
                <div key={sub.id} style={{ background: 'var(--bg-base)', padding: 12, borderRadius: 10, border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{ color: '#fff' }}>{sub.packageName}</strong>
                    <span style={{ display: 'block', color: '#93c5fd', fontSize: 12 }}>
                      المتبقي: {sub.isWorkspace ? formatHoursClock(sub.remaining) : (sub.remaining + ' حصة')}
                    </span>
                  </div>
                  {sub.isWorkspace ? (
                    <Button size="sm" variant={sub.isCheckedIn ? 'danger' : 'success'} onClick={() => handleWorkspaceAction(sub)} disabled={loading}>
                      {sub.isCheckedIn ? '🔴 تسجيل خروج' : '🟢 تسجيل دخول'}
                    </Button>
                  ) : (
                    <Button size="sm" variant="primary" onClick={() => handleRecordSessionForSub(sub)} disabled={loading || sub.remaining <= 0}>
                      ✓ تسجيل حضور حصة
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </Modal>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteId}
        title="حذف العضو"
        message="هل أنت متأكد من حذف هذا العضو؟ سيتم حذف كافة بياناته وسجلاته."
        onConfirm={async () => {
          await deleteClient(deleteId);
          setDeleteId(null);
        }}
        onCancel={() => setDeleteId(null)}
      />
      {/* Subscription Freeze Modal */}
      <Modal open={!!freezeModalClient} onClose={() => setFreezeModalClient(null)} title="❄️ تجميد اشتراك العضو (Subscription Freeze)">
        {(() => {
          const activeSub = subscriptions.find(s => s.clientId === freezeModalClient?.id && s.status !== 'cancelled');
          const quota = getMonthlyFreezeQuota(activeSub);
          return (
            <form onSubmit={handleConfirmFreeze} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: 'rgba(15, 23, 42, 0.85)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: 12, padding: '12px 16px' }}>
                <h4 style={{ margin: 0, color: '#ffffff', fontSize: 15, fontWeight: 800 }}>
                  العضو: {freezeModalClient?.name}
                </h4>
                <p style={{ margin: '4px 0 0', color: '#93c5fd', fontSize: 12 }}>
                  عضوية: #{freezeModalClient?.memberId} | 📱 {freezeModalClient?.phone}
                </p>
              </div>

              <div style={{ background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: 12, padding: '10px 14px', fontSize: 12, color: '#e2e8f0', lineHeight: 1.6 }}>
                <strong>سياسة التجميد المعتمدة:</strong><br />
                • الحد الأدنى: <strong>3 أيام</strong> للمرة الواحدة.<br />
                • الحد الأقصى: <strong>10 أيام</strong> شهرياً (يمكن تقسيمها على مرتين أو 3 مرات).<br />
                • رصيد التجميد المتاح للعضو هذا الشهر: <strong>{quota.remainingDays} من 10 أيام</strong> (مستهلك: {quota.usedThisMonth} يوم).
              </div>

              <div>
                <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                  مدة التجميد بالأيام (من 3 إلى {quota.remainingDays} يوم):
                </label>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                  {Array.from(new Set([3, 4, 5, 7, quota.remainingDays]))
                    .filter(d => d >= 3 && d <= quota.remainingDays)
                    .sort((a, b) => a - b)
                    .map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setFreezeDays(d)}
                      style={{
                        flex: 1,
                        minWidth: '60px',
                        padding: '8px',
                        borderRadius: 8,
                        background: freezeDays === d ? '#0284c7' : 'rgba(15, 23, 42, 0.8)',
                        color: '#fff',
                        border: freezeDays === d ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.1)',
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: 'pointer',
                        fontFamily: 'Cairo, sans-serif'
                      }}
                    >
                      {d} {d === 3 ? 'أيام (أدنى)' : d === quota.remainingDays ? 'يوم (أقصى متاح)' : 'أيام'}
                    </button>
                  ))}
                </div>
                <Input
                  type="number"
                  min="3"
                  max={quota.remainingDays}
                  value={freezeDays}
                  onChange={e => setFreezeDays(Math.max(3, Math.min(quota.remainingDays, Number(e.target.value) || 3)))}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                  سبب التجميد (يظهر للمشترك):
                </label>
                <select
                  value={freezeReason}
                  onChange={e => setFreezeReason(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(15, 23, 42, 0.9)',
                    border: '1px solid rgba(59,130,246,0.3)',
                    borderRadius: 10,
                    padding: '10px 12px',
                    color: '#ffffff',
                    fontSize: 13,
                    fontFamily: 'Cairo, sans-serif',
                    marginBottom: 8
                  }}
                >
                  <option value="فترة امتحانات">📚 فترة امتحانات</option>
                  <option value="سفر مؤقت">✈️ سفر مؤقت</option>
                  <option value="عذر صحي / إجازة">🩺 عذر صحي / إجازة</option>
                  <option value="طلب المشترك">👤 طلب المشترك</option>
                </select>
              </div>

              <div style={{ background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: 10, padding: 10, fontSize: 12, color: '#bae6fd' }}>
                💡 <strong>تنبيه ذكي:</strong> سيتم تمديد تاريخ صلاحية باقة المشترك تلقائياً بعدد أيام التجميد ({freezeDays} يوم). وإذا تم فك التجميد مبكراً، سيتم احتساب الأيام الفعلية فقط (بحد أدنى 3 أيام) وإعادة باقي الأيام لرصيد الشهر تلقائياً.
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                <Button variant="ghost" type="button" onClick={() => setFreezeModalClient(null)} style={{ flex: 1 }}>إلغاء</Button>
                <Button variant="primary" type="submit" disabled={freezeLoading} style={{ flex: 1.5, background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)' }}>
                  {freezeLoading ? 'جاري التجميد...' : '❄️ تأكيد تجميد الاشتراك'}
                </Button>
              </div>
            </form>
          );
        })()}
      </Modal>
    </div>
  );
}