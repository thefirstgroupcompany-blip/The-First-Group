import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { roundCurrency, parseNum } from './db';

/**
 * Compute comprehensive net profit across all operational and administrative streams:
 * Front-desk Shifts + Cafe Shifts + Standalone Admin Revenues/Expenses.
 * Net profit = Σ totalRevenue - Σ totalExpenses.
 * Returns a formatted string for Telegram & System reporting.
 */
export async function computeNetProfit() {
  const [shiftsSnap, cafeSnap, adminRevSnap, adminExpSnap] = await Promise.all([
    getDocs(collection(db, 'shifts')),
    getDocs(collection(db, 'cafe_shifts')),
    getDocs(collection(db, 'admin_revenues')),
    getDocs(collection(db, 'admin_expenses'))
  ]);

  let totalRevenue = 0;
  let totalExpenses = 0;

  shiftsSnap.forEach(doc => {
    const data = doc.data();
    totalRevenue += parseNum(data.totalRevenue) || 0;
    totalExpenses += parseNum(data.totalExpenses) || 0;
  });

  cafeSnap.forEach(doc => {
    const data = doc.data();
    totalRevenue += parseNum(data.totalSales) || 0;
    totalExpenses += parseNum(data.totalExpenses) || 0;
  });

  adminRevSnap.forEach(doc => {
    const data = doc.data();
    // Exclude internal cafe transfers and partner equity injections to prevent skewing operating revenue
    if (!data.isCafeTransfer && data.category !== 'cafe' && data.category !== 'إيداع رأس مال الشركاء') {
      totalRevenue += parseNum(data.amount) || 0;
    }
  });

  adminExpSnap.forEach(doc => {
    const data = doc.data();
    // Exclude partner profit distributions and withdrawals from operational overhead
    if (data.category !== 'مسحوبات أرباح الشركاء' && data.category !== 'توزيعات أرباح الشركاء') {
      totalExpenses += parseNum(data.amount) || 0;
    }
  });

  totalRevenue = roundCurrency(totalRevenue);
  totalExpenses = roundCurrency(totalExpenses);
  const net = roundCurrency(totalRevenue - totalExpenses);

  const fmt = n => `${Number(n).toLocaleString('ar-EG-u-nu-latn')} ج.م`;
  return `*📈 صافي الأرباح الموحد (السنتر + الكافيه + الإدارة)*\n` +
         `إجمالي الإيرادات: ${fmt(totalRevenue)}\n` +
         `إجمالي المصروفات: ${fmt(totalExpenses)}\n` +
         `*الربح الصافي النهائي*: ${fmt(net)}`;
}

