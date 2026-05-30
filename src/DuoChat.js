import { useState, useEffect, useRef } from 'react';
import { doc, collection, addDoc, query, orderBy, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, getUserByCpCode } from './db.js';
import { useUser } from './UserContext.js';

export default function DuoChat() {
  const currentUser = useUser();
  const [view, setView] = useState('search'); // 'search' | 'chat'
  const [searchInput, setSearchInput] = useState('');
  const [foundUser, setFoundUser] = useState(null);
  const [searchError, setSearchError] = useState('');
  const [chatId, setChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef(null);

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
    const user = await getUserByCpCode(code);
    if (!user) {
      setSearchError('User not found');
      setFoundUser(null);
    } else {
      setFoundUser(user);
    }
  };

  // Start a chat with the found user (creates chat if not exists)
  const startChat = () => {
    if (!foundUser) return;
    // Create a deterministic chat ID by sorting UIDs
    const ids = [currentUser.uid, foundUser.uid].sort();
    const newChatId = `${ids[0]}_${ids[1]}`;
    setChatId(newChatId);

    // Ensure the chat document exists (just a placeholder)
    setDoc(doc(db, 'chats', newChatId), {
      participants: ids,
      lastMessage: '',
      updatedAt: serverTimestamp(),
    }, { merge: true });

    setView('chat');
  };

  // Listen to messages when chatId changes
  useEffect(() => {
    if (!chatId) return;

    const q = query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
      setMessages(msgs);
    });

    return () => unsubscribe();
  }, [chatId]);

  // Send a message
  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !chatId) return;

    await addDoc(collection(db, 'chats', chatId, 'messages'), {
      senderId: currentUser.uid,
      senderName: currentUser.displayName || currentUser.email,
      text: newMessage.trim(),
      timestamp: serverTimestamp(),
    });

    // Update last message in chat document
    await setDoc(doc(db, 'chats', chatId), {
      lastMessage: newMessage.trim(),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    setNewMessage('');
  };

  // Back to search
  const goBack = () => {
    setView('search');
    setFoundUser(null);
    setSearchError('');
    setChatId(null);
    setMessages([]);
  };

  // ============ RENDER ============
  if (view === 'search') {
    return (
      <div className="duo-container">
        <div className="glass" style={{ padding: '1.5rem' }}>
          <h2 style={{ marginBottom: '1rem' }}>Find a Friend</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.2rem', fontSize: '0.9rem' }}>
            Enter their 12‑digit CP code to start chatting.
          </p>

          <div className="input-group">
            <label>CP Code</label>
            <input
              className="input-field"
              type="text"
              placeholder="CP-123456789012"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>

          <button className="btn btn-primary" onClick={handleSearch} style={{ width: '100%' }}>
            Search
          </button>

          {searchError && (
            <div className="fade-in" style={{ marginTop: '12px', color: 'var(--danger)', fontSize: '0.9rem' }}>
              {searchError}
            </div>
          )}

          {foundUser && (
            <div className="glass" style={{ marginTop: '16px', padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <strong>{foundUser.displayName || foundUser.email}</strong>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{foundUser.cpCode}</div>
              </div>
              <button className="btn btn-primary" onClick={startChat} style={{ padding: '10px 20px' }}>
                Chat
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Chat view
  return (
    <div className="duo-container chat-active">
      {/* Chat header */}
      <div className="chat-header">
        <button className="btn-icon" onClick={goBack} title="Back">
          <i className="ph ph-arrow-left"></i>
        </button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <strong>{foundUser?.displayName || foundUser?.email}</strong>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{foundUser?.cpCode}</div>
        </div>
        <div style={{ width: '40px' }}></div> {/* spacer */}
      </div>

      {/* Messages area */}
      <div className="chat-messages">
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`chat-bubble ${msg.senderId === currentUser.uid ? 'own' : 'other'}`}
          >
            <div className="bubble-text">{msg.text}</div>
            <div className="bubble-time">
              {msg.timestamp ? new Date(msg.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <form className="chat-input-area" onSubmit={sendMessage}>
        <input
          type="text"
          className="input-field"
          placeholder="Type a message..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          autoFocus
        />
        <button type="submit" className="btn btn-primary" style={{ padding: '12px 16px' }}>
          <i className="ph ph-paper-plane-right"></i>
        </button>
      </form>
    </div>
  );
}