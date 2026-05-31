import React from 'react';
import { useState, useEffect, useRef } from 'react';
import {
  doc, collection, addDoc, query, orderBy, onSnapshot,
  setDoc, serverTimestamp, getDoc
} from 'firebase/firestore';
import { db, getUserByCpCode } from './db.js';
import { useUser } from './UserContext.js';

export default function DuoChat() {
  const currentUser = useUser();
  const [view, setView] = useState('search');
  const [searchInput, setSearchInput] = useState('');
  const [foundUser, setFoundUser] = useState(null);
  const [searchError, setSearchError] = useState('');
  const [chatId, setChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [typingUsers, setTypingUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Listen for typing
  useEffect(() => {
    if (!chatId) return;
    const typingRef = collection(db, 'chats', chatId, 'typing');
    const unsub = onSnapshot(typingRef, (snapshot) => {
      const uids = [];
      snapshot.forEach(d => uids.push(d.data().uid));
      setTypingUsers(uids.filter(u => u !== currentUser.uid));
    });
    return () => unsub();
  }, [chatId, currentUser.uid]);

  // Set typing
  const setTyping = async (isTyping) => {
    if (!chatId) return;
    const typingDoc = doc(db, 'chats', chatId, 'typing', currentUser.uid);
    if (isTyping) {
      await setDoc(typingDoc, { uid: currentUser.uid, timestamp: new Date() });
    } else {
      await setDoc(typingDoc, { uid: currentUser.uid, timestamp: new Date() }); // keep but we can delete
      // or simply delete it:
      // await deleteDoc(typingDoc);
    }
  };

  // Search user by CP code
  const handleSearch = async () => {
    const code = searchInput.trim().toUpperCase();
    if (!code.startsWith('CP-') || code.length !== 15) {
      setSearchError('Invalid CP code format (e.g., CP-123456789012)');
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

  // Start a chat with found user
  const startChat = () => {
    if (!foundUser) return;
    const ids = [currentUser.uid, foundUser.uid].sort();
    const newChatId = `${ids[0]}_${ids[1]}`;
    setChatId(newChatId);
    setDoc(doc(db, 'chats', newChatId), {
      participants: ids,
      lastMessage: '',
      updatedAt: serverTimestamp(),
    }, { merge: true });
    setView('chat');
  };

  // Listen to messages
  useEffect(() => {
    if (!chatId) return;
    const q = query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('timestamp', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setMessages(msgs);
    });
    return () => unsubscribe();
  }, [chatId]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !chatId) return;
    await addDoc(collection(db, 'chats', chatId, 'messages'), {
      senderId: currentUser.uid,
      senderName: currentUser.displayName || currentUser.email,
      text: newMessage.trim(),
      timestamp: serverTimestamp(),
    });
    await setDoc(doc(db, 'chats', chatId), {
      lastMessage: newMessage.trim(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    setNewMessage('');
  };

  const goBack = () => {
    setView('search');
    setFoundUser(null);
    setSearchError('');
    setChatId(null);
    setMessages([]);
  };

  // ============ RENDER SEARCH VIEW ============
  if (view === 'search') {
    return React.createElement('div', { className: 'duo-container' },
      React.createElement('div', { className: 'glass', style: { padding: '1.5rem' } },
        React.createElement('h2', { style: { marginBottom: '1rem' } }, 'Find a Friend'),
        React.createElement('p', { style: { color: 'var(--text-secondary)', marginBottom: '1.2rem', fontSize: '0.9rem' } },
          'Enter their 12‑digit CP code to start chatting.'),
        React.createElement('div', { className: 'input-group' },
          React.createElement('label', null, 'CP Code'),
          React.createElement('input', {
            className: 'input-field',
            type: 'text',
            placeholder: 'CP-123456789012',
            value: searchInput,
            onChange: (e) => setSearchInput(e.target.value.toUpperCase()),
            onKeyDown: (e) => e.key === 'Enter' && handleSearch()
          })
        ),
        React.createElement('button', { className: 'btn btn-primary', onClick: handleSearch, style: { width: '100%' } },
          'Search'
        ),
        searchError && React.createElement('div', { className: 'fade-in', style: { marginTop: '12px', color: 'var(--danger)', fontSize: '0.9rem' } }, searchError),
        foundUser && React.createElement('div', { className: 'glass', style: { marginTop: '16px', padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
          React.createElement('div', null,
            React.createElement('strong', null, foundUser.displayName || foundUser.email),
            React.createElement('div', { style: { fontSize: '0.8rem', color: 'var(--text-secondary)' } }, foundUser.cpCode)
          ),
          React.createElement('button', { className: 'btn btn-primary', onClick: startChat, style: { padding: '10px 20px' } }, 'Chat')
        )
      )
    );
  }

  // ============ RENDER CHAT VIEW ============
  const chatHeader = React.createElement('div', { className: 'chat-header' },
    React.createElement('button', { className: 'btn-icon', onClick: goBack, title: 'Back' },
      React.createElement('i', { className: 'ph ph-arrow-left' })
    ),
    React.createElement('div', { style: { flex: 1, textAlign: 'center' } },
      React.createElement('strong', null, foundUser?.displayName || foundUser?.email),
      React.createElement('div', { style: { fontSize: '0.75rem', color: 'var(--text-secondary)' } }, foundUser?.cpCode)
    ),
    React.createElement('div', { style: { width: '40px' } }) // spacer
  );

  const typingIndicator = typingUsers.length > 0 ? React.createElement('div', {
    style: { fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '4px 16px' }
  }, typingUsers.length === 1 ? 'Someone is typing...' : 'Several people are typing...') : null;

  const messageElements = messages.map(msg =>
    React.createElement('div', {
      key: msg.id,
      className: `chat-bubble ${msg.senderId === currentUser.uid ? 'own' : 'other'}`
    },
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
    React.createElement('input', {
      type: 'text',
      className: 'input-field',
      placeholder: 'Type a message...',
      value: newMessage,
      onChange: (e) => setNewMessage(e.target.value),
      onFocus: () => setTyping(true),
      onBlur: () => setTyping(false),
      autoFocus: true
    }),
    React.createElement('button', { type: 'submit', className: 'btn btn-primary', style: { padding: '12px 16px' } },
      React.createElement('i', { className: 'ph ph-paper-plane-right' })
    )
  );

  return React.createElement('div', { className: 'duo-container chat-active' },
    chatHeader,
    typingIndicator,
    messagesArea,
    inputArea
  );
                        }
