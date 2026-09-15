/**
 * Thermal Printer Engine (80mm & 58mm)
 * Designed for Point-of-Sale (POS) thermal receipt printers (Epson, Xprinter, Sunmi, Rongta, etc.)
 */

export function printThermalReceipt({
  type = 'cafe', // 'cafe' | 'ticket' | 'voucher'
  paperWidth = '80mm', // '80mm' | '58mm'
  data = {},
  orgName = 'THE FIRST GROUP',
  orgSubTitle = 'Coworking Space & Cafe'
}) {
  const is58 = paperWidth === '58mm';
  const contentWidth = is58 ? '48mm' : '72mm';
  const baseFontSize = is58 ? '10px' : '11.5px';
  const titleFontSize = is58 ? '14px' : '16px';
  const dashedLine = is58 ? '--------------------------------' : '--------------------------------------------';

  const now = new Date();
  const dateStr = data.date || now.toLocaleDateString('ar-EG-u-nu-latn');
  const timeStr = now.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });

  let receiptBody = '';

  // 1. Cafe POS Receipt Template
  if (type === 'cafe') {
    const items = data.items || [];
    const itemsRows = items.map(item => `
      <tr>
        <td style="padding: 2px 0; text-align: right; font-weight: 700;">${item.name}</td>
        <td style="padding: 2px 0; text-align: center;">${item.qty}x${item.price || item.unitPrice}</td>
        <td style="padding: 2px 0; text-align: left; font-weight: 700;">${(Number(item.qty || 1) * Number(item.price || item.unitPrice || 0)).toFixed(1)}</td>
      </tr>
    `).join('');

    const subtotal = Number(data.subtotal || data.total || 0);
    const discount = Number(data.discount || 0);
    const total = Number(data.total || subtotal - discount);

    const paymentLabels = {
      cash: 'نقدي (كاش)',
      visa: 'فيزا / ماستركارد',
      wallet: 'محفظة العضو',
      vodafone_cash: 'فودافون كاش',
      instapay: 'انستاباي'
    };
    const paymentLabel = paymentLabels[data.paymentMethod] || data.paymentMethod || 'نقدي';

    receiptBody = `
      <div style="text-align: center; margin-bottom: 6px;">
        <h2 style="font-size: ${titleFontSize}; font-weight: 900; margin: 0;">${orgName}</h2>
        <p style="font-size: 10px; margin: 2px 0;">☕ TFG | CAFE & LOUNGE</p>
        <p style="font-size: 9.5px; margin: 2px 0;">التاريخ: ${dateStr} - ${timeStr}</p>
        <p style="font-size: 11px; font-weight: 900; margin: 3px 0;">رقم الفاتورة: #${data.orderId || data.id || Date.now().toString().slice(-6)}</p>
        ${data.buyerName ? `<p style="font-size: 10px; margin: 1px 0;">العميل: ${data.buyerName}</p>` : ''}
        ${data.cashierName ? `<p style="font-size: 9.5px; margin: 1px 0;">الكاشير: ${data.cashierName}</p>` : ''}
      </div>

      <div style="text-align: center; font-size: 10px; margin: 4px 0;">${dashedLine}</div>

      <table style="width: 100%; border-collapse: collapse; font-size: ${baseFontSize};">
        <thead>
          <tr style="border-bottom: 1px dashed #000;">
            <th style="text-align: right; padding-bottom: 3px;">الصنف</th>
            <th style="text-align: center; padding-bottom: 3px;">الكمية</th>
            <th style="text-align: left; padding-bottom: 3px;">السعر</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>

      <div style="text-align: center; font-size: 10px; margin: 4px 0;">${dashedLine}</div>

      <table style="width: 100%; font-size: ${baseFontSize}; margin-bottom: 6px;">
        ${discount > 0 ? `
          <tr>
            <td style="text-align: right;">المجموع الفرعي:</td>
            <td style="text-align: left;">${subtotal.toFixed(2)} ج.م</td>
          </tr>
          <tr>
            <td style="text-align: right;">الخصم:</td>
            <td style="text-align: left;">-${discount.toFixed(2)} ج.م</td>
          </tr>
        ` : ''}
        <tr style="font-size: ${is58 ? '13px' : '15px'}; font-weight: 900;">
          <td style="text-align: right; padding-top: 4px;">الإجمالي الصافي:</td>
          <td style="text-align: left; padding-top: 4px;">${total.toFixed(2)} ج.م</td>
        </tr>
        <tr style="font-size: 10px;">
          <td style="text-align: right; padding-top: 3px;">طريقة الدفع:</td>
          <td style="text-align: left; padding-top: 3px; font-weight: 700;">${paymentLabel}</td>
        </tr>
      </table>

      <div style="text-align: center; font-size: 10px; margin: 4px 0;">${dashedLine}</div>

      <div style="text-align: center; font-size: 9.5px; margin-top: 6px; line-height: 1.4;">
        <p style="margin: 2px 0; font-weight: 800;">شكراً لزيارتكم ونتمنى لكم وقتاً ممتعاً!</p>
        <p style="margin: 2px 0; font-size: 9px; color: #333;">كلمة سر الواي فاي: TFGCoworking2026</p>
        <p style="margin: 4px 0 0; font-size: 8.5px; font-family: monospace;">*** TFG POS SYSTEM ***</p>
      </div>
    `;
  }

  // 2. Day Pass Ticket / Visitor Pass Template
  else if (type === 'ticket') {
    const ticketId = data.ticketId || data.id || `TK-${Date.now().toString().slice(-6)}`;
    const price = Number(data.price || data.total || 0);

    receiptBody = `
      <div style="text-align: center; margin-bottom: 6px;">
        <h2 style="font-size: ${titleFontSize}; font-weight: 900; margin: 0;">${orgName}</h2>
        <p style="font-size: 10px; margin: 2px 0;">🎫 تذكرة دخول / DAY PASS</p>
        <p style="font-size: 9.5px; margin: 2px 0;">التاريخ: ${dateStr} - ${timeStr}</p>
        <div style="margin: 6px 0; padding: 4px 0; border: 2px dashed #000; font-size: 14px; font-weight: 900; letter-spacing: 1px;">
          #${ticketId}
        </div>
      </div>

      <div style="text-align: center; font-size: 10px; margin: 4px 0;">${dashedLine}</div>

      <table style="width: 100%; font-size: ${baseFontSize}; line-height: 1.6;">
        <tr>
          <td style="text-align: right; color: #222;">الاسم:</td>
          <td style="text-align: left; font-weight: 800;">${data.clientName || data.name || 'عميل كريم'}</td>
        </tr>
        <tr>
          <td style="text-align: right; color: #222;">نوع التذكرة:</td>
          <td style="text-align: left; font-weight: 700;">${data.ticketType || data.typeLabel || 'زيارة يومية'}</td>
        </tr>
        ${data.validUntil ? `
          <tr>
            <td style="text-align: right; color: #222;">صالحة حتى:</td>
            <td style="text-align: left; font-weight: 700;">${data.validUntil}</td>
          </tr>
        ` : ''}
        <tr>
          <td style="text-align: right; color: #222;">قيمة التذكرة:</td>
          <td style="text-align: left; font-size: 13px; font-weight: 900;">${price.toFixed(2)} ج.م</td>
        </tr>
        ${data.cashierName ? `
          <tr>
            <td style="text-align: right; color: #222;">المسؤول:</td>
            <td style="text-align: left;">${data.cashierName}</td>
          </tr>
        ` : ''}
      </table>

      <div style="text-align: center; font-size: 10px; margin: 6px 0;">${dashedLine}</div>

      <div style="text-align: center; margin: 6px 0;">
        <div style="font-family: monospace; font-size: 16px; font-weight: 900; letter-spacing: 4px; border-bottom: 1px solid #000; display: inline-block; padding: 2px 8px;">
          ||||| ||| ||||||| ||||
        </div>
        <p style="font-size: 9px; margin: 2px 0 0;">رمز الدخول: ${ticketId}</p>
      </div>

      <div style="text-align: center; font-size: 9px; margin-top: 6px; line-height: 1.4;">
        <p style="margin: 2px 0;">يرجى الاحتفاظ بالتذكرة طوال فترة التواجد</p>
        <p style="margin: 2px 0; font-weight: 700;">واي فاي: TFGCoworking2026</p>
        <p style="margin: 3px 0 0; font-size: 8.5px; font-family: monospace;">*** شـكـراً لـزيـارتـكـم ***</p>
      </div>
    `;
  }

  // 3. Voucher Receipt (سند قبض / صرف) Template
  else if (type === 'voucher') {
    const isReceipt = data.voucherType === 'receipt' || data.type === 'receipt';
    const voucherTitle = isReceipt ? 'سند قـبـض نـقـدي' : 'سند صـرف نـقـدي';
    const amount = Number(data.amount || 0);

    receiptBody = `
      <div style="text-align: center; margin-bottom: 6px;">
        <h2 style="font-size: ${titleFontSize}; font-weight: 900; margin: 0;">${orgName}</h2>
        <p style="font-size: 10px; margin: 2px 0;">🏛️ الإدارة المالية والخزينة</p>
        <div style="margin: 4px 0; padding: 3px; background: #000; color: #fff; font-size: 12px; font-weight: 900;">
          ${voucherTitle}
        </div>
        <p style="font-size: 9.5px; margin: 2px 0;">رقم السند: #${data.voucherNo || data.id || Date.now().toString().slice(-6)}</p>
        <p style="font-size: 9.5px; margin: 2px 0;">التاريخ: ${dateStr} - ${timeStr}</p>
      </div>

      <div style="text-align: center; font-size: 10px; margin: 4px 0;">${dashedLine}</div>

      <table style="width: 100%; font-size: ${baseFontSize}; line-height: 1.6;">
        <tr>
          <td style="text-align: right; color: #222;">${isReceipt ? 'استلمنا من:' : 'صرفنا إلى:'}</td>
          <td style="text-align: left; font-weight: 800;">${data.beneficiary || data.clientName || data.name || '—'}</td>
        </tr>
        <tr>
          <td style="text-align: right; color: #222;">المبلغ المدفوع:</td>
          <td style="text-align: left; font-size: 13px; font-weight: 900;">${amount.toFixed(2)} ج.م</td>
        </tr>
        ${data.category ? `
          <tr>
            <td style="text-align: right; color: #222;">البند / التصنيف:</td>
            <td style="text-align: left; font-weight: 700;">${data.category}</td>
          </tr>
        ` : ''}
        ${data.description || data.notes ? `
          <tr>
            <td style="text-align: right; color: #222; vertical-align: top;">البيان:</td>
            <td style="text-align: left;">${data.description || data.notes}</td>
          </tr>
        ` : ''}
        ${data.cashierName ? `
          <tr>
            <td style="text-align: right; color: #222;">المسؤول / الصراف:</td>
            <td style="text-align: left;">${data.cashierName}</td>
          </tr>
        ` : ''}
      </table>

      <div style="text-align: center; font-size: 10px; margin: 6px 0;">${dashedLine}</div>

      <table style="width: 100%; font-size: 9px; margin-top: 10px;">
        <tr>
          <td style="text-align: right; width: 50%;">توقيع المستلم:<br><br>.........................</td>
          <td style="text-align: left; width: 50%;">توقيع الخزينة:<br><br>.........................</td>
        </tr>
      </table>

      <div style="text-align: center; font-size: 8.5px; margin-top: 10px; font-family: monospace;">
        *** TFG FINANCIAL RECORDS ***
      </div>
    `;
  }

  // Generate full standalone printable HTML document
  const htmlContent = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <title>طباعة إيصال حراري - ${orgName}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
        
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        @page {
          size: ${paperWidth} auto;
          margin: 0;
        }

        body {
          font-family: 'Cairo', monospace, sans-serif;
          background: #ffffff;
          color: #000000;
          width: ${contentWidth};
          margin: 0 auto;
          padding: 4mm 2mm;
          line-height: 1.3;
          -webkit-font-smoothing: antialiased;
        }

        @media print {
          html, body {
            width: ${contentWidth};
            margin: 0 !important;
            padding: 2mm !important;
          }
        }
      </style>
    </head>
    <body>
      ${receiptBody}
      <script>
        window.onload = function() {
          window.focus();
          window.print();
          setTimeout(function() {
            window.close();
          }, 500);
        };
      </script>
    </body>
    </html>
  `;

  // Open printing window or iframe
  const printWindow = window.open('', '_blank', `width=400,height=600,top=100,left=100`);
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  } else {
    // Fallback: If popup blocked, create hidden iframe
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(htmlContent);
    doc.close();

    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 2000);
  }
}
