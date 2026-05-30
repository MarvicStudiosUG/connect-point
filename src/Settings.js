import { useState } from 'react';
import { useUser } from './UserContext.js';
import { getAuth } from 'firebase/auth';

export default function Settings() {
  const currentUser = useUser();
  const [copied, setCopied] = useState(false);

  const copyCPCode = () => {
    if (!currentUser?.cpCode) return;
    navigator.clipboard?.writeText(currentUser.cpCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLogout = async () => {
    const auth = getAuth();
    await auth.signOut();
  };

  if (!currentUser) return null;

  return (
    <div className="settings-container">
      <div className="glass" style={{ padding: '1.5rem' }}>
        <div className="profile-header">
          <div className="profile-avatar">
            {currentUser.photoURL ? (
              <img src={currentUser.photoURL} alt="avatar" style={{ width: '80px', height: '80px', borderRadius: '50%' }} />
            ) : (
              <i className="ph ph-user-circle" style={{ fontSize: '4rem', color: 'var(--accent)' }}></i>
            )}
          </div>
          <h2>{currentUser.displayName || currentUser.email}</h2>
          <p style={{ color: 'var(--text-secondary)' }}>{currentUser.email}</p>
        </div>

        <div className="cp-code-section">
          <label>Your CP Code</label>
          <div className="cp-code-display">
            <code>{currentUser.cpCode}</code>
            <button className="btn-icon" onClick={copyCPCode}>
              <i className={`ph ${copied ? 'ph-check' : 'ph-copy'}`}></i>
            </button>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Share this code with friends to connect.
          </p>
        </div>

        <div className="settings-actions">
          <button className="btn" onClick={handleLogout} style={{ background: 'var(--danger)', color: 'white', width: '100%' }}>
            <i className="ph ph-sign-out"></i> Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}