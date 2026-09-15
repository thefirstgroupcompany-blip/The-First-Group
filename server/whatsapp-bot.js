import makeWASocket, { DisconnectReason, useMultiFileAuthState as loadMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pino from 'pino';
import express from 'express';
import cors from 'cors';
import QRCode from 'qrcode';
import qrcodeTerminal from 'qrcode-terminal';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, addDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';

// Firebase Client Config
const firebaseConfig = {
  apiKey: "AIzaSyD5rfKKPwszn4MU_OXp6ffUbCgTZo0J_ak",
  authDomain: "the-first-group-co.firebaseapp.com",
  projectId: "the-first-group-co",
  storageBucket: "the-first-group-co.firebasestorage.app",
  messagingSenderId: "707174957075",
  appId: "1:707174957075:web:044529b7db0b2518243fe6"
};

const appFb = initializeApp(firebaseConfig);
const db = getFirestore(appFb);

// Live State Cache
let courseSchedules = [];
let packages = [];
let subscriptions = [];
let botSettings = {
  enabled: true,
  welcomeMessage: '',
  closingMessage: '',
  locationAddress: 'سوهاج - شارع 15 - بجوار...',
  workingHours: 'يومياً من 9:00 صباحاً حتى 11:00 مساءً',
  receptionPhone: '',
  customRules: []
};
let systemInfo = { name: 'THE FIRST GROUP' };

// Map to track paused chats (when human takes over) -> jid: timestamp
const pausedChats = new Map();
// Set to track message IDs sent by the bot itself (to avoid self-pausing)
const botSentMessageIds = new Set();

// Realtime DB Listeners
onSnapshot(collection(db, 'course_schedules'), snap => {
  courseSchedules = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`[DB] Loaded ${courseSchedules.length} course schedules`);
});

onSnapshot(collection(db, 'packages'), snap => {
  packages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
});

onSnapshot(collection(db, 'client_subscriptions'), snap => {
  subscriptions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
});

onSnapshot(doc(db, 'system_settings', 'whatsapp_bot'), snap => {
  if (snap.exists()) {
    botSettings = snap.data();
  }
});

// Helper to normalize Arabic
const normalizeArabic = (text = '') => {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[ًٌٍَُِّْ]/g, '')
    .replace(/\s+/g, ' ');
};

const formatCurrency = (val) => `${(Number(val) || 0).toLocaleString('ar-EG-u-nu-latn')} ج.م`;

