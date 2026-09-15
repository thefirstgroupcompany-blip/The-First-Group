import React from 'react';
import { Modal, Button } from './ui';
import { exportToExcel } from '../utils/excelExport';

export default function InstructorAttendanceModal({ isOpen, onClose, instructor, schedules = [], subscriptions = [] }) {
  if (!isOpen || !instructor) return null;

  const instSubs = subscriptions.filter(sub =>
    sub.packageType === 'sessions' &&
    (sub.instructorId === instructor.id || sub.instructorName === instructor.name || (sub.packageName || '').includes(instructor.name))
  );

  const handlePrint = () => {
    window.print();
  };

  const handleExportExcel = () => {
    const headers = ['#', 'اسم الطالب', 'اسم الباقة / المجموعة', 'الحصص الكلية', 'الحصص المستهلكة', 'المتبقي', 'نسبة الحضور', 'حالة الاشتراك'];
    const rows = instSubs.map((s, idx) => {
      const total = Number(s.packageSessions) || 1;
      const used = Number(s.sessionsUsed) || 0;
      const rem = Math.max(0, total - used);
      const pct = total > 0 ? Math.round((used / total) * 100) : 0;
      return [
        idx + 1,
        s.clientName || 'طالب',
        s.packageName || 'كورس',
        total,
        used,
        rem,
        pct + "%",
        s.status === 'active' ? 'نشط' : 'منتهي'
      ];
    });
    exportToExcel("كشف_حصص_" + instructor.name, headers, rows);
  };

  return (
    <Modal open={true} onClose={onClose} title={"📋 كشف حضور وحصص طلاب المدرس: " + instructor.name} size="lg">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(59, 130, 246, 0.1)', padding: '12px 18px', borderRadius: 12, border: '1px solid rgba(59, 130, 246, 0.25)', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <strong style={{ color: '#fff', fontSize: 14 }}>المادة: {instructor.subject || 'عام'}</strong>
            <p style={{ color: '#93c5fd', fontSize: 12, margin: '2px 0 0' }}>إجمالي الطلاب المشتركين بالمجموعات: {instSubs.length} طالب</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" onClick={handleExportExcel} style={{ background: 'linear-gradient(135deg, #059669, #10b981)', color: '#fff', fontWeight: 800 }}>
              📥 تصدير Excel
            </Button>
            <Button size="sm" variant="ghost" onClick={handlePrint}>🖨️ طباعة الكشف</Button>
          </div>
        </div>

        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '2px solid var(--border)', color: '#94a3b8' }}>
                <th style={{ padding: '10px' }}>#</th>
                <th style={{ padding: '10px' }}>اسم الطالب</th>
                <th style={{ padding: '10px' }}>اسم الباقة / المادة</th>
                <th style={{ padding: '10px', textAlign: 'center' }}>الحصص الكلية</th>
                <th style={{ padding: '10px', textAlign: 'center', color: '#38bdf8' }}>المستهلك</th>
                <th style={{ padding: '10px', textAlign: 'center', color: '#34d399' }}>المتبقي</th>
                <th style={{ padding: '10px', textAlign: 'center' }}>النسبة</th>
              </tr>
            </thead>
            <tbody>
              {instSubs.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>لا توجد اشتراكات حصص مسجلة لهذا المدرس بعد</td>
                </tr>
              ) : (
                instSubs.map((s, idx) => {
                  const total = Number(s.packageSessions) || 1;
                  const used = Number(s.sessionsUsed) || 0;
                  const rem = Math.max(0, total - used);
                  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
                  return (
                    <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '8px 10px' }}>{idx + 1}</td>
                      <td style={{ padding: '8px 10px', color: '#fff', fontWeight: 700 }}>{s.clientName || 'طالب'}</td>
                      <td style={{ padding: '8px 10px', color: '#93c5fd' }}>{s.packageName}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>{total}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', color: '#38bdf8', fontWeight: 800 }}>{used}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', color: '#34d399', fontWeight: 800 }}>{rem}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        <span style={{ background: pct >= 80 ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)', color: pct >= 80 ? '#fca5a5' : '#a7f3d0', padding: '2px 6px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                          {pct}%
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
