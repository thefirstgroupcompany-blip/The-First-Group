import React, { useState, useEffect } from 'react';
import {
  getSystemUsers, addSystemUser, updateSystemUser, deleteSystemUser,
  toggleSystemUserStatus, getEmployees
} from '../../../services/db';
import { Card, Button, Input, Select, Modal, ConfirmDialog, EmptyState, Badge, Spinner } from '../../../components/ui';
import {
  ShieldCheck, UserPlus, KeyRound, User, Lock, Phone,
  CheckCircle2, XCircle, Search, Sparkles, AlertCircle,
  Briefcase, Coffee, Building2, Crown, ShieldAlert, Link as LinkIcon
} from 'lucide-react';

const ROLE_DEFINITIONS = {
  admin: {
    id: 'admin',
    nameAr: 'مدير عام',
    desc: 'صلاحيات كاملة للوحة التحكم والماليات والإعدادات',
    icon: Crown,
    badgeColor: 'amber',
    bgLight: 'rgba(245, 158, 11, 0.15)',
    borderColor: 'rgba(245, 158, 11, 0.4)',
    textColor: '#f59e0b'
  },
  employee: {
    id: 'employee',
    nameAr: 'استقبال وكاشير',
    desc: 'إدارة العملاء، جلسات العمل، التذاكر، وسندات القبض',
    icon: Building2,
    badgeColor: 'blue',
    bgLight: 'rgba(56, 189, 248, 0.15)',
    borderColor: 'rgba(56, 189, 248, 0.4)',
    textColor: '#38bdf8'
  },
  cafe: {
    id: 'cafe',
    nameAr: 'كافيه وباريستا',
    desc: 'نظام نقاط بيع الكافيه POS ومتابعة طلبات المشروبات',
    icon: Coffee,
    badgeColor: 'emerald',
    bgLight: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.4)',
    textColor: '#34d399'
  },
  manager: {
    id: 'manager',
    nameAr: 'مشرف فرع',
    desc: 'متابعة العمليات اليومية والشفتات والتقارير الميدانية',
    icon: Briefcase,
    badgeColor: 'purple',
    bgLight: 'rgba(168, 85, 247, 0.15)',
    borderColor: 'rgba(168, 85, 247, 0.4)',
    textColor: '#c084fc'
  }
};

