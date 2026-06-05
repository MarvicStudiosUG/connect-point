import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  collection, query, orderBy, onSnapshot,
  addDoc, serverTimestamp, where, doc,
  updateDoc
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
  { type:'like', icon:'ph-thumbs-up', label:'Like' },
  { type:'love', icon:'ph-heart', label:'Love' },
  { type:'laugh', icon:'ph-smiley', label:'Laugh' },
  { type:'wow', icon:'ph-smiley-wink', label:'Wow' },
  { type:'sad', icon:'ph-smiley-sad', label:'Sad' },
  { type:'angry', icon:'ph-smiley-angry', label:'Angry' }
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
  const [forwardMessage, setForwardMessage] = useState(null);
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [searchInChat, setSearchInChat] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef();

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Listen for friend requests
  useEffect(() => {
    if (!currentUser?.uid) return;
    const unsub = listenFriendRequests(currentUser.uid, setFriendRequests);
    return () => unsub();
  }, [currentUser?.uid]);

  // Load friends list
  useEffect(() => {
    if (!currentUser?.uid) return;
    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', currentUser.uid)
    );
    const unsub = onSnapshot(q, snapshot => {
      const friendList = [];
      snapshot.forEach(d => {
        const data = d.data();
        const friendId = data.participants.find(id => id !== currentUser.uid);
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

  // Presence listener
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
    const unsub = onSnapshot(q, snapshot => {
      const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setMessages(msgs);
    });
    return () => unsub();
  }, [chatId]);

  // Search within chat
  useEffect(() => {
    if (!searchInChat.trim()) {
      setSearchResults([]);
      return;
    }
    const q = searchInChat.toLowerCase();
    setSearchResults(
      messages.filter(m =>
        m.text?.toLowerCase().includes(q) ||
        m.senderName?.toLowerCase().includes(q)
      )
    );
  }, [searchInChat, messages]);

  // Memoized message grouping with date separators
  const groupedMessages = useMemo(() => {
    const result = [];
    let currentDate = null;
    messages.forEach(msg => {
      const date = msg.timestamp?.toDate?.()?.toLocaleDateString() || '';
      if (date !== currentDate) {
        currentDate = date;
        if (date) {
          result.push({ type: 'date', date, key: `date-${date}` });
        }
      }
      result.push({ type: 'message', msg, key: msg.id });
    });
    return result;
  }, [messages]);

  // Filtered grouped messages for search
  const filteredGrouped = useMemo(() => {
    if (!searchInChat.trim()) return groupedMessages;
    return groupedMessages.filter(item =>
      item.type === 'message' &&
      (item.msg.text?.toLowerCase().includes(searchInChat.toLowerCase()) ||
       item.msg.senderName?.toLowerCase().includes(searchInChat.toLowerCase()))
    );
  }, [groupedMessages, searchInChat]);

  const isFriend = useCallback(uid => friends.some(f => f.friendId === uid), [friends]);

  // ===== Handlers =====
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
    } catch (err) {
      setSearchError('Something went wrong');
      console.error(err);
    }
    setLoading(false);
  };

  const handleSearchByName = async () => {
    if (!searchByNameInput.trim()) return;
    setLoading(true);
    try {
      const results = await searchUsersByName(searchByNameInput.trim(), currentUser.uid);
      setFoundUser(results.length > 0 ? results[0] : null);
      setSearchError(results.length > 0 ? '' : 'No users found');
    } catch (err) {
      setSearchError('Something went wrong');
      console.error(err);
    }
    setLoading(false);
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
    try {
      await declineFriendRequest(requestId, currentUser.uid);
    } catch (err) {
      alert(err.message);
    }
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
      await updateDoc(
        doc(db, 'chats', chatId, 'messages', editMessage.id),
        { text: text, edited: true, editedAt: serverTimestamp() }
      );
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
    }
  };

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

  // ===== Sub-components =====
  function FriendCard({ friendId }) {
    const [friendProfile, setFriendProfile] = useState(null);
    useEffect(() => {
      let isMounted = true;
      getUserProfile(friendId).then(profile => {
        if (isMounted) setFriendProfile(profile);
      });
      return () => { isMounted = false; };
    }, [friendId]);
    if (!friendProfile) return null;
    const initials = (friendProfile.displayName || friendProfile.email || '?').slice(0,2).toUpperCase();
    return React.createElement('div', {
      className: 'room-card glass',
      style: { position: 'relative', padding: '16px' }
    }, [
      React.createElement('div', {
        key: 'clickable',
        style: { display: 'flex', alignItems: 'center', cursor: 'pointer' },
        onClick: () => openChat(friendId)
      }, [
        React.createElement('div', {
          key: 'avatar',
          style: {
            width: '48px', height: '48px', borderRadius: '50%',
            background: 'var(--accent)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontWeight: 'bold', fontSize: '1.2rem', color: 'white'
          }
        }, initials),
        React.createElement('div', { key: 'info', style: { flex: 1, marginLeft: '12px' } }, [
          React.createElement('div', { key: 'name', style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
            React.createElement('strong', null, friendProfile.displayName || friendProfile.email),
            friendProfile.online && React.createElement('span', { className: 'online-dot' })
          ]),
          React.createElement('div', { key: 'sub', style: { fontSize: '0.8rem', color: 'var(--text-secondary)' } },
            friendProfile.status || friendProfile.cpCode)
        ])
      ]),
      React.createElement('button', {
        key: 'unfriend',
        className: 'btn-icon',
        style: { position: 'absolute', top: '8px', right: '8px', color: 'var(--danger)' },
        onClick: e => { e.stopPropagation(); handleUnfriend(friendId); }
      }, React.createElement('i', { className: 'ph ph-user-minus' }))
    ]);
  }

  function RequestCard({ req }) {
    const [sender, setSender] = useState(null);
    useEffect(() => {
      let isMounted = true;
      getUserProfile(req.from).then(profile => {
        if (isMounted) setSender(profile);
      });
      return () => { isMounted = false; };
    }, [req.from]);
    if (!sender) {
      return React.createElement('div', {
        className: 'room-card glass',
        style: { padding: '16px' }
      }, React.createElement('strong', null, 'Loading...'));
    }
    const initials = (sender.displayName || sender.email || '?').slice(0,2).toUpperCase();
    return React.createElement('div', {
      className: 'room-card glass',
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }
    }, [
      React.createElement('div', {
        key: 'left',
        style: { display: 'flex', alignItems: 'center', gap: '12px', flex: 1, overflow: 'hidden' }
      }, [
        React.createElement('div', {
          key: 'avatar',
          style: {
            width: '40px', height: '40px', borderRadius: '50%',
            background: 'var(--accent)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontWeight: 'bold', color: 'white'
          }
        }, initials),
        React.createElement('div', { key: 'info', style: { overflow: 'hidden', flex: 1 } }, [
          React.createElement('strong', null, sender.displayName || sender.email),
          React.createElement('div', { style: { fontSize: '0.8rem', color: 'var(--text-secondary)' } }, sender.cpCode)
        ])
      ]),
      React.createElement('div', {
        key: 'actions',
        style: { display: 'flex', gap: '8px', marginLeft: '12px', flexShrink: 0 }
      }, [
        React.createElement('button', {
          key: 'accept',
          className: 'btn btn-primary',
          onClick: () => handleAcceptRequest(req.id),
          style: { padding: '8px 16px' }
        }, 'Accept'),
        React.createElement('button', {
          key: 'decline',
          className: 'btn',
          onClick: () => handleDeclineRequest(req.id),
          style: { padding: '8px 16px' }
        }, 'Decline')
      ])
    ]);
  }

  function MessageBubble({ msg }) {
    const isOwn = msg.senderId === currentUser.uid;
    const reactions = msg.reactions || {};
    const hasReactions = Object.keys(reactions).length > 0;
    const isEdited = msg.edited === true;
    const hasReply = msg.replyTo;
    const isForwarded = msg.forwardedFrom;
    const timeStr = msg.timestamp?.toDate?.()?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || '';

    // Floating reaction picker
    const reactionPicker = React.createElement('div', { className: 'reaction-picker' },
      REACTION_TYPES.slice(0, 4).map(rdef =>
        React.createElement('button', {
          key: rdef.type,
          onClick: () => handleAddReaction(msg.id, rdef.type),
          title: rdef.label
        }, React.createElement('i', { className: rdef.icon }))
      )
    );

    // Reaction pills (shown below message)
    const reactionPills = hasReactions ? React.createElement('div', {
      className: 'reactions-bar',
      style: { marginTop: '4px' }
    }, Object.entries(reactions).map(([type, users]) => {
      const rdef = REACTION_TYPES.find(r => r.type === type);
      const icon = rdef ? rdef.icon : 'ph-thumbs-up';
      return React.createElement('span', {
        key: type,
        className: 'reaction-item',
        onClick: () => handleAddReaction(msg.id, type)
      }, [
        React.createElement('i', { key: 'icon', className: icon + ' reaction-icon' }),
        React.createElement('span', {
          key: 'count',
          style: { fontSize: '0.7rem', color: 'var(--text-secondary)' }
        }, users.length)
      ]);
    })) : null;

    // Reply preview
    const replyPreview = hasReply ? React.createElement('div', { className: 'reply-preview' }, [
      React.createElement('span', {
        key: 'label',
        style: { fontWeight: 'bold', fontSize: '0.7rem', color: 'var(--text-secondary)' }
      }, msg.replyTo.senderName + ': '),
      React.createElement('span', { key: 'text', style: { fontSize: '0.8rem' } }, msg.replyTo.text)
    ]) : null;

    // Forward indicator
    const forwardIndicator = isForwarded ? React.createElement('div', {
      style: { fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '2px' }
    }, 'Forwarded from ' + msg.forwardedFrom.senderName) : null;

    // Message actions
    const messageActions = React.createElement('div', { className: 'message-actions' }, [
      React.createElement('button', {
        key: 'reply',
        className: 'btn-icon',
        title: 'Reply',
        onClick: () => setReplyTo({ id: msg.id, text: msg.text, senderName: msg.senderName })
      }, React.createElement('i', { className: 'ph ph-arrow-bend-left-up' })),
      React.createElement('button', {
        key: 'forward',
        className: 'btn-icon',
        title: 'Forward',
        onClick: () => handleForwardMessage(msg)
      }, React.createElement('i', { className: 'ph ph-arrow-bend-right-down' })),
      isOwn && React.createElement('button', {
        key: 'edit',
        className: 'btn-icon',
        title: 'Edit',
        onClick: () => handleEditMessage(msg)
      }, React.createElement('i', { className: 'ph ph-pencil-simple' })),
      React.createElement('button', {
        key: 'delete',
        className: 'btn-icon',
        title: 'Delete',
        onClick: () => handleDeleteMessage(msg.id)
      }, React.createElement('i', { className: 'ph ph-trash', style: { color: 'var(--danger)' } }))
    ]);

    // Status indicator (sent/delivered/seen placeholder)
    const statusIndicator = isOwn ? React.createElement('div', {
      className: 'message-status'
    }, React.createElement('i', { className: 'ph ph-check' })) : null;

    // Edited badge
    const editedBadge = isEdited ? React.createElement('span', {
      style: { fontSize: '0.6rem', opacity: 0.6, marginLeft: '4px' }
    }, '(edited)') : null;

    return React.createElement('div', {
      className: `chat-bubble ${isOwn ? 'own' : 'other'}`
    }, [
      reactionPicker,
      replyPreview,
      forwardIndicator,
      React.createElement('div', { key: 'text', className: 'bubble-text' }, msg.text),
      editedBadge,
      React.createElement('div', {
        key: 'quick-reactions',
        style: { display: 'flex', gap: '2px', marginTop: '2px' }
      }, REACTION_TYPES.slice(0, 4).map(rdef =>
        React.createElement('button', {
          key: rdef.type,
          className: 'btn-icon',
          title: rdef.label,
          onClick: () => handleAddReaction(msg.id, rdef.type)
        }, React.createElement('i', { className: rdef.icon }))
      )),
      reactionPills,
      React.createElement('div', {
        key: 'bottom',
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }
      }, [
        React.createElement('div', { key: 'time', className: 'bubble-time' }, timeStr),
        statusIndicator,
        messageActions
      ])
    ]);
  }

  // ===== View Renderers =====
  const renderMainView = () =>
    React.createElement('div', { className: 'duo-container', style: { padding: '16px' } },
      React.createElement('div', { className: 'glass', style: { padding: '1.5rem', borderRadius: '20px' } }, [
        React.createElement('div', {
          key: 'header',
          style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }
        }, [
          React.createElement('h2', { key: 'title', style: { margin: 0 } }, 'Duo Chat'),
          React.createElement('div', { key: 'actions', style: { display: 'flex', gap: '8px' } }, [
            React.createElement('button', {
              key: 'search',
              className: 'btn',
              onClick: () => setView('search')
            }, [React.createElement('i', { key: 'icon', className: 'ph ph-magnifying-glass' }), ' Find']),
            React.createElement('button', {
              key: 'requests',
              className: 'btn',
              onClick: () => setView('requests')
            }, [
              'Requests',
              friendRequests.length > 0 ? React.createElement('span', {
                key: 'badge',
                className: 'badge'
              }, friendRequests.length) : null
            ])
          ])
        ]),
        React.createElement('h3', {
          key: 'subtitle',
          style: { marginBottom: '12px', fontSize: '1rem', color: 'var(--text-secondary)' }
        }, 'Your Friends'),
        friends.length === 0
          ? React.createElement('div', {
              key: 'empty',
              className: 'empty-state'
            }, [
              React.createElement('i', { key: 'icon', className: 'ph ph-users icon' }),
              React.createElement('h4', { key: 'title' }, 'No friends yet'),
              React.createElement('p', { key: 'desc' }, 'Search by CP code or name to add.')
            ])
          : React.createElement('div', { key: 'list', className: 'rooms-grid' },
              friends.map(f => React.createElement(FriendCard, { key: f.chatId, friendId: f.friendId }))
            )
      ])
    );

  const renderSearchView = () => {
    const alreadyFriend = foundUser ? isFriend(foundUser.uid) : false;
    return React.createElement('div', { className: 'duo-container', style: { padding: '16px' } },
      React.createElement('div', { className: 'glass', style: { padding: '1.5rem', borderRadius: '20px' } }, [
        React.createElement('button', {
          key: 'back',
          className: 'btn-icon',
          onClick: () => setView('main'),
          style: { marginBottom: '12px' }
        }, React.createElement('i', { className: 'ph ph-arrow-left' })),
        React.createElement('h2', { key: 'title' }, 'Find Friend'),
        React.createElement('div', { key: 'code', className: 'input-group' }, [
          React.createElement('label', null, 'Search by CP Code'),
          React.createElement('div', { style: { display: 'flex', gap: '8px' } }, [
            React.createElement('input', {
              key: 'input',
              className: 'input-field',
              type: 'text',
              placeholder: 'CP-1234567890',
              value: searchInput,
              onChange: e => setSearchInput(e.target.value.toUpperCase()),
              onKeyDown: e => e.key === 'Enter' && handleSearchByCode(),
              style: { flex: 1 }
            }),
            React.createElement('button', {
              key: 'btn',
              className: 'btn btn-primary',
              onClick: handleSearchByCode,
              style: { padding: '0 20px' }
            }, React.createElement('i', { className: 'ph ph-magnifying-glass' }))
          ])
        ]),
        React.createElement('div', { key: 'name', className: 'input-group', style: { marginTop: '12px' } }, [
          React.createElement('label', null, 'Search by Name'),
          React.createElement('div', { style: { display: 'flex', gap: '8px' } }, [
            React.createElement('input', {
              key: 'input',
              className: 'input-field',
              type: 'text',
              placeholder: 'Display name',
              value: searchByNameInput,
              onChange: e => setSearchByNameInput(e.target.value),
              onKeyDown: e => e.key === 'Enter' && handleSearchByName(),
              style: { flex: 1 }
            }),
            React.createElement('button', {
              key: 'btn',
              className: 'btn',
              onClick: handleSearchByName,
              style: { padding: '0 20px' }
            }, React.createElement('i', { className: 'ph ph-magnifying-glass' }))
          ])
        ]),
        searchError && React.createElement('div', {
          key: 'error',
          className: 'error-msg'
        }, searchError),
        foundUser && React.createElement('div', {
          key: 'result',
          className: 'glass',
          style: { marginTop: '1rem', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '16px' }
        }, [
          React.createElement('div', { key: 'info' }, [
            React.createElement('strong', { style: { fontSize: '1.1rem' } }, foundUser.displayName || foundUser.email),
            React.createElement('div', { style: { fontSize: '0.85rem', color: 'var(--text-secondary)' } }, foundUser.cpCode),
            foundUser.status && React.createElement('div', { style: { fontSize: '0.8rem', color: 'var(--text-secondary)' } }, foundUser.status)
          ]),
          alreadyFriend
            ? React.createElement('button', {
                key: 'message',
                className: 'btn btn-primary',
                onClick: () => openChat(foundUser.uid)
              }, [React.createElement('i', { key: 'icon', className: 'ph ph-chat-circle-dots' }), ' Message'])
            : React.createElement('button', {
                key: 'add',
                className: 'btn btn-primary',
                onClick: handleSendRequest
              }, [React.createElement('i', { key: 'icon', className: 'ph ph-user-plus' }), ' Add Friend'])
        ])
      ])
    );
  };

  const renderRequestsView = () =>
    React.createElement('div', { className: 'duo-container', style: { padding: '16px' } },
      React.createElement('div', { className: 'glass', style: { padding: '1.5rem', borderRadius: '20px' } }, [
        React.createElement('button', {
          key: 'back',
          className: 'btn-icon',
          onClick: () => setView('main')
        }, React.createElement('i', { className: 'ph ph-arrow-left' })),
        React.createElement('h2', { key: 'title', style: { marginBottom: '1rem' } }, 'Friend Requests'),
        friendRequests.length === 0
          ? React.createElement('p', {
              key: 'empty',
              className: 'text-secondary',
              style: { textAlign: 'center', padding: '2rem 0' }
            }, 'No pending requests')
          : React.createElement('div', { key: 'list', className: 'rooms-grid' },
              friendRequests.map(req => React.createElement(RequestCard, { key: req.id, req }))
            )
      ])
    );

  const renderChatView = () => {
    if (!foundUser) return null;
    const isOnline = friendPresence?.online;
    const typingFromFriend = typingUsers.includes(foundUser.uid);
    const initials = (foundUser.displayName || foundUser.email || '?').slice(0, 2).toUpperCase();

    // Typing indicator with bouncing dots
    const typingIndicator = typingFromFriend ? React.createElement('div', {
      className: 'typing-indicator'
    }, [
      React.createElement('div', { key: 'd1', className: 'typing-dot' }),
      React.createElement('div', { key: 'd2', className: 'typing-dot' }),
      React.createElement('div', { key: 'd3', className: 'typing-dot' })
    ]) : null;

    // Render date dividers and messages
    const messageElements = filteredGrouped.map(item => {
      if (item.type === 'date') {
        return React.createElement('div', {
          key: item.key,
          className: 'date-divider'
        }, React.createElement('span', null, item.date));
      }
      return React.createElement(MessageBubble, { key: item.key, msg: item.msg });
    });

    // Bars for reply, edit, forward
    const replyBar = replyTo ? React.createElement('div', { className: 'reply-bar' }, [
      React.createElement('div', { key: 'content', style: { flex: 1 } }, [
        React.createElement('div', { style: { fontSize: '0.7rem', color: 'var(--text-secondary)' } }, 'Replying to ' + replyTo.senderName),
        React.createElement('div', { style: { fontSize: '0.85rem' } }, replyTo.text)
      ]),
      React.createElement('button', {
        key: 'close',
        className: 'btn-icon',
        onClick: () => setReplyTo(null)
      }, React.createElement('i', { className: 'ph ph-x' }))
    ]) : null;

    const editBar = editMessage ? React.createElement('div', { className: 'reply-bar' }, [
      React.createElement('div', { key: 'content', style: { flex: 1 } }, [
        React.createElement('div', { style: { fontSize: '0.7rem', color: 'var(--accent)' } }, 'Editing message'),
        React.createElement('div', { style: { fontSize: '0.85rem' } }, editMessage.text)
      ]),
      React.createElement('button', {
        key: 'close',
        className: 'btn-icon',
        onClick: () => { setEditMessage(null); setNewMessage(''); }
      }, React.createElement('i', { className: 'ph ph-x' }))
    ]) : null;

    const forwardBar = forwardMessage ? React.createElement('div', { className: 'reply-bar' }, [
      React.createElement('div', { key: 'content', style: { flex: 1 } }, [
        React.createElement('div', { style: { fontSize: '0.7rem', color: 'var(--text-secondary)' } }, 'Forwarding from ' + forwardMessage.senderName),
        React.createElement('div', { style: { fontSize: '0.85rem' } }, forwardMessage.text)
      ]),
      React.createElement('button', {
        key: 'close',
        className: 'btn-icon',
        onClick: () => setForwardMessage(null)
      }, React.createElement('i', { className: 'ph ph-x' }))
    ]) : null;

    // Input tools (emoji, attach)
    const inputTools = React.createElement('div', { className: 'input-tools' }, [
      React.createElement('button', {
        key: 'emoji',
        className: 'btn-icon',
        type: 'button',
        onClick: () => { /* emoji picker placeholder */ },
        title: 'Emoji picker'
      }, React.createElement('i', { className: 'ph ph-smiley' })),
      React.createElement('button', {
        key: 'attach',
        className: 'btn-icon',
        type: 'button',
        title: 'Attach file'
      }, React.createElement('i', { className: 'ph ph-paperclip' }))
    ]);

    const inputForm = React.createElement('form', {
      className: 'chat-input-area',
      onSubmit: handleSendMessage
    }, [
      inputTools,
      React.createElement('input', {
        key: 'input',
        className: 'input-field',
        type: 'text',
        value: newMessage,
        onChange: e => setNewMessage(e.target.value),
        placeholder: editMessage ? 'Edit message...' : forwardMessage ? 'Add a note...' : 'Type a message...',
        onFocus: () => handleTyping(true),
        onBlur: () => handleTyping(false),
        onKeyDown: e => e.key === 'Enter' && !e.shiftKey && handleSendMessage(e),
        style: { flex: 1, marginBottom: 0, padding: '10px 16px', borderRadius: '24px' }
      }),
      React.createElement('button', {
        key: 'send',
        type: 'submit',
        className: 'btn btn-primary',
        disabled: !newMessage.trim() && !forwardMessage,
        style: { padding: '8px 14px', borderRadius: '50%', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }
      }, React.createElement('i', {
        className: `ph ${editMessage ? 'ph-pencil-simple' : forwardMessage ? 'ph-arrow-bend-right-down' : 'ph-paper-plane-right'}`,
        style: { fontSize: '1.1rem' }
      }))
    ]);

    // Main chat container - improved mobile layout
    return React.createElement('div', {
      className: 'duo-container chat-active',
      style: {
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '20px',
        overflow: 'hidden'
      }
    }, [
      // Header
      React.createElement('div', { key: 'header', className: 'chat-header' }, [
        React.createElement('button', {
          key: 'back',
          className: 'btn-icon',
          onClick: () => { setView('main'); setChatId(null); setShowSearchBar(false); }
        }, React.createElement('i', { className: 'ph ph-arrow-left' })),
        React.createElement('div', { key: 'avatar', className: 'avatar' }, initials),
        React.createElement('div', { key: 'info', className: 'user-info' }, [
          React.createElement('div', { key: 'name', className: 'user-name' }, [
            React.createElement('strong', null, foundUser.displayName || foundUser.email),
            isOnline ? React.createElement('span', { className: 'online-dot' }) : null
          ]),
          React.createElement('div', { key: 'status', className: 'user-status' }, [
            isOnline ? 'Online' : (friendPresence?.lastSeen?.toDate?.()?.toLocaleTimeString() ?? 'Offline'),
            typingFromFriend ? ' • Typing…' : ''
          ])
        ]),
        React.createElement('div', { key: 'actions', className: 'actions' }, [
          React.createElement('button', {
            key: 'search',
            className: 'btn-icon',
            title: 'Search in chat',
            onClick: () => setShowSearchBar(!showSearchBar)
          }, React.createElement('i', { className: 'ph ph-magnifying-glass' })),
          React.createElement('button', {
            key: 'export',
            className: 'btn-icon',
            title: 'Export chat',
            onClick: handleExportChat
          }, React.createElement('i', { className: 'ph ph-download-simple' })),
          React.createElement('button', {
            key: 'unfriend',
            className: 'btn-icon',
            title: 'Unfriend',
            onClick: () => handleUnfriend(foundUser.uid),
            style: { color: 'var(--danger)' }
          }, React.createElement('i', { className: 'ph ph-user-minus' }))
        ])
      ]),
      // Search bar (optional)
      showSearchBar && React.createElement('div', {
        key: 'searchbar',
        style: { padding: '8px 16px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px' }
      }, [
        React.createElement('input', {
          key: 'input',
          className: 'input-field',
          type: 'text',
          placeholder: 'Search messages...',
          value: searchInChat,
          onChange: e => setSearchInChat(e.target.value),
          style: { flex: 1, marginBottom: 0, padding: '8px 12px', fontSize: '0.85rem' }
        }),
        React.createElement('span', {
          key: 'count',
          style: { fontSize: '0.75rem', color: 'var(--text-secondary)' }
        }, searchResults.length > 0 ? `${searchResults.length} results` : '')
      ]),
      // Messages area
      React.createElement('div', { key: 'messages', className: 'chat-messages' }, [
        messageElements.length === 0
          ? React.createElement('div', {
              key: 'empty',
              className: 'empty-state'
            }, [
              React.createElement('i', { key: 'icon', className: 'ph ph-chat-circle-dots icon' }),
              React.createElement('h4', { key: 'title' }, 'No messages yet'),
              React.createElement('p', { key: 'desc' }, 'Say hello to your friend!')
            ])
          : messageElements,
        typingIndicator,
        React.createElement('div', { key: 'end', ref: messagesEndRef })
      ]),
      // Reply/Edit/Forward bars
      replyBar,
      editBar,
      forwardBar,
      // Input form
      inputForm
    ]);
  };

  switch (view) {
    case 'search': return renderSearchView();
    case 'requests': return renderRequestsView();
    case 'chat': return renderChatView();
    default: return renderMainView();
  }
                               }
