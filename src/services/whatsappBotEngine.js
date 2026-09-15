// WhatsApp Bot Intelligence & Auto-Responder Engine for THE FIRST GROUP

import { formatCurrency } from '../utils/constants';

// Helper to normalize Arabic strings
export const normalizeArabic = (text = '') => {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[ًٌٍَُِّْ]/g, '')
    .replace(/\s+/g, ' ');
};

/**
 * Process an incoming WhatsApp message and generate the smart automated response
 */
export const processWhatsAppMessage = ({
  message = '',
  courseSchedules = [],
  packages = [],
  subscriptions = [],
  botSettings = {},
  systemInfo = {}
}) => {
  // Check if bot is enabled
  if (botSettings?.enabled === false) {
    return null;
  }

  const raw = String(message || '').trim();
  const q = normalizeArabic(raw);
  const orgName = systemInfo?.name || 'THE FIRST GROUP';

  const welcomeText = botSettings?.welcomeMessage || `مرحباً بك في ${orgName} 🏢✨
مساحة العمل وسنتر التدريب المتكامل بسوهاج 🚀

يمكنك الرد برقم الخدمة أو كتابة استفسارك مباشرة:
1️⃣ باقات وساعات مساحة العمل والمذاكرة (Work Space).
2️⃣ مواعيد وأسعار كورسات اللغات والبرمجة الحالية.
3️⃣ حجز غرفة الاجتماعات الخاصة (Meeting Room).
4️⃣ العنوان واللوكيشن ومواعيد العمل اليومية.
5️⃣ التحدث مع خدمة العملاء مباشرة.`;

  const closingText = botSettings?.closingMessage || `📍 العنوان: ${botSettings?.locationAddress || 'سوهاج - [العنوان بالتفصيل]'}
⏰ مواعيد العمل: ${botSettings?.workingHours || 'يومياً من 9:00 صباحاً حتى 11:00 مساءً'}
📞 نسعد دائماً بخدمتكم في ${orgName}! 🏢🌟`;

  // 1. Menu & Greetings
  if (
    !q ||
    q === '1' || q === '١' ||
    q === '2' || q === '٢' ||
    q === '3' || q === '٣' ||
    q === '4' || q === '٤' ||
    q === '5' || q === '٥' ||
    q.includes('السلام عليكم') || q.includes('سلام عليكم') || q.includes('مرحبا') || q.includes('اهلين') ||
    q.includes('صباح الخير') || q.includes('مساء الخير') || q.includes('هاي') || q.includes('hello') ||
    q.includes('hi') || q.includes('قائمه') || q.includes('منيو') || q.includes('menu') || q.includes('اوامر')
  ) {
    // Number Selection Handling
    if (q === '1' || q === '١') {
      return getWorkspacePackagesReply(packages, orgName, closingText);
    }
    if (q === '2' || q === '٢') {
      return getAllCoursesScheduleReply(courseSchedules, orgName, closingText);
    }
    if (q === '3' || q === '٣') {
      return getMeetingRoomReply(orgName, closingText);
    }
    if (q === '4' || q === '٤') {
      return getLocationAndHoursReply(botSettings, orgName);
    }
    if (q === '5' || q === '٥') {
      return `👨‍💼 **خدمة العملاء والدعم المباشر:**\n\nتم تحويل رسالتك إلى موظف الاستقبال في ${orgName}، وسيقوم بالرد والتواصل معك خلال لحظات.\n\n${closingText}`;
    }

    return `${welcomeText}\n\n${closingText}`;
  }

  // 2. Course Specific Queries (Smart Timetable Lookup)
  // Check if asking about specific course or general courses
  const isEnglishQuery = q.includes('انجليزي') || q.includes('انجلش') || q.includes('english') || q.includes('محادثه') || q.includes('توفل') || q.includes('ايلتس');
  const isGermanQuery = q.includes('الماني') || q.includes('deutsch') || q.includes('german') || q.includes('a1') || q.includes('a2') || q.includes('b1');
  const isProgrammingQuery = q.includes('برمجه') || q.includes('بايثون') || q.includes('ويب') || q.includes('frontend') || q.includes('fullstack') || q.includes('python') || q.includes('كود') || q.includes('coding');
  const isDesignQuery = q.includes('جرافيك') || q.includes('فوتوشوب') || q.includes('مونتاج') || q.includes('تصميم') || q.includes('design') || q.includes('photoshop');
  const isMedicalQuery = q.includes('طبي') || q.includes('طب') || q.includes('صيدله') || q.includes('فارما') || q.includes('تمريض') || q.includes('علوم');
  const isGeneralCourseQuery = q.includes('كورس') || q.includes('كورسات') || q.includes('دوره') || q.includes('دورات') || q.includes('مواعيد') || q.includes('جدول') || q.includes('ميعاد') || q.includes('محاضره');

  if (isEnglishQuery || isGermanQuery || isProgrammingQuery || isDesignQuery || isMedicalQuery || isGeneralCourseQuery) {
    let filtered = courseSchedules.filter(s => s.status !== 'cancelled');

    if (isEnglishQuery) {
      filtered = filtered.filter(s => normalizeArabic(s.courseName).includes('انجليزي') || normalizeArabic(s.courseName).includes('english') || normalizeArabic(s.courseName).includes('محادثه'));
    } else if (isGermanQuery) {
      filtered = filtered.filter(s => normalizeArabic(s.courseName).includes('الماني') || normalizeArabic(s.courseName).includes('deutsch') || normalizeArabic(s.courseName).includes('german'));
    } else if (isProgrammingQuery) {
      filtered = filtered.filter(s => normalizeArabic(s.courseName).includes('برمج') || normalizeArabic(s.courseName).includes('بايثون') || normalizeArabic(s.courseName).includes('ويب') || normalizeArabic(s.courseName).includes('python'));
    } else if (isDesignQuery) {
      filtered = filtered.filter(s => normalizeArabic(s.courseName).includes('جرافيك') || normalizeArabic(s.courseName).includes('تصميم') || normalizeArabic(s.courseName).includes('فوتوشوب') || normalizeArabic(s.courseName).includes('مونتاج'));
    } else if (isMedicalQuery) {
      filtered = filtered.filter(s => normalizeArabic(s.courseName).includes('طب') || normalizeArabic(s.courseName).includes('صيدل') || normalizeArabic(s.courseName).includes('فارما') || normalizeArabic(s.courseName).includes('ميكرو'));
    }

    if (filtered.length > 0) {
      let scheduleText = filtered.map((s, idx) => {
        const booked = (subscriptions || []).filter(sub => {
          if (sub.status === 'paused' || sub.status === 'expired') return false;
          if (sub.scheduleId && sub.scheduleId === s.id) return true;
          if (!sub.scheduleId && sub.packageName && s.courseName && sub.packageName.toLowerCase().includes(s.courseName.toLowerCase())) return true;
          return false;
        }).length;
        const dynAvailable = Math.max(0, (Number(s.totalSeats) || 15) - booked);
        const seatBadge = (dynAvailable <= 0 || s.status === 'full')
          ? '🔴 (العدد مكتمل حالياً)'
          : dynAvailable <= 3
            ? `🟡 (متبقي ${dynAvailable} مقاعد فقط - أوشك على الامتلاء)`
            : `🟢 (متاح للحجز - متبقي ${dynAvailable} مقاعد)`;

        return `📌 **${idx + 1}. ${s.courseName}**
👨‍🏫 المحاضر: ${s.instructorName || 'معتمد'}
📅 الأيام: **${s.days}**
⏰ الموعد: من **${s.startTime}** إلى **${s.endTime}**
🚪 المكان: ${s.room || 'قاعة التدريب'}
💰 السعر: **${formatCurrency(s.price || 0)}**
📊 حالة الحجز: ${seatBadge}`;
      }).join('\n\n');

      return `🎓 **جدول المواعيد المتاحة حالياً في ${orgName}:**\n\n${scheduleText}\n\n💡 **لحجز مقعدك وتأكيد الاشتراك:** يمكنك زيارة السنتر مباشرة أو الرد بـ «تأكيد حجز» وسيتم التواصل معك فوراً.\n\n${closingText}`;
    } else {
      return `🎓 **مواعيد الكورسات في ${orgName}:**\n\nحالياً جاري فتح وتنسيق مجموعات جديدة لهذا المجال. يمكنك ترك اسمك ورقم هاتفك وسيتم التواصل معك فور تأكيد جدول المواعيد القادم! ✨\n\n${closingText}`;
    }
  }

  // 3. Workspace / Study Space Queries
  if (
    q.includes('ساعات') || q.includes('ساعه') || q.includes('باقات') || q.includes('باقه') ||
    q.includes('ورك سبيس') || q.includes('مذاكره') || q.includes('اشتراك') || q.includes('اسعار') ||
    q.includes('سعر') || q.includes('داي باس') || q.includes('day pass') || q.includes('مكان شغل')
  ) {
    return getWorkspacePackagesReply(packages, orgName, closingText);
  }

  // 4. Meeting Room Queries
  if (q.includes('ميتنج') || q.includes('اجتماع') || q.includes('اجتماعات') || q.includes('meeting') || q.includes('زووم') || q.includes('zoom') || q.includes('مقابله')) {
    return getMeetingRoomReply(orgName, closingText);
  }

  // 5. Location & Hours Queries
  if (q.includes('عنوان') || q.includes('فين') || q.includes('مكانكم') || q.includes('موقع') || q.includes('لوكيشن') || q.includes('location') || q.includes('شغالين لحد') || q.includes('مواعيد العمل') || q.includes('بتفتحوا')) {
    return getLocationAndHoursReply(botSettings, orgName);
  }

  // 6. Custom Rules Defined by Admin
  if (botSettings?.customRules && Array.isArray(botSettings.customRules)) {
    for (const rule of botSettings.customRules) {
      if (rule.keyword && q.includes(normalizeArabic(rule.keyword))) {
        return `${rule.reply}\n\n${closingText}`;
      }
    }
  }

  // 7. General Fallback
  return `أهلاً بك في ${orgName}! 🏢✨

شكراً لتواصلك معنا. لمساعدتك بشكل أدق، يمكنك الرد برقم الخدمة أو كتابة سؤالك مباشرة:
1️⃣ باقات مساحة العمل والمذاكرة (Work Space).
2️⃣ جدول مواعيد وأسعار الكورسات واللغات.
3️⃣ حجز غرفة الاجتماعات الخاصة (Meeting Room).
4️⃣ العنوان واللوكيشن ومواعيد العمل.
5️⃣ التحدث مع موظف الاستقبال.

${closingText}`;
};

