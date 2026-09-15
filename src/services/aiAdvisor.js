/**
 * THE FIRST GROUP — Ahmed (TFG AI Financial & Operational Advisor) 🤖✨
 * Named: "أحمد - TFG AI"
 * Provides role-based intelligence:
 * - Admin Mode: Full strategic, financial, profit, and debt audits.
 * - Employee Mode: Strictly hides confidential venue profits/expenses/salaries,
 *   while empowering staff with client renewal radars, package guides, and customer service.
 */

export const generateComprehensiveMetrics = ({ clients = [], subscriptions = [], shifts = [], packages = [], instructors = [], attendance = [], payments = [] }) => {
  // 1. Financial Aggregations (Admin Only)
  let totalRevenue = 0;
  let totalExpenses = 0;
  let expenseCategories = { salaries: 0, rent: 0, bills: 0, maintenance: 0, hospitality: 0, other: 0 };
  let instructorSettlementsPaid = 0;

  shifts.forEach(sh => {
    totalRevenue += Number(sh.totalRevenue) || 0;
    totalExpenses += Number(sh.totalExpenses) || 0;
    (sh.expenses || []).forEach(exp => {
      const type = exp.type || 'other';
      const amt = Number(exp.amount) || 0;
      if (expenseCategories[type] !== undefined) {
        expenseCategories[type] += amt;
      } else {
        expenseCategories.other += amt;
      }
      if (exp.isInstructorSettlement) {
        instructorSettlementsPaid += amt;
      }
    });
  });

  const netProfit = totalRevenue - totalExpenses;
  const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : 0;

    // 2. Client & Debt Analytics (Multi-Subscription Aware)
  let totalDebt = 0;
  let activeClientsCount = 0;
  let clientsWithDebt = [];

  clients.forEach(c => {
    const clientSubs = subscriptions.filter(s => s.clientId === c.id);
    const totalPkgPrice = clientSubs.length > 0
      ? clientSubs.reduce((sum, s) => sum + (Number(s.packagePrice) || 0), 0)
      : (Number(c.packagePrice) || 0);
    const paid = Number(c.totalPaid) || 0;
    const debt = Math.max(0, totalPkgPrice - paid);
    if (debt > 0) {
      totalDebt += debt;
      const pkgLabel = clientSubs.length > 1 ? `${clientSubs.length} باقات مشتركة` : (c.packageName || 'باقة تدريب');
      clientsWithDebt.push({ name: c.name, phone: c.phone, debt, packageName: pkgLabel });
    }
    if (c.status === 'active') activeClientsCount++;
  });

  // 3. Subscriptions & Churn Radar
  let expiringSoon = []; // Expiring in next 7 days / <=2 sessions
  let expiredCount = 0;
  let activeSubsCount = 0;
  let packagePopularity = {};

  subscriptions.forEach(sub => {
    if (sub.packageName) {
      packagePopularity[sub.packageName] = (packagePopularity[sub.packageName] || 0) + 1;
    }
    if (sub.status === 'active') activeSubsCount++;

    const isWs = sub.packageType === 'workspace';
    const total = isWs ? (Number(sub.totalHours || sub.packageSessions) || 0) : (Number(sub.packageSessions) || 0);
    const used = isWs ? (Number(sub.hoursUsed || sub.sessionsUsed) || 0) : (Number(sub.sessionsUsed) || 0);
    const remaining = Math.max(0, total - used);

    if (remaining === 0) {
      expiredCount++;
    } else if (remaining <= 2) {
      expiringSoon.push({
        clientName: sub.clientName,
        packageName: sub.packageName,
        remaining: isWs ? `${remaining} ساعة` : `${remaining} حصص`,
        phone: sub.clientPhone
      });
    }
  });

  // 4. Instructor Performance
  let instructorStats = {};
  instructors.forEach(inst => {
    instructorStats[inst.name] = {
      name: inst.name,
      subject: inst.subject,
      studentCount: 0,
      totalCourseRevenue: 0,
      totalInstructorShare: 0,
      unsettledShare: 0
    };
  });

  subscriptions.forEach(sub => {
    const instName = sub.instructorName;
    if (instName && instructorStats[instName]) {
      const stat = instructorStats[instName];
      stat.studentCount++;
      const price = Number(sub.packagePrice) || 0;
      stat.totalCourseRevenue += price;

      let share = 0;
      if (sub.instructorShareType === 'fixed') {
        share = Number(sub.instructorShareValue) || 0;
      } else {
        share = (price * (Number(sub.instructorShareValue) || 0)) / 100;
      }
      stat.totalInstructorShare += share;
      if (!sub.instructorSettled) {
        stat.unsettledShare += share;
      }
    }
  });

  // 5. Most popular package
  let topPackage = 'باقات متنوعة';
  let maxPkgCount = 0;
  for (const [pkgName, count] of Object.entries(packagePopularity)) {
    if (count > maxPkgCount) {
      maxPkgCount = count;
      topPackage = `${pkgName} (${count} مشترك)`;
    }
  }

  // 6. Top instructor
  let topInstructor = 'مدرسين معتمدين';
  let maxInstStudents = 0;
  for (const stat of Object.values(instructorStats)) {
    if (stat.studentCount > maxInstStudents) {
      maxInstStudents = stat.studentCount;
      topInstructor = `الأستاذ ${stat.name} (${stat.studentCount} طالب)`;
    }
  }

  return {
    totalRevenue,
    totalExpenses,
    netProfit,
    profitMargin,
    expenseCategories,
    instructorSettlementsPaid,
    totalDebt,
    clientsWithDebt,
    activeClientsCount,
    activeSubsCount,
    expiringSoon,
    expiredCount,
    instructorStats: Object.values(instructorStats),
    topPackage,
    topInstructor,
    shiftsCount: shifts.length,
    clientsCount: clients.length,
    packages
  };
};

/**
 * Generate quick AI Report by Topic (with role check)
 */
export const generateAiReport = (topicKey, metrics, isEmployee = false) => {
  const formatCur = (val) => `${(Number(val) || 0).toLocaleString('ar-EG-u-nu-latn')} ج.م`;

  // EMPLOYEE REPORTS
  if (isEmployee) {
    switch (topicKey) {
      case 'employee_renewal_radar': {
        return {
          title: '👥 رادار متابعة وتجديد الطلاب (للاستقبال)',
          badge: metrics.expiringSoon.length > 0 ? `${metrics.expiringSoon.length} طالب للتجديد ⏳` : 'الاشتراكات منتظمة ✅',
          summary: `مرحباً يا زميلي! يوجد ${metrics.expiringSoon.length} طالب متبقي لهم حصتان أو أقل. عندما يحضر أي منهم للاستقبال، بادر بتذكيره بلطف لتجديد باقته قبل نفاد الرصيد.`,
          insights: [
            `👥 **إجمالي الطلاب النشطين بالمكان:** ${metrics.activeClientsCount} طالب`,
            `⏳ **طلاب بحاجة لتجديد الاشتراك قريباً:** ${metrics.expiringSoon.length} طالب`
          ],
          recommendations: [
            '👋 الترحيب بالطلاب بابتسامة عند فحص الـ QR وتذكيرهم بالرصيد المتبقي.',
            '📲 إرسال رسالة تذكير ودية عبر الواتساب للطلاب الذين أوشكت باقاتهم على الانتهاء.',
            '💡 شرح مزايا الباقات الجديدة للطلاب لترقية اشتراكهم.'
          ]
        };
      }

      case 'employee_packages_guide': {
        return {
          title: '📦 دليل باقات الكورسات والأسعار للاستقبال',
          badge: 'دليل خدمة العملاء 📚',
          summary: 'إليك قائمة بأحدث الباقات المعتمدة في النظام للإجابة على استفسارات الزوار والطلاب الجدد بدقة وسرعة:',
          insights: (metrics.packages || []).map(p => 
            `📦 **${p.name}**: ${p.price} ج.م (${p.type === 'workspace' ? `${p.hours || 0} ساعة` : `${p.sessions || 0} حصة`}) - صلاحية ${p.durationDays || 30} يوم`
          ),
          recommendations: [
            '🎯 عرض الباقة المناسبة لاحتياج الطالب (سواء كان يحتاج كورس دراسي أو مساحة عمل ومذاكرة).',
            '⏱️ توضيح فترة صلاحية الاشتراك (30 يوماً من تاريخ التفعيل).'
          ]
        };
      }

      case 'employee_hospitality_tips': {
        return {
          title: '🌟 دليل التميز في خدمة العملاء والاستقبال',
          badge: 'معايير THE FIRST GROUP ⭐',
          summary: 'مجموعة إرشادات احترافية لتقديم تجربة استثنائية لرواد المكان:',
          insights: [
            '1️⃣ **سرعة الترحيب وفحص الـ QR:** تسجيل حضور العضو بابتسامة فور دخوله.',
            '2️⃣ **جاهزية القاعات والتكييف:** التأكد من نظافة الغرف وتشغيل التكييف والإنترنت قبل بدء المحاضرات بـ 15 دقيقة.',
            '3️⃣ **اللباقة في حل المشكلات:** الاستماع لشكاوى الطلاب أو المدرسين بهدوء وحلها فوراً أو رفعها للإدارة.',
            '4️⃣ **دقة تسجيل المناوبة:** تسجيل أي تذكرة أو إيراد فوري بدقة على النظام دون تأخير.'
          ],
          recommendations: [
            '☕ تقديم الضيافة والمشروبات بجودة وسرعة.',
            '🧹 الحفاظ على الترتيب العام لمنطقة الاستقبال ومدخل المكان.'
          ]
        };
      }

      default:
        return null;
    }
  }

  // ADMIN REPORTS (Full Strategic & Financial Details)
  switch (topicKey) {
    case 'financial_audit': {
      const isPositive = metrics.netProfit >= 0;
      return {
        title: '📊 التقرير المالي والتشخيصي الشامل',
        badge: isPositive ? 'أداء مالي مستقر 🟢' : 'تنبيه: عجز مالي 🔴',
        summary: `حقق المكان إجمالي إيرادات بقيمة ${formatCur(metrics.totalRevenue)} مقابل مصروفات تشغيلية بقيمة ${formatCur(metrics.totalExpenses)}، مما ينتج صافي ربح ${formatCur(metrics.netProfit)} بهامش ربحية ${metrics.profitMargin}%.`,
        insights: [
          `💰 **إجمالي الإيرادات المحصلة:** ${formatCur(metrics.totalRevenue)}`,
          `📉 **إجمالي المصروفات:** ${formatCur(metrics.totalExpenses)} (منها ${formatCur(metrics.instructorSettlementsPaid)} مستحقات مدرسين مسددة)`,
          `📈 **صافي الأرباح:** ${formatCur(metrics.netProfit)} (هامش ربح ${metrics.profitMargin}%)`,
          `⚠️ **إجمالي مديونيات الأعضاء المعلقة:** ${formatCur(metrics.totalDebt)} عبر ${metrics.clientsWithDebt.length} عميل`
        ],
        recommendations: [
          metrics.totalDebt > 0 ? `🎯 يُوصى بتحصيل مديونيات الأعضاء المعلقة (${formatCur(metrics.totalDebt)}) لزيادة التدفق النقدي الفوري.` : '✅ لا توجد مديونيات معلقة لدى الأعضاء، معدل التحصيل ممتاز.',
          '💡 يُفضل ربط باقات الكورسات بنسب أرباح لا تقل عن 25-35% لصالح المكان لتغطية استهلاك القاعات والكهرباء والضيافة.',
          metrics.netProfit > 0 ? '🚀 الوضع المالي ممتاز، يُقترح إعادة استثمار جزء من الأرباح في إعلانات ممولة لجذب طلاب جدد.' : '⚠️ يُرجى مراجعة بنود المصروفات التشغيلية وضبط مواعيد الورديات.'
        ]
      };
    }

    case 'churn_radar': {
      return {
        title: '👥 رادار الطلاب ومعدل التجديد والاحتفاظ',
        badge: metrics.expiringSoon.length > 0 ? `${metrics.expiringSoon.length} اشتراك قارب على الانتهاء ⏳` : 'حالة الاشتراكات ممتازة ✅',
        summary: `يوجد حالياً ${metrics.activeSubsCount} اشتراك نشط. تم رصد ${metrics.expiringSoon.length} طالب تبقت لهم حصتان أو أقل ويحتاجون إلى متابعة للتجديد.`,
        insights: [
          `👥 **الطلاب النشطون:** ${metrics.activeClientsCount} طالب`,
          `⏳ **اشتراكات أوشكت على النفاد:** ${metrics.expiringSoon.length} طالب`,
          `❌ **اشتراكات منتهية:** ${metrics.expiredCount} اشتراك`
        ],
        studentsList: metrics.expiringSoon,
        recommendations: [
          '📲 توجيه موظفي الاستقبال بالتواصل مع الطلاب الذين اقتربت باقاتهم من النفاد لتقديم عرض تجديد سريع.',
          '🎁 تفعيل نظام الخصم للتجديد المبكر (Early Renewal Discount) بنسبة 5% لمن يجدد قبل انتهاء باقته الحالية.',
          '⭐ متابعة الطلاب المنقطعين واستطلاع آرائهم لتحسين جودة الكورسات ومساحة العمل.'
        ]
      };
    }

    case 'instructors_benchmark': {
      return {
        title: '👨‍🏫 تقييم ومقارنة أداء المدرسين والكورسات',
        badge: 'تحليل إنتاجية المحاضرين 🎓',
        summary: `الأعلى إقبالاً حالياً هو ${metrics.topInstructor}. إجمالي مستحقات المدرسين المسددة حتى الآن ${formatCur(metrics.instructorSettlementsPaid)}.`,
        insights: metrics.instructorStats.map(inst => 
          `👨‍🏫 **${inst.name}** (${inst.subject || 'مدرس'}): ${inst.studentCount} طالب | إجمالي إيراد الكورس: ${formatCur(inst.totalCourseRevenue)} | مستحقات معلقة: ${formatCur(inst.unsettledShare)}`
        ),
        recommendations: [
          `🌟 تكريم المدرسين الأكثر نشاطاً (${metrics.topInstructor}) ومنحهم أوقات قاعات مميزة في فترات الذروة.`,
          '🤝 مساعدة المدرسين الجدد في التسويق لكورساتهم من خلال عمل ورش عمل مجانية (Intro Workshops) لجذب المشتركين.',
          '⏱️ الحرص على تسوية مستحقات المدرسين أولاً بأول للحفاظ على ولائهم واستمرار كورساتهم في المكان.'
        ]
      };
    }

    case 'growth_forecast': {
      const estimatedNextMonth = Math.round(metrics.totalRevenue * 1.15);
      return {
        title: '🔮 توقعات النمو والإيرادات القادمة',
        badge: 'تنبؤات الذكاء الاصطناعي 📈',
        summary: `بناءً على وتيرة الاشتراكات الحالية والطلاب المسجلين، يتوقع TFG AI إمكانية الوصول إلى إيرادات شهرية مستهدفة بقيمة ${formatCur(estimatedNextMonth)} في حال تجديد 80% من الباقات القائمة.`,
        insights: [
          `🎯 **الإيراد المتوقع للشهر القادم:** ${formatCur(estimatedNextMonth)}`,
          `📦 **الباقة الأكثر طلباً:** ${metrics.topPackage}`,
          `👥 **حجم قاعدة الطلاب الحالية:** ${metrics.clientsCount} عضو`
        ],
        recommendations: [
          '🎯 إضافة باقات كورسات مكثفة ومساحات عمل شهرية مع ساعات إضافية مجانية.',
          '🤝 عمل عروض "ادعُ صديقك" (Referral Program) يمنح الطالب ساعة مجانية أو خصماً عند انضمام زميله.',
          '📺 استغلال فترات الهدوء الصباحية في تقديم باقات عمل أو كورسات بأسعار تشجيعية.'
        ]
      };
    }

    case 'marketing_ideas': {
      return {
        title: '💡 حزمة أفكار وعروض تسويقية مبتكرة للمكان',
        badge: 'استراتيجيات نمو مقترحة 🎁',
        summary: 'يقترح TFG AI تطبيق باقة من العروض التسويقية الذكية المصممة خصيصاً لطبيعة رواد The First Group:',
        insights: [
          '1️⃣ **عرض "باقة الامتحانات المكثفة":** باقة مخصصة لطلاب المدرسين تشمل ساعات استذكار مجانية قبل الحصص.',
          '2️⃣ **عرض "اشتراك الصباح الذهبي":** خصم 25% على مساحات العمل والمشروبات من الساعة 9 صباحاً حتى 2 ظهراً.',
          '3️⃣ **عرض "المجموعة / الفريق":** إذا اشترك 3 أصدقاء في نفس الكورس يحصل كل منهم على خصم 10% فوري.',
          '4️⃣ **برنامج بطاقات الولاء (TFG VIP):** يحصل العضو على نقطة لكل 50 ج.م ويستبدلها بمشروبات أو ساعات عمل.'
        ],
        recommendations: [
          '📢 نشر هذه العروض على صفحة المكان ومجموعات الواتساب الخاصة بالطلاب.',
          '🎨 وضع لافتات أنيقة داخل الاستقبال بتفاصيل العروض الجديدة.'
        ]
      };
    }

    default:
      return null;
  }
};

