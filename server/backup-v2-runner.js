import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = {
  apiKey: "AIzaSyDummyKey_For_Direct_Bot",
  authDomain: "the-first-group-co.firebaseapp.com",
  projectId: "the-first-group-co",
  storageBucket: "the-first-group-co.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const collectionsToBackup = [
  'clients', 'client_subscriptions', 'packages', 'course_schedules',
  'instructors', 'employees', 'shifts', 'payments', 'ticket_sales',
  'admin_revenues', 'assets', 'settings', 'system_settings',
  'activity_logs', 'attendance', 'salaries', 'partner_transactions'
];

async function runBackup() {
  const fullBackup = {
    versionName: 'نسخة رقم 1 (Version 1)',
    createdAt: new Date().toISOString(),
    data: {}
  };

  console.log('Fetching live collections from Firestore...');
  for (const colName of collectionsToBackup) {
    try {
      const snap = await getDocs(collection(db, colName));
      fullBackup.data[colName] = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
      console.log(`  - ${colName}: ${fullBackup.data[colName].length} docs`);
    } catch (e) {
      console.log(`  - ${colName}: error (${e.message})`);
    }
  }

  const backupJson = JSON.stringify(fullBackup, null, 2);
  const path1 = 'C:/Users/AHMED HASSAN/.gemini/antigravity/scratch/VERSION_1_STABLE_BACKUP/database_backup_v1.json';
  const path2 = 'C:/Users/AHMED HASSAN/.gemini/antigravity/scratch/management-system/database_backup_v1.json';

  fs.writeFileSync(path1, backupJson, 'utf8');
  fs.writeFileSync(path2, backupJson, 'utf8');
  console.log('✅ Database snapshot saved to:', path1);
  console.log('✅ Database snapshot saved to:', path2);
}

runBackup().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
