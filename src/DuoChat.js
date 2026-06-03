import React, { useState, useEffect, useRef, useCallback } from 'react';
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

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior:'smooth' }); }, [messages]);

  useEffect(() => { if (!currentUser?.uid) return; const unsub = listenFriendRequests(currentUser.uid, setFriendRequests); return () => unsub(); }, [currentUser?.uid]);

  useEffect(() => {
    if (!currentUser?.uid) return;
    const q = query(collection(db, 'chats'), where('participants', 'array-contains', currentUser.uid));
    const unsub = onSnapshot(q, snapshot => {
      const friendList = [];
      snapshot.forEach(d => { const data = d.data(); const friendId = data.participants.find(id => id !== currentUser.uid); if (friendId) friendList.push({ chatId:d.id, friendId }); });
      setFriends(friendList);
    });
    return () => unsub();
  }, [currentUser?.uid]);

  useEffect(() => { if (!chatId) return; const unsub = listenChatTyping(chatId, setTypingUsers); return () => unsub(); }, [chatId]);
  useEffect(() => { if (!chatId || !foundUser) return; const unsub = listenUserPresence(foundUser.uid, setFriendPresence); return () => unsub(); }, [chatId, foundUser]);
  useEffect(() => {
    if (!chatId) return;
    const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('timestamp', 'asc'));
    const unsub = onSnapshot(q, snapshot => { const msgs = snapshot.docs.map(d => ({ id:d.id, ...d.data() })); setMessages(msgs); });
    return () => unsub();
  }, [chatId]);

  useEffect(() => {
    if (!searchInChat.trim()) { setSearchResults([]); return; }
    const q = searchInChat.toLowerCase();
    setSearchResults(messages.filter(m => m.text?.toLowerCase().includes(q) || m.senderName?.toLowerCase().includes(q)));
  }, [searchInChat, messages]);

  const isFriend = useCallback(uid => friends.some(f => f.friendId === uid), [friends]);

  const handleSearchByCode = async () => {
    const code = searchInput.trim().toUpperCase();
    if (!code.startsWith('CP-') || code.length !== 13) { setSearchError('Invalid CP code format'); setFoundUser(null); return; }
    if (code === currentUser.cpCode) { setSearchError('You cannot chat with yourself'); setFoundUser(null); return; }
    setSearchError(''); setLoading(true);
    const user = await getUserByCpCode(code);
    setLoading(false);
    user ? setFoundUser(user) : setSearchError('User not found');
  };

  const handleSearchByName = async () => {
    if (!searchByNameInput.trim()) return;
    setLoading(true);
    const results = await searchUsersByName(searchByNameInput.trim(), currentUser.uid);
    setLoading(false);
    results.length > 0 ? (setFoundUser(results[0]), setSearchError('')) : setSearchError('No users found');
  };

  const handleSendRequest = async () => { try { await sendFriendRequest(currentUser.uid, foundUser.cpCode); alert('Friend request sent!'); setView('main'); } catch(err) { alert(err.message); } };
  const handleAcceptRequest = async (requestId) => {
    try {
      const { chatId:newChatId, friendId } = await acceptFriendRequest(requestId, currentUser.uid);
      const friendProfile = await getUserProfile(friendId);
      setChatId(newChatId); setFoundUser(friendProfile); setView('chat');
    } catch(err) { alert(err.message); }
  };
  const handleDeclineRequest = async (requestId) => { await declineFriendRequest(requestId, currentUser.uid); };
  const openChat = async (friendId) => {
    const ids = [currentUser.uid, friendId].sort();
    const chatId = `${ids[0]}_${ids[1]}`;
    setChatId(chatId);
    const profile = await getUserProfile(friendId);
    setFoundUser(profile); setView('chat'); setShowSearchBar(false); setSearchInChat(''); setSearchResults([]);
  };

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    const text = newMessage.trim();
    if (!text && !forwardMessage) return;
    if (!chatId) return;
    const msgData = { senderId:currentUser.uid, senderName:currentUser.displayName||currentUser.email, text:text||'', timestamp:serverTimestamp(), reactions:{} };
    if (replyTo) msgData.replyTo = { id:replyTo.id, text:replyTo.text, senderName:replyTo.senderName };
    if (forwardMessage) { msgData.forwardedFrom = { id:forwardMessage.id, text:forwardMessage.text, senderName:forwardMessage.senderName }; msgData.text = text || forwardMessage.text; }
    if (editMessage) {
      await updateDoc(doc(db, 'chats', chatId, 'messages', editMessage.id), { text:text, edited:true, editedAt:serverTimestamp() });
      setEditMessage(null); setNewMessage(''); return;
    }
    await addDoc(collection(db, 'chats', chatId, 'messages'), msgData);
    setNewMessage(''); setReplyTo(null); setForwardMessage(null); handleTyping(false);
  };

  const handleTyping = useCallback((isTyping) => { if (chatId) setChatTyping(chatId, currentUser.uid, isTyping); }, [chatId, currentUser?.uid]);
  const handleDeleteMessage = async (msgId) => { if (confirm('Delete this message?')) { await deleteMessage(`chats/${chatId}/messages/${msgId}`, currentUser.uid); } };
  const handleAddReaction = async (msgId, reactionType) => {
    if (!chatId) return;
    const msgRef = doc(db, 'chats', chatId, 'messages', msgId);
    const msg = messages.find(m => m.id === msgId);
    if (!msg) return;
    const reactions = msg.reactions || {};
    const users = reactions[reactionType] || [];
    users.includes(currentUser.uid) ? (reactions[reactionType] = users.filter(uid => uid !== currentUser.uid), reactions[reactionType].length === 0 && delete reactions[reactionType]) : (reactions[reactionType] = [...users, currentUser.uid]);
    await updateDoc(msgRef, { reactions });
  };
  const handleEditMessage = (msg) => { if (msg.senderId !== currentUser.uid) return; setEditMessage(msg); setNewMessage(msg.text); setReplyTo(null); setForwardMessage(null); };
  const handleForwardMessage = (msg) => { setForwardMessage(msg); setNewMessage(''); setReplyTo(null); setEditMessage(null); };
  const handleUnfriend = async (friendId) => { if (confirm('Remove this friend?')) { await unfriend(currentUser.uid, friendId); setChatId(null); setFoundUser(null); setView('main'); } };
  const handleExportChat = () => {
    const text = messages.map(m => `[${m.timestamp?.toDate?.()?.toLocaleTimeString()||'??'}] ${m.senderName}: ${m.text}`).join('\n');
    const blob = new Blob([text], { type:'text/plain' }); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `chat-export-${new Date().toISOString().slice(0,10)}.txt`; a.click(); URL.revokeObjectURL(url);
  };

  // FriendCard, RequestCard, MessageBubble components (same as before, but included fully below)
  const FriendCard = ({ friendId }) => {
    const [friendProfile, setFriendProfile] = useState(null);
    useEffect(() => { getUserProfile(friendId).then(setFriendProfile); }, [friendId]);
    if (!friendProfile) return null;
    const initials = (friendProfile.displayName || friendProfile.email || '?').slice(0,2).toUpperCase();
    return React.createElement('div', { className:'room-card glass', style:{ position:'relative', padding:'16px' } },
      React.createElement('div', { style:{ display:'flex', alignItems:'center', cursor:'pointer' }, onClick: () => openChat(friendId) },
        React.createElement('div', { style:{ width:'48px', height:'48px', borderRadius:'50%', background:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'bold', fontSize:'1.2rem', color:'white' } }, initials),
        React.createElement('div', { style:{ flex:1, marginLeft:'12px' } },
          React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'8px' } },
            React.createElement('strong', null, friendProfile.displayName || friendProfile.email),
            friendProfile.online && React.createElement('span', { className:'online-dot' })
          ),
          React.createElement('div', { style:{ fontSize:'0.8rem', color:'var(--text-secondary)' } }, friendProfile.status || friendProfile.cpCode)
        )
      ),
      React.createElement('button', { className:'btn-icon', style:{ position:'absolute', top:'8px', right:'8px', color:'var(--danger)' }, onClick: e => { e.stopPropagation(); handleUnfriend(friendId); } },
        React.createElement('i', { className:'ph ph-user-minus' }))
    );
  };

  const RequestCard = ({ req }) => {
    const [sender, setSender] = useState(null);
    useEffect(() => { getUserProfile(req.from).then(setSender); }, [req.from]);
    if (!sender) return React.createElement('div', { className:'room-card glass', style:{ padding:'16px' } }, React.createElement('strong', null, 'Loading...'));
    const initials = (sender.displayName || sender.email || '?').slice(0,2).toUpperCase();
    return React.createElement('div', { className:'room-card glass', style:{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px' } },
      React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'12px', flex:1, overflow:'hidden' } },
        React.createElement('div', { style:{ width:'40px', height:'40px', borderRadius:'50%', background:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'bold', color:'white' } }, initials),
        React.createElement('div', { style:{ overflow:'hidden', flex:1 } },
          React.createElement('strong', null, sender.displayName || sender.email),
          React.createElement('div', { style:{ fontSize:'0.8rem', color:'var(--text-secondary)' } }, sender.cpCode)
        )
      ),
      React.createElement('div', { style:{ display:'flex', gap:'8px', marginLeft:'12px', flexShrink:0 } },
        React.createElement('button', { className:'btn btn-primary', onClick:() => handleAcceptRequest(req.id), style:{ padding:'8px 16px' } }, 'Accept'),
        React.createElement('button', { className:'btn', onClick:() => handleDeclineRequest(req.id), style:{ padding:'8px 16px' } }, 'Decline')
      )
    );
  };

  const MessageBubble = ({ msg }) => {
    const isOwn = msg.senderId === currentUser.uid;
    const reactions = msg.reactions || {};
    const hasReactions = Object.keys(reactions).length > 0;
    const isEdited = msg.edited === true;
    const hasReply = msg.replyTo;
    const isForwarded = msg.forwardedFrom;
    const timeStr = msg.timestamp?.toDate?.()?.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) || '';

    const reactionPills = hasReactions ? React.createElement('div', { className:'reactions-bar', style:{ marginTop:'4px' } },
      Object.entries(reactions).map(([type, users]) => {
        const rdef = REACTION_TYPES.find(r => r.type === type);
        const icon = rdef ? rdef.icon : 'ph-thumbs-up';
        return React.createElement('span', { key:type, className:'reaction-item', onClick: () => handleAddReaction(msg.id, type) },
          React.createElement('i', { className: icon + ' reaction-icon' }),
          React.createElement('span', { style:{ fontSize:'0.7rem', color:'var(--text-secondary)' } }, users.length)
        );
      })) : null;

    const replyPreview = hasReply ? React.createElement('div', { className:'reply-preview' },
      React.createElement('span', { style:{ fontWeight:'bold', fontSize:'0.7rem', color:'var(--text-secondary)' } }, msg.replyTo.senderName + ': '),
      React.createElement('span', { style:{ fontSize:'0.8rem' } }, msg.replyTo.text)
    ) : null;

    const forwardIndicator = isForwarded ? React.createElement('div', { style:{ fontSize:'0.7rem', color:'var(--text-secondary)', marginBottom:'2px' } }, 'Forwarded from ' + msg.forwardedFrom.senderName) : null;

    const quickReactions = React.createElement('div', { style:{ display:'flex', gap:'2px', marginTop:'2px' } },
      REACTION_TYPES.slice(0,4).map(rdef =>
        React.createElement('button', { key:rdef.type, className:'btn-icon', title:rdef.label, onClick:() => handleAddReaction(msg.id, rdef.type) },
          React.createElement('i', { className: rdef.icon }))
      ));

    const messageActions = React.createElement('div', { className:'message-actions' },
      React.createElement('button', { className:'btn-icon', title:'Reply', onClick:() => setReplyTo({ id:msg.id, text:msg.text, senderName:msg.senderName }) }, React.createElement('i', { className:'ph ph-arrow-bend-left-up' })),
      React.createElement('button', { className:'btn-icon', title:'Forward', onClick:() => handleForwardMessage(msg) }, React.createElement('i', { className:'ph ph-arrow-bend-right-down' })),
      isOwn && React.createElement('button', { className:'btn-icon', title:'Edit', onClick:() => handleEditMessage(msg) }, React.createElement('i', { className:'ph ph-pencil-simple' })),
      React.createElement('button', { className:'btn-icon', title:'Delete', onClick:() => handleDeleteMessage(msg.id) }, React.createElement('i', { className:'ph ph-trash', style:{ color:'var(--danger)' } }))
    );

    return React.createElement('div', { className:`chat-bubble ${isOwn ? 'own' : 'other'}` },
      replyPreview, forwardIndicator,
      React.createElement('div', { className:'bubble-text' }, msg.text),
      isEdited && React.createElement('span', { style:{ fontSize:'0.6rem', opacity:0.6 } }, ' (edited)'),
      quickReactions, reactionPills,
      React.createElement('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'2px' } },
        React.createElement('div', { className:'bubble-time' }, timeStr),
        messageActions
      )
    );
  };

  // Views
  const renderMainView = () =>
    React.createElement('div', { className:'duo-container', style:{ padding:'16px' } },
      React.createElement('div', { className:'glass', style:{ padding:'1.5rem', borderRadius:'20px' } },
        React.createElement('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' } },
          React.createElement('h2', { style:{ margin:0 } }, 'Duo Chat'),
          React.createElement('div', { style:{ display:'flex', gap:'8px' } },
            React.createElement('button', { className:'btn', onClick:() => setView('search') }, React.createElement('i', { className:'ph ph-magnifying-glass' }), ' Find'),
            React.createElement('button', { className:'btn', onClick:() => setView('requests') }, 'Requests', friendRequests.length > 0 ? ` (${friendRequests.length})` : '')
          )
        ),
        React.createElement('h3', { style:{ marginBottom:'12px', fontSize:'1rem', color:'var(--text-secondary)' } }, 'Your Friends'),
        friends.length === 0
          ? React.createElement('div', { style:{ textAlign:'center', padding:'2rem 0', color:'var(--text-secondary)' } },
              React.createElement('i', { className:'ph ph-users', style:{ fontSize:'3rem', opacity:0.3 } }),
              React.createElement('p', null, 'No friends yet. Search by CP code or name to add.')
            )
          : React.createElement('div', { className:'rooms-grid' },
              friends.map(f => React.createElement(FriendCard, { key:f.chatId, friendId:f.friendId }))
            )
      )
    );

  const renderSearchView = () => {
    const alreadyFriend = foundUser ? isFriend(foundUser.uid) : false;
    return React.createElement('div', { className:'duo-container', style:{ padding:'16px' } },
      React.createElement('div', { className:'glass', style:{ padding:'1.5rem', borderRadius:'20px' } },
        React.createElement('button', { className:'btn-icon', onClick:() => setView('main'), style:{ marginBottom:'12px' } }, React.createElement('i', { className:'ph ph-arrow-left' })),
        React.createElement('h2', null, 'Find Friend'),
        React.createElement('div', { className:'input-group' },
          React.createElement('label', null, 'Search by CP Code'),
          React.createElement('div', { style:{ display:'flex', gap:'8px' } },
            React.createElement('input', { className:'input-field', type:'text', placeholder:'CP-1234567890', value:searchInput, onChange:e => setSearchInput(e.target.value.toUpperCase()), onKeyDown:e => e.key==='Enter' && handleSearchByCode(), style:{ flex:1 } }),
            React.createElement('button', { className:'btn btn-primary', onClick:handleSearchByCode, style:{ padding:'0 20px' } }, React.createElement('i', { className:'ph ph-magnifying-glass' }))
          )
        ),
        React.createElement('div', { className:'input-group', style:{ marginTop:'12px' } },
          React.createElement('label', null, 'Search by Name'),
          React.createElement('div', { style:{ display:'flex', gap:'8px' } },
            React.createElement('input', { className:'input-field', type:'text', placeholder:'Display name', value:searchByNameInput, onChange:e => setSearchByNameInput(e.target.value), onKeyDown:e => e.key==='Enter' && handleSearchByName(), style:{ flex:1 } }),
            React.createElement('button', { className:'btn', onClick:handleSearchByName, style:{ padding:'0 20px' } }, React.createElement('i', { className:'ph ph-magnifying-glass' }))
          )
        ),
        searchError && React.createElement('div', { className:'error-msg' }, searchError),
        foundUser && React.createElement('div', { className:'glass', style:{ marginTop:'1rem', padding:'1rem', display:'flex', justifyContent:'space-between', alignItems:'center', borderRadius:'16px' } },
          React.createElement('div', null,
            React.createElement('strong', { style:{ fontSize:'1.1rem' } }, foundUser.displayName || foundUser.email),
            React.createElement('div', { style:{ fontSize:'0.85rem', color:'var(--text-secondary)' } }, foundUser.cpCode),
            foundUser.status && React.createElement('div', { style:{ fontSize:'0.8rem', color:'var(--text-secondary)' } }, foundUser.status)
          ),
          alreadyFriend
            ? React.createElement('button', { className:'btn btn-primary', onClick:() => openChat(foundUser.uid) }, React.createElement('i', { className:'ph ph-chat-circle-dots' }), ' Message')
            : React.createElement('button', { className:'btn btn-primary', onClick:handleSendRequest }, React.createElement('i', { className:'ph ph-user-plus' }), ' Add Friend')
        )
      )
    );
  };

  const renderRequestsView = () =>
    React.createElement('div', { className:'duo-container', style:{ padding:'16px' } },
      React.createElement('div', { className:'glass', style:{ padding:'1.5rem', borderRadius:'20px' } },
        React.createElement('button', { className:'btn-icon', onClick:() => setView('main') }, React.createElement('i', { className:'ph ph-arrow-left' })),
        React.createElement('h2', { style:{ marginBottom:'1rem' } }, 'Friend Requests'),
        friendRequests.length === 0
          ? React.createElement('p', { className:'text-secondary', style:{ textAlign:'center', padding:'2rem 0' } }, 'No pending requests')
          : React.createElement('div', { className:'rooms-grid' },
              friendRequests.map(req => React.createElement(RequestCard, { key:req.id, req }))
            )
      )
    );

  const renderChatView = () => {
    if (!foundUser) return null;
    const isOnline = friendPresence?.online;
    const typingFromFriend = typingUsers.includes(foundUser.uid);

    // Group messages by date
    const groupedMessages = [];
    let currentDate = null;
    messages.forEach(msg => {
      const date = msg.timestamp?.toDate?.()?.toLocaleDateString() || '';
      if (date !== currentDate) { currentDate = date; if (date) groupedMessages.push({ type:'date', date, key:`date-${date}` }); }
      groupedMessages.push({ type:'message', msg, key:msg.id });
    });

    const filteredGrouped = searchInChat.trim() ? groupedMessages.filter(item => item.type==='message' && (item.msg.text?.toLowerCase().includes(searchInChat.toLowerCase()) || item.msg.senderName?.toLowerCase().includes(searchInChat.toLowerCase()))) : groupedMessages;
    const messageElements = filteredGrouped.map(item => item.type==='date' ? React.createElement('div', { key:item.key, style:{ textAlign:'center', padding:'8px 0', color:'var(--text-secondary)', fontSize:'0.75rem' } }, React.createElement('span', { style:{ background:'var(--surface)', padding:'4px 12px', borderRadius:'12px' } }, item.date)) : React.createElement(MessageBubble, { key:item.key, msg:item.msg }));

    const typingIndicator = typingFromFriend ? React.createElement('div', { style:{ fontStyle:'italic', padding:'4px 16px', color:'var(--text-secondary)', fontSize:'0.85rem' } }, foundUser.displayName || foundUser.email, ' is typing...') : null;

    const replyBar = replyTo ? React.createElement('div', { className:'reply-bar' }, React.createElement('div', { style:{ flex:1 } }, React.createElement('div', { style:{ fontSize:'0.7rem', color:'var(--text-secondary)' } }, 'Replying to ' + replyTo.senderName), React.createElement('div', { style:{ fontSize:'0.85rem' } }, replyTo.text)), React.createElement('button', { className:'btn-icon', onClick:() => setReplyTo(null) }, React.createElement('i', { className:'ph ph-x' }))) : null;
    const editBar = editMessage ? React.createElement('div', { className:'reply-bar' }, React.createElement('div', { style:{ flex:1 } }, React.createElement('div', { style:{ fontSize:'0.7rem', color:'var(--accent)' } }, 'Editing message'), React.createElement('div', { style:{ fontSize:'0.85rem' } }, editMessage.text)), React.createElement('button', { className:'btn-icon', onClick:() => { setEditMessage(null); setNewMessage(''); } }, React.createElement('i', { className:'ph ph-x' }))) : null;
    const forwardBar = forwardMessage ? React.createElement('div', { className:'reply-bar' }, React.createElement('div', { style:{ flex:1 } }, React.createElement('div', { style:{ fontSize:'0.7rem', color:'var(--text-secondary)' } }, 'Forwarding from ' + forwardMessage.senderName), React.createElement('div', { style:{ fontSize:'0.85rem' } }, forwardMessage.text)), React.createElement('button', { className:'btn-icon', onClick:() => setForwardMessage(null) }, React.createElement('i', { className:'ph ph-x' }))) : null;

    return React.createElement('div', { className:'duo-container chat-active', style:{ height:'calc(100vh - 160px)', display:'flex', flexDirection:'column', borderRadius:'20px', overflow:'hidden' } },
      React.createElement('div', { className:'chat-header' },
        React.createElement('button', { className:'btn-icon', onClick:() => { setView('main'); setChatId(null); setShowSearchBar(false); } }, React.createElement('i', { className:'ph ph-arrow-left' })),
        React.createElement('div', { style:{ width:'40px', height:'40px', borderRadius:'50%', background:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'bold', color:'white', marginLeft:'8px' } }, (foundUser.displayName || foundUser.email || '?').slice(0,2).toUpperCase()),
        React.createElement('div', { style:{ flex:1, marginLeft:'12px' } },
          React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'8px' } },
            React.createElement('strong', null, foundUser.displayName || foundUser.email),
            isOnline ? React.createElement('span', { className:'online-dot' }) : React.createElement('span', { style:{ display:'inline-block', width:'8px', height:'8px', borderRadius:'50%', background:'var(--text-secondary)' } })
          ),
          React.createElement('div', { style:{ fontSize:'0.75rem', color:'var(--text-secondary)' } }, isOnline ? 'Online' : (friendPresence?.lastSeen?.toDate ? 'Last seen ' + new Date(friendPresence.lastSeen.toDate()).toLocaleTimeString() : 'Offline'), typingFromFriend && ' - Typing...')
        ),
        React.createElement('button', { className:'btn-icon', title:'Search in chat', onClick:() => setShowSearchBar(!showSearchBar) }, React.createElement('i', { className:'ph ph-magnifying-glass' })),
        React.createElement('button', { className:'btn-icon', title:'Export chat', onClick:handleExportChat }, React.createElement('i', { className:'ph ph-download-simple' })),
        React.createElement('button', { className:'btn-icon', title:'Unfriend', onClick:() => handleUnfriend(foundUser.uid), style:{ color:'var(--danger)' } }, React.createElement('i', { className:'ph ph-user-minus' }))
      ),
      showSearchBar && React.createElement('div', { style:{ padding:'8px 16px', background:'var(--surface)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:'8px' } },
        React.createElement('input', { className:'input-field', type:'text', placeholder:'Search messages...', value:searchInChat, onChange:e => setSearchInChat(e.target.value), style:{ flex:1, marginBottom:0, padding:'8px 12px', fontSize:'0.85rem' } }),
        React.createElement('span', { style:{ fontSize:'0.75rem', color:'var(--text-secondary)' } }, searchResults.length > 0 ? `${searchResults.length} results` : '')
      ),
      React.createElement('div', { className:'chat-messages' },
        messageElements.length === 0 ? React.createElement('div', { style:{ textAlign:'center', padding:'2rem 0', color:'var(--text-secondary)' } }, React.createElement('i', { className:'ph ph-chat-circle-dots', style:{ fontSize:'3rem', opacity:0.3 } }), React.createElement('p', null, 'No messages yet.')) : messageElements,
        typingIndicator,
        React.createElement('div', { ref: messagesEndRef })
      ),
      replyBar, editBar, forwardBar,
      React.createElement('form', { className:'chat-input-area', onSubmit:handleSendMessage },
        React.createElement('input', { className:'input-field', type:'text', value:newMessage, onChange:e => setNewMessage(e.target.value), placeholder: editMessage ? 'Edit message...' : forwardMessage ? 'Add a note...' : 'Type a message...', onFocus:() => handleTyping(true), onBlur:() => handleTyping(false), onKeyDown:e => e.key==='Enter' && !e.shiftKey && handleSendMessage(e), style:{ flex:1, marginBottom:0, padding:'12px 16px', borderRadius:'24px' } }),
        React.createElement('button', { type:'submit', className:'btn btn-primary', disabled:!newMessage.trim() && !forwardMessage, style:{ padding:'10px 16px', borderRadius:'50%', width:'48px', height:'48px', display:'flex', alignItems:'center', justifyContent:'center' } },
          React.createElement('i', { className:`ph ${editMessage ? 'ph-pencil-simple' : forwardMessage ? 'ph-arrow-bend-right-down' : 'ph-paper-plane-right'}`, style:{ fontSize:'1.2rem' } }))
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
