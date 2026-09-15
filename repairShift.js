import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function repair() {
  const shiftsSnap = await getDocs(collection(db, 'shifts'));
  let activeShiftId = null;
  for (const s of shiftsSnap.docs) {
    if (s.data().status === 'open') activeShiftId = s.id;
  }
  
  if (!activeShiftId) { console.log('No open shift to repair.'); process.exit(0); }
  
  const shiftRef = doc(db, 'shifts', activeShiftId);
  const shiftSnap = await getDoc(shiftRef);
  const shift = shiftSnap.data();

  // 1. Get payments
  const paymentsSnap = await getDocs(collection(db, 'payments'));
  const shiftPayments = paymentsSnap.docs.map(d => d.data()).filter(p => p.shiftId === activeShiftId);
  const paymentsSum = shiftPayments.reduce((s, p) => s + Number(p.amount), 0);

  // 2. Get ticket sales
  const ticketsSnap = await getDocs(collection(db, 'ticket_sales'));
  const shiftTickets = ticketsSnap.docs.map(d => d.data()).filter(t => t.shiftId === activeShiftId);
  const ticketsSum = shiftTickets.reduce((s, t) => s + (Number(t.price) * Number(t.quantity || 1)), 0);

  // 3. Get shift.revenues
  const subRevenuesSum = (shift.revenues || []).reduce((s, r) => s + Number(r.amount), 0);

  const realTotalRevenue = paymentsSum + ticketsSum + subRevenuesSum;
  const netAmount = realTotalRevenue - (shift.totalExpenses || 0);

  console.log(`Repaired Shift ${activeShiftId}: Payments(${paymentsSum}) + Tickets(${ticketsSum}) + Sub(${subRevenuesSum}) = Total(${realTotalRevenue})`);

  await updateDoc(shiftRef, { totalRevenue: realTotalRevenue, netAmount: netAmount });
  console.log('Fixed DB successfully.');
  process.exit(0);
}
repair();
