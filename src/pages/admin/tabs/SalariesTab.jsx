import React, { useState, useEffect } from 'react';
import { getEmployees, getMonthlyAttendanceSummary, getSalary, saveSalary, addAdminExpense, deleteAdminExpense, updateAdminExpense } from '../../../services/db';
import { Card, Button, Input, Modal, Badge } from '../../../components/ui';
import { formatCurrency, getCurrentMonth, getMonthLabel } from '../../../utils/constants';
import { exportToExcel } from '../../../utils/excelExport';

export default function SalariesTab() {
  const [employees, setEmployees] = useState([]);
  const [month, setMonth] = useState(getCurrentMonth());
  const [attendanceSummary, setAttendanceSummary] = useState({});
  const [salaries, setSalaries] = useState({});
  const [settings, setSettings] = useState({ workDaysPerMonth: 26 });
  const [editModal, setEditModal] = useState(null);
  const [editForm, setEditForm] = useState({ additions: 0, deductions: 0, note: '', disburseNow: true });
  const [loading, setLoading] = useState(false);
  const [calcLoading, setCalcLoading] = useState(false);

  useEffect(() => {
    return getEmployees(setEmployees);
  }, []);

  const loadData = async () => {
    if (employees.length === 0) return;
    setCalcLoading(true);
    const summary = await getMonthlyAttendanceSummary(month);
    setAttendanceSummary(summary);

    const salaryData = {};
    for (const emp of employees) {
      const saved = await getSalary(emp.id, month);
      salaryData[emp.id] = saved;
    }
    setSalaries(salaryData);
    setCalcLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [month, employees]);

  const calcSalary = (emp) => {
    const cleanEmpId = String(emp.memberId || '').trim().toLowerCase();
    const attendance = attendanceSummary[emp.memberId] || attendanceSummary[cleanEmpId] || Object.entries(attendanceSummary).find(([k]) => k.trim().toLowerCase() === cleanEmpId)?.[1] || { days: 0, hours: 0 };
    const baseSalary = Number(emp.salary) || 0;
    const workDays = Number(settings.workDaysPerMonth) || 26;
    const isDaily = emp.salaryType === 'daily_hourly';

    // Fixed monthly employees get full base salary, daily employees calculate by days
    const earned = isDaily ? (workDays > 0 ? (baseSalary / workDays) * attendance.days : 0) : baseSalary;
    const saved = salaries[emp.id];
    const additions = Number(saved?.additions || 0);
    const deductions = Number(saved?.deductions || 0);
    const net = earned + additions - deductions;
    return { earned, additions, deductions, net, days: attendance.days, hours: attendance.hours, isDaily };
  };

  const openEdit = (emp) => {
    const saved = salaries[emp.id];
    setEditForm({
      additions: saved?.additions || 0,
      deductions: saved?.deductions || 0,
      note: saved?.note || '',
      disburseNow: !saved?.disbursed
    });
    setEditModal(emp);
  };

  const handleSave = async () => {
    if (!editModal || loading) return;
    setLoading(true);
    try {
      const calc = calcSalary(editModal);
      const net = calc.earned + Number(editForm.additions) - Number(editForm.deductions);
      const saved = salaries[editModal.id];
      let expenseId = saved?.expenseId || null;

      if (editForm.disburseNow && !saved?.disbursed && net > 0) {
        const expRef = await addAdminExpense({
          title: `راتب شهر ${month}: ${editModal.name}`,
          amount: net,
          category: 'رواتب وأجور',
          description: `صافي مستحقات شهر ${month} للموظف ${editModal.name} (${calc.days} يوم حضور)${editForm.note ? ' - ' + editForm.note : ''}`,
          employeeId: editModal.id,
          salaryMonth: month
        });
        expenseId = expRef?.id || null;
      } else if (saved?.disbursed && saved?.expenseId && net > 0) {
        // Automatically sync treasury expense if already disbursed and amounts modified
        await updateAdminExpense(saved.expenseId, {
          amount: net,
          description: `صافي مستحقات شهر ${month} للموظف ${editModal.name} (${calc.days} يوم حضور)${editForm.note ? ' - ' + editForm.note : ''}`
        });
      }

      await saveSalary(editModal.id, month, {
        baseSalary: editModal.salary,
        earned: calc.earned,
        additions: Number(editForm.additions),
        deductions: Number(editForm.deductions),
        net,
        daysPresent: calc.days,
        note: editForm.note,
        disbursed: editForm.disburseNow || !!saved?.disbursed,
        expenseId
      });
      await loadData();
      setEditModal(null);
    } catch (err) {
      console.error('Error saving salary:', err);
      alert('حدث خطأ أثناء حفظ بيانات الراتب: ' + (err.message || 'يرجى المحاولة لاحقاً'));
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = () => {
    const headers = ['#', 'اسم الموظف', 'الكود', 'نوع الراتب', 'الراتب الأساسي', 'أيام الحضور', 'ساعات الحضور', 'المستحق الفعلي', 'إضافات ومكافآت', 'خصومات وجزاءات', 'الصافي النهائي', 'ملاحظات'];
    const rows = employees.map((emp, i) => {
      const calc = calcSalary(emp);
      return [
        i + 1,
        emp.name,
        emp.memberId || '—',
        emp.salaryType === 'daily_hourly' ? 'يومي / بالساعة' : 'شهري ثابت',
        Number(emp.salary) || 0,
        calc.days,
        Number(calc.hours?.toFixed(1)) || 0,
        calc.earned,
        calc.additions,
        calc.deductions,
        calc.net,
        salaries[emp.id]?.note || '—'
      ];
    });
    exportToExcel(`مسير_رواتب_شهر_${month}`, headers, rows);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ color: '#ffffff', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>💵</span> حساب وتوزيع المرتبات
          </h2>
          <p style={{ color: '#93c5fd', fontSize: 13, marginTop: 4 }}>
            📅 شهر: <strong>{getMonthLabel(month)}</strong> | معيار الشهر: <strong>{settings.workDaysPerMonth} يوم عمل</strong>
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Button size="sm" onClick={handleExportExcel} style={{ background: 'linear-gradient(135deg, #059669, #10b981)', color: '#fff', fontWeight: 800 }}>
            📥 تصدير مسير الرواتب Excel
          </Button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ color: '#c8dcf5', fontSize: 13, fontWeight: 600 }}>أيام العمل:</label>
            <input
              type="number"
              value={settings.workDaysPerMonth}
              onChange={e => setSettings({ ...settings, workDaysPerMonth: Number(e.target.value) })}
              style={{
                width: 64, textAlign: 'center', background: 'var(--bg-surface)',
                border: '1px solid var(--border)', borderRadius: 10, padding: '6px 8px',
                color: '#ffffff', fontWeight: 700, fontSize: 14, outline: 'none',
              }}
            />
          </div>
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '8px 14px', color: '#ffffff',
              fontFamily: 'Cairo, sans-serif', fontSize: 14, outline: 'none',
            }}
          />
        </div>
      </div>

      {calcLoading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#7aa4d4' }}>جاري حساب المرتبات...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {employees.map(emp => {
            const calc = calcSalary(emp);
            const isSaved = !!salaries[emp.id];
            return (
              <Card key={emp.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <h3 style={{ color: '#ffffff', fontWeight: 700, fontSize: 16 }}>{emp.name}</h3>
                      {salaries[emp.id]?.disbursed ? (
                        <Badge color="green">🟢 تم الصرف من الخزينة</Badge>
                      ) : isSaved ? (
                        <Badge color="amber">⏳ معتمد (بانتظار الصرف)</Badge>
                      ) : null}
                    </div>
                    <p style={{ color: '#c8dcf5', fontSize: 13 }}>
                      الراتب الأساسي: <strong style={{ color: '#ffffff' }}>{formatCurrency(emp.salary)}</strong>
                    </p>
                    <p style={{ color: '#93c5fd', fontSize: 13, marginTop: 2 }}>
                      الحضور الفعلي: <strong>{calc.days}</strong> يوم | الساعات: <strong>{calc.hours?.toFixed(1)}</strong> ساعة
                    </p>
                  </div>

                  <div style={{ textAlign: 'left' }}>
                    <p style={{ color: '#c8dcf5', fontSize: 13 }}>المستحق الفعلي: {formatCurrency(calc.earned)}</p>
                    {calc.additions > 0 && <p style={{ color: '#34d399', fontSize: 13 }}>+ إضافات: {formatCurrency(calc.additions)}</p>}
                    {calc.deductions > 0 && <p style={{ color: '#f87171', fontSize: 13 }}>- خصومات: {formatCurrency(calc.deductions)}</p>}
                    <p style={{
                      fontSize: 18, fontWeight: 900, marginTop: 4,
                      color: calc.net >= 0 ? '#60a5fa' : '#f87171',
                    }}>
                      الصافي: {formatCurrency(calc.net)}
                    </p>
                  </div>
                </div>

                {salaries[emp.id]?.note && (
                  <p style={{ color: '#93c5fd', fontSize: 12, marginTop: 10, padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: 8 }}>
                    📝 ملاحظة: {salaries[emp.id].note}
                  </p>
                )}

                <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                  <Button size="sm" variant="primary" onClick={() => openEdit(emp)}>
                    ✏️ تعديل الإضافات والخصومات والصرف
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={!!editModal} onClose={() => setEditModal(null)} title={`تعديل مرتب — ${editModal?.name}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {editModal && (() => {
            const calc = calcSalary(editModal);
            return (
              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', padding: 14, borderRadius: 12, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: '#c8dcf5' }}>
                  <span>الراتب الأساسي:</span>
                  <span style={{ color: '#ffffff', fontWeight: 700 }}>{formatCurrency(editModal.salary)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: '#c8dcf5' }}>
                  <span>أيام الحضور:</span>
                  <span style={{ color: '#34d399', fontWeight: 700 }}>{calc.days} يوم</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid var(--border)', marginTop: 6, color: '#c8dcf5' }}>
                  <span>المستحق ({calc.days}/{settings.workDaysPerMonth}):</span>
                  <span style={{ color: '#60a5fa', fontWeight: 800 }}>{formatCurrency(calc.earned)}</span>
                </div>
              </div>
            );
          })()}

          <Input label="إضافات ومكافآت (ج.م)" type="number" value={editForm.additions} onChange={e => setEditForm({ ...editForm, additions: e.target.value })} />
          <Input label="خصومات وجزاءات (ج.م)" type="number" value={editForm.deductions} onChange={e => setEditForm({ ...editForm, deductions: e.target.value })} />
          <Input label="ملاحظات" value={editForm.note} onChange={e => setEditForm({ ...editForm, note: e.target.value })} placeholder="سبب الإضافة أو الخصم..." />

          {!salaries[editModal?.id]?.disbursed && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#a7f3d0', fontSize: 13, fontWeight: 700, padding: '10px 14px', background: 'rgba(16, 185, 129, 0.12)', borderRadius: 10, border: '1px solid rgba(16, 185, 129, 0.3)' }}>
              <input
                type="checkbox"
                checked={editForm.disburseNow}
                onChange={e => setEditForm({ ...editForm, disburseNow: e.target.checked })}
                style={{ width: 18, height: 18 }}
              />
              <span>💵 صرف وقيد الراتب كإذن صرف رسمي في الخزينة المركزية (رواتب وأجور)</span>
            </label>
          )}

          {editModal && (
            <div style={{
              background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.35)',
              padding: 16, borderRadius: 14, textAlign: 'center',
            }}>
              <p style={{ fontSize: 13, color: '#93c5fd', marginBottom: 4 }}>الصافي النهائي للصرف</p>
              <p style={{ fontSize: 24, fontWeight: 900, color: '#ffffff' }}>
                {formatCurrency(calcSalary(editModal).earned + Number(editForm.additions || 0) - Number(editForm.deductions || 0))}
              </p>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
            <Button variant="primary" className="flex-1" onClick={handleSave} disabled={loading}>
              {loading ? 'جاري الحفظ...' : '✅ حفظ وتأكيد'}
            </Button>
            <Button variant="ghost" className="flex-1" onClick={() => setEditModal(null)}>إلغاء</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
