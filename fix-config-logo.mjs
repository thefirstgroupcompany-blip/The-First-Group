import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyD5rfKKPwszn4MU_OXp6ffUbCgTZo0J_ak',
  authDomain: 'the-first-group-co.firebaseapp.com',
  projectId: 'the-first-group-co',
  storageBucket: 'the-first-group-co.firebasestorage.app',
  messagingSenderId: '707174957075',
  appId: '1:707174957075:web:044529b7db0b2518243fe6'
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function cleanConfig() {
  await setDoc(doc(db, 'config', 'system'), {
    name: 'THE FIRST GROUP',
    logoUrl: 'https://i.ibb.co/tMzqc0CT/1000706134.jpg'
  }, { merge: true });
  console.log('config/system in Firestore cleaned with pure URL');
}

cleanConfig().catch(console.error);
