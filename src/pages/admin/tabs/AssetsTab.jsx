import React, { useState, useEffect, useMemo } from 'react';
import { getAssets, addAsset, updateAsset, deleteAsset, addAssetMaintenanceRecord, getAllShifts } from '../../../services/db';
import { Card, Button, Input, Modal, Badge, EmptyState } from '../../../components/ui';
import { formatCurrency, formatDate } from '../../../utils/constants';
import { exportToExcel } from '../../../utils/excelExport';

const CATEGORIES = [
  { value: 'all', label: 'الكل' },
  { value: 'ac', label: '❄️ تكييفات وتبريد' },
  { value: 'screens', label: '🖥️ شاشات وبروجيكتور' },
  { value: 'computers', label: '💻 أجهزة كمبيوتر ولابتوب' },
  { value: 'furniture', label: '🪑 أثاث وكراسي ومكاتب' },
  { value: 'network', label: '🌐 شبكات ورواتر وإنترنت' },
  { value: 'sound', label: '🔊 ساوند سيستم ومايكات' },
  { value: 'cafeteria', label: '☕ بوفيه وأجهزة ضيافة' },
  { value: 'other', label: '📦 تجهيزات أخرى' },
];

export default function AssetsTab() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [shifts, setShifts] = useState([]);

  // Add / Edit Asset Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editAsset, setEditAsset] = useState(null);
  const [form, setForm] = useState({
    name: '',
    category: 'ac',
    room: 'قاعة 1',
    cost: '',
    purchaseDate: new Date().toISOString().split('T')[0],
    warrantyExpiry: '',
    status: 'active',
    serialNo: '',
    notes: ''
  });
  const [saveLoading, setSaveLoading] = useState(false);

  // Maintenance Modal
  const [maintModalOpen, setMaintModalOpen] = useState(false);
  const [maintAsset, setMaintAsset] = useState(null);
  const [maintForm, setMaintForm] = useState({
    cost: '',
    technician: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    status: 'active',
    deductExpense: true
  });
  const [maintLoading, setMaintLoading] = useState(false);
  const [maintShiftId, setMaintShiftId] = useState('');

  useEffect(() => {
    const unsub = getAssets(data => {
      setAssets(data);
      setLoading(false);
    });
    const unsubS = getAllShifts(setShifts);
    return () => { unsub(); unsubS(); };
  }, []);

  // Filtered Assets
  const filtered = useMemo(() => {
    return assets.filter(a => {
      const matchCat = selectedCat === 'all' || a.category === selectedCat;
      const matchStatus = statusFilter === 'all' || a.status === statusFilter;
      const q = search.trim().toLowerCase();
      const matchSearch = !q ||
        (a.name || '').toLowerCase().includes(q) ||
        (a.room || '').toLowerCase().includes(q) ||
        (a.serialNo || '').toLowerCase().includes(q);
      return matchCat && matchStatus && matchSearch;
    });
  }, [assets, selectedCat, statusFilter, search]);

  // Financial & Operational Metrics
  const totalInvestedValue = useMemo(() => assets.reduce((sum, a) => sum + (Number(a.cost) || 0), 0), [assets]);
  const activeCount = useMemo(() => assets.filter(a => a.status === 'active').length, [assets]);
  const maintenanceCount = useMemo(() => assets.filter(a => a.status === 'maintenance').length, [assets]);
  const openShifts = useMemo(() => shifts.filter(s => s.status === 'open'), [shifts]);

  // Open Create Modal
  const openCreate = () => {
    setEditAsset(null);
    setForm({
      name: '',
      category: 'ac',
      room: 'قاعة 1',
      cost: '',
      purchaseDate: new Date().toISOString().split('T')[0],
      warrantyExpiry: '',
      status: 'active',
      serialNo: '',
      notes: ''
    });
    setModalOpen(true);
  };

  // Open Edit Modal
  const openEdit = (asset) => {
    setEditAsset(asset);
    setForm({
      name: asset.name || '',
      category: asset.category || 'ac',
      room: asset.room || 'قاعة 1',
      cost: asset.cost !== undefined ? String(asset.cost) : '',
      purchaseDate: asset.purchaseDate || '',
      warrantyExpiry: asset.warrantyExpiry || '',
      status: asset.status || 'active',
      serialNo: asset.serialNo || '',
      notes: asset.notes || ''
    });
    setModalOpen(true);
  };

  // Open Maintenance Modal
  const openMaintenance = (asset) => {
    setMaintAsset(asset);
    setMaintShiftId('');
    setMaintForm({
      cost: '',
      technician: '',
      description: '',
      date: new Date().toISOString().split('T')[0],
      status: asset.status || 'active',
      deductExpense: true
    });
    setMaintModalOpen(true);
  };

  // Save Asset (Add or Edit)
  const handleSaveAsset = async (e) => {
    e.preventDefault();
    if (saveLoading) return;
    if (!form.name.trim()) return alert('يرجى كتابة اسم الأصل أو المعدة');
    setSaveLoading(true);
    try {
      if (editAsset) {
        await updateAsset(editAsset.id, form);
      } else {
        await addAsset(form);
      }
      setModalOpen(false);
    } catch (err) {
      alert('حدث خطأ أثناء حفظ الأصل: ' + err.message);
    } finally {
      setSaveLoading(false);
    }
  };

  // Save Maintenance Record
  const handleSaveMaintenance = async (e) => {
    e.preventDefault();
    if (maintLoading) return;
    if (!maintAsset) return;
    setMaintLoading(true);
    try {
      await addAssetMaintenanceRecord(maintAsset.id, maintForm, maintShiftId || null, null, maintForm.deductExpense);
      setMaintModalOpen(false);
      alert('✅ تم تسجيل وتوثيق الصيانة للأصل بنجاح!');
    } catch (err) {
      alert('حدث خطأ: ' + err.message);
    } finally {
      setMaintLoading(false);
    }
  };

  // Delete Asset
  const handleDelete = async (asset) => {
    if (saveLoading) return;
    if (!window.confirm(`هل أنت متأكد من حذف الأصل (${asset.name}) نهائياً من النظام؟`)) return;
    setSaveLoading(true);
    try {
      await deleteAsset(asset.id, asset.name);
    } catch (err) {
      alert('حدث خطأ أثناء الحذف: ' + err.message);
    } finally {
      setSaveLoading(false);
    }
  };

  // Export to Excel
  const handleExportExcel = () => {
    const headers = ['#', 'اسم الأصل / المعدة', 'التصنيف', 'المكان / الغرفة', 'تكلفة الشراء (ج.م)', 'تاريخ الشراء', 'انتهاء الضمان', 'الرقم التسلسلي S/N', 'الحالة', 'ملاحظات'];
    const rows = filtered.map((a, idx) => [
      idx + 1,
      a.name || '—',
      CATEGORIES.find(c => c.value === a.category)?.label || a.category,
      a.room || '—',
      Number(a.cost) || 0,
      a.purchaseDate || '—',
      a.warrantyExpiry || '—',
      a.serialNo || '—',
      a.status === 'active' ? 'ممتاز ويعمل' : a.status === 'maintenance' ? 'تحت الصيانة' : 'تالف / مستهلك',
      a.notes || '—'
    ]);
    exportToExcel({
      filename: 'سجل_أصول_ومعدات_THE_FIRST_GROUP',
      sheets: [{ title: 'الأصول والمعدات', headers, rows }]
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, fontFamily: 'Cairo, sans-serif' }}>
      
      {/* Top Banner & Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#ffffff' }}>
            🏢 إدارة الأصول ومعدات المركز (Asset Management)
          </h2>
          <p style={{ margin: '4px 0 0', color: '#93c5fd', fontSize: 13 }}>
            حصر وتوثيق شامل لأجهزة التكييف، الشاشات، الأثاث، ومتابعة الصيانة والضمان
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" onClick={handleExportExcel} style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
            📊 تصدير Excel
          </Button>
          <Button variant="primary" onClick={openCreate} style={{ boxShadow: '0 4px 16px rgba(37,99,235,0.4)' }}>
            ➕ إضافة أصل / جهاز جديد
          </Button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <Card style={{ background: 'rgba(15, 23, 42, 0.85)', border: '1px solid rgba(59, 130, 246, 0.3)', textAlign: 'center', padding: 16 }}>
          <span style={{ color: '#93c5fd', fontSize: 12, fontWeight: 700 }}>🖥️ إجمالي عدد الأصول</span>
          <strong style={{ color: '#ffffff', fontSize: 24, fontWeight: 900, display: 'block', marginTop: 4 }}>{assets.length} أصل</strong>
        </Card>

        <Card style={{ background: 'rgba(15, 23, 42, 0.85)', border: '1px solid rgba(16, 185, 129, 0.3)', textAlign: 'center', padding: 16 }}>
          <span style={{ color: '#a7f3d0', fontSize: 12, fontWeight: 700 }}>💰 إجمالي القيمة الاستثمارية</span>
          <strong style={{ color: '#34d399', fontSize: 24, fontWeight: 900, display: 'block', marginTop: 4 }}>{formatCurrency(totalInvestedValue)}</strong>
        </Card>

        <Card style={{ background: 'rgba(15, 23, 42, 0.85)', border: '1px solid rgba(59, 130, 246, 0.3)', textAlign: 'center', padding: 16 }}>
          <span style={{ color: '#93c5fd', fontSize: 12, fontWeight: 700 }}>🟢 أصول تعمل بكفاءة</span>
          <strong style={{ color: '#60a5fa', fontSize: 24, fontWeight: 900, display: 'block', marginTop: 4 }}>{activeCount}</strong>
        </Card>

        <Card style={{ background: 'rgba(15, 23, 42, 0.85)', border: maintenanceCount > 0 ? '1px solid rgba(245, 158, 11, 0.5)' : '1px solid rgba(255,255,255,0.08)', textAlign: 'center', padding: 16 }}>
          <span style={{ color: maintenanceCount > 0 ? '#fcd34d' : '#94a3b8', fontSize: 12, fontWeight: 700 }}>⚠️ تحت الصيانة والإصلاح</span>
          <strong style={{ color: maintenanceCount > 0 ? '#fbbf24' : '#ffffff', fontSize: 24, fontWeight: 900, display: 'block', marginTop: 4 }}>{maintenanceCount}</strong>
        </Card>
      </div>

      {/* Filters Bar */}
      <Card style={{ background: 'rgba(15, 23, 42, 0.75)', border: '1px solid rgba(255,255,255,0.08)', padding: 14 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <Input
              placeholder="🔍 بحث باسم الأصل، الغرفة، أو الرقم التسلسلي S/N..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <select
            value={selectedCat}
            onChange={e => setSelectedCat(e.target.value)}
            style={{
              background: 'rgba(7, 17, 31, 0.9)', border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: 10, padding: '10px 12px', color: '#ffffff', fontSize: 13, fontFamily: 'Cairo, sans-serif'
            }}
          >
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{
              background: 'rgba(7, 17, 31, 0.9)', border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: 10, padding: '10px 12px', color: '#ffffff', fontSize: 13, fontFamily: 'Cairo, sans-serif'
            }}
          >
            <option value="all">جميع الحالات</option>
            <option value="active">🟢 ممتاز ويعمل</option>
            <option value="maintenance">⚠️ يحتاج صيانة</option>
            <option value="retired">🔴 تالف / خارج الخدمة</option>
          </select>
        </div>
      </Card>

      {/* Assets Grid */}
      {filtered.length === 0 ? (
        <EmptyState icon="🖥️" message="لا توجد أصول مطابقة للبحث" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {filtered.map(asset => {
            const catObj = CATEGORIES.find(c => c.value === asset.category);
            return (
              <Card key={asset.id} style={{
                background: 'rgba(15, 23, 42, 0.85)',
                border: asset.status === 'maintenance' ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(59, 130, 246, 0.25)',
                borderRadius: 16,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 12
              }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: '#ffffff' }}>
                      {asset.name}
                    </h3>
                    <Badge color={asset.status === 'active' ? 'green' : asset.status === 'maintenance' ? 'amber' : 'red'}>
                      {asset.status === 'active' ? 'يعمل' : asset.status === 'maintenance' ? 'صيانة' : 'تالف'}
                    </Badge>
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                    <Badge color="blue">{catObj?.label || asset.category}</Badge>
                    <Badge color="purple">📍 {asset.room || 'غير محدد'}</Badge>
                  </div>

                  <div style={{ background: 'rgba(7, 17, 31, 0.7)', borderRadius: 10, padding: '10px 12px', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>تكلفة الشراء:</span>
                      <strong style={{ color: '#34d399' }}>{formatCurrency(asset.cost || 0)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>تاريخ الشراء:</span>
                      <span style={{ color: '#cbd5e1' }}>{asset.purchaseDate || '—'}</span>
                    </div>
                    {asset.warrantyExpiry && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#94a3b8' }}>الضمان حتى:</span>
                        <span style={{ color: '#60a5fa' }}>{asset.warrantyExpiry}</span>
                      </div>
                    )}
                    {asset.serialNo && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#94a3b8' }}>S/N:</span>
                        <span style={{ color: '#93c5fd', fontFamily: 'monospace' }}>{asset.serialNo}</span>
                      </div>
                    )}
                  </div>

                  {asset.notes && (
                    <p style={{ margin: '8px 0 0', fontSize: 11, color: '#94a3b8' }}>
                      📝 {asset.notes}
                    </p>
                  )}

                  {asset.maintenanceLog && asset.maintenanceLog.length > 0 && (
                    <div style={{ marginTop: 8, fontSize: 11, color: '#fbbf24', background: 'rgba(245,158,11,0.1)', padding: '4px 8px', borderRadius: 6 }}>
                      🔧 آخر صيانة: {asset.maintenanceLog[0].date} ({formatCurrency(asset.maintenanceLog[0].cost)})
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
                  <Button size="sm" variant="ghost" onClick={() => openMaintenance(asset)} style={{ flex: 1, fontSize: 11, background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)' }}>
                    🔧 صيانة
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(asset)} style={{ padding: '4px 8px', fontSize: 11 }}>
                    ✏️
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => handleDelete(asset)} style={{ padding: '4px 8px', fontSize: 11 }}>
                    🗑️
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add / Edit Asset Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editAsset ? '✏️ تعديل بيانات الأصل / المعدة' : '➕ إضافة أصل أو جهاز جديد للمركز'}>
        <form onSubmit={handleSaveAsset} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              اسم الأصل / الجهاز:
            </label>
            <Input
              placeholder="مثال: تكييف شارب 3 حصان سبليت"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              required
              autoFocus
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>التصنيف:</label>
              <select
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
                style={{ width: '100%', background: 'rgba(7, 17, 31, 0.9)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 10, padding: '10px', color: '#fff', fontSize: 13, fontFamily: 'Cairo, sans-serif' }}
              >
                {CATEGORIES.filter(c => c.value !== 'all').map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>المكان / الغرفة:</label>
              <Input
                placeholder="مثال: قاعة المحاضرات 1"
                value={form.room}
                onChange={e => setForm({ ...form, room: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>تكلفة الشراء (ج.م):</label>
              <Input
                type="number"
                placeholder="0"
                value={form.cost}
                onChange={e => setForm({ ...form, cost: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>الحالة التشغيلية:</label>
              <select
                value={form.status}
                onChange={e => setForm({ ...form, status: e.target.value })}
                style={{ width: '100%', background: 'rgba(7, 17, 31, 0.9)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 10, padding: '10px', color: '#fff', fontSize: 13, fontFamily: 'Cairo, sans-serif' }}
              >
                <option value="active">🟢 ممتاز ويعمل</option>
                <option value="maintenance">⚠️ يحتاج صيانة</option>
                <option value="retired">🔴 تالف / خارج الخدمة</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>تاريخ الشراء:</label>
              <Input
                type="date"
                value={form.purchaseDate}
                onChange={e => setForm({ ...form, purchaseDate: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>تاريخ انتهاء الضمان:</label>
              <Input
                type="date"
                value={form.warrantyExpiry}
                onChange={e => setForm({ ...form, warrantyExpiry: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>الرقم التسلسلي S/N (اختياري):</label>
            <Input
              placeholder="مثال: SN-94829148"
              value={form.serialNo}
              onChange={e => setForm({ ...form, serialNo: e.target.value })}
            />
          </div>

          <div>
            <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>ملاحظات ومواصفات إضافية:</label>
            <Input
              placeholder="مثال: تم شراؤه مع فاتورة ضريبية، الضمان يشمل قطع الغيار..."
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <Button variant="ghost" type="button" onClick={() => setModalOpen(false)} style={{ flex: 1 }}>إلغاء</Button>
            <Button variant="primary" type="submit" disabled={saveLoading} style={{ flex: 1.5 }}>
              {saveLoading ? 'جاري الحفظ...' : editAsset ? '💾 حفظ التعديلات' : '➕ إضافة الأصل'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Maintenance Record Modal */}
      <Modal open={maintModalOpen} onClose={() => setMaintModalOpen(false)} title={`🔧 تسجيل عملية صيانة - ${maintAsset?.name || ''}`}>
        <form onSubmit={handleSaveMaintenance} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>تكلفة الصيانة (ج.م):</label>
              <Input
                type="number"
                placeholder="0"
                value={maintForm.cost}
                onChange={e => setMaintForm({ ...maintForm, cost: e.target.value })}
                required
                autoFocus
              />
            </div>

            <div>
              <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>اسم الفني / جهة الصيانة:</label>
              <Input
                placeholder="مثال: فني التكييفات م. سامي"
                value={maintForm.technician}
                onChange={e => setMaintForm({ ...maintForm, technician: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>تفاصيل الصيانة وقطع الغيار:</label>
            <Input
              placeholder="مثال: شحن فريون وتغيير كباستور للموتور الخارجي..."
              value={maintForm.description}
              onChange={e => setMaintForm({ ...maintForm, description: e.target.value })}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>تاريخ الصيانة:</label>
              <Input
                type="date"
                value={maintForm.date}
                onChange={e => setMaintForm({ ...maintForm, date: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>حالة الجهاز بعد الصيانة:</label>
              <select
                value={maintForm.status}
                onChange={e => setMaintForm({ ...maintForm, status: e.target.value })}
                style={{ width: '100%', background: 'rgba(7, 17, 31, 0.9)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 10, padding: '10px', color: '#fff', fontSize: 13, fontFamily: 'Cairo, sans-serif' }}
              >
                <option value="active">🟢 يعمل بكفاءة ممتازة</option>
                <option value="maintenance">⚠️ ما زال تحت الصيانة والمتابعة</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>خصم تكلفة الصيانة من الخزينة / الوردية:</label>
            <select
              value={maintShiftId}
              onChange={e => setMaintShiftId(e.target.value)}
              style={{ width: '100%', background: 'rgba(7, 17, 31, 0.9)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 10, padding: '10px', color: '#fff', fontSize: 13, fontFamily: 'Cairo, sans-serif' }}
            >
              <option value="">🏢 الخزينة الرئيسية العامة (خارج الورديات)</option>
              {openShifts.map(s => (
                <option key={s.id} value={s.id}>
                  🟢 وردية نشطة: {s.employeeName || 'موظف'} ({s.branch || 'الفرع الرئيسي'})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <Button variant="ghost" type="button" onClick={() => setMaintModalOpen(false)} style={{ flex: 1 }}>إلغاء</Button>
            <Button variant="primary" type="submit" disabled={maintLoading} style={{ flex: 1.5, background: 'linear-gradient(135deg, #d97706, #f59e0b)' }}>
              {maintLoading ? 'جاري الحفظ...' : '💾 اعتماد وتوثيق الصيانة'}
            </Button>
          </div>
        </form>
      </Modal>

    </div>
  );
}
