import React, { useState, useEffect } from 'react';
import { Modal, Button } from './ui';
import QRCode from 'qrcode';
import { getSystemInfo } from '../services/db';

export default function MenuQrModal({ isOpen, onClose, orgName = 'TFG | CAFE' }) {
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [orderPhone, setOrderPhone] = useState('');

  const menuUrl = typeof window !== 'undefined' ? (window.location.origin + '/menu') : 'https://the-first-group-co.web.app/menu';

  useEffect(() => {
    if (isOpen) {
      getSystemInfo().then(info => setOrderPhone(info?.phone || ''));
      QRCode.toDataURL(menuUrl, {
        width: 400,
        margin: 2,
        color: {
          dark: '#070e1b',
          light: '#ffffff'
        }
      }).then(url => {
        setQrCodeDataUrl(url);
      }).catch(err => {
        console.error('QR code generation error:', err);
        setQrCodeDataUrl(`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(menuUrl)}`);
      });
    }
  }, [isOpen, menuUrl]);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(menuUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadQr = () => {
    if (!qrCodeDataUrl) return;
    const a = document.createElement('a');
    a.href = qrCodeDataUrl;
    a.download = `tfg_cafe_menu_qr.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handlePrint = () => {
    const printWin = window.open('', '_blank');
    if (!printWin) {
      window.print();
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8">
        <title>ستاند كود QR المنيو — ${orgName}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Cairo', sans-serif;
            direction: rtl;
            background: #ffffff;
            color: #0f172a;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 20px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .stand-card {
            width: 320px;
            background: #ffffff;
            border: 3px double #d97706;
            border-radius: 20px;
            padding: 30px 20px;
            text-align: center;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
          }
          .icon-badge {
            width: 70px;
            height: 70px;
            border-radius: 18px;
            margin: 0 auto 12px;
            background: #070e1b;
            border: 2px solid rgba(56, 189, 248, 0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 6px;
            box-shadow: 0 4px 14px rgba(56, 189, 248, 0.25);
          }
          .icon-badge img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            mix-blend-mode: screen;
            filter: drop-shadow(0 0 10px rgba(56, 189, 248, 0.75));
          }
          h1 {
            font-size: 22px;
            font-weight: 900;
            color: #0f172a;
            margin: 0;
          }
          .sub {
            font-size: 13px;
            font-weight: 700;
            color: #d97706;
            margin: 4px 0 16px;
          }
          .qr-box {
            background: #ffffff;
            padding: 12px;
            border-radius: 16px;
            display: inline-block;
            border: 2px solid #e2e8f0;
          }
          .qr-box img {
            width: 200px;
            height: 200px;
            display: block;
          }
          .scan-title {
            font-size: 15px;
            font-weight: 900;
            color: #0f172a;
            margin: 16px 0 4px;
          }
          .scan-desc {
            font-size: 12px;
            color: #64748b;
            font-weight: 600;
          }
          .footer-url {
            margin-top: 14px;
            padding-top: 10px;
            border-top: 1px dashed #cbd5e1;
            font-size: 11px;
            color: #94a3b8;
            word-break: break-all;
            direction: ltr;
          }
        </style>
      </head>
      <body>
        <div class="stand-card">
          <div class="icon-badge">
            <img src="${window.location.origin}/logo.png" alt="TFG | CAFE" />
          </div>
          <h1>${orgName}</h1>
          <p class="sub">قائمة المشروبات والضيافة (Cafe Menu) ✨</p>
          <div class="qr-box">
            <img src="${qrCodeDataUrl}" alt="QR Code" />
          </div>
          <p class="scan-title">امسح الكود بكاميرا الموبايل 📸</p>
          <p class="scan-desc">لتصفح قائمة المشروبات والأسعار والطلب المباشر</p>
          <div class="footer-url">${menuUrl}</div>
        </div>
      </body>
      </html>
    `;

    printWin.document.write(html);
    printWin.document.close();
    setTimeout(() => {
      printWin.print();
    }, 300);
  };

  return (
    <Modal open={true} onClose={onClose} title="📱 ستاند كود QR المنيو الإلكتروني للطاولات" size="md">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        {/* Printable Stand Card Preview */}
        <div id="cafe-qr-table-stand" style={{
          width: '100%', maxWidth: 320, background: '#ffffff', color: '#070e1b',
          borderRadius: 20, padding: '28px 20px', textAlign: 'center',
          boxShadow: '0 10px 30px rgba(0,0,0,0.15)', border: '3px double #d97706',
          fontFamily: 'Cairo, sans-serif'
        }}>
          <div style={{
            width: 65, height: 65, borderRadius: 16, margin: '0 auto 10px',
            background: '#070e1b',
            border: '1.5px solid rgba(56, 189, 248, 0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(56, 189, 248, 0.25)',
            padding: 6,
            boxSizing: 'border-box'
          }}>
            <img
              src="/logo.png"
              alt="TFG | CAFE"
              onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                mixBlendMode: 'screen',
                filter: 'drop-shadow(0 0 10px rgba(56, 189, 248, 0.75))'
              }}
            />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0, color: '#0f172a' }}>{orgName}</h2>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#d97706', margin: '4px 0 14px' }}>
            قائمة المشروبات والضيافة (Cafe Menu) ✨
          </p>

          <div style={{
            background: '#ffffff', padding: 12, borderRadius: 14, display: 'inline-block',
            border: '2px solid #f1f5f9', boxShadow: '0 4px 16px rgba(0,0,0,0.08)'
          }}>
            {qrCodeDataUrl ? (
              <img
                src={qrCodeDataUrl}
                alt="Cafe Menu QR Code"
                style={{ width: 190, height: 190, display: 'block', margin: '0 auto' }}
              />
            ) : (
              <div style={{ width: 190, height: 190, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                جاري توليد الكود...
              </div>
            )}
          </div>

          <p style={{ fontSize: 14, fontWeight: 900, color: '#1e293b', margin: '16px 0 2px' }}>
            امسح الكود بكاميرا الموبايل 📸
          </p>
          <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
            لتصفح قائمة المشروبات والأسعار والطلب المباشر
          </span>
        </div>

        {/* WhatsApp Order Target Info */}
        <div style={{
          width: '100%',
          background: 'rgba(59, 130, 246, 0.12)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          borderRadius: 14,
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
          boxSizing: 'border-box'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>📱</span>
            <span style={{ color: '#cbd5e1', fontSize: 13, fontWeight: 700 }}>
              رقم واتساب استلام طلبات المنيو:
            </span>
            <strong style={{ color: orderPhone ? '#34d399' : '#f87171', fontSize: 14, direction: 'ltr' }}>
              {orderPhone || 'لم يتم تحديده بعد'}
            </strong>
          </div>
          <span style={{ color: '#93c5fd', fontSize: 11, fontWeight: 600 }}>
            ⚙️ لتعديل الرقم أو صيغة الرسالة: توجه إلى تبويب الإعدادات أو الرد الآلي
          </span>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', width: '100%', marginTop: 6 }}>
          <Button
            type="button"
            variant="ghost"
            onClick={handleCopyLink}
            style={{ fontSize: 12, border: '1px solid var(--border)' }}
          >
            {copied ? '✅ تم نسخ الرابط!' : '📋 نسخ رابط المنيو'}
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={() => window.open('/menu', '_blank')}
            style={{ fontSize: 12, border: '1px solid var(--border)', color: '#38bdf8' }}
          >
            🔗 فتح صفحة المنيو
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={handleDownloadQr}
            style={{ fontSize: 12, border: '1px solid var(--border)', color: '#34d399' }}
          >
            📥 تحميل كود QR
          </Button>

          <Button
            type="button"
            variant="primary"
            onClick={handlePrint}
            style={{ background: 'linear-gradient(135deg, #d97706, #f59e0b)', fontWeight: 800, fontSize: 13 }}
          >
            🖨️ طباعة ستاند الطاولة فوراً
          </Button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%', marginTop: 4 }}>
          <Button type="button" variant="ghost" onClick={onClose}>إغلاق</Button>
        </div>
      </div>
    </Modal>
  );
}
