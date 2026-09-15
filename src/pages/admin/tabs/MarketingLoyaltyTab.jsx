import React, { useState, useEffect } from 'react';
import { db } from '../../../firebase';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import {
  getClients, getAllPayments, getSessions, getAllShifts, updateClient,
  getAnnouncements, addAnnouncement, updateAnnouncement, deleteAnnouncement,
  getExpiringSubscriptions, markSubscriptionReminderSent,
  getBirthdayClients, grantBirthdayGift,
  getSystemInfo, saveSystemInfo
} from '../../../services/db';
import { Card, Button, Input, Select, Badge, EmptyState, Modal, ConfirmDialog, DateInputDMY } from '../../../components/ui';
import { formatHoursClock } from '../../../utils/constants';
import { exportToExcel } from '../../../utils/excelExport';
import { Upload, Trash2 } from 'lucide-react';

const DEFAULT_CONFIG = {
  // Loyalty Points Rates
  pointsPerHour: 10,
  pointsPerSession: 25,
  pointsPer100Paid: 50,
  freeHourPointsCost: 100,
  freeDrinkPointsCost: 50,
  
  // Inactivity Thresholds
  atRiskDays: 15,
  dormantDays: 30,
  
  // Custom WhatsApp Retention Message Template
  retentionMessageTemplate: 'مرحباً {اسم_العميل} 👋✨\n\nوحشتنا في The First Group (TFG)! 🏢🌟\nلاحظنا غيابك من فترة ونتمنى تكون بألف خير. حابين نهديك جلسة مجانية / خصم خاص على اشتراكك القادم بمناسبة عودتك! 🎁\n\nيمكنك مراجعة رصيدك واشتراكك عبر رابطك المباشر:\n🔗 {رابط_العميل}\n\nمستنيين زيارتك ونتمنى لك وقتاً ممتعاً معنا! ☕✨',

  // Custom WhatsApp Subscription Renewal Reminder Template
  subscriptionReminderTemplate: 'مرحباً {اسم_العميل} 👋✨\n\nنود تذكيرك بأن اشتراكك في The First Group (TFG) {سبب_التنبيه} ⏳\n📦 الباقة: {اسم_الباقة}\n⏱️ الرصيد المتبقي: {الرصيد_المتبقي}\n📅 تاريخ الانتهاء: {تاريخ_الانتهاء}\n\nيسعدنا تجديد اشتراكك لضمان استمرار خدماتك بدون انقطاع! 🏢🌟\n🔗 رابط حسابك المباشر لمراجعة التفاصيل وتجديد الاشتراك:\n{رابط_العميل}\n\nنتمنى لك أوقاتاً ممتعة ومثمرة معنا دائماً! ☕🚀',

  // Birthday Gifts & Perks Automation
  birthdayGiftType: 'points', // 'points', 'wallet', 'hours'
  birthdayGiftValue: 100,
  birthdayMessageTemplate: 'كل عام وأنت بألف خير يا {اسم_العميل} بمناسبة عيد ميلادك! 🎂🎉🥳\n\nأسرة The First Group (TFG) تتمنى لك عاماً سعيداً مليئاً بالتفوق والنجاح! 🏢🌟\nوتقديراً لوجودك المميز معنا، يسعدنا أن نهديك:\n🎁 {الهدية}\n\nيمكنك مراجعة رصيدك واستخدام هديتك من بوابتك المباشرة:\n🔗 {رابط_العميل}\n\nيوم ميلاد سعيد ومستنيين نحتفل بيك معنا! ☕🍰🎈',

  // Announcements Banner Auto-Rotation
  bannerRotationSeconds: 5
};

export default function MarketingLoyaltyTab() {
  const [activeSubTab, setActiveSubTab] = useState('loyalty');
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [clients, setClients] = useState([]);
  const [payments, setPayments] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [selectedClientForPoints, setSelectedClientForPoints] = useState(null);
  const [manualPoints, setManualPoints] = useState('');

  // Birthday Gifts State
  const [birthdayClients, setBirthdayClients] = useState([]);
  const [birthdayLoading, setBirthdayLoading] = useState(false);
  const [birthdayWindow, setBirthdayWindow] = useState(7);
  const [grantingId, setGrantingId] = useState(null);
  const [birthdayModalClient, setBirthdayModalClient] = useState(null);
  const [quickBirthDate, setQuickBirthDate] = useState('');

  // Subscription Renewal Reminders State
  const [expiringSubs, setExpiringSubs] = useState([]);
  const [expiringLoading, setExpiringLoading] = useState(false);
  const [expiringThreshold, setExpiringThreshold] = useState(3);
  const [reminderSentMap, setReminderSentMap] = useState({});

  // Announcements State
  const [announcements, setAnnouncements] = useState([]);
  const [announcementModal, setAnnouncementModal] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState(null);
  const [announcementForm, setAnnouncementForm] = useState({
    title: '',
    content: '',
    imageUrl: '',
    target: 'all',
    category: 'offer',
    badgeText: '',
    actionUrl: '',
    actionLabel: '',
    isActive: true,
    priority: 1
  });
  const [announcementLoading, setAnnouncementLoading] = useState(false);
  const [deleteAnnouncementId, setDeleteAnnouncementId] = useState(null);

  // Banner Rotation Settings State
  const [bannerRotationSeconds, setBannerRotationSeconds] = useState(5);
  const [savingBannerSettings, setSavingBannerSettings] = useState(false);
  const [bannerSettingsSuccess, setBannerSettingsSuccess] = useState(false);

  // 1. Load Realtime Config and Announcements from Firestore
  useEffect(() => {
    getSystemInfo().then(info => {
      if (info && info.bannerRotationSeconds !== undefined) {
        setBannerRotationSeconds(info.bannerRotationSeconds);
      }
    }).catch(() => {});

    const unsubConfig = onSnapshot(doc(db, 'settings', 'marketing_config'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setConfig(prev => ({ ...prev, ...data }));
        if (data.bannerRotationSeconds !== undefined) {
          setBannerRotationSeconds(data.bannerRotationSeconds);
        }
      }
    });

    const unsubC = getClients(setClients);
    const unsubPay = getAllPayments(setPayments);
    const unsubSess = getSessions ? getSessions(setSessions) : () => {};
    const unsubShifts = getAllShifts ? getAllShifts(setShifts) : () => {};
    const unsubAnnounce = getAnnouncements(setAnnouncements);

    return () => {
      unsubConfig();
      unsubC && unsubC();
      unsubPay && unsubPay();
      unsubSess && unsubSess();
      unsubShifts && unsubShifts();
      unsubAnnounce && unsubAnnounce();
    };
  }, []);

  const handleSaveBannerRotation = async (customSec) => {
    const targetVal = customSec !== undefined ? customSec : bannerRotationSeconds;
    const parsed = parseInt(targetVal, 10);
    const validSeconds = isNaN(parsed) || parsed < 0 ? 0 : parsed;
    setSavingBannerSettings(true);
    try {
      await saveSystemInfo({ bannerRotationSeconds: validSeconds });
      await setDoc(doc(db, 'settings', 'marketing_config'), { bannerRotationSeconds: validSeconds }, { merge: true });
      setBannerRotationSeconds(validSeconds);
      setBannerSettingsSuccess(true);
      setTimeout(() => setBannerSettingsSuccess(false), 3000);
    } catch (err) {
      alert('حدث خطأ أثناء حفظ سرعة الانتقال: ' + err.message);
    } finally {
      setSavingBannerSettings(false);
    }
  };

  // Save Settings to Firestore
  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'marketing_config'), config, { merge: true });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      alert('حدث خطأ أثناء حفظ الإعدادات: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Retention Clients Analysis
  const now = new Date();
  const analyzedClients = clients.map(c => {
    let lastDate = c.createdAt?.toDate ? c.createdAt.toDate() : (c.createdAt ? new Date(c.createdAt) : null);
    const clientSessions = sessions.filter(s => s.clientId === c.id);
    if (clientSessions.length > 0) {
      const dates = clientSessions.map(s => s.date?.toDate ? s.date.toDate() : new Date(s.date || 0)).filter(d => !isNaN(d));
      if (dates.length > 0) {
        lastDate = new Date(Math.max(...dates));
      }
    }

    const diffDays = lastDate ? Math.floor((now - lastDate) / (1000 * 60 * 60 * 24)) : 999;
    let status = 'active';
    let statusLabel = 'نشط مؤخراً 🟢';
    let statusColor = 'green';

    const dormantLimit = Number(config.dormantDays) || 30;
    const atRiskLimit = Number(config.atRiskDays) || 15;

    if (diffDays >= dormantLimit) {
      status = 'dormant';
      statusLabel = 'خامل جداً (+' + dormantLimit + ' يوم) 🔴';
      statusColor = 'red';
    } else if (diffDays >= atRiskLimit) {
      status = 'at_risk';
      statusLabel = 'غائب (+' + atRiskLimit + ' يوم) 🟡';
      statusColor = 'amber';
    }

    // Points calculation based on current config
    const hoursSpent = Number(c.hoursUsed) || 0;
    const sessionsCount = Number(c.sessionsUsed) || 0;
    const totalPaid = Number(c.totalPaid) || 0;
    const redeemed = Number(c.redeemedPoints) || 0;
    const bonus = Number(c.manualBonusPoints) || 0;

    const earned = Math.floor(hoursSpent * (Number(config.pointsPerHour) || 10)) 
                 + (sessionsCount * (Number(config.pointsPerSession) || 25)) 
                 + Math.floor(totalPaid * ((Number(config.pointsPer100Paid) || 50) / 100))
                 + bonus;
    const currentPoints = Math.max(0, earned - redeemed);

    let tier = { name: 'برونزي 🥉', color: '#cd7f32' };
    if (currentPoints >= 1000) tier = { name: 'VIP ياقوتي 💎', color: '#38bdf8' };
    else if (currentPoints >= 500) tier = { name: 'ذهبي 🥇', color: '#f59e0b' };
    else if (currentPoints >= 200) tier = { name: 'فضي 🥈', color: '#94a3b8' };

    return {
      ...c,
      lastDate,
      diffDays,
      retentionStatus: status,
      statusLabel,
      statusColor,
      loyaltyPoints: currentPoints,
      loyaltyEarned: earned,
      loyaltyRedeemed: redeemed,
      loyaltyTier: tier
    };
  });

  // Load Birthday Clients
  const loadBirthdayClients = async (windowDays = birthdayWindow) => {
    setBirthdayLoading(true);
    try {
      const list = await getBirthdayClients(Number(windowDays) || 7);
      setBirthdayClients(list);
    } catch (err) {
      console.error('Error loading birthday clients:', err);
    } finally {
      setBirthdayLoading(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'birthdays') {
      loadBirthdayClients(birthdayWindow);
    }
  }, [activeSubTab, birthdayWindow]);

  // Grant Birthday Gift & Send WhatsApp Greeting
  const handleGrantBirthdayGift = async (targetClient, giftTypeOverride = null, giftValueOverride = null) => {
    setGrantingId(targetClient.id);
    try {
      const gType = giftTypeOverride || config.birthdayGiftType || 'points';
      const gVal = giftValueOverride || config.birthdayGiftValue || 100;

      const res = await grantBirthdayGift({
        clientId: targetClient.id,
        giftType: gType,
        giftValue: gVal,
        actorName: 'إدارة TFG'
      });

      let cleanPhone = String(targetClient.phone || '').trim().replace(/\D/g, '');
      if (cleanPhone.startsWith('01')) cleanPhone = '2' + cleanPhone;
      else if (cleanPhone.startsWith('1') && cleanPhone.length === 10) cleanPhone = '20' + cleanPhone;

      const origin = window.location.origin;
      const directLink = origin + '/client?phone=' + encodeURIComponent(targetClient.phone || '') + '&id=' + encodeURIComponent(targetClient.memberId || '');

      let msg = config.birthdayMessageTemplate || DEFAULT_CONFIG.birthdayMessageTemplate;
      msg = msg.replace(/{اسم_العميل}/g, targetClient.name || 'عزيزنا المشترك');
      msg = msg.replace(/{الهدية}/g, res.giftDescription);
      msg = msg.replace(/{رابط_العميل}/g, directLink);
      msg = msg.replace(/{رقم_العضوية}/g, targetClient.memberId || '—');

      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const waUrl = cleanPhone 
        ? 'https://web.whatsapp.com/send?phone=' + cleanPhone + '&text=' + encodeURIComponent(msg)
        : 'https://web.whatsapp.com/send?text=' + encodeURIComponent(msg);

      window.open(waUrl, isMobile ? '_blank' : 'whatsapp_web');
      await loadBirthdayClients(birthdayWindow);
    } catch (err) {
      alert('حدث خطأ أثناء منح الهدية: ' + err.message);
    } finally {
      setGrantingId(null);
    }
  };

  // Quick Set Client Birthday
  const handleSaveQuickBirthDate = async () => {
    if (!birthdayModalClient || !quickBirthDate) return;
    try {
      const bYear = new Date(quickBirthDate).getFullYear();
      const nowYear = new Date().getFullYear();
      const calculatedAge = (bYear && bYear > 1900 && bYear <= nowYear) ? nowYear - bYear : birthdayModalClient.age || null;

      await updateClient(birthdayModalClient.id, {
        birthDate: quickBirthDate,
        ...(calculatedAge ? { age: calculatedAge } : {})
      });
      alert('✅ تم حفظ تاريخ الميلاد بنجاح!');
      setBirthdayModalClient(null);
      setQuickBirthDate('');
      await loadBirthdayClients(birthdayWindow);
    } catch (err) {
      alert('حدث خطأ: ' + err.message);
    }
  };

  // Load Expiring Subscriptions for Reminders
  const loadExpiringSubs = async (threshold = expiringThreshold) => {
    setExpiringLoading(true);
    try {
      const list = await getExpiringSubscriptions(Number(threshold) || 3);
      setExpiringSubs(list);
    } catch (err) {
      console.error('Error loading expiring subscriptions:', err);
    } finally {
      setExpiringLoading(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'reminders') {
      loadExpiringSubs(expiringThreshold);
    }
  }, [activeSubTab, expiringThreshold]);

  // Send WhatsApp Subscription Renewal Reminder
  const handleSendSubscriptionReminder = async (sub) => {
    let cleanPhone = String(sub.phone || '').trim().replace(/\D/g, '');
    if (cleanPhone.startsWith('01')) cleanPhone = '2' + cleanPhone;
    else if (cleanPhone.startsWith('1') && cleanPhone.length === 10) cleanPhone = '20' + cleanPhone;

    const origin = window.location.origin;
    const directLink = origin + '/client?phone=' + encodeURIComponent(sub.phone || '') + '&id=' + encodeURIComponent(sub.memberId || '');

    let remainingText = '';
    if (sub.packageType === 'workspace') {
      const remH = Math.max(0, (sub.totalHours || 0) - (sub.hoursUsed || 0));
      remainingText = `${remH} ساعة`;
    } else {
      const remS = Math.max(0, (sub.packageSessions || 0) - (sub.sessionsUsed || 0));
      remainingText = `${remS} حصة`;
    }

    let msg = config.subscriptionReminderTemplate || DEFAULT_CONFIG.subscriptionReminderTemplate;
    msg = msg.replace(/{اسم_العميل}/g, sub.clientName || 'عزيزنا المشترك');
    msg = msg.replace(/{رابط_العميل}/g, directLink);
    msg = msg.replace(/{اسم_الباقة}/g, sub.packageName || 'باقة الاشتراك');
    msg = msg.replace(/{سبب_التنبيه}/g, sub.reason || 'قارب على الانتهاء');
    msg = msg.replace(/{الرصيد_المتبقي}/g, remainingText);
    msg = msg.replace(/{تاريخ_الانتهاء}/g, sub.endDate || '—');
    msg = msg.replace(/{رقم_العضوية}/g, sub.memberId || '—');

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const waUrl = cleanPhone 
      ? 'https://web.whatsapp.com/send?phone=' + cleanPhone + '&text=' + encodeURIComponent(msg)
      : 'https://web.whatsapp.com/send?text=' + encodeURIComponent(msg);

    try {
      await markSubscriptionReminderSent(sub.subscriptionId);
      setReminderSentMap(prev => ({ ...prev, [sub.subscriptionId]: true }));
    } catch (err) {
      console.error('Error marking reminder sent:', err);
    }

    window.open(waUrl, isMobile ? '_blank' : 'whatsapp_web');
  };

  // Send WhatsApp Retention Message with Custom Template
  const handleSendCustomRetention = (client) => {
    let cleanPhone = String(client.phone || '').trim().replace(/\D/g, '');
    if (cleanPhone.startsWith('01')) cleanPhone = '2' + cleanPhone;
    else if (cleanPhone.startsWith('1') && cleanPhone.length === 10) cleanPhone = '20' + cleanPhone;

    const origin = window.location.origin;
    const directLink = origin + '/client?phone=' + encodeURIComponent(client.phone || '') + '&id=' + encodeURIComponent(client.memberId || '');

    let msg = config.retentionMessageTemplate || DEFAULT_CONFIG.retentionMessageTemplate;
    msg = msg.replace(/{اسم_العميل}/g, client.name || 'عزيزنا العميل');
    msg = msg.replace(/{رابط_العميل}/g, directLink);
    msg = msg.replace(/{رقم_العضوية}/g, client.memberId || '—');

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const waUrl = cleanPhone 
      ? 'https://web.whatsapp.com/send?phone=' + cleanPhone + '&text=' + encodeURIComponent(msg)
      : 'https://web.whatsapp.com/send?text=' + encodeURIComponent(msg);

    window.open(waUrl, isMobile ? '_blank' : 'whatsapp_web');
  };

  // Add Bonus Points manually to a client
  const handleAddBonusPoints = async () => {
    if (!selectedClientForPoints) return;
    const pts = parseInt(manualPoints, 10);
    if (isNaN(pts)) return alert('يرجى كتابة عدد نقاط صحيح');

    try {
      const curBonus = Number(selectedClientForPoints.manualBonusPoints) || 0;
      await updateClient(selectedClientForPoints.id, {
        manualBonusPoints: curBonus + pts
      });
      alert('✅ تم تحديث نقاط العميل بنجاح!');
      setSelectedClientForPoints(null);
      setManualPoints('');
    } catch (e) {
      alert('حدث خطأ: ' + e.message);
    }
  };

  // EXCEL EXPORTS
  const handleExportClientsExcel = () => {
    const headers = ['#', 'اسم العميل', 'رقم العضوية', 'الهاتف', 'المنطقة', 'السن', 'نوع الباقة', 'اسم الباقة', 'الرصيد المتبقي', 'إجمالي المدفوع', 'نقاط الولاء', 'مستوى العضوية', 'حالة النشاط', 'أيام الغياب'];
    const rows = analyzedClients.map((c, idx) => {
      const remaining = c.packageType === 'workspace' || c.totalHours ? formatHoursClock(Math.max(0, (c.totalHours || 0) - (c.hoursUsed || 0))) : Math.max(0, (c.packageSessions || 0) - (c.sessionsUsed || 0));
      return [
        idx + 1,
        c.name,
        c.memberId || '—',
        c.phone || '—',
        c.address || 'سوهاج',
        c.age || '—',
        c.packageType === 'workspace' ? 'مساحة عمل' : 'حصص',
        c.packageName || '—',
        remaining,
        c.totalPaid || 0,
        c.loyaltyPoints + ' نقطة',
        c.loyaltyTier.name,
        c.retentionStatus === 'active' ? 'نشط' : c.retentionStatus === 'at_risk' ? 'غائب' : 'خامل',
        c.diffDays >= 999 ? 'غير مسجل' : c.diffDays + ' يوم'
      ];
    });
    exportToExcel('قاعدة_بيانات_عملاء_TFG_الشاملة', headers, rows);
  };

  const handleExportRevenuesExcel = () => {
    const headers = ['#', 'النوع', 'البيان / العميل', 'المبلغ', 'التاريخ', 'طريقة الدفع'];
    const rows = payments.map((p, idx) => [
      idx + 1,
      'دفعة اشتراك',
      p.clientName || 'عميل',
      p.amount || 0,
      p.date?.toDate ? p.date.toDate().toLocaleDateString('ar-EG') : (p.date || '—'),
      p.method === 'cash' ? 'نقدي' : p.method || 'نقدي'
    ]);
    exportToExcel('كشف_المدفوعات_والإيرادات_TFG', headers, rows);
  };

  // Announcements Handlers
  const handleOpenAddAnnouncement = () => {
    setEditingAnnouncement(null);
    setAnnouncementForm({
      title: '',
      content: '',
      imageUrl: '',
      target: 'all',
      category: 'offer',
      badgeText: '',
      actionUrl: '',
      actionLabel: '',
      isActive: true,
      priority: 1
    });
    setAnnouncementModal(true);
  };

  const handleOpenEditAnnouncement = (ad) => {
    setEditingAnnouncement(ad);
    setAnnouncementForm({
      title: ad.title || '',
      content: ad.content || '',
      imageUrl: ad.imageUrl || '',
      target: ad.target || 'all',
      category: ad.category || 'general',
      badgeText: ad.badgeText || '',
      actionUrl: ad.actionUrl || '',
      actionLabel: ad.actionLabel || '',
      isActive: ad.isActive !== false,
      priority: ad.priority || 1
    });
    setAnnouncementModal(true);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert('حجم الصورة كبير جداً، يرجى اختيار صورة أقل من 10 ميجابايت');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
        setAnnouncementForm(prev => ({ ...prev, imageUrl: compressedDataUrl }));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleSaveAnnouncement = async (e) => {
    e.preventDefault();
    if (!announcementForm.title.trim()) return;
    setAnnouncementLoading(true);
    try {
      if (editingAnnouncement) {
        await updateAnnouncement(editingAnnouncement.id, announcementForm);
      } else {
        await addAnnouncement(announcementForm);
      }
      setAnnouncementModal(false);
    } catch (err) {
      alert('حدث خطأ أثناء حفظ الإعلان: ' + (err?.message || ''));
    } finally {
      setAnnouncementLoading(false);
    }
  };

  const handleToggleAnnouncementActive = async (ad) => {
    try {
      await updateAnnouncement(ad.id, { isActive: !ad.isActive });
    } catch (err) {
      alert('حدث خطأ أثناء تغيير حالة الإعلان');
    }
  };

  const handleDeleteAnnouncement = async () => {
    if (!deleteAnnouncementId) return;
    try {
      await deleteAnnouncement(deleteAnnouncementId);
      setDeleteAnnouncementId(null);
    } catch (err) {
      alert('حدث خطأ أثناء حذف الإعلان');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ color: '#ffffff', fontSize: 20, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🎁</span> برامج الولاء والتسويق والنمو (TFG Growth Hub)
          </h2>
          <p style={{ color: '#93c5fd', fontSize: 13, margin: '4px 0 0' }}>
            التحكم الكامل في إعدادات النقاط، حملات إعادة الجذب بالواتساب، إعلانات البوابات، وتصدير شيتات الإكسيل
          </p>
        </div>

        {saveSuccess && (
          <Badge color="green">✅ تم حفظ الإعدادات بنجاح في قاعدة البيانات</Badge>
        )}
      </div>

      {/* TABS NAVIGATION */}
      <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid var(--border)', paddingBottom: 10, flexWrap: 'wrap' }}>
        {[
          { id: 'loyalty', label: '🎁 نقاط الولاء والمكافآت', icon: '🎁' },
          { id: 'birthdays', label: '🎂 هدايا أعياد الميلاد (VIP)', icon: '🎂' },
          { id: 'reminders', label: '⏰ تذكيرات تجديد الاشتراكات (واتساب)', icon: '⏰' },
          { id: 'retention', label: '🎯 رادار الخمول وحملات الواتساب', icon: '🎯' },
          { id: 'announcements', label: '📢 إعلانات الطلاب والمدرسين', icon: '📢' },
          { id: 'exports', label: '📊 مركز تصدير الإكسيل (Excel)', icon: '📥' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            style={{
              padding: '10px 18px', borderRadius: 12, fontSize: 14, fontWeight: 800,
              border: 'none', cursor: 'pointer', transition: 'all 0.2s',
              background: activeSubTab === tab.id ? 'linear-gradient(135deg, #1d4ed8, #3b82f6)' : 'rgba(255,255,255,0.05)',
              color: activeSubTab === tab.id ? '#ffffff' : '#94a3b8',
              boxShadow: activeSubTab === tab.id ? '0 4px 15px rgba(37,99,235,0.4)' : 'none'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 1. LOYALTY & REWARDS TAB */}
      {activeSubTab === 'loyalty' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card style={{ background: 'var(--bg-surface)', border: '1px solid rgba(245, 158, 11, 0.35)' }}>
            <h3 style={{ color: '#fbbf24', fontSize: 17, fontWeight: 800, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>⚙️</span> إعدادات احتساب النقاط والمكافآت (قابلة للتعديل من قبل المدير)
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              <div>
                <label style={{ color: '#c8dcf5', fontSize: 13, display: 'block', marginBottom: 6, fontWeight: 700 }}>
                  ⏱️ النقاط المكتسبة لكل ساعة (Work Space):
                </label>
                <Input
                  type="number"
                  value={config.pointsPerHour}
                  onChange={e => setConfig({ ...config, pointsPerHour: e.target.value })}
                />
              </div>

              <div>
                <label style={{ color: '#c8dcf5', fontSize: 13, display: 'block', marginBottom: 6, fontWeight: 700 }}>
                  📚 النقاط المكتسبة لكل حصة / كورس:
                </label>
                <Input
                  type="number"
                  value={config.pointsPerSession}
                  onChange={e => setConfig({ ...config, pointsPerSession: e.target.value })}
                />
              </div>

              <div>
                <label style={{ color: '#c8dcf5', fontSize: 13, display: 'block', marginBottom: 6, fontWeight: 700 }}>
                  💵 النقاط المكتسبة لكل 100 جنيه مدفوعات:
                </label>
                <Input
                  type="number"
                  value={config.pointsPer100Paid}
                  onChange={e => setConfig({ ...config, pointsPer100Paid: e.target.value })}
                />
              </div>

              <div>
                <label style={{ color: '#c8dcf5', fontSize: 13, display: 'block', marginBottom: 6, fontWeight: 700 }}>
                  🎁 تكلفة استبدال (ساعة مجانية) بالنقاط:
                </label>
                <Input
                  type="number"
                  value={config.freeHourPointsCost}
                  onChange={e => setConfig({ ...config, freeHourPointsCost: e.target.value })}
                />
              </div>

              <div>
                <label style={{ color: '#c8dcf5', fontSize: 13, display: 'block', marginBottom: 6, fontWeight: 700 }}>
                  ☕ تكلفة استبدال (مشروب مجاني) بالنقاط:
                </label>
                <Input
                  type="number"
                  value={config.freeDrinkPointsCost}
                  onChange={e => setConfig({ ...config, freeDrinkPointsCost: e.target.value })}
                />
              </div>
            </div>

            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="primary"
                onClick={handleSaveConfig}
                disabled={saving}
                style={{ background: 'linear-gradient(135deg, #d97706, #f59e0b)', color: '#fff', fontWeight: 800, padding: '10px 24px' }}
              >
                {saving ? 'جاري الحفظ...' : '💾 حفظ إعدادات برنامج الولاء'}
              </Button>
            </div>
          </Card>

          {/* Loyalty Members Leaderboard & Manual Bonus */}
          <Card style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <h3 style={{ color: '#ffffff', fontSize: 16, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🏆</span> أرصدة ولاء المشتركين ومستويات العضوية
              </h3>
              <Badge color="amber">{analyzedClients.length} مشترك</Badge>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'right' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '10px 12px', color: '#93c5fd' }}>#</th>
                    <th style={{ padding: '10px 12px', color: '#93c5fd' }}>اسم العميل</th>
                    <th style={{ padding: '10px 12px', color: '#93c5fd' }}>العضوية</th>
                    <th style={{ padding: '10px 12px', color: '#93c5fd' }}>مستوى العضوية</th>
                    <th style={{ padding: '10px 12px', color: '#93c5fd' }}>رصيد النقاط</th>
                    <th style={{ padding: '10px 12px', color: '#93c5fd' }}>إجمالي المكتسب</th>
                    <th style={{ padding: '10px 12px', color: '#93c5fd' }}>المستبدل</th>
                    <th style={{ padding: '10px 12px', color: '#93c5fd' }}>إجراءات المدير</th>
                  </tr>
                </thead>
                <tbody>
                  {analyzedClients.map((c, idx) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '10px 12px', color: '#64748b' }}>{idx + 1}</td>
                      <td style={{ padding: '10px 12px', color: '#ffffff', fontWeight: 700 }}>{c.name}</td>
                      <td style={{ padding: '10px 12px', color: '#93c5fd' }}>{c.memberId || '—'}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <Badge color="amber">{c.loyaltyTier.name}</Badge>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#fbbf24', fontWeight: 900, fontSize: 15 }}>
                        {c.loyaltyPoints} <span style={{ fontSize: 11 }}>نقطة</span>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#34d399' }}>{c.loyaltyEarned}</td>
                      <td style={{ padding: '10px 12px', color: '#f87171' }}>{c.loyaltyRedeemed}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <Button
                          size="sm"
                          onClick={() => { setSelectedClientForPoints(c); setManualPoints(''); }}
                          style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.35)', color: '#93c5fd', fontSize: 11 }}
                        >
                          ➕ إضافة/خصم نقاط
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* 2. BIRTHDAY GIFTS & VIP PERKS TAB */}
      {activeSubTab === 'birthdays' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Top Bar: Controls & Filters */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 style={{ color: '#ffffff', fontSize: 18, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🎂</span> رادار هدايا أعياد الميلاد والتهنئة التلقائية (Birthday VIP Perks)
              </h3>
              <p style={{ color: '#93c5fd', fontSize: 13, margin: '4px 0 0' }}>
                رصد فوري للمشتركين الذين يوافق عيد ميلادهم اليوم أو خلال الأيام القادمة، مع إمكانية منح هدية ولاء/رصيد محفظة وإرسال تهنئة بالواتساب بضغطة زر
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 700 }}>نطاق الرصد:</span>
                <select
                  value={birthdayWindow}
                  onChange={e => setBirthdayWindow(Number(e.target.value))}
                  style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    color: '#ffffff', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 700, outline: 'none'
                  }}
                >
                  <option value={1}>اليوم فقط (24 ساعة)</option>
                  <option value={3}>خلال 3 أيام</option>
                  <option value={7}>خلال 7 أيام (أسبوع - الموصى به)</option>
                  <option value={14}>خلال 14 يوم</option>
                  <option value={30}>خلال 30 يوم (الشهر الحالي)</option>
                </select>
              </div>

              <Button
                variant="primary"
                onClick={() => loadBirthdayClients(birthdayWindow)}
                disabled={birthdayLoading}
                style={{ background: 'linear-gradient(135deg, #d97706, #f59e0b)', color: '#fff', fontWeight: 800 }}
              >
                {birthdayLoading ? 'جاري الرصد...' : '🔄 تحديث الرادار'}
              </Button>
            </div>
          </div>

          {/* Quick Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div style={{ background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.35)', borderRadius: 14, padding: 14, textAlign: 'center' }}>
              <span style={{ color: '#fcd34d', fontSize: 12, fontWeight: 700 }}>🎂 أعياد ميلاد اليوم (VIP)</span>
              <div style={{ color: '#fbbf24', fontSize: 24, fontWeight: 900, marginTop: 4 }}>
                {birthdayClients.filter(c => c.isToday).length}
              </div>
            </div>
            <div style={{ background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: 14, padding: 14, textAlign: 'center' }}>
              <span style={{ color: '#93c5fd', fontSize: 12, fontWeight: 700 }}>🎈 قادمة خلال الفترة المحددة</span>
              <div style={{ color: '#38bdf8', fontSize: 24, fontWeight: 900, marginTop: 4 }}>
                {birthdayClients.filter(c => c.isUpcoming).length}
              </div>
            </div>
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 14, padding: 14, textAlign: 'center' }}>
              <span style={{ color: '#a7f3d0', fontSize: 12, fontWeight: 700 }}>🎁 تم منحهم الهدية لعام {new Date().getFullYear()}</span>
              <div style={{ color: '#34d399', fontSize: 24, fontWeight: 900, marginTop: 4 }}>
                {birthdayClients.filter(c => c.isGiftGranted).length}
              </div>
            </div>
            <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 14, textAlign: 'center' }}>
              <span style={{ color: '#94a3b8', fontSize: 12, fontWeight: 700 }}>👥 مسجل لهم تاريخ ميلاد</span>
              <div style={{ color: '#ffffff', fontSize: 24, fontWeight: 900, marginTop: 4 }}>
                {clients.filter(c => c.birthDate).length} / {clients.length}
              </div>
            </div>
          </div>

          {/* Birthday Settings & Template Card */}
          <Card style={{ background: 'var(--bg-surface)', border: '1px solid rgba(245, 158, 11, 0.35)' }}>
            <h4 style={{ color: '#fbbf24', fontSize: 16, fontWeight: 800, margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>⚙️</span> إعدادات هدية عيد الميلاد وقالب رسالة الواتساب
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ color: '#c8dcf5', fontSize: 13, display: 'block', marginBottom: 6, fontWeight: 700 }}>
                  🎁 نوع الهدية الممنوحة للعضو:
                </label>
                <select
                  value={config.birthdayGiftType || 'points'}
                  onChange={e => setConfig({ ...config, birthdayGiftType: e.target.value })}
                  style={{
                    width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)',
                    color: '#ffffff', borderRadius: 8, padding: '10px 12px', fontSize: 13, fontWeight: 700, outline: 'none'
                  }}
                >
                  <option value="points">🎁 نقاط ولاء مجانية (Loyalty Points)</option>
                  <option value="wallet">💳 رصيد كاش بمحفظة العميل (EGP)</option>
                  <option value="hours">⏱️ ساعات إضافية بمساحة العمل (Free Hours)</option>
                </select>
              </div>

              <div>
                <label style={{ color: '#c8dcf5', fontSize: 13, display: 'block', marginBottom: 6, fontWeight: 700 }}>
                  💰 قيمة الهدية (عدد النقاط / الجنيهات / الساعات):
                </label>
                <Input
                  type="number"
                  value={config.birthdayGiftValue || 100}
                  onChange={e => setConfig({ ...config, birthdayGiftValue: Number(e.target.value) || 0 })}
                  placeholder="مثال: 100 أو 50 أو 2"
                />
              </div>
            </div>

            <div>
              <label style={{ color: '#c8dcf5', fontSize: 13, display: 'block', marginBottom: 6, fontWeight: 700 }}>
                📝 قالب رسالة التهنئة بالواتساب:
              </label>
              <p style={{ color: '#93c5fd', fontSize: 12, margin: '0 0 8px' }}>
                المتغيرات المتاحة:{' '}
                <span style={{ color: '#34d399', fontWeight: 700 }}>{'{اسم_العميل}'}</span> |{' '}
                <span style={{ color: '#fbbf24', fontWeight: 700 }}>{'{الهدية}'}</span> |{' '}
                <span style={{ color: '#38bdf8', fontWeight: 700 }}>{'{رابط_العميل}'}</span> |{' '}
                <span style={{ color: '#f87171', fontWeight: 700 }}>{'{رقم_العضوية}'}</span>
              </p>
              <textarea
                rows={6}
                value={config.birthdayMessageTemplate || DEFAULT_CONFIG.birthdayMessageTemplate}
                onChange={e => setConfig({ ...config, birthdayMessageTemplate: e.target.value })}
                style={{
                  width: '100%', background: 'rgba(10, 22, 43, 0.85)',
                  border: '1px solid var(--border)', borderRadius: 12, padding: '12px',
                  color: '#ffffff', fontFamily: 'Cairo, sans-serif', fontSize: 13,
                  direction: 'rtl', outline: 'none', resize: 'vertical'
                }}
              />
            </div>

            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="primary"
                onClick={handleSaveConfig}
                disabled={saving}
                style={{ background: 'linear-gradient(135deg, #d97706, #f59e0b)', color: '#fff', fontWeight: 800, padding: '8px 22px' }}
              >
                {saving ? 'جاري الحفظ...' : '💾 حفظ إعدادات هدايا أعياد الميلاد'}
              </Button>
            </div>
          </Card>

          {/* TODAY'S BIRTHDAY CELEBRATION (VIP) */}
          {birthdayClients.filter(c => c.isToday).length > 0 && (
            <Card style={{
              background: 'linear-gradient(145deg, rgba(30, 20, 10, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%)',
              border: '2px solid #f59e0b',
              boxShadow: '0 0 25px rgba(245, 158, 11, 0.25)',
              padding: 20
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                <h4 style={{ color: '#fbbf24', fontSize: 18, fontWeight: 900, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 24 }}>🎉</span> أعياد ميلاد المشتركين اليوم — VIP Celebrations 🎂
                </h4>
                <Badge color="amber">احتفال اليوم ✨</Badge>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 14 }}>
                {birthdayClients.filter(c => c.isToday).map(client => (
                  <div
                    key={client.id}
                    style={{
                      background: 'rgba(0,0,0,0.35)', padding: '16px', borderRadius: 14,
                      border: client.isGiftGranted ? '1px solid rgba(16,185,129,0.5)' : '1px solid rgba(245,158,11,0.6)',
                      display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 12
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <div>
                          <strong style={{ color: '#ffffff', fontSize: 16, display: 'block' }}>{client.name}</strong>
                          <span style={{ color: '#93c5fd', fontSize: 12 }}>🆔 #{client.memberId} | 📞 {client.phone}</span>
                        </div>
                        <span style={{ background: 'rgba(245, 158, 11, 0.2)', border: '1px solid #f59e0b', color: '#fcd34d', padding: '3px 8px', borderRadius: 8, fontSize: 11, fontWeight: 800 }}>
                          {client.turningAge ? `يتم اليوم ${client.turningAge} عاماً 🎈` : 'عيد ميلاد اليوم 🎂'}
                        </span>
                      </div>

                      <div style={{ background: 'rgba(255,255,255,0.04)', padding: '8px 10px', borderRadius: 8, fontSize: 12, color: '#cbd5e1', marginTop: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ color: '#94a3b8' }}>📅 تاريخ الميلاد:</span>
                          <span style={{ fontWeight: 700, color: '#ffffff' }}>{client.birthDate}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#94a3b8' }}>🎁 حالة الهدية لعام {new Date().getFullYear()}:</span>
                          <span style={{ fontWeight: 800, color: client.isGiftGranted ? '#34d399' : '#f59e0b' }}>
                            {client.isGiftGranted ? `✅ تم المنح (${client.birthdayGiftDetails?.label || 'الهدية'})` : '⏳ لم تُمنح بعد'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      onClick={() => handleGrantBirthdayGift(client)}
                      disabled={grantingId === client.id}
                      style={{
                        background: client.isGiftGranted ? 'rgba(37, 211, 102, 0.2)' : 'linear-gradient(135deg, #d97706, #f59e0b)',
                        border: client.isGiftGranted ? '1px solid rgba(37, 211, 102, 0.5)' : 'none',
                        color: client.isGiftGranted ? '#25d366' : '#ffffff',
                        fontWeight: 900, width: '100%', justifyContent: 'center', padding: '10px'
                      }}
                    >
                      {grantingId === client.id
                        ? 'جاري منح الهدية...'
                        : client.isGiftGranted
                        ? '💬 إعادة إرسال رسالة التهنئة بالواتساب 📲'
                        : '🎁 منح الهدية وإرسال التهنئة بالواتساب 📲'}
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* UPCOMING BIRTHDAYS LIST */}
          <Card style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <h4 style={{ color: '#ffffff', fontSize: 16, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>📅</span> قائمة أعياد الميلاد القادمة ({birthdayClients.filter(c => !c.isToday).length})
              </h4>
            </div>

            {birthdayLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                ⏳ جاري مسح تواريخ الميلاد وتحليل أعياد الميلاد القادمة...
              </div>
            ) : birthdayClients.length === 0 ? (
              <EmptyState icon="🎈" message={`لا توجد أعياد ميلاد مسجلة خلال فترة الـ ${birthdayWindow} أيام المحددة. تأكد من إدخال تواريخ ميلاد المشتركين في ملفاتهم.`} />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 330px), 1fr))', gap: 14 }}>
                {birthdayClients.filter(c => !c.isToday).map(client => {
                  const dayText = client.diffDays === 1 ? 'غداً 🎂' : client.diffDays === 2 ? 'بعد يومين' : `بعد ${client.diffDays} أيام`;

                  return (
                    <div
                      key={client.id}
                      style={{
                        background: 'var(--bg-card)', padding: '14px', borderRadius: 12,
                        border: '1px solid rgba(255,255,255,0.08)',
                        display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 10
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                          <div>
                            <strong style={{ color: '#ffffff', fontSize: 15, display: 'block' }}>{client.name}</strong>
                            <span style={{ color: '#93c5fd', fontSize: 12 }}>🆔 #{client.memberId} | 📞 {client.phone}</span>
                          </div>
                          <Badge color="blue">{dayText}</Badge>
                        </div>

                        <div style={{ display: 'flex', gap: 10, color: '#cbd5e1', fontSize: 12, background: 'rgba(255,255,255,0.03)', padding: '6px 10px', borderRadius: 6 }}>
                          <span>📅 {client.birthDate}</span>
                          {client.turningAge && <span>🎈 سيتم {client.turningAge} عاماً</span>}
                        </div>
                      </div>

                      <Button
                        size="sm"
                        onClick={() => handleGrantBirthdayGift(client)}
                        disabled={grantingId === client.id}
                        style={{
                          background: client.isGiftGranted ? 'rgba(37, 211, 102, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                          border: `1px solid ${client.isGiftGranted ? 'rgba(37, 211, 102, 0.4)' : 'rgba(245, 158, 11, 0.4)'}`,
                          color: client.isGiftGranted ? '#25d366' : '#fcd34d',
                          fontWeight: 800, width: '100%', justifyContent: 'center'
                        }}
                      >
                        {client.isGiftGranted ? '✓ تم منح الهدية (إرسال تهنئة 📲)' : '🎁 منح الهدية مبكراً وإرسال التهنئة 📲'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Quick Assign Birthday to any Member */}
          <Card style={{ background: 'var(--bg-surface)', border: '1px solid rgba(59, 130, 246, 0.3)', padding: 18 }}>
            <h4 style={{ color: '#93c5fd', fontSize: 15, fontWeight: 800, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🔍</span> تسجيل أو تحديث تاريخ ميلاد عضو بسرعة:
            </h4>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                onChange={e => {
                  const cl = clients.find(c => c.id === e.target.value);
                  if (cl) {
                    setBirthdayModalClient(cl);
                    setQuickBirthDate(cl.birthDate || '');
                  }
                }}
                defaultValue=""
                style={{
                  flex: 1, minWidth: 220, background: 'var(--bg-card)', border: '1px solid var(--border)',
                  color: '#ffffff', borderRadius: 8, padding: '10px 12px', fontSize: 13, outline: 'none'
                }}
              >
                <option value="" disabled>-- اختر عضواً لتسجيل أو تعديل تاريخ ميلاده --</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} (🆔 #{c.memberId}) {c.birthDate ? `[مسجل: ${c.birthDate}]` : '[غير مسجل]'}
                  </option>
                ))}
              </select>
            </div>
          </Card>
        </div>
      )}

      {/* 3. SUBSCRIPTION RENEWAL REMINDERS (WHATSAPP) */}
      {activeSubTab === 'reminders' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Top Bar: Controls & Filters */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 style={{ color: '#ffffff', fontSize: 18, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>⏰</span> رادار تجديد الاشتراكات والتذكير التلقائي بالواتساب
              </h3>
              <p style={{ color: '#93c5fd', fontSize: 13, margin: '4px 0 0' }}>
                رصد فوري لجميع اشتراكات الطلاب ومساحة العمل التي أوشكت على الانتهاء أو نفدت ساعاتها/حصصها، مع إمكانية إرسال تنبيه مخصص عبر الواتساب بنقرة واحدة
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 700 }}>فترة التنبيه:</span>
                <select
                  value={expiringThreshold}
                  onChange={e => setExpiringThreshold(Number(e.target.value))}
                  style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    color: '#ffffff', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 700, outline: 'none'
                  }}
                >
                  <option value={1}>خلال 24 ساعة (اليوم وغداً)</option>
                  <option value={3}>خلال 3 أيام (الموصى به)</option>
                  <option value={5}>خلال 5 أيام</option>
                  <option value={7}>خلال أسبوع</option>
                  <option value={14}>خلال أسبوعين</option>
                </select>
              </div>

              <Button
                variant="primary"
                onClick={() => loadExpiringSubs(expiringThreshold)}
                disabled={expiringLoading}
                style={{ background: 'linear-gradient(135deg, #0284c7, #38bdf8)', color: '#fff', fontWeight: 800 }}
              >
                {expiringLoading ? 'جاري الفحص...' : '🔄 تحديث الرادار'}
              </Button>
            </div>
          </div>

          {/* Quick Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 14, textAlign: 'center' }}>
              <span style={{ color: '#94a3b8', fontSize: 12, fontWeight: 700 }}>إجمالي الاشتراكات المستهدفة</span>
              <div style={{ color: '#ffffff', fontSize: 24, fontWeight: 900, marginTop: 4 }}>{expiringSubs.length}</div>
            </div>
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 14, padding: 14, textAlign: 'center' }}>
              <span style={{ color: '#fca5a5', fontSize: 12, fontWeight: 700 }}>🚨 حرجة (تنتهي اليوم أو نفدت)</span>
              <div style={{ color: '#f87171', fontSize: 24, fontWeight: 900, marginTop: 4 }}>
                {expiringSubs.filter(s => s.urgencyLevel === 'critical').length}
              </div>
            </div>
            <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: 14, padding: 14, textAlign: 'center' }}>
              <span style={{ color: '#fcd34d', fontSize: 12, fontWeight: 700 }}>⚡ عاجلة (متبقي يوم / ساعتين)</span>
              <div style={{ color: '#fbbf24', fontSize: 24, fontWeight: 900, marginTop: 4 }}>
                {expiringSubs.filter(s => s.urgencyLevel === 'urgent').length}
              </div>
            </div>
            <div style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: 14, padding: 14, textAlign: 'center' }}>
              <span style={{ color: '#93c5fd', fontSize: 12, fontWeight: 700 }}>🔔 تنبيه مبكر (خلال أيام)</span>
              <div style={{ color: '#60a5fa', fontSize: 24, fontWeight: 900, marginTop: 4 }}>
                {expiringSubs.filter(s => s.urgencyLevel === 'warning').length}
              </div>
            </div>
          </div>

          {/* Customizable WhatsApp Template Card */}
          <Card style={{ background: 'var(--bg-surface)', border: '1px solid rgba(56, 189, 248, 0.35)' }}>
            <h4 style={{ color: '#38bdf8', fontSize: 16, fontWeight: 800, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>📝</span> تخصيص قالب رسالة تذكير التجديد بالواتساب
            </h4>
            <p style={{ color: '#93c5fd', fontSize: 12, margin: '0 0 12px' }}>
              المتغيرات التلقائية المتاحة:{' '}
              <span style={{ color: '#34d399', fontWeight: 700 }}>{'{اسم_العميل}'}</span> |{' '}
              <span style={{ color: '#38bdf8', fontWeight: 700 }}>{'{اسم_الباقة}'}</span> |{' '}
              <span style={{ color: '#f87171', fontWeight: 700 }}>{'{سبب_التنبيه}'}</span> |{' '}
              <span style={{ color: '#fbbf24', fontWeight: 700 }}>{'{الرصيد_المتبقي}'}</span> |{' '}
              <span style={{ color: '#a78bfa', fontWeight: 700 }}>{'{تاريخ_الانتهاء}'}</span> |{' '}
              <span style={{ color: '#38bdf8', fontWeight: 700 }}>{'{رابط_العميل}'}</span>
            </p>

            <textarea
              rows={6}
              value={config.subscriptionReminderTemplate || DEFAULT_CONFIG.subscriptionReminderTemplate}
              onChange={e => setConfig({ ...config, subscriptionReminderTemplate: e.target.value })}
              style={{
                width: '100%', background: 'rgba(10, 22, 43, 0.85)',
                border: '1px solid var(--border)', borderRadius: 12, padding: '12px',
                color: '#ffffff', fontFamily: 'Cairo, sans-serif', fontSize: 13,
                direction: 'rtl', outline: 'none', resize: 'vertical'
              }}
            />

            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="primary"
                onClick={handleSaveConfig}
                disabled={saving}
                style={{ background: 'linear-gradient(135deg, #0284c7, #38bdf8)', color: '#fff', fontWeight: 800, padding: '8px 20px' }}
              >
                {saving ? 'جاري الحفظ...' : '💾 حفظ نص القالب للإرسال'}
              </Button>
            </div>
          </Card>

          {/* Subscriptions List */}
          <Card style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <h4 style={{ color: '#ffffff', fontSize: 16, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>📋</span> قائمة الاشتراكات الواجب تذكيرها ({expiringSubs.length})
              </h4>
            </div>

            {expiringLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                ⏳ جاري فحص الاشتراكات وتحليل تواريخ الصلاحية والأرصدة...
              </div>
            ) : expiringSubs.length === 0 ? (
              <EmptyState icon="🎉" message={`ممتاز! لا توجد اشتراكات أوشكت على الانتهاء خلال فترة الـ ${expiringThreshold} أيام المحددة.`} />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 330px), 1fr))', gap: 14 }}>
                {expiringSubs.map(sub => {
                  const isSent = reminderSentMap[sub.subscriptionId] || sub.lastReminderSent;
                  const badgeColor = sub.urgencyLevel === 'critical' ? 'red' : sub.urgencyLevel === 'urgent' ? 'amber' : 'blue';

                  return (
                    <div
                      key={sub.subscriptionId}
                      style={{
                        background: 'var(--bg-card)', padding: '16px', borderRadius: 14,
                        border: sub.urgencyLevel === 'critical'
                          ? '1px solid rgba(239, 68, 68, 0.45)'
                          : sub.urgencyLevel === 'urgent'
                          ? '1px solid rgba(245, 158, 11, 0.45)'
                          : '1px solid rgba(59, 130, 246, 0.3)',
                        display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 12,
                        boxShadow: sub.urgencyLevel === 'critical' ? '0 0 15px rgba(239, 68, 68, 0.1)' : 'none'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                          <div>
                            <strong style={{ color: '#ffffff', fontSize: 15, display: 'block' }}>{sub.clientName}</strong>
                            <span style={{ color: '#93c5fd', fontSize: 12 }}>🆔 {sub.memberId || '—'} | 📞 {sub.phone || 'بدون هاتف'}</span>
                          </div>
                          <Badge color={badgeColor}>{sub.reason}</Badge>
                        </div>

                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '8px 10px', borderRadius: 8, fontSize: 12, color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#94a3b8' }}>📦 الباقة:</span>
                            <span style={{ fontWeight: 700, color: '#ffffff' }}>{sub.packageName}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#94a3b8' }}>⏳ الانتهاء:</span>
                            <span style={{ fontWeight: 700, color: '#fca5a5' }}>{sub.endDate || 'غير محدد'}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#94a3b8' }}>⏱️ الرصيد المتبقي:</span>
                            <span style={{ fontWeight: 700, color: '#38bdf8' }}>
                              {sub.packageType === 'workspace'
                                ? `${Math.max(0, (sub.totalHours || 0) - (sub.hoursUsed || 0))} ساعة`
                                : `${Math.max(0, (sub.packageSessions || 0) - (sub.sessionsUsed || 0))} حصة`}
                            </span>
                          </div>
                        </div>

                        {isSent && (
                          <div style={{ marginTop: 8, fontSize: 11, color: '#34d399', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span>✓ تم إرسال تذكير سابقاً</span>
                            {sub.lastReminderSent && <span style={{ color: '#94a3b8' }}>({sub.lastReminderSent})</span>}
                          </div>
                        )}
                      </div>

                      <Button
                        size="sm"
                        onClick={() => handleSendSubscriptionReminder(sub)}
                        style={{
                          background: isSent ? 'rgba(37, 211, 102, 0.1)' : 'rgba(37, 211, 102, 0.2)',
                          border: '1px solid rgba(37, 211, 102, 0.5)',
                          color: '#25d366', fontWeight: 800, width: '100%', justifyContent: 'center'
                        }}
                      >
                        📲 إرسال تذكير تجديد عبر واتساب
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* 3. RETENTION & WHATSAPP RADAR TAB */}
      {activeSubTab === 'retention' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* WhatsApp Template Editor */}
          <Card style={{ background: 'var(--bg-surface)', border: '1px solid rgba(37, 211, 102, 0.35)' }}>
            <h3 style={{ color: '#25d366', fontSize: 17, fontWeight: 800, margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>💬</span> تخصيص نص رسالة الواتساب الترويجية لإعادة الجذب
            </h3>
            <p style={{ color: '#93c5fd', fontSize: 12, margin: '0 0 12px' }}>
              يمكنك استخدام المتغيرات التلقائية التالية: <strong style={{ color: '#25d366' }}>{'{اسم_العميل}'}</strong> و <strong style={{ color: '#38bdf8' }}>{'{رابط_العميل}'}</strong> و <strong style={{ color: '#fcd34d' }}>{'{رقم_العضوية}'}</strong>
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ color: '#c8dcf5', fontSize: 13, display: 'block', marginBottom: 6, fontWeight: 700 }}>
                  🟡 احتساب العميل (غائب) بعد انقطاع:
                </label>
                <Input
                  type="number"
                  value={config.atRiskDays}
                  onChange={e => setConfig({ ...config, atRiskDays: e.target.value })}
                />
              </div>

              <div>
                <label style={{ color: '#c8dcf5', fontSize: 13, display: 'block', marginBottom: 6, fontWeight: 700 }}>
                  🔴 احتساب العميل (خامل جداً) بعد انقطاع:
                </label>
                <Input
                  type="number"
                  value={config.dormantDays}
                  onChange={e => setConfig({ ...config, dormantDays: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label style={{ color: '#c8dcf5', fontSize: 13, display: 'block', marginBottom: 6, fontWeight: 700 }}>
                📝 نص الرسالة التلقائية:
              </label>
              <textarea
                rows={6}
                value={config.retentionMessageTemplate}
                onChange={e => setConfig({ ...config, retentionMessageTemplate: e.target.value })}
                style={{
                  width: '100%', background: 'rgba(10, 22, 43, 0.85)',
                  border: '1px solid var(--border)', borderRadius: 12, padding: '12px',
                  color: '#ffffff', fontFamily: 'Cairo, sans-serif', fontSize: 13,
                  direction: 'rtl', outline: 'none', resize: 'vertical'
                }}
              />
            </div>

            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="primary"
                onClick={handleSaveConfig}
                disabled={saving}
                style={{ background: 'linear-gradient(135deg, #059669, #10b981)', color: '#fff', fontWeight: 800, padding: '10px 24px' }}
              >
                {saving ? 'جاري الحفظ...' : '💾 حفظ نص الرسالة والإعدادات'}
              </Button>
            </div>
          </Card>

          {/* Retention Radar Table */}
          <Card style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <h3 style={{ color: '#ffffff', fontSize: 16, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🎯</span> قائمة المشتركين الخاملين وجاهزية الإرسال
              </h3>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 12 }}>
              {analyzedClients.filter(c => c.retentionStatus !== 'active').map(client => (
                <div key={client.id} style={{
                  background: 'var(--bg-card)', padding: '14px', borderRadius: 12,
                  border: client.retentionStatus === 'dormant' ? '1px solid rgba(239,68,68,0.35)' : '1px solid rgba(245,158,11,0.35)',
                  display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 10
                }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <strong style={{ color: '#ffffff', fontSize: 15 }}>{client.name}</strong>
                      <Badge color={client.statusColor}>{client.statusLabel}</Badge>
                    </div>
                    <div style={{ display: 'flex', gap: 10, color: '#93c5fd', fontSize: 12, marginBottom: 4 }}>
                      <span>🆔 {client.memberId || '—'}</span>
                      <span>📍 {client.address || 'سوهاج'}</span>
                      <span>📞 {client.phone}</span>
                    </div>
                    <p style={{ color: '#64748b', fontSize: 11, margin: 0 }}>
                      آخر ظهور: {client.diffDays >= 999 ? 'لم يحضر بعد' : 'منذ ' + client.diffDays + ' يوم'}
                    </p>
                  </div>

                  <Button
                    size="sm"
                    onClick={() => handleSendCustomRetention(client)}
                    style={{
                      background: 'rgba(37, 211, 102, 0.15)', border: '1px solid rgba(37, 211, 102, 0.4)',
                      color: '#25d366', fontWeight: 800, width: '100%', justifyContent: 'center'
                    }}
                  >
                    💬 إرسال الرسالة المخصصة بالواتساب
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* 3. EXCEL EXPORTS HUB */}
      {activeSubTab === 'exports' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <Card style={{ background: 'var(--bg-surface)', border: '1px solid rgba(59,130,246,0.3)', padding: 20, textAlign: 'center' }}>
            <span style={{ fontSize: 36, display: 'block', marginBottom: 8 }}>👥</span>
            <h3 style={{ color: '#ffffff', fontSize: 17, fontWeight: 800, margin: '0 0 6px' }}>قاعدة بيانات العملاء الشاملة</h3>
            <p style={{ color: '#93c5fd', fontSize: 12, margin: '0 0 16px' }}>
              تحميل شيت إكسيل يحتوي على أرقام المشتركين، مناطق سوهاج، أعمارهم، باقاتهم، وأرصدة نقاط الولاء
            </p>
            <Button
              onClick={handleExportClientsExcel}
              style={{ background: 'linear-gradient(135deg, #059669, #10b981)', color: '#fff', fontWeight: 800, width: '100%', justifyContent: 'center' }}
            >
              📥 تحميل شيت العملاء (Excel)
            </Button>
          </Card>

          <Card style={{ background: 'var(--bg-surface)', border: '1px solid rgba(16,185,129,0.3)', padding: 20, textAlign: 'center' }}>
            <span style={{ fontSize: 36, display: 'block', marginBottom: 8 }}>💰</span>
            <h3 style={{ color: '#ffffff', fontSize: 17, fontWeight: 800, margin: '0 0 6px' }}>كشف المدفوعات والإيرادات</h3>
            <p style={{ color: '#a7f3d0', fontSize: 12, margin: '0 0 16px' }}>
              تحميل شيت إكسيل يضم جميع الدفعات والتحصيلات المسجلة على النظام مع تفاصيل الدفع
            </p>
            <Button
              onClick={handleExportRevenuesExcel}
              style={{ background: 'linear-gradient(135deg, #059669, #10b981)', color: '#fff', fontWeight: 800, width: '100%', justifyContent: 'center' }}
            >
              📥 تحميل كشف الإيرادات (Excel)
            </Button>
          </Card>
        </div>
      )}

      {/* 3. ANNOUNCEMENTS & BANNERS SUB-TAB */}
      {activeSubTab === 'announcements' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Header Action & Stats */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 style={{ color: '#ffffff', fontSize: 18, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>📢</span> لوحة الإعلانات والعروض الترويجية للبوابات
              </h3>
              <p style={{ color: '#93c5fd', fontSize: 13, margin: '4px 0 0' }}>
                تخصيص البانرات التفاعلية والخصومات وورش العمل التي تظهر في بوابات الطلاب وبوابات المحاضرين
              </p>
            </div>

            <Button
              onClick={handleOpenAddAnnouncement}
              style={{
                background: 'linear-gradient(135deg, #0284c7, #38bdf8)',
                color: '#ffffff',
                fontWeight: 800,
                boxShadow: '0 4px 16px rgba(56,189,248,0.3)'
              }}
            >
              + إضافة إعلان / بانر جديد 📢
            </Button>
          </div>

          {/* Quick Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 14, textAlign: 'center' }}>
              <span style={{ color: '#94a3b8', fontSize: 12, fontWeight: 700 }}>إجمالي الإعلانات المسجلة</span>
              <div style={{ color: '#ffffff', fontSize: 24, fontWeight: 900, marginTop: 4 }}>{announcements.length}</div>
            </div>
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 14, padding: 14, textAlign: 'center' }}>
              <span style={{ color: '#a7f3d0', fontSize: 12, fontWeight: 700 }}>الإعلانات المفعلة حالياً</span>
              <div style={{ color: '#34d399', fontSize: 24, fontWeight: 900, marginTop: 4 }}>{announcements.filter(a => a.isActive).length}</div>
            </div>
            <div style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: 14, padding: 14, textAlign: 'center' }}>
              <span style={{ color: '#93c5fd', fontSize: 12, fontWeight: 700 }}>معروض للطلاب 🎓</span>
              <div style={{ color: '#60a5fa', fontSize: 24, fontWeight: 900, marginTop: 4 }}>{announcements.filter(a => a.isActive && (a.target === 'clients' || a.target === 'all')).length}</div>
            </div>
            <div style={{ background: 'rgba(168, 85, 247, 0.1)', border: '1px solid rgba(168, 85, 247, 0.3)', borderRadius: 14, padding: 14, textAlign: 'center' }}>
              <span style={{ color: '#e9d5ff', fontSize: 12, fontWeight: 700 }}>معروض للمدرسين 👨‍🏫</span>
              <div style={{ color: '#c084fc', fontSize: 24, fontWeight: 900, marginTop: 4 }}>{announcements.filter(a => a.isActive && (a.target === 'instructors' || a.target === 'all')).length}</div>
            </div>
          </div>

          {/* Banner Auto-Rotation Controls Card */}
          <Card style={{
            background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.98))',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: 16,
            padding: 20,
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
              <div style={{ maxWidth: 640 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 22 }}>⏱️</span>
                  <h4 style={{ color: '#ffffff', fontSize: 16, fontWeight: 800, margin: 0 }}>
                    التحكم في سرعة الانتقال التلقائي للبانرات
                  </h4>
                  <Badge variant={Number(bannerRotationSeconds) > 0 ? 'success' : 'neutral'}>
                    {Number(bannerRotationSeconds) > 0 ? `التبديل كل ${bannerRotationSeconds} ثواني` : 'التبديل التلقائي متوقف (يدوي فقط)'}
                  </Badge>
                </div>
                <p style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                  حدد المدة الزمنية بالثواني التي ينتقل بعدها البانر الإعلاني تلقائياً إلى البانر التالي في بوابات الطلاب والمدرسين.
                  <br />
                  <span style={{ color: '#38bdf8', fontWeight: 600 }}>
                    💡 ملاحظة: يمكن للطالب أو المحاضر في أي وقت التنقل بين البانرات يدوياً باللمس والسحب (Swipe) أو النقر، ويتوقف التبديل التلقائي مؤقتاً أثناء اللمس أو عند تحويم مؤشر الفأرة للقراءة بتركيز.
                  </span>
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 280 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Input
                    type="number"
                    min="0"
                    max="60"
                    value={bannerRotationSeconds}
                    onChange={(e) => setBannerRotationSeconds(e.target.value)}
                    placeholder="المدة بالثواني"
                    style={{ width: 110, fontWeight: 800, textAlign: 'center', fontSize: 15 }}
                  />
                  <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 700 }}>ثانية</span>

                  <Button
                    onClick={() => handleSaveBannerRotation()}
                    disabled={savingBannerSettings}
                    style={{
                      background: bannerSettingsSuccess
                        ? 'linear-gradient(135deg, #059669, #10b981)'
                        : 'linear-gradient(135deg, #0284c7, #38bdf8)',
                      color: '#ffffff',
                      fontWeight: 800,
                      flex: 1,
                      justifyContent: 'center',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {savingBannerSettings ? 'جاري الحفظ...' : bannerSettingsSuccess ? '✓ تم الحفظ' : 'حفظ السرعة'}
                  </Button>
                </div>

                {/* Quick Presets */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>خيارات سريعة:</span>
                  {[3, 5, 7, 10, 15].map(sec => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => {
                        setBannerRotationSeconds(sec);
                        handleSaveBannerRotation(sec);
                      }}
                      style={{
                        background: Number(bannerRotationSeconds) === sec ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                        border: `1px solid ${Number(bannerRotationSeconds) === sec ? '#38bdf8' : 'rgba(255, 255, 255, 0.1)'}`,
                        color: Number(bannerRotationSeconds) === sec ? '#38bdf8' : '#cbd5e1',
                        borderRadius: 8,
                        padding: '4px 10px',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {sec} ث
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setBannerRotationSeconds(0);
                      handleSaveBannerRotation(0);
                    }}
                    style={{
                      background: Number(bannerRotationSeconds) === 0 ? 'rgba(239, 68, 68, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                      border: `1px solid ${Number(bannerRotationSeconds) === 0 ? '#f87171' : 'rgba(255, 255, 255, 0.1)'}`,
                      color: Number(bannerRotationSeconds) === 0 ? '#f87171' : '#94a3b8',
                      borderRadius: 8,
                      padding: '4px 10px',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    إيقاف (يدوي)
                  </button>
                </div>
              </div>
            </div>
          </Card>

          {/* Announcements Table */}
          <Card style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', padding: 0, overflow: 'hidden' }}>
            {announcements.length === 0 ? (
              <EmptyState icon="📢" message="لا توجد إعلانات أو بانرات مسجلة بعد، اضغط على زر إضافة إعلان للبدء" />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid var(--border)', color: '#94a3b8' }}>
                      <th style={{ padding: '12px' }}>الحالة</th>
                      <th style={{ padding: '12px' }}>الفئة المستهدفة</th>
                      <th style={{ padding: '12px' }}>نوع الإعلان</th>
                      <th style={{ padding: '12px' }}>عنوان الإعلان</th>
                      <th style={{ padding: '12px' }}>الشارة / الخصم</th>
                      <th style={{ padding: '12px' }}>الرابط التفاعلي</th>
                      <th style={{ padding: '12px', textAlign: 'center' }}>إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {announcements.map(ad => (
                      <tr key={ad.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '12px' }}>
                          <button
                            onClick={() => handleToggleAnnouncementActive(ad)}
                            style={{
                              background: ad.isActive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(100, 116, 139, 0.2)',
                              border: `1px solid ${ad.isActive ? 'rgba(16, 185, 129, 0.5)' : 'rgba(100, 116, 139, 0.4)'}`,
                              color: ad.isActive ? '#34d399' : '#94a3b8',
                              padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 800, cursor: 'pointer'
                            }}
                          >
                            {ad.isActive ? '🟢 مفعل وظاهر' : '⏸️ معطل ومخفي'}
                          </button>
                        </td>
                        <td style={{ padding: '12px' }}>
                          <Badge color={ad.target === 'clients' ? 'blue' : ad.target === 'instructors' ? 'purple' : 'green'}>
                            {ad.target === 'clients' ? '🎓 الطلاب والمشتركين' : ad.target === 'instructors' ? '👨‍🏫 المدرسين فقط' : '🌐 الجميع'}
                          </Badge>
                        </td>
                        <td style={{ padding: '12px' }}>
                          <span style={{ color: '#cbd5e1', fontWeight: 600 }}>
                            {ad.category === 'offer' ? '🎁 عرض ترويجي' : ad.category === 'event' ? '🗓️ ورشة / فعالية' : ad.category === 'alert' ? '⚠️ تنبيه هام' : '📢 إعلان عام'}
                          </span>
                        </td>
                        <td style={{ padding: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {ad.imageUrl && (
                              <img
                                src={ad.imageUrl}
                                alt="ad"
                                onError={(e) => { e.target.style.display = 'none'; }}
                                style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)' }}
                              />
                            )}
                            <div>
                              <strong style={{ color: '#ffffff', display: 'block', fontSize: 14 }}>{ad.title}</strong>
                              <span style={{ color: '#94a3b8', fontSize: 11, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                {ad.content}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '12px' }}>
                          {ad.badgeText ? (
                            <span style={{ background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.4)', color: '#fbbf24', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 800 }}>
                              {ad.badgeText}
                            </span>
                          ) : '—'}
                        </td>
                        <td style={{ padding: '12px', color: '#60a5fa', fontSize: 12 }}>
                          {ad.actionUrl ? (
                            <a href={ad.actionUrl} target="_blank" rel="noreferrer" style={{ color: '#38bdf8', textDecoration: 'underline' }}>
                              {ad.actionLabel || 'فتح الرابط'}
                            </a>
                          ) : '—'}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <Button size="sm" variant="ghost" onClick={() => handleOpenEditAnnouncement(ad)} style={{ color: '#60a5fa' }}>
                              ✏️ تعديل
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => setDeleteAnnouncementId(ad.id)}>
                              حذف
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Add / Edit Announcement Modal */}
      <Modal
        open={announcementModal}
        onClose={() => setAnnouncementModal(false)}
        title={editingAnnouncement ? '✏️ تعديل الإعلان' : '📢 إنشاء إعلان / بانر ترويجي جديد'}
        size="lg"
      >
        <form onSubmit={handleSaveAnnouncement} style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '80vh', overflowY: 'auto', padding: '4px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            <Input
              label="عنوان الإعلان / البانر"
              value={announcementForm.title}
              onChange={e => setAnnouncementForm({ ...announcementForm, title: e.target.value })}
              placeholder="مثال: خصم 20% على باقات الشهر القادم"
              required
            />
            <Select
              label="الفئة المستهدفة"
              value={announcementForm.target}
              onChange={e => setAnnouncementForm({ ...announcementForm, target: e.target.value })}
            >
              <option value="all">🌐 الجميع (الطلاب والمدرسين)</option>
              <option value="clients">🎓 بوابة الطلاب والمشتركين فقط</option>
              <option value="instructors">👨‍🏫 بوابة المدرسين والمحاضرين فقط</option>
            </Select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <Select
              label="نوع الإعلان"
              value={announcementForm.category}
              onChange={e => setAnnouncementForm({ ...announcementForm, category: e.target.value })}
            >
              <option value="offer">🎁 عرض ترويجي / خصم خاص</option>
              <option value="event">🗓️ ورشة عمل / فعالية قادمة</option>
              <option value="alert">⚠️ تنبيه إداري / مواعيد العمل</option>
              <option value="general">📢 إعلان عام وخبر</option>
            </Select>

            <Input
              label="شارة بارزة (Badge - اختياري)"
              value={announcementForm.badgeText}
              onChange={e => setAnnouncementForm({ ...announcementForm, badgeText: e.target.value })}
              placeholder="مثال: خصم 20% / لفترة محدودة"
            />

            <Input
              label="ترتيب الأسبقية (1 الأسبق)"
              type="number"
              value={announcementForm.priority}
              onChange={e => setAnnouncementForm({ ...announcementForm, priority: e.target.value })}
            />
          </div>

          <div>
            <label style={{ display: 'block', color: '#c8dcf5', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
              صورة أو بوستر الإعلان الدعائي (اختياري):
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '9px 16px', borderRadius: 10,
                  background: 'rgba(56, 189, 248, 0.15)',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  color: '#38bdf8', fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', transition: 'all 0.2s'
                }}>
                  <Upload size={16} />
                  <span>📁 اختر صورة من جهازك / موبايلك</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    style={{ display: 'none' }}
                  />
                </label>

                {announcementForm.imageUrl && (
                  <button
                    type="button"
                    onClick={() => setAnnouncementForm(prev => ({ ...prev, imageUrl: '' }))}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '8px 14px', borderRadius: 10,
                      background: 'rgba(239, 68, 68, 0.12)',
                      border: '1px solid rgba(239, 68, 68, 0.35)',
                      color: '#f87171', fontSize: 12, fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    <Trash2 size={14} />
                    <span>إزالة الصورة</span>
                  </button>
                )}
              </div>

              <Input
                label="أو الصق رابط صورة خارجي (URL):"
                value={announcementForm.imageUrl.startsWith('data:image') ? '(تم اختيار صورة من الجهاز)' : announcementForm.imageUrl}
                onChange={e => setAnnouncementForm({ ...announcementForm, imageUrl: e.target.value })}
                placeholder="https://example.com/banner.jpg"
                disabled={announcementForm.imageUrl.startsWith('data:image')}
              />

              {announcementForm.imageUrl && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: 10,
                  borderRadius: 12, background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)'
                }}>
                  <img
                    src={announcementForm.imageUrl}
                    alt="Preview"
                    style={{ width: 70, height: 50, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(56,189,248,0.4)' }}
                  />
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>
                    <span style={{ color: '#38bdf8', fontWeight: 700 }}>تم تجهيز الصورة بنجاح!</span>
                    <br />
                    ستظهر في قمة كارت الإعلان للطلاب والمدرسين.
                  </div>
                </div>
              )}
            </div>
            <p style={{ color: '#64748b', fontSize: 11, margin: '6px 0 0' }}>
              💡 ملحوظة: الصورة اختيارية تماماً (المقاس الموصى به للبانر هو <strong>800 × 240 بكسل</strong> أو نسبة 3.3:1 بجودة عالية). وإذا لم تضع صورة سيظهر الإعلان بتصميم نصي مع شارة ولون مميز.
            </p>
          </div>

          <div>
            <label style={{ display: 'block', color: '#c8dcf5', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              تفاصيل ونص الإعلان:
            </label>
            <textarea
              rows={3}
              value={announcementForm.content}
              onChange={e => setAnnouncementForm({ ...announcementForm, content: e.target.value })}
              placeholder="اكتب تفاصيل العرض، الشروط، أو موعد الورشة..."
              style={{
                width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '10px 12px', color: '#fff', fontSize: 13,
                fontFamily: 'Cairo, sans-serif', outline: 'none', resize: 'vertical'
              }}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            <Input
              label="نص زر التفاعل (اختياري)"
              value={announcementForm.actionLabel}
              onChange={e => setAnnouncementForm({ ...announcementForm, actionLabel: e.target.value })}
              placeholder="مثال: احجز مقعدك بالواتساب"
            />
            <Input
              label="رابط الزر (اختياري)"
              value={announcementForm.actionUrl}
              onChange={e => setAnnouncementForm({ ...announcementForm, actionUrl: e.target.value })}
              placeholder="مثال: https://wa.me/2010... أو رابط صفحة"
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              id="announcement-is-active"
              checked={announcementForm.isActive}
              onChange={e => setAnnouncementForm({ ...announcementForm, isActive: e.target.checked })}
              style={{ cursor: 'pointer' }}
            />
            <label htmlFor="announcement-is-active" style={{ color: '#ffffff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              تفعيل الإعلان للظهور فوراً في البوابات المستهدفة
            </label>
          </div>

          {/* Live Mobile / Portal Preview */}
          <div style={{ background: 'rgba(7, 14, 27, 0.9)', border: '1px dashed rgba(56, 189, 248, 0.4)', borderRadius: 14, padding: 14, marginTop: 6 }}>
            <span style={{ color: '#38bdf8', fontSize: 11, fontWeight: 800, display: 'block', marginBottom: 8 }}>
              👁️ معاينة حية لشكل الإعلان في بوابة المشترك / المحاضر:
            </span>
            <div style={{
              background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95))',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              borderRadius: 14, padding: 14, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap'
            }}>
              {announcementForm.imageUrl && (
                <img
                  src={announcementForm.imageUrl}
                  alt="preview"
                  onError={(e) => { e.target.style.display = 'none'; }}
                  style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)' }}
                />
              )}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  {announcementForm.badgeText && (
                    <span style={{ background: 'rgba(245, 158, 11, 0.2)', border: '1px solid rgba(245, 158, 11, 0.5)', color: '#fbbf24', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 800 }}>
                      {announcementForm.badgeText}
                    </span>
                  )}
                  <strong style={{ color: '#ffffff', fontSize: 14 }}>
                    {announcementForm.title || 'عنوان الإعلان التجريبي'}
                  </strong>
                </div>
                <p style={{ color: '#cbd5e1', fontSize: 12, margin: '2px 0 6px', lineHeight: 1.5 }}>
                  {announcementForm.content || 'سيظهر هنا نص وتفاصيل الإعلان الذي قمت بكتابته...'}
                </p>
                {announcementForm.actionLabel && (
                  <span style={{ display: 'inline-block', background: '#0284c7', color: '#fff', fontSize: 11, fontWeight: 800, padding: '4px 12px', borderRadius: 8 }}>
                    {announcementForm.actionLabel} ↗
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <Button type="button" variant="ghost" onClick={() => setAnnouncementModal(false)}>
              إلغاء
            </Button>
            <Button type="submit" variant="primary" disabled={announcementLoading}>
              {announcementLoading ? 'جاري الحفظ...' : (editingAnnouncement ? '💾 حفظ التعديلات' : '✅ تأكيد ونشر الإعلان')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteAnnouncementId}
        onClose={() => setDeleteAnnouncementId(null)}
        onConfirm={handleDeleteAnnouncement}
        title="حذف الإعلان"
        message="هل أنت متأكد من رغبتك في حذف هذا الإعلان نهائياً؟"
      />

      {/* Manual Bonus Points Modal */}
      {selectedClientForPoints && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16
        }}>
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-glow)',
            borderRadius: 20, padding: 24, maxWidth: 420, width: '100%', direction: 'rtl'
          }}>
            <h3 style={{ color: '#fbbf24', fontSize: 18, fontWeight: 800, margin: '0 0 8px' }}>
              🎁 تعديل نقاط الولاء للعميل
            </h3>
            <p style={{ color: '#ffffff', fontSize: 14, fontWeight: 700, margin: '0 0 14px' }}>
              العميل: {selectedClientForPoints.name}
            </p>

            <label style={{ color: '#93c5fd', fontSize: 13, display: 'block', marginBottom: 6 }}>
              عدد النقاط للإضافة (أو بالسالب للخصم، مثال: 50 أو -20):
            </label>
            <Input
              type="number"
              value={manualPoints}
              onChange={e => setManualPoints(e.target.value)}
              placeholder="مثال: 50"
            />

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <Button
                variant="primary"
                onClick={handleAddBonusPoints}
                style={{ flex: 1, background: 'linear-gradient(135deg, #d97706, #f59e0b)', color: '#fff' }}
              >
                تأكيد التعديل
              </Button>
              <Button
                variant="ghost"
                onClick={() => setSelectedClientForPoints(null)}
                style={{ flex: 1 }}
              >
                إلغاء
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Quick BirthDate Update Modal */}
      {birthdayModalClient && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16
        }}>
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid #f59e0b',
            borderRadius: 20, padding: 24, maxWidth: 420, width: '100%', direction: 'rtl'
          }}>
            <h3 style={{ color: '#fbbf24', fontSize: 18, fontWeight: 800, margin: '0 0 8px' }}>
              🎂 تسجيل تاريخ ميلاد العضو
            </h3>
            <p style={{ color: '#ffffff', fontSize: 14, fontWeight: 700, margin: '0 0 14px' }}>
              العضو: {birthdayModalClient.name} (🆔 #{birthdayModalClient.memberId})
            </p>

            <DateInputDMY
              label="تاريخ الميلاد"
              value={quickBirthDate}
              onChange={e => setQuickBirthDate(e.target.value)}
            />

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <Button
                variant="primary"
                onClick={handleSaveQuickBirthDate}
                style={{ flex: 1, background: 'linear-gradient(135deg, #d97706, #f59e0b)', color: '#fff' }}
              >
                💾 حفظ وتحديث
              </Button>
              <Button
                variant="ghost"
                onClick={() => { setBirthdayModalClient(null); setQuickBirthDate(''); }}
                style={{ flex: 1 }}
              >
                إلغاء
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
