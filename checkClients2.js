import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function check() {
  const snap = await getDocs(collection(db, 'clients'));
  const docs = snap.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => {
      const da = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
      const db = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
      return db - da; // desc
  });
  
  for (let i = 0; i < Math.min(5, docs.length); i++) {
    const d = docs[i];
    console.log(d.id, d.name, d.totalPaid, d.createdAt?.toDate ? d.createdAt.toDate() : 'No date');
  }
  process.exit(0);
}
check();
