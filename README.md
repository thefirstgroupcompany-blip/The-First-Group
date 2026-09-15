# 🏢 نظام الإدارة المتكامل

نظام إدارة احترافي مع مزامنة فورية بين الأجهزة عبر Firebase.

---

## ⚡ خطوات الإعداد السريع

### 1. إنشاء مشروع Firebase (مجاني)

1. افتح [console.firebase.google.com](https://console.firebase.google.com)
2. اضغط **"Add project"** واختر اسماً للمشروع
3. بعد الإنشاء، اذهب إلى **"Web"** (أيقونة `</>`) لإضافة تطبيق ويب
4. سيظهر لك `firebaseConfig` — انسخ القيم

### 2. تفعيل Firestore

1. من القائمة الجانبية: **Build → Firestore Database**
2. اضغط **"Create database"** → اختر **"Start in test mode"**
3. اختر المنطقة المناسبة (مثل `europe-west1`)

### 3. إعداد بيانات Firebase في المشروع

أنشئ ملف `.env` في جذر المشروع:

```
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123:web:abc...
```

### 4. تشغيل النظام

```bash
npm install
npm run dev
```

افتح المتصفح على: **http://localhost:5173**

---

## 🌐 نشر النظام على الإنترنت (Firebase Hosting)

```bash
npm install -g firebase-tools
firebase login
firebase init hosting
# اختر مشروعك، public dir = dist، SPA = Yes
npm run build
firebase deploy
```

---

## 👥 الصلاحيات

| المستخدم | الدخول | الصلاحيات |
|----------|--------|-----------|
| المدير | اسم مستخدم + كلمة مرور | كل شيء |
| الموظف | رقم العضوية + كلمة مرور | عملاء + مناوبته + حضوره |
| الحضور السريع | بدون باسورد | تسجيل حضور/انصراف فقط |
