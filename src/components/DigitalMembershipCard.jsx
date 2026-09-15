import React, { useState } from 'react';
import { getClientMembershipTier } from '../services/db';
import { formatCurrency } from '../utils/constants';
import {
  RotateCw, Download, Copy, Check, Sparkles, ShieldCheck,
  Wifi, Phone, CreditCard, QrCode
} from 'lucide-react';

export default function DigitalMembershipCard({
  client,
  totalPaid = 0,
  systemInfo = null,
  compact = false
}) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [flipPhase, setFlipPhase] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [qrError, setQrError] = useState(false);

  if (!client) return null;

  const tier = getClientMembershipTier(client, totalPaid || client.totalPaid || 0);
  const formattedId = 'TFG-' + (client.memberId || '0000').toString().padStart(4, '0');
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://the-first-group-co.web.app';
  const verificationUrl = `${origin}/portal?phone=${encodeURIComponent(client.phone || '')}&id=${encodeURIComponent(client.memberId || '')}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(verificationUrl)}&bgcolor=ffffff&color=0f172a&qzone=1`;

  const handleFlipTo = (targetFlipped) => {
    if (targetFlipped === isFlipped || flipPhase) return;
    setFlipPhase(true);
    setTimeout(() => {
      setIsFlipped(targetFlipped);
      setTimeout(() => {
        setFlipPhase(false);
      }, 30);
    }, 140);
  };

  const handleToggleFlip = () => {
    handleFlipTo(!isFlipped);
  };

  const handleCopyLink = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(verificationUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleDownloadCard = async () => {
    try {
      setDownloading(true);
      const canvas = document.createElement('canvas');
      canvas.width = 1012;
      canvas.height = 638;
      const ctx = canvas.getContext('2d');

      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      if (tier.id === 'vip') {
        grad.addColorStop(0, '#2e1065');
        grad.addColorStop(0.5, '#0f172a');
        grad.addColorStop(1, '#581c87');
      } else if (tier.id === 'gold') {
        grad.addColorStop(0, '#451a03');
        grad.addColorStop(0.5, '#1e1b4b');
        grad.addColorStop(1, '#78350f');
      } else if (tier.id === 'silver') {
        grad.addColorStop(0, '#1e293b');
        grad.addColorStop(0.5, '#0f172a');
        grad.addColorStop(1, '#334155');
      } else {
        grad.addColorStop(0, '#0c4a6e');
        grad.addColorStop(0.5, '#0f172a');
        grad.addColorStop(1, '#0369a1');
      }
      ctx.fillStyle = grad;
      ctx.roundRect(0, 0, canvas.width, canvas.height, 40);
      ctx.fill();

      ctx.lineWidth = 6;
      ctx.strokeStyle = tier.color;
      ctx.roundRect(0, 0, canvas.width, canvas.height, 40);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 38px Cairo, sans-serif';
      ctx.textAlign = 'right';
      ctx.direction = 'rtl';
      ctx.fillText(systemInfo?.name || 'THE FIRST GROUP', canvas.width - 60, 80);

      ctx.font = 'bold 20px Cairo, sans-serif';
      ctx.fillStyle = tier.color;
      ctx.fillText('DIGITAL WALLET & MEMBERSHIP PASS', canvas.width - 60, 115);

      ctx.fillStyle = '#f59e0b';
      ctx.roundRect(60, 60, 110, 80, 16);
      ctx.fill();
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 52px Cairo, sans-serif';
      ctx.fillText(client.name || 'عضو مميز', canvas.width - 60, 260);

      ctx.fillStyle = tier.color;
      ctx.font = 'bold 36px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('MEMBER ID: ' + formattedId, canvas.width - 60, 320);

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 26px Cairo, sans-serif';
      ctx.fillText(`رقم الهاتف: ${client.phone || '—'}  |  الرتبة: ${tier.nameAr}`, canvas.width - 60, 380);

      const walletVal = formatCurrency(client.walletBalance || 0);
      ctx.fillStyle = '#34d399';
      ctx.font = '900 36px Cairo, sans-serif';
      ctx.fillText(`رصيد المحفظة الإلكترونية: ${walletVal}`, canvas.width - 60, 445);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.font = '18px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`AUTHENTICATED BY THE FIRST GROUP • DIGITAL WALLET PASS • VERIFIED: ${new Date().toLocaleDateString('ar-EG')}`, canvas.width / 2, canvas.height - 40);

      const link = document.createElement('a');
      link.download = `TFG_Wallet_Card_${formattedId}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Error downloading card:', err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 12,
      width: '100%',
      maxWidth: 420,
      margin: '0 auto',
      boxSizing: 'border-box'
    }}>
      {/* Side Switcher Tabs */}
      <div style={{
        display: 'flex',
        background: 'rgba(15, 23, 42, 0.85)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: 12,
        padding: 3,
        width: '100%',
        maxWidth: 360,
        gap: 4
      }}>
        <button
          type="button"
          onClick={() => handleFlipTo(false)}
          style={{
            flex: 1,
            padding: '7px 10px',
            borderRadius: 9,
            border: 'none',
            background: !isFlipped ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.3) 0%, rgba(217, 119, 6, 0.4) 100%)' : 'transparent',
            color: !isFlipped ? '#fcd34d' : '#94a3b8',
            fontSize: 11.5,
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            fontFamily: 'Cairo, sans-serif',
            transition: 'all 0.2s ease',
            borderBottom: !isFlipped ? '2px solid #f59e0b' : '2px solid transparent'
          }}
        >
          <CreditCard size={13} />
          <span>الوجه الأمامي (المحفظة)</span>
        </button>

        <button
          type="button"
          onClick={() => handleFlipTo(true)}
          style={{
            flex: 1,
            padding: '7px 10px',
            borderRadius: 9,
            border: 'none',
            background: isFlipped ? 'linear-gradient(135deg, rgba(56, 189, 248, 0.3) 0%, rgba(14, 165, 233, 0.4) 100%)' : 'transparent',
            color: isFlipped ? '#38bdf8' : '#94a3b8',
            fontSize: 11.5,
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            fontFamily: 'Cairo, sans-serif',
            transition: 'all 0.2s ease',
            borderBottom: isFlipped ? '2px solid #38bdf8' : '2px solid transparent'
          }}
        >
          <QrCode size={13} />
          <span>الوجه الخلفي (الـ QR)</span>
        </button>
      </div>

      {/* Smooth 2D Scale Flip Container: Zero Mirroring, Pure 2D Affine Transform */}
      <div
        onClick={handleToggleFlip}
        style={{
          width: '100%',
          aspectRatio: '1.586 / 1',
          minHeight: 215,
          cursor: 'pointer',
          userSelect: 'none',
          boxSizing: 'border-box'
        }}
        title="اضغط لقلب البطاقة"
      >
        <div style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          transition: 'transform 0.15s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.15s ease',
          WebkitTransition: '-webkit-transform 0.15s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.15s ease',
          transform: flipPhase ? 'scaleX(0) scaleY(0.96)' : 'scaleX(1) scaleY(1)',
          WebkitTransform: flipPhase ? 'scaleX(0) scaleY(0.96)' : 'scaleX(1) scaleY(1)',
          opacity: flipPhase ? 0.5 : 1,
          boxSizing: 'border-box'
        }}>

          {!isFlipped ? (
            /* FRONT FACE: 100% FORWARD, NEVER MIRRORED */
            <div style={{
              width: '100%',
              height: '100%',
              borderRadius: 20,
              background: tier.gradient,
              border: `1.5px solid ${tier.border}`,
              boxShadow: `0 14px 32px rgba(0, 0, 0, 0.7), 0 0 24px ${tier.color}26`,
              padding: '14px 18px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              direction: 'rtl',
              boxSizing: 'border-box'
            }}>
              {/* Header: Logo, System Name, and EMV Chip */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <img
                    src="/logo.png"
                    alt="TFG"
                    onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }}
                    style={{ width: 34, height: 34, objectFit: 'contain', mixBlendMode: 'screen', filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.4))' }}
                  />
                  <div>
                    <h4 style={{ margin: 0, color: '#ffffff', fontWeight: 900, fontSize: 13, letterSpacing: '0.3px', lineHeight: 1.2 }}>
                      {systemInfo?.name || 'THE FIRST GROUP'}
                    </h4>
                    <span style={{ fontSize: 9.5, color: tier.color, fontWeight: 800, letterSpacing: '0.8px' }}>
                      MEMBERSHIP & WALLET PASS
                    </span>
                  </div>
                </div>

                {/* Gold Microchip */}
                <div style={{
                  width: 36,
                  height: 26,
                  borderRadius: 5,
                  background: 'linear-gradient(135deg, #fcd34d 0%, #b45309 100%)',
                  border: '1px solid #78350f',
                  boxShadow: 'inset 0 0 3px rgba(0,0,0,0.5), 0 2px 5px rgba(0,0,0,0.3)',
                  position: 'relative'
                }}>
                  <div style={{ position: 'absolute', top: '45%', left: 0, right: 0, height: 1, background: '#78350f' }} />
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: '45%', width: 1, background: '#78350f' }} />
                </div>
              </div>

              {/* Middle: Member Name & ID */}
              <div style={{ margin: '4px 0' }}>
                <div style={{ fontSize: 9.5, color: '#cbd5e1', fontWeight: 700, marginBottom: 1 }}>
                  عضوية المشترك / الطالب
                </div>
                <div style={{
                  color: '#ffffff',
                  fontSize: compact ? 16 : 18,
                  fontWeight: 900,
                  textShadow: '0 2px 6px rgba(0,0,0,0.6)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {client.name}
                </div>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 2,
                  fontFamily: 'monospace',
                  fontSize: 13,
                  color: tier.color,
                  fontWeight: 800,
                  letterSpacing: '1px'
                }}>
                  <span>{formattedId}</span>
                </div>
              </div>

              {/* Bottom: Tier Badge & Prominent Electronic Wallet Balance */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderTop: '1px solid rgba(255,255,255,0.12)',
                paddingTop: 8,
                gap: 8
              }}>
                {/* Tier Badge */}
                <div>
                  <span style={{
                    background: 'rgba(0, 0, 0, 0.45)',
                    border: `1px solid ${tier.color}`,
                    color: tier.color,
                    padding: '3px 9px',
                    borderRadius: 12,
                    fontSize: 10.5,
                    fontWeight: 900,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4
                  }}>
                    <Sparkles size={10} />
                    <span>{tier.nameAr}</span>
                  </span>
                </div>

                {/* High-Visibility Digital Wallet Pill */}
                <div style={{
                  background: 'rgba(6, 78, 59, 0.55)',
                  border: '1px solid rgba(52, 211, 153, 0.7)',
                  borderRadius: 10,
                  padding: '3px 10px',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  boxShadow: '0 0 12px rgba(16, 185, 129, 0.25)'
                }}>
                  <div style={{ fontSize: 8.5, color: '#a7f3d0', fontWeight: 800 }}>رصيد المحفظة 💳</div>
                  <div style={{ fontSize: 14, fontWeight: 900, color: '#34d399', direction: 'ltr', lineHeight: 1.1 }}>
                    {formatCurrency(client.walletBalance || 0)}
                  </div>
                </div>
              </div>

              {/* Tap Hint */}
              <div style={{
                textAlign: 'center',
                fontSize: 8.5,
                color: 'rgba(255,255,255,0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                marginTop: 2
              }}>
                <RotateCw size={8} />
                <span>اضغط على الكارت لرؤية الـ QR والواي فاي 🔄</span>
              </div>
            </div>
          ) : (
            /* BACK FACE: 100% FORWARD, NEVER MIRRORED */
            <div style={{
              width: '100%',
              height: '100%',
              borderRadius: 20,
              background: 'linear-gradient(135deg, #090d16 0%, #172033 100%)',
              border: `1.5px solid ${tier.border}`,
              boxShadow: `0 14px 32px rgba(0, 0, 0, 0.8), 0 0 24px ${tier.color}26`,
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              direction: 'rtl',
              boxSizing: 'border-box'
            }}>
              {/* Magnetic Stripe */}
              <div style={{
                margin: '-12px -16px 6px -16px',
                height: 32,
                background: '#0a0a0a',
                borderBottom: '1px solid rgba(255,255,255,0.08)'
              }} />

              {/* QR Code and Info */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                {/* QR Container */}
                <div style={{
                  background: '#ffffff',
                  padding: 4,
                  borderRadius: 10,
                  boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  {!qrError ? (
                    <img
                      src={qrCodeUrl}
                      alt="QR"
                      onError={() => setQrError(true)}
                      style={{ width: 76, height: 76, display: 'block' }}
                    />
                  ) : (
                    <div style={{
                      width: 76, height: 76,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      background: '#f8fafc', color: '#0f172a', textAlign: 'center', padding: 4
                    }}>
                      <QrCode size={36} color="#0f172a" />
                      <span style={{ fontSize: 7, fontWeight: 800, marginTop: 2 }}>{formattedId}</span>
                    </div>
                  )}
                </div>

                {/* Service Info - 100% CRISP AND FORWARD */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10.5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#38bdf8' }}>
                    <Wifi size={12} />
                    <span style={{ fontWeight: 800 }}>WiFi: THE FIRST GROUP</span>
                  </div>
                  <div style={{ color: '#cbd5e1', fontSize: 9.5 }}>
                    <span>كلمة السر: </span>
                    <strong style={{ color: '#ffffff', letterSpacing: '0.8px' }}>tfg@2026</strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#94a3b8', fontSize: 9.5 }}>
                    <Phone size={10} />
                    <span>الاستقبال: </span>
                    <span style={{ color: '#ffffff', direction: 'ltr' }}>{systemInfo?.phone || '01000000000'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#34d399', fontSize: 9.5 }}>
                    <ShieldCheck size={10} />
                    <span>عضوية ومحفظة معتمدة ✓</span>
                  </div>
                </div>
              </div>

              {/* Bottom Barcode */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 4, textAlign: 'center' }}>
                <div style={{
                  height: 14,
                  background: 'repeating-linear-gradient(90deg, #ffffff, #ffffff 2px, transparent 2px, transparent 4px, #ffffff 4px, #ffffff 6px, transparent 6px, transparent 8px)',
                  opacity: 0.5,
                  margin: '0 auto 2px',
                  maxWidth: 160
                }} />
                <div style={{ fontSize: 8.5, color: '#64748b' }}>
                  The First Group Wallet Pass • {formattedId}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Action Buttons Row */}
      <div style={{ display: 'flex', gap: 6, width: '100%', justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={handleToggleFlip}
          style={{
            flex: 1,
            minWidth: 100,
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: 10,
            padding: '7px 10px',
            color: '#ffffff',
            fontSize: 11.5,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            transition: 'all 0.15s ease',
            fontFamily: 'Cairo, sans-serif'
          }}
        >
          <RotateCw size={12} />
          <span>{isFlipped ? 'الوجه الأمامي' : 'الوجه الخلفي'}</span>
        </button>

        <button
          type="button"
          onClick={handleDownloadCard}
          disabled={downloading}
          style={{
            flex: 1,
            minWidth: 105,
            background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
            border: 'none',
            borderRadius: 10,
            padding: '7px 10px',
            color: '#ffffff',
            fontSize: 11.5,
            fontWeight: 800,
            cursor: downloading ? 'not-allowed' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            boxShadow: '0 3px 10px rgba(2, 132, 199, 0.35)',
            transition: 'all 0.15s ease',
            fontFamily: 'Cairo, sans-serif'
          }}
        >
          <Download size={12} />
          <span>{downloading ? 'جاري التحميل...' : 'حفظ كصورة'}</span>
        </button>

        <button
          type="button"
          onClick={handleCopyLink}
          style={{
            flex: 1,
            minWidth: 100,
            background: copied ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.08)',
            border: copied ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: 10,
            padding: '7px 10px',
            color: copied ? '#34d399' : '#cbd5e1',
            fontSize: 11.5,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            transition: 'all 0.15s ease',
            fontFamily: 'Cairo, sans-serif'
          }}
        >
          {copied ? <Check size={12} color="#34d399" /> : <Copy size={12} />}
          <span>{copied ? 'تم النسخ!' : 'نسخ الرابط'}</span>
        </button>
      </div>
    </div>
  );
}
