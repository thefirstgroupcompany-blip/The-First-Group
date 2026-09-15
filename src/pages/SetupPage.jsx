import React, { useState } from 'react';
import { createAdmin } from '../services/db';
import { Input, Button, Alert, Spinner } from '../components/ui';

export default function SetupPage({ onSetupComplete }) {
  const [form, setForm] = useState({ username: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 6) return setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
    if (form.password !== form.confirm) return setError('كلمتا المرور غير متطابقتين');
    setLoading(true);
    try {
      await createAdmin({ username: form.username, password: form.password });
      onSetupComplete();
    } catch (err) {
      setError('حدث خطأ، تحقق من اتصال Firebase');
      console.error(err);
    } finally { setLoading(false); }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at top right, #0d2550 0%, #07111f 50%, #000d1a 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-glow)',
        borderRadius: 24, padding: '36px 32px', width: '100%', maxWidth: 420,
        boxShadow: '0 30px 80px rgba(0,0,0,0.7), 0 0 40px rgba(59,130,246,0.1)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18,
            background: 'linear-gradient(135deg, #059669, #10b981)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px', boxShadow: '0 0 30px rgba(16,185,129,0.4)', fontSize: 28,
          }}>🔐</div>
          <h1 style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: 22, marginBottom: 4 }}>
            إعداد النظام
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            أول تشغيل — قم بإنشاء حساب المدير
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Alert type="error" message={error} />
          <Input
            label="اسم المستخدم (للمدير)"
            value={form.username}
            onChange={e => setForm({ ...form, username: e.target.value })}
            placeholder="مثل: admin"
            required autoFocus
          />
          <Input
            label="كلمة المرور"
            type="password"
            value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
            placeholder="6 أحرف على الأقل"
            required
          />
          <Input
            label="تأكيد كلمة المرور"
            type="password"
            value={form.confirm}
            onChange={e => setForm({ ...form, confirm: e.target.value })}
            placeholder="أعد كتابة كلمة المرور"
            required
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 8, padding: '13px',
              background: 'linear-gradient(135deg, #059669, #10b981)',
              color: '#fff', fontFamily: 'Cairo, sans-serif', fontWeight: 700, fontSize: 16,
              border: '1px solid #10b981', borderRadius: 12, cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: '0 4px 20px rgba(16,185,129,0.35)', opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? <><Spinner size={20} /> جاري الإنشاء...</> : '✅ إنشاء الحساب وبدء النظام'}
          </button>
        </form>
      </div>
    </div>
  );
}
