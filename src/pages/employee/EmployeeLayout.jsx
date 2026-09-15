import { requestNotificationPermission } from '../../utils/notifications';
import React, { useState, useEffect, Suspense, lazy } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  getOpenShift, openShift, closeShift,
  addShiftExpense, addShiftRevenue, deleteShiftExpense, deleteShiftRevenue,
  watchShift, getAttendanceByEmployee, recordAttendance, getSystemInfo, watchSystemInfo,
  watchPaymentsByShift, watchTicketSalesByShift
} from '../../services/db';

const ClientsTab = lazy(() => import('../admin/tabs/ClientsTab'));
const TicketsTab = lazy(() => import('../admin/tabs/TicketsTab'));
const VouchersTab = lazy(() => import('../admin/tabs/VouchersTab'));
const ClientScanTab = lazy(() => import('../shared/ClientScanTab'));
const WorkspaceTab = lazy(() => import('../shared/WorkspaceTab'));
const AnalyticsTab = lazy(() => import('../shared/AnalyticsTab'));
const EmployeeAttendanceTab = lazy(() => import('./EmployeeAttendanceTab'));
const AiAdvisorTab = lazy(() => import('../admin/tabs/AiAdvisorTab'));
import BottomStatusBar from '../../components/BottomStatusBar';
import HeaderLiveWidget from '../../components/HeaderLiveWidget';
import { Card, Button, Input, Select, Modal, Badge, EmptyState } from '../../components/ui';
import { formatCurrency, formatDateTime, EXPENSE_CATEGORIES, REVENUE_CATEGORIES, getCurrentMonth } from '../../utils/constants';
import { printShiftReport } from '../../utils/printReport';
import ShiftHandoverModal from '../../components/ShiftHandoverModal';
import { getClients } from '../../services/db';
import {
  RotateCcw, Bot, ScanLine, Building2, Users, Ticket,
  FileText, Calendar, Clock, CheckCircle2,
  Printer, ClipboardCheck, ArrowDownCircle, ArrowUpCircle,
  PlayCircle, Sun, LogOut, Menu, X, AlertCircle, User
} from 'lucide-react';

const tabs = [
  { id: 'shift', label: 'مناوبتي', icon: RotateCcw },
  { id: 'ai_advisor', label: 'TFG AI', icon: Bot },
  { id: 'scan', label: 'فحص العضوية', icon: ScanLine },
  { id: 'workspace', label: 'WORK SPACE', icon: Building2 },
  { id: 'clients', label: 'العملاء', icon: Users },
  { id: 'tickets', label: 'التذاكر', icon: Ticket },
  { id: 'vouchers', label: 'سندات القبض والصرف', icon: FileText },
  { id: 'attendance', label: 'حضور وانصراف', icon: Calendar },
];

export default function EmployeeLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('shift');
  const [shift, setShift] = useState(null);
  const [shiftLoading, setShiftLoading] = useState(true);
  const [openingShift, setOpeningShift] = useState(false);
  const [expenseModal, setExpenseModal] = useState(false);
  const [handoverModalOpen, setHandoverModalOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ type: 'other', label: '', amount: '' });
  const [addLoading, setAddLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [systemInfo, setSystemInfo] = useState({ name: 'THE FIRST GROUP', logoUrl: '' });
  const [clients, setClients] = useState([]);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  // Keyboard shortcut Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const [shiftPayments, setShiftPayments] = useState([]);
  const [shiftTickets, setShiftTickets] = useState([]);

  useEffect(() => {
    if (!user) { navigate('/'); return; }
    if (user.role === 'cafe' || user.role === 'barista' || (user.jobTitle && user.jobTitle.includes('باريستا'))) {
      navigate('/cafe');
      return;
    }
    if (user.role !== 'employee' && user.role !== 'manager' && user.role !== 'admin') { navigate('/'); return; }
    loadShift();
    const unsubSys = watchSystemInfo(setSystemInfo);
    const unsubClients = getClients(setClients);
    loadTodayAttendance();
    return () => {
      unsubSys && unsubSys();
      unsubClients && unsubClients();
    };
  }, [user]);

  // Background idle prefetcher for instant 0ms employee tab transitions
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        import('../admin/tabs/ClientsTab');
        import('../admin/tabs/TicketsTab');
        import('../shared/ClientScanTab');
        import('../shared/WorkspaceTab');
        import('../admin/tabs/VouchersTab');
        import('./EmployeeAttendanceTab');
      } catch (e) {}
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!shift?.id) {
      setShiftPayments([]);
      setShiftTickets([]);
      return;
    }
    const unsubShift = watchShift(shift.id, setShift);
    const unsubPayments = watchPaymentsByShift(shift.id, setShiftPayments);
    const unsubTickets = watchTicketSalesByShift(shift.id, setShiftTickets);

    return () => {
      unsubShift && unsubShift();
      unsubPayments && unsubPayments();
      unsubTickets && unsubTickets();
    };
  }, [shift?.id]);

  const loadShift = async () => {
    setShiftLoading(true);
    const existing = await getOpenShift(user.id);
    setShift(existing);
    setShiftLoading(false);
  };

  const loadTodayAttendance = async () => {
    if (!user?.memberId) return;
    try {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const data = await getAttendanceByEmployee(user.memberId);
      const todayRecord = data.find(a => a.date === today);
      setTodayAttendance(todayRecord || null);
    } catch (err) {
      console.error('Error loading today attendance:', err);
    }
  };

  const handleOpenShift = async () => {
    setOpeningShift(true);
    try {
      const s = await openShift(user.id, user.name);
      setShift(s);
    } catch (err) {
      console.error('Error opening shift:', err);
      alert('حدث خطأ أثناء فتح المناوبة: ' + (err.message || ''));
    } finally {
      setOpeningShift(false);
    }
  };

  const handleCloseShift = async () => {
    if (!window.confirm('هل أنت متأكد من إغلاق المناوبة؟')) return;
    try {
      await closeShift(shift.id);
      setShift(null);
    } catch (err) {
      console.error('Error closing shift:', err);
      alert('حدث خطأ أثناء إغلاق المناوبة: ' + (err.message || ''));
    }
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!expenseForm.amount || !shift) return;
    setAddLoading(true);
    try {
      const label = expenseForm.label || EXPENSE_CATEGORIES.find(c => c.value === expenseForm.type)?.label || expenseForm.type;
      await addShiftExpense(shift.id, { ...expenseForm, label });
      setExpenseModal(false);
      setExpenseForm({ type: 'other', label: '', amount: '' });
    } catch (err) {
      console.error('Error adding shift expense:', err);
      alert('حدث خطأ أثناء إضافة المصروف: ' + (err.message || ''));
    } finally {
      setAddLoading(false);
    }
  };


  const handleAttendance = async () => {
    if (!user?.memberId) return;
    setAttendanceLoading(true);
    try {
      await recordAttendance(user.memberId, user.name);
      await loadTodayAttendance();
    } catch (err) {
      console.error('Error recording attendance:', err);
      alert('حدث خطأ أثناء تسجيل الحضور: ' + (err.message || ''));
    } finally { setAttendanceLoading(false); }
  };

  useEffect(() => {
    if (activeTab === 'attendance') loadAttendance();
  }, [activeTab]);

  const [attendanceList, setAttendanceList] = useState([]);
  const loadAttendance = async () => {
    if (!user?.memberId) return;
    try {
      const data = await getAttendanceByEmployee(user.memberId, getCurrentMonth());
      setAttendanceList(data.sort((a, b) => b.date.localeCompare(a.date)));
    } catch (err) {
      console.error('Error loading attendance:', err);
    }
  };

  const totalHours = attendanceList.filter(a => a.checkOut).reduce((s, a) => s + (Number(a.hours) || 0), 0);
  const presentDays = attendanceList.filter(a => a.checkOut).length;

  const overstayClients = clients.filter(c => {
    if (!c.workspaceCurrentSession?.checkIn) return false;
    const remaining = (Number(c.totalHours) || 0) - (Number(c.hoursUsed) || 0);
    return remaining <= 0;
  });

  const [visitedTabs] = useState(() => new Set(['shift']));
  if (!visitedTabs.has(activeTab)) {
    visitedTabs.add(activeTab);
  }

  const renderTabById = (tabId) => {
    switch (tabId) {
      case 'shift':
        return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {overstayClients.length > 0 && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1.5px solid rgba(239, 68, 68, 0.4)',
            borderRadius: 14,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <AlertCircle size={22} color="#f87171" style={{ flexShrink: 0 }} />
              <div>
                <strong style={{ color: '#fca5a5', fontSize: 14 }}>
                  تنبيه انتهاء باقة مساحة العمل ({overstayClients.length} مشترك متواجد حالياً استنفد ساعاته):
                </strong>
                <div style={{ color: '#fed7aa', fontSize: 12, marginTop: 2 }}>
                  {overstayClients.map(c => `${c.name} (#${c.memberId || '—'})`).join(' ، ')}
                </div>
              </div>
            </div>
            <Button size="sm" onClick={() => setActiveTab('workspace')} style={{ background: '#dc2626', color: '#fff', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Building2 size={15} /> فتح مساحة العمل لتسجيل الخروج / التجديد
            </Button>
          </div>
        )}
        {shiftLoading ? (
          <div style={{ textAlign: 'center', padding: '48px', color: '#7aa4d4' }}>جاري التحميل...</div>
        ) : !shift ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <Sun size={54} color="#38bdf8" />
            </div>
            <h3 style={{ color: '#ffffff', fontWeight: 800, fontSize: 22, marginBottom: 8 }}>لا توجد مناوبة مفتوحة</h3>
            <p style={{ color: '#93c5fd', fontSize: 14, marginBottom: 24 }}>افتح مناوبتك لتبدأ تسجيل الدفعات والحصص والتذاكر</p>
            <Button size="lg" onClick={handleOpenShift} disabled={openingShift} variant="success" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <PlayCircle size={18} /> {openingShift ? 'جاري الفتح...' : 'فتح مناوبة جديدة الآن'}
            </Button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Shift header */}
            <Card style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Badge color={shift.status === 'open' ? 'amber' : 'green'}>
                      {shift.status === 'open' ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={12} /> مناوبة مفتوحة
                        </span>
                      ) : (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <CheckCircle2 size={12} /> مغلقة
                        </span>
                      )}
                    </Badge>
                  </div>
                  <p style={{ color: '#93c5fd', fontSize: 13 }}>بدأت: {formatDateTime(shift.openedAt)}</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button size="sm" variant="ghost" onClick={() => {
                    printShiftReport({
                      shift: { ...shift, employeeName: user?.name || shift.employeeName },
                      payments: shiftPayments,
                      tickets: shiftTickets,
                      systemInfo,
                      clients
                    });
                  }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Printer size={14} /> طباعة التقرير
                  </Button>
                  {shift.status === 'open' && (
                    <Button size="sm" variant="danger" onClick={() => setHandoverModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <ClipboardCheck size={14} /> محضر تقفيل وتسليم المناوبة
                    </Button>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 16 }}>
                <div style={{ textAlign: 'center', padding: '12px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: 12, border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                  <p style={{ fontSize: 12, color: '#a7f3d0' }}>إيرادات</p>
                  <p style={{ color: '#34d399', fontWeight: 800, fontSize: 18, marginTop: 2 }}>{formatCurrency(shift.totalRevenue || 0)}</p>
                </div>
                <div style={{ textAlign: 'center', padding: '12px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: 12, border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                  <p style={{ fontSize: 12, color: '#fca5a5' }}>مصاريف</p>
                  <p style={{ color: '#f87171', fontWeight: 800, fontSize: 18, marginTop: 2 }}>{formatCurrency(shift.totalExpenses || 0)}</p>
                </div>
                <div style={{ textAlign: 'center', padding: '12px', background: 'rgba(59, 130, 246, 0.12)', borderRadius: 12, border: '1px solid rgba(59, 130, 246, 0.35)' }}>
                  <p style={{ fontSize: 12, color: '#bfdbfe' }}>صافي المناوبة</p>
                  <p style={{ fontWeight: 900, fontSize: 18, marginTop: 2, color: (shift.netAmount || 0) >= 0 ? '#60a5fa' : '#f87171' }}>
                    {formatCurrency(shift.netAmount || 0)}
                  </p>
                </div>
              </div>
            </Card>

            {shift.status === 'open' && (
              <div>
                <Button variant="outline" onClick={() => setExpenseModal(true)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 16px', fontSize: 13, fontWeight: 700 }}>
                  <ArrowDownCircle size={15} /> إضافة مصروف على المناوبة
                </Button>
              </div>
            )}

            {/* Revenues list */}
            {(shift.revenues || []).length > 0 && (
              <Card style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <h4 style={{ color: '#ffffff', fontWeight: 700, fontSize: 15, marginBottom: 10 }}>الإيرادات الإضافية</h4>
                {shift.revenues.map(r => (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: '#c8dcf5', fontSize: 13 }}>{r.label}</span>
                    <span style={{ color: '#34d399', fontWeight: 700, fontSize: 14 }}>{formatCurrency(r.amount)}</span>
                  </div>
                ))}
              </Card>
            )}

            {/* Shift Subscriptions list */}
            {shiftPayments.length > 0 && (
              <Card style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <h4 style={{ color: '#ffffff', fontWeight: 700, fontSize: 15, marginBottom: 10 }}>الاشتراكات والمدفوعات المحصلة</h4>
                {shiftPayments.map(p => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ color: '#ffffff', fontSize: 13, fontWeight: 600 }}>{p.clientName || 'عميل'}</span>
                      <span style={{ color: '#93c5fd', fontSize: 11 }}>{p.note || 'دفعة'}</span>
                    </div>
                    <span style={{ color: '#34d399', fontWeight: 700, fontSize: 14 }}>{formatCurrency(p.amount)}</span>
                  </div>
                ))}
              </Card>
            )}

            {/* Shift Tickets list */}
            {shiftTickets.length > 0 && (
              <Card style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <h4 style={{ color: '#ffffff', fontWeight: 700, fontSize: 15, marginBottom: 10 }}>مبيعات التذاكر</h4>
                {shiftTickets.map(t => (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ color: '#ffffff', fontSize: 13, fontWeight: 600 }}>{t.ticketName}</span>
                      <span style={{ color: '#93c5fd', fontSize: 11 }}>{t.quantity} تذكرة × {formatCurrency(t.ticketPrice)}</span>
                    </div>
                    <span style={{ color: '#34d399', fontWeight: 700, fontSize: 14 }}>{formatCurrency(t.total || (t.quantity * t.ticketPrice))}</span>
                  </div>
                ))}
              </Card>
            )}

            {/* Expenses list */}
            {(shift.expenses || []).length > 0 && (
              <Card style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <h4 style={{ color: '#ffffff', fontWeight: 700, fontSize: 15, marginBottom: 10 }}>المصاريف المسجلة</h4>
                {shift.expenses.map(ex => (
                  <div key={ex.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: '#c8dcf5', fontSize: 13 }}>{ex.label}</span>
                    <span style={{ color: '#f87171', fontWeight: 700, fontSize: 14 }}>{formatCurrency(ex.amount)}</span>
                  </div>
                ))}
              </Card>
            )}
          </div>
        )}
      </div>
    );

      case 'analytics':
        return <AnalyticsTab />;

      case 'scan':
        return (
          <ClientScanTab
            shiftId={shift?.status === 'open' ? shift?.id : null}
            employeeId={user?.id}
            isEmployee={true}
          />
        );

      case 'workspace':
        return (
          <WorkspaceTab
            shiftId={shift?.status === 'open' ? shift?.id : null}
            employeeId={user?.id}
            isEmployee={true}
          />
        );

      case 'clients':
        return (
          <ClientsTab
            shiftId={shift?.status === 'open' ? shift?.id : null}
            employeeId={user?.id}
            isEmployee={true}
          />
        );

      case 'tickets':
        return (
          <TicketsTab
            shiftId={shift?.status === 'open' ? shift?.id : null}
            employeeId={user?.id}
            isEmployee={true}
          />
        );

      case 'attendance':
        return <EmployeeAttendanceTab user={user} />;

      case 'vouchers':
        return (
          <VouchersTab
            shiftId={shift?.status === 'open' ? shift?.id : null}
            employeeId={user?.id}
            isEmployee={true}
          />
        );

      case 'ai_advisor':
        return <AiAdvisorTab isEmployee={true} />;

      default:
        return null;
    }
  };

  const currentTab = tabs.find(t => t.id === activeTab) || tabs[0];
  const CurrentTabIcon = currentTab?.icon;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: 'transparent',
      overflow: 'hidden',
      position: 'relative'
    }}>
      {/* Mobile Off-Canvas Drawer (< 1024px) */}
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
                  <span style={{ fontSize: 11, color: '#38bdf8', fontWeight: 700 }}>{user?.name} · {user?.memberId || 'موظف'}</span>
                </div>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', borderRadius: 8, padding: 6, cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Shift Status in Drawer */}
            <div style={{
              padding: '10px 12px', borderRadius: 10, marginBottom: 14,
              background: shift?.status === 'open' ? 'rgba(16, 185, 129, 0.14)' : 'rgba(239, 68, 68, 0.14)',
              border: shift?.status === 'open' ? '1.5px solid rgba(16, 185, 129, 0.4)' : '1.5px solid rgba(239, 68, 68, 0.4)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: shift?.status === 'open' ? 8 : 0 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: shift?.status === 'open' ? '#34d399' : '#f87171', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className={`pulse-dot ${shift?.status === 'open' ? 'pulse-dot-emerald' : 'pulse-dot-red'}`} style={{ width: 8, height: 8 }} />
                  {shift?.status === 'open' ? '🟢 مناوبة مفتوحة ونشطة' : '🔴 المناوبة مغلقة'}
                </span>
                {shift?.status === 'open' && (
                  <span style={{ fontSize: 10.5, color: '#6ee7b7' }}>#{shift.id.slice(-4)}</span>
                )}
              </div>
              {shift?.status === 'open' && (
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setHandoverModalOpen(true);
                    }}
                    style={{
                      flex: 1, padding: '6px 8px', borderRadius: 6,
                      background: 'rgba(16, 185, 129, 0.25)', border: '1px solid rgba(16, 185, 129, 0.4)',
                      color: '#ffffff', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4
                    }}
                  >
                    <ClipboardCheck size={12} /> تسليم المناوبة
                  </button>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      printShiftReport({
                        shift: { ...shift, employeeName: user?.name || shift.employeeName },
                        payments: shiftPayments,
                        tickets: shiftTickets,
                        systemInfo,
                        clients
                      });
                    }}
                    style={{
                      padding: '6px 10px', borderRadius: 6,
                      background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#ffffff', fontSize: 11, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                  >
                    <Printer size={12} />
                  </button>
                </div>
              )}
            </div>

            {/* Drawer Tabs Navigation */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
              {tabs.map(tab => {
                const TabIcon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setMobileMenuOpen(false);
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 8,
                      background: isActive ? 'rgba(56, 189, 248, 0.18)' : 'rgba(255,255,255,0.03)',
                      border: isActive ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid transparent',
                      color: isActive ? '#38bdf8' : '#cbd5e1',
                      cursor: 'pointer', textAlign: 'right', fontSize: 13, fontWeight: isActive ? 800 : 500
                    }}
                  >
                    <TabIcon size={17} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Drawer Logout */}
            <div style={{ marginTop: 'auto', paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <button
                onClick={() => { logout(); navigate('/'); }}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 8,
                  background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#f87171', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                }}
              >
                <LogOut size={16} /> تسجيل الخروج
              </button>
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
            onClick={() => setActiveTab('shift')}
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

        {/* Center: Navigation Tabs (Desktop) */}
        <nav
          className="hidden-on-mobile"
          style={{ display: 'flex', alignItems: 'center', gap: 4, height: '100%', overflowX: 'auto', padding: '0 4px', flexShrink: 0 }}
        >
          {tabs.map(tab => {
            const TabIcon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: isActive
                    ? '1px solid rgba(56, 189, 248, 0.45)'
                    : '1px solid transparent',
                  background: isActive
                    ? 'rgba(56, 189, 248, 0.16)'
                    : 'transparent',
                  color: isActive ? '#38bdf8' : '#cbd5e1',
                  fontWeight: isActive ? 800 : 600,
                  fontSize: 12.5,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.16s cubic-bezier(0.16, 1, 0.3, 1)'
                }}
              >
                <TabIcon size={16} strokeWidth={isActive ? 2.2 : 1.8} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Left side: Shift actions + Logout + HeaderLiveWidget */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0
        }}>
          {shift?.status === 'open' && (
            <>
              <button
                onClick={() => setHandoverModalOpen(true)}
                className="btn btn-ghost btn-sm no-print hidden-on-mobile"
                title="محضر تقفيل وتسليم المناوبة"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  borderRadius: 8,
                  padding: '6px 10px',
                  cursor: 'pointer',
                  color: '#34d399',
                  fontSize: 12,
                  fontWeight: 700
                }}
              >
                <ClipboardCheck size={14} color="#34d399" />
                <span>تسليم المناوبة</span>
              </button>

              <button
                onClick={() => {
                  printShiftReport({
                    shift: { ...shift, employeeName: user?.name || shift.employeeName },
                    payments: shiftPayments,
                    tickets: shiftTickets,
                    systemInfo,
                    clients
                  });
                }}
                className="btn btn-ghost btn-sm no-print hidden-on-mobile"
                title="طباعة تقرير المناوبة الحالية"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  padding: '6px 10px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  color: '#cbd5e1'
                }}
              >
                <Printer size={15} />
              </button>
            </>
          )}

          {/* Quick Logout Button */}
          <button
            onClick={() => { logout(); navigate('/'); }}
            title="تسجيل الخروج وإغلاق الجلسة"
            className="btn btn-ghost btn-sm no-print"
            style={{
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              padding: '6px 10px',
              borderRadius: 8,
              cursor: 'pointer',
              color: '#f87171'
            }}
          >
            <LogOut size={15} />
          </button>

          <div className="hidden-on-mobile">
            <HeaderLiveWidget shift={shift} role="employee" />
          </div>
        </div>
      </header>

      {/* Sub-Header Bar: Responsive Active Breadcrumb & Shift Status */}
      <div className="responsive-subheader no-print">
        {/* Row 1: Breadcrumb + Employee Name */}
        <div className="responsive-subheader-row1">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span
              className={`pulse-dot ${shift?.status === 'open' ? 'pulse-dot-emerald' : 'pulse-dot-red'}`}
              title={shift?.status === 'open' ? "المناوبة مفتوحة ونشطة لحظياً" : "المناوبة مغلقة"}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <span className="hidden-on-mobile" style={{ color: '#64748b', fontSize: 12.5 }}>بوابة الموظف</span>
              <span className="hidden-on-mobile" style={{ color: '#475569', fontSize: 12 }}>/</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {CurrentTabIcon && <CurrentTabIcon size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
                <h2 className="titanium-title" style={{ fontWeight: 800, fontSize: 13.5, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {currentTab?.label}
                </h2>
              </div>
            </div>
          </div>

          {/* Prominent Employee Name Badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(56, 189, 248, 0.1)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            padding: '3px 8px',
            borderRadius: 8,
            color: '#38bdf8',
            fontSize: 11.5,
            fontWeight: 700,
            flexShrink: 0
          }}>
            <span style={{
              background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8',
              borderRadius: 6, padding: '1px 5px', fontSize: 9.5, fontWeight: 800
            }}>
              موظف
            </span>
            <span style={{ whiteSpace: 'nowrap' }}>{user?.name}</span>
            <User size={12} color="#38bdf8" />
          </div>
        </div>

        {/* Row 2: Shift Actions & Status Bar */}
        <div className="responsive-subheader-row2">
          {shift?.status === 'open' ? (
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
                onClick={() => setHandoverModalOpen(true)}
                className="btn btn-ghost btn-sm no-print"
                title="محضر تقفيل وتسليم المناوبة"
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
                    shift: { ...shift, employeeName: user?.name || shift.employeeName },
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
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area: 100% Full Width */}
      <main
        className="employee-main-wrapper"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          width: '100vw',
          minWidth: 0
        }}
      >
        <div
          className="app-main-content"
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '20px 24px',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          {Array.from(visitedTabs).map(tabId => (
            <div
              key={tabId}
              style={{ display: activeTab === tabId ? 'block' : 'none' }}
              className="tab-pane-transition"
            >
              <Suspense fallback={
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  minHeight: '45vh', gap: 16
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    border: '3px solid rgba(56, 189, 248, 0.18)', borderTopColor: '#38bdf8',
                    animation: 'spin 0.7s linear infinite'
                  }} />
                  <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 700 }}>
                    جاري تحميل القسم...
                  </span>
                </div>
              }>
                {renderTabById(tabId)}
              </Suspense>
            </div>
          ))}
        </div>
        <BottomStatusBar activeShift={shift} orgName={systemInfo.name} />
      </main>

      {/* Expense Modal */}
      <Modal open={expenseModal} onClose={() => setExpenseModal(false)} title="إضافة مصروف على المناوبة" size="sm">
        <form onSubmit={handleAddExpense} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Select label="نوع المصروف" value={expenseForm.type} onChange={e => {
            const label = EXPENSE_CATEGORIES.find(c => c.value === e.target.value)?.label || '';
            setExpenseForm({ ...expenseForm, type: e.target.value, label });
          }}>
            {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
          <Input label="وصف تفصيلي (اختياري)" value={expenseForm.label} onChange={e => setExpenseForm({ ...expenseForm, label: e.target.value })} placeholder="مثل: أدوات نظافة" />
          <Input label="المبلغ (ج.م)" type="number" value={expenseForm.amount} onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })} required />
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <Button type="submit" variant="danger" className="flex-1" disabled={addLoading}>إضافة المصروف</Button>
            <Button type="button" variant="ghost" className="flex-1" onClick={() => setExpenseModal(false)}>إلغاء</Button>
          </div>
        </form>
      </Modal>

      {/* Smart Shift Handover & Cash Settlement Modal */}
      <ShiftHandoverModal
        open={handoverModalOpen}
        onClose={() => setHandoverModalOpen(false)}
        shift={shift ? { ...shift, employeeName: user?.name || shift.employeeName } : null}
        mode="close"
        payments={shiftPayments}
        tickets={shiftTickets}
        clients={clients}
        systemInfo={systemInfo}
        onConfirm={async (shiftId, handoverData) => {
          await closeShift(shiftId, handoverData);
          setShift(null);
        }}
      />

      <style>{`
        @media (max-width: 1024px) {
          .hidden-on-mobile {
            display: none !important;
          }
          .employee-main-wrapper {
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
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}