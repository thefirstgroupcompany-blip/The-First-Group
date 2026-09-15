import React, { useState, useEffect, useMemo } from 'react';
import { 
  getAllShifts, closeShift, deleteShift, getShiftPayments, getShiftSessions, 
  getShiftTicketSales, getEmployees, openShift, addShiftExpense, addShiftRevenue,
  updateShiftHandover, getCafeShifts, closeCafeShift, deleteCafeShift, adminUpdateShift
} from '../../../services/db';
import { useAuth } from '../../../contexts/AuthContext';
import { Card, Button, Badge, EmptyState, ConfirmDialog, Modal, Select, Input } from '../../../components/ui';
import { formatCurrency, formatDateTime, formatDate, getCurrentMonth, getMonthLabel, getEffectiveDate } from '../../../utils/constants';
import ShiftDetailModal from './ShiftDetailModal';
import CafeShiftDetailModal from '../../../components/CafeShiftDetailModal';
import { printShiftReport } from '../../../utils/printReport';
import ShiftHandoverModal from '../../../components/ShiftHandoverModal';
import { getSystemInfo, getClients } from '../../../services/db';
import { exportToExcel } from '../../../utils/excelExport';
import { Coffee, Building2, Crown, Store, CheckCircle2, Edit3, Trash2 } from 'lucide-react';

