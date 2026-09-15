// Factory Reset Runner for THE FIRST GROUP Management System
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import fs from 'fs';

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

const COLLECTIONS_TO_WIPE = [
  'clients',
  'client_subscriptions',
  'shifts',
  'payments',
  'ticket_sales',
  'admin_revenues',
  'admin_expenses',
  'attendance',
  'activity_logs',
  'salaries',
  'partner_transactions',
  'course_schedules',
  'instructors',
  'cafe_shifts',
  'cafe_orders',
  'vouchers',
  'feedback',
  'customer_service_requests',
  'packages'
];

async function runFactoryReset() {
  console.log('🚀 Starting Factory Reset for THE FIRST GROUP...');

  for (const colName of COLLECTIONS_TO_WIPE) {
    try {
      const snap = await getDocs(collection(db, colName));
      console.log(`Clearing collection "${colName}" (${snap.docs.length} documents)...`);
      for (const d of snap.docs) {
        await deleteDoc(doc(db, colName, d.id));
      }
      console.log(`✓ "${colName}" is now completely empty.`);
    } catch (err) {
      console.error(`Error clearing ${colName}:`, err.message);
    }
  }

  console.log('✅ Factory Reset completed successfully!');
  console.log('🔒 Admin accounts and system settings were preserved.');
  process.exit(0);
}

runFactoryReset().catch(err => {
  console.error('Fatal reset error:', err);
  process.exit(1);
});
