import bcrypt from 'bcryptjs';
import { db } from '../../firebase';
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, serverTimestamp, limit
} from 'firebase/firestore';

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
  const rawPassword = String(password || '');
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
    delete user.passwordHash;
    return user;
  };

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
          throw new Error('??? ?????? ???? ?????? ?? ???? ????? ??????');
        }
        const valid = await verifyPassword(rawPassword, user.passwordHash);
        if (valid) return await attachLinkedEmployee(user);
      }
    } catch (e) {
      if (e.message?.includes('????')) throw e;
    }
  }

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
          throw new Error('??? ?????? ???? ?????? ?? ???? ????? ??????');
        }
        const valid = await verifyPassword(rawPassword, u.passwordHash);
        if (valid) return await attachLinkedEmployee(u);
      }
    }
  } catch (e) {
    if (e.message?.includes('????')) throw e;
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