// Smart Reply Generator
const generateReply = (rawMessage = '') => {
  const q = normalizeArabic(rawMessage);
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
    q.includes('hi') || q.includes('قائمه') || q.includes('منيو') || q.includes('menu') || q.includes('اوامر') ||
    q.includes('خدمه العملاء') || q.includes('تحدث مع موظف') || q.includes('موظف') || q.includes('استقبال')
  ) {
    if (q === '1' || q === '١') {
      const wsPkgs = packages.filter(p => p.type === 'workspace' || !!p.totalHours);
      let list = wsPkgs.map(p => `🔹 **${p.name}:** ${formatCurrency(p.price)} (${p.totalHours || p.sessions || '—'} ساعة)`).join('\n');
      if (!list) list = `🔹 **تذكرة اليوم الكامل (Day Pass):** 40 ج.م\n🔹 **باقة 30 ساعة:** 240 ج.م\n🔹 **باقة 60 ساعة (الأكثر طلباً ⭐):** 400 ج.م\n🔹 **باقة 100 ساعة:** 580 ج.م\n🔹 **الباقة الشهرية المفتوحة VIP:** 750 ج.م`;
      return {
        text: `🏢 **باقات مساحة العمل والمذاكرة في ${orgName}:**\n\n${list}\n\n✨ **كافة الباقات تشمل:**\n🌐 إنترنت فايبر فائق السرعة بدون انقطاع.\n❄️ تكييفات مركزية وهدوء تام.\n🔌 فيشة شاحن ومكاتب مريحة.\n☕ كافيه متكامل.\n\n${closingText}`
      };
    }

    if (q === '2' || q === '٢') {
      const active = courseSchedules.filter(s => s.status !== 'cancelled');
      if (active.length === 0) {
        return {
          text: `🎓 **الكورسات والتدريب في ${orgName}:**\n\nنوفر كورسات لغات (ألماني وإنجليزي)، برمجة ومواقع، وتطبيقات الذكاء الاصطناعي، وجرافيك ديزاين.\n\nجاري تحديث جدول المواعيد للأسبوع الحالي. اكتب اسم الكورس الذي ترغب به وسنوافيك بالتفاصيل! ✨\n\n${closingText}`
        };
      }
      const list = active.map(s => {
        const booked = subscriptions.filter(sub => (sub.status !== 'paused' && sub.status !== 'expired') && (sub.scheduleId === s.id || (sub.packageName && sub.packageName.toLowerCase().includes(s.courseName.toLowerCase())))).length;
        const available = Math.max(0, (Number(s.totalSeats) || 15) - booked);
        const badge = (available <= 0 || s.status === 'full') ? '🔴 (مكتمل العدد)' : available <= 3 ? `🟡 (متبقي ${available} مقاعد فقط)` : `🟢 (متاح - متبقي ${available} مقاعد)`;
        return `📌 **${s.courseName}**\n• المواعيد: **${s.days}** (من ${s.startTime} إلى ${s.endTime})\n• السعر: **${formatCurrency(s.price || 0)}** ${badge}`;
      }).join('\n\n');
      return {
        text: `🎓 **جدول مواعيد الكورسات الحالية في ${orgName}:**\n\n${list}\n\n${closingText}`
      };
    }

    if (q === '3' || q === '٣') {
      return {
        text: `🚪 **غرفة الاجتماعات الخاصة (Private Meeting Room) في ${orgName}:**\n\nمجهزة بالكامل للمقابلات الشخصية، اجتماعات العمل، واجتماعات زووم (Zoom).\n\n✨ **المواصفات:**\n• السعة: تتسع من 4 إلى 8 أفراد.\n• شاشة سمارت Smart TV 4K.\n• سبورة بيضاء تفاعلية Whiteboard.\n• تكييف هواء مستقل وعازل للصوت.\n• إنترنت فايبر سريع لاتصالات الفيديو بدون تقطيع.\n\n💰 **الأسعار:** 100 ج.م / للساعة (أو 320 ج.م لنصف يوم 4 ساعات).\n\n${closingText}`
      };
    }

    if (q === '4' || q === '٤') {
      return {
        text: `📍 **عنوان ومواعيد عمل ${orgName}:**\n\n🏢 **المقر:** ${botSettings?.locationAddress || 'سوهاج - [العنوان بالتفصيل]'}\n⏰ **مواعيد العمل:** ${botSettings?.workingHours || 'يومياً من 9:00 صباحاً حتى 11:00 مساءً'}\n\n🚗 **رابط الموقع على خرائط جوجل:**\nhttps://maps.google.com\n\n📞 نتشرف بزيارتكم في أي وقت! 🌟`
      };
    }

    // 5. Human Handoff (Customer Service Transfer)
    if (q === '5' || q === '٥' || q.includes('خدمه العملاء') || q.includes('موظف') || q.includes('استقبال') || q.includes('تواصل')) {
      return {
        isHandoff: true,
        text: `👨‍💼 **خدمة العملاء والدعم المباشر:**\n\nتم تحويل رسالتك واستفسارك إلى موظف الاستقبال في ${orgName} 🛎️.\n\nسيقوم أحد ممثلينا بالتواصل والرد عليك مباشرة عبر هذا الشات خلال لحظات بسيطة.\n\n${closingText}`
      };
    }

    return { text: `${welcomeText}\n\n${closingText}` };
  }

  // 2. Specific Course Matching
  const isEnglish = q.includes('انجليزي') || q.includes('انجلش') || q.includes('english') || q.includes('محادثه') || q.includes('توفل') || q.includes('ايلتس');
  const isGerman = q.includes('الماني') || q.includes('deutsch') || q.includes('german');
  const isProg = q.includes('برمج') || q.includes('بايثون') || q.includes('ويب') || q.includes('python') || q.includes('كود');
  const isDesign = q.includes('جرافيك') || q.includes('تصميم') || q.includes('فوتوشوب') || q.includes('مونتاج');
  const isMed = q.includes('طب') || q.includes('صيدل') || q.includes('فارما') || q.includes('ميكرو');

  if (isEnglish || isGerman || isProg || isDesign || isMed || q.includes('مواعيد') || q.includes('جدول') || q.includes('كورس')) {
    let filtered = courseSchedules.filter(s => s.status !== 'cancelled');
    if (isEnglish) filtered = filtered.filter(s => normalizeArabic(s.courseName).includes('انجليزي') || normalizeArabic(s.courseName).includes('english'));
    else if (isGerman) filtered = filtered.filter(s => normalizeArabic(s.courseName).includes('الماني') || normalizeArabic(s.courseName).includes('german'));
    else if (isProg) filtered = filtered.filter(s => normalizeArabic(s.courseName).includes('برمج') || normalizeArabic(s.courseName).includes('بايثون') || normalizeArabic(s.courseName).includes('ويب'));
    else if (isDesign) filtered = filtered.filter(s => normalizeArabic(s.courseName).includes('جرافيك') || normalizeArabic(s.courseName).includes('تصميم') || normalizeArabic(s.courseName).includes('فوتوشوب'));
    else if (isMed) filtered = filtered.filter(s => normalizeArabic(s.courseName).includes('طب') || normalizeArabic(s.courseName).includes('صيدل') || normalizeArabic(s.courseName).includes('فارما'));

    if (filtered.length > 0) {
      let text = filtered.map((s, idx) => {
        const booked = subscriptions.filter(sub => (sub.status !== 'paused' && sub.status !== 'expired') && (sub.scheduleId === s.id || (sub.packageName && sub.packageName.toLowerCase().includes(s.courseName.toLowerCase())))).length;
        const available = Math.max(0, (Number(s.totalSeats) || 15) - booked);
        const seatBadge = (available <= 0 || s.status === 'full')
          ? '🔴 (العدد مكتمل حالياً)'
          : available <= 3
            ? `🟡 (متبقي ${available} مقاعد فقط - أوشك على الامتلاء)`
            : `🟢 (متاح للحجز - متبقي ${available} مقاعد)`;

        return `📌 **${idx + 1}. ${s.courseName}**
👨‍🏫 المحاضر: ${s.instructorName || 'معتمد'}
📅 الأيام: **${s.days}**
⏰ الموعد: من **${s.startTime}** إلى **${s.endTime}**
🚪 المكان: ${s.room || 'قاعة التدريب'}
💰 السعر: **${formatCurrency(s.price || 0)}**
📊 حالة الحجز: ${seatBadge}`;
      }).join('\n\n');

      return {
        text: `🎓 **جدول المواعيد المتاحة حالياً في ${orgName}:**\n\n${text}\n\n💡 **لحجز مقعدك وتأكيد الاشتراك:** يمكنك زيارة السنتر أو الرد بـ «تأكيد حجز» وسنتواصل معك فوراً.\n\n${closingText}`
      };
    }
  }

  // 3. Custom Rules
  if (botSettings?.customRules && Array.isArray(botSettings.customRules)) {
    for (const rule of botSettings.customRules) {
      if (rule.keyword && q.includes(normalizeArabic(rule.keyword))) {
        return { text: `${rule.reply}\n\n${closingText}` };
      }
    }
  }

  return {
    text: `أهلاً بك في ${orgName}! 🏢✨

شكراً لتواصلك معنا. يمكنك الرد برقم الخدمة أو كتابة سؤالك مباشرة:
1️⃣ باقات مساحة العمل والمذاكرة (Work Space).
2️⃣ جدول مواعيد وأسعار الكورسات واللغات.
3️⃣ حجز غرفة الاجتماعات الخاصة (Meeting Room).
4️⃣ العنوان واللوكيشن ومواعيد العمل.
5️⃣ التحدث مع موظف الاستقبال.

${closingText}`
  };
};

