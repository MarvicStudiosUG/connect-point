import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection, query, orderBy, onSnapshot,
  addDoc, serverTimestamp, doc, getDocs, where,
  updateDoc
} from 'firebase/firestore';
import {
  db,
  createRoom,
  joinRoomByCode,
  getUserRooms,
  getPublicRooms,
  updateRoom,
  removeMember,
  deleteRoom,
  setRoomTyping,
  listenRoomTyping,
  addReaction,
  deleteMessage
} from './db.js';
import { useUser } from './UserContext.js';

// Reaction types with icons
const REACTION_TYPES = [
  { type: 'like', icon: 'ph-thumbs-up', label: 'Like' },
  { type: 'love', icon: 'ph-heart', label: 'Love' },
  { type: 'laugh', icon: 'ph-smiley', label: 'Laugh' },
  { type: 'wow', icon: 'ph-smiley-wink', label: 'Wow' },
  { type: 'sad', icon: 'ph-smiley-sad', label: 'Sad' },
  { type: 'angry', icon: 'ph-smiley-angry', label: 'Angry' }
];

// Toast component
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return React.createElement('div', {
    className: `fade-in toast ${type}`,
    style: {
      position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999, padding: '12px 24px', borderRadius: '16px',
      background: type === 'success' ? 'rgba(34,197,94,0.95)' : type === 'error' ? 'rgba(239,68,68,0.95)' : 'rgba(127,90,240,0.95)',
      color: 'white', fontWeight: '600', boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', gap: '8px'
    }
  },
    React.createElement('i', { className: `ph ${type === 'success' ? 'ph-check-circle' : type === 'error' ? 'ph-x-circle' : 'ph-info'}` }),
    message
  );
}

// Create Room form
function CreateRoomView({ onBack, onCreated }) {
  const [form, setForm] = useState({ name: '', description: '', isPublic: true, password: '' });
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('Room name required'); return; }
    try {
      await createRoom(form);
      onCreated();
    } catch (err) { setError(err.message); }
  };

  return React.createElement('div', { className: 'rooms-container', style: { padding: '16px' } },
    React.createElement('div', { className: 'glass', style: { padding: '1.5rem', borderRadius: '20px' } },
      React.createElement('button', { className: 'btn-icon', onClick: onBack, style: { marginBottom: '12px' } },
        React.createElement('i', { className: 'ph ph-arrow-left' })),
      React.createElement('h2', { style: { marginTop: '1rem' } }, 'Create Room'),
      React.createElement('form', { onSubmit: handleSubmit },
        React.createElement('div', { className: 'input-group' },
          React.createElement('label', null, 'Room Name'),
          React.createElement('input', { className: 'input-field', type: 'text', value: form.name, onChange: (e) => setForm({ ...form, name: e.target.value }), required: true, placeholder: 'Room name' })
        ),
        React.createElement('div', { className: 'input-group' },
          React.createElement('label', null, 'Description (optional)'),
          React.createElement('input', { className: 'input-field', type: 'text', value: form.description, onChange: (e) => setForm({ ...form, description: e.target.value }), placeholder: 'What is this room about?' })
        ),
        React.createElement('div', { className: 'input-group', style: { display: 'flex', alignItems: 'center', gap: '12px', flexDirection: 'row' } },
          React.createElement('label', null, 'Public room'),
          React.createElement('input', { type: 'checkbox', checked: form.isPublic, onChange: (e) => setForm({ ...form, isPublic: e.target.checked }) })
        ),
        !form.isPublic && React.createElement('div', { className: 'input-group' },
          React.createElement('label', null, 'Password'),
          React.createElement('input', { className: 'input-field', type: 'password', value: form.password, onChange: (e) => setForm({ ...form, password: e.target.value }), placeholder: 'Enter room password' })
        ),
        error && React.createElement('div', { style: { color: 'var(--danger)', padding: '8px', background: 'rgba(239,68,68,0.1)', borderRadius: '8px', marginBottom: '12px' } }, error),
        React.createElement('button', { className: 'btn btn-primary', type: 'submit', style: { width: '100%' } },
          React.createElement('i', { className: 'ph ph-plus-circle' }), ' Create Room'
        )
      )
    )
  );
}

// Join Room form
function JoinRoomView({ onBack, onJoined }) {
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode.startsWith('RC-') || cleanCode.length !== 8) {
      setError('Invalid room code. Format: RC-XXXXX');
      return;
    }
    try {
      await joinRoomByCode(cleanCode, password);
      onJoined();
    } catch (err) { setError(err.message); }
  };

  return React.createElement('div', { className: 'rooms-container', style: { padding: '16px' } },
    React.createElement('div', { className: 'glass', style: { padding: '1.5rem', borderRadius: '20px' } },
      React.createElement('button', { className: 'btn-icon', onClick: onBack, style: { marginBottom: '12px' } },
        React.createElement('i', { className: 'ph ph-arrow-left' })),
      React.createElement('h2', { style: { marginTop: '1rem' } }, 'Join Room'),
      React.createElement('form', { onSubmit: handleSubmit },
        React.createElement('div', { className: 'input-group' },
          React.createElement('label', null, 'Room Code'),
          React.createElement('input', { className: 'input-field', type: 'text', value: code, onChange: (e) => setCode(e.target.value.toUpperCase()), placeholder: 'RC-XXXXX', required: true })
        ),
        React.createElement('div', { className: 'input-group' },
          React.createElement('label', null, 'Password (if private)'),
          React.createElement('input', { className: 'input-field', type: 'password', value: password, onChange: (e) => setPassword(e.target.value), placeholder: 'Enter password' })
        ),
        error && React.createElement('div', { style: { color: 'var(--danger)', padding: '8px', background: 'rgba(239,68,68,0.1)', borderRadius: '8px', marginBottom: '12px' } }, error),
        React.createElement('button', { className: 'btn btn-primary', type: 'submit', style: { width: '100%' } },
          React.createElement('i', { className: 'ph ph-door-open' }), ' Join Room'
        )
      )
    )
  );
}

export default function Rooms() {
  const currentUser = useUser();
  const [view, setView] = useState('list'); // list, create, join, chat
  const [rooms, setRooms] = useState([]);
  const [publicRooms, setPublicRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [editMessage, setEditMessage] = useState(null);
  const [forwardMessage, setForwardMessage] = useState(null);
  const [searchRoomName, setSearchRoomName] = useState('');
  const [typingUsers, setTypingUsers] = useState([]);
  const [memberPresence, setMemberPresence] = useState({});
  const [showAdmin, setShowAdmin] = useState(false);
  const [showMemberList, setShowMemberList] = useState(false);
  const [toast, setToast] = useState(null); // { message, type }
  const messagesEndRef = useRef(null);

  const showToast = (message, type = 'info') => setToast({ message, type });

  // Load rooms
  const loadRooms = useCallback(async () => {
    if (!currentUser) return;
    try {
      const userRooms = await getUserRooms(currentUser.uid);
      setRooms(userRooms);
      const pub = await getPublicRooms();
      setPublicRooms(pub.filter(r => !userRooms.some(ur => ur.id === r.id)));
    } catch (err) {
      showToast('Failed to load rooms', 'error');
    }
  }, [currentUser]);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  // Search public rooms
  const searchPublicRooms = useCallback(async () => {
    if (!searchRoomName.trim()) return loadRooms();
    try {
      const q = query(collection(db, 'rooms'), where('isPublic', '==', true), where('name', '>=', searchRoomName.trim()), where('name', '<=', searchRoomName.trim() + '\uf8ff'));
      const snapshot = await getDocs(q);
      const results = [];
      snapshot.forEach(d => results.push({ id: d.id, ...d.data() }));
      setPublicRooms(results);
    } catch (err) {
      showToast('Search failed', 'error');
    }
  }, [searchRoomName, loadRooms]);

  useEffect(() => {
    const timer = setTimeout(searchPublicRooms, 300);
    return () => clearTimeout(timer);
  }, [searchPublicRooms]);

  // Messages listener
  useEffect(() => {
    if (!selectedRoom) return;
    const q = query(collection(db, 'rooms', selectedRoom.id, 'messages'), orderBy('timestamp', 'asc'));
    const unsub = onSnapshot(q, snapshot => {
      const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setMessages(msgs);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });
    return () => unsub();
  }, [selectedRoom]);

  // Typing listener
  useEffect(() => {
    if (!selectedRoom) return;
    const unsub = listenRoomTyping(selectedRoom.id, setTypingUsers);
    return () => unsub();
  }, [selectedRoom]);

  // Member presence listener
  useEffect(() => {
    if (!selectedRoom) return;
    const members = selectedRoom.members || [];
    const unsubs = members.map(mid => onSnapshot(doc(db, 'users', mid), snap => {
      if (snap.exists()) {
        setMemberPresence(prev => ({ ...prev, [mid]: snap.data().online || false }));
      }
    }));
    return () => unsubs.forEach(u => u());
  }, [selectedRoom]);

  // Send message
  const sendMessage = async (e) => {
    if (e) e.preventDefault();
    const text = newMessage.trim();
    if (!text && !forwardMessage) return;
    if (!selectedRoom) return;

    const msgData = {
      senderId: currentUser.uid,
      senderName: currentUser.displayName || currentUser.email,
      text: text || '',
      timestamp: serverTimestamp(),
      reactions: {}
    };

    if (replyTo) msgData.replyTo = { id: replyTo.id, text: replyTo.text, senderName: replyTo.senderName };
    if (forwardMessage) {
      msgData.forwardedFrom = { id: forwardMessage.id, text: forwardMessage.text, senderName: forwardMessage.senderName };
      msgData.text = text || forwardMessage.text;
    }

    if (editMessage) {
      await updateDoc(doc(db, 'rooms', selectedRoom.id, 'messages', editMessage.id), {
        text: text,
        edited: true,
        editedAt: serverTimestamp()
      });
      setEditMessage(null);
      setNewMessage('');
      return;
    }

    await addDoc(collection(db, 'rooms', selectedRoom.id, 'messages'), msgData);
    setNewMessage('');
    setReplyTo(null);
    setForwardMessage(null);
    handleTyping(false);
  };

  const handleTyping = useCallback((isTyping) => {
    if (selectedRoom) setRoomTyping(selectedRoom.id, currentUser.uid, isTyping);
  }, [selectedRoom, currentUser?.uid]);

  // Reactions
  const handleAddReaction = async (msgId, reactionType) => {
    if (!selectedRoom) return;
    const path = `rooms/${selectedRoom.id}/messages/${msgId}`;
    try {
      await addReaction(path, currentUser.uid, reactionType);
    } catch (err) {
      showToast('Failed to add reaction', 'error');
    }
  };

  // Delete message
  const handleDeleteMessage = async (msgId) => {
    if (confirm('Delete this message?')) {
      try {
        await deleteMessage(`rooms/${selectedRoom.id}/messages/${msgId}`, currentUser.uid);
        showToast('Message deleted', 'success');
      } catch (err) {
        showToast('Delete failed', 'error');
      }
    }
  };

  // Admin actions
  const handleAdminAction = async (action, payload) => {
    if (!selectedRoom) return;
    try {
      switch (action) {
        case 'updateName':
          if (!payload.trim()) { showToast('Room name cannot be empty', 'error'); return; }
          await updateRoom(selectedRoom.id, { name: payload });
          setSelectedRoom(prev => ({ ...prev, name: payload }));
          showToast('Room renamed', 'success');
          break;
        case 'togglePublic':
          await updateRoom(selectedRoom.id, { isPublic: !selectedRoom.isPublic });
          setSelectedRoom(prev => ({ ...prev, isPublic: !prev.isPublic }));
          showToast(selectedRoom.isPublic ? 'Room is now public' : 'Room is now private', 'success');
          break;
        case 'removeMember':
          if (payload === currentUser.uid) { showToast('You cannot remove yourself', 'error'); return; }
          await removeMember(selectedRoom.id, payload);
          setSelectedRoom(prev => ({ ...prev, members: prev.members.filter(uid => uid !== payload) }));
          showToast('Member removed', 'success');
          break;
        case 'delete':
          if (confirm('Delete this room permanently?')) {
            await deleteRoom(selectedRoom.id);
            setRooms(prev => prev.filter(r => r.id !== selectedRoom.id));
            setView('list');
            setSelectedRoom(null);
            showToast('Room deleted', 'success');
          }
          break;
      }
    } catch (err) {
      showToast('Action failed: ' + err.message, 'error');
    }
  };

  // Leave room
  const handleLeaveRoom = async () => {
    if (confirm('Leave this room?')) {
      try {
        await removeMember(selectedRoom.id, currentUser.uid);
        setRooms(prev => prev.filter(r => r.id !== selectedRoom.id));
        setView('list');
        setSelectedRoom(null);
        showToast('Left room', 'info');
      } catch (err) {
        showToast('Failed to leave', 'error');
      }
    }
  };

  const enterRoom = (room) => {
    setSelectedRoom(room);
    setShowAdmin(false);
    setShowMemberList(false);
    setView('chat');
    setReplyTo(null);
    setEditMessage(null);
    setForwardMessage(null);
    setNewMessage('');
  };

  // Render room card
  const RoomCard = ({ room, isMember }) => {
    const memberCount = room.members?.length || 0;
    return React.createElement('div', {
      className: 'room-card glass',
      style: { padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
    },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', flex: 1, cursor: 'pointer' }, onClick: () => isMember ? enterRoom(room) : showToast('Join this room first', 'info') },
        React.createElement('div', {
          style: { width: '44px', height: '44px', borderRadius: '12px', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.2rem', color: 'white' }
        }, room.name.charAt(0).toUpperCase()),
        React.createElement('div', null,
          React.createElement('div', { style: { fontWeight: '600' } }, room.name),
          React.createElement('div', { style: { fontSize: '0.8rem', color: 'var(--text-secondary)' } },
            memberCount + ' member' + (memberCount > 1 ? 's' : ''),
            room.adminUID === currentUser.uid && ' • Admin',
            !room.isPublic && React.createElement('i', { className: 'ph ph-lock', style: { color: 'var(--accent)', marginLeft: '8px' } })
          )
        )
      ),
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        React.createElement('span', { style: { fontSize: '0.7rem', color: 'var(--text-secondary)' } }, room.roomCode),
        !isMember && React.createElement('button', {
          className: 'btn btn-primary',
          style: { padding: '8px 12px', fontSize: '0.8rem' },
          onClick: (e) => { e.stopPropagation(); /* join logic */ showToast('Use the Join tab to enter this room', 'info'); }
        }, 'Join')
      )
    );
  };

  // Message bubble
  const MessageBubble = ({ msg }) => {
    const isOwn = msg.senderId === currentUser.uid;
    const isAdmin = selectedRoom?.adminUID === msg.senderId;
    const reactions = msg.reactions || {};
    const hasReactions = Object.keys(reactions).length > 0;
    const isEdited = msg.edited === true;
    const hasReply = msg.replyTo;
    const isForwarded = msg.forwardedFrom;
    const timeStr = msg.timestamp?.toDate?.()?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || '';

    // Reaction pills
    const reactionElements = hasReactions ? React.createElement('div', { className: 'reactions-bar', style: { marginTop: '4px', display: 'flex', gap: '4px', flexWrap: 'wrap' } },
      Object.entries(reactions).map(([type, users]) => {
        const rdef = REACTION_TYPES.find(r => r.type === type);
        const icon = rdef ? rdef.icon : 'ph-thumbs-up';
        return React.createElement('span', {
          key: type,
          className: 'reaction-item',
          style: { display: 'inline-flex', alignItems: 'center', gap: '2px', background: 'var(--surface)', borderRadius: '12px', padding: '0 6px', cursor: 'pointer', border: '1px solid var(--border)' },
          onClick: () => handleAddReaction(msg.id, type)
        },
          React.createElement('i', { className: icon + ' reaction-icon', style: { fontSize: '0.9rem' } }),
          React.createElement('span', { style: { fontSize: '0.7rem', color: 'var(--text-secondary)' } }, users.length)
        );
      })
    ) : null;

    // Reply preview
    const replyPreview = hasReply ? React.createElement('div', { className: 'reply-preview', style: { background: 'var(--surface)', borderLeft: '3px solid var(--accent)', padding: '4px 8px', marginBottom: '4px', borderRadius: '4px', fontSize: '0.8rem', opacity: 0.9 } },
      React.createElement('span', { style: { fontWeight: 'bold', fontSize: '0.7rem', color: 'var(--text-secondary)' } }, msg.replyTo.senderName + ': '),
      React.createElement('span', { style: { fontSize: '0.8rem' } }, msg.replyTo.text)
    ) : null;

    // Forward indicator
    const forwardIndicator = isForwarded ? React.createElement('div', { style: { fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '2px' } }, 'Forwarded from ' + msg.forwardedFrom.senderName) : null;

    // Quick reaction buttons
    const quickReactions = React.createElement('div', { style: { display: 'flex', gap: '2px', marginTop: '2px' } },
      REACTION_TYPES.slice(0, 4).map(rdef =>
        React.createElement('button', {
          key: rdef.type,
          className: 'btn-icon',
          style: { fontSize: '0.8rem', padding: '0 2px', width: '28px', height: '28px' },
          title: rdef.label,
          onClick: () => handleAddReaction(msg.id, rdef.type)
        }, React.createElement('i', { className: rdef.icon }))
      )
    );

    // Message actions
    const messageActions = React.createElement('div', { className: 'message-actions', style: { display: 'flex', gap: '2px', marginTop: '4px', justifyContent: 'flex-end', opacity: 0.6 } },
      React.createElement('button', { className: 'btn-icon', style: { fontSize: '0.7rem' }, title: 'Reply', onClick: () => setReplyTo({ id: msg.id, text: msg.text, senderName: msg.senderName }) }, React.createElement('i', { className: 'ph ph-arrow-bend-left-up' })),
      React.createElement('button', { className: 'btn-icon', style: { fontSize: '0.7rem' }, title: 'Forward', onClick: () => setForwardMessage(msg) }, React.createElement('i', { className: 'ph ph-arrow-bend-right-down' })),
      isOwn && React.createElement('button', { className: 'btn-icon', style: { fontSize: '0.7rem', color: 'var(--accent)' }, title: 'Edit', onClick: () => { setEditMessage(msg); setNewMessage(msg.text); } }, React.createElement('i', { className: 'ph ph-pencil-simple' })),
      (isOwn || isAdmin) && React.createElement('button', { className: 'btn-icon', style: { fontSize: '0.7rem', color: 'var(--danger)' }, title: 'Delete', onClick: () => handleDeleteMessage(msg.id) }, React.createElement('i', { className: 'ph ph-trash' }))
    );

    return React.createElement('div', {
      key: msg.id,
      className: `chat-bubble ${isOwn ? 'own' : 'other'}`,
      style: {
        maxWidth: '80%', padding: '10px 14px', borderRadius: '18px', wordWrap: 'break-word',
        fontSize: '0.95rem', alignSelf: isOwn ? 'flex-end' : 'flex-start',
        background: isOwn ? 'var(--accent)' : 'var(--surface)',
        color: isOwn ? 'white' : 'var(--text-primary)',
        border: isOwn ? 'none' : '1px solid var(--border)',
        borderBottomRightRadius: isOwn ? '4px' : '18px', borderBottomLeftRadius: isOwn ? '18px' : '4px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }
    },
      isAdmin && !isOwn && React.createElement('span', { style: { fontSize: '0.6rem', color: 'var(--accent)', fontWeight: 'bold', display: 'block' } }, 'Admin'),
      replyPreview,
      forwardIndicator,
      React.createElement('div', { className: 'bubble-text' }, msg.text),
      isEdited && React.createElement('span', { style: { fontSize: '0.6rem', opacity: 0.6, marginLeft: '4px' } }, '(edited)'),
      quickReactions,
      reactionElements,
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' } },
        React.createElement('div', { className: 'bubble-time', style: { fontSize: '0.6rem', opacity: 0.7 } }, timeStr),
        messageActions
      )
    );
  };

  // Date separator
  const DateSeparator = ({ date }) => {
    const today = new Date().toLocaleDateString();
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString();
    let label = date;
    if (date === today) label = 'Today';
    else if (date === yesterday) label = 'Yesterday';
    return React.createElement('div', { style: { textAlign: 'center', padding: '8px 0', color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: '500' } },
      React.createElement('span', { style: { background: 'var(--surface)', padding: '4px 12px', borderRadius: '12px', border: '1px solid var(--border)' } }, label)
    );
  };

  // ---- VIEWS ----
  // List view
  const renderList = () => React.createElement('div', { className: 'rooms-container', style: { padding: '16px' } },
    React.createElement('div', { className: 'rooms-header', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' } },
      React.createElement('h2', null, 'Rooms'),
      React.createElement('div', { className: 'rooms-header-actions', style: { display: 'flex', gap: '8px' } },
        React.createElement('button', { className: 'btn btn-primary', onClick: () => setView('create') }, React.createElement('i', { className: 'ph ph-plus' }), ' Create'),
        React.createElement('button', { className: 'btn', onClick: () => setView('join') }, React.createElement('i', { className: 'ph ph-sign-in' }), ' Join')
      )
    ),
    React.createElement('div', { className: 'search-bar', style: { marginBottom: '16px' } },
      React.createElement('input', { className: 'input-field', type: 'text', placeholder: 'Search public rooms...', value: searchRoomName, onChange: (e) => setSearchRoomName(e.target.value), style: { width: '100%' } })
    ),
    React.createElement('h3', { className: 'rooms-section-title', style: { marginBottom: '12px', fontSize: '1rem', color: 'var(--text-secondary)' } }, 'Your Rooms'),
    rooms.length === 0 ? React.createElement('p', { className: 'text-secondary', style: { textAlign: 'center', padding: '2rem 0' } }, "You haven't joined any rooms yet.") :
    React.createElement('div', { className: 'rooms-grid', style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
      rooms.map(room => React.createElement(RoomCard, { key: room.id, room, isMember: true }))
    ),
    React.createElement('h3', { className: 'rooms-section-title', style: { marginTop: '24px', marginBottom: '12px', fontSize: '1rem', color: 'var(--text-secondary)' } }, 'Public Rooms'),
    publicRooms.length === 0 ? React.createElement('p', { className: 'text-secondary', style: { textAlign: 'center', padding: '2rem 0' } }, 'No public rooms available.') :
    React.createElement('div', { className: 'rooms-grid', style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
      publicRooms.map(room => React.createElement(RoomCard, { key: room.id, room, isMember: false }))
    )
  );

  // Chat view
  const renderChat = () => {
    if (!selectedRoom) return null;
    const isAdmin = selectedRoom.adminUID === currentUser.uid;
    const memberCount = selectedRoom.members?.length || 0;

    // Group messages by date
    const groupedMessages = [];
    let currentDate = null;
    messages.forEach(msg => {
      const date = msg.timestamp?.toDate?.()?.toLocaleDateString() || '';
      if (date !== currentDate) {
        currentDate = date;
        if (date) groupedMessages.push({ type: 'date', date, key: `date-${date}` });
      }
      groupedMessages.push({ type: 'message', msg, key: msg.id });
    });

    const messageElements = groupedMessages.map(item => {
      if (item.type === 'date') return React.createElement(DateSeparator, { key: item.key, date: item.date });
      return React.createElement(MessageBubble, { key: item.key, msg: item.msg });
    });

    // Typing indicator – just show "Someone is typing..." if any
    const typingIndicator = typingUsers.length > 0 ? React.createElement('div', { style: { fontStyle: 'italic', padding: '4px 16px', color: 'var(--text-secondary)', fontSize: '0.85rem' } }, 'Someone is typing...') : null;

    // Admin panel
    const adminPanel = showAdmin && isAdmin ? React.createElement('div', {
      className: 'admin-panel glass',
      style: { position: 'absolute', top: '60px', right: '16px', width: '280px', zIndex: 50, padding: '16px', borderRadius: '16px' }
    },
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } },
        React.createElement('h4', { style: { margin: 0 } }, 'Admin Controls'),
        React.createElement('button', { className: 'btn-icon', onClick: () => setShowAdmin(false) }, React.createElement('i', { className: 'ph ph-x' }))
      ),
      React.createElement('div', { className: 'input-group' },
        React.createElement('label', null, 'Rename Room'),
        React.createElement('div', { style: { display: 'flex', gap: '8px' } },
          React.createElement('input', { className: 'input-field', id: 'newName', type: 'text', defaultValue: selectedRoom.name, style: { flex: 1 } }),
          React.createElement('button', { className: 'btn btn-primary', onClick: () => handleAdminAction('updateName', document.getElementById('newName').value), style: { padding: '8px 12px', fontSize: '0.8rem' } }, 'Save')
        )
      ),
      React.createElement('button', { className: 'btn', onClick: () => handleAdminAction('togglePublic'), style: { width: '100%', marginBottom: '8px' } },
        selectedRoom.isPublic ? 'Make Private' : 'Make Public'
      ),
      React.createElement('div', { style: { marginBottom: '8px' } },
        React.createElement('strong', null, 'Members (' + memberCount + ')'),
        React.createElement('div', { style: { maxHeight: '200px', overflowY: 'auto', marginTop: '4px' } },
          selectedRoom.members.map(mid => {
            const isOnline = memberPresence[mid] || false;
            return React.createElement('div', { key: mid, style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: '0.85rem' } },
              React.createElement('span', null,
                mid === currentUser.uid ? 'You' : mid,
                isOnline && React.createElement('span', { className: 'online-dot', style: { marginLeft: '8px' } })
              ),
              mid !== currentUser.uid && React.createElement('button', { className: 'btn-icon', style: { color: 'var(--danger)' }, onClick: () => handleAdminAction('removeMember', mid) }, React.createElement('i', { className: 'ph ph-user-minus' }))
            );
          })
        )
      ),
      React.createElement('button', { className: 'btn', onClick: () => handleAdminAction('delete'), style: { width: '100%', background: 'var(--danger)', color: 'white', marginBottom: '4px' } }, 'Delete Room'),
      React.createElement('button', { className: 'btn', onClick: handleLeaveRoom, style: { width: '100%' } }, 'Leave Room')
    ) : null;

    // Member list panel
    const memberListPanel = showMemberList ? React.createElement('div', {
      className: 'glass', style: { position: 'absolute', top: '60px', right: '16px', width: '220px', zIndex: 50, padding: '12px', borderRadius: '16px' }
    },
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' } },
        React.createElement('strong', null, 'Members'),
        React.createElement('button', { className: 'btn-icon', onClick: () => setShowMemberList(false) }, React.createElement('i', { className: 'ph ph-x' }))
      ),
      selectedRoom.members.map(mid => {
        const isOnline = memberPresence[mid] || false;
        return React.createElement('div', { key: mid, style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', fontSize: '0.85rem' } },
          React.createElement('span', { style: { display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: isOnline ? '#22c55e' : 'var(--text-secondary)' } }),
          mid === currentUser.uid ? 'You' : mid,
          mid === selectedRoom.adminUID && React.createElement('span', { style: { fontSize: '0.6rem', color: 'var(--accent)' } }, 'Admin')
        );
      })
    ) : null;

    // Reply/Edit/Forward bars (same as before but without emojis)
    const replyBar = replyTo ? React.createElement('div', { className: 'reply-bar', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--surface)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', borderRadius: '12px 12px 0 0', marginTop: '8px' } },
      React.createElement('div', { style: { flex: 1, overflow: 'hidden' } },
        React.createElement('div', { style: { fontSize: '0.7rem', color: 'var(--text-secondary)' } }, 'Replying to ' + replyTo.senderName),
        React.createElement('div', { style: { fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, replyTo.text)
      ),
      React.createElement('button', { className: 'btn-icon', onClick: () => setReplyTo(null) }, React.createElement('i', { className: 'ph ph-x' }))
    ) : null;

    const editBar = editMessage ? React.createElement('div', { className: 'reply-bar', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--surface)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', borderRadius: '12px 12px 0 0', marginTop: '8px' } },
      React.createElement('div', { style: { flex: 1, overflow: 'hidden' } },
        React.createElement('div', { style: { fontSize: '0.7rem', color: 'var(--accent)' } }, 'Editing message'),
        React.createElement('div', { style: { fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, editMessage.text)
      ),
      React.createElement('button', { className: 'btn-icon', onClick: () => { setEditMessage(null); setNewMessage(''); } }, React.createElement('i', { className: 'ph ph-x' }))
    ) : null;

    const forwardBar = forwardMessage ? React.createElement('div', { className: 'reply-bar', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--surface)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', borderRadius: '12px 12px 0 0', marginTop: '8px' } },
      React.createElement('div', { style: { flex: 1, overflow: 'hidden' } },
        React.createElement('div', { style: { fontSize: '0.7rem', color: 'var(--text-secondary)' } }, 'Forwarding from ' + forwardMessage.senderName),
        React.createElement('div', { style: { fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, forwardMessage.text)
      ),
      React.createElement('button', { className: 'btn-icon', onClick: () => setForwardMessage(null) }, React.createElement('i', { className: 'ph ph-x' }))
    ) : null;

    // Input area
    const inputArea = React.createElement('form', { className: 'chat-input-area', onSubmit: sendMessage, style: { display: 'flex', gap: '8px', padding: '12px', background: 'var(--surface)', borderTop: '1px solid var(--border)', position: 'sticky', bottom: 0, alignItems: 'center' } },
      React.createElement('input', {
        className: 'input-field', type: 'text', value: newMessage,
        onChange: (e) => setNewMessage(e.target.value),
        placeholder: editMessage ? 'Edit message...' : forwardMessage ? 'Add a note (optional)...' : 'Type a message...',
        onFocus: () => handleTyping(true),
        onBlur: () => handleTyping(false),
        onKeyDown: (e) => e.key === 'Enter' && !e.shiftKey && sendMessage(e),
        style: { flex: 1, marginBottom: 0, padding: '12px 16px', borderRadius: '24px' }
      }),
      React.createElement('button', {
        type: 'submit', className: 'btn btn-primary',
        disabled: !newMessage.trim() && !forwardMessage,
        style: { padding: '10px 16px', borderRadius: '50%', width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }
      }, React.createElement('i', { className: `ph ${editMessage ? 'ph-pencil-simple' : forwardMessage ? 'ph-arrow-bend-right-down' : 'ph-paper-plane-right'}`, style: { fontSize: '1.2rem' } }))
    );

    return React.createElement('div', { className: 'duo-container chat-active', style: { height: 'calc(100vh - 160px)', display: 'flex', flexDirection: 'column', borderRadius: '20px', overflow: 'hidden', position: 'relative' } },
      React.createElement('div', { className: 'chat-header', style: { display: 'flex', alignItems: 'center', padding: '12px 16px', background: 'var(--surface)', backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--border)' } },
        React.createElement('button', { className: 'btn-icon', onClick: () => { setView('list'); setSelectedRoom(null); } }, React.createElement('i', { className: 'ph ph-arrow-left' })),
        React.createElement('div', { style: { flex: 1, marginLeft: '12px', cursor: 'pointer' }, onClick: () => setShowMemberList(!showMemberList) },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            React.createElement('strong', null, selectedRoom.name),
            React.createElement('span', { style: { fontSize: '0.7rem', color: 'var(--text-secondary)' } }, '(' + memberCount + ')'),
            !selectedRoom.isPublic && React.createElement('i', { className: 'ph ph-lock', style: { color: 'var(--accent)' } })
          ),
          React.createElement('div', { style: { fontSize: '0.75rem', color: 'var(--text-secondary)' } }, selectedRoom.description || selectedRoom.roomCode)
        ),
        isAdmin && React.createElement('button', { className: 'btn-icon', onClick: () => setShowAdmin(!showAdmin) }, React.createElement('i', { className: 'ph ph-shield-check', style: { color: 'var(--accent)' } })),
        React.createElement('button', { className: 'btn-icon', onClick: () => setShowMemberList(!showMemberList) }, React.createElement('i', { className: 'ph ph-users' }))
      ),
      adminPanel,
      memberListPanel,
      React.createElement('div', { className: 'chat-messages', style: { flex: 1, overflowY: 'auto', padding: '8px 8px 16px', display: 'flex', flexDirection: 'column', gap: '4px' } },
        messageElements.length === 0 ? React.createElement('div', { style: { textAlign: 'center', padding: '2rem 0', color: 'var(--text-secondary)' } }, React.createElement('i', { className: 'ph ph-chat-circle-dots', style: { fontSize: '3rem', opacity: 0.3 } }), React.createElement('p', null, 'No messages yet.')) : messageElements,
        typingIndicator,
        React.createElement('div', { ref: messagesEndRef })
      ),
      replyBar,
      editBar,
      forwardBar,
      inputArea
    );
  };

  // Main switch
  switch (view) {
    case 'create': return React.createElement(CreateRoomView, { onBack: () => setView('list'), onCreated: () => { loadRooms(); setView('list'); showToast('Room created!', 'success'); } });
    case 'join': return React.createElement(JoinRoomView, { onBack: () => setView('list'), onJoined: () => { loadRooms(); setView('list'); showToast('Joined room!', 'success'); } });
    case 'chat': return renderChat();
    default: return (
      React.createElement(React.Fragment, null,
        toast && React.createElement(Toast, { message: toast.message, type: toast.type, onClose: () => setToast(null) }),
        renderList()
      )
    );
  }
    }
