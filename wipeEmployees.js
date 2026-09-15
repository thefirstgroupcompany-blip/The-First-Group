import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function wipe() {
  console.log("Fetching employees...");
  const q = query(collection(db, 'users'), where('role', '==', 'employee'));
  const snap = await getDocs(q);
  
  console.log(`Found ${snap.docs.length} employees to delete.`);
  
  for (const d of snap.docs) {
    await deleteDoc(doc(db, 'users', d.id));
    console.log(`Deleted employee: ${d.id}`);
  }
  
  console.log("Employees wiped successfully.");
  process.exit(0);
}

wipe();
