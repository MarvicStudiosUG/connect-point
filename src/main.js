import React from 'react';
import { createRoot } from 'react-dom/client';
import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './config.js';
import { ThemeProvider, useTheme } from './theme.js';
import { UserProvider } from './UserContext.js';
import { createUserProfile } from './db.js';
import Auth from './auth.js';
import SoloChat from './SoloChat.js';
import DuoChat from './DuoChat.js';
import Rooms from './Rooms.js';
import Settings from './Settings.js';

const TABS = [
  { id: 'solo', label: 'Solo', icon: 'ph-terminal-window' },
  { id: 'duo', label: 'Duo', icon: 'ph-chats' },
  { id: 'rooms', label: 'Rooms', icon: 'ph-users-three' },
  { id: 'settings', label: 'Settings', icon: 'ph-gear' },
];

function App() {
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('solo');
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const profile = await createUserProfile(firebaseUser);
        setUserProfile(profile);
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    await auth.signOut();
    setUserProfile(null);
  };

  const renderScreen = () => {
    switch (activeTab) {
      case 'solo': return React.createElement(SoloChat);
      case 'duo': return React.createElement(DuoChat);
      case 'rooms': return React.createElement(Rooms);
      case 'settings': return React.createElement(Settings);
      default: return React.createElement(SoloChat);
    }
  };

  if (loading) {
    return React.createElement('div', { className: 'container-center' },
      React.createElement('div', { className: 'glass', style: { padding: '2rem', textAlign: 'center' } },
        React.createElement('p', null, 'Loading Connect Point...')
      )
    );
  }

  if (!userProfile) {
    return React.createElement(Auth, { onLogin: () => {} });
  }

  return React.createElement(
    UserProvider,
    { user: userProfile },
    React.createElement('div', { className: 'app-container' },
      React.createElement('header', { className: 'app-header' },
        React.createElement('h1', { className: 'app-logo' }, 'Connect Point'),
        React.createElement('button', { className: 'theme-toggle-inline', onClick: toggleTheme },
          React.createElement('i', { className: `ph ${theme === 'dark' ? 'ph-sun' : 'ph-moon'}` })
        )
      ),
      React.createElement('main', { className: 'app-content' }, renderScreen()),
      React.createElement('nav', { className: 'bottom-nav' },
        TABS.map(tab => React.createElement('button', {
          key: tab.id,
          className: `nav-item ${activeTab === tab.id ? 'active' : ''}`,
          onClick: () => setActiveTab(tab.id)
        },
          React.createElement('i', { className: `ph ${tab.icon}` }),
          React.createElement('span', null, tab.label)
        ))
      )
    )
  );
}

const root = createRoot(document.getElementById('root'));
root.render(
  React.createElement(ThemeProvider, null, React.createElement(App))
);
