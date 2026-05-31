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

  return React.createElement('div', { className: 'settings-container' },
    React.createElement('div', { className: 'glass', style: { padding: '1.5rem' } },
      React.createElement('div', { className: 'profile-header' },
        React.createElement('div', { className: 'profile-avatar' },
          currentUser.photoURL ?
            React.createElement('img', { src: currentUser.photoURL, alt: 'avatar', style: { width: '80px', height: '80px', borderRadius: '50%' } }) :
            React.createElement('i', { className: 'ph ph-user-circle', style: { fontSize: '4rem', color: 'var(--accent)' } })
        ),
        React.createElement('h2', null, currentUser.displayName || currentUser.email),
        React.createElement('p', { style: { color: 'var(--text-secondary)' } }, currentUser.email)
      ),
      React.createElement('div', { className: 'cp-code-section' },
        React.createElement('label', null, 'Your CP Code'),
        React.createElement('div', { className: 'cp-code-display' },
          React.createElement('code', null, currentUser.cpCode),
          React.createElement('button', { className: 'btn-icon', onClick: copyCPCode },
            React.createElement('i', { className: `ph ${copied ? 'ph-check' : 'ph-copy'}` })
          )
        ),
        React.createElement('p', { style: { fontSize: '0.8rem', color: 'var(--text-secondary)' } }, 'Share this code with friends to connect.')
      ),
      React.createElement('div', { className: 'settings-actions' },
        React.createElement('button', { className: 'btn', onClick: handleLogout, style: { background: 'var(--danger)', color: 'white', width: '100%' } },
          React.createElement('i', { className: 'ph ph-sign-out' }), ' Sign Out'
        )
      )
    )
  );
}
