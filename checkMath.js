import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function check() {
  const shiftsSnap = await getDocs(collection(db, 'shifts'));
  let activeShift = null;
  for (const s of shiftsSnap.docs) {
    if (s.data().status === 'open') activeShift = { id: s.id, ...s.data() };
  }
  
  if (!activeShift) { console.log('No open shift found.'); process.exit(0); }
  
  console.log("OPEN SHIFT:", activeShift.id, activeShift.totalRevenue, activeShift.revenues);
  
  const paymentsSnap = await getDocs(collection(db, 'payments'));
  const shiftPayments = paymentsSnap.docs.map(d => ({id: d.id, ...d.data()})).filter(p => p.shiftId === activeShift.id);
  
  console.log("PAYMENTS IN THIS SHIFT:", shiftPayments);
  
  process.exit(0);
}
check();
