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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Bento Grid Container */}
      <div className="bento-grid">

        {/* 1. WhatsApp AI Copilot Bento (Col 8) */}
        <div className="bento-card bento-col-8" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 54, height: 54, borderRadius: 16,
              background: 'radial-gradient(circle, rgba(27, 77, 62, 0.25) 0%, rgba(27, 77, 62, 0.08) 100%)',
              border: '2px solid rgba(27, 77, 62, 0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--accent)',
              boxShadow: '0 0 20px rgba(27, 77, 62, 0.2)'
            }}>
              <Bot size={28} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 17, fontWeight: 900, letterSpacing: '0.3px' }}>
                  مساعد واتساب والرد الآلي الذكي
                </h3>
                {botSettings?.enabled !== false ? (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)',
                    color: '#059669', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700
                  }}>
                    <span className="bento-pulse-dot" style={{ background: '#059669', boxShadow: '0 0 8px #059669' }} />
                    متصل ونشط 24/7
                  </span>
                ) : (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)',
                    color: '#dc2626', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700
                  }}>
                    <span className="bento-pulse-dot" style={{ background: '#dc2626' }} />
                    معطّل مؤقتاً
                  </span>
                )}
              </div>
              <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5 }}>
                يستقبل رسائل الطلاب وأولياء الأمور ويرد فورياً بالباقات والأسعار مع إشعار فوري للإدارة.
              </p>
            </div>
          </div>

          <button
            onClick={() => onNavigateTab && onNavigateTab('whatsapp_bot')}
            className="btn btn-primary bento-card-interactive"
            style={{
              padding: '11px 20px',
              fontSize: 13,
              fontWeight: 800,
              fontFamily: 'Cairo, sans-serif'
            }}
          >
            <Settings size={15} /> إعدادات البوت
          </button>
        </div>

        {/* 2. Live Occupancy Widget Bento (Col 4) */}
        <div className="bento-col-4" style={{ display: 'flex' }}>
          <div style={{ width: '100%' }}>
            <OccupancyMeterWidget />
          </div>
        </div>

        {/* 3. Hero Bento Card: Monthly Financial Health & P&L (Col 8) */}
        <div className={`bento-card bento-col-8 ${netAmount >= 0 ? 'bento-card-emerald' : 'bento-card-amber'}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                الأداء المالي لشهر {curMonth}
              </span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 4 }}>
                <h1 style={{
                  margin: 0,
                  fontSize: 34,
                  fontWeight: 900,
                  color: netAmount >= 0 ? '#059669' : '#dc2626'
                }}>
                  {formatCurrency(netAmount)}
                </h1>
                <span style={{
                  fontSize: 13, fontWeight: 700,
                  color: netAmount >= 0 ? '#059669' : '#dc2626',
                  background: netAmount >= 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  padding: '3px 10px', borderRadius: 12, border: '1px solid rgba(226, 220, 209, 0.5)'
                }}>
                  {netAmount >= 0 ? 'صافي أرباح تشغيلية فائضة' : 'عجز تشغيلي مؤقت'}
                </span>
              </div>
            </div>

            <button
              onClick={() => onNavigateTab && onNavigateTab('finances')}
              className="bento-card-interactive"
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                color: '#38bdf8',
                borderRadius: 12,
                padding: '8px 16px',
                fontSize: 12,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <TrendingUp size={14} /> التقرير المالي المفصل
            </button>
          </div>

          {/* Revenue vs Expenses Ratio Bar */}
          <div style={{ marginTop: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8, color: 'var(--text-secondary)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                إجمالي المقبوضات: <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(totalRevenue)}</strong>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
                المصروفات والرواتب: <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(totalExpenses)}</strong>
              </span>
            </div>

            <div style={{
              width: '100%', height: 10, borderRadius: 10,
              background: 'rgba(120, 110, 90, 0.12)', overflow: 'hidden', display: 'flex'
            }}>
              <div style={{
                width: `${totalRevenue > 0 ? Math.min(100, Math.round((totalRevenue / (totalRevenue + totalExpenses || 1)) * 100)) : 50}%`,
                background: 'linear-gradient(90deg, #059669, #10b981)',
                borderRadius: 10,
                transition: 'width 0.8s ease'
              }} />
              <div style={{
                width: `${totalExpenses > 0 ? Math.min(100, Math.round((totalExpenses / (totalRevenue + totalExpenses || 1)) * 100)) : 50}%`,
                background: 'linear-gradient(90deg, #dc2626, #ef4444)',
                borderRadius: 10,
                transition: 'width 0.8s ease'
              }} />
            </div>
          </div>
        </div>

        {/* 4. Cafe & Barista Bento Card (Col 4) */}
        <div className="bento-card bento-col-4 bento-card-amber" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: 'rgba(217, 119, 6, 0.15)', color: '#d97706',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <Coffee size={18} />
                </div>
                <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 15, fontWeight: 800 }}>
                  كافيه TFG | CAFE
                </h3>
              </div>
              <span style={{ fontSize: 11, color: '#d97706', background: 'rgba(217, 119, 6, 0.12)', padding: '2px 8px', borderRadius: 8, fontWeight: 700 }}>
                وردية {openCafeShifts.length > 0 ? 'نشطة' : 'مغلقة'}
              </span>
            </div>

            <div style={{ fontSize: 26, fontWeight: 900, color: '#d97706', marginTop: 6 }}>
              {formatCurrency(totalCafeRevenue)}
            </div>
            <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 12 }}>
              مبيعات الكافيه والمشروبات لهذا الشهر
            </p>
          </div>

          <div style={{ borderTop: '1px solid rgba(226, 220, 209, 0.6)', paddingTop: 12, marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>مصاريف ومشتريات: {formatCurrency(totalCafeExpenses)}</span>
            <button
              onClick={() => onNavigateTab && onNavigateTab('cafe_pos')}
              style={{
                background: 'transparent', border: 'none', color: '#d97706',
                fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0
              }}
            >
              فتح الكاشير ←
            </button>
          </div>
        </div>

        {/* 5. Members & Packages Bento (Col 4) */}
        <div
          onClick={() => onNavigateTab && onNavigateTab('clients')}
          className="bento-card bento-col-4 bento-card-interactive"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: 'rgba(27, 77, 62, 0.12)', color: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Users size={20} />
            </div>
            <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>عرض الأعضاء ←</span>
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 30, fontWeight: 900, color: 'var(--text-primary)' }}>{clients.length}</div>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>إجمالي الأعضاء والمشتركين</span>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              منهم {packages.length} باقات وكورسات معتمدة
            </div>
          </div>
        </div>

        {/* 6. Tickets Bento (Col 4) */}
        <div
          onClick={() => onNavigateTab && onNavigateTab('tickets')}
          className="bento-card bento-col-4 bento-card-interactive"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: 'rgba(168, 85, 247, 0.15)', color: '#9333ea',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Package size={20} />
            </div>
            <span style={{ fontSize: 12, color: '#9333ea', fontWeight: 700 }}>سجل التذاكر ←</span>
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 30, fontWeight: 900, color: 'var(--text-primary)' }}>
              {formatCurrency(totalTicketsRevenue)}
            </div>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>إيراد تذاكر اليوم الحر</span>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              {tickets.length} عملية بيع تذكرة مسجلة
            </div>
          </div>
        </div>

        {/* 7. Active Shifts Quick Stat (Col 4) */}
        <div
          onClick={() => onNavigateTab && onNavigateTab('shifts')}
          className="bento-card bento-col-4 bento-card-interactive"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: 'rgba(16, 185, 129, 0.15)', color: '#059669',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Clock size={20} />
            </div>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 12, color: '#059669', fontWeight: 700
            }}>
              <span className="bento-pulse-dot" style={{ background: '#059669' }} />
              {allOpenCount} وردية جارية
            </span>
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 30, fontWeight: 900, color: 'var(--text-primary)' }}>{allOpenCount}</div>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>المناوبات المفتوحة الآن</span>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              الاستقبال والكافيه ومساحة العمل
            </div>
          </div>
        </div>

        {/* 8. Open Shifts Live Dock (Col 12) */}
        <div className="bento-card bento-col-12">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ color: 'var(--text-primary)', fontSize: 17, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Clock size={20} color="var(--accent)" /> المناوبات المفتوحة في المكان ({allOpenCount})
            </h2>
            <button
              onClick={() => onNavigateTab && onNavigateTab('shifts')}
              style={{
                background: 'transparent', border: 'none', color: 'var(--accent)',
                fontSize: 12, fontWeight: 700, cursor: 'pointer'
              }}
            >
              عرض سجل المناوبات بالكامل ←
            </button>
          </div>

          {allOpenCount === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 20px', background: 'rgba(0, 0, 0, 0.2)', borderRadius: 16 }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>
                لا توجد مناوبات مفتوحة حالياً. يمكنك فتح مناوبة جديدة من تبويب الورديات.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 14 }}>
              {openStaffShifts.map(s => (
                <div key={s.id} style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid rgba(217, 119, 6, 0.35)',
                  borderRadius: 16,
                  padding: '16px 18px',
                  display: 'flex', flexDirection: 'column', gap: 8
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Building2 size={16} color="var(--accent)" /> {s.employeeName}
                    </span>
                    <Badge color="amber">مناوبة جارية</Badge>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: 13, borderTop: '1px solid rgba(226, 220, 209, 0.6)', paddingTop: 8 }}>
                    <span>كاش الدرج المتوقع:</span>
                    <strong style={{ color: 'var(--accent)' }}>{formatCurrency(s.drawerCash !== undefined ? s.drawerCash : (s.cashRevenue || 0))}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: 13 }}>
                    <span>إيرادات المناوبة:</span>
                    <strong style={{ color: '#059669' }}>{formatCurrency(s.totalRevenue || 0)}</strong>
                  </div>
                </div>
              ))}

              {openCafeShifts.map(cs => (
                <div key={cs.id} style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  borderRadius: 16,
                  padding: '16px 18px',
                  display: 'flex', flexDirection: 'column', gap: 8
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Coffee size={16} color="#059669" /> {cs.baristaName || 'باريستا الكافيه'}
                    </span>
                    <Badge color="green">كافيه نشط</Badge>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: 13, borderTop: '1px solid rgba(226, 220, 209, 0.6)', paddingTop: 8 }}>
                    <span>درج الكافيه:</span>
                    <strong style={{ color: 'var(--accent)' }}>{formatCurrency(cs.drawerCash || 0)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: 13 }}>
                    <span>مبيعات الوردية:</span>
                    <strong style={{ color: '#059669' }}>{formatCurrency(cs.totalSales || 0)}</strong>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
