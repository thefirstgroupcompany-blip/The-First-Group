
function sanitizeLogo(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string' || rawUrl === '/logo.png') return '/logo-dark.png';
  const trimmed = rawUrl.trim();
  const match = trimmed.match(/src=["']([^"']+)["']/i);
  if (match && match[1]) {
    const u = match[1];
    return u === '/logo.png' ? '/logo-dark.png' : u;
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/') || trimmed.startsWith('data:')) {
    return trimmed === '/logo.png' ? '/logo-dark.png' : trimmed;
  }
  return '/logo-dark.png';
}

import { formatCurrency, formatDateTime } from './constants';

export const printShiftReport = ({ shift, payments = [], tickets = [], systemInfo = {}, clients = [] }) => {
  const win = window.open('', '_blank');
  if (!win) {
    alert('يرجى السماح بالنوافذ المنبثقة (Popups) لتتمكن من الطباعة');
    return;
  }

  const logoUrl = sanitizeLogo(systemInfo?.logoUrl);
  const orgName = systemInfo?.name || 'THE FIRST GROUP';
  const shiftCode = `SHF-${(shift.id || '').slice(-6).toUpperCase()}`;

  // Enrich payments with client name, memberId, and receiptNo (filter out voided payments)
  const validPayments = payments.filter(p => !p.isVoided);
  const enrichedPayments = validPayments.map((p, idx) => {
    const c = clients.find(cl => cl.id === p.clientId);
    const clientName = p.clientName || c?.name || 'مشترك';
    const memberId = p.memberId || c?.memberId || '—';
    const receiptNo = p.receiptNo || `REC-${(p.id || '').slice(-6).toUpperCase() || (1000 + idx)}`;
    return {
      ...p,
      clientName,
      memberId,
      receiptNo
    };
  });

  const totalPaymentsAmount = enrichedPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const totalTicketsAmount = tickets.reduce((sum, t) => sum + (Number(t.total) || (Number(t.quantity) * Number(t.ticketPrice)) || 0), 0);
  const totalRevsAmount = Array.isArray(shift.revenues) ? shift.revenues.reduce((sum, r) => sum + (Number(r?.amount) || 0), 0) : Number(shift.revenues || 0);
  const totalExpAmount = Array.isArray(shift.expenses) ? shift.expenses.reduce((sum, e) => sum + (Number(e?.amount) || 0), 0) : Number(shift.expenses || shift.totalExpenses || 0);

  const calculatedRevenue = totalPaymentsAmount + totalTicketsAmount + totalRevsAmount;
  const calculatedExpenses = totalExpAmount;
  const calculatedNet = calculatedRevenue - calculatedExpenses;

  const html = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <title>تقرير المناوبة — ${shift.employeeName || 'موظف'}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
        
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body {
          font-family: 'Cairo', sans-serif;
          direction: rtl;
          color: #1e293b;
          background: #ffffff;
          padding: 24px;
          font-size: 13px;
          line-height: 1.5;
        }

        @media print {
          body {
            padding: 12px;
          }
          .no-print {
            display: none !important;
          }
        }

        .report-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 2px solid #0f172a;
          padding-bottom: 14px;
          margin-bottom: 16px;
        }

        .header-logo {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .header-logo img {
          height: 48px;
          max-width: 140px;
          object-fit: contain;
          filter: brightness(0);
          -webkit-filter: brightness(0);
        }

        .header-title {
          text-align: left;
        }

        .badge-status {
          display: inline-block;
          padding: 3px 10px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 700;
        }
        .status-open {
          background: #fef3c7;
          color: #92400e;
          border: 1px solid #fde68a;
        }
        .status-closed {
          background: #dcfce7;
          color: #166534;
          border: 1px solid #bbf7d0;
        }

        .meta-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 12px 16px;
          margin-bottom: 18px;
        }

        .meta-item {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
        }

        .meta-item span {
          color: #64748b;
        }

        .meta-item strong {
          color: #0f172a;
        }

        .section-title {
          font-size: 15px;
          font-weight: 800;
          color: #0f172a;
          margin: 18px 0 8px;
          display: flex;
          align-items: center;
          gap: 6px;
          border-bottom: 1.5px solid #cbd5e1;
          padding-bottom: 4px;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 12px;
        }

        th, td {
          border: 1px solid #cbd5e1;
          padding: 8px 10px;
          text-align: right;
          font-size: 12px;
        }

        th {
          background: #f1f5f9;
          color: #334155;
          font-weight: 700;
        }

        tr:nth-child(even) {
          background: #fafafa;
        }

        .table-total {
          background: #f8fafc;
          font-weight: 800;
        }

        .amount-green {
          color: #059669;
          font-weight: 800;
          text-align: left;
        }

        .amount-red {
          color: #dc2626;
          font-weight: 800;
          text-align: left;
        }

        .summary-box {
          margin-top: 22px;
          border: 2px solid #0f172a;
          border-radius: 10px;
          padding: 14px;
          background: #ffffff;
        }

        .summary-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          text-align: center;
        }

        .summary-card {
          padding: 12px 8px;
          border-radius: 8px;
          border: 1px solid #cbd5e1;
        }

        .summary-card.revenue {
          background: #f0fdf4;
          border-color: #86efac;
        }

        .summary-card.expense {
          background: #fef2f2;
          border-color: #fca5a5;
        }

        .summary-card.net {
          background: #eff6ff;
          border-color: #93c5fd;
        }

        .summary-card p {
          font-size: 12px;
          color: #475569;
          font-weight: 600;
          margin-bottom: 4px;
        }

        .summary-card h3 {
          font-size: 18px;
          font-weight: 900;
        }

        .signatures {
          margin-top: 36px;
          display: flex;
          justify-content: space-between;
          padding: 0 20px;
        }

        .signature-col {
          text-align: center;
        }

        .signature-line {
          margin-top: 35px;
          width: 180px;
          border-top: 1px dashed #64748b;
        }
      </style>
    </head>
    <body>

      <!-- Top Header -->
      <div class="report-header">
        <div class="header-logo">
          <img src="${logoUrl}" alt="Logo" style="height: 48px; max-width: 140px; object-fit: contain; filter: brightness(0); -webkit-filter: brightness(0);" onerror="this.onerror=null; this.src='/logo-dark.png';" />
          <div>
            <h2 style="font-size: 18px; font-weight: 900; color: #0f172a;">${orgName}</h2>
            <p style="font-size: 12px; color: #64748b;">تقرير المناوبة التفصيلي وإغلاق الخزينة</p>
          </div>
        </div>
        <div class="header-title">
          <span class="badge-status ${shift.status === 'open' ? 'status-open' : 'status-closed'}">
            ${shift.status === 'open' ? '🟡 مناوبة مفتوحة' : '✅ مناوبة مغلقة'}
          </span>
          <p style="font-size: 11px; color: #64748b; margin-top: 4px;">كود المناوبة: <strong>${shiftCode}</strong></p>
        </div>
      </div>

      <!-- Shift Metadata -->
      <div class="meta-grid">
        <div class="meta-item">
          <span>الموظف المسئول:</span>
          <strong>${shift.employeeName || 'موظف'}</strong>
        </div>
        <div class="meta-item">
          <span>تاريخ الطباعة:</span>
          <strong>${new Date().toLocaleString('ar-EG-u-nu-latn')}</strong>
        </div>
        <div class="meta-item">
          <span>وقت فتح المناوبة:</span>
          <strong>${formatDateTime(shift.openedAt)}</strong>
        </div>
        <div class="meta-item">
          <span>وقت إغلاق المناوبة:</span>
          <strong>${shift.closedAt ? formatDateTime(shift.closedAt) : '— (مفتوحة حالياً)'}</strong>
        </div>
      </div>

      <!-- Subscriptions & Payments Table -->
      <div class="section-title">
        <span>📦</span> الاشتراكات والمدفوعات المحصلة (${enrichedPayments.length})
      </div>
      ${enrichedPayments.length === 0 ? `
        <p style="color:#64748b; font-size:12px; margin-bottom:12px; text-align:center;">لا توجد اشتراكات أو مدفوعات مسجلة في هذه المناوبة</p>
      ` : `
        <table>
          <thead>
            <tr>
              <th style="width: 35px; text-align: center;">#</th>
              <th style="width: 110px;">رقم الإيصال</th>
              <th>اسم المشترك</th>
              <th style="width: 90px; text-align: center;">رقم العضوية</th>
              <th>نوع العملية / الباقة</th>
              <th style="width: 100px; text-align: left;">المبلغ المحصل</th>
            </tr>
          </thead>
          <tbody>
            ${enrichedPayments.map((p, idx) => `
              <tr>
                <td style="text-align: center; color: #64748b;">${idx + 1}</td>
                <td><strong style="color: #0284c7;">${p.receiptNo}</strong></td>
                <td><strong>${p.clientName}</strong></td>
                <td style="text-align: center; color: #3b82f6; font-weight: 700;">${p.memberId}</td>
                <td>${p.note || 'اشتراك / دفعة'}</td>
                <td class="amount-green">${formatCurrency(p.amount)}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr class="table-total">
              <td colspan="5" style="text-align: right;">إجمالي مدفوعات الاشتراكات:</td>
              <td class="amount-green">${formatCurrency(totalPaymentsAmount)}</td>
            </tr>
          </tfoot>
        </table>
      `}

      <!-- Tickets Sales Table -->
      ${tickets.length > 0 ? `
        <div class="section-title">
          <span>🎫</span> مبيعات التذاكر (${tickets.length})
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 35px; text-align: center;">#</th>
              <th>نوع التذكرة</th>
              <th style="width: 80px; text-align: center;">العدد</th>
              <th style="width: 100px; text-align: center;">سعر التذكرة</th>
              <th style="width: 110px; text-align: left;">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            ${tickets.map((t, idx) => `
              <tr>
                <td style="text-align: center; color: #64748b;">${idx + 1}</td>
                <td><strong>${t.ticketName}</strong></td>
                <td style="text-align: center;">${t.quantity}</td>
                <td style="text-align: center;">${formatCurrency(t.ticketPrice)}</td>
                <td class="amount-green">${formatCurrency(t.total || (t.quantity * t.ticketPrice))}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr class="table-total">
              <td colspan="4" style="text-align: right;">إجمالي مبيعات التذاكر:</td>
              <td class="amount-green">${formatCurrency(totalTicketsAmount)}</td>
            </tr>
          </tfoot>
        </table>
      ` : ''}

      <!-- Additional Revenues -->
      ${Array.isArray(shift.revenues) && shift.revenues.length > 0 ? `
        <div class="section-title">
          <span>💰</span> الإيرادات الإضافية (${shift.revenues.length})
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 35px; text-align: center;">#</th>
              <th>البيان / البند</th>
              <th style="width: 110px; text-align: left;">المبلغ</th>
            </tr>
          </thead>
          <tbody>
            ${shift.revenues.map((r, idx) => `
              <tr>
                <td style="text-align: center; color: #64748b;">${idx + 1}</td>
                <td>${r.label || 'إيراد'}</td>
                <td class="amount-green">${formatCurrency(r.amount)}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr class="table-total">
              <td colspan="2" style="text-align: right;">إجمالي الإيرادات الإضافية:</td>
              <td class="amount-green">${formatCurrency(totalRevsAmount)}</td>
            </tr>
          </tfoot>
        </table>
      ` : ''}

      <!-- Expenses Table -->
      ${Array.isArray(shift.expenses) && shift.expenses.length > 0 ? `
        <div class="section-title">
          <span>💸</span> المصاريف والمسحوبات (${shift.expenses.length})
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 35px; text-align: center;">#</th>
              <th>بند المصروف / البيان</th>
              <th style="width: 110px; text-align: left;">المبلغ</th>
            </tr>
          </thead>
          <tbody>
            ${shift.expenses.map((e, idx) => `
              <tr>
                <td style="text-align: center; color: #64748b;">${idx + 1}</td>
                <td>${e.label}</td>
                <td class="amount-red">${formatCurrency(e.amount)}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr class="table-total">
              <td colspan="2" style="text-align: right;">إجمالي المصاريف:</td>
              <td class="amount-red">${formatCurrency(totalExpAmount)}</td>
            </tr>
          </tfoot>
        </table>
      ` : ''}

      
      
      <!-- Handover & Cash Settlement Audit Box -->
      ${(shift.actualCash !== undefined || shift.handoverNotes || shift.receivedBy) ? `
        <div style="background: #f8fafc; border: 1.5px solid #0f172a; border-radius: 8px; padding: 14px 16px; margin-bottom: 18px;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed #cbd5e1; padding-bottom: 6px; margin-bottom: 10px;">
            <h4 style="margin: 0; color: #0f172a; font-size: 14px; font-weight: 800;">
              📋 محضر تسليم وجرد النقدية الفعلي (CASH AUDIT & HANDOVER)
            </h4>
            ${shift.adjustedAt ? '<span style="background: #fef3c7; color: #92400e; border: 1px solid #fde68a; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700;">نسخة مصححة ومعتمدة ✏️</span>' : ''}
          </div>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 8px; text-align: center;">
            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px;">
              <span style="font-size: 11px; color: #64748b; display: block;">الصافي المفترض بالسيستم</span>
              <strong style="color: #0f172a; font-size: 15px;">${formatCurrency(shift.expectedCash != null ? shift.expectedCash : (shift.netAmount != null ? shift.netAmount : calculatedNet))}</strong>
            </div>
            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px;">
              <span style="font-size: 11px; color: #64748b; display: block;">النقدية الفعلية المسلمة</span>
              <strong style="color: #059669; font-size: 15px;">${formatCurrency(shift.actualCash != null ? shift.actualCash : (shift.netAmount != null ? shift.netAmount : calculatedNet))}</strong>
            </div>
            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px;">
              <span style="font-size: 11px; color: #64748b; display: block;">الفارق (عجز / زيادة)</span>
              <strong style="color: ${(shift.cashDifference || 0) < 0 ? '#dc2626' : (shift.cashDifference || 0) > 0 ? '#059669' : '#0f172a'}; font-size: 15px;">
                ${(shift.cashDifference || 0) === 0 ? 'مطابق تماماً ✅' : `${(shift.cashDifference || 0) > 0 ? '+' : ''}${formatCurrency(shift.cashDifference)}`}
              </strong>
            </div>
          </div>
          ${shift.receivedBy ? `<p style="font-size: 12px; margin-bottom: 4px;"><strong>تم تسليم النقدية إلى ممثل الإدارة:</strong> ${shift.receivedBy}</p>` : ''}
          ${shift.handoverNotes ? `<p style="font-size: 12px; color: #475569; margin: 0;"><strong>ملاحظات التسليم:</strong> ${shift.handoverNotes}</p>` : ''}
        </div>
      ` : ''}

      <!-- Financial Summary Box -->
      <div class="summary-box">
        <div class="summary-grid">
          <div class="summary-card revenue">
            <p>🟢 إجمالي الإيرادات</p>
            <h3 style="color: #059669;">${formatCurrency(shift.totalRevenue != null ? shift.totalRevenue : calculatedRevenue)}</h3>
          </div>
          <div class="summary-card expense">
            <p>🔴 إجمالي المصاريف</p>
            <h3 style="color: #dc2626;">${formatCurrency(shift.totalExpenses != null ? shift.totalExpenses : calculatedExpenses)}</h3>
          </div>
          <div class="summary-card net">
            <p>🔵 الصافي للخزنة (العهدة)</p>
            <h3 style="color: #2563eb;">${formatCurrency(shift.netAmount != null ? shift.netAmount : calculatedNet)}</h3>
          </div>
        </div>
      </div>

      <!-- Signatures -->
      <div class="signatures">
        <div class="signature-col">
          <p><strong>توقيع الموظف المسئول</strong></p>
          <p style="font-size: 11px; color: #64748b;">${shift.employeeName || ''}</p>
          <div class="signature-line"></div>
        </div>
        <div class="signature-col">
          <p><strong>توقيع الإدارة / الاستلام</strong></p>
          <p style="font-size: 11px; color: #64748b;">المدير العام</p>
          <div class="signature-line"></div>
        </div>
      </div>

    </body>
    </html>
  `;

  win.document.write(html);
  win.document.close();
  setTimeout(() => {
    win.print();
  }, 350);
};
