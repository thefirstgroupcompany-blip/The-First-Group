import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyD5rfKKPwszn4MU_OXp6ffUbCgTZo0J_ak",
  authDomain: "the-first-group-co.firebaseapp.com",
  projectId: "the-first-group-co",
  storageBucket: "the-first-group-co.firebasestorage.app",
  messagingSenderId: "707174957075",
  appId: "1:707174957075:web:044529b7db0b2518243fe6",
  measurementId: "G-FQF7V4DVV9"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function runAudit() {
  console.log('=== STARTING FULL PRODUCTION FORENSIC AUDIT ===\n');

  const report = {
    clients: { total: 0, negativeWallets: [], debtDiscrepancies: [] },
    inventory: { total: 0, negativeStock: [] },
    shifts: { total: 0, open: 0, closed: 0, varianceAnomalies: [] },
    cafeShifts: { total: 0, open: 0, closed: 0, varianceAnomalies: [] },
    vouchers: { total: 0, orphaned: [], closedShiftDiscrepancies: [] },
    adminTransfers: { totalCafeTransfers: 0, duplicateTransfers: [] }
  };

  // 1. CLIENTS AUDIT
  console.log('--- 1. Auditing Clients & Subscriptions ---');
  const clientsSnap = await getDocs(collection(db, 'clients'));
  report.clients.total = clientsSnap.size;

  clientsSnap.forEach(snap => {
    const c = snap.data();
    const wallet = Number(c.walletBalance || 0);
    if (wallet < 0) {
      report.clients.negativeWallets.push({ id: snap.id, name: c.name, walletBalance: wallet });
    }

    // Check subscriptions debt consistency
    let calculatedDebt = 0;
    if (Array.isArray(c.subscriptions)) {
      c.subscriptions.forEach(sub => {
        const remaining = Number(sub.remainingAmount ?? (Number(sub.price || 0) - Number(sub.paidAmount || 0)));
        if (remaining > 0 && sub.status !== 'cancelled') {
          calculatedDebt += remaining;
        }
      });
    }

    const recordedDebt = Number(c.totalDebt || 0);
    if (Math.abs(calculatedDebt - recordedDebt) > 1 && (calculatedDebt > 0 || recordedDebt > 0)) {
      report.clients.debtDiscrepancies.push({
        id: snap.id,
        name: c.name,
        phone: c.phone,
        recordedDebt,
        calculatedDebt,
        diff: Math.round((calculatedDebt - recordedDebt) * 100) / 100
      });
    }
  });
  console.log(`Audited ${report.clients.total} clients. Negative wallets: ${report.clients.negativeWallets.length}, Debt discrepancies: ${report.clients.debtDiscrepancies.length}`);

  // 2. INVENTORY AUDIT
  console.log('\n--- 2. Auditing Cafe Inventory ---');
  const invSnap = await getDocs(collection(db, 'cafe_inventory'));
  report.inventory.total = invSnap.size;

  invSnap.forEach(snap => {
    const item = snap.data();
    const stock = Number(item.currentStock ?? item.stock ?? 0);
    if (stock < 0) {
      report.inventory.negativeStock.push({ id: snap.id, name: item.name, stock });
    }
  });
  console.log(`Audited ${report.inventory.total} inventory items. Negative stock items: ${report.inventory.negativeStock.length}`);

  // 3. SHIFTS AUDIT
  console.log('\n--- 3. Auditing Front Desk Shifts ---');
  const shiftsSnap = await getDocs(collection(db, 'shifts'));
  report.shifts.total = shiftsSnap.size;

  shiftsSnap.forEach(snap => {
    const s = snap.data();
    if (s.status === 'open') {
      report.shifts.open++;
    } else if (s.status === 'closed') {
      report.shifts.closed++;
      const startCash = Number(s.startCash || 0);
      const cashRev = Number(s.cashRevenue || (s.totalRevenue ? Number(s.totalRevenue) : 0));
      const exp = Number(s.totalExpenses || 0);
      const expectedCash = Number(s.expectedCash ?? (startCash + cashRev - exp));
      const drawerCash = Number(s.drawerCash || 0);
      const diff = Math.abs(expectedCash - drawerCash);
      if (diff > 5 && !s.varianceExplanation && !s.notes) {
        report.shifts.varianceAnomalies.push({
          id: snap.id,
          employee: s.userName || s.openedBy,
          expectedCash,
          drawerCash,
          diff
        });
      }
    }
  });
  console.log(`Audited ${report.shifts.total} shifts (${report.shifts.closed} closed, ${report.shifts.open} open). Unexplained variances: ${report.shifts.varianceAnomalies.length}`);

  // 4. CAFE SHIFTS AUDIT
  console.log('\n--- 4. Auditing Cafe Shifts ---');
  const cafeShiftsSnap = await getDocs(collection(db, 'cafe_shifts'));
  report.cafeShifts.total = cafeShiftsSnap.size;

  cafeShiftsSnap.forEach(snap => {
    const cs = snap.data();
    if (cs.status === 'open') {
      report.cafeShifts.open++;
    } else if (cs.status === 'closed') {
      report.cafeShifts.closed++;
    }
  });
  console.log(`Audited ${report.cafeShifts.total} cafe shifts (${report.cafeShifts.closed} closed, ${report.cafeShifts.open} open).`);

  // 5. CAFE TRANSFERS INTEGRITY (Admin Revenues)
  console.log('\n--- 5. Auditing Central Admin Cafe Transfers & Expenses ---');
  const adminRevSnap = await getDocs(collection(db, 'admin_revenues'));
  const cafeTransferMap = new Map();
  adminRevSnap.forEach(snap => {
    const rev = snap.data();
    if (rev.isCafeTransfer || rev.category === 'cafe' || snap.id.startsWith('cafe_shift_rev_')) {
      report.adminTransfers.totalCafeTransfers++;
      const shiftRef = rev.cafeShiftId || snap.id.replace('cafe_shift_rev_', '');
      if (cafeTransferMap.has(shiftRef)) {
        report.adminTransfers.duplicateTransfers.push({
          shiftRef,
          ids: [cafeTransferMap.get(shiftRef), snap.id]
        });
      } else {
        cafeTransferMap.set(shiftRef, snap.id);
      }
    }
  });
  console.log(`Audited ${adminRevSnap.size} admin revenues. Cafe transfers: ${report.adminTransfers.totalCafeTransfers}, Duplicates: ${report.adminTransfers.duplicateTransfers.length}`);

  // 6. PAYMENTS AUDIT
  console.log('\n--- 6. Auditing Payments Collection ---');
  report.payments = { total: 0, orphanedClient: [], invalidAmounts: [] };
  const paySnap = await getDocs(collection(db, 'payments'));
  report.payments.total = paySnap.size;
  const clientIds = new Set(clientsSnap.docs.map(d => d.id));
  paySnap.forEach(snap => {
    const p = snap.data();
    const amount = Number(p.amount || 0);
    if (isNaN(amount) || amount <= 0) {
      report.payments.invalidAmounts.push({ id: snap.id, amount: p.amount });
    }
    if (p.clientId && !clientIds.has(p.clientId)) {
      report.payments.orphanedClient.push({ id: snap.id, clientId: p.clientId });
    }
  });
  console.log(`Audited ${report.payments.total} payments. Invalid amounts: ${report.payments.invalidAmounts.length}, Orphaned client refs: ${report.payments.orphanedClient.length}`);

  // 7. SYSTEM USERS & ROLES AUDIT
  console.log('\n--- 7. Auditing System Users & Security ---');
  report.users = { total: 0, missingRoles: [], insecureUsers: [] };
  const usersSnap = await getDocs(collection(db, 'users'));
  report.users.total = usersSnap.size;
  usersSnap.forEach(snap => {
    const u = snap.data();
    if (!u.role) {
      report.users.missingRoles.push({ id: snap.id, username: u.username });
    }
  });
  console.log(`Audited ${report.users.total} system users. Missing roles: ${report.users.missingRoles.length}`);

  // 8. WORKSPACE SESSIONS AUDIT
  console.log('\n--- 8. Auditing Workspace Sessions ---');
  report.workspaceSessions = { total: 0, unclosedOldSessions: [] };
  const wsSnap = await getDocs(collection(db, 'workspace_sessions'));
  report.workspaceSessions.total = wsSnap.size;
  const now = Date.now();
  wsSnap.forEach(snap => {
    const ws = snap.data();
    if (ws.status === 'active') {
      const startTime = ws.startTime ? (ws.startTime.toMillis ? ws.startTime.toMillis() : new Date(ws.startTime).getTime()) : 0;
      // If open for more than 48 hours, flag it
      if (startTime > 0 && (now - startTime) > 48 * 3600 * 1000) {
        report.workspaceSessions.unclosedOldSessions.push({ id: snap.id, clientName: ws.clientName, hoursOpen: Math.round((now - startTime) / 3600000) });
      }
    }
  });
  console.log(`Audited ${report.workspaceSessions.total} workspace sessions. Stale (>48h) sessions: ${report.workspaceSessions.unclosedOldSessions.length}`);

  console.log('\n=== 📊 AUDIT RESULTS SUMMARY ===');
  console.log(JSON.stringify(report, null, 2));

  return report;
}

runAudit().then(() => {
  console.log('\nAudit execution complete.');
  process.exit(0);
}).catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
