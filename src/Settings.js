import React, { useState } from 'react';
import { useUser } from './UserContext.js';
import { getAuth, sendPasswordResetEmail } from 'firebase/auth';
import { changeUserCpCode } from './db.js';

export default function Settings() {
  const currentUser = useUser();
  const [copied, setCopied] = useState(false);
  const [newCpCode, setNewCpCode] = useState('');
  const [cpCodeError, setCpCodeError] = useState('');
  const [cpCodeSuccess, setCpCodeSuccess] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [passwordResetSent, setPasswordResetSent] = useState(false);

  const auth = getAuth();

  const copyCPCode = () => {
    if (!currentUser?.cpCode) return;
    navigator.clipboard?.writeText(currentUser.cpCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleChangeCpCode = async (e) => {
    e.preventDefault();
    setCpCodeError('');
    setCpCodeSuccess('');
    const code = newCpCode.trim().toUpperCase();
    if (!code.startsWith('CP-') || code.length !== 15) {
      setCpCodeError('Format must be CP-XXXXXXXXXXXX');
      return;
    }
    try {
      await changeUserCpCode(currentUser.uid, code);
      setCpCodeSuccess('CP code updated successfully!');
      setNewCpCode('');
      // The context will update on next profile fetch – but we can also force a reload
      setTimeout(() => window.location.reload(), 2000);
    } catch (err) {
      setCpCodeError(err.message);
    }
  };

  const handleResetPassword = async () => {
    try {
      await sendPasswordResetEmail(auth, currentUser.email);
      setPasswordResetSent(true);
    } catch (err) {
      setCpCodeError(err.message);
    }
  };

  const handleDeleteAccount = async () => {
    try {
      const user = auth.currentUser;
      if (user) {
        await user.delete();
      }
    } catch (err) {
      setCpCodeError('Could not delete account: ' + err.message);
    }
  };

  // Last CP code change date (if any)
  const lastChanged = currentUser?.cpCodeLastChanged
    ? new Date(currentUser.cpCodeLastChanged.seconds * 1000).toLocaleDateString()
    : null;
  const canChange = !lastChanged || (Date.now() - new Date(lastChanged).getTime()) / (1000 * 60 * 60 * 24) >= 30;

  if (!currentUser) return null;

  return React.createElement('div', { className: 'settings-container' },
    // ---------- Profile header ----------
    React.createElement('div', { className: 'glass', style: { padding: '1.5rem', marginBottom: '16px' } },
      React.createElement('div', { className: 'profile-header' },
        React.createElement('div', { className: 'profile-avatar' },
          currentUser.photoURL
            ? React.createElement('img', { src: currentUser.photoURL, alt: 'avatar', style: { width: '80px', height: '80px', borderRadius: '50%' } })
            : React.createElement('i', { className: 'ph ph-user-circle', style: { fontSize: '4rem', color: 'var(--accent)' } })
        ),
        React.createElement('h2', null, currentUser.displayName || currentUser.email),
        React.createElement('p', { style: { color: 'var(--text-secondary)', marginTop: '4px' } }, currentUser.email)
      ),

      // ---------- Current CP Code ----------
      React.createElement('div', { className: 'cp-code-section', style: { marginTop: '1.5rem' } },
        React.createElement('label', null, 'Your CP Code'),
        React.createElement('div', { className: 'cp-code-display' },
          React.createElement('code', null, currentUser.cpCode),
          React.createElement('button', { className: 'btn-icon', onClick: copyCPCode, title: 'Copy' },
            React.createElement('i', { className: `ph ${copied ? 'ph-check' : 'ph-copy'}` })
          )
        ),
        lastChanged && React.createElement('p', { style: { fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' } }, `Last changed: ${lastChanged}`),
        !canChange && React.createElement('p', { style: { fontSize: '0.75rem', color: 'var(--danger)', marginTop: '4px' } }, 'You can only change your CP code once every 30 days.')
      ),

      // ---------- Change CP Code (if allowed) ----------
      canChange && React.createElement('form', { onSubmit: handleChangeCpCode, style: { marginTop: '16px' } },
        React.createElement('div', { className: 'input-group' },
          React.createElement('label', null, 'New CP Code (CP-XXXXXXXXXXXX)'),
          React.createElement('input', {
            className: 'input-field',
            type: 'text',
            placeholder: 'CP-123456789012',
            value: newCpCode,
            onChange: (e) => setNewCpCode(e.target.value.toUpperCase()),
            required: true
          })
        ),
        cpCodeError && React.createElement('div', { className: 'error-msg', style: { fontSize: '0.85rem' } }, cpCodeError),
        cpCodeSuccess && React.createElement('div', { className: 'success-msg', style: { color: 'var(--success)', fontSize: '0.85rem', marginBottom: '8px' } }, cpCodeSuccess),
        React.createElement('button', { className: 'btn btn-primary', type: 'submit', style: { width: '100%' } }, 'Change CP Code')
      )
    ),

    // ---------- Security & Account ----------
    React.createElement('div', { className: 'glass', style: { padding: '1.5rem', marginBottom: '16px' } },
      React.createElement('h3', null, 'Security'),
      React.createElement('button', { className: 'btn', onClick: handleResetPassword, style: { width: '100%', marginTop: '12px' } },
        passwordResetSent ? 'Reset email sent!' : 'Reset Password'),
      passwordResetSent && React.createElement('p', { style: { color: 'var(--success)', fontSize: '0.8rem', marginTop: '8px' } }, 'Check your email for the reset link.'),

      React.createElement('hr', { style: { borderColor: 'var(--border)', margin: '16px 0' } }),

      React.createElement('h3', null, 'Danger Zone'),
      React.createElement('p', { style: { color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '8px' } }, 'Permanently delete your account and all data.'),

      showDeleteConfirm
        ? React.createElement('div', { className: 'fade-in' },
            React.createElement('button', { className: 'btn', style: { background: 'var(--danger)', color: 'white', width: '100%' }, onClick: handleDeleteAccount },
              React.createElement('i', { className: 'ph ph-trash' }), ' Confirm Delete'),
            React.createElement('button', { className: 'btn', style: { width: '100%', marginTop: '8px' }, onClick: () => setShowDeleteConfirm(false) }, 'Cancel')
          )
        : React.createElement('button', { className: 'btn', style: { borderColor: 'var(--danger)', color: 'var(--danger)', width: '100%' }, onClick: () => setShowDeleteConfirm(true) },
            React.createElement('i', { className: 'ph ph-trash' }), ' Delete Account')
    ),

    // ---------- Sign Out ----------
    React.createElement('div', { className: 'glass', style: { padding: '1.5rem' } },
      React.createElement('button', {
        className: 'btn',
        onClick: () => {
          const auth = getAuth();
          auth.signOut();
        },
        style: { background: 'var(--danger)', color: 'white', width: '100%' }
      },
        React.createElement('i', { className: 'ph ph-sign-out' }), ' Sign Out')
    )
  );
                                          }
