import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { loginUniversal, getSystemInfo } from '../services/db';
import { Spinner } from '../components/ui';
import { useNavigate } from 'react-router-dom';
import { User, Lock, Eye, EyeOff, AlertCircle, ShieldCheck, LogIn } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [systemInfo, setSystemInfo] = useState({ name: 'THE FIRST GROUP', logoUrl: '' });

  useEffect(() => {
    getSystemInfo().then(setSystemInfo).catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await loginUniversal({
        identifier: form.identifier,
        password: form.password
      });

      if (!user) {
        return setError('بيانات الدخول غير صحيحة، يرجى التأكد من اسم المستخدم وكلمة المرور');
      }

      login(user);
      navigate(user.role === 'admin' ? '/admin' : (user.role === 'cafe' || user.role === 'barista' ? '/cafe' : '/employee'));
    } catch (err) {
      setError('حدث خطأ أثناء الاتصال بالخادم، يرجى التحقق من الإنترنت');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      position: 'relative', overflow: 'hidden', fontFamily: 'Cairo, sans-serif'
    }}>
      {/* Ambient background glow effects */}
      <div style={{
        position: 'absolute', top: -160, right: -160, width: 520, height: 520,
        background: 'radial-gradient(circle, rgba(56,189,248,0.18) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: -140, left: -140, width: 440, height: 440,
        background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />

      {/* Frosted Glass Container */}
      <div className="glass-card" style={{
        padding: '44px 38px',
        width: '100%',
        maxWidth: 420,
        zIndex: 10
      }}>

        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            width: '100%', maxWidth: 220, height: 95, margin: '0 auto',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <img
              src="/logo.png"
              alt="THE FIRST GROUP"
              onError={(e) => { e.target.onerror = null; e.target.src = '/logo.png'; }}
              style={{
                width: '100%', height: '100%', objectFit: 'contain',
                mixBlendMode: 'screen',
                filter: 'drop-shadow(0 0 20px rgba(56,189,248,0.75))'
              }}
            />
          </div>
        </div>

        {/* Error Notification */}
        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.12)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: '1px solid rgba(239,68,68,0.35)',
            borderRadius: 14, padding: '12px 14px', color: '#fca5a5', fontSize: 13, marginBottom: 20,
            display: 'flex', alignItems: 'center', gap: 10
          }}>
            <AlertCircle size={18} style={{ flexShrink: 0, color: '#f87171' }} />
            <span>{error}</span>
          </div>
        )}

        {/* Unified Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ffffff', fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
              <User size={15} style={{ color: '#38bdf8' }} />
              اسم المستخدم أو كود الموظف
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={form.identifier}
                onChange={e => setForm({ ...form, identifier: e.target.value })}
                placeholder="أدخل اسم المستخدم أو كود الموظف"
                required
                autoFocus
                className="glass-input"
                style={{ direction: 'rtl' }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ffffff', fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
              <Lock size={15} style={{ color: '#38bdf8' }} />
              كلمة المرور
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
                required
                className="glass-input"
                style={{
                  direction: 'rtl',
                  paddingLeft: 46
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(147, 197, 253, 0.7)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 4,
                  transition: 'color 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.color = '#38bdf8'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(147, 197, 253, 0.7)'}
                title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="glass-btn-primary"
            style={{
              marginTop: 6,
              width: '100%',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? (
              <><Spinner size={18} /> جاري التحقق والدخول...</>
            ) : (
              <><LogIn size={18} /> تسجيل الدخول</>
            )}
          </button>
        </form>

        <div style={{ marginTop: 26, textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 18 }}>
          <span style={{ color: 'rgba(148, 163, 184, 0.8)', fontSize: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <ShieldCheck size={14} style={{ color: '#38bdf8' }} />
            <span>نظام إدارة محمي • جميع الحقوق محفوظة لـ THE FIRST GROUP © 2026</span>
          </span>
        </div>

      </div>
    </div>
  );
}
