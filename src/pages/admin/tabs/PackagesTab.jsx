import React, { useState, useEffect } from 'react';
import { getPackages, addPackage, updatePackage, deletePackage, getInstructors } from '../../../services/db';
import { Card, Button, Input, Modal, ConfirmDialog, EmptyState, Badge, Select } from '../../../components/ui';
import { formatCurrency } from '../../../utils/constants';

export default function PackagesTab({ onNavigateTab }) {
  const [packages, setPackages] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [modal, setModal] = useState(false);
  const [editPkg, setEditPkg] = useState(null);
  const [form, setForm] = useState({
    name: '', type: 'sessions', price: '', sessions: '', totalHours: '', durationDays: '30',
    instructorId: '', instructorName: '', instructorShareType: 'percentage', instructorShareValue: ''
  });
  const [deleteId, setDeleteId] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsubP = getPackages(setPackages);
    const unsubI = getInstructors(setInstructors);
    return () => { unsubP(); unsubI(); };
  }, []);

  const openAdd = () => {
    setEditPkg(null);
    setForm({
      name: '', type: 'sessions', price: '', sessions: '', totalHours: '', durationDays: '30',
      instructorName: '', instructorShareType: 'percentage', instructorShareValue: ''
    });
    setModal(true);
  };

  const openEdit = (pkg) => {
    setEditPkg(pkg);
    setForm({
      name: pkg.name,
      type: pkg.type || (pkg.totalHours ? 'workspace' : 'sessions'),
      price: pkg.price,
      sessions: pkg.sessions || '',
      totalHours: pkg.totalHours || pkg.sessions || '',
      durationDays: pkg.durationDays !== undefined && pkg.durationDays !== '' ? String(pkg.durationDays) : '30',
      instructorName: pkg.instructorName || '',
      instructorShareType: pkg.instructorShareType || 'percentage',
      instructorShareValue: pkg.instructorShareValue || ''
    });
    setModal(true);
  };

  const handleTeacherSelect = (teacherName) => {
    const found = instructors.find(i => i.name === teacherName);
    if (found) {
      setForm(prev => ({
        ...prev,
        instructorName: found.name,
        instructorShareType: found.defaultShareType || prev.instructorShareType || 'percentage',
        instructorShareValue: found.defaultShareValue || prev.instructorShareValue || ''
      }));
    } else {
      setForm(prev => ({ ...prev, instructorName: teacherName }));
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const isWorkspace = form.type === 'workspace';
      const payload = {
        name: form.name,
        type: form.type || 'sessions',
        price: Number(form.price) || 0,
        sessions: !isWorkspace ? (Number(form.sessions) || 0) : 0,
        totalHours: isWorkspace ? (Number(form.totalHours || form.sessions) || 0) : 0,
        durationDays: Number(form.durationDays) || 30, // Default to 30 days
        instructorName: form.instructorName?.trim() || '',
        instructorShareType: form.instructorShareType || 'percentage',
        instructorShareValue: Number(form.instructorShareValue) || 0
      };

      if (editPkg) {
        await updatePackage(editPkg.id, payload);
      } else {
        await addPackage(payload);
      }
      setModal(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ color: '#ffffff', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
            <span>📦</span> باقات الاشتراكات والكورسات ومساحة العمل
          </h2>
          <p style={{ color: '#93c5fd', fontSize: 13, margin: '4px 0 0' }}>
            تعريف أسعار الباقات وربطها بالمدرسين والتحكم في مدة الصلاحية
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {onNavigateTab && (
            <Button
              onClick={() => onNavigateTab('instructors')}
              style={{ background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.4)', color: '#60a5fa', fontWeight: 800 }}
            >
              👨‍🏫 دليل وحسابات المدرسين
            </Button>
          )}
          <Button onClick={openAdd} variant="primary">+ إضافة باقة جديدة</Button>
        </div>
      </div>

      {packages.length === 0 ? <EmptyState icon="📦" message="لا توجد باقات مسجلة بعد" /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {packages.map(pkg => {
            const isWorkspace = pkg.type === 'workspace' || !!pkg.totalHours;
            return (
              <Card key={pkg.id} style={{
                background: 'var(--bg-card)',
                border: isWorkspace ? '1px solid rgba(16,185,129,0.35)' : '1px solid var(--border)',
                display: 'flex', flexDirection: 'column', gap: 12
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <h3 style={{ color: '#ffffff', fontWeight: 700, fontSize: 17, margin: '0 0 4px' }}>{pkg.name}</h3>
                    {isWorkspace ? (
                      <Badge color="green">🏢 مساحة عمل (WORK SPACE)</Badge>
                    ) : (
                      <Badge color="blue">🏷️ باقة حصص / كورس</Badge>
                    )}
                  </div>
                  <div style={{
                    padding: '4px 10px', borderRadius: 8,
                    background: isWorkspace ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.15)',
                    color: isWorkspace ? '#34d399' : '#60a5fa', fontWeight: 800, fontSize: 14
                  }}>
                    {isWorkspace ? `${pkg.totalHours || pkg.sessions} ساعة` : `${pkg.sessions} حصة`}
                  </div>
                </div>

                <div>
                  <p style={{ color: isWorkspace ? '#34d399' : '#60a5fa', fontSize: 24, fontWeight: 800 }}>{formatCurrency(pkg.price)}</p>
                  <p style={{ color: '#93c5fd', fontSize: 13, marginTop: 4 }}>⏳ الصلاحية: {pkg.durationDays || 30} يوم</p>
                </div>

                {pkg.instructorName && (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)',
                    borderRadius: 8, padding: '7px 10px', fontSize: 12
                  }}>
                    <span style={{ color: '#93c5fd', fontWeight: 700 }}>👨‍🏫 المدرس: {pkg.instructorName}</span>
                    <span style={{ color: '#fbbf24', fontWeight: 800 }}>
                      {pkg.instructorShareType === 'percentage' ? `نسبة ${pkg.instructorShareValue}%` : pkg.instructorShareType === 'fixed' ? `${formatCurrency(pkg.instructorShareValue)} / طالب` : ''}
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 'auto', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(pkg)} className="flex-1">تعديل</Button>
                  <Button size="sm" variant="danger" onClick={() => setDeleteId(pkg.id)} className="flex-1">حذف</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add / Edit Package Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editPkg ? 'تعديل الباقة' : 'إضافة باقة جديدة'}>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Select
            label="نوع الباقة"
            value={form.type}
            onChange={e => setForm({ ...form, type: e.target.value })}
            required
          >
            <option value="sessions">🏷️ باقة حصص تدريبية / كورسات (Sessions)</option>
            <option value="workspace">🏢 باقة مساحة عمل (Work Space - بالساعات)</option>
          </Select>

          <Input label="اسم الباقة" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="مثال: كورس فيزياء ثانوية عامة" required />
          <Input label="السعر الإجمالي للاشتراك (ج.م)" type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} required />
          
          {form.type === 'workspace' ? (
            <Input
              label="عدد الساعات المتاحة في الباقة (Hours)"
              type="number"
              value={form.totalHours}
              onChange={e => setForm({ ...form, totalHours: e.target.value, sessions: e.target.value })}
              placeholder="مثال: 50"
              required
            />
          ) : (
            <Input
              label="عدد الحصص (Sessions)"
              type="number"
              value={form.sessions}
              onChange={e => setForm({ ...form, sessions: e.target.value, totalHours: '' })}
              placeholder="مثال: 8"
              required
            />
          )}

          <Input
            label="صلاحية الباقة (بالأيام)"
            type="number"
            value={form.durationDays}
            onChange={e => setForm({ ...form, durationDays: e.target.value })}
            placeholder="30"
            required
          />
          
          {/* Section: Link with Instructor */}
          <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '12px', padding: '14px' }}>
            <h4 style={{ color: '#93c5fd', fontSize: 13, fontWeight: 700, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>👨‍🏫</span> ربط الباقة بمدرس / مدرب وحساب نسبته (اختياري)
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Teacher Selector / Input */}
              {instructors.length > 0 && (
                <Select
                  label="اختر مدرس مسجل مسبقاً (أو اكتب اسماً بالأسفل)"
                  value={form.instructorName || ''}
                  onChange={e => handleTeacherSelect(e.target.value)}
                >
                  <option value="">-- اختر من قائمة المدرسين المسجلين --</option>
                  {instructors.map(inst => (
                    <option key={inst.id} value={inst.name}>
                      👨‍🏫 {inst.name} {inst.subject ? `(${inst.subject})` : ''}
                    </option>
                  ))}
                </Select>
              )}

              <Input
                label="اسم المدرس / المحاضر"
                placeholder="مثال: أ/ أحمد حسن"
                value={form.instructorName || ''}
                onChange={e => setForm({ ...form, instructorName: e.target.value })}
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Select
                  label="نوع نسبة المدرس"
                  value={form.instructorShareType || 'percentage'}
                  onChange={e => setForm({ ...form, instructorShareType: e.target.value })}
                >
                  <option value="percentage">نسبة مئوية (%) من الاشتراك</option>
                  <option value="fixed">مبلغ مالي ثابت (ج.م) لكل طالب</option>
                  <option value="none">بدون نسبة محددة</option>
                </Select>

                {form.instructorShareType !== 'none' && (
                  <Input
                    label={form.instructorShareType === 'percentage' ? 'النسبة المئوية (%)' : 'المبلغ الثابت (ج.م)'}
                    type="number"
                    placeholder={form.instructorShareType === 'percentage' ? 'مثال: 70' : 'مثال: 200'}
                    value={form.instructorShareValue || ''}
                    onChange={e => setForm({ ...form, instructorShareValue: e.target.value })}
                  />
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <Button type="submit" variant="primary" className="flex-1" disabled={loading}>{loading ? 'جاري الحفظ...' : 'حفظ الباقة'}</Button>
            <Button type="button" variant="ghost" className="flex-1" onClick={() => setModal(false)}>إلغاء</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        title="حذف الباقة"
        message="هل أنت متأكد من حذف هذه الباقة؟"
        onConfirm={async () => { await deletePackage(deleteId); setDeleteId(null); }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
