import React, { useState, useEffect, useMemo } from 'react';
import {
  Users, Package, BadgeDollarSign, ArrowDownCircle, TrendingUp, Clock,
  Bot, Settings, Building2, Coffee, CheckCircle2, AlertCircle
} from 'lucide-react';
import { getClients, getPackages, getAllShifts, getAllPayments, getTicketSales, getAdminRevenues, getAdminExpenses, getCafeShifts, getWhatsAppBotSettings, getAllSalaries } from '../../../services/db';
import OccupancyMeterWidget from '../../../components/OccupancyMeterWidget';
import { StatCard, Card, Badge } from '../../../components/ui';
import { formatCurrency, getCurrentMonth } from '../../../utils/constants';

export default function AdminDashboard({ onNavigateTab }) {
  const [clients, setClients] = useState([]);
  const [packages, setPackages] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [cafeShifts, setCafeShifts] = useState([]);
  const [botSettings, setBotSettings] = useState({ enabled: true });
  const [payments, setPayments] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [adminRevenues, setAdminRevenues] = useState([]);
  const [adminExpenses, setAdminExpenses] = useState([]);
  const [monthSalaries, setMonthSalaries] = useState([]);

  useEffect(() => {
    const unsubC = getClients(setClients);
    const unsubP = getPackages(setPackages);
    const unsubS = getAllShifts(setShifts);
    const unsubCafe = getCafeShifts(setCafeShifts);
    const unsubBot = getWhatsAppBotSettings(setBotSettings);
    const unsubPay = getAllPayments(setPayments);
    const unsubT = getTicketSales(setTickets);
    const unsubA = getAdminRevenues(setAdminRevenues);
    const unsubAE = getAdminExpenses(setAdminExpenses);

    return () => {
      unsubC && unsubC();
      unsubP && unsubP();
      unsubS && unsubS();
      unsubCafe && unsubCafe();
      unsubBot && unsubBot();
      unsubPay && unsubPay();
      unsubT && unsubT();
      unsubA && unsubA();
      unsubAE && unsubAE();
    };
  }, []);

  const curMonth = getCurrentMonth();

  useEffect(() => {
    getAllSalaries(curMonth).then(setMonthSalaries).catch(() => {});
  }, [curMonth]);

  const {
    openStaffShifts, openCafeShifts, allOpenCount, thisMonthShifts,
    totalPayments, totalTicketsRevenue, totalAdminRevenues, totalAdminExpenses,
    totalCafeRevenue, totalCafeExpenses, totalExtraRevenue, totalSalariesPaid,
    totalExpenses, totalRevenue, netAmount
  } = useMemo(() => {
    const openStaff = shifts.filter(s => s.status === 'open' && s.employeeId !== 'ADMIN' && !s.isAdminShift);
    const openCafe = cafeShifts.filter(s => s.status === 'open');
    const openCount = openStaff.length + openCafe.length;

    const curMonthShifts = shifts.filter(s => {
      if (!s.openedAt) return false;
      const d = s.openedAt?.toDate ? s.openedAt.toDate() : new Date(s.openedAt);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` === curMonth;
    });

    const mPayments = payments.filter(p => {
      if (!p.date || p.isVoided) return false;
      const d = p.date?.toDate ? p.date.toDate() : new Date(p.date);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` === curMonth;
    });

    const mTickets = tickets.filter(t => {
      if (!t.date) return false;
      const d = t.date?.toDate ? t.date.toDate() : new Date(t.date);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` === curMonth;
    });

    const mAdminRevs = adminRevenues.filter(r => {
      const val = r.date || r.createdAt;
      if (!val) return false;
      const d = val?.toDate ? val.toDate() : new Date(val);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` === curMonth;
    });

    const mAdminExps = adminExpenses.filter(e => {
      const val = e.date || e.createdAt;
      if (!val) return false;
      const d = val?.toDate ? val.toDate() : new Date(val);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` === curMonth;
    });

    const totPayments = mPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const totTicketsRevenue = mTickets.reduce((s, t) => s + (Number(t.total) || (Number(t.quantity) * Number(t.ticketPrice)) || 0), 0);
    const totAdminRevenues = mAdminRevs
      .filter(r => !r.isCafeTransfer && r.category !== 'cafe' && !r.isDirectAdminPayment && !r.paymentId)
      .reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const totAdminExpenses = mAdminExps.reduce((s, e) => s + (Number(e.amount) || 0), 0);

    const mCafeShifts = cafeShifts.filter(s => {
      if (!s.openedAt) return false;
      const d = s.openedAt?.toDate ? s.openedAt.toDate() : new Date(s.openedAt);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` === curMonth;
    });
    const totCafeRevenue = mCafeShifts.reduce((s, c) => s + (Number(c.totalSales) || 0), 0);
    const totCafeExpenses = mCafeShifts.reduce((s, c) => s + (Number(c.totalExpenses) || 0), 0);

    const allRevs = curMonthShifts.flatMap(s => s.revenues || []);
    const allExps = curMonthShifts.flatMap(s => s.expenses || []);
    const totExtraRevenue = allRevs.reduce((s, r) => s + Number(r.amount || 0), 0);
    const totSalariesPaid = monthSalaries.reduce((s, sal) => s + (Number(sal.net) || Number(sal.earned) || 0), 0);
    const totExpenses = allExps.reduce((s, e) => s + Number(e.amount || 0), 0) + totSalariesPaid + totCafeExpenses + totAdminExpenses;

    const totRevenue = totPayments + totTicketsRevenue + totExtraRevenue + totAdminRevenues + totCafeRevenue;
    const net = totRevenue - totExpenses;

    return {
      openStaffShifts: openStaff,
      openCafeShifts: openCafe,
      allOpenCount: openCount,
      thisMonthShifts: curMonthShifts,
      totalPayments: totPayments,
      totalTicketsRevenue: totTicketsRevenue,
      totalAdminRevenues: totAdminRevenues,
      totalAdminExpenses: totAdminExpenses,
      totalCafeRevenue: totCafeRevenue,
      totalCafeExpenses: totCafeExpenses,
      totalExtraRevenue: totExtraRevenue,
      totalSalariesPaid: totSalariesPaid,
      totalExpenses: totExpenses,
      totalRevenue: totRevenue,
      netAmount: net
    };
  }, [shifts, cafeShifts, payments, tickets, adminRevenues, adminExpenses, monthSalaries, curMonth]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* AI Intelligence Quick Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 58, 138, 0.5))',
        border: '1px solid rgba(59, 130, 246, 0.4)',
        borderRadius: 20,
        padding: '18px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 14,
        boxShadow: '0 10px 30px rgba(0,0,0,0.4)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: 'radial-gradient(circle, rgba(59, 130, 246, 0.4) 0%, rgba(37, 99, 235, 0.1) 100%)',
            border: '2px solid #3b82f6',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#60a5fa'
          }}>
            <Bot size={26} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ margin: 0, color: '#ffffff', fontSize: 16, fontWeight: 900 }}>
                مساعد واتساب والرد الآلي الذكي
              </h3>
              {botSettings?.enabled !== false ? (
                <Badge color="green">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <CheckCircle2 size={12} /> متصل ونشط
                  </span>
                </Badge>
              ) : (
                <Badge color="red">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <AlertCircle size={12} /> معطّل مؤقتاً
                  </span>
                </Badge>
              )}
            </div>
            <p style={{ margin: '4px 0 0', color: '#93c5fd', fontSize: 13 }}>
              البوت يستقبل رسائل الطلاب وأولياء الأمور ويرد فورياً بالباقات والمواعيد مع ميزة التبديل البشري التلقائي.
            </p>
          </div>
        </div>

        <button
          onClick={() => onNavigateTab && onNavigateTab('whatsapp_bot')}
          style={{
            background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
            color: '#ffffff',
            border: 'none',
            borderRadius: 12,
            padding: '10px 18px',
            fontSize: 13,
            fontWeight: 800,
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(37,99,235,0.4)',
            fontFamily: 'Cairo, sans-serif',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <Settings size={15} /> إعدادات البوت والردود
        </button>
      </div>

      {/* Live Occupancy Radar */}
      <OccupancyMeterWidget />

      {/* Primary KPI Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 16 }}>
        <StatCard
          icon={<Users size={20} />}
          label="إجمالي الأعضاء والمشتركين"
          value={clients.length}
          color="blue"
        />
        <StatCard
          icon={<Package size={20} />}
          label="الباقات والكورسات المتاحة"
          value={packages.length}
          color="purple"
        />
        <StatCard
          icon={<BadgeDollarSign size={20} />}
          label="إجمالي إيرادات الشهر الشاملة"
          value={formatCurrency(totalRevenue)}
          color="green"
        />
        <StatCard
          icon={<Coffee size={20} />}
          label="مبيعات كافيه TFG | CAFE"
          value={formatCurrency(totalCafeRevenue)}
          color="amber"
        />
        <StatCard
          icon={<ArrowDownCircle size={20} />}
          label="مصروفات الشهر التشغيلية"
          value={formatCurrency(totalExpenses)}
          color="red"
        />
        <StatCard
          icon={<TrendingUp size={20} />}
          label="صافي أرباح الشهر (P&L)"
          value={formatCurrency(netAmount)}
          color={netAmount >= 0 ? "emerald" : "red"}
        />
        <StatCard
          icon={<Clock size={20} />}
          label="المناوبات المفتوحة الآن"
          value={allOpenCount}
          color="blue"
        />
      </div>

      {/* Open Shifts Radar */}
      <div>
        <h2 style={{ color: '#ffffff', fontSize: 18, fontWeight: 800, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={20} color="var(--accent)" /> المناوبات الجارية حالياً ({allOpenCount})
        </h2>

        {allOpenCount === 0 ? (
          <Card style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', textAlign: 'center', padding: '30px' }}>
            <p style={{ color: '#93c5fd', fontSize: 14, margin: 0 }}>لا توجد مناوبات مفتوحة في الوقت الحالي</p>
          </Card>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 16 }}>
            {/* General Staff Shifts */}
            {openStaffShifts.map(s => (
              <Card key={s.id} style={{ background: 'var(--bg-card)', border: '1px solid rgba(245, 158, 11, 0.3)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ color: '#ffffff', fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                    <Building2 size={18} color="#60a5fa" /> {s.employeeName}
                  </h3>
                  <Badge color="amber">مناوبة جارية</Badge>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#93c5fd', fontSize: 13, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  <span>نقدية الدرج الفعلية المتوقعة:</span>
                  <strong style={{ color: '#38bdf8' }}>{formatCurrency(s.drawerCash !== undefined ? s.drawerCash : (s.cashRevenue || 0))}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#93c5fd', fontSize: 13 }}>
                  <span>إجمالي إيراد المناوبة:</span>
                  <strong style={{ color: '#34d399' }}>{formatCurrency(s.totalRevenue || 0)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#93c5fd', fontSize: 13 }}>
                  <span>المصاريف المسجلة:</span>
                  <strong style={{ color: '#f87171' }}>{formatCurrency(s.totalExpenses || 0)}</strong>
                </div>
              </Card>
            ))}

            {/* Cafe Shifts */}
            {openCafeShifts.map(cs => (
              <Card key={cs.id} style={{ background: 'var(--bg-card)', border: '1px solid rgba(16, 185, 129, 0.35)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ color: '#ffffff', fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                    <Coffee size={18} color="#34d399" /> {cs.baristaName || 'كافيه السنتر'}
                  </h3>
                  <Badge color="green">وردية كافيه</Badge>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#93c5fd', fontSize: 13, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  <span>نقدية الدرج الفعلية:</span>
                  <strong style={{ color: '#38bdf8' }}>{formatCurrency(cs.drawerCash || 0)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#93c5fd', fontSize: 13 }}>
                  <span>إجمالي مبيعات الوردية:</span>
                  <strong style={{ color: '#34d399' }}>{formatCurrency(cs.totalSales || 0)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#93c5fd', fontSize: 13 }}>
                  <span>مصاريف الكافيه:</span>
                  <strong style={{ color: '#f87171' }}>{formatCurrency(cs.totalExpenses || 0)}</strong>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
