
import React, { useState } from 'react';
import { useUser } from './UserContext.js';
import { getAuth, sendPasswordResetEmail, updateProfile } from 'firebase/auth';
import { changeUserCpCode } from './db.js';
import { updateDoc, doc, getDoc } from 'firebase/firestore';
import { db } from './config.js';
import { useTheme } from './theme.js';

export default function Settings() {
  const currentUser = useUser();
  const { toggleTheme } = useTheme(); // Use the global theme context

  const [copied, setCopied] = useState(false);
  const [newCpDigits, setNewCpDigits] = useState('');
  const [cpCodeError, setCpCodeError] = useState('');
  const [cpCodeSuccess, setCpCodeSuccess] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [passwordResetSent, setPasswordResetSent] = useState(false);
  const [status, setStatus] = useState(currentUser?.status || '');
  const [statusSaved, setStatusSaved] = useState(false);
  const [displayName, setDisplayName] = useState(currentUser?.displayName || '');
  const [displayNameSaved, setDisplayNameSaved] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [privacySettings, setPrivacySettings] = useState({
    showOnlineStatus: true,
    showLastSeen: true,
    showProfilePhoto: true
  });
  const [language, setLanguage] = useState('en');
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('info');

  const auth = getAuth();

  // Toast helper (rename to avoid conflict)
  const showToast = (message, type = 'info', duration = 3000) => {
    setToastMessage(message);
    setToastType(type);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), duration);
  };

  const copyCPCode = () => {
    if (!currentUser?.cpCode) return;
    navigator.clipboard?.writeText(currentUser.cpCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    showToast('CP code copied!', 'success');
  };

  const handleChangeCpCode = async (e) => {
    e.preventDefault();
    setCpCodeError('');
    setCpCodeSuccess('');
    if (!/^\d{10}$/.test(newCpDigits)) {
      setCpCodeError('Enter exactly 10 digits (0-9)');
      return;
    }
    const fullCode = 'CP-' + newCpDigits;
    try {
      await changeUserCpCode(currentUser.uid, fullCode);
      setCpCodeSuccess('CP code updated!');
      showToast('CP code updated successfully!', 'success');
      setNewCpDigits('');
      setTimeout(() => window.location.reload(), 2000);
    } catch (err) {
      setCpCodeError(err.message);
      showToast(err.message, 'error');
    }
  };

  const handleResetPassword = async () => {
    try {
      await sendPasswordResetEmail(auth, currentUser.email);
      setPasswordResetSent(true);
      showToast('Password reset email sent!', 'success');
    } catch (err) {
      setCpCodeError(err.message);
      showToast(err.message, 'error');
    }
  };

  const handleDeleteAccount = async () => {
    try {
      const user = auth.currentUser;
      if (user) {
        await user.delete();
        showToast('Account deleted', 'info');
        window.location.reload();
      }
    } catch (err) {
      setCpCodeError('Could not delete account: ' + err.message);
      showToast('Delete failed: ' + err.message, 'error');
    }
  };

  const handleSaveStatus = async () => {
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), { status });
      setStatusSaved(true);
      showToast('Status updated!', 'success');
      setTimeout(() => setStatusSaved(false), 2000);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleSaveDisplayName = async () => {
    if (!displayName.trim()) {
      showToast('Display name cannot be empty', 'error');
      return;
    }
    try {
      await updateProfile(auth.currentUser, { displayName });
      await updateDoc(doc(db, 'users', currentUser.uid), { displayName });
      setDisplayNameSaved(true);
      showToast('Display name updated!', 'success');
      setTimeout(() => setDisplayNameSaved(false), 2000);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleExportData = async () => {
    try {
      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      const data = userDoc.data();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `connect-point-data-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Data exported!', 'success');
    } catch (err) {
      showToast('Export failed: ' + err.message, 'error');
    }
  };

  const lastChanged = currentUser?.cpCodeLastChanged
    ? new Date(currentUser.cpCodeLastChanged.seconds * 1000).toLocaleDateString()
    : null;
  const canChange = !lastChanged || (Date.now() - new Date(lastChanged).getTime()) / (1000 * 60 * 60 * 24) >= 30;

  if (!currentUser) return null;

  // Toast element
  const toastElement = toastVisible ? React.createElement('div', {
    className: `fade-in toast ${toastType}`,
    style: {
      position: 'fixed',
      top: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9999,
      padding: '12px 24px',
      borderRadius: '16px',
      background: toastType === 'success' ? 'rgba(34,197,94,0.95)' : toastType === 'error' ? 'rgba(239,68,68,0.95)' : 'rgba(127,90,240,0.95)',
      color: 'white',
      fontWeight: '600',
      boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    }
  },
    React.createElement('i', { className: `ph ${toastType === 'success' ? 'ph-check-circle' : toastType === 'error' ? 'ph-x-circle' : 'ph-info'}` }),
    toastMessage
  ) : null;

  // ---------- Section builders ----------

  // Profile Card
  const profileCard = React.createElement('div', { className: 'glass', style: { padding: '1.5rem', marginBottom: '16px', borderRadius: '20px' } },
    // Avatar + name + email + CP code
    React.createElement('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1.5rem' } },
      React.createElement('div', { style: { position: 'relative', width: '100px', height: '100px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' } },
        currentUser.photoURL
          ? React.createElement('img', { src: currentUser.photoURL, alt: 'avatar', style: { width: '100%', height: '100%', objectFit: 'cover' } })
          : React.createElement('i', { className: 'ph ph-user-circle', style: { fontSize: '4rem', color: 'white' } }),
        React.createElement('button', {
          style: {
            position: 'absolute', bottom: '4px', right: '4px',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '50%', width: '32px', height: '32px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', backdropFilter: 'blur(10px)'
          },
          onClick: () => showToast('Profile picture upload coming soon!', 'info')
        }, React.createElement('i', { className: 'ph ph-camera' }))
      ),
      React.createElement('h2', { style: { marginTop: '12px' } }, currentUser.displayName || currentUser.email),
      React.createElement('p', { style: { color: 'var(--text-secondary)', marginTop: '4px' } }, currentUser.email),
      React.createElement('span', { style: { fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'var(--surface)', padding: '4px 12px', borderRadius: '12px', border: '1px solid var(--border)' } }, currentUser.cpCode)
    ),
    // Display Name
    React.createElement('div', { style: { marginTop: '1rem' } },
      React.createElement('label', null, 'Display Name'),
      React.createElement('div', { style: { display: 'flex', gap: '8px', marginTop: '4px' } },
        React.createElement('input', {
          className: 'input-field', type: 'text', value: displayName,
          onChange: (e) => setDisplayName(e.target.value),
          placeholder: 'Your display name', style: { flex: 1 }
        }),
        React.createElement('button', { className: 'btn btn-primary', onClick: handleSaveDisplayName, style: { padding: '0 20px' } },
          displayNameSaved ? 'Saved!' : 'Save')
      )
    ),
    // Status
    React.createElement('div', { style: { marginTop: '1rem' } },
      React.createElement('label', null, 'Status'),
      React.createElement('div', { style: { display: 'flex', gap: '8px', marginTop: '4px' } },
        React.createElement('input', {
          className: 'input-field', type: 'text', value: status,
          onChange: (e) => setStatus(e.target.value),
          placeholder: 'Add a short bio...', maxLength: 100, style: { flex: 1 }
        }),
        React.createElement('button', { className: 'btn btn-primary', onClick: handleSaveStatus, style: { padding: '0 20px' } },
          statusSaved ? 'Saved!' : 'Save')
      ),
      React.createElement('div', { style: { fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' } },
        status.length + '/100 characters')
    ),
    // CP Code change
    React.createElement('div', { style: { marginTop: '1.5rem' } },
      React.createElement('label', null, 'Your CP Code'),
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px', margin: '8px 0' } },
        React.createElement('code', { style: { flex: 1, fontFamily: 'var(--font-mono)', fontWeight: '600', color: 'var(--accent-light)' } }, currentUser.cpCode),
        React.createElement('button', { className: 'btn-icon', onClick: copyCPCode, title: 'Copy' },
          React.createElement('i', { className: 'ph ' + (copied ? 'ph-check' : 'ph-copy') }))
      ),
      lastChanged && React.createElement('p', { style: { fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' } }, 'Last changed: ' + lastChanged),
      !canChange && React.createElement('p', { style: { fontSize: '0.75rem', color: 'var(--danger)', marginTop: '4px' } }, 'You can only change your CP code once every 30 days.'),
      canChange && React.createElement('form', { onSubmit: handleChangeCpCode, style: { marginTop: '12px' } },
        React.createElement('div', { className: 'input-group' },
          React.createElement('label', null, 'New CP Code (10 digits)'),
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            React.createElement('span', { style: { fontWeight: '600', color: 'var(--accent-light)' } }, 'CP-'),
            React.createElement('input', {
              className: 'input-field', type: 'text', inputMode: 'numeric',
              pattern: '\\d{10}', maxLength: 10, placeholder: '1234567890',
              value: newCpDigits,
              onChange: (e) => setNewCpDigits(e.target.value.replace(/\D/g, '').slice(0, 10)),
              required: true, style: { flex: 1 }
            })
          )
        ),
        cpCodeError && React.createElement('div', { className: 'error-msg', style: { color: 'var(--danger)', padding: '8px', background: 'rgba(239,68,68,0.1)', borderRadius: '8px', marginBottom: '8px', fontSize: '0.85rem' } }, cpCodeError),
        cpCodeSuccess && React.createElement('div', { style: { color: 'var(--success)', padding: '8px', background: 'rgba(34,197,94,0.1)', borderRadius: '8px', marginBottom: '8px' } }, cpCodeSuccess),
        React.createElement('button', { className: 'btn btn-primary', type: 'submit', style: { width: '100%' } }, 'Change CP Code')
      )
    )
  );

  // Security Card
  const securityCard = React.createElement('div', { className: 'glass', style: { padding: '1.5rem', marginBottom: '16px', borderRadius: '20px' } },
    React.createElement('h3', { style: { marginBottom: '1rem' } }, 'Security'),
    React.createElement('button', { className: 'btn', onClick: handleResetPassword, style: { width: '100%', marginBottom: '8px' } },
      passwordResetSent ? 'Reset email sent!' : 'Reset Password'),
    passwordResetSent && React.createElement('p', { style: { color: 'var(--success)', fontSize: '0.8rem', marginTop: '4px' } }, 'Check your email for the reset link.'),
    React.createElement('hr', { style: { borderColor: 'var(--border)', margin: '16px 0' } }),
    React.createElement('h3', { style: { marginBottom: '0.5rem' } }, 'Danger Zone'),
    React.createElement('p', { style: { color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '8px' } }, 'Permanently delete your account and all data.'),
    showDeleteConfirm
      ? React.createElement('div', { className: 'fade-in', style: { display: 'flex', gap: '8px' } },
          React.createElement('button', { className: 'btn', style: { background: 'var(--danger)', color: 'white', flex: 1 }, onClick: handleDeleteAccount },
            React.createElement('i', { className: 'ph ph-trash' }), ' Confirm Delete'),
          React.createElement('button', { className: 'btn', style: { flex: 1 }, onClick: () => setShowDeleteConfirm(false) }, 'Cancel')
        )
      : React.createElement('button', { className: 'btn', style: { borderColor: 'var(--danger)', color: 'var(--danger)', width: '100%' }, onClick: () => setShowDeleteConfirm(true) },
          React.createElement('i', { className: 'ph ph-trash' }), ' Delete Account')
  );

  // Preferences Card (integrated theme toggle from context)
  const preferencesCard = React.createElement('div', { className: 'glass', style: { padding: '1.5rem', marginBottom: '16px', borderRadius: '20px' } },
    React.createElement('h3', { style: { marginBottom: '1rem' } }, 'Preferences'),
    // Theme toggle using the global useTheme
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' } },
      React.createElement('span', null, 'Theme'),
      React.createElement('button', {
        className: 'btn',
        onClick: toggleTheme,
        style: { padding: '4px 12px', fontSize: '0.85rem' }
      }, React.createElement('i', { className: 'ph ph-sun' }), ' / ', React.createElement('i', { className: 'ph ph-moon' }), ' Toggle')
    ),
    // Notifications
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' } },
      React.createElement('span', null, 'Notifications'),
      React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' } },
        React.createElement('input', { type: 'checkbox', checked: notificationsEnabled, onChange: (e) => setNotificationsEnabled(e.target.checked) }),
        notificationsEnabled ? 'Enabled' : 'Disabled'
      )
    ),
    // Language
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' } },
      React.createElement('span', null, 'Language'),
      React.createElement('select', {
        value: language,
        onChange: (e) => setLanguage(e.target.value),
        style: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '4px 8px', color: 'var(--text-primary)' }
      },
        React.createElement('option', { value: 'en' }, 'English'),
        React.createElement('option', { value: 'es' }, 'Spanish'),
        React.createElement('option', { value: 'fr' }, 'French'),
        React.createElement('option', { value: 'de' }, 'German')
      )
    )
  );

  // Privacy Card
  const privacyCard = React.createElement('div', { className: 'glass', style: { padding: '1.5rem', marginBottom: '16px', borderRadius: '20px' } },
    React.createElement('h3', { style: { marginBottom: '1rem' } }, 'Privacy'),
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' } },
      React.createElement('span', null, 'Show online status'),
      React.createElement('input', { type: 'checkbox', checked: privacySettings.showOnlineStatus, onChange: (e) => setPrivacySettings({ ...privacySettings, showOnlineStatus: e.target.checked }) })
    ),
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' } },
      React.createElement('span', null, 'Show last seen'),
      React.createElement('input', { type: 'checkbox', checked: privacySettings.showLastSeen, onChange: (e) => setPrivacySettings({ ...privacySettings, showLastSeen: e.target.checked }) })
    ),
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' } },
      React.createElement('span', null, 'Show profile photo'),
      React.createElement('input', { type: 'checkbox', checked: privacySettings.showProfilePhoto, onChange: (e) => setPrivacySettings({ ...privacySettings, showProfilePhoto: e.target.checked }) })
    )
  );

  // Data Card
  const dataCard = React.createElement('div', { className: 'glass', style: { padding: '1.5rem', marginBottom: '16px', borderRadius: '20px' } },
    React.createElement('h3', { style: { marginBottom: '1rem' } }, 'Data'),
    React.createElement('button', { className: 'btn', onClick: handleExportData, style: { width: '100%', marginBottom: '8px' } },
      React.createElement('i', { className: 'ph ph-download-simple' }), ' Export Data'),
    React.createElement('button', { className: 'btn', onClick: () => showToast('Data clearing coming soon!', 'info'), style: { width: '100%' } },
      React.createElement('i', { className: 'ph ph-trash' }), ' Clear Local Data')
  );

  // Sign Out Card
  const signOutCard = React.createElement('div', { className: 'glass', style: { padding: '1.5rem', borderRadius: '20px' } },
    React.createElement('button', {
      className: 'btn',
      onClick: () => auth.signOut(),
      style: { background: 'var(--danger)', color: 'white', width: '100%' }
    },
      React.createElement('i', { className: 'ph ph-sign-out' }), ' Sign Out')
  );

  // Main container
  return React.createElement('div', { className: 'settings-container', style: { padding: '16px', maxWidth: '600px', margin: '0 auto' } },
    toastElement,
    profileCard,
    securityCard,
    preferencesCard,
    privacyCard,
    dataCard,
    signOutCard
  );
                            }
