import React, { useState, useEffect, useMemo } from 'react';
import { getFeedbackList } from '../../../services/db';
import { Card, StatCard, EmptyState, Badge, Input } from '../../../components/ui';
import { formatDateTime } from '../../../utils/constants';

export default function FeedbackTab() {
  const [feedbacks, setFeedbacks] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    return getFeedbackList(setFeedbacks);
  }, []);

  const totalCount = feedbacks.length;
  const avgRating = useMemo(() => {
    if (feedbacks.length === 0) return '5.0';
    const sum = feedbacks.reduce((s, f) => s + (Number(f.rating) || 5), 0);
    return (sum / feedbacks.length).toFixed(1);
  }, [feedbacks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return feedbacks;
    return feedbacks.filter(f =>
      (f.clientName || '').toLowerCase().includes(q) ||
      (f.comment || '').toLowerCase().includes(q) ||
      (f.serviceRated || '').toLowerCase().includes(q)
    );
  }, [feedbacks, search]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ color: '#ffffff', fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>⭐</span> تقييمات العملاء واستبيانات الجودة (Feedback & Ratings)
          </h2>
          <p style={{ color: '#93c5fd', fontSize: 13, margin: '4px 0 0' }}>
            متابعة آراء ومقترحات المشتركين والطلاب لتحسين تجربة المكان باستمرار
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        <StatCard icon="⭐" label="متوسط التقييم العام" value={avgRating + " / 5.0"} color="amber" />
        <StatCard icon="💬" label="إجمالي التقييمات والملاحظات" value={totalCount} color="blue" />
      </div>

      <div style={{ maxWidth: 360 }}>
        <Input placeholder="🔍 بحث في التقييمات والمقترحات..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {filtered.length === 0 ? <EmptyState icon="⭐" message="لا توجد تقييمات واردة من العملاء بعد" /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: 16 }}>
          {filtered.map(f => (
            <Card key={f.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <h3 style={{ color: '#ffffff', fontWeight: 800, fontSize: 15, margin: 0 }}>{f.clientName || 'عميل'}</h3>
                    {f.source === 'cafe_menu' ? (
                      <Badge color="amber">منيو الكافيه {f.tableNumber ? `(طاولة ${f.tableNumber})` : ''}</Badge>
                    ) : f.source === 'portal' ? (
                      <Badge color="blue">بوابة المشتركين {f.memberId ? `(#${f.memberId})` : ''}</Badge>
                    ) : null}
                  </div>
                  <p style={{ color: '#93c5fd', fontSize: 12, margin: '3px 0 0' }}>🏷️ {f.serviceRated || 'خدمة عامة'}</p>
                </div>
                <div style={{ color: '#f59e0b', fontSize: 16, fontWeight: 900 }}>
                  {(() => {
                    const validRating = Math.max(1, Math.min(5, Math.round(Number(f.rating) || 5)));
                    return '★'.repeat(validRating) + '☆'.repeat(5 - validRating);
                  })()}
                </div>
              </div>

              {f.clientPhone && <p style={{ color: '#94a3b8', fontSize: 12, margin: 0 }}>📞 {f.clientPhone}</p>}

              {f.comment && (
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 12px', color: '#e2e8f0', fontSize: 13, fontStyle: 'italic', lineHeight: 1.5 }}>
                  "{f.comment}"
                </div>
              )}

              <div style={{ color: '#64748b', fontSize: 11, marginTop: 'auto', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                {f.createdAt ? formatDateTime(f.createdAt) : 'حديثاً'}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
