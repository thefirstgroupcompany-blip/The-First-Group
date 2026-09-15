import React, { useState, useEffect, useRef } from 'react';
import { getEmployees, getAllAttendance, recordAttendance, deleteAttendanceRecord, manualCheckoutAttendance } from '../../../services/db';
import { Card, Button, Input, Badge, EmptyState, ConfirmDialog } from '../../../components/ui';

export default function AttendanceTab({ user }) {
  const [employees, setEmployees] = useState([]);
  const [allAttendance, setAllAttendance] = useState([]);
  const [memberIdInput, setMemberIdInput] = useState('');
  const [punchLoading, setPunchLoading] = useState(false);
  const [punchAlert, setPunchAlert] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  
  // Advanced Filter state
  const [selectedEmp, setSelectedEmp] = useState(user?.memberId || 'all');
  const [searchName, setSearchName] = useState('');

  const now = new Date();
  const firstDayOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const [fromDate, setFromDate] = useState(firstDayOfMonth);
  const [toDate, setToDate] = useState(todayStr);

  const inputRef = useRef();

  useEffect(() => {
    const unsubE = getEmployees(setEmployees);
    const unsubA = getAllAttendance(setAllAttendance);
    return () => { unsubE(); unsubA(); };
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Direct Punch Handler
  const handleDirectPunch = async (e) => {
    e?.preventDefault();
    setPunchAlert(null);
    const idToPunch = memberIdInput.trim();
    if (!idToPunch) return;

    setPunchLoading(true);
    try {
      const res = await recordAttendance(idToPunch);
      if (res.type === 'checkin') {
        const periodText = res.sessionNum > 1 ? ` (فترة ${res.sessionNum})` : '';
        setPunchAlert({
          type: 'checkin',
          text: `✅ تم تسجيل حضور${periodText} للموظف "${res.employeeName}" في تمام الساعة ${res.time}`
        });
      } else if (res.type === 'checkout') {
        const periodText = res.sessionNum > 1 ? ` (فترة ${res.sessionNum})` : '';
        setPunchAlert({
          type: 'checkout',
          text: `🚪 تم تسجيل انصراف${periodText} للموظف "${res.employeeName}" في تمام الساعة ${res.time} — ساعات هذه الفترة: ${res.hours} ساعة (إجمالي ساعات اليوم: ${res.todayTotalHours} ساعة)`
        });
      }
      setMemberIdInput('');
      inputRef.current?.focus();
    } catch (err) {
      setPunchAlert({
        type: 'error',
        text: `⚠️ ${err.message || 'حدث خطأ أثناء التسجيل'}`
      });
    } finally {
      setPunchLoading(false);
    }
  };

  // Filtered Attendance List
  const filteredRecords = allAttendance.filter(a => {
    // Date filter
    const recordDate = a.date || '';
    if (fromDate && recordDate < fromDate) return false;
    if (toDate && recordDate > toDate) return false;

    // Employee filter
    if (selectedEmp !== 'all' && String(a.memberId).trim().toLowerCase() !== String(selectedEmp).trim().toLowerCase()) {
      return false;
    }

    // Name search
    if (searchName.trim()) {
      const q = searchName.trim().toLowerCase();
      const emp = employees.find(e => String(e.memberId).trim().toLowerCase() === String(a.memberId).trim().toLowerCase());
      const name = (emp?.name || a.employeeName || '').toLowerCase();
      const mId = String(a.memberId || '').toLowerCase();
      if (!name.includes(q) && !mId.includes(q)) return false;
    }

    return true;
  }).sort((a, b) => {
    const da = a.checkIn ? new Date(a.checkIn).getTime() : 0;
    const db = b.checkIn ? new Date(b.checkIn).getTime() : 0;
    return db - da;
  });

  const totalHours = filteredRecords.filter(a => a.checkOut).reduce((s, a) => s + (Number(a.hours) || 0), 0);
  const totalSessions = filteredRecords.length;
  const uniqueDays = new Set(filteredRecords.map(a => a.date)).size;

  const handlePrint = () => {
    const win = window.open('', '_blank');
    const empLabel = selectedEmp !== 'all' ? (employees.find(e => e.memberId === selectedEmp)?.name || selectedEmp) : 'جميع الموظفين';
    
    win.document.write(`
      <html dir="rtl" lang="ar">
        <head>
          <title>تقرير الحضور والانصراف</title>
          <style>
            body { font-family: 'Cairo', Tahoma, sans-serif; padding: 24px; color: #1e293b; }
            h2 { text-align: center; margin-bottom: 4px; }
            p.sub { text-align: center; color: #64748b; font-size: 14px; margin-bottom: 20px; }
            .stats { display: flex; justify-content: space-around; background: #f1f5f9; padding: 14px; border-radius: 8px; margin-bottom: 20px; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #cbd5e1; padding: 8px 12px; text-align: center; font-size: 13px; }
            th { background: #e2e8f0; font-weight: bold; }
            .hours { color: #0284c7; font-weight: bold; }
          </style>
        </head>
        <body>
          <h2>تقرير الحضور والانصراف</h2>
          <p class="sub">الموظف: <strong>${empLabel}</strong> | الفترة: من <strong>${fromDate || 'البداية'}</strong> إلى <strong>${toDate || 'اليوم'}</strong></p>
          
          <div class="stats">
            <div>أيام العمل: ${uniqueDays} يوم</div>
            <div>إجمالي الفترات: ${totalSessions} فترة</div>
            <div>إجمالي ساعات العمل: ${totalHours.toFixed(2)} ساعة</div>
          </div>

          <table>
            <thead>
              <tr>
                <th>الموظف</th>
                <th>رقم العضوية</th>
                <th>التاريخ</th>
                <th>وقت الحضور</th>
                <th>وقت الانصراف</th>
                <th>ساعات الفترة</th>
              </tr>
            </thead>
            <tbody>
              ${filteredRecords.map(a => {
                const emp = employees.find(e => e.memberId === a.memberId);
                const inTime = a.checkIn ? new Date(a.checkIn).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' }) : '—';
                const outTime = a.checkOut ? new Date(a.checkOut).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' }) : '—';
                return `
                  <tr>
                    <td>${emp?.name || a.employeeName || a.memberId}</td>
                    <td>${a.memberId}</td>
                    <td>${a.date}</td>
                    <td>${inTime}</td>
                    <td>${outTime}</td>
                    <td class="hours">${a.hours != null ? a.hours + ' ساعة' : 'جاري العمل (لم ينصرف)'}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `);
    win.document.close();
    win.print();
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      
      {/* 1. Direct Punch Box */}
      <Card style={{ background: 'var(--bg-card)', border: '1px solid #3b82f6', boxShadow: '0 0 20px rgba(59,130,246,0.15)' }}>
        <h3 style={{ color: '#ffffff', fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span>⏱️</span> تسجيل الحضور والانصراف السريع
        </h3>
        <p style={{ color: '#93c5fd', fontSize: 13, marginBottom: 14 }}>
          أدخل رقم العضوية واضغط تسجيل (يمكن التسجيل أكثر من مرة باليوم - التبديل تلقائي بين <strong>حضور</strong> و <strong>انصراف</strong>):
        </p>

        <form onSubmit={handleDirectPunch} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Input
            ref={inputRef}
            placeholder="أدخل رقم العضوية (مثال: SARA أو HOSSAM)..."
            value={memberIdInput}
            onChange={e => setMemberIdInput(e.target.value)}
            style={{ flex: 1, minWidth: 220, fontSize: 16, fontWeight: 700 }}
            autoFocus
          />
          <Button type="submit" variant="primary" size="lg" disabled={punchLoading || !memberIdInput.trim()} style={{ minWidth: 180 }}>
            {punchLoading ? 'جاري التسجيل...' : '⏱️ تسجيل الآن'}
          </Button>
        </form>

        {/* Live Feedback Banner */}
        {punchAlert && (
          <div style={{
            marginTop: 14, padding: '14px 18px', borderRadius: 12,
            background: punchAlert.type === 'checkin' ? 'rgba(16, 185, 129, 0.15)' :
                        punchAlert.type === 'checkout' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${
              punchAlert.type === 'checkin' ? 'rgba(16, 185, 129, 0.3)' :
              punchAlert.type === 'checkout' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(239, 68, 68, 0.3)'
            }`,
            color: punchAlert.type === 'checkin' ? '#6ee7b7' :
                   punchAlert.type === 'checkout' ? '#93c5fd' : '#fca5a5',
            fontSize: 15, fontWeight: 800, textAlign: 'center',
            animation: 'fadeIn 0.3s ease-out'
          }}>
            {punchAlert.text}
          </div>
        )}
      </Card>

      {/* 2. Advanced Search & Range Filter */}
      <Card style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <h3 style={{ color: '#ffffff', fontSize: 17, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🔍</span> استعلام وبحث الحضور والانصراف وساعات العمل
          </h3>
          <Button size="sm" variant="ghost" onClick={handlePrint} disabled={filteredRecords.length === 0}>
            🖨️ طباعة التقرير
          </Button>
        </div>

        {/* Filter inputs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ display: 'block', color: '#93c5fd', fontSize: 12, marginBottom: 4 }}>اختر الموظف:</label>
            <select
              value={selectedEmp}
              onChange={e => setSelectedEmp(e.target.value)}
              style={{
                width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '10px 12px', color: '#ffffff',
                fontFamily: 'Cairo, sans-serif', fontSize: 14, outline: 'none'
              }}
            >
              <option value="all">جميع الموظفين</option>
              {employees.map(e => (
                <option key={e.id} value={e.memberId}>{e.name} ({e.memberId})</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', color: '#93c5fd', fontSize: 12, marginBottom: 4 }}>بحث بالاسم أو العضوية:</label>
            <Input
              placeholder="اكتب اسم أو رقم..."
              value={searchName}
              onChange={e => setSearchName(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: 'block', color: '#93c5fd', fontSize: 12, marginBottom: 4 }}>من تاريخ:</label>
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              style={{
                width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '9px 12px', color: '#ffffff',
                fontFamily: 'Cairo, sans-serif', fontSize: 14, outline: 'none'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', color: '#93c5fd', fontSize: 12, marginBottom: 4 }}>إلى تاريخ:</label>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              style={{
                width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '9px 12px', color: '#ffffff',
                fontFamily: 'Cairo, sans-serif', fontSize: 14, outline: 'none'
              }}
            />
          </div>
        </div>

        {/* Summary Stats Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
          <div style={{ background: 'var(--bg-base)', padding: '14px', borderRadius: 12, border: '1px solid var(--border)', textAlign: 'center' }}>
            <p style={{ color: '#93c5fd', fontSize: 12 }}>أيام العمل</p>
            <p style={{ color: '#ffffff', fontSize: 24, fontWeight: 900, marginTop: 2 }}>{uniqueDays} <span style={{ fontSize: 12, color: '#94a3b8' }}>يوم</span></p>
          </div>

          <div style={{ background: 'var(--bg-base)', padding: '14px', borderRadius: 12, border: '1px solid var(--border)', textAlign: 'center' }}>
            <p style={{ color: '#a7f3d0', fontSize: 12 }}>إجمالي ساعات العمل</p>
            <p style={{ color: '#34d399', fontSize: 24, fontWeight: 900, marginTop: 2 }}>{totalHours.toFixed(1)} <span style={{ fontSize: 12, color: '#7aa4d4' }}>ساعة</span></p>
          </div>

          <div style={{ background: 'var(--bg-base)', padding: '14px', borderRadius: 12, border: '1px solid var(--border)', textAlign: 'center' }}>
            <p style={{ color: '#bfdbfe', fontSize: 12 }}>إجمالي فترات العمل</p>
            <p style={{ color: '#60a5fa', fontSize: 24, fontWeight: 900, marginTop: 2 }}>{totalSessions}</p>
          </div>
        </div>

        {/* Table of Records */}
        {filteredRecords.length === 0 ? (
          <EmptyState icon="📅" message="لا توجد سجلات حضور وانصراف مطابقة للفترة والبحث المحدد" />
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
            <table className="dark-table">
              <thead>
                <tr>
                  <th>الموظف</th>
                  <th>رقم العضوية</th>
                  <th>التاريخ</th>
                  <th>وقت الحضور</th>
                  <th>وقت الانصراف</th>
                  <th>ساعات الفترة</th>
                  <th>الحالة</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map(a => {
                  const emp = employees.find(e => e.memberId === a.memberId);
                  return (
                    <tr key={a.id}>
                      <td><strong>{emp?.name || a.employeeName || a.memberId}</strong></td>
                      <td><span style={{ color: '#93c5fd', fontSize: 12 }}>{a.memberId}</span></td>
                      <td>{a.date}</td>
                      <td>{a.checkIn ? new Date(a.checkIn).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                      <td>{a.checkOut ? new Date(a.checkOut).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                      <td>
                        {a.hours != null ? (
                          <strong style={{ color: '#34d399' }}>{Number(a.hours).toFixed(1)} ساعة</strong>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>—</span>
                        )}
                      </td>
                      <td>
                        {a.checkOut ? (
                          <Badge color="blue">مكتمل</Badge>
                        ) : (
                          <Badge color="amber">جاري العمل (لم ينصرف)</Badge>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          {!a.checkOut && (
                            <Button
                              size="sm"
                              variant="success"
                              onClick={async () => {
                                await manualCheckoutAttendance(a.id);
                              }}
                              title="تسجيل انصراف الموظف الآن وحساب ساعاته"
                            >
                              🚪 انصراف
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => setDeleteId(a.id)}
                            title="حذف هذا السجل"
                          >
                            🗑️
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={async () => {
          await deleteAttendanceRecord(deleteId);
          setDeleteId(null);
        }}
        title="حذف سجل الحضور والانصراف"
        message="هل أنت متأكد من حذف هذا السجل نهائياً؟ لن يتم احتساب ساعات هذه الفترة في مسير الرواتب."
      />
    </div>
  );
}
