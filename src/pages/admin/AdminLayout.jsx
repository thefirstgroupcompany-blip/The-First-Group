import { requestNotificationPermission } from '../../utils/notifications';
import React, { useState, useEffect, useMemo, Suspense, lazy } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { getSystemInfo, watchSystemInfo, getCustomerServiceRequests, resolveCustomerServiceRequest, getAllShifts, openShift, closeShift, getShiftPayments, getShiftTicketSales, getClients } from '../../services/db';
import HeaderLiveWidget from '../../components/HeaderLiveWidget';
import ShiftHandoverModal from '../../components/ShiftHandoverModal';
import { printShiftReport } from '../../utils/printReport';
import {
  LayoutDashboard, Bot, ScanLine, Building2, Users, Package,
  GraduationCap, Calendar, Ticket, UserCheck, RotateCcw,
  BadgeDollarSign, BarChart3, Truck, FileText, Coffee, Boxes,
  FileCheck, ShieldAlert, Star, Monitor, Landmark, Clock,
  TrendingUp, Gift, MessageSquare, ShieldCheck, Banknote, Settings,
  Bell, BellRing, Printer, LogOut, Menu, X, Phone, MessageCircle,
  CheckCircle2, Headphones, KeyRound, Video, BookOpen, ChevronDown, User,
  ChevronRight, ChevronLeft, ClipboardCheck, PlayCircle, Radio
} from 'lucide-react';
import LiveSessionsModal from '../../components/LiveSessionsModal';
import { watchActiveSessions } from '../../services/sessionService';

const navGroups = [
  {
    id: 'overview',
    title: 'الرئيسية والمساعد الذكي',
    shortLabel: 'الرئيسية',
    icon: LayoutDashboard,
    items: [
      { id: 'dashboard', label: 'لوحة التحكم الرئيسية', desc: 'مؤشرات الأداء والخزينة الحية', icon: LayoutDashboard },
      { id: 'ai_advisor', label: 'TFG AI المستشار الذكي', desc: 'تحليلات وتوصيات الذكاء الاصطناعي', icon: Bot },
      { id: 'analytics', label: 'الإحصائيات والنمو', desc: 'مقارنات المبيعات وساعات الذروة', icon: TrendingUp },
    ]
  },
  {
    id: 'workspace_clients',
    title: 'مساحة العمل والطلاب',
    shortLabel: 'الطلاب والعمل',
    icon: Building2,
    items: [
      { id: 'scan', label: 'فحص العضوية والـ QR', desc: 'تسجيل الدخول والخروج بالباركود', icon: ScanLine },
      { id: 'workspace', label: 'WORK SPACE والغرف', desc: 'إدارة الغرف والمساحات المفتوحة', icon: Building2 },
      { id: 'clients', label: 'الأعضاء والطلاب', desc: 'سجل بيانات المشتركين وأرصدتهم', icon: Users },
      { id: 'packages', label: 'باقات الاشتراك', desc: 'خطط العضويات والساعات المسبقة', icon: Package },
      { id: 'instructors', label: 'حسابات المدرسين', desc: 'بيانات المحاضرين ونسب الحصص', icon: GraduationCap },
      { id: 'schedule', label: 'جدول الكورسات والمجموعات', desc: 'تنظيم مواعيد القاعات والمجموعات', icon: Calendar },
      { id: 'tickets', label: 'التذاكر والزيارات اليومية', desc: 'إصدار تذاكر الدخول الفردية', icon: Ticket },
    ]
  },
  {
    id: 'cafe_group',
    title: 'الكافيه والمخزون',
    shortLabel: 'الكافيه',
    icon: Coffee,
    items: [
      { id: 'cafe_pos', label: 'TFG | CAFE (نقطة البيع)', desc: 'شاشة كاشير المشروبات والوجبات', icon: Coffee },
      { id: 'inventory', label: 'محرك وتحليل هوامش الأرباح والمخزون', desc: 'تحليل تكلفة الأصناف وهوامش الربح ومراقبة النواقص والكميات', icon: TrendingUp },
    ]
  },
  {
    id: 'finances_group',
    title: 'الخزينة والماليات',
    shortLabel: 'الماليات',
    icon: BadgeDollarSign,
    items: [
      { id: 'revenues', label: 'الإيرادات المركزية', desc: 'تحصيلات الخزينة المباشرة', icon: BadgeDollarSign },
      { id: 'finances', label: 'التقارير المالية والأرباح', desc: 'قوائم الدخل وصافي الأرباح', icon: BarChart3 },
      { id: 'vouchers', label: 'سندات القبض والصرف', desc: 'حركات الصندوق والسندات اليدوية', icon: FileText },
      { id: 'salaries', label: 'مسيرات المرتبات', desc: 'احتساب رواتب واستحقاقات الموظفين', icon: Banknote },
      { id: 'vendors', label: 'الموردين والمشتريات', desc: 'فواتير الموردين والمدفوعات', icon: Truck },
      { id: 'capital', label: 'رأس المال والشركاء', desc: 'حصص الشركاء وحسابات رأس المال', icon: Landmark },
    ]
  },
  {
    id: 'hr_operations',
    title: 'الموظفون والورديات',
    shortLabel: 'الموظفين',
    icon: UserCheck,
    items: [
      { id: 'shifts', label: 'سجل المناوبات والورديات', desc: 'إغلاق وفتح ورديات الكاشير', icon: RotateCcw },
      { id: 'employees', label: 'دليل الموظفين', desc: 'بيانات كادر العمل والمسميات', icon: UserCheck },
      { id: 'attendance', label: 'الحضور والانصراف', desc: 'تسجيل البصمة وأوقات الحضور', icon: Clock },
      { id: 'system_users', label: 'مستخدمو النظام والصلاحيات', desc: 'حسابات الدخول وكلمات المرور', icon: KeyRound },
    ]
  },
  {
    id: 'services_assets',
    title: 'الخدمات والتشغيل',
    shortLabel: 'الخدمات',
    icon: FileCheck,
    items: [
      { id: 'contracts', label: 'عقود الإيجار والخدمات', desc: 'متابعة مدد العقود والأقساط', icon: FileCheck },
      { id: 'assets', label: 'الأصول والمعدات', desc: 'حصر العهد والأجهزة وقيمها', icon: Monitor },
      { id: 'lost_and_found', label: 'المفقودات والأمانات', desc: 'سجل متعلقات العملاء والودائع', icon: ShieldAlert },
      { id: 'feedback', label: 'تقييمات الجودة والشكاوى', desc: 'آراء ورضا العملاء والشكاوى', icon: Star },
    ]
  },
  {
    id: 'marketing_settings',
    title: 'التسويق والإعدادات',
    shortLabel: 'الإعدادات',
    icon: Settings,
    items: [
      { id: 'marketing', label: 'الولاء والتسويق', desc: 'نقاط المكافآت والعروض', icon: Gift },
      { id: 'whatsapp_bot', label: 'الرد الآلي والواتساب', desc: 'رسائل التذكير وتنبيهات البوت', icon: MessageSquare },
      { id: 'audit', label: 'سجل الأمان والنشاطات', desc: 'مراجعة كافة العمليات الحساسة', icon: ShieldCheck },
      { id: 'settings', label: 'إعدادات النظام', desc: 'تخصيص الهوية والطباعة', icon: Settings },
    ]
  }
];

