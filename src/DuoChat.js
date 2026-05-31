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
  unfriend,
  deleteMessage,
  searchUsersByName
} from './db.js';
import { useUser } from './UserContext.js';

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
  const [replyTo, setReplyTo] = useState(null); // { id, text, senderName }
  const messagesEndRef = useRef(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    if (!currentUser?.uid) return;
    const unsub = listenFriendRequests(currentUser.uid, setFriendRequests);
    return () => unsub();
  }, [currentUser?.uid]);

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

  useEffect(() => {
    if (!chatId) return;
    const unsub = listenChatTyping(chatId, setTypingUsers);
    return () => unsub();
  }, [chatId]);

  useEffect(() => {
    if (!chatId || !foundUser) return;
    const unsub = listenUserPresence(foundUser.uid, setFriendPresence);
    return () => unsub();
  }, [chatId, foundUser]);

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

  const isFriend = (uid) => friends.some((f) => f.friendId === uid);

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

  const handleSearchByName = async () => {
    if (!searchByNameInput.trim()) return;
    setLoading(true);
    const results = await searchUsersByName(searchByNameInput.trim(), currentUser.uid);
    setLoading(false);
    if (results.length === 0) {
      setSearchError('No users found');
      setFoundUser(null);
    } else {
      // show the first result, or a list? For simplicity, show first.
      setFoundUser(results[0]);
      setSearchError('');
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
    const msgData = {
      senderId: currentUser.uid,
      senderName: currentUser.displayName || currentUser.email,
      text: newMessage.trim(),
      timestamp: serverTimestamp(),
    };
    if (replyTo) {
      msgData.replyTo = { id: replyTo.id, text: replyTo.text, senderName: replyTo.senderName };
    }
    await addDoc(collection(db, 'chats', chatId, 'messages'), msgData);
    setNewMessage('');
    setReplyTo(null);
    handleTyping(false);
  };

  const handleTyping = (isTyping) => {
    if (chatId) setChatTyping(chatId, currentUser.uid, isTyping);
  };

  const handleDeleteMessage = async (msgId) => {
    if (confirm('Delete this message?')) {
      await deleteMessage(`chats/${chatId}/messages/${msgId}`, currentUser.uid);
    }
  };

  const handleUnfriend = async (friendId) => {
    if (confirm('Remove this friend?')) {
      await unfriend(currentUser.uid, friendId);
      setChatId(null);
      setFoundUser(null);
      setView('main');
    }
  };

  const FriendCard = ({ friendId }) => {
    const [friendProfile, setFriendProfile] = useState(null);
    useEffect(() => {
      getUserProfile(friendId).then(setFriendProfile);
    }, [friendId]);

    if (!friendProfile) return null;
    return React.createElement('div', { className: 'room-card glass', style: { position: 'relative' } },
      React.createElement('div', { className: 'room-card-header', onClick: () => openChat(friendId) },
        React.createElement('span', null, friendProfile.displayName || friendProfile.email),
        friendProfile.online && React.createElement('span', { className: 'online-dot' }),
        friendProfile.status && React.createElement('span', { style: { fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: '8px' } }, friendProfile.status)
      ),
      React.createElement('div', { className: 'room-code', onClick: () => openChat(friendId) }, friendProfile.cpCode),
      React.createElement('button', {
        className: 'btn-icon',
        style: { position: 'absolute', top: '8px', right: '8px', color: 'var(--danger)' },
        onClick: () => handleUnfriend(friendId)
      }, React.createElement('i', { className: 'ph ph-user-minus' }))
    );
  };

  const RequestCard = ({ req }) => {
    const [sender, setSender] = useState(null);
    useEffect(() => {
      getUserProfile(req.from).then(setSender);
    }, [req.from]);

    if (!sender) {
      return React.createElement('div', { className: 'room-card glass', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        React.createElement('div', null, React.createElement('strong', null, 'Loading...'))
      );
    }

    return React.createElement('div', { className: 'room-card glass', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' } },
      React.createElement('div', { style: { overflow: 'hidden', flex: 1 } },
        React.createElement('strong', null, sender.displayName || sender.email),
        React.createElement('div', { style: { fontSize: '0.8rem', color: 'var(--text-secondary)' } }, sender.cpCode)
      ),
      React.createElement('div', { style: { display: 'flex', gap: '8px', marginLeft: '12px', flexShrink: 0 } },
        React.createElement('button', { className: 'btn btn-primary', onClick: () => handleAcceptRequest(req.id), style: { padding: '8px 16px' } }, 'Accept'),
        React.createElement('button', { className: 'btn', onClick: () => handleDeclineRequest(req.id), style: { padding: '8px 16px' } }, 'Decline')
      )
    );
  };

  const renderMainView = () =>
    React.createElement('div', { className: 'duo-container' },
      React.createElement('div', { className: 'glass', style: { padding: '1.5rem' } },
        React.createElement('h2', null, 'Duo Chat'),
        React.createElement('div', { className: 'btn-group', style: { margin: '1rem 0', display: 'flex', gap: '8px' } },
          React.createElement('button', { className: 'btn btn-primary', onClick: () => setView('search') },
            React.createElement('i', { className: 'ph ph-magnifying-glass' }), ' Find Friend'),
          React.createElement('button', { className: 'btn', onClick: () => setView('requests') },
            'Requests (', friendRequests.length, ')')
        ),
        React.createElement('h3', null, 'Your Friends'),
        friends.length === 0
          ? React.createElement('p', { className: 'text-secondary' }, 'No friends yet. Search by CP code or name to add.')
          : React.createElement('div', { className: 'rooms-grid' },
              friends.map((f) =>
                React.createElement(FriendCard, { key: f.chatId, friendId: f.friendId })
              )
            )
      )
    );

  const renderSearchView = () => {
    const alreadyFriend = foundUser ? isFriend(foundUser.uid) : false;

    return React.createElement('div', { className: 'duo-container' },
      React.createElement('div', { className: 'glass', style: { padding: '1.5rem' } },
        React.createElement('button', { className: 'btn-icon', onClick: () => setView('main') },
          React.createElement('i', { className: 'ph ph-arrow-left' })),
        React.createElement('h2', null, 'Find Friend'),
        React.createElement('div', { className: 'input-group' },
          React.createElement('label', null, 'Search by CP Code'),
          React.createElement('input', { className: 'input-field', type: 'text', placeholder: 'CP-1234567890', value: searchInput, onChange: (e) => setSearchInput(e.target.value.toUpperCase()), onKeyDown: (e) => e.key === 'Enter' && handleSearchByCode() })
        ),
        React.createElement('button', { className: 'btn btn-primary', onClick: handleSearchByCode, style: { width: '100%' } }, 'Search'),
        React.createElement('div', { className: 'input-group', style: { marginTop: '12px' } },
          React.createElement('label', null, 'Search by Name'),
          React.createElement('input', { className: 'input-field', type: 'text', placeholder: 'Display name', value: searchByNameInput, onChange: (e) => setSearchByNameInput(e.target.value), onKeyDown: (e) => e.key === 'Enter' && handleSearchByName() })
        ),
        React.createElement('button', { className: 'btn', onClick: handleSearchByName, style: { width: '100%' } }, 'Search by Name'),
        searchError && React.createElement('div', { className: 'fade-in error-msg' }, searchError),
        foundUser && React.createElement('div', { className: 'glass', style: { marginTop: '1rem', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
          React.createElement('div', null,
            React.createElement('strong', null, foundUser.displayName || foundUser.email),
            React.createElement('div', { style: { fontSize: '0.8rem', color: 'var(--text-secondary)' } }, foundUser.cpCode),
            foundUser.status && React.createElement('div', { style: { fontSize: '0.8rem', color: 'var(--text-secondary)' } }, foundUser.status)
          ),
          alreadyFriend
            ? React.createElement('button', { className: 'btn btn-primary', onClick: () => openChat(foundUser.uid) }, 'Message')
            : React.createElement('button', { className: 'btn btn-primary', onClick: handleSendRequest }, 'Add Friend')
        )
      )
    );
  };

  const renderRequestsView = () =>
    React.createElement('div', { className: 'duo-container' },
      React.createElement('div', { className: 'glass', style: { padding: '1.5rem' } },
        React.createElement('button', { className: 'btn-icon', onClick: () => setView('main') },
          React.createElement('i', { className: 'ph ph-arrow-left' })),
        React.createElement('h2', { style: { marginBottom: '1rem' } }, 'Friend Requests'),
        friendRequests.length === 0
          ? React.createElement('p', { className: 'text-secondary' }, 'No pending requests')
          : React.createElement('div', { className: 'rooms-grid' },
              friendRequests.map((req) =>
                React.createElement(RequestCard, { key: req.id, req })
              )
            )
      )
    );

  const renderChatView = () => {
    if (!foundUser) return null;
    const isOnline = friendPresence?.online;

    return React.createElement('div', { className: 'duo-container chat-active' },
      React.createElement('div', { className: 'chat-header' },
        React.createElement('button', { className: 'btn-icon', onClick: () => { setView('main'); setChatId(null); } },
          React.createElement('i', { className: 'ph ph-arrow-left' })),
        React.createElement('div', { style: { flex: 1, textAlign: 'center' } },
          React.createElement('strong', null, foundUser.displayName || foundUser.email),
          React.createElement('div', { style: { fontSize: '0.75rem', color: 'var(--text-secondary)' } },
            isOnline ? 'Online' : 'Offline')
        ),
        React.createElement('button', { className: 'btn-icon', onClick: () => handleUnfriend(foundUser.uid) },
          React.createElement('i', { className: 'ph ph-user-minus', style: { color: 'var(--danger)' } }))
      ),
      typingUsers.length > 0 && React.createElement('div', { style: { fontStyle: 'italic', padding: '4px 16px', color: 'var(--text-secondary)' } }, 'Typing...'),
      React.createElement('div', { className: 'chat-messages' },
        messages.map((msg) => {
          const isOwn = msg.senderId === currentUser.uid;
          const replyPreview = msg.replyTo ? React.createElement('div', { className: 'reply-preview' },
            React.createElement('span', null, msg.replyTo.senderName + ': ' + msg.replyTo.text)
          ) : null;

          return React.createElement('div', { key: msg.id, className: `chat-bubble ${isOwn ? 'own' : 'other'}` },
            replyPreview,
            React.createElement('div', { className: 'bubble-text' }, msg.text),
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
              React.createElement('div', { className: 'bubble-time' },
                msg.timestamp ? new Date(msg.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
              ),
              React.createElement('div', { style: { display: 'flex', gap: '4px' } },
                React.createElement('button', { className: 'btn-icon', style: { fontSize: '0.8rem' }, title: 'Reply', onClick: () => setReplyTo({ id: msg.id, text: msg.text, senderName: msg.senderName }) },
                  React.createElement('i', { className: 'ph ph-arrow-bend-left-up' })),
                isOwn && React.createElement('button', { className: 'btn-icon', style: { fontSize: '0.8rem', color: 'var(--danger)' }, onClick: () => handleDeleteMessage(msg.id) },
                  React.createElement('i', { className: 'ph ph-trash' }))
              )
            )
          );
        }),
        React.createElement('div', { ref: messagesEndRef })
      ),
      replyTo && React.createElement('div', { className: 'reply-bar' },
        React.createElement('span', null, 'Replying to ' + replyTo.senderName + ': ' + replyTo.text),
        React.createElement('button', { className: 'btn-icon', onClick: () => setReplyTo(null) }, React.createElement('i', { className: 'ph ph-x' }))
      ),
      React.createElement('form', { className: 'chat-input-area', onSubmit: sendMessage },
        React.createElement('input', { className: 'input-field', type: 'text', value: newMessage, onChange: (e) => setNewMessage(e.target.value), placeholder: 'Type a message...', onFocus: () => handleTyping(true), onBlur: () => handleTyping(false) }),
        React.createElement('button', { type: 'submit', className: 'btn btn-primary' },
          React.createElement('i', { className: 'ph ph-paper-plane-right' }))
      )
    );
  };

  switch (view) {
    case 'search': return renderSearchView();
    case 'requests': return renderRequestsView();
    case 'chat': return renderChatView();
    default: return renderMainView();
  }
  }
