import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection, query, orderBy, onSnapshot,
  addDoc, serverTimestamp, where, doc,
  updateDoc, getDoc, getDocs
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

const REACTION_TYPES = [
  { type: 'like', icon: 'ph-thumbs-up', label: 'Like' },
  { type: 'love', icon: 'ph-heart', label: 'Love' },
  { type: 'laugh', icon: 'ph-smiley', label: 'Laugh' },
  { type: 'wow', icon: 'ph-smiley-wink', label: 'Wow' },
  { type: 'sad', icon: 'ph-smiley-sad', label: 'Sad' },
  { type: 'angry', icon: 'ph-smiley-angry', label: 'Angry' }
];

function Toast({ message, type, onClose }) {
  useEffect(() => { const timer = setTimeout(onClose, 3000); return () => clearTimeout(timer); }, [onClose]);
  return React.createElement('div', {
    className: `toast ${type}`,
    style: { position: 'fixed', top: '20px', right: '20px', zIndex: 9999 }
  }, [
    React.createElement('span', { key: 'msg' }, message),
    React.createElement('button', {
      key: 'close',
      className: 'btn-icon',
      onClick: onClose,
      style: { marginLeft: '12px' }
    }, React.createElement('i', { className: 'ph ph-x' }))
  ]);
}

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
  const [forwardMessage, setForwardMessage] = useState(null);
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [searchInChat, setSearchInChat] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [enterToSend, setEnterToSend] = useState(true);
  const [toast, setToast] = useState(null);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Listen for friend requests
  useEffect(() => {
    if (!currentUser?.uid) return;
    const unsub = listenFriendRequests(currentUser.uid, setFriendRequests);
    return () => unsub();
  }, [currentUser?.uid]);

  // Load friends list (with unread counts)
  useEffect(() => {
    if (!currentUser?.uid) return;
    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', currentUser.uid)
    );
    const unsub = onSnapshot(q, async snapshot => {
      const friendList = [];
      for (const d of snapshot.docs) {
        const data = d.data();
        const friendId = data.participants.find(id => id !== currentUser.uid);
        if (friendId) {
          let unread = 0;
          try {
            const chatRef = doc(db, 'chats', d.id);
            const chatDoc = await getDoc(chatRef);
            const chatData = chatDoc.data();
            const lastRead = chatData?.lastRead?.[currentUser.uid]?.toDate?.() || new Date(0);
            const msgsQ = query(
              collection(db, 'chats', d.id, 'messages'),
              where('timestamp', '>', lastRead)
            );
            const msgsSnap = await getDocs(msgsQ);
            unread = msgsSnap.size;
          } catch (e) { /* ignore */ }
          friendList.push({ chatId: d.id, friendId, unread });
        }
      }
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
    const unsub = onSnapshot(q, async snapshot => {
      const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setMessages(msgs);
      // Mark messages as seen
      for (const msg of msgs) {
        if (msg.senderId !== currentUser.uid && !(msg.seenBy || []).includes(currentUser.uid)) {
          await updateDoc(doc(db, 'chats', chatId, 'messages', msg.id), {
            seenBy: [...(msg.seenBy || []), currentUser.uid]
          });
        }
      }
      // Update last read timestamp
      if (msgs.length > 0) {
        await updateDoc(doc(db, 'chats', chatId), {
          [`lastRead.${currentUser.uid}`]: serverTimestamp()
        });
      }
    });
    return () => unsub();
  }, [chatId, currentUser?.uid]);

  // Search in chat
  useEffect(() => {
    if (!searchInChat.trim()) {
      setSearchResults([]);
      return;
    }
    const q = searchInChat.toLowerCase();
    setSearchResults(messages.filter(m =>
      m.text?.toLowerCase().includes(q) || m.senderName?.toLowerCase().includes(q)
    ));
  }, [searchInChat, messages]);

  const safeFormatTime = (timestamp) => {
    if (!timestamp) return '??';
    try {
      if (timestamp?.toDate) {
        const date = timestamp.toDate();
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return '??';
    } catch (e) { return '??'; }
  };

  const safeFormatDate = (timestamp) => {
    if (!timestamp) return '';
    try {
      if (timestamp?.toDate) return timestamp.toDate().toLocaleDateString();
      return '';
    } catch (e) { return ''; }
  };

  const groupedMessages = useCallback(() => {
    const result = [];
    let currentDate = null;
    messages.forEach(msg => {
      const date = safeFormatDate(msg.timestamp);
      if (date && date !== currentDate) {
        currentDate = date;
        result.push({ type: 'date', date, key: `date-${date}` });
      }
      result.push({ type: 'message', msg, key: msg.id });
    });
    return result;
  }, [messages]);

  const isFriend = useCallback(uid => friends.some(f => f.friendId === uid), [friends]);

  const handleSearchByCode = async () => {
    const code = searchInput.trim().toUpperCase();
    if (!code.startsWith('CP-') || code.length !== 13) {
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
    try {
      const user = await getUserByCpCode(code);
      setFoundUser(user || null);
      if (!user) setSearchError('User not found');
    } catch (err) { setSearchError('Something went wrong'); console.error(err); }
    setLoading(false);
  };

  const handleSearchByName = async () => {
    if (!searchByNameInput.trim()) return;
    setLoading(true);
    try {
      const results = await searchUsersByName(searchByNameInput.trim(), currentUser.uid);
      setFoundUser(results.length > 0 ? results[0] : null);
      setSearchError(results.length > 0 ? '' : 'No users found');
    } catch (err) { setSearchError('Something went wrong'); console.error(err); }
    setLoading(false);
  };

  const handleSendRequest = async () => {
    try {
      await sendFriendRequest(currentUser.uid, foundUser.cpCode);
      showToast('Friend request sent!', 'success');
      setView('main');
    } catch (err) { showToast(err.message, 'error'); }
  };

  const handleAcceptRequest = async (requestId) => {
    try {
      const { chatId: newChatId, friendId } = await acceptFriendRequest(requestId, currentUser.uid);
      const friendProfile = await getUserProfile(friendId);
      setChatId(newChatId);
      setFoundUser(friendProfile);
      setView('chat');
      showToast('Friend request accepted!', 'success');
    } catch (err) { showToast(err.message, 'error'); }
  };

  const handleDeclineRequest = async (requestId) => {
    try {
      await declineFriendRequest(requestId, currentUser.uid);
      showToast('Request declined', 'info');
    } catch (err) { showToast(err.message, 'error'); }
  };

  const openChat = useCallback(async (friendId) => {
    const ids = [currentUser.uid, friendId].sort();
    const chatId = `${ids[0]}_${ids[1]}`;
    setChatId(chatId);
    const profile = await getUserProfile(friendId);
    setFoundUser(profile);
    setView('chat');
    setShowSearchBar(false);
    setSearchInChat('');
    setSearchResults([]);
  }, [currentUser?.uid]);

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
      reactions: {},
      seenBy: [currentUser.uid]
    };
    if (replyTo) msgData.replyTo = { id: replyTo.id, text: replyTo.text, senderName: replyTo.senderName };
    if (forwardMessage) {
      msgData.forwardedFrom = { id: forwardMessage.id, text: forwardMessage.text, senderName: forwardMessage.senderName };
      msgData.text = text || forwardMessage.text;
    }
    if (editMessage) {
      await updateDoc(doc(db, 'chats', chatId, 'messages', editMessage.id), {
        text: text, edited: true, editedAt: serverTimestamp()
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

  const handleTyping = useCallback((isTyping) => {
    if (!chatId) return;
    clearTimeout(typingTimeoutRef.current);
    if (isTyping) {
      setChatTyping(chatId, currentUser.uid, true);
      typingTimeoutRef.current = setTimeout(() => {
        setChatTyping(chatId, currentUser.uid, false);
      }, 2000);
    } else {
      setChatTyping(chatId, currentUser.uid, false);
    }
  }, [chatId, currentUser?.uid]);

  const handleDeleteMessage = async (msgId) => {
    if (confirm('Delete this message?')) {
      await deleteMessage(`chats/${chatId}/messages/${msgId}`, currentUser.uid);
      showToast('Message deleted', 'info');
    }
  };

  const handleAddReaction = async (msgId, reactionType) => {
    if (!chatId) return;
    const msgRef = doc(db, 'chats', chatId, 'messages', msgId);
    const msg = messages.find(m => m.id === msgId);
    if (!msg) return;
    const reactions = msg.reactions || {};
    const users = reactions[reactionType] || [];
    if (users.includes(currentUser.uid)) {
      reactions[reactionType] = users.filter(uid => uid !== currentUser.uid);
      if (reactions[reactionType].length === 0) delete reactions[reactionType];
    } else {
      reactions[reactionType] = [...users, currentUser.uid];
    }
    await updateDoc(msgRef, { reactions });
  };

  const handleEditMessage = (msg) => {
    if (msg.senderId !== currentUser.uid) return;
    setEditMessage(msg);
    setNewMessage(msg.text);
    setReplyTo(null);
    setForwardMessage(null);
  };

  const handleForwardMessage = (msg) => {
    setForwardMessage(msg);
    setNewMessage('');
    setReplyTo(null);
    setEditMessage(null);
  };

  const handleUnfriend = async (friendId) => {
    if (confirm('Remove this friend?')) {
      await unfriend(currentUser.uid, friendId);
      setChatId(null);
      setFoundUser(null);
      setView('main');
      showToast('Friend removed', 'info');
    }
  };

  const handleExportChat = () => {
    const text = messages.map(m =>
      `[${safeFormatTime(m.timestamp)}] ${m.senderName}: ${m.text}`
    ).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-export-${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Chat exported!', 'success');
  };

  // ---- COMPONENTS ----

  const FriendCard = ({ friendId, unread }) => {
    const [friendProfile, setFriendProfile] = useState(null);
    useEffect(() => { getUserProfile(friendId).then(setFriendProfile); }, [friendId]);
    if (!friendProfile) return null;
    const initials = (friendProfile.displayName || friendProfile.email || '?').slice(0,2).toUpperCase();
    return React.createElement('div', {
      className: 'room-card glass',
      style: { position: 'relative', padding: '16px', display: 'flex', alignItems: 'center' }
    },
      React.createElement('div', {
        style: { display: 'flex', alignItems: 'center', cursor: 'pointer', flex: 1 },
        onClick: () => openChat(friendId)
      },
        React.createElement('div', {
          style: { width: '48px', height: '48px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.2rem', color: 'white' }
        }, initials),
        React.createElement('div', { style: { flex: 1, marginLeft: '12px' } },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            React.createElement('strong', null, friendProfile.displayName || friendProfile.email),
            friendProfile.online && React.createElement('span', { className: 'online-dot' })
          ),
          React.createElement('div', { style: { fontSize: '0.8rem', color: 'var(--text-secondary)' } },
            friendProfile.status || friendProfile.cpCode
          )
        ),
        unread > 0 && React.createElement('div', { className: 'unread-badge' }, unread)
      ),
      React.createElement('button', {
        className: 'btn-icon',
        style: { position: 'absolute', top: '8px', right: '8px', color: 'var(--danger)' },
        onClick: (e) => { e.stopPropagation(); handleUnfriend(friendId); }
      }, React.createElement('i', { className: 'ph ph-user-minus' }))
    );
  };

  const RequestCard = ({ req }) => {
    const [sender, setSender] = useState(null);
    useEffect(() => { getUserProfile(req.from).then(setSender); }, [req.from]);
    if (!sender) {
      return React.createElement('div', { className: 'room-card glass', style: { padding: '16px' } },
        React.createElement('strong', null, 'Loading...')
      );
    }
    const initials = (sender.displayName || sender.email || '?').slice(0,2).toUpperCase();
    return React.createElement('div', {
      className: 'room-card glass',
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px' }
    },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', flex: 1, overflow: 'hidden' } },
        React.createElement('div', {
          style: { width: '44px', height: '44px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'white' }
        }, initials),
        React.createElement('div', { style: { overflow: 'hidden', flex: 1 } },
          React.createElement('strong', null, sender.displayName || sender.email),
          React.createElement('div', { style: { fontSize: '0.85rem', color: 'var(--text-secondary)' } }, sender.cpCode),
          sender.status && React.createElement('div', { style: { fontSize: '0.8rem', color: 'var(--text-secondary)' } }, sender.status)
        )
      ),
      React.createElement('div', { style: { display: 'flex', gap: '8px', marginLeft: '12px', flexShrink: 0 } },
        React.createElement('button', { className: 'btn btn-primary', onClick: () => handleAcceptRequest(req.id), style: { padding: '8px 16px' } }, 'Accept'),
        React.createElement('button', { className: 'btn', onClick: () => handleDeclineRequest(req.id), style: { padding: '8px 16px' } }, 'Decline')
      )
    );
  };

  const MessageBubble = ({ msg, searchTerm }) => {
    const isOwn = msg.senderId === currentUser.uid;
    const reactions = msg.reactions || {};
    const hasReactions = Object.keys(reactions).length > 0;
    const isEdited = msg.edited === true;
    const hasReply = msg.replyTo;
    const isForwarded = msg.forwardedFrom;
    const timeStr = safeFormatTime(msg.timestamp);
    const seenBy = msg.seenBy || [];
    const isSeen = seenBy.length > 1; // more than just sender

    const highlightText = (text) => {
      if (!searchTerm || !text) return text;
      const parts = text.split(new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
      return parts.map((part, i) =>
        part.toLowerCase() === searchTerm.toLowerCase()
          ? React.createElement('span', { key: i, className: 'highlight' }, part)
          : React.createElement('span', { key: i }, part)
      );
    };

    const replyPreview = hasReply ? React.createElement('div', { className: 'reply-preview' },
      React.createElement('span', { style: { fontWeight: 'bold', fontSize: '0.7rem', color: 'var(--text-secondary)' } }, msg.replyTo.senderName + ': '),
      React.createElement('span', { style: { fontSize: '0.8rem' } }, msg.replyTo.text)
    ) : null;

    const forwardIndicator = isForwarded ? React.createElement('div', { style: { fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '2px' } },
      'Forwarded from ' + msg.forwardedFrom.senderName
    ) : null;

    const editedBadge = isEdited ? React.createElement('span', { style: { fontSize: '0.6rem', opacity: 0.6, marginLeft: '4px' } }, '(edited)') : null;

    const statusIcon = isOwn ? React.createElement('span', { style: { marginLeft: '6px' } },
      React.createElement('i', {
        className: isSeen ? 'ph ph-check-double' : 'ph ph-check',
        style: {
          color: isSeen ? 'var(--success)' : 'var(--text-secondary)',
          fontSize: '0.8rem'
        }
      })
    ) : null;

    const reactionPills = hasReactions ? React.createElement('div', { className: 'reactions-bar' },
      Object.entries(reactions).map(([type, users]) => {
        const rdef = REACTION_TYPES.find(r => r.type === type);
        const icon = rdef ? rdef.icon : 'ph-thumbs-up';
        return React.createElement('button', {
          key: type,
          className: 'reaction-item',
          onClick: () => handleAddReaction(msg.id, type)
        },
          React.createElement('i', { className: icon, style: { fontSize: '0.9rem' } }),
          React.createElement('span', { style: { fontSize: '0.7rem', color: 'var(--text-secondary)' } }, users.length)
        );
      })
    ) : null;

    const quickReactions = React.createElement('div', { style: { display: 'flex', gap: '2px', marginTop: '4px' } },
      REACTION_TYPES.slice(0, 4).map(rdef =>
        React.createElement('button', {
          key: rdef.type,
          className: 'btn-icon',
          title: rdef.label,
          onClick: () => handleAddReaction(msg.id, rdef.type),
          style: { fontSize: '0.9rem', padding: '2px 4px' }
        }, React.createElement('i', { className: rdef.icon }))
      )
    );

    const messageActions = React.createElement('div', { className: 'message-actions', style: { display: 'flex', gap: '2px', marginTop: '4px' } },
      React.createElement('button', { className: 'btn-icon', title: 'Reply', onClick: () => setReplyTo({ id: msg.id, text: msg.text, senderName: msg.senderName }), style: { fontSize: '0.9rem' } }, React.createElement('i', { className: 'ph ph-arrow-bend-left-up' })),
      React.createElement('button', { className: 'btn-icon', title: 'Forward', onClick: () => handleForwardMessage(msg), style: { fontSize: '0.9rem' } }, React.createElement('i', { className: 'ph ph-arrow-bend-right-down' })),
      isOwn && React.createElement('button', { className: 'btn-icon', title: 'Edit', onClick: () => handleEditMessage(msg), style: { fontSize: '0.9rem', color: 'var(--accent)' } }, React.createElement('i', { className: 'ph ph-pencil-simple' })),
      React.createElement('button', { className: 'btn-icon', title: 'Delete', onClick: () => handleDeleteMessage(msg.id), style: { fontSize: '0.9rem', color: 'var(--danger)' } }, React.createElement('i', { className: 'ph ph-trash' }))
    );

    const timeRow = React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' } },
      React.createElement('div', { className: 'bubble-time' }, timeStr, editedBadge),
      statusIcon
    );

    return React.createElement('div', {
      className: `chat-bubble ${isOwn ? 'own' : 'other'}`,
      style: { marginBottom: '8px' }
    },
      replyPreview,
      forwardIndicator,
      React.createElement('div', { className: 'bubble-text' }, highlightText(msg.text)),
      quickReactions,
      reactionPills,
      messageActions,
      timeRow
    );
  };

  // ---- VIEWS ----

  const renderMainView = () =>
    React.createElement('div', { className: 'duo-container', style: { padding: '16px' } },
      React.createElement('div', { className: 'glass', style: { padding: '1.5rem', borderRadius: '20px' } },
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' } },
          React.createElement('h2', { style: { margin: 0 } }, 'Duo Chat'),
          React.createElement('div', { style: { display: 'flex', gap: '8px' } },
            React.createElement('button', { className: 'btn', onClick: () => setView('search') }, React.createElement('i', { className: 'ph ph-magnifying-glass' }), ' Find'),
            React.createElement('button', { className: 'btn', onClick: () => setView('requests') },
              'Requests', friendRequests.length > 0 ? React.createElement('span', { className: 'badge' }, friendRequests.length) : null)
          )
        ),
        React.createElement('h3', { style: { marginBottom: '12px', fontSize: '1rem', color: 'var(--text-secondary)' } }, 'Your Friends'),
        friends.length === 0
          ? React.createElement('div', { className: 'empty-state' },
              React.createElement('i', { className: 'ph ph-users icon' }),
              React.createElement('h4', null, 'No friends yet'),
              React.createElement('p', null, 'Search by CP code or name to add.')
            )
          : React.createElement('div', { className: 'rooms-grid' },
              friends.map(f => React.createElement(FriendCard, { key: f.chatId, friendId: f.friendId, unread: f.unread || 0 }))
            )
      )
    );

  const renderSearchView = () => {
    const alreadyFriend = foundUser ? isFriend(foundUser.uid) : false;
    return React.createElement('div', { className: 'duo-container', style: { padding: '16px' } },
      React.createElement('div', { className: 'glass', style: { padding: '1.5rem', borderRadius: '20px' } },
        React.createElement('button', { className: 'btn-icon', onClick: () => setView('main'), style: { marginBottom: '12px' } }, React.createElement('i', { className: 'ph ph-arrow-left' })),
        React.createElement('h2', null, 'Find Friend'),
        React.createElement('div', { className: 'input-group' },
          React.createElement('label', null, 'Search by CP Code'),
          React.createElement('div', { style: { display: 'flex', gap: '8px' } },
            React.createElement('input', { className: 'input-field', type: 'text', placeholder: 'CP-1234567890', value: searchInput, onChange: e => setSearchInput(e.target.value.toUpperCase()), onKeyDown: e => e.key === 'Enter' && handleSearchByCode(), style: { flex: 1 } }),
            React.createElement('button', { className: 'btn btn-primary', onClick: handleSearchByCode, style: { padding: '0 20px' } }, React.createElement('i', { className: 'ph ph-magnifying-glass' }))
          )
        ),
        React.createElement('div', { className: 'input-group', style: { marginTop: '12px' } },
          React.createElement('label', null, 'Search by Name'),
          React.createElement('div', { style: { display: 'flex', gap: '8px' } },
            React.createElement('input', { className: 'input-field', type: 'text', placeholder: 'Display name', value: searchByNameInput, onChange: e => setSearchByNameInput(e.target.value), onKeyDown: e => e.key === 'Enter' && handleSearchByName(), style: { flex: 1 } }),
            React.createElement('button', { className: 'btn', onClick: handleSearchByName, style: { padding: '0 20px' } }, React.createElement('i', { className: 'ph ph-magnifying-glass' }))
          )
        ),
        searchError && React.createElement('div', { className: 'error-msg' }, searchError),
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
        React.createElement('button', { className: 'btn-icon', onClick: () => setView('main') }, React.createElement('i', { className: 'ph ph-arrow-left' })),
        React.createElement('h2', { style: { marginBottom: '1rem' } }, 'Friend Requests'),
        friendRequests.length === 0
          ? React.createElement('p', { className: 'text-secondary', style: { textAlign: 'center', padding: '2rem 0' } }, 'No pending requests')
          : React.createElement('div', { className: 'rooms-grid' },
              friendRequests.map(req => React.createElement(RequestCard, { key: req.id, req }))
            )
      )
    );

  const renderChatView = () => {
    if (!foundUser) return null;
    const isOnline = friendPresence?.online;
    const typingFromFriend = typingUsers.includes(foundUser.uid);
    const initials = (foundUser.displayName || foundUser.email || '?').slice(0, 2).toUpperCase();

    let lastSeenText = 'Offline';
    try {
      if (friendPresence?.lastSeen?.toDate) {
        const date = friendPresence.lastSeen.toDate();
        if (date instanceof Date && !isNaN(date.getTime())) {
          lastSeenText = 'Last seen ' + date.toLocaleTimeString();
        }
      }
    } catch (e) {}

    const typingIndicator = typingFromFriend ? React.createElement('div', { className: 'typing-indicator' },
      React.createElement('div', { className: 'typing-dot' }),
      React.createElement('div', { className: 'typing-dot' }),
      React.createElement('div', { className: 'typing-dot' })
    ) : null;

    const replyBar = replyTo ? React.createElement('div', { className: 'reply-bar' },
      React.createElement('div', { style: { flex: 1 } },
        React.createElement('div', { style: { fontSize: '0.7rem', color: 'var(--text-secondary)' } }, 'Replying to ' + replyTo.senderName),
        React.createElement('div', { style: { fontSize: '0.85rem' } }, replyTo.text)
      ),
      React.createElement('button', { className: 'btn-icon', onClick: () => setReplyTo(null) }, React.createElement('i', { className: 'ph ph-x' }))
    ) : null;

    const editBar = editMessage ? React.createElement('div', { className: 'reply-bar' },
      React.createElement('div', { style: { flex: 1 } },
        React.createElement('div', { style: { fontSize: '0.7rem', color: 'var(--accent)' } }, 'Editing message'),
        React.createElement('div', { style: { fontSize: '0.85rem' } }, editMessage.text)
      ),
      React.createElement('button', { className: 'btn-icon', onClick: () => { setEditMessage(null); setNewMessage(''); } }, React.createElement('i', { className: 'ph ph-x' }))
    ) : null;

    const forwardBar = forwardMessage ? React.createElement('div', { className: 'reply-bar' },
      React.createElement('div', { style: { flex: 1 } },
        React.createElement('div', { style: { fontSize: '0.7rem', color: 'var(--text-secondary)' } }, 'Forwarding from ' + forwardMessage.senderName),
        React.createElement('div', { style: { fontSize: '0.85rem' } }, forwardMessage.text)
      ),
      React.createElement('button', { className: 'btn-icon', onClick: () => setForwardMessage(null) }, React.createElement('i', { className: 'ph ph-x' }))
    ) : null;

    const grouped = groupedMessages();
    const filtered = searchInChat.trim()
      ? grouped.filter(item => item.type === 'message' && (item.msg.text?.toLowerCase().includes(searchInChat.toLowerCase()) || item.msg.senderName?.toLowerCase().includes(searchInChat.toLowerCase())))
      : grouped;

    const messageElements = filtered.map(item => {
      if (item.type === 'date') {
        return React.createElement('div', { key: item.key, className: 'date-divider' },
          React.createElement('span', null, item.date)
        );
      }
      return React.createElement(MessageBubble, { key: item.key, msg: item.msg, searchTerm: searchInChat });
    });

    const inputForm = React.createElement('form', { className: 'chat-input-area', onSubmit: handleSendMessage },
      React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)' } },
        React.createElement('input', { type: 'checkbox', checked: enterToSend, onChange: e => setEnterToSend(e.target.checked) }),
        'Enter sends'
      ),
      React.createElement('input', {
        className: 'input-field',
        type: 'text',
        value: newMessage,
        onChange: e => setNewMessage(e.target.value),
        placeholder: editMessage ? 'Edit message...' : forwardMessage ? 'Add a note...' : 'Type a message...',
        onFocus: () => handleTyping(true),
        onBlur: () => handleTyping(false),
        onKeyDown: e => {
          if (e.key === 'Enter') {
            if (enterToSend && !e.shiftKey) { e.preventDefault(); handleSendMessage(e); }
            else if (!enterToSend && e.shiftKey) { e.preventDefault(); handleSendMessage(e); }
          }
        },
        style: { flex: 1, marginBottom: 0, padding: '12px 18px', borderRadius: '24px' }
      }),
      React.createElement('button', {
        type: 'submit',
        className: 'btn btn-primary',
        disabled: !newMessage.trim() && !forwardMessage,
        style: { padding: '10px 16px', borderRadius: '50%', width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }
      }, React.createElement('i', { className: `ph ${editMessage ? 'ph-pencil-simple' : forwardMessage ? 'ph-arrow-bend-right-down' : 'ph-paper-plane-right'}`, style: { fontSize: '1.1rem' } }))
    );

    return React.createElement('div', { className: 'duo-container chat-active', style: { height: '100%', display: 'flex', flexDirection: 'column', borderRadius: '20px', overflow: 'hidden' } },
      React.createElement('div', { className: 'chat-header' },
        React.createElement('button', { className: 'btn-icon', onClick: () => { setView('main'); setChatId(null); setShowSearchBar(false); } }, React.createElement('i', { className: 'ph ph-arrow-left' })),
        React.createElement('div', { className: 'avatar' }, initials),
        React.createElement('div', { className: 'user-info' },
          React.createElement('div', { className: 'user-name' },
            React.createElement('strong', null, foundUser.displayName || foundUser.email),
            isOnline && React.createElement('span', { className: 'online-dot' })
          ),
          React.createElement('div', { className: 'user-status' },
            isOnline ? 'Online' : lastSeenText,
            typingFromFriend && ' • Typing...'
          )
        ),
        React.createElement('div', { className: 'actions' },
          React.createElement('button', { className: 'btn-icon', title: 'Search in chat', onClick: () => setShowSearchBar(!showSearchBar) }, React.createElement('i', { className: 'ph ph-magnifying-glass' })),
          React.createElement('button', { className: 'btn-icon', title: 'Export chat', onClick: handleExportChat }, React.createElement('i', { className: 'ph ph-download-simple' })),
          React.createElement('button', { className: 'btn-icon', title: 'Unfriend', onClick: () => handleUnfriend(foundUser.uid), style: { color: 'var(--danger)' } }, React.createElement('i', { className: 'ph ph-user-minus' }))
        )
      ),
      showSearchBar && React.createElement('div', { style: { padding: '8px 16px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px' } },
        React.createElement('input', { className: 'input-field', type: 'text', placeholder: 'Search messages...', value: searchInChat, onChange: e => setSearchInChat(e.target.value), style: { flex: 1, marginBottom: 0, padding: '8px 12px' } }),
        React.createElement('span', { style: { fontSize: '0.75rem', color: 'var(--text-secondary)' } }, searchResults.length > 0 ? `${searchResults.length} results` : '')
      ),
      React.createElement('div', { className: 'chat-messages', style: { flex: 1 } },
        messageElements.length === 0
          ? React.createElement('div', { className: 'empty-state', style: { height: '100%' } },
              React.createElement('i', { className: 'ph ph-chat-circle-dots icon' }),
              React.createElement('h4', null, 'No messages yet'),
              React.createElement('p', null, 'Say hello to your friend!')
            )
          : messageElements,
        typingIndicator,
        React.createElement('div', { ref: messagesEndRef })
      ),
      replyBar,
      editBar,
      forwardBar,
      inputForm,
      toast && React.createElement(Toast, { message: toast.message, type: toast.type, onClose: () => setToast(null) })
    );
  };

  switch (view) {
    case 'search': return renderSearchView();
    case 'requests': return renderRequestsView();
    case 'chat': return renderChatView();
    default: return renderMainView();
  }
      }
