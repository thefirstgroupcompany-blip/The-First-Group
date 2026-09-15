import React, { useState, useEffect, useMemo } from 'react';
import { getLostItems, addLostItem, updateLostItem, deleteLostItem, claimLostItem } from '../../../services/db';
import { Card, StatCard, EmptyState, Button, Input, Modal, Badge, ConfirmDialog } from '../../../components/ui';
import { formatDate, formatDateTime } from '../../../utils/constants';

const LOST_CATEGORIES = [
  'أجهزة وإلكترونيات (لابتوب / تابلت / شاحن)',
  'كتب وملازم وأدوات دراسية',
  'متعلقات شخصية ومحافظ ومفاتيح',
  'ملابس ونظارات',
  'أخرى'
];

export default function LostAndFoundTab() {
  const [items, setItems] = useState([]);
  const [modal, setModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({
    itemName: '', category: 'أجهزة وإلكترونيات (لابتوب / تابلت / شاحن)',
    locationFound: 'قاعة الورك سبيس الرئيسية', foundDate: new Date().toISOString().split('T')[0],
    foundBy: 'الاستقبال', notes: ''
  });

  const [claimModal, setClaimModal] = useState(null);
  const [claimForm, setClaimForm] = useState({ claimedBy: '', claimPhone: '', handoverBy: 'الاستقبال' });

  const [deleteId, setDeleteId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    return getLostItems(setItems);
  }, []);

  const inCustodyCount = useMemo(() => items.filter(i => i.status === 'in_custody').length, [items]);
  const claimedCount = useMemo(() => items.filter(i => i.status === 'claimed').length, [items]);

  const filteredItems = useMemo(() => {
    return items.filter(i => {
      const matchStatus = statusFilter === 'all' || i.status === statusFilter;
      const q = search.trim().toLowerCase();
      const matchSearch = !q ||
        (i.itemName || '').toLowerCase().includes(q) ||
        (i.locationFound || '').toLowerCase().includes(q) ||
        (i.claimedBy || '').toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [items, statusFilter, search]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.itemName) return;
    setLoading(true);
    try {
      if (editItem) {
        await updateLostItem(editItem.id, form);
      } else {
        await addLostItem(form);
      }
      setModal(false);
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async (e) => {
    e.preventDefault();
    if (!claimModal || !claimForm.claimedBy) return;
    setLoading(true);
    try {
      await claimLostItem(claimModal.id, {
        itemName: claimModal.itemName,
        claimedBy: claimForm.claimedBy,
        claimPhone: claimForm.claimPhone,
        handoverBy: claimForm.handoverBy
      });
      setClaimModal(null);
      alert('✅ تم توثيق تسليم الأمانة لصاحبها بنجاح!');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ color: '#ffffff', fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🎒</span> سجل المفقودات والأمانات المعثور عليها (Lost & Found)
          </h2>
          <p style={{ color: '#93c5fd', fontSize: 13, margin: '4px 0 0' }}>
            توثيق المتعلقات المتروكة والأمانات وتسليمها لأصحابها بإجراءات موثقة
          </p>
        </div>

        <Button size="sm" variant="primary" onClick={() => { setEditItem(null); setForm({ itemName: '', category: 'أجهزة وإلكترونيات (لابتوب / تابلت / شاحن)', locationFound: 'قاعة الورك سبيس الرئيسية', foundDate: new Date().toISOString().split('T')[0], foundBy: 'الاستقبال', notes: '' }); setModal(true); }}>
          + تسجيل مفقودات جديدة
        </Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        <StatCard icon="🎒" label="إجمالي الأمانات المسجلة" value={items.length} color="blue" />
        <StatCard icon="🔒" label="أمانات قيد الحفظ بالخزينة" value={inCustodyCount} color={inCustodyCount > 0 ? "amber" : "green"} />
        <StatCard icon="✅" label="أمانات تم تسليمها لأصحابها" value={claimedCount} color="green" />
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 240, maxWidth: 360 }}>
          <Input placeholder="🔍 بحث في المفقودات / المكان / المستلم..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { id: 'all', label: 'الكل' },
            { id: 'in_custody', label: 'قيد الحفظ 🔒' },
            { id: 'claimed', label: 'تم التسليم ✅' }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              style={{
                padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                background: statusFilter === f.id ? 'linear-gradient(135deg, #1d4ed8, #3b82f6)' : 'var(--bg-surface)',
                color: statusFilter === f.id ? '#ffffff' : '#94a3b8'
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filteredItems.length === 0 ? <EmptyState icon="🎒" message="لا توجد أمانات أو مفقودات مسجلة مطابقة" /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 16 }}>
          {filteredItems.map(item => {
            const isClaimed = item.status === 'claimed';
            return (
              <Card key={item.id} style={{ background: 'var(--bg-card)', border: isClaimed ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(245, 158, 11, 0.35)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ color: '#ffffff', fontWeight: 800, fontSize: 16, margin: 0 }}>{item.itemName}</h3>
                    <p style={{ color: '#93c5fd', fontSize: 12, margin: '2px 0 0' }}>🏷️ {item.category}</p>
                  </div>
                  <Badge color={isClaimed ? "green" : "amber"}>
                    {isClaimed ? "تم التسليم ✅" : "قيد الحفظ 🔒"}
                  </Badge>
                </div>

                <p style={{ color: '#cbd5e1', fontSize: 13, margin: 0 }}>📍 مكان العثور: <strong>{item.locationFound}</strong></p>
                <p style={{ color: '#94a3b8', fontSize: 12, margin: 0 }}>📅 تاريخ العثور: {item.foundDate || '—'} (بواسطة: {item.foundBy})</p>

                {isClaimed && (
                  <div style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: 8, padding: '8px 10px', fontSize: 12, color: '#a7f3d0' }}>
                    <div>👤 المستلم: <strong>{item.claimedBy}</strong> {item.claimPhone ? ("(" + item.claimPhone + ")") : ''}</div>
                    <div style={{ fontSize: 11, color: '#6ee7b7', marginTop: 2 }}>سلمت بواسطة: {item.handoverBy || 'الاستقبال'}</div>
                  </div>
                )}

                {item.notes && <p style={{ color: '#94a3b8', fontSize: 12, margin: 0, fontStyle: 'italic' }}>📝 {item.notes}</p>}

                <div style={{ display: 'flex', gap: 6, marginTop: 'auto', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  {!isClaimed && (
                    <Button size="sm" variant="success" onClick={() => { setClaimModal(item); setClaimForm({ claimedBy: '', claimPhone: '', handoverBy: 'الاستقبال' }); }} style={{ flex: 1 }}>
                      🤝 تسليم لصاحبها
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => { setEditItem(item); setForm(item); setModal(true); }}>تعديل</Button>
                  <Button size="sm" variant="danger" onClick={() => setDeleteId(item.id)}>حذف</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editItem ? 'تعديل بيانات المفقودات' : 'تسجيل مفقودات / أمانات جديدة'}>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Input label="وصف الأمانة / الشيء المعثور عليه" value={form.itemName} onChange={e => setForm({ ...form, itemName: e.target.value })} placeholder="مثال: لابتوب ديل أسود + شاحن" required />
          <div>
            <label style={{ display: 'block', color: '#c8dcf5', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>التصنيف:</label>
            <select
              value={form.category}
              onChange={e => setForm({ ...form, category: e.target.value })}
              style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', color: '#fff' }}
            >
              {LOST_CATEGORIES.map(c => <option key={c} value={c} style={{ background: '#0a162b', color: '#fff' }}>{c}</option>)}
            </select>
          </div>
          <Input label="مكان العثور عليها" value={form.locationFound} onChange={e => setForm({ ...form, locationFound: e.target.value })} placeholder="مثال: قاعة 2 ترابيزة رقم 4" required />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Input label="تاريخ العثور" type="date" value={form.foundDate} onChange={e => setForm({ ...form, foundDate: e.target.value })} required />
            <Input label="اسم من عثر عليها / الموظف" value={form.foundBy} onChange={e => setForm({ ...form, foundBy: e.target.value })} />
          </div>
          <Input label="ملاحظات وعلامات مميزة" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="مثال: يوجد استيكر أزرق على الغطاء..." />

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <Button type="button" variant="ghost" onClick={() => setModal(false)}>إلغاء</Button>
            <Button type="submit" variant="primary" disabled={loading}>حفظ وتوثيق الأمانة</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!claimModal} onClose={() => setClaimModal(null)} title={claimModal ? ("تسليم الأمانة: " + claimModal.itemName) : ""}>
        {claimModal && (
          <form onSubmit={handleClaim} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Input label="اسم صاحب الأمانة / المستلم" value={claimForm.claimedBy} onChange={e => setClaimForm({ ...claimForm, claimedBy: e.target.value })} placeholder="الاسم ثلاثي" required />
            <Input label="رقم هاتف المستلم" value={claimForm.claimPhone} onChange={e => setClaimForm({ ...claimForm, claimPhone: e.target.value })} placeholder="01xxxxxxxxx" required />
            <Input label="اسم موظف الاستقبال المسلم للأمانة" value={claimForm.handoverBy} onChange={e => setClaimForm({ ...claimForm, handoverBy: e.target.value })} required />

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
              <Button type="button" variant="ghost" onClick={() => setClaimModal(null)}>إلغاء</Button>
              <Button type="submit" variant="success" disabled={loading}>✅ تأكيد التسليم وإغلاق السجل</Button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={async () => { await deleteLostItem(deleteId); setDeleteId(null); }}
        title="حذف سجل أمانة"
        message="هل أنت متأكد من حذف هذا السجل نهائياً؟"
      />
    </div>
  );
}
