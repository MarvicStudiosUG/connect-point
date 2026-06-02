import React from 'react';
import { createRoot } from 'react-dom/client';
import { useState, useEffect } from 'react';
import { onAuthStateChanged, sendEmailVerification } from 'firebase/auth';
import { auth } from './config.js';
import { ThemeProvider, useTheme } from './theme.js';
import { UserProvider } from './UserContext.js';
import { createUserProfile, setUserOnline } from './db.js';
import Auth from './auth.js';
import SoloChat from './SoloChat.js';
import DuoChat from './DuoChat.js';
import Rooms from './Rooms.js';
import Vault from './Vault.js';
import Settings from './Settings.js';

const TABS = [
  { id: 'solo', label: 'Solo', icon: 'ph-terminal-window' },
  { id: 'duo', label: 'Duo', icon: 'ph-chats' },
  { id: 'rooms', label: 'Rooms', icon: 'ph-users-three' },
  { id: 'vault', label: 'Vault', icon: 'ph-lock-simple' },
  { id: 'settings', label: 'Settings', icon: 'ph-gear' },
];

function App() {
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('solo');
  const { theme, toggleTheme } = useTheme();
  const [verificationSent, setVerificationSent] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const profile = await createUserProfile(firebaseUser);
          setUserProfile(profile);
          setError(null);
          setUserOnline(firebaseUser.uid, true);
          window.addEventListener('beforeunload', () => setUserOnline(firebaseUser.uid, false));
        } catch (err) {
          console.error('Profile creation error:', err);
          setError('Failed to create profile: ' + err.message);
          await auth.signOut();
        }
      } else {
        if (userProfile) setUserOnline(userProfile.uid, false);
        setUserProfile(null);
        setError(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    if (userProfile) await setUserOnline(userProfile.uid, false);
    await auth.signOut();
  };

  const resendVerification = async () => {
    const user = auth.currentUser;
    if (user) {
      await sendEmailVerification(user);
      setVerificationSent(true);
    }
  };

  const renderScreen = () => {
    switch (activeTab) {
      case 'solo': return React.createElement(SoloChat);
      case 'duo': return React.createElement(DuoChat);
      case 'rooms': return React.createElement(Rooms);
      case 'vault': return React.createElement(Vault);
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

  if (error) {
    return React.createElement('div', { className: 'container-center' },
      React.createElement('div', { className: 'glass', style: { padding: '2rem', textAlign: 'center', maxWidth: '400px' } },
        React.createElement('h2', { style: { color: 'var(--danger)' } }, 'Sign‑in Error'),
        React.createElement('p', { style: { marginBottom: '1rem' } }, error),
        React.createElement('button', { className: 'btn btn-primary', onClick: () => { setError(null); window.location.reload(); } }, 'Try Again')
      )
    );
  }

  if (!userProfile) {
    return React.createElement(Auth, { onLogin: () => {} });
  }

  const currentUser = auth.currentUser;
  if (currentUser && !currentUser.emailVerified) {
    return React.createElement('div', { className: 'container-center' },
      React.createElement('div', { className: 'glass', style: { padding: '2rem', textAlign: 'center', maxWidth: '400px' } },
        React.createElement('h2', null, 'Verify Your Email'),
        React.createElement('p', { style: { marginBottom: '1rem', color: 'var(--text-secondary)' } },
          'We sent a verification link to ' + currentUser.email + '. Please check your inbox and spam folder.'),
        verificationSent && React.createElement('p', { style: { color: 'var(--success)', marginBottom: '1rem' } }, 'Verification email resent!'),
        React.createElement('button', { className: 'btn btn-primary', onClick: resendVerification, style: { marginBottom: '12px', width: '100%' } }, 'Resend Verification Email'),
        React.createElement('button', { className: 'btn', onClick: handleLogout, style: { width: '100%' } }, 'Sign Out')
      )
    );
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
