import {
  doc, setDoc, getDoc, runTransaction,
  collection, addDoc, query, where, getDocs,
  updateDoc, arrayUnion, arrayRemove, deleteDoc
} from 'firebase/firestore';
import { db } from './config.js';

// ---------- CP code generation ----------
function generateCPCode() {
  const digits = '0123456789';
  let code = 'CP-';
  for (let i = 0; i < 12; i++) {
    code += digits.charAt(Math.floor(Math.random() * 10));
  }
  return code;
}

export async function createUserProfile(user) {
  const userDocRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userDocRef);
  if (userSnap.exists()) return userSnap.data();

  let cpCode = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    cpCode = generateCPCode();
    const codeDocRef = doc(db, 'cpCodes', cpCode);
    try {
      await runTransaction(db, async (transaction) => {
        const codeSnap = await transaction.get(codeDocRef);
        if (codeSnap.exists()) throw new Error('collision');
        transaction.set(codeDocRef, { uid: user.uid, createdAt: new Date() });
      });
      break;
    } catch (err) {
      if (err.message !== 'collision') throw err;
      if (attempt === 9) throw new Error('Could not generate unique CP code');
    }
  }

  const userData = {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || '',
    photoURL: user.photoURL || '',
    cpCode,
    createdAt: new Date(),
  };

  await setDoc(userDocRef, userData);
  return userData;
}

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

export async function getUserByCpCode(cpCode) {
  const codeSnap = await getDoc(doc(db, 'cpCodes', cpCode));
  if (!codeSnap.exists()) return null;
  const { uid } = codeSnap.data();
  return getUserProfile(uid);
}

// ---------- Room helpers ----------
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'RC-';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function createRoom({ name, description, isPublic, password }) {
  const auth = (await import('firebase/auth')).getAuth();
  const user = auth.currentUser;
  if (!user) throw new Error('Not logged in');

  let roomCode = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    roomCode = generateRoomCode();
    const codeDoc = await getDoc(doc(db, 'roomCodes', roomCode));
    if (!codeDoc.exists()) break;
    if (attempt === 9) throw new Error('Could not generate unique room code');
  }

  const roomData = {
    name,
    description: description || '',
    isPublic: !!isPublic,
    passwordHash: password ? btoa(password) : null,
    adminUID: user.uid,
    members: [user.uid],
    roomCode,
    createdAt: new Date(),
  };

  const roomRef = doc(collection(db, 'rooms'));
  await setDoc(roomRef, roomData);
  await setDoc(doc(db, 'roomCodes', roomCode), { roomId: roomRef.id });

  return { id: roomRef.id, ...roomData };
}

export async function joinRoomByCode(roomCode, password = '') {
  const auth = (await import('firebase/auth')).getAuth();
  const user = auth.currentUser;
  if (!user) throw new Error('Not logged in');

  const codeDoc = await getDoc(doc(db, 'roomCodes', roomCode));
  if (!codeDoc.exists()) throw new Error('Room not found');

  const roomId = codeDoc.data().roomId;
  const roomRef = doc(db, 'rooms', roomId);
  const roomSnap = await getDoc(roomRef);
  if (!roomSnap.exists()) throw new Error('Room does not exist');

  const roomData = roomSnap.data();
  if (roomData.members.includes(user.uid)) {
    return { id: roomId, ...roomData };
  }

  if (!roomData.isPublic) {
    if (!password) throw new Error('Password required');
    const valid = btoa(password) === roomData.passwordHash;
    if (!valid) throw new Error('Incorrect password');
  }

  await updateDoc(roomRef, { members: arrayUnion(user.uid) });
  return { id: roomId, ...roomData, members: [...roomData.members, user.uid] };
}

export async function getUserRooms(uid) {
  const q = query(collection(db, 'rooms'), where('members', 'array-contains', uid));
  const snapshot = await getDocs(q);
  const rooms = [];
  snapshot.forEach(d => rooms.push({ id: d.id, ...d.data() }));
  return rooms;
}

export async function getPublicRooms() {
  const q = query(collection(db, 'rooms'), where('isPublic', '==', true));
  const snapshot = await getDocs(q);
  const rooms = [];
  snapshot.forEach(d => rooms.push({ id: d.id, ...d.data() }));
  return rooms;
}

export async function searchRoomsByName(queryText) {
  const publicRooms = await getPublicRooms();
  if (!queryText) return publicRooms;
  const lower = queryText.toLowerCase();
  return publicRooms.filter(r => r.name.toLowerCase().includes(lower));
}

export async function updateRoom(roomId, updates) {
  const roomRef = doc(db, 'rooms', roomId);
  await updateDoc(roomRef, updates);
}

export async function removeMember(roomId, uid) {
  const roomRef = doc(db, 'rooms', roomId);
  await updateDoc(roomRef, { members: arrayRemove(uid) });
}

export async function deleteRoom(roomId) {
  const roomRef = doc(db, 'rooms', roomId);
  await deleteDoc(roomRef);
}

// ⬇️ ADD THIS EXPORT – it allows DuoChat and Rooms to import db directly
export { db };
