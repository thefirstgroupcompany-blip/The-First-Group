import React, { useState, useEffect } from 'react';
import {
  getEmployees, addEmployee, updateEmployee, deleteEmployee,
  getAllShifts, openShift, closeShift, getAllPayments, getTicketSales,
  getClients, getSettings, getSystemUsers, addSystemUser
} from '../../../services/db';
import { Card, Button, Input, Select, Modal, ConfirmDialog, EmptyState, Badge, Spinner } from '../../../components/ui';
import ShiftHandoverModal from '../../../components/ShiftHandoverModal';
import { formatCurrency } from '../../../utils/constants';
import {
  UserCheck, UserPlus, Search, Phone, DollarSign, Calendar,
  KeyRound, ShieldCheck, Briefcase, Coffee, Sparkles, CheckCircle2,
  XCircle, AlertCircle, Clock, RotateCcw
} from 'lucide-react';

export default function EmployeesTab({ onNavigateTab }) {
  const [employees, setEmployees] = useState([]);
  const [systemUsers, setSystemUsers] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [payments, setPayments] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [clients, setClients] = useState([]);
  const [settings, setSettings] = useState({});

  const [search, setSearch] = useState('');
  const [jobFilter, setJobFilter] = useState('all');

  // Employee Add/Edit Modal
  const [modal, setModal] = useState(false);
  const [editEmp, setEditEmp] = useState(null);
  const [form, setForm] = useState({
    name: '',
    memberId: '',
    jobTitle: 'باريستا كافيه ☕',
    phone: '',
    salary: '',
    salaryType: 'fixed_monthly',
    status: 'active',
    hireDate: '',
    notes: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Quick Create System User Modal for this employee
  const [quickUserModal, setQuickUserModal] = useState(false);
  const [targetEmpForUser, setTargetEmpForUser] = useState(null);
  const [quickUserForm, setQuickUserForm] = useState({
    username: '',
    password: '',
    role: 'employee'
  });
  const [quickUserLoading, setQuickUserLoading] = useState(false);
  const [quickUserError, setQuickUserError] = useState('');

  const [deleteId, setDeleteId] = useState(null);
  const [handoverShift, setHandoverShift] = useState(null);

  useEffect(() => {
    const unsubE = getEmployees(setEmployees);
    const unsubU = getSystemUsers(setSystemUsers);
    const unsubS = getAllShifts(setShifts);
    const unsubP = getAllPayments(setPayments);
    const unsubT = getTicketSales(setTickets);
    const unsubC = getClients(setClients);
    getSettings().then(s => { if (s) setSettings(s); });

    return () => {
      unsubE && unsubE();
      unsubU && unsubU();
      unsubS && unsubS();
      unsubP && unsubP();
      unsubT && unsubT();
      unsubC && unsubC();
    };
  }, []);

  const openAdd = () => {
    setEditEmp(null);
    const nextNum = employees.length + 1;
    const suggestedId = `EMP${String(nextNum).padStart(2, '0')}`;
    setForm({
      name: '',
      memberId: suggestedId,
      jobTitle: 'باريستا كافيه ☕',
      phone: '',
      salary: '',
      salaryType: 'fixed_monthly',
      status: 'active',
      hireDate: new Date().toISOString().split('T')[0],
      notes: ''
    });
    setError('');
    setModal(true);
  };

  const openEdit = (emp) => {
    setEditEmp(emp);
    setForm({
      name: emp.name || '',
      memberId: emp.memberId || '',
      jobTitle: emp.jobTitle || 'موظف',
      phone: emp.phone || '',
      salary: emp.salary || '',
      salaryType: emp.salaryType || 'fixed_monthly',
      status: emp.status || 'active',
      hireDate: emp.hireDate || '',
      notes: emp.notes || ''
    });
    setError('');
    setModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('اسم الموظف مطلوب');
    if (!form.memberId.trim()) return setError('كود الموظف التعريفي مطلوب');

    setLoading(true);
    try {
      if (editEmp) {
        await updateEmployee(editEmp.id, {
          name: form.name.trim(),
          memberId: form.memberId.trim(),
          jobTitle: form.jobTitle,
          phone: form.phone.trim(),
          salary: form.salary,
          salaryType: form.salaryType || 'fixed_monthly',
          status: form.status || 'active',
          hireDate: form.hireDate || '',
          notes: form.notes.trim()
        });
      } else {
        await addEmployee({
          name: form.name.trim(),
          memberId: form.memberId.trim(),
          jobTitle: form.jobTitle,
          phone: form.phone.trim(),
          salary: form.salary,
          salaryType: form.salaryType || 'fixed_monthly',
          status: form.status || 'active',
          hireDate: form.hireDate || '',
          notes: form.notes.trim()
        });
      }
      setModal(false);
    } catch (err) {
      setError(err.message || 'حدث خطأ أثناء حفظ بيانات الموظف');
    } finally {
      setLoading(false);
    }
  };

  const openQuickCreateUser = (emp) => {
    setTargetEmpForUser(emp);
    const suggestedUsername = (emp.memberId || emp.name || 'user').toLowerCase().replace(/\s+/g, '_');
    const isCafe = (emp.jobTitle || '').includes('باريستا') || (emp.jobTitle || '').includes('كافيه');
    setQuickUserForm({
      username: suggestedUsername,
      password: '',
      role: isCafe ? 'cafe' : 'employee'
    });
    setQuickUserError('');
    setQuickUserModal(true);
  };

  const handleCreateQuickUser = async (e) => {
    e.preventDefault();
    setQuickUserError('');
    if (!quickUserForm.username.trim()) return setQuickUserError('اسم المستخدم مطلوب');
    if (!quickUserForm.password) return setQuickUserError('كلمة المرور مطلوبة');

    setQuickUserLoading(true);
    try {
      await addSystemUser({
        username: quickUserForm.username.trim().toLowerCase(),
        password: quickUserForm.password,
        name: targetEmpForUser.name,
        role: quickUserForm.role,
        status: 'active',
        linkedEmployeeId: targetEmpForUser.id,
        phone: targetEmpForUser.phone || ''
      });
      setQuickUserModal(false);
      alert(`✅ تم إنشاء حساب مستخدم للنظام بنجاح باسم: @${quickUserForm.username}`);
    } catch (err) {
      setQuickUserError(err.message || 'حدث خطأ أثناء إنشاء حساب النظام');
    } finally {
      setQuickUserLoading(false);
    }
  };

  const handleOpenShift = async (emp) => {
    if (window.confirm(`هل تريد فتح مناوبة جديدة للموظف "${emp.name}"؟`)) {
      try {
        await openShift(emp.id, emp.name);
      } catch (err) {
        console.error('Error opening shift:', err);
        alert('حدث خطأ أثناء فتح المناوبة: ' + (err.message || 'يرجى المحاولة لاحقاً'));
      }
    }
  };

  // Filtered employees
  const filteredEmps = employees.filter(emp => {
    const q = search.trim().toLowerCase();
    const matchQ = !q ||
      String(emp.name || '').toLowerCase().includes(q) ||
      String(emp.memberId || '').toLowerCase().includes(q) ||
      String(emp.phone || '').includes(q);

    const matchJob = jobFilter === 'all' || (emp.jobTitle || '').includes(jobFilter);
    return matchQ && matchJob;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontFamily: 'Cairo, sans-serif' }}>
      {/* Top Banner Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16,
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.95) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 20,
        padding: '20px 24px',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.4)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.25) 0%, rgba(147, 51, 234, 0.25) 100%)',
            border: '1.5px solid rgba(59, 130, 246, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#60a5fa',
            flexShrink: 0
          }}>
            <UserCheck size={26} />
          </div>
          <div>
            <h2 style={{ color: '#ffffff', fontSize: 20, fontWeight: 900, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>كادر العمل والموظفون</span>
              <span style={{ fontSize: 13, background: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd', padding: '2px 10px', borderRadius: 20, border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                {employees.length} موظف
              </span>
            </h2>
            <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>
              سجلات العاملين بالمكان، أكواد الحضور والانصراف، المسميات الوظيفية، الرواتب، والمناوبات.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {onNavigateTab && (
            <Button
              onClick={() => onNavigateTab('system_users')}
              variant="outline"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, borderRadius: 12 }}
            >
              <KeyRound size={15} />
              <span>إدارة مستخدمي النظام</span>
            </Button>
          )}

          <Button
            onClick={openAdd}
            variant="primary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 18px',
              fontSize: 14,
              fontWeight: 800,
              borderRadius: 12
            }}
          >
            <UserPlus size={16} />
            <span>+ إضافة موظف جديد</span>
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <Card style={{ padding: '14px 18px', background: 'rgba(15, 23, 42, 0.65)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Search Box */}
          <div style={{ flex: '1 1 260px', position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ابحث بالاسم، كود البصمة، أو رقم التليفون..."
              style={{
                width: '100%',
                background: 'rgba(2, 6, 23, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: 10,
                padding: '9px 36px 9px 12px',
                color: '#ffffff',
                fontSize: 13.5,
                outline: 'none',
                fontFamily: 'Cairo, sans-serif'
              }}
            />
          </div>

          {/* Job Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>المسمى الوظيفي:</span>
            <select
              value={jobFilter}
              onChange={e => setJobFilter(e.target.value)}
              style={{
                background: 'rgba(2, 6, 23, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: 9,
                padding: '7px 12px',
                color: '#ffffff',
                fontSize: 12.5,
                fontFamily: 'Cairo, sans-serif',
                cursor: 'pointer'
              }}
            >
              <option value="all">جميع الوظائف</option>
              <option value="باريستا">☕ باريستا وكافيه</option>
              <option value="استقبال">🏢 استقبال وكاشير</option>
              <option value="مشرف">👔 إشراف وإدارة</option>
              <option value="نظافة">🧹 نظافة وخدمات</option>
              <option value="خدمة عملاء">🎧 خدمة عملاء</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Employees Grid */}
      {filteredEmps.length === 0 ? (
        <EmptyState
          icon="👔"
          message="لا يوجد موظفون مضافون يطابقون البحث"
          action={
            <Button onClick={openAdd} variant="primary" style={{ marginTop: 12 }}>
              + إضافة موظف الآن
            </Button>
          }
        />
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))',
          gap: 16
        }}>
          {filteredEmps.map(emp => {
            const activeShift = shifts.find(s => s.employeeId === emp.id && s.status === 'open');
            const linkedUser = systemUsers.find(u => u.linkedEmployeeId === emp.id || u.username === emp.memberId?.toLowerCase());
            const isCafe = (emp.jobTitle || '').includes('باريستا') || (emp.jobTitle || '').includes('كافيه');

            return (
              <Card
                key={emp.id}
                style={{
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: activeShift ? '1.5px solid rgba(245, 158, 11, 0.6)' : '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 16,
                  padding: '18px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 14,
                  boxShadow: activeShift ? '0 0 20px rgba(245, 158, 11, 0.15)' : 'none'
                }}
              >
                <div>
                  {/* Top Row: Name and Role */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div>
                      <h3 style={{ margin: 0, color: '#ffffff', fontWeight: 800, fontSize: 17 }}>
                        {emp.name}
                      </h3>
                      {emp.phone && (
                        <p style={{ color: '#94a3b8', fontSize: 12, margin: '3px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Phone size={12} />
                          <span style={{ direction: 'ltr' }}>{emp.phone}</span>
                        </p>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <Badge color={isCafe ? 'amber' : 'blue'}>
                        {emp.jobTitle || 'موظف'}
                      </Badge>
                      {activeShift && (
                        <span style={{ fontSize: 10.5, color: '#fcd34d', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 3 }}>
                          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', animation: 'pulse 1.5s infinite' }} />
                          مناوبة مفتوحة
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Code / Member ID Badge */}
                  <div style={{
                    marginTop: 12,
                    background: 'rgba(56, 189, 248, 0.08)',
                    border: '1px solid rgba(56, 189, 248, 0.25)',
                    padding: '8px 12px',
                    borderRadius: 10,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span style={{ color: '#93c5fd', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Clock size={13} /> كود الحضور والبصمة:
                    </span>
                    <strong style={{ color: '#38bdf8', fontSize: 14, fontFamily: 'monospace', letterSpacing: 0.8 }}>
                      {emp.memberId}
                    </strong>
                  </div>

                  {/* Salary & Type */}
                  <div style={{
                    marginTop: 8,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '6px 2px'
                  }}>
                    <span style={{ color: '#cbd5e1', fontSize: 12 }}>الراتب الأساسي:</span>
                    <span style={{ color: '#34d399', fontWeight: 900, fontSize: 14.5 }}>
                      {formatCurrency(emp.salary || 0)}{' '}
                      <small style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
                        {emp.salaryType === 'daily_hourly' ? '/ يومي' : '/ شهري'}
                      </small>
                    </span>
                  </div>

                  {/* System User Status */}
                  <div style={{
                    marginTop: 6,
                    padding: '7px 10px',
                    borderRadius: 9,
                    background: linkedUser ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                    border: `1px solid ${linkedUser ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.06)'}`,
                    fontSize: 11.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    {linkedUser ? (
                      <span style={{ color: '#a7f3d0', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <KeyRound size={12} />
                        <span>حساب دخول: <strong style={{ color: '#ffffff', fontFamily: 'monospace' }}>@{linkedUser.username}</strong></span>
                      </span>
                    ) : (
                      <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span>👤 موظف بدون حساب نظام</span>
                      </span>
                    )}

                    {!linkedUser && (
                      <button
                        type="button"
                        onClick={() => openQuickCreateUser(emp)}
                        style={{
                          background: 'rgba(56, 189, 248, 0.15)',
                          border: '1px solid rgba(56, 189, 248, 0.35)',
                          color: '#38bdf8',
                          borderRadius: 6,
                          padding: '3px 8px',
                          fontSize: 10.5,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          fontFamily: 'Cairo, sans-serif'
                        }}
                      >
                        <KeyRound size={10} />
                        <span>+ عمل حساب</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Shift Quick Actions */}
                <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: 10 }}>
                  {activeShift ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: '#fcd34d', fontSize: 11.5, fontWeight: 700 }}>
                        الإيراد: {formatCurrency(activeShift.totalRevenue || 0)}
                      </span>
                      <Button size="sm" variant="danger" onClick={() => setHandoverShift(activeShift)} style={{ fontSize: 11.5, gap: 4 }}>
                        <span>تسليم وإغلاق</span>
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="success"
                      onClick={() => handleOpenShift(emp)}
                      style={{ width: '100%', fontSize: 12, fontWeight: 800, gap: 5 }}
                    >
                      <RotateCcw size={13} />
                      <span>فتح مناوبة لهذا الموظف</span>
                    </Button>
                  )}
                </div>

                {/* Edit & Delete Controls */}
                <div style={{ display: 'flex', gap: 8, borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: 10 }}>
                  <Button size="sm" variant="outline" onClick={() => openEdit(emp)} style={{ flex: 1, fontSize: 12 }}>
                    تعديل
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setDeleteId(emp.id)} style={{ minWidth: 60, fontSize: 12 }}>
                    حذف
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ADD / EDIT EMPLOYEE MODAL (NO PASSWORD REQUIRED!) */}
      <Modal open={modal} onClose={() => !loading && setModal(false)} title={editEmp ? 'تعديل بيانات الموظف' : 'إضافة موظف جديد في المكان'}>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: 10,
              padding: '10px 14px',
              color: '#fca5a5',
              fontSize: 12.5,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Name */}
          <Input
            label="اسم الموظف الكامل"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="مثال: حسام حسن"
            required
          />

          {/* Code & Phone */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <Input
                label="كود الحضور والبصمة"
                value={form.memberId}
                onChange={e => setForm({ ...form, memberId: e.target.value })}
                placeholder="مثال: EMP01 أو 102"
                required
              />
              <span style={{ color: '#94a3b8', fontSize: 11, marginTop: 2, display: 'block' }}>
                الكود المستخدم لتسجيل الحضور والانصراف
              </span>
            </div>

            <Input
              label="رقم الهاتف"
              type="tel"
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
              placeholder="010xxxxxxxx"
            />
          </div>

          {/* Job Title & Hire Date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                المسمى الوظيفي:
              </label>
              <select
                value={form.jobTitle}
                onChange={e => setForm({ ...form, jobTitle: e.target.value })}
                style={{
                  width: '100%',
                  background: 'rgba(2, 6, 23, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: 10,
                  padding: '9px 12px',
                  color: '#ffffff',
                  fontSize: 13,
                  fontFamily: 'Cairo, sans-serif'
                }}
              >
                <option value="باريستا كافيه ☕">باريستا كافيه ☕</option>
                <option value="موظف استقبال وكاشير 🏢">موظف استقبال وكاشير 🏢</option>
                <option value="مشرف سنتر 👔">مشرف سنتر 👔</option>
                <option value="خدمة عملاء ومبيعات 🎧">خدمة عملاء ومبيعات 🎧</option>
                <option value="عامل نظافة وضيافة 🧹">عامل نظافة وضيافة 🧹</option>
                <option value="أمن وحراسة 🛡️">أمن وحراسة 🛡️</option>
                <option value="موظف عام 📌">موظف عام 📌</option>
              </select>
            </div>

            <Input
              label="تاريخ التعيين"
              type="date"
              value={form.hireDate}
              onChange={e => setForm({ ...form, hireDate: e.target.value })}
            />
          </div>

          {/* Salary & Salary Type */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input
              label="الراتب الأساسي (ج.م)"
              type="number"
              value={form.salary}
              onChange={e => setForm({ ...form, salary: e.target.value })}
              placeholder="مثال: 4500"
              required
            />
            <div>
              <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                نظام احتساب الراتب:
              </label>
              <select
                value={form.salaryType}
                onChange={e => setForm({ ...form, salaryType: e.target.value })}
                style={{
                  width: '100%',
                  background: 'rgba(2, 6, 23, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: 10,
                  padding: '9px 12px',
                  color: '#ffffff',
                  fontSize: 13,
                  fontFamily: 'Cairo, sans-serif'
                }}
              >
                <option value="fixed_monthly">راتب شهري ثابت</option>
                <option value="daily_hourly">يومي بحسب أيام وساعات الحضور</option>
              </select>
            </div>
          </div>

          {/* Status & Notes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                حالة الموظف:
              </label>
              <select
                value={form.status}
                onChange={e => setForm({ ...form, status: e.target.value })}
                style={{
                  width: '100%',
                  background: 'rgba(2, 6, 23, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: 10,
                  padding: '9px 12px',
                  color: '#ffffff',
                  fontSize: 13,
                  fontFamily: 'Cairo, sans-serif'
                }}
              >
                <option value="active">🟢 على رأس العمل (نشط)</option>
                <option value="inactive">🔴 إجازة أو متوقف</option>
              </select>
            </div>

            <Input
              label="ملاحظات إضافية"
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              placeholder="أي ملاحظات خاصة بالموظف..."
            />
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <Button type="button" variant="outline" onClick={() => setModal(false)} disabled={loading}>
              إلغاء
            </Button>
            <Button type="submit" variant="primary" disabled={loading} style={{ minWidth: 120 }}>
              {loading ? 'جاري الحفظ...' : (editEmp ? 'حفظ التعديلات' : 'إضافة الموظف')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* QUICK CREATE SYSTEM USER MODAL */}
      <Modal
        open={quickUserModal}
        onClose={() => !quickUserLoading && setQuickUserModal(false)}
        title={`إنشاء حساب نظام للموظف: ${targetEmpForUser?.name || ''}`}
      >
        <form onSubmit={handleCreateQuickUser} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {quickUserError && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: 10,
              padding: '10px 14px',
              color: '#fca5a5',
              fontSize: 12.5
            }}>
              {quickUserError}
            </div>
          )}

          <p style={{ color: '#cbd5e1', fontSize: 13, margin: 0 }}>
            سيتم إنشاء حساب مستخدم للنظام مربوط بالموظف <strong>{targetEmpForUser?.name}</strong> لتمكينه من تسجيل الدخول:
          </p>

          <Input
            label="اسم المستخدم للدخول (Username)"
            value={quickUserForm.username}
            onChange={e => setQuickUserForm({ ...quickUserForm, username: e.target.value })}
            placeholder="اسم الدخول بالإنجليزية أو الأرقام"
            required
            autoComplete="off"
            style={{ direction: 'ltr', textAlign: 'left' }}
          />

          <Input
            label="كلمة المرور (Password)"
            type="password"
            value={quickUserForm.password}
            onChange={e => setQuickUserForm({ ...quickUserForm, password: e.target.value })}
            placeholder="أدخل كلمة مرور قوية"
            required
            autoComplete="new-password"
          />

          <div>
            <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              الصلاحية المطلوبة:
            </label>
            <select
              value={quickUserForm.role}
              onChange={e => setQuickUserForm({ ...quickUserForm, role: e.target.value })}
              style={{
                width: '100%',
                background: 'rgba(2, 6, 23, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: 10,
                padding: '9px 12px',
                color: '#ffffff',
                fontSize: 13,
                fontFamily: 'Cairo, sans-serif'
              }}
            >
              <option value="employee">🏢 استقبال وكاشير مساحة العمل</option>
              <option value="cafe">☕ كافيه وباريستا (POS الكافيه)</option>
              <option value="manager">👔 مشرف فرع</option>
              <option value="admin">👑 مدير عام (Admin)</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <Button type="button" variant="outline" onClick={() => setQuickUserModal(false)} disabled={quickUserLoading}>
              إلغاء
            </Button>
            <Button type="submit" variant="primary" disabled={quickUserLoading} style={{ minWidth: 130 }}>
              {quickUserLoading ? 'جاري الإنشاء...' : 'إنشاء وتفعيل الحساب'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Shift Handover Modal */}
      {handoverShift && (
        <ShiftHandoverModal
          open={!!handoverShift}
          onClose={() => setHandoverShift(null)}
          shift={handoverShift}
          mode="close"
          payments={payments}
          tickets={tickets}
          clients={clients}
          systemInfo={settings}
          onConfirm={async (shiftId, payload) => {
            await closeShift(shiftId, payload);
            setHandoverShift(null);
          }}
        />
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteId}
        title="حذف الموظف"
        message="هل أنت متأكد من حذف هذا الموظف من قائمة الكادر؟ لن يتم حذف أي مبيعات أو سندات سابقة مسجلة باسمه."
        onConfirm={async () => { await deleteEmployee(deleteId); setDeleteId(null); }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
