import React, { useState, useEffect, useMemo } from 'react';
import { getCourseSchedules, addCourseSchedule, updateCourseSchedule, deleteCourseSchedule, getAllSubscriptions, getClients, getInstructors } from '../../../services/db';
import { Card, Button, Input, Select, Modal, Badge, EmptyState } from '../../../components/ui';
import { formatCurrency, formatDateTime } from '../../../utils/constants';
import { openWhatsApp } from '../../../utils/whatsapp';
import { exportToExcel } from '../../../utils/excelExport';

const DAYS_LIST = [
  'السبت والثلاثاء',
  'الأحد والأربعاء',
  'الإثنين والخميس',
  'الجمعة فقط (مكثف)',
  'السبت والأحد والإثنين',
  'الثلاثاء والأربعاء والخميس',
  'يومياً (مكثف)'
];

export default function CourseScheduleTab() {
  const [schedules, setSchedules] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [clients, setClients] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [studentsModal, setStudentsModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedDayFilter, setSelectedDayFilter] = useState('all');

  // Modal State
  const [modal, setModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    courseName: '',
    instructorId: '',
    instructorName: '',
    days: DAYS_LIST[0],
    startTime: '05:00 PM',
    endTime: '07:00 PM',
    room: 'قاعة 1',
    price: '',
    totalSeats: '15',
    availableSeats: '15',
    status: 'available',
    notes: ''
  });

  useEffect(() => {
    const unsub = getCourseSchedules(data => {
      setSchedules(data);
      setLoading(false);
    });
    const unsubSubs = getAllSubscriptions(setSubscriptions);
    const unsubClts = getClients(setClients);
    const unsubInst = getInstructors(setInstructors);
    return () => { unsub(); unsubSubs(); unsubClts(); unsubInst(); };
  }, []);

  const filteredSchedules = useMemo(() => {
    return schedules.filter(s => {
      const matchSearch = (s.courseName || '').toLowerCase().includes(search.toLowerCase()) ||
                          (s.instructorName || '').toLowerCase().includes(search.toLowerCase()) ||
                          (s.room || '').toLowerCase().includes(search.toLowerCase());
      const matchDay = selectedDayFilter === 'all' || (s.days || '').includes(selectedDayFilter);
      return matchSearch && matchDay;
    });
  }, [schedules, search, selectedDayFilter]);

  const openAddModal = () => {
    setEditItem(null);
    setForm({
      courseName: '',
      instructorId: '',
      instructorName: '',
      days: DAYS_LIST[0],
      startTime: '05:00 PM',
      endTime: '07:00 PM',
      room: 'قاعة 1',
      price: '',
      totalSeats: '15',
      availableSeats: '15',
      status: 'available',
      notes: ''
    });
    setModal(true);
  };

  const openEditModal = (item) => {
    setEditItem(item);
    setForm({
      courseName: item.courseName || '',
      instructorId: item.instructorId || '',
      instructorName: item.instructorName || '',
      days: item.days || DAYS_LIST[0],
      startTime: item.startTime || '05:00 PM',
      endTime: item.endTime || '07:00 PM',
      room: item.room || 'قاعة 1',
      price: String(item.price || ''),
      totalSeats: String(item.totalSeats || '15'),
      availableSeats: String(item.availableSeats !== undefined ? item.availableSeats : '15'),
      status: item.status || 'available',
      notes: item.notes || ''
    });
    setModal(true);
  };

  // Helper to parse time string to minutes
  const parseTimeToMin = (t) => {
    if (!t) return 0;
    const clean = t.trim().toUpperCase();
    const isPM = clean.includes('PM') || clean.includes('م');
    const isAM = clean.includes('AM') || clean.includes('ص');
    const timeOnly = clean.replace(/[^0-9:]/g, '');
    const parts = timeOnly.split(':');
    let h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;
    return h * 60 + m;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.courseName.trim()) return alert('يرجى إدخال اسم الكورس');

    // Room conflict check
    const newStart = parseTimeToMin(form.startTime);
    const newEnd = parseTimeToMin(form.endTime);
    const conflict = schedules.find(s => {
      if (editItem && s.id === editItem.id) return false;
      if (s.status === 'cancelled') return false;
      if (s.room !== form.room) return false;

      const d1 = form.days || '';
      const d2 = s.days || '';
      const daysOverlap = d1 === d2 || d1 === 'يومياً (مكثف)' || d2 === 'يومياً (مكثف)' ||
        d1.split('و').some(part => d2.includes(part.trim()));

      if (!daysOverlap) return false;

      const sStart = parseTimeToMin(s.startTime);
      const sEnd = parseTimeToMin(s.endTime);

      return (newStart < sEnd && newEnd > sStart);
    });

    if (conflict) {
      const proceed = window.confirm(
        `⚠️ تحذير تضارب قاعات:\nالقاعة (${form.room}) محجوزة بالفعل في نفس الأيام والتوقيت لكورس:\n(${conflict.courseName}) للمحاضر (${conflict.instructorName || 'غير محدد'})\nمن ${conflict.startTime} إلى ${conflict.endTime}.\n\nهل ترغب في تأكيد الحفظ رغم التضارب؟`
      );
      if (!proceed) return;
    }

    setSubmitting(true);
    try {
      if (editItem) {
        await updateCourseSchedule(editItem.id, form);
      } else {
        await addCourseSchedule(form);
      }
      setModal(false);
    } catch (err) {
      alert('حدث خطأ: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`هل أنت متأكد من حذف موعد كورس (${item.courseName})؟`)) return;
    try {
      await deleteCourseSchedule(item.id);
    } catch (err) {
      alert('حدث خطأ: ' + err.message);
    }
  };

  // Share Schedule via WhatsApp
  const handleShareScheduleWhatsApp = (item) => {
    const text = `🎓 تفاصيل ومواعيد ${item.courseName}
من: THE FIRST GROUP 🏢
---------------------------------
👨‍🏫 المحاضر: ${item.instructorName || 'معتمد'}
📅 الأيام: ${item.days}
⏰ الموعد: من ${item.startTime} إلى ${item.endTime}
🚪 القاعة: ${item.room || 'قاعة التدريب'}
💰 السعر: ${formatCurrency(item.price || 0)}
📊 حالة الحجز: ${item.availableSeats > 0 ? `متاح (${item.availableSeats} مقاعد متبقية)` : 'مكتمل العدد'}
${item.notes ? `📝 ملاحظات: ${item.notes}\n` : ''}---------------------------------
📍 للحجز والاستفسار زورنا في السنتر أو تواصل معنا عبر الواتساب! ✨`;

    openWhatsApp('', text);
  };

  // Export to Excel
  const handleExportExcel = () => {
    const headers = ['#', 'اسم الكورس', 'المحاضر', 'الأيام', 'من الساعة', 'إلى الساعة', 'القاعة', 'السعر (ج.م)', 'إجمالي المقاعد', 'المقاعد المتبقية', 'الحالة', 'ملاحظات'];
    const rows = schedules.map((s, idx) => [
      idx + 1,
      s.courseName,
      s.instructorName || '—',
      s.days,
      s.startTime,
      s.endTime,
      s.room,
      s.price || 0,
      s.totalSeats || 15,
      s.availableSeats || 0,
      s.status === 'available' ? 'متاح للحجز' : s.status === 'full' ? 'مكتمل' : s.status === 'almost_full' ? 'أوشك على الامتلاء' : 'ملغي',
      s.notes || '—'
    ]);

    exportToExcel({
      filename: 'جدول_مواعيد_الكورسات_THE_FIRST_GROUP',
      sheets: [{ title: 'جدول الكورسات والمواعيد', headers, rows }]
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontFamily: 'Cairo, sans-serif' }}>
      
      {/* Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>📅</span> جدول مواعيد الكورسات والقاعات (Timetable)
          </h2>
          <p style={{ margin: '4px 0 0', color: '#93c5fd', fontSize: 13 }}>
            تنسيق المواعيد الأسبوعية، متابعة المقاعد الشاغرة، والربط التلقائي بالرد الآلي على الواتساب 🤖
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="ghost" onClick={handleExportExcel} style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
            📊 تصدير الجدول Excel
          </Button>
          <Button variant="primary" onClick={openAddModal} style={{ boxShadow: '0 4px 16px rgba(37,99,235,0.4)' }}>
            ➕ إضافة ميعاد كورس جديد
          </Button>
        </div>
      </div>

      {/* Quick Filters & Search */}
      <Card style={{ background: 'rgba(15, 23, 42, 0.85)', padding: 14, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          <Input
            placeholder="🔍 ابحث باسم الكورس، المدرس، أو القاعة..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          <Select
            value={selectedDayFilter}
            onChange={e => setSelectedDayFilter(e.target.value)}
          >
            <option value="all">📅 كافة الأيام والمجموعات</option>
            <option value="السبت">السبت</option>
            <option value="الأحد">الأحد</option>
            <option value="الإثنين">الإثنين</option>
            <option value="الثلاثاء">الثلاثاء</option>
            <option value="الأربعاء">الأربعاء</option>
            <option value="الخميس">الخميس</option>
            <option value="الجمعة">الجمعة</option>
          </Select>
        </div>
      </Card>

      {/* Grid of Course Schedules */}
      {filteredSchedules.length === 0 ? (
        <EmptyState icon="📅" message="لا توجد مواعيد كورسات مسجلة حالياً. أضف ميعاد كورس جديد ليقوم بوت الواتساب بالرد بمواعيده تلقائياً." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {filteredSchedules.map(item => {
            const enrolledSubs = subscriptions.filter(sub => {
              if (sub.status === 'paused' || sub.status === 'expired' || sub.status === 'cancelled') return false;
              if (sub.scheduleId && sub.scheduleId === item.id) return true;
              if (!sub.scheduleId && sub.packageName && item.courseName && sub.packageName.toLowerCase().includes(item.courseName.toLowerCase())) return true;
              return false;
            });
            const bookedCount = enrolledSubs.length;
            const dynamicAvailable = Math.max(0, (Number(item.totalSeats) || 15) - bookedCount);
            const isFull = dynamicAvailable <= 0 || item.status === 'full';
            const isAlmostFull = !isFull && dynamicAvailable <= 3;

            return (
              <Card key={item.id} style={{
                background: 'rgba(15, 23, 42, 0.9)',
                border: isFull ? '1.5px solid rgba(239, 68, 68, 0.4)' : isAlmostFull ? '1.5px solid rgba(245, 158, 11, 0.4)' : '1.5px solid rgba(59, 130, 246, 0.35)',
                borderRadius: 16,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 12
              }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#ffffff' }}>
                        {item.courseName}
                      </h3>
                      <span style={{ color: '#93c5fd', fontSize: 12 }}>
                        👨‍🏫 {item.instructorName ? `الأستاذ / ${item.instructorName}` : 'مدرس معتمد'}
                      </span>
                    </div>

                    <Badge color={isFull ? 'red' : isAlmostFull ? 'amber' : 'green'}>
                      {isFull ? '🔴 مكتمل العدد' : isAlmostFull ? `🟡 متبقي ${dynamicAvailable}` : `🟢 متاح (${dynamicAvailable} مقاعد)`}
                    </Badge>
                  </div>

                  {/* Schedule Details Box */}
                  <div style={{ background: 'rgba(7, 17, 31, 0.75)', borderRadius: 12, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>📅 الأيام:</span>
                      <strong style={{ color: '#ffffff' }}>{item.days}</strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>⏰ الموعد:</span>
                      <strong style={{ color: '#38bdf8' }}>من {item.startTime} إلى {item.endTime}</strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>🚪 القاعة:</span>
                      <strong style={{ color: '#cbd5e1' }}>{item.room || 'قاعة 1'}</strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 4, marginTop: 2 }}>
                      <span style={{ color: '#94a3b8' }}>💰 سعر الكورس:</span>
                      <strong style={{ color: '#34d399', fontSize: 14 }}>{formatCurrency(item.price || 0)}</strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>👥 سعة المقاعد:</span>
                      <strong style={{ color: '#93c5fd' }}>{bookedCount} طالب مسجل (متبقي {dynamicAvailable} مقاعد)</strong>
                    </div>
                  </div>

                  {item.notes && (
                    <p style={{ margin: '8px 0 0', fontSize: 11, color: '#94a3b8' }}>
                      📝 {item.notes}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
                                    <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setStudentsModal({ schedule: item, students: enrolledSubs })}
                    style={{ flex: 1.2, fontSize: 11, background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)' }}
                  >
                    👥 الطلاب ({bookedCount})
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleShareScheduleWhatsApp(item)}
                    style={{ flex: 1.5, fontSize: 11, background: 'rgba(37, 211, 102, 0.15)', color: '#25d366', border: '1px solid rgba(37, 211, 102, 0.3)' }}
                  >
                    📲 إرسال بالواتساب
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openEditModal(item)} style={{ padding: '4px 8px' }}>
                    ✏️
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => handleDelete(item)} style={{ padding: '4px 8px' }}>
                    🗑️
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

            {/* Enrolled Students Modal */}
      {studentsModal && (
        <Modal open={!!studentsModal} onClose={() => setStudentsModal(null)} title={`👥 قائمة الطلاب المسجلين في: ${studentsModal.schedule.courseName}`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: 'rgba(15, 23, 42, 0.85)', padding: 12, borderRadius: 10, display: 'flex', justifyContent: 'space-between', color: '#93c5fd', fontSize: 13 }}>
              <span>📅 الموعد: <strong>{studentsModal.schedule.days} ({studentsModal.schedule.startTime} - {studentsModal.schedule.endTime})</strong></span>
              <span>🚪 <strong>{studentsModal.schedule.room}</strong></span>
            </div>

            {studentsModal.students.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#94a3b8', padding: 20, margin: 0 }}>لا يوجد طلاب مسجلين في هذا الميعاد حتى الآن.</p>
            ) : (
              <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {studentsModal.students.map((sub, idx) => {
                  const client = clients.find(c => c.id === sub.clientId) || {};
                  return (
                    <div key={sub.id} style={{ background: 'rgba(7, 17, 31, 0.8)', padding: '10px 14px', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ color: '#ffffff', display: 'block', fontSize: 14 }}>{idx + 1}. {client.name || 'طالب مسجل'}</strong>
                        <span style={{ color: '#93c5fd', fontSize: 11 }}>📱 {client.phone || '—'} &nbsp;|&nbsp; 🆔 #{client.memberId || '—'}</span>
                      </div>
                      <Badge color="green">مسجل ومؤكد</Badge>
                    </div>
                  );
                })}
              </div>
            )}

            <Button variant="ghost" onClick={() => setStudentsModal(null)} style={{ marginTop: 8 }}>إغلاق</Button>
          </div>
        </Modal>
      )}

      {/* Add / Edit Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editItem ? '✏️ تعديل ميعاد الكورس' : '➕ إضافة ميعاد كورس جديد'}>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>اسم الكورس والمستوى:</label>
            <Input
              placeholder="مثال: كورس لغة إنجليزية (المستوى الأول)"
              value={form.courseName}
              onChange={e => setForm({ ...form, courseName: e.target.value })}
              required
              autoFocus
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>اسم المحاضر / المدرس:</label>
              <Input
                placeholder="مثال: أ. أحمد حسن"
                value={form.instructorName}
                onChange={e => setForm({ ...form, instructorName: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>سعر الكورس (ج.م):</label>
              <Input
                type="number"
                placeholder="500"
                value={form.price}
                onChange={e => setForm({ ...form, price: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>أيام المحاضرات:</label>
            <Select
              value={form.days}
              onChange={e => setForm({ ...form, days: e.target.value })}
            >
              {DAYS_LIST.map(d => <option key={d} value={d}>{d}</option>)}
            </Select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>من الساعة:</label>
              <Input
                placeholder="05:00 PM"
                value={form.startTime}
                onChange={e => setForm({ ...form, startTime: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>إلى الساعة:</label>
              <Input
                placeholder="07:00 PM"
                value={form.endTime}
                onChange={e => setForm({ ...form, endTime: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>القاعة:</label>
              <Input
                placeholder="قاعة 1"
                value={form.room}
                onChange={e => setForm({ ...form, room: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>إجمالي المقاعد:</label>
              <Input
                type="number"
                value={form.totalSeats}
                onChange={e => setForm({ ...form, totalSeats: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>المقاعد المتبقية:</label>
              <Input
                type="number"
                value={form.availableSeats}
                onChange={e => setForm({ ...form, availableSeats: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>ملاحظات إضافية:</label>
            <Input
              placeholder="مثال: تبدأ المجموعة السبت القادم، شامل المواد والكتب..."
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <Button variant="ghost" type="button" onClick={() => setModal(false)} style={{ flex: 1 }}>إلغاء</Button>
            <Button variant="primary" type="submit" disabled={submitting} style={{ flex: 1.5 }}>
              {submitting ? 'جاري الحفظ...' : editItem ? '💾 حفظ التعديلات' : '➕ إضافة الميعاد'}
            </Button>
          </div>
        </form>
      </Modal>

    </div>
  );
}
