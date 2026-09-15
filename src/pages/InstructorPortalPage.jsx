import React, { useState, useEffect, useMemo } from 'react';
import { getInstructors, getAllSubscriptions, getPackages, getClients, setInstructorPin, verifyInstructorPin, getCourseSchedules, getAnnouncements, getSystemInfo, watchSystemInfo } from '../services/db';
import { Card, Button, Input, Badge, Spinner } from '../components/ui';
import { exportToExcel } from '../utils/excelExport';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  GraduationCap, Phone, Key, Lock, Unlock, ShieldCheck,
  AlertCircle, Eye, EyeOff, Home, ArrowRight, Calendar,
  Users, CheckCircle2, Sparkles, LogOut, Clock, FileSpreadsheet,
  MessageSquare, X, Megaphone, ExternalLink, ChevronRight, ChevronLeft, Flame, Tag
} from 'lucide-react';

export default function InstructorPortalPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [instructors, setInstructors] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [packages, setPackages] = useState([]);
  const [clients, setClients] = useState([]);
  const [courseSchedules, setCourseSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [systemInfo, setSystemInfo] = useState({ name: 'THE FIRST GROUP', logoUrl: '' });

  // Selected Instructor & PIN Auth
  const [selectedInstructorId, setSelectedInstructorId] = useState(
    searchParams.get('id') || localStorage.getItem('tfg_current_instructor') || ''
  );
  const [loginPhoneInput, setLoginPhoneInput] = useState('');
  const [phoneLoginError, setPhoneLoginError] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // First time PIN setup state
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [setupError, setSetupError] = useState('');
  const [setupLoading, setSetupLoading] = useState(false);

  // Regular login PIN state
  const [inputPin, setInputPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [showPin, setShowPin] = useState(false);

  const [activeTab, setActiveTab] = useState('schedule'); // 'students' | 'settlements' | 'packages'
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [rosterModalSchedule, setRosterModalSchedule] = useState(null); // 'all' | 'unsettled' | 'settled'

  // Announcements & Auto-Rotation State
  const [announcements, setAnnouncements] = useState([]);
  const [currentAdIndex, setCurrentAdIndex] = useState(0);
  const [isAdPaused, setIsAdPaused] = useState(false);
  const touchStartX = React.useRef(null);
  const touchEndX = React.useRef(null);
  const resumeTimerRef = React.useRef(null);

  // Load Realtime Data
  useEffect(() => {
    const unsubSys = watchSystemInfo ? watchSystemInfo(setSystemInfo) : () => {};
    getSystemInfo().then(setSystemInfo).catch(() => {});

    const unsubInst = getInstructors((data) => {
      setInstructors(data);
      setLoading(false);
    });
    const unsubSubs = getAllSubscriptions((data) => setSubscriptions(data));
    const unsubPkgs = getPackages((data) => setPackages(data));
    const unsubClts = getClients((data) => setClients(data));
    const unsubSched = getCourseSchedules((data) => setCourseSchedules(data));
    const unsubAnnounce = getAnnouncements((data) => setAnnouncements(data || []));

    return () => {
      if (unsubSys) unsubSys();
      unsubInst();
      unsubSubs();
      unsubPkgs();
      unsubClts();
      unsubSched();
      if (unsubAnnounce) unsubAnnounce();
    };
  }, []);

  const instructorAnnouncements = useMemo(() => {
    return (announcements || []).filter(a => a.isActive !== false && (a.target === 'instructors' || a.target === 'all'));
  }, [announcements]);

  const rotationSeconds = useMemo(() => {
    if (systemInfo?.bannerRotationSeconds !== undefined) {
      const parsed = Number(systemInfo.bannerRotationSeconds);
      return isNaN(parsed) ? 5 : parsed;
    }
    return 5;
  }, [systemInfo?.bannerRotationSeconds]);

  // Auto-rotate announcement banners for instructors
  useEffect(() => {
    if (instructorAnnouncements.length <= 1 || isAdPaused || rotationSeconds <= 0) return;

    const timer = setInterval(() => {
      setCurrentAdIndex(prev => (prev + 1) % instructorAnnouncements.length);
    }, rotationSeconds * 1000);

    return () => clearInterval(timer);
  }, [instructorAnnouncements.length, isAdPaused, rotationSeconds]);

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
        setCurrentAdIndex(prev => (prev + 1) % instructorAnnouncements.length);
      } else if (deltaX < -40) {
        // Swiped Right -> Previous banner
        setCurrentAdIndex(prev => (prev - 1 + instructorAnnouncements.length) % instructorAnnouncements.length);
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

  // Handle URL param or auto-select
  useEffect(() => {
    const paramId = searchParams.get('id');
    const paramPhone = searchParams.get('phone');
    if (paramId && instructors.some(i => i.id === paramId)) {
      setSelectedInstructorId(paramId);
    } else if (paramPhone) {
      const cleanPhone = paramPhone.replace(/\D/g, '');
      const found = instructors.find(i => (i.phone || '').replace(/\D/g, '').includes(cleanPhone));
      if (found) {
        setSelectedInstructorId(found.id);
      }
    }
  }, [searchParams, instructors]);

  const currentInstructor = useMemo(() => {
    return instructors.find(i => i.id === selectedInstructorId) || null;
  }, [instructors, selectedInstructorId]);

  // Instructor Filtered Course Schedules
  const instructorSchedules = useMemo(() => {
    if (!currentInstructor) return [];
    const instName = (currentInstructor.name || '').trim().toLowerCase();
    const instSubject = (currentInstructor.subject || '').trim().toLowerCase();

    return courseSchedules.filter(s => {
      const sInst = (s.instructorName || '').trim().toLowerCase();
      const sCourse = (s.courseName || '').trim().toLowerCase();
      if (sInst && instName && (sInst.includes(instName) || instName.includes(sInst))) return true;
      if (instSubject && sCourse.includes(instSubject)) return true;
      return false;
    });
  }, [courseSchedules, currentInstructor]);

  // Check saved PIN session
  useEffect(() => {
    if (currentInstructor) {
      if (!currentInstructor.pinCode) {
        // If instructor has no PIN set yet, they must setup
        setIsAuthenticated(false);
      } else {
        const savedAuth = localStorage.getItem(`tfg_inst_auth_${currentInstructor.id}`);
        if (savedAuth === 'true') {
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
        }
      }
    } else {
      setIsAuthenticated(false);
    }
  }, [currentInstructor]);

  // Handler: First Time PIN Setup
  const handleSaveInitialPin = async (e) => {
    e.preventDefault();
    if (!currentInstructor) return;
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
      await setInstructorPin(currentInstructor.id, cleanPin);
      localStorage.setItem('tfg_current_instructor', currentInstructor.id);
      localStorage.setItem(`tfg_inst_auth_${currentInstructor.id}`, 'true');
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
    if (!currentInstructor) return;
    try {
      setPinError('');
      const valid = await verifyInstructorPin(currentInstructor.id, String(inputPin).trim());
      if (valid) {
        setIsAuthenticated(true);
        localStorage.setItem('tfg_current_instructor', currentInstructor.id);
        localStorage.setItem(`tfg_inst_auth_${currentInstructor.id}`, 'true');
      } else {
        setPinError('كلمة المرور غير صحيحة، يرجى التأكد والمحاولة مرة أخرى');
      }
    } catch {
      setPinError('حدث خطأ أثناء التحقق، يرجى المحاولة مرة أخرى');
    }
  };

  const handleLogout = () => {
    if (currentInstructor) {
      localStorage.removeItem(`tfg_inst_auth_${currentInstructor.id}`);
    }
    localStorage.removeItem('tfg_current_instructor');
    setIsAuthenticated(false);
    setSelectedInstructorId('');
    setInputPin('');
    setPinError('');
    setNewPin('');
    setConfirmPin('');
  };

  // Maps for fast lookup
  const clientMap = useMemo(() => {
    const map = {};
    clients.forEach(c => { map[c.id] = c; });
    return map;
  }, [clients]);

  const packageMap = useMemo(() => {
    const map = {};
    packages.forEach(p => { map[p.id] = p; });
    return map;
  }, [packages]);

  // Enriched subscriptions
  const enrichedSubscriptions = useMemo(() => {
    return subscriptions.map(sub => {
      const pkg = packageMap[sub.packageId] || {};
      const client = clientMap[sub.clientId] || {};

      const instructorName = sub.instructorName || pkg.instructorName || '';
      const shareType = sub.instructorShareType || pkg.instructorShareType || 'percentage';
      const shareValue = Number(sub.instructorShareValue ?? pkg.instructorShareValue ?? 0);
      const price = Number(sub.packagePrice ?? pkg.price ?? 0);

      let shareAmount = 0;
      if (shareType === 'percentage') {
        shareAmount = (price * shareValue) / 100;
      } else {
        shareAmount = shareValue;
      }

      return {
        ...sub,
        clientName: client.name || sub.clientName || 'بدون اسم',
        clientPhone: client.phone || sub.clientPhone || '',
        clientMemberId: client.memberId || sub.clientMemberId || '',
        packageName: sub.packageName || pkg.name || 'كورس تعليمي',
        instructorName,
        shareType,
        shareValue,
        shareAmount,
        price,
        isSettled: !!sub.instructorSettled
      };
    });
  }, [subscriptions, packageMap, clientMap]);

  // Packages belonging to this instructor
  const instructorPackages = useMemo(() => {
    if (!currentInstructor) return [];
    const name = (currentInstructor.name || '').trim().toLowerCase();
    const subject = (currentInstructor.subject || '').trim().toLowerCase();

    return packages.filter(p => {
      if (p.instructorId === currentInstructor.id) return true;
      const pInstName = (p.instructorName || '').trim().toLowerCase();
      if (pInstName && name && (pInstName.includes(name) || name.includes(pInstName))) return true;
      if (subject && (p.name || '').toLowerCase().includes(subject)) return true;
      return false;
    });
  }, [packages, currentInstructor]);

  // Subscriptions belonging to this instructor
  const instructorSubs = useMemo(() => {
    if (!currentInstructor) return [];
    const name = (currentInstructor.name || '').trim().toLowerCase();
    const subject = (currentInstructor.subject || '').trim().toLowerCase();
    const schedIds = new Set(instructorSchedules.map(s => s.id));
    const pkgIds = new Set(instructorPackages.map(p => p.id));

    return enrichedSubscriptions.filter(sub => {
      if (sub.status === 'cancelled') return false;
      // 1. Direct Instructor ID match
      if (sub.instructorId === currentInstructor.id) return true;

      // 2. Schedule ID match from this instructor's schedule
      if (sub.scheduleId && schedIds.has(sub.scheduleId)) return true;

      // 3. Package ID match belonging to this instructor
      if (sub.packageId && pkgIds.has(sub.packageId)) return true;

      // 4. Instructor Name match
      const subInstName = (sub.instructorName || '').trim().toLowerCase();
      if (subInstName && name && (subInstName.includes(name) || name.includes(subInstName))) return true;

      // 5. Subject match in subscription package name
      if (subject && (sub.packageName || '').toLowerCase().includes(subject)) return true;

      return false;
    });
  }, [enrichedSubscriptions, currentInstructor, instructorSchedules, instructorPackages]);

  // Calculate KPIs
  const stats = useMemo(() => {
    let pendingAmount = 0;
    let settledAmount = 0;
    let pendingCount = 0;
    let settledCount = 0;

    instructorSubs.forEach(sub => {
      if (sub.isSettled) {
        settledAmount += sub.shareAmount;
        settledCount++;
      } else {
        pendingAmount += sub.shareAmount;
        pendingCount++;
      }
    });

    return {
      totalStudents: instructorSubs.length,
      pendingAmount,
      settledAmount,
      pendingCount,
      settledCount,
      packagesCount: instructorPackages.length
    };
  }, [instructorSubs, instructorPackages]);

  // Filtered Students
  const filteredSubs = useMemo(() => {
    return instructorSubs.filter(sub => {
      const matchSearch =
        (sub.clientName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (sub.packageName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (sub.clientPhone || '').includes(searchQuery);

      let matchStatus = true;
      if (statusFilter === 'unsettled') matchStatus = !sub.isSettled;
      if (statusFilter === 'settled') matchStatus = !!sub.isSettled;

      return matchSearch && matchStatus;
    });
  }, [instructorSubs, searchQuery, statusFilter]);

  // Format currency
  const formatCurrency = (num) => `${(Number(num) || 0).toLocaleString('ar-EG-u-nu-latn')} ج.م`;

  // Format Date
  const formatDate = (val) => {
    if (!val) return '-';
    const d = val.toDate ? val.toDate() : new Date(val);
    return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // Export Excel
  const handleExportExcel = () => {
    if (!currentInstructor) return;
    const headers = ['#', 'اسم الطالب', 'رقم الهاتف', 'اسم الكورس / الباقة', 'سعر الباقة', 'الحصص / الساعات المتبقية', 'تاريخ الاشتراك', 'مستحق المدرس', 'حالة المحاسبة'];
    const rows = filteredSubs.map((s, idx) => {
      return [
        idx + 1,
        s.clientName || 'بدون اسم',
        s.clientPhone || '-',
        s.packageName || 'كورس مخصص',
        `${s.price || 0} ج.م`,
        s.packageType === 'workspace' ? `${(s.totalHours || 0) - (s.hoursUsed || 0)} ساعة` : `${(s.packageSessions || 0) - (s.sessionsUsed || 0)} حصة`,
        formatDate(s.date),
        `${s.shareAmount} ج.م`,
        s.isSettled ? 'تمت المحاسبة ✅' : 'مستحق ⏳'
      ];
    });

    exportToExcel(`كشف_طلاب_الأستاذ_${currentInstructor.name}_${new Date().toISOString().split('T')[0]}`, headers, rows);
  };

  // 0. Top Level Loading Screen
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'radial-gradient(ellipse at 70% 10%, #0c2044 0%, #07101e 55%, #030812 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        fontFamily: 'Cairo, sans-serif'
      }}>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 90, height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img
              src="/logo.png"
              alt="logo"
              onError={(e) => { e.target.onerror = null; e.target.src = '/logo.png'; }}
              style={{ width: '100%', height: '100%', objectFit: 'contain', mixBlendMode: 'screen', filter: 'drop-shadow(0 0 20px rgba(56,189,248,0.65))' }}
            />
          </div>
          <Spinner size="lg" />
          <p style={{ color: '#93c5fd', fontSize: 14, fontWeight: 700, margin: 0 }}>جاري فتح بوابة الأستاذ والمحاضرين...</p>
        </div>
      </div>
    );
  }

  // 1. Private Instructor Phone Login Screen (100% Confidential - No public names)
  if (!currentInstructor) {
    const handlePhoneLogin = (e) => {
      e.preventDefault();
      setPhoneLoginError('');
      const cleanInput = loginPhoneInput.trim().replace(/\D/g, '');
      if (!cleanInput) {
        return setPhoneLoginError('يرجى كتابة رقم الهاتف المسجل في السنتر');
      }

      const found = instructors.find(i => {
        const p = (i.phone || '').trim().replace(/\D/g, '');
        return p.includes(cleanInput) || cleanInput.includes(p) || i.id === loginPhoneInput.trim();
      });

      if (found) {
        setSelectedInstructorId(found.id);
        localStorage.setItem('tfg_current_instructor', found.id);
      } else {
        setPhoneLoginError('⚠️ رقم الهاتف غير مسجل في قائمة المحاضرين، يرجى مراجعة إدارة السنتر');
      }
    };

    return (
      <div style={{
        minHeight: '100vh',
        background: 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        fontFamily: 'Cairo, sans-serif'
      }}>
        <div className="glass-card" style={{
          padding: '40px 32px',
          width: '100%',
          maxWidth: 440,
          textAlign: 'center'
        }}>
          <div style={{ width: 110, height: 110, margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img
              src="/logo.png"
              alt="logo"
              onError={(e) => { e.target.onerror = null; e.target.src = '/logo.png'; }}
              style={{ width: '100%', height: '100%', objectFit: 'contain', mixBlendMode: 'screen', filter: 'drop-shadow(0 0 20px rgba(56,189,248,0.65))' }}
            />
          </div>

          <h1 style={{ color: '#ffffff', fontWeight: 900, fontSize: 22, margin: '0 0 6px' }}>
            THE FIRST GROUP
          </h1>
          <div className="glass-badge" style={{ margin: '0 auto 24px' }}>
            <GraduationCap size={15} style={{ color: '#38bdf8' }} />
            <span>بوابة الأساتذة والمحاضرين</span>
          </div>

          <form onSubmit={handlePhoneLogin} style={{ display: 'flex', flexDirection: 'column', gap: 18, textAlign: 'right' }}>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#cbd5e1', fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
                <Phone size={14} style={{ color: '#38bdf8' }} />
                أدخل رقم هاتفك المسجل في السنتر:
              </label>
              <input
                type="tel"
                placeholder="مثال: 01012345678"
                value={loginPhoneInput}
                onChange={e => { setLoginPhoneInput(e.target.value); setPhoneLoginError(''); }}
                className="glass-input"
                style={{
                  textAlign: 'center',
                  fontSize: 17,
                  direction: 'ltr',
                  letterSpacing: '1px'
                }}
                autoFocus
              />
            </div>

            {phoneLoginError && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 12,
                padding: '10px 14px',
                color: '#fca5a5',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                <AlertCircle size={16} style={{ color: '#f87171', flexShrink: 0 }} />
                <span>{phoneLoginError}</span>
              </div>
            )}

            <button
              type="submit"
              className="glass-btn-primary"
              style={{ width: '100%', marginTop: 4 }}
            >
              <Lock size={16} />
              <span>تسجيل الدخول للحساب</span>
            </button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => navigate('/')}
              style={{
                color: 'rgba(200, 220, 245, 0.7)',
                marginTop: 4,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6
              }}
            >
              <ArrowRight size={14} />
              <span>العودة للرئيسية</span>
            </Button>
          </form>
        </div>
      </div>
    );
  }

  // 2. FIRST TIME SETUP SCREEN (when instructor has NO password set yet)
  if (!currentInstructor.pinCode) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        fontFamily: 'Cairo, sans-serif'
      }}>
        <div className="glass-card" style={{
          padding: '40px 32px',
          width: '100%',
          maxWidth: 440,
          textAlign: 'center'
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

          <h2 style={{ color: '#ffffff', fontWeight: 900, fontSize: 22, margin: '0 0 6px' }}>
            مرحباً بك، أستاذ {currentInstructor.name}
          </h2>
          <p style={{ color: '#93c5fd', fontSize: 13, margin: '0 0 18px', fontWeight: 600 }}>
            {currentInstructor.subject || 'مدرس معتمد'}
          </p>

          <div style={{
            background: 'rgba(56, 189, 248, 0.08)',
            border: '1px solid rgba(56, 189, 248, 0.2)',
            borderRadius: 14, padding: '12px 14px', marginBottom: 20, textAlign: 'right'
          }}>
            <p style={{ margin: 0, color: '#e2e8f0', fontSize: 13, lineHeight: 1.6, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <ShieldCheck size={18} style={{ color: '#38bdf8', flexShrink: 0, marginTop: 2 }} />
              <span>
                <strong>تعيين كلمة المرور الخاصة بك لأول مرة:</strong><br />
                يرجى كتابة كلمة مرور سرية لحماية بوابتك وحساباتك للاستخدام الدائم.
              </span>
            </p>
          </div>

          {setupError && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 12, padding: '10px 14px', color: '#fca5a5', fontSize: 13, marginBottom: 16,
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
                id="toggle-show-pin"
                checked={showPin}
                onChange={() => setShowPin(!showPin)}
                style={{ cursor: 'pointer' }}
              />
              <label htmlFor="toggle-show-pin" style={{ color: '#93c5fd', fontSize: 12, cursor: 'pointer', userSelect: 'none' }}>
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

  // 3. REGULAR LOGIN SCREEN (when instructor already has a PIN)
  if (!isAuthenticated) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        fontFamily: 'Cairo, sans-serif'
      }}>
        <div className="glass-card" style={{
          padding: '40px 32px',
          width: '100%',
          maxWidth: 420,
          textAlign: 'center'
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

          <h2 style={{ color: '#ffffff', fontWeight: 900, fontSize: 22, margin: '0 0 6px' }}>
            الأستاذ: {currentInstructor.name}
          </h2>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#93c5fd', fontSize: 13, margin: '0 0 18px', fontWeight: 600 }}>
            <span>{currentInstructor.subject || 'مدرس معتمد'}</span>
            {currentInstructor.phone && (
              <>
                <span>•</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Phone size={12} style={{ color: '#38bdf8' }} />
                  {currentInstructor.phone}
                </span>
              </>
            )}
          </div>

          <p style={{ color: 'rgba(200, 220, 245, 0.8)', fontSize: 14, margin: '0 0 16px' }}>
            ادخل كلمة المرور الخاصة بك للدخول:
          </p>

          {pinError && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 12, padding: '10px 14px', color: '#fca5a5', fontSize: 13, marginBottom: 16,
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

            <div style={{ marginTop: 12, textAlign: 'center' }}>
              <p style={{ color: '#64748b', fontSize: 12, margin: '0 0 12px' }}>
                نسيت كلمة المرور؟ تواصل مع الإدارة لإعادة تهيئة حسابك.
              </p>

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

  // 4. Active Authenticated Dashboard
  return (
    <div className="instructor-portal-container" style={{
      minHeight: '100vh',
      background: 'transparent',
      color: '#ffffff',
      fontFamily: 'Cairo, sans-serif',
      padding: '24px 20px 60px'
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 22 }}>

        {/* Top Header */}
        <div style={{
          background: 'rgba(13, 27, 54, 0.82)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          borderRadius: 22,
          padding: '14px 20px',
          position: 'sticky', top: 0, zIndex: 30
        }}>
          {/* Desktop View */}
          <div className="portal-header-desktop">
            {/* Right: Center Brand Logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 180 }}>
              <div style={{
                width: 50, height: 50, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <img
                  src="/logo.png"
                  alt="logo"
                  onError={(e) => { e.target.onerror = null; e.target.src = '/logo.png'; }}
                  style={{
                    width: '100%', height: '100%', objectFit: 'contain',
                    mixBlendMode: 'screen', filter: 'drop-shadow(0 0 14px rgba(56,189,248,0.6))'
                  }}
                />
              </div>
              <div>
                <p style={{ margin: 0, color: '#ffffff', fontWeight: 900, fontSize: 15, letterSpacing: '0.3px' }}>
                  THE FIRST GROUP
                </p>
                <span style={{ color: '#38bdf8', fontSize: 11, fontWeight: 700 }}>
                  بوابة الأساتذة والمحاضرين
                </span>
              </div>
            </div>

            {/* Center: Instructor Name & Details */}
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
                <GraduationCap size={18} style={{ color: '#38bdf8' }} />
                <span style={{ fontSize: 16, fontWeight: 900, color: '#ffffff' }}>
                  الأستاذ: {currentInstructor.name}
                </span>
              </div>

              <span style={{
                background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
                color: '#ffffff', fontSize: 12, fontWeight: 900,
                padding: '3px 12px', borderRadius: 20,
                border: '1px solid rgba(147, 197, 253, 0.5)',
                boxShadow: '0 2px 8px rgba(37, 99, 235, 0.4)'
              }}>
                {currentInstructor.subject || 'مدرس معتمد'}
              </span>

              {currentInstructor.phone && (
                <span style={{ color: '#93c5fd', fontSize: 13, fontWeight: 700, direction: 'ltr', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Phone size={12} style={{ color: '#38bdf8' }} />
                  {currentInstructor.phone}
                </span>
              )}
            </div>

            {/* Left: Logout & Home */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 180, justifyContent: 'flex-end' }}>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleLogout}
                style={{
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: '#fca5a5', fontWeight: 800,
                  display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 12
                }}
              >
                <LogOut size={14} />
                <span>خروج</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => navigate('/')}
                style={{
                  background: 'rgba(56, 189, 248, 0.12)',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  color: '#93c5fd', fontWeight: 700,
                  display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 12
                }}
              >
                <Home size={14} />
                <span>الرئيسية</span>
              </Button>
            </div>
          </div>

          {/* Mobile View */}
          <div className="portal-header-mobile">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <img
                  src="/logo.png"
                  alt="logo"
                  onError={(e) => { e.target.onerror = null; e.target.src = '/logo.png'; }}
                  style={{ width: 38, height: 38, objectFit: 'contain', mixBlendMode: 'screen', filter: 'drop-shadow(0 0 10px rgba(56,189,248,0.6))' }}
                />
                <div>
                  <p style={{ margin: 0, color: '#ffffff', fontWeight: 900, fontSize: 13, lineHeight: 1.2 }}>
                    THE FIRST GROUP
                  </p>
                  <span style={{ color: '#38bdf8', fontSize: 10, fontWeight: 700 }}>
                    بوابة المحاضرين
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => navigate('/')}
                  style={{
                    background: 'rgba(56, 189, 248, 0.12)',
                    border: '1px solid rgba(56, 189, 248, 0.35)',
                    color: '#93c5fd', fontWeight: 700,
                    fontSize: 11, padding: '4px 8px', borderRadius: 8,
                    display: 'flex', alignItems: 'center', gap: 4
                  }}
                >
                  <Home size={13} />
                  <span>الرئيسية</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleLogout}
                  style={{
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    background: 'rgba(239, 68, 68, 0.1)',
                    color: '#fca5a5', fontWeight: 800,
                    fontSize: 11, padding: '4px 8px', borderRadius: 8,
                    display: 'flex', alignItems: 'center', gap: 4
                  }}
                >
                  <LogOut size={13} />
                  <span>خروج</span>
                </Button>
              </div>
            </div>

            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
              background: 'rgba(255, 255, 255, 0.07)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: 12, padding: '7px 12px',
              backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <GraduationCap size={15} style={{ color: '#38bdf8' }} />
                <span style={{ fontSize: 14, fontWeight: 800, color: '#ffffff' }}>
                  {currentInstructor.name}
                </span>
                {currentInstructor.phone && (
                  <span style={{ color: '#93c5fd', fontSize: 11, direction: 'ltr', display: 'inline-flex', alignItems: 'center', gap: 2, marginRight: 4 }}>
                    <Phone size={10} style={{ color: '#38bdf8' }} />
                    {currentInstructor.phone}
                  </span>
                )}
              </div>

              <span style={{
                background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
                color: '#ffffff', fontSize: 11, fontWeight: 800,
                padding: '2px 10px', borderRadius: 12,
                border: '1px solid rgba(147, 197, 253, 0.5)'
              }}>
                {currentInstructor.subject || 'مدرس معتمد'}
              </span>
            </div>
          </div>
        </div>

        {/* Active Announcements / Ads Carousel Banner for Instructors */}
        {instructorAnnouncements.length > 0 && (() => {
          const safeIndex = currentAdIndex % instructorAnnouncements.length;
          const ad = instructorAnnouncements[safeIndex] || instructorAnnouncements[0];

          const catConfig = {
            offer: { label: 'عرض / حافز', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.4)', icon: Flame },
            event: { label: 'فعالية / ورشة عمل', color: '#c084fc', bg: 'rgba(192, 132, 252, 0.15)', border: 'rgba(192, 132, 252, 0.4)', icon: Calendar },
            alert: { label: 'تنبيه إداري هام', color: '#f87171', bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.4)', icon: AlertCircle },
            general: { label: 'إعلان عام', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)', border: 'rgba(56, 189, 248, 0.4)', icon: Megaphone }
          }[ad.category || 'general'] || { label: 'إعلان', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)', border: 'rgba(56, 189, 248, 0.4)', icon: Megaphone };

          const IconComp = catConfig.icon;

          return (
            <div
              className="glass-card"
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
                borderRadius: 20,
                touchAction: 'pan-y',
                userSelect: 'none',
                cursor: instructorAnnouncements.length > 1 ? 'grab' : 'default'
              }}
            >
              {/* Progress Bar for Auto-Rotation */}
              {instructorAnnouncements.length > 1 && rotationSeconds > 0 && (
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
                    key={`ad-progress-inst-${safeIndex}`}
                    style={{
                      height: '100%',
                      background: `linear-gradient(90deg, ${catConfig.color}, #38bdf8)`,
                      width: '100%',
                      animation: !isAdPaused ? `bannerProgressAnimInst ${rotationSeconds}s linear infinite` : 'none',
                      opacity: isAdPaused ? 0.35 : 0.95
                    }}
                  />
                  <style>{`
                    @keyframes bannerProgressAnimInst {
                      from { width: 0%; }
                      to { width: 100%; }
                    }
                  `}</style>
                </div>
              )}

              {/* Header: Category Badge + Navigation Controls */}
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

                {instructorAnnouncements.length > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, direction: 'ltr' }}>
                    <button
                      type="button"
                      onClick={() => handleManualNav((safeIndex - 1 + instructorAnnouncements.length) % instructorAnnouncements.length)}
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
                      {safeIndex + 1} / {instructorAnnouncements.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleManualNav((safeIndex + 1) % instructorAnnouncements.length)}
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
                  <div style={{ width: '100%', maxHeight: 260, overflow: 'hidden', borderRadius: 14, border: '1px solid rgba(255,255,255,0.15)' }}>
                    <img
                      src={ad.imageUrl}
                      alt={ad.title}
                      style={{ width: '100%', height: '100%', maxHeight: 260, objectFit: 'cover', display: 'block', pointerEvents: 'none' }}
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
                {ad.actionLabel && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                    {ad.actionUrl ? (
                      <a
                        href={ad.actionUrl}
                        target={ad.actionUrl.startsWith('http') ? '_blank' : '_self'}
                        rel="noopener noreferrer"
                        className="glass-btn-primary"
                        style={{
                          textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8,
                          fontSize: 13, padding: '8px 18px', borderRadius: 10
                        }}
                      >
                        <span>{ad.actionLabel}</span>
                        <ExternalLink size={14} />
                      </a>
                    ) : (
                      <span className="glass-badge" style={{ fontSize: 13, padding: '6px 14px' }}>
                        {ad.actionLabel}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Dots indicator & swipe tip for multiple ads */}
              {instructorAnnouncements.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {instructorAnnouncements.map((_, idx) => (
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

        {/* KPI Cards */}
        <div className="instructor-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <div className="glass-card-subtle" style={{ padding: '20px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#93c5fd', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
              <Users size={15} style={{ color: '#38bdf8' }} />
              <span>إجمالي الطلاب المشتركين</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#ffffff' }}>{stats.totalStudents} <span style={{ fontSize: 14, color: '#94a3b8' }}>طالب</span></div>
            <div style={{ color: '#60a5fa', fontSize: 12, marginTop: 4 }}>مسجلين في كافة الكورسات</div>
          </div>

          <div className="glass-card-subtle" style={{ padding: '20px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#fcd34d', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
              <Clock size={15} style={{ color: '#fbbf24' }} />
              <span>مستحقات قيد الصرف</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#fbbf24' }}>{formatCurrency(stats.pendingAmount)}</div>
            <div style={{ color: '#fde68a', fontSize: 12, marginTop: 4 }}>عن {stats.pendingCount} اشتراك معتمد</div>
          </div>

          <div className="glass-card-subtle" style={{ padding: '20px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#6ee7b7', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
              <CheckCircle2 size={15} style={{ color: '#34d399' }} />
              <span>إجمالي ما تم تحصيله واستلامه</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#34d399' }}>{formatCurrency(stats.settledAmount)}</div>
            <div style={{ color: '#a7f3d0', fontSize: 12, marginTop: 4 }}>تمت محاسبتك عليها رسمياً</div>
          </div>

          <div className="glass-card-subtle" style={{ padding: '20px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#d8b4fe', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
              <GraduationCap size={15} style={{ color: '#c084fc' }} />
              <span>الكورسات والباقات</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#c084fc' }}>{stats.packagesCount} <span style={{ fontSize: 14, color: '#94a3b8' }}>باقة</span></div>
            <div style={{ color: '#e9d5ff', fontSize: 12, marginTop: 4 }}>مخصصة باسمك في النظام</div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="instructor-tab-nav" style={{ display: 'flex', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 10, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {[
            ['schedule', `جدول المواعيد والقاعات (${instructorSchedules.length})`, Calendar],
            ['students', `قائمة الطلاب والاشتراكات (${instructorSubs.length})`, Users],
            ['settlements', 'كشف التسويات والمدفوعات', CheckCircle2],
            ['packages', `باقات الكورسات المعتمدة (${instructorPackages.length})`, GraduationCap]
          ].map(([key, label, IconComponent]) => {
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                style={{
                  padding: '9px 16px',
                  borderRadius: 12,
                  fontWeight: 800,
                  fontSize: 13,
                  fontFamily: 'Cairo, sans-serif',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transition: 'all 0.25s ease',
                  background: isActive ? 'linear-gradient(135deg, #1d4ed8, #3b82f6)' : 'rgba(255, 255, 255, 0.06)',
                  color: isActive ? '#ffffff' : 'rgba(200, 220, 245, 0.75)',
                  border: isActive ? '1px solid rgba(147, 197, 253, 0.6)' : '1px solid rgba(255, 255, 255, 0.1)',
                  boxShadow: isActive ? '0 4px 16px rgba(37, 99, 235, 0.4)' : 'none',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)'
                }}
              >
                <IconComponent size={16} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

                {/* Tab 0: Instructor Course Schedule */}
        {activeTab === 'schedule' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Calendar size={20} color="#38bdf8" /> جدول المحاضرات والمواعيد والقاعات المخصصة لك
                </h3>
                <p style={{ margin: '4px 0 0', color: '#93c5fd', fontSize: 13 }}>
                  مواعيدك المعتمدة في السنتر مع عدد المقاعد الشاغرة والقاعة
                </p>
              </div>

              {instructorSchedules.length > 0 && (
                <Badge color="blue" style={{ fontSize: 13, padding: '6px 12px' }}>
                  لديك {instructorSchedules.length} مجموعات مسجلة
                </Badge>
              )}
            </div>

            {instructorSchedules.length === 0 ? (
              <Card style={{ background: 'rgba(15, 23, 42, 0.8)', padding: 32, textAlign: 'center', border: '1px dashed rgba(255,255,255,0.15)' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                  <Calendar size={40} color="#38bdf8" />
                </div>
                <h4 style={{ color: '#ffffff', margin: '0 0 6px', fontSize: 16 }}>لا توجد مواعيد كورسات مسجلة باسمك حالياً</h4>
                <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>
                  تواصل مع إدارة السنتر لتنسيق القاعات وإضافة جدول مواعيد كورساتك ليظهر هنا وللطلاب تلقائياً.
                </p>
              </Card>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
                {instructorSchedules.map(item => {
                  const enrolledSubs = subscriptions.filter(sub => {
                    if (sub.status === 'paused' || sub.status === 'expired' || sub.status === 'cancelled') return false;
                    if (sub.scheduleId && sub.scheduleId === item.id) return true;
                    if (!sub.scheduleId && sub.packageName && item.courseName && sub.packageName.toLowerCase().includes(item.courseName.toLowerCase())) return true;
                    return false;
                  });
                  const bookedSeats = enrolledSubs.length;
                  const dynamicAvailable = Math.max(0, (Number(item.totalSeats) || 15) - bookedSeats);
                  const isFull = dynamicAvailable <= 0 || item.status === 'full';
                  const isAlmostFull = !isFull && dynamicAvailable <= 3;

                  return (
                    <Card key={item.id} style={{
                      background: 'rgba(15, 23, 42, 0.92)',
                      border: isFull ? '1.5px solid rgba(239, 68, 68, 0.4)' : isAlmostFull ? '1.5px solid rgba(245, 158, 11, 0.4)' : '1.5px solid rgba(59, 130, 246, 0.35)',
                      borderRadius: 18,
                      padding: 18,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 14
                    }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                          <div>
                            <h4 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#ffffff' }}>
                              {item.courseName}
                            </h4>
                            <span style={{ color: '#93c5fd', fontSize: 12, display: 'block', marginTop: 2 }}>
                              قاعة: {item.room || 'قاعة 1'}
                            </span>
                          </div>

                          <Badge color={isFull ? 'red' : isAlmostFull ? 'amber' : 'green'}>
                            {isFull ? 'مكتمل العدد' : isAlmostFull ? `متبقي ${dynamicAvailable}` : `متاح (${dynamicAvailable} مقاعد)`}
                          </Badge>
                        </div>

                        <div style={{ background: 'rgba(7, 17, 31, 0.8)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#94a3b8' }}>أيام المحاضرات:</span>
                            <strong style={{ color: '#ffffff' }}>{item.days}</strong>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#94a3b8' }}>الموعد:</span>
                            <strong style={{ color: '#38bdf8', fontSize: 14 }}>من {item.startTime} إلى {item.endTime}</strong>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 6 }}>
                            <span style={{ color: '#94a3b8' }}>حالة الحجز:</span>
                            <strong style={{ color: '#34d399' }}>{bookedSeats} طالب مسجل (متبقي {dynamicAvailable} مقاعد)</strong>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#94a3b8' }}>سعر الكورس للطالب:</span>
                            <strong style={{ color: '#ffffff' }}>{formatCurrency(item.price || 0)}</strong>
                          </div>
                        </div>

                        {item.notes && (
                          <p style={{ margin: '10px 0 0', fontSize: 12, color: '#94a3b8', background: 'rgba(255,255,255,0.03)', padding: 8, borderRadius: 8 }}>
                            {item.notes}
                          </p>
                        )}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => setRosterModalSchedule(item)}
                          style={{
                            width: '100%',
                            padding: '10px',
                            background: 'rgba(59, 130, 246, 0.2)',
                            color: '#60a5fa',
                            border: '1px solid rgba(59, 130, 246, 0.4)',
                            borderRadius: 10,
                            fontSize: 13,
                            fontWeight: 800,
                            cursor: 'pointer',
                            fontFamily: 'Cairo, sans-serif',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6
                          }}
                        >
                          <Users size={15} /> عرض قائمة طلاب هذه المجموعة ({bookedSeats})
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const text = `مرحباً بكم طلابي الأعزاء! 
مواعيد كورس (${item.courseName}) في THE FIRST GROUP:
الأيام: ${item.days}
التوقيت: من ${item.startTime} إلى ${item.endTime}
المكان: ${item.room || 'قاعة التدريب'}
المقاعد المتبقية: ${dynamicAvailable} مقاعد.

نتطلع لرؤيتكم في الموعد المحدد!`;
                            const clean = String(currentInstructor.phone || '').replace(/\D/g, '');
                            const url = clean ? `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}` : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
                            window.open(url, '_blank');
                          }}
                          style={{
                            width: '100%',
                            padding: '10px',
                            background: 'rgba(37, 211, 102, 0.15)',
                            color: '#25d366',
                            border: '1px solid rgba(37, 211, 102, 0.3)',
                            borderRadius: 10,
                            fontSize: 13,
                            fontWeight: 800,
                            cursor: 'pointer',
                            fontFamily: 'Cairo, sans-serif',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6
                          }}
                        >
                          <MessageSquare size={15} /> مشاركة الميعاد مع الطلاب عبر الواتساب
                        </button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}


        {/* Tab 1: Students & Subscriptions */}
        {activeTab === 'students' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Filters */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', gap: 10, flex: 1, minWidth: 260 }}>
                <Input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="بحث باسم الطالب أو رقم الهاتف أو الكورس..."
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  style={{
                    background: '#0b172d',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    borderRadius: 10,
                    padding: '8px 12px',
                    color: '#ffffff',
                    fontFamily: 'Cairo, sans-serif',
                    fontWeight: 700,
                    fontSize: 13,
                    outline: 'none'
                  }}
                >
                  <option value="all">كل الحالات ({instructorSubs.length})</option>
                  <option value="unsettled">مستحق قيد الصرف ({stats.pendingCount})</option>
                  <option value="settled">تمت المحاسبة ({stats.settledCount})</option>
                </select>

                <Button size="sm" onClick={handleExportExcel} style={{ background: 'linear-gradient(135deg, #059669, #10b981)', color: '#fff', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <FileSpreadsheet size={15} /> تصدير Excel
                </Button>
              </div>
            </div>

            {/* Students Table */}
            {filteredSubs.length === 0 ? (
              <Card style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                  <Users size={40} color="#38bdf8" />
                </div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>لا توجد اشتراكات مسجلة حالياً لهذا المدرس</p>
              </Card>
            ) : (
              <div style={{ background: 'rgba(15, 23, 42, 0.85)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: 16, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'rgba(30, 41, 59, 0.9)', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#93c5fd' }}>
                        <th style={{ padding: '12px 14px' }}>#</th>
                        <th style={{ padding: '12px 14px' }}>اسم الطالب</th>
                        <th style={{ padding: '12px 14px' }}>الكورس / الباقة</th>
                        <th style={{ padding: '12px 14px' }}>السعر</th>
                        <th style={{ padding: '12px 14px' }}>المتبقي</th>
                        <th style={{ padding: '12px 14px' }}>حصة المدرس</th>
                        <th style={{ padding: '12px 14px' }}>تاريخ الاشتراك</th>
                        <th style={{ padding: '12px 14px' }}>حالة المحاسبة</th>
                        <th style={{ padding: '12px 14px', textAlign: 'center' }}>تواصل</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSubs.map((sub, idx) => {
                        const isRemaining = sub.packageType === 'workspace'
                          ? `${(sub.totalHours || 0) - (sub.hoursUsed || 0)} ساعة`
                          : `${(sub.packageSessions || 0) - (sub.sessionsUsed || 0)} حصة`;

                        const phone = String(sub.clientPhone || '').replace(/[^0-9]/g, '');

                        return (
                          <tr key={sub.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s' }}>
                            <td style={{ padding: '12px 14px', color: '#94a3b8' }}>{idx + 1}</td>
                            <td style={{ padding: '12px 14px', fontWeight: 800, color: '#ffffff' }}>
                              {sub.clientName || 'بدون اسم'}
                            </td>
                            <td style={{ padding: '12px 14px', color: '#60a5fa', fontWeight: 700 }}>
                              {sub.packageName || 'كورس مخصص'}
                            </td>
                            <td style={{ padding: '12px 14px', color: '#cbd5e1' }}>
                              {formatCurrency(sub.price)}
                            </td>
                            <td style={{ padding: '12px 14px', color: '#38bdf8', fontWeight: 700 }}>
                              {isRemaining}
                            </td>
                            <td style={{ padding: '12px 14px', fontWeight: 800, color: '#fbbf24' }}>
                              {formatCurrency(sub.shareAmount)}
                            </td>
                            <td style={{ padding: '12px 14px', color: '#94a3b8' }}>
                              {formatDate(sub.date)}
                            </td>
                            <td style={{ padding: '12px 14px' }}>
                              {sub.isSettled ? (
                                <Badge color="emerald">
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    <CheckCircle2 size={12} /> تمت المحاسبة
                                  </span>
                                </Badge>
                              ) : (
                                <Badge color="amber">
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    <Clock size={12} /> مستحق للصرف
                                  </span>
                                </Badge>
                              )}
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                              {phone ? (
                                <a
                                  href={`https://wa.me/20${phone.startsWith('0') ? phone.slice(1) : phone}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    padding: '5px 10px',
                                    background: 'rgba(34, 197, 94, 0.15)',
                                    border: '1px solid #22c55e',
                                    borderRadius: 8,
                                    color: '#4ade80',
                                    fontSize: 12,
                                    fontWeight: 700,
                                    textDecoration: 'none'
                                  }}
                                >
                                  <MessageSquare size={13} /> واتساب
                                </a>
                              ) : (
                                <span style={{ color: '#64748b', fontSize: 11 }}>-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Settlement Ledger */}
        {activeTab === 'settlements' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {instructorSubs.filter(s => s.isSettled).length === 0 ? (
              <Card style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                  <Clock size={40} color="#fbbf24" />
                </div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>لم يتم إجراء أي تسويات مالية سابقة بعد</p>
                <p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>عندما تقوم الإدارة بمحاسبتك وصرف مستحقاتك، ستظهر تفاصيل كل تسوية هنا فوراً.</p>
              </Card>
            ) : (
              <div style={{ background: 'rgba(15, 23, 42, 0.85)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: 16, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'rgba(30, 41, 59, 0.9)', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#93c5fd' }}>
                        <th style={{ padding: '12px 14px' }}>#</th>
                        <th style={{ padding: '12px 14px' }}>تاريخ المحاسبة / الصرف</th>
                        <th style={{ padding: '12px 14px' }}>طالب / كورس</th>
                        <th style={{ padding: '12px 14px' }}>المبلغ المستلم</th>
                        <th style={{ padding: '12px 14px' }}>البيان وملاحظة الإدارة</th>
                        <th style={{ padding: '12px 14px' }}>بواسطة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {instructorSubs.filter(s => s.isSettled).map((s, idx) => {
                        return (
                          <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '12px 14px', color: '#94a3b8' }}>{idx + 1}</td>
                            <td style={{ padding: '12px 14px', fontWeight: 700, color: '#ffffff' }}>{formatDate(s.settledAt || s.date)}</td>
                            <td style={{ padding: '12px 14px', color: '#60a5fa', fontWeight: 700 }}>{s.clientName} ({s.packageName})</td>
                            <td style={{ padding: '12px 14px', fontWeight: 800, color: '#34d399' }}>{formatCurrency(s.shareAmount)}</td>
                            <td style={{ padding: '12px 14px', color: '#cbd5e1' }}>{s.settlementNote || 'تسوية مستحقات معتمدة'}</td>
                            <td style={{ padding: '12px 14px', color: '#94a3b8' }}>{s.settledBy || 'المدير المالي'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Packages */}
        {activeTab === 'packages' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {instructorPackages.length === 0 ? (
              <Card style={{ padding: 40, textAlign: 'center', color: '#94a3b8', gridColumn: '1 / -1' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                  <GraduationCap size={40} color="#38bdf8" />
                </div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>لا توجد باقات مربوطة باسمك حتى الآن</p>
                <p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>يمكن للإدارة إضافة باقات جديدة وربطها باسمك من لوحة التحكم.</p>
              </Card>
            ) : (
              instructorPackages.map(pkg => (
                <Card key={pkg.id} style={{ background: 'rgba(15, 23, 42, 0.85)', border: '1px solid rgba(59, 130, 246, 0.3)', padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#ffffff' }}>{pkg.name}</h3>
                      <span style={{ color: '#60a5fa', fontSize: 12, fontWeight: 700 }}>{pkg.type === 'workspace' ? 'مساحة عمل / ساعات' : 'كورس تعليمي / حصص'}</span>
                    </div>
                    <Badge color="blue">{formatCurrency(pkg.price)}</Badge>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#cbd5e1', marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
                    <div>العدد: <strong>{pkg.type === 'workspace' ? `${pkg.hours || 0} ساعة` : `${pkg.sessions || 0} حصة`}</strong></div>
                    <div>صلاحية الاشتراك: <strong>{pkg.durationDays || 30} يوم</strong></div>
                    <div style={{ color: '#fbbf24', fontWeight: 800 }}>حصة المدرس: {pkg.instructorShareType === 'fixed' ? `${pkg.instructorShareValue || 0} ج.م` : `${pkg.instructorShareValue || 0}%`}</div>
                  </div>
                </Card>
              ))
            )}
          </div>
        )}

      </div>

      {/* Student Roster Modal for Schedule */}
      {rosterModalSchedule && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 20,
          fontFamily: 'Cairo, sans-serif'
        }}>
          <div style={{
            background: 'rgba(15, 23, 42, 0.96)',
            border: '1px solid rgba(59, 130, 246, 0.4)',
            borderRadius: 24,
            padding: 24,
            width: '100%',
            maxWidth: 600,
            boxShadow: '0 25px 60px rgba(0,0,0,0.85)',
            textAlign: 'right',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 12, marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Users size={20} color="#38bdf8" /> طلاب مجموعة: {rosterModalSchedule.courseName}
                </h3>
                <span style={{ color: '#93c5fd', fontSize: 13 }}>
                  {rosterModalSchedule.days} ({rosterModalSchedule.startTime} - {rosterModalSchedule.endTime}) | قاعة: {rosterModalSchedule.room || 'قاعة 1'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setRosterModalSchedule(null)}
                style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 8, color: '#94a3b8', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {(() => {
              const enrolled = subscriptions.filter(sub => {
                if (sub.status === 'paused' || sub.status === 'expired' || sub.status === 'cancelled') return false;
                if (sub.scheduleId && sub.scheduleId === rosterModalSchedule.id) return true;
                if (!sub.scheduleId && sub.packageName && rosterModalSchedule.courseName && sub.packageName.toLowerCase().includes(rosterModalSchedule.courseName.toLowerCase())) return true;
                return false;
              });

              if (enrolled.length === 0) {
                return (
                  <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                      <Users size={36} color="#38bdf8" />
                    </div>
                    <p style={{ margin: 0, fontSize: 14 }}>لا يوجد طلاب مسجلين حالياً في هذه المجموعة</p>
                  </div>
                );
              }

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {enrolled.map((sub, i) => {
                    const client = clientMap[sub.clientId] || {};
                    const cName = client.name || sub.clientName || 'بدون اسم';
                    const cPhone = client.phone || sub.clientPhone || '—';
                    const memberId = client.memberId || sub.clientMemberId || '—';
                    const isRemaining = sub.packageType === 'workspace'
                      ? `${(sub.totalHours || 0) - (sub.hoursUsed || 0)} ساعة`
                      : `${(sub.packageSessions || 0) - (sub.sessionsUsed || 0)} حصة متبقية`;

                    return (
                      <div key={sub.id || i} style={{
                        background: 'rgba(7, 17, 31, 0.8)',
                        border: '1px solid rgba(59, 130, 246, 0.25)',
                        borderRadius: 14,
                        padding: '12px 16px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 10
                      }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 15, color: '#ffffff' }}>
                            {i + 1}. {cName}
                          </div>
                          <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 3 }}>
                            عضوية: #{memberId} &nbsp;|&nbsp; {cPhone}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Badge color="blue">{isRemaining}</Badge>
                          {cPhone && cPhone !== '—' && (
                            <a
                              href={`https://wa.me/20${cPhone.replace(/\D/g, '').startsWith('0') ? cPhone.replace(/\D/g, '').slice(1) : cPhone.replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                padding: '6px 12px',
                                background: 'rgba(34, 197, 94, 0.15)',
                                border: '1px solid #22c55e',
                                borderRadius: 8,
                                color: '#4ade80',
                                fontSize: 12,
                                fontWeight: 700,
                                textDecoration: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4
                              }}
                            >
                              <MessageSquare size={13} /> واتساب
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            <div style={{ marginTop: 20, textAlign: 'center' }}>
              <button
                type="button"
                onClick={() => setRosterModalSchedule(null)}
                style={{
                  padding: '10px 24px',
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 12,
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer',
                  fontFamily: 'Cairo, sans-serif'
                }}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
