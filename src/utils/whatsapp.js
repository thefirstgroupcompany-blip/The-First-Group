// WhatsApp Automation Utilities for The First Group Management System

export const normalizePhoneNumber = (phone) => {
  if (!phone) return '';
  let clean = String(phone).trim().replace(/\D/g, '');
  if (clean.startsWith('002')) {
    clean = clean.slice(2);
  } else if (clean.startsWith('01')) {
    clean = '2' + clean;
  } else if (clean.startsWith('1') && clean.length === 10) {
    clean = '20' + clean;
  }
  return clean;
};

export const openWhatsApp = (phone, text) => {
  const cleanPhone = normalizePhoneNumber(phone);
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const waUrl = cleanPhone
    ? (isMobile ? `whatsapp://send?phone=${cleanPhone}&text=${encodeURIComponent(text)}` : `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`)
    : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;

  window.open(waUrl, '_blank');
};

// Gender Grammar Dictionary & Targeter
export const getGenderGrammar = (gender = 'male') => {
  const isF = gender === 'female';
  return {
    isFemale: isF,
    title: isF ? 'الأستاذة' : 'الأستاذ',
    titleShort: isF ? 'أستاذة' : 'أستاذ',
    dear: isF ? 'عزيزتنا المشتركة' : 'عزيزنا المشترك',
    welcomeToYou: isF ? 'مرحباً بكِ' : 'مرحباً بك',
    ahlanToYou: isF ? 'أهلاً بكِ في' : 'أهلاً بك في',
    canYou: isF ? 'يمكنكِ' : 'يمكنك',
    yourSub: isF ? 'اشتراككِ' : 'اشتراكك',
    yourBalance: isF ? 'رصيدكِ' : 'رصيدك',
    yourHours: isF ? 'ساعاتكِ' : 'ساعاتك',
    yourPortal: isF ? 'بوابتكِ الإلكترونية' : 'بوابتك الإلكترونية',
    yourAccount: isF ? 'حسابكِ' : 'حسابك',
    fromYou: isF ? 'منكِ' : 'منك',
    toYou: isF ? 'لكِ' : 'لك',
    withYou: isF ? 'معكِ' : 'معك',
    missYou: isF ? 'وحشتينا' : 'وحشتنا',
    hopeYouAreWell: isF ? 'نتمنى تكوني بألف خير' : 'نتمنى تكون بألف خير',
    giftYou: isF ? 'حابين نهديكِ' : 'حابين نهديك',
    yourVisit: isF ? 'زيارتكِ' : 'زيارتك',
    weLookForwardToSeeingYou: isF ? 'ونتطلع لرؤيتكِ مجدداً' : 'ونتطلع لرؤيتك مجدداً',
    weAreGladForYourPresence: isF ? 'نسعد بوجودكِ معنا دائماً' : 'نسعد بوجودك معنا دائماً',
    weWishYou: isF ? 'نتمنى لكِ وقتاً مثمراً وتجربة مميزة معنا' : 'نتمنى لك وقتاً مثمراً وتجربة مميزة معنا',
    informYou: isF ? 'نود إعلامكِ' : 'نود إعلامك',
  };
};

// 1. Welcome New Client Message (Gender Aware)
export const sendWelcomeWhatsApp = (client, systemInfo = {}) => {
  const origin = window.location.origin;
  const orgName = systemInfo?.name || 'THE FIRST GROUP';
  const g = getGenderGrammar(client.gender);
  const directLink = `${origin}/client?id=${encodeURIComponent(client.id || '')}&phone=${encodeURIComponent(client.phone || '')}`;

  const text = `${g.welcomeToYou} ${g.titleShort} ${client.name} 👋✨
${g.ahlanToYou} ${orgName}!

تم تسجيل عضويتك بنجاح في نظامنا:
🆔 رقم العضوية: ${client.memberId}
📱 رقم الموبايل: ${client.phone}

🔗 ${g.canYou} متابعة تفاصيل باقتك، رصيد ${g.yourHours} المتبقية، وسجل زياراتك في أي وقت عبر ${g.yourPortal}:
${directLink}

🔒 عند فتح الرابط لأول مرة، سيطلب ${g.fromYou} النظام تعيين كلمة مرور خاصة ${g.toYou} لحماية ${g.yourAccount}.

${g.weWishYou}! 🏢🌟`;

  openWhatsApp(client.phone, text);
};

// 2. Official Payment Receipt Message (Gender Aware)
export const sendPaymentReceiptWhatsApp = (client, payment, systemInfo = {}) => {
  const orgName = systemInfo?.name || 'THE FIRST GROUP';
  const g = getGenderGrammar(client.gender);
  const receiptNo = payment.receiptNo || `REC-${(payment.id || '').slice(-6).toUpperCase()}`;
  const amount = Number(payment.amount || 0).toLocaleString('ar-EG-u-nu-latn');

  const shiftOwner = payment.shiftEmployeeName || payment.employeeName || 'المدير العام (الإدارة)';
  const methodLabel = payment.paymentMethod === 'visa' ? 'فيزا' : payment.paymentMethod === 'vodafone_cash' ? 'فودافون كاش' : payment.paymentMethod === 'instapay' ? 'إنستاباي' : 'نقدي';

  const text = `إيصال استلام دفعة نقدية 🧾💳
من: ${orgName}
---------------------------------
${g.isFemale ? 'المشتركة' : 'المشترك'}: ${g.titleShort} ${client.name} (عضوية: ${client.memberId || '—'})
رقم الإيصال: ${receiptNo}
المبلغ المسدد: ${amount} ج.م (${methodLabel})
البيان: ${payment.note || 'سداد اشتراك / باقة'}
المستلم وصاحب المناوبة: ${shiftOwner}
التاريخ: ${new Date().toLocaleDateString('ar-EG-u-nu-latn')}
---------------------------------
شكراً لثقتكم واختياركم لنا! 🙏✨`;

  openWhatsApp(client.phone, text);
};

// 3. Subscription Expiry / Low Balance Alert (Gender Aware)
export const sendSubscriptionReminderWhatsApp = (client, sub, systemInfo = {}) => {
  const orgName = systemInfo?.name || 'THE FIRST GROUP';
  const g = getGenderGrammar(client.gender);
  const isWs = sub.packageType === 'workspace' || !!sub.totalHours;
  const total = isWs ? (Number(sub.totalHours || sub.packageSessions) || 0) : (Number(sub.packageSessions) || 0);
  const used = isWs ? (Number(sub.hoursUsed || sub.sessionsUsed) || 0) : (Number(sub.sessionsUsed) || 0);
  const remaining = Math.max(0, parseFloat((total - used).toFixed(2)));

  const text = `تنبيه رصيد الباقة ⏳🔔
${g.dear}: ${g.titleShort} ${client.name}
من: ${orgName}

${g.informYou} بأن رصيدك المتبقي في باقة (${sub.packageName || 'الاشتراك'}):
📊 المتبقي: ${remaining} ${isWs ? 'ساعة' : 'حصة'} فقط.

${g.canYou} التجديد في أي وقت للاستمتاع بخدماتنا بدون انقطاع. ${g.weAreGladForYourPresence}! 🏢✨`;

  openWhatsApp(client.phone, text);
};

// 4. Session Check-Out Summary (Gender Aware)
export const sendSessionSummaryWhatsApp = (client, sessionInfo, systemInfo = {}) => {
  const orgName = systemInfo?.name || 'THE FIRST GROUP';
  const g = getGenderGrammar(client.gender);
  const text = `ملخص جلسة العمل 🏢⏱️
${g.isFemale ? 'المشتركة' : 'المشترك'}: ${g.titleShort} ${client.name}
من: ${orgName}
---------------------------------
المدة المستهلكة اليوم: ${sessionInfo.durationHours || 0} ساعة (${sessionInfo.durationMinutes || 0} دقيقة)
الرصيد المتبقي ${g.toYou}: ${sessionInfo.remainingHours || 0} ساعة
---------------------------------
شكراً لزيارتك، ${g.weLookForwardToSeeingYou}! 👋✨`;

  openWhatsApp(client.phone, text);
};
