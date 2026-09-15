import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Load environment config manually if .env exists
const envPath = path.join(projectRoot, '.env');
const envVars = {};
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        envVars[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
      }
    }
  });
}

const firebaseConfig = {
  apiKey: envVars.VITE_FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY,
  authDomain: envVars.VITE_FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: envVars.VITE_FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'the-first-group-co',
  storageBucket: envVars.VITE_FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: envVars.VITE_FIREBASE_MESSAGING_SENDER_ID || process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: envVars.VITE_FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const COLLECTIONS_TO_BACKUP = [
  'users',
  'employees',
  'clients',
  'client_subscriptions',
  'packages',
  'sessions',
  'payments',
  'shifts',
  'cafe_shifts',
  'attendance',
  'vouchers',
  'ticket_sales',
  'config',
  'instructors',
  'course_schedules',
  'inventory',
  'vendors',
  'assets',
  'announcements'
];

async function runScheduledBackup() {
  console.log(`[Backup Runner] Starting automated snapshot for project: ${firebaseConfig.projectId}...`);
  const startTime = Date.now();
  const backupData = {
    metadata: {
      generatedAt: new Date().toISOString(),
      timestamp: startTime,
      projectId: firebaseConfig.projectId,
      version: '2.0-automated'
    },
    collections: {},
    counts: {}
  };

  let totalDocs = 0;

  for (const colName of COLLECTIONS_TO_BACKUP) {
    try {
      const snap = await getDocs(collection(db, colName));
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      backupData.collections[colName] = docs;
      backupData.counts[colName] = docs.length;
      totalDocs += docs.length;
      console.log(`  ? ${colName}: ${docs.length} records`);
    } catch (err) {
      console.warn(`  ? ${colName} failed:`, err.message);
      backupData.collections[colName] = [];
      backupData.counts[colName] = 0;
    }
  }

  backupData.metadata.totalDocuments = totalDocs;
  backupData.metadata.durationMs = Date.now() - startTime;

  // Save to backups folder
  const backupsDir = path.join(projectRoot, 'backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const fileName = `tfg_snapshot_${dateStr}.json`;
  const filePath = path.join(backupsDir, fileName);

  fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2), 'utf8');
  const sizeMb = (fs.statSync(filePath).size / (1024 * 1024)).toFixed(2);
  console.log(`\n?? Backup saved successfully to: backups/${fileName} (${sizeMb} MB, ${totalDocs} records)`);

  // Retention: Keep only the 30 most recent backups
  try {
    const files = fs.readdirSync(backupsDir)
      .filter(f => f.startsWith('tfg_snapshot_') && f.endsWith('.json'))
      .map(f => ({ name: f, time: fs.statSync(path.join(backupsDir, f)).mtime.getTime() }))
      .sort((a, b) => b.time - a.time);

    if (files.length > 30) {
      const filesToDelete = files.slice(30);
      filesToDelete.forEach(f => {
        fs.unlinkSync(path.join(backupsDir, f.name));
        console.log(`  ?? Cleaned up old backup: ${f.name}`);
      });
    }
  } catch (cleanErr) {
    console.warn('[Backup Runner] Pruning error:', cleanErr);
  }

  // Also notify Telegram if bot token and chat ID exist
  const botToken = envVars.VITE_TELEGRAM_BOT_TOKEN;
  const chatId = envVars.VITE_TELEGRAM_CHAT_ID;
  if (botToken && chatId) {
    try {
      const text = `?? *????? ????? ????????? ???????? - THE FIRST GROUP*\n\n` +
        `?? ???????: ${now.toLocaleDateString('ar-EG')}\n` +
        `? ?????: ${now.toLocaleTimeString('ar-EG')}\n` +
        `?? ?????? ???????: *${totalDocs}*\n` +
        `?? ??? ?????: *${sizeMb} MB*\n` +
        `? ?????: *${((Date.now() - startTime) / 1000).toFixed(1)} ?????*\n` +
        `? ??????: ?? ????? ???????? ?????.`;

      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
      });
      console.log('  ?? Telegram alert sent to manager.');
    } catch (_) {}
  }
}

runScheduledBackup().then(() => process.exit(0)).catch(e => {
  console.error('[Backup Error]:', e);
  process.exit(1);
});