export default function ShiftsTab() {
  const [shifts, setShifts] = useState([]);
  const [cafeShifts, setCafeShifts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [clients, setClients] = useState([]);
  const [systemInfo, setSystemInfo] = useState({});
  
  // Filtering States
  const [shiftTypeFilter, setShiftTypeFilter] = useState('all'); // 'all', 'workspace', 'cafe', 'admin'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'open', 'closed'
  const [empFilter, setEmpFilter] = useState('all'); // 'all', 'ADMIN', or employeeId
  const [datePreset, setDatePreset] = useState('all'); // 'today', 'this_week', 'this_month', 'custom_month', 'custom_range', 'all'
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  
  // Custom Date Range
  const todayStr = new Date().toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination
  const [displayLimit, setDisplayLimit] = useState(15);

  // Dialog & Modal States
  const [closeId, setCloseId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [handoverModalShift, setHandoverModalShift] = useState(null);
  const [handoverModalMode, setHandoverModalMode] = useState('close');
  const [handoverPayments, setHandoverPayments] = useState([]);
  const [handoverTickets, setHandoverTickets] = useState([]);
  const [printLoading, setPrintLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkPrinting, setBulkPrinting] = useState(false);
  const [openShiftModal, setOpenShiftModal] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [openLoading, setOpenLoading] = useState(false);
  const [inspectShiftId, setInspectShiftId] = useState(null);

  // Cafe Shift Modals
  const [viewCafeShift, setViewCafeShift] = useState(null);
  const [closeCafeModalShift, setCloseCafeModalShift] = useState(null);
  const [closeCafeActualCount, setCloseCafeActualCount] = useState('');
  const [closeCafeNotes, setCloseCafeNotes] = useState('');
  const [closeCafeLoading, setCloseCafeLoading] = useState(false);

  const { user } = useAuth();

  // Edit Shift Modal (Admin Direct Modification)
  const [editShiftModal, setEditShiftModal] = useState(false);
  const [editingShift, setEditingShift] = useState(null);
  const [editShiftForm, setEditShiftForm] = useState({
    employeeName: '',
    totalRevenue: '',
    totalExpenses: '',
    drawerCash: '',
    status: 'closed',
    notes: ''
  });
  const [editShiftLoading, setEditShiftLoading] = useState(false);

  // Admin Shift Modals
  const [adminExpenseModal, setAdminExpenseModal] = useState(false);
  const [adminRevenueModal, setAdminRevenueModal] = useState(false);
  const [adminExpForm, setAdminExpForm] = useState({ label: '', amount: '', type: 'rent' });
  const [adminRevForm, setAdminRevForm] = useState({ label: '', amount: '', type: 'cafe' });
  const [adminActionLoading, setAdminActionLoading] = useState(false);

  useEffect(() => {
    const unsubS = getAllShifts(setShifts);
    const unsubCafe = getCafeShifts(setCafeShifts);
    const unsubE = getEmployees(setEmployees);
    const unsubC = getClients(setClients);
    getSystemInfo().then(setSystemInfo);
    return () => { unsubS(); unsubCafe(); unsubE(); unsubC(); };
  }, []);

  const openAdminShift = shifts.find(s => (s.employeeId === 'ADMIN' || s.isAdminShift) && s.status === 'open');

  // Unified list of all shifts (Workspace + Cafe + Admin)
  const allUnifiedShifts = useMemo(() => {
    const normShifts = shifts.map(s => {
      const isAdmin = s.employeeId === 'ADMIN' || s.isAdminShift;
      return {
        ...s,
        shiftType: isAdmin ? 'admin' : 'workspace',
        isCafeShift: false,
        codePrefix: 'SHF',
        typeLabel: isAdmin ? 'مناوبة الإدارة العامة' : 'مساحة العمل والاستقبال',
        empDisplayName: s.employeeName || (isAdmin ? 'المدير العام' : 'موظف الاستقبال'),
        revenue: Number(s.totalRevenue || 0),
        totalExpenses: Number(s.totalExpenses || 0),
        expenses: Array.isArray(s.expenses) ? s.expenses : [],
        revenues: Array.isArray(s.revenues) ? s.revenues : [],
        net: Number(s.netAmount || 0),
        drawer: Number(s.drawerCash !== undefined ? s.drawerCash : (s.cashRevenue || 0))
      };
    });

    const normCafe = cafeShifts.map(cs => {
      const rev = Number(cs.totalSales || 0);
      const exp = Number(cs.totalExpenses || 0);
      return {
        ...cs,
        shiftType: 'cafe',
        isCafeShift: true,
        codePrefix: 'CAF',
        typeLabel: 'كافيه TFG | CAFE',
        empDisplayName: cs.baristaName || 'باريستا الكافيه',
        employeeName: cs.baristaName || 'باريستا الكافيه',
        employeeId: cs.baristaId || 'CAFE',
        totalRevenue: rev,
        totalExpenses: exp,
        expenses: Array.isArray(cs.expenses) ? cs.expenses : [],
        revenues: Array.isArray(cs.revenues) ? cs.revenues : [],
        netAmount: rev - exp,
        revenue: rev,
        net: rev - exp,
        drawer: Number(cs.drawerCash || 0),
        actualCash: cs.actualClosingCount !== undefined ? cs.actualClosingCount : cs.drawerCash,
        actualClosingCount: cs.actualClosingCount,
        expectedCash: cs.expectedDrawer !== undefined ? cs.expectedDrawer : cs.drawerCash,
        cashDifference: cs.drawerDifference !== undefined ? cs.drawerDifference : 0,
        drawerDifference: cs.drawerDifference !== undefined ? cs.drawerDifference : 0
      };
    });

    return [...normShifts, ...normCafe].sort((a, b) => {
      const da = getEffectiveDate(a.openedAt) || new Date(0);
      const db = getEffectiveDate(b.openedAt) || new Date(0);
      return db.getTime() - da.getTime();
    });
  }, [shifts, cafeShifts]);

  // Filter shifts based on Shift Type, Date Preset, Status, Employee, and Search Query
  const filteredShifts = useMemo(() => {
    const now = new Date();
    const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);
    const sevenDaysAgoTime = sevenDaysAgo.getTime();

    return allUnifiedShifts.filter(shift => {
      // 0. Shift type filter (All, Workspace, Cafe, Admin)
      if (shiftTypeFilter !== 'all' && shift.shiftType !== shiftTypeFilter) return false;

      // 1. Status filter
      if (statusFilter !== 'all' && shift.status !== statusFilter) return false;

      // 2. Employee filter
      if (empFilter === 'ADMIN') {
        if (shift.employeeId !== 'ADMIN' && !shift.isAdminShift) return false;
      } else if (empFilter === 'CAFE') {
        if (!shift.isCafeShift) return false;
      } else if (empFilter !== 'all') {
        if (shift.employeeId !== empFilter && shift.baristaId !== empFilter) return false;
      }

      // 3. Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const code = `${shift.codePrefix || 'shf'}-${(shift.id || '').slice(-6)}`.toLowerCase();
        const name = (shift.empDisplayName || shift.employeeName || '').toLowerCase();
        if (!code.includes(q) && !name.includes(q)) return false;
      }

      // 4. Date filtering
      const shiftDate = getEffectiveDate(shift.openedAt) || new Date();
      const shiftTime = shiftDate.getTime();
      const shiftMonthStr = `${shiftDate.getFullYear()}-${String(shiftDate.getMonth() + 1).padStart(2, '0')}`;
      const shiftDateStr = `${shiftDate.getFullYear()}-${String(shiftDate.getMonth() + 1).padStart(2, '0')}-${String(shiftDate.getDate()).padStart(2, '0')}`;

      if (datePreset === 'today') {
        return shiftDateStr === todayDateStr || Math.abs(now.getTime() - shiftTime) < 24 * 3600 * 1000;
      } else if (datePreset === 'this_week') {
        return shiftTime >= sevenDaysAgoTime;
      } else if (datePreset === 'this_month') {
        return shiftMonthStr === getCurrentMonth() || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}` === shiftMonthStr;
      } else if (datePreset === 'custom_month') {
        return shiftMonthStr === selectedMonth;
      } else if (datePreset === 'custom_range') {
        return shiftDateStr >= startDate && shiftDateStr <= endDate;
      } else if (datePreset === 'all') {
        return true;
      }

      return true;
    });
  }, [allUnifiedShifts, shiftTypeFilter, statusFilter, empFilter, datePreset, selectedMonth, startDate, endDate, searchQuery]);

  const visibleShifts = filteredShifts.slice(0, displayLimit);

  const totalRev = filteredShifts.reduce((s, sh) => s + (Number(sh.totalRevenue) || 0), 0);
  const totalExp = filteredShifts.reduce((s, sh) => s + (Number(sh.totalExpenses) || 0), 0);
  const totalNet = filteredShifts.reduce((s, sh) => s + (Number(sh.netAmount) || 0), 0);

  const handleStartAdminSelfShift = async () => {
    setOpenLoading(true);
    try {
      await openShift('ADMIN', 'المدير العام (الإدارة)');
    } catch (err) {
      alert('حدث خطأ أثناء فتح مناوبة الإدارة: ' + err.message);
    } finally {
      setOpenLoading(false);
    }
  };

  const handleAdminOpenShift = async (e) => {
    e.preventDefault();
    if (!selectedEmpId) return;
    const emp = employees.find(x => x.id === selectedEmpId);
    if (!emp) return;
    setOpenLoading(true);
    try {
      await openShift(emp.id, emp.name);
      setOpenShiftModal(false);
      setSelectedEmpId('');
    } catch (err) {
      alert('حدث خطأ أثناء فتح المناوبة للموظف');
    } finally {
      setOpenLoading(false);
    }
  };

  const handleOpenCloseHandover = async (shift) => {
    setHandoverModalMode('close');
    setHandoverModalShift(shift);
    try {
      const [payments, tickets] = await Promise.all([
        getShiftPayments(shift.id),
        getShiftTicketSales(shift.id)
      ]);
      setHandoverPayments(payments || []);
      setHandoverTickets(tickets || []);
    } catch (e) {
      console.error(e);
      setHandoverPayments([]);
      setHandoverTickets([]);
    }
  };

  const handleOpenAdjustHandover = async (shift) => {
    setHandoverModalMode('adjust');
    setHandoverModalShift(shift);
    try {
      const [payments, tickets] = await Promise.all([
        getShiftPayments(shift.id),
        getShiftTicketSales(shift.id)
      ]);
      setHandoverPayments(payments || []);
      setHandoverTickets(tickets || []);
    } catch (e) {
      console.error(e);
      setHandoverPayments([]);
      setHandoverTickets([]);
    }
  };

  const openEditShiftModal = (shift) => {
    setEditingShift(shift);
    const isCafe = !!shift.isCafeShift;
    setEditShiftForm({
      employeeName: isCafe ? (shift.baristaName || '') : (shift.employeeName || ''),
      totalRevenue: String(shift.totalRevenue || shift.totalSales || 0),
      totalExpenses: String(shift.totalExpenses || 0),
      drawerCash: String(shift.drawerCash ?? shift.drawer ?? shift.actualCash ?? 0),
      status: shift.status || 'closed',
      notes: shift.handoverNotes || shift.notes || shift.closeNotes || ''
    });
    setEditShiftModal(true);
  };

  const handleSaveEditShift = async (e) => {
    e.preventDefault();
    if (!editingShift) return;
    setEditShiftLoading(true);
    try {
      const isCafe = !!editingShift.isCafeShift;
      const numRevenue = Number(editShiftForm.totalRevenue) || 0;
      const numExpenses = Number(editShiftForm.totalExpenses) || 0;
      const numDrawer = Number(editShiftForm.drawerCash) || 0;
      const net = numRevenue - numExpenses;

      const payload = isCafe ? {
        baristaName: editShiftForm.employeeName?.trim() || 'كاشير الكافيه',
        totalSales: numRevenue,
        totalExpenses: numExpenses,
        netProfit: net,
        drawerCash: numDrawer,
        actualCount: numDrawer,
        status: editShiftForm.status,
        closeNotes: editShiftForm.notes,
        notes: editShiftForm.notes
      } : {
        employeeName: editShiftForm.employeeName?.trim() || 'موظف الاستقبال',
        totalRevenue: numRevenue,
        totalExpenses: numExpenses,
        netAmount: net,
        drawer: numDrawer,
        actualCash: numDrawer,
        status: editShiftForm.status,
        handoverNotes: editShiftForm.notes
      };

      await adminUpdateShift(editingShift.id, isCafe, payload, user?.name || 'المدير العام');
      setEditShiftModal(false);
      setEditingShift(null);
      alert('✅ تم تعديل بيانات المناوبة وحفظها بنجاح!');
    } catch (err) {
      alert('حدث خطأ أثناء تعديل المناوبة: ' + (err.message || ''));
    } finally {
      setEditShiftLoading(false);
    }
  };

  const handleAddAdminExp = async (e) => {
    e.preventDefault();
    if (!openAdminShift || !adminExpForm.label || !adminExpForm.amount) return;
    setAdminActionLoading(true);
    try {
      await addShiftExpense(openAdminShift.id, adminExpForm);
      setAdminExpenseModal(false);
      setAdminExpForm({ label: '', amount: '', type: 'rent' });
    } catch (err) {
      alert('خطأ في إضافة المصروف: ' + err.message);
    } finally {
      setAdminActionLoading(false);
    }
  };

  const handleAddAdminRev = async (e) => {
    e.preventDefault();
    if (!openAdminShift || !adminRevForm.label || !adminRevForm.amount) return;
    setAdminActionLoading(true);
    try {
      await addShiftRevenue(openAdminShift.id, adminRevForm);
      setAdminRevenueModal(false);
      setAdminRevForm({ label: '', amount: '', type: 'cafe' });
    } catch (err) {
      alert('خطأ في إضافة الإيراد: ' + err.message);
    } finally {
      setAdminActionLoading(false);
    }
  };

  const handlePrintSingle = async (shift) => {
    setPrintLoading(true);
    try {
      const [payments, sessions, tickets] = await Promise.all([
        getShiftPayments(shift.id),
        getShiftSessions(shift.id),
        getShiftTicketSales(shift.id)
      ]);
      printShiftReport({
        shift,
        payments,
        tickets,
        systemInfo,
        clients
      });
    } finally {
      setPrintLoading(false);
    }
  };

  const handleBulkPrint = async () => {
    if (selectedIds.length === 0) return;
    setBulkPrinting(true);
    try {
      const selectedShifts = allUnifiedShifts.filter(s => selectedIds.includes(s.id));
      const allData = await Promise.all(
        selectedShifts.map(async s => ({
          shift: s,
          payments: s.isCafeShift ? [] : await getShiftPayments(s.id),
        }))
      );

      const win = window.open('', '_blank');
      if (!win) {
        alert('يرجى السماح بالنوافذ المنبثقة لطباعة التقارير');
        return;
      }
      win.document.write(`
        <html dir="rtl"><head><title>تقارير المناوبات المحددة</title>
        <style>
          body{font-family:Cairo,sans-serif;direction:rtl;padding:20px}
          .block{page-break-after:always;padding:16px;border:1px solid #ccc;border-radius:8px;margin-bottom:20px}
          .row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee}
        </style>
        </head><body>
        ${allData.map(({ shift }) => `
          <div class="block">
            <h3>مناوبة: ${shift.empDisplayName || shift.employeeName} (${shift.typeLabel || 'مناوبة'})</h3>
            <p style="font-size:12px;color:#666">بدأت: ${new Date(shift.openedAt?.toDate?.() || shift.openedAt).toLocaleString('ar-EG-u-nu-latn')}</p>
            <div class="row"><span>الإيرادات / المبيعات</span><strong>${formatCurrency(shift.totalRevenue)}</strong></div>
            <div class="row"><span>المصاريف</span><strong>${formatCurrency(shift.totalExpenses)}</strong></div>
            <div class="row"><span>الصافي</span><strong>${formatCurrency(shift.netAmount)}</strong></div>
          </div>
        `).join('')}
        </body></html>
      `);
      win.document.close();
      win.print();
      setSelectedIds([]);
    } catch (err) {
      console.error('Error during bulk print:', err);
      alert('حدث خطأ أثناء طباعة المناوبات: ' + (err.message || ''));
    } finally {
      setBulkPrinting(false);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // Export filtered shifts to Excel
  const handleExportShiftsExcel = () => {
    const headers = ['#', 'كود المناوبة', 'نوع المناوبة', 'الموظف المسئول', 'الحالة', 'تاريخ الفتح', 'تاريخ الإغلاق', 'الإيرادات / المبيعات (ج.م)', 'المصروفات (ج.م)', 'الصافي للخزينة (ج.م)'];
    const rows = filteredShifts.map((s, idx) => [
      idx + 1,
      `${s.codePrefix || 'SHF'}-${(s.id || '').slice(-6).toUpperCase()}`,
      s.typeLabel || (s.isCafeShift ? 'كافيه TFG' : (s.employeeId === 'ADMIN' || s.isAdminShift ? 'مناوبة الإدارة' : 'مساحة العمل')),
      s.empDisplayName || s.employeeName,
      s.status === 'open' ? 'مفتوحة 🟢' : 'مغلقة 🔒',
      s.openedAt ? formatDateTime(s.openedAt) : '—',
      s.closedAt ? formatDateTime(s.closedAt) : (s.status === 'open' ? 'جارية الآن' : '—'),
      s.totalRevenue || 0,
      s.totalExpenses || 0,
      s.netAmount || 0
    ]);

    exportToExcel(`سجل_المناوبات_${datePreset}_${new Date().toISOString().split('T')[0]}`, headers, rows);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 👑 Dedicated Admin Shift Hero Banner (Always Visible At The Top) */}
      <Card style={{
        background: openAdminShift 
          ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.18) 0%, rgba(15, 32, 64, 0.95) 100%)' 
          : 'linear-gradient(135deg, rgba(30, 58, 138, 0.3) 0%, rgba(15, 23, 42, 0.95) 100%)',
        border: openAdminShift ? '1px solid rgba(245, 158, 11, 0.6)' : '1px solid rgba(59, 130, 246, 0.4)',
        boxShadow: openAdminShift ? '0 0 30px rgba(245, 158, 11, 0.15)' : '0 4px 20px rgba(0,0,0,0.3)',
        padding: '20px 24px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ minWidth: 260 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 26 }}>👑</span>
              <h3 style={{ margin: 0, color: '#f8fafc', fontSize: 18, fontWeight: 800 }}>
                {openAdminShift ? 'مناوبة الإدارة (المدير العام) — مفتوحة ونشطة الآن' : 'مناوبة خاصة بالإدارة (المدير العام)'}
              </h3>
              <Badge color={openAdminShift ? 'amber' : 'blue'}>
                {openAdminShift ? 'جارية ومفتوحة 🟢' : 'مغلقة ⏸️'}
              </Badge>
            </div>
            <p style={{ margin: 0, color: '#c8dcf5', fontSize: 13, lineHeight: 1.5 }}>
              {openAdminShift 
                ? 'يمكنك تسجيل كافة المصروفات الإدارية (إيجار، كهرباء، إنترنت، مرتبات) والإيرادات الجانبية ونقدية المدير مباشرة.' 
                : 'افتح مناوبة خاصة بالإدارة لإدارة المصروفات الإدارية الثابتة، فواتير المكان، والإيرادات الجانبية ونقدية الخزينة.'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {openAdminShift ? (
              <>
                <Button
                  size="sm"
                  onClick={() => setAdminExpenseModal(true)}
                  style={{ background: 'rgba(239, 68, 68, 0.25)', border: '1px solid rgba(239, 68, 68, 0.6)', color: '#fca5a5', fontWeight: 800 }}
                >
                  ➕ إضافة مصروف إداري
                </Button>
                <Button
                  size="sm"
                  onClick={() => setAdminRevenueModal(true)}
                  style={{ background: 'rgba(16, 185, 129, 0.25)', border: '1px solid rgba(16, 185, 129, 0.6)', color: '#6ee7b7', fontWeight: 800 }}
                >
                  ➕ إضافة إيراد جانبي
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => setInspectShiftId(openAdminShift.id)}
                >
                  🔍 فحص وتعديل
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => setCloseId(openAdminShift.id)}
                >
                  🔒 تقفيل مناوبة الإدارة
                </Button>
              </>
            ) : (
              <Button
                size="md"
                onClick={handleStartAdminSelfShift}
                disabled={openLoading}
                style={{
                  background: 'linear-gradient(135deg, #d97706, #f59e0b)',
                  color: '#000000',
                  fontWeight: 900,
                  fontSize: 14,
                  padding: '10px 20px',
                  boxShadow: '0 4px 16px rgba(245, 158, 11, 0.4)'
                }}
              >
                {openLoading ? 'جاري الفتح...' : '👑 فتح مناوبة الإدارة الآن'}
              </Button>
            )}
          </div>
        </div>

        {/* Live Mini Counters for Open Admin Shift */}
        {openAdminShift && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12,
            marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.1)'
          }}>
            <div style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.25)', padding: '10px 14px', borderRadius: 10, textAlign: 'center' }}>
              <span style={{ fontSize: 11, color: '#a7f3d0' }}>إيرادات مناوبة الإدارة</span>
              <strong style={{ display: 'block', fontSize: 16, color: '#34d399', marginTop: 4 }}>{formatCurrency(openAdminShift.totalRevenue || 0)}</strong>
            </div>
            <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.25)', padding: '10px 14px', borderRadius: 10, textAlign: 'center' }}>
              <span style={{ fontSize: 11, color: '#fca5a5' }}>مصروفات مناوبة الإدارة</span>
              <strong style={{ display: 'block', fontSize: 16, color: '#f87171', marginTop: 4 }}>{formatCurrency(openAdminShift.totalExpenses || 0)}</strong>
            </div>
            <div style={{ background: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.25)', padding: '10px 14px', borderRadius: 10, textAlign: 'center' }}>
              <span style={{ fontSize: 11, color: '#93c5fd' }}>صافي نقدية الإدارة</span>
              <strong style={{ display: 'block', fontSize: 16, color: (openAdminShift.netAmount || 0) >= 0 ? '#60a5fa' : '#f87171', marginTop: 4 }}>
                {formatCurrency(openAdminShift.netAmount || 0)}
              </strong>
            </div>
          </div>
        )}
      </Card>

      {/* ========================================================= */}
      {/* 🔍 DATE AND SHIFT FILTER CONTROLS BAR (NEW) */}
      {/* ========================================================= */}
      <Card style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '18px 20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Shift Type Switcher Bar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.08)'
          }}>
            <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 700 }}>🏢 نوع المناوبة:</span>
            {[
              { id: 'all', label: 'كافة المناوبات (شامل الكل)', count: allUnifiedShifts.length, icon: Store },
              { id: 'workspace', label: 'مناوبات موظفي الريسيبشن', count: allUnifiedShifts.filter(s => s.shiftType === 'workspace').length, icon: Building2 },
              { id: 'cafe', label: 'مناوبات كافيه TFG', count: allUnifiedShifts.filter(s => s.shiftType === 'cafe').length, icon: Coffee },
              { id: 'admin', label: 'مناوبات الإدارة العامة', count: allUnifiedShifts.filter(s => s.shiftType === 'admin').length, icon: Crown },
            ].map(tab => {
              const Icon = tab.icon;
              const active = shiftTypeFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => { setShiftTypeFilter(tab.id); setDisplayLimit(15); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 16px', borderRadius: 12, fontSize: 13, fontWeight: 800,
                    fontFamily: 'Cairo, sans-serif', border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                    background: active 
                      ? (tab.id === 'cafe' ? 'linear-gradient(135deg, #d97706, #f59e0b)' : (tab.id === 'admin' ? 'linear-gradient(135deg, #7c3aed, #a855f7)' : 'linear-gradient(135deg, #2563eb, #3b82f6)')) 
                      : 'rgba(255,255,255,0.05)',
                    color: active ? '#ffffff' : '#94a3b8',
                    boxShadow: active ? '0 0 16px rgba(59,130,246,0.3)' : 'none'
                  }}
                >
                  <Icon size={16} />
                  <span>{tab.label}</span>
                  <span style={{
                    fontSize: 11, padding: '2px 7px', borderRadius: 20,
                    background: active ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.1)',
                    color: active ? '#ffffff' : '#cbd5e1'
                  }}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Top Row: Presets & Fast Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 700 }}>📅 تحديد فترة العرض:</span>
              {[
                ['today', 'اليوم 📅'],
                ['this_week', 'آخر 7 أيام 🗓️'],
                ['this_month', 'هذا الشهر 📊'],
                ['custom_month', 'شهر محدد 📆'],
                ['custom_range', 'فترة مخصصة 🎯'],
                ['all', 'كافة المناوبات ♾️']
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => { setDatePreset(key); setDisplayLimit(15); }}
                  style={{
                    padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                    fontFamily: 'Cairo, sans-serif', border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                    background: datePreset === key ? 'linear-gradient(135deg, #1d4ed8, #3b82f6)' : 'rgba(255,255,255,0.05)',
                    color: datePreset === key ? '#ffffff' : '#94a3b8',
                    boxShadow: datePreset === key ? '0 0 12px rgba(59,130,246,0.35)' : 'none'
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <Button size="sm" variant="success" onClick={() => { setSelectedEmpId(''); setOpenShiftModal(true); }}>
                🚀 فتح مناوبة لموظف
              </Button>
              <Button size="sm" onClick={handleExportShiftsExcel} style={{ background: 'linear-gradient(135deg, #059669, #10b981)', color: '#fff', fontWeight: 800 }}>
                📥 Excel
              </Button>
            </div>
          </div>

          {/* Conditional Date Pickers based on Preset */}
          {datePreset === 'custom_month' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: 13, color: '#93c5fd', fontWeight: 600 }}>اختر الشهر المطلوب:</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '6px 12px', color: '#ffffff',
                  fontFamily: 'Cairo, sans-serif', fontSize: 13, outline: 'none',
                }}
              />
              <span style={{ fontSize: 12, color: '#94a3b8' }}>({getMonthLabel(selectedMonth)})</span>
            </div>
          )}

          {datePreset === 'custom_range' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, color: '#93c5fd', fontWeight: 600 }}>من تاريخ:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  style={{
                    background: 'var(--bg-surface)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '6px 10px', color: '#ffffff',
                    fontFamily: 'Cairo, sans-serif', fontSize: 13, outline: 'none',
                  }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, color: '#93c5fd', fontWeight: 600 }}>إلى تاريخ:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  style={{
                    background: 'var(--bg-surface)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '6px 10px', color: '#ffffff',
                    fontFamily: 'Cairo, sans-serif', fontSize: 13, outline: 'none',
                  }}
                />
              </div>
            </div>
          )}

          {/* Bottom Filter Row: Employee Filter, Status Filter, and Code/Name Search */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, alignItems: 'flex-end' }}>
            <Select
              label="الموظف / المسؤول"
              value={empFilter}
              onChange={e => setEmpFilter(e.target.value)}
            >
              <option value="all">كافة الموظفين والإدارة ({allUnifiedShifts.length})</option>
              <option value="ADMIN">👑 مناوبات الإدارة العامة فقط</option>
              <option value="CAFE">☕ مناوبات كافيه TFG فقط</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.memberId || '—'})
                </option>
              ))}
            </Select>

            <Select
              label="حالة المناوبة"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="all">كافة الحالات (مفتوحة ومغلقة)</option>
              <option value="open">🟢 المناوبات المفتوحة والنشطة فقط</option>
              <option value="closed">🔒 المناوبات المغلقة فقط</option>
            </Select>

            <Input
              label="بحث بكود المناوبة أو اسم الموظف"
              placeholder="مثال: SHF-1234، CAF-5678، أحمد..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </Card>

      {/* Summary KPI Bar for Filtered Range */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14,
        padding: '16px 20px', background: 'var(--bg-card)', borderRadius: 16, border: '1px solid var(--border)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>📊</span>
          <div>
            <h4 style={{ margin: 0, color: '#f8fafc', fontSize: 15, fontWeight: 800 }}>
              المناوبات المعروضة: <strong style={{ color: '#60a5fa' }}>{filteredShifts.length}</strong> مناوبة
            </h4>
            <p style={{ margin: '2px 0 0', color: '#94a3b8', fontSize: 12 }}>
              {datePreset === 'today' ? 'اليوم' : (datePreset === 'this_month' ? 'هذا الشهر' : (datePreset === 'this_week' ? 'آخر 7 أيام' : 'الفترة المحددة'))}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ color: '#c8dcf5', fontSize: 13 }}>
            الإيرادات: <strong style={{ color: '#34d399', fontSize: 15 }}>{formatCurrency(totalRev)}</strong>
          </span>
          <span style={{ color: '#c8dcf5', fontSize: 13 }}>
            المصاريف: <strong style={{ color: '#f87171', fontSize: 15 }}>{formatCurrency(totalExp)}</strong>
          </span>
          <span style={{ color: '#c8dcf5', fontSize: 13 }}>
            صافي الخزينة: <strong style={{ color: totalNet >= 0 ? '#60a5fa' : '#f87171', fontSize: 16 }}>{formatCurrency(totalNet)}</strong>
          </span>
          {selectedIds.length > 0 && (
            <Button size="sm" variant="primary" onClick={handleBulkPrint} disabled={bulkPrinting}>
              🖨️ طباعة المحددة ({selectedIds.length})
            </Button>
          )}
        </div>
      </div>

      {/* Shifts Content List */}
      {filteredShifts.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--bg-surface)' }}>
          <span style={{ fontSize: 48, display: 'block', marginBottom: 12 }}>🔄</span>
          <h3 style={{ color: '#fff', margin: '0 0 8px', fontSize: 17 }}>لا توجد مناوبات مطابقة للفترة المحددة</h3>
          <p style={{ color: '#94a3b8', fontSize: 13, margin: '0 auto 18px', maxWidth: 450 }}>
            يمكنك تغيير الفلاتر بالأعلى لعرض مناوبات سابقة أو بدء مناوبة جديدة الآن.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Button variant="warning" onClick={handleStartAdminSelfShift} disabled={openLoading}>
              👑 فتح مناوبة الإدارة
            </Button>
            <Button variant="ghost" onClick={() => { setDatePreset('all'); setStatusFilter('all'); setEmpFilter('all'); setSearchQuery(''); }}>
              عرض كافة المناوبات ♾️
            </Button>
          </div>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {visibleShifts.map(shift => {
            const isAdmin = shift.shiftType === 'admin' || shift.employeeId === 'ADMIN' || shift.isAdminShift;
            const isCafe = shift.isCafeShift;
            return (
              <Card
                key={shift.id}
                style={{
                  background: isCafe 
                    ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.07) 0%, var(--bg-card) 100%)' 
                    : (isAdmin ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.08) 0%, var(--bg-card) 100%)' : 'var(--bg-card)'),
                  border: selectedIds.includes(shift.id) 
                    ? '1px solid #3b82f6' 
                    : (isCafe 
                      ? '1px solid rgba(245, 158, 11, 0.35)' 
                      : (isAdmin ? '1px solid rgba(168, 85, 247, 0.35)' : '1px solid var(--border)')),
                  boxShadow: selectedIds.includes(shift.id) ? '0 0 16px rgba(59,130,246,0.25)' : 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  padding: '16px'
                }}
              >
                {/* Header row: Checkbox, Employee Name, Type Badge, Status */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flexWrap: 'wrap' }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(shift.id)}
                      onChange={() => toggleSelect(shift.id)}
                      style={{ width: 18, height: 18, accentColor: '#3b82f6', cursor: 'pointer', flexShrink: 0 }}
                    />
                    <span style={{ color: '#ffffff', fontWeight: 800, fontSize: 16 }}>{shift.empDisplayName || shift.employeeName}</span>
                    <span style={{ fontSize: 11, color: '#64748b', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 6 }}>
                      {shift.codePrefix || 'SHF'}-{(shift.id || '').slice(-6).toUpperCase()}
                    </span>
                    {isCafe ? (
                      <Badge color="amber" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Coffee size={12} /> كافيه TFG
                      </Badge>
                    ) : isAdmin ? (
                      <Badge color="purple" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Crown size={12} /> مناوبة الإدارة
                      </Badge>
                    ) : (
                      <Badge color="blue" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Building2 size={12} /> ريسيبشن واستقبال
                      </Badge>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {shift.status === 'closed' && (shift.actualCash !== undefined || shift.actualClosingCount !== undefined || shift.drawerDifference !== undefined) && (
                      <Badge color={(shift.cashDifference === 0 || shift.drawerDifference === 0) ? 'green' : ((shift.cashDifference < 0 || shift.drawerDifference < 0) ? 'red' : 'blue')}>
                        {(shift.cashDifference === 0 || shift.drawerDifference === 0) 
                          ? '✅ عهدة مطابقة' 
                          : ((shift.cashDifference < 0 || shift.drawerDifference < 0) 
                            ? `⚠️ عجز (${Math.abs(shift.cashDifference ?? shift.drawerDifference)} ج.م)` 
                            : `🟢 زيادة (+${shift.cashDifference ?? shift.drawerDifference} ج.م)`)}
                      </Badge>
                    )}
                    <Badge color={shift.status === 'open' ? 'green' : 'gray'}>
                      {shift.status === 'open' ? 'مفتوحة 🟢' : 'مغلقة 🔒'}
                    </Badge>
                  </div>
                </div>

                {/* Timing Info */}
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: '#94a3b8' }}>
                  <span>📅 بدأت: {shift.openedAt ? formatDateTime(shift.openedAt) : '—'}</span>
                  <span>🔒 أغلقت: {shift.closedAt ? formatDateTime(shift.closedAt) : (shift.status === 'open' ? 'جارية الآن' : '—')}</span>
                  {shift.drawer !== undefined && (
                    <span style={{ color: '#fcd34d', fontWeight: 600 }}>💰 نقدية الدرج: {formatCurrency(shift.drawer)}</span>
                  )}
                  {isCafe && shift.walletSales > 0 && (
                    <span style={{ color: '#a78bfa' }}>💳 مبيعات بالمحفظة: {formatCurrency(shift.walletSales)}</span>
                  )}
                </div>

                {/* Financial 3-box row */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 12,
                  background: 'rgba(15, 23, 42, 0.45)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  padding: '12px 18px',
                  borderRadius: 12,
                  maxWidth: 580
                }}>
                  <div>
                    <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{isCafe ? 'المبيعات' : 'الإيرادات'}</p>
                    <p style={{ fontWeight: 800, fontSize: 14, marginTop: 4, color: '#34d399', margin: 0 }}>
                      {formatCurrency(shift.totalRevenue || 0)}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>المصاريف</p>
                    <p style={{ fontWeight: 800, fontSize: 14, marginTop: 4, color: '#f87171', margin: 0 }}>
                      {formatCurrency(shift.totalExpenses || 0)}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{isCafe ? 'صافي الربح' : 'الصافي للخزينة'}</p>
                    <p style={{ fontWeight: 800, fontSize: 14, marginTop: 4, color: (shift.netAmount || 0) >= 0 ? '#60a5fa' : '#f87171', margin: 0 }}>
                      {formatCurrency(shift.netAmount || 0)}
                    </p>
                  </div>
                </div>

                {/* Action Buttons Row */}
                <div style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  borderTop: '1px solid var(--border)',
                  paddingTop: 12,
                  marginTop: 4
                }}>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      if (isCafe) {
                        setViewCafeShift(shift);
                      } else {
                        setInspectShiftId(shift.id);
                      }
                    }}
                    style={{
                      padding: '7px 16px',
                      borderRadius: 10,
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    🔍 تفاصيل {isCafe ? 'مبيعات الكافيه' : 'المناوبة'}
                  </Button>
                  
                  {!isCafe && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handlePrintSingle(shift)}
                      disabled={printLoading}
                      title="طباعة التقرير"
                      style={{
                        padding: '7px 14px',
                        borderRadius: 10,
                        border: '1px solid rgba(255,255,255,0.12)'
                      }}
                    >
                      🖨️ طباعة
                    </Button>
                  )}

                  {shift.status === 'open' ? (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        if (isCafe) {
                          setCloseCafeModalShift(shift);
                          setCloseCafeActualCount(String(shift.drawerCash || 0));
                          setCloseCafeNotes('');
                        } else {
                          handleOpenCloseHandover(shift);
                        }
                      }}
                      style={{ padding: '7px 16px', borderRadius: 10, fontWeight: 700 }}
                    >
                      🔒 تقفيل {isCafe ? 'الكافيه' : ''}
                    </Button>
                  ) : (
                    !isCafe && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleOpenAdjustHandover(shift)}
                        title="تصحيح وتعديل جرد العهدة والنقدية بواسطة الإدارة"
                        style={{
                          padding: '7px 14px',
                          borderRadius: 10,
                          background: 'rgba(245, 158, 11, 0.12)',
                          color: '#fbbf24',
                          border: '1px solid rgba(245, 158, 11, 0.3)',
                          fontWeight: 700
                        }}
                      >
                        ✏️ تصحيح الجرد
                      </Button>
                    )
                  )}

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openEditShiftModal(shift)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      background: 'rgba(56, 189, 248, 0.12)',
                      color: '#38bdf8',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      padding: '7px 16px',
                      borderRadius: 10,
                      fontWeight: 700
                    }}
                    title="تعديل بيانات ومبالغ المناوبة بواسطة الإدارة"
                  >
                    <Edit3 size={14} /> تعديل
                  </Button>

                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => setDeleteId(shift.id)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      background: 'rgba(239, 68, 68, 0.12)',
                      color: '#f87171',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      padding: '7px 16px',
                      borderRadius: 10,
                      fontWeight: 700
                    }}
                    title="حذف المناوبة بالكامل"
                  >
                    <Trash2 size={14} /> حذف
                  </Button>
                </div>
              </Card>
            );
          })}

          {/* Show More Pagination Button */}
          {filteredShifts.length > displayLimit && (
            <div style={{ textAlign: 'center', marginTop: 10 }}>
              <Button
                variant="ghost"
                onClick={() => setDisplayLimit(prev => prev + 15)}
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', padding: '10px 24px', fontSize: 13 }}
              >
                🔄 عرض المزيد من المناوبات (متبقي {filteredShifts.length - displayLimit})
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Confirm Dialogs */}
      <ConfirmDialog
        open={!!closeId}
        title="إغلاق المناوبة"
        message="هل تريد إغلاق هذه المناوبة وتقفيل نقدية الخزينة؟"
        onConfirm={async () => { await closeShift(closeId); setCloseId(null); }}
        onCancel={() => setCloseId(null)}
      />

      <ConfirmDialog
        open={!!deleteId}
        title="حذف المناوبة"
        message="هل أنت متأكد من حذف هذه المناوبة نهائياً؟ سيتم مسح كافة البيانات التابعة لها."
        onConfirm={async () => {
          const target = allUnifiedShifts.find(s => s.id === deleteId);
          if (target?.isCafeShift) {
            await deleteCafeShift(deleteId, 'المدير العام');
          } else {
            await deleteShift(deleteId);
          }
          setDeleteId(null);
        }}
        onCancel={() => setDeleteId(null)}
      />

      {/* Modal: Open Shift For Employee */}
      <Modal open={openShiftModal} onClose={() => setOpenShiftModal(false)} title="فتح مناوبة جديدة لموظف" size="sm">
        <form onSubmit={handleAdminOpenShift} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>اختر الموظف الذي تريد بدء المناوبة له الآن:</p>
          <Select
            label="اختر الموظف"
            value={selectedEmpId}
            onChange={e => setSelectedEmpId(e.target.value)}
            required
          >
            <option value="">-- اختر الموظف --</option>
            {employees.map(emp => {
              const isOpen = shifts.some(s => s.employeeId === emp.id && s.status === 'open');
              return (
                <option key={emp.id} value={emp.id} disabled={isOpen}>
                  {emp.name} ({emp.memberId || '—'}) {isOpen ? '— (لديه مناوبة مفتوحة بالفعل)' : ''}
                </option>
              );
            })}
          </Select>

          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <Button type="submit" variant="success" className="flex-1" disabled={!selectedEmpId || openLoading}>
              {openLoading ? 'جاري الفتح...' : '🚀 فتح المناوبة الآن'}
            </Button>
            <Button type="button" variant="ghost" className="flex-1" onClick={() => setOpenShiftModal(false)}>
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Add Admin Expense */}
      <Modal open={adminExpenseModal} onClose={() => setAdminExpenseModal(false)} title="إضافة مصروف إداري (مناوبة الإدارة)" size="sm">
        <form onSubmit={handleAddAdminExp} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Select
            label="نوع المصروف الإداري"
            value={adminExpForm.type}
            onChange={e => setAdminExpForm({ ...adminExpForm, type: e.target.value })}
            required
          >
            <option value="rent">🏢 إيجار المقر</option>
            <option value="electricity">⚡ فواتير كهرباء ومياه</option>
            <option value="internet">🌐 باقات واشتراكات الإنترنت</option>
            <option value="salaries">💵 سلف ومرتبات موظفين</option>
            <option value="supplies">☕ مستلزمات وبوفيه ومشروبات</option>
            <option value="cleaning">🧹 أدوات نظافة وصيانة</option>
            <option value="marketing">📢 إعلانات وتسويق</option>
            <option value="other">📌 نثريات ومصروفات إدارية أخرى</option>
          </Select>

          <Input
            label="بيان / تفاصيل المصروف"
            placeholder="مثال: فاتورة كهرباء شهر أغسطس، سداد إنترنت..."
            value={adminExpForm.label}
            onChange={e => setAdminExpForm({ ...adminExpForm, label: e.target.value })}
            required
          />

          <Input
            label="المبلغ (ج.م)"
            type="number"
            placeholder="0.00"
            value={adminExpForm.amount}
            onChange={e => setAdminExpForm({ ...adminExpForm, amount: e.target.value })}
            required
          />

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <Button type="submit" variant="danger" className="flex-1" disabled={adminActionLoading}>
              {adminActionLoading ? 'جاري الحفظ...' : '💸 تسجيل المصروف'}
            </Button>
            <Button type="button" variant="ghost" className="flex-1" onClick={() => setAdminExpenseModal(false)}>
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Add Admin Revenue */}
      <Modal open={adminRevenueModal} onClose={() => setAdminRevenueModal(false)} title="إضافة إيراد جانبي / إداري (مناوبة الإدارة)" size="sm">
        <form onSubmit={handleAddAdminRev} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Select
            label="نوع الإيراد"
            value={adminRevForm.type}
            onChange={e => setAdminRevForm({ ...adminRevForm, type: e.target.value })}
            required
          >
            <option value="cafe">☕ مبيعات كافيه وبوفيه</option>
            <option value="hall_rent">🎤 حجز قاعات واجتماعات</option>
            <option value="print">🖨️ خدمات طباعة وتصوير أوراق</option>
            <option value="sponsorship">🤝 رعاية ودعم</option>
            <option value="direct">💰 إيراد مباشر / تمويل</option>
            <option value="other">📌 إيرادات جانبية أخرى</option>
          </Select>

          <Input
            label="بيان / مصدر الإيراد"
            placeholder="مثال: حجز قاعة اجتماعات VIP، بوفيه يومي..."
            value={adminRevForm.label}
            onChange={e => setAdminRevForm({ ...adminRevForm, label: e.target.value })}
            required
          />

          <Input
            label="المبلغ (ج.م)"
            type="number"
            placeholder="0.00"
            value={adminRevForm.amount}
            onChange={e => setAdminRevForm({ ...adminRevForm, amount: e.target.value })}
            required
          />

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <Button type="submit" variant="success" className="flex-1" disabled={adminActionLoading}>
              {adminActionLoading ? 'جاري الحفظ...' : '💰 تسجيل الإيراد'}
            </Button>
            <Button type="button" variant="ghost" className="flex-1" onClick={() => setAdminRevenueModal(false)}>
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      {/* Admin Shift Detail & Management Modal */}
      {inspectShiftId && (
        <ShiftDetailModal
          shiftId={inspectShiftId}
          onClose={() => setInspectShiftId(null)}
          onPrint={handlePrintSingle}
        />
      )}
      {/* Admin Shift Handover & Adjustment Modal */}
      <ShiftHandoverModal
        open={!!handoverModalShift}
        onClose={() => setHandoverModalShift(null)}
        shift={handoverModalShift}
        mode={handoverModalMode}
        payments={handoverPayments}
        tickets={handoverTickets}
        clients={clients}
        systemInfo={systemInfo}
        onConfirm={async (shiftId, handoverData) => {
          if (handoverModalMode === 'adjust') {
            await updateShiftHandover(shiftId, handoverData);
          } else {
            await closeShift(shiftId, handoverData);
          }
          setHandoverModalShift(null);
        }}
      />

      {/* Cafe Shift Detail & Audit Modal */}
      {viewCafeShift && (
        <CafeShiftDetailModal
          isOpen={!!viewCafeShift}
          onClose={() => setViewCafeShift(null)}
          shift={viewCafeShift}
        />
      )}

      {/* Modal: Close Cafe Shift By Admin */}
      <Modal 
        open={!!closeCafeModalShift} 
        onClose={() => setCloseCafeModalShift(null)} 
        title="🔒 تقفيل مناوبة كافيه TFG (بواسطة الإدارة)" 
        size="sm"
      >
        <form onSubmit={async (e) => {
          e.preventDefault();
          if (!closeCafeModalShift) return;
          setCloseCafeLoading(true);
          try {
            await closeCafeShift(closeCafeModalShift.id, {
              actualCount: parseFloat(closeCafeActualCount) || 0,
              notes: closeCafeNotes,
              closedBy: 'المدير العام (الإدارة)'
            });
            setCloseCafeModalShift(null);
          } catch (err) {
            alert('خطأ في إغلاق مناوبة الكافيه: ' + err.message);
          } finally {
            setCloseCafeLoading(false);
          }
        }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: 10, padding: 12, fontSize: 13, color: '#fcd34d' }}>
            ☕ <strong>مناوبة كافيه:</strong> {closeCafeModalShift?.baristaName || 'باريستا'}
            <br />
            💰 <strong>نقدية الدرج المحسوبة في النظام:</strong> {formatCurrency(closeCafeModalShift?.drawerCash || 0)}
          </div>

          <Input
            label="النقدية الفعلية المستلمة في الدرج (ج.م)"
            type="number"
            step="any"
            value={closeCafeActualCount}
            onChange={e => setCloseCafeActualCount(e.target.value)}
            required
          />

          <Input
            label="ملاحظات الإغلاق / التسليم (اختياري)"
            placeholder="أي ملاحظات حول العهدة أو التقفيل..."
            value={closeCafeNotes}
            onChange={e => setCloseCafeNotes(e.target.value)}
          />

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <Button type="submit" variant="danger" className="flex-1" disabled={closeCafeLoading}>
              {closeCafeLoading ? 'جاري الإغلاق...' : '🔒 تأكيد تقفيل المناوبة'}
            </Button>
            <Button type="button" variant="ghost" className="flex-1" onClick={() => setCloseCafeModalShift(null)}>
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Edit Shift By Admin */}
      <Modal
        open={editShiftModal}
        onClose={() => setEditShiftModal(false)}
        title={`✏️ تعديل بيانات ومبالغ المناوبة (${editingShift?.isCafeShift ? 'كافيه TFG' : 'استقبال وريسيبشن'})`}
        size="md"
      >
        <form onSubmit={handleSaveEditShift} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{
            background: 'rgba(56, 189, 248, 0.1)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: 10,
            padding: 12,
            fontSize: 13,
            color: '#93c5fd'
          }}>
            ℹ️ <strong>تعديل إداري مباشر:</strong> يمكنك تعديل المبالغ المسجلة، اسم الموظف/الباريستا، أو حالة المناوبة لتصحيح أي خطأ بدقة.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Input
              label={editingShift?.isCafeShift ? "اسم الباريستا المسؤول" : "اسم موظف الاستقبال"}
              value={editShiftForm.employeeName}
              onChange={e => setEditShiftForm({ ...editShiftForm, employeeName: e.target.value })}
              required
            />
            <div>
              <label style={{ display: 'block', color: '#c8dcf5', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                حالة المناوبة:
              </label>
              <select
                value={editShiftForm.status}
                onChange={e => setEditShiftForm({ ...editShiftForm, status: e.target.value })}
                style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', color: '#fff' }}
              >
                <option value="open">🟢 جارية / مفتوحة</option>
                <option value="closed">🔒 مغلقة ومسلمة</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <Input
              label={editingShift?.isCafeShift ? "إجمالي المبيعات (ج.م)" : "إجمالي الإيرادات (ج.م)"}
              type="number"
              step="any"
              value={editShiftForm.totalRevenue}
              onChange={e => setEditShiftForm({ ...editShiftForm, totalRevenue: e.target.value })}
              required
            />
            <Input
              label="إجمالي المصروفات (ج.م)"
              type="number"
              step="any"
              value={editShiftForm.totalExpenses}
              onChange={e => setEditShiftForm({ ...editShiftForm, totalExpenses: e.target.value })}
              required
            />
            <Input
              label="نقدية الدرج / العهدة (ج.م)"
              type="number"
              step="any"
              value={editShiftForm.drawerCash}
              onChange={e => setEditShiftForm({ ...editShiftForm, drawerCash: e.target.value })}
              required
            />
          </div>

          <Input
            label="ملاحظات وتعديل الإدارة"
            placeholder="سبب التعديل أو أي تفاصيل إضافية..."
            value={editShiftForm.notes}
            onChange={e => setEditShiftForm({ ...editShiftForm, notes: e.target.value })}
          />

          <div style={{ display: 'flex', gap: 10, marginTop: 10, justifyContent: 'flex-end' }}>
            <Button type="button" variant="ghost" onClick={() => setEditShiftModal(false)}>
              إلغاء
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={editShiftLoading}
              style={{ background: 'linear-gradient(135deg, #0284c7, #38bdf8)', fontWeight: 800 }}
            >
              {editShiftLoading ? 'جاري الحفظ...' : '💾 حفظ التعديلات في النظام'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}