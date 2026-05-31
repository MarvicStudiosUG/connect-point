import { useState, useEffect, useRef } from 'react';
import {
  collection, query, orderBy, onSnapshot,
  addDoc, serverTimestamp, doc
} from 'firebase/firestore';
import { db, createRoom, joinRoomByCode, getUserRooms, getPublicRooms, updateRoom, removeMember, deleteRoom } from './db.js';
import { useUser } from './UserContext.js';

export default function Rooms() {
  const currentUser = useUser();
  const [view, setView] = useState('list'); // 'list', 'create', 'join', 'chat'
  const [rooms, setRooms] = useState([]);
  const [publicRooms, setPublicRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef(null);

  const [createForm, setCreateForm] = useState({ name: '', description: '', isPublic: true, password: '' });
  const [createError, setCreateError] = useState('');

  const [joinCode, setJoinCode] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [joinError, setJoinError] = useState('');

  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    loadRooms();
  }, [currentUser]);

  const loadRooms = async () => {
    try {
      const userRooms = await getUserRooms(currentUser.uid);
      setRooms(userRooms);
      const pub = await getPublicRooms();
      setPublicRooms(pub.filter(r => !userRooms.some(ur => ur.id === r.id)));
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!selectedRoom) return;
    const q = query(collection(db, 'rooms', selectedRoom.id, 'messages'), orderBy('timestamp', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setMessages(msgs);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });
    return () => unsubscribe();
  }, [selectedRoom]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreateError('');
    if (!createForm.name.trim()) {
      setCreateError('Room name is required');
      return;
    }
    try {
      const room = await createRoom({
        name: createForm.name,
        description: createForm.description,
        isPublic: createForm.isPublic,
        password: createForm.password || null
      });
      setRooms(prev => [room, ...prev]);
      setView('list');
      setCreateForm({ name: '', description: '', isPublic: true, password: '' });
    } catch (err) {
      setCreateError(err.message);
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    setJoinError('');
    const code = joinCode.trim().toUpperCase();
    if (!code.startsWith('RC-') || code.length !== 8) {
      setJoinError('Invalid room code format (e.g., RC-0RW33)');
      return;
    }
    try {
      const room = await joinRoomByCode(code, joinPassword);
      setRooms(prev => { const exists = prev.find(r => r.id === room.id); return exists ? prev : [room, ...prev]; });
      setView('list');
      setJoinCode('');
      setJoinPassword('');
    } catch (err) {
      setJoinError(err.message);
    }
  };

  const enterRoom = (room) => {
    setSelectedRoom(room);
    setShowAdmin(false);
    setView('chat');
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedRoom) return;
    await addDoc(collection(db, 'rooms', selectedRoom.id, 'messages'), {
      senderId: currentUser.uid,
      senderName: currentUser.displayName || currentUser.email,
      text: newMessage.trim(),
      timestamp: serverTimestamp(),
    });
    setNewMessage('');
  };

  const handleAdminAction = async (action, payload) => {
    try {
      switch (action) {
        case 'updateName':
          await updateRoom(selectedRoom.id, { name: payload });
          setSelectedRoom(prev => ({ ...prev, name: payload }));
          break;
        case 'togglePublic':
          await updateRoom(selectedRoom.id, { isPublic: !selectedRoom.isPublic });
          setSelectedRoom(prev => ({ ...prev, isPublic: !prev.isPublic }));
          break;
        case 'removeMember':
          await removeMember(selectedRoom.id, payload);
          setSelectedRoom(prev => ({ ...prev, members: prev.members.filter(uid => uid !== payload) }));
          break;
        case 'delete':
          if (confirm('Delete this room permanently?')) {
            await deleteRoom(selectedRoom.id);
            setRooms(prev => prev.filter(r => r.id !== selectedRoom.id));
            setView('list');
            setSelectedRoom(null);
          }
          break;
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // ---------- RENDER HELPERS ----------
  const renderList = () => React.createElement('div', { className: 'rooms-container' },
    React.createElement('div', { className: 'rooms-header' },
      React.createElement('h2', null, 'Rooms'),
      React.createElement('div', { className: 'rooms-header-actions' },
        React.createElement('button', { className: 'btn btn-primary', onClick: () => setView('create') },
          React.createElement('i', { className: 'ph ph-plus' }), ' Create'),
        React.createElement('button', { className: 'btn', onClick: () => setView('join') },
          React.createElement('i', { className: 'ph ph-sign-in' }), ' Join')
      )
    ),
    React.createElement('h3', { className: 'rooms-section-title' }, 'Your Rooms'),
    rooms.length === 0 ? React.createElement('p', { className: 'text-secondary' }, "You haven't joined any rooms yet.") :
    React.createElement('div', { className: 'rooms-grid' },
      rooms.map(room => React.createElement('div', { key: room.id, className: 'room-card glass', onClick: () => enterRoom(room) },
        React.createElement('div', { className: 'room-card-header' },
          React.createElement('span', { className: 'room-name' }, room.name),
          !room.isPublic && React.createElement('i', { className: 'ph ph-lock', style: { color: 'var(--accent)' } })
        ),
        React.createElement('div', { className: 'room-code' }, room.roomCode),
        React.createElement('div', { className: 'room-meta' },
          React.createElement('span', null, `${room.members.length} member${room.members.length > 1 ? 's' : ''}`),
          room.adminUID === currentUser.uid && React.createElement('span', { className: 'badge-admin' }, 'Admin')
        )
      ))
    ),
    React.createElement('h3', { className: 'rooms-section-title' }, 'Public Rooms'),
    publicRooms.length === 0 ? React.createElement('p', { className: 'text-secondary' }, 'No public rooms available.') :
    React.createElement('div', { className: 'rooms-grid' },
      publicRooms.map(room => React.createElement('div', { key: room.id, className: 'room-card glass', onClick: () => enterRoom(room) },
        React.createElement('div', { className: 'room-card-header' },
          React.createElement('span', { className: 'room-name' }, room.name),
          React.createElement('i', { className: 'ph ph-globe', style: { color: 'var(--text-secondary)' } })
        ),
        React.createElement('div', { className: 'room-code' }, room.roomCode),
        React.createElement('div', { className: 'room-meta' }, `${room.members.length} member${room.members.length > 1 ? 's' : ''}`)
      ))
    )
  );

  const renderCreate = () => React.createElement('div', { className: 'rooms-container' },
    React.createElement('div', { className: 'glass', style: { padding: '1.5rem' } },
      React.createElement('button', { className: 'btn-icon', onClick: () => setView('list') },
        React.createElement('i', { className: 'ph ph-arrow-left' })),
      React.createElement('h2', { style: { marginTop: '1rem' } }, 'Create Room'),
      React.createElement('form', { onSubmit: handleCreate },
        React.createElement('div', { className: 'input-group' },
          React.createElement('label', null, 'Room Name'),
          React.createElement('input', { className: 'input-field', type: 'text', value: createForm.name, onChange: e => setCreateForm({...createForm, name: e.target.value}), required: true })
        ),
        React.createElement('div', { className: 'input-group' },
          React.createElement('label', null, 'Description (optional)'),
          React.createElement('input', { className: 'input-field', type: 'text', value: createForm.description, onChange: e => setCreateForm({...createForm, description: e.target.value}) })
        ),
        React.createElement('div', { className: 'input-group', style: { flexDirection: 'row', alignItems: 'center', gap: '12px' } },
          React.createElement('label', null, 'Public'),
          React.createElement('input', { type: 'checkbox', checked: createForm.isPublic, onChange: e => setCreateForm({...createForm, isPublic: e.target.checked}) })
        ),
        !createForm.isPublic && React.createElement('div', { className: 'input-group' },
          React.createElement('label', null, 'Password'),
          React.createElement('input', { className: 'input-field', type: 'password', value: createForm.password, onChange: e => setCreateForm({...createForm, password: e.target.value}) })
        ),
        createError && React.createElement('div', { className: 'error-msg' }, createError),
        React.createElement('button', { className: 'btn btn-primary', type: 'submit', style: { width: '100%' } }, 'Create Room')
      )
    )
  );

  const renderJoin = () => React.createElement('div', { className: 'rooms-container' },
    React.createElement('div', { className: 'glass', style: { padding: '1.5rem' } },
      React.createElement('button', { className: 'btn-icon', onClick: () => setView('list') },
        React.createElement('i', { className: 'ph ph-arrow-left' })),
      React.createElement('h2', { style: { marginTop: '1rem' } }, 'Join Room'),
      React.createElement('form', { onSubmit: handleJoin },
        React.createElement('div', { className: 'input-group' },
          React.createElement('label', null, 'Room Code'),
          React.createElement('input', { className: 'input-field', type: 'text', value: joinCode, onChange: e => setJoinCode(e.target.value.toUpperCase()), placeholder: 'RC-XXXXX' })
        ),
        React.createElement('div', { className: 'input-group' },
          React.createElement('label', null, 'Password (if private)'),
          React.createElement('input', { className: 'input-field', type: 'password', value: joinPassword, onChange: e => setJoinPassword(e.target.value) })
        ),
        joinError && React.createElement('div', { className: 'error-msg' }, joinError),
        React.createElement('button', { className: 'btn btn-primary', type: 'submit', style: { width: '100%' } }, 'Join Room')
      )
    )
  );

  const renderChat = () => {
    if (!selectedRoom) return null;
    const isAdmin = selectedRoom.adminUID === currentUser.uid;

    const adminPanel = showAdmin && isAdmin ? React.createElement('div', { className: 'admin-panel glass' },
      React.createElement('h4', null, 'Admin Controls'),
      React.createElement('div', { className: 'input-group' },
        React.createElement('label', null, 'Rename Room'),
        React.createElement('div', { style: { display: 'flex', gap: '8px' } },
          React.createElement('input', { className: 'input-field', id: 'newName', type: 'text', defaultValue: selectedRoom.name, style: { flex: 1 } }),
          React.createElement('button', { className: 'btn btn-primary', onClick: () => handleAdminAction('updateName', document.getElementById('newName').value) }, 'Save')
        )
      ),
      React.createElement('button', { className: 'btn', onClick: () => handleAdminAction('togglePublic') },
        selectedRoom.isPublic ? 'Make Private' : 'Make Public'),
      React.createElement('div', { className: 'admin-members' },
        React.createElement('strong', null, `Members (${selectedRoom.members.length})`),
        React.createElement('ul', null,
          selectedRoom.members.map(mid => React.createElement('li', { key: mid, style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
            React.createElement('span', null, mid === currentUser.uid ? 'You' : mid),
            mid !== currentUser.uid && React.createElement('button', { className: 'btn-icon', onClick: () => handleAdminAction('removeMember', mid) },
              React.createElement('i', { className: 'ph ph-x', style: { color: 'var(--danger)' } })
            )
          ))
        )
      ),
      React.createElement('button', { className: 'btn', onClick: () => handleAdminAction('delete'), style: { background: 'var(--danger)', color: 'white', marginTop: '12px' } }, 'Delete Room')
    ) : null;

    const chatHeader = React.createElement('div', { className: 'chat-header' },
      React.createElement('button', { className: 'btn-icon', onClick: () => { setView('list'); setSelectedRoom(null); } },
        React.createElement('i', { className: 'ph ph-arrow-left' })),
      React.createElement('div', { style: { flex: 1, textAlign: 'center' } },
        React.createElement('strong', null, selectedRoom.name),
        React.createElement('div', { style: { fontSize: '0.75rem', color: 'var(--text-secondary)' } }, selectedRoom.roomCode)
      ),
      React.createElement('button', { className: 'btn-icon', onClick: () => setShowAdmin(!showAdmin) },
        React.createElement('i', { className: 'ph ph-dots-three-vertical' }))
    );

    const messageElements = messages.map(msg =>
      React.createElement('div', { key: msg.id, className: `chat-bubble ${msg.senderId === currentUser.uid ? 'own' : 'other'}` },
        React.createElement('div', { className: 'bubble-text' }, msg.text),
        React.createElement('div', { className: 'bubble-time' },
          msg.timestamp ? new Date(msg.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
        )
      )
    );

    const messagesArea = React.createElement('div', { className: 'chat-messages' },
      ...messageElements,
      React.createElement('div', { ref: messagesEndRef })
    );

    const inputArea = React.createElement('form', { className: 'chat-input-area', onSubmit: sendMessage },
      React.createElement('input', { className: 'input-field', type: 'text', value: newMessage, onChange: e => setNewMessage(e.target.value), placeholder: 'Type a message...' }),
      React.createElement('button', { type: 'submit', className: 'btn btn-primary' },
        React.createElement('i', { className: 'ph ph-paper-plane-right' }))
    );

    return React.createElement('div', { className: 'duo-container chat-active' },
      chatHeader,
      adminPanel,
      messagesArea,
      inputArea
    );
  };

  switch (view) {
    case 'create': return renderCreate();
    case 'join': return renderJoin();
    case 'chat': return renderChat();
    default: return renderList();
  }
                          }