/**
 * Answer User Question (with strict privacy wall for employees)
 */
export const answerUserQuestion = (question, metrics, isEmployee = false) => {
  const q = (question || '').toLowerCase().trim();
  const formatCur = (val) => `${(Number(val) || 0).toLocaleString('ar-EG-u-nu-latn')} ج.م`;

  // PRIVACY WALL FOR EMPLOYEES: Intercept sensitive financial queries
  if (isEmployee) {
    if (
      q.includes('أرباح') || q.includes('ربح') || q.includes('ارباح') ||
      q.includes('مصروف') || q.includes('مصاريف') || q.includes('تكلفة') ||
      q.includes('مرتب') || q.includes('مرتبات') || q.includes('سلف') ||
      q.includes('صافي') || q.includes('إيراد المكان') || q.includes('دخل المكان') ||
      q.includes('مديونية') || q.includes('ديون')
    ) {
      return '🔒 **عذراً يا زميلي العزيز:**\n\nالبيانات المالية الشاملة، صافي أرباح المؤسسة، والمصروفات العامة هي صلاحية مخصصة ومحمية **للإدارة العليا فقط**.\n\nأنا **TFG AI**، ويمكنني بكل سرور مساعدتك في:\n- 👥 متابعة اشتراكات الطلاب والحصص المتبقية.\n- 📦 أسعار وتفاصيل باقات الكورسات ومساحة العمل.\n- 🌟 نصائح الاستقبال والتعامل مع العملاء.\n- 🔄 إجراءات فتح وإغلاق مناوبتك بنجاح! ✨';
    }
  }

  // 1.5 Questions about Capital, Partners & ROI / رأس المال والشركاء والعائد
  if (q.includes('رأس المال') || q.includes('راس المال') || q.includes('شركاء') || q.includes('شريك') || q.includes('استرداد') || q.includes('roi') || q.includes('نقطة التعادل')) {
    if (isEmployee) {
      return '🔒 تفاصيل رأس المال وحصص الشركاء مخصصة ومحمية للإدارة العليا فقط.';
    }
    return `💼 **تحليل رأس المال والعائد على الاستثمار (TFG Capital & ROI):**\n\n- 💰 **إجمالي رأس المال المستثمر:** مسجل في تبويب «رأس المال والشركاء»\n- 📈 **صافي الأرباح المحققة:** ${formatCur(metrics.netProfit)}\n- 🛡️ **جدار حماية السيولة:** يوفر السيستم فصلاً تلقائياً بين احتياطي التشغيل الإلزامي والأرباح القابلة للتوزيع على الشركاء.\n\n💡 **نصيحة TFG AI:** يمكنك فتح تبويب **«رأس المال والشركاء 💼»** لمتابعة نسبة استرداد الاستثمار (ROI)، توزيع حصص الشركاء الشهرية بنقرة زر، وطباعة سندات صرف الأرباح الرسمية! ✨`;
  }

  // 1. Questions about Debt / المديونيات (Admin only or generic)
  if (q.includes('مديونية') || q.includes('مديونيات') || q.includes('ديون') || q.includes('غير مدفوع') || q.includes('غير محصل')) {
    if (isEmployee) {
      return '🔒 تفاصيل المديونيات المالية الإجمالية خاصة بالإدارة فقط.';
    }
    if (metrics.totalDebt === 0) {
      return '🎉 **رائع جداً!** لا توجد أي مديونيات معلقة حالياً لدى أي من الأعضاء أو المشتركين، كافة الاشتراكات محصلة بالكامل.';
    }
    let listStr = metrics.clientsWithDebt.map((c, i) => `${i+1}. **${c.name}** (باقة: ${c.packageName}) -> مديونية: **${formatCur(c.debt)}**`).join('\n');
    return `⚠️ **تقرير المديونيات غير المحصلة:**\n\nإجمالي مديونيات الأعضاء المعلقة يبلغ **${formatCur(metrics.totalDebt)}** موزعة على (${metrics.clientsWithDebt.length}) عميل:\n\n${listStr}\n\n💡 **نصيحة TFG AI:** يُوصى بإرسال رسائل تذكير لطيفة عبر الواتساب لهؤلاء الأعضاء لتحصيل المبالغ قبل انتهاء فترات اشتراكهم.`;
  }

  // 2. Questions about Instructors / المدرسين
  if (q.includes('مدرس') || q.includes('مدرسين') || q.includes('محاضر') || q.includes('معلم') || q.includes('حصص')) {
    if (isEmployee) {
      let instList = metrics.instructorStats.map(inst => `👨‍🏫 **الأستاذ ${inst.name}** (${inst.subject || 'مدرس'}): مسجل معه **${inst.studentCount}** طالب`).join('\n');
      return `👨‍🏫 **قائمة المدرسين والكورسات الحالية:**\n\n${instList || 'لا توجد بيانات مدرسين مسجلة.'}\n\n💡 **نصيحة TFG AI:** عند حضور أي طالب يسأل عن مدرس معين، تأكد من تسجيله في الكورس المناسب من تبويب العملاء.`;
    }

    let instDetails = metrics.instructorStats.map(inst => 
      `👨‍🏫 **الأستاذ ${inst.name}** (${inst.subject || 'مدرس'}):\n- عدد الطلاب: ${inst.studentCount} طالب\n- إجمالي إيراد الكورس: ${formatCur(inst.totalCourseRevenue)}\n- مستحقات معلقة للمدرس: ${formatCur(inst.unsettledShare)}`
    ).join('\n\n');

    return `📊 **تحليل نشاط وحسابات المدرسين (للإدارة):**\n\nالأعلى نشاطاً وإقبالاً هو: **${metrics.topInstructor}**\n\n${instDetails || 'لا توجد بيانات مدرسين كافية حالياً.'}\n\n💡 **نصيحة TFG AI:** احرص دائماً على تسوية مستحقات المدرسين دورياً من خلال زر التسوية في شاشة المدرسين لضمان انتظام القيود المحاسبية.`;
  }

  // 3. Questions about Profits & Finances / الأرباح والماليات (Admin Only)
  if (q.includes('ربح') || q.includes('أرباح') || q.includes('مالي') || q.includes('إيراد') || q.includes('مصروف') || q.includes('خزنة') || q.includes('دخل')) {
    return `💰 **ملخص الموقف المالي للمكان (خاص بالإدارة):**\n\n- 💵 **إجمالي الإيرادات:** ${formatCur(metrics.totalRevenue)}\n- 📉 **إجمالي المصروفات:** ${formatCur(metrics.totalExpenses)}\n- 📈 **صافي الربح الفعلي:** ${formatCur(metrics.netProfit)}\n- 📊 **هامش الربحية:** ${metrics.profitMargin}%\n- 👨‍🏫 **مستحقات مدرسين مسددة:** ${formatCur(metrics.instructorSettlementsPaid)}\n\n💡 **نصيحة TFG AI:** ${metrics.netProfit >= 0 ? 'المكان يحقق صافي أرباح إيجابي، حافظ على نفس وتيرة ضبط المصروفات.' : 'يُرجى الانتباه ومراجعة بنود المصاريف لرفع هامش الربحية.'}`;
  }

  // 4. Questions about Clients / Subscriptions / الطلاب والاشتراكات
  if (q.includes('طالب') || q.includes('طلاب') || q.includes('عميل') || q.includes('أعضاء') || q.includes('اشتراك') || q.includes('باقة')) {
    return `👥 **تقرير الطلاب وقاعدة المشتركين:**\n\n- 🌟 **إجمالي الأعضاء المسجلين:** ${metrics.clientsCount} عضو\n- 🟢 **الاشتراكات النشطة:** ${metrics.activeSubsCount} اشتراك\n- 📦 **الباقة الأكثر طلباً:** ${metrics.topPackage}\n- ⏳ **اشتراكات أوشكت على النفاد:** ${metrics.expiringSoon.length} اشتراك\n\n💡 **نصيحة TFG AI:** ركز على تجديد باقات الطلاب الذين أوشكت حصصهم على الانتهاء لضمان استمرارية الإيراد.`;
  }

  // 5. Default Response
  if (isEmployee) {
    return '🤖 **أهلاً بك يا زميلي! أنا TFG AI 🌟**\n\nأنا هنا لمساعدتك في إنجاز مهامك اليومية:\n- 👥 متابعة الطلاب والتذكير بتجديد الباقات.\n- 📦 معرفة تفاصيل وأسعار باقات الكورسات ومساحات العمل.\n- 🌟 نصائح الاستقبال والضيافة للعملاء.\n\nاسألني أي سؤال في التشغيل وخدمة العملاء وسأجيبك فوراً! 🚀';
  }

  return `🤖 **مرحباً بك يا فندم! أنا TFG AI 🌟**\n\nإليك نظرة سريعة على أداء The First Group اليوم:\n\n- 💵 **صافي الأرباح:** ${formatCur(metrics.netProfit)} (إيرادات ${formatCur(metrics.totalRevenue)} مقابل مصروفات ${formatCur(metrics.totalExpenses)})\n- 👥 **الطلاب النشطون:** ${metrics.activeClientsCount} طالب\n- 📦 **الباقة الأكثر مبيعاً:** ${metrics.topPackage}\n- 👨‍🏫 **المدرس الأكثر إقبالاً:** ${metrics.topInstructor}\n- ⚠️ **المديونيات المعلقة:** ${formatCur(metrics.totalDebt)}\n\nيمكنك سؤالي عن أي تفاصيل محددة تتعلق بالمديونيات، حسابات المدرسين، الأرباح، أو طلب أفكار تسويقية جديدة! ✨`;
};