// Sub-formatters
const getWorkspacePackagesReply = (packages = [], orgName, closingText) => {
  const wsPkgs = packages.filter(p => p.type === 'workspace' || !!p.totalHours);
  let listText = '';
  if (wsPkgs.length > 0) {
    listText = wsPkgs.map((p, idx) => {
      const hours = p.totalHours || p.sessions || '—';
      return `🔹 **${p.name}:** ${formatCurrency(p.price)} (${hours} ساعة مذاكرة وعمل)`;
    }).join('\n');
  } else {
    listText = `🔹 **تذكرة اليوم الكامل (Day Pass):** 40 ج.م (يوم كامل مفتوح)\n🔹 **باقة 30 ساعة:** 240 ج.م\n🔹 **باقة 60 ساعة (الأكثر طلباً ⭐):** 400 ج.م\n🔹 **باقة 100 ساعة:** 580 ج.م\n🔹 **الباقة الشهرية المفتوحة VIP:** 750 ج.م`;
  }

  return `🏢 **باقات مساحة العمل والمذاكرة في ${orgName}:**

${listText}

✨ **كافة الباقات تشمل:**
🌐 إنترنت فايبر فائق السرعة ومستقر بدون انقطاع.
❄️ تكييفات مركزية وهدوء تام للتركيز.
🔌 فيشة شاحن ومقاعد مريحة ومكاتب واسعة.
☕ كافيه يقدم كافة المشروبات.

${closingText}`;
};

const getAllCoursesScheduleReply = (courseSchedules = [], orgName, closingText) => {
  const activeSchedules = courseSchedules.filter(s => s.status !== 'cancelled');
  if (activeSchedules.length === 0) {
    return `🎓 **الكورسات والتدريب في ${orgName}:**\n\nنوفر كورسات لغات (ألماني وإنجليزي)، برمجة ومواقع، وتطبيقات الذكاء الاصطناعي، وجرافيك ديزاين.\n\nجاري تحديث جدول المواعيد للأسبوع الحالي. يمكنك كتابة اسم الكورس الذي ترغب به وسنوافيك بكافة تفاصيله فوراً! ✨\n\n${closingText}`;
  }

  const listText = activeSchedules.map((s, idx) => {
    return `📌 **${s.courseName}**\n• المواعيد: **${s.days}** (من ${s.startTime} إلى ${s.endTime})\n• السعر: **${formatCurrency(s.price || 0)}** (${s.availableSeats > 0 ? `🟢 متاح ${s.availableSeats} مقاعد` : '🔴 مكتمل'})`;
  }).join('\n\n');

  return `🎓 **جدول مواعيد الكورسات الحالية في ${orgName}:**\n\n${listText}\n\n${closingText}`;
};

const getMeetingRoomReply = (orgName, closingText) => {
  return `🚪 **غرفة الاجتماعات الخاصة (Private Meeting Room) في ${orgName}:**

مجهزة بالكامل للمقابلات الشخصية، اجتماعات العمل، واجتماعات زووم (Zoom) والدراسات العليا.

✨ **المواصفات:**
• السعة: تتسع من 4 إلى 8 أفراد براحة تامة.
• شاشة عرض سمارت ذكية Smart TV 4K.
• سبورة بيضاء تفاعلية Whiteboard.
• تكييف هواء مستقل وعازل للصوت وهدوء تام.
• إنترنت فايبر سريع لاتصالات الفيديو بدون تقطيع.

💰 **الأسعار:** 100 ج.م / للساعة (أو 320 ج.م لنصف يوم 4 ساعات).

${closingText}`;
};

const getLocationAndHoursReply = (botSettings = {}, orgName) => {
  const addr = botSettings?.locationAddress || 'سوهاج - [العنوان بالتفصيل]';
  const hours = botSettings?.workingHours || 'يومياً من 9:00 صباحاً حتى 11:00 مساءً طوال أيام الأسبوع';

  return `📍 **عنوان ومواعيد عمل ${orgName}:**

🏢 **المقر:** ${addr}
⏰ **مواعيد العمل:** ${hours}

🚗 **رابط الموقع على خرائط جوجل (Google Maps):**
https://maps.google.com

📞 نتشرف بزيارتكم في أي وقت! 🌟`;
};
