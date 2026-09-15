// PERF-02: xlsx is loaded on-demand (dynamic import) to reduce initial bundle size
// ~250KB library is only downloaded when the user actually exports to Excel

/**
 * 100% Valid Native Arabic Excel (.xlsx) Generator using SheetJS (XLSX)
 * Creates OpenXML binary spreadsheets with RTL orientation and auto column widths.
 */
export async function exportToExcel(arg1, arg2, arg3, arg4 = {}) {
  const XLSX = await import('xlsx');
  let filename = 'تقرير_النظام';
  let sheets = [];

  if (typeof arg1 === 'object' && arg1 !== null && !Array.isArray(arg1)) {
    // Object configuration mode: { filename, sheets, headers, rows }
    filename = arg1.filename || 'تقرير_النظام';
    if (Array.isArray(arg1.sheets) && arg1.sheets.length > 0) {
      sheets = arg1.sheets;
    } else {
      sheets = [{
        title: arg1.title || 'البيانات',
        headers: arg1.headers || [],
        rows: arg1.rows || []
      }];
    }
  } else {
    // Positional arguments mode: (filename, headers, rows, options)
    filename = arg1 || 'تقرير_النظام';
    sheets = [{
      title: 'البيانات',
      headers: arg2 || [],
      rows: arg3 || []
    }];
  }

  const cleanFilename = String(filename).replace(/[/\\?%*:|"<>]/g, '_');
  const nowStr = new Date().toLocaleDateString('ar-EG-u-nu-latn', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Cairo'
  });

  const wb = XLSX.utils.book_new();

  sheets.forEach((sheetConfig, sIdx) => {
    const sheetTitle = (sheetConfig.title || `ورقة_${sIdx + 1}`).replace(/[/\\?*:[\]]/g, '_').slice(0, 31);
    const headers = sheetConfig.headers || [];
    const rows = sheetConfig.rows || [];

    // 1. Prepare worksheet rows array
    const wsData = [
      ['🏢 THE FIRST GROUP'],
      [`📊 ${sheetTitle}`],
      [`📅 تاريخ الاستخراج: ${nowStr}  |  📋 إجمالي السجلات: ${rows.length} سجل`],
      [], // Empty spacing row
      headers, // Table Headers row
      ...rows // All Data rows
    ];

    // 2. Create worksheet
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // 3. Set Right-to-Left (RTL) mode for Arabic
    if (!ws['!views']) ws['!views'] = [];
    ws['!views'].push({ rightToLeft: true });
    ws['!rtl'] = true;

    // 4. Calculate auto column widths
    const colWidths = headers.map((header, colIdx) => {
      let maxLen = String(header || '').length;
      rows.forEach(row => {
        const cellVal = row[colIdx];
        if (cellVal !== null && cellVal !== undefined) {
          const len = String(cellVal).length;
          if (len > maxLen) maxLen = len;
        }
      });
      return { wch: Math.max(maxLen + 4, 15) };
    });
    ws['!cols'] = colWidths;

    // 5. Merge top branding rows across all columns
    const lastColIdx = Math.max(headers.length - 1, 3);
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: lastColIdx } }, // Title 1
      { s: { r: 1, c: 0 }, e: { r: 1, c: lastColIdx } }, // Title 2
      { s: { r: 2, c: 0 }, e: { r: 2, c: lastColIdx } }, // Metadata
    ];

    // 6. Append sheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, sheetTitle);
  });

  // Set workbook RTL view
  wb.Workbook = {
    Views: [{ RTL: true }]
  };

  // 7. Write as Uint8Array / ArrayBuffer
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  const fullFileName = `${cleanFilename}_${new Date().toISOString().split('T')[0]}.xlsx`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fullFileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
