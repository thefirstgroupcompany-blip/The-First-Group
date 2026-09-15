import React, { useState, useEffect } from 'react';
import { getSystemInfo, saveSystemInfo, saveSettings, getSettings, exportDatabaseBackup, verifyBackupData, restoreDatabaseBackup } from '../../../services/db';
import { Card, Button, Input, Modal, Badge, Spinner } from '../../../components/ui';
import { DEFAULT_CAFE_ORDER_TEMPLATE, formatCafeOrderMessage } from '../../../utils/cafeOrderTemplate';
import { getTimeMode, setTimeMode } from '../../../utils/constants';

export default function SettingsTab({ systemInfo, onUpdate }) {
  const [form, setForm] = useState({
    name: systemInfo?.name || 'THE FIRST GROUP',
    logoUrl: systemInfo?.logoUrl || '',
    phone: systemInfo?.phone || '',
    instapayHandle: systemInfo?.instapayHandle || 'thefirstgroup@instapay',
    whatsappOrderTemplate: systemInfo?.whatsappOrderTemplate || DEFAULT_CAFE_ORDER_TEMPLATE,
    timeMode: systemInfo?.timeMode || getTimeMode()
  });
  const [workDays, setWorkDays] = useState(26);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  // Backup & Disaster Recovery state
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreModal, setRestoreModal] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);
  const [restorePreview, setRestorePreview] = useState(null);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreSuccess, setRestoreSuccess] = useState(null);
  const [restoreError, setRestoreError] = useState('');

  useEffect(() => {
    getSettings().then(s => { if (s?.workDaysPerMonth) setWorkDays(s.workDaysPerMonth); });
  }, []);

  useEffect(() => {
    setForm({
      name: systemInfo?.name || 'THE FIRST GROUP',
      logoUrl: systemInfo?.logoUrl || '',
      phone: systemInfo?.phone || '',
      instapayHandle: systemInfo?.instapayHandle || 'thefirstgroup@instapay',
      whatsappOrderTemplate: systemInfo?.whatsappOrderTemplate || DEFAULT_CAFE_ORDER_TEMPLATE,
      timeMode: systemInfo?.timeMode || getTimeMode()
    });
  }, [systemInfo]);

  const insertVariable = (tag) => {
    const current = form.whatsappOrderTemplate || DEFAULT_CAFE_ORDER_TEMPLATE;
    setForm(prev => ({
      ...prev,
      whatsappOrderTemplate: current + ' ' + tag
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await saveSystemInfo(form);
      await saveSettings({ workDaysPerMonth: Number(workDays) });
      onUpdate(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setLoading(false); }
  };

  const handleDownloadBackup = async () => {
    setBackupLoading(true);
    try {
      await exportDatabaseBackup();
      alert('✅ تم تنزيل النسخة الاحتياطية بنجاح وحفظها على جهازك بصيغة معيارية موثقة!');
    } catch (err) {
      alert('حدث خطأ أثناء تنزيل النسخة الاحتياطية: ' + (err.message || ''));
    } finally {
      setBackupLoading(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreError('');
    setRestoreSuccess(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        const verified = verifyBackupData(parsed);
        setRestoreFile(parsed);
        setRestorePreview(verified);
      } catch (err) {
        setRestoreError('الملف المرفوع غير صالح كنسخة احتياطية: ' + err.message);
        setRestoreFile(null);
        setRestorePreview(null);
      }
    };
    reader.readAsText(file);
  };

  const handleExecuteRestore = async () => {
    if (!restoreFile) return;
    if (!window.confirm('⚠️ هل أنت متأكد من رغبتك في استعادة وتطبيق هذه النسخة الاحتياطية على قاعدة البيانات؟ سيتم تحديث السجلات بأمان.')) return;

    setRestoreLoading(true);
    setRestoreError('');
    try {
      const res = await restoreDatabaseBackup(restoreFile);
      setRestoreSuccess(res);
    } catch (err) {
      setRestoreError('حدث خطأ أثناء الاستعادة: ' + err.message);
    } finally {
      setRestoreLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <h2 style={{ color: '#ffffff', fontSize: 20, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
        <span>⚙️</span> إعدادات وهوية النظام والنسخ الاحتياطي
      </h2>

      {/* Main Settings Form */}
      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Card style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <h3 style={{ color: '#ffffff', fontWeight: 800, fontSize: 16, marginBottom: 16 }}>🏢 هوية المنشأة / المكان</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Input
              label="اسم المنشأة / النظام"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="THE FIRST GROUP"
            />
            <Input
              label="رابط اللوجو (URL)"
              value={form.logoUrl}
              onChange={e => setForm({ ...form, logoUrl: e.target.value })}
              placeholder="https://example.com/logo.png"
              dir="ltr"
            />
            <div>
              <Input
                label="📱 رقم واتساب استقبال طلبات الكافيه والمنيو"
                value={form.phone || ''}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                placeholder="مثال: 01012345678"
                dir="ltr"
              />
              <p style={{ color: '#93c5fd', fontSize: 12, margin: '4px 0 0' }}>
                💡 الطلبات التي يرسلها العملاء والطلاب من صفحة المنيو الإلكتروني ستصلك تلقائياً على هذا الرقم في الواتساب.
              </p>
            </div>
            <div>
              <Input
                label="⚡ معرف حساب إنستاباي الرسمي (InstaPay Handle / IPA)"
                value={form.instapayHandle || ''}
                onChange={e => setForm({ ...form, instapayHandle: e.target.value })}
                placeholder="مثال: thefirstgroup@instapay"
                dir="ltr"
              />
              <p style={{ color: '#93c5fd', fontSize: 12, margin: '4px 0 0' }}>
                💡 هذا هو المعرف الذي يظهر للعملاء والطلاب في صفحة المنيو عند اختيار الدفع بإنستاباي مع زر النسخ المباشر السريع.
              </p>
            </div>
            {form.logoUrl && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: 12,
                background: 'var(--bg-elevated)', borderRadius: 12, border: '1px solid var(--border)'
              }}>
                <img
                  src={form.logoUrl}
                  alt="preview"
                  style={{ width: 60, height: 60, borderRadius: 12, objectFit: 'cover', border: '2px solid var(--border-glow)' }}
                  onError={e => e.target.style.display = 'none'}
                />
                <div>
                  <p style={{ color: '#ffffff', fontWeight: 600, fontSize: 14 }}>معاينة اللوجو</p>
                  <p style={{ color: '#93c5fd', fontSize: 12 }}>سيظهر في الشريط الجانبي وصفحة الدخول</p>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* WhatsApp Cafe Order Template Card */}
        <Card style={{ background: 'var(--bg-card)', border: '1px solid rgba(16, 185, 129, 0.35)', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h3 style={{ color: '#34d399', fontWeight: 800, fontSize: 16, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>💬</span> صيغة رسالة واتساب لطلبات الكافيه والمنيو
              </h3>
              <p style={{ color: '#94a3b8', fontSize: 12, margin: '4px 0 0' }}>
                تحكم في نص وهيكل الرسالة التي يرسلها العميل من صفحة المنيو الإلكتروني للباريستا
              </p>
            </div>
            <button
              type="button"
              onClick={() => setForm({ ...form, whatsappOrderTemplate: DEFAULT_CAFE_ORDER_TEMPLATE })}
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
            background: 'rgba(0, 0, 0, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 12,
            padding: '10px 12px',
            marginBottom: 12
          }}>
            <div style={{ color: '#f59e0b', fontSize: 12, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🏷️</span> المتغيرات الديناميكية (اضغط على أي متغير لإدراجه في النص):
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[
                { tag: '{system_name}', desc: 'اسم المكان' },
                { tag: '{name}', desc: 'اسم العميل' },
                { tag: '{table}', desc: 'رقم الطاولة/القاعة' },
                { tag: '{items}', desc: 'قائمة الطلبات' },
                { tag: '{count}', desc: 'عدد العناصر' },
                { tag: '{total}', desc: 'إجمالي الحساب' },
                { tag: '{notes}', desc: 'ملاحظات العميل' },
              ].map(v => (
                <button
                  key={v.tag}
                  type="button"
                  onClick={() => insertVariable(v.tag)}
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

          {/* Template Textarea */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ color: '#cbd5e1', fontSize: 13, fontWeight: 700 }}>
              نص وصيغة الرسالة:
            </label>
            <textarea
              rows={9}
              value={form.whatsappOrderTemplate || ''}
              onChange={e => setForm({ ...form, whatsappOrderTemplate: e.target.value })}
              style={{
                width: '100%',
                background: 'rgba(0, 0, 0, 0.35)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: 12,
                padding: '12px 14px',
                color: '#ffffff',
                fontSize: 13,
                fontFamily: 'Cairo, sans-serif',
                lineHeight: 1.6,
                outline: 'none',
                boxSizing: 'border-box'
              }}
              dir="rtl"
              placeholder="اكتب صيغة الرسالة هنا مع المتغيرات..."
            />
          </div>

          {/* Live Preview */}
          <div style={{
            marginTop: 14,
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            borderRadius: 12,
            padding: '12px 16px'
          }}>
            <div style={{ color: '#34d399', fontSize: 12, fontWeight: 800, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>👁️</span> معاينة حية (شكل الرسالة كما ستصلك تماماً على واتساب):
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
              {formatCafeOrderMessage(form.whatsappOrderTemplate, {
                systemName: form.name || 'THE FIRST GROUP',
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
        </Card>

        {/* Centralized Time Setting Card */}
        <Card style={{ background: 'var(--bg-card)', border: '1px solid rgba(59, 130, 246, 0.35)', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h3 style={{ color: '#60a5fa', fontWeight: 800, fontSize: 16, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🕒</span> ضبط توقيت الساعة المركزي للنظام
              </h3>
              <p style={{ color: '#94a3b8', fontSize: 12, margin: '4px 0 0' }}>
                تعديل الساعة هنا يطبَّق فوراً على كافة الموظفين والكاشير والاستقبال في جميع الأجهزة بدون إمكانية التعديل منهم.
              </p>
            </div>
            <Badge color="blue">تحكم إداري حصري 👑</Badge>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => {
                setForm(prev => ({ ...prev, timeMode: 'standard' }));
                setTimeMode('standard');
              }}
              style={{
                flex: 1, minWidth: 220, padding: '14px 18px', borderRadius: 12,
                border: form.timeMode === 'standard' ? '2px solid #3b82f6' : '1px solid var(--border)',
                background: form.timeMode === 'standard' ? 'rgba(59, 130, 246, 0.18)' : 'var(--bg-surface)',
                color: '#fff', cursor: 'pointer', textAlign: 'right', transition: 'all 0.2s',
                boxShadow: form.timeMode === 'standard' ? '0 0 16px rgba(59, 130, 246, 0.25)' : 'none'
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 14, color: form.timeMode === 'standard' ? '#60a5fa' : '#fff' }}>
                {form.timeMode === 'standard' ? '🔘' : '⚪'} التوقيت القياسي المعتمد (الشتوي)
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                يطابق توقيت أجهزة الكمبيوتر والموبايل الحقيقي في مصر (UTC+2).
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setForm(prev => ({ ...prev, timeMode: 'dst' }));
                setTimeMode('dst');
              }}
              style={{
                flex: 1, minWidth: 220, padding: '14px 18px', borderRadius: 12,
                border: form.timeMode === 'dst' ? '2px solid #a855f7' : '1px solid var(--border)',
                background: form.timeMode === 'dst' ? 'rgba(168, 85, 247, 0.18)' : 'var(--bg-surface)',
                color: '#fff', cursor: 'pointer', textAlign: 'right', transition: 'all 0.2s',
                boxShadow: form.timeMode === 'dst' ? '0 0 16px rgba(168, 85, 247, 0.25)' : 'none'
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 14, color: form.timeMode === 'dst' ? '#c084fc' : '#fff' }}>
                {form.timeMode === 'dst' ? '🔘' : '⚪'} التوقيت الصيفي (+1 ساعة)
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                إضافة ساعة كاملة للنظام لتقديم المواعيد والورديات والتقارير (UTC+3).
              </div>
            </button>
          </div>
        </Card>

        <Card style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <h3 style={{ color: '#ffffff', fontWeight: 800, fontSize: 16, marginBottom: 16 }}>📅 إعدادات حساب المرتبات</h3>
          <Input
            label="عدد أيام العمل المعيارية للشهر"
            type="number"
            min="1"
            max="31"
            value={workDays}
            onChange={e => setWorkDays(e.target.value)}
          />
          <p style={{ color: '#7aa4d4', fontSize: 12, marginTop: 6 }}>
            يُستخدم هذا الرقم لحساب معدل اليومية والراتب المستحق بناءً على أيام حضور الموظف.
          </p>
        </Card>

        <Button type="submit" size="lg" variant="primary" disabled={loading} style={{ fontWeight: 800 }}>
          {loading ? 'جاري الحفظ...' : saved ? '✅ تم حفظ التغييرات بنجاح!' : 'حفظ الإعدادات'}
        </Button>
      </form>

      {/* Cloud Backup & Disaster Recovery Card */}
      <Card style={{ background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.9))', border: '1px solid rgba(59, 130, 246, 0.4)', padding: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
          <div>
            <h3 style={{ color: '#60a5fa', fontWeight: 900, fontSize: 17, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>💾</span> النسخ الاحتياطي واستعادة البيانات (Disaster Recovery)
            </h3>
            <p style={{ color: '#94a3b8', fontSize: 13, margin: '6px 0 0', lineHeight: 1.5 }}>
              تتيح لك هذه الأداة استخراج نسخة شاملة وموثقة من قاعدة البيانات بالكامل (العملاء، المدرسين، المناوبات، المدفوعات، الباقات، وسجل الأمان) للرجوع إليها في أي وقت أو استعادتها بضغطة زر واحدة.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
          <Button
            onClick={handleDownloadBackup}
            disabled={backupLoading}
            style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: '#ffffff', fontWeight: 800, flex: 1, minWidth: 220 }}
          >
            {backupLoading ? <><Spinner size={16} /> جاري سحب البيانات...</> : <>📥 تنزيل نسخة احتياطية كاملة (JSON)</>}
          </Button>

          <Button
            onClick={() => { setRestoreModal(true); setRestoreFile(null); setRestorePreview(null); setRestoreError(''); setRestoreSuccess(null); }}
            style={{ background: 'linear-gradient(135deg, #059669, #10b981)', color: '#ffffff', fontWeight: 800, flex: 1, minWidth: 220 }}
          >
            📤 فحص واستعادة نسخة احتياطية
          </Button>
        </div>
      </Card>

      {/* Restore Modal */}
      {restoreModal && (
        <Modal title="📤 فحص واستعادة النسخة الاحتياطية" onClose={() => setRestoreModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ color: '#cbd5e1', fontSize: 13, margin: 0 }}>
              اختر ملف النسخة الاحتياطية المعتمد بصيغة <code style={{ color: '#60a5fa' }}>.json</code> ليقوم النظام بفحصه واستعراض محتوياته بدقة قبل التأكيد.
            </p>

            <div style={{
              border: '2px dashed rgba(59, 130, 246, 0.4)',
              borderRadius: 14,
              padding: 24,
              textAlign: 'center',
              background: 'rgba(15, 23, 42, 0.6)'
            }}>
              <input
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
                id="backup-file-input"
              />
              <label
                htmlFor="backup-file-input"
                style={{
                  display: 'inline-block',
                  padding: '10px 20px',
                  background: 'rgba(59, 130, 246, 0.2)',
                  border: '1px solid #3b82f6',
                  borderRadius: 10,
                  color: '#93c5fd',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: 14
                }}
              >
                📁 اضغط لاختيار ملف النسخة الاحتياطية (.json)
              </label>
            </div>

            {restoreError && (
              <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: 12, color: '#fca5a5', fontSize: 13 }}>
                ⚠️ {restoreError}
              </div>
            )}

            {/* Preview of Backup Structure */}
            {restorePreview && (
              <div style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h4 style={{ color: '#60a5fa', margin: 0, fontSize: 14, fontWeight: 800 }}>
                    🔍 نتيجة الفحص والتحقق من الملف:
                  </h4>
                  <Badge color="emerald">ملف سليم ومعتمد ✅</Badge>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13, color: '#cbd5e1', marginBottom: 14 }}>
                  <div>📅 تاريخ النسخة: <strong>{restorePreview.exportedAtCairo || restorePreview.exportedAt.slice(0, 10)}</strong></div>
                  <div>📊 إجمالي السجلات: <strong style={{ color: '#38bdf8' }}>{restorePreview.calculatedTotal} سجل</strong></div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {Object.entries(restorePreview.collectionsCounts).map(([col, cnt]) => (
                    <span key={col} style={{ background: 'rgba(30, 41, 59, 0.9)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '3px 8px', fontSize: 11, color: '#94a3b8' }}>
                      {col}: <strong style={{ color: '#ffffff' }}>{cnt}</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {restoreSuccess && (
              <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: 12, padding: 16, color: '#6ee7b7' }}>
                <h4 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 800 }}>🎉 تمت استعادة البيانات وتطبيقها بنجاح!</h4>
                <p style={{ margin: 0, fontSize: 13 }}>تم دمج وتحديث {restoreSuccess.verified.calculatedTotal} سجل عبر كافة المجموعات.</p>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <Button variant="ghost" onClick={() => setRestoreModal(false)}>
                إغلاق
              </Button>
              {restorePreview && !restoreSuccess && (
                <Button
                  onClick={handleExecuteRestore}
                  disabled={restoreLoading}
                  style={{ background: 'linear-gradient(135deg, #059669, #10b981)', color: '#fff', fontWeight: 800 }}
                >
                  {restoreLoading ? <><Spinner size={16} /> جاري الاستعادة...</> : <>🚀 تأكيد واستعادة البيانات الآن</>}
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
}
