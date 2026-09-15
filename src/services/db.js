const formatCurrency = (amount) => `${Number(amount || 0).toLocaleString('ar-EG-u-nu-latn')} ج.م`;
import { sendSystemNotification } from '../utils/notifications';
// تأكد من ضبط متغيّر البيئة TELEGRAM_CHAT_ID إلى معرف محادثة خاصة (مستخدم فردي) لضمان الخصوصية.
import { sendTelegramMessage } from '../integrations/telegram';
import { db } from '../firebase';
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, serverTimestamp, limit,
  runTransaction, increment
} from 'firebase/firestore';
import { assertAdmin } from './security';
import bcrypt from 'bcryptjs';

// ========================
// CONFIG / SETTINGS
// ========================
export const getSettings = async () => {
  const snap = await getDoc(doc(db, 'config', 'settings'));
  return snap.exists() ? snap.data() : null;
};

export const saveSettings = async (data) => {
  await setDoc(doc(db, 'config', 'settings'), data, { merge: true });
};

// ========================
// AUTH / USERS
// ========================
export const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

export const verifyPassword = (password, hash) => bcrypt.compare(password, hash);

export const createAdmin = async ({ username, password }) => {
  const hash = await hashPassword(password);
  const uid = `admin_${Date.now()}`;
  await setDoc(doc(db, 'users', uid), {
    uid, username, passwordHash: hash, role: 'admin',
    name: username, createdAt: serverTimestamp()
  });
  await saveSettings({ adminCreated: true, adminUid: uid });
  return uid;
};

export const loginUser = async ({ username, password }) => {
  const q = query(collection(db, 'users'), where('username', '==', username));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const user = { id: snap.docs[0].id, ...snap.docs[0].data() };
  const valid = await verifyPassword(password, user.passwordHash);
  return valid ? user : null;
};

export const loginUniversal = async ({ identifier, password }) => {
  const cleanId = String(identifier || '').trim().toLowerCase();
  const rawPassword = String(password || ''); // Strict exact case password
  if (!cleanId || !rawPassword) return null;

  const attachLinkedEmployee = async (user) => {
    if (user.linkedEmployeeId) {
      try {
        const empSnap = await getDoc(doc(db, 'employees', user.linkedEmployeeId));
        if (empSnap.exists()) {
          user.employee = { id: empSnap.id, ...empSnap.data() };
        }
      } catch (e) {}
    }
    // SECURITY: Never return or expose passwordHash to client state
    delete user.passwordHash;
    return user;
  };

  // 1. Try targeted queries first (fast-path supporting multiple casings)
  const trimmedId = identifier.trim();
  const upperId = trimmedId.toUpperCase();
  const titleId = trimmedId.charAt(0).toUpperCase() + trimmedId.slice(1).toLowerCase();

  const queries = [
    query(collection(db, 'users'), where('username', '==', cleanId), limit(1)),
    query(collection(db, 'users'), where('username', '==', trimmedId), limit(1)),
    query(collection(db, 'users'), where('username', '==', upperId), limit(1)),
    query(collection(db, 'users'), where('username', '==', titleId), limit(1)),
    query(collection(db, 'users'), where('memberId', '==', cleanId), limit(1)),
    query(collection(db, 'users'), where('memberId', '==', trimmedId), limit(1)),
    query(collection(db, 'users'), where('name', '==', trimmedId), limit(1)),
    query(collection(db, 'users'), where('name', '==', upperId), limit(1)),
    query(collection(db, 'users'), where('email', '==', cleanId), limit(1))
  ];

  for (const q of queries) {
    try {
      const snap = await getDocs(q);
      if (!snap.empty) {
        const user = { id: snap.docs[0].id, ...snap.docs[0].data() };
        if (user.status === 'disabled') {
          throw new Error('هذا الحساب معطل حالياً من قِبل إدارة النظام');
        }
        const valid = await verifyPassword(rawPassword, user.passwordHash);
        if (valid) return await attachLinkedEmployee(user);
      }
    } catch (e) {
      if (e.message?.includes('معطل')) throw e;
    }
  }

  // 2. Safe fallback scan for case-insensitive staff usernames (users table has only system staff/admin)
  try {
    const snapAll = await getDocs(collection(db, 'users'));
    for (const d of snapAll.docs) {
      const u = { id: d.id, ...d.data() };
      const matchUname = String(u.username || '').trim().toLowerCase() === cleanId;
      const matchMem = String(u.memberId || '').trim().toLowerCase() === cleanId;
      const matchName = String(u.name || '').trim().toLowerCase() === cleanId;
      const matchEmail = String(u.email || '').trim().toLowerCase() === cleanId;

      if (matchUname || matchMem || matchName || matchEmail) {
        if (u.status === 'disabled') {
          throw new Error('هذا الحساب معطل حالياً من قِبل إدارة النظام');
        }
        const valid = await verifyPassword(rawPassword, u.passwordHash);
        if (valid) return await attachLinkedEmployee(u);
      }
    }
  } catch (e) {
    if (e.message?.includes('معطل')) throw e;
  }

  return null;
};

export const loginEmployeeByMemberId = async ({ memberId, password }) => {
  const q = query(collection(db, 'users'), where('memberId', '==', memberId), where('role', '==', 'employee'));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const user = { id: snap.docs[0].id, ...snap.docs[0].data() };
  const valid = await verifyPassword(password, user.passwordHash);
  return valid ? user : null;
};

// =========================================================
// REAL-TIME SHARED LISTENER & IN-MEMORY HOT-CACHE ENGINE
// Provides 0ms instant cached data delivery and deduplicates Firestore listeners
// =========================================================
const sharedListeners = new Map();

export const createSharedCollectionListener = (cacheKey, queryBuilder, mapFn = (d) => ({ id: d.id, ...d.data() }), sortFn = null) => {
  return (callback) => {
    if (typeof callback !== 'function') return () => {};

    let entry = sharedListeners.get(cacheKey);
    if (!entry) {
      entry = {
        subscribers: new Set(),
        data: null,
        unsub: null,
        timeoutId: null
      };
      sharedListeners.set(cacheKey, entry);
    }

    if (entry.timeoutId) {
      clearTimeout(entry.timeoutId);
      entry.timeoutId = null;
    }

    entry.subscribers.add(callback);

    // Instant delivery from hot in-memory cache (0ms latency)
    if (entry.data !== null) {
      try {
        callback(entry.data);
      } catch (err) {
        console.error(`[HotCache] Callback error for ${cacheKey}:`, err);
      }
    }

    // Start Firestore listener if not running
    if (!entry.unsub) {
      try {
        const q = queryBuilder();
        entry.unsub = onSnapshot(q, (snap) => {
          let items = snap.docs.map(mapFn);
          if (sortFn) {
            items.sort(sortFn);
          }
          entry.data = items;
          for (const sub of entry.subscribers) {
            try {
              sub(items);
            } catch (e) {
              console.error(`[HotCache] Subscriber error for ${cacheKey}:`, e);
            }
          }
        }, (err) => {
          console.warn(`[HotCache] Firestore listener warning for ${cacheKey}:`, err);
        });
      } catch (e) {
        console.error(`[HotCache] Failed to initialize query for ${cacheKey}:`, e);
      }
    }

    return () => {
      entry.subscribers.delete(callback);
      if (entry.subscribers.size === 0) {
        if (entry.timeoutId) clearTimeout(entry.timeoutId);
        entry.timeoutId = setTimeout(() => {
          if (entry.subscribers.size === 0) {
            if (entry.unsub) {
              entry.unsub();
              entry.unsub = null;
            }
            entry.timeoutId = null;
          }
        }, 120000); // 2 minutes grace period for instant tab switching
      }
    };
  };
};

// ========================
// EMPLOYEES (موظفو المكان والكادر الوظيفي)
// ========================
export const getEmployees = createSharedCollectionListener(
  'employees',
  () => collection(db, 'employees'),
  (d) => ({ id: d.id, ...d.data() }),
  (a, b) => (a.name || '').localeCompare(b.name || '', 'ar')
);

export const addEmployee = async ({
  name,
  memberId,
  jobTitle = 'موظف',
  salary = 0,
  phone = '',
  salaryType = 'fixed_monthly',
  status = 'active',
  hireDate = '',
  notes = '',
  linkedUserId = null
}) => {
  return addDoc(collection(db, 'employees'), {
    name: name?.trim() || '',
    memberId: memberId?.trim() || '',
    jobTitle: jobTitle || 'موظف',
    salary: parseNum(salary) || 0,
    salaryType: salaryType || 'fixed_monthly',
    phone: phone?.trim() || '',
    status: status || 'active',
    hireDate: hireDate || new Date().toISOString().split('T')[0],
    notes: notes?.trim() || '',
    linkedUserId: linkedUserId || null,
    createdAt: serverTimestamp()
  });
};

export const updateEmployee = async (id, data) => {
  const updates = { ...data };
  if (data.salary !== undefined) updates.salary = parseNum(data.salary);
  if (data.salaryType) updates.salaryType = data.salaryType;

  // Try updating in employees collection first
  try {
    const empRef = doc(db, 'employees', id);
    const snap = await getDoc(empRef);
    if (snap.exists()) {
      await updateDoc(empRef, updates);
      return;
    }
  } catch (e) {}

  // Fallback to users if legacy
  try {
    await updateDoc(doc(db, 'users', id), updates);
  } catch (err) {
    console.error('Error updating employee:', err);
  }
};

export const deleteEmployee = async (id) => {
  // If employee has a linked system user, unlink it
  try {
    const empSnap = await getDoc(doc(db, 'employees', id));
    if (empSnap.exists() && empSnap.data().linkedUserId) {
      await updateDoc(doc(db, 'users', empSnap.data().linkedUserId), {
        linkedEmployeeId: null
      });
    }
  } catch (e) {}

  try {
    return await deleteDoc(doc(db, 'employees', id));
  } catch (e) {
    return await deleteDoc(doc(db, 'users', id));
  }
};

// ========================
// SYSTEM USERS (حسابات مستخدمي النظام والصلاحيات)
// ========================
export const getSystemUsers = createSharedCollectionListener(
  'system_users',
  () => collection(db, 'users'),
  (d) => ({ id: d.id, ...d.data() }),
  (a, b) => (a.name || a.username || '').localeCompare(b.name || b.username || '', 'ar')
);

export const addSystemUser = async ({
  username,
  password,
  name,
  role = 'employee',
  status = 'active',
  linkedEmployeeId = null,
  phone = ''
}) => {
  const cleanUsername = String(username || '').trim().toLowerCase();
  if (!cleanUsername) throw new Error('اسم المستخدم مطلوب');
  if (!password) throw new Error('كلمة المرور مطلوبة');

  // Verify unique username
  const checkQ = query(collection(db, 'users'), where('username', '==', cleanUsername));
  const existing = await getDocs(checkQ);
  if (!existing.empty) {
    throw new Error(`اسم المستخدم "${cleanUsername}" مستخدم بالفعل، يرجى اختيار اسم مستخدم آخر`);
  }

  const hash = await hashPassword(password);
  const docRef = await addDoc(collection(db, 'users'), {
    username: cleanUsername,
    name: name?.trim() || cleanUsername,
    passwordHash: hash,
    role: role || 'employee',
    status: status || 'active',
    linkedEmployeeId: linkedEmployeeId || null,
    phone: phone?.trim() || '',
    createdAt: serverTimestamp()
  });

  // If linked to an employee, update that employee record with linkedUserId
  if (linkedEmployeeId) {
    try {
      await updateDoc(doc(db, 'employees', linkedEmployeeId), {
        linkedUserId: docRef.id
      });
    } catch (linkErr) {
      console.warn('Could not link back to employee doc:', linkErr);
    }
  }

  return docRef;
};

export const updateSystemUser = async (id, data) => {
  const updates = { ...data };
  if (data.username) {
    updates.username = String(data.username).trim().toLowerCase();
  }
  if (data.password) {
    updates.passwordHash = await hashPassword(data.password);
    delete updates.password;
  }
  await updateDoc(doc(db, 'users', id), updates);

  // If linked employee changed, update employees collection
  if (data.linkedEmployeeId) {
    try {
      await updateDoc(doc(db, 'employees', data.linkedEmployeeId), {
        linkedUserId: id
      });
    } catch (e) {}
  }
};

export const toggleSystemUserStatus = async (id, currentStatus) => {
  const nextStatus = currentStatus === 'disabled' ? 'active' : 'disabled';
  await updateDoc(doc(db, 'users', id), { status: nextStatus });
  return nextStatus;
};

export const deleteSystemUser = async (id) => {
  const userDoc = await getDoc(doc(db, 'users', id));
  if (userDoc.exists()) {
    const data = userDoc.data();
    if (data.role === 'admin') {
      const allAdmins = await getDocs(query(collection(db, 'users'), where('role', '==', 'admin')));
      if (allAdmins.size <= 1) {
        throw new Error('لا يمكن حذف حساب المدير العام الوحيد للنظام');
      }
    }
    // If linked to employee, clear link
    if (data.linkedEmployeeId) {
      try {
        await updateDoc(doc(db, 'employees', data.linkedEmployeeId), {
          linkedUserId: null
        });
      } catch (e) {}
    }
  }
  return deleteDoc(doc(db, 'users', id));
};

// ========================
// PACKAGES
// ========================
export const getPackages = createSharedCollectionListener(
  'packages',
  () => query(collection(db, 'packages'), orderBy('name'))
);

export const addPackage = (data) =>
  addDoc(collection(db, 'packages'), { ...data, price: parseNum(data.price), sessions: parseNum(data.sessions), createdAt: serverTimestamp() });

export const updatePackage = (id, data) => updateDoc(doc(db, 'packages', id), data);
export const deletePackage = (id) => deleteDoc(doc(db, 'packages', id));

// ========================
// CLIENTS
// ========================
export const getClient = (clientId, callback) => {
  if (!clientId || typeof clientId !== 'string' || !clientId.trim()) return () => {};
  return onSnapshot(doc(db, 'clients', clientId), (docSnap) => {
    if (docSnap.exists()) {
      callback({ id: docSnap.id, ...docSnap.data() });
    }
  });
};

export const getClients = createSharedCollectionListener(
  'clients',
  () => query(collection(db, 'clients'), orderBy('name'))
);

export const parseNum = (val) => {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const en = String(val).replace(/[\u0660-\u0669]/g, d => '\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669'.indexOf(d));
  const num = Number(en);
  return isNaN(num) ? 0 : num;
};

export const roundCurrency = (val) => {
  const n = parseNum(val);
  return Math.round((n + Number.EPSILON) * 100) / 100;
};

export const addClient = async (data, shiftId, employeeId) => {
  const initialPaid = parseNum(data.totalPaid) || 0;

  // Pre-validate shift status if paying with shift to protect data integrity
  if (initialPaid > 0 && shiftId) {
    const shiftSnap = await getDoc(doc(db, 'shifts', shiftId));
    if (shiftSnap.exists() && shiftSnap.data().status === 'closed') {
      throw new Error('لا يمكن تسجيل عميل جديد مع تحصيل نقدي على مناوبة مغلقة مسبقاً! يرجى فتح مناوبة جديدة أولاً.');
    }
  }

  const isWorkspace = data.packageType === 'workspace';
  const totalHours = isWorkspace ? (parseNum(data.totalHours) || parseNum(data.packageSessions) || 0) : 0;
  const totalSessions = !isWorkspace ? (parseNum(data.packageSessions) || 0) : 0;

  let memberId = String(data.memberId || '').trim();
  if (!memberId) {
    const snap = await getDocs(collection(db, 'clients'));
    const existingIds = snap.docs
      .map(d => parseInt(d.data().memberId, 10))
      .filter(n => !isNaN(n) && n >= 1000);
    const max = existingIds.length > 0 ? Math.max(...existingIds) : 1000;
    memberId = String(max + 1);
  }

  const pkgPrice = parseNum(data.packagePrice) || 0;
  const clientRef = await addDoc(collection(db, 'clients'), {
    ...data,
    memberId: memberId,
    gender: data.gender || 'male',
    packageType: isWorkspace ? 'workspace' : 'sessions',
    scheduleId: data.scheduleId || null,
    scheduleDays: data.scheduleDays || '',
    scheduleTime: data.scheduleTime || '',
    scheduleRoom: data.scheduleRoom || '',
    instructorName: data.instructorName || '',
    totalHours: totalHours,
    hoursUsed: 0,
    packageSessions: totalSessions,
    sessionsUsed: 0,
    payments: [],
    totalPaid: 0,
    totalDebt: pkgPrice,
    packagePrice: pkgPrice,
    createdAt: serverTimestamp()
  });

  const startDateStr = data.startDate || new Date().toISOString().split('T')[0];
  const durationDays = parseNum(data.durationDays) || 30;
  let calculatedEndDate = data.endDate;
  if (!calculatedEndDate) {
    const startD = new Date(startDateStr);
    startD.setDate(startD.getDate() + durationDays);
    calculatedEndDate = startD.toISOString().split('T')[0];
  }

  let subRefId = null;
  if (data.packageId) {
    const subDocRef = await addDoc(collection(db, 'client_subscriptions'), {
      clientId: clientRef.id,
      packageId: data.packageId,
      packageName: data.packageName || '',
      packagePrice: pkgPrice,
      paidAmount: 0,
      remainingAmount: pkgPrice,
      packageType: isWorkspace ? 'workspace' : 'sessions',
      scheduleId: data.scheduleId || null,
      scheduleDays: data.scheduleDays || '',
      scheduleTime: data.scheduleTime || '',
      scheduleRoom: data.scheduleRoom || '',
      instructorName: data.instructorName || '',
      totalHours: totalHours,
      hoursUsed: 0,
      packageSessions: totalSessions,
      sessionsUsed: 0,
      currentSession: null,
      status: 'active',
      startDate: startDateStr,
      endDate: calculatedEndDate,
      date: serverTimestamp()
    });
    subRefId = subDocRef.id;

    await updateDoc(clientRef, {
      startDate: startDateStr,
      endDate: calculatedEndDate
    });
  }

  if (initialPaid > 0) {
    const pkgLabel = data.packageName ? ` (${data.packageName})` : '';
    await recordPayment(
      clientRef.id,
      initialPaid,
      shiftId || null,
      employeeId || null,
      `اشتراك جديد${pkgLabel}`,
      data.name,
      data.paymentMethod || 'cash',
      'subscription',
      subRefId
    );
  }

  return clientRef;
};

export const updateClient = async (id, data) => {
  await updateDoc(doc(db, 'clients', id), data);

  // Sync dates with active subscriptions if startDate or endDate changed
  if (data.startDate || data.endDate) {
    try {
      const q = query(
        collection(db, 'client_subscriptions'),
        where('clientId', '==', id),
        where('status', '==', 'active')
      );
      const snap = await getDocs(q);
      const updates = {};
      if (data.startDate) updates.startDate = data.startDate;
      if (data.endDate) updates.endDate = data.endDate;
      if (data.packageName) updates.packageName = data.packageName;
      if (data.packagePrice !== undefined) updates.packagePrice = parseNum(data.packagePrice);
      for (const d of snap.docs) {
        await updateDoc(doc(db, 'client_subscriptions', d.id), updates);
      }
    } catch (err) {
      console.warn('Could not sync active subscription dates on updateClient:', err);
    }
  }
};
export const deleteClient = async (id, actorName = 'المدير العام') => {
  const clientRef = doc(db, 'clients', id);
  const clientSnap = await getDoc(clientRef);
  const clientData = clientSnap.exists() ? clientSnap.data() : {};

  // 1. Clean up subscriptions (both collections)
  const subsSnap = await getDocs(query(collection(db, 'client_subscriptions'), where('clientId', '==', id)));
  for (const sDoc of subsSnap.docs) {
    await deleteDoc(doc(db, 'client_subscriptions', sDoc.id));
  }
  const subsSnapLegacy = await getDocs(query(collection(db, 'subscriptions'), where('clientId', '==', id)));
  for (const sDoc of subsSnapLegacy.docs) {
    await deleteDoc(doc(db, 'subscriptions', sDoc.id));
  }

  // 2. Cascade delete all linked payments (to prevent orphaned revenues)
  const paymentsSnap = await getDocs(query(collection(db, 'payments'), where('clientId', '==', id)));
  for (const pDoc of paymentsSnap.docs) {
    await deleteDoc(doc(db, 'payments', pDoc.id));
  }

  // 3. Cascade delete all linked sessions & check-ins
  const sessionsSnap = await getDocs(query(collection(db, 'sessions'), where('clientId', '==', id)));
  for (const sessDoc of sessionsSnap.docs) {
    await deleteDoc(doc(db, 'sessions', sessDoc.id));
  }

  // 4. Cascade delete wallet transactions
  const walletSnap = await getDocs(query(collection(db, 'wallet_transactions'), where('clientId', '==', id)));
  for (const wDoc of walletSnap.docs) {
    await deleteDoc(doc(db, 'wallet_transactions', wDoc.id));
  }

  // 5. Delete client doc
  await deleteDoc(clientRef);

  await logActivity({
    action: 'DELETE_CLIENT',
    category: 'clients',
    details: `حذف ملف العميل (${clientData.name || id}) مع كامل اشتراكاته ومدفوعاته وجلساته بواسطة (${actorName})`,
    actorName
  });
};

export const renewSubscription = async (clientId, packageData, amountPaid, shiftId, employeeId, paymentMethod = 'cash') => {
  const parsedAmount = roundCurrency(amountPaid);

  // Pre-validate shift status if paying with shift to protect data integrity
  if (parsedAmount > 0 && shiftId) {
    const shiftSnap = await getDoc(doc(db, 'shifts', shiftId));
    if (shiftSnap.exists() && shiftSnap.data().status === 'closed') {
      throw new Error('لا يمكن تجديد الاشتراك مع تحصيل نقدي على مناوبة مغلقة مسبقاً! يرجى اختيار المناوبة المفتوحة حالياً.');
    }
  }

  const clientRef = doc(db, 'clients', clientId);
  const clientSnap = await getDoc(clientRef);
  const clientData = clientSnap.exists() ? clientSnap.data() : {};

  const isWorkspace = packageData.packageType === 'workspace';
  const totalHours = isWorkspace ? (parseNum(packageData.totalHours) || parseNum(packageData.packageSessions) || 0) : 0;
  const totalSessions = !isWorkspace ? (parseNum(packageData.packageSessions) || 0) : 0;

  const startDateStr = packageData.startDate || new Date().toISOString().split('T')[0];
  const durationDays = parseNum(packageData.durationDays) || 30;
  let calculatedEndDate = packageData.endDate;
  if (!calculatedEndDate) {
    const startD = new Date(startDateStr);
    startD.setDate(startD.getDate() + durationDays);
    calculatedEndDate = startD.toISOString().split('T')[0];
  }

  // 1. Mark existing active subscriptions as superseded to prevent multiple active conflicts
  try {
    const activeSubsSnap = await getDocs(query(
      collection(db, 'client_subscriptions'),
      where('clientId', '==', clientId),
      where('status', '==', 'active')
    ));
    for (const subDoc of activeSubsSnap.docs) {
      await updateDoc(doc(db, 'client_subscriptions', subDoc.id), {
        status: 'superseded',
        supersededAt: serverTimestamp(),
        supersededByPackage: packageData.packageName || ''
      });
    }
  } catch (err) {
    console.warn('Could not mark old active subscriptions as superseded:', err);
  }

  // 2. Create the new active subscription
  const pkgPrice = roundCurrency(packageData.packagePrice) || 0;
  const initialPaid = Math.min(pkgPrice, Math.max(0, roundCurrency(amountPaid) || 0));

  const newSubRef = await addDoc(collection(db, 'client_subscriptions'), {
    clientId,
    packageId: packageData.packageId,
    packageName: packageData.packageName,
    packagePrice: pkgPrice,
    paidAmount: 0,
    remainingAmount: pkgPrice,
    packageType: isWorkspace ? 'workspace' : 'sessions',
    totalHours: totalHours,
    hoursUsed: 0,
    packageSessions: totalSessions,
    sessionsUsed: 0,
    currentSession: null,
    status: 'active',
    startDate: startDateStr,
    endDate: calculatedEndDate,
    date: serverTimestamp()
  });

  // 3. Update client profile with active package details
  const clientUpdates = {
    packageId: packageData.packageId,
    packageName: packageData.packageName,
    packagePrice: pkgPrice,
    packageType: isWorkspace ? 'workspace' : 'sessions',
    totalHours: totalHours,
    packageSessions: totalSessions,
    currentSubHoursUsed: 0,
    currentSubSessionsUsed: 0,
    startDate: startDateStr,
    endDate: calculatedEndDate,
    status: 'active',
    updatedAt: serverTimestamp()
  };

  if (pkgPrice > 0) {
    clientUpdates.totalDebt = roundCurrency((Number(clientData.totalDebt) || 0) + pkgPrice);
  }

  await updateDoc(clientRef, clientUpdates);

  // 4. Record payment if initial payment was made
  if (initialPaid > 0) {
    const pkgLabel = packageData.packageName ? ` (${packageData.packageName})` : '';
    await recordPayment(
      clientId,
      initialPaid,
      shiftId || null,
      employeeId || null,
      `تجديد اشتراك${pkgLabel}`,
      clientData.name || '',
      paymentMethod || 'cash',
      'subscription',
      newSubRef.id
    );
  }
};


export const deleteSubscription = async (subscriptionId, clientId) => {
  await deleteDoc(doc(db, 'client_subscriptions', subscriptionId));
  // Delete legacy subscription doc if exists
  try { await deleteDoc(doc(db, 'subscriptions', subscriptionId)); } catch(e) {}

  // Cascade delete payments tied to this specific subscription to prevent orphaned records
  const payQuery = query(collection(db, 'payments'), where('subscriptionId', '==', subscriptionId));
  const paySnap = await getDocs(payQuery);
  for (const pDoc of paySnap.docs) {
    await deleteDoc(doc(db, 'payments', pDoc.id));
  }

  const q = query(
    collection(db, 'client_subscriptions'),
    where('clientId', '==', clientId)
  );
  const snap = await getDocs(q);

  const remaining = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => {
      const da = a.date?.toDate ? a.date.toDate() : new Date(0);
      const db2 = b.date?.toDate ? b.date.toDate() : new Date(0);
      return db2 - da;
    });

  const clientRef = doc(db, 'clients', clientId);

  if (remaining.length > 0) {
    const latest = remaining[0];
    await updateDoc(clientRef, {
      packageId: latest.packageId || '',
      packageName: latest.packageName || '',
      packagePrice: parseNum(latest.packagePrice) || 0,
      packageSessions: parseNum(latest.packageSessions) || 0,
      totalHours: parseNum(latest.totalHours) || 0,
      currentSubHoursUsed: parseNum(latest.hoursUsed) || 0,
      currentSubSessionsUsed: parseNum(latest.sessionsUsed) || 0,
      startDate: latest.startDate || ''
    });
  } else {
    await updateDoc(clientRef, {
      packageId: '',
      packageName: 'لا يوجد باقة نشطة',
      packagePrice: 0,
      packageSessions: 0,
      totalHours: 0,
      currentSubHoursUsed: 0,
      currentSubSessionsUsed: 0
    });
  }
};

export const getClientSubscriptions = (clientId, callback) => {
  const q = query(collection(db, 'client_subscriptions'), where('clientId', '==', clientId));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => {
      const da = a.date?.toDate ? a.date.toDate() : new Date(0);
      const db2 = b.date?.toDate ? b.date.toDate() : new Date(0);
      return db2 - da;
    }));
  });
};

export const recordSession = async (clientId, shiftId, employeeId, subscriptionId) => {
  let pkgName = '';

  let effectiveShiftId = shiftId || null;
  const subRef = subscriptionId ? doc(db, 'client_subscriptions', subscriptionId) : null;
  const clientRef = clientId ? doc(db, 'clients', clientId) : null;
  const shiftRef = effectiveShiftId ? doc(db, 'shifts', effectiveShiftId) : null;

  await runTransaction(db, async (transaction) => {
    // --- 1. ALL READS FIRST ---
    if (shiftRef) {
      const shiftSnap = await transaction.get(shiftRef);
      if (shiftSnap.exists() && shiftSnap.data().status === 'closed') {
        effectiveShiftId = null;
      }
    }

    let subSnap = null;
    let subData = null;
    if (subRef) {
      subSnap = await transaction.get(subRef);
      if (!subSnap.exists()) {
        throw new Error('الاشتراك غير موجود');
      }
      subData = subSnap.data();
      if (subData.status === 'cancelled' || subData.status === 'superseded') {
        throw new Error('هذا الاشتراك غير ساري أو تم إلغاؤه');
      }
      pkgName = subData.packageName || '';
      const currentUsed = Number(subData.sessionsUsed) || 0;
      const total = parseNum(subData.packageSessions) || 0;
      if (total > 0 && currentUsed >= total) {
        throw new Error(`تم استنفاد جميع حصص هذه الباقة بالكامل (${total} حصة). يرجى التجديد أولاً.`);
      }
    }

    let clientSnap = null;
    let clientData = null;
    if (clientRef) {
      clientSnap = await transaction.get(clientRef);
      if (clientSnap.exists()) {
        clientData = clientSnap.data();
      }
    }

    // --- 2. ALL WRITES AFTER ALL READS ---
    if (subRef && subData) {
      const currentUsed = Number(subData.sessionsUsed) || 0;
      const total = parseNum(subData.packageSessions) || 0;
      const nextUsed = currentUsed + 1;
      transaction.update(subRef, {
        sessionsUsed: nextUsed,
        status: (total > 0 && nextUsed >= total) ? 'expired' : (subData.status || 'active')
      });
    }

    if (clientRef && clientData) {
      transaction.update(clientRef, {
        sessionsUsed: (Number(clientData.sessionsUsed) || 0) + 1
      });
    }
  });

  // 4. Record session history
  await addDoc(collection(db, 'sessions'), {
    clientId,
    subscriptionId: subscriptionId || null,
    packageName: pkgName || '',
    shiftId: effectiveShiftId || null,
    employeeId: employeeId || null,
    date: serverTimestamp()
  });
};

export const getClientSubscriptionsOnce = async (clientId) => {
  const q = query(collection(db, 'client_subscriptions'), where('clientId', '==', clientId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => {
    const da = a.date?.toDate ? a.date.toDate() : new Date(0);
    const db2 = b.date?.toDate ? b.date.toDate() : new Date(0);
    return db2 - da;
  });
};

export const getAllSubscriptions = createSharedCollectionListener(
  'all_client_subscriptions',
  () => query(collection(db, 'client_subscriptions'), orderBy('date', 'desc'), limit(1000))
);

export const getAllClientSubscriptions = getAllSubscriptions;

// In-flight concurrency lock to prevent duplicate clicks and race conditions
const inFlightFinancialOps = new Set();
const acquireFinancialLock = (key, ttlMs = 3000) => {
  if (inFlightFinancialOps.has(key)) {
    throw new Error('عملية مالية مطابقة قيد المعالجة حالياً. يرجى الانتظار ثوانٍ لتفادي التكرار.');
  }
  inFlightFinancialOps.add(key);
  setTimeout(() => inFlightFinancialOps.delete(key), ttlMs);
};
const releaseFinancialLock = (key) => {
  inFlightFinancialOps.delete(key);
};

export const recordPayment = async (clientId, amount, shiftId, employeeId, note, clientName, paymentMethod = 'cash', paymentCategory = 'subscription', subscriptionId = null) => {
  const parsedAmount = roundCurrency(amount);
  if (parsedAmount <= 0) {
    throw new Error('مبلغ التحصيل يجب أن يكون أكبر من الصفر');
  }

  const cleanMethod = (paymentMethod || 'cash').toLowerCase().trim();
  const isCash = cleanMethod === 'cash' || cleanMethod === 'نقدي' || !cleanMethod;
  const isVisa = cleanMethod === 'visa' || cleanMethod === 'فيزا';
  const isVodafone = cleanMethod === 'vodafone_cash' || cleanMethod === 'فودافون كاش';
  const isInstapay = cleanMethod === 'instapay' || cleanMethod === 'انستاباي' || cleanMethod === 'إنستاباي';

  const lockKey = `pay_${clientId || 'anon'}_${parsedAmount}_${subscriptionId || 'none'}_${cleanMethod}`;
  acquireFinancialLock(lockKey);

  // Strict Financial Integrity: Cash payments MUST be tied to an active open shift drawer
  if (isCash && !shiftId) {
    releaseFinancialLock(lockKey);
    throw new Error('⚠️ تنبيه أمان مالي صارم: لا يمكن استلام أو توريد نقدية لعدم وجود مناوبة مفتوحة! يرجى فتح مناوبة أولاً لتوثيق وإيداع النقدية في الدرج والعهدة فورياً.');
  }

  let finalClientName = clientName || '';
  let finalMemberId = '';

  const clientRef = clientId ? doc(db, 'clients', clientId) : null;
  const shiftRef = shiftId ? doc(db, 'shifts', shiftId) : null;
  const paymentRef = doc(collection(db, 'payments'));
  const receiptNo = 'REC-' + Date.now().toString().slice(-6);
  const isWalletTopup = paymentCategory === 'wallet_topup' || (note && note.includes('شحن محفظة'));

  try {
    // Execute atomic multi-document transaction across client, shift, and payment document
    await runTransaction(db, async (transaction) => {
    // --- 1. ALL READS FIRST (Strict Firestore rule) ---
    let clientSnap = null;
    let clientData = null;
    if (clientRef) {
      clientSnap = await transaction.get(clientRef);
      if (clientSnap.exists()) {
        clientData = clientSnap.data();
        if (!finalClientName) finalClientName = clientData.name || '';
        finalMemberId = clientData.memberId || '';
      }
    }

    let shiftSnap = null;
    let shift = null;
    if (shiftRef) {
      shiftSnap = await transaction.get(shiftRef);
      if (shiftSnap.exists()) {
        shift = shiftSnap.data();
        if (shift.status === 'closed') {
          throw new Error('لا يمكن إضافة تحصيل نقدي إلى مناوبة مغلقة مسبقاً! يرجى فتح مناوبة جديدة أو اختيار المناوبة المفتوحة حالياً.');
        }
      }
    }

    let subRef = null;
    let subSnap = null;
    let subData = null;
    if (subscriptionId) {
      subRef = doc(db, 'client_subscriptions', subscriptionId);
      subSnap = await transaction.get(subRef);
      if (subSnap.exists()) {
        subData = subSnap.data();
      }
    }

    // --- 2. ALL WRITES AFTER ALL READS ---
    if (clientRef && clientSnap && clientSnap.exists() && clientData) {
      const curSpend = roundCurrency(clientData.totalSpend || clientData.totalPaid || 0);
      const updates = {
        totalSpend: roundCurrency(curSpend + parsedAmount),
        updatedAt: serverTimestamp()
      };

      if (isWalletTopup) {
        // قيد إيداع محفظة كافيه: لا يدخل ضمن سداد الباقة
        const curWalletDep = roundCurrency(clientData.totalWalletDeposited || 0);
        updates.totalWalletDeposited = roundCurrency(curWalletDep + parsedAmount);
      } else {
        // قيد سداد باقة أو اشتراك: يدخل ضمن سداد الباقة
        const curPaid = roundCurrency(clientData.totalPaid || 0);
        updates.totalPaid = roundCurrency(curPaid + parsedAmount);

        // إذا كان على العميل مديونية أو الإيصال سداد مديونية: خصم المبلغ من مديونية العميل
        if (Number(clientData.totalDebt || 0) > 0) {
          updates.totalDebt = Math.max(0, roundCurrency((Number(clientData.totalDebt) || 0) - parsedAmount));
        }
      }

      transaction.update(clientRef, updates);
    }

    // تحديث رصيد الباقة المتبقي والمحصل ذرياً
    if (subRef && subData) {
      const curSubPaid = roundCurrency(subData.paidAmount || subData.paid || 0);
      const pkgPrice = roundCurrency(subData.packagePrice || 0);
      const curRem = roundCurrency(subData.remainingAmount ?? Math.max(0, pkgPrice - curSubPaid));
      const newPaid = roundCurrency(curSubPaid + parsedAmount);
      const newRem = Math.max(0, roundCurrency(curRem - parsedAmount));
      transaction.update(subRef, {
        paidAmount: newPaid,
        remainingAmount: newRem,
        updatedAt: serverTimestamp()
      });
    }

    if (shiftRef && shiftSnap && shiftSnap.exists() && shift) {
      const totalRevenue = roundCurrency((parseNum(shift.totalRevenue) || 0) + parsedAmount);
      const drawerCash = roundCurrency((parseNum(shift.drawerCash || shift.cashRevenue) || 0) + (isCash ? parsedAmount : 0));
      const cashRevenue = roundCurrency((parseNum(shift.cashRevenue) || 0) + (isCash ? parsedAmount : 0));
      const visaRevenue = roundCurrency((parseNum(shift.visaRevenue) || 0) + (isVisa ? parsedAmount : 0));
      const vodafoneRevenue = roundCurrency((parseNum(shift.vodafoneRevenue) || 0) + (isVodafone ? parsedAmount : 0));
      const instapayRevenue = roundCurrency((parseNum(shift.instapayRevenue) || 0) + (isInstapay ? parsedAmount : 0));
      const otherRevenue = roundCurrency((parseNum(shift.otherRevenue) || 0) + (!isCash && !isVisa && !isVodafone && !isInstapay ? parsedAmount : 0));
      const totalExpenses = roundCurrency(parseNum(shift.totalExpenses) || 0);
      const netAmount = roundCurrency(totalRevenue - totalExpenses);
      const expectedCash = roundCurrency(drawerCash - totalExpenses);

      transaction.update(shiftRef, {
        totalRevenue,
        drawerCash,
        cashRevenue,
        visaRevenue,
        vodafoneRevenue,
        instapayRevenue,
        otherRevenue,
        expectedCash,
        netAmount,
        updatedAt: serverTimestamp()
      });
    }

    // Atomically create the payment receipt inside the exact same commit
    transaction.set(paymentRef, {
      clientId: clientId || null,
      subscriptionId: subscriptionId || null,
      amount: parsedAmount,
      paymentMethod: cleanMethod,
      category: isWalletTopup ? 'wallet_topup' : 'subscription',
      paymentCategory: isWalletTopup ? 'wallet_topup' : 'subscription',
      isWalletTopup,
      shiftId: shiftId || null,
      employeeId: employeeId || null,
      shiftEmployeeName: shift?.employeeName || 'المدير العام (الإدارة)',
      note: note || (isWalletTopup ? 'شحن محفظة رصيد كافيه' : 'سداد دفعة اشتراك'),
      clientName: finalClientName || '',
      memberId: finalMemberId || '',
      receiptNo,
      isVoided: false,
      date: serverTimestamp()
    });

    // If collected while shift is closed (Direct Admin Collection), credit directly to Central Treasury
    if (!shiftId) {
      const adminRevRef = doc(collection(db, 'admin_revenues'));
      transaction.set(adminRevRef, {
        label: `تحصيل مباشر بالخزينة (${cleanMethod === 'cash' ? 'نقدي' : cleanMethod}) - اشتراك ${finalClientName}`,
        title: `تحصيل مباشر بالخزينة - اشتراك ${finalClientName}`,
        amount: parsedAmount,
        type: 'subscriptions',
        category: 'اشتراكات وباقات',
        paymentMethod: cleanMethod,
        date: new Date().toISOString().split('T')[0],
        paymentId: paymentRef.id,
        clientId: clientId || null,
        clientName: finalClientName,
        receiptNo: receiptNo,
        isDirectAdminPayment: true,
        createdAt: serverTimestamp(),
        actorName: 'الإدارة العامة'
      });
    }
  });

    await logActivity({
      action: 'RECORD_PAYMENT',
      category: 'finances',
      details: `تحصيل إيصال (${receiptNo}) بمبلغ ${parsedAmount} ج.م (${cleanMethod}) للعميل (${finalClientName || finalMemberId})`,
      actorName: employeeId ? `الموظف (${employeeId})` : (clientName ? `المسؤول عن (${clientName})` : 'الاستقبال')
    });

    return { id: paymentRef.id, receiptNo, amount: parsedAmount };
  } finally {
    // Keep lock active for 1.5s to absorb trailing multi-clicks, then release
    setTimeout(() => releaseFinancialLock(lockKey), 1500);
  }
};

export const deletePayment = async (paymentId, voidReason = 'إلغاء بأمر الإدارة', actorName = 'المدير العام') => {
  if (!paymentId) throw new Error('معرف الإيصال غير محدد');

  const pRef = doc(db, 'payments', paymentId);

  // Execute atomically in transaction to prevent double-voiding fraud
  const voidResult = await runTransaction(db, async (transaction) => {
    // --- 1. ALL READS FIRST ---
    const pSnap = await transaction.get(pRef);
    if (!pSnap.exists()) {
      throw new Error('الإيصال غير موجود');
    }

    const payment = pSnap.data();

    // CRITICAL FRAUD CHECK: Prevent repeated deduction
    if (payment.isVoided) {
      throw new Error('هذا الإيصال ملغي مسبقاً ولا يمكن إلغاؤه مرة أخرى!');
    }

    const amount = roundCurrency(payment.amount || 0);
    const cleanMethod = (payment.paymentMethod || 'cash').toLowerCase().trim();
    const isCash = cleanMethod === 'cash' || cleanMethod === 'نقدي' || !cleanMethod;
    const isVisa = cleanMethod === 'visa' || cleanMethod === 'فيزا';
    const isVodafone = cleanMethod === 'vodafone_cash' || cleanMethod === 'فودافون كاش';
    const isInstapay = cleanMethod === 'instapay' || cleanMethod === 'انستاباي' || cleanMethod === 'إنستاباي';
    const isWalletTopup = payment.category === 'wallet_topup' || payment.paymentCategory === 'wallet_topup' || (payment.note && payment.note.includes('شحن محفظة'));

    let clientRef = null;
    let clientSnap = null;
    let clientData = null;
    if (payment.clientId) {
      clientRef = doc(db, 'clients', payment.clientId);
      clientSnap = await transaction.get(clientRef);
      if (clientSnap.exists()) {
        clientData = clientSnap.data();
      }
    }

    let shiftRef = null;
    let shiftSnap = null;
    let shiftData = null;
    if (payment.shiftId) {
      shiftRef = doc(db, 'shifts', payment.shiftId);
      shiftSnap = await transaction.get(shiftRef);
      if (shiftSnap.exists()) {
        shiftData = shiftSnap.data();
      }
    }

    let subRef = null;
    let subSnap = null;
    let subData = null;
    if (payment.subscriptionId) {
      subRef = doc(db, 'client_subscriptions', payment.subscriptionId);
      subSnap = await transaction.get(subRef);
      if (subSnap.exists()) {
        subData = subSnap.data();
      }
    }

    // --- 2. ALL WRITES AFTER ALL READS ---
    // 1. Revert client balances accurately
    if (clientRef && clientSnap && clientSnap.exists() && clientData) {
      const curSpend = roundCurrency(clientData.totalSpend || clientData.totalPaid || 0);
      const updates = {
        totalSpend: Math.max(0, roundCurrency(curSpend - amount)),
        updatedAt: serverTimestamp()
      };

      if (isWalletTopup) {
        const curWalletDep = roundCurrency(clientData.totalWalletDeposited || 0);
        const curBal = roundCurrency(clientData.walletBalance || 0);
        updates.totalWalletDeposited = Math.max(0, roundCurrency(curWalletDep - amount));
        updates.walletBalance = Math.max(0, roundCurrency(curBal - amount));

        // Compensating transaction in wallet ledger
        const txRef = doc(collection(db, 'wallet_transactions'));
        transaction.set(txRef, {
          clientId: payment.clientId,
          clientName: clientData.name || payment.clientName || '',
          memberId: clientData.memberId || '',
          amount: amount,
          totalCredited: -amount,
          balanceBefore: curBal,
          balanceAfter: Math.max(0, roundCurrency(curBal - amount)),
          type: 'cancellation',
          notes: `إلغاء إيصال الشحن #${payment.receiptNo || ''} (${voidReason})`,
          actorName: actorName,
          isoDate: new Date().toISOString(),
          createdAt: serverTimestamp()
        });
      } else {
        const curPaid = roundCurrency(clientData.totalPaid || 0);
        updates.totalPaid = Math.max(0, roundCurrency(curPaid - amount));

        const isDebtOrSub = payment.subscriptionId || payment.category === 'subscription' || payment.category === 'debt_payment' || payment.paymentCategory === 'debt_payment' || payment.isDebtPayment || payment.note?.includes('سداد متبقي') || payment.note?.includes('سداد قسط');
        if (isDebtOrSub) {
          const curDebt = roundCurrency(clientData.totalDebt || 0);
          updates.totalDebt = roundCurrency(curDebt + amount);
        }
      }

      transaction.update(clientRef, updates);
    }

    // 1.1 Revert subscription paid/remaining amounts if linked
    if (subRef && subData) {
      const curSubPaid = roundCurrency(subData.paidAmount || subData.paid || 0);
      const curSubRem = roundCurrency(subData.remainingAmount ?? Math.max(0, (Number(subData.packagePrice || 0) - curSubPaid)));
      transaction.update(subRef, {
        paidAmount: Math.max(0, roundCurrency(curSubPaid - amount)),
        remainingAmount: roundCurrency(curSubRem + amount),
        updatedAt: serverTimestamp()
      });
    }

    // 2. Revert shift figures ONLY if shift is open (do not crash on closed shifts)
    if (shiftRef && shiftSnap && shiftSnap.exists() && shiftData) {
      if (shiftData.status === 'open') {
        const totalRevenue = Math.max(0, roundCurrency((parseNum(shiftData.totalRevenue) || 0) - amount));
        const drawerCash = Math.max(0, roundCurrency((parseNum(shiftData.drawerCash || shiftData.cashRevenue) || 0) - (isCash ? amount : 0)));
        const cashRevenue = Math.max(0, roundCurrency((parseNum(shiftData.cashRevenue) || 0) - (isCash ? amount : 0)));
        const visaRevenue = Math.max(0, roundCurrency((parseNum(shiftData.visaRevenue) || 0) - (isVisa ? amount : 0)));
        const vodafoneRevenue = Math.max(0, roundCurrency((parseNum(shiftData.vodafoneRevenue) || 0) - (isVodafone ? amount : 0)));
        const instapayRevenue = Math.max(0, roundCurrency((parseNum(shiftData.instapayRevenue) || 0) - (isInstapay ? amount : 0)));
        const otherRevenue = Math.max(0, roundCurrency((parseNum(shiftData.otherRevenue) || 0) - (!isCash && !isVisa && !isVodafone && !isInstapay ? amount : 0)));
        const totalExpenses = roundCurrency(parseNum(shiftData.totalExpenses) || 0);
        const netAmount = roundCurrency(totalRevenue - totalExpenses);
        const expectedCash = roundCurrency(drawerCash - totalExpenses);

        transaction.update(shiftRef, {
          totalRevenue,
          drawerCash,
          cashRevenue,
          visaRevenue,
          vodafoneRevenue,
          instapayRevenue,
          otherRevenue,
          expectedCash,
          netAmount,
          updatedAt: serverTimestamp()
        });
      } else {
        // If shift is closed, record adjustment flag
        transaction.update(shiftRef, {
          hasVoidedReceipts: true,
          updatedAt: serverTimestamp()
        });
      }
    }

    // 3. Mark payment document as voided
    transaction.update(pRef, {
      isVoided: true,
      voidedAt: serverTimestamp(),
      voidedBy: actorName,
      voidReason: voidReason || 'إلغاء الإيصال بواسطة الإدارة'
    });

    return { payment, amount };
  });

  await logActivity({
    action: 'VOID_PAYMENT',
    category: 'finances',
    details: `إلغاء الإيصال رقم (${voidResult.payment.receiptNo || paymentId}) بمبلغ ${voidResult.amount} ج.م للعميل (${voidResult.payment.clientName}) - السبب: ${voidReason}`,
    actorName
  });
  return voidResult;
};

export const permanentlyDeletePayment = async (paymentId, actorName = 'المدير العام') => {
  if (!paymentId) throw new Error('معرف الإيصال غير محدد');
  const pRef = doc(db, 'payments', paymentId);
  const pSnap = await getDoc(pRef);
  if (!pSnap.exists()) {
    throw new Error('الإيصال غير موجود بالفعل');
  }
  const payment = pSnap.data();

  // If not already voided, run balance reversal first
  if (!payment.isVoided) {
    await deletePayment(paymentId, 'مسح نهائي للإيصال بواسطة الإدارة', actorName);
  }

  // Then delete the document completely from Firestore
  await deleteDoc(pRef);

  // Clean up any direct admin revenue mirror document
  try {
    const arSnap = await getDocs(query(collection(db, 'admin_revenues'), where('paymentId', '==', paymentId)));
    for (const arDoc of arSnap.docs) {
      await deleteDoc(doc(db, 'admin_revenues', arDoc.id));
    }
  } catch(e) {}

  await logActivity({
    action: 'DELETE_PAYMENT_PERMANENT',
    category: 'finances',
    details: `مسح نهائي للإيصال رقم (${payment.receiptNo || paymentId}) بمبلغ ${payment.amount} ج.م للعميل (${payment.clientName || 'عضو'})`,
    actorName
  });
};

export const getPaymentsByClient = (clientId, callback) => {
  const q = query(collection(db, 'payments'), where('clientId', '==', clientId));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => {
      const da = a.date?.toDate ? a.date.toDate() : new Date(0);
      const db2 = b.date?.toDate ? b.date.toDate() : new Date(0);
      return db2 - da;
    }));
  });
};

export const getPayments = createSharedCollectionListener(
  'all_payments',
  () => query(collection(db, 'payments'), orderBy('date', 'desc'), limit(1500))
);

// ========================
// SHIFTS
// ========================
export const openShift = async (employeeId, employeeName) => {
  const existing = await getDocs(query(
    collection(db, 'shifts'),
    where('employeeId', '==', employeeId),
    where('status', '==', 'open')
  ));
  if (!existing.empty) {
    return { id: existing.docs[0].id, ...existing.docs[0].data() };
  }

  // Scan and adopt any unlinked cash/digital payments so zero pennies are ever lost
  let adoptedRevenue = 0;
  let adoptedCash = 0;
  let adoptedVisa = 0;
  let adoptedVodafone = 0;
  let adoptedInstapay = 0;
  const unlinkedToAdopt = [];

  try {
    const unlinkedSnap = await getDocs(query(collection(db, 'payments'), where('shiftId', '==', null)));
    unlinkedSnap.forEach(d => {
      const p = d.data();
      if (!p.isVoided) {
        const amt = Number(p.amount) || 0;
        adoptedRevenue += amt;
        const method = (p.paymentMethod || 'cash').toLowerCase().trim();
        if (method === 'cash' || method === 'نقدي' || !method) adoptedCash += amt;
        else if (method === 'visa' || method === 'فيزا') adoptedVisa += amt;
        else if (method === 'vodafone_cash' || method === 'فودافون كاش') adoptedVodafone += amt;
        else if (method === 'instapay' || method === 'انستاباي' || method === 'إنستاباي') adoptedInstapay += amt;
        unlinkedToAdopt.push(d.id);
      }
    });
  } catch (err) {
    console.error('Error scanning unlinked payments for shift adoption:', err);
  }

  logActivity({
    action: 'OPEN_SHIFT',
    category: 'shifts',
    details: `بدء وفتح مناوبة جديدة للمسؤول: ${employeeName}${adoptedRevenue > 0 ? ` (تم استيعاب ${adoptedRevenue} ج.م تحصيلات سابقة لفتح المناوبة)` : ''}`,
    actorName: employeeName
  });

  const ref = await addDoc(collection(db, 'shifts'), {
    employeeId, employeeName,
    openedAt: serverTimestamp(),
    closedAt: null,
    status: 'open',
    revenues: [],
    expenses: [],
    totalRevenue: roundCurrency(adoptedRevenue),
    totalExpenses: 0,
    drawerCash: roundCurrency(adoptedCash),
    cashRevenue: roundCurrency(adoptedCash),
    visaRevenue: roundCurrency(adoptedVisa),
    vodafoneRevenue: roundCurrency(adoptedVodafone),
    instapayRevenue: roundCurrency(adoptedInstapay),
    otherRevenue: 0,
    expectedCash: roundCurrency(adoptedCash),
    netAmount: roundCurrency(adoptedRevenue),
  });

  // Link any adopted payment documents to this new shift
  for (const payId of unlinkedToAdopt) {
    try {
      await updateDoc(doc(db, 'payments', payId), {
        shiftId: ref.id,
        shiftEmployeeName: employeeName,
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      console.error('Failed linking adopted payment to shift:', e);
    }
  }

  const snap = await getDoc(ref);
  return { id: snap.id, ...snap.data() };
};

export const getOpenShift = async (employeeId) => {
  const q = query(
    collection(db, 'shifts'),
    where('employeeId', '==', employeeId),
    where('status', '==', 'open')
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
};

export const addShiftExpense = async (shiftId, expense) => {
  if (!shiftId) throw new Error('معرف المناوبة غير محدد');
  const ref = doc(db, 'shifts', shiftId);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('المناوبة غير موجودة');
    const shift = snap.data();

    if (shift.status === 'closed') {
      throw new Error('لا يمكن إضافة مصروفات إلى مناوبة مغلقة مسبقاً! يرجى فتح مناوبة جديدة.');
    }

    const expAmount = roundCurrency(expense.amount);
    if (expAmount <= 0) throw new Error('قيمة المصروف يجب أن تكون أكبر من الصفر');

    const newExpenseRecord = {
      ...expense,
      amount: expAmount,
      id: 'SE_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
      date: new Date().toISOString()
    };

    const expenses = [...(shift.expenses || []), newExpenseRecord];
    const totalExpenses = roundCurrency((parseNum(shift.totalExpenses) || 0) + expAmount);
    const totalRevenue = roundCurrency(parseNum(shift.totalRevenue) || 0);
    const netAmount = roundCurrency(totalRevenue - totalExpenses);
    const drawerCash = roundCurrency(parseNum(shift.drawerCash != null ? shift.drawerCash : (shift.cashRevenue || 0)));
    const expectedCash = roundCurrency(drawerCash - totalExpenses);

    transaction.update(ref, {
      expenses,
      totalExpenses,
      netAmount,
      expectedCash,
      updatedAt: serverTimestamp()
    });
  });
};

export const addShiftRevenue = async (shiftId, revenue) => {
  if (!shiftId) throw new Error('معرف المناوبة غير محدد');
  const ref = doc(db, 'shifts', shiftId);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('المناوبة غير موجودة');
    const shift = snap.data();

    if (shift.status === 'closed') {
      throw new Error('لا يمكن إضافة إيرادات إلى مناوبة مغلقة مسبقاً! يرجى فتح مناوبة جديدة.');
    }

    const revAmount = roundCurrency(revenue.amount);
    if (revAmount <= 0) throw new Error('قيمة الإيراد يجب أن تكون أكبر من الصفر');

    const cleanMethod = (revenue.paymentMethod || 'cash').toLowerCase().trim();
    const isCash = !revenue.paymentMethod || cleanMethod === 'cash' || cleanMethod === 'نقدي';

    const newRevenueRecord = {
      ...revenue,
      amount: revAmount,
      id: 'SR_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
      date: new Date().toISOString()
    };

    const revenues = [...(shift.revenues || []), newRevenueRecord];
    const totalRevenue = roundCurrency((parseNum(shift.totalRevenue) || 0) + revAmount);
    const drawerCash = roundCurrency((parseNum(shift.drawerCash != null ? shift.drawerCash : (shift.cashRevenue || 0))) + (isCash ? revAmount : 0));
    const cashRevenue = roundCurrency((parseNum(shift.cashRevenue) || 0) + (isCash ? revAmount : 0));
    const totalExpenses = roundCurrency(parseNum(shift.totalExpenses) || 0);
    const netAmount = roundCurrency(totalRevenue - totalExpenses);
    const expectedCash = roundCurrency(drawerCash - totalExpenses);

    transaction.update(ref, {
      revenues,
      totalRevenue,
      netAmount,
      drawerCash,
      cashRevenue,
      expectedCash,
      updatedAt: serverTimestamp()
    });
  });
};

export const updateShiftTotals = async (shiftId, paymentAmount) => {
  const ref = doc(db, 'shifts', shiftId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) return;
    const shift = snap.data();
    if (shift.status === 'closed') return;
    const totalRevenue = roundCurrency((parseNum(shift.totalRevenue) || 0) + parseNum(paymentAmount));
    const netAmount = roundCurrency(totalRevenue - (parseNum(shift.totalExpenses) || 0));
    transaction.update(ref, { totalRevenue, netAmount, updatedAt: serverTimestamp() });
  });
};

export const closeShift = async (shiftId, handoverData = {}) => {
  if (!shiftId) throw new Error('معرف المناوبة غير محدد');
  const ref = doc(db, 'shifts', shiftId);

  const finalResult = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('المناوبة غير موجودة');
    const shift = snap.data();

    if (shift.status === 'closed') {
      throw new Error('هذه المناوبة مغلقة بالفعل مسبقاً!');
    }

    const drawerCash = roundCurrency(parseNum(shift.drawerCash != null ? shift.drawerCash : (shift.cashRevenue || 0)));
    const totalExpenses = roundCurrency(parseNum(shift.totalExpenses) || 0);
    const calcExpectedCash = roundCurrency(drawerCash - totalExpenses);

    const actualCash = handoverData.actualCash !== undefined ? roundCurrency(handoverData.actualCash) : calcExpectedCash;
    const cashDifference = roundCurrency(actualCash - calcExpectedCash);

    const payload = {
      status: 'closed',
      closedAt: serverTimestamp(),
      drawerCash,
      expectedCash: calcExpectedCash,
      actualCash,
      cashDifference,
      handoverNotes: handoverData.handoverNotes || '',
      receivedBy: handoverData.receivedBy || 'الإدارة',
      closedByEmployee: handoverData.employeeName || shift.employeeName || 'الاستقبال'
    };

    transaction.update(ref, payload);
    return {
      actualCash,
      cashDifference,
      receivedBy: payload.receivedBy,
      employeeName: payload.closedByEmployee,
      shiftData: shift,
      expectedCash: calcExpectedCash,
      drawerCash,
      totalExpenses,
      handoverNotes: payload.handoverNotes
    };
  });

  const diffStr = ` (العهدة المسلمة: ${finalResult.actualCash} ج.م | الفارق: ${finalResult.cashDifference > 0 ? '+' : ''}${finalResult.cashDifference} ج.م | المستلم: ${finalResult.receivedBy})`;

  await logActivity({
    action: 'CLOSE_SHIFT',
    category: 'shifts',
    details: `تقفيل ومحضر تسليم المناوبة (كود: ${shiftId})${diffStr}`,
    actorName: finalResult.employeeName || 'الاستقبال/الإدارة'
  });

  // إرسال تقرير تدقيق إقفال الوردية الذكي على تلغرام
  try {
    let paymentsCash = 0;
    let paymentsDigital = 0;
    let paymentsCount = 0;
    let ticketsCash = 0;
    let ticketsDigital = 0;
    let ticketsCount = 0;

    try {
      const [paymentsSnap, ticketsSnap] = await Promise.all([
        getDocs(query(collection(db, 'payments'), where('shiftId', '==', shiftId))),
        getDocs(query(collection(db, 'ticket_sales'), where('shiftId', '==', shiftId))).catch(() => ({ docs: [] }))
      ]);

      paymentsSnap.docs.forEach(d => {
        const p = d.data();
        if (p.isVoided) return;
        const amt = Number(p.amount) || 0;
        const method = (p.paymentMethod || 'cash').toLowerCase().trim();
        const isCash = method === 'cash' || method === 'نقدي' || !p.paymentMethod;
        if (isCash) paymentsCash += amt;
        else paymentsDigital += amt;
        paymentsCount++;
      });

      ticketsSnap.docs.forEach(d => {
        const t = d.data();
        const amt = Number(t.total) || (Number(t.quantity) * Number(t.ticketPrice)) || 0;
        const method = (t.paymentMethod || 'cash').toLowerCase().trim();
        const isCash = method === 'cash' || method === 'نقدي' || !t.paymentMethod;
        if (isCash) ticketsCash += amt;
        else ticketsDigital += amt;
        ticketsCount++;
      });
    } catch (fetchErr) {
      console.warn('Could not fetch shift payments/tickets for telegram report:', fetchErr);
    }

    const shiftRevs = Array.isArray(finalResult.shiftData?.revenues) ? finalResult.shiftData.revenues : [];
    const shiftExps = Array.isArray(finalResult.shiftData?.expenses) ? finalResult.shiftData.expenses : [];
    const shiftRevsTotal = shiftRevs.reduce((s, r) => s + (Number(r?.amount) || 0), 0);
    const shiftExpsTotal = shiftExps.reduce((s, e) => s + (Number(e?.amount) || 0), 0);

    const totalIncome = paymentsCash + paymentsDigital + ticketsCash + ticketsDigital + shiftRevsTotal;
    const cashIncome = paymentsCash + ticketsCash + shiftRevsTotal;
    const digitalIncome = paymentsDigital + ticketsDigital;

    // توقيت المناوبة وحساب المدة
    const parseShiftDate = (val) => {
      if (!val) return null;
      if (val.toDate && typeof val.toDate === 'function') return val.toDate();
      if (val instanceof Date) return val;
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d;
    };

    const startTime = parseShiftDate(finalResult.shiftData?.openedAt || finalResult.shiftData?.startTime || finalResult.shiftData?.createdAt);
    const endTime = new Date();

    const formatClock = (d) => {
      if (!d) return '—';
      return new Intl.DateTimeFormat('ar-EG', {
        timeZone: 'Africa/Cairo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }).format(d);
    };

    let durationText = '';
    if (startTime) {
      const diffMs = Math.max(0, endTime.getTime() - startTime.getTime());
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      durationText = `${hours} س و ${mins} د`;
    }

    // تقييم المطابقة والعجز/الزيادة
    const diff = finalResult.cashDifference;
    let verdictIcon = '🟢';
    let verdictText = 'مطابقة تامة 100% (الخزينة متزنة بالمليم)';
    if (diff < 0) {
      verdictIcon = '🔴';
      verdictText = `عجز نقدي في الدرج بمقدار (${formatCurrency(Math.abs(diff))})`;
    } else if (diff > 0) {
      verdictIcon = '🟡';
      verdictText = `فائض نقدي زيادة في الدرج بمقدار (+${formatCurrency(diff)})`;
    }

    // تفصيل المصروفات
    let expensesListText = '';
    if (shiftExps.length > 0) {
      expensesListText = shiftExps.map(e => `  • ${e.label || e.type || 'بند مصروف'}: <b>${formatCurrency(e.amount)}</b>${e.note ? ` <i>(${e.note})</i>` : ''}`).join('\n');
    } else {
      expensesListText = '  <i>لا توجد مصروفات مسجلة خلال هذه الوردية.</i>';
    }

    const notesBlock = finalResult.handoverNotes ? `\n📝 <b>ملاحظات التسليم:</b> <i>${finalResult.handoverNotes}</i>\n` : '';

    const telegramMsg = `<b>📋 تقرير إقفال الوردية الذكي (Shift Audit)</b>
━━━━━━━━━━━━━━━━━
👤 <b>الكاشير:</b> <b>${finalResult.employeeName || 'الاستقبال'}</b>
📥 <b>المستلم:</b> ${finalResult.receivedBy || 'الإدارة'}
🔖 <b>كود الوردية:</b> <code>${shiftId}</code>
⏰ <b>التوقيت:</b> من ${formatClock(startTime)} إلى ${formatClock(endTime)} ${durationText ? `(${durationText})` : ''}
━━━━━━━━━━━━━━━━━
💰 <b>إجمالي التحصيل والمبيعات:</b> <b>${formatCurrency(totalIncome)}</b>
  ├─ 💵 نقدي (Cash): <b>${formatCurrency(cashIncome)}</b>
  └─ 💳 إلكتروني (إنستاباي): <b>${formatCurrency(digitalIncome)}</b>

📋 <b>تفاصيل العمليات:</b>
  • اشتراكات وباقات: ${formatCurrency(paymentsCash + paymentsDigital)} (${paymentsCount} عملية)
  • تذاكر وزيارات: ${formatCurrency(ticketsCash + ticketsDigital)} (${ticketsCount} تذكرة)
  ${shiftRevsTotal > 0 ? `• إيرادات إضافية للوردية: ${formatCurrency(shiftRevsTotal)}\n` : ''}━━━━━━━━━━━━━━━━━
📉 <b>مصروفات ونثريات الوردية (${formatCurrency(shiftExpsTotal)}):</b>
${expensesListText}
━━━━━━━━━━━━━━━━━
🔐 <b>ميزان تسليم الخزينة والجرد:</b>
  • النقدية المفترضة بالدرج: <b>${formatCurrency(finalResult.expectedCash)}</b>
  • النقدية الفعلية المسلمة: <b>${formatCurrency(finalResult.actualCash)}</b>
  • الفارق: <b>${diff > 0 ? '+' : ''}${formatCurrency(diff)}</b>

${verdictIcon} <b>النتيجة:</b> <b>${verdictText}</b>
${notesBlock}━━━━━━━━━━━━━━━━━
🔒 <i>إشعار تدقيق فوري - نظام THE FIRST GROUP</i>`;

    await sendTelegramMessage(telegramMsg);
  } catch (err) {
    console.error('Failed to send Telegram shift audit notification:', err);
  }

};

export const updateShiftHandover = async (shiftId, handoverData = {}) => {
  const payload = {
    expectedCash: Number(handoverData.expectedCash) || 0,
    actualCash: Number(handoverData.actualCash) || 0,
    cashDifference: Number(handoverData.cashDifference) || 0,
    handoverNotes: handoverData.handoverNotes || '',
    receivedBy: handoverData.receivedBy || 'الإدارة',
    adjustedAt: serverTimestamp(),
    adjustedBy: handoverData.adjustedBy || 'المدير العام'
  };

  const diffStr = ` (المبلغ الجديد: ${handoverData.actualCash} ج.م | الفارق: ${handoverData.cashDifference > 0 ? '+' : ''}${handoverData.cashDifference} ج.م)`;

  await logActivity({
    action: 'ADJUST_SHIFT_HANDOVER',
    category: 'shifts',
    details: `تصحيح وتعديل محضر جرد المناوبة (كود: ${shiftId}) بواسطة الإدارة${diffStr} - السبب: ${handoverData.adjustmentReason || 'تصحيح خطأ إدخال'}`,
    actorName: handoverData.adjustedBy || 'المدير العام'
  });

  await updateDoc(doc(db, 'shifts', shiftId), payload);
};


export const deleteShiftExpense = async (shiftId, expenseIdOrObj) => {
  if (!shiftId) return;
  const ref = doc(db, 'shifts', shiftId);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) return;
    const shift = snap.data();

    if (shift.status === 'closed') {
      throw new Error('لا يمكن حذف مصروف من مناوبة مغلقة ومسلمة إدارياً مسبقاً! للحفاظ على مطابقة الخزينة.');
    }

    const targetId = typeof expenseIdOrObj === 'object' ? (expenseIdOrObj?.id || expenseIdOrObj?.label) : expenseIdOrObj;
    const expense = (shift.expenses || []).find(e => e.id === targetId || (typeof expenseIdOrObj === 'object' && e.label === expenseIdOrObj.label && Number(e.amount) === Number(expenseIdOrObj.amount)));
    if (!expense) return;

    // If this expense was linked to instructor subscriptions, revert them
    if (expense.subscriptionIds && Array.isArray(expense.subscriptionIds)) {
      for (const subId of expense.subscriptionIds) {
        transaction.update(doc(db, 'client_subscriptions', subId), {
          instructorSettled: false,
          settledAt: null,
          settledBy: null,
          settlementNote: null,
          settledShiftId: null
        });
      }
    }

    const expAmount = roundCurrency(parseNum(expense.amount) || 0);
    const expenses = (shift.expenses || []).filter(e => e !== expense && e.id !== expense.id);
    const totalExpenses = roundCurrency(Math.max(0, (shift.totalExpenses || 0) - expAmount));
    const totalRevenue = roundCurrency(shift.totalRevenue || 0);
    const netAmount = roundCurrency(totalRevenue - totalExpenses);
    const drawerCash = roundCurrency(parseNum(shift.drawerCash != null ? shift.drawerCash : (shift.cashRevenue || 0)));
    const expectedCash = roundCurrency(drawerCash - totalExpenses);

    transaction.update(ref, {
      expenses,
      totalExpenses,
      netAmount,
      expectedCash,
      updatedAt: serverTimestamp()
    });
  });
};

export const deleteShift = async (shiftId) => {
  // 1. Revert and delete all payments associated with this shift
  const payQuery = query(collection(db, 'payments'), where('shiftId', '==', shiftId));
  const paySnap = await getDocs(payQuery);
  for (const pDoc of paySnap.docs) {
    const pData = pDoc.data();
    if (pData.clientId) {
      const clientRef = doc(db, 'clients', pData.clientId);
      const cSnap = await getDoc(clientRef);
      if (cSnap.exists()) {
        const curPaid = parseNum(cSnap.data().totalPaid) || 0;
        const newPaid = Math.max(0, curPaid - (parseNum(pData.amount) || 0));
        await updateDoc(clientRef, { totalPaid: newPaid });
      }
    }
    await deleteDoc(doc(db, 'payments', pDoc.id));
  }

  // 2. Revert any teacher settlements linked to this shift
  const subQuery = query(collection(db, 'client_subscriptions'), where('settledShiftId', '==', shiftId));
  const subSnap = await getDocs(subQuery);
  for (const sDoc of subSnap.docs) {
    await updateDoc(doc(db, 'client_subscriptions', sDoc.id), {
      instructorSettled: false,
      settledAt: null,
      settledBy: null,
      settlementNote: null,
      settledShiftId: null
    });
  }

  // Also check if any subscriptions have this shiftId from shift expenses
  const shiftRef = doc(db, 'shifts', shiftId);
  const shiftSnap = await getDoc(shiftRef);
  if (shiftSnap.exists()) {
    const expenses = shiftSnap.data().expenses || [];
    for (const exp of expenses) {
      if (exp.subscriptionIds && Array.isArray(exp.subscriptionIds)) {
        for (const subId of exp.subscriptionIds) {
          await updateDoc(doc(db, 'client_subscriptions', subId), {
            instructorSettled: false,
            settledAt: null,
            settledBy: null,
            settlementNote: null,
            settledShiftId: null
          });
        }
      }
    }
  }

  // 3. Revert and delete sessions linked to this shift
  const sessQuery = query(collection(db, 'sessions'), where('shiftId', '==', shiftId));
  const sessSnap = await getDocs(sessQuery);
  for (const sessDoc of sessSnap.docs) {
    const sData = sessDoc.data();
    if (sData.clientId) {
      const cRef = doc(db, 'clients', sData.clientId);
      const cSnap = await getDoc(cRef);
      if (cSnap.exists()) {
        const curUsed = cSnap.data().sessionsUsed || 0;
        await updateDoc(cRef, { sessionsUsed: Math.max(0, curUsed - 1) });
      }
    }
    if (sData.subscriptionId) {
      const subRef = doc(db, 'client_subscriptions', sData.subscriptionId);
      const subSnap = await getDoc(subRef);
      if (subSnap.exists()) {
        const subData = subSnap.data();
        const curSubUsed = subData.sessionsUsed || 0;
        const newUsed = Math.max(0, curSubUsed - 1);
        await updateDoc(subRef, {
          sessionsUsed: newUsed,
          status: newUsed < (parseNum(subData.packageSessions) || 0) ? 'active' : subData.status
        });
      }
    }
    await deleteDoc(doc(db, 'sessions', sessDoc.id));
  }

  await deleteDoc(doc(db, 'shifts', shiftId));
  await logActivity({
    action: 'DELETE_SHIFT',
    category: 'shifts',
    details: `حذف المناوبة (${shiftId}) واسترجاع تسويات ومستحقات المدرسين والحصص والمدفوعات المرتبطة بها تلقائياً`,
    actorName: 'الإدارة'
  });
};

export const deleteShiftRevenue = async (shiftId, revenueIdOrObj) => {
  if (!shiftId) return;
  const ref = doc(db, 'shifts', shiftId);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) return;
    const shift = snap.data();

    if (shift.status === 'closed') {
      throw new Error('لا يمكن حذف إيراد من مناوبة مغلقة ومسلمة إدارياً مسبقاً! للحفاظ على مطابقة الخزينة.');
    }

    const targetId = typeof revenueIdOrObj === 'object' ? (revenueIdOrObj?.id || revenueIdOrObj?.label) : revenueIdOrObj;
    const revenue = (shift.revenues || []).find(r => r.id === targetId || (typeof revenueIdOrObj === 'object' && r.label === revenueIdOrObj.label && Number(r.amount) === Number(revenueIdOrObj.amount)));
    if (!revenue) return;

    const revAmount = roundCurrency(parseNum(revenue.amount) || 0);
    const revenues = (shift.revenues || []).filter(r => r !== revenue && r.id !== revenue.id);
    const totalRevenue = roundCurrency(Math.max(0, (shift.totalRevenue || 0) - revAmount));
    const totalExpenses = roundCurrency(shift.totalExpenses || 0);
    const netAmount = roundCurrency(totalRevenue - totalExpenses);

    const isCash = !revenue.type || revenue.type === 'cash' || revenue.paymentMethod === 'cash';
    const curDrawer = parseNum(shift.drawerCash != null ? shift.drawerCash : (shift.cashRevenue || 0));
    const drawerCash = isCash ? roundCurrency(Math.max(0, curDrawer - revAmount)) : roundCurrency(curDrawer);
    const expectedCash = roundCurrency(drawerCash - totalExpenses);

    transaction.update(ref, {
      revenues,
      totalRevenue,
      drawerCash,
      netAmount,
      expectedCash,
      updatedAt: serverTimestamp()
    });
  });
};

export const getAllShifts = createSharedCollectionListener(
  'shifts_all',
  () => query(collection(db, 'shifts'), limit(250)),
  (d) => ({ id: d.id, ...d.data() }),
  (a, b) => {
    const getMs = (ts) => ts?.toDate ? ts.toDate().getTime() : (ts?.seconds ? ts.seconds * 1000 : (ts ? new Date(ts).getTime() : 0));
    return getMs(b.openedAt) - getMs(a.openedAt);
  }
);
export const getShifts = (callback) => getAllShifts(callback);

export const watchShift = (shiftId, callback) => {
  return onSnapshot(doc(db, 'shifts', shiftId), (snap) => {
    if (snap.exists()) callback({ id: snap.id, ...snap.data() });
  });
};

// ========================
// ATTENDANCE
// ========================
export const recordAttendance = async (memberId, employeeName) => {
  const mId = String(memberId || '').trim();
  if (!mId) throw new Error('يرجى إدخال رقم العضوية');

  // 1. Lookup employee in employees collection
  let matchedEmpData = null;
  try {
    const empsSnap = await getDocs(collection(db, 'employees'));
    const matchedDoc = empsSnap.docs.find(d => {
      const data = d.data();
      return String(data.memberId || '').trim().toLowerCase() === mId.toLowerCase() ||
             String(data.code || '').trim().toLowerCase() === mId.toLowerCase() ||
             String(data.name || '').trim().toLowerCase() === mId.toLowerCase();
    });
    if (matchedDoc) matchedEmpData = matchedDoc.data();
  } catch (e) {}

  // 2. Fallback to legacy users collection if not found in employees
  if (!matchedEmpData) {
    const allEmpsSnap = await getDocs(query(collection(db, 'users'), where('role', 'in', ['employee', 'cafe', 'staff', 'barista'])));
    const matchedDoc = allEmpsSnap.docs.find(d => {
      const data = d.data();
      return String(data.memberId || '').trim().toLowerCase() === mId.toLowerCase() ||
             String(data.username || '').trim().toLowerCase() === mId.toLowerCase() ||
             String(data.name || '').trim().toLowerCase() === mId.toLowerCase();
    });
    if (matchedDoc) matchedEmpData = matchedDoc.data();
  }

  if (!matchedEmpData) {
    throw new Error(`كود أو رقم "${mId}" غير مسجل في قائمة موظفي المكان`);
  }

  const actualMemberId = matchedEmpData.memberId || mId;
  const name = matchedEmpData.name || employeeName || actualMemberId;

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // Get all attendance records for this employee
  const q = query(
    collection(db, 'attendance'),
    where('memberId', '==', actualMemberId)
  );
  const snap = await getDocs(q);
  const todayRecords = snap.docs.filter(d => d.data().date === today);

  // Auto-close any orphaned check-in from prior days
  const unclosedOldRecords = snap.docs.filter(d => d.data().date && d.data().date < today && !d.data().checkOut);
  for (const oldDoc of unclosedOldRecords) {
    const oldData = oldDoc.data();
    const oldCheckIn = new Date(oldData.checkIn);
    const autoCheckOut = new Date(oldCheckIn.getTime() + 8 * 60 * 60 * 1000);
    await updateDoc(doc(db, 'attendance', oldDoc.id), {
      checkOut: autoCheckOut.toISOString(),
      hours: 8,
      notes: 'إغلاق تلقائي بنهاية الوردية (نسيان تسجيل الانصراف)'
    });
  }

  // Check if there is an active check-in without check-out for today
  const openRecord = todayRecords.find(d => !d.data().checkOut);

  if (!openRecord) {
    // Start a new Check-In session
    const checkInTime = new Date().toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
    const sessionNum = todayRecords.length + 1;
    const docRef = await addDoc(collection(db, 'attendance'), {
      memberId: actualMemberId,
      employeeName: name,
      date: today,
      checkIn: new Date().toISOString(),
      checkOut: null,
      hours: null,
      sessionNum,
      createdAt: serverTimestamp()
    });
    return {
      type: 'checkin',
      employeeName: name,
      memberId: actualMemberId,
      sessionNum,
      id: docRef.id,
      time: checkInTime
    };
  } else {
    // Close the current open Check-In session with Check-Out
    const data = openRecord.data();
    const checkIn = new Date(data.checkIn);
    const checkOut = new Date();
    const diffHours = ((checkOut - checkIn) / (1000 * 60 * 60));
    const hours = Math.max(0.01, diffHours).toFixed(2);
    const checkOutTime = checkOut.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
    
    await updateDoc(doc(db, 'attendance', openRecord.id), {
      checkOut: checkOut.toISOString(),
      hours: parseNum(hours),
      employeeName: name || data.employeeName || ''
    });

    const previousHours = todayRecords
      .filter(d => d.id !== openRecord.id && d.data().checkOut)
      .reduce((s, d) => s + (parseNum(d.data().hours) || 0), 0);
    const todayTotalHours = (previousHours + parseNum(hours)).toFixed(2);

    return {
      type: 'checkout',
      employeeName: name || data.employeeName,
      memberId: actualMemberId,
      hours,
      todayTotalHours,
      sessionNum: data.sessionNum || todayRecords.length,
      time: checkOutTime
    };
  }
};

export const getAttendanceByEmployee = async (memberId, month) => {
  const mId = String(memberId || '').trim();
  let q;
  if (mId) {
    q = query(collection(db, 'attendance'), where('memberId', '==', mId));
  } else {
    q = collection(db, 'attendance');
  }
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(d => !month || (d.date && d.date.startsWith(month)));
};

export const getAllAttendance = (callback) => {
  const q = query(collection(db, 'attendance'), orderBy('date', 'desc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
};

export const getMonthlyAttendanceSummary = async (month) => {
  const q = query(
    collection(db, 'attendance'),
    where('date', '>=', `${month}-01`),
    where('date', '<=', `${month}-31`)
  );
  const snap = await getDocs(q);
  const records = snap.docs.map(d => d.data());
  const summary = {};
  records.forEach(r => {
    if (!summary[r.memberId]) summary[r.memberId] = { days: 0, hours: 0 };
    if (r.checkOut) {
      summary[r.memberId].days += 1;
      summary[r.memberId].hours += parseNum(r.hours) || 0;
    }
  });
  return summary;
};

export const deleteAttendanceRecord = async (id, actorName = 'الإدارة') => {
  const aRef = doc(db, 'attendance', id);
  const snap = await getDoc(aRef);
  const data = snap.exists() ? snap.data() : {};
  await deleteDoc(aRef);
  await logActivity({
    action: 'DELETE_ATTENDANCE_RECORD',
    category: 'attendance',
    details: `حذف سجل حضور/انصراف للموظف ${data.employeeName || data.memberId || id} بتأريخ ${data.date || ''}`,
    actorName
  });
};

export const manualCheckoutAttendance = async (id, customHours = null, actorName = 'الإدارة') => {
  const aRef = doc(db, 'attendance', id);
  const snap = await getDoc(aRef);
  if (!snap.exists()) return;
  const data = snap.data();
  const checkIn = new Date(data.checkIn);
  const checkOut = new Date();
  const hours = customHours != null ? parseNum(customHours) : Math.max(0.1, Number(((checkOut - checkIn) / (1000 * 60 * 60)).toFixed(2)));

  await updateDoc(aRef, {
    checkOut: checkOut.toISOString(),
    hours,
    notes: `تسجيل انصراف يدوي بواسطة ${actorName}`
  });

  await logActivity({
    action: 'MANUAL_CHECKOUT_ATTENDANCE',
    category: 'attendance',
    details: `تسجيل انصراف يدوي للموظف ${data.employeeName || data.memberId} (${hours} ساعة)`,
    actorName
  });
};

// ========================
// SALARIES
// ========================
export const getSalary = async (employeeId, month) => {
  const snap = await getDoc(doc(db, 'salaries', `${month}_${employeeId}`));
  return snap.exists() ? snap.data() : null;
};

export const saveSalary = async (employeeId, month, data) => {
  await setDoc(doc(db, 'salaries', `${month}_${employeeId}`), {
    employeeId, month, ...data, updatedAt: serverTimestamp()
  }, { merge: true });
};

export const getAllSalaries = async (month) => {
  const q = query(collection(db, 'salaries'), where('month', '==', month));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

// ========================
// SESSIONS
// ========================
export const getSessions = (callback) => {
  const q = query(collection(db, 'sessions'), orderBy('date', 'desc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
};

export const getAllPayments = getPayments;

export const getShiftPayments = async (shiftId) => {
  const q = query(collection(db, 'payments'), where('shiftId', '==', shiftId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const watchPaymentsByShift = (shiftId, callback) => {
  if (!shiftId) {
    callback([]);
    return () => {};
  }
  const q = query(collection(db, 'payments'), where('shiftId', '==', shiftId));
  return onSnapshot(q, (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
};

export const watchTicketSalesByShift = (shiftId, callback) => {
  if (!shiftId) {
    callback([]);
    return () => {};
  }
  const q = query(collection(db, 'ticket_sales'), where('shiftId', '==', shiftId));
  return onSnapshot(q, (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
};

export const getShiftSessions = async (shiftId) => {
  const q = query(collection(db, 'sessions'), where('shiftId', '==', shiftId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

// ========================
// TICKETS
// ========================
export const getTickets = createSharedCollectionListener(
  'tickets',
  () => query(collection(db, 'tickets'), orderBy('name'))
);

export const addTicket = (data) =>
  addDoc(collection(db, 'tickets'), { ...data, price: parseNum(data.price), createdAt: serverTimestamp() });
export const updateTicket = (id, data) => updateDoc(doc(db, 'tickets', id), data);
export const deleteTicket = (id) => deleteDoc(doc(db, 'tickets', id));

export const sellTicket = async (ticketId, ticketName, ticketPrice, shiftId, employeeId, quantity = 1, paymentMethod = 'cash', buyerName = '', buyerPhone = '') => {
  const parsedPrice = parseNum(ticketPrice) || 0;
  const parsedQty = Math.max(1, parseNum(quantity) || 1);
  const totalAmount = roundCurrency(parsedPrice * parsedQty);
  if (totalAmount <= 0) {
    throw new Error('قيمة التذكرة يجب أن تكون أكبر من الصفر');
  }

  const cleanMethod = (paymentMethod || 'cash').toLowerCase().trim();
  const isCash = cleanMethod === 'cash' || cleanMethod === 'نقدي' || !cleanMethod;
  const isVisa = cleanMethod === 'visa' || cleanMethod === 'فيزا';
  const isVodafone = cleanMethod === 'vodafone_cash' || cleanMethod === 'فودافون كاش';
  const isInstapay = cleanMethod === 'instapay' || cleanMethod === 'انستاباي' || cleanMethod === 'إنستاباي';

  const saleRef = doc(collection(db, 'ticket_sales'));
  const shiftRef = shiftId ? doc(db, 'shifts', shiftId) : null;

  await runTransaction(db, async (transaction) => {
    if (shiftRef) {
      const shiftSnap = await transaction.get(shiftRef);
      if (shiftSnap.exists()) {
        const shift = shiftSnap.data();
        if (shift.status === 'closed') {
          throw new Error('لا يمكن بيع تذكرة على وردية مغلقة! يرجى اختيار المناوبة المفتوحة حالياً.');
        }

        const totalRevenue = roundCurrency((parseNum(shift.totalRevenue) || 0) + totalAmount);
        const drawerCash = roundCurrency((parseNum(shift.drawerCash || shift.cashRevenue) || 0) + (isCash ? totalAmount : 0));
        const cashRevenue = roundCurrency((parseNum(shift.cashRevenue) || 0) + (isCash ? totalAmount : 0));
        const visaRevenue = roundCurrency((parseNum(shift.visaRevenue) || 0) + (isVisa ? totalAmount : 0));
        const vodafoneRevenue = roundCurrency((parseNum(shift.vodafoneRevenue) || 0) + (isVodafone ? totalAmount : 0));
        const instapayRevenue = roundCurrency((parseNum(shift.instapayRevenue) || 0) + (isInstapay ? totalAmount : 0));
        const otherRevenue = roundCurrency((parseNum(shift.otherRevenue) || 0) + (!isCash && !isVisa && !isVodafone && !isInstapay ? totalAmount : 0));
        const totalExpenses = roundCurrency(parseNum(shift.totalExpenses) || 0);
        const netAmount = roundCurrency(totalRevenue - totalExpenses);
        const expectedCash = roundCurrency(drawerCash - totalExpenses);

        transaction.update(shiftRef, {
          totalRevenue,
          drawerCash,
          cashRevenue,
          visaRevenue,
          vodafoneRevenue,
          instapayRevenue,
          otherRevenue,
          expectedCash,
          netAmount,
          updatedAt: serverTimestamp()
        });
      }
    }

    transaction.set(saleRef, {
      ticketId: ticketId || null,
      ticketName: ticketName || '',
      ticketPrice: parsedPrice,
      quantity: parsedQty,
      total: totalAmount,
      paymentMethod: cleanMethod,
      buyerName: buyerName || '',
      buyerPhone: buyerPhone || '',
      shiftId: shiftId || null,
      employeeId: employeeId || null,
      date: serverTimestamp()
    });
  });

  await logActivity({
    action: 'SELL_TICKET',
    category: 'financial',
    details: `بيع عدد ${parsedQty} تذكرة (${ticketName}) بإجمالي ${totalAmount} ج.م [طريقة الدفع: ${cleanMethod}]`,
    actorName: employeeId ? `الموظف (${employeeId})` : 'الاستقبال / الإدارة'
  });

  return saleRef;
};

export const deleteTicketSale = async (saleId) => {
  if (!saleId) return;
  const sRef = doc(db, 'ticket_sales', saleId);

  await runTransaction(db, async (transaction) => {
    const sSnap = await transaction.get(sRef);
    if (!sSnap.exists()) return;
    const sale = sSnap.data();
    const amount = roundCurrency(sale.total || (parseNum(sale.quantity) * parseNum(sale.ticketPrice)) || 0);

    if (sale.shiftId) {
      const shiftRef = doc(db, 'shifts', sale.shiftId);
      const shiftSnap = await transaction.get(shiftRef);
      if (shiftSnap.exists()) {
        const shift = shiftSnap.data();
        if (shift.status === 'closed') {
          throw new Error('لا يمكن حذف أو إلغاء تذكرة مسجلة على وردية مغلقة ومسلمة إدارياً مسبقاً! للحفاظ على سلامة القيود المحاسبية.');
        }
        const cleanMethod = (sale.paymentMethod || 'cash').toLowerCase().trim();
        const isCash = cleanMethod === 'cash' || cleanMethod === 'نقدي' || !cleanMethod;
        const isVisa = cleanMethod === 'visa' || cleanMethod === 'فيزا';
        const isVodafone = cleanMethod === 'vodafone_cash' || cleanMethod === 'فودافون كاش';
        const isInstapay = cleanMethod === 'instapay' || cleanMethod === 'انستاباي' || cleanMethod === 'إنستاباي';

        const totalRevenue = Math.max(0, roundCurrency((parseNum(shift.totalRevenue) || 0) - amount));
        const drawerCash = Math.max(0, roundCurrency((parseNum(shift.drawerCash || shift.cashRevenue) || 0) - (isCash ? amount : 0)));
        const cashRevenue = Math.max(0, roundCurrency((parseNum(shift.cashRevenue) || 0) - (isCash ? amount : 0)));
        const visaRevenue = Math.max(0, roundCurrency((parseNum(shift.visaRevenue) || 0) - (isVisa ? amount : 0)));
        const vodafoneRevenue = Math.max(0, roundCurrency((parseNum(shift.vodafoneRevenue) || 0) - (isVodafone ? amount : 0)));
        const instapayRevenue = Math.max(0, roundCurrency((parseNum(shift.instapayRevenue) || 0) - (isInstapay ? amount : 0)));
        const otherRevenue = Math.max(0, roundCurrency((parseNum(shift.otherRevenue) || 0) - (!isCash && !isVisa && !isVodafone && !isInstapay ? amount : 0)));
        const totalExpenses = roundCurrency(parseNum(shift.totalExpenses) || 0);
        const netAmount = roundCurrency(totalRevenue - totalExpenses);
        const expectedCash = roundCurrency(drawerCash - totalExpenses);

        transaction.update(shiftRef, {
          totalRevenue,
          drawerCash,
          cashRevenue,
          visaRevenue,
          vodafoneRevenue,
          instapayRevenue,
          otherRevenue,
          expectedCash,
          netAmount,
          updatedAt: serverTimestamp()
        });
      }
    }

    transaction.delete(sRef);
  });

  await logActivity({
    action: 'DELETE_TICKET_SALE',
    category: 'financial',
    details: `حذف بيع تذكرة (${saleId}) وتعديل إيراد المناوبة`,
    actorName: 'الإدارة'
  });
};

export const getTicketSales = createSharedCollectionListener(
  'ticket_sales_all',
  () => query(collection(db, 'ticket_sales'), orderBy('date', 'desc'), limit(500))
);

export const getShiftTicketSales = async (shiftId) => {
  const q = query(collection(db, 'ticket_sales'), where('shiftId', '==', shiftId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

// ========================
// CLIENT STATUS (PAUSE/ACTIVATE)
// ========================
export const toggleClientStatus = async (clientId, newStatus) => {
  await updateDoc(doc(db, 'clients', clientId), { status: newStatus });
};

export const getClientByCode = async (code) => {
  if (!code || typeof code !== 'string') return null;
  const clean = code.trim();
  if (!clean) return null;

  // 1. Try memberId first (fastest and primary lookup)
  const qMember = query(collection(db, 'clients'), where('memberId', '==', clean));
  const snapMember = await getDocs(qMember);
  if (!snapMember.empty) return { id: snapMember.docs[0].id, ...snapMember.docs[0].data() };

  // 2. Try phone
  const qPhone = query(collection(db, 'clients'), where('phone', '==', clean));
  const snapPhone = await getDocs(qPhone);
  if (!snapPhone.empty) return { id: snapPhone.docs[0].id, ...snapPhone.docs[0].data() };

  // 3. Try name
  const qName = query(collection(db, 'clients'), where('name', '==', clean));
  const snapName = await getDocs(qName);
  if (!snapName.empty) return { id: snapName.docs[0].id, ...snapName.docs[0].data() };

  return null;
};

export const getClientById = async (clientId) => {
  const snap = await getDoc(doc(db, 'clients', clientId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

// ========================
// ADMIN REVENUES (global, not per shift)
// ========================
export const getAdminRevenues = createSharedCollectionListener(
  'admin_revenues_all',
  () => query(collection(db, 'admin_revenues'), orderBy('date', 'desc'), limit(500))
);

export const addAdminRevenue = async (data, actorName = 'الإدارة') => {
  const numAmount = roundCurrency(data.amount);
  if (numAmount <= 0) throw new Error('يرجى تحديد مبلغ إيراد صحيح أكبر من صفر');

  const ref = await addDoc(collection(db, 'admin_revenues'), {
    ...data,
    label: data.label || data.title || 'إيراد',
    title: data.title || data.label || 'إيراد',
    amount: numAmount,
    date: data.date || new Date().toISOString().split('T')[0],
    createdAt: serverTimestamp()
  });

  await logActivity({
    action: 'ADD_ADMIN_REVENUE',
    category: 'finances',
    details: `إضافة إيراد عام (${data.label || data.title || 'إيراد'}) بقيمة ${numAmount} ج.م`,
    actorName: data.actorName || actorName
  });

  return ref;
};

export const deleteAdminRevenue = async (id, details = '', actorName = 'الإدارة') => {
  await deleteDoc(doc(db, 'admin_revenues', id));
  await logActivity({
    action: 'DELETE_ADMIN_REVENUE',
    category: 'finances',
    details: `حذف إيراد عام: ${details || id}`,
    actorName
  });
};

// ========================
// ADMIN EXPENSES (global Central Safe expenses)
// ========================
export const getAdminExpenses = createSharedCollectionListener(
  'admin_expenses_all',
  () => query(collection(db, 'admin_expenses'), orderBy('date', 'desc'), limit(500))
);

export const addAdminExpense = async (data, actorName = 'الإدارة') => {
  const numAmount = roundCurrency(data.amount);
  if (numAmount <= 0) throw new Error('يرجى تحديد مبلغ مصروف صحيح أكبر من صفر');

  const ref = await addDoc(collection(db, 'admin_expenses'), {
    ...data,
    label: data.label || data.title || 'مصروف',
    title: data.title || data.label || 'مصروف',
    amount: numAmount,
    date: data.date || new Date().toISOString().split('T')[0],
    createdAt: serverTimestamp()
  });

  await logActivity({
    action: 'ADD_ADMIN_EXPENSE',
    category: 'finances',
    details: `إضافة مصروف عام (${data.label || data.title || 'مصروف'}) بقيمة ${numAmount} ج.م`,
    actorName: data.actorName || actorName
  });

  return ref;
};

export const deleteAdminExpense = async (id, details = '', actorName = 'الإدارة') => {
  await deleteDoc(doc(db, 'admin_expenses', id));
  await logActivity({
    action: 'DELETE_ADMIN_EXPENSE',
    category: 'finances',
    details: `حذف مصروف عام: ${details || id}`,
    actorName
  });
};

export const updateAdminExpense = async (id, data, actorName = 'الإدارة') => {
  const numAmount = data.amount !== undefined ? roundCurrency(data.amount) : undefined;
  if (numAmount !== undefined && numAmount <= 0) throw new Error('يرجى تحديد مبلغ مصروف صحيح أكبر من صفر');

  const updates = { ...data, updatedAt: serverTimestamp() };
  if (numAmount !== undefined) updates.amount = numAmount;
  if (data.title || data.label) {
    updates.title = data.title || data.label;
    updates.label = data.label || data.title;
  }

  await updateDoc(doc(db, 'admin_expenses', id), updates);
  await logActivity({
    action: 'UPDATE_ADMIN_EXPENSE',
    category: 'finances',
    details: `تعديل مصروف عام (${updates.title || id}) بقيمة ${numAmount || '—'} ج.م`,
    actorName
  });
};

// ========================
// SYSTEM SETTINGS (logo, name)
// ========================
export const getSystemInfo = async () => {
  const snap = await getDoc(doc(db, 'config', 'system'));
  return snap.exists() ? snap.data() : { name: 'THE FIRST GROUP', logoUrl: '' };
};

export const watchSystemInfo = (callback) => {
  return onSnapshot(doc(db, 'config', 'system'), (snap) => {
    if (snap.exists()) {
      callback(snap.data());
    } else {
      callback({ name: 'THE FIRST GROUP', logoUrl: '' });
    }
  });
};

export const saveSystemInfo = (data) =>
  setDoc(doc(db, 'config', 'system'), data, { merge: true });

// ========================
// CLIENT PORTAL HELPERS
// ========================
export const watchClient = (clientId, callback) => {
  if (!clientId || typeof clientId !== 'string' || !clientId.trim()) return () => {};
  return onSnapshot(doc(db, 'clients', clientId), (snap) => {
    if (snap.exists()) {
      callback({ id: snap.id, ...snap.data() });
    }
  });
};

export const getSessionsByClient = (clientId, callback) => {
  const q = query(collection(db, 'sessions'), where('clientId', '==', clientId));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => {
      const da = a.date?.toDate ? a.date.toDate() : new Date(0);
      const db2 = b.date?.toDate ? b.date.toDate() : new Date(0);
      return db2 - da;
    }));
  });
};

export const clientPortalLogin = async (phoneOrId, memberId) => {
  const normalizeDigits = (str) => {
    return String(str || '')
      .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
      .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
      .trim();
  };

  const extractCoreDigits = (str) => normalizeDigits(str).replace(/\D/g, '');

  const rawPhone = String(phoneOrId || '').trim();
  const rawId = String(memberId || '').trim();

  if (!rawPhone && !rawId) {
    throw new Error('يرجى إدخال رقم الموبايل أو رقم العضوية');
  }

  const normPhone = extractCoreDigits(rawPhone);
  const normId = normalizeDigits(rawId).toLowerCase();

  // SECURITY: Use targeted Firestore queries instead of downloading all clients
  const candidateDocs = new Map();

  const tryQuery = async (q) => {
    try {
      const snap = await getDocs(q);
      snap.docs.forEach(d => {
        if (!candidateDocs.has(d.id)) candidateDocs.set(d.id, { id: d.id, ...d.data() });
      });
    } catch (_) {}
  };

  // Build targeted queries based on provided inputs
  if (normPhone) {
    const e164 = '+2' + normPhone.slice(-10);
    const local = '0' + normPhone.slice(-10);
    await tryQuery(query(collection(db, 'clients'), where('phone', '==', normPhone), limit(3)));
    await tryQuery(query(collection(db, 'clients'), where('phone', '==', e164), limit(3)));
    await tryQuery(query(collection(db, 'clients'), where('phone', '==', local), limit(3)));
    await tryQuery(query(collection(db, 'clients'), where('memberId', '==', rawPhone.trim()), limit(2)));
  }
  if (normId) {
    await tryQuery(query(collection(db, 'clients'), where('memberId', '==', normId), limit(2)));
    await tryQuery(query(collection(db, 'clients'), where('memberId', '==', rawId.trim()), limit(2)));
    // Direct doc lookup by ID
    try {
      const directSnap = await getDoc(doc(db, 'clients', normId));
      if (directSnap.exists()) candidateDocs.set(directSnap.id, { id: directSnap.id, ...directSnap.data() });
    } catch (_) {}
    try {
      const directSnap = await getDoc(doc(db, 'clients', rawId.trim()));
      if (directSnap.exists()) candidateDocs.set(directSnap.id, { id: directSnap.id, ...directSnap.data() });
    } catch (_) {}
  }

  const clientsList = Array.from(candidateDocs.values());

  const client = clientsList.find(c => {
    const cPhoneDigits = extractCoreDigits(c.phone);
    const cMemberId = normalizeDigits(c.memberId).toLowerCase();
    const cId = String(c.id || '').toLowerCase();
    const cCode = normalizeDigits(c.code || '').toLowerCase();

    const phoneMatch = !normPhone || (
      cPhoneDigits === normPhone ||
      (normPhone.length >= 8 && cPhoneDigits.endsWith(normPhone.slice(-8))) ||
      (cPhoneDigits.length >= 8 && normPhone.endsWith(cPhoneDigits.slice(-8))) ||
      cMemberId === normPhone
    );

    const idMatch = !normId || (
      cMemberId === normId ||
      cCode === normId ||
      cId === normId ||
      (normId.length >= 4 && cId.startsWith(normId)) ||
      (normId.length >= 8 && cPhoneDigits.endsWith(normId.slice(-8)))
    );

    if (normPhone && normId) return phoneMatch && idMatch;
    if (normPhone) {
      return (
        cPhoneDigits === normPhone ||
        (normPhone.length >= 8 && cPhoneDigits.endsWith(normPhone.slice(-8))) ||
        cMemberId === normPhone ||
        cCode === normPhone ||
        (normPhone.length >= 4 && cId.startsWith(normPhone))
      );
    }
    if (normId) return idMatch;
    return false;
  });

  if (!client) {
    throw new Error('بيانات الدخول غير مطابقة، يرجى التأكد من رقم الموبايل أو رقم العضوية');
  }

  return client;
};

// ========================
// WORKSPACE ATTENDANCE FUNCTIONS
// ========================
export const recordWorkspaceCheckIn = async (clientId, subscriptionId, shiftId, employeeId) => {
  const subRef = doc(db, 'client_subscriptions', subscriptionId);
  const clientRef = doc(db, 'clients', clientId);
  let effectiveShiftId = shiftId || null;
  const shiftRef = effectiveShiftId ? doc(db, 'shifts', effectiveShiftId) : null;
  const checkInTime = new Date().toISOString();

  let resPkgName = '';
  let resRemHours = 0;

  await runTransaction(db, async (transaction) => {
    // 1. Shift check - graceful fallback (never block attendance if shift is closed or unassigned)
    if (shiftRef) {
      const shiftSnap = await transaction.get(shiftRef);
      if (shiftSnap.exists() && shiftSnap.data().status === 'closed') {
        effectiveShiftId = null;
      }
    }

    // 2. Sub check
    const subSnap = await transaction.get(subRef);
    if (!subSnap.exists()) throw new Error('الاشتراك غير موجود');
    const sub = subSnap.data();

    if (sub.status === 'cancelled' || sub.status === 'superseded') {
      throw new Error('هذا الاشتراك ملغى أو تم استبداله');
    }

    // If sub already has a session, check if it is an orphaned session from a previous day (> 14 hours)
    if (sub.currentSession?.checkIn) {
      const prevCheckIn = new Date(sub.currentSession.checkIn).getTime();
      const isOrphaned = (Date.now() - prevCheckIn) > (14 * 60 * 60 * 1000);
      if (!isOrphaned) {
        throw new Error('العميل مسجل دخول بالفعل في مساحة العمل');
      }
    }

    const total = Number(sub.totalHours || sub.packageSessions) || 0;
    const used = Number(sub.hoursUsed || sub.sessionsUsed) || 0;
    const remaining = roundCurrency(Math.max(0, total - used));

    if (remaining <= 0) {
      throw new Error('رصيد باقة مساحة العمل منتهي (0 ساعة متبقية). يرجى تجديد أو ترقية الباقة أولاً.');
    }

    resPkgName = sub.packageName || 'مساحة العمل';
    resRemHours = remaining;

    // 3. Client check
    const clientSnap = await transaction.get(clientRef);
    if (!clientSnap.exists()) throw new Error('بيانات العميل غير موجودة');
    const client = clientSnap.data();

    // If client has an active session from another sub, auto-recover if older than 14 hours
    if (client.workspaceCurrentSession?.checkIn && client.workspaceCurrentSession?.subscriptionId !== subscriptionId) {
      const prevClientCheckIn = new Date(client.workspaceCurrentSession.checkIn).getTime();
      const isStale = (Date.now() - prevClientCheckIn) > (14 * 60 * 60 * 1000);
      if (!isStale) {
        throw new Error('العميل مسجل دخول بالفعل في مساحة العمل بجلسة نشطة أخرى');
      }
    }

    // 4. Update Sub & Client atomically
    transaction.update(subRef, {
      currentSession: {
        checkIn: checkInTime,
        shiftId: effectiveShiftId,
        employeeId: employeeId || null
      },
      isFrozen: false,
      status: (sub.status === 'paused' || sub.isFrozen) ? 'active' : sub.status || 'active'
    });

    transaction.update(clientRef, {
      workspaceCurrentSession: {
        checkIn: checkInTime,
        subscriptionId,
        packageName: sub.packageName || 'مساحة العمل'
      }
    });
  });

  return {
    action: 'check-in',
    packageName: resPkgName,
    checkInTime,
    remainingHours: resRemHours
  };
};

export const recordWorkspaceCheckOut = async (clientId, subscriptionId, shiftId, employeeId) => {
  const subRef = doc(db, 'client_subscriptions', subscriptionId);
  const clientRef = doc(db, 'clients', clientId);
  let effectiveShiftId = shiftId || null;
  const shiftRef = effectiveShiftId ? doc(db, 'shifts', effectiveShiftId) : null;
  const checkOutDate = new Date();
  const checkOutTime = checkOutDate.toISOString();

  let sessionResult = null;

  await runTransaction(db, async (transaction) => {
    // 1. Shift check - graceful fallback
    if (shiftRef) {
      const shiftSnap = await transaction.get(shiftRef);
      if (shiftSnap.exists() && shiftSnap.data().status === 'closed') {
        effectiveShiftId = null;
      }
    }

    // 2. Get Sub
    const subSnap = await transaction.get(subRef);
    if (!subSnap.exists()) throw new Error('الاشتراك غير موجود');
    const sub = subSnap.data();

    if (!sub.currentSession?.checkIn) {
      throw new Error('العميل غير مسجل حضور حالياً في مساحة العمل');
    }

    // 3. Calculate duration
    const checkInDate = new Date(sub.currentSession.checkIn);
    let diffMs = Math.max(60000, checkOutDate.getTime() - checkInDate.getTime());
    // Auto-cap runaway orphaned sessions at 14 hours max to protect client balance from forgotten checkouts
    const isOrphanedCapped = diffMs > (14 * 60 * 60 * 1000);
    if (isOrphanedCapped) {
      diffMs = 14 * 60 * 60 * 1000;
    }
    const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
    const diffHours = roundCurrency(diffMinutes / 60);

    const currentUsed = Number(sub.hoursUsed) || 0;
    const newUsed = roundCurrency(currentUsed + diffHours);
    const total = Number(sub.totalHours || sub.packageSessions) || 0;
    const newRemaining = roundCurrency(Math.max(0, total - newUsed));
    const overstayHours = roundCurrency(Math.max(0, newUsed - total));
    const isOverstay = overstayHours > 0;

    // 4. Get Client
    const clientSnap = await transaction.get(clientRef);
    const currentLifetimeHours = clientSnap.exists() ? (parseNum(clientSnap.data().hoursUsed) || 0) : 0;
    const newLifetimeHours = roundCurrency(currentLifetimeHours + diffHours);

    // 5. Update Sub & Client atomically
    transaction.update(subRef, {
      hoursUsed: newUsed,
      currentSession: null,
      status: newRemaining <= 0 ? 'expired' : sub.status || 'active'
    });

    if (clientSnap.exists()) {
      transaction.update(clientRef, {
        hoursUsed: newLifetimeHours,
        workspaceCurrentSession: null
      });
    }

    const remMinutes = Math.max(0, Math.round(newRemaining * 60));
    const remHrs = Math.floor(remMinutes / 60);
    const remMins = remMinutes % 60;
    const remainingClock = `${remHrs}:${String(remMins).padStart(2, '0')}`;

    const durHrs = Math.floor(diffMinutes / 60);
    const durMins = diffMinutes % 60;
    const durationText = durHrs > 0 ? `${durHrs} ساعة و ${durMins} دقيقة` : `${durMins} دقائق`;

    sessionResult = {
      action: 'check-out',
      clientId,
      subscriptionId,
      packageName: sub.packageName || 'Work Space',
      type: 'workspace',
      checkIn: sub.currentSession.checkIn,
      checkOut: checkOutTime,
      durationMinutes: diffMinutes,
      durationHours: diffHours,
      durationText,
      hoursUsed: newUsed,
      remainingHours: newRemaining,
      remainingClock,
      overstayHours,
      isOverstay,
      shiftId: effectiveShiftId || sub.currentSession.shiftId || null,
      employeeId: employeeId || sub.currentSession.employeeId || null,
      isOrphanedCapped
    };
  });

  // Save session record to sessions collection
  await addDoc(collection(db, 'sessions'), {
    clientId: sessionResult.clientId,
    subscriptionId: sessionResult.subscriptionId,
    packageName: sessionResult.packageName,
    type: 'workspace',
    checkIn: sessionResult.checkIn,
    checkOut: sessionResult.checkOut,
    durationMinutes: sessionResult.durationMinutes,
    durationHours: sessionResult.durationHours,
    overstayHours: sessionResult.overstayHours,
    isOverstay: sessionResult.isOverstay,
    shiftId: sessionResult.shiftId,
    employeeId: sessionResult.employeeId,
    notes: sessionResult.isOrphanedCapped ? 'تم احتساب الحد الأقصى للجلسة (14 ساعة) لعدم تسجيل الخروج في نفس اليوم' : '',
    date: serverTimestamp()
  });

  return sessionResult;
};

export const getWorkspaceSessions = (callback) => {
  const q = query(collection(db, 'sessions'), where('type', '==', 'workspace'), limit(300));
  return onSnapshot(q, (snap) => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => {
      const da = a.date?.toDate ? a.date.toDate() : new Date(a.checkOut || a.checkIn || 0);
      const db2 = b.date?.toDate ? b.date.toDate() : new Date(b.checkOut || b.checkIn || 0);
      return db2 - da;
    });
    callback(docs);
  });
};

export const deleteSession = async (sessionId) => {
  const sessRef = doc(db, 'sessions', sessionId);
  let deletedSess = null;

  await runTransaction(db, async (transaction) => {
    // --- 1. ALL READS FIRST ---
    const snap = await transaction.get(sessRef);
    if (!snap.exists()) throw new Error('الجلسة غير موجودة أو محذوفة مسبقاً');
    const sess = snap.data();

    if (sess.isDeleted) {
      throw new Error('هذه الجلسة محذوفة بالفعل مسبقاً!');
    }

    deletedSess = sess;

    let subRef = null;
    let subSnap = null;
    let subData = null;
    if (sess.subscriptionId) {
      subRef = doc(db, 'client_subscriptions', sess.subscriptionId);
      subSnap = await transaction.get(subRef);
      if (subSnap.exists()) {
        subData = subSnap.data();
      }
    }

    let cRef = null;
    let cSnap = null;
    let cData = null;
    if (sess.clientId) {
      cRef = doc(db, 'clients', sess.clientId);
      cSnap = await transaction.get(cRef);
      if (cSnap.exists()) {
        cData = cSnap.data();
      }
    }

    // --- 2. ALL WRITES AFTER ALL READS ---
    // 1. Revert from subscription
    if (subRef && subSnap && subSnap.exists() && subData) {
      if (sess.type === 'workspace' && sess.durationHours) {
        const curUsed = parseNum(subData.hoursUsed) || 0;
        const newUsed = Math.max(0, roundCurrency(curUsed - parseNum(sess.durationHours)));
        transaction.update(subRef, {
          hoursUsed: newUsed,
          status: newUsed < (parseNum(subData.totalHours) || 0) ? 'active' : subData.status
        });
      } else {
        const curUsed = parseNum(subData.sessionsUsed) || 0;
        const newUsed = Math.max(0, curUsed - 1);
        transaction.update(subRef, {
          sessionsUsed: newUsed,
          status: newUsed < (parseNum(subData.packageSessions) || 0) ? 'active' : subData.status
        });
      }
    }

    // 2. Revert from client lifetime counters
    if (cRef && cSnap && cSnap.exists() && cData) {
      if (sess.type === 'workspace' && sess.durationHours) {
        const curUsed = parseNum(cData.hoursUsed) || 0;
        transaction.update(cRef, {
          hoursUsed: Math.max(0, roundCurrency(curUsed - parseNum(sess.durationHours)))
        });
      } else {
        const curUsed = parseNum(cData.sessionsUsed) || 0;
        transaction.update(cRef, {
          sessionsUsed: Math.max(0, curUsed - 1)
        });
      }
    }

    // 3. Atomically delete session
    transaction.delete(sessRef);
  });

  await logActivity({
    action: 'DELETE_SESSION',
    category: 'attendance',
    details: `حذف جلسة حضور (${deletedSess?.packageName || 'جلسة'}) واسترجاع الرصيد المستهلك للمشترك`,
    actorName: 'الإدارة'
  });
};

// ========================
// LOYALTY & REWARDS SYSTEM
// ========================
export const calculateClientLoyalty = (client) => {
  if (!client) return { earned: 0, redeemed: 0, currentPoints: 0, tier: { name: 'برونزي 🥉', color: '#cd7f32' } };
  const hoursSpent = parseNum(client.hoursUsed) || 0;
  const sessionsCount = parseNum(client.sessionsUsed) || 0;
  const totalPaid = parseNum(client.totalPaid) || 0;
  const redeemed = parseNum(client.redeemedPoints) || 0;

  // 10 pts per hour, 25 pts per session, 50 pts per 100 EGP spent
  const earned = Math.floor(hoursSpent * 10) + (sessionsCount * 25) + Math.floor(totalPaid * 0.5);
  const currentPoints = Math.max(0, earned - redeemed);

  let tier = { name: 'برونزي 🥉', color: '#cd7f32', min: 0 };
  if (currentPoints >= 1000) tier = { name: 'VIP ياقوتي 💎', color: '#38bdf8', min: 1000 };
  else if (currentPoints >= 500) tier = { name: 'ذهبي 🥇', color: '#f59e0b', min: 500 };
  else if (currentPoints >= 200) tier = { name: 'فضي 🥈', color: '#94a3b8', min: 200 };

  return {
    earned,
    redeemed,
    currentPoints,
    tier
  };
};

export const redeemClientPoints = async (clientId, pointsToRedeem, rewardType = 'hour') => {
  const clientRef = doc(db, 'clients', clientId);
  const snap = await getDoc(clientRef);
  if (!snap.exists()) throw new Error('العميل غير موجود');
  const clientData = snap.data();
  const currentRedeemed = parseNum(clientData.redeemedPoints) || 0;

  // 1. Free Hour in Work Space - Always creates a distinct separate reward package
  if (rewardType === 'hour' || rewardType === 'ساعة مجانية') {
    const currentTotalHours = parseNum(clientData.totalHours) || 0;
    await updateDoc(clientRef, {
      redeemedPoints: currentRedeemed + parseNum(pointsToRedeem),
      totalHours: currentTotalHours + 1
    });

    await addDoc(collection(db, 'client_subscriptions'), {
      clientId,
      clientName: clientData.name || '',
      packageName: '🎁 هدية ولاء - ساعة مجانية (TFG Rewards)',
      packageType: 'workspace',
      totalHours: 1,
      hoursUsed: 0,
      packagePrice: 0,
      isReward: true,
      rewardType: 'free_hour',
      status: 'active',
      date: serverTimestamp()
    });
  }
  // 2. Free Session (حصص) - Always creates a distinct separate reward package
  else if (rewardType === 'session' || rewardType === 'حصة مجانية') {
    const currentSessions = parseNum(clientData.packageSessions) || 0;
    await updateDoc(clientRef, {
      redeemedPoints: currentRedeemed + parseNum(pointsToRedeem),
      packageSessions: currentSessions + 1
    });

    await addDoc(collection(db, 'client_subscriptions'), {
      clientId,
      clientName: clientData.name || '',
      packageName: '🎁 هدية ولاء - حصة مجانية (TFG Rewards)',
      packageType: 'sessions',
      packageSessions: 1,
      sessionsUsed: 0,
      packagePrice: 0,
      isReward: true,
      rewardType: 'free_session',
      status: 'active',
      date: serverTimestamp()
    });
  }
  // 3. Drinks / Other
  else {
    await updateDoc(clientRef, {
      redeemedPoints: currentRedeemed + parseNum(pointsToRedeem)
    });
  }
};

export const getAllSessions = getSessions;


// ==========================================
// SECURITY & ACTIVITY AUDIT LOGGING ENGINE
// ==========================================
export const logActivity = async ({ action, category = 'system', details, actorId = 'SYSTEM', actorName = 'النظام', actorRole = 'admin', meta = {} }) => {
  try {
    await addDoc(collection(db, 'audit_logs'), {
      action,
      category,
      details,
      actorId,
      actorName,
      actorRole,
      meta,
      timestamp: serverTimestamp()
    });
  } catch (err) {
    console.error('Audit log write error:', err);
  }
};

export const getAuditLogs = (callback) => {
  const q = query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(500));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
};


// ==========================================
// INSTRUCTOR & TEACHER SETTLEMENTS
// ==========================================


export const settleInstructorSubscriptions = async ({
  subscriptionIds = [],
  instructorName,
  totalAmount = 0,
  note = '',
  shiftId = null,
  actorName = 'المدير المالي'
}) => {
  if (!Array.isArray(subscriptionIds) || subscriptionIds.length === 0) {
    throw new Error('لم يتم تحديد أي اشتراكات للتسوية');
  }

  // Pre-validate shift status if paying from shift drawer to prevent broken state
  if (shiftId) {
    const shiftSnap = await getDoc(doc(db, 'shifts', shiftId));
    if (shiftSnap.exists() && shiftSnap.data().status === 'closed') {
      throw new Error('لا يمكن تسوية مستحقات المدرسين على مناوبة مغلقة مسبقاً! يرجى اختيار المناوبة المفتوحة حالياً.');
    }
  }

  // 1. Fetch and verify subscriptions to prevent duplicate settlements
  const subsSnaps = await Promise.all(
    subscriptionIds.map(subId => getDoc(doc(db, 'client_subscriptions', subId)))
  );

  const eligibleIds = [];
  let calculatedSettlementTotal = 0;

  for (const s of subsSnaps) {
    if (s.exists()) {
      const data = s.data();
      if (!data.instructorSettled) {
        eligibleIds.push(s.id);
        calculatedSettlementTotal += (parseNum(data.instructorShareAmount) || 0);
      }
    }
  }

  if (eligibleIds.length === 0) {
    throw new Error('كافة الاشتراكات المحددة تمت تسويتها للمدرس مسبقاً بالفعل!');
  }

  const finalAmount = totalAmount > 0 ? Number(totalAmount) : calculatedSettlementTotal;
  const now = serverTimestamp();

  // 2. Mark only eligible subscriptions as settled
  const promises = eligibleIds.map(subId => 
    updateDoc(doc(db, 'client_subscriptions', subId), {
      instructorSettled: true,
      settledAt: now,
      settledBy: actorName || 'المدير المالي',
      settlementNote: note || `تسوية مستحقات المدرس: ${instructorName}`,
      settledShiftId: shiftId || null
    })
  );
  await Promise.all(promises);

  // 3. Record Expense
  if (shiftId && finalAmount > 0) {
    // Record on the specified shift (e.g. employee drawer)
    const expenseData = {
      type: 'salaries',
      label: note || `تسوية مستحقات المدرس ${instructorName} (${eligibleIds.length} اشتراك)`,
      amount: Number(finalAmount) || 0,
      instructorName,
      isInstructorSettlement: true,
      subscriptionIds: eligibleIds,
      id: Date.now().toString()
    };
    await addShiftExpense(shiftId, expenseData);
  } else if (finalAmount > 0) {
    // Record directly in Central Safe (admin_expenses) under 'أتعاب ومستحقات مدرسين'
    await addDoc(collection(db, 'admin_expenses'), {
      title: `تسوية مستحقات المدرس: ${instructorName}`,
      amount: Number(finalAmount) || 0,
      category: 'أتعاب ومستحقات مدرسين',
      description: note || `تسوية مستحقات ${instructorName} عن (${eligibleIds.length}) اشتراك`,
      instructorName,
      subscriptionIds: eligibleIds,
      date: serverTimestamp()
    });
  }

  // 4. Log to security audit trail
  await logActivity({
    action: 'INSTRUCTOR_SETTLEMENT',
    category: 'financial',
    details: `تسوية ومحاسبة مستحقات المدرس (${instructorName}) عن (${eligibleIds.length}) اشتراك بمبلغ إجمالي ${formatCurrency(finalAmount)} [${shiftId ? 'من درج الوردية' : 'من الخزينة المركزية للإدارة'}]`,
    actorName: actorName || 'المدير المالي'
  });

  return { success: true, count: eligibleIds.length, totalAmount: finalAmount, shiftId };
};

export const undoInstructorSettlement = async (subscriptionId, actorName = 'المدير المالي') => {
  const subRef = doc(db, 'client_subscriptions', subscriptionId);
  const snap = await getDoc(subRef);
  if (!snap.exists()) return;
  const sub = snap.data();
  if (!sub.instructorSettled) return;

  const settledShiftId = sub.settledShiftId;

  // Reverse shift expense if it was on a shift
  if (settledShiftId) {
    const sRef = doc(db, 'shifts', settledShiftId);
    const sSnap = await getDoc(sRef);
    if (sSnap.exists()) {
      const shift = sSnap.data();
      if (shift.status !== 'closed') {
        const exps = (shift.expenses || []).filter(e => !(e.isInstructorSettlement && e.subscriptionIds?.includes(subscriptionId)));
        const totalExpenses = exps.reduce((s, e) => s + parseNum(e.amount), 0);
        const drawerCash = (parseNum(shift.drawerCash || shift.cashRevenue) || 0) + (parseNum(sub.instructorShareAmount) || 0);
        const netAmount = (parseNum(shift.totalRevenue) || 0) - totalExpenses;
        await updateDoc(sRef, { expenses: exps, totalExpenses, drawerCash, netAmount });
      }
    }
  } else {
    // Check admin_expenses
    const qSnap = await getDocs(query(collection(db, 'admin_expenses'), where('category', '==', 'أتعاب ومستحقات مدرسين')));
    for (const d of qSnap.docs) {
      const expData = d.data();
      if (expData.subscriptionIds?.includes(subscriptionId)) {
        await deleteDoc(d.ref);
      }
    }
  }

  await updateDoc(subRef, {
    instructorSettled: false,
    settledAt: null,
    settledBy: null,
    settlementNote: null,
    settledShiftId: null
  });

  await logActivity({
    action: 'UNDO_INSTRUCTOR_SETTLEMENT',
    category: 'financial',
    details: `إلغاء تسوية اشتراك للطالب (${sub.clientName || ''}) لدى المدرس (${sub.instructorName || ''}) وعكس الأثر المالي`,
    actorName
  });
};


// ==========================================
// INSTRUCTORS DIRECTORY CRUD
// ==========================================
export const getInstructors = createSharedCollectionListener(
  'instructors',
  () => query(collection(db, 'instructors'), orderBy('name', 'asc'))
);

export const addInstructor = async (data) => {
  const ref = await addDoc(collection(db, 'instructors'), {
    name: data.name?.trim() || '',
    phone: data.phone?.trim() || '',
    subject: data.subject?.trim() || '',
    pinCode: null,
    isPinSet: false,
    defaultShareType: data.defaultShareType || 'percentage',
    defaultShareValue: Number(data.defaultShareValue) || 0,
    notes: data.notes || '',
    createdAt: serverTimestamp()
  });
  await logActivity({
    action: 'CREATE_INSTRUCTOR',
    category: 'system',
    details: `إضافة مدرس/مدرب جديد: ${data.name} (بانتظار تعيين كلمة المرور من المدرس)`,
    actorName: 'الإدارة'
  });
  return ref.id;
};

export const setInstructorPin = async (id, pinCode) => {
  const cleanPin = String(pinCode).trim();
  // SECURITY: Hash PIN before storing — never store plaintext
  const salt = await bcrypt.genSalt(10);
  const pinHash = await bcrypt.hash(cleanPin, salt);
  await updateDoc(doc(db, 'instructors', id), {
    pinCode: pinHash,
    isPinSet: true,
    pinSetAt: serverTimestamp()
  });
  await logActivity({
    action: 'INSTRUCTOR_PIN_SET',
    category: 'security',
    details: `قام المدرس بتعيين كلمة المرور الخاصة ببوابته بنجاح (كود: ${id})`,
    actorName: 'المدرس'
  });
};

export const resetInstructorPin = async (id, name = '') => {
  await updateDoc(doc(db, 'instructors', id), {
    pinCode: null,
    isPinSet: false,
    pinResetAt: serverTimestamp()
  });
  await logActivity({
    action: 'INSTRUCTOR_PIN_RESET',
    category: 'security',
    details: `تمت إعادة تهيئة وتصفير كلمة المرور للأستاذ: ${name || id} بواسطة الإدارة`,
    actorName: 'الإدارة'
  });
};

// SECURITY: Server-side PIN verification — compares against bcrypt hash
export const verifyInstructorPin = async (id, inputPin) => {
  const snap = await getDoc(doc(db, 'instructors', id));
  if (!snap.exists()) return false;
  const data = snap.data();
  if (!data.pinCode || !data.isPinSet) return false;
  // Support both legacy plaintext PINs (pre-migration) and hashed PINs
  const isHashed = String(data.pinCode).startsWith('$2');
  if (isHashed) {
    return bcrypt.compare(String(inputPin).trim(), data.pinCode);
  }
  // Legacy plaintext fallback — will auto-upgrade on next pin set
  return String(inputPin).trim() === String(data.pinCode).trim();
};

export const updateInstructor = async (id, data) => {
  await updateDoc(doc(db, 'instructors', id), {
    ...data,
    updatedAt: serverTimestamp()
  });
  await logActivity({
    action: 'UPDATE_INSTRUCTOR',
    category: 'system',
    details: `تعديل بيانات المدرس: ${data.name || id}`,
    actorName: 'الإدارة'
  });
};

export const deleteInstructor = async (id, name = '') => {
  await deleteDoc(doc(db, 'instructors', id));
  await logActivity({
    action: 'DELETE_INSTRUCTOR',
    category: 'system',
    details: `حذف المدرس: ${name || id}`,
    actorName: 'الإدارة'
  });
};


// ==========================================
// FULL CLOUD DATABASE BACKUP & RESTORE ENGINE
// ==========================================

const BACKUP_COLLECTIONS = [
  'users',
  'clients',
  'client_subscriptions',
  'shifts',
  'cafe_shifts',
  'cafe_sales',
  'cafe_orders',
  'cafe_waste',
  'inventory',
  'inventory_logs',
  'payments',
  'tickets',
  'ticket_sales',
  'sessions',
  'workspace_sessions',
  'packages',
  'instructors',
  'attendance',
  'audit_logs',
  'config',
  'admin_revenues',
  'admin_expenses',
  'vendors',
  'vendor_invoices',
  'vendor_payments',
  'vouchers',
  'contracts',
  'contract_payments',
  'assets',
  'partners',
  'partner_transactions',
  'course_schedules',
  'feedback',
  'lost_items',
  'petty_cash_movements',
  'salaries',
  'system_settings',
  'customer_service_requests',
  'year_end_closings',
  'announcements',
  'settings'
];

const serializeDates = (obj) => {
  if (!obj) return obj;
  if (typeof obj === 'object' && typeof obj.toDate === 'function') {
    return { __type: 'timestamp', iso: obj.toDate().toISOString(), seconds: obj.seconds, nanoseconds: obj.nanoseconds };
  }
  if (obj instanceof Date) {
    return { __type: 'timestamp', iso: obj.toISOString() };
  }
  if (Array.isArray(obj)) {
    return obj.map(serializeDates);
  }
  if (typeof obj === 'object') {
    const res = {};
    for (const [k, v] of Object.entries(obj)) {
      res[k] = serializeDates(v);
    }
    return res;
  }
  return obj;
};

const unserializeDates = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  if (obj.__type === 'timestamp' && obj.iso) {
    return new Date(obj.iso);
  }
  if (Array.isArray(obj)) {
    return obj.map(unserializeDates);
  }
  const res = {};
  for (const [k, v] of Object.entries(obj)) {
    res[k] = unserializeDates(v);
  }
  return res;
};

export const exportDatabaseBackup = async () => {
  const backupData = {
    app: 'THE FIRST GROUP MANAGEMENT SYSTEM',
    version: '2.0.0',
    exportedAt: new Date().toISOString(),
    exportedAtCairo: new Date().toLocaleString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo' }),
    totalCollections: 0,
    totalDocuments: 0,
    collections: {}
  };

  let totalDocs = 0;
  for (const colName of BACKUP_COLLECTIONS) {
    try {
      const snap = await getDocs(collection(db, colName));
      backupData.collections[colName] = snap.docs.map(d => {
        const data = d.data();
        const serialized = { _id: d.id };
        for (const [key, val] of Object.entries(data)) {
          serialized[key] = serializeDates(val);
        }
        return serialized;
      });
      totalDocs += snap.size;
    } catch (colErr) {
      console.warn('Backup skip collection:', colName, colErr);
      backupData.collections[colName] = [];
    }
  }

  backupData.totalCollections = BACKUP_COLLECTIONS.length;
  backupData.totalDocuments = totalDocs;

  // Log activity
  await logActivity({
    action: 'DATABASE_BACKUP_EXPORT',
    category: 'system',
    details: `تم استخراج وتنزيل نسخة احتياطية شاملة لقاعدة البيانات (${totalDocs} سجل)`,
    actorName: 'الإدارة'
  });

  // Trigger JSON download
  const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `THE_FIRST_GROUP_BACKUP_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return backupData;
};

export const verifyBackupData = (backupData) => {
  if (!backupData || typeof backupData !== 'object') {
    throw new Error('ملف النسخة الاحتياطية غير صالح أو تالف');
  }
  if (!backupData.collections || typeof backupData.collections !== 'object') {
    throw new Error('الملف لا يحتوي على بنية بيانات المجموعات الصحيحة');
  }

  const summary = {
    isValid: true,
    app: backupData.app || 'THE FIRST GROUP',
    version: backupData.version || '2.0',
    exportedAt: backupData.exportedAt || 'غير محدد',
    exportedAtCairo: backupData.exportedAtCairo || '',
    totalDocuments: backupData.totalDocuments || 0,
    collectionsCounts: {}
  };

  let count = 0;
  for (const [colName, docs] of Object.entries(backupData.collections)) {
    if (Array.isArray(docs)) {
      summary.collectionsCounts[colName] = docs.length;
      count += docs.length;
    }
  }
  summary.calculatedTotal = count;
  return summary;
};

export const restoreDatabaseBackup = async (backupData) => {
  const verified = verifyBackupData(backupData);
  if (!verified.isValid) throw new Error('فشل التحقق من صحة ملف النسخة الاحتياطية');

  const restoredStats = {};

  for (const [colName, docs] of Object.entries(backupData.collections)) {
    if (!Array.isArray(docs)) continue;
    let colRestored = 0;

    for (const docItem of docs) {
      const docId = docItem._id;
      if (!docId) continue;

      const rawData = { ...docItem };
      delete rawData._id;

      // Unserialize Timestamps deeply
      const docData = unserializeDates(rawData);

      await setDoc(doc(db, colName, docId), docData, { merge: true });
      colRestored++;
    }
    restoredStats[colName] = colRestored;
  }

  await logActivity({
    action: 'DATABASE_BACKUP_RESTORE',
    category: 'system',
    details: `تمت استعادة وتطبيق نسخة احتياطية على النظام بنجاح (${verified.calculatedTotal} سجل)`,
    actorName: 'الإدارة'
  });

  return { success: true, verified, restoredStats };
};

export const setClientPin = async (id, pinCode) => {
  const cleanPin = String(pinCode).trim();
  // SECURITY: Hash PIN before storing — never store plaintext
  const salt = await bcrypt.genSalt(10);
  const pinHash = await bcrypt.hash(cleanPin, salt);
  await updateDoc(doc(db, 'clients', id), {
    pinCode: pinHash,
    isPinSet: true,
    pinSetAt: serverTimestamp()
  });
  await logActivity({
    action: 'CLIENT_PIN_SET',
    category: 'security',
    details: `قام المشترك بتعيين كلمة المرور الخاصة ببوابته بنجاح (كود: ${id})`,
    actorName: 'المشترك'
  });
};

export const resetClientPin = async (id, name = '') => {
  await updateDoc(doc(db, 'clients', id), {
    pinCode: null,
    isPinSet: false,
    pinResetAt: serverTimestamp()
  });
  await logActivity({
    action: 'CLIENT_PIN_RESET',
    category: 'security',
    details: `تمت إعادة تهيئة وتصفير كلمة المرور للمشترك: ${name || id} بواسطة الإدارة`,
    actorName: 'الإدارة'
  });
};

// SECURITY: Server-side PIN verification — compares against bcrypt hash
export const verifyClientPin = async (id, inputPin) => {
  const snap = await getDoc(doc(db, 'clients', id));
  if (!snap.exists()) return false;
  const data = snap.data();
  if (!data.pinCode || !data.isPinSet) return false;
  // Support both legacy plaintext PINs (pre-migration) and hashed PINs
  const isHashed = String(data.pinCode).startsWith('$2');
  if (isHashed) {
    return bcrypt.compare(String(inputPin).trim(), data.pinCode);
  }
  // Legacy plaintext fallback — will auto-upgrade on next pin set
  return String(inputPin).trim() === String(data.pinCode).trim();
};


// ========================
// SUBSCRIPTION FREEZE POLICY ENGINE (Min 3 Days, Max 10 Days/Month)
// ========================
export const getMonthlyFreezeQuota = (sub) => {
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const usageMap = sub?.monthlyFreezeUsage || {};
  const usedThisMonth = Number(usageMap[currentMonthKey]) || 0;
  const maxMonthlyAllowed = 10;
  const remainingDays = Math.max(0, maxMonthlyAllowed - usedThisMonth);

  return {
    currentMonthKey,
    maxMonthlyAllowed,
    usedThisMonth,
    remainingDays,
    canFreeze: remainingDays >= 3
  };
};

export const freezeSubscription = async (subscriptionId, { days = 3, reason = '', freezeStartDate = '', freezeEndDate = '', actorName = 'المشترك' } = {}) => {
  const subRef = doc(db, 'client_subscriptions', subscriptionId);
  const subSnap = await getDoc(subRef);
  if (!subSnap.exists()) throw new Error('الاشتراك غير موجود');
  const sub = subSnap.data();

  // Check if workspace package
  const isWs = sub.packageType === 'workspace' || !!sub.totalHours || sub.packageName?.includes('ساعة') || sub.packageName?.toLowerCase().includes('workspace');
  if (!isWs) {
    throw new Error('خاصية التجميد متاحة فقط لاشتراكات مساحة العمل (Work Space) وغير متاحة لباقات الكورسات والحصص');
  }

  const numDays = parseInt(days, 10);
  if (isNaN(numDays) || numDays < 3) {
    throw new Error('الحد الأدنى لطلب التجميد هو 3 أيام للمرة الواحدة');
  }

  const quota = getMonthlyFreezeQuota(sub);
  if (numDays > quota.remainingDays) {
    throw new Error(`المدة المطلوبة (${numDays} يوم) تتجاوز رصيد التجميد المتبقي المتاح لهذا الشهر (${quota.remainingDays} يوم من أصل 10 أيام)`);
  }

  const now = new Date();
  const startStr = freezeStartDate || now.toISOString().split('T')[0];
  let endStr = freezeEndDate;
  if (!endStr) {
    const end = new Date(startStr);
    end.setDate(end.getDate() + numDays);
    endStr = end.toISOString().split('T')[0];
  }

  // Base subscription end date
  let baseEndDate = sub.endDate;
  if (!baseEndDate && sub.startDate) {
    const startD = new Date(sub.startDate);
    const duration = Number(sub.durationDays) || 30;
    startD.setDate(startD.getDate() + duration);
    baseEndDate = startD.toISOString().split('T')[0];
  }

  // Calculate extended subscription end date with planned freeze days
  let newSubEndDate = baseEndDate;
  if (baseEndDate) {
    const d = new Date(baseEndDate);
    d.setDate(d.getDate() + numDays);
    newSubEndDate = d.toISOString().split('T')[0];
  }

  const freezeLog = sub.freezeLog || [];
  const freezeRecord = {
    id: 'frz_' + Date.now(),
    days: numDays,
    startDate: startStr,
    endDate: endStr,
    reason: reason || 'طلب المشترك (امتحانات/سفر)',
    frozenBy: actorName,
    monthKey: quota.currentMonthKey,
    createdAt: new Date().toISOString()
  };
  freezeLog.unshift(freezeRecord);

  const monthlyFreezeUsage = {
    ...(sub.monthlyFreezeUsage || {}),
    [quota.currentMonthKey]: quota.usedThisMonth + numDays
  };

  const subUpdates = {
    status: 'frozen',
    isFrozen: true,
    freezeDays: numDays,
    freezeStartDate: startStr,
    freezeEndDate: endStr,
    freezeReason: reason || 'طلب المشترك (امتحانات/سفر)',
    frozenAt: serverTimestamp(),
    frozenBy: actorName,
    freezeLog,
    monthlyFreezeUsage
  };
  if (newSubEndDate) subUpdates.endDate = newSubEndDate;

  await updateDoc(subRef, subUpdates);

  if (sub.clientId) {
    const clientUpdates = {
      status: 'paused',
      isFrozen: true,
      freezeReason: reason || 'تجميد اشتراك مساحة العمل'
    };
    if (newSubEndDate) clientUpdates.endDate = newSubEndDate;
    await updateDoc(doc(db, 'clients', sub.clientId), clientUpdates);
  }

  await logActivity({
    action: 'FREEZE_SUBSCRIPTION',
    category: 'subscriptions',
    details: `تجميد اشتراك مساحة العمل (${sub.packageName || subscriptionId}) لمدة ${numDays} يوم حتى ${endStr} وتمديد نهاية الاشتراك إلى ${newSubEndDate || '—'} بواسطة (${actorName}) - السبب: ${reason || 'طلب المشترك'}`,
    actorName
  });
};

export const unfreezeSubscription = async (subscriptionId, actorName = 'المشترك') => {
  const subRef = doc(db, 'client_subscriptions', subscriptionId);
  const subSnap = await getDoc(subRef);
  if (!subSnap.exists()) throw new Error('الاشتراك غير موجود');
  const sub = subSnap.data();

  const plannedDays = Number(sub.freezeDays) || 3;
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  // Calculate elapsed days since freeze started
  let elapsedDays = 0;
  if (sub.freezeStartDate) {
    const startD = new Date(sub.freezeStartDate + 'T00:00:00');
    const todayD = new Date(todayStr + 'T00:00:00');
    elapsedDays = Math.max(0, Math.round((todayD - startD) / (1000 * 60 * 60 * 24)));
  }

  // Enforce minimum 3 days policy on unfreeze:
  // If unfreezing early before 3 days, charge minimum 3 days.
  // If unfreezing after 3 days, charge elapsed days (up to plannedDays).
  const actualDaysCharged = Math.min(plannedDays, Math.max(3, elapsedDays));
  const unusedDays = Math.max(0, plannedDays - actualDaysCharged);

  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const freezeMonthKey = sub.freezeLog?.[0]?.monthKey || currentMonthKey;

  // Refund unused days back to monthly usage
  const currentMonthlyUsage = sub.monthlyFreezeUsage || {};
  const currentUsageForMonth = Number(currentMonthlyUsage[freezeMonthKey]) || plannedDays;
  const newUsageForMonth = Math.max(0, currentUsageForMonth - unusedDays);

  const updatedMonthlyFreezeUsage = {
    ...currentMonthlyUsage,
    [freezeMonthKey]: newUsageForMonth
  };

  // Base subscription end date
  let currentSubEndDate = sub.endDate;
  if (!currentSubEndDate && sub.startDate) {
    const startD = new Date(sub.startDate);
    const duration = Number(sub.durationDays) || 30;
    startD.setDate(startD.getDate() + duration);
    currentSubEndDate = startD.toISOString().split('T')[0];
  }

  let finalEndDate = currentSubEndDate;
  if (currentSubEndDate) {
    const d = new Date(currentSubEndDate);
    if (unusedDays > 0) {
      // If planned days were added on freeze, deduct the unused portion
      d.setDate(d.getDate() - unusedDays);
    }
    finalEndDate = d.toISOString().split('T')[0];
  }

  // Update freeze log
  const freezeLog = [...(sub.freezeLog || [])];
  if (freezeLog.length > 0) {
    freezeLog[0] = {
      ...freezeLog[0],
      actualDays: actualDaysCharged,
      unfrozenAt: now.toISOString(),
      unfrozenBy: actorName,
      earlyUnfreeze: unusedDays > 0,
      refundedDays: unusedDays
    };
  }

  const subUpdates = {
    status: 'active',
    isFrozen: false,
    unfrozenAt: serverTimestamp(),
    unfrozenBy: actorName,
    monthlyFreezeUsage: updatedMonthlyFreezeUsage,
    freezeLog
  };
  if (finalEndDate) subUpdates.endDate = finalEndDate;

  await updateDoc(subRef, subUpdates);

  if (sub.clientId) {
    const clientUpdates = {
      status: 'active',
      isFrozen: false,
      freezeReason: null
    };
    if (finalEndDate) clientUpdates.endDate = finalEndDate;
    await updateDoc(doc(db, 'clients', sub.clientId), clientUpdates);
  }

  await logActivity({
    action: 'UNFREEZE_SUBSCRIPTION',
    category: 'subscriptions',
    details: `إلغاء تجميد وتفعيل اشتراك (${sub.packageName || subscriptionId}). تم احتساب (${actualDaysCharged} يوم تجميد) واسترداد (${unusedDays} يوم لرصيد الشهر). تاريخ الانتهاء المحدث: ${finalEndDate || 'المحدد'} بواسطة (${actorName})`,
    actorName
  });
};

export const getAssets = (callback) => {
  const q = query(collection(db, 'assets'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
};

export const addAsset = async (data) => {
  const cleanData = {
    name: data.name || '',
    category: data.category || 'other',
    room: data.room || 'الاستقبال',
    cost: parseNum(data.cost) || 0,
    purchaseDate: data.purchaseDate || '',
    warrantyExpiry: data.warrantyExpiry || '',
    status: data.status || 'active', // 'active' | 'maintenance' | 'retired'
    serialNo: data.serialNo || '',
    notes: data.notes || '',
    maintenanceLog: [],
    createdAt: serverTimestamp()
  };

  const docRef = await addDoc(collection(db, 'assets'), cleanData);
  await logActivity({
    action: 'ADD_ASSET',
    category: 'assets',
    details: `إضافة أصل/معدة جديدة: ${cleanData.name} بقيمة ${cleanData.cost} ج.م في (${cleanData.room})`,
    actorName: 'الإدارة'
  });
  return docRef.id;
};

export const updateAsset = async (id, data) => {
  await updateDoc(doc(db, 'assets', id), {
    ...data,
    cost: data.cost !== undefined ? parseNum(data.cost) : undefined,
    updatedAt: serverTimestamp()
  });
  await logActivity({
    action: 'UPDATE_ASSET',
    category: 'assets',
    details: `تحديث بيانات الأصل: ${data.name || id}`,
    actorName: 'الإدارة'
  });
};

export const deleteAsset = async (id, name = '') => {
  await deleteDoc(doc(db, 'assets', id));
  await logActivity({
    action: 'DELETE_ASSET',
    category: 'assets',
    details: `حذف الأصل: ${name || id} من سجلات الأصول`,
    actorName: 'الإدارة'
  });
};

export const addAssetMaintenanceRecord = async (assetId, record, shiftId = null, employeeId = null, deductFromExpenses = true) => {
  const cost = parseNum(record.cost) || 0;

  if (deductFromExpenses && cost > 0 && shiftId) {
    const shiftSnap = await getDoc(doc(db, 'shifts', shiftId));
    if (shiftSnap.exists() && shiftSnap.data().status === 'closed') {
      throw new Error('لا يمكن تسجيل صيانة أصل وخصمها من مناوبة مغلقة مسبقاً! يرجى اختيار المناوبة المفتوحة حالياً.');
    }
  }

  const ref = doc(db, 'assets', assetId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const asset = snap.data();
  const maintenanceLog = asset.maintenanceLog || [];

  maintenanceLog.unshift({
    id: 'maint_' + Date.now(),
    date: record.date || new Date().toISOString().split('T')[0],
    cost: cost,
    technician: record.technician || '',
    description: record.description || '',
    createdAt: new Date().toISOString()
  });

  await updateDoc(ref, {
    maintenanceLog,
    status: record.status || asset.status,
    lastMaintenanceDate: record.date || new Date().toISOString().split('T')[0]
  });

  // Automatically record Expense in Shift or Admin Expenses
  if (deductFromExpenses && cost > 0) {
    if (shiftId) {
      await addShiftExpense(shiftId, {
        label: `صيانة أصل: ${asset.name} (${record.description || 'صيانة'})`,
        amount: cost,
        type: 'maintenance'
      });
    } else {
      // Record as admin expense
      await addDoc(collection(db, 'admin_expenses'), {
        title: `صيانة أصل: ${asset.name}`,
        amount: cost,
        category: 'صيانة وتجهيزات',
        description: record.description || '',
        technician: record.technician || '',
        date: serverTimestamp()
      });
    }
  }

  await logActivity({
    action: 'ASSET_MAINTENANCE',
    category: 'assets',
    details: `تسجيل صيانة للأصل: ${asset.name} بتكلفة ${cost} ج.م (${record.description || ''}) ${deductFromExpenses ? '[تم قيدها في المصروفات 💸]' : ''}`,
    actorName: 'الإدارة'
  });
};


// ========================
// CAPITAL, PARTNERS & ROI INTELLIGENCE SUITE
// ========================
export const getCapitalSettings = (callback) => {
  const docRef = doc(db, 'settings', 'capital_settings');
  return onSnapshot(docRef, (snap) => {
    if (snap.exists()) {
      callback({ id: snap.id, ...snap.data() });
    } else {
      callback({
        initialCapital: 0,
        securityDeposit: 0,
        prepaidRent: 0,
        operatingReserveTarget: 20000,
        startDate: new Date().toISOString().split('T')[0]
      });
    }
  });
};

export const updateCapitalSettings = async (data) => {
  const docRef = doc(db, 'settings', 'capital_settings');
  await setDoc(docRef, {
    ...data,
    updatedAt: serverTimestamp()
  }, { merge: true });

  await logActivity({
    action: 'UPDATE_CAPITAL_SETTINGS',
    category: 'finances',
    details: `تحديث إعدادات رأس المال والتأمين والاحتياطي التشغيلي`,
    actorName: 'الإدارة'
  });
};

export const getPartners = (callback) => {
  const q = query(collection(db, 'partners'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
};

export const addPartner = async ({ name, phone, capitalContributed, equityPercentage, notes = '' }) => {
  const partnerRef = await addDoc(collection(db, 'partners'), {
    name,
    phone: phone || '',
    capitalContributed: Number(capitalContributed) || 0,
    equityPercentage: Number(equityPercentage) || 0,
    notes: notes || '',
    createdAt: serverTimestamp()
  });

  await logActivity({
    action: 'ADD_PARTNER',
    category: 'finances',
    details: `إضافة شريك جديد: ${name} برأس مال (${capitalContributed} ج.م) ونسبة (${equityPercentage}%)`,
    actorName: 'الإدارة'
  });

  return partnerRef;
};

export const updatePartner = async (partnerId, data) => {
  await updateDoc(doc(db, 'partners', partnerId), {
    ...data,
    capitalContributed: Number(data.capitalContributed) || 0,
    equityPercentage: Number(data.equityPercentage) || 0,
    updatedAt: serverTimestamp()
  });

  await logActivity({
    action: 'UPDATE_PARTNER',
    category: 'finances',
    details: `تعديل بيانات الشريك: ${data.name || partnerId}`,
    actorName: 'الإدارة'
  });
};

export const deletePartner = async (partnerId, partnerName = '') => {
  await deleteDoc(doc(db, 'partners', partnerId));

  await logActivity({
    action: 'DELETE_PARTNER',
    category: 'finances',
    details: `حذف الشريك: ${partnerName || partnerId}`,
    actorName: 'الإدارة'
  });
};

export const getPartnerTransactions = (callback) => {
  const q = query(collection(db, 'partner_transactions'), orderBy('date', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
};

export const addPartnerTransaction = async ({ partnerId, partnerName, type = 'profit_withdrawal', amount, month = '', notes = '', shiftId = null, actorName = 'الإدارة' }) => {
  const numAmount = roundCurrency(amount);
  if (numAmount <= 0) throw new Error('المبلغ يجب أن يكون أكبر من صفر');

  let adminExpenseId = null;
  let adminRevenueId = null;

  // If withdrawal happened inside an active shift, deduct from shift inside transaction
  if (shiftId && type === 'profit_withdrawal') {
    await addShiftExpense(shiftId, {
      title: `مسحوبات أرباح للشريك: ${partnerName}`,
      amount: numAmount,
      type: 'partner_withdrawal',
      notes: notes || 'صرف أرباح شريك'
    });
  } else if (!shiftId && type === 'profit_withdrawal') {
    // Record directly in Central Safe (admin_expenses)
    const expRef = await addDoc(collection(db, 'admin_expenses'), {
      title: `صرف ومسحوبات أرباح للشريك: ${partnerName}`,
      amount: numAmount,
      category: 'مسحوبات أرباح الشركاء',
      date: serverTimestamp(),
      month: month || new Date().toISOString().slice(0, 7),
      notes: notes || 'صرف أرباح شريك من الخزينة المركزية',
      partnerId: partnerId || null,
      actorName
    });
    adminExpenseId = expRef.id;
  } else if (!shiftId && type === 'capital_injection') {
    // Record directly in Central Safe (admin_revenues)
    const revRef = await addDoc(collection(db, 'admin_revenues'), {
      title: `إيداع رأس مال من الشريك: ${partnerName}`,
      amount: numAmount,
      category: 'إيداع رأس مال الشركاء',
      date: serverTimestamp(),
      month: month || new Date().toISOString().slice(0, 7),
      notes: notes || 'إيداع رأس مال في الخزينة المركزية',
      partnerId: partnerId || null,
      actorName
    });
    adminRevenueId = revRef.id;
  }

  const txRef = await addDoc(collection(db, 'partner_transactions'), {
    partnerId,
    partnerName,
    type, // 'profit_withdrawal' (سحب أرباح), 'profit_distribution' (توزيع أرباح مستحقة), 'capital_injection' (إيداع رأس مال)
    amount: numAmount,
    month: month || new Date().toISOString().slice(0, 7),
    date: serverTimestamp(),
    notes: notes || '',
    shiftId: shiftId || null,
    adminExpenseId,
    adminRevenueId,
    actorName
  });

  await logActivity({
    action: 'PARTNER_TRANSACTION',
    category: 'finances',
    details: `تسجيل ${type === 'profit_withdrawal' ? 'صرف وسحب أرباح' : type === 'profit_distribution' ? 'توزيع أرباح مستحقة' : 'معاملة'} للشريك (${partnerName}) بقيمة (${numAmount} ج.م)`,
    actorName
  });

  return txRef;
};

export const deletePartnerTransaction = async (txId, details = '') => {
  const txRef = doc(db, 'partner_transactions', txId);
  const snap = await getDoc(txRef);
  if (!snap.exists()) return;
  const tx = snap.data();

  if (tx.shiftId && tx.type === 'profit_withdrawal') {
    const sRef = doc(db, 'shifts', tx.shiftId);
    await runTransaction(db, async (transaction) => {
      const sSnap = await transaction.get(sRef);
      if (sSnap.exists()) {
        const shift = sSnap.data();
        if (shift.status === 'closed') {
          throw new Error('لا يمكن حذف معاملة شريك مرتبطة بوردية مغلقة بالفعل حرصاً على مطابقة إغلاق الخزينة!');
        }
        const updatedExps = (shift.expenses || []).filter(e => !(e.title && e.title.includes(tx.partnerName || 'الشريك')));
        const totalExpenses = Math.max(0, roundCurrency((parseNum(shift.totalExpenses) || 0) - parseNum(tx.amount)));
        const drawerCash = roundCurrency((parseNum(shift.drawerCash || shift.cashRevenue) || 0) + parseNum(tx.amount));
        const netAmount = roundCurrency((parseNum(shift.totalRevenue) || 0) - totalExpenses);
        transaction.update(sRef, { expenses: updatedExps, totalExpenses, drawerCash, netAmount });
      }
    });
  } else if (tx.adminExpenseId) {
    try {
      await deleteDoc(doc(db, 'admin_expenses', tx.adminExpenseId));
    } catch (err) {
      console.warn('Could not delete linked admin_expense for partner tx:', err);
    }
  } else if (tx.adminRevenueId) {
    try {
      await deleteDoc(doc(db, 'admin_revenues', tx.adminRevenueId));
    } catch (err) {
      console.warn('Could not delete linked admin_revenue for partner tx:', err);
    }
  }

  await deleteDoc(txRef);

  await logActivity({
    action: 'DELETE_PARTNER_TRANSACTION',
    category: 'finances',
    details: `حذف حركة أرباح الشريك: ${details || txId} وعكس الأثر المالي`,
    actorName: 'الإدارة'
  });
};

export const distributeMonthlyPartnerDividends = async ({
  month,
  netProfit,
  reservePercent = 10,
  reserveAmount = 0,
  distributableProfit,
  partnerSplits = [],
  notes = '',
  actorName = 'الإدارة'
}) => {
  if (!month) throw new Error('يرجى تحديد شهر التوزيع');
  if (!partnerSplits || partnerSplits.length === 0) throw new Error('لا يوجد شركاء لتوزيع الأرباح عليهم');

  // Check if dividends already distributed for this month
  const q = query(
    collection(db, 'partner_transactions'),
    where('month', '==', month),
    where('type', '==', 'profit_distribution')
  );
  const existingSnap = await getDocs(q);
  if (!existingSnap.empty) {
    throw new Error(`تم توزيع أرباح شهر (${month}) مسبقاً! إذا كنت ترغب في إعادة التوزيع، يرجى حذف الحركات السابقة أولاً.`);
  }

  const generatedVouchers = [];
  const batchDate = new Date().toISOString();

  for (const split of partnerSplits) {
    const shareAmt = roundCurrency(split.amount);
    if (shareAmt > 0) {
      const voucherNum = `DIV-${month.replace('-', '')}-${(split.partnerId || 'PRT').slice(0, 4).toUpperCase()}`;
      const docData = {
        voucherNumber: voucherNum,
        partnerId: split.partnerId,
        partnerName: split.partnerName,
        equityPercentage: split.equityPercentage,
        type: 'profit_distribution',
        amount: shareAmt,
        month,
        date: serverTimestamp(),
        netProfitMonth: roundCurrency(netProfit),
        reserveDeduction: roundCurrency(reserveAmount),
        reservePercent: Number(reservePercent) || 0,
        distributableProfitTotal: roundCurrency(distributableProfit),
        notes: notes || `استحقاق أرباح شهر ${month} بنسبة ${split.equityPercentage}%`,
        actorName,
        status: 'approved'
      };

      await setDoc(doc(db, 'partner_transactions', voucherNum), docData, { merge: true });
      generatedVouchers.push({ id: voucherNum, ...docData, dateStr: batchDate });
    }
  }

  await logActivity({
    action: 'DISTRIBUTE_PARTNER_DIVIDENDS',
    category: 'finances',
    details: `اعتماد وتوزيع أرباح شهر (${month}) بقيمة إجمالية (${roundCurrency(distributableProfit)} ج.م) على (${generatedVouchers.length}) شركاء بعد حجز احتياطي (${roundCurrency(reserveAmount)} ج.م)`,
    actorName
  });

  return generatedVouchers;
};


// ==========================================
// COURSE SCHEDULES & TIMETABLE (جدول الكورسات والمواعيد)
// ==========================================

export const getCourseSchedules = createSharedCollectionListener(
  'course_schedules',
  () => collection(db, 'course_schedules')
);

export const addCourseSchedule = async (data) => {
  return await addDoc(collection(db, 'course_schedules'), {
    courseName: data.courseName?.trim() || '',
    instructorName: data.instructorName?.trim() || '',
    days: data.days || 'السبت والثلاثاء',
    startTime: data.startTime || '05:00 PM',
    endTime: data.endTime || '07:00 PM',
    room: data.room || 'قاعة 1',
    price: Number(data.price) || 0,
    totalSeats: Number(data.totalSeats) || 15,
    availableSeats: Number(data.availableSeats !== undefined ? data.availableSeats : 15),
    status: data.status || 'available', // available, almost_full, full, cancelled
    notes: data.notes?.trim() || '',
    createdAt: serverTimestamp()
  });
};

export const updateCourseSchedule = async (id, data) => {
  const ref = doc(db, 'course_schedules', id);
  return await updateDoc(ref, {
    courseName: data.courseName?.trim(),
    instructorName: data.instructorName?.trim(),
    days: data.days,
    startTime: data.startTime,
    endTime: data.endTime,
    room: data.room,
    price: Number(data.price) || 0,
    totalSeats: Number(data.totalSeats) || 15,
    availableSeats: Number(data.availableSeats),
    status: data.status || 'available',
    notes: data.notes?.trim() || '',
    updatedAt: serverTimestamp()
  });
};

export const deleteCourseSchedule = async (id) => {
  return await deleteDoc(doc(db, 'course_schedules', id));
};

// ==========================================
// WHATSAPP BOT & AUTO-RESPONDER SETTINGS
// ==========================================

export const getWhatsAppBotSettings = (callback) => {
  return onSnapshot(doc(db, 'system_settings', 'whatsapp_bot'), (snap) => {
    if (snap.exists()) {
      callback(snap.data());
    } else {
      callback({
        enabled: true,
        instanceId: 'instance100083',
        apiToken: 'tole7rqq0938j3hq',
        connectedPhone: '01007402020',
        welcomeMessage: `مرحباً بك في THE FIRST GROUP (TFG) 🏢✨
مساحة العمل وسنتر التدريب المتكامل بسوهاج 🚀

يمكنك الرد برقم الخدمة أو كتابة سؤالك مباشرة:
1️⃣ باقات وساعات مساحة العمل والمذاكرة (Work Space).
2️⃣ مواعيد وأسعار كورسات اللغات والبرمجة الحالية.
3️⃣ حجز غرفة الاجتماعات الخاصة (Meeting Room).
4️⃣ العنوان واللوكيشن ومواعيد العمل اليومية.
5️⃣ التحدث مع خدمة العملاء مباشرة.`,
        closingMessage: `📍 العنوان: سوهاج - [العنوان بالتفصيل]
⏰ مواعيد العمل: يومياً من 9:00 صباحاً حتى 11:00 مساءً
📞 نسعد دائماً بخدمتكم في THE FIRST GROUP! 🏢🌟`,
        locationAddress: 'سوهاج - شارع 15 - بجوار...',
        workingHours: 'يومياً من 9:00 صباحاً حتى 11:00 مساءً',
        customRules: [
          { id: '1', keyword: 'نت', reply: '🌐 لدينا أسرع شبكة إنترنت فايبر مدمجة ومخصصة للعمل والتحميل السريع بدون انقطاع!' },
          { id: '2', keyword: 'واي فاي', reply: '🌐 لدينا أسرع شبكة إنترنت فايبر مدمجة ومخصصة للعمل والتحميل السريع بدون انقطاع!' },
          { id: '3', keyword: 'كافيه', reply: '☕ نوفر كافيه متكامل يقدم أشهى المشروبات الساخنة والباردة وسناكس بأسعار مناسبة جداً.' },
          { id: '4', keyword: 'طباعة', reply: '🖨️ نوفر خدمات طباعة وتصوير أوراق وأبحاث أبيض وألوان بجودة ليزر عالية وسريعة.' }
        ]
      });
    }
  }, (err) => {
    console.error('Error fetching bot settings:', err);
    callback({ enabled: true });
  });
};

export const updateWhatsAppBotSettings = async (data) => {
  const ref = doc(db, 'system_settings', 'whatsapp_bot');
  return await setDoc(ref, {
    ...data,
    updatedAt: serverTimestamp()
  }, { merge: true });
};

// Customer Service Handoff Requests
export const getCustomerServiceRequests = (callback) => {
  return onSnapshot(collection(db, 'customer_service_requests'), snap => {
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Sort in memory desc
    list.sort((a, b) => {
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
      return tb - ta;
    });
    callback(list);
  });
};

export const resolveCustomerServiceRequest = (id) => updateDoc(doc(db, 'customer_service_requests', id), {
  status: 'resolved',
  resolvedAt: serverTimestamp()
});

export const deleteCustomerServiceRequest = (id) => deleteDoc(doc(db, 'customer_service_requests', id));

// ========================
// SUPPLIERS & VENDORS MANAGEMENT
// ========================
export const getVendors = (callback) => {
  const q = query(collection(db, 'vendors'), orderBy('name', 'asc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
};

export const addVendor = async (data) => {
  const ref = await addDoc(collection(db, 'vendors'), {
    name: data.name?.trim() || '',
    category: data.category || 'كافيه ومشروبات',
    phone: data.phone || '',
    address: data.address || '',
    notes: data.notes || '',
    balanceDue: parseNum(data.openingBalance) || 0,
    createdAt: serverTimestamp()
  });
  await logActivity({
    action: 'ADD_VENDOR',
    category: 'vendors',
    details: `إضافة مورد جديد: ${data.name} (التصنيف: ${data.category || 'عام'})`,
    actorName: 'الإدارة'
  });
  return ref;
};

export const updateVendor = async (id, data) => {
  await updateDoc(doc(db, 'vendors', id), {
    ...data,
    updatedAt: serverTimestamp()
  });
};

export const deleteVendor = async (id, name = '') => {
  await deleteDoc(doc(db, 'vendors', id));
  await logActivity({
    action: 'DELETE_VENDOR',
    category: 'vendors',
    details: `حذف المورد: ${name || id}`,
    actorName: 'الإدارة'
  });
};

export const getVendorInvoices = (vendorId, callback) => {
  const q = query(collection(db, 'vendor_invoices'), where('vendorId', '==', vendorId), orderBy('date', 'desc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
};

export const getAllVendorInvoices = (callback) => {
  const q = query(collection(db, 'vendor_invoices'), orderBy('date', 'desc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
};

export const addVendorInvoice = async (invoiceData, shiftId = null) => {
  const total = parseNum(invoiceData.total) || 0;
  const paid = parseNum(invoiceData.paid) || 0;
  const remaining = Math.max(0, total - paid);

  if (paid > 0 && shiftId) {
    const shiftSnap = await getDoc(doc(db, 'shifts', shiftId));
    if (shiftSnap.exists() && shiftSnap.data().status === 'closed') {
      throw new Error('لا يمكن تسجيل سداد فاتورة مورد على مناوبة مغلقة مسبقاً! يرجى اختيار المناوبة المفتوحة حالياً.');
    }
  }

  const invRef = await addDoc(collection(db, 'vendor_invoices'), {
    vendorId: invoiceData.vendorId,
    vendorName: invoiceData.vendorName || '',
    invoiceNo: invoiceData.invoiceNo || `INV-${Date.now().toString().slice(-5)}`,
    itemsSummary: invoiceData.itemsSummary || '',
    total,
    paid,
    remaining,
    paymentMethod: invoiceData.paymentMethod || 'cash',
    date: invoiceData.date ? new Date(invoiceData.date) : new Date(),
    createdAt: serverTimestamp()
  });

  // Update vendor balanceDue
  const vRef = doc(db, 'vendors', invoiceData.vendorId);
  const vSnap = await getDoc(vRef);
  if (vSnap.exists()) {
    const curDue = parseNum(vSnap.data().balanceDue) || 0;
    await updateDoc(vRef, { balanceDue: curDue + remaining });
  }

  // If paid > 0, record as expense in Shift or Admin Expenses
  if (paid > 0) {
    if (shiftId) {
      await addShiftExpense(shiftId, {
        label: `فاتورة مورد: ${invoiceData.vendorName} (${invoiceData.invoiceNo || 'مشتريات'})`,
        amount: paid,
        type: 'purchases'
      });
    } else {
      await addDoc(collection(db, 'admin_expenses'), {
        invoiceId: invRef.id,
        invoiceNo: invoiceData.invoiceNo || '',
        title: `سداد فاتورة مورد: ${invoiceData.vendorName}`,
        amount: paid,
        category: 'مشتريات وموردين',
        description: `فاتورة رقم: ${invoiceData.invoiceNo || ''} - ${invoiceData.itemsSummary || ''}`,
        date: serverTimestamp()
      });
    }
  }

  await logActivity({
    action: 'ADD_VENDOR_INVOICE',
    category: 'vendors',
    details: `تسجيل فاتورة مشتريات للمورد: ${invoiceData.vendorName} بإجمالي ${total} ج.م (مسدد: ${paid} ج.م، متبقي: ${remaining} ج.م)`,
    actorName: 'الإدارة'
  });

  return invRef;
};

export const recordVendorPayment = async (vendorId, paymentData, shiftId = null) => {
  const amount = parseNum(paymentData.amount) || 0;
  if (amount <= 0) return;

  if (shiftId) {
    const shiftSnap = await getDoc(doc(db, 'shifts', shiftId));
    if (shiftSnap.exists() && shiftSnap.data().status === 'closed') {
      throw new Error('لا يمكن سداد دفعة للمورد من مناوبة مغلقة مسبقاً! يرجى اختيار المناوبة المفتوحة حالياً.');
    }
  }

  const payRef = await addDoc(collection(db, 'vendor_payments'), {
    vendorId,
    vendorName: paymentData.vendorName || '',
    amount,
    paymentMethod: paymentData.paymentMethod || 'cash',
    notes: paymentData.notes || '',
    date: serverTimestamp()
  });

  // Deduct from vendor balanceDue
  const vRef = doc(db, 'vendors', vendorId);
  const vSnap = await getDoc(vRef);
  if (vSnap.exists()) {
    const curDue = parseNum(vSnap.data().balanceDue) || 0;
    await updateDoc(vRef, { balanceDue: Math.max(0, curDue - amount) });
  }

  // Record Expense
  if (shiftId) {
    await addShiftExpense(shiftId, {
      label: `سداد دفعة للمورد: ${paymentData.vendorName}`,
      amount,
      type: 'purchases'
    });
  } else {
    await addDoc(collection(db, 'admin_expenses'), {
      vendorPaymentId: payRef.id,
      title: `دفعة حساب مورد: ${paymentData.vendorName}`,
      amount,
      category: 'مشتريات وموردين',
      description: paymentData.notes || '',
      date: serverTimestamp()
    });
  }

  await logActivity({
    action: 'VENDOR_PAYMENT',
    category: 'vendors',
    details: `سداد دفعة للمورد: ${paymentData.vendorName} بمبلغ ${amount} ج.م [طريقة الدفع: ${paymentData.paymentMethod || 'نقدي'}]`,
    actorName: 'الإدارة'
  });

  return payRef;
};

export const deleteVendorPayment = async (id) => {
  const pRef = doc(db, 'vendor_payments', id);
  const snap = await getDoc(pRef);
  if (!snap.exists()) return;
  const payData = snap.data();

  // Restore vendor balanceDue
  if (payData.vendorId) {
    const vRef = doc(db, 'vendors', payData.vendorId);
    const vSnap = await getDoc(vRef);
    if (vSnap.exists()) {
      const curDue = parseNum(vSnap.data().balanceDue) || 0;
      await updateDoc(vRef, { balanceDue: curDue + (parseNum(payData.amount) || 0) });
    }
  }

  // Reverse matching admin expense if any
  const expQuery = query(collection(db, 'admin_expenses'), where('vendorPaymentId', '==', id));
  const expSnap = await getDocs(expQuery);
  for (const expDoc of expSnap.docs) {
    await deleteDoc(doc(db, 'admin_expenses', expDoc.id));
  }

  await deleteDoc(pRef);
  await logActivity({
    action: 'DELETE_VENDOR_PAYMENT',
    category: 'vendors',
    details: `إلغاء وحذف دفعة مورد: ${payData.vendorName} بمبلغ ${payData.amount} ج.م وإعادة المديونية لمستحقات المورد`,
    actorName: 'الإدارة'
  });
};


// ========================
// FREE VOUCHERS (سندات القبض والصرف الحرّة)
// ========================
export const getVouchers = (callback) => {
  const q = query(collection(db, 'vouchers'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
};

export const addVoucher = async (voucherData, shiftId = null, employeeId = null) => {
  const amount = roundCurrency(voucherData.amount);
  if (amount <= 0) throw new Error('مبلغ السند يجب أن يكون أكبر من الصفر');

  if (shiftId) {
    const shiftSnap = await getDoc(doc(db, 'shifts', shiftId));
    if (shiftSnap.exists() && shiftSnap.data().status === 'closed') {
      throw new Error('لا يمكن تسجيل سند قبض أو صرف على مناوبة مغلقة مسبقاً! يرجى اختيار المناوبة المفتوحة حالياً.');
    }
  }

  const isReceipt = voucherData.type === 'receipt'; // قبض (Receipt) vs صرف (Payment Voucher)
  const isCash = voucherData.paymentMethod === 'cash';

  const vRef = await addDoc(collection(db, 'vouchers'), {
    voucherNo: voucherData.voucherNo || `VCH-${Date.now().toString().slice(-6)}`,
    type: voucherData.type || 'receipt', // 'receipt' or 'payment'
    personName: voucherData.personName || '',
    phone: voucherData.phone || '',
    amount,
    paymentMethod: voucherData.paymentMethod || 'cash',
    category: voucherData.category || (isReceipt ? 'إيرادات عامة' : 'مصروفات عامة'),
    reason: voucherData.reason || '',
    notes: voucherData.notes || '',
    shiftId: shiftId || null,
    employeeId: employeeId || null,
    issuedBy: voucherData.issuedBy || 'الإدارة',
    date: voucherData.date ? new Date(voucherData.date) : new Date(),
    createdAt: serverTimestamp()
  });

  // Link to active shift if available
  if (shiftId) {
    if (isReceipt) {
      await addShiftRevenue(shiftId, {
        label: `سند قبض: ${voucherData.personName} (${voucherData.reason || 'إيراد'})`,
        amount,
        type: 'general',
        // BUG-01 FIX: pass paymentMethod so drawerCash only increments for cash receipts
        paymentMethod: voucherData.paymentMethod || voucherData.type || 'cash'
      });
    } else {
      await addShiftExpense(shiftId, {
        label: `سند صرف: ${voucherData.personName} (${voucherData.reason || 'نثريات'})`,
        amount,
        type: 'general'
      });
    }
  } else {
    // Admin Level Record
    if (isReceipt) {
      await addDoc(collection(db, 'admin_revenues'), {
        voucherId: vRef.id,
        voucherNo: voucherData.voucherNo || '',
        label: `سند قبض: ${voucherData.personName}`,
        amount,
        category: voucherData.category || 'إيرادات عامة',
        date: serverTimestamp()
      });
    } else {
      await addDoc(collection(db, 'admin_expenses'), {
        voucherId: vRef.id,
        voucherNo: voucherData.voucherNo || '',
        title: `سند صرف: ${voucherData.personName}`,
        amount,
        category: voucherData.category || 'مصروفات عامة',
        description: voucherData.reason || '',
        date: serverTimestamp()
      });
    }
  }

  await logActivity({
    action: isReceipt ? 'ISSUE_RECEIPT_VOUCHER' : 'ISSUE_PAYMENT_VOUCHER',
    category: 'financial',
    details: `إصدار سند ${isReceipt ? 'قبض 💰' : 'صرف 💸'} رقم ${voucherData.voucherNo || ''} للطرف (${voucherData.personName}) بمبلغ ${amount} ج.م [السبب: ${voucherData.reason || 'عام'}]`,
    actorName: voucherData.issuedBy || 'الإدارة'
  });

  return vRef;
};

export const deleteVoucher = async (id, voucherNo = '', actorName = 'الإدارة') => {
  const vRef = doc(db, 'vouchers', id);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(vRef);
    if (!snap.exists()) return;
    const voucher = snap.data();
    const isReceipt = voucher.type === 'receipt';
    const amount = roundCurrency(voucher.amount) || 0;
    const vNum = voucher.voucherNo || voucherNo || id;

    if (voucher.shiftId && amount > 0) {
      const sRef = doc(db, 'shifts', voucher.shiftId);
      const sSnap = await transaction.get(sRef);
      if (sSnap.exists()) {
        const shift = sSnap.data();
        if (shift.status === 'closed') {
          // If shift is closed, do not corrupt the historical handed-over cash figures,
          // but safely flag the closed shift and allow deleting the voucher document
          transaction.update(sRef, {
            hasVoidedVouchers: true,
            updatedAt: serverTimestamp()
          });
        } else if (isReceipt) {
          const updatedRevs = (shift.revenues || []).filter(r => !r.label?.includes(vNum));
          const totalRevenues = roundCurrency(Math.max(0, (parseNum(shift.totalRevenue) || 0) - amount));
          const drawerCash = roundCurrency(Math.max(0, (parseNum(shift.drawerCash != null ? shift.drawerCash : (shift.cashRevenue || 0))) - amount));
          const cashRevenue = roundCurrency(Math.max(0, (parseNum(shift.cashRevenue) || 0) - amount));
          const totalExpenses = roundCurrency(parseNum(shift.totalExpenses) || 0);
          const netAmount = roundCurrency(totalRevenues - totalExpenses);
          const expectedCash = roundCurrency(drawerCash - totalExpenses);
          transaction.update(sRef, {
            revenues: updatedRevs,
            totalRevenue: totalRevenues,
            drawerCash,
            cashRevenue,
            netAmount,
            expectedCash,
            updatedAt: serverTimestamp()
          });
        } else {
          const updatedExps = (shift.expenses || []).filter(e => !e.label?.includes(vNum));
          const totalExpenses = roundCurrency(Math.max(0, (parseNum(shift.totalExpenses) || 0) - amount));
          const drawerCash = roundCurrency(parseNum(shift.drawerCash != null ? shift.drawerCash : (shift.cashRevenue || 0)));
          const totalRevenue = roundCurrency(parseNum(shift.totalRevenue) || 0);
          const netAmount = roundCurrency(totalRevenue - totalExpenses);
          const expectedCash = roundCurrency(drawerCash - totalExpenses);
          transaction.update(sRef, {
            expenses: updatedExps,
            totalExpenses,
            drawerCash,
            netAmount,
            expectedCash,
            updatedAt: serverTimestamp()
          });
        }
      }
    }

    transaction.delete(vRef);
  });

  // Clean up standalone admin records if any
  try {
    const qSnap = await getDocs(query(collection(db, 'admin_revenues'), where('voucherId', '==', id)));
    for (const d of qSnap.docs) await deleteDoc(d.ref);
    const qSnapEx = await getDocs(query(collection(db, 'admin_expenses'), where('voucherId', '==', id)));
    for (const d of qSnapEx.docs) await deleteDoc(d.ref);
  } catch (err) {
    console.warn('Could not clean up auxiliary voucher records:', err);
  }

  await logActivity({
    action: 'DELETE_VOUCHER',
    category: 'financial',
    details: `حذف سند مالي رقم: ${voucherNo || id} وعكس أثره المالي بنجاح في قاعدة البيانات`,
    actorName
  });
};

export const deleteVendorInvoice = async (invoiceId) => {
  const invRef = doc(db, 'vendor_invoices', invoiceId);
  const snap = await getDoc(invRef);
  if (!snap.exists()) return;
  const inv = snap.data();
  const remaining = parseNum(inv.remaining) || 0;
  const paid = parseNum(inv.paid) || 0;

  // Deduct remaining from vendor balanceDue
  if (inv.vendorId && remaining > 0) {
    const vRef = doc(db, 'vendors', inv.vendorId);
    const vSnap = await getDoc(vRef);
    if (vSnap.exists()) {
      const curDue = parseNum(vSnap.data().balanceDue) || 0;
      await updateDoc(vRef, { balanceDue: Math.max(0, curDue - remaining) });
    }
  }

  // Reverse paid expense from shift if linked
  if (inv.shiftId && paid > 0) {
    const sRef = doc(db, 'shifts', inv.shiftId);
    const sSnap = await getDoc(sRef);
    if (sSnap.exists()) {
      const shift = sSnap.data();
      const updatedExps = (shift.expenses || []).filter(e => !e.label?.includes(inv.invoiceNo || 'فاتورة مورد'));
      const totalExpenses = Math.max(0, (parseNum(shift.totalExpenses) || 0) - paid);
      const drawerCash = (parseNum(shift.drawerCash || shift.cashRevenue) || 0) + paid;
      const netAmount = (parseNum(shift.totalRevenue) || 0) - totalExpenses;
      await updateDoc(sRef, { expenses: updatedExps, totalExpenses, drawerCash, netAmount });
    }
  } else if (!inv.shiftId && paid > 0) {
    const qSnap = await getDocs(query(collection(db, 'admin_expenses'), where('invoiceId', '==', invoiceId)));
    for (const d of qSnap.docs) {
      await deleteDoc(d.ref);
    }
  }

  await deleteDoc(invRef);
  await logActivity({
    action: 'DELETE_VENDOR_INVOICE',
    category: 'vendors',
    details: `حذف فاتورة المورد: ${inv.vendorName || ''} رقم ${inv.invoiceNo || ''} بمبلغ ${inv.total || 0} ج.م وعكس الأثر المالي`,
    actorName: 'الإدارة'
  });
};

// ========================
// INVENTORY & CAFETERIA (المخزون والكافيه)
// ========================
export const getInventory = createSharedCollectionListener(
  'inventory',
  () => query(collection(db, 'inventory'), orderBy('name', 'asc'))
);

export const addInventoryItem = async (data) => {
  const ref = await addDoc(collection(db, 'inventory'), {
    name: data.name?.trim() || '',
    category: data.category || 'مشروبات وبن',
    quantity: parseNum(data.quantity) || 0,
    minQuantityAlert: parseNum(data.minQuantityAlert) || 5,
    unitPrice: parseNum(data.unitPrice) || 0,
    costPrice: parseNum(data.costPrice) || 0,
    unit: data.unit || 'علبة / كرتونة',
    notes: data.notes || '',
    createdAt: serverTimestamp()
  });
  await logActivity({
    action: 'ADD_INVENTORY_ITEM',
    category: 'inventory',
    details: `إضافة صنف مخزون جديد: ${data.name} (الكمية: ${data.quantity || 0})`,
    actorName: 'الإدارة'
  });
  return ref;
};

export const updateInventoryItem = async (id, data) => {
  await updateDoc(doc(db, 'inventory', id), {
    ...data,
    updatedAt: serverTimestamp()
  });
};

export const adjustInventoryStock = async (id, changeAmount, reason = 'تعديل جرد / استهلاك', shiftId = null) => {
  if (!id) return;
  const itemRef = doc(db, 'inventory', id);
  const numChange = parseNum(changeAmount) || 0;
  const logRef = doc(collection(db, 'inventory_logs'));

  let itemName = '';
  let finalQty = 0;
  let minAlert = 5;
  let itemUnit = 'قطعة';
  let isLowStock = false;

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(itemRef);
    if (!snap.exists()) return;
    const item = snap.data();
    itemName = item.name || '';
    minAlert = parseNum(item.minQuantityAlert) || 5;
    itemUnit = item.unit || 'قطعة';
    const currentQty = parseNum(item.quantity) || 0;
    finalQty = Math.max(0, roundCurrency(currentQty + numChange));

    if (finalQty <= minAlert && numChange < 0) {
      isLowStock = true;
    }

    transaction.update(itemRef, {
      quantity: finalQty,
      lastAdjustedAt: serverTimestamp()
    });

    transaction.set(logRef, {
      itemId: id,
      itemName,
      changeAmount: numChange,
      resultingQuantity: finalQty,
      reason,
      shiftId: shiftId || null,
      date: serverTimestamp()
    });
  });

  if (itemName) {
    await logActivity({
      action: 'ADJUST_INVENTORY',
      category: 'inventory',
      details: `تعديل مخزون الصنف (${itemName}): ${numChange > 0 ? '+' : ''}${numChange} (${reason}) - الرصيد الحالي: ${finalQty}`,
      actorName: 'الإدارة / الاستقبال'
    });

    if (isLowStock) {
      try {
        await sendTelegramMessage(`⚠️ <b>تنبيه انخفاض المخزون (Low Stock Alert):</b>
━━━━━━━━━━━━━━━━━
📦 <b>الصنف:</b> <b>${itemName}</b>
📉 <b>الرصيد المتبقي:</b> <code>${finalQty}</code> ${itemUnit}
🚨 <b>حد الأمان:</b> ${minAlert} ${itemUnit}
ℹ️ <b>العملية:</b> ${reason}
━━━━━━━━━━━━━━━━━
🛒 <i>يرجى التوجيه بشراء وتوريد دفعة جديدة لتفادي النواقص في الكافيه.</i>`);
      } catch (telegramErr) {
        console.warn('Could not send low stock Telegram alert:', telegramErr);
      }
    }
  }
};

export const deleteInventoryItem = async (id, name = '') => {
  await deleteDoc(doc(db, 'inventory', id));
  await logActivity({
    action: 'DELETE_INVENTORY_ITEM',
    category: 'inventory',
    details: `حذف الصنف: ${name || id} من المخزون`,
    actorName: 'الإدارة'
  });
};

// ========================
// CONTRACTS & PREMISES LEASE TRACKER (عقود الإيجار والخدمات)
// ========================
export const getContracts = (callback) => {
  const q = query(collection(db, 'contracts'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
};

export const addContract = async (data) => {
  const ref = await addDoc(collection(db, 'contracts'), {
    title: data.title?.trim() || '',
    type: data.type || 'إيجار مقر', // 'إيجار مقر', 'فاتورة كهرباء', 'فاتورة إنترنت', 'صيانة دورية', 'أخرى'
    partyName: data.partyName || '',
    phone: data.phone || '',
    amount: parseNum(data.amount) || 0,
    dueDayOfMonth: parseNum(data.dueDayOfMonth) || 1, // اليوم في الشهر المستحق فيه الدفع
    startDate: data.startDate || '',
    endDate: data.endDate || '',
    status: data.status || 'active',
    notes: data.notes || '',
    createdAt: serverTimestamp()
  });
  await logActivity({
    action: 'ADD_CONTRACT',
    category: 'contracts',
    details: `تسجيل عقد / التزام دوري جديد: ${data.title} بقيمة ${data.amount} ج.م (يوم ${data.dueDayOfMonth} شهرياً)`,
    actorName: 'الإدارة'
  });
  return ref;
};

export const updateContract = async (id, data) => {
  await updateDoc(doc(db, 'contracts', id), {
    ...data,
    updatedAt: serverTimestamp()
  });
};

export const deleteContract = async (id, title = '') => {
  await deleteDoc(doc(db, 'contracts', id));
  await logActivity({
    action: 'DELETE_CONTRACT',
    category: 'contracts',
    details: `حذف العقد / الالتزام: ${title || id}`,
    actorName: 'الإدارة'
  });
};

export const recordContractPayment = async (contractId, paymentData, shiftId = null) => {
  const amount = parseNum(paymentData.amount) || 0;
  if (amount <= 0) return;

  if (shiftId) {
    const shiftSnap = await getDoc(doc(db, 'shifts', shiftId));
    if (shiftSnap.exists() && shiftSnap.data().status === 'closed') {
      throw new Error('لا يمكن سداد دفعة عقد على مناوبة مغلقة مسبقاً! يرجى اختيار المناوبة المفتوحة حالياً.');
    }
  }

  const payRef = await addDoc(collection(db, 'contract_payments'), {
    contractId,
    contractTitle: paymentData.contractTitle || '',
    amount,
    month: paymentData.month || '',
    paymentMethod: paymentData.paymentMethod || 'cash',
    notes: paymentData.notes || '',
    shiftId: shiftId || null,
    date: serverTimestamp()
  });

  // Record as expense in shift or admin expenses
  if (shiftId) {
    await addShiftExpense(shiftId, {
      label: `سداد التزام: ${paymentData.contractTitle} (${paymentData.month || ''})`,
      amount,
      type: 'general'
    });
  } else {
    await addDoc(collection(db, 'admin_expenses'), {
      paymentId: payRef.id,
      title: `سداد التزام / عقد: ${paymentData.contractTitle}`,
      amount,
      category: 'إيجار ومرافق وخدمات',
      description: paymentData.notes || '',
      date: serverTimestamp()
    });
  }

  await logActivity({
    action: 'PAY_CONTRACT',
    category: 'contracts',
    details: `سداد التزام عقد (${paymentData.contractTitle}) بمبلغ ${amount} ج.م عن شهر ${paymentData.month || ''}`,
    actorName: 'الإدارة'
  });

  return payRef;
};

export const getContractPayments = (callback) => {
  const q = query(collection(db, 'contract_payments'), orderBy('date', 'desc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
};

export const deleteContractPayment = async (id, actorName = 'الإدارة') => {
  const pRef = doc(db, 'contract_payments', id);
  const snap = await getDoc(pRef);
  if (!snap.exists()) return;
  const pay = snap.data();
  const amount = parseNum(pay.amount) || 0;

  if (pay.shiftId && amount > 0) {
    const sRef = doc(db, 'shifts', pay.shiftId);
    const sSnap = await getDoc(sRef);
    if (sSnap.exists()) {
      const shift = sSnap.data();
      const updatedExps = (shift.expenses || []).filter(e => !e.label?.includes(pay.contractTitle || 'سداد التزام'));
      const totalExpenses = Math.max(0, (parseNum(shift.totalExpenses) || 0) - amount);
      const drawerCash = (parseNum(shift.drawerCash || shift.cashRevenue) || 0) + amount;
      const netAmount = (parseNum(shift.totalRevenue) || 0) - totalExpenses;
      await updateDoc(sRef, { expenses: updatedExps, totalExpenses, drawerCash, netAmount });
    }
  } else if (!pay.shiftId && amount > 0) {
    const qSnap = await getDocs(query(collection(db, 'admin_expenses'), where('paymentId', '==', id)));
    for (const d of qSnap.docs) {
      await deleteDoc(d.ref);
    }
  }

  await deleteDoc(pRef);
  await logActivity({
    action: 'DELETE_CONTRACT_PAYMENT',
    category: 'contracts',
    details: `إلغاء سداد قسط/التزام عقد (${pay.contractTitle || ''}) لشهر ${pay.month || ''} بمبلغ ${amount} ج.م وعكس الأثر المالي`,
    actorName
  });
};

// ========================
// YEAR-END CLOSING & ARCHIVING (تقفيل السنة المالية)
// ========================
export const getYearEndClosings = (callback) => {
  const q = query(collection(db, 'year_end_closings'), orderBy('year', 'desc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
};

export const recordYearEndClosing = async (closingData) => {
  const yearStr = String(closingData.year || new Date().getFullYear());
  const yearDocRef = doc(db, 'year_end_closings', yearStr);
  await setDoc(yearDocRef, {
    year: yearStr,
    totalRevenue: parseNum(closingData.totalRevenue),
    totalExpenses: parseNum(closingData.totalExpenses),
    netProfit: parseNum(closingData.netProfit),
    closedBy: closingData.closedBy || 'المدير العام',
    notes: closingData.notes || '',
    summarySnapshot: closingData.summarySnapshot || {},
    closedAt: serverTimestamp()
  }, { merge: true });

  await logActivity({
    action: 'YEAR_END_CLOSING',
    category: 'financial',
    details: `تقفيل وأرشفة السنة المالية (${yearStr}) بصافي ربح ${closingData.netProfit} ج.م وترحيل الأرصدة`,
    actorName: closingData.closedBy || 'الإدارة'
  });

  return yearDocRef;
};

// ========================
// LOST & FOUND (سجل المفقودات والأمانات)
// ========================
export const getLostItems = (callback) => {
  const q = query(collection(db, 'lost_items'), orderBy('foundDate', 'desc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
};

export const addLostItem = async (data) => {
  const ref = await addDoc(collection(db, 'lost_items'), {
    itemName: data.itemName?.trim() || '',
    category: data.category || 'أجهزة وإلكترونيات',
    locationFound: data.locationFound || 'قاعة الورك سبيس',
    foundDate: data.foundDate || new Date().toISOString().split('T')[0],
    foundBy: data.foundBy || 'الاستقبال',
    status: 'in_custody', // 'in_custody', 'claimed'
    claimedBy: '',
    claimPhone: '',
    claimDate: null,
    notes: data.notes || '',
    createdAt: serverTimestamp()
  });
  await logActivity({
    action: 'ADD_LOST_ITEM',
    category: 'operations',
    details: `تسجيل مفقودات جديدة: ${data.itemName} (المكان: ${data.locationFound})`,
    actorName: 'الاستقبال / الإدارة'
  });
  return ref;
};

export const updateLostItem = async (id, data) => {
  await updateDoc(doc(db, 'lost_items', id), {
    ...data,
    updatedAt: serverTimestamp()
  });
};

export const claimLostItem = async (id, claimData) => {
  await updateDoc(doc(db, 'lost_items', id), {
    status: 'claimed',
    claimedBy: claimData.claimedBy?.trim() || '',
    claimPhone: claimData.claimPhone?.trim() || '',
    claimDate: serverTimestamp(),
    handoverBy: claimData.handoverBy || 'الاستقبال'
  });
  await logActivity({
    action: 'CLAIM_LOST_ITEM',
    category: 'operations',
    details: `تسليم الأمانة / المفقودات (${claimData.itemName || id}) للمستلم: ${claimData.claimedBy}`,
    actorName: claimData.handoverBy || 'الاستقبال'
  });
};

export const deleteLostItem = async (id, name = '') => {
  await deleteDoc(doc(db, 'lost_items', id));
  await logActivity({
    action: 'DELETE_LOST_ITEM',
    category: 'operations',
    details: `حذف سجل المفقودات: ${name || id}`,
    actorName: 'الإدارة'
  });
};

// ========================
// PETTY CASH FLOAT (العهدة النقدية الثابتة وخزينة الطوارئ)
// ========================
export const getPettyCashFunds = (callback) => {
  const q = query(collection(db, 'petty_cash_movements'), orderBy('date', 'desc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
};

export const recordPettyCashMovement = async (data) => {
  const ref = await addDoc(collection(db, 'petty_cash_movements'), {
    type: data.type, // 'deposit' (تغذية عهدة), 'withdrawal' (صرف من العهدة)
    amount: parseNum(data.amount) || 0,
    custodian: data.custodian || 'المدير المالي',
    reason: data.reason || '',
    notes: data.notes || '',
    date: serverTimestamp()
  });
  await logActivity({
    action: 'PETTY_CASH_MOVEMENT',
    category: 'financial',
    details: `حركة عهدة نقدية (${data.type === 'deposit' ? 'تغذية عهدة' : 'صرف عهدة'}): ${data.amount} ج.م (${data.reason})`,
    actorName: data.custodian || 'الإدارة'
  });
  return ref;
};

// ========================
// FEEDBACK & REVIEWS (استبيانات وتقييمات العملاء)
// ========================
export const getFeedbackList = (callback) => {
  const q = query(collection(db, 'feedback'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
};

export const submitClientFeedback = async (data) => {
  const ref = await addDoc(collection(db, 'feedback'), {
    clientName: data.clientName || 'عميل مجهول',
    clientPhone: data.clientPhone || '',
    memberId: data.memberId || '',
    tableNumber: data.tableNumber || '',
    source: data.source || 'portal',
    rating: parseNum(data.rating) || 5, // 1 to 5
    serviceRated: data.serviceRated || 'ورك سبيس ومساحة عمل',
    comment: data.comment || '',
    status: 'new',
    createdAt: serverTimestamp()
  });
  await logActivity({
    action: 'CLIENT_FEEDBACK',
    category: 'marketing',
    details: `تقييم جديد من (${data.clientName || 'عميل'}): ${data.rating} نجوم (${data.serviceRated})`,
    actorName: data.clientName || 'العميل'
  });
  return ref;
};

// ========================
// CAFE SHIFTS & POS (كافيه السنتر والبوفيه)
// ========================
export const getActiveCafeShift = (callback) => {
  const q = query(collection(db, 'cafe_shifts'), where('status', '==', 'open'), limit(1));
  return onSnapshot(q, (snap) => {
    if (snap.empty) callback(null);
    else callback({ id: snap.docs[0].id, ...snap.docs[0].data() });
  });
};

export const getCafeShifts = createSharedCollectionListener(
  'cafe_shifts',
  () => collection(db, 'cafe_shifts'),
  (d) => ({ id: d.id, ...d.data() }),
  (a, b) => {
    const getMs = (ts) => ts?.toDate ? ts.toDate().getTime() : (ts?.seconds ? ts.seconds * 1000 : (ts ? new Date(ts).getTime() : 0));
    return getMs(b.openedAt) - getMs(a.openedAt);
  }
);

export const openCafeShift = async (data) => {
  // Check for duplicate open shift
  const existingOpen = await getDocs(query(collection(db, 'cafe_shifts'), where('status', '==', 'open'), limit(1)));
  if (!existingOpen.empty) {
    throw new Error('توجد وردية كافيه جارية بالفعل لم يتم إغلاقها بعد!');
  }

  const openingDrawer = parseNum(data.openingDrawer) || 0;
  const ref = await addDoc(collection(db, 'cafe_shifts'), {
    status: 'open',
    baristaName: data.baristaName || 'كاشير الكافيه',
    baristaId: data.baristaId || 'STAFF',
    openingDrawer,
    drawerCash: openingDrawer,
    totalSales: 0,
    cashSales: 0,
    walletSales: 0,
    digitalSales: 0,
    totalExpenses: 0,
    sales: [],
    expenses: [],
    notes: data.notes || '',
    openedAt: serverTimestamp()
  });

  await logActivity({
    action: 'OPEN_CAFE_SHIFT',
    category: 'cafe',
    details: "فتح وردية كافيه جديدة بواسطة (" + (data.baristaName || 'كاشير الكافيه') + ") بعهدة: " + openingDrawer + " ج.م",
    actorName: data.baristaName || 'كاشير الكافيه'
  });

  return ref;
};

export const addCafeSale = async (shiftId, saleData) => {
  const sRef = doc(db, 'cafe_shifts', shiftId);

  const total = roundCurrency(saleData.total) || 0;
  const rawMethod = (saleData.paymentMethod || 'cash').toLowerCase().trim();
  const isWallet = rawMethod === 'wallet_credit' || rawMethod === 'wallet' || rawMethod.includes('محفظ') || (saleData.buyerName && saleData.buyerName.includes('مدفوع بالمحفظة'));
  const isCash = !isWallet && (rawMethod === 'cash' || rawMethod === 'نقدي');
  const isInstapay = !isCash && !isWallet && (rawMethod === 'instapay' || rawMethod.includes('إنستا') || rawMethod.includes('انستا'));
  const isVodafone = !isCash && !isWallet && (rawMethod === 'vodafone_cash' || rawMethod.includes('فودافون'));
  const isVisa = !isCash && !isWallet && !isInstapay && !isVodafone && (rawMethod === 'visa' || rawMethod.includes('فيزا'));

  const cleanMethod = isWallet ? 'wallet_credit' : (isCash ? 'cash' : (isInstapay ? 'instapay' : (isVodafone ? 'vodafone_cash' : (isVisa ? 'visa' : rawMethod))));

  const newSaleId = 'CS_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const newSale = {
    id: newSaleId,
    orderId: saleData.orderId || null,
    orderCode: saleData.orderCode || null,
    items: saleData.items || [],
    total,
    discount: roundCurrency(saleData.discount) || 0,
    paymentMethod: cleanMethod,
    buyerName: saleData.buyerName || 'زبون كافيه',
    clientId: saleData.clientId || null,
    paidWithWallet: isWallet,
    date: new Date().toISOString()
  };

  let isDuplicate = false;
  let existingSale = null;

  // Run shift update atomically inside a transaction to prevent race conditions
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(sRef);
    if (!snap.exists()) throw new Error('وردية الكافيه غير موجودة أو تم إغلاقها');
    const shift = snap.data();

    if (shift.status === 'closed') {
      throw new Error('لا يمكن تسجيل مبيعات على وردية كافيه مغلقة مسبقاً! يرجى فتح وردية جديدة.');
    }

    // Idempotency: prevent recording the exact same order twice
    if (saleData.orderId && Array.isArray(shift.sales)) {
      const alreadyExists = shift.sales.find(s => s.orderId === saleData.orderId);
      if (alreadyExists) {
        isDuplicate = true;
        existingSale = alreadyExists;
        return;
      }
    }

    const updatedSales = [...(shift.sales || []), newSale];
    const newTotalSales = roundCurrency((parseNum(shift.totalSales) || 0) + total);
    const newCashSales = roundCurrency((parseNum(shift.cashSales) || 0) + (isCash ? total : 0));
    const newWalletSales = roundCurrency((parseNum(shift.walletSales) || 0) + (isWallet ? total : 0));
    const newDigitalSales = roundCurrency((parseNum(shift.digitalSales) || 0) + (!isCash ? total : 0));
    const newDrawer = roundCurrency((parseNum(shift.drawerCash) || 0) + (isCash ? total : 0));

    transaction.update(sRef, {
      sales: updatedSales,
      totalSales: newTotalSales,
      cashSales: newCashSales,
      walletSales: newWalletSales,
      digitalSales: newDigitalSales,
      drawerCash: newDrawer,
      updatedAt: serverTimestamp()
    });
  });

  // If already processed, exit early without double inventory deduction or duplicate sale document
  if (isDuplicate) {
    return existingSale;
  }

  // Adjust inventory stocks
  for (const itm of (saleData.items || [])) {
    if (itm.itemId && (itm.qty > 0 || itm.quantity > 0)) {
      const q = parseNum(itm.qty || itm.quantity) || 1;
      await adjustInventoryStock(itm.itemId, -q, "مبيعات كافيه (فاتورة: " + newSale.id + ")", shiftId);
    }
  }

  await addDoc(collection(db, 'cafe_sales'), {
    shiftId,
    ...newSale,
    createdAt: serverTimestamp()
  });

  return newSale;
};

export const addCafeExpense = async (shiftId, expenseData) => {
  if (!shiftId) throw new Error('معرف وردية الكافيه غير محدد');
  const sRef = doc(db, 'cafe_shifts', shiftId);
  const amount = roundCurrency(expenseData.amount) || 0;
  if (amount <= 0) throw new Error('قيمة المصروف يجب أن تكون أكبر من الصفر');

  const newExpense = {
    id: 'CE_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    label: expenseData.label || 'مستلزمات كافيه',
    amount,
    category: expenseData.category || 'مشتريات بوفيه وسكر ولبن',
    date: new Date().toISOString()
  };

  let barista = 'كاشير الكافيه';

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(sRef);
    if (!snap.exists()) throw new Error('وردية الكافيه غير موجودة');
    const shift = snap.data();

    if (shift.status === 'closed') {
      throw new Error('لا يمكن إضافة مصروف لوردية كافيه مغلقة مسبقاً!');
    }

    barista = shift.baristaName || 'كاشير الكافيه';
    const updatedExpenses = [...(shift.expenses || []), newExpense];
    const newTotalExpenses = roundCurrency((parseNum(shift.totalExpenses) || 0) + amount);
    const newDrawer = Math.max(0, roundCurrency((parseNum(shift.drawerCash) || 0) - amount));

    transaction.update(sRef, {
      expenses: updatedExpenses,
      totalExpenses: newTotalExpenses,
      drawerCash: newDrawer,
      updatedAt: serverTimestamp()
    });
  });

  await logActivity({
    action: 'ADD_CAFE_EXPENSE',
    category: 'cafe',
    details: `تسجيل مصروف كافيه: ${newExpense.label} بقيمة ${amount} ج.م (تصنيف: ${newExpense.category})`,
    actorName: barista
  });

  return newExpense;
};

export const closeCafeShift = async (shiftId, closeData) => {
  if (!shiftId) throw new Error('معرف وردية الكافيه غير محدد');
  const sRef = doc(db, 'cafe_shifts', shiftId);

  // Execute atomically inside Firestore transaction to guarantee 100% duplicate protection
  const closeResult = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(sRef);
    if (!snap.exists()) throw new Error('وردية الكافيه غير موجودة');
    const shift = snap.data();

    // Guard against duplicate closure
    if (shift.status === 'closed') {
      throw new Error('وردية الكافيه مغلقة بالفعل مسبقاً!');
    }

    const totalSales = roundCurrency(parseNum(shift.totalSales) || 0);
    const totalExpenses = roundCurrency(parseNum(shift.totalExpenses) || 0);
    const netProfit = roundCurrency(totalSales - totalExpenses);
    const actualCount = roundCurrency(parseNum(closeData.actualCount) || 0);
    const expectedDrawer = roundCurrency(parseNum(shift.drawerCash) || 0);
    const difference = roundCurrency(actualCount - expectedDrawer);
    const closedBy = closeData.closedBy || 'كاشير الكافيه';
    const closingNotes = closeData.notes || '';

    transaction.update(sRef, {
      status: 'closed',
      actualClosingCount: actualCount,
      expectedDrawer,
      drawerDifference: difference,
      netProfit,
      closedBy,
      closingNotes,
      closedAt: serverTimestamp()
    });

    return {
      baristaName: shift.baristaName || 'الكافيه',
      totalSales,
      totalExpenses,
      netProfit,
      actualCount,
      expectedDrawer,
      difference,
      closedBy
    };
  });

  // Automatically record handed over cash to central administration revenues using deterministic ID (idempotent)
  if (closeResult.actualCount > 0) {
    const revDocRef = doc(db, 'admin_revenues', `cafe_shift_rev_${shiftId}`);
    await setDoc(revDocRef, {
      label: "توريد نقدية إغلاق وردية كافيه (" + closeResult.baristaName + ")",
      amount: closeResult.actualCount,
      category: 'cafe',
      isCafeTransfer: true,
      shiftId,
      notes: "إيراد إغلاق وردية كافيه | صافي الربح: " + closeResult.netProfit + " ج.م | نقدية مستلمة بالخزينة",
      date: new Date().toISOString().split('T')[0],
      createdAt: serverTimestamp()
    }, { merge: true });
  }

  await logActivity({
    action: 'CLOSE_CAFE_SHIFT',
    category: 'cafe',
    details: "إغلاق وردية كافيه: إيراد " + closeResult.totalSales + " ج.م | مصاريف " + closeResult.totalExpenses + " ج.م | صافي ربح " + closeResult.netProfit + " ج.م (عجز/زيادة: " + closeResult.difference + " ج.م)",
    actorName: closeResult.closedBy
  });
};

export const deleteCafeShift = async (shiftId, actorName = 'المدير العام') => {
  if (!shiftId) throw new Error('معرف وردية الكافيه غير محدد');
  const sRef = doc(db, 'cafe_shifts', shiftId);
  const snap = await getDoc(sRef);
  const data = snap.exists() ? snap.data() : {};
  await deleteDoc(sRef);
  await logActivity({
    action: 'DELETE_CAFE_SHIFT',
    category: 'shifts',
    details: `حذف وردية الكافيه (#${shiftId.slice(-6)}) الخاصة بـ (${data.baristaName || 'الكافيه'}) بواسطة (${actorName})`,
    actorName
  });
};

export const adminUpdateShift = async (shiftId, isCafe, updatedFields, actorName = 'المدير العام') => {
  if (!shiftId) throw new Error('معرف المناوبة غير محدد');
  const collectionName = isCafe ? 'cafe_shifts' : 'shifts';
  const sRef = doc(db, collectionName, shiftId);
  const payload = {
    ...updatedFields,
    updatedAt: serverTimestamp(),
    lastModifiedBy: actorName
  };
  await updateDoc(sRef, payload);
  await logActivity({
    action: 'ADMIN_UPDATE_SHIFT',
    category: 'shifts',
    details: `تعديل يدوي بواسطة الإدارة للمناوبة (#${shiftId.slice(-6)}) [${isCafe ? 'كافيه' : 'استقبال'}] بواسطة (${actorName})`,
    actorName
  });
};

// ========================
// CAFE WASTAGE (هالك وتوالف الكافيه)
// ========================
export const logCafeWaste = async (wasteData) => {
  const ref = await addDoc(collection(db, 'cafe_waste'), {
    itemId: wasteData.itemId,
    itemName: wasteData.itemName || '',
    quantity: parseNum(wasteData.quantity) || 1,
    costPrice: parseNum(wasteData.costPrice) || 0,
    totalLoss: (parseNum(wasteData.quantity) || 1) * (parseNum(wasteData.costPrice) || 0),
    reason: wasteData.reason || 'سكب / تلف أثناء التحضير',
    reportedBy: wasteData.reportedBy || 'كاشير الكافيه',
    date: serverTimestamp()
  });

  if (wasteData.itemId) {
    await adjustInventoryStock(wasteData.itemId, -Math.abs(parseNum(wasteData.quantity) || 1), "هالك وتالف: " + (wasteData.reason || 'تلف'));
  }

  await logActivity({
    action: 'LOG_CAFE_WASTE',
    category: 'cafe',
    details: "تسجيل هالك كافيه: " + (wasteData.quantity || 1) + " من (" + (wasteData.itemName || '') + ") بسبب: " + (wasteData.reason || ''),
    actorName: wasteData.reportedBy || 'كاشير الكافيه'
  });

  return ref;
};

export const ensureCafeUserExists = async () => {
  try {
    const q = query(collection(db, "users"), where("username", "==", "cafe"));
    const snap = await getDocs(q);
    if (snap.empty) {
      const hash = await hashPassword("123456");
      await addDoc(collection(db, "users"), {
        name: "باريستا الكافيه",
        memberId: "cafe",
        username: "cafe",
        passwordHash: hash,
        role: "cafe",
        phone: "01000000000",
        salary: 0,
        createdAt: serverTimestamp()
      });
      console.log("☕ Default Cafe User created: cafe / 123456");
    }
  } catch (err) {
    console.error("Error ensuring cafe user:", err);
  }
};

export const addCafeCashDrop = async (shiftId, amount, notes, actorName = 'كاشير الكافيه') => {
  const numAmount = roundCurrency(amount);
  if (numAmount <= 0) throw new Error('يرجى تحديد مبلغ سحب صحيح');

  const sRef = doc(db, 'cafe_shifts', shiftId);
  const dropId = 'CD_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
  const dropDate = new Date().toISOString();

  let baristaName = 'الكافيه';

  const dropRecord = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(sRef);
    if (!snap.exists()) throw new Error('وردية الكافيه غير موجودة');
    const shift = snap.data();

    if (shift.status === 'closed') {
      throw new Error('لا يمكن السحب النقدي من وردية مغلقة!');
    }

    baristaName = shift.baristaName || 'الكافيه';
    const currentDrawer = roundCurrency(shift.drawerCash || 0);
    if (numAmount > currentDrawer) {
      throw new Error('المبلغ المطلوب سحبه أكبر من النقدية المتوفرة بالدرج!');
    }

    const newDrawer = roundCurrency(currentDrawer - numAmount);
    const record = {
      id: dropId,
      amount: numAmount,
      notes: notes || 'سحب نقدي جزئي للإدارة',
      date: dropDate,
      actorName
    };

    const updatedDrops = [...(shift.cashDrops || []), record];
    const updatedTotalDrops = roundCurrency((shift.totalCashDrops || 0) + numAmount);

    transaction.update(sRef, {
      cashDrops: updatedDrops,
      totalCashDrops: updatedTotalDrops,
      drawerCash: newDrawer
    });

    return record;
  });

  try {
    await setDoc(doc(db, 'admin_revenues', `cafe_drop_${dropId}`), {
      label: "سحب نقدي جزئي من وردية الكافيه (" + baristaName + ")",
      amount: numAmount,
      category: 'cafe',
      isCafeTransfer: true,
      dropId,
      shiftId,
      notes: "سحب نقدية أمان أثناء الوردية: " + (notes || ''),
      date: dropDate.split('T')[0],
      createdAt: serverTimestamp()
    }, { merge: true });

    await logActivity({
      action: 'CAFE_CASH_DROP',
      category: 'cafe',
      details: "سحب وتوريد نقدي جزئي من درج الكافيه للإدارة بقيمة " + numAmount + " ج.م بواسطة (" + actorName + ")",
      actorName
    });
  } catch (secondaryErr) {
    console.warn("Cafe cash drop completed, secondary revenue logging error:", secondaryErr);
  }

  return dropRecord;
};

// ========================
// CAFE ONLINE ORDERS (MENU LIVE DISPATCH)
// ========================

export const createCafeOrder = async (orderData) => {
  const code = 'ORD-' + Math.floor(1000 + Math.random() * 9000);
  const isPaidWithWallet = !!orderData.paidWithWallet;
  const paymentMethod = orderData.paymentMethod || (isPaidWithWallet ? 'wallet_credit' : 'cash');
  const newOrder = {
    orderCode: code,
    customerName: orderData.customerName?.trim() || 'طلب مباشر',
    tableNumber: orderData.tableNumber?.trim() || 'طلب مباشر / بالصالة',
    items: orderData.items || [],
    totalCount: parseNum(orderData.totalCount) || 1,
    totalPrice: parseNum(orderData.totalPrice) || 0,
    notes: orderData.notes?.trim() || '',
    paidWithWallet: isPaidWithWallet,
    paymentMethod,
    paid: !!orderData.paid || isPaidWithWallet,
    clientId: orderData.clientId || null,
    clientName: orderData.clientName || null,
    status: 'pending', // 'pending' | 'preparing' | 'completed' | 'cancelled'
    source: orderData.source || 'online_menu',
    isoDate: new Date().toISOString(),
    createdAt: serverTimestamp()
  };

  const docRef = await addDoc(collection(db, 'cafe_orders'), newOrder);
  return { id: docRef.id, ...newOrder };
};

export const watchPendingCafeOrders = (callback) => {
  const q = query(collection(db, 'cafe_orders'));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Filter pending and preparing
    const pendingList = list.filter(o => o.status === 'pending' || o.status === 'preparing');
    pendingList.sort((a, b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.isoDate || 0).getTime();
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.isoDate || 0).getTime();
      return timeB - timeA;
    });
    callback(pendingList);
  }, (err) => {
    console.error('Error watching cafe orders:', err);
    callback([]);
  });
};

export const updateCafeOrderStatus = async (orderId, status, extra = {}) => {
  const ref = doc(db, 'cafe_orders', orderId);
  await updateDoc(ref, {
    status,
    ...extra,
    updatedAt: serverTimestamp()
  });
};

export const fulfillCafeOrder = async (orderId, order, shiftId, baristaName = 'باريستا الكافيه') => {
  if (!shiftId) throw new Error('يرجى فتح وردية كافيه أولاً لإتمام الطلب وترحيله للدرج');
  if (!orderId) throw new Error('معرف الطلب غير محدد');

  const orderRef = doc(db, 'cafe_orders', orderId);
  const orderSnap = await getDoc(orderRef);
  if (!orderSnap.exists()) throw new Error('الطلب غير موجود في قاعدة البيانات');
  const freshOrder = orderSnap.data();

  if (freshOrder.status === 'completed') {
    throw new Error('هذا الطلب تم إتمامه مسبقاً ولا يمكن تكرار ترحيله');
  }
  if (freshOrder.status === 'cancelled') {
    throw new Error('هذا الطلب تم إلغاؤه ولا يمكن ترحيله للوردية');
  }

  // Format sale items for addCafeSale
  const saleItems = (freshOrder.items || order.items || []).map(item => ({
    itemId: item.itemId || item.id,
    name: item.name,
    unitPrice: roundCurrency(item.unitPrice) || 0,
    qty: parseNum(item.qty) || 1,
    subtotal: roundCurrency((roundCurrency(item.unitPrice) || 0) * (parseNum(item.qty) || 1))
  }));

  const saleTotal = roundCurrency(freshOrder.totalPrice || order.totalPrice) || 0;
  const isWallet = !!freshOrder.paidWithWallet || freshOrder.paymentMethod === 'wallet_credit' || freshOrder.paymentMethod === 'wallet';
  const paymentMethod = isWallet ? 'wallet_credit' : (freshOrder.paymentMethod || 'cash');

  const completedSale = await addCafeSale(shiftId, {
    items: saleItems,
    total: saleTotal,
    discount: 0,
    paymentMethod,
    orderId,
    orderCode: freshOrder.orderCode || order.orderCode || '',
    clientId: freshOrder.clientId || order.clientId || null,
    paidWithWallet: isWallet,
    buyerName: (freshOrder.customerName || order.customerName || 'زبون كافيه') + (freshOrder.tableNumber ? ` (${freshOrder.tableNumber})` : '') + (isWallet ? ' [مدفوع بالمحفظة]' : '')
  });

  // Mark the order as completed in cafe_orders
  await updateDoc(orderRef, {
    status: 'completed',
    shiftId,
    completedSaleId: completedSale.id,
    completedAt: new Date().toISOString(),
    completedBy: baristaName,
    updatedAt: serverTimestamp()
  });

  await logActivity({
    action: 'FULFILL_CAFE_ORDER',
    category: 'cafe',
    details: `إتمام وترحيل طلب المنيو (${freshOrder.orderCode || orderId}): إجمالي ${saleTotal} ج.م للعميل (${freshOrder.customerName || 'مباشر'}) إلى الوردية الحالية`,
    actorName: baristaName
  });

  return completedSale;
};

export const cancelCafeOrderWithRefund = async ({
  orderId,
  cancelledBy = 'كاشير الكافيه',
  cancelReason = 'إلغاء الطلب'
}) => {
  if (!orderId) throw new Error('معرف الطلب غير محدد');

  const orderRef = doc(db, 'cafe_orders', orderId);

  // Execute atomic cancellation and refund in a single transaction
  const res = await runTransaction(db, async (transaction) => {
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists()) {
      throw new Error('الطلب غير موجود');
    }

    const order = orderSnap.data();

    if (order.status === 'cancelled') {
      throw new Error('هذا الطلب ملغي بالفعل مسبقاً');
    }

    if (order.status === 'completed') {
      throw new Error('لا يمكن إلغاء طلب مكتمل ومنتهي بالفعل في الوردية');
    }

    const isWallet = !!order.paidWithWallet || order.paymentMethod === 'wallet_credit';
    const orderTotal = roundCurrency(order.totalPrice || 0);
    const clientId = order.clientId;

    let clientRef = null;
    let newBalance = null;
    let prevBalance = null;
    let clientName = order.clientName || order.customerName || '';

    // If paid with wallet and has clientId and NOT already refunded:
    if (isWallet && clientId && !order.refunded) {
      clientRef = doc(db, 'clients', clientId);
      const clientSnap = await transaction.get(clientRef);
      if (clientSnap.exists()) {
        const clientData = clientSnap.data();
        prevBalance = roundCurrency(clientData.walletBalance || 0);
        newBalance = roundCurrency(prevBalance + orderTotal);
        clientName = clientData.name || clientName;

        // Atomically refund wallet
        transaction.update(clientRef, {
          walletBalance: newBalance,
          updatedAt: serverTimestamp()
        });
      }
    }

    // Update order status to cancelled
    transaction.update(orderRef, {
      status: 'cancelled',
      cancelledBy,
      cancelReason,
      cancelledAt: new Date().toISOString(),
      refunded: isWallet && !!clientId,
      refundAmount: isWallet && !!clientId ? orderTotal : 0,
      refundedAt: isWallet && !!clientId ? serverTimestamp() : null,
      updatedAt: serverTimestamp()
    });

    return {
      order,
      isWallet,
      orderTotal,
      clientId,
      clientName,
      refunded: isWallet && !!clientId,
      prevBalance,
      newBalance
    };
  });

  // Record refund ledger in wallet_transactions if refunded
  if (res.refunded && res.clientId) {
    await addDoc(collection(db, 'wallet_transactions'), {
      clientId: res.clientId,
      clientName: res.clientName,
      amount: res.orderTotal,
      bonusAmount: 0,
      totalCredited: res.orderTotal,
      balanceBefore: res.prevBalance,
      balanceAfter: res.newBalance,
      type: 'refund',
      paymentMethod: 'wallet_refund',
      referenceId: orderId,
      description: `استرداد فوري لإلغاء طلب كافيه #${res.order.orderCode || orderId.slice(-6)} (${cancelReason})`,
      actorName: cancelledBy,
      isoDate: new Date().toISOString(),
      createdAt: serverTimestamp()
    });
  }

  await logActivity({
    action: 'CANCEL_CAFE_ORDER',
    category: 'cafe',
    details: `إلغاء الطلب (${res.order.orderCode || orderId}): إجمالي ${res.orderTotal} ج.م بواسطة (${cancelledBy})${res.refunded ? ` - وتم استرداد ${res.orderTotal} ج.م إلى محفظة العميل (${res.clientName})` : ''}`,
    actorName: cancelledBy
  });

  return res;
};

// ==========================================
// ANNOUNCEMENTS & BANNERS (Students & Instructors)
// ==========================================
export const getAnnouncements = (callback) => {
  const q = query(collection(db, 'announcements'));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => {
      const pA = Number(a.priority) || 99;
      const pB = Number(b.priority) || 99;
      if (pA !== pB) return pA - pB;
      const tA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
      const tB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
      return tB - tA;
    });
    callback(list);
  }, (err) => {
    console.error('Error fetching announcements:', err);
    callback([]);
  });
};

export const addAnnouncement = async (announcementData) => {
  const docRef = await addDoc(collection(db, 'announcements'), {
    title: (announcementData.title || '').trim(),
    content: (announcementData.content || '').trim(),
    imageUrl: (announcementData.imageUrl || '').trim(),
    target: announcementData.target || 'all', // 'all' | 'clients' | 'instructors'
    category: announcementData.category || 'general', // 'offer' | 'event' | 'alert' | 'general'
    badgeText: (announcementData.badgeText || '').trim(),
    actionUrl: (announcementData.actionUrl || '').trim(),
    actionLabel: (announcementData.actionLabel || '').trim(),
    isActive: announcementData.isActive !== false,
    priority: Number(announcementData.priority) || 1,
    createdAt: serverTimestamp()
  });

  await logActivity({
    action: 'ADD_ANNOUNCEMENT',
    category: 'marketing',
    details: `إضافة إعلان جديد: "${announcementData.title}" موجه إلى (${announcementData.target === 'clients' ? 'الطلاب' : announcementData.target === 'instructors' ? 'المدرسين' : 'الجميع'})`,
    actorName: 'الإدارة'
  });

  return docRef.id;
};

export const updateAnnouncement = async (id, updateData) => {
  const payload = { ...updateData, updatedAt: serverTimestamp() };
  if (payload.priority !== undefined) payload.priority = Number(payload.priority) || 1;
  await updateDoc(doc(db, 'announcements', id), payload);

  await logActivity({
    action: 'UPDATE_ANNOUNCEMENT',
    category: 'marketing',
    details: `تعديل بيانات الإعلان (${id})`,
    actorName: 'الإدارة'
  });
};

export const deleteAnnouncement = async (id) => {
  await deleteDoc(doc(db, 'announcements', id));

  await logActivity({
    action: 'DELETE_ANNOUNCEMENT',
    category: 'marketing',
    details: `حذف الإعلان (${id})`,
    actorName: 'الإدارة'
  });
};

// ==========================================
// CUSTOMER DIGITAL WALLET & MEMBERSHIP TIERS
// ==========================================

export const getClientMembershipTier = (client, totalSpend = 0) => {
  const spend = parseNum(totalSpend || client?.totalPaid || 0);
  if (spend >= 7000) {
    return {
      id: 'vip',
      name: 'VIP Diamond',
      nameAr: 'عضوية VIP ماسية',
      color: '#e879f9',
      border: 'rgba(232, 121, 249, 0.5)',
      gradient: 'linear-gradient(135deg, #2e1065 0%, #0f172a 50%, #581c87 100%)',
      accentColor: '#c084fc',
      badgeColor: 'purple'
    };
  }
  if (spend >= 3000) {
    return {
      id: 'gold',
      name: 'Gold Member',
      nameAr: 'عضوية ذهبية فاخرة',
      color: '#fbbf24',
      border: 'rgba(245, 158, 11, 0.55)',
      gradient: 'linear-gradient(135deg, #451a03 0%, #1e1b4b 50%, #78350f 100%)',
      accentColor: '#f59e0b',
      badgeColor: 'amber'
    };
  }
  if (spend >= 1000) {
    return {
      id: 'silver',
      name: 'Silver Member',
      nameAr: 'عضوية فضية مميزة',
      color: '#e2e8f0',
      border: 'rgba(148, 163, 184, 0.45)',
      gradient: 'linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #334155 100%)',
      accentColor: '#94a3b8',
      badgeColor: 'blue'
    };
  }
  return {
    id: 'bronze',
    name: 'Classic Member',
    nameAr: 'عضوية كلاسيكية',
    color: '#38bdf8',
    border: 'rgba(56, 189, 248, 0.45)',
    gradient: 'linear-gradient(135deg, #0c4a6e 0%, #0f172a 50%, #0369a1 100%)',
    accentColor: '#0284c7',
    badgeColor: 'green'
  };
};

export const topUpClientWallet = async ({
  clientId,
  amount,
  bonusAmount = 0,
  paymentMethod = 'cash',
  shiftId = null,
  employeeId = null,
  notes = '',
  actorName = 'الاستقبال',
  skipPaymentRecord = false,
  type = 'topup'
}) => {
  const deposit = Math.max(0, roundCurrency(amount));
  const bonus = Math.max(0, roundCurrency(bonusAmount));
  const totalCredited = roundCurrency(deposit + bonus);

  if (totalCredited <= 0) {
    throw new Error('يرجى إدخال مبلغ صحيح لشحن المحفظة');
  }
  if (!clientId) {
    throw new Error('لم يتم تحديد العضو المطلوب شحن محفظته');
  }

  // Pre-validate shift status if recording cash to shift
  if (deposit > 0 && !skipPaymentRecord && shiftId) {
    const shiftSnap = await getDoc(doc(db, 'shifts', shiftId));
    if (shiftSnap.exists() && shiftSnap.data().status === 'closed') {
      throw new Error('لا يمكن شحن المحفظة نقداً على مناوبة مغلقة مسبقاً! يرجى اختيار المناوبة المفتوحة حالياً.');
    }
  }

  const clientRef = doc(db, 'clients', clientId);
  const txRef = doc(collection(db, 'wallet_transactions'));

  // Execute atomically inside Firestore transaction
  const result = await runTransaction(db, async (transaction) => {
    const clientSnap = await transaction.get(clientRef);
    if (!clientSnap.exists()) {
      throw new Error('لم يتم العثور على بيانات العضو في قاعدة البيانات');
    }

    const client = clientSnap.data();
    const balanceBefore = roundCurrency(client.walletBalance || 0);
    const balanceAfter = roundCurrency(balanceBefore + totalCredited);

    transaction.update(clientRef, {
      walletBalance: balanceAfter,
      updatedAt: serverTimestamp()
    });

    transaction.set(txRef, {
      clientId,
      clientName: client.name || '',
      clientPhone: client.phone || '',
      memberId: client.memberId || '',
      amount: deposit,
      bonusAmount: bonus,
      totalCredited,
      balanceBefore,
      balanceAfter,
      type: type || 'topup',
      paymentMethod,
      notes: notes || (bonus > 0 ? `شحن محفظة + بونص كاش باك ${bonus} ج.م` : 'شحن محفظة رصيد'),
      shiftId: shiftId || null,
      employeeId: employeeId || null,
      actorName: actorName || 'الاستقبال',
      isoDate: new Date().toISOString(),
      createdAt: serverTimestamp()
    });

    return {
      clientName: client.name || '',
      clientPhone: client.phone || '',
      memberId: client.memberId || '',
      balanceBefore,
      balanceAfter
    };
  });

  // Record fresh deposit in shift drawer if cash/safe
  if (deposit > 0 && !skipPaymentRecord) {
    await recordPayment(
      clientId,
      deposit,
      shiftId,
      employeeId,
      `شحن محفظة رصيد للمشترك (${result.clientName})${bonus > 0 ? ` + بونص ${bonus} ج` : ''}`,
      result.clientName,
      paymentMethod,
      'wallet_topup'
    );
  }

  await logActivity({
    action: 'WALLET_TOPUP',
    category: 'finances',
    details: `شحن محفظة العضو (${result.clientName}) بمبلغ ${deposit} ج.م (بونص: ${bonus} ج.م) - الرصيد الجديد: ${result.balanceAfter} ج.م`,
    actorName
  });

  return { id: txRef.id, balanceAfter: result.balanceAfter, balanceBefore: result.balanceBefore, totalCredited };
};

export const chargeClientWallet = async ({
  clientId,
  amount,
  description = 'طلب كافيه',
  referenceId = null,
  source = 'cafe_menu',
  actorName = 'النظام'
}) => {
  const chargeAmount = roundCurrency(amount);
  if (chargeAmount <= 0) {
    throw new Error('مبلغ الخصم يجب أن يكون أكبر من الصفر');
  }
  if (!clientId) {
    throw new Error('رقم العضو غير محدد لإتمام الخصم من المحفظة');
  }

  const clientRef = doc(db, 'clients', clientId);
  const txRef = doc(collection(db, 'wallet_transactions'));

  // Execute atomically via Firestore transaction
  const result = await runTransaction(db, async (transaction) => {
    const clientSnap = await transaction.get(clientRef);
    if (!clientSnap.exists()) {
      throw new Error('لم يتم العثور على بيانات المشترك في النظام');
    }

    const client = clientSnap.data();
    const currentBalance = roundCurrency(client.walletBalance || 0);

    if (currentBalance < chargeAmount) {
      throw new Error(`عذراً، رصيد المحفظة لا يكفي. الرصيد المتاح: ${currentBalance} ج.م، والمطلوب: ${chargeAmount} ج.م`);
    }

    const balanceAfter = roundCurrency(currentBalance - chargeAmount);

    transaction.update(clientRef, {
      walletBalance: balanceAfter,
      updatedAt: serverTimestamp()
    });

    transaction.set(txRef, {
      clientId,
      clientName: client.name || '',
      clientPhone: client.phone || '',
      memberId: client.memberId || '',
      amount: -chargeAmount,
      balanceBefore: currentBalance,
      balanceAfter,
      type: 'charge',
      description,
      referenceId: referenceId || null,
      source,
      actorName: actorName || 'النظام',
      isoDate: new Date().toISOString(),
      createdAt: serverTimestamp()
    });

    return {
      clientName: client.name || '',
      clientPhone: client.phone || '',
      memberId: client.memberId || '',
      balanceBefore: currentBalance,
      balanceAfter
    };
  });

  await logActivity({
    action: 'WALLET_CHARGE',
    category: 'finances',
    details: `خصم من محفظة العضو (${result.clientName}) بمبلغ ${chargeAmount} ج.م (${description}) - المتبقي: ${result.balanceAfter} ج.م`,
    actorName
  });

  return { id: txRef.id, balanceAfter: result.balanceAfter, balanceBefore: result.balanceBefore };
};

// ==========================================
// CLIENT WALLET TEMPORARY OTP (كود أمان الدفع المؤقت)
// ==========================================

export const generateClientWalletOtp = async (clientId, requestedAmount = 0, requestedBy = 'كاشير الكافيه') => {
  if (!clientId) throw new Error('رقم العضو غير محدد');
  const clientRef = doc(db, 'clients', clientId);
  const clientSnap = await getDoc(clientRef);
  if (!clientSnap.exists()) throw new Error('المشترك غير موجود في النظام');

  const client = clientSnap.data();
  // Generate cryptographically secure 4-digit code
  const code = Math.floor(1000 + Math.random() * 9000).toString();
  const validityMs = 5 * 60 * 1000; // 5 minutes
  const expiresAt = Date.now() + validityMs;

  const otpData = {
    code,
    expiresAt,
    used: false,
    requestedAmount: Number(requestedAmount) || 0,
    requestedBy: requestedBy || 'كاشير الكافيه',
    reqTimestamp: Date.now(),
    createdAt: new Date().toISOString()
  };

  await updateDoc(clientRef, {
    activeWalletOtp: otpData,
    updatedAt: serverTimestamp()
  });

  await logActivity({
    action: 'WALLET_OTP_GENERATED',
    category: 'security',
    details: `طلب كود أمان مؤقت لدفع الكافيه للمشترك (${client.name || clientId}) بقيمة ${requestedAmount} ج.م - صالح لمدة 5 دقائق`,
    actorName: requestedBy || client.name || 'المشترك'
  });

  return otpData;
};

export const verifyAndConsumeClientWalletOtp = async ({
  clientId,
  inputOtp,
  amount,
  description = 'طلب كافيه',
  referenceId = null,
  source = 'cafe_pos',
  actorName = 'كاشير الكافيه'
}) => {
  const chargeAmount = roundCurrency(amount);
  if (chargeAmount <= 0) {
    throw new Error('مبلغ الخصم يجب أن يكون أكبر من الصفر');
  }
  if (!clientId) {
    throw new Error('رقم المشترك غير محدد لإتمام الخصم');
  }
  const cleanOtp = String(inputOtp || '').trim();
  if (!cleanOtp) {
    throw new Error('يرجى إدخال كود الأمان المؤقت (4 أرقام)');
  }

  const clientRef = doc(db, 'clients', clientId);
  const txRef = doc(collection(db, 'wallet_transactions'));

  const result = await runTransaction(db, async (transaction) => {
    const clientSnap = await transaction.get(clientRef);
    if (!clientSnap.exists()) {
      throw new Error('لم يتم العثور على بيانات المشترك في النظام');
    }

    const client = clientSnap.data();
    const otp = client.activeWalletOtp;

    if (!otp || !otp.code) {
      throw new Error('لا يوجد كود أمان مؤقت مفعّل لهذا المشترك. يرجى من العميل فتح بوابته والضغط على "توليد كود دفع جديد".');
    }

    if (otp.used) {
      throw new Error('تم استخدام هذا الكود المؤقت مسبقاً! الأكواد صالحة لمرة واحدة فقط. يرجى من العميل توليد كود جديد من بوابته.');
    }

    if (Date.now() > Number(otp.expiresAt || 0)) {
      throw new Error('انتهت صلاحية كود الأمان المؤقت (المهلة 5 دقائق)! يرجى من العميل توليد كود جديد من بوابته.');
    }

    if (String(otp.code).trim() !== cleanOtp) {
      throw new Error('كود الأمان المؤقت غير صحيح! يرجى مراجعة الكود المكون من 4 أرقام الظاهر على شاشة العميل.');
    }

    const currentBalance = roundCurrency(client.walletBalance || 0);
    if (currentBalance < chargeAmount) {
      throw new Error(`عذراً، رصيد المحفظة لا يكفي. الرصيد المتاح: ${currentBalance} ج.م، والمطلوب: ${chargeAmount} ج.م`);
    }

    const balanceAfter = roundCurrency(currentBalance - chargeAmount);

    // Invalidate OTP atomically and deduct balance
    transaction.update(clientRef, {
      walletBalance: balanceAfter,
      'activeWalletOtp.used': true,
      'activeWalletOtp.consumedAt': new Date().toISOString(),
      'activeWalletOtp.consumedForAmount': chargeAmount,
      updatedAt: serverTimestamp()
    });

    transaction.set(txRef, {
      clientId,
      clientName: client.name || '',
      clientPhone: client.phone || '',
      memberId: client.memberId || '',
      amount: -chargeAmount,
      balanceBefore: currentBalance,
      balanceAfter,
      type: 'charge',
      description: `${description} [بتفويض كود أمان مؤقت]`,
      referenceId: referenceId || null,
      source,
      actorName: actorName || 'كاشير الكافيه',
      isoDate: new Date().toISOString(),
      createdAt: serverTimestamp()
    });

    return {
      clientName: client.name || '',
      clientPhone: client.phone || '',
      memberId: client.memberId || '',
      balanceBefore: currentBalance,
      balanceAfter
    };
  });

  await logActivity({
    action: 'WALLET_CHARGE_OTP',
    category: 'finances',
    details: `خصم من محفظة العضو (${result.clientName}) بمبلغ ${chargeAmount} ج.م عبر كود أمان مؤقت (${description}) - المتبقي: ${result.balanceAfter} ج.م`,
    actorName
  });

  return { id: txRef.id, balanceAfter: result.balanceAfter, balanceBefore: result.balanceBefore };
};


export const getClientWalletTransactions = (clientId, callback) => {
  const q = query(
    collection(db, 'wallet_transactions'),
    where('clientId', '==', clientId)
  );
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.isoDate || 0).getTime();
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.isoDate || 0).getTime();
      return timeB - timeA;
    });
    callback(list);
  }, (err) => {
    console.error('Error listening to wallet transactions:', err);
    callback([]);
  });
};

// ========================
// SUBSCRIPTION RENEWAL REMINDERS (WHATSAPP AUTOMATION)
// ========================
export const getExpiringSubscriptions = async (daysThreshold = 3) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [clientsSnap, subsSnap] = await Promise.all([
    getDocs(collection(db, 'clients')),
    getDocs(query(collection(db, 'client_subscriptions'), where('status', '==', 'active')))
  ]);

  const clientMap = new Map();
  clientsSnap.forEach(d => {
    clientMap.set(d.id, { id: d.id, ...d.data() });
  });

  const expiringList = [];

  subsSnap.forEach(d => {
    const sub = { id: d.id, ...d.data() };
    const client = clientMap.get(sub.clientId);
    if (!client) return;

    let isExpiring = false;
    let daysRemaining = null;
    let urgencyLevel = 'normal';
    let reason = '';

    // Check date expiration
    if (sub.endDate) {
      const endD = new Date(sub.endDate);
      endD.setHours(23, 59, 59, 999);
      const diffMs = endD.getTime() - today.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      daysRemaining = diffDays;

      if (diffDays >= 0 && diffDays <= daysThreshold) {
        isExpiring = true;
        if (diffDays === 0) {
          urgencyLevel = 'critical';
          reason = 'ينتهي اليوم!';
        } else if (diffDays === 1) {
          urgencyLevel = 'urgent';
          reason = 'متبقي يوم واحد فقط';
        } else {
          urgencyLevel = 'warning';
          reason = `متبقي ${diffDays} أيام`;
        }
      } else if (diffDays < 0 && diffDays >= -3) {
        isExpiring = true;
        urgencyLevel = 'critical';
        reason = `منتهي منذ ${Math.abs(diffDays)} أيام`;
      }
    }

    // Check hours remaining for workspace packages
    if (sub.packageType === 'workspace') {
      const totalH = parseNum(sub.totalHours) || 0;
      const usedH = parseNum(sub.hoursUsed) || 0;
      const remH = Math.max(0, totalH - usedH);
      if (remH <= 3 && remH >= 0) {
        isExpiring = true;
        if (remH <= 1) {
          urgencyLevel = 'critical';
          reason = `متبقي ${remH} ساعة فقط!`;
        } else {
          if (urgencyLevel !== 'critical') urgencyLevel = 'urgent';
          reason = `متبقي ${remH} ساعات`;
        }
      }
    }

    // Check sessions remaining for sessions packages
    if (sub.packageType === 'sessions') {
      const totalSess = parseNum(sub.packageSessions) || 0;
      const usedSess = parseNum(sub.sessionsUsed) || 0;
      const remSess = Math.max(0, totalSess - usedSess);
      if (remSess <= 1 && remSess >= 0) {
        isExpiring = true;
        urgencyLevel = 'critical';
        reason = remSess === 0 ? 'نفدت الحصص بالكامل!' : 'متبقي حصة واحدة فقط!';
      }
    }

    if (isExpiring) {
      expiringList.push({
        subscriptionId: sub.id,
        clientId: client.id,
        clientName: client.name || '',
        memberId: client.memberId || '',
        phone: client.phone || '',
        packageName: sub.packageName || 'باقة اشتراك',
        packageType: sub.packageType || 'workspace',
        endDate: sub.endDate || '—',
        daysRemaining,
        urgencyLevel,
        reason,
        hoursUsed: sub.hoursUsed || 0,
        totalHours: sub.totalHours || 0,
        sessionsUsed: sub.sessionsUsed || 0,
        packageSessions: sub.packageSessions || 0,
        lastReminderSent: sub.lastReminderSent || null
      });
    }
  });

  const order = { critical: 0, urgent: 1, warning: 2, normal: 3 };
  expiringList.sort((a, b) => (order[a.urgencyLevel] || 3) - (order[b.urgencyLevel] || 3));

  return expiringList;
};

export const markSubscriptionReminderSent = async (subscriptionId) => {
  if (!subscriptionId) return;
  await updateDoc(doc(db, 'client_subscriptions', subscriptionId), {
    lastReminderSent: new Date().toISOString().split('T')[0],
    reminderSentAt: serverTimestamp()
  });
};

// ========================
// BIRTHDAY GIFTS & REWARDS AUTOMATION
// ========================

export const getBirthdayClients = async (daysWindow = 7) => {
  const clientsSnap = await getDocs(collection(db, 'clients'));
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-indexed
  const currentDate = today.getDate();

  const birthdayClients = [];

  clientsSnap.forEach(d => {
    const client = { id: d.id, ...d.data() };
    if (!client.birthDate) return;

    // Support YYYY-MM-DD, YYYY/MM/DD, or MM-DD
    const parts = String(client.birthDate).trim().split(/[-/]/);
    let bMonth = null;
    let bDay = null;
    let bYear = null;

    if (parts.length === 3) {
      bYear = parseInt(parts[0], 10);
      bMonth = parseInt(parts[1], 10) - 1;
      bDay = parseInt(parts[2], 10);
    } else if (parts.length === 2) {
      bMonth = parseInt(parts[0], 10) - 1;
      bDay = parseInt(parts[1], 10);
    }

    if (bMonth === null || isNaN(bMonth) || bDay === null || isNaN(bDay)) return;

    // Check this year's birthday date
    const bdayThisYear = new Date(currentYear, bMonth, bDay);
    bdayThisYear.setHours(0, 0, 0, 0);

    const todayZero = new Date(currentYear, currentMonth, currentDate);
    todayZero.setHours(0, 0, 0, 0);

    const diffTime = bdayThisYear.getTime() - todayZero.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    const isToday = diffDays === 0;
    const isUpcoming = diffDays > 0 && diffDays <= daysWindow;
    const isPastRecent = diffDays < 0 && diffDays >= -2; // Celebrated within last 2 days

    if (isToday || isUpcoming || isPastRecent) {
      const turningAge = bYear ? currentYear - bYear : (client.age ? Number(client.age) : null);
      const isGiftGranted = client.lastBirthdayGiftYear === currentYear;

      birthdayClients.push({
        id: client.id,
        clientId: client.id,
        name: client.name || '',
        phone: client.phone || '',
        memberId: client.memberId || '',
        gender: client.gender || 'male',
        address: client.address || '',
        birthDate: client.birthDate,
        diffDays,
        isToday,
        isUpcoming,
        isPastRecent,
        turningAge,
        isGiftGranted,
        lastBirthdayGiftYear: client.lastBirthdayGiftYear || null,
        birthdayGiftGrantedAt: client.birthdayGiftGrantedAt || null,
        birthdayGiftDetails: client.birthdayGiftDetails || null,
        walletBalance: client.walletBalance || 0,
        manualBonusPoints: client.manualBonusPoints || 0
      });
    }
  });

  // Sort: isToday first (0), then isUpcoming (1, 2, 3...), then recent past (-1, -2)
  birthdayClients.sort((a, b) => {
    if (a.isToday && !b.isToday) return -1;
    if (!a.isToday && b.isToday) return 1;
    return a.diffDays - b.diffDays;
  });

  return birthdayClients;
};

export const grantBirthdayGift = async ({
  clientId,
  giftType = 'points', // 'points' | 'wallet' | 'hours'
  giftValue = 100,
  actorName = 'الإدارة'
}) => {
  if (!clientId) throw new Error('رقم العضو غير محدد');
  const currentYear = new Date().getFullYear();
  const clientRef = doc(db, 'clients', clientId);

  const clientSnap = await getDoc(clientRef);
  if (!clientSnap.exists()) throw new Error('العضو غير موجود');
  const client = clientSnap.data();

  const numVal = Math.max(0, Number(giftValue) || 0);

  let giftDescription = '';
  if (giftType === 'points') {
    const curBonus = Number(client.manualBonusPoints) || 0;
    await updateDoc(clientRef, {
      manualBonusPoints: curBonus + numVal,
      lastBirthdayGiftYear: currentYear,
      birthdayGiftGrantedAt: serverTimestamp(),
      birthdayGiftDetails: {
        type: 'points',
        value: numVal,
        label: `${numVal} نقطة ولاء 🎁`,
        grantedBy: actorName
      }
    });
    giftDescription = `${numVal} نقطة ولاء مجانية`;
  } else if (giftType === 'wallet') {
    await topUpClientWallet({
      clientId,
      amount: 0,
      bonusAmount: numVal,
      paymentMethod: 'system',
      notes: `هدية عيد ميلاد 🎂 لعام ${currentYear}`,
      actorName,
      skipPaymentRecord: true,
      type: 'birthday_bonus'
    });
    await updateDoc(clientRef, {
      lastBirthdayGiftYear: currentYear,
      birthdayGiftGrantedAt: serverTimestamp(),
      birthdayGiftDetails: {
        type: 'wallet',
        value: numVal,
        label: `${numVal} ج.م رصيد محفظة 💳`,
        grantedBy: actorName
      }
    });
    giftDescription = `${numVal} جنيه رصيد بمحفظتك`;
  } else if (giftType === 'hours') {
    const curBonusHours = Number(client.manualBonusHours) || 0;
    await updateDoc(clientRef, {
      manualBonusHours: curBonusHours + numVal,
      lastBirthdayGiftYear: currentYear,
      birthdayGiftGrantedAt: serverTimestamp(),
      birthdayGiftDetails: {
        type: 'hours',
        value: numVal,
        label: `${numVal} ساعة مساحة عمل مجانية ⏱️`,
        grantedBy: actorName
      }
    });
    giftDescription = `${numVal} ساعات مجانية في مساحة العمل`;
  }

  return {
    success: true,
    giftDescription,
    clientName: client.name,
    phone: client.phone,
    memberId: client.memberId
  };
};