const tabs = navGroups.flatMap(g => g.items);

const TabLoadingFallback = () => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '45vh',
    gap: 16
  }}>
    <div style={{
      width: 40,
      height: 40,
      borderRadius: '50%',
      border: '3px solid rgba(56, 189, 248, 0.18)',
      borderTopColor: '#38bdf8',
      animation: 'spin 0.7s linear infinite'
    }} />
    <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 700 }}>
      جاري تحميل القسم...
    </span>
  </div>
);

const AdminDashboard      = lazy(() => import('./tabs/AdminDashboard'));
const AiAdvisorTab         = lazy(() => import('./tabs/AiAdvisorTab'));
const AnalyticsTab         = lazy(() => import('../shared/AnalyticsTab'));
const MarketingLoyaltyTab  = lazy(() => import('./tabs/MarketingLoyaltyTab'));
const AuditLogTab          = lazy(() => import('./tabs/AuditLogTab'));
const ClientScanTab       = lazy(() => import('../shared/ClientScanTab'));
const WorkspaceTab        = lazy(() => import('../shared/WorkspaceTab'));
const ClientsTab          = lazy(() => import('./tabs/ClientsTab'));
const PackagesTab         = lazy(() => import('./tabs/PackagesTab'));
const InstructorsTab      = lazy(() => import('./tabs/InstructorsTab'));
const CourseScheduleTab  = lazy(() => import('./tabs/CourseScheduleTab'));
const WhatsAppBotTab     = lazy(() => import('./tabs/WhatsAppBotTab'));
const TicketsTab          = lazy(() => import('./tabs/TicketsTab'));
const EmployeesTab        = lazy(() => import('./tabs/EmployeesTab'));
const SystemUsersTab      = lazy(() => import('./tabs/SystemUsersTab'));
const ShiftsTab           = lazy(() => import('./tabs/ShiftsTab'));
const AdminRevenuesTab    = lazy(() => import('./tabs/AdminRevenuesTab'));
const FinancesTab         = lazy(() => import('./tabs/FinancesTab'));
const VendorsTab          = lazy(() => import('./tabs/VendorsTab'));
const VouchersTab         = lazy(() => import('./tabs/VouchersTab'));
const CafePosTab          = lazy(() => import('../shared/CafePosTab'));
const InventoryTab        = lazy(() => import('./tabs/InventoryTab'));
const ContractsTrackerTab = lazy(() => import('./tabs/ContractsTrackerTab'));
const LostAndFoundTab     = lazy(() => import('./tabs/LostAndFoundTab'));
const FeedbackTab         = lazy(() => import('./tabs/FeedbackTab'));
const AssetsTab           = lazy(() => import('./tabs/AssetsTab'));
const CapitalPartnersTab  = lazy(() => import('./tabs/CapitalPartnersTab'));
const AdminAttendanceTab  = lazy(() => import('./tabs/AdminAttendanceTab'));
const SalariesTab         = lazy(() => import('./tabs/SalariesTab'));
const SettingsTab         = lazy(() => import('./tabs/SettingsTab'));
import BottomStatusBar     from '../../components/BottomStatusBar';

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [activeModuleDropdown, setActiveModuleDropdown] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [systemInfo, setSystemInfo] = useState({ name: 'THE FIRST GROUP', logoUrl: '' });
  const [csRequests, setCsRequests] = useState([]);
  const [csModalOpen, setCsModalOpen] = useState(false);
  const [activeToast, setActiveToast] = useState(null);
  const [openShifts, setOpenShifts] = useState([]);
  const [openingShift, setOpeningShift] = useState(false);
  const [handoverModalOpen, setHandoverModalOpen] = useState(false);
  const [shiftPayments, setShiftPayments] = useState([]);
  const [shiftTickets, setShiftTickets] = useState([]);
  const [clients, setClients] = useState([]);
  const [liveSessionsModalOpen, setLiveSessionsModalOpen] = useState(false);
  const [onlineDevicesCount, setOnlineDevicesCount] = useState(1);

  useEffect(() => {
    const unsubShifts = getAllShifts(all => {
      setOpenShifts(all.filter(s => s.status === 'open'));
    });
    const unsubClients = getClients(setClients);
    const unsubSessions = watchActiveSessions(list => {
      const online = list.filter(s => s.isOnline);
      setOnlineDevicesCount(online.length || 1);
    });
    return () => {
      unsubShifts && unsubShifts();
      unsubClients && unsubClients();
      unsubSessions && unsubSessions();
    };
  }, []);

  // Background idle prefetcher for instant 0ms tab transitions
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        import('./tabs/ClientsTab');
        import('../shared/CafePosTab');
        import('./tabs/ShiftsTab');
        import('../shared/WorkspaceTab');
        import('./tabs/FinancesTab');
        import('../shared/ClientScanTab');
        import('./tabs/PackagesTab');
        import('./tabs/InventoryTab');
      } catch (e) {}
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  const adminShift = useMemo(() => {
    return openShifts.find(s => s.employeeId === 'ADMIN' || s.isAdminShift) || null;
  }, [openShifts]);
  const activeShift = adminShift || openShifts[0] || null;
  const activeShiftId = activeShift?.id || null;

  const handleOpenAdminShift = async () => {
    setOpeningShift(true);
    try {
      await openShift('ADMIN', 'المدير العام (الإدارة)');
      window.showToast?.('🟢 تم فتح مناوبة جديدة للمدير العام بنجاح', 'success');
    } catch (err) {
      console.error('Error opening admin shift:', err);
      alert('حدث خطأ أثناء فتح مناوبة المدير: ' + (err.message || ''));
    } finally {
      setOpeningShift(false);
    }
  };

  const handleStartCloseAdminShift = async () => {
    const targetShift = adminShift || activeShift;
    if (!targetShift) return;
    try {
      const [payments, tickets] = await Promise.all([
        getShiftPayments(targetShift.id),
        getShiftTicketSales(targetShift.id)
      ]);
      setShiftPayments(payments || []);
      setShiftTickets(tickets || []);
      setHandoverModalOpen(true);
    } catch (err) {
      console.error('Error fetching shift items:', err);
      setShiftPayments([]);
      setShiftTickets([]);
      setHandoverModalOpen(true);
    }
  };

  // Determine active group ID based on current activeTab
  const activeGroupId = useMemo(() => {
    return navGroups.find(g => g.items.some(i => i.id === activeTab))?.id || 'overview';
  }, [activeTab]);

  // Keyboard shortcut Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setActiveModuleDropdown(null);
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!user || user.role !== 'admin') navigate('/');
    const unsubSys = watchSystemInfo(setSystemInfo);
    return () => {
      unsubSys && unsubSys();
    };
  }, [user]);

  useEffect(() => {
    let lastCount = -1;
    const unsubCS = getCustomerServiceRequests(list => {
      setCsRequests(list);
      const pending = list.filter(r => r.status === 'pending');
      if (lastCount !== -1 && pending.length > lastCount && pending.length > 0) {
        const latest = pending[0];
        setActiveToast(latest);
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.setValueAtTime(587.33, ctx.currentTime);
          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          osc.start();
          osc.stop(ctx.currentTime + 0.3);
        } catch (e) {}
      }
      lastCount = pending.length;
    });

    return () => {
      unsubCS && unsubCS();
    };
  }, []);

  const [visitedTabs] = useState(() => new Set(['dashboard']));
  if (!visitedTabs.has(activeTab)) {
    visitedTabs.add(activeTab);
  }

  const renderTabById = (tabId) => {
    switch (tabId) {
      case 'dashboard':      return <AdminDashboard onNavigateTab={setActiveTab} />;
      case 'ai_advisor':     return <AiAdvisorTab />;
      case 'analytics':      return <AnalyticsTab />;
      case 'marketing':      return <MarketingLoyaltyTab />;
      case 'audit':          return <AuditLogTab />;
      case 'scan':           return <ClientScanTab />;
      case 'workspace':      return <WorkspaceTab shiftId={activeShiftId} employeeId={user?.id || 'ADMIN'} isEmployee={false} />;
      case 'clients':        return <ClientsTab shiftId={activeShiftId} employeeId={user?.id || 'ADMIN'} isEmployee={false} />;
      case 'packages':       return <PackagesTab onNavigateTab={setActiveTab} />;
      case 'instructors':    return <InstructorsTab />;
      case 'schedule':       return <CourseScheduleTab />;
      case 'whatsapp_bot':   return <WhatsAppBotTab />;
      case 'tickets':        return <TicketsTab shiftId={activeShiftId} employeeId={user?.id || 'ADMIN'} isEmployee={false} />;
      case 'employees':      return <EmployeesTab onNavigateTab={setActiveTab} />;
      case 'system_users':   return <SystemUsersTab />;
      case 'shifts':         return <ShiftsTab />;
      case 'revenues':       return <AdminRevenuesTab />;
      case 'finances':       return <FinancesTab />;
      case 'vendors':        return <VendorsTab />;
      case 'vouchers':       return <VouchersTab shiftId={activeShiftId} employeeId={user?.id || 'ADMIN'} isEmployee={false} />;
      case 'cafe_pos':       return <CafePosTab />;
      case 'inventory':      return <InventoryTab />;
      case 'contracts':      return <ContractsTrackerTab />;
      case 'lost_and_found': return <LostAndFoundTab />;
      case 'feedback':       return <FeedbackTab />;
      case 'assets':         return <AssetsTab />;
      case 'capital':        return <CapitalPartnersTab />;
      case 'attendance':     return <AdminAttendanceTab />;
      case 'salaries':       return <SalariesTab />;
      case 'settings':       return <SettingsTab systemInfo={systemInfo} onUpdate={setSystemInfo} />;
      default:               return <AdminDashboard onNavigateTab={setActiveTab} />;
    }
  };

  const currentTab = tabs.find(t => t.id === activeTab);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      width: '100vw',
      background: 'transparent',
      overflow: 'hidden',
      position: 'relative'
    }}>
      
      {/* Backdrop for closing active mega dropdown when clicking anywhere outside */}
      {activeModuleDropdown && (
        <div
          onClick={() => setActiveModuleDropdown(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(3px)' }}
        />
      )}

      {/* Mobile Off-canvas Drawer (< 1024px) */}
      {mobileMenuOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 99,
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
            animation: 'fadeIn 0.2s ease-out'
          }}
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute', top: 0, right: 0, bottom: 0,
              width: 'min(330px, 85vw)',
              background: '#091322',
              borderLeft: '1px solid rgba(56, 189, 248, 0.25)',
              boxShadow: '-10px 0 40px rgba(0,0,0,0.85)',
              display: 'flex', flexDirection: 'column',
              overflowY: 'auto', padding: '16px',
              animation: 'slideInRight 0.25s ease-out'
            }}
          >
            {/* Drawer Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <img src="/logo.png" alt="logo" style={{ height: 38, width: 'auto', maxWidth: 130, objectFit: 'contain', filter: 'drop-shadow(0 0 8px rgba(56,189,248,0.5))' }} />
                <div>
                  <span style={{ fontSize: 11, color: '#38bdf8', fontWeight: 700 }}>{user?.name} · مدير</span>
                </div>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', borderRadius: 8, padding: 6, cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Drawer Groups & Items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {navGroups.map(group => (
                <div key={group.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#38bdf8', padding: '4px 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {React.createElement(group.icon, { size: 14 })}
                    <span>{group.title}</span>
                  </div>
                  {group.items.map(item => {
                    const ItemIcon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setActiveTab(item.id);
                          setMobileMenuOpen(false);
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '9px 12px', borderRadius: 8,
                          background: isActive ? 'rgba(56, 189, 248, 0.18)' : 'rgba(255,255,255,0.03)',
                          border: isActive ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid transparent',
                          color: isActive ? '#38bdf8' : '#cbd5e1',
                          cursor: 'pointer', textAlign: 'right', fontSize: 12.5, fontWeight: isActive ? 800 : 500
                        }}
                      >
                        <ItemIcon size={16} />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}



      {/* Top Main Navigation Bar */}
      <header
        className="dark-header no-print"
        style={{
          height: 64,
          padding: '0 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(9, 19, 34, 0.96)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(56, 189, 248, 0.16)',
          zIndex: 60,
          position: 'relative',
          flexShrink: 0
        }}
      >
        {/* Right side (RTL): Brand Logo & Mobile Toggle */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10
        }}>
          {/* Mobile hamburger menu toggle (< 1024px) */}
          <button
            onClick={() => setMobileMenuOpen(prev => !prev)}
            className="hidden-on-desktop"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 38, height: 38, borderRadius: 10,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
              color: '#ffffff', cursor: 'pointer'
            }}
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          {/* Brand Logo */}
          <div
            onClick={() => setActiveTab('dashboard')}
            title={systemInfo.name || 'THE FIRST GROUP'}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: '2px 4px',
              borderRadius: 10,
              transition: 'all 0.2s ease'
            }}
          >
            <img
              src="/logo.png"
              alt={systemInfo.name || "THE FIRST GROUP"}
              onError={(e) => { e.target.onerror = null; e.target.src = '/logo.png'; }}
              style={{
                height: 38,
                width: 'auto',
                maxWidth: 140,
                objectFit: 'contain',
                filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.45))',
                transition: 'transform 0.2s ease, opacity 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.04)';
                e.currentTarget.style.opacity = '0.95';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.opacity = '1';
              }}
            />
          </div>

          <div className="hidden-on-mobile" style={{ width: 1, height: 26, background: 'rgba(255, 255, 255, 0.12)', marginInlineStart: 8 }} />
        </div>

        {/* Center: The 7 Top Navigation Modules (Desktop) */}
        <nav
          className="hidden-on-mobile"
          style={{ display: 'flex', alignItems: 'center', gap: 6, height: '100%', flexShrink: 0 }}
        >
          {navGroups.map(group => {
            const GroupIcon = group.icon;
            const isDropdownOpen = activeModuleDropdown === group.id;
            const isGroupActive = activeGroupId === group.id;

            return (
              <div key={group.id} style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveModuleDropdown(prev => prev === group.id ? null : group.id);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    padding: '8px 13px',
                    borderRadius: 10,
                    border: isDropdownOpen
                      ? '1px solid rgba(56, 189, 248, 0.6)'
                      : isGroupActive
                      ? '1px solid rgba(56, 189, 248, 0.35)'
                      : '1px solid transparent',
                    background: isDropdownOpen
                      ? 'rgba(56, 189, 248, 0.22)'
                      : isGroupActive
                      ? 'rgba(56, 189, 248, 0.12)'
                      : 'transparent',
                    color: isDropdownOpen || isGroupActive ? '#38bdf8' : '#cbd5e1',
                    fontWeight: isDropdownOpen || isGroupActive ? 800 : 600,
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                >
                  <GroupIcon size={16} strokeWidth={isGroupActive ? 2.2 : 1.8} />
                  <span>{group.shortLabel}</span>
                  <ChevronDown
                    size={13}
                    style={{
                      transform: isDropdownOpen ? 'rotate(180deg)' : 'rotate(0)',
                      transition: 'transform 0.2s ease',
                      opacity: 0.7
                    }}
                  />
                </button>

                {/* Floating Mega Dropdown */}
                {isDropdownOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 8px)',
                      right: 0,
                      background: 'rgba(10, 20, 36, 0.98)',
                      backdropFilter: 'blur(24px)',
                      border: '1px solid rgba(56, 189, 248, 0.35)',
                      borderRadius: 14,
                      boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8), 0 0 25px rgba(56, 189, 248, 0.15)',
                      padding: 14,
                      zIndex: 100,
                      minWidth: group.items.length > 3 ? 480 : 290,
                      animation: 'fadeIn 0.15s ease-out'
                    }}
                  >
                    {/* Header in dropdown */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px 10px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#38bdf8' }}>{group.title}</span>
                    </div>

                    {/* Grid of items */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: group.items.length > 3 ? 'repeat(2, 1fr)' : '1fr',
                      gap: 6
                    }}>
                      {group.items.map(item => {
                        const ItemIcon = item.icon;
                        const isItemActive = activeTab === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setActiveTab(item.id);
                              setActiveModuleDropdown(null);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              padding: '10px 12px',
                              borderRadius: 10,
                              border: isItemActive ? '1px solid rgba(56, 189, 248, 0.5)' : '1px solid transparent',
                              background: isItemActive ? 'rgba(56, 189, 248, 0.18)' : 'rgba(255, 255, 255, 0.03)',
                              color: isItemActive ? '#ffffff' : '#e2e8f0',
                              cursor: 'pointer',
                              textAlign: 'right',
                              transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={(e) => {
                              if (!isItemActive) {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.07)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isItemActive) {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                              }
                            }}
                          >
                            <div style={{
                              width: 34, height: 34, borderRadius: 8,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: isItemActive ? 'rgba(56, 189, 248, 0.25)' : 'rgba(15, 23, 42, 0.8)',
                              color: isItemActive ? '#38bdf8' : '#94a3b8', flexShrink: 0
                            }}>
                              <ItemIcon size={17} />
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <p style={{ fontSize: 12.5, fontWeight: isItemActive ? 800 : 600, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {item.label}
                              </p>
                              {item.desc && (
                                <p style={{ fontSize: 10.5, color: '#94a3b8', margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {item.desc}
                                </p>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Left side: Tools + User Profile */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0
        }}>
          {/* Live Security Radar Button */}
          <button
            onClick={() => setLiveSessionsModalOpen(true)}
            className="btn btn-ghost btn-sm no-print"
            style={{
              position: 'relative',
              padding: '6px 11px',
              borderRadius: 10,
              background: onlineDevicesCount > 1 ? 'rgba(56, 189, 248, 0.16)' : 'rgba(255,255,255,0.04)',
              border: onlineDevicesCount > 1 ? '1.5px solid rgba(56, 189, 248, 0.5)' : '1px solid rgba(255,255,255,0.08)',
              color: onlineDevicesCount > 1 ? '#38bdf8' : 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
            title="رادار الأمان والأجهزة المتصلة الحية"
          >
            <Radio size={16} className={onlineDevicesCount > 1 ? "animate-pulse" : ""} />
            <span className="hidden-on-mobile" style={{ fontSize: 11, fontWeight: 700 }}>الأجهزة الحية</span>
            <span style={{
              background: onlineDevicesCount > 1 ? '#0284c7' : 'rgba(255,255,255,0.15)',
              color: '#ffffff',
              borderRadius: '999px',
              padding: '1px 6px',
              fontSize: 10.5,
              fontWeight: 900
            }}>
              {onlineDevicesCount}
            </span>
          </button>

          {/* Customer Service Requests Bell */}
          <button
            onClick={() => setCsModalOpen(true)}
            className="btn btn-ghost btn-sm no-print"
            style={{
              position: 'relative',
              padding: '6px 10px',
              borderRadius: 10,
              background: csRequests.filter(r => r.status === 'pending').length > 0 ? 'rgba(239, 68, 68, 0.18)' : 'rgba(255,255,255,0.04)',
              border: csRequests.filter(r => r.status === 'pending').length > 0 ? '1.5px solid #ef4444' : '1px solid rgba(255,255,255,0.08)',
              color: csRequests.filter(r => r.status === 'pending').length > 0 ? '#ef4444' : 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5
            }}
            title="طلبات خدمة العملاء"
          >
            <Bell size={16} />
            {csRequests.filter(r => r.status === 'pending').length > 0 && (
              <span style={{
                background: '#ef4444',
                color: '#ffffff',
                borderRadius: '999px',
                padding: '1px 5px',
                fontSize: 10.5,
                fontWeight: 900,
                animation: 'pulse 1.5s infinite'
              }}>
                {csRequests.filter(r => r.status === 'pending').length}
              </span>
            )}
          </button>

          {/* Print */}
          <button
            onClick={() => window.print()}
            className="btn btn-ghost btn-sm no-print hidden-on-mobile"
            style={{ padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            title="طباعة الصفحة"
          >
            <Printer size={15} />
          </button>

          {/* Logout */}
          <button
            onClick={() => { logout(); navigate('/'); }}
            title="تسجيل الخروج"
            className="btn btn-ghost btn-sm no-print"
            style={{
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              padding: '6px 10px',
              borderRadius: '8px',
              cursor: 'pointer',
              color: '#f87171'
            }}
          >
            <LogOut size={15} />
          </button>

          <div className="hidden-on-mobile">
            <HeaderLiveWidget role="admin" />
          </div>
        </div>
      </header>

      {/* Sub-Header Bar: Responsive Active Breadcrumb & Shift Status */}
      <div className="responsive-subheader no-print">
        {/* Row 1: Breadcrumb + Manager Pill */}
        <div className="responsive-subheader-row1">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span className="pulse-dot pulse-dot-emerald" title="النظام متصل ونشط لحظياً" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <span className="hidden-on-mobile" style={{ color: '#64748b', fontSize: 12.5 }}>
                {navGroups.find(g => g.id === activeGroupId)?.title}
              </span>
              <span className="hidden-on-mobile" style={{ color: '#475569', fontSize: 12 }}>/</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {currentTab?.icon && React.createElement(currentTab.icon, { size: 16, style: { color: 'var(--accent)', flexShrink: 0 } })}
                <h2 className="titanium-title" style={{ fontWeight: 800, fontSize: 13.5, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {currentTab?.label}
                </h2>
              </div>
            </div>
          </div>

          {/* Manager / Admin Name pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.25)',
            padding: '3px 8px', borderRadius: 8, color: '#38bdf8', fontSize: 11.5, fontWeight: 700,
            flexShrink: 0
          }}>
            <span style={{
              background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8',
              borderRadius: 6, padding: '1px 5px', fontSize: 9.5, fontWeight: 800
            }}>
              {user?.role === 'admin' ? 'مدير' : 'مشرف'}
            </span>
            <span style={{ whiteSpace: 'nowrap' }}>{user?.name || 'المدير'}</span>
            <UserCheck size={12} />
          </div>
        </div>

        {/* Row 2: Shift Actions & Status Bar */}
        <div className="responsive-subheader-row2">
          {activeShift && activeShift.status === 'open' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'rgba(16, 185, 129, 0.16)', border: '1.5px solid rgba(16, 185, 129, 0.45)',
                padding: '4px 8px', borderRadius: 8, color: '#34d399', fontWeight: 800, fontSize: 11.5,
                whiteSpace: 'nowrap', flexShrink: 0
              }}>
                <span className="pulse-dot pulse-dot-emerald" style={{ width: 6, height: 6 }} />
                <span>🟢 مناوبة مفتوحة</span>
              </div>

              <button
                onClick={handleStartCloseAdminShift}
                className="btn btn-ghost btn-sm no-print"
                title="محضر تقفيل وتسليم المناوبة وحساب النقدية بالدرج"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  borderRadius: 8, padding: '5px 10px', cursor: 'pointer',
                  color: '#34d399', fontSize: 11.5, fontWeight: 800,
                  flex: 1, whiteSpace: 'nowrap'
                }}
              >
                <ClipboardCheck size={13} color="#34d399" />
                <span>تسليم المناوبة</span>
              </button>

              <button
                onClick={() => {
                  printShiftReport({
                    shift: { ...activeShift, employeeName: user?.name || activeShift.employeeName || 'المدير العام' },
                    payments: shiftPayments,
                    tickets: shiftTickets,
                    systemInfo,
                    clients
                  });
                }}
                className="btn btn-ghost btn-sm no-print"
                title="طباعة تقرير المناوبة الحالية"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  padding: '5px 8px', borderRadius: 8, cursor: 'pointer',
                  color: '#cbd5e1', flexShrink: 0
                }}
              >
                <Printer size={14} />
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'rgba(239, 68, 68, 0.16)', border: '1.5px solid rgba(239, 68, 68, 0.45)',
                padding: '4px 8px', borderRadius: 8, color: '#f87171', fontWeight: 800, fontSize: 11.5,
                whiteSpace: 'nowrap', flexShrink: 0
              }}>
                <span className="pulse-dot pulse-dot-red" style={{ width: 6, height: 6 }} />
                <span>🔴 المناوبة مغلقة</span>
              </div>

              <button
                onClick={handleOpenAdminShift}
                disabled={openingShift}
                className="btn btn-sm no-print"
                title="بدء وفتح مناوبة جديدة للمدير العام"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  border: 'none', borderRadius: 8, padding: '5px 12px',
                  cursor: openingShift ? 'not-allowed' : 'pointer',
                  color: '#ffffff', fontSize: 11.5, fontWeight: 800,
                  flex: 1, whiteSpace: 'nowrap',
                  boxShadow: '0 2px 10px rgba(16, 185, 129, 0.3)'
                }}
              >
                <PlayCircle size={14} color="#ffffff" />
                <span>{openingShift ? 'جاري الفتح...' : 'فتح مناوبة جديدة'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area: 100% Full Width */}
      <main
        className="admin-main-wrapper"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          width: '100vw',
          minWidth: 0
        }}
      >

        {/* Tab Body */}
        <div
          className="app-main-content"
          style={{
            flex: 1, overflowY: 'auto', overflowX: 'hidden',
            padding: '20px 24px', WebkitOverflowScrolling: 'touch'
          }}
        >
          {Array.from(visitedTabs).map(tabId => (
            <div
              key={tabId}
              style={{ display: activeTab === tabId ? 'block' : 'none' }}
              className="tab-pane-transition"
            >
              <Suspense fallback={<TabLoadingFallback />}>
                {renderTabById(tabId)}
              </Suspense>
            </div>
          ))}
        </div>
                {/* Real-time Customer Service Request Toast Alert */}
        {activeToast && (
          <div style={{
            position: 'fixed',
            top: 20,
            left: 20,
            zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(20px)',
            border: '2px solid #ef4444',
            borderRadius: 16,
            padding: '16px 20px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
            maxWidth: 380,
            animation: 'fadeIn 0.3s ease-out'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <BellRing size={20} color="#f87171" />
                <strong style={{ color: '#ffffff', fontSize: 14 }}>طلب خدمة عملاء فوري!</strong>
              </div>
              <button
                onClick={() => setActiveToast(null)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <X size={16} />
              </button>
            </div>

            <p style={{ margin: '0 0 6px', color: '#93c5fd', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Phone size={14} /> رقم العميل: <strong>+{activeToast.customerPhone}</strong>
            </p>
            <p style={{ margin: '0 0 12px', color: '#e2e8f0', fontSize: 12, background: 'rgba(0,0,0,0.4)', padding: '8px 10px', borderRadius: 8 }}>
              "{activeToast.lastMessage}"
            </p>

            <div style={{ display: 'flex', gap: 8 }}>
              <a
                href={`https://wa.me/${activeToast.customerPhone}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '8px 12px',
                  background: '#25d366',
                  color: '#ffffff',
                  borderRadius: 8,
                  fontWeight: 800,
                  fontSize: 12,
                  textDecoration: 'none'
                }}
              >
                <MessageCircle size={14} /> فتح الواتساب
              </a>
              <button
                onClick={() => {
                  resolveCustomerServiceRequest(activeToast.id);
                  setActiveToast(null);
                }}
                style={{
                  padding: '8px 12px',
                  background: 'rgba(255,255,255,0.1)',
                  color: '#ffffff',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <CheckCircle2 size={14} color="#34d399" /> تم التواصل
              </button>
            </div>
          </div>
        )}

        {/* Customer Service Requests Full List Modal */}
        {csModalOpen && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 9998,
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
          }}>
            <div style={{
              background: 'rgba(15, 23, 42, 0.95)',
              backdropFilter: 'blur(24px)',
              border: '1px solid rgba(255,255,255,0.16)',
              borderRadius: 20, width: '100%', maxWidth: 540, maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
              boxShadow: '0 25px 50px rgba(0,0,0,0.6)'
            }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, color: '#ffffff', fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Headphones size={18} color="var(--accent)" /> طلبات التواصل وخدمة العملاء من الواتساب
                </h3>
                <button
                  onClick={() => setCsModalOpen(false)}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                {csRequests.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#94a3b8', padding: 30, margin: 0 }}>لا توجد طلبات خدمة عملاء واردة حالياً.</p>
                ) : (
                  csRequests.map(req => {
                    const isPending = req.status === 'pending';
                    return (
                      <div
                        key={req.id}
                        style={{
                          background: isPending ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255,255,255,0.03)',
                          border: isPending ? '1.5px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(255,255,255,0.08)',
                          borderRadius: 12, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: '#ffffff', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Phone size={13} color="var(--accent)" /> +{req.customerPhone}
                          </span>
                          <span style={{
                            fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 6,
                            background: isPending ? '#ef4444' : 'rgba(34, 197, 94, 0.2)',
                            color: isPending ? '#ffffff' : '#34d399',
                            display: 'flex', alignItems: 'center', gap: 4
                          }}>
                            {isPending ? <Clock size={11} /> : <CheckCircle2 size={11} />}
                            {isPending ? 'بانتظار الرد والتواصل' : 'تم التواصل والحل'}
                          </span>
                        </div>

                        <p style={{ margin: 0, color: '#cbd5e1', fontSize: 13, background: 'rgba(0,0,0,0.3)', padding: 8, borderRadius: 8 }}>
                          "{req.lastMessage || 'طلب التحدث مع موظف الاستقبال'}"
                        </p>

                        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                          <a
                            href={`https://wa.me/${req.customerPhone}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                              padding: '6px 12px',
                              background: '#25d366', color: '#ffffff', borderRadius: 6,
                              fontWeight: 700, fontSize: 12, textDecoration: 'none'
                            }}
                          >
                            <MessageCircle size={13} /> فتح شات الواتساب
                          </a>
                          {isPending && (
                            <button
                              onClick={() => resolveCustomerServiceRequest(req.id)}
                              style={{
                                padding: '6px 12px', background: 'rgba(59, 130, 246, 0.2)',
                                color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.4)',
                                borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: 4
                              }}
                            >
                              <CheckCircle2 size={13} /> تحديد كمكتمل
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,0.1)', textAlign: 'left' }}>
                <button
                  onClick={() => setCsModalOpen(false)}
                  style={{ padding: '8px 18px', background: 'rgba(255,255,255,0.1)', color: '#ffffff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        )}

        <BottomStatusBar activeShift={activeShift} orgName={systemInfo?.name} />
      </main>

      {/* Smart Shift Handover & Cash Settlement Modal for Admin (Identical to Employee Shift Closure) */}
      <ShiftHandoverModal
        open={handoverModalOpen}
        onClose={() => setHandoverModalOpen(false)}
        shift={activeShift ? { ...activeShift, employeeName: user?.name || activeShift.employeeName || 'المدير العام (الإدارة)' } : null}
        mode="close"
        payments={shiftPayments}
        tickets={shiftTickets}
        clients={clients}
        systemInfo={systemInfo}
        onConfirm={async (shiftId, handoverData) => {
          await closeShift(shiftId, handoverData);
          setHandoverModalOpen(false);
          window.showToast?.('✅ تم تقفيل وتسليم المناوبة بنجاح وتوليد محضر الاستلام المالي', 'success');
        }}
      />

      {/* Live Security Radar & Device Session Manager Modal */}
      <LiveSessionsModal
        isOpen={liveSessionsModalOpen}
        onClose={() => setLiveSessionsModalOpen(false)}
      />

      <style>{`
        @media (max-width: 1024px) {
          .hidden-on-mobile {
            display: none !important;
          }
          .admin-main-wrapper {
            margin-right: 0 !important;
            width: 100vw !important;
          }
        }
        @media (min-width: 1025px) {
          .hidden-on-desktop {
            display: none !important;
          }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeInDown {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
