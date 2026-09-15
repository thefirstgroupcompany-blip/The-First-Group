import React from 'react';
import { Modal, Button } from './ui';
import { formatDateTime } from '../utils/constants';

export default function CourseCertificateModal({ isOpen, onClose, studentName, courseName, instructorName, orgName = 'THE FIRST GROUP', logoUrl }) {
  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal open={true} onClose={onClose} title="🎓 شهادة إتمام كورس رسمية" size="lg">
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-course-certificate, #printable-course-certificate * {
            visibility: visible !important;
          }
          #printable-course-certificate {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 20px !important;
            border: none !important;
          }
        }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        {/* Printable Certificate Frame */}
        <div id="printable-course-certificate" style={{
          width: '100%', maxWidth: 680, background: '#ffffff', color: '#070e1b',
          borderRadius: 20, padding: '36px 30px', textAlign: 'center',
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)', border: '12px double #d97706',
          fontFamily: 'Cairo, sans-serif', position: 'relative', overflow: 'hidden'
        }}>
          {/* Header */}
          <div style={{ marginBottom: 16 }}>
            {logoUrl ? (
              <img
                src={logoUrl === '/logo.png' ? '/logo-dark.png' : logoUrl}
                alt={orgName}
                style={{ height: 60, objectFit: 'contain', margin: '0 auto 8px', display: 'block', filter: 'brightness(0)' }}
                onError={(e) => { e.target.onerror = null; e.target.src = '/logo-dark.png'; }}
              />
            ) : (
              <div style={{
                width: 55, height: 55, borderRadius: 16, margin: '0 auto 8px',
                background: 'linear-gradient(135deg, #d97706, #f59e0b)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: '#fff'
              }}>
                🎓
              </div>
            )}
            <h2 style={{ fontSize: 22, fontWeight: 900, margin: 0, color: '#0f172a' }}>{orgName}</h2>
            <p style={{ fontSize: 13, color: '#d97706', fontWeight: 700, margin: '2px 0 0' }}>مركز التدريب وتنمية المهارات</p>
          </div>

          <h1 style={{ fontSize: 26, fontWeight: 900, color: '#1e3a8a', margin: '14px 0 6px', letterSpacing: '1px' }}>
            شهــــادة إتمــــام كــــورس
          </h1>
          <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>Certificate of Course Completion</p>

          <p style={{ fontSize: 15, color: '#334155', margin: '24px 0 10px', lineHeight: 1.8 }}>
            يشهد مركز <strong>{orgName}</strong> بأن الطالب / الطالبة:
          </p>

          <div style={{
            fontSize: 24, fontWeight: 900, color: '#b45309', margin: '8px auto 16px',
            borderBottom: '2px solid #f59e0b', display: 'inline-block', paddingBottom: 6, minWidth: 260
          }}>
            {studentName || 'اسم الطالب'}
          </div>

          <p style={{ fontSize: 15, color: '#334155', margin: '0 0 14px' }}>
            قد أتم بنجاح متطلبات وحصص البرنامج التدريبي:
          </p>

          <div style={{ fontSize: 20, fontWeight: 900, color: '#1e40af', margin: '4px 0 24px' }}>
            « {courseName || 'اسم الكورس'} »
          </div>

          {/* Signatures Footer */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, borderTop: '1px solid #e2e8f0', paddingTop: 20, marginTop: 24 }}>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: 12, color: '#64748b', display: 'block' }}>المحاضر المعتمد</span>
              <strong style={{ fontSize: 15, color: '#0f172a', display: 'block', marginTop: 4 }}>{instructorName || 'المحاضر'}</strong>
            </div>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: 12, color: '#64748b', display: 'block' }}>إدارة السنتر</span>
              <strong style={{ fontSize: 15, color: '#0f172a', display: 'block', marginTop: 4 }}>{orgName}</strong>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, width: '100%', justifyContent: 'flex-end', marginTop: 6 }}>
          <Button type="button" variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button type="button" variant="primary" onClick={handlePrint} style={{ background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)' }}>
            🖨️ طباعة الشهادة الرسمية
          </Button>
        </div>
      </div>
    </Modal>
  );
}
