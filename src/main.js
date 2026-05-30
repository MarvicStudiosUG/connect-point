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
      case 'solo': return <SoloChat />;
      case 'duo': return <DuoChat />;
      case 'rooms': return <Rooms />;
      case 'settings': return <Settings />;
      default: return <SoloChat />;
    }
  };

  if (loading) {
    return (
      <div className="container-center">
        <div className="glass" style={{ padding: '2rem', textAlign: 'center' }}>
          <p>Loading Connect Point...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {!userProfile ? (
        <Auth onLogin={() => {}} />
      ) : (
        <UserProvider user={userProfile}>
          <div className="app-container">
            <header className="app-header">
              <h1 className="app-logo">Connect Point</h1>
              <button className="theme-toggle-inline" onClick={toggleTheme}>
                <i className={`ph ${theme === 'dark' ? 'ph-sun' : 'ph-moon'}`}></i>
              </button>
            </header>

            <main className="app-content">
              {renderScreen()}
            </main>

            <nav className="bottom-nav">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <i className={`ph ${tab.icon}`}></i>
                  <span>{tab.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </UserProvider>
      )}
    </>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(
  <ThemeProvider>
    <App />
  </ThemeProvider>
);