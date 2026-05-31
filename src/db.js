import {
  doc, setDoc, getDoc, runTransaction,
  collection, addDoc, query, where, getDocs,
  updateDoc, arrayUnion, arrayRemove, deleteDoc, onSnapshot, orderBy, serverTimestamp
} from 'firebase/firestore';
import { db } from './config.js';

// ---------- CP code generation ----------
function generateCPCode() {
  const digits = '0123456789';
  let code = 'CP-';
  for (let i = 0; i < 12; i++) code += digits.charAt(Math.floor(Math.random() * 10));
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
    online: true,
    lastSeen: new Date()
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
  return getUserProfile(codeSnap.data().uid);
}

// ---------- Change CP Code (once per month) ----------
export async function changeUserCpCode(uid, newCpCode) {
  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) throw new Error('User not found');

  const userData = userSnap.data();
  const lastChanged = userData.cpCodeLastChanged?.toDate() || null;

  if (lastChanged) {
    const daysSince = (Date.now() - lastChanged.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 30) {
      const remaining = Math.ceil(30 - daysSince);
      throw new Error(`You can change your CP code again in ${remaining} day(s).`);
    }
  }

  if (!/^CP-\d{12}$/.test(newCpCode)) {
    throw new Error('Invalid CP code format (must be CP-XXXXXXXXXXXX)');
  }

  const codeDoc = await getDoc(doc(db, 'cpCodes', newCpCode));
  if (codeDoc.exists()) {
    throw new Error('This CP code is already taken.');
  }

  await runTransaction(db, async (transaction) => {
    const oldCodeDoc = doc(db, 'cpCodes', userData.cpCode);
    transaction.delete(oldCodeDoc);

    transaction.set(doc(db, 'cpCodes', newCpCode), {
      uid: uid,
      createdAt: new Date()
    });

    transaction.update(userRef, {
      cpCode: newCpCode,
      cpCodeLastChanged: new Date()
    });
  });

  return newCpCode;
}

// ---------- Friend Requests ----------
export async function sendFriendRequest(fromUid, toCpCode) {
  const toUser = await getUserByCpCode(toCpCode);
  if (!toUser) throw new Error('User not found');
  if (fromUid === toUser.uid) throw new Error('Cannot request yourself');

  const ids = [fromUid, toUser.uid].sort();
  const chatDoc = await getDoc(doc(db, 'chats', `${ids[0]}_${ids[1]}`));
  if (chatDoc.exists()) throw new Error('Already friends');

  const existing = await getDocs(query(
    collection(db, 'friendRequests'),
    where('from', '==', fromUid),
    where('to', '==', toUser.uid),
    where('status', '==', 'pending')
  ));
  if (!existing.empty) throw new Error('Request already sent');

  await addDoc(collection(db, 'friendRequests'), {
    from: fromUid,
    to: toUser.uid,
    status: 'pending',
    createdAt: new Date()
  });
}

export async function acceptFriendRequest(requestId, accepterUid) {
  const requestRef = doc(db, 'friendRequests', requestId);
  const snap = await getDoc(requestRef);
  if (!snap.exists()) throw new Error('Request not found');
  const data = snap.data();
  if (data.to !== accepterUid) throw new Error('Not for you');
  if (data.status !== 'pending') throw new Error('Already handled');

  const ids = [data.from, data.to].sort();
  const chatId = `${ids[0]}_${ids[1]}`;
  await setDoc(doc(db, 'chats', chatId), {
    participants: ids,
    createdAt: new Date(),
    lastMessage: ''
  });
  await updateDoc(requestRef, { status: 'accepted' });
  return { chatId, friendId: data.from };
}

export async function declineFriendRequest(requestId, declinerUid) {
  const requestRef = doc(db, 'friendRequests', requestId);
  const snap = await getDoc(requestRef);
  if (!snap.exists() || snap.data().to !== declinerUid) return;
  await updateDoc(requestRef, { status: 'declined' });
}

export function listenFriendRequests(uid, callback) {
  const q = query(
    collection(db, 'friendRequests'),
    where('to', '==', uid),
    where('status', '==', 'pending')
  );
  return onSnapshot(q, snapshot => {
    const requests = [];
    snapshot.forEach(doc => requests.push({ id: doc.id, ...doc.data() }));
    callback(requests);
  });
}

// ---------- Online Presence ----------
export async function setUserOnline(uid, online) {
  await updateDoc(doc(db, 'users', uid), {
    online,
    lastSeen: new Date()
  });
}

export function listenUserPresence(uid, callback) {
  return onSnapshot(doc(db, 'users', uid), snap => {
    if (snap.exists()) callback(snap.data());
  });
}

// ---------- Typing ----------
export async function setChatTyping(chatId, uid, isTyping) {
  const ref = doc(db, 'chats', chatId, 'typing', uid);
  if (isTyping) await setDoc(ref, { uid, timestamp: new Date() });
  else await deleteDoc(ref);
}

export function listenChatTyping(chatId, callback) {
  return onSnapshot(collection(db, 'chats', chatId, 'typing'), snapshot => {
    const uids = [];
    snapshot.forEach(d => uids.push(d.data().uid));
    callback(uids);
  });
}

export async function setRoomTyping(roomId, uid, isTyping) {
  const ref = doc(db, 'rooms', roomId, 'typing', uid);
  if (isTyping) await setDoc(ref, { uid, timestamp: new Date() });
  else await deleteDoc(ref);
}

export function listenRoomTyping(roomId, callback) {
  return onSnapshot(collection(db, 'rooms', roomId, 'typing'), snapshot => {
    const uids = [];
    snapshot.forEach(d => uids.push(d.data().uid));
    callback(uids);
  });
}

// ---------- Room Helpers ----------
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'RC-';
  for (let i = 0; i < 5; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
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
    if (btoa(password) !== roomData.passwordHash) throw new Error('Incorrect password');
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

export async function updateRoom(roomId, updates) {
  await updateDoc(doc(db, 'rooms', roomId), updates);
}

export async function removeMember(roomId, uid) {
  await updateDoc(doc(db, 'rooms', roomId), { members: arrayRemove(uid) });
}

export async function deleteRoom(roomId) {
  await deleteDoc(doc(db, 'rooms', roomId));
}

// ---------- Message Reactions ----------
export async function addReaction(messagePath, uid, emoji) {
  const ref = doc(db, messagePath);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const reactions = snap.data().reactions || {};
  const users = reactions[emoji] || [];
  if (!users.includes(uid)) users.push(uid);
  reactions[emoji] = users;
  await updateDoc(ref, { reactions });
}

// Re-export db for direct use in components
export { db };