// Express Web Dashboard
const server = express();
server.use(cors());
server.use(express.json());

let latestQR = null;
let connectionStatus = 'initializing';
let connectedNumber = '';

const syncQrToFirestore = async (qrString, explicitStatus = null) => {
  try {
    const qrDataUrl = qrString ? await QRCode.toDataURL(qrString, { scale: 8 }) : null;
    const finalStatus = explicitStatus || (qrString ? 'qr_ready' : 'connected');
    await setDoc(doc(db, 'system_settings', 'whatsapp_bot'), {
      qrCodeDataUrl: qrDataUrl,
      botConnectionStatus: finalStatus,
      connectedPhone: connectedNumber,
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.error('[Firestore Error] Failed to sync QR:', err.message);
  }
};

server.get('/status', (req, res) => {
  res.json({ status: connectionStatus, phone: connectedNumber, schedulesCount: courseSchedules.length });
});

server.get('/debug-settings', (req, res) => {
  res.json({
    botSettings,
    pausedChats: Array.from(pausedChats.entries()),
    connectedNumber,
    connectionStatus
  });
});

server.post('/test-reply', (req, res) => {
  const { text } = req.body || {};
  const reply = generateReply(text || '');
  res.json({ input: text, reply });
});

const PORT = 5050;
server.listen(PORT, () => {
  console.log(`[Web Server] WhatsApp Bot Dashboard running on http://localhost:${PORT}`);
});

// Baileys WhatsApp Connection
async function startWhatsAppBot() {
  const { state, saveCreds } = await loadMultiFileAuthState('whatsapp_auth_info');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    generateHighQualityLinkPreview: true
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      latestQR = qr;
      connectionStatus = 'qr_ready';
      qrcodeTerminal.generate(qr, { small: true });
      await syncQrToFirestore(qr, 'qr_ready');
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      connectionStatus = 'disconnected';
      latestQR = null;
      await syncQrToFirestore(null, 'disconnected');
      if (shouldReconnect) {
        setTimeout(startWhatsAppBot, 3000);
      }
    } else if (connection === 'open') {
      connectionStatus = 'connected';
      latestQR = null;
      connectedNumber = sock.user?.id?.split(':')[0] || '';
      console.log(`🎉 تم اتصال الواتساب بنجاح برقم: +${connectedNumber}`);
      await syncQrToFirestore(null, 'connected');
    }
  });

  // Listen to Incoming Customer Messages
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      const remoteJid = msg.key.remoteJid;
      if (!remoteJid || remoteJid.includes('@broadcast') || remoteJid.includes('@g.us')) continue;

      // Extract message text
      const text = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        ''
      ).trim();

      // If the message is sent from our account (fromMe):
      if (msg.key.fromMe) {
        // If this message was sent automatically by the bot itself, do NOT pause!
        if (msg.key.id && botSentMessageIds.has(msg.key.id)) {
          botSentMessageIds.delete(msg.key.id);
          continue;
        }

        // If the human typed "#تشغيل_البوت" or "#resume" to unpause this chat:
        if (text === '#تشغيل_البوت' || text === '#تفعيل_البوت' || text === '#resume') {
          pausedChats.delete(remoteJid);
          console.log(`[Bot Resumed] Receptionist manually reactivated bot for ${remoteJid}.`);
          continue;
        }

        // The human receptionist replied manually from their WhatsApp phone/web:
        // Pause bot ONLY for this specific customer chat for 1 hour
        pausedChats.set(remoteJid, Date.now() + 60 * 60 * 1000);
        console.log(`[Human Active] Receptionist replied manually to ${remoteJid}. Bot paused ONLY for this chat for 60 mins.`);
        continue;
      }

      if (!text) continue;

      // If customer wants to reactivate the menu or bot:
      if (text.includes('#قائمه') || text.includes('#منيو') || text.includes('#menu') || text.includes('#بوت') || text.includes('#bot')) {
        pausedChats.delete(remoteJid);
        console.log(`[Bot Reactivated] Customer ${remoteJid} requested bot menu.`);
      }

      // Check if chat is currently paused for human interaction
      const pauseUntil = pausedChats.get(remoteJid);
      if (pauseUntil && Date.now() < pauseUntil) {
        console.log(`[Paused Chat] ${remoteJid} is in human support mode. Bot will not auto-reply to this specific client.`);
        continue;
      }

      console.log(`[Message Received] from ${remoteJid}: "${text}" (key: ${JSON.stringify(msg.key)})`);

      if (botSettings?.enabled === false) {
        console.log(`[Bot Disabled] Bot is disabled in settings. Skipping auto-reply.`);
        continue;
      }

      const replyResult = generateReply(text);

      if (replyResult?.text) {
        try {
          // Fire presence update in background without awaiting (prevents hanging on @lid JIDs)
          sock.sendPresenceUpdate('composing', remoteJid).catch(() => {});

          console.log(`[Bot] Sending auto-reply to ${remoteJid}...`);
          const sentMsg = await sock.sendMessage(remoteJid, { text: replyResult.text });
          console.log(`[Bot] ✅ Reply successfully delivered to ${remoteJid}! Msg ID: ${sentMsg?.key?.id}`);

          if (sentMsg?.key?.id) {
            botSentMessageIds.add(sentMsg.key.id);
            // Clean up old ID after 60 seconds
            setTimeout(() => botSentMessageIds.delete(sentMsg.key.id), 60000);
          }

          // If Customer Service handoff requested:
          if (replyResult.isHandoff) {
            // Pause bot ONLY for this chat for 45 minutes
            pausedChats.set(remoteJid, Date.now() + 45 * 60 * 1000);

            const cleanCustomerNumber = remoteJid.split('@')[0];

            // 1. Log alert to Firestore customer_service_requests
            try {
              await addDoc(collection(db, 'customer_service_requests'), {
                customerPhone: cleanCustomerNumber,
                remoteJid,
                lastMessage: text,
                status: 'pending',
                createdAt: serverTimestamp()
              });
              console.log(`[Alert] Logged customer service request for ${cleanCustomerNumber} in Firestore.`);
            } catch (e) {
              console.error('[Alert Error]', e.message);
            }

            // 2. Forward alert to receptionist phone if configured
            if (botSettings.receptionPhone) {
              let recJid = botSettings.receptionPhone.trim().replace(/\D/g, '');
              if (recJid.startsWith('01')) recJid = '2' + recJid;
              recJid = recJid + '@s.whatsapp.net';

              const alertMsg = `🛎️ **تنبيه عاجل - طلب خدمة عملاء جديد:**\n\n👤 رقم العميل: +${cleanCustomerNumber}\n💬 رسالة العميل: "${text}"\n\n👉 تم إيقاف البوت مؤقتاً على هذا الشات لتتمكن من التحدث معه مباشرة.`;
              const forwardResult = await sock.sendMessage(recJid, { text: alertMsg });
              if (forwardResult?.key?.id) {
                botSentMessageIds.add(forwardResult.key.id);
                setTimeout(() => botSentMessageIds.delete(forwardResult.key.id), 60000);
              }
              console.log(`[Alert Forwarded] Sent notification to receptionist: ${recJid}`);
            }
          }
        } catch (err) {
          console.error('[Error] Failed to send reply:', err.message);
        }
      }
    }
  });
}

startWhatsAppBot().catch(err => {
  console.error('[Fatal Error] Failed to start bot:', err);
});

const handleExit = async () => {
  console.log('\n[Bot Server] Shutting down gracefully...');
  try {
    await setDoc(doc(db, 'system_settings', 'whatsapp_bot'), {
      botConnectionStatus: 'disconnected',
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch {}
  process.exit(0);
};

process.on('SIGINT', handleExit);
process.on('SIGTERM', handleExit);
