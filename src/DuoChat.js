import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection, query, orderBy, onSnapshot,
  addDoc, serverTimestamp, where, doc,
  updateDoc, getDocs, limit
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
  unfriend,
  deleteMessage,
  searchUsersByName
} from './db.js';
import { useUser } from './UserContext.js';

// Reaction types mapped to Phosphor icons
const REACTION_TYPES = [
  { type: 'like', icon: 'ph-thumbs-up', label: 'Like' },
  { type: 'love', icon: 'ph-heart', label: 'Love' },
  { type: 'laugh', icon: 'ph-smiley', label: 'Laugh' },
  { type: 'wow', icon: 'ph-smiley-wink', label: 'Wow' },
  { type: 'sad', icon: 'ph-smiley-sad', label: 'Sad' },
  { type: 'angry', icon: 'ph-smiley-angry', label: 'Angry' },
  { type: 'clap', icon: 'ph-hand-clapping', label: 'Clap' },
  { type: 'fire', icon: 'ph-fire', label: 'Fire' },
];

export default function DuoChat() {
  const currentUser = useUser();
  const [view, setView] = useState('main');
  const [searchInput, setSearchInput] = useState('');
  const [searchByNameInput, setSearchByNameInput] = useState('');
  const [foundUser, setFoundUser] = useState(null);
  const [searchError, setSearchError] = useState('');
  const [chatId, setChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [typingUsers, setTypingUsers] = useState([]);
  const [friendPresence, setFriendPresence] = useState(null);
  const [friendRequests, setFriendRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [friends, setFriends] = useState([]);
  const [replyTo, setReplyTo] = useState(null);
  const [editMessage, setEditMessage] = useState(null);
  const [forwardMessage, setForwardMessage] = useState(null); // renamed for clarity
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [searchInChat, setSearchInChat] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const messagesEndRef = useRef(null);

  // Scroll to bottom
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, view]);

  // Friend requests listener
  useEffect(() => {
    if (!currentUser?.uid) return;
    const unsub = listenFriendRequests(currentUser.uid, setFriendRequests);
    return () => unsub();
  }, [currentUser?.uid]);

  // Friends list listener
  useEffect(() => {
    if (!currentUser?.uid) return;
    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', currentUser.uid)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const friendList = [];
      snapshot.forEach((d) => {
        const data = d.data();
        const friendId = data.participants.find((id) => id !== currentUser.uid);
        if (friendId) friendList.push({ chatId: d.id, friendId });
      });
      setFriends(friendList);
    });
    return () => unsub();
  }, [currentUser?.uid]);

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
    const q = query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('timestamp', 'asc')
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setMessages(msgs);
    });
    return () => unsub();
  }, [chatId]);

  // Search in chat messages
  useEffect(() => {
    if (!searchInChat.trim()) {
      setSearchResults([]);
      return;
    }
    const q = searchInChat.toLowerCase();
    const results = messages.filter(m =>
      m.text?.toLowerCase().includes(q) ||
      m.senderName?.toLowerCase().includes(q)
    );
    setSearchResults(results);
  }, [searchInChat, messages]);

  // Check if user is already a friend
  const isFriend = useCallback((uid) => friends.some((f) => f.friendId === uid), [friends]);

  // Search by CP code
  const handleSearchByCode = async () => {
    const code = searchInput.trim().toUpperCase();
    if (!code.startsWith('CP-') || code.length !== 13) {
      setSearchError('Invalid CP code format (e.g., CP-1234567890)');
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

  // Search by name
  const handleSearchByName = async () => {
    if (!searchByNameInput.trim()) return;
    setLoading(true);
    const results = await searchUsersByName(searchByNameInput.trim(), currentUser.uid);
    setLoading(false);
    if (results.length === 0) {
      setSearchError('No users found');
      setFoundUser(null);
    } else {
      setFoundUser(results[0]);
      setSearchError('');
    }
  };

  // Send friend request
  const handleSendRequest = async () => {
    try {
      await sendFriendRequest(currentUser.uid, foundUser.cpCode);
      alert('Friend request sent!');
      setView('main');
    } catch (err) {
      alert(err.message);
    }
  };

  // Accept request
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

  // Decline request
  const handleDeclineRequest = async (requestId) => {
    await declineFriendRequest(requestId, currentUser.uid);
  };

  // Open chat
  const openChat = async (friendId) => {
    const ids = [currentUser.uid, friendId].sort();
    const chatId = `${ids[0]}_${ids[1]}`;
    setChatId(chatId);
    const profile = await getUserProfile(friendId);
    setFoundUser(profile);
    setView('chat');
    setShowSearchBar(false);
    setSearchInChat('');
    setSearchResults([]);
  };

  // Send message (also handles edit and forward)
  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    const text = newMessage.trim();
    if (!text && !forwardMessage) return;
    if (!chatId) return;

    const msgData = {
      senderId: currentUser.uid,
      senderName: currentUser.displayName || currentUser.email,
      text: text || '',
      timestamp: serverTimestamp(),
      reactions: {}
    };

    if (replyTo) {
      msgData.replyTo = { id: replyTo.id, text: replyTo.text, senderName: replyTo.senderName };
    }

    if (forwardMessage) {
      msgData.forwardedFrom = { id: forwardMessage.id, text: forwardMessage.text, senderName: forwardMessage.senderName };
      msgData.text = text || forwardMessage.text;
    }

    if (editMessage) {
      // Update existing message
      await updateDoc(doc(db, 'chats', chatId, 'messages', editMessage.id), {
        text: text,
        edited: true,
        editedAt: serverTimestamp()
      });
      setEditMessage(null);
      setNewMessage('');
      return;
    }

    await addDoc(collection(db, 'chats', chatId, 'messages'), msgData);
    setNewMessage('');
    setReplyTo(null);
    setForwardMessage(null);
    handleTyping(false);
  };

  // Typing handler
  const handleTyping = useCallback((isTyping) => {
    if (chatId) setChatTyping(chatId, currentUser.uid, isTyping);
  }, [chatId, currentUser?.uid]);

  // Delete message
  const handleDeleteMessage = async (msgId) => {
    if (confirm('Delete this message?')) {
      await deleteMessage(`chats/${chatId}/messages/${msgId}`, currentUser.uid);
    }
  };

  // Add or remove a reaction
  const handleAddReaction = async (msgId, reactionType) => {
    if (!chatId) return;
    const msgRef = doc(db, 'chats', chatId, 'messages', msgId);
    const msg = messages.find(m => m.id === msgId);
    if (!msg) return;
    const reactions = msg.reactions || {};
    const users = reactions[reactionType] || [];
    if (users.includes(currentUser.uid)) {
      // Remove reaction
      reactions[reactionType] = users.filter(uid => uid !== currentUser.uid);
      if (reactions[reactionType].length === 0) delete reactions[reactionType];
    } else {
      // Add reaction
      reactions[reactionType] = [...users, currentUser.uid];
    }
    await updateDoc(msgRef, { reactions });
  };

  // Edit message
  const handleEditMessage = (msg) => {
    if (msg.senderId !== currentUser.uid) return;
    setEditMessage(msg);
    setNewMessage(msg.text);
    setReplyTo(null);
    setForwardMessage(null);
  };

  // Forward message
  const handleForwardMessage = (msg) => {
    setForwardMessage(msg);
    setNewMessage('');
    setReplyTo(null);
    setEditMessage(null);
  };

  // Unfriend
  const handleUnfriend = async (friendId) => {
    if (confirm('Remove this friend?')) {
      await unfriend(currentUser.uid, friendId);
      setChatId(null);
      setFoundUser(null);
      setView('main');
    }
  };

  // Block user (placeholder)
  const handleBlockUser = () => {
    if (confirm('Block this user?')) {
      alert('User blocked (feature not yet implemented).');
    }
  };

  // Export chat
  const handleExportChat = () => {
    const text = messages.map(m =>
      `[${m.timestamp?.toDate?.()?.toLocaleTimeString() || '??'}] ${m.senderName}: ${m.text}`
    ).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-export-${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ---------- Render helpers ----------

  // Friend card with avatar and unfriend button
  const FriendCard = ({ friendId }) => {
    const [friendProfile, setFriendProfile] = useState(null);
    useEffect(() => {
      getUserProfile(friendId).then(setFriendProfile);
    }, [friendId]);

    if (!friendProfile) return null;
    const initials = (friendProfile.displayName || friendProfile.email || '?').slice(0, 2).toUpperCase();

    return React.createElement('div', { className: 'room-card glass', style: { position: 'relative', padding: '16px' } },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', cursor: 'pointer' }, onClick: () => openChat(friendId) },
        React.createElement('div', { style: { width: '48px', height: '48px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.2rem', color: 'white' } }, initials),
        React.createElement('div', { style: { flex: 1, marginLeft: '12px' } },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            React.createElement('strong', null, friendProfile.displayName || friendProfile.email),
            friendProfile.online && React.createElement('span', { className: 'online-dot' })
          ),
          React.createElement('div', { style: { fontSize: '0.8rem', color: 'var(--text-secondary)' } }, friendProfile.status || friendProfile.cpCode)
        )
      ),
      React.createElement('button', {
        className: 'btn-icon',
        style: { position: 'absolute', top: '8px', right: '8px', color: 'var(--danger)' },
        onClick: (e) => { e.stopPropagation(); handleUnfriend(friendId); }
      }, React.createElement('i', { className: 'ph ph-user-minus' }))
    );
  };

  // Request card
  const RequestCard = ({ req }) => {
    const [sender, setSender] = useState(null);
    useEffect(() => {
      getUserProfile(req.from).then(setSender);
    }, [req.from]);

    if (!sender) {
      return React.createElement('div', { className: 'room-card glass', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' } },
        React.createElement('div', null, React.createElement('strong', null, 'Loading...'))
      );
    }
    const initials = (sender.displayName || sender.email || '?').slice(0, 2).toUpperCase();

    return React.createElement('div', { className: 'room-card glass', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' } },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', flex: 1, overflow: 'hidden' } },
        React.createElement('div', { style: { width: '40px', height: '40px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1rem', color: 'white' } }, initials),
        React.createElement('div', { style: { overflow: 'hidden', flex: 1 } },
          React.createElement('strong', null, sender.displayName || sender.email),
          React.createElement('div', { style: { fontSize: '0.8rem', color: 'var(--text-secondary)' } }, sender.cpCode)
        )
      ),
      React.createElement('div', { style: { display: 'flex', gap: '8px', marginLeft: '12px', flexShrink: 0 } },
        React.createElement('button', { className: 'btn btn-primary', onClick: () => handleAcceptRequest(req.id), style: { padding: '8px 16px' } }, 'Accept'),
        React.createElement('button', { className: 'btn', onClick: () => handleDeclineRequest(req.id), style: { padding: '8px 16px' } }, 'Decline')
      )
    );
  };

  // Message bubble
  const MessageBubble = ({ msg }) => {
    const isOwn = msg.senderId === currentUser.uid;
    const reactions = msg.reactions || {};
    const hasReactions = Object.keys(reactions).length > 0;
    const isEdited = msg.edited === true;
    const hasReply = msg.replyTo;
    const isForwarded = msg.forwardedFrom;

    const timeStr = msg.timestamp?.toDate?.()?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || '';

    // Reaction pills
    const reactionPills = hasReactions ? React.createElement('div', { className: 'reactions-bar', style: { marginTop: '4px', display: 'flex', gap: '4px', flexWrap: 'wrap' } },
      Object.entries(reactions).map(([type, users]) => {
        const reactionDef = REACTION_TYPES.find(r => r.type === type);
        const iconName = reactionDef ? reactionDef.icon : 'ph-thumbs-up';
        return React.createElement('span', {
          key: type,
          className: 'reaction-item',
          style: { display: 'inline-flex', alignItems: 'center', gap: '2px', background: 'var(--surface)', borderRadius: '12px', padding: '0 6px', cursor: 'pointer' },
          onClick: () => handleAddReaction(msg.id, type)
        },
          React.createElement('i', { className: iconName + ' reaction-icon', style: { fontSize: '0.9rem' } }),
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
    const forwardIndicator = isForwarded ? React.createElement('div', { style: { fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '2px' } },
      'Forwarded from ', msg.forwardedFrom.senderName
    ) : null;

    // Message actions row
    const messageActions = React.createElement('div', { className: 'message-actions', style: { display: 'flex', gap: '2px', marginTop: '4px', justifyContent: 'flex-end', opacity: 0.6 } },
      React.createElement('button', { className: 'btn-icon', style: { fontSize: '0.7rem' }, title: 'Reply', onClick: () => setReplyTo({ id: msg.id, text: msg.text, senderName: msg.senderName }) },
        React.createElement('i', { className: 'ph ph-arrow-bend-left-up' })),
      React.createElement('button', { className: 'btn-icon', style: { fontSize: '0.7rem' }, title: 'Forward', onClick: () => handleForwardMessage(msg) },
        React.createElement('i', { className: 'ph ph-arrow-bend-right-down' })),
      isOwn && React.createElement('button', { className: 'btn-icon', style: { fontSize: '0.7rem', color: 'var(--accent)' }, title: 'Edit', onClick: () => handleEditMessage(msg) },
        React.createElement('i', { className: 'ph ph-pencil-simple' })),
      React.createElement('button', { className: 'btn-icon', style: { fontSize: '0.7rem', color: 'var(--danger)' }, title: 'Delete', onClick: () => handleDeleteMessage(msg.id) },
        React.createElement('i', { className: 'ph ph-trash' }))
    );

    // Quick reaction buttons
    const quickReactions = React.createElement('div', { style: { display: 'flex', gap: '2px', marginTop: '2px', flexWrap: 'wrap' } },
      REACTION_TYPES.slice(0, 5).map(reactionDef =>
        React.createElement('button', {
          key: reactionDef.type,
          className: 'btn-icon',
          style: { fontSize: '0.8rem', padding: '0 2px' },
          title: reactionDef.label,
          onClick: () => handleAddReaction(msg.id, reactionDef.type)
        }, React.createElement('i', { className: reactionDef.icon }))
      )
    );

    return React.createElement('div', {
      key: msg.id,
      className: `chat-bubble ${isOwn ? 'own' : 'other'}`,
      style: {
        maxWidth: '80%', padding: '10px 14px', borderRadius: '18px',
        wordWrap: 'break-word', fontSize: '0.95rem', position: 'relative',
        alignSelf: isOwn ? 'flex-end' : 'flex-start',
        background: isOwn ? 'var(--accent)' : 'var(--surface)',
        color: isOwn ? 'white' : 'var(--text-primary)',
        border: isOwn ? 'none' : '1px solid var(--border)',
        borderBottomRightRadius: isOwn ? '4px' : '18px',
        borderBottomLeftRadius: isOwn ? '18px' : '4px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }
    },
      replyPreview,
      forwardIndicator,
      React.createElement('div', { className: 'bubble-text' }, msg.text),
      isEdited && React.createElement('span', { style: { fontSize: '0.6rem', opacity: 0.6, marginLeft: '4px' } }, '(edited)'),
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' } },
        React.createElement('div', { className: 'bubble-time', style: { fontSize: '0.6rem', opacity: 0.7 } }, timeStr),
        messageActions
      ),
      quickReactions,
      reactionPills
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

  // ---------- Main views ----------
  const renderMainView = () =>
    React.createElement('div', { className: 'duo-container', style: { padding: '16px' } },
      React.createElement('div', { className: 'glass', style: { padding: '1.5rem', borderRadius: '20px' } },
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' } },
          React.createElement('h2', { style: { margin: 0 } }, 'Duo Chat'),
          React.createElement('div', { style: { display: 'flex', gap: '8px' } },
            React.createElement('button', { className: 'btn', onClick: () => setView('search'), style: { padding: '8px 16px' } },
              React.createElement('i', { className: 'ph ph-magnifying-glass' }), ' Find'),
            React.createElement('button', { className: 'btn', onClick: () => setView('requests'), style: { padding: '8px 16px' } },
              'Requests', friendRequests.length > 0 ? ` (${friendRequests.length})` : '')
          )
        ),
        React.createElement('h3', { style: { marginBottom: '12px', fontSize: '1rem', color: 'var(--text-secondary)' } }, 'Your Friends'),
        friends.length === 0
          ? React.createElement('div', { style: { textAlign: 'center', padding: '2rem 0', color: 'var(--text-secondary)' } },
              React.createElement('i', { className: 'ph ph-users', style: { fontSize: '3rem', opacity: 0.3 } }),
              React.createElement('p', null, 'No friends yet. Search by CP code or name to add.')
            )
          : React.createElement('div', { className: 'rooms-grid', style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
              friends.map((f) => React.createElement(FriendCard, { key: f.chatId, friendId: f.friendId }))
            )
      )
    );

  const renderSearchView = () => {
    const alreadyFriend = foundUser ? isFriend(foundUser.uid) : false;
    return React.createElement('div', { className: 'duo-container', style: { padding: '16px' } },
      React.createElement('div', { className: 'glass', style: { padding: '1.5rem', borderRadius: '20px' } },
        React.createElement('button', { className: 'btn-icon', onClick: () => setView('main'), style: { marginBottom: '12px' } },
          React.createElement('i', { className: 'ph ph-arrow-left' })),
        React.createElement('h2', { style: { marginBottom: '1rem' } }, 'Find Friend'),
        React.createElement('div', { className: 'input-group' },
          React.createElement('label', null, 'Search by CP Code'),
          React.createElement('div', { style: { display: 'flex', gap: '8px' } },
            React.createElement('input', { className: 'input-field', type: 'text', placeholder: 'CP-1234567890', value: searchInput, onChange: (e) => setSearchInput(e.target.value.toUpperCase()), onKeyDown: (e) => e.key === 'Enter' && handleSearchByCode(), style: { flex: 1 } }),
            React.createElement('button', { className: 'btn btn-primary', onClick: handleSearchByCode, style: { padding: '0 20px' } }, React.createElement('i', { className: 'ph ph-magnifying-glass' }))
          )
        ),
        React.createElement('div', { className: 'input-group', style: { marginTop: '12px' } },
          React.createElement('label', null, 'Search by Name'),
          React.createElement('div', { style: { display: 'flex', gap: '8px' } },
            React.createElement('input', { className: 'input-field', type: 'text', placeholder: 'Display name', value: searchByNameInput, onChange: (e) => setSearchByNameInput(e.target.value), onKeyDown: (e) => e.key === 'Enter' && handleSearchByName(), style: { flex: 1 } }),
            React.createElement('button', { className: 'btn', onClick: handleSearchByName, style: { padding: '0 20px' } }, React.createElement('i', { className: 'ph ph-magnifying-glass' }))
          )
        ),
        searchError && React.createElement('div', { className: 'fade-in', style: { color: 'var(--danger)', padding: '8px', background: 'rgba(239,68,68,0.1)', borderRadius: '8px', marginTop: '8px' } }, searchError),
        foundUser && React.createElement('div', { className: 'glass', style: { marginTop: '1rem', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '16px' } },
          React.createElement('div', null,
            React.createElement('strong', { style: { fontSize: '1.1rem' } }, foundUser.displayName || foundUser.email),
            React.createElement('div', { style: { fontSize: '0.85rem', color: 'var(--text-secondary)' } }, foundUser.cpCode),
            foundUser.status && React.createElement('div', { style: { fontSize: '0.8rem', color: 'var(--text-secondary)' } }, foundUser.status)
          ),
          alreadyFriend
            ? React.createElement('button', { className: 'btn btn-primary', onClick: () => openChat(foundUser.uid) },
                React.createElement('i', { className: 'ph ph-chat-circle-dots' }), ' Message')
            : React.createElement('button', { className: 'btn btn-primary', onClick: handleSendRequest },
                React.createElement('i', { className: 'ph ph-user-plus' }), ' Add Friend')
        )
      )
    );
  };

  const renderRequestsView = () =>
    React.createElement('div', { className: 'duo-container', style: { padding: '16px' } },
      React.createElement('div', { className: 'glass', style: { padding: '1.5rem', borderRadius: '20px' } },
        React.createElement('button', { className: 'btn-icon', onClick: () => setView('main'), style: { marginBottom: '12px' } },
          React.createElement('i', { className: 'ph ph-arrow-left' })),
        React.createElement('h2', { style: { marginBottom: '1rem' } }, 'Friend Requests'),
        friendRequests.length === 0
          ? React.createElement('p', { className: 'text-secondary', style: { textAlign: 'center', padding: '2rem 0' } }, 'No pending requests')
          : React.createElement('div', { className: 'rooms-grid', style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
              friendRequests.map((req) => React.createElement(RequestCard, { key: req.id, req }))
            )
      )
    );

  const renderChatView = () => {
    if (!foundUser) return null;
    const isOnline = friendPresence?.online;
    const initials = (foundUser.displayName || foundUser.email || '?').slice(0, 2).toUpperCase();
    const typingFromFriend = typingUsers.includes(foundUser.uid);

    // Group messages by date
    const groupedMessages = [];
    let currentDate = null;
    messages.forEach(msg => {
      const date = msg.timestamp?.toDate?.()?.toLocaleDateString() || '';
      if (date !== currentDate) {
        currentDate = date;
        if (date) {
          groupedMessages.push({ type: 'date', date, key: `date-${date}` });
        }
      }
      groupedMessages.push({ type: 'message', msg, key: msg.id });
    });

    // Filter messages by search query
    const filteredGrouped = searchInChat.trim() ? groupedMessages.filter(item =>
      item.type === 'message' && (
        item.msg.text?.toLowerCase().includes(searchInChat.toLowerCase()) ||
        item.msg.senderName?.toLowerCase().includes(searchInChat.toLowerCase())
      )
    ) : groupedMessages;

    const messageElements = filteredGrouped.map((item) => {
      if (item.type === 'date') {
        return React.createElement(DateSeparator, { key: item.key, date: item.date });
      }
      return React.createElement(MessageBubble, { key: item.key, msg: item.msg });
    });

    // Typing indicator
    const typingIndicator = typingFromFriend ? React.createElement('div', { style: { fontStyle: 'italic', padding: '4px 16px', color: 'var(--text-secondary)', fontSize: '0.85rem' } },
      foundUser.displayName || foundUser.email, ' is typing...'
    ) : null;

    // Reply/Edit/Forward bars
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

    return React.createElement('div', { className: 'duo-container chat-active', style: { height: 'calc(100vh - 160px)', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)', borderRadius: '20px', overflow: 'hidden' } },
      // Chat header
      React.createElement('div', { className: 'chat-header', style: { display: 'flex', alignItems: 'center', padding: '12px 16px', background: 'var(--surface)', backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 5 } },
        React.createElement('button', { className: 'btn-icon', onClick: () => { setView('main'); setChatId(null); setShowSearchBar(false); } },
          React.createElement('i', { className: 'ph ph-arrow-left' })),
        React.createElement('div', { style: { width: '40px', height: '40px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1rem', color: 'white', marginLeft: '8px' } }, initials),
        React.createElement('div', { style: { flex: 1, marginLeft: '12px' } },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            React.createElement('strong', null, foundUser.displayName || foundUser.email),
            isOnline ? React.createElement('span', { className: 'online-dot' }) : React.createElement('span', { style: { display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--text-secondary)' } })
          ),
          React.createElement('div', { style: { fontSize: '0.75rem', color: 'var(--text-secondary)' } },
            isOnline ? 'Online' : (friendPresence?.lastSeen?.toDate ? 'Last seen ' + new Date(friendPresence.lastSeen.toDate()).toLocaleTimeString() : 'Offline'),
            typingFromFriend && ' - Typing...'
          )
        ),
        React.createElement('button', { className: 'btn-icon', title: 'Search in chat', onClick: () => setShowSearchBar(!showSearchBar) },
          React.createElement('i', { className: 'ph ph-magnifying-glass' })),
        React.createElement('button', { className: 'btn-icon', title: 'Export chat', onClick: handleExportChat },
          React.createElement('i', { className: 'ph ph-download-simple' })),
        React.createElement('button', { className: 'btn-icon', title: 'Unfriend', onClick: () => handleUnfriend(foundUser.uid), style: { color: 'var(--danger)' } },
          React.createElement('i', { className: 'ph ph-user-minus' }))
      ),

      // Search bar (only visible when toggled)
      showSearchBar && React.createElement('div', { style: { padding: '8px 16px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px' } },
        React.createElement('input', {
          className: 'input-field',
          type: 'text',
          placeholder: 'Search messages...',
          value: searchInChat,
          onChange: (e) => setSearchInChat(e.target.value),
          style: { flex: 1, marginBottom: 0, padding: '8px 12px', fontSize: '0.85rem' }
        }),
        React.createElement('span', { style: { fontSize: '0.75rem', color: 'var(--text-secondary)' } },
          searchResults.length > 0 ? `${searchResults.length} results` : '')
      ),

      // Messages area
      React.createElement('div', { className: 'chat-messages', style: { flex: 1, overflowY: 'auto', padding: '8px 8px 16px', display: 'flex', flexDirection: 'column', gap: '4px' } },
        messageElements.length === 0
          ? React.createElement('div', { style: { textAlign: 'center', padding: '2rem 0', color: 'var(--text-secondary)', fontSize: '0.9rem' } },
              React.createElement('i', { className: 'ph ph-chat-circle-dots', style: { fontSize: '3rem', opacity: 0.3 } }),
              React.createElement('p', null, 'No messages yet. Say hello!')
            )
          : messageElements,
        typingIndicator,
        React.createElement('div', { ref: messagesEndRef })
      ),

      // Reply/Edit/Forward bars
      replyBar,
      editBar,
      forwardBar,

      // Input area
      React.createElement('form', { className: 'chat-input-area', onSubmit: handleSendMessage, style: { display: 'flex', gap: '8px', padding: '12px', background: 'var(--surface)', backdropFilter: 'blur(20px)', borderTop: '1px solid var(--border)', position: 'sticky', bottom: 0, alignItems: 'center' } },
        React.createElement('input', {
          className: 'input-field',
          type: 'text',
          value: newMessage,
          onChange: (e) => setNewMessage(e.target.value),
          placeholder: editMessage ? 'Edit message...' : forwardMessage ? 'Add a note (optional)...' : 'Type a message...',
          onFocus: () => handleTyping(true),
          onBlur: () => handleTyping(false),
          onKeyDown: (e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage(e),
          style: { flex: 1, marginBottom: 0, padding: '12px 16px', borderRadius: '24px' }
        }),
        React.createElement('button', {
          type: 'submit',
          className: 'btn btn-primary',
          disabled: !newMessage.trim() && !forwardMessage,
          style: { padding: '10px 16px', borderRadius: '50%', width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }
        }, React.createElement('i', { className: `ph ${editMessage ? 'ph-pencil-simple' : forwardMessage ? 'ph-arrow-bend-right-down' : 'ph-paper-plane-right'}`, style: { fontSize: '1.2rem' } }))
      )
    );
  };

  // Main switch
  switch (view) {
    case 'search': return renderSearchView();
    case 'requests': return renderRequestsView();
    case 'chat': return renderChatView();
    default: return renderMainView();
  }
    }
