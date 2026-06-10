import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  collection, query, orderBy, onSnapshot,
  addDoc, serverTimestamp, where, doc,
  updateDoc, getDoc, getDocs
} from 'firebase/firestore';
import { FixedSizeList as List } from 'react-window';
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

// Toast component
function Toast({ message, type, onClose }) {
  React.useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);
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
  const typingTimeoutRef = useRef();
  const listRef = useRef();

  // --- Toast helper ---
  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // --- Scroll to bottom on new messages ---
  useEffect(() => {
    if (!listRef.current) return;
    try {
      listRef.current.scrollToItem(messages.length - 1, 'end');
    } catch (e) {
      // Ignore scroll errors
    }
  }, [messages]);

  // --- Friend requests listener ---
  useEffect(() => {
    if (!currentUser?.uid) return;
    const unsub = listenFriendRequests(currentUser.uid, setFriendRequests);
    return () => unsub();
  }, [currentUser?.uid]);

  // --- Friends list with unread count ---
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
          try {
            const chatRef = doc(db, 'chats', d.id);
            const chatDoc = await getDoc(chatRef);
            const chatData = chatDoc.data();
            const lastRead = chatData?.lastRead?.[currentUser.uid];
            let lastReadTime = 0;
            if (lastRead) {
              if (typeof lastRead === 'object' && lastRead?.toDate) {
                lastReadTime = lastRead.toDate().getTime();
              } else if (typeof lastRead === 'number') {
                lastReadTime = lastRead;
              }
            }
            const msgsQ = query(
              collection(db, 'chats', d.id, 'messages'),
              where('timestamp', '>', new Date(lastReadTime))
            );
            const msgsSnap = await getDocs(msgsQ);
            const unread = msgsSnap.size;
            friendList.push({ chatId: d.id, friendId, unread });
          } catch (e) {
            friendList.push({ chatId: d.id, friendId, unread: 0 });
          }
        }
      }
      setFriends(friendList);
    });
    return () => unsub();
  }, [currentUser?.uid]);

  // --- Typing listener ---
  useEffect(() => {
    if (!chatId) return;
    const unsub = listenChatTyping(chatId, setTypingUsers);
    return () => unsub();
  }, [chatId]);

  // --- Presence listener ---
  useEffect(() => {
    if (!chatId || !foundUser) return;
    const unsub = listenUserPresence(foundUser.uid, setFriendPresence);
    return () => unsub();
  }, [chatId, foundUser]);

  // --- Messages listener with read receipt update ---
  useEffect(() => {
    if (!chatId) return;
    const q = query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('timestamp', 'asc')
    );
    const unsub = onSnapshot(q, async snapshot => {
      try {
        const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setMessages(msgs);

        // Mark messages as seen by current user (read receipt)
        const unseenMsgs = msgs.filter(m =>
          m.senderId !== currentUser.uid &&
          !(m.seenBy || []).includes(currentUser.uid)
        );
        for (const msg of unseenMsgs) {
          await updateDoc(doc(db, 'chats', chatId, 'messages', msg.id), {
            seenBy: [...(msg.seenBy || []), currentUser.uid]
          });
        }

        // Update lastRead timestamp for this chat
        if (msgs.length > 0) {
          const chatRef = doc(db, 'chats', chatId);
          await updateDoc(chatRef, {
            [`lastRead.${currentUser.uid}`]: serverTimestamp()
          });
        }
      } catch (e) {
        console.error('Error in messages listener:', e);
      }
    });
    return () => unsub();
  }, [chatId, currentUser?.uid]);

  // --- Search within chat ---
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

  // --- Safe date formatting helper ---
  const safeFormatTime = useCallback((timestamp) => {
    if (!timestamp) return '??';
    try {
      if (typeof timestamp === 'object' && timestamp?.toDate) {
        const date = timestamp.toDate();
        if (date instanceof Date && !isNaN(date.getTime())) {
          return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
      }
      return '??';
    } catch (e) {
      return '??';
    }
  }, []);

  const safeFormatDate = useCallback((timestamp) => {
    if (!timestamp) return '';
    try {
      if (typeof timestamp === 'object' && timestamp?.toDate) {
        const date = timestamp.toDate();
        if (date instanceof Date && !isNaN(date.getTime())) {
          return date.toLocaleDateString();
        }
      }
      return '';
    } catch (e) {
      return '';
    }
  }, []);

  // --- Memoized message grouping with date separators ---
  const groupedMessages = useMemo(() => {
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
  }, [messages, safeFormatDate]);

  // --- Filtered grouped messages for search (with highlighting) ---
  const filteredGrouped = useMemo(() => {
    if (!searchInChat.trim()) return groupedMessages;
    const lower = searchInChat.toLowerCase();
    return groupedMessages.filter(item => {
      if (item.type === 'date') return false;
      const text = item.msg.text?.toLowerCase() || '';
      const name = item.msg.senderName?.toLowerCase() || '';
      return text.includes(lower) || name.includes(lower);
    });
  }, [groupedMessages, searchInChat]);

  // --- Virtual list row renderer ---
  const Row = useCallback(({ index, style }) => {
    const item = filteredGrouped[index];
    if (!item) return null;
    if (item.type === 'date') {
      return React.createElement('div', {
        style: { ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 0' }
      }, React.createElement('span', { className: 'date-divider' }, item.date));
    }
    const msg = item.msg;
    return React.createElement(MessageBubble, {
      key: msg.id,
      msg,
      style, // style contains absolute positioning from react-window
      searchTerm: searchInChat
    });
  }, [filteredGrouped, searchInChat]);

  // --- isFriend helper ---
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
      showToast('Friend request sent!', 'success');
      setView('main');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleAcceptRequest = async (requestId) => {
    try {
      const { chatId: newChatId, friendId } = await acceptFriendRequest(requestId, currentUser.uid);
      const friendProfile = await getUserProfile(friendId);
      setChatId(newChatId);
      setFoundUser(friendProfile);
      setView('chat');
      showToast('Friend request accepted!', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeclineRequest = async (requestId) => {
    try {
      await declineFriendRequest(requestId, currentUser.uid);
      showToast('Request declined', 'info');
    } catch (err) {
      showToast(err.message, 'error');
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
      reactions: {},
      seenBy: [currentUser.uid]
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

  // ===== Sub-components =====
  function FriendCard({ friendId, unread }) {
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
        ]),
        unread > 0 && React.createElement('div', {
          key: 'unread',
          style: {
            marginLeft: 'auto',
            background: 'var(--accent)',
            color: 'white',
            borderRadius: '50%',
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.7rem',
            fontWeight: 'bold'
          }
        }, unread)
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

  // ===== MODERN MESSAGE BUBBLE =====
  function MessageBubble({ msg, style }) {
    const isOwn = msg.senderId === currentUser.uid;
    const reactions = msg.reactions || {};
    const hasReactions = Object.keys(reactions).length > 0;
    const isEdited = msg.edited === true;
    const hasReply = msg.replyTo;
    const isForwarded = msg.forwardedFrom;
    const timeStr = safeFormatTime(msg.timestamp);
    const seenBy = msg.seenBy || [];
    const isSeen = seenBy.includes(currentUser.uid) && !isOwn;
    const isDelivered = seenBy.length > 1;

    // Local state to toggle the full reaction picker
    const [showReactionPicker, setShowReactionPicker] = useState(false);

    // Helper to highlight search term in text
    const highlightText = (text, searchTerm) => {
      if (!searchTerm || !text) return text;
      const lower = searchTerm.toLowerCase();
      if (!text.toLowerCase().includes(lower)) return text;
      const parts = text.split(new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
      return parts.map((part, i) =>
        part.toLowerCase() === lower
          ? React.createElement('span', { key: i, className: 'highlight' }, part)
          : React.createElement('span', { key: i }, part)
      );
    };

    const textContent = highlightText(msg.text || '', searchInChat);

    // Reply preview
    const replyPreview = hasReply ? React.createElement('div', { className: 'reply-preview' }, [
      React.createElement('span', {
        key: 'label',
        style: { fontWeight: 'bold', fontSize: '0.7rem', color: 'var(--text-secondary)' }
      }, msg.replyTo.senderName + ': '),
      React.createElement('span', { key: 'text', style: { fontSize: '0.7rem' } }, msg.replyTo.text)
    ]) : null;

    // Forward indicator
    const forwardIndicator = isForwarded ? React.createElement('div', {
      style: { fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '2px' }
    }, 'Forwarded from ' + msg.forwardedFrom.senderName) : null;

    // Edited badge
    const editedBadge = isEdited ? React.createElement('span', {
      style: { fontSize: '0.6rem', opacity: 0.6, marginLeft: '4px' }
    }, '(edited)') : null;

    // Status icon (read receipts)
    const statusIcon = isOwn ? React.createElement('span', {
      className: 'message-status',
      style: { marginLeft: '6px' }
    }, React.createElement('i', {
      className: isSeen ? 'ph ph-check-double' : isDelivered ? 'ph ph-check-double' : 'ph ph-check',
      style: {
        color: isSeen ? 'var(--success)' : isDelivered ? 'var(--accent-light)' : 'var(--text-secondary)',
        fontSize: '0.8rem'
      }
    })) : null;

    // Reaction pills (existing reactions)
    const reactionPills = hasReactions ? React.createElement('div', {
      className: 'reactions-bar',
      style: { display: 'flex', gap: '4px', marginTop: '4px' }
    }, Object.entries(reactions).map(([type, users]) => {
      const rdef = REACTION_TYPES.find(r => r.type === type);
      const icon = rdef ? rdef.icon : 'ph-thumbs-up';
      return React.createElement('button', {
        key: type,
        className: 'reaction-item',
        onClick: () => handleAddReaction(msg.id, type),
        style: {
          display: 'flex', alignItems: 'center', gap: '2px',
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: '12px', padding: '2px 8px', cursor: 'pointer'
        }
      }, [
        React.createElement('i', { key: 'icon', className: icon, style: { fontSize: '0.9rem' } }),
        React.createElement('span', {
          key: 'count',
          style: { fontSize: '0.7rem', color: 'var(--text-secondary)' }
        }, users.length)
      ]);
    })) : null;

    // Quick reaction buttons (first 4 reactions)
    const quickReactions = React.createElement('div', {
      style: { display: 'flex', gap: '2px', marginTop: '4px' }
    }, REACTION_TYPES.slice(0, 4).map(rdef =>
      React.createElement('button', {
        key: rdef.type,
        className: 'btn-icon',
        title: rdef.label,
        onClick: () => handleAddReaction(msg.id, rdef.type),
        style: { fontSize: '0.9rem', padding: '2px 4px' }
      }, React.createElement('i', { className: rdef.icon }))
    ));

    // Message actions (reply, forward, edit, delete)
    const messageActions = React.createElement('div', {
      className: 'message-actions',
      style: { display: 'flex', gap: '2px', marginTop: '4px' }
    }, [
      React.createElement('button', {
        key: 'reply',
        className: 'btn-icon',
        title: 'Reply',
        onClick: () => setReplyTo({ id: msg.id, text: msg.text, senderName: msg.senderName }),
        style: { fontSize: '0.9rem', padding: '2px' }
      }, React.createElement('i', { className: 'ph ph-arrow-bend-left-up' })),
      React.createElement('button', {
        key: 'forward',
        className: 'btn-icon',
        title: 'Forward',
        onClick: () => handleForwardMessage(msg),
        style: { fontSize: '0.9rem', padding: '2px' }
      }, React.createElement('i', { className: 'ph ph-arrow-bend-right-down' })),
      isOwn && React.createElement('button', {
        key: 'edit',
        className: 'btn-icon',
        title: 'Edit',
        onClick: () => handleEditMessage(msg),
        style: { fontSize: '0.9rem', padding: '2px' }
      }, React.createElement('i', { className: 'ph ph-pencil-simple' })),
      React.createElement('button', {
        key: 'delete',
        className: 'btn-icon',
        title: 'Delete',
        onClick: () => handleDeleteMessage(msg.id),
        style: { fontSize: '0.9rem', padding: '2px', color: 'var(--danger)' }
      }, React.createElement('i', { className: 'ph ph-trash' }))
    ]);

    // Full reaction picker (popup)
    const reactionPickerPopup = showReactionPicker ? React.createElement('div', {
      className: 'reaction-picker-popup',
      style: {
        display: 'flex', gap: '4px', padding: '6px', background: 'var(--surface)',
        borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%',
        transform: 'translateX(-50%)', zIndex: 10
      }
    }, REACTION_TYPES.map(r => React.createElement('button', {
      key: r.type,
      className: 'btn-icon',
      title: r.label,
      onClick: (e) => {
        e.stopPropagation();
        handleAddReaction(msg.id, r.type);
        setShowReactionPicker(false);
      },
      style: { fontSize: '1.3rem', padding: '4px' }
    }, React.createElement('i', { className: r.icon })))) : null;

    // "+" button to open full picker
    const openPickerButton = React.createElement('button', {
      className: 'btn-icon',
      title: 'Add reaction',
      onClick: (e) => { e.stopPropagation(); setShowReactionPicker(!showReactionPicker); },
      style: { fontSize: '0.9rem', padding: '2px 4px', marginTop: '4px' }
    }, React.createElement('i', { className: 'ph ph-smiley-plus' }));

    // Combine time, status, edited badge, and actions into a bottom row
    const bottomRow = React.createElement('div', {
      style: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginTop: '6px', flexWrap: 'wrap', gap: '4px'
      }
    }, [
      React.createElement('div', {
        key: 'time-status',
        style: { display: 'flex', alignItems: 'center', gap: '4px' }
      }, [
        React.createElement('span', { key: 'time', className: 'bubble-time', style: { fontSize: '0.7rem', color: 'var(--text-secondary)' } }, timeStr),
        editedBadge,
        statusIcon
      ]),
      messageActions
    ]);

    // Main bubble content
    const bubbleContent = [
      replyPreview,
      forwardIndicator,
      React.createElement('div', { key: 'text', className: 'bubble-text', style: { wordBreak: 'break-word' } }, textContent),
      quickReactions,
      reactionPills,
      openPickerButton,
      reactionPickerPopup,
      bottomRow
    ];

    // Wrapper: react-window gives absolute positioning via `style`. We wrap with a relative container to position popups correctly.
    return React.createElement('div', {
      style: { ...style, position: 'relative' } // ensure popup can be positioned relative to this
    }, [
      React.createElement('div', {
        key: 'bubble',
        className: `chat-bubble ${isOwn ? 'own' : 'other'}`,
        style: {
          maxWidth: '80%',
          margin: isOwn ? '0 0 0 auto' : '0 auto 0 0',
          padding: '8px 12px',
          borderRadius: '16px',
          background: isOwn ? 'var(--accent)' : 'var(--surface)',
          color: isOwn ? 'white' : 'var(--text-primary)',
          boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
          position: 'relative'
        }
      }, bubbleContent)
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
              friends.map(f => React.createElement(FriendCard, {
                key: f.chatId,
                friendId: f.friendId,
                unread: f.unread || 0
              }))
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

    let lastSeenText = 'Offline';
    try {
      if (friendPresence?.lastSeen?.toDate) {
        const date = friendPresence.lastSeen.toDate();
        if (date instanceof Date && !isNaN(date.getTime())) {
          lastSeenText = 'Last seen ' + date.toLocaleTimeString();
        }
      }
    } catch (e) {
      lastSeenText = 'Offline';
    }

    // Typing indicator
    const typingIndicator = typingFromFriend ? React.createElement('div', {
      className: 'typing-indicator',
      style: { padding: '4px 16px' }
    }, [
      React.createElement('div', { key: 'd1', className: 'typing-dot' }),
      React.createElement('div', { key: 'd2', className: 'typing-dot' }),
      React.createElement('div', { key: 'd3', className: 'typing-dot' })
    ]) : null;

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

    // Input form
    const inputForm = React.createElement('form', {
      className: 'chat-input-area',
      onSubmit: handleSendMessage
    }, [
      React.createElement('div', {
        key: 'settings',
        style: { display: 'flex', alignItems: 'center', gap: '6px', marginRight: '4px' }
      }, [
        React.createElement('label', {
          key: 'label',
          style: { fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }
        }, [
          React.createElement('input', {
            key: 'checkbox',
            type: 'checkbox',
            checked: enterToSend,
            onChange: e => setEnterToSend(e.target.checked)
          }),
          'Enter sends'
        ])
      ]),
      React.createElement('input', {
        key: 'input',
        className: 'input-field',
        type: 'text',
        value: newMessage,
        onChange: e => setNewMessage(e.target.value),
        placeholder: editMessage ? 'Edit message...' : forwardMessage ? 'Add a note...' : 'Type a message...',
        onFocus: () => handleTyping(true),
        onBlur: () => handleTyping(false),
        onKeyDown: e => {
          if (e.key === 'Enter') {
            if (enterToSend && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage(e);
            } else if (!enterToSend && e.shiftKey) {
              e.preventDefault();
              handleSendMessage(e);
            }
          }
        },
        style: { flex: 1, marginBottom: 0, padding: '12px 18px', borderRadius: '24px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '0.95rem', outline: 'none' }
      }),
      React.createElement('button', {
        key: 'send',
        type: 'submit',
        className: 'btn btn-primary',
        disabled: !newMessage.trim() && !forwardMessage,
        style: { padding: '10px 16px', borderRadius: '50%', width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent)', color: 'white', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px var(--accent-glow)' }
      }, React.createElement('i', {
        className: `ph ${editMessage ? 'ph-pencil-simple' : forwardMessage ? 'ph-arrow-bend-right-down' : 'ph-paper-plane-right'}`,
        style: { fontSize: '1.1rem' }
      }))
    ]);

    // Main chat container
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
          onClick: () => { setView('main'); setChatId(null); setShowSearchBar(false); },
          style: { padding: '8px', borderRadius: '50%', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem' }
        }, React.createElement('i', { className: 'ph ph-arrow-left' })),
        React.createElement('div', { key: 'avatar', className: 'avatar' }, initials),
        React.createElement('div', { key: 'info', className: 'user-info' }, [
          React.createElement('div', { key: 'name', className: 'user-name' }, [
            React.createElement('strong', null, foundUser.displayName || foundUser.email),
            isOnline ? React.createElement('span', { className: 'online-dot' }) : null
          ]),
          React.createElement('div', { key: 'status', className: 'user-status' }, [
            isOnline ? 'Online' : lastSeenText,
            typingFromFriend ? ' • Typing…' : ''
          ])
        ]),
        React.createElement('div', { key: 'actions', className: 'actions' }, [
          React.createElement('button', {
            key: 'search',
            title: 'Search in chat',
            onClick: () => setShowSearchBar(!showSearchBar),
            style: { padding: '8px', borderRadius: '50%', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem' }
          }, React.createElement('i', { className: 'ph ph-magnifying-glass' })),
          React.createElement('button', {
            key: 'export',
            title: 'Export chat',
            onClick: handleExportChat,
            style: { padding: '8px', borderRadius: '50%', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem' }
          }, React.createElement('i', { className: 'ph ph-download-simple' })),
          React.createElement('button', {
            key: 'unfriend',
            title: 'Unfriend',
            onClick: () => handleUnfriend(foundUser.uid),
            style: { padding: '8px', borderRadius: '50%', background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '1.2rem' }
          }, React.createElement('i', { className: 'ph ph-user-minus' }))
        ])
      ]),
      // Search bar
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
      // Virtual message list
      React.createElement('div', { key: 'messages', style: { flex: 1, overflow: 'hidden' } },
        filteredGrouped.length === 0
          ? React.createElement('div', {
              className: 'empty-state',
              style: { height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 1.5rem', color: 'var(--text-secondary)', textAlign: 'center' }
            }, [
              React.createElement('i', { key: 'icon', className: 'ph ph-chat-circle-dots icon', style: { fontSize: '3.5rem', opacity: '0.2', marginBottom: '1rem' } }),
              React.createElement('h4', { key: 'title', style: { color: 'var(--text-primary)', fontSize: '1.1rem', marginBottom: '0.4rem' } }, 'No messages yet'),
              React.createElement('p', { key: 'desc', style: { fontSize: '0.9rem', maxWidth: '280px' } }, 'Say hello to your friend!')
            ])
          : React.createElement(List, {
              ref: listRef,
              height: 400,
              itemCount: filteredGrouped.length,
              itemSize: 80,
              width: '100%',
              style: { overflow: 'auto' }
            }, Row)
      ),
      // Typing indicator
      typingIndicator,
      // Reply/Edit/Forward bars
      replyBar,
      editBar,
      forwardBar,
      // Input form
      inputForm,
      // Toast
      toast && React.createElement(Toast, {
        message: toast.message,
        type: toast.type,
        onClose: () => setToast(null)
      })
    ]);
  };

  switch (view) {
    case 'search': return renderSearchView();
    case 'requests': return renderRequestsView();
    case 'chat': return renderChatView();
    default: return renderMainView();
  }
         }
