import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { 
  getInstructors, addInstructor, updateInstructor, deleteInstructor,
  getAllSubscriptions, getPackages, getClients, settleInstructorSubscriptions,
  undoInstructorSettlement, getAllShifts, resetInstructorPin 
} from '../../../services/db';
import { Card, StatCard, EmptyState, Button, Input, Select, Badge, Modal, ConfirmDialog } from '../../../components/ui';
import { formatCurrency, formatDateTime, formatDate } from '../../../utils/constants';
import { exportToExcel } from '../../../utils/excelExport';
import { openWhatsApp } from '../../../utils/whatsapp';

export default function InstructorsTab() {
  const { user } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState('settlement'); // 'settlement' | 'directory'

  // Data States
  const [instructors, setInstructors] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [packages, setPackages] = useState([]);
  const [clients, setClients] = useState([]);
  const [shifts, setShifts] = useState([]);

  // Directory Modal States
  const [instModal, setInstModal] = useState(false);
  const [createdInstModal, setCreatedInstModal] = useState(null);
  const [editInst, setEditInst] = useState(null);
  const [deleteInstId, setDeleteInstId] = useState(null);
  const [undoSubId, setUndoSubId] = useState(null);
  const [instForm, setInstForm] = useState({
    name: '', phone: '', subject: '', defaultShareType: 'percentage', defaultShareValue: '', notes: ''
  });
  const [instLoading, setInstLoading] = useState(false);

  // Settlement View Filters
  const [selectedTeacher, setSelectedTeacher] = useState('all');
  const [statusFilter, setStatusFilter] = useState('unsettled'); // 'unsettled', 'settled', 'all'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubIds, setSelectedSubIds] = useState([]);

  // Settlement Execution Modal
  const [settleModal, setSettleModal] = useState(false);
  const [settleTarget, setSettleTarget] = useState(null); // { instructorName, subIds, count, totalAmount }
  const [settleNote, setSettleNote] = useState('');
  const [selectedShiftId, setSelectedShiftId] = useState('');
  const [settleLoading, setSettleLoading] = useState(false);

  useEffect(() => {
    const unsubInst = getInstructors(setInstructors);
    const unsubSub = getAllSubscriptions(setSubscriptions);
    const unsubPkg = getPackages(setPackages);
    const unsubClt = getClients(setClients);
    const unsubShf = getAllShifts(setShifts);
    return () => { unsubInst(); unsubSub(); unsubPkg(); unsubClt(); unsubShf(); };
  }, []);

  // Map clients and packages for fast lookup
  const clientMap = useMemo(() => {
    const map = {};
    clients.forEach(c => { map[c.id] = c; });
    return map;
  }, [clients]);

  const packageMap = useMemo(() => {
    const map = {};
    packages.forEach(p => { map[p.id] = p; });
    return map;
  }, [packages]);

  // Open active shifts
  const openShifts = useMemo(() => {
    return shifts.filter(s => s.status === 'open');
  }, [shifts]);

  // Extract all distinct teachers
  const allTeacherNames = useMemo(() => {
    const names = new Set();
    instructors.forEach(i => { if (i.name?.trim()) names.add(i.name.trim()); });
    packages.forEach(p => { if (p.instructorName?.trim()) names.add(p.instructorName.trim()); });
    subscriptions.forEach(s => {
      if (s.instructorName?.trim()) names.add(s.instructorName.trim());
    });
    return Array.from(names).sort();
  }, [instructors, packages, subscriptions]);

  // Enriched Subscriptions with Teacher Share Calculation
  const enrichedSubscriptions = useMemo(() => {
    return subscriptions.map(s => {
      const client = clientMap[s.clientId] || {};
      const pkg = packageMap[s.packageId] || {};

      // Find matching instructor from directory
      const matchedInst = instructors.find(i => {
        const iName = (i.name || '').trim().toLowerCase();
        const iSubj = (i.subject || '').trim().toLowerCase();
        const sName = (s.instructorName || pkg.instructorName || '').trim().toLowerCase();
        const sPkgName = (s.packageName || pkg.name || '').trim().toLowerCase();
        return (iName && sName && (iName.includes(sName) || sName.includes(iName))) ||
               (iSubj && sPkgName && (iSubj.includes(sPkgName) || sPkgName.includes(iSubj)));
      });

      const instructorName = s.instructorName || pkg.instructorName || matchedInst?.name || '';
      const shareType = s.instructorShareType || pkg.instructorShareType || matchedInst?.defaultShareType || 'percentage';
      const shareValue = Number(
        s.instructorShareValue !== undefined 
          ? s.instructorShareValue 
          : (pkg.instructorShareValue !== undefined ? pkg.instructorShareValue : (matchedInst?.defaultShareValue || 0))
      );
      const price = Number(s.packagePrice || pkg.price || 0);

      let shareAmount = 0;
      if (instructorName && shareValue > 0) {
        if (shareType === 'percentage') {
          shareAmount = Math.round((price * shareValue) / 100);
        } else if (shareType === 'fixed') {
          shareAmount = shareValue;
        }
      }

      return {
        ...s,
        clientName: client.name || s.clientName || 'مشترك',
        clientPhone: client.phone || '',
        clientMemberId: client.memberId || '—',
        instructorName,
        shareType,
        shareValue,
        shareAmount,
        price,
        isSettled: !!s.instructorSettled
      };
    }).filter(s => s.instructorName); // Only subscriptions linked to a teacher
  }, [subscriptions, clientMap, packageMap]);

  // Filtered Subscriptions
  const filteredSubs = useMemo(() => {
    return enrichedSubscriptions.filter(s => {
      if (selectedTeacher !== 'all' && s.instructorName !== selectedTeacher) return false;
      if (statusFilter === 'unsettled' && s.isSettled) return false;
      if (statusFilter === 'settled' && !s.isSettled) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const cName = (s.clientName || '').toLowerCase();
        const pName = (s.packageName || '').toLowerCase();
        const tName = (s.instructorName || '').toLowerCase();
        const phone = (s.clientPhone || '').toLowerCase();
        if (!cName.includes(q) && !pName.includes(q) && !tName.includes(q) && !phone.includes(q)) return false;
      }

      return true;
    });
  }, [enrichedSubscriptions, selectedTeacher, statusFilter, searchQuery]);

  // Stats
  const stats = useMemo(() => {
    const targetSubs = selectedTeacher === 'all' 
      ? enrichedSubscriptions 
      : enrichedSubscriptions.filter(s => s.instructorName === selectedTeacher);

    const totalCount = targetSubs.length;
    const totalRevenue = targetSubs.reduce((sum, s) => sum + s.price, 0);
    const unsettledSubs = targetSubs.filter(s => !s.isSettled);
    const settledSubs = targetSubs.filter(s => s.isSettled);

    const totalDueUnsettled = unsettledSubs.reduce((sum, s) => sum + s.shareAmount, 0);
    const totalSettledAmount = settledSubs.reduce((sum, s) => sum + s.shareAmount, 0);

    return {
      totalCount,
      totalRevenue,
      unsettledCount: unsettledSubs.length,
      settledCount: settledSubs.length,
      totalDueUnsettled,
      totalSettledAmount
    };
  }, [enrichedSubscriptions, selectedTeacher]);

  // Directory Handlers
  const openAddInstructor = () => {
    setEditInst(null);
    setInstForm({ name: '', phone: '', subject: '', pinCode: '1234', defaultShareType: 'percentage', defaultShareValue: '', notes: '' });
    setInstModal(true);
  };

  const openEditInstructor = (inst) => {
    setEditInst(inst);
    setInstForm({
      name: inst.name || '',
      phone: inst.phone || '',
      subject: inst.subject || '',
      pinCode: inst.pinCode || '1234',
      defaultShareType: inst.defaultShareType || 'percentage',
      defaultShareValue: inst.defaultShareValue || '',
      notes: inst.notes || ''
    });
    setInstModal(true);
  };

  
  
  const handleResetPinClick = async (inst) => {
    if (!window.confirm(`⚠️ هل أنت متأكد من إعادة تهيئة وتصفير كلمة المرور للأستاذ (${inst.name})؟\nسيتمكن المدرس من تعيين كلمة مرور جديدة بنفسه فور فتح الرابط.`)) return;
    try {
      await resetInstructorPin(inst.id, inst.name);
      alert(`✅ تمت إعادة تهيئة كلمة المرور للأستاذ (${inst.name}) بنجاح!\nسيتم الآن فتح نافذة إرسال الرابط الجديد له على الواتساب.`);
      setCreatedInstModal({ ...inst, isResetNotice: true });
    } catch (err) {
      alert('حدث خطأ أثناء إعادة التعيين: ' + err.message);
    }
  };

    const handleShareInstructorPortal = (inst, isReset = false) => {
    if (!inst) return;
    let cleanPhone = String(inst.phone || '').trim().replace(/\D/g, '');
    if (cleanPhone.startsWith('01')) {
      cleanPhone = '2' + cleanPhone;
    } else if (cleanPhone.startsWith('1') && cleanPhone.length === 10) {
      cleanPhone = '20' + cleanPhone;
    }

    const origin = window.location.origin;
    const directLink = `${origin}/instructor?id=${encodeURIComponent(inst.id || '')}&phone=${encodeURIComponent(inst.phone || '')}`;
    const shareText = inst.defaultShareType === 'fixed' 
      ? `${inst.defaultShareValue} ج.م لكل اشتراك (مبلغ ثابت)`
      : `${inst.defaultShareValue}% من قيمة الباقة`;

    const text = isReset || !inst.pinCode
      ? `مرحباً يا أستاذ ${inst.name} 👋✨\n\nيسعدنا انضمامك لمنظومة THE FIRST GROUP! 🏢🌟\nتم تفعيل بوابتك الخاصة لمتابعة طلابك المشتركين، الحصص المتبقية، وكشف حساب مستحقاتك المالية لحظة بلحظة عبر الرابط التالي:\n🔗 ${directLink}\n\n🔒 عند فتح الرابط لأول مرة، سيطلب منك النظام تعيين كلمة مرور خاصة بك لحماية حسابك.\n\n📚 المادة / التخصص: ${inst.subject || 'مدرس معتمد'}\n💰 نظام الحصة / النسبة: ${shareText}\n\nنتمنى لك تدريساً موفقاً ومميزاً معنا! 🌟🎓`
      : `مرحباً يا أستاذ ${inst.name} 👋✨\n\nرابط بوابتك الخاصة في THE FIRST GROUP:\n🔗 ${directLink}\n\n📚 المادة / التخصص: ${inst.subject || 'مدرس معتمد'}\n💰 نظام الحصة / النسبة: ${shareText}\n\nسجّل دخولك بكلمة المرور الخاصة بك لمتابعة طلابك ومستحقاتك! 🌟🎓`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const waUrl = isMobile
      ? (cleanPhone ? `whatsapp://send?phone=${cleanPhone}&text=${encodeURIComponent(text)}` : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`)
      : (cleanPhone ? `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}` : `https://web.whatsapp.com/send?text=${encodeURIComponent(text)}`);

    window.open(waUrl, isMobile ? '_blank' : 'whatsapp_web');
  };

    const handleSaveInstructor = async (e) => {
    e.preventDefault();
    if (!instForm.name.trim()) return alert('يرجى إدخال اسم المدرس');
    setInstLoading(true);
    try {
      const payload = {
        name: instForm.name.trim(),
        phone: instForm.phone.trim(),
        subject: instForm.subject.trim(),
        pinCode: String(instForm.pinCode || '').trim() || '1234',
        defaultShareType: instForm.defaultShareType || 'percentage',
        defaultShareValue: Number(instForm.defaultShareValue) || 0,
        notes: instForm.notes.trim()
      };

      if (editInst) {
        await updateInstructor(editInst.id, payload);
        setInstModal(false);
      } else {
        const newId = await addInstructor(payload);
        setInstModal(false);
        setCreatedInstModal({ id: newId, ...payload });
      }
    } finally {
      setInstLoading(false);
    }
  };

  // Settlement Handlers
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedSubIds(filteredSubs.filter(s => !s.isSettled).map(s => s.id));
    } else {
      setSelectedSubIds([]);
    }
  };

  const handleToggleSelect = (id) => {
    setSelectedSubIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const openSettleModal = (subsToSettle, instructorName) => {
    const totalAmount = subsToSettle.reduce((sum, s) => sum + s.shareAmount, 0);
    setSettleTarget({
      instructorName,
      subIds: subsToSettle.map(s => s.id),
      count: subsToSettle.length,
      totalAmount
    });
    setSettleNote(`تسوية مستحقات المدرس: ${instructorName} عن (${subsToSettle.length}) اشتراك`);
    // Default to the first open shift if available
    setSelectedShiftId(openShifts.length > 0 ? openShifts[0].id : '');
    setSettleModal(true);
  };

  const handleExecuteSettlement = async () => {
    if (!settleTarget || settleTarget.subIds.length === 0) return;
    setSettleLoading(true);
    try {
      await settleInstructorSubscriptions({
        subscriptionIds: settleTarget.subIds,
        instructorName: settleTarget.instructorName,
        totalAmount: settleTarget.totalAmount,
        note: settleNote,
        shiftId: selectedShiftId || null,
        actorName: user?.name || 'المدير المالي'
      });

      alert(`✅ تمت تسوية ومحاسبة المدرس (${settleTarget.instructorName}) بنجاح!\nالمبلغ: ${formatCurrency(settleTarget.totalAmount)}\nعدد الاشتراكات: ${settleTarget.count}\n💰 تم قيد المصروف بنجاح [${selectedShiftId ? 'من درج الوردية' : 'من الخزينة المركزية للإدارة'}].`);
      setSettleModal(false);
      setSelectedSubIds([]);
    } catch (err) {
      alert(err.message || 'حدث خطأ أثناء إجراء التسوية');
    } finally {
      setSettleLoading(false);
    }
  };

  const handleSendWhatsAppStatement = () => {
    if (selectedTeacher === 'all') {
      return alert('يرجى اختيار مدرس محدد من القائمة لإرسال كشف حسابه');
    }
    const teacherSubs = enrichedSubscriptions.filter(s => s.instructorName === selectedTeacher);
    const unsettled = teacherSubs.filter(s => !s.isSettled);
    const totalDue = unsettled.reduce((sum, s) => sum + s.shareAmount, 0);

    const msg = `كشف حساب ومستحقات المدرس 👨‍🏫📑\nالأستاذ: ${selectedTeacher}\nمن: THE FIRST GROUP 🏢\n---------------------------------\n📊 إجمالي الاشتراكات: ${teacherSubs.length} اشتراك\n⏳ الاشتراكات غير المسددة: ${unsettled.length} اشتراك\n💰 إجمالي المبلغ المستحق لك: ${formatCurrency(totalDue)}\n---------------------------------\nالتاريخ: ${new Date().toLocaleDateString('ar-EG-u-nu-latn')}\nشكراً لتعاونكم المثمر معنا دائماً! 🙏✨`;

    openWhatsApp('', msg);
  };

  const handleExportExcel = () => {
    const title = selectedTeacher === 'all' ? 'كافة_المدرسين' : selectedTeacher.replace(/\s+/g, '_');
    const headers = ['#', 'اسم المدرس', 'اسم الطالب / المشترك', 'رقم العضوية', 'الموبايل', 'اسم الكورس / الباقة', 'سعر الاشتراك', 'نسبة المدرس', 'مستحق المدرس', 'حالة المحاسبة', 'التاريخ'];
    const rows = filteredSubs.map((s, idx) => [
      idx + 1,
      s.instructorName,
      s.clientName,
      s.clientMemberId,
      s.clientPhone,
      s.packageName || 'كورس',
      s.price,
      s.shareType === 'percentage' ? `${s.shareValue}%` : formatCurrency(s.shareValue),
      s.shareAmount,
      s.isSettled ? 'تمت المحاسبة ✅' : 'مستحق للمدرس ⏳',
      s.date ? formatDate(s.date) : '—'
    ]);

    exportToExcel(`كشف_حسابات_المدرس_${title}_${new Date().toISOString().split('T')[0]}`, headers, rows);
  };

  return (
    <>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top Header & Sub-Tab Switcher */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ color: '#ffffff', fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>👨‍🏫</span> حسابات ومستحقات المدرسين والمدربين
          </h2>
          <p style={{ color: '#93c5fd', fontSize: 13, margin: '4px 0 0' }}>
            دليل المدرسين، متابعة اشتراكات الطلاب، وحساب وتسوية نسب ومستحقات المدرسين
          </p>
        </div>

        {/* Sub Tab Switcher Buttons */}
        <div style={{ display: 'flex', gap: 8, background: 'rgba(255,255,255,0.05)', padding: 4, borderRadius: 12, border: '1px solid var(--border)' }}>
          <button
            onClick={() => setActiveSubTab('settlement')}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13,
              fontFamily: 'Cairo, sans-serif', transition: 'all 0.2s',
              background: activeSubTab === 'settlement' ? 'linear-gradient(135deg, #2563eb, #3b82f6)' : 'transparent',
              color: activeSubTab === 'settlement' ? '#ffffff' : '#94a3b8'
            }}
          >
            📑 كشف الحسابات والتسوية
          </button>
          <button
            onClick={() => setActiveSubTab('directory')}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13,
              fontFamily: 'Cairo, sans-serif', transition: 'all 0.2s',
              background: activeSubTab === 'directory' ? 'linear-gradient(135deg, #2563eb, #3b82f6)' : 'transparent',
              color: activeSubTab === 'directory' ? '#ffffff' : '#94a3b8'
            }}
          >
            👨‍🏫 دليل وقائمة المدرسين ({instructors.length})
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SUB-TAB 1: SETTLEMENT & SUBSCRIPTIONS LEDGER                              */}
      {/* ========================================================================= */}
      {activeSubTab === 'settlement' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* KPI Stat Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            <StatCard title="إجمالي الاشتراكات" value={stats.totalCount} icon="👥" color="blue" subtitle={formatCurrency(stats.totalRevenue) + ' إجمالي المحصل'} />
            <StatCard title="اشتراكات غير مسددة للمدرس" value={stats.unsettledCount} icon="⏳" color="amber" subtitle={formatCurrency(stats.totalDueUnsettled) + ' مستحق للمدرس'} />
            <StatCard title="اشتراكات تم تسويتها" value={stats.settledCount} icon="✅" color="green" subtitle={formatCurrency(stats.totalSettledAmount) + ' مسدد بالكامل'} />
          </div>

          {/* Controls & Filter Bar */}
          <Card style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, alignItems: 'center' }}>
              <Select
                label="اختر المدرس / المدرب"
                value={selectedTeacher}
                onChange={e => { setSelectedTeacher(e.target.value); setSelectedSubIds([]); }}
              >
                <option value="all">🌟 كل المدرسين المسجلين</option>
                {allTeacherNames.map(name => (
                  <option key={name} value={name}>👨‍🏫 {name}</option>
                ))}
              </Select>

              <Select
                label="حالة التسوية والمحاسبة"
                value={statusFilter}
                onChange={e => { setStatusFilter(e.target.value); setSelectedSubIds([]); }}
              >
                <option value="unsettled">⏳ مستحق للمدرس (غير مسدد)</option>
                <option value="settled">✅ تم محاسبة المدرس عليها</option>
                <option value="all">📁 جميع الاشتراكات</option>
              </Select>

              <Input
                label="بحث سريع"
                placeholder="اسم الطالب، المدرس، أو الباقة..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Quick Actions Row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {selectedSubIds.length > 0 && (
                  <Button
                    variant="primary"
                    onClick={() => {
                      const subsToSettle = filteredSubs.filter(s => selectedSubIds.includes(s.id));
                      const teacherName = selectedTeacher !== 'all' ? selectedTeacher : (subsToSettle[0]?.instructorName || 'المدرس');
                      openSettleModal(subsToSettle, teacherName);
                    }}
                    style={{ background: 'linear-gradient(135deg, #d97706, #f59e0b)', color: '#fff', fontWeight: 800 }}
                  >
                    💰 تسوية ومحاسبة المحددين ({selectedSubIds.length})
                  </Button>
                )}
                {selectedTeacher !== 'all' && stats.unsettledCount > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      const unsettled = enrichedSubscriptions.filter(s => s.instructorName === selectedTeacher && !s.isSettled);
                      openSettleModal(unsettled, selectedTeacher);
                    }}
                    style={{ borderColor: '#f59e0b', color: '#fbbf24', fontWeight: 700 }}
                  >
                    ⚡ تسوية كامل مستحقات ({selectedTeacher}) فوراً ({formatCurrency(stats.totalDueUnsettled)})
                  </Button>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                {selectedTeacher !== 'all' && (
                  <Button
                    onClick={handleSendWhatsAppStatement}
                    style={{ background: 'rgba(37, 211, 102, 0.15)', border: '1px solid rgba(37, 211, 102, 0.4)', color: '#25d366', fontWeight: 700 }}
                  >
                    💬 إرسال كشف حساب واتساب للمدرس
                  </Button>
                )}
                <Button
                  onClick={handleExportExcel}
                  style={{ background: 'linear-gradient(135deg, #059669, #10b981)', color: '#fff', fontWeight: 700 }}
                >
                  📥 تصدير Excel
                </Button>
              </div>
            </div>
          </Card>

          {/* Subscriptions Table */}
          {filteredSubs.length === 0 ? (
            <EmptyState icon="👨‍🏫" message="لا توجد اشتراكات أو مستحقات مطابقة للبحث أو التصفية الحالية" />
          ) : (
            <Card style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border)', color: '#93c5fd' }}>
                      <th style={{ padding: '12px 14px', width: 40 }}>
                        <input
                          type="checkbox"
                          onChange={handleSelectAll}
                          checked={filteredSubs.filter(s => !s.isSettled).length > 0 && selectedSubIds.length === filteredSubs.filter(s => !s.isSettled).length}
                          style={{ cursor: 'pointer', transform: 'scale(1.2)' }}
                        />
                      </th>
                      <th style={{ padding: '12px 14px' }}>اسم المدرس</th>
                      <th style={{ padding: '12px 14px' }}>الطالب / المشترك</th>
                      <th style={{ padding: '12px 14px' }}>الكورس / الباقة</th>
                      <th style={{ padding: '12px 14px' }}>قيمة الاشتراك</th>
                      <th style={{ padding: '12px 14px' }}>نسبة المدرس</th>
                      <th style={{ padding: '12px 14px' }}>مستحق المدرس</th>
                      <th style={{ padding: '12px 14px' }}>الحالة</th>
                      <th style={{ padding: '12px 14px' }}>التاريخ</th>
                      <th style={{ padding: '12px 14px' }}>إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSubs.map((sub, idx) => (
                      <tr
                        key={sub.id}
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          background: sub.isSettled ? 'transparent' : 'rgba(245, 158, 11, 0.03)',
                          transition: 'background 0.2s'
                        }}
                      >
                        <td style={{ padding: '12px 14px' }}>
                          {!sub.isSettled ? (
                            <input
                              type="checkbox"
                              checked={selectedSubIds.includes(sub.id)}
                              onChange={() => handleToggleSelect(sub.id)}
                              style={{ cursor: 'pointer', transform: 'scale(1.2)' }}
                            />
                          ) : (
                            <span style={{ color: '#10b981', fontSize: 16 }}>✓</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: 700, color: '#ffffff' }}>
                          👨‍🏫 {sub.instructorName}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ color: '#e2e8f0', fontWeight: 600, display: 'block' }}>{sub.clientName}</span>
                          <span style={{ color: '#94a3b8', fontSize: 11 }}>🆔 {sub.clientMemberId} · 📞 {sub.clientPhone}</span>
                        </td>
                        <td style={{ padding: '12px 14px', color: '#93c5fd' }}>
                          {sub.packageName || 'كورس'}
                        </td>
                        <td style={{ padding: '12px 14px', color: '#cbd5e1' }}>
                          {formatCurrency(sub.price)}
                        </td>
                        <td style={{ padding: '12px 14px', color: '#cbd5e1' }}>
                          {sub.shareType === 'percentage' ? `${sub.shareValue}%` : formatCurrency(sub.shareValue)}
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: 800, color: sub.isSettled ? '#34d399' : '#fbbf24', fontSize: 14 }}>
                          {formatCurrency(sub.shareAmount)}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          {sub.isSettled ? (
                            <Badge color="green">تمت المحاسبة ✅</Badge>
                          ) : (
                            <Badge color="amber">مستحق للمدرس ⏳</Badge>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', color: '#94a3b8', fontSize: 12 }}>
                          {sub.date ? formatDate(sub.date) : '—'}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          {!sub.isSettled ? (
                            <Button
                              size="sm"
                              onClick={() => openSettleModal([sub], sub.instructorName)}
                              style={{ background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.4)', color: '#fbbf24', fontWeight: 700, padding: '4px 10px', fontSize: 12 }}
                            >
                              💰 تسوية
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => setUndoSubId(sub.id)}
                              title="إلغاء تسوية هذا الاشتراك وعكس الخصم المالي"
                              style={{ padding: '4px 8px', fontSize: 11 }}
                            >
                              ↩️ تراجع
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 2: DIRECTORY / INSTRUCTORS CRUD                                   */}
      {/* ========================================================================= */}
      {activeSubTab === 'directory' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ color: '#93c5fd', fontSize: 14, margin: 0 }}>
              قائمة المدرسين المسجلين في النظام وإعدادات النسب الافتراضية لكل مدرس
            </p>
            <Button variant="primary" onClick={openAddInstructor}>
              + إضافة مدرس جديد
            </Button>
          </div>

          {instructors.length === 0 ? (
            <EmptyState icon="👨‍🏫" message="لم تقم بإضافة أي مدرسين بعد. اضغط على زر (+ إضافة مدرس جديد) للبدء." />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
              {instructors.map(inst => {
                const count = enrichedSubscriptions.filter(s => s.instructorName === inst.name).length;
                const unsettled = enrichedSubscriptions.filter(s => s.instructorName === inst.name && !s.isSettled);
                const unsettledSum = unsettled.reduce((sum, s) => sum + s.shareAmount, 0);

                return (
                  <Card key={inst.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <h3 style={{ margin: '0 0 4px', fontSize: 17, color: '#f8fafc', fontWeight: 800 }}>
                          👨‍🏫 {inst.name}
                        </h3>
                        <span style={{ color: '#60a5fa', fontSize: 13, fontWeight: 600 }}>{inst.subject || 'مدرس / محاضر'}</span>
                      </div>
                      <Badge color={unsettledSum > 0 ? 'amber' : 'green'}>
                        {unsettledSum > 0 ? `مستحق: ${formatCurrency(unsettledSum)}` : 'لا توجد مستحقات'}
                      </Badge>
                    </div>

                                        <div style={{ background: 'rgba(10, 22, 43, 0.6)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 12px', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#94a3b8' }}>حالة كلمة المرور:</span>
                        {inst.pinCode ? (
                          <Badge color="emerald">مُعيّنة من المدرس 🔒</Badge>
                        ) : (
                          <Badge color="amber">بانتظار تعيين المدرس ⏳</Badge>
                        )}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#94a3b8' }}>رقم الهاتف / واتساب:</span>
                        <strong style={{ color: '#fff' }}>{inst.phone || '—'}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#94a3b8' }}>النسبة الافتراضية:</span>
                        <strong style={{ color: '#34d399' }}>
                          {inst.defaultShareType === 'percentage' ? `${inst.defaultShareValue || 0}%` : formatCurrency(inst.defaultShareValue || 0)}
                        </strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#94a3b8' }}>إجمالي الاشتراكات:</span>
                        <strong style={{ color: '#60a5fa' }}>{count} اشتراك</strong>
                      </div>
                      {inst.notes && (
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 6, color: '#93c5fd', fontSize: 11 }}>
                          📝 {inst.notes}
                        </div>
                      )}
                    </div>

                    {/* Action buttons on card */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => handleShareInstructorPortal(inst)}
                          style={{
                            flex: 1,
                            padding: '8px 10px',
                            borderRadius: 8,
                            background: 'rgba(34, 197, 94, 0.15)',
                            border: '1px solid #22c55e',
                            color: '#4ade80',
                            fontSize: 12,
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 4,
                            fontFamily: 'Cairo, sans-serif'
                          }}
                        >
                          <span>📲</span> إرسال الرابط (WhatsApp)
                        </button>

                        <button
                          type="button"
                          onClick={() => handleResetPinClick(inst)}
                          title="إعادة تهيئة وتصفير كلمة المرور ليقوم المدرس بتعيينها من جديد"
                          style={{
                            padding: '8px 10px',
                            borderRadius: 8,
                            background: 'rgba(245, 158, 11, 0.15)',
                            border: '1px solid #f59e0b',
                            color: '#fbbf24',
                            fontSize: 12,
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 4,
                            fontFamily: 'Cairo, sans-serif'
                          }}
                        >
                          <span>🔄</span> تهيئة الباسورد
                        </button>
                      </div>

                      <div style={{ display: 'flex', gap: 6 }}>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setSelectedTeacher(inst.name); setActiveSubTab('settlement'); }}
                          style={{ flex: 2, background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', fontWeight: 700 }}
                        >
                          📑 كشف الحساب
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openEditInstructor(inst)}>✏️ تعديل</Button>
                        <Button size="sm" variant="danger" onClick={() => setDeleteInstId(inst.id)}>🗑️</Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODALS                                                                    */}
      {/* ========================================================================= */}

      {/* Add / Edit Instructor Modal */}
      {instModal && (
        <Modal
          open={instModal}
          onClose={() => setInstModal(false)}
          title={editInst ? 'تعديل بيانات المدرس' : 'إضافة مدرس جديد في الدليل'}
        >
          <form onSubmit={handleSaveInstructor} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Input
              label="اسم المدرس / المحاضر"
              placeholder="مثال: أ/ أحمد حسن"
              value={instForm.name}
              onChange={e => setInstForm({ ...instForm, name: e.target.value })}
              required
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Input
                label="رقم الهاتف / واتساب"
                placeholder="01xxxxxxxxx"
                value={instForm.phone}
                onChange={e => setInstForm({ ...instForm, phone: e.target.value })}
              />
                          <Input
                label="المادة / التخصص"
                placeholder="مثال: فيزياء ثانوية عامة"
                value={instForm.subject}
                onChange={e => setInstForm({ ...instForm, subject: e.target.value })}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Select
                label="نوع النسبة الافتراضية"
                value={instForm.defaultShareType}
                onChange={e => setInstForm({ ...instForm, defaultShareType: e.target.value })}
              >
                <option value="percentage">نسبة مئوية (%)</option>
                <option value="fixed">مبلغ ثابت (ج.م) لكل طالب</option>
              </Select>
              <Input
                label={instForm.defaultShareType === 'percentage' ? 'النسبة (%)' : 'المبلغ الثابت (ج.م)'}
                type="number"
                placeholder={instForm.defaultShareType === 'percentage' ? 'مثال: 70' : 'مثال: 150'}
                value={instForm.defaultShareValue}
                onChange={e => setInstForm({ ...instForm, defaultShareValue: e.target.value })}
                required
              />
            </div>

            <Input
              label="ملاحظات إضافية"
              placeholder="ملاحظات خاصة بالمدرس..."
              value={instForm.notes}
              onChange={e => setInstForm({ ...instForm, notes: e.target.value })}
            />

            <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
              <Button type="submit" variant="primary" className="flex-1" disabled={instLoading}>
                {instLoading ? 'جاري الحفظ...' : 'حفظ بيانات المدرس'}
              </Button>
              <Button type="button" variant="ghost" className="flex-1" onClick={() => setInstModal(false)}>
                إلغاء
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Instructor Confirmation */}
      <ConfirmDialog
        open={!!deleteInstId}
        title="حذف المدرس"
        message="هل أنت متأكد من حذف هذا المدرس من الدليل؟"
        onConfirm={async () => {
          await deleteInstructor(deleteInstId);
          setDeleteInstId(null);
        }}
        onCancel={() => setDeleteInstId(null)}
      />

      {/* Settle Modal with Treasury / Shift deduction selection */}
      {settleModal && settleTarget && (
        <Modal
          open={settleModal}
          onClose={() => setSettleModal(false)}
          title={'تسوية ومحاسبة المدرس: ' + settleTarget.instructorName}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: 12, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#94a3b8' }}>المدرس:</span>
                <strong style={{ color: '#fff' }}>{settleTarget.instructorName}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#94a3b8' }}>عدد الاشتراكات المستحقة:</span>
                <strong style={{ color: '#60a5fa' }}>{settleTarget.count} اشتراك</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 6 }}>
                <span style={{ color: '#94a3b8' }}>إجمالي المبلغ المطلوب دفعه للمدرس:</span>
                <strong style={{ color: '#fbbf24', fontSize: 18, fontWeight: 900 }}>{formatCurrency(settleTarget.totalAmount)}</strong>
              </div>
            </div>

            <Input
              label="بيان التسوية والملاحظات"
              value={settleNote}
              onChange={e => setSettleNote(e.target.value)}
              placeholder="مثال: تسوية مستحقات الكورس لشهر أغسطس 2026"
            />

            {/* Treasury / Shift Selection */}
            <div>
              <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                🏛️ جهة الخصم والصرف المالي:
              </label>
              <select
                value={selectedShiftId}
                onChange={e => setSelectedShiftId(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '10px 12px',
                  color: '#ffffff',
                  fontSize: 13,
                  fontFamily: 'Cairo, sans-serif',
                  outline: 'none'
                }}
              >
                <option value="" style={{ background: '#0a162b', color: '#fff' }}>🏦 الخزينة المركزية للإدارة (Admin Safe - سداد مباشر)</option>
                {openShifts.map(s => (
                  <option key={s.id} value={s.id} style={{ background: '#0a162b', color: '#fff' }}>
                    🚪 من درج مناوبة: {s.employeeName} (مفتوحة حالياً)
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <Button variant="ghost" onClick={() => setSettleModal(false)}>إلغاء</Button>
              <Button
                variant="primary"
                disabled={settleLoading}
                onClick={handleExecuteSettlement}
                style={{ background: 'linear-gradient(135deg, #d97706, #f59e0b)', color: '#fff', fontWeight: 800 }}
              >
                {settleLoading ? 'جاري التنفيذ...' : 'تأكيد ودفع ' + formatCurrency(settleTarget.totalAmount) + ' للمدرس'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Undo Settlement Confirmation Dialog */}
      <ConfirmDialog
        open={!!undoSubId}
        title="إلغاء تسوية اشتراك المدرس"
        message="هل أنت متأكد من إلغاء تسوية هذا الاشتراك؟ سيتم إرجاع حالته إلى 'مستحق للمدرس' وعكس أي خصم مالي مسجل في الخزينة أو الوردية فورياً."
        onConfirm={async () => {
          await undoInstructorSettlement(undoSubId, user?.name || 'المدير المالي');
          setUndoSubId(null);
        }}
        onCancel={() => setUndoSubId(null)}
      />
    </div>

      {/* Created Instructor Success & Instant WhatsApp Share Modal */}
      {createdInstModal && (
        <Modal
          open={!!createdInstModal}
          onClose={() => setCreatedInstModal(null)}
          title="🎉 تم تسجيل المدرس بنجاح!"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(34, 197, 94, 0.2)', border: '2px solid #22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', fontSize: 32 }}>
              👨‍🏫
            </div>

            <div>
              <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 900, color: '#ffffff' }}>
                الأستاذ: {createdInstModal.name}
              </h3>
              <p style={{ margin: 0, color: '#93c5fd', fontSize: 14 }}>
                {createdInstModal.subject || 'مدرس معتمد'} &nbsp;|&nbsp; 📱 {createdInstModal.phone || 'غير مسجل'}
              </p>
            </div>

            <div style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: 14, padding: 14, textAlign: 'right' }}>
              <div style={{ color: '#cbd5e1', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                🔗 رابط البوابة الخاص بالمدرس:
              </div>
              <div style={{ color: '#38bdf8', fontSize: 12, wordBreak: 'break-all', fontFamily: 'monospace', direction: 'ltr', textAlign: 'left', background: 'rgba(0,0,0,0.3)', padding: 8, borderRadius: 8 }}>
                {`${window.location.origin}/instructor?id=${createdInstModal.id}`}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
              <button
                type="button"
                onClick={() => handleShareInstructorPortal(createdInstModal)}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: 14,
                  background: 'linear-gradient(135deg, #15803d, #22c55e)',
                  color: '#ffffff',
                  fontSize: 15,
                  fontWeight: 900,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  fontFamily: 'Cairo, sans-serif',
                  boxShadow: '0 6px 20px rgba(34, 197, 94, 0.4)'
                }}
              >
                <span>💬</span> إرسال رابط البوابة عبر الواتساب فوراً
              </button>

              <div style={{ display: 'flex', gap: 10 }}>
                <Button
                  variant="ghost"
                  onClick={() => {
                    const link = `${window.location.origin}/instructor?id=${createdInstModal.id}`;
                    navigator.clipboard.writeText(link);
                    alert('📋 تم نسخ رابط بوابة المدرس بنجاح!');
                  }}
                  style={{ flex: 1, border: '1px solid rgba(255,255,255,0.15)', color: '#cbd5e1' }}
                >
                  📋 نسخ الرابط
                </Button>
                <Button
                  variant="primary"
                  onClick={() => setCreatedInstModal(null)}
                  style={{ flex: 1 }}
                >
                  تم الانتهاء
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      </>
  );
}
