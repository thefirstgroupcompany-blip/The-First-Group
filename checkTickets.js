import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function check() {
  const snap = await getDocs(collection(db, 'ticket_sales'));
  const docs = snap.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => {
      const da = a.date?.toDate ? a.date.toDate() : new Date(0);
      const db = b.date?.toDate ? b.date.toDate() : new Date(0);
      return db - da; // desc
  });
  
  console.log('Latest 3 tickets:');
  for (let i = 0; i < Math.min(3, docs.length); i++) {
    const d = docs[i];
    console.log(d.id, 'Total:', d.total, d.date?.toDate ? d.date.toDate() : 'No date', 'Shift:', d.shiftId);
  }
  process.exit(0);
}
check();