export default function SystemUsersTab() {
  const [users, setUsers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Add/Edit Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState({
    username: '',
    name: '',
    password: '',
    role: 'employee',
    status: 'active',
    linkedEmployeeId: '',
    phone: ''
  });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');

  // Change Password Modal
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [pwdTargetUser, setPwdTargetUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState('');

  // Delete Dialog
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    const unsubUsers = getSystemUsers((list) => {
      setUsers(list);
      setLoading(false);
    });
    const unsubEmps = getEmployees(setEmployees);

    return () => {
      unsubUsers && unsubUsers();
      unsubEmps && unsubEmps();
    };
  }, []);

  const openAddModal = () => {
    setEditingUser(null);
    setForm({
      username: '',
      name: '',
      password: '',
      role: 'employee',
      status: 'active',
      linkedEmployeeId: '',
      phone: ''
    });
    setFormError('');
    setModalOpen(true);
  };

  const openEditModal = (u) => {
    setEditingUser(u);
    setForm({
      username: u.username || '',
      name: u.name || '',
      password: '',
      role: u.role || 'employee',
      status: u.status || 'active',
      linkedEmployeeId: u.linkedEmployeeId || '',
      phone: u.phone || ''
    });
    setFormError('');
    setModalOpen(true);
  };

  const handleEmployeeSelect = (empId) => {
    if (!empId) {
      setForm(prev => ({ ...prev, linkedEmployeeId: '' }));
      return;
    }
    const emp = employees.find(e => e.id === empId);
    setForm(prev => ({
      ...prev,
      linkedEmployeeId: empId,
      name: prev.name || (emp ? emp.name : ''),
      phone: prev.phone || (emp ? emp.phone : '')
    }));
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    setFormError('');

    const cleanUser = form.username.trim().toLowerCase();
    if (!cleanUser) {
      return setFormError('اسم المستخدم للدخول مطلوب');
    }

    if (!editingUser && !form.password) {
      return setFormError('كلمة المرور مطلوبة لإنشاء مستخدم جديد');
    }

    setFormLoading(true);
    try {
      if (editingUser) {
        const updates = {
          username: cleanUser,
          name: form.name.trim() || cleanUser,
          role: form.role,
          status: form.status,
          linkedEmployeeId: form.linkedEmployeeId || null,
          phone: form.phone.trim()
        };
        if (form.password) {
          updates.password = form.password;
        }
        await updateSystemUser(editingUser.id, updates);
      } else {
        await addSystemUser({
          username: cleanUser,
          name: form.name.trim() || cleanUser,
          password: form.password,
          role: form.role,
          status: form.status,
          linkedEmployeeId: form.linkedEmployeeId || null,
          phone: form.phone.trim()
        });
      }
      setModalOpen(false);
    } catch (err) {
      setFormError(err.message || 'حدث خطأ أثناء حفظ المستخدم');
    } finally {
      setFormLoading(false);
    }
  };

  const openPasswordModal = (u) => {
    setPwdTargetUser(u);
    setNewPassword('');
    setPwdError('');
    setPwdModalOpen(true);
  };

  const handleSavePassword = async (e) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 4) {
      return setPwdError('كلمة المرور يجب أن لا تقل عن 4 خانات');
    }

    setPwdLoading(true);
    setPwdError('');
    try {
      await updateSystemUser(pwdTargetUser.id, { password: newPassword });
      setPwdModalOpen(false);
      alert('✅ تم تحديث كلمة المرور للمستخدم بنجاح');
    } catch (err) {
      setPwdError(err.message || 'حدث خطأ أثناء تحديث كلمة المرور');
    } finally {
      setPwdLoading(false);
    }
  };

  const handleToggleStatus = async (u) => {
    try {
      const next = await toggleSystemUserStatus(u.id, u.status);
      console.log('User status toggled to', next);
    } catch (err) {
      alert('تعذر تغيير حالة الحساب: ' + (err.message || ''));
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTargetId) return;
    setDeleteLoading(true);
    try {
      await deleteSystemUser(deleteTargetId);
      setDeleteTargetId(null);
    } catch (err) {
      alert('تعذر حذف الحساب: ' + (err.message || ''));
    } finally {
      setDeleteLoading(false);
    }
  };

  // Filtered Users
  const filteredUsers = users.filter(u => {
    const q = search.trim().toLowerCase();
    const matchQ = !q ||
      String(u.username || '').toLowerCase().includes(q) ||
      String(u.name || '').toLowerCase().includes(q) ||
      String(u.phone || '').includes(q);

    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    const matchStatus = statusFilter === 'all' || (u.status || 'active') === statusFilter;

    return matchQ && matchRole && matchStatus;
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
        background: 'linear-gradient(135deg, rgba(13, 27, 50, 0.95) 0%, rgba(7, 14, 27, 0.95) 100%)',
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
            background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.25) 0%, rgba(37, 99, 235, 0.25) 100%)',
            border: '1.5px solid rgba(56, 189, 248, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#38bdf8',
            flexShrink: 0
          }}>
            <ShieldCheck size={26} />
          </div>
          <div>
            <h2 style={{ color: '#ffffff', fontSize: 20, fontWeight: 900, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>مستخدمو النظام والصلاحيات</span>
              <span style={{ fontSize: 13, background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', padding: '2px 10px', borderRadius: 20, border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                {users.length} حساب
              </span>
            </h2>
            <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>
              فصل كامل لحسابات الدخول وكلمات المرور عن سجلات الموظفين، مع إمكانية الربط الاختياري وتحديد الأدوار.
            </p>
          </div>
        </div>

        <Button
          onClick={openAddModal}
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
          <span>+ إضافة مستخدم نظام جديد</span>
        </Button>
      </div>

      {/* Search & Filter Bar */}
      <Card style={{ padding: '14px 18px', background: 'rgba(15, 23, 42, 0.65)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Search Box */}
          <div style={{ flex: '1 1 240px', position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ابحث باسم المستخدم، الاسم المعروض، أو الهاتف..."
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

          {/* Role Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>الصلاحية:</span>
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
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
              <option value="all">جميع الصلاحيات</option>
              <option value="admin">👑 مدير عام (Admin)</option>
              <option value="employee">🏢 استقبال وكاشير</option>
              <option value="cafe">☕ كافيه وباريستا</option>
              <option value="manager">👔 مشرف فرع</option>
            </select>
          </div>

          {/* Status Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>الحالة:</span>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
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
              <option value="all">جميع الحالات</option>
              <option value="active">🟢 نشط فقط</option>
              <option value="disabled">🔴 معطل فقط</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Users Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 50 }}>
          <Spinner size="lg" />
          <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 12 }}>جاري تحميل حسابات النظام...</p>
        </div>
      ) : filteredUsers.length === 0 ? (
        <EmptyState
          icon="🛡️"
          message="لا توجد حسابات نظام تطابق معايير البحث"
          action={
            <Button onClick={openAddModal} variant="primary" style={{ marginTop: 12 }}>
              + إضافة أول حساب نظام
            </Button>
          }
        />
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))',
          gap: 16
        }}>
          {filteredUsers.map(u => {
            const roleMeta = ROLE_DEFINITIONS[u.role] || ROLE_DEFINITIONS.employee;
            const RoleIcon = roleMeta.icon;
            const isDisabled = u.status === 'disabled';
            const linkedEmp = employees.find(e => e.id === u.linkedEmployeeId || e.memberId === u.username);

            return (
              <Card
                key={u.id}
                style={{
                  background: isDisabled ? 'rgba(15, 23, 42, 0.4)' : 'rgba(15, 23, 42, 0.8)',
                  border: isDisabled ? '1px dashed rgba(239, 68, 68, 0.35)' : `1px solid ${roleMeta.borderColor}`,
                  borderRadius: 16,
                  padding: '18px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 14,
                  opacity: isDisabled ? 0.75 : 1,
                  transition: 'all 0.2s ease',
                  position: 'relative'
                }}
              >
                {/* Top Row: User & Role Info */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        background: roleMeta.bgLight,
                        border: `1px solid ${roleMeta.borderColor}`,
                        color: roleMeta.textColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <RoleIcon size={22} />
                      </div>
                      <div>
                        <h3 style={{ margin: 0, color: '#ffffff', fontWeight: 800, fontSize: 16 }}>
                          {u.name || u.username}
                        </h3>
                        <div style={{
                          color: '#38bdf8',
                          fontSize: 12,
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          marginTop: 2,
                          direction: 'ltr',
                          textAlign: 'right'
                        }}>
                          @{u.username}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <Badge color={roleMeta.badgeColor}>
                        {roleMeta.nameAr}
                      </Badge>
                      {isDisabled ? (
                        <span style={{ fontSize: 10.5, color: '#f87171', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
                          <XCircle size={10} /> معطل
                        </span>
                      ) : (
                        <span style={{ fontSize: 10.5, color: '#34d399', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
                          <CheckCircle2 size={10} /> نشط
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Linked Employee Info */}
                  <div style={{
                    marginTop: 14,
                    padding: '8px 12px',
                    borderRadius: 10,
                    background: linkedEmp ? 'rgba(56, 189, 248, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                    border: `1px solid ${linkedEmp ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.07)'}`,
                    fontSize: 12
                  }}>
                    {linkedEmp ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ color: '#93c5fd', display: 'flex', alignItems: 'center', gap: 5 }}>
                          <LinkIcon size={12} /> مرتبط بالموظف:
                        </span>
                        <strong style={{ color: '#ffffff', fontWeight: 800 }}>
                          {linkedEmp.name} ({linkedEmp.jobTitle || 'موظف'})
                        </strong>
                      </div>
                    ) : (
                      <div style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span>🌐</span>
                        <span>حساب عام للمكان (غير مربوط بموظف محدد)</span>
                      </div>
                    )}
                  </div>

                  {/* Optional Phone / Details */}
                  {u.phone && (
                    <div style={{ marginTop: 8, fontSize: 11.5, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Phone size={11} />
                      <span style={{ direction: 'ltr' }}>{u.phone}</span>
                    </div>
                  )}
                </div>

                {/* Bottom Action Buttons */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                  paddingTop: 12,
                  flexWrap: 'wrap'
                }}>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openPasswordModal(u)}
                    style={{ flex: 1, minWidth: 100, fontSize: 11.5, gap: 4, padding: '5px 8px' }}
                    title="تغيير كلمة المرور"
                  >
                    <KeyRound size={12} />
                    <span>كلمة المرور</span>
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEditModal(u)}
                    style={{ flex: 1, minWidth: 60, fontSize: 11.5, padding: '5px 8px' }}
                  >
                    تعديل
                  </Button>

                  <Button
                    size="sm"
                    variant={isDisabled ? 'success' : 'warning'}
                    onClick={() => handleToggleStatus(u)}
                    style={{ minWidth: 65, fontSize: 11.5, padding: '5px 8px' }}
                    title={isDisabled ? 'إعادة تفعيل الحساب' : 'تعطيل الحساب مؤقتاً'}
                  >
                    {isDisabled ? 'تفعيل' : 'تعطيل'}
                  </Button>

                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => setDeleteTargetId(u.id)}
                    style={{ minWidth: 40, fontSize: 11.5, padding: '5px 8px' }}
                    title="حذف الحساب"
                  >
                    حذف
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ADD / EDIT SYSTEM USER MODAL */}
      <Modal
        open={modalOpen}
        onClose={() => !formLoading && setModalOpen(false)}
        title={editingUser ? `تعديل حساب المستخدم: @${editingUser.username}` : 'إضافة حساب مستخدم جديد للنظام'}
      >
        <form onSubmit={handleSaveUser} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {formError && (
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
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{formError}</span>
            </div>
          )}

          {/* Username */}
          <Input
            label="اسم المستخدم للدخول (Username)"
            value={form.username}
            onChange={e => setForm({ ...form, username: e.target.value })}
            placeholder="مثال: cashier1 أو ahmed_admin"
            required
            autoComplete="off"
            style={{ direction: 'ltr', textAlign: 'left' }}
          />

          {/* Display Name */}
          <Input
            label="الاسم المعروض (Display Name)"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="مثال: كاشير الاستقبال 1 أو أحمد حسن"
            required
          />

          {/* Password (Required on add, optional on edit) */}
          <Input
            label={editingUser ? 'كلمة المرور (اتركها فارغة إذا كنت لا ترغب بتغييرها)' : 'كلمة المرور (Password)'}
            type="password"
            value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
            placeholder={editingUser ? '••••••••' : 'أدخل كلمة مرور قوية للحساب'}
            required={!editingUser}
            autoComplete="new-password"
          />

          {/* Role Select */}
          <div>
            <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              الصلاحية والدور في النظام (Role):
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {Object.values(ROLE_DEFINITIONS).map(r => {
                const Icon = r.icon;
                const isSelected = form.role === r.id;
                return (
                  <div
                    key={r.id}
                    onClick={() => setForm({ ...form, role: r.id })}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      background: isSelected ? r.bgLight : 'rgba(2, 6, 23, 0.6)',
                      border: `1.5px solid ${isSelected ? r.textColor : 'rgba(255, 255, 255, 0.1)'}`,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: isSelected ? r.textColor : '#cbd5e1', fontWeight: 800, fontSize: 13 }}>
                      <Icon size={16} />
                      <span>{r.nameAr}</span>
                    </div>
                    <span style={{ fontSize: 10.5, color: '#94a3b8', lineHeight: 1.3 }}>
                      {r.desc}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Link to Employee Option */}
          <div>
            <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              ربط الحساب بموظف في المكان (اختياري):
            </label>
            <select
              value={form.linkedEmployeeId}
              onChange={e => handleEmployeeSelect(e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(2, 6, 23, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: 10,
                padding: '9px 12px',
                color: '#ffffff',
                fontSize: 13,
                fontFamily: 'Cairo, sans-serif',
                outline: 'none'
              }}
            >
              <option value="">-- حساب عام للمكان (غير مرتبط بموظف محدد) --</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} — كود: {emp.memberId || 'بدون كود'} ({emp.jobTitle || 'موظف'})
                </option>
              ))}
            </select>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 11 }}>
              يمكنك ربط الحساب بموظف كاشير أو باريستا لتسهيل تتبع الشفتات والمناوبات.
            </p>
          </div>

          {/* Phone (Optional) */}
          <Input
            label="رقم الهاتف (اختياري)"
            type="tel"
            value={form.phone}
            onChange={e => setForm({ ...form, phone: e.target.value })}
            placeholder="010xxxxxxxx"
          />

          {/* Status */}
          <div>
            <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              حالة الحساب:
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
              <option value="active">🟢 نشط (يمكنه تسجيل الدخول فوراً)</option>
              <option value="disabled">🔴 معطل (ممنوع من تسجيل الدخول)</option>
            </select>
          </div>

          {/* Modal Footer Actions */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalOpen(false)}
              disabled={formLoading}
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={formLoading}
              style={{ minWidth: 120 }}
            >
              {formLoading ? 'جاري الحفظ...' : (editingUser ? 'حفظ التعديلات' : 'إضافة المستخدم')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* CHANGE PASSWORD MODAL */}
      <Modal
        open={pwdModalOpen}
        onClose={() => !pwdLoading && setPwdModalOpen(false)}
        title={`تعيين كلمة مرور جديدة للمستخدم: @${pwdTargetUser?.username || ''}`}
      >
        <form onSubmit={handleSavePassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {pwdError && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: 10,
              padding: '10px 14px',
              color: '#fca5a5',
              fontSize: 12.5
            }}>
              {pwdError}
            </div>
          )}

          <p style={{ color: '#cbd5e1', fontSize: 13, margin: 0 }}>
            قم بكتابة كلمة المرور الجديدة لحساب <strong>{pwdTargetUser?.name || pwdTargetUser?.username}</strong>:
          </p>

          <Input
            label="كلمة المرور الجديدة"
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            placeholder="أدخل 4 خانات على الأقل..."
            required
            autoComplete="new-password"
          />

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPwdModalOpen(false)}
              disabled={pwdLoading}
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={pwdLoading}
              style={{ minWidth: 120 }}
            >
              {pwdLoading ? 'جاري التحديث...' : 'تحديث كلمة المرور'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* CONFIRM DELETE DIALOG */}
      <ConfirmDialog
        open={!!deleteTargetId}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={handleDeleteConfirm}
        title="حذف حساب مستخدم النظام"
        message="هل أنت متأكد من حذف هذا الحساب؟ لن يتمكن صاحب الحساب من تسجيل الدخول للنظام بعد الآن. (لن تتأثر بيانات الموظف في المكان إن كان مرتبطاً به)."
        confirmText={deleteLoading ? 'جاري الحذف...' : 'نعم، احذف الحساب'}
        confirmVariant="danger"
      />
    </div>
  );
}
