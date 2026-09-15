import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  getSystemInfo, watchSystemInfo, getClients, watchClient, getClientSubscriptions,
  freezeSubscription, unfreezeSubscription, getMonthlyFreezeQuota,
  getPaymentsByClient, getSessionsByClient, calculateClientLoyalty,
  setClientPin, verifyClientPin, getAnnouncements, getClientWalletTransactions, clientPortalLogin,
  generateClientWalletOtp
} from '../services/db';
import { Card, Button, Input, Badge, EmptyState, Spinner } from '../components/ui';
import { formatCurrency, formatDateTime, formatDate, formatHoursClock, formatDurationArabic } from '../utils/constants';
import {
  User, Phone, ShieldCheck, Lock, Unlock, Key, Search, AlertCircle,
  Coffee, Sparkles, LogOut, Clock, ArrowRight, Eye, EyeOff, Home,
  CheckCircle2, Package, CreditCard, Calendar, Snowflake, Flame,
  Megaphone, ExternalLink, ChevronRight, ChevronLeft, Tag, Star,
  Wallet, ArrowDownLeft, ArrowUpRight, RotateCw, X
} from 'lucide-react';
import ClientFeedbackModal from '../components/ClientFeedbackModal';

export default function ClientPortalPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [systemInfo, setSystemInfo] = useState({ name: 'THE FIRST GROUP', logoUrl: '' });
  const [clientsList, setClientsList] = useState([]);
  const [loadingClients, setLoadingClients] = useState(true);

  // Selected Client ID
  const [selectedClientId, setSelectedClientId] = useState(localStorage.getItem('tfg_current_client_id') || '');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Search input for manual lookup
  const [manualQuery, setManualQuery] = useState('');
  const [lookupError, setLookupError] = useState('');

  // First time PIN setup state
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [setupError, setSetupError] = useState('');
  const [setupLoading, setSetupLoading] = useState(false);

  // Regular login PIN state
  const [inputPin, setInputPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [showPin, setShowPin] = useState(false);

  // Client Dashboard Data
  const [client, setClient] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [payments, setPayments] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [activeTab, setActiveTab] = useState('subscriptions');
  const [freezeSubModal, setFreezeSubModal] = useState(null);
  const [freezeDays, setFreezeDays] = useState(3);
  const [freezeReason, setFreezeReason] = useState('فترة امتحانات');
  const [freezeLoading, setFreezeLoading] = useState(false);

  // Announcements & Auto-Rotation State
  const [announcements, setAnnouncements] = useState([]);
  const [currentAdIndex, setCurrentAdIndex] = useState(0);
  const [isAdPaused, setIsAdPaused] = useState(false);
  const touchStartX = React.useRef(null);
  const touchEndX = React.useRef(null);
  const resumeTimerRef = React.useRef(null);

  // Quality & Feedback Survey State
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [hasSubmittedFeedback, setHasSubmittedFeedback] = useState(() => {
    try {
      return localStorage.getItem('tfg_feedback_submitted') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (client?.id) {
      try {
        if (localStorage.getItem(`tfg_feedback_submitted_member_${client.id}`) === 'true') {
          setHasSubmittedFeedback(true);
        }
      } catch {}
    }
  }, [client]);

  // Digital Wallet State
  const [walletTransactions, setWalletTransactions] = useState([]);
  const [showWalletLedger, setShowWalletLedger] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [generatingOtp, setGeneratingOtp] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);

  // OTP Countdown timer & auto-sync
  useEffect(() => {
    if (!showOtpModal || !client?.activeWalletOtp?.expiresAt) return;

    const updateTime = () => {
      const remaining = Math.max(0, Math.floor((Number(client.activeWalletOtp.expiresAt) - Date.now()) / 1000));
      setOtpCountdown(remaining);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [showOtpModal, client?.activeWalletOtp?.expiresAt]);

  // Force OTP Modal to pop up immediately on client's screen when requested by barista (بشكل إجباري)
  useEffect(() => {
    const otp = client?.activeWalletOtp;
    if (!otp) return;

    const isNotUsed = !otp.used;
    const isNotExpired = Date.now() < Number(otp.expiresAt || 0);

    if (isNotUsed && isNotExpired) {
      setShowOtpModal(true);
      try {
        if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 300]);
      } catch (_) {}
    } else if (otp.used) {
      // If modal is currently open when barista consumes it, keep success message visible for 3.5 seconds then close
      if (showOtpModal) {
        const timer = setTimeout(() => {
          setShowOtpModal(false);
        }, 3500);
        return () => clearTimeout(timer);
      }
    }
  }, [client?.activeWalletOtp?.reqTimestamp, client?.activeWalletOtp?.code, client?.activeWalletOtp?.used]);

  const handleGenerateOtp = async () => {
    if (!client?.id || generatingOtp) return;
    setGeneratingOtp(true);
    try {
      await generateClientWalletOtp(client.id, 0, client.name || 'المشترك');
    } catch (err) {
      alert('حدث خطأ أثناء توليد الكود: ' + err.message);
    } finally {
      setGeneratingOtp(false);
    }
  };

  // 1. Load System Info and Announcements (no longer loads all clients)
  useEffect(() => {
    const unsubSys = watchSystemInfo ? watchSystemInfo(setSystemInfo) : () => {};
    getSystemInfo().then(setSystemInfo).catch(() => {});
    const unsubAnnounce = getAnnouncements((data) => {
      setAnnouncements(data || []);
    });
    setLoadingClients(false);
    return () => {
      if (unsubSys) unsubSys();
      if (unsubAnnounce) unsubAnnounce();
    };
  }, []);

  const clientAnnouncements = useMemo(() => {
    return (announcements || []).filter(a => a.isActive !== false && (a.target === 'clients' || a.target === 'all'));
  }, [announcements]);

  const rotationSeconds = useMemo(() => {
    if (systemInfo?.bannerRotationSeconds !== undefined) {
      const parsed = Number(systemInfo.bannerRotationSeconds);
      return isNaN(parsed) ? 5 : parsed;
    }
    return 5;
  }, [systemInfo?.bannerRotationSeconds]);

  // Auto-rotate announcement banners
  useEffect(() => {
    if (clientAnnouncements.length <= 1 || isAdPaused || rotationSeconds <= 0) return;

    const timer = setInterval(() => {
      setCurrentAdIndex(prev => (prev + 1) % clientAnnouncements.length);
    }, rotationSeconds * 1000);

    return () => clearInterval(timer);
  }, [clientAnnouncements.length, isAdPaused, rotationSeconds]);

  // Touch Swipe & Pause Handlers for Banner
  const handleTouchStart = (e) => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    setIsAdPaused(true);
    touchStartX.current = e.touches[0].clientX;
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (touchStartX.current !== null && touchEndX.current !== null) {
      const deltaX = touchStartX.current - touchEndX.current;
      if (deltaX > 40) {
        // Swiped Left -> Next banner
        setCurrentAdIndex(prev => (prev + 1) % clientAnnouncements.length);
      } else if (deltaX < -40) {
        // Swiped Right -> Previous banner
        setCurrentAdIndex(prev => (prev - 1 + clientAnnouncements.length) % clientAnnouncements.length);
      }
    }
    touchStartX.current = null;
    touchEndX.current = null;
    resumeTimerRef.current = setTimeout(() => {
      setIsAdPaused(false);
    }, 3500);
  };

  const handleMouseEnter = () => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    setIsAdPaused(true);
  };

  const handleMouseLeave = () => {
    setIsAdPaused(false);
  };

  const handleManualNav = (newIdx) => {
    setCurrentAdIndex(newIdx);
    setIsAdPaused(true);
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      setIsAdPaused(false);
    }, 3500);
  };

  // 2. Identify Client from URL Parameters — uses server-side query, NOT clientsList
  useEffect(() => {
    const paramId = searchParams.get('id') || searchParams.get('clientId') || searchParams.get('m') || searchParams.get('memberId');
    const paramPhone = searchParams.get('phone') || searchParams.get('p') || searchParams.get('mobile');

    if (paramId || paramPhone) {
      const lookup = async () => {
        try {
          const found = await clientPortalLogin(paramPhone || paramId, paramId && paramPhone ? paramId : '');
          if (found) {
            setSelectedClientId(found.id);
            setClient(found);
            if (paramId && paramPhone && !found.pinCode) {
              localStorage.setItem('tfg_current_client_id', found.id);
              setIsAuthenticated(false); // triggers PIN setup
            }
          }
        } catch (_) {}
      };
      lookup();
    } else {
      const savedId = localStorage.getItem('tfg_current_client_id');
      if (savedId) {
        setSelectedClientId(savedId);
      }
    }
  }, [searchParams]);



  // 3. Keep Active Client in sync with Firestore (watch only selected client)
  useEffect(() => {
    if (!selectedClientId) {
      setClient(null);
      return;
    }

    const unsubC = watchClient(selectedClientId, (liveData) => {
      setClient(prev => ({ ...(prev || {}), ...liveData }));
    });
    const unsubSub = getClientSubscriptions(selectedClientId, setSubscriptions);
    const unsubPay = getPaymentsByClient(selectedClientId, setPayments);
    const unsubSess = getSessionsByClient(selectedClientId, setSessions);
    const unsubWall = getClientWalletTransactions(selectedClientId, setWalletTransactions);

    return () => {
      unsubC && unsubC();
      unsubSub && unsubSub();
      unsubPay && unsubPay();
      unsubSess && unsubSess();
      unsubWall && unsubWall();
    };
  }, [selectedClientId]);


  // 4. Check Auth Session
  useEffect(() => {
    if (client) {
      if (!client.pinCode) {
        setIsAuthenticated(false);
      } else {
        const savedAuth = localStorage.getItem(`tfg_client_auth_${client.id}`);
        if (savedAuth === 'true') {
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
        }
      }
    } else {
      setIsAuthenticated(false);
    }
  }, [client]);

  // Handler: First Time PIN Setup
  const handleSaveInitialPin = async (e) => {
    e.preventDefault();
    if (!client) return;
    setSetupError('');

    const cleanPin = String(newPin).trim();
    const cleanConfirm = String(confirmPin).trim();

    if (cleanPin.length < 4) {
      return setSetupError('يجب أن تتكون كلمة المرور من 4 أرقام أو حروف على الأقل');
    }
    if (cleanPin !== cleanConfirm) {
      return setSetupError('كلمتا المرور غير متطابقتين، يرجى التأكد وإعادة الكتابة');
    }

    setSetupLoading(true);
    try {
      await setClientPin(client.id, cleanPin);
      localStorage.setItem('tfg_current_client_id', client.id);
      localStorage.setItem(`tfg_client_auth_${client.id}`, 'true');
      setIsAuthenticated(true);
      alert('🎉 تم تعيين كلمة المرور الخاصة بك بنجاح! احتفظ بها لتسجيل الدخول بها دائماً.');
    } catch (err) {
      setSetupError('حدث خطأ أثناء حفظ كلمة المرور: ' + err.message);
    } finally {
      setSetupLoading(false);
    }
  };

  // Handler: Regular Login PIN Verification — server-side via bcrypt
  const handleVerifyPin = async (e) => {
    e.preventDefault();
    if (!client) return;
    try {
      setPinError('');
      const valid = await verifyClientPin(client.id, String(inputPin).trim());
      if (valid) {
        setIsAuthenticated(true);
        localStorage.setItem('tfg_current_client_id', client.id);
        localStorage.setItem(`tfg_client_auth_${client.id}`, 'true');
      } else {
        setPinError('كلمة المرور غير صحيحة، يرجى التأكد والمحاولة مرة أخرى');
      }
    } catch {
      setPinError('حدث خطأ أثناء التحقق، يرجى المحاولة مرة أخرى');
    }
  };

  // Handler: Manual Lookup
  // Handler: Manual Lookup — uses server-side query, NOT local clientsList
  const handleManualLookup = async (e) => {
    e.preventDefault();
    setLookupError('');
    const q = manualQuery.trim();
    if (!q) return setLookupError('يرجى كتابة رقم الموبايل أو رقم العضوية');

    try {
      setLoadingClients(true);
      const found = await clientPortalLogin(q, '');
      if (found) {
        setSelectedClientId(found.id);
        setClient(found);
      } else {
        setLookupError('لم يتم العثور على عضو مطابق، يرجى التأكد من الرقم والمحاولة مرة أخرى');
      }
    } catch (err) {
      setLookupError(err.message || 'حدث خطأ أثناء البحث، يرجى المحاولة مرة أخرى');
    } finally {
      setLoadingClients(false);
    }
  };

    const handleOpenClientFreeze = (sub) => {
    const quota = getMonthlyFreezeQuota(sub);
    if (!quota.canFreeze) {
      return alert(`⚠️ لقد استنفدت رصيد التجميد المتاح لهذا الشهر (تم استهلاك ${quota.usedThisMonth} من أصل 10 أيام، والحد الأدنى للمرة الواحدة هو 3 أيام).`);
    }
    setFreezeSubModal(sub);
    setFreezeDays(Math.min(3, quota.remainingDays));
    setFreezeReason('فترة امتحانات');
  };

  const handleConfirmClientFreeze = async (e) => {
    e.preventDefault();
    if (!freezeSubModal || !client) return;

    const quota = getMonthlyFreezeQuota(freezeSubModal);
    if (freezeDays < 3) {
      return alert('⚠️ الحد الأدنى للتجميد هو 3 أيام للمرة الواحدة.');
    }
    if (freezeDays > quota.remainingDays) {
      return alert(`⚠️ تجاوزت الرصيد المتاح لهذا الشهر (${quota.remainingDays} يوم).`);
    }

    setFreezeLoading(true);
    try {
      await freezeSubscription(freezeSubModal.id, {
        days: freezeDays,
        reason: freezeReason,
        actorName: client.name || 'المشترك'
      });
      alert(`🎉 تم تجميد اشتراكك بنجاح لمدة ${freezeDays} يوم! تم تمديد نهاية اشتراكك تلقائياً بنفس المدة.`);
      setFreezeSubModal(null);
    } catch (err) {
      alert('حدث خطأ: ' + err.message);
    } finally {
      setFreezeLoading(false);
    }
  };

  const handleClientUnfreeze = async (sub) => {
    if (!window.confirm('هل تريد إلغاء التجميد واستئناف اشتراكك الآن؟')) return;
    try {
      await unfreezeSubscription(sub.id, client.name || 'المشترك');
      alert('🔥 تم إلغاء التجميد واستئناف اشتراكك بنجاح! تم احتساب الأيام الفعلية للتجميد (حد أدنى 3 أيام) وإعادة باقي الأيام لرصيد حسابك وتحديث نهاية الاشتراك تلقائياً.');
    } catch (err) {
      alert('حدث خطأ: ' + err.message);
    }
  };

  const handleLogout = () => {
    if (client) {
      localStorage.removeItem(`tfg_client_auth_${client.id}`);
    }
    localStorage.removeItem('tfg_current_client_id');
    setIsAuthenticated(false);
    setSelectedClientId('');
    setClient(null);
    setInputPin('');
    setPinError('');
    setNewPin('');
    setConfirmPin('');
  };

  // 0. Top Level Loading Screen while loading clients list
  if (loadingClients && !client) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        fontFamily: 'Cairo, sans-serif'
      }}>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 140, height: 75, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img
              src="/logo.png"
              alt="TFG"
              onError={(e) => { e.target.onerror = null; e.target.src = '/logo.png'; }}
              style={{ width: '100%', height: '100%', objectFit: 'contain', mixBlendMode: 'screen', filter: 'drop-shadow(0 0 20px rgba(56,189,248,0.75))' }}
            />
          </div>
          <Spinner size="lg" />
          <p style={{ color: '#93c5fd', fontSize: 14, fontWeight: 700, margin: 0 }}>جاري فتح بوابة المشترك...</p>
        </div>
      </div>
    );
  }

  // 1. SCREEN: NO CLIENT SELECTED / LOOKUP
  if (!client) {
    return (
      <div style={{
        minHeight: '100vh',
        minHeight: '100dvh',
        background: 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'calc(16px + env(safe-area-inset-top, 0px)) 12px calc(24px + env(safe-area-inset-bottom, 0px))',
        fontFamily: 'Cairo, sans-serif'
      }}>
        <div className="glass-card" style={{
          padding: '28px 20px',
          width: '100%',
          maxWidth: 420,
          textAlign: 'center',
          boxSizing: 'border-box'
        }}>
          <div style={{ width: 160, height: 80, margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img
              src="/logo.png"
              alt="TFG"
              onError={(e) => { e.target.onerror = null; e.target.src = '/logo.png'; }}
              style={{ width: '100%', height: '100%', objectFit: 'contain', mixBlendMode: 'screen', filter: 'drop-shadow(0 0 18px rgba(56,189,248,0.75))' }}
            />
          </div>
          <h1 style={{ color: '#ffffff', fontWeight: 800, fontSize: 20, marginBottom: 6 }}>
            {systemInfo.name}
          </h1>
          <div className="glass-badge" style={{ margin: '0 auto 24px' }}>
            <User size={13} style={{ color: '#38bdf8' }} />
            <span>بوابة فحص اشتراكات المشتركين</span>
          </div>

          {loadingClients ? (
            <div style={{ padding: 24 }}><Spinner /><p style={{ color: '#94a3b8', fontSize: 13, marginTop: 8 }}>جاري التحميل...</p></div>
          ) : (
            <form onSubmit={handleManualLookup} style={{ display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'right' }}>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#c8dcf5', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                  <Phone size={14} style={{ color: '#38bdf8' }} />
                  رقم الموبايل أو كود العضوية:
                </label>
                <input
                  placeholder="أدخل رقم الموبايل أو رقم العضوية..."
                  value={manualQuery}
                  onChange={e => { setManualQuery(e.target.value); setLookupError(''); }}
                  required
                  autoFocus
                  className="glass-input"
                  style={{ direction: 'rtl' }}
                />
              </div>

              {lookupError && (
                <div style={{
                  background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                  padding: '10px 14px', borderRadius: 12, color: '#fca5a5', fontSize: 13,
                  display: 'flex', alignItems: 'center', gap: 8
                }}>
                  <AlertCircle size={16} style={{ flexShrink: 0, color: '#f87171' }} />
                  <span>{lookupError}</span>
                </div>
              )}

              <button
                type="submit"
                className="glass-btn-primary"
                style={{ marginTop: 4, width: '100%' }}
              >
                <Search size={16} />
                <span>فحص حسابي الآن</span>
              </button>
            </form>
          )}

          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            style={{
              marginTop: 20,
              color: 'rgba(200, 220, 245, 0.7)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <ArrowRight size={15} />
            <span>العودة للرئيسية</span>
          </Button>
        </div>
      </div>
    );
  }

  // 2. SCREEN: FIRST TIME PIN SETUP (when client has no PIN set yet)
  if (!client.pinCode) {
    return (
      <div style={{
        minHeight: '100vh',
        minHeight: '100dvh',
        background: 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'calc(16px + env(safe-area-inset-top, 0px)) 12px calc(24px + env(safe-area-inset-bottom, 0px))',
        fontFamily: 'Cairo, sans-serif'
      }}>
        <div className="glass-card" style={{
          padding: '28px 20px',
          width: '100%',
          maxWidth: 420,
          textAlign: 'center',
          boxSizing: 'border-box'
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'rgba(34, 197, 94, 0.15)',
            border: '1px solid rgba(34, 197, 94, 0.4)',
            boxShadow: '0 0 25px rgba(34, 197, 94, 0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px'
          }}>
            <Sparkles size={32} style={{ color: '#4ade80' }} />
          </div>

          <h2 style={{ color: '#ffffff', fontWeight: 900, fontSize: 20, margin: '0 0 4px' }}>
            مرحباً بك، {client.name}
          </h2>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#93c5fd', fontSize: 13, margin: '0 0 16px', fontWeight: 600 }}>
            <span>كود العضوية: <strong>{client.memberId}</strong></span>
            {client.phone && (
              <>
                <span>•</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Phone size={12} style={{ color: '#38bdf8' }} />
                  {client.phone}
                </span>
              </>
            )}
          </div>

          <div style={{
            background: 'rgba(56, 189, 248, 0.08)',
            border: '1px solid rgba(56, 189, 248, 0.2)',
            borderRadius: 14, padding: '12px 14px', marginBottom: 20, textAlign: 'right'
          }}>
            <p style={{ margin: 0, color: '#e2e8f0', fontSize: 12, lineHeight: 1.6, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <ShieldCheck size={18} style={{ color: '#38bdf8', flexShrink: 0, marginTop: 2 }} />
              <span>
                <strong>تعيين كلمة المرور لحسابك:</strong><br />
                يرجى كتابة رمز مرور لحماية بوابتك والاطلاع على رصيد باقاتك وساعاتك بسهولة.
              </span>
            </p>
          </div>

          {setupError && (
            <div style={{
              background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 12, padding: '10px 14px', color: '#fca5a5', fontSize: 13, marginBottom: 14,
              display: 'flex', alignItems: 'center', gap: 8
            }}>
              <AlertCircle size={16} style={{ color: '#f87171', flexShrink: 0 }} />
              <span>{setupError}</span>
            </div>
          )}

          <form onSubmit={handleSaveInitialPin} style={{ display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'right' }}>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                <Key size={14} style={{ color: '#38bdf8' }} />
                كلمة المرور الجديدة (PIN):
              </label>
              <input
                type={showPin ? 'text' : 'password'}
                value={newPin}
                onChange={e => { setNewPin(e.target.value); setSetupError(''); }}
                placeholder="أدخل كلمة مرور (4 أرقام أو حروف على الأقل)"
                required
                autoFocus
                className="glass-input"
                style={{ direction: 'rtl' }}
              />
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                <Key size={14} style={{ color: '#38bdf8' }} />
                تأكيد كلمة المرور:
              </label>
              <input
                type={showPin ? 'text' : 'password'}
                value={confirmPin}
                onChange={e => { setConfirmPin(e.target.value); setSetupError(''); }}
                placeholder="أعد كتابة كلمة المرور للتأكيد"
                required
                className="glass-input"
                style={{ direction: 'rtl' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: -4 }}>
              <input
                type="checkbox"
                id="toggle-show-pin-client"
                checked={showPin}
                onChange={() => setShowPin(!showPin)}
                style={{ cursor: 'pointer' }}
              />
              <label htmlFor="toggle-show-pin-client" style={{ color: '#93c5fd', fontSize: 12, cursor: 'pointer', userSelect: 'none' }}>
                إظهار كلمة المرور أثناء الكتابة
              </label>
            </div>

            <button
              type="submit"
              disabled={setupLoading}
              className="glass-btn-primary"
              style={{
                marginTop: 6,
                width: '100%',
                cursor: setupLoading ? 'not-allowed' : 'pointer',
                opacity: setupLoading ? 0.7 : 1
              }}
            >
              {setupLoading ? <><Spinner size={16} /> جاري الحفظ...</> : <><ShieldCheck size={16} /> حفظ كلمة المرور والدخول للبوابة</>}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 3. SCREEN: REGULAR PIN LOGIN (when client already has a PIN)
  if (!isAuthenticated) {
    return (
      <div style={{
        minHeight: '100vh',
        minHeight: '100dvh',
        background: 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'calc(16px + env(safe-area-inset-top, 0px)) 12px calc(24px + env(safe-area-inset-bottom, 0px))',
        fontFamily: 'Cairo, sans-serif'
      }}>
        <div className="glass-card" style={{
          padding: '28px 20px',
          width: '100%',
          maxWidth: 420,
          textAlign: 'center',
          boxSizing: 'border-box'
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'rgba(56, 189, 248, 0.15)',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            boxShadow: '0 0 25px rgba(56, 189, 248, 0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px'
          }}>
            <Lock size={30} style={{ color: '#38bdf8' }} />
          </div>

          <h2 style={{ color: '#ffffff', fontWeight: 900, fontSize: 20, margin: '0 0 4px' }}>
            {client.name}
          </h2>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#93c5fd', fontSize: 13, margin: '0 0 16px', fontWeight: 600 }}>
            <span>كود العضوية: <strong>{client.memberId}</strong></span>
            {client.phone && (
              <>
                <span>•</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Phone size={12} style={{ color: '#38bdf8' }} />
                  {client.phone}
                </span>
              </>
            )}
          </div>

          <p style={{ color: 'rgba(200, 220, 245, 0.8)', fontSize: 13, margin: '0 0 18px' }}>
            أدخل رمز المرور (PIN) الخاص بك للدخول:
          </p>

          {pinError && (
            <div style={{
              background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 12, padding: '10px 14px', color: '#fca5a5', fontSize: 13, marginBottom: 14,
              display: 'flex', alignItems: 'center', gap: 8
            }}>
              <AlertCircle size={16} style={{ color: '#f87171', flexShrink: 0 }} />
              <span>{pinError}</span>
            </div>
          )}

          <form onSubmit={handleVerifyPin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ position: 'relative' }}>
              <input
                type={showPin ? 'text' : 'password'}
                value={inputPin}
                onChange={e => { setInputPin(e.target.value); setPinError(''); }}
                placeholder="••••"
                required
                autoFocus
                className="glass-input"
                style={{
                  textAlign: 'center',
                  fontSize: 18,
                  letterSpacing: '4px',
                  paddingLeft: 46
                }}
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                style={{
                  position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'transparent', border: 'none', color: 'rgba(147, 197, 253, 0.7)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4
                }}
              >
                {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <button
              type="submit"
              className="glass-btn-primary"
              style={{ width: '100%', marginTop: 4 }}
            >
              <Unlock size={17} />
              <span>فتح البوابة</span>
            </button>

            <div style={{ marginTop: 10, textAlign: 'center' }}>
              <div style={{
                background: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid rgba(56, 189, 248, 0.18)',
                borderRadius: 12, padding: '8px 12px', marginBottom: 14
              }}>
                <p style={{ color: '#93c5fd', fontSize: 12, margin: 0 }}>
                  رمز المرور الافتراضي لحسابك: <strong>0000</strong> (أو الرمز الذي عينته).
                </p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleLogout}
                  style={{ color: 'rgba(200, 220, 245, 0.7)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <ArrowRight size={14} />
                  <span>تبديل الحساب</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => navigate('/')}
                  style={{ color: 'rgba(200, 220, 245, 0.7)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Home size={14} />
                  <span>الرئيسية</span>
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // 4. SCREEN: ACTIVE AUTHENTICATED CLIENT DASHBOARD
  const rawSubs = subscriptions.length > 0 ? subscriptions : (client?.packageName ? [{
    id: 'legacy',
    packageName: client.packageName,
    packagePrice: client.packagePrice || 0,
    packageType: client.packageType || ((client.totalHours || client.packageName?.includes('ساعة')) ? 'workspace' : 'sessions'),
    totalHours: Number(client.totalHours) || (Number(client.packageSessions) || 0),
    hoursUsed: Number(client.hoursUsed) || (Number(client.sessionsUsed) || 0),
    packageSessions: Number(client.packageSessions) || 0,
    sessionsUsed: Number(client.sessionsUsed) || 0,
    currentSession: client.workspaceCurrentSession || null,
    startDate: client.startDate || '',
    endDate: client.endDate || '',
    status: client.status || 'active'
  }] : []);

  const todayStr = new Date().toISOString().split('T')[0];

  const computedSubscriptions = rawSubs.map((s) => {
    const isWs = s.packageType === 'workspace' || !!s.totalHours || s.packageName?.includes('ساعة');
    const total = isWs ? (Number(s.totalHours || s.packageSessions) || 0) : (Number(s.packageSessions) || 0);
    const used = isWs ? (Number(s.hoursUsed || s.sessionsUsed) || 0) : (Number(s.sessionsUsed) || 0);
    const remaining = Math.max(0, parseFloat((total - used).toFixed(2)));
    const percent = total > 0 ? Math.round((remaining / total) * 100) : 0;
    const isCheckedIn = !!s.currentSession?.checkIn || (isWs && !!client?.workspaceCurrentSession?.checkIn);

    // Compute effective endDate
    let effectiveEndDate = s.endDate || client?.endDate || '';
    if (!effectiveEndDate && s.startDate) {
      const d = new Date(s.startDate);
      const days = Number(s.durationDays) || 30;
      d.setDate(d.getDate() + days);
      effectiveEndDate = d.toISOString().split('T')[0];
    }

    const isDateExpired = effectiveEndDate ? (todayStr > effectiveEndDate) : false;
    const isUnitsExpired = remaining <= 0;
    const isExpired = (isUnitsExpired || isDateExpired) && !isCheckedIn;
    const isActive = !isExpired && s.status !== 'paused';

    return {
      ...s,
      isWorkspace: isWs,
      total,
      used,
      remaining,
      percent,
      isCheckedIn,
      effectiveEndDate,
      isDateExpired,
      isUnitsExpired,
      isExpired,
      isActive
    };
  });

  const totalPackagePrice = computedSubscriptions.reduce((s, sub) => s + (Number(sub.packagePrice) || 0), 0) || (Number(client?.packagePrice) || 0);
  
  // فصل دقيق بين مسدد الباقة وإيداعات المحفظة
  const validPayments = (payments || []).filter(p => !p.isVoided);
  const isWalletPayment = (p) => p.category === 'wallet_topup' || p.paymentCategory === 'wallet_topup' || (p.note && p.note.includes('شحن محفظة'));
  const packagePayments = validPayments.filter(p => !isWalletPayment(p));
  const totalPackagePaid = packagePayments.length > 0 
    ? packagePayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    : Number(client?.totalPaid || 0);
  const totalPaid = totalPackagePaid;
  const remainingDebt = Number(client?.balanceDue) > 0 ? Number(client.balanceDue) : Math.max(0, totalPackagePrice - totalPackagePaid);

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', color: '#ffffff', fontFamily: 'Cairo, sans-serif' }}>
      
      {/* Top Header */}
      <header style={{
        background: 'rgba(13, 27, 54, 0.88)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
        padding: 'calc(10px + env(safe-area-inset-top, 0px)) 14px 10px',
        position: 'sticky', top: 0, zIndex: 30
      }}>
        {/* Desktop View */}
        <div className="portal-header-desktop">
          {/* Right: Brand Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 180 }}>
            <div style={{
              width: 50, height: 50, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <img
                src="/logo.png"
                alt="logo"
                onError={(e) => { e.target.onerror = null; e.target.src = '/logo.png'; }}
                style={{ width: '100%', height: '100%', objectFit: 'contain', mixBlendMode: 'screen', filter: 'drop-shadow(0 0 14px rgba(56,189,248,0.6))' }}
              />
            </div>
            <div>
              <p style={{ margin: 0, color: '#ffffff', fontWeight: 900, fontSize: 15, letterSpacing: '0.3px' }}>
                {systemInfo?.name || 'THE FIRST GROUP'}
              </p>
              <span style={{ color: '#38bdf8', fontSize: 11, fontWeight: 700 }}>
                بوابة المشتركين
              </span>
            </div>
          </div>

          {/* Center: Client Name & Member ID */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.18)',
            padding: '8px 22px', borderRadius: 50,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <User size={18} style={{ color: '#38bdf8' }} />
              <span style={{ fontSize: 16, fontWeight: 900, color: '#ffffff' }}>
                {client.name}
              </span>
            </div>

            <span style={{
              background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
              color: '#ffffff', fontSize: 12, fontWeight: 900,
              padding: '3px 12px', borderRadius: 20,
              border: '1px solid rgba(147, 197, 253, 0.5)',
              boxShadow: '0 2px 8px rgba(37, 99, 235, 0.4)'
            }}>
              عضوية #{client.memberId}
            </span>
          </div>

          {/* Left: Phone & Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 180, justifyContent: 'flex-end' }}>
            {client.phone && (
              <span style={{ color: '#93c5fd', fontSize: 13, fontWeight: 700, direction: 'ltr', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Phone size={12} style={{ color: '#38bdf8' }} />
                {client.phone}
              </span>
            )}

            {!hasSubmittedFeedback && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setFeedbackModalOpen(true)}
                style={{
                  border: '1px solid rgba(245, 158, 11, 0.45)',
                  background: 'rgba(245, 158, 11, 0.12)',
                  color: '#fcd34d', fontWeight: 800,
                  display: 'flex', alignItems: 'center', gap: 6, borderRadius: 12
                }}
              >
                <Star size={14} fill="#fcd34d" />
                <span>قيّم تجربتك</span>
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigate('/menu')}
              style={{
                border: '1px solid rgba(56, 189, 248, 0.45)',
                background: 'rgba(56, 189, 248, 0.12)',
                color: '#bae6fd', fontWeight: 800,
                display: 'flex', alignItems: 'center', gap: 6, borderRadius: 12
              }}
            >
              <Coffee size={14} />
              <span>منيو الكافيه ☕</span>
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleLogout}
              style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 12 }}
            >
              <LogOut size={14} />
              <span>خروج</span>
            </Button>
          </div>
        </div>

        {/* Mobile View */}
        <div className="portal-header-mobile">
          {/* Row 1: Brand & Logout */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <img
                src="/logo.png"
                alt="logo"
                onError={(e) => { e.target.onerror = null; e.target.src = '/logo.png'; }}
                style={{ width: 34, height: 34, objectFit: 'contain', mixBlendMode: 'screen', filter: 'drop-shadow(0 0 10px rgba(56,189,248,0.6))' }}
              />
              <div>
                <p style={{ margin: 0, color: '#ffffff', fontWeight: 900, fontSize: 13, lineHeight: 1.2 }}>
                  {systemInfo?.name || 'THE FIRST GROUP'}
                </p>
                <span style={{ color: '#38bdf8', fontSize: 10, fontWeight: 700 }}>
                  بوابة المشتركين
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              style={{
                border: '1px solid rgba(239, 68, 68, 0.35)',
                background: 'rgba(239, 68, 68, 0.12)',
                color: '#fca5a5', fontWeight: 800,
                fontSize: 11, padding: '5px 10px', borderRadius: 10,
                display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
                fontFamily: 'Cairo, sans-serif'
              }}
            >
              <LogOut size={12} />
              <span>خروج</span>
            </button>
          </div>

          {/* Row 2: Client Info Strip */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
            background: 'rgba(255, 255, 255, 0.07)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: 14, padding: '8px 12px',
            backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <User size={14} style={{ color: '#38bdf8', flexShrink: 0 }} />
              <span style={{ fontSize: 13.5, fontWeight: 800, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {client.name}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {client.phone && (
                <span style={{ color: '#93c5fd', fontSize: 11, direction: 'ltr', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                  <Phone size={10} style={{ color: '#38bdf8' }} />
                  {client.phone}
                </span>
              )}
              <span style={{
                background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
                color: '#ffffff', fontSize: 11, fontWeight: 800,
                padding: '2px 9px', borderRadius: 12,
                border: '1px solid rgba(147, 197, 253, 0.5)'
              }}>
                #{client.memberId}
              </span>
            </div>
          </div>

          {/* Row 3: Action Quick Buttons Strip */}
          <div style={{ display: 'flex', gap: 6, width: '100%' }}>


            <button
              type="button"
              onClick={() => navigate('/menu')}
              style={{
                flex: 1,
                border: '1px solid rgba(56, 189, 248, 0.45)',
                background: 'rgba(56, 189, 248, 0.14)',
                color: '#bae6fd', fontWeight: 800,
                fontSize: 11, padding: '6px 8px', borderRadius: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                cursor: 'pointer', fontFamily: 'Cairo, sans-serif'
              }}
            >
              <Coffee size={12} />
              <span>منيو الكافيه</span>
            </button>

            {!hasSubmittedFeedback && (
              <button
                type="button"
                onClick={() => setFeedbackModalOpen(true)}
                style={{
                  flex: 1,
                  border: '1px solid rgba(245, 158, 11, 0.45)',
                  background: 'rgba(245, 158, 11, 0.14)',
                  color: '#fcd34d', fontWeight: 800,
                  fontSize: 11, padding: '6px 8px', borderRadius: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  cursor: 'pointer', fontFamily: 'Cairo, sans-serif'
                }}
              >
                <Star size={12} fill="#fcd34d" />
                <span>تقييم ⭐</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main style={{
        maxWidth: 860,
        margin: '0 auto',
        padding: '18px 12px calc(40px + env(safe-area-inset-bottom, 0px))',
        display: 'flex',
        flexDirection: 'column',
        gap: 16
      }}>

        {/* Active Announcements / Ads Carousel Banner */}
        {clientAnnouncements.length > 0 && (() => {
          const safeIndex = currentAdIndex % clientAnnouncements.length;
          const ad = clientAnnouncements[safeIndex] || clientAnnouncements[0];

          const catConfig = {
            offer: { label: 'عرض خاص', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.4)', icon: Flame },
            event: { label: 'فعالية / ورشة', color: '#c084fc', bg: 'rgba(192, 132, 252, 0.15)', border: 'rgba(192, 132, 252, 0.4)', icon: Calendar },
            alert: { label: 'تنبيه هام', color: '#f87171', bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.4)', icon: AlertCircle },
            general: { label: 'إعلان عام', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)', border: 'rgba(56, 189, 248, 0.4)', icon: Megaphone }
          }[ad.category || 'general'] || { label: 'إعلان', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)', border: 'rgba(56, 189, 248, 0.4)', icon: Megaphone };

          const IconComp = catConfig.icon;

          return (
            <div
              className="glass-card portal-announcement-card"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              style={{
                padding: '20px 24px',
                border: `1px solid ${catConfig.border}`,
                background: `linear-gradient(135deg, ${catConfig.bg} 0%, rgba(13, 27, 54, 0.85) 100%)`,
                position: 'relative',
                overflow: 'hidden',
                boxShadow: `0 8px 24px -4px ${catConfig.bg}`,
                touchAction: 'pan-y',
                userSelect: 'none',
                cursor: clientAnnouncements.length > 1 ? 'grab' : 'default'
              }}
            >
              {/* Progress Bar for Auto-Rotation */}
              {clientAnnouncements.length > 1 && rotationSeconds > 0 && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 3,
                  background: 'rgba(255,255,255,0.08)',
                  overflow: 'hidden',
                  zIndex: 2
                }}>
                  <div
                    key={`ad-progress-${safeIndex}`}
                    style={{
                      height: '100%',
                      background: `linear-gradient(90deg, ${catConfig.color}, #38bdf8)`,
                      width: '100%',
                      animation: !isAdPaused ? `bannerProgressAnim ${rotationSeconds}s linear infinite` : 'none',
                      opacity: isAdPaused ? 0.35 : 0.95
                    }}
                  />
                  <style>{`
                    @keyframes bannerProgressAnim {
                      from { width: 0%; }
                      to { width: 100%; }
                    }
                  `}</style>
                </div>
              )}

              {/* Header: Category Badge + Navigation Arrows if multiple */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: catConfig.bg, border: `1px solid ${catConfig.border}`,
                    color: catConfig.color, fontSize: 12, fontWeight: 800,
                    padding: '4px 12px', borderRadius: 20
                  }}>
                    <IconComp size={14} />
                    {ad.badge || catConfig.label}
                  </span>
                  {ad.badge && (
                    <span style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600 }}>
                      {catConfig.label}
                    </span>
                  )}
                </div>

                {clientAnnouncements.length > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, direction: 'ltr' }}>
                    <button
                      type="button"
                      onClick={() => handleManualNav((safeIndex - 1 + clientAnnouncements.length) % clientAnnouncements.length)}
                      style={{
                        background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                        color: '#ffffff', width: 28, height: 28, borderRadius: '50%',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}
                      title="السابق"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span style={{ fontSize: 12, color: '#93c5fd', fontWeight: 700, minWidth: 36, textAlign: 'center' }}>
                      {safeIndex + 1} / {clientAnnouncements.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleManualNav((safeIndex + 1) % clientAnnouncements.length)}
                      style={{
                        background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                        color: '#ffffff', width: 28, height: 28, borderRadius: '50%',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}
                      title="التالي"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}
              </div>

              {/* Body: Optional Image & Text Content */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {ad.imageUrl && (
                  <div style={{ width: '100%', maxHeight: 240, overflow: 'hidden', borderRadius: 14, border: '1px solid rgba(255,255,255,0.15)' }}>
                    <img
                      src={ad.imageUrl}
                      alt={ad.title}
                      style={{ width: '100%', height: '100%', maxHeight: 240, objectFit: 'cover', display: 'block', pointerEvents: 'none' }}
                    />
                  </div>
                )}

                <div>
                  <h3 style={{ color: '#ffffff', fontWeight: 900, fontSize: 18, margin: '0 0 6px', lineHeight: 1.4 }}>
                    {ad.title}
                  </h3>
                  <p style={{ color: 'rgba(226, 232, 240, 0.95)', fontSize: 14, lineHeight: 1.7, margin: 0, whiteSpace: 'pre-line' }}>
                    {ad.content}
                  </p>
                </div>

                {/* Call-to-action button if actionLabel or actionUrl */}
                {ad.actionLabel && (() => {
                  let targetUrl = (ad.actionUrl || '').trim();
                  if (targetUrl) {
                    if (targetUrl.startsWith('01') || targetUrl.startsWith('+201') || (targetUrl.length >= 10 && !targetUrl.includes('/') && !targetUrl.includes('.'))) {
                      const cleanPhone = targetUrl.replace(/\D/g, '');
                      const finalPhone = cleanPhone.startsWith('20') ? cleanPhone : `20${cleanPhone.replace(/^0+/, '')}`;
                      targetUrl = `https://wa.me/${finalPhone}`;
                    } else if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://') && !targetUrl.startsWith('tel:') && !targetUrl.startsWith('mailto:')) {
                      targetUrl = `https://${targetUrl}`;
                    }
                  }

                  return (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                      {targetUrl ? (
                        <a
                          href={targetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="glass-btn-primary portal-announcement-btn"
                          style={{
                            textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8,
                            fontSize: 13, padding: '8px 18px', borderRadius: 10
                          }}
                        >
                          <span>{ad.actionLabel}</span>
                          <ExternalLink size={14} />
                        </a>
                      ) : (
                        <span className="glass-badge portal-announcement-btn" style={{ fontSize: 13, padding: '6px 14px' }}>
                          {ad.actionLabel}
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Dots indicator & swipe tip for multiple ads */}
              {clientAnnouncements.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {clientAnnouncements.map((_, idx) => (
                      <span
                        key={idx}
                        onClick={() => handleManualNav(idx)}
                        style={{
                          width: idx === safeIndex ? 22 : 8,
                          height: 8,
                          borderRadius: 4,
                          background: idx === safeIndex ? catConfig.color : 'rgba(255,255,255,0.2)',
                          cursor: 'pointer',
                          transition: 'all 0.3s ease'
                        }}
                      />
                    ))}
                  </div>
                  <span style={{ fontSize: 11, color: '#64748b', marginRight: 4, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <span>👈</span> اسحب للتنقل <span>👉</span>
                  </span>
                </div>
              )}
            </div>
          );
        })()}

        {/* Quality & Feedback Banner Card */}
        {!hasSubmittedFeedback && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(30, 41, 59, 0.7) 100%)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: 16,
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                background: 'rgba(245, 158, 11, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(245, 158, 11, 0.4)'
              }}>
                <Star size={22} color="#f59e0b" fill="#f59e0b" />
              </div>
              <div>
                <h4 style={{ margin: '0 0 3px', color: '#fcd34d', fontSize: 14, fontWeight: 900 }}>
                  رأيك يهمنا ويسهم في تطوير The First Group! ⭐
                </h4>
                <p style={{ margin: 0, color: '#cbd5e1', fontSize: 12 }}>
                  شاركنا انطباعك عن مساحة العمل، الهدوء، الإنترنت، أو الكافيه في ثوانٍ معدودة.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFeedbackModalOpen(true)}
              style={{
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 10,
                padding: '8px 18px',
                fontSize: 13,
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)',
                fontFamily: 'Cairo, sans-serif'
              }}
            >
              <Star size={14} fill="#ffffff" />
              <span>شاركنا تقييمك الآن</span>
            </button>
          </div>
        )}

        {/* Financial Snapshot */}
        <div className="portal-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <div className="glass-card-subtle portal-stats-card" style={{ padding: '16px 12px', textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#93c5fd', fontSize: 12, fontWeight: 700 }}>
              <Package size={15} style={{ color: '#38bdf8' }} />
              <span className="stat-lbl">الباقات المشترك بها</span>
            </div>
            <div className="stat-val" style={{ fontSize: 26, fontWeight: 900, color: '#ffffff', marginTop: 6 }}>{computedSubscriptions.length}</div>
          </div>

          <div className="glass-card-subtle portal-stats-card" style={{ padding: '16px 12px', textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#a7f3d0', fontSize: 12, fontWeight: 700 }}>
              <CreditCard size={15} style={{ color: '#34d399' }} />
              <span className="stat-lbl">المسدد للباقات</span>
            </div>
            <div className="stat-val" style={{ fontSize: 26, fontWeight: 900, color: '#34d399', marginTop: 6 }}>{formatCurrency(totalPackagePaid)}</div>
          </div>

          <div className="glass-card-subtle portal-stats-card" style={{
            padding: '16px 12px', textAlign: 'center',
            borderColor: remainingDebt > 0 ? 'rgba(239, 68, 68, 0.35)' : 'rgba(16, 185, 129, 0.35)'
          }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: remainingDebt > 0 ? '#fca5a5' : '#a7f3d0', fontSize: 12, fontWeight: 700 }}>
              {remainingDebt > 0 ? <AlertCircle size={15} style={{ color: '#f87171' }} /> : <CheckCircle2 size={15} style={{ color: '#34d399' }} />}
              <span className="stat-lbl">{remainingDebt > 0 ? 'المتبقي / المديونية' : 'الحالة المالية'}</span>
            </div>
            <div className="stat-val" style={{ fontSize: 26, fontWeight: 900, color: remainingDebt > 0 ? '#f87171' : '#34d399', marginTop: 6 }}>
              {remainingDebt > 0 ? formatCurrency(remainingDebt) : 'خالص بالكامل'}
            </div>
          </div>

          {/* Digital Wallet Card */}
          <div className="glass-card-subtle portal-stats-card" style={{
            padding: '16px 12px', textAlign: 'center',
            borderColor: 'rgba(56, 189, 248, 0.45)',
            background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.15) 0%, rgba(15, 23, 42, 0.6) 100%)',
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
          }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#38bdf8', fontSize: 12, fontWeight: 700, justifyContent: 'center' }}>
              <Wallet size={15} style={{ color: '#38bdf8' }} />
              <span className="stat-lbl">رصيد محفظتي</span>
            </div>
            <div className="stat-val" style={{ fontSize: 24, fontWeight: 900, color: '#34d399', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {formatCurrency(client?.walletBalance || 0)}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  setShowOtpModal(true);
                  if (!client?.activeWalletOtp || client.activeWalletOtp.used || Date.now() > Number(client.activeWalletOtp.expiresAt)) {
                    handleGenerateOtp();
                  }
                }}
                style={{
                  background: 'linear-gradient(135deg, #7e22ce, #9333ea)',
                  border: '1px solid rgba(192, 132, 252, 0.4)',
                  color: '#ffffff', borderRadius: 8, padding: '5px 10px',
                  fontSize: 11, fontWeight: 800, cursor: 'pointer',
                  fontFamily: 'Cairo, sans-serif',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  boxShadow: '0 2px 8px rgba(147, 51, 234, 0.35)'
                }}
              >
                <ShieldCheck size={13} />
                <span>كود دفع الكافيه 🔐</span>
              </button>

              <button
                type="button"
                onClick={() => setShowWalletLedger(!showWalletLedger)}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: '#93c5fd', borderRadius: 8, padding: '5px 9px',
                  fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'Cairo, sans-serif'
                }}
              >
                {showWalletLedger ? 'إخفاء الحركات' : 'سجل الحركات 📜'}
              </button>
            </div>
          </div>
        </div>

        {/* Digital Wallet Transactions Ledger */}
        {showWalletLedger && (
          <div className="glass-card-subtle" style={{ padding: '20px', borderRadius: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
              <h4 style={{ margin: 0, color: '#38bdf8', fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Wallet size={16} />
                <span>كشف حساب وحركات المحفظة ({walletTransactions.length})</span>
              </h4>
              <button
                type="button"
                onClick={() => {
                  const phone = systemInfo?.phone || '01000000000';
                  const msg = `مرحباً، أرغب في شحن رصيد إضافي لمحفظتي في The First Group (رقم العضوية: #${client.memberId} - الاسم: ${client.name})`;
                  window.open(`https://wa.me/2${phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
                }}
                style={{
                  background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                  color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px',
                  fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                }}
              >
                <span>طلب شحن رصيد (واتساب)</span>
              </button>
            </div>

            {walletTransactions.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#94a3b8', margin: '14px 0', fontSize: 13 }}>
                لا توجد حركات شحن أو خصم مسجلة بمحفظتك حتى الآن
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
                {walletTransactions.map(tx => {
                  const isTopup = tx.type === 'topup' || tx.amount > 0;
                  return (
                    <div key={tx.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 14px', borderRadius: 12,
                      background: isTopup ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                      border: isTopup ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 8,
                          background: isTopup ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: isTopup ? '#34d399' : '#f87171'
                        }}>
                          {isTopup ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <strong style={{ color: isTopup ? '#34d399' : '#f87171', fontSize: 13, direction: 'ltr' }}>
                              {isTopup ? `+${formatCurrency(tx.totalCredited || tx.amount)}` : formatCurrency(tx.amount)}
                            </strong>
                            <Badge color={isTopup ? 'green' : 'red'}>
                              {isTopup ? 'إيداع رصيد' : 'صرف / طلب'}
                            </Badge>
                          </div>
                          <div style={{ color: '#cbd5e1', fontSize: 11, marginTop: 2 }}>
                            {tx.notes || tx.description || 'عملية محفظة'}
                          </div>
                          <div style={{ color: '#64748b', fontSize: 10 }}>
                            {tx.createdAt?.toDate ? formatDateTime(tx.createdAt.toDate()) : (tx.isoDate ? formatDateTime(tx.isoDate) : '—')}
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'left' }}>
                        <span style={{ fontSize: 10, color: '#94a3b8' }}>الرصيد بعد:</span>
                        <div style={{ color: '#ffffff', fontWeight: 800, fontSize: 12, direction: 'ltr' }}>
                          {formatCurrency(tx.balanceAfter !== undefined ? tx.balanceAfter : client?.walletBalance || 0)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}



        {/* Subscriptions List */}
        <div>
          <h3 style={{ color: '#60a5fa', fontSize: 16, fontWeight: 800, margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Package size={17} style={{ color: '#38bdf8' }} />
            <span>تفاصيل ورصيد الباقات الحالية ({computedSubscriptions.length})</span>
          </h3>

          {computedSubscriptions.length === 0 ? (
            <div className="glass-card-subtle" style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
              <p style={{ margin: 0, fontWeight: 700 }}>لا توجد باقات مفعلة حالياً</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {computedSubscriptions.map((sub, idx) => {
                const isWs = sub.isWorkspace;
                return (
                  <div key={sub.id || idx} className="glass-card-subtle" style={{ padding: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <h4 style={{ color: '#ffffff', fontWeight: 800, fontSize: 16, margin: 0 }}>
                            {sub.packageName || 'باقة تدريب'}
                          </h4>
                          {isWs ? <Badge color="purple">مساحة عمل</Badge> : <Badge color="blue">باقة حصص</Badge>}
                          {sub.isCheckedIn && (
                            <Badge color="green">
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <CheckCircle2 size={12} /> متواجد حالياً
                              </span>
                            </Badge>
                          )}
                          {(sub.status === 'frozen' || sub.isFrozen) ? (
                            <Badge color="blue">
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <Snowflake size={12} /> مجمّد مؤقتاً ({sub.freezeReason || 'امتحانات/سفر'})
                              </span>
                            </Badge>
                          ) : (
                            <Badge color={sub.isExpired ? 'red' : 'green'}>
                              {sub.isExpired ? (sub.isDateExpired ? 'منتهي الصلاحية' : isWs ? 'منتهية الساعات' : 'منتهية الحصص') : 'سارية ونشطة'}
                            </Badge>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6, fontSize: 12, alignItems: 'center' }}>
                          <span style={{ color: '#93c5fd', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Calendar size={13} style={{ color: '#38bdf8' }} />
                            <span>تاريخ البدء: <strong>{sub.startDate || '—'}</strong></span>
                          </span>
                          <span style={{
                            color: sub.isDateExpired ? '#f87171' : '#34d399',
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            background: sub.isDateExpired ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                            padding: '2px 8px', borderRadius: 6,
                            border: sub.isDateExpired ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
                            fontWeight: 700
                          }}>
                            <Clock size={13} />
                            <span>تاريخ الانتهاء: <strong>{sub.effectiveEndDate || '—'}</strong></span>
                            {sub.isDateExpired && <span style={{ fontSize: 11 }}>(منتهي الصلاحية)</span>}
                          </span>
                        </div>
                      </div>

                      <div style={{
                        textAlign: 'center', padding: '6px 14px', borderRadius: 10,
                        background: sub.isExpired ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.15)',
                        border: sub.isExpired ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(16,185,129,0.3)'
                      }}>
                        <span style={{ fontSize: 11, color: sub.isExpired ? '#fca5a5' : '#a7f3d0', display: 'block' }}>
                          {isWs ? 'الساعات المتبقية' : 'الحصص المتبقية'}
                        </span>
                        <strong style={{ color: sub.isExpired ? '#f87171' : '#34d399', fontSize: 18, fontWeight: 900 }}>
                          {isWs ? formatHoursClock(sub.remaining) : sub.remaining} <span style={{ fontSize: 11 }}>{isWs ? 'ساعة' : 'حصة'}</span>
                        </strong>
                      </div>
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#c8dcf5', fontSize: 12, marginBottom: 4 }}>
                        <span>
                          {isWs ? `تم استهلاك ${formatHoursClock(sub.used)} من ${formatHoursClock(sub.total)} ساعة` : `تم استخدام ${sub.used} من ${sub.total} حصة`}
                        </span>
                        <strong style={{ color: sub.isExpired ? '#f87171' : '#34d399' }}>{sub.percent}% متبقي</strong>
                      </div>
                      <div style={{ width: '100%', height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 6, overflow: 'hidden' }}>
                        <div style={{
                          width: sub.percent + '%', height: '100%',
                          background: sub.isExpired ? '#ef4444' : sub.percent > 40 ? 'linear-gradient(90deg, #059669, #10b981)' : 'linear-gradient(90deg, #d97706, #f59e0b)'
                        }} />
                      </div>
                    </div>
                                      {/* Self-Service Freeze Card Section (Workspace Only) */}
                    {sub.isWorkspace && (
                    <div style={{ marginTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      {(sub.status === 'frozen' || sub.isFrozen) ? (
                        <div className="portal-freeze-banner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: 12, padding: '10px 14px' }}>
                          <span style={{ color: '#bae6fd', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Snowflake size={14} style={{ color: '#38bdf8' }} />
                            <span>الاشتراك مجمّد حتى <strong>{sub.freezeEndDate || '—'}</strong> ({sub.freezeReason || 'امتحانات/سفر'})</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleClientUnfreeze(sub)}
                            style={{
                              background: 'linear-gradient(135deg, #16a34a, #22c55e)',
                              color: '#fff', border: 'none', borderRadius: 10, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Cairo, sans-serif',
                              display: 'inline-flex', alignItems: 'center', gap: 4
                            }}
                          >
                            <Flame size={13} />
                            <span>استئناف الاشتراك الآن</span>
                          </button>
                        </div>
                      ) : sub.isActive ? (
                        (() => {
                          const quota = getMonthlyFreezeQuota(sub);
                          return (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '8px 14px' }}>
                              <span style={{ color: '#93c5fd', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Snowflake size={13} style={{ color: '#38bdf8' }} />
                                <span>رصيد التجميد المتاح هذا الشهر: <strong>{quota.remainingDays}</strong> من 10 أيام</span>
                              </span>
                              {quota.canFreeze ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenClientFreeze(sub)}
                                  style={{
                                    background: 'rgba(56, 189, 248, 0.15)',
                                    color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.35)',
                                    borderRadius: 10, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Cairo, sans-serif',
                                    display: 'inline-flex', alignItems: 'center', gap: 4
                                  }}
                                >
                                  <Snowflake size={13} />
                                  <span>تجميد الاشتراك مؤقتاً</span>
                                </button>
                              ) : (
                                <span style={{ color: '#94a3b8', fontSize: 11 }}>تم استهلاك رصيد الشهر</span>
                              )}
                            </div>
                          );
                        })()
                      ) : null}
                    </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sessions History */}
        {sessions.length > 0 && (
          <div>
            <h3 style={{ color: '#60a5fa', fontSize: 16, fontWeight: 800, margin: '14px 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Calendar size={17} style={{ color: '#38bdf8' }} />
              <span>سجل الزيارات والحضور الأخير ({sessions.length})</span>
            </h3>
            <div className="glass-card-subtle" style={{ borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table style={{ width: '100%', minWidth: '450px', borderCollapse: 'collapse', textAlign: 'right', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'rgba(30, 41, 59, 0.9)', color: '#93c5fd' }}>
                      <th style={{ padding: '10px 12px' }}>#</th>
                      <th style={{ padding: '10px 12px' }}>الباقة / النشاط</th>
                      <th style={{ padding: '10px 12px' }}>التاريخ</th>
                      <th style={{ padding: '10px 12px' }}>وقت الدخول</th>
                      <th style={{ padding: '10px 12px' }}>المدة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.slice(0, 10).map((s, idx) => (
                      <tr key={s.id || idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{idx + 1}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: '#fff' }}>{s.packageName || 'حضور'}</td>
                        <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>{formatDate(s.date || s.checkIn)}</td>
                        <td style={{ padding: '10px 12px', color: '#60a5fa' }}>{formatDateTime(s.checkIn || s.date)}</td>
                        <td style={{ padding: '10px 12px', color: '#34d399' }}>{s.durationMinutes ? `${s.durationMinutes} دقيقة` : 'حصة معتمدة'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </main>
      {/* Self-Service Freeze Modal */}
      {freezeSubModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
        }}>
          <div style={{
            background: 'rgba(15, 32, 64, 0.98)', border: '1.5px solid rgba(56, 189, 248, 0.4)',
            borderRadius: 24, padding: '28px 24px', width: '100%', maxWidth: 440, boxShadow: '0 30px 80px rgba(0,0,0,0.9)',
            fontFamily: 'Cairo, sans-serif', textAlign: 'right'
          }}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 10px', color: '#38bdf8'
              }}>
                <Snowflake size={28} />
              </div>
              <h3 style={{ margin: 0, color: '#ffffff', fontSize: 18, fontWeight: 900 }}>
                تجميد الاشتراك مؤقتاً
              </h3>
              <p style={{ margin: '4px 0 0', color: '#93c5fd', fontSize: 12 }}>
                {freezeSubModal.packageName}
              </p>
            </div>

            {(() => {
              const quota = getMonthlyFreezeQuota(freezeSubModal);
              return (
                <form onSubmit={handleConfirmClientFreeze} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: 12, padding: '10px 14px', fontSize: 12, color: '#e2e8f0', lineHeight: 1.6 }}>
                    <strong>سياسة التجميد المعتمدة:</strong><br />
                    • الحد الأدنى للتجميد: <strong>3 أيام</strong> للمرة الواحدة.<br />
                    • الحد الأقصى: <strong>10 أيام</strong> شهرياً (يمكنك تقسيمها على مرتين أو 3 مرات خلال الشهر).<br />
                    • رصيد التجميد المتاح لك حالياً: <strong>{quota.remainingDays} من 10 أيام</strong> (تم استهلاك {quota.usedThisMonth} يوم هذا الشهر).
                  </div>

                  <div>
                    <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                      حدد عدد أيام التجميد ({3} إلى {quota.remainingDays} يوم):
                    </label>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                      {Array.from(new Set([3, 4, 5, 7, quota.remainingDays]))
                        .filter(d => d >= 3 && d <= quota.remainingDays)
                        .sort((a, b) => a - b)
                        .map(d => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setFreezeDays(d)}
                          style={{
                            flex: 1, minWidth: '60px', padding: '8px', borderRadius: 8,
                            background: freezeDays === d ? '#0284c7' : 'rgba(7, 17, 31, 0.8)',
                            color: '#fff', border: freezeDays === d ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.1)',
                            fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'Cairo, sans-serif'
                          }}
                        >
                          {d} {d === 3 ? 'أيام (أدنى)' : d === quota.remainingDays ? 'يوم (أقصى متاح)' : 'أيام'}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      min="3"
                      max={quota.remainingDays}
                      value={freezeDays}
                      onChange={e => setFreezeDays(Math.max(3, Math.min(quota.remainingDays, parseInt(e.target.value, 10) || 3)))}
                      required
                      style={{
                        width: '100%', background: 'rgba(7, 17, 31, 0.85)',
                        border: '1px solid rgba(56,189,248,0.35)', borderRadius: 10,
                        padding: '10px 12px', color: '#ffffff', fontSize: 14,
                        fontFamily: 'Cairo, sans-serif', outline: 'none', boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                      سبب التجميد:
                    </label>
                    <select
                      value={freezeReason}
                      onChange={e => setFreezeReason(e.target.value)}
                      style={{
                        width: '100%', background: 'rgba(7, 17, 31, 0.85)',
                        border: '1px solid rgba(56,189,248,0.35)', borderRadius: 10,
                        padding: '10px 12px', color: '#ffffff', fontSize: 13,
                        fontFamily: 'Cairo, sans-serif', outline: 'none', boxSizing: 'border-box'
                      }}
                    >
                      <option value="فترة امتحانات">فترة امتحانات</option>
                      <option value="سفر مؤقت">سفر مؤقت</option>
                      <option value="عذر صحي / إجازة">عذر صحي / إجازة</option>
                      <option value="ظروف خاصة">ظروف خاصة</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                    <button
                      type="button"
                      onClick={() => setFreezeSubModal(null)}
                      style={{
                        flex: 1, padding: '11px', borderRadius: 10,
                        background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
                        color: '#94a3b8', fontWeight: 700, cursor: 'pointer', fontFamily: 'Cairo, sans-serif'
                      }}
                    >
                      إلغاء
                    </button>
                    <button
                      type="submit"
                      disabled={freezeLoading}
                      style={{
                        flex: 1.6, padding: '11px', borderRadius: 10,
                        background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
                        color: '#ffffff', border: 'none', fontWeight: 900, fontSize: 14,
                        cursor: freezeLoading ? 'not-allowed' : 'pointer', fontFamily: 'Cairo, sans-serif',
                        boxShadow: '0 4px 16px rgba(2, 132, 199, 0.4)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6
                      }}
                    >
                      {freezeLoading ? 'جاري التجميد...' : <><Snowflake size={15} /> تأكيد تجميد اشتراكي</>}
                    </button>
                  </div>
                </form>
              );
            })()}
          </div>
        </div>
      )}

      {/* Quality & Feedback Modal */}
      <ClientFeedbackModal
        open={feedbackModalOpen}
        onClose={() => setFeedbackModalOpen(false)}
        initialClientName={client?.name || ''}
        initialClientPhone={client?.phone || ''}
        memberId={client?.memberId || ''}
        defaultService="ورك سبيس ومساحة عمل"
        source="portal"
        onFeedbackSubmitted={() => {
          setHasSubmittedFeedback(true);
        }}
      />

      {/* Client Wallet Security OTP Modal */}
      {showOtpModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.82)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16
        }}>
          <div style={{
            background: 'linear-gradient(180deg, #131d36 0%, #0a0f1d 100%)',
            border: '1.5px solid rgba(168, 85, 247, 0.45)',
            borderRadius: 24,
            padding: '26px 20px',
            maxWidth: 400,
            width: '100%',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7), 0 0 30px rgba(168, 85, 247, 0.25)',
            textAlign: 'center',
            position: 'relative'
          }}>
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setShowOtpModal(false)}
              style={{
                position: 'absolute',
                top: 16,
                left: 16,
                background: 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                borderRadius: '50%',
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#cbd5e1',
                cursor: 'pointer'
              }}
            >
              <X size={18} />
            </button>

            {/* Shield Icon Header */}
            <div style={{
              width: 66,
              height: 66,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.25), rgba(126, 34, 206, 0.45))',
              border: '2px solid rgba(168, 85, 247, 0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px',
              boxShadow: '0 0 25px rgba(168, 85, 247, 0.4)'
            }}>
              <ShieldCheck size={36} color="#d8b4fe" />
            </div>

            <h3 style={{ color: '#ffffff', fontSize: 18, fontWeight: 900, margin: '0 0 4px' }}>
              🔐 كود الدفع المؤقت للكافيه
            </h3>
            <p style={{ color: '#94a3b8', fontSize: 12, margin: '0 0 16px', lineHeight: 1.5 }}>
              أملِ هذا الكود للباريستا لإتمام الخصم من محفظتك بأمان
            </p>

            {/* State 1: Generating */}
            {generatingOtp ? (
              <div style={{ padding: '26px 0' }}>
                <Spinner size="lg" />
                <p style={{ color: '#c084fc', marginTop: 12, fontSize: 13, fontWeight: 700 }}>
                  جارٍ توليد كود أمان جديد...
                </p>
              </div>
            ) : (() => {
              const otp = client?.activeWalletOtp;
              const isConsumed = otp?.used;
              const isExpired = !otp?.expiresAt || Date.now() > Number(otp.expiresAt);
              const isValid = otp?.code && !isConsumed && !isExpired;

              if (isValid) {
                const digits = String(otp.code).split('');
                const minutes = Math.floor(otpCountdown / 60);
                const seconds = otpCountdown % 60;
                const timeFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

                return (
                  <div>
                    {Number(otp.requestedAmount) > 0 && (
                      <div style={{
                        background: 'rgba(245, 158, 11, 0.15)',
                        border: '1px solid rgba(245, 158, 11, 0.4)',
                        borderRadius: 12,
                        padding: '8px 14px',
                        marginBottom: 14,
                        color: '#fcd34d',
                        fontSize: 13,
                        fontWeight: 900
                      }}>
                        طلب خصم من كافيه TFG بقيمة: <strong style={{ color: '#ffffff' }}>{formatCurrency(otp.requestedAmount)}</strong>
                      </div>
                    )}
                    {/* Digits Display */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'center',
                      gap: 10,
                      marginBottom: 16,
                      direction: 'ltr'
                    }}>
                      {digits.map((d, i) => (
                        <div
                          key={i}
                          style={{
                            width: 54,
                            height: 62,
                            borderRadius: 14,
                            background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.25), rgba(88, 28, 135, 0.45))',
                            border: '2px solid #c084fc',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 32,
                            fontWeight: 900,
                            color: '#ffffff',
                            boxShadow: '0 0 16px rgba(168, 85, 247, 0.45)'
                          }}
                        >
                          {d}
                        </div>
                      ))}
                    </div>

                    {/* Live Countdown & Status */}
                    <div style={{
                      background: 'rgba(16, 185, 129, 0.12)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      borderRadius: 12,
                      padding: '10px 14px',
                      marginBottom: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399', display: 'inline-block', boxShadow: '0 0 8px #34d399' }} />
                        <span style={{ color: '#34d399', fontSize: 12, fontWeight: 800 }}>
                          كود نشط وجاهز للاستخدام
                        </span>
                      </div>
                      <div style={{
                        color: otpCountdown < 60 ? '#f87171' : '#fcd34d',
                        fontSize: 13,
                        fontWeight: 900,
                        fontVariantNumeric: 'tabular-nums'
                      }}>
                        ⏳ متبقي {timeFormatted}
                      </div>
                    </div>
                  </div>
                );
              }

              if (isConsumed) {
                return (
                  <div style={{
                    background: 'rgba(16, 185, 129, 0.12)',
                    border: '1.5px solid rgba(16, 185, 129, 0.4)',
                    borderRadius: 14,
                    padding: '18px 14px',
                    marginBottom: 16
                  }}>
                    <CheckCircle2 size={32} color="#34d399" style={{ margin: '0 auto 8px' }} />
                    <h4 style={{ margin: '0 0 4px', color: '#ffffff', fontSize: 14, fontWeight: 900 }}>
                      تم تأكيد وخصم الطلب بنجاح! ✓
                    </h4>
                    <p style={{ margin: 0, color: '#a7f3d0', fontSize: 11.5 }}>
                      تم حرق الكود فورياً بنجاح لحماية رصيد محفظتك.
                    </p>
                  </div>
                );
              }

              // Expired or none
              return (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1.5px solid rgba(239, 68, 68, 0.35)',
                  borderRadius: 14,
                  padding: '16px 14px',
                  marginBottom: 16
                }}>
                  <Clock size={28} color="#f87171" style={{ margin: '0 auto 6px' }} />
                  <h4 style={{ margin: '0 0 4px', color: '#ffffff', fontSize: 14, fontWeight: 800 }}>
                    انتهت صلاحية الكود المؤقت (5 دقائق)
                  </h4>
                  <p style={{ margin: 0, color: '#fca5a5', fontSize: 11.5 }}>
                    اضغط بالأسفل لتوليد كود جديد في ثوانٍ.
                  </p>
                </div>
              );
            })()}

            {/* Security Guarantee Note */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 12,
              padding: '10px 12px',
              marginBottom: 16,
              textAlign: 'right',
              fontSize: 11,
              color: '#cbd5e1',
              lineHeight: 1.5
            }}>
              🛡️ <strong>حماية 100%:</strong> الكود يُحرق فورياً لمرة واحدة فقط. لا يستطيع أي موظف السحب من رصيدك إلا بإعطائه هذا الرمز شخصياً.
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              <Button
                variant="ghost"
                onClick={() => setShowOtpModal(false)}
                style={{ flex: 1, padding: 10 }}
              >
                إغلاق ✕
              </Button>
              <Button
                variant="primary"
                onClick={handleGenerateOtp}
                disabled={generatingOtp}
                style={{
                  flex: 2,
                  padding: 10,
                  fontWeight: 800,
                  background: 'linear-gradient(135deg, #7e22ce, #9333ea)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                }}
              >
                <RotateCw size={14} className={generatingOtp ? 'spin' : ''} />
                <span>توليد كود جديد ⚡</span>
              </Button>
            </div>
          </div>
        </div>
      )}


    </div>
  );
}