import React, { useState, useEffect, useRef } from 'react';
import {
  collection, query, orderBy, onSnapshot,
  addDoc, serverTimestamp, where
} from 'firebase/firestore';
import {
  db,
  getUserByCpCode,
  getUserProfile,
  sendFriendRequest,
  listenFriendRequests,
  acceptFriendRequest,
  declineFriendRequest,
  setChatTyping,
  listenChatTyping,
  listenUserPresence,
  uploadFile
} from './db.js';
import { useUser } from './UserContext.js';

export default function DuoChat() {
  const currentUser = useUser();
  const [view, setView] = useState('main'); // 'main', 'search', 'chat', 'requests'
  const [searchInput, setSearchInput] = useState('');
  const [foundUser, setFoundUser] = useState(null);
  const [searchError, setSearchError] = useState('');
  const [chatId, setChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [typingUsers, setTypingUsers] = useState([]);
  const [friendPresence, setFriendPresence] = useState(null);
  const [friendRequests, setFriendRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Friend requests listener
  useEffect(() => {
    const unsub = listenFriendRequests(currentUser.uid, setFriendRequests);
    return () => unsub();
  }, [currentUser.uid]);

  // Typing listener
  useEffect(() => {
    if (!chatId) return;
    const unsub = listenChatTyping(chatId, setTypingUsers);
    return () => unsub();
  }, [chatId]);

  // Friend presence
  useEffect(() => {
    if (!chatId || !foundUser) return;
    const unsub = listenUserPresence(foundUser.uid, setFriendPresence);
    return () => unsub();
  }, [chatId, foundUser]);

  // Messages listener
  useEffect(() => {
    if (!chatId) return;
    const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('timestamp', 'asc'));
    const unsub = onSnapshot(q, snapshot => {
      const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setMessages(msgs);
    });
    return () => unsub();
  }, [chatId]);

  const handleSearch = async () => {
    const code = searchInput.trim().toUpperCase();
    if (!code.startsWith('CP-') || code.length !== 15) {
      setSearchError('Invalid CP code format');
      setFoundUser(null);
      return;
    }
    if (code === currentUser.cpCode) {
      setSearchError('You cannot chat with yourself');
      setFoundUser(null);
      return;
    }
    setSearchError('');
    setLoading(true);
    const user = await getUserByCpCode(code);
    setLoading(false);
    if (!user) {
      setSearchError('User not found');
      setFoundUser(null);
    } else {
      setFoundUser(user);
    }
  };

  const handleSendRequest = async () => {
    try {
      await sendFriendRequest(currentUser.uid, foundUser.cpCode);
      alert('Friend request sent!');
      setView('main');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleAcceptRequest = async (requestId) => {
    try {
      const { chatId: newChatId, friendId } = await acceptFriendRequest(requestId, currentUser.uid);
      const friendProfile = await getUserProfile(friendId);
      setChatId(newChatId);
      setFoundUser(friendProfile);
      setView('chat');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeclineRequest = async (requestId) => {
    await declineFriendRequest(requestId, currentUser.uid);
  };

  const openChat = async (friendId) => {
    const ids = [currentUser.uid, friendId].sort();
    const chatId = `${ids[0]}_${ids[1]}`;
    setChatId(chatId);
    const profile = await getUserProfile(friendId);
    setFoundUser(profile);
    setView('chat');
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !chatId) return;
    await addDoc(collection(db, 'chats', chatId, 'messages'), {
      senderId: currentUser.uid,
      senderName: currentUser.displayName || currentUser.email,
      text: newMessage.trim(),
      timestamp: serverTimestamp(),
    });
    setNewMessage('');
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const path = `chat-files/${chatId}/${Date.now()}_${file.name}`;
      const url = await uploadFile(file, path);
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        senderId: currentUser.uid,
        senderName: currentUser.displayName || currentUser.email,
        text: `📎 ${file.name}`,
        fileUrl: url,
        timestamp: serverTimestamp(),
      });
    } catch (err) {
      alert('Upload failed: ' + err.message);
    }
    setUploading(false);
    e.target.value = '';
  };

  const handleTyping = (isTyping) => {
    if (chatId) setChatTyping(chatId, currentUser.uid, isTyping);
  };

  // ---------- Render Views ----------
  const MainView = () => {
    const [friends, setFriends] = useState([]);
    useEffect(() => {
      const q = query(collection(db, 'chats'), where('participants', 'array-contains', currentUser.uid));
      const unsub = onSnapshot(q, snapshot => {
        const friendList = [];
        snapshot.forEach(d => {
          const data = d.data();
          const friendId = data.participants.find(id => id !== currentUser.uid);
          friendList.push({ chatId: d.id, friendId });
        });
        setFriends(friendList);
      });
      return () => unsub();
    }, [currentUser.uid]);

    return React.createElement('div', { className: 'duo-container' },
      React.createElement('div', { className: 'glass', style: { padding: '1.5rem' } },
        React.createElement('h2', null, 'Duo Chat'),
        React.createElement('div', { className: 'btn-group', style: { margin: '1rem 0', display: 'flex', gap: '8px' } },
          React.createElement('button', { className: 'btn btn-primary', onClick: () => setView('search') },
            React.createElement('i', { className: 'ph ph-magnifying-glass' }), ' Find Friend'),
          React.createElement('button', { className: 'btn', onClick: () => setView('requests') },
            'Requests (', friendRequests.length, ')')
        ),
        React.createElement('h3', null, 'Your Friends'),
        friends.length === 0 ? React.createElement('p', { className: 'text-secondary' }, 'No friends yet. Search by CP code to add.') :
        React.createElement('div', { className: 'rooms-grid' },
          friends.map(f => {
            const [friendProfile, setFriendProfile] = useState(null);
            useEffect(() => {
              getUserProfile(f.friendId).then(setFriendProfile);
            }, [f.friendId]);
            if (!friendProfile) return null;
            return React.createElement('div', {
              key: f.chatId, className: 'room-card glass', onClick: () => openChat(f.friendId)
            },
              React.createElement('div', { className: 'room-card-header' },
                React.createElement('span', null, friendProfile.displayName || friendProfile.email),
                friendProfile.online && React.createElement('span', { className: 'online-dot' })
              ),
              React.createElement('div', { className: 'room-code' }, friendProfile.cpCode)
            );
          })
        )
      )
    );
  };

  const SearchView = () => React.createElement('div', { className: 'duo-container' },
    React.createElement('div', { className: 'glass', style: { padding: '1.5rem' } },
      React.createElement('button', { className: 'btn-icon', onClick: () => setView('main') },
        React.createElement('i', { className: 'ph ph-arrow-left' })),
      React.createElement('h2', null, 'Find Friend'),
      React.createElement('div', { className: 'input-group' },
        React.createElement('label', null, 'CP Code'),
        React.createElement('input', { className: 'input-field', type: 'text', placeholder: 'CP-123456789012', value: searchInput, onChange: e => setSearchInput(e.target.value.toUpperCase()), onKeyDown: e => e.key === 'Enter' && handleSearch() })
      ),
      React.createElement('button', { className: 'btn btn-primary', onClick: handleSearch, style: { width: '100%' } }, 'Search'),
      searchError && React.createElement('div', { className: 'fade-in error-msg' }, searchError),
      foundUser && React.createElement('div', { className: 'glass', style: { marginTop: '1rem', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        React.createElement('div', null,
          React.createElement('strong', null, foundUser.displayName || foundUser.email),
          React.createElement('div', { style: { fontSize: '0.8rem', color: 'var(--text-secondary)' } }, foundUser.cpCode)
        ),
        React.createElement('button', { className: 'btn btn-primary', onClick: handleSendRequest }, 'Add Friend')
      )
    )
  );

  const RequestsView = () => React.createElement('div', { className: 'duo-container' },
    React.createElement('div', { className: 'glass', style: { padding: '1.5rem' } },
      React.createElement('button', { className: 'btn-icon', onClick: () => setView('main') },
        React.createElement('i', { className: 'ph ph-arrow-left' })),
      React.createElement('h2', null, 'Friend Requests'),
      friendRequests.length === 0 ? React.createElement('p', { className: 'text-secondary' }, 'No pending requests') :
      React.createElement('div', { className: 'rooms-grid' },
        friendRequests.map(req =>
          React.createElement('div', { key: req.id, className: 'room-card glass', style: { display: 'flex', justifyContent: 'space-between' } },
            React.createElement('div', null,
              React.createElement('strong', null, req.from),
              React.createElement('div', { style: { fontSize: '0.8rem' } }, 'wants to be friends')
            ),
            React.createElement('div', { style: { display: 'flex', gap: '8px' } },
              React.createElement('button', { className: 'btn btn-primary', onClick: () => handleAcceptRequest(req.id) }, 'Accept'),
              React.createElement('button', { className: 'btn', onClick: () => handleDeclineRequest(req.id) }, 'Decline')
            )
          )
        )
      )
    )
  );

  const ChatView = () => {
    if (!foundUser) return null;
    const isOnline = friendPresence?.online;
    return React.createElement('div', { className: 'duo-container chat-active' },
      React.createElement('div', { className: 'chat-header' },
        React.createElement('button', { className: 'btn-icon', onClick: () => { setView('main'); setChatId(null); } },
          React.createElement('i', { className: 'ph ph-arrow-left' })),
        React.createElement('div', { style: { flex: 1, textAlign: 'center' } },
          React.createElement('strong', null, foundUser.displayName || foundUser.email),
          React.createElement('div', { style: { fontSize: '0.75rem', color: 'var(--text-secondary)' } },
            isOnline ? '🟢 Online' : '⚫ Offline')
        ),
        React.createElement('div', { style: { width: '40px' } })
      ),
      typingUsers.length > 0 && React.createElement('div', { style: { fontStyle: 'italic', padding: '4px 16px', color: 'var(--text-secondary)' } }, 'Typing...'),
      React.createElement('div', { className: 'chat-messages' },
        messages.map(msg =>
          React.createElement('div', { key: msg.id, className: `chat-bubble ${msg.senderId === currentUser.uid ? 'own' : 'other'}` },
            msg.fileUrl ? React.createElement('a', { href: msg.fileUrl, target: '_blank' }, msg.text) : React.createElement('div', { className: 'bubble-text' }, msg.text),
            React.createElement('div', { className: 'bubble-time' },
              msg.timestamp ? new Date(msg.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
            )
          )
        ),
        React.createElement('div', { ref: messagesEndRef })
      ),
      React.createElement('form', { className: 'chat-input-area', onSubmit: sendMessage },
        React.createElement('input', { type: 'file', ref: fileInputRef, style: { display: 'none' }, onChange: handleFileUpload }),
        React.createElement('button', { type: 'button', className: 'btn-icon', onClick: () => fileInputRef.current.click(), disabled: uploading },
          React.createElement('i', { className: 'ph ph-paperclip' })),
        React.createElement('input', { className: 'input-field', type: 'text', value: newMessage, onChange: e => setNewMessage(e.target.value), placeholder: 'Type a message...', onFocus: () => handleTyping(true), onBlur: () => handleTyping(false) }),
        React.createElement('button', { type: 'submit', className: 'btn btn-primary' },
          React.createElement('i', { className: 'ph ph-paper-plane-right' }))
      )
    );
  };

  switch (view) {
    case 'search': return SearchView();
    case 'requests': return RequestsView();
    case 'chat': return ChatView();
    default: return MainView();
  }
                                       }
