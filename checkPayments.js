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
  const paymentsSnap = await getDocs(collection(db, 'payments'));
  for (const d of paymentsSnap.docs) {
    if (d.data().clientId === 'epEcYwXzxztg5RPaMNDl') {
      console.log('Payment:', d.id, d.data());
    }
  }
  process.exit(0);
}
check();
