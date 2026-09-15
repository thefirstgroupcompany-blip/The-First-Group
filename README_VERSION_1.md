# 📦 وثيقة النسخة الاحتياطية المعتمدة: نسخة رقم 1 (Version 1.0 Stable)

**تاريخ ووقت الحفظ:** 2026-09-01  
**المشروع:** THE FIRST GROUP Management System  
**حالة النسخة:** مستقرة ومعتمدة بالكامل (100% Stable Production Baseline)  
**موقع النسخة الاحتياطية:** `C:\Users\AHMED HASSAN\.gemini\antigravity\scratch\VERSION_1_STABLE_BACKUP`

---

## 📂 محتويات هذه النسخة:
1. **الكود البرمجي الكامل (Full Source Code):**
   - كافة واجهات الإدارة والموظفين وبوابات الطلاب والمدرسين (`src/`).
   - خادم بوت الواتساب والرد التلقائي المعزول (`server/whatsapp-bot.js`).
   - ملفات التنسيق والهوية البصرية واللوجو المضيء.
2. **قاعدة البيانات الحية (Live Firestore Database Snapshot):**
   - ملف: `database_backup_v1.json`
   - يحتوي على كافة المستندات وسجلات الاشتراكات والعملاء والمدرسين والجداول والمدفوعات والمناوبات.
3. **جلسة مصادقة الواتساب:**
   - مجلد `whatsapp_auth_info/` المحتوي على مفاتيح الربط بالرقم `+201007402020`.

---

## 🔄 كيفية استرجاع هذه النسخة في أي وقت (Rollback Guide):
1. **استرجاع الكود:** نسخ محتويات هذا المجلد ولصقها مباشرة في مجلد المشروع الرئيسي:
   `C:\Users\AHMED HASSAN\.gemini\antigravity\scratch\management-system`
2. **إعادة الرفع على الاستضافة (Deploy):**
   تشغيل الأمر: `firebase deploy --only hosting --project the-first-group-co`
