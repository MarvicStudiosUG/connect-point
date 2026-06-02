import {
  doc, setDoc, getDoc, runTransaction,
  collection, addDoc, query, where, getDocs,
  updateDoc, arrayUnion, arrayRemove, deleteDoc, onSnapshot, orderBy, serverTimestamp
} from 'firebase/firestore';
import { db } from './config.js';

function generateCPCode() {
  const digits = '0123456789';
  let code = 'CP-';
  for (let i = 0; i < 10; i++) code += digits.charAt(Math.floor(Math.random() * 10));
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
    lastSeen: new Date(),
    status: '',
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
  if (!/^CP-\d{10}$/.test(newCpCode)) throw new Error('Invalid CP code format (must be CP-XXXXXXXXXX)');
  const codeDoc = await getDoc(doc(db, 'cpCodes', newCpCode));
  if (codeDoc.exists()) throw new Error('This CP code is already taken.');
  await runTransaction(db, async (transaction) => {
    const oldCodeDoc = doc(db, 'cpCodes', userData.cpCode);
    transaction.delete(oldCodeDoc);
    transaction.set(doc(db, 'cpCodes', newCpCode), { uid, createdAt: new Date() });
    transaction.update(userRef, { cpCode: newCpCode, cpCodeLastChanged: new Date() });
  });
  return newCpCode;
}

export async function sendFriendRequest(fromUid, toCpCode) {
  const toUser = await getUserByCpCode(toCpCode);
  if (!toUser) throw new Error('User not found');
  if (fromUid === toUser.uid) throw new Error('Cannot request yourself');
  const ids = [fromUid, toUser.uid].sort();
  const chatDoc = await getDoc(doc(db, 'chats', `${ids[0]}_${ids[1]}`));
  if (chatDoc.exists()) throw new Error('Already friends');
  const existing = await getDocs(query(collection(db, 'friendRequests'), where('from', '==', fromUid), where('to', '==', toUser.uid), where('status', '==', 'pending')));
  if (!existing.empty) throw new Error('Request already sent');
  await addDoc(collection(db, 'friendRequests'), { from: fromUid, to: toUser.uid, status: 'pending', createdAt: new Date() });
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
  await setDoc(doc(db, 'chats', chatId), { participants: ids, createdAt: new Date(), lastMessage: '' });
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
  const q = query(collection(db, 'friendRequests'), where('to', '==', uid), where('status', '==', 'pending'));
  return onSnapshot(q, snapshot => {
    const requests = [];
    snapshot.forEach(doc => requests.push({ id: doc.id, ...doc.data() }));
    callback(requests);
  });
}

export async function setUserOnline(uid, online) {
  await updateDoc(doc(db, 'users', uid), { online, lastSeen: new Date() });
}

export function listenUserPresence(uid, callback) {
  return onSnapshot(doc(db, 'users', uid), snap => {
    if (snap.exists()) callback(snap.data());
  });
}

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
  if (roomData.members.includes(user.uid)) return { id: roomId, ...roomData };
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

export async function addReaction(messagePath, uid, reactionType) {
  const ref = doc(db, messagePath);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const reactions = snap.data().reactions || {};
  if (!reactions[reactionType]) reactions[reactionType] = [];
  if (!reactions[reactionType].includes(uid)) reactions[reactionType].push(uid);
  await updateDoc(ref, { reactions });
}

export async function deleteMessage(path, uid) {
  const ref = doc(db, path);
  const snap = await getDoc(ref);
  if (snap.exists() && snap.data().senderId === uid) await deleteDoc(ref);
}

export async function unfriend(uid1, uid2) {
  const ids = [uid1, uid2].sort();
  const chatId = `${ids[0]}_${ids[1]}`;
  await deleteDoc(doc(db, 'chats', chatId));
}

export async function searchUsersByName(queryText, currentUid) {
  if (!queryText || queryText.length < 2) return [];
  const q = query(collection(db, 'users'), where('displayName', '>=', queryText), where('displayName', '<=', queryText + '\uf8ff'));
  const snapshot = await getDocs(q);
  const results = [];
  snapshot.forEach(d => { if (d.id !== currentUid) results.push({ uid: d.id, ...d.data() }); });
  return results;
}

export { db };

// ---------- Profile Picture (base64 in Firestore) ----------
export async function updateProfilePicture(uid, base64Image) {
  if (!base64Image || !uid) return;
  await updateDoc(doc(db, 'users', uid), { photoURL: base64Image });
}

// ---------- Message Seen / Delivered ----------
export async function markMessageAsSeen(chatId, messageId, uid) {
  const msgRef = doc(db, 'chats', chatId, 'messages', messageId);
  await updateDoc(msgRef, { seen: true, seenBy: arrayUnion(uid) });
}

export async function markRoomMessageAsSeen(roomId, messageId, uid) {
  const msgRef = doc(db, 'rooms', roomId, 'messages', messageId);
  await updateDoc(msgRef, { seen: true, seenBy: arrayUnion(uid) });
}

// ---------- Vault (secure notes) ----------
export async function getVaultNotes(uid) {
  const notesRef = collection(db, 'users', uid, 'vault');
  const q = query(notesRef, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  const notes = [];
  snapshot.forEach(d => notes.push({ id: d.id, ...d.data() }));
  return notes;
}

export async function createVaultNote(uid, title, content) {
  const notesRef = collection(db, 'users', uid, 'vault');
  await addDoc(notesRef, {
    title,
    content,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function updateVaultNote(uid, noteId, updates) {
  const noteRef = doc(db, 'users', uid, 'vault', noteId);
  await updateDoc(noteRef, { ...updates, updatedAt: serverTimestamp() });
}

export async function deleteVaultNote(uid, noteId) {
  const noteRef = doc(db, 'users', uid, 'vault', noteId);
  await deleteDoc(noteRef);
}

// ---------- Vault Password Management ----------
export async function setVaultPassword(uid, password) {
  const configRef = doc(db, 'users', uid, 'vaultConfig', 'security');
  await setDoc(configRef, { password }); // simple plain-text storage
}

export async function getVaultPassword(uid) {
  const configRef = doc(db, 'users', uid, 'vaultConfig', 'security');
  const snap = await getDoc(configRef);
  return snap.exists() ? snap.data().password : null;
}

export async function verifyVaultPassword(uid, password) {
  const stored = await getVaultPassword(uid);
  return stored === password;
}
