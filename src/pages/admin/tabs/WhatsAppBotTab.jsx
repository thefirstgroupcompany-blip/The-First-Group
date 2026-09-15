import React, { useState, useEffect } from 'react';
import { getWhatsAppBotSettings, updateWhatsAppBotSettings, getCourseSchedules, getPackages, getSystemInfo, saveSystemInfo, getAllSubscriptions } from '../../../services/db';
import { processWhatsAppMessage } from '../../../services/whatsappBotEngine';
import { Card, Button, Input, Modal, Badge } from '../../../components/ui';
import { DEFAULT_CAFE_ORDER_TEMPLATE, formatCafeOrderMessage } from '../../../utils/cafeOrderTemplate';

export default function WhatsAppBotTab() {
  const [settings, setSettings] = useState({
    enabled: true,
    welcomeMessage: '',
    closingMessage: '',
    locationAddress: 'سوهاج - شارع 15 - بجوار...',
    workingHours: 'يومياً من 9:00 صباحاً حتى 11:00 مساءً',
    customRules: []
  });
  const [courseSchedules, setCourseSchedules] = useState([]);
  const [packages, setPackages] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [systemInfo, setSystemInfo] = useState({ name: 'THE FIRST GROUP' });
  const [cafeOrderTemplate, setCafeOrderTemplate] = useState(DEFAULT_CAFE_ORDER_TEMPLATE);
  const [savedCafeTemplate, setSavedCafeTemplate] = useState(false);
  const [saving, setSaving] = useState(false);

  // Active Tab inside Bot Tab: 'simulator' | 'messages' | 'rules' | 'connection'
  const [subTab, setSubTab] = useState('simulator');

  // Simulator Chat State
  const [chatMessages, setChatMessages] = useState([
    {
      id: '1',
      sender: 'bot',
      text: 'مرحباً بك في THE FIRST GROUP! 🏢✨\nأنا المساعد الآلي لخدمة العملاء. جرب كتابة أي رسالة أو استفسار للاختبار (مثل: مواعيد كورس الانجليزي، 1، الاسعار، العنوان).',
      time: '12:00 م'
    }
  ]);
  const [testInput, setTestInput] = useState('');

  // Custom Rule Modal
  const [ruleModal, setRuleModal] = useState(false);
  const [editRule, setEditRule] = useState(null);
  const [ruleForm, setRuleForm] = useState({ keyword: '', reply: '' });

  useEffect(() => {
    const unsubSet = getWhatsAppBotSettings(data => {
      setSettings(data);
    });
    const unsubSched = getCourseSchedules(setCourseSchedules);
    const unsubPkg = getPackages(setPackages);
    const unsubSubs = getAllSubscriptions(setSubscriptions);
    getSystemInfo().then(data => {
      if (data) {
        setSystemInfo(data);
        if (data.whatsappOrderTemplate) setCafeOrderTemplate(data.whatsappOrderTemplate);
      }
      setLoading(false);
    });

    return () => {
      unsubSet();
      unsubSched();
      unsubPkg();
      unsubSubs();
    };
  }, []);

  const handleSaveCafeTemplate = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      await saveSystemInfo({ whatsappOrderTemplate: cafeOrderTemplate });
      setSavedCafeTemplate(true);
      setTimeout(() => setSavedCafeTemplate(false), 2500);
    } catch (err) {
      alert('حدث خطأ أثناء حفظ الصيغة: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const insertCafeVariable = (tag) => {
    setCafeOrderTemplate(prev => (prev || DEFAULT_CAFE_ORDER_TEMPLATE) + ' ' + tag);
  };

  // Toggle Bot ON / OFF
  const handleToggleBot = async () => {
    const nextState = !settings.enabled;
    try {
      await updateWhatsAppBotSettings({ enabled: nextState });
      setSettings(prev => ({ ...prev, enabled: nextState }));
    } catch (err) {
      alert('حدث خطأ أثناء تغيير الحالة: ' + err.message);
    }
  };

  // Save Settings
  const handleSaveSettings = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      await updateWhatsAppBotSettings(settings);
      alert('✅ تم حفظ وضبط إعدادات الرد الآلي بنجاح!');
    } catch (err) {
      alert('حدث خطأ: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Simulator Send Message
  const handleSendTestMessage = (e) => {
    e.preventDefault();
    if (!testInput.trim()) return;

    const userMsg = testInput.trim();
    const nowTime = new Date().toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });

    const newChat = [
      ...chatMessages,
      { id: String(Date.now()), sender: 'user', text: userMsg, time: nowTime }
    ];
    setChatMessages(newChat);
    setTestInput('');

    // Process Bot Reply
    setTimeout(() => {
      const botReply = processWhatsAppMessage({
        message: userMsg,
        courseSchedules,
        packages,
        subscriptions,
        botSettings: settings,
        systemInfo
      });

      setChatMessages(prev => [
        ...prev,
        {
          id: String(Date.now() + 1),
          sender: 'bot',
          text: botReply || '⚠️ الرد الآلي متوقف حالياً. قم بتشغيله من الزر الرئيسي بالأعلى.',
          time: new Date().toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    }, 400);
  };

  // Custom Rules Handlers
  const handleOpenRuleModal = (rule = null) => {
    setEditRule(rule);
    if (rule) {
      setRuleForm({ keyword: rule.keyword || '', reply: rule.reply || '' });
    } else {
      setRuleForm({ keyword: '', reply: '' });
    }
    setRuleModal(true);
  };

  const handleSaveRule = async (e) => {
    e.preventDefault();
    if (!ruleForm.keyword.trim() || !ruleForm.reply.trim()) return alert('يرجى ملء الكلمة والرد');

    let updatedRules = [...(settings.customRules || [])];
    if (editRule) {
      updatedRules = updatedRules.map(r => r.id === editRule.id ? { ...r, ...ruleForm } : r);
    } else {
      updatedRules.push({
        id: String(Date.now()),
        keyword: ruleForm.keyword.trim(),
        reply: ruleForm.reply.trim()
      });
    }

    try {
      await updateWhatsAppBotSettings({ customRules: updatedRules });
      setSettings(prev => ({ ...prev, customRules: updatedRules }));
      setRuleModal(false);
    } catch (err) {
      alert('حدث خطأ: ' + err.message);
    }
  };

  const handleDeleteRule = async (ruleId) => {
    if (!window.confirm('هل أنت متأكد من حذف قاعدة الرد هذه؟')) return;
    const updatedRules = (settings.customRules || []).filter(r => r.id !== ruleId);
    try {
      await updateWhatsAppBotSettings({ customRules: updatedRules });
      setSettings(prev => ({ ...prev, customRules: updatedRules }));
    } catch (err) {
      alert('حدث خطأ: ' + err.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontFamily: 'Cairo, sans-serif' }}>
      
      {/* Top Banner & Master ON/OFF Switch */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🤖</span> نظام الرد الآلي وبوت الواتساب الذكي (WhatsApp Auto-Pilot)
          </h2>
          <p style={{ margin: '4px 0 0', color: '#93c5fd', fontSize: 13 }}>
            ردود فورية 24/7 على استفسارات الأسعار ومواعيد الكورسات الحية مباشرة من قاعدة البيانات
          </p>
        </div>

        {/* Master ON/OFF Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(15, 23, 42, 0.9)', padding: '8px 16px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ textAlign: 'right' }}>
            <span style={{ display: 'block', fontSize: 11, color: '#94a3b8' }}>حالة الرد الآلي:</span>
            <strong style={{ color: settings.enabled ? '#34d399' : '#f87171', fontSize: 13 }}>
              {settings.enabled ? '🟢 شغال ومفعل' : '⚪ متوقف ومغلق'}
            </strong>
          </div>

          <button
            type="button"
            onClick={handleToggleBot}
            style={{
              padding: '8px 16px',
              borderRadius: 10,
              background: settings.enabled ? 'linear-gradient(135deg, #16a34a, #22c55e)' : 'rgba(239, 68, 68, 0.2)',
              color: settings.enabled ? '#fff' : '#f87171',
              border: settings.enabled ? 'none' : '1px solid rgba(239, 68, 68, 0.4)',
              fontWeight: 800,
              fontSize: 13,
              cursor: 'pointer',
              boxShadow: settings.enabled ? '0 0 16px rgba(34, 197, 94, 0.4)' : 'none',
              fontFamily: 'Cairo, sans-serif'
            }}
          >
            {settings.enabled ? 'إيقاف الرد الآلي ⏸️' : 'تفعيل الرد الآلي ▶️'}
          </button>
        </div>
      </div>

      {/* Sub Navigation Tabs */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 10, overflowX: 'auto' }}>
        <Button
          variant={subTab === 'simulator' ? 'primary' : 'ghost'}
          onClick={() => setSubTab('simulator')}
          style={{ borderRadius: 10, fontSize: 13 }}
        >
          💬 محاكي الشات التجريبي (Live Simulator)
        </Button>
        <Button
          variant={subTab === 'messages' ? 'primary' : 'ghost'}
          onClick={() => setSubTab('messages')}
          style={{ borderRadius: 10, fontSize: 13 }}
        >
          📝 نصوص الترحيب والمنيو والعنوان
        </Button>
        <Button
          variant={subTab === 'cafe_orders' ? 'primary' : 'ghost'}
          onClick={() => setSubTab('cafe_orders')}
          style={{ borderRadius: 10, fontSize: 13 }}
        >
          ☕ صيغة طلبات الكافيه والمنيو
        </Button>
        <Button
          variant={subTab === 'rules' ? 'primary' : 'ghost'}
          onClick={() => setSubTab('rules')}
          style={{ borderRadius: 10, fontSize: 13 }}
        >
          🎯 قواعد الكلمات المفتاحية المخصصة ({settings.customRules?.length || 0})
        </Button>
        <Button
          variant={subTab === 'connection' ? 'primary' : 'ghost'}
          onClick={() => setSubTab('connection')}
          style={{ borderRadius: 10, fontSize: 13 }}
        >
          🔗 ربط رقم الواتساب (QR Code & API)
        </Button>
      </div>

      {/* TAB 1: LIVE CHAT SIMULATOR */}
      {subTab === 'simulator' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 480px) 1fr', gap: 20, alignItems: 'start' }}>
          
          {/* WhatsApp Mobile Mockup */}
          <Card style={{
            background: '#0b141a',
            border: '2px solid rgba(37, 211, 102, 0.3)',
            borderRadius: 24,
            padding: 0,
            overflow: 'hidden',
            boxShadow: '0 12px 40px rgba(0,0,0,0.6)'
          }}>
            {/* WhatsApp Header */}
            <div style={{ background: '#202c33', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#25d366', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                🏢
              </div>
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: 0, color: '#e9edef', fontSize: 15, fontWeight: 800 }}>THE FIRST GROUP Bot 🤖</h4>
                <span style={{ color: '#25d366', fontSize: 11 }}>متصل الآن (رد تلقائي)</span>
              </div>
              <button
                onClick={() => setChatMessages([{ id: '1', sender: 'bot', text: 'تمت إعادة تشغيل المحادثة. اكتب أي استفسار للتجربة!', time: '12:00 م' }])}
                style={{ background: 'transparent', border: 'none', color: '#8696a0', cursor: 'pointer', fontSize: 16 }}
                title="تصفير الشات"
              >
                🔄
              </button>
            </div>

            {/* Chat Body */}
            <div style={{
              height: 420,
              overflowY: 'auto',
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)',
              backgroundSize: '16px 16px'
            }}>
              {chatMessages.map(msg => {
                const isBot = msg.sender === 'bot';
                return (
                  <div
                    key={msg.id}
                    style={{
                      alignSelf: isBot ? 'flex-start' : 'flex-end',
                      maxWidth: '85%',
                      background: isBot ? '#202c33' : '#005c4b',
                      color: '#e9edef',
                      padding: '10px 14px',
                      borderRadius: isBot ? '12px 12px 12px 2px' : '12px 12px 2px 12px',
                      fontSize: 13,
                      lineHeight: 1.5,
                      whiteSpace: 'pre-line',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                      position: 'relative'
                    }}
                  >
                    {msg.text}
                    <span style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.5)', textAlign: isBot ? 'left' : 'right', marginTop: 4 }}>
                      {msg.time} {isBot ? '' : '✓✓'}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Chat Input */}
            <form onSubmit={handleSendTestMessage} style={{ background: '#202c33', padding: 10, display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder="اكتب رسالة تجريبية (مثلاً: مواعيد كورس الانجليزي)..."
                value={testInput}
                onChange={e => setTestInput(e.target.value)}
                style={{
                  flex: 1,
                  background: '#2a3942',
                  border: 'none',
                  borderRadius: 20,
                  padding: '10px 16px',
                  color: '#ffffff',
                  fontSize: 13,
                  outline: 'none',
                  fontFamily: 'Cairo, sans-serif'
                }}
              />
              <button
                type="submit"
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: '50%',
                  background: '#00a884',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ➤
              </button>
            </form>
          </Card>

          {/* Quick Suggestions & Testing Prompts */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Card style={{ background: 'rgba(15, 23, 42, 0.85)', padding: 18, border: '1px solid rgba(59, 130, 246, 0.3)' }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>💡</span> رسائل سريعة لتجربة استجابة البوت:
              </h3>
              <p style={{ color: '#93c5fd', fontSize: 12, margin: '0 0 14px' }}>
                اضغط على أي زر لتجربة كيف سيرد البوت على هذا السؤال فوراً:
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {[
                  'السلام عليكم',
                  'مواعيد كورس الانجليزي',
                  'كورس الالماني',
                  'اسعار باقات مساحة العمل',
                  '1',
                  '2',
                  '3',
                  '4',
                  'غرفة الاجتماعات الميتنج روم',
                  'العنوان ومواعيد العمل',
                  'سرعة النت عندكم كام'
                ].map(prompt => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => {
                      setTestInput(prompt);
                    }}
                    style={{
                      background: 'rgba(59, 130, 246, 0.15)',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      color: '#93c5fd',
                      padding: '7px 12px',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'Cairo, sans-serif'
                    }}
                  >
                    💬 {prompt}
                  </button>
                ))}
              </div>
            </Card>

            <Card style={{ background: 'rgba(15, 23, 42, 0.85)', padding: 18, border: '1px solid rgba(16, 185, 129, 0.3)' }}>
              <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 800, color: '#34d399' }}>
                🌟 الربط المباشر مع جدول الكورسات:
              </h3>
              <p style={{ color: '#cbd5e1', fontSize: 12, margin: 0, lineHeight: 1.6 }}>
                أي تعديل تقوم به في تبويب <strong>«جدول الكورسات 📅»</strong> (مثل تعديل ميعاد، إضافة كورس جديد، أو تحديث المقاعد المتبقية) ينعكس فوراً في ردود هذا البوت بلحظتها وبدون أي تأخير!
              </p>
            </Card>
          </div>

        </div>
      )}

      {/* TAB 2: MESSAGES SETTINGS */}
      {subTab === 'messages' && (
        <Card style={{ background: 'rgba(15, 23, 42, 0.85)', padding: 20, border: '1px solid rgba(255,255,255,0.08)' }}>
          <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label style={{ display: 'block', color: '#ffffff', fontSize: 14, fontWeight: 800, marginBottom: 8 }}>
                👋 الرسالة الترحيبية وقائمة الاختيارات (Welcome Message & Menu):
              </label>
              <textarea
                rows={6}
                value={settings.welcomeMessage}
                onChange={e => setSettings({ ...settings, welcomeMessage: e.target.value })}
                style={{
                  width: '100%',
                  background: 'rgba(7, 17, 31, 0.8)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 12,
                  padding: 12,
                  color: '#ffffff',
                  fontSize: 13,
                  lineHeight: 1.6,
                  outline: 'none',
                  fontFamily: 'Cairo, sans-serif'
                }}
              />
              <span style={{ fontSize: 11, color: '#64748b' }}>الرسالة التي يتم إرسالها عند استقبال رسالة ترحيبية جديدة</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14 }}>
              <div>
                <label style={{ display: 'block', color: '#ffffff', fontSize: 14, fontWeight: 800, marginBottom: 8 }}>
                  📍 عنوان المقر:
                </label>
                <Input
                  value={settings.locationAddress}
                  onChange={e => setSettings({ ...settings, locationAddress: e.target.value })}
                  placeholder="سوهاج - [العنوان بالتفصيل]"
                />
              </div>

              <div>
                <label style={{ display: 'block', color: '#ffffff', fontSize: 14, fontWeight: 800, marginBottom: 8 }}>
                  ⏰ مواعيد العمل اليومية:
                </label>
                <Input
                  value={settings.workingHours}
                  onChange={e => setSettings({ ...settings, workingHours: e.target.value })}
                  placeholder="يومياً من 9:00 صباحاً حتى 11:00 مساءً"
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', color: '#ffffff', fontSize: 14, fontWeight: 800, marginBottom: 8 }}>
                ✍️ التوقيع والرسالة الختامية (Closing Signature):
              </label>
              <textarea
                rows={3}
                value={settings.closingMessage}
                onChange={e => setSettings({ ...settings, closingMessage: e.target.value })}
                style={{
                  width: '100%',
                  background: 'rgba(7, 17, 31, 0.8)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 12,
                  padding: 12,
                  color: '#ffffff',
                  fontSize: 13,
                  lineHeight: 1.6,
                  outline: 'none',
                  fontFamily: 'Cairo, sans-serif'
                }}
              />
            </div>

            <Button type="submit" variant="primary" disabled={saving} style={{ alignSelf: 'flex-start', padding: '10px 24px' }}>
              {saving ? 'جاري الحفظ...' : '💾 حفظ التعديلات'}
            </Button>
          </form>
        </Card>
      )}

      {/* TAB: CAFE WHATSAPP ORDER TEMPLATE */}
      {subTab === 'cafe_orders' && (
        <Card style={{ background: 'rgba(15, 23, 42, 0.85)', padding: 22, border: '1px solid rgba(16, 185, 129, 0.3)' }}>
          <form onSubmit={handleSaveCafeTemplate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ color: '#34d399', fontWeight: 900, fontSize: 17, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>☕</span> صيغة وهيكل رسالة طلبات المنيو والكافيه عبر واتساب
                </h3>
                <p style={{ color: '#94a3b8', fontSize: 13, margin: '4px 0 0' }}>
                  هذه الصيغة هي التي يتم إنشاؤها تلقائياً عندما يقوم العميل أو الطالب بالضغط على إرسال طلبه من المنيو الإلكتروني
                </p>
              </div>

              <button
                type="button"
                onClick={() => setCafeOrderTemplate(DEFAULT_CAFE_ORDER_TEMPLATE)}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#93c5fd',
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 8,
                  padding: '6px 12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <span>↺</span> استعادة الصيغة الافتراضية
              </button>
            </div>

            {/* Variables Picker */}
            <div style={{
              background: 'rgba(7, 17, 31, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 12,
              padding: '12px 14px'
            }}>
              <div style={{ color: '#f59e0b', fontSize: 12, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🏷️</span> المتغيرات المتاحة (اضغط على المتغير لإضافته لنص الرسالة):
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {[
                  { tag: '{system_name}', desc: 'اسم المكان' },
                  { tag: '{name}', desc: 'اسم العميل' },
                  { tag: '{table}', desc: 'رقم الطاولة/القاعة' },
                  { tag: '{items}', desc: 'قائمة المشروبات' },
                  { tag: '{count}', desc: 'عدد العناصر' },
                  { tag: '{total}', desc: 'إجمالي الحساب' },
                  { tag: '{notes}', desc: 'ملاحظات العميل' },
                ].map(v => (
                  <button
                    key={v.tag}
                    type="button"
                    onClick={() => insertCafeVariable(v.tag)}
                    style={{
                      background: 'rgba(59, 130, 246, 0.15)',
                      border: '1px solid rgba(59, 130, 246, 0.35)',
                      borderRadius: 8,
                      color: '#93c5fd',
                      fontSize: 12,
                      fontWeight: 700,
                      padding: '4px 10px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                    title={v.desc}
                  >
                    <span style={{ color: '#60a5fa' }}>{v.tag}</span>
                    <span style={{ fontSize: 10, color: '#94a3b8' }}>({v.desc})</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Template Editor */}
            <div>
              <label style={{ display: 'block', color: '#ffffff', fontSize: 14, fontWeight: 800, marginBottom: 8 }}>
                ✍️ نص صيغة الرسالة:
              </label>
              <textarea
                rows={9}
                value={cafeOrderTemplate}
                onChange={e => setCafeOrderTemplate(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(7, 17, 31, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: 12,
                  padding: 12,
                  color: '#ffffff',
                  fontSize: 13,
                  lineHeight: 1.6,
                  outline: 'none',
                  fontFamily: 'Cairo, sans-serif'
                }}
                dir="rtl"
              />
            </div>

            {/* Live Preview */}
            <div style={{
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: 12,
              padding: '12px 16px'
            }}>
              <div style={{ color: '#34d399', fontSize: 12, fontWeight: 800, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>👁️</span> معاينة حية (شكل الرسالة كما يستلمها الباريستا في واتساب):
              </div>
              <pre style={{
                color: '#e2e8f0',
                fontSize: 12,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                margin: 0,
                fontFamily: 'Cairo, sans-serif',
                lineHeight: 1.6
              }}>
                {formatCafeOrderMessage(cafeOrderTemplate, {
                  systemName: systemInfo?.name || 'THE FIRST GROUP',
                  customerName: 'أحمد حسن',
                  tableNumber: 'طاولة 3',
                  cartList: [
                    { item: { name: 'بيبسي', unitPrice: 15 }, qty: 2 },
                    { item: { name: 'قهوة اسبريسو', unitPrice: 25 }, qty: 1 }
                  ],
                  cartTotalQty: 3,
                  cartTotalPrice: 55,
                  orderNotes: 'سكر خفيف والبيبسي مثلج'
                })}
              </pre>
            </div>

            <Button type="submit" variant="primary" disabled={saving} style={{ alignSelf: 'flex-start', padding: '10px 24px', fontWeight: 800 }}>
              {saving ? 'جاري الحفظ...' : savedCafeTemplate ? '✅ تم حفظ الصيغة بنجاح!' : '💾 حفظ صيغة الرسالة'}
            </Button>
          </form>
        </Card>
      )}

      {/* TAB 3: CUSTOM RULES */}
      {subTab === 'rules' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <h3 style={{ margin: 0, color: '#ffffff', fontSize: 16, fontWeight: 800 }}>
                🎯 قواعد الكلمات المفتاحية والردود الخاصة ({settings.customRules?.length || 0})
              </h3>
              <p style={{ margin: '2px 0 0', color: '#93c5fd', fontSize: 12 }}>
                حدد كلمات معينة إذا كتبها العميل يرد عليه السيستم بالرد المخصص الذي تحدده هنا
              </p>
            </div>

            <Button variant="primary" onClick={() => handleOpenRuleModal()}>
              ➕ إضافة قاعدة رد جديدة
            </Button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {(settings.customRules || []).map(rule => (
              <Card key={rule.id} style={{ background: 'rgba(15, 23, 42, 0.85)', padding: 16, border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <Badge color="blue">إذا احتوت الرسالة على: «{rule.keyword}»</Badge>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <Button size="sm" variant="ghost" onClick={() => handleOpenRuleModal(rule)} style={{ padding: '2px 6px' }}>✏️</Button>
                    <Button size="sm" variant="danger" onClick={() => handleDeleteRule(rule.id)} style={{ padding: '2px 6px' }}>🗑️</Button>
                  </div>
                </div>
                <p style={{ margin: 0, color: '#e2e8f0', fontSize: 13, background: 'rgba(7, 17, 31, 0.8)', padding: 10, borderRadius: 8 }}>
                  {rule.reply}
                </p>
              </Card>
            ))}
          </div>
        </div>
      )}

                              {/* TAB 4: DIRECT FREE QR CODE BOT SERVER (NO EXTERNAL SITES) */}
      {subTab === 'connection' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          
          {/* Main Direct Local Bot Card */}
          <Card style={{
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(4, 120, 87, 0.3))',
            padding: 24,
            borderRadius: 22,
            border: '2px solid rgba(34, 197, 94, 0.4)',
            boxShadow: '0 12px 35px rgba(0,0,0,0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>🚀</span> سيرفر الواتساب المباشر (100% مجاني بدون أي مواقع وسيطة)
                </h3>
                <p style={{ margin: '4px 0 0', color: '#86efac', fontSize: 13 }}>
                  السيرفر شغال الآن على جهازك، متصل مباشرة بقاعدة البيانات وجدول الكورسات الحية
                </p>
              </div>

              <Badge color={settings.botConnectionStatus === 'connected' ? 'green' : 'amber'} style={{ fontSize: 14, padding: '8px 16px' }}>
                {settings.botConnectionStatus === 'connected' ? '🟢 الواتساب متصل ويعمل' : '⏳ بانتظار مسح كود QR'}
              </Badge>
            </div>

            {/* Native Live QR Display & Step-by-Step Guide */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, alignItems: 'center' }}>
              
              {/* QR Image Box */}
              <div>
                {settings.botConnectionStatus === 'connected' ? (
                  <div style={{ background: '#f0fdf4', border: '2px solid #22c55e', borderRadius: 16, padding: 30, textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 10 }}>🟢</div>
                    <h3 style={{ color: '#16a34a', margin: '0 0 8px', fontSize: 18, fontWeight: 900 }}>الواتساب متصل ويعمل بنجاح!</h3>
                    <p style={{ color: '#334155', margin: 0, fontSize: 14 }}>رقم الهاتف: <strong>{settings.connectedPhone || 'مسجل'}</strong></p>
                    <p style={{ color: '#64748b', fontSize: 12, marginTop: 8 }}>الرد التلقائي يقرأ جداول الكورسات والمقاعد الشاغرة ويرد 24/7</p>
                  </div>
                ) : settings.qrCodeDataUrl ? (
                  <div style={{ background: '#ffffff', border: '2px solid #3b82f6', borderRadius: 16, padding: 20, textAlign: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
                    <h4 style={{ color: '#1e3a8a', margin: '0 0 6px', fontSize: 16, fontWeight: 900 }}>امسح كود QR من تطبيق الواتساب</h4>
                    <p style={{ color: '#64748b', fontSize: 12, margin: '0 0 12px' }}>افتح الواتساب ← الأجهزة المرتبطة ← ربط جهاز</p>
                    <img
                      src={settings.qrCodeDataUrl}
                      alt="WhatsApp QR Code"
                      style={{ width: 250, height: 250, borderRadius: 12, margin: '0 auto', display: 'block', border: '1px solid #e2e8f0' }}
                    />
                    <span style={{ color: '#2563eb', fontWeight: 800, display: 'block', marginTop: 12, fontSize: 13 }}>
                      ⏳ جاري انتظار المسح بكاميرا الهاتف...
                    </span>
                  </div>
                ) : (
                  <div style={{ background: 'rgba(15, 23, 42, 0.85)', padding: 32, borderRadius: 16, textAlign: 'center', border: '1px dashed rgba(255,255,255,0.15)' }}>
                    <div style={{ fontSize: 36, marginBottom: 10 }}>⏳</div>
                    <h4 style={{ color: '#ffffff', margin: '0 0 6px', fontSize: 15 }}>جاري توليد كود الـ QR المباشر...</h4>
                    <p style={{ color: '#94a3b8', fontSize: 12, margin: 0 }}>تأكد من تشغيل سكريبت الواتساب المحلي.</p>
                  </div>
                )}
              </div>

              {/* Instructions Guide */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ background: 'rgba(7, 17, 31, 0.85)', padding: 16, borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)' }}>
                  <h4 style={{ margin: '0 0 8px', color: '#38bdf8', fontSize: 15, fontWeight: 800 }}>
                    📱 خطوات الربط في 10 ثوانٍ:
                  </h4>
                  <ol style={{ margin: 0, paddingRight: 20, color: '#cbd5e1', fontSize: 13, lineHeight: 1.8 }}>
                    <li>افتح تطبيق الواتساب على موبايل السنتر.</li>
                    <li>اضغط على الثلاث نقاط بالأعلى ← <strong>الأجهزة المرتبطة (Linked Devices)</strong> ← <strong>ربط جهاز</strong>.</li>
                    <li>امسح كود الـ QR الظاهر في المربع المجاور بكاميرا الموبايل.</li>
                    <li>فور المسح، تظهر لك علامة 🟢 <strong>متصل</strong> ويبدأ الرد الآلي فوراً 24 ساعة!</li>
                  </ol>
                </div>

                <p style={{ margin: 0, color: '#94a3b8', fontSize: 12, lineHeight: 1.6 }}>
                  💡 <strong>ملاحظة:</strong> بمجرد المسح لمرة واحدة، يتم حفظ الجلسة محلياً على الجهاز ولن يطلب منك المسح مجدداً حتى لو أعدت تشغيل الجهاز.
                </p>
              </div>

            </div>
          </Card>

        </div>
      )}

      {/* Add / Edit Rule Modal */}
      <Modal open={ruleModal} onClose={() => setRuleModal(false)} title={editRule ? '✏️ تعديل قاعدة الرد' : '➕ إضافة كلمة مفتاحية ورد جديد'}>
        <form onSubmit={handleSaveRule} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              الكلمة المفتاحية (إذا احتوت رسالة العميل على):
            </label>
            <Input
              placeholder="مثال: نت، كافيه، عنوان، حجز..."
              value={ruleForm.keyword}
              onChange={e => setRuleForm({ ...ruleForm, keyword: e.target.value })}
              required
              autoFocus
            />
          </div>

          <div>
            <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              الرد التلقائي المراد إرساله للعميل:
            </label>
            <textarea
              rows={4}
              placeholder="اكتب نص الرد هنا..."
              value={ruleForm.reply}
              onChange={e => setRuleForm({ ...ruleForm, reply: e.target.value })}
              required
              style={{
                width: '100%',
                background: 'rgba(7, 17, 31, 0.8)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 12,
                padding: 12,
                color: '#ffffff',
                fontSize: 13,
                outline: 'none',
                fontFamily: 'Cairo, sans-serif'
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <Button variant="ghost" type="button" onClick={() => setRuleModal(false)} style={{ flex: 1 }}>إلغاء</Button>
            <Button variant="primary" type="submit" style={{ flex: 1.5 }}>
              {editRule ? '💾 حفظ التعديل' : '➕ إضافة القاعدة'}
            </Button>
          </div>
        </form>
      </Modal>

    </div>
  );
}
