// Shared constants across the system
export const EXPENSE_CATEGORIES = [
  { value: 'rent', label: 'إيجار' },
  { value: 'electricity', label: 'كهرباء' },
  { value: 'internet', label: 'إنترنت' },
  { value: 'profit_distribution', label: 'توزيع أرباح' },
  { value: 'salaries', label: 'مرتبات' },
  { value: 'maintenance', label: 'صيانة' },
  { value: 'supplies', label: 'مستلزمات' },
  { value: 'other', label: 'مصاريف أخرى' },
];

export const REVENUE_CATEGORIES = [
  { value: 'subscriptions', label: 'اشتراكات' },
  { value: 'sub_activities', label: 'إيراد الأنشطة الفرعية' },
  { value: 'sessions', label: 'حصص فردية' },
  { value: 'other', label: 'إيرادات أخرى' },
];

export const MONTHS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

export const DAYS_AR = [
  'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'
];

export const formatCurrency = (amount) => {
  const n = Math.round((Number(amount || 0) + Number.EPSILON) * 100) / 100;
  return `${n.toLocaleString('ar-EG-u-nu-latn', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ج.م`;
};

export const getTimeMode = () => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('tfg_time_mode');
    if (saved) return saved;
  }
  return 'standard'; // Default to standard time (UTC+2) to match user local clock
};

export const setTimeMode = (mode) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('tfg_time_mode', mode);
    window.dispatchEvent(new Event('tfg_time_mode_changed'));
  }
};

export const toggleTimeMode = () => {
  const next = getTimeMode() === 'dst' ? 'standard' : 'dst';
  setTimeMode(next);
  return next;
};

export const getEffectiveDate = (ts = new Date()) => {
  if (!ts) return null;
  let d;
  if (ts?.toDate) d = ts.toDate();
  else if (ts?.seconds) d = new Date(ts.seconds * 1000);
  else if (ts instanceof Date) d = new Date(ts.getTime());
  else d = new Date(ts);

  if (isNaN(d.getTime())) return null;

  // In standard mode (UTC+2), adjust for Chromium ICU automatic +1h DST in Egypt
  if (getTimeMode() === 'standard') {
    return new Date(d.getTime() - 3600000);
  }
  return d;
};

// Official Computer Time Formatter (Synchronized with user device clock)
export const formatComputerTime = (ts = new Date(), withSeconds = true) => {
  const d = getEffectiveDate(ts);
  if (!d) return '—';
  try {
    return d.toLocaleTimeString('ar-EG-u-nu-latn', {
      hour: '2-digit',
      minute: '2-digit',
      second: withSeconds ? '2-digit' : undefined,
      hour12: true
    });
  } catch {
    return '—';
  }
};

export const formatTime = (ts) => formatComputerTime(ts, false);

// Official Date Formatter
export const formatComputerDate = (ts = new Date()) => {
  const d = getEffectiveDate(ts);
  if (!d) return '—';
  try {
    return d.toLocaleDateString('ar-EG-u-nu-latn', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  } catch {
    return '—';
  }
};

export const formatDate = (ts) => {
  const d = getEffectiveDate(ts);
  if (!d) return '—';
  try {
    return d.toLocaleDateString('ar-EG-u-nu-latn', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  } catch {
    return '—';
  }
};

export const formatDateTime = (ts) => {
  if (!ts) return '—';
  try {
    return `${formatDate(ts)} - ${formatComputerTime(ts, false)}`;
  } catch {
    return '—';
  }
};

export const formatHoursClock = (hoursVal) => {
  const h = Number(hoursVal) || 0;
  const totalSeconds = Math.round(h * 3600);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

export const formatDurationArabic = (hoursVal) => {
  const h = Number(hoursVal) || 0;
  const totalMinutes = Math.round(h * 60);
  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hrs === 0) return `${mins} دقيقة`;
  if (mins === 0) return `${hrs} ساعة`;
  return `${hrs} ساعة و ${mins} دقيقة`;
};

export const getCurrentMonth = () => {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit' }).format(now);
  return parts; // YYYY-MM in Cairo timezone
};

export const getMonthLabel = (monthStr) => {
  if (!monthStr || typeof monthStr !== 'string' || !monthStr.includes('-')) return '—';
  const [year, month] = monthStr.split('-');
  const idx = parseInt(month, 10) - 1;
  const monthName = MONTHS_AR[idx] || month;
  return `${monthName} ${year || ''}`.trim();
};
