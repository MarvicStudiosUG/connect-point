import { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection, query, orderBy, onSnapshot,
  addDoc, serverTimestamp, doc, getDoc
} from 'firebase/firestore';
import { db, createRoom, joinRoomByCode, getUserRooms, getPublicRooms, searchRoomsByName, updateRoom, removeMember, deleteRoom } from './db.js';
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

  // For create form
  const [createForm, setCreateForm] = useState({ name: '', description: '', isPublic: true, password: '' });
  const [createError, setCreateError] = useState('');

  // For join form
  const [joinCode, setJoinCode] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [joinError, setJoinError] = useState('');

  // Admin panel
  const [showAdmin, setShowAdmin] = useState(false);

  // Fetch user's rooms and public rooms
  useEffect(() => {
    if (!currentUser) return;
    loadRooms();
  }, [currentUser]);

  const loadRooms = async () => {
    try {
      const userRooms = await getUserRooms(currentUser.uid);
      setRooms(userRooms);
      const pub = await getPublicRooms();
      setPublicRooms(pub.filter(r => !userRooms.some(ur => ur.id === r.id))); // exclude already joined
    } catch (err) {
      console.error(err);
    }
  };

  // Real‑time messages for selected room
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
      setRooms(prev => {
        const exists = prev.find(r => r.id === room.id);
        if (exists) return prev;
        return [room, ...prev];
      });
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

  // RENDER FUNCTIONS
  const renderList = () => (
    <div className="rooms-container">
      <div className="rooms-header">
        <h2>Rooms</h2>
        <div className="rooms-header-actions">
          <button className="btn btn-primary" onClick={() => setView('create')}>
            <i className="ph ph-plus"></i> Create
          </button>
          <button className="btn" onClick={() => setView('join')}>
            <i className="ph ph-sign-in"></i> Join
          </button>
        </div>
      </div>

      <h3 className="rooms-section-title">Your Rooms</h3>
      {rooms.length === 0 ? (
        <p className="text-secondary">You haven't joined any rooms yet.</p>
      ) : (
        <div className="rooms-grid">
          {rooms.map(room => (
            <div key={room.id} className="room-card glass" onClick={() => enterRoom(room)}>
              <div className="room-card-header">
                <span className="room-name">{room.name}</span>
                {!room.isPublic && <i className="ph ph-lock" style={{ color: 'var(--accent)' }}></i>}
              </div>
              <div className="room-code">{room.roomCode}</div>
              <div className="room-meta">
                <span>{room.members.length} member{room.members.length > 1 ? 's' : ''}</span>
                {room.adminUID === currentUser.uid && <span className="badge-admin">Admin</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <h3 className="rooms-section-title">Public Rooms</h3>
      {publicRooms.length === 0 ? (
        <p className="text-secondary">No public rooms available.</p>
      ) : (
        <div className="rooms-grid">
          {publicRooms.map(room => (
            <div key={room.id} className="room-card glass" onClick={() => enterRoom(room)}>
              <div className="room-card-header">
                <span className="room-name">{room.name}</span>
                <i className="ph ph-globe" style={{ color: 'var(--text-secondary)' }}></i>
              </div>
              <div className="room-code">{room.roomCode}</div>
              <div className="room-meta">{room.members.length} member{room.members.length > 1 ? 's' : ''}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderCreate = () => (
    <div className="rooms-container">
      <div className="glass" style={{ padding: '1.5rem' }}>
        <button className="btn-icon" onClick={() => setView('list')}><i className="ph ph-arrow-left"></i></button>
        <h2 style={{ marginTop: '1rem' }}>Create Room</h2>
        <form onSubmit={handleCreate}>
          <div className="input-group">
            <label>Room Name</label>
            <input className="input-field" type="text" value={createForm.name} onChange={e => setCreateForm({...createForm, name: e.target.value})} required />
          </div>
          <div className="input-group">
            <label>Description (optional)</label>
            <input className="input-field" type="text" value={createForm.description} onChange={e => setCreateForm({...createForm, description: e.target.value})} />
          </div>
          <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '12px' }}>
            <label>Public</label>
            <input type="checkbox" checked={createForm.isPublic} onChange={e => setCreateForm({...createForm, isPublic: e.target.checked})} />
          </div>
          {!createForm.isPublic && (
            <div className="input-group">
              <label>Password</label>
              <input className="input-field" type="password" value={createForm.password} onChange={e => setCreateForm({...createForm, password: e.target.value})} />
            </div>
          )}
          {createError && <div className="error-msg">{createError}</div>}
          <button className="btn btn-primary" type="submit" style={{ width: '100%' }}>Create Room</button>
        </form>
      </div>
    </div>
  );

  const renderJoin = () => (
    <div className="rooms-container">
      <div className="glass" style={{ padding: '1.5rem' }}>
        <button className="btn-icon" onClick={() => setView('list')}><i className="ph ph-arrow-left"></i></button>
        <h2 style={{ marginTop: '1rem' }}>Join Room</h2>
        <form onSubmit={handleJoin}>
          <div className="input-group">
            <label>Room Code</label>
            <input className="input-field" type="text" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder="RC-XXXXX" />
          </div>
          <div className="input-group">
            <label>Password (if private)</label>
            <input className="input-field" type="password" value={joinPassword} onChange={e => setJoinPassword(e.target.value)} />
          </div>
          {joinError && <div className="error-msg">{joinError}</div>}
          <button className="btn btn-primary" type="submit" style={{ width: '100%' }}>Join Room</button>
        </form>
      </div>
    </div>
  );

  const renderChat = () => {
    if (!selectedRoom) return null;
    const isAdmin = selectedRoom.adminUID === currentUser.uid;

    return (
      <div className="duo-container chat-active">
        {/* Chat header with admin toggle */}
        <div className="chat-header">
          <button className="btn-icon" onClick={() => { setView('list'); setSelectedRoom(null); }}>
            <i className="ph ph-arrow-left"></i>
          </button>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <strong>{selectedRoom.name}</strong>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{selectedRoom.roomCode}</div>
          </div>
          <button className="btn-icon" onClick={() => setShowAdmin(!showAdmin)}>
            <i className={`ph ph-dots-three-vertical`}></i>
          </button>
        </div>

        {/* Admin panel (dropdown) */}
        {showAdmin && isAdmin && (
          <div className="admin-panel glass">
            <h4>Admin Controls</h4>
            <div className="input-group">
              <label>Rename Room</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input className="input-field" id="newName" type="text" defaultValue={selectedRoom.name} style={{ flex: 1 }} />
                <button className="btn btn-primary" onClick={() => handleAdminAction('updateName', document.getElementById('newName').value)}>Save</button>
              </div>
            </div>
            <button className="btn" onClick={() => handleAdminAction('togglePublic')}>
              {selectedRoom.isPublic ? 'Make Private' : 'Make Public'}
            </button>
            <div className="admin-members">
              <strong>Members ({selectedRoom.members.length})</strong>
              <ul>
                {selectedRoom.members.map(mid => (
                  <li key={mid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{mid === currentUser.uid ? 'You' : mid}</span>
                    {mid !== currentUser.uid && (
                      <button className="btn-icon" onClick={() => handleAdminAction('removeMember', mid)}>
                        <i className="ph ph-x" style={{ color: 'var(--danger)' }}></i>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <button className="btn" onClick={() => handleAdminAction('delete')} style={{ background: 'var(--danger)', color: 'white', marginTop: '12px' }}>
              Delete Room
            </button>
          </div>
        )}

        {/* Messages */}
        <div className="chat-messages">
          {messages.map(msg => (
            <div key={msg.id} className={`chat-bubble ${msg.senderId === currentUser.uid ? 'own' : 'other'}`}>
              <div className="bubble-text">{msg.text}</div>
              <div className="bubble-time">
                {msg.timestamp ? new Date(msg.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <form className="chat-input-area" onSubmit={sendMessage}>
          <input className="input-field" type="text" value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Type a message..." />
          <button type="submit" className="btn btn-primary"><i className="ph ph-paper-plane-right"></i></button>
        </form>
      </div>
    );
  };

  switch (view) {
    case 'create': return renderCreate();
    case 'join': return renderJoin();
    case 'chat': return renderChat();
    default: return renderList();
  }
}