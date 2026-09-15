// ============================================================================
// THE FIRST GROUP - Telegram Financial Bot Service
// Provides real-time financial stats, shift status, net profit, and revenues.
// ============================================================================

import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, getDocs, query, where, orderBy, doc, getDoc 
} from 'firebase/firestore';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8182872390:AAFN9csS7W3tB0z1z3HPv8yjlv9xMyYmNS0';
const AUTHORIZED_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '8060299797';

const firebaseConfig = {
  apiKey: "AIzaSyD5rfKKPwszn4MU_OXp6ffUbCgTZo0J_ak",
  authDomain: "the-first-group-co.firebaseapp.com",
  projectId: "the-first-group-co",
  storageBucket: "the-first-group-co.firebasestorage.app",
  messagingSenderId: "707174957075",
  appId: "1:707174957075:web:044529b7db0b2518243fe6",
  measurementId: "G-FQF7V4DVV9"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function formatCurrency(amount) {
  const n = Number(amount || 0);
  return `${n.toLocaleString('ar-EG-u-nu-latn', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ج.م`;
}

function parseDate(val) {
  if (!val) return null;
  if (val.toDate && typeof val.toDate === 'function') return val.toDate();
  if (val instanceof Date) return val;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function getLocalDateString(d = new Date()) {
  // Format as YYYY-MM-DD in Egypt timezone
  const formatter = new Intl.DateTimeFormat('en-CA', { 
    timeZone: 'Africa/Cairo', 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit' 
  });
  return formatter.format(d);
}

function getLocalMonthString(d = new Date()) {
  const str = getLocalDateString(d);
  return str.substring(0, 7); // YYYY-MM
}

function formatTime(d) {
  if (!d) return '—';
  return new Intl.DateTimeFormat('ar-EG', {
    timeZone: 'Africa/Cairo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(d);
}

// ============================================================================
// Financial Calculations Engine
// ============================================================================
async function getFinancialData() {
  const todayStr = getLocalDateString();
  const currentMonthStr = getLocalMonthString();

  const [
    shiftsSnap,
    paymentsSnap,
    ticketsSnap,
    adminRevsSnap,
    adminExpsSnap,
    salariesSnap,
    cafeShiftsSnap
  ] = await Promise.all([
    getDocs(collection(db, 'shifts')),
    getDocs(collection(db, 'payments')),
    getDocs(collection(db, 'ticket_sales')),
    getDocs(collection(db, 'admin_revenues')),
    getDocs(collection(db, 'admin_expenses')),
    getDocs(collection(db, 'salaries')),
    getDocs(collection(db, 'cafe_shifts')).catch(() => ({ docs: [] }))
  ]);

  const shifts = shiftsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const payments = paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => !p.isVoided);
  const tickets = ticketsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const adminRevs = adminRevsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => !r.isCafeTransfer && r.category !== 'cafe');
  const adminExps = adminExpsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const salaries = salariesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const cafeShifts = cafeShiftsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Helper date match
  const isToday = (dateVal) => {
    const d = parseDate(dateVal);
    return d ? getLocalDateString(d) === todayStr : false;
  };
  const isCurrentMonth = (dateVal) => {
    const d = parseDate(dateVal);
    return d ? getLocalMonthString(d) === currentMonthStr : false;
  };

  // 1. TODAY STATS
  const todayPayments = payments.filter(p => isToday(p.date));
  const todayPaymentsTotal = todayPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const todayTickets = tickets.filter(t => isToday(t.date));
  const todayTicketsTotal = todayTickets.reduce((s, t) => s + (Number(t.total) || (Number(t.quantity) * Number(t.ticketPrice)) || 0), 0);

  const todayAdminRevs = adminRevs.filter(r => isToday(r.date || r.createdAt));
  const todayAdminRevsTotal = todayAdminRevs.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const todayAdminExps = adminExps.filter(e => isToday(e.date || e.createdAt));
  const todayAdminExpsTotal = todayAdminExps.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  // Shift revenues & expenses today
  let todayShiftRevsTotal = 0;
  let todayShiftExpsTotal = 0;
  shifts.forEach(s => {
    if (isToday(s.openedAt) || s.status === 'open') {
      (s.revenues || []).forEach(r => {
        if (isToday(r.date || s.openedAt)) todayShiftRevsTotal += Number(r.amount || 0);
      });
      (s.expenses || []).forEach(e => {
        if (isToday(e.date || s.openedAt)) todayShiftExpsTotal += Number(e.amount || 0);
      });
    }
  });

  const todayTotalRevenue = todayPaymentsTotal + todayTicketsTotal + todayAdminRevsTotal + todayShiftRevsTotal;
  const todayTotalExpenses = todayAdminExpsTotal + todayShiftExpsTotal;
  const todayNetProfit = todayTotalRevenue - todayTotalExpenses;

  // 2. MONTH STATS
  const monthPayments = payments.filter(p => isCurrentMonth(p.date));
  const monthPaymentsTotal = monthPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const monthTickets = tickets.filter(t => isCurrentMonth(t.date));
  const monthTicketsTotal = monthTickets.reduce((s, t) => s + (Number(t.total) || (Number(t.quantity) * Number(t.ticketPrice)) || 0), 0);

  const monthAdminRevs = adminRevs.filter(r => isCurrentMonth(r.date || r.createdAt));
  const monthAdminRevsTotal = monthAdminRevs.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const monthAdminExps = adminExps.filter(e => isCurrentMonth(e.date || e.createdAt));
  const monthAdminExpsTotal = monthAdminExps.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  let monthShiftRevsTotal = 0;
  let monthShiftExpsTotal = 0;
  shifts.forEach(s => {
    if (isCurrentMonth(s.openedAt)) {
      (s.revenues || []).forEach(r => { monthShiftRevsTotal += Number(r.amount || 0); });
      (s.expenses || []).forEach(e => { monthShiftExpsTotal += Number(e.amount || 0); });
    }
  });

  const monthSalariesTotal = salaries.filter(sal => isCurrentMonth(sal.paidAt || sal.date || sal.month))
    .reduce((s, sal) => s + (Number(sal.net) || Number(sal.amount) || 0), 0);

  const monthCafeTotalRev = cafeShifts.filter(c => isCurrentMonth(c.openedAt))
    .reduce((s, c) => s + (Number(c.totalSales) || 0), 0);
  const monthCafeTotalExp = cafeShifts.filter(c => isCurrentMonth(c.openedAt))
    .reduce((s, c) => s + (Number(c.totalExpenses) || 0), 0);

  const monthTotalRevenue = monthPaymentsTotal + monthTicketsTotal + monthAdminRevsTotal + monthShiftRevsTotal + monthCafeTotalRev;
  const monthTotalExpenses = monthAdminExpsTotal + monthShiftExpsTotal + monthSalariesTotal + monthCafeTotalExp;
  const monthNetProfit = monthTotalRevenue - monthTotalExpenses;

  // 3. ACTIVE/OPEN SHIFT DETAILS
  const openShifts = shifts.filter(s => s.status === 'open');
  const activeShift = openShifts.length > 0 ? openShifts[0] : null;

  return {
    todayStr,
    currentMonthStr,
    today: {
      totalRevenue: todayTotalRevenue,
      totalExpenses: todayTotalExpenses,
      netProfit: todayNetProfit,
      paymentsCount: todayPayments.length,
      paymentsTotal: todayPaymentsTotal,
      ticketsCount: todayTickets.length,
      ticketsTotal: todayTicketsTotal,
      shiftRevsTotal: todayShiftRevsTotal,
      adminRevsTotal: todayAdminRevsTotal,
      shiftExpsTotal: todayShiftExpsTotal,
      adminExpsTotal: todayAdminExpsTotal
    },
    month: {
      totalRevenue: monthTotalRevenue,
      totalExpenses: monthTotalExpenses,
      netProfit: monthNetProfit,
      paymentsTotal: monthPaymentsTotal,
      ticketsTotal: monthTicketsTotal,
      salariesTotal: monthSalariesTotal,
      adminExpsTotal: monthAdminExpsTotal,
      shiftExpsTotal: monthShiftExpsTotal
    },
    activeShift
  };
}

async function getLastClosedShiftAudit() {
  const shiftsSnap = await getDocs(collection(db, 'shifts'));
  const closedShifts = shiftsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(s => s.status === 'closed')
    .sort((a, b) => {
      const da = parseDate(a.closedAt || a.updatedAt) || 0;
      const db = parseDate(b.closedAt || b.updatedAt) || 0;
      return db - da;
    });

  if (closedShifts.length === 0) {
    return `<b>⚠️ لا توجد أي مناوبات مغلقة مسجلة في قاعدة البيانات حتى الآن.</b>`;
  }

  const s = closedShifts[0];

  let paymentsCash = 0;
  let paymentsDigital = 0;
  let paymentsCount = 0;
  let ticketsCash = 0;
  let ticketsDigital = 0;
  let ticketsCount = 0;

  try {
    const [paymentsSnap, ticketsSnap] = await Promise.all([
      getDocs(query(collection(db, 'payments'), where('shiftId', '==', s.id))),
      getDocs(query(collection(db, 'ticket_sales'), where('shiftId', '==', s.id))).catch(() => ({ docs: [] }))
    ]);

    paymentsSnap.docs.forEach(d => {
      const p = d.data();
      if (p.isVoided) return;
      const amt = Number(p.amount) || 0;
      const method = (p.paymentMethod || 'cash').toLowerCase().trim();
      const isCash = method === 'cash' || method === 'نقدي' || !p.paymentMethod;
      if (isCash) paymentsCash += amt;
      else paymentsDigital += amt;
      paymentsCount++;
    });

    ticketsSnap.docs.forEach(d => {
      const t = d.data();
      const amt = Number(t.total) || (Number(t.quantity) * Number(t.ticketPrice)) || 0;
      const method = (t.paymentMethod || 'cash').toLowerCase().trim();
      const isCash = method === 'cash' || method === 'نقدي' || !t.paymentMethod;
      if (isCash) ticketsCash += amt;
      else ticketsDigital += amt;
      ticketsCount++;
    });
  } catch (err) {
    console.warn('Error fetching shift details in bot:', err);
  }

  const shiftRevs = s.revenues || [];
  const shiftExps = s.expenses || [];
  const shiftRevsTotal = shiftRevs.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const shiftExpsTotal = shiftExps.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  const totalIncome = paymentsCash + paymentsDigital + ticketsCash + ticketsDigital + shiftRevsTotal;
  const cashIncome = paymentsCash + ticketsCash + shiftRevsTotal;
  const digitalIncome = paymentsDigital + ticketsDigital;

  const startTime = parseDate(s.openedAt || s.startTime || s.createdAt);
  const endTime = parseDate(s.closedAt || s.updatedAt);

  let durationText = '';
  if (startTime && endTime) {
    const diffMs = Math.max(0, endTime.getTime() - startTime.getTime());
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    durationText = `${hours} س و ${mins} د`;
  }

  const expCash = Number(s.expectedCash != null ? s.expectedCash : (cashIncome - shiftExpsTotal));
  const actCash = Number(s.actualCash != null ? s.actualCash : expCash);
  const diff = Number(s.cashDifference != null ? s.cashDifference : (actCash - expCash));

  let verdictIcon = '🟢';
  let verdictText = 'مطابقة تامة 100% (الخزينة متزنة بالمليم)';
  if (diff < 0) {
    verdictIcon = '🔴';
    verdictText = `عجز نقدي في الدرج بمقدار (${formatCurrency(Math.abs(diff))})`;
  } else if (diff > 0) {
    verdictIcon = '🟡';
    verdictText = `فائض نقدي زيادة في الدرج بمقدار (+${formatCurrency(diff)})`;
  }

  let expensesListText = '';
  if (shiftExps.length > 0) {
    expensesListText = shiftExps.map(e => `  • ${e.label || e.type || 'بند مصروف'}: <b>${formatCurrency(e.amount)}</b>${e.note ? ` <i>(${e.note})</i>` : ''}`).join('\n');
  } else {
    expensesListText = '  <i>لا توجد مصروفات مسجلة خلال هذه الوردية.</i>';
  }

  const notesBlock = s.handoverNotes ? `\n📝 <b>ملاحظات التسليم:</b> <i>${s.handoverNotes}</i>\n` : '';

  return `<b>🔒 تقرير تدقيق آخر وردية مغلقة (Last Shift Audit)</b>
━━━━━━━━━━━━━━━━━
👤 <b>الكاشير:</b> <b>${s.closedByEmployee || s.employeeName || 'الاستقبال'}</b>
📥 <b>المستلم:</b> ${s.receivedBy || 'الإدارة'}
🔖 <b>كود الوردية:</b> <code>${s.id}</code>
⏰ <b>الفترة:</b> من ${formatTime(startTime)} إلى ${formatTime(endTime)} ${durationText ? `(${durationText})` : ''}
━━━━━━━━━━━━━━━━━
💰 <b>إجمالي التحصيل والمبيعات:</b> <b>${formatCurrency(totalIncome)}</b>
  ├─ 💵 نقدي (Cash): <b>${formatCurrency(cashIncome)}</b>
  └─ 💳 إلكتروني (فودافون/إنستاباي): <b>${formatCurrency(digitalIncome)}</b>

📋 <b>تفاصيل العمليات:</b>
  • اشتراكات وباقات: ${formatCurrency(paymentsCash + paymentsDigital)} (${paymentsCount} عملية)
  • تذاكر وزيارات: ${formatCurrency(ticketsCash + ticketsDigital)} (${ticketsCount} تذكرة)
  ${shiftRevsTotal > 0 ? `• إيرادات إضافية للوردية: ${formatCurrency(shiftRevsTotal)}\n` : ''}━━━━━━━━━━━━━━━━━
📉 <b>مصروفات ونثريات الوردية (${formatCurrency(shiftExpsTotal)}):</b>
${expensesListText}
━━━━━━━━━━━━━━━━━
🔐 <b>ميزان تسليم الخزينة والجرد:</b>
  • النقدية المفترضة بالدرج: <b>${formatCurrency(expCash)}</b>
  • النقدية الفعلية المسلمة: <b>${formatCurrency(actCash)}</b>
  • الفارق: <b>${diff > 0 ? '+' : ''}${formatCurrency(diff)}</b>

${verdictIcon} <b>النتيجة:</b> <b>${verdictText}</b>
${notesBlock}━━━━━━━━━━━━━━━━━
🔒 <i>سجل التدقيق الرقمي - THE FIRST GROUP</i>`;
}

// ============================================================================
// Telegram Message Handlers
// ============================================================================
const KEYBOARD = {
  keyboard: [
    [{ text: '📊 تقرير اليوم الشامل' }, { text: '💰 صافي الإيراد والأرباح' }],
    [{ text: '🕒 الخزينة والمناوبة الحالية' }, { text: '🔒 تقرير آخر إقفال وردية' }],
    [{ text: '☕ هوامش أرباح الكافيه' }, { text: '📦 نواقص المخزون والتنبيهات' }],
    [{ text: '📈 إجمالي الإيرادات' }, { text: '📉 إجمالي المصروفات' }],
    [{ text: '👥 حضور اليوم والموظفين' }, { text: '📅 تقرير الشهر الحالي' }]
  ],
  resize_keyboard: true,
  is_persistent: true
};

async function sendTelegramMessage(chatId, text, extra = {}) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    ...extra
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch (err) {
    console.error('Failed to send Telegram message:', err);
  }
}

async function handleMessage(msg) {
  const chatId = String(msg.chat.id);
  const text = (msg.text || '').trim();

  // Strict Authorization: Only allow the owner/admin
  if (chatId !== AUTHORIZED_CHAT_ID) {
    await sendTelegramMessage(chatId, '⛔ <b>عذراً، هذا البوت خاص بإدارة THE FIRST GROUP فقط.</b>');
    return;
  }

  const normalized = text.toLowerCase();

  // 1. WELCOME / START
  if (normalized === '/start' || normalized === 'مرحبا' || normalized === 'هلا' || normalized === 'اهلا') {
    const welcome = `<b>أهلاً بك يا فندم في المساعد المالي لإدارة THE FIRST GROUP 🏋️‍♂️</b>

اختر من الأزرار بالأسفل لعرض أي تفاصيل مالية في نفس اللحظة مباشرة من السيستم:`;
    await sendTelegramMessage(chatId, welcome, { reply_markup: KEYBOARD });
    return;
  }

  // 2. NET PROFIT / صافي الإيراد والأرباح
  if (normalized.includes('صافي') || normalized.includes('ارباح') || normalized.includes('أرباح') || normalized === '/net') {
    const data = await getFinancialData();
    const reply = `<b>💰 تقرير صافي الإيرادات والأرباح:</b>
━━━━━━━━━━━━━━━━━
<b>• صافي إيراد اليوم (${data.todayStr}):</b>
  💵 <code>${formatCurrency(data.today.netProfit)}</code>
  <i>(إيراد: ${formatCurrency(data.today.totalRevenue)} - مصاريف: ${formatCurrency(data.today.totalExpenses)})</i>

━━━━━━━━━━━━━━━━━
<b>• صافي أرباح الشهر الحالي (${data.currentMonthStr}):</b>
  🏆 <code>${formatCurrency(data.month.netProfit)}</code>
  <i>(إجمالي إيراد الشهر: ${formatCurrency(data.month.totalRevenue)})</i>
  <i>(إجمالي مصاريف الشهر: ${formatCurrency(data.month.totalExpenses)})</i>
━━━━━━━━━━━━━━━━━
🔒 <i>بيانات حية مباشرة من قاعدة بيانات الصالة</i>`;
    await sendTelegramMessage(chatId, reply, { reply_markup: KEYBOARD });
    return;
  }

  // 3. TOTAL REVENUES / إجمالي الإيرادات
  if (normalized.includes('ايراد') || normalized.includes('إيراد') || normalized === '/revenue') {
    const data = await getFinancialData();
    const reply = `<b>📈 إجمالي الإيرادات:</b>
━━━━━━━━━━━━━━━━━
<b>• إيرادات اليوم (${data.todayStr}):</b>
  💵 <b>الإجمالي:</b> <code>${formatCurrency(data.today.totalRevenue)}</code>
  - الاشتراكات: ${formatCurrency(data.today.paymentsTotal)} (${data.today.paymentsCount} عملية)
  - التذاكر واليومي: ${formatCurrency(data.today.ticketsTotal)}
  - إيرادات أخرى للمناوبات: ${formatCurrency(data.today.shiftRevsTotal)}

━━━━━━━━━━━━━━━━━
<b>• إجمالي إيرادات الشهر (${data.currentMonthStr}):</b>
  🏆 <b>الإجمالي:</b> <code>${formatCurrency(data.month.totalRevenue)}</code>
  - الاشتراكات والباقات: ${formatCurrency(data.month.paymentsTotal)}
  - التذاكر والأنشطة: ${formatCurrency(data.month.ticketsTotal)}
━━━━━━━━━━━━━━━━━`;
    await sendTelegramMessage(chatId, reply, { reply_markup: KEYBOARD });
    return;
  }

  // 4. TOTAL EXPENSES / إجمالي المصروفات
  if (normalized.includes('مصر') || normalized.includes('مصاريف') || normalized === '/expenses') {
    const data = await getFinancialData();
    const reply = `<b>📉 إجمالي المصروفات:</b>
━━━━━━━━━━━━━━━━━
<b>• مصروفات اليوم (${data.todayStr}):</b>
  💸 <b>الإجمالي:</b> <code>${formatCurrency(data.today.totalExpenses)}</code>
  - مصروفات المناوبات: ${formatCurrency(data.today.shiftExpsTotal)}
  - مصروفات إدارية: ${formatCurrency(data.today.adminExpsTotal)}

━━━━━━━━━━━━━━━━━
<b>• مصروفات الشهر (${data.currentMonthStr}):</b>
  💸 <b>الإجمالي:</b> <code>${formatCurrency(data.month.totalExpenses)}</code>
  - مصروفات التشغيل والشيفتات: ${formatCurrency(data.month.shiftExpsTotal)}
  - مصروفات الإدارة والعقود: ${formatCurrency(data.month.adminExpsTotal)}
  - الرواتب والمسحوبات: ${formatCurrency(data.month.salariesTotal)}
━━━━━━━━━━━━━━━━━`;
    await sendTelegramMessage(chatId, reply, { reply_markup: KEYBOARD });
    return;
  }

  // 5. ACTIVE SHIFT & DRAWER / الخزينة والمناوبة الحالية
  if (normalized.includes('خزن') || (normalized.includes('مناوبة') && !normalized.includes('اخر') && !normalized.includes('آخر') && !normalized.includes('اقفال') && !normalized.includes('إقفال')) || (normalized.includes('شفت') && !normalized.includes('اخر') && !normalized.includes('آخر')) || normalized === '/shift') {
    const data = await getFinancialData();
    if (!data.activeShift) {
      const auditMsg = await getLastClosedShiftAudit();
      const reply = `<b>🕒 الخزينة والمناوبات:</b>
━━━━━━━━━━━━━━━━━
ℹ️ <b>لا توجد أي مناوبة مفتوحة حالياً في الصالة (جميع المناوبات السابقة مغلقة).</b>
إليك تقرير تدقيق آخر وردية تم إقفالها:

${auditMsg}`;
      await sendTelegramMessage(chatId, reply, { reply_markup: KEYBOARD });
      return;
    }

    const s = data.activeShift;
    const openedTime = parseDate(s.openedAt);
    const rev = Number(s.totalRevenue || 0);
    const exp = Number(s.totalExpenses || 0);
    const drawer = Number(s.drawerCash != null ? s.drawerCash : rev - exp);

    const reply = `<b>🕒 تفاصيل المناوبة النشطة حالياً:</b>
━━━━━━━━━━━━━━━━━
<b>• الموظف المسئول:</b> 👤 <b>${s.employeeName || 'غير محدد'}</b>
<b>• وقت الفتح:</b> ⏰ ${formatTime(openedTime)}
<b>• رقم المناوبة:</b> <code>${s.id}</code>
─────────────────
<b>• إيراد المناوبة الحالي:</b> ${formatCurrency(rev)}
<b>• مصروفات المناوبة:</b> ${formatCurrency(exp)}
<b>• الدرج المتوقع (نقدية بالخزينة):</b>
  💵 <code>${formatCurrency(drawer)}</code>
━━━━━━━━━━━━━━━━━
🔒 <i>المناوبة ما زالت قيد العمل</i>

💡 <i>يمكنك الضغط على <b>[🔒 تقرير آخر إقفال وردية]</b> أو كتابة /lastshift لمراجعة تقرير جرد الوردية السابقة.</i>`;
    await sendTelegramMessage(chatId, reply, { reply_markup: KEYBOARD });
    return;
  }

  // 5.5 LAST CLOSED SHIFT AUDIT / تقرير آخر إقفال وردية
  if (normalized.includes('اقفال') || normalized.includes('إقفال') || normalized.includes('اخر وردية') || normalized.includes('آخر وردية') || normalized.includes('جرد') || normalized === '/lastshift' || normalized === '/closedshift') {
    const auditMsg = await getLastClosedShiftAudit();
    await sendTelegramMessage(chatId, auditMsg, { reply_markup: KEYBOARD });
    return;
  }

  // 6. TODAY SUMMARY / تقرير اليوم الشامل
  if (normalized.includes('اليوم') || normalized === '/today') {
    const data = await getFinancialData();
    const reply = `<b>📊 تقرير اليوم الشامل (${data.todayStr}):</b>
━━━━━━━━━━━━━━━━━
<b>• إجمالي الإيرادات اليوم:</b> ${formatCurrency(data.today.totalRevenue)}
<b>• إجمالي المصروفات اليوم:</b> ${formatCurrency(data.today.totalExpenses)}
─────────────────
<b>• صافي إيراد اليوم:</b>
  💰 <code>${formatCurrency(data.today.netProfit)}</code>
─────────────────
<b>• تفاصيل العمليات:</b>
  - عدد الاشتراكات المسجلة اليوم: <b>${data.today.paymentsCount}</b>
  - إجمالي مبالغ الاشتراكات: <b>${formatCurrency(data.today.paymentsTotal)}</b>
  - إيراد التذاكر: <b>${formatCurrency(data.today.ticketsTotal)}</b>
─────────────────
<b>• حالة الشفت الحالي:</b> ${data.activeShift ? `مفتوح بواسطة (<b>${data.activeShift.employeeName}</b>)` : 'لا توجد مناوبة مفتوحة'}
━━━━━━━━━━━━━━━━━
🔒 <i>THE FIRST GROUP Management System</i>`;
    await sendTelegramMessage(chatId, reply, { reply_markup: KEYBOARD });
    return;
  }

  // 7. MONTH SUMMARY / تقرير الشهر
  if (normalized.includes('شهر') || normalized === '/month') {
    const data = await getFinancialData();
    const reply = `<b>📅 تقرير الشهر الحالي (${data.currentMonthStr}):</b>
━━━━━━━━━━━━━━━━━
<b>• إجمالي الإيرادات:</b> ${formatCurrency(data.month.totalRevenue)}
<b>• إجمالي المصروفات:</b> ${formatCurrency(data.month.totalExpenses)}
─────────────────
<b>• صافي أرباح الشهر:</b>
  🏆 <code>${formatCurrency(data.month.netProfit)}</code>
─────────────────
<b>• تفاصيل الإيراد:</b>
  - اشتراكات وباقات: ${formatCurrency(data.month.paymentsTotal)}
  - تذاكر فردية: ${formatCurrency(data.month.ticketsTotal)}
<b>• تفاصيل المصاريف:</b>
  - مصاريف الشيفتات: ${formatCurrency(data.month.shiftExpsTotal)}
  - مصاريف إدارية: ${formatCurrency(data.month.adminExpsTotal)}
  - رواتب ومسحوبات: ${formatCurrency(data.month.salariesTotal)}
━━━━━━━━━━━━━━━━━`;
    await sendTelegramMessage(chatId, reply, { reply_markup: KEYBOARD });
    return;
  }

  // 8. ATTENDANCE & EMPLOYEES ON DUTY / الحضور والموظفين المداومين
  if (normalized.includes('حضور') || normalized.includes('مداوم') || normalized.includes('شغال') || normalized === '/attendance') {
    const todayStr = getLocalDateString();
    const [shiftsSnap, attSnap] = await Promise.all([
      getDocs(collection(db, 'shifts')),
      getDocs(collection(db, 'attendance'))
    ]);

    const activeShifts = shiftsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.status === 'open');
    const todayAtt = attSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(a => a.date === todayStr);

    let activeEmpText = '';
    if (activeShifts.length > 0) {
      activeEmpText = activeShifts.map(s => {
        const time = formatTime(parseDate(s.openedAt));
        return `• 👤 <b>${s.employeeName || 'غير محدد'}</b> (مناوبة مفتوحة منذ: ${time})`;
      }).join('\n');
    } else {
      activeEmpText = '<i>لا توجد مناوبات مفتوحة حالياً.</i>';
    }

    let attText = '';
    if (todayAtt.length > 0) {
      attText = todayAtt.map(a => {
        const inTime = formatTime(parseDate(a.checkIn));
        const outTime = a.checkOut ? formatTime(parseDate(a.checkOut)) : 'مستمر حتى الآن';
        return `• 👤 <b>${a.employeeName || a.memberId}</b> (دخول: ${inTime} | انصراف: ${outTime})`;
      }).join('\n');
    } else {
      attText = '<i>لم يسجل أي موظف في دفتر الحضور الرقمي اليوم بعد.</i>';
    }

    const reply = `<b>👥 تقرير الحضور والشيفتات اليوم (${todayStr}):</b>
━━━━━━━━━━━━━━━━━
<b>🏢 الموظفون المداومون على الشيفت الآن:</b>
${activeEmpText}

━━━━━━━━━━━━━━━━━
<b>📋 سجل الحضور والانصراف الرقمي:</b>
${attText}
━━━━━━━━━━━━━━━━━
🔒 <i>THE FIRST GROUP Management System</i>`;
    await sendTelegramMessage(chatId, reply, { reply_markup: KEYBOARD });
    return;
  }

  // 9. LOW STOCK & INVENTORY / نواقص المخزون
  if (normalized.includes('مخزون') || normalized.includes('نواقص') || normalized === '/stock' || normalized === '/inventory') {
    const invSnap = await getDocs(collection(db, 'inventory'));
    const items = invSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const lowItems = items.filter(i => {
      const q = Number(i.quantity) || 0;
      const alertThreshold = Number(i.minQuantityAlert) || 5;
      return q <= alertThreshold;
    });

    if (lowItems.length === 0) {
      const reply = `<b>✅ حالة المخزون ممتازة (All Stock Normal):</b>
━━━━━━━━━━━━━━━━━
جميع أصناف الكافيه والمخزون متوفرة حالياً وبأرصدة كافية أعلى من حدود الأمان.
• إجمالي الأصناف المسجلة: <b>${items.length}</b> صنف.
━━━━━━━━━━━━━━━━━
🔒 <i>THE FIRST GROUP Management System</i>`;
      await sendTelegramMessage(chatId, reply, { reply_markup: KEYBOARD });
      return;
    }

    const itemsList = lowItems.map(i => {
      const q = Number(i.quantity) || 0;
      const min = Number(i.minQuantityAlert) || 5;
      const unit = i.unit || 'قطعة';
      const statusIcon = q === 0 ? '⛔ <b>(نفد تماماً)</b>' : '⚠️ <b>(حرج)</b>';
      return `• 📦 <b>${i.name}</b>: متبقي <code>${q}</code> ${unit} ${statusIcon} [حد الأمان: ${min}]`;
    }).join('\n');

    const reply = `<b>⚠️ تقرير نواقص المخزون الحرج (${lowItems.length} صنف):</b>
━━━━━━━━━━━━━━━━━
${itemsList}
━━━━━━━━━━━━━━━━━
🛒 <i>يرجى التوجيه بشراء وتوريد الأصناف لتفادي نفادها في الكافيه.</i>`;
    await sendTelegramMessage(chatId, reply, { reply_markup: KEYBOARD });
    return;
  }

  // 10. CAFE PROFIT MARGIN & COGS / هوامش أرباح الكافيه والمنيو
  if (normalized.includes('هامش') || normalized.includes('ربحية') || (normalized.includes('كافيه') && normalized.includes('ربح')) || normalized === '/margin' || normalized === '/cogs' || normalized === '/profit') {
    const invSnap = await getDocs(collection(db, 'inventory'));
    const items = invSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    let totalCost = 0;
    let totalRetail = 0;

    const itemsWithProfit = items.map(item => {
      const cost = Number(item.costPrice) || 0;
      const price = Number(item.unitPrice) || 0;
      const profit = price - cost;
      const margin = price > 0 ? Math.round((profit / price) * 100) : 0;
      const qty = Number(item.quantity) || 0;
      totalCost += qty * cost;
      totalRetail += qty * price;
      return { ...item, cost, price, profit, margin, qty, totalItemProfit: qty * profit };
    });

    const totalPotentialProfit = totalRetail - totalCost;
    const avgMargin = totalRetail > 0 ? Math.round((totalPotentialProfit / totalRetail) * 100) : 0;

    // Top 4 profitable items by margin %
    const topProfitable = [...itemsWithProfit]
      .filter(i => i.price > 0)
      .sort((a, b) => b.margin - a.margin)
      .slice(0, 4);

    const topList = topProfitable.map((i, idx) => 
      `  ${idx + 1}. ☕ <b>${i.name}</b>: بيع <b>${formatCurrency(i.price)}</b> (تكلفة: ${formatCurrency(i.cost)}) ⬅️ 🏆 ربح <b>${i.margin}%</b> (+${formatCurrency(i.profit)})`
    ).join('\n');

    const reply = `<b>📊 تقرير هوامش أرباح الكافيه والمنيو (Cafe Margin Engine):</b>
━━━━━━━━━━━━━━━━━
📦 <b>إجمالي القيمة البيعية للمخزون:</b> <code>${formatCurrency(totalRetail)}</code>
💸 <b>إجمالي تكلفة البضاعة (COGS):</b> <code>${formatCurrency(totalCost)}</code>
─────────────────
🏆 <b>صافي الأرباح المتوقعة عند البيع:</b>
  💵 <code>${formatCurrency(totalPotentialProfit)}</code>
  📈 <b>متوسط هامش الربح الإجمالي:</b> <code>${avgMargin}%</code>
━━━━━━━━━━━━━━━━━
🌟 <b>أعلى الأصناف ربحية في المنيو (Top Margin Items):</b>
${topList || '  <i>لم يتم تسجيل أسعار بيع وتكلفة بعد.</i>'}
━━━━━━━━━━━━━━━━━
🔒 <i>THE FIRST GROUP Cafe Analytics Engine</i>`;

    await sendTelegramMessage(chatId, reply, { reply_markup: KEYBOARD });
    return;
  }

  // Default fallback if text doesn't match
  const fallback = `<b>لم أفهم طلبك بدقة، يمكنك الضغط على أي زر من القائمة أدناه 👇</b>`;
  await sendTelegramMessage(chatId, fallback, { reply_markup: KEYBOARD });
}

// ============================================================================
// Long Polling Loop
// ============================================================================
async function startBot() {
  console.log(`🤖 Telegram Financial Bot started for THE FIRST GROUP...`);
  console.log(`🔒 Authorized Chat ID: ${AUTHORIZED_CHAT_ID}`);

  let offset = 0;

  while (true) {
    try {
      const url = `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${offset}&timeout=20`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          offset = update.update_id + 1;
          if (update.message && update.message.text) {
            console.log(`[Message from ${update.message.chat.id}]: ${update.message.text}`);
            await handleMessage(update.message);
          }
        }
      }
    } catch (err) {
      console.error('Polling error (will retry):', err.message);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

startBot();
