import React from 'react';
import { useState } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithPopup,
  updateProfile
} from 'firebase/auth';
import { auth, googleProvider, githubProvider } from './config.js';

export default function Auth({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [formData, setFormData] = useState({ email: '', password: '', displayName: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (mode === 'login') {
        const userCred = await signInWithEmailAndPassword(auth, formData.email, formData.password);
        onLogin(userCred.user);
      } else if (mode === 'register') {
        const userCred = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
        if (formData.displayName) {
          await updateProfile(userCred.user, { displayName: formData.displayName });
        }
        onLogin(userCred.user);
      } else if (mode === 'forgot') {
        await sendPasswordResetEmail(auth, formData.email);
        setError('✅ Password reset email sent. Please check your inbox.');
      }
    } catch (err) {
      setError(err.message.replace('Firebase: ', ''));
    }
    setLoading(false);
  };

  const handleSocialLogin = async (providerType) => {
    setLoading(true);
    setError('');
    try {
      const provider = providerType === 'google' ? googleProvider : githubProvider;
      const result = await signInWithPopup(auth, provider);
      onLogin(result.user);
    } catch (err) {
      setError(err.message.replace('Firebase: ', ''));
    }
    setLoading(false);
  };

  // Build form fields
  const errorDiv = error ? React.createElement('div', {
    className: `fade-in ${error.startsWith('✅') ? 'success' : ''}`,
    style: {
      background: error.startsWith('✅') ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
      padding: '12px', borderRadius: '12px', marginBottom: '16px', fontSize: '0.9rem'
    }
  }, error) : null;

  const emailField = React.createElement('div', { className: 'input-group' },
    React.createElement('label', null, 'Email'),
    React.createElement('input', {
      className: 'input-field', type: 'email', name: 'email',
      placeholder: 'you@example.com', value: formData.email,
      onChange: handleChange, required: true
    })
  );

  const passwordField = React.createElement('div', { className: 'input-group' },
    React.createElement('label', null, 'Password'),
    React.createElement('input', {
      className: 'input-field', type: 'password', name: 'password',
      placeholder: '••••••••', value: formData.password,
      onChange: handleChange, required: mode !== 'forgot'
    })
  );

  const displayNameField = mode === 'register' ? React.createElement('div', { className: 'input-group' },
    React.createElement('label', null, 'Display Name'),
    React.createElement('input', {
      className: 'input-field', type: 'text', name: 'displayName',
      placeholder: 'John Doe', value: formData.displayName,
      onChange: handleChange, required: true
    })
  ) : null;

  const submitButton = React.createElement('button', {
    className: 'btn btn-primary', type: 'submit', disabled: loading, style: { width: '100%' }
  }, loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : mode === 'register' ? 'Create Account' : 'Send Reset Link');

  const socialButtons = mode !== 'forgot' ? React.createElement('div', { style: { marginTop: '20px' } },
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' } },
      React.createElement('div', { style: { flex: 1, height: '1px', background: 'var(--border)' } }),
      React.createElement('span', { style: { fontSize: '0.85rem', color: 'var(--text-secondary)' } }, 'or continue with'),
      React.createElement('div', { style: { flex: 1, height: '1px', background: 'var(--border)' } })
    ),
    React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' } },
      React.createElement('button', { className: 'btn btn-google', onClick: () => handleSocialLogin('google'), disabled: loading },
        React.createElement('i', { className: 'ph ph-google-logo', style: { fontSize: '1.2rem' } }), ' Google'),
      React.createElement('button', { className: 'btn btn-github', onClick: () => handleSocialLogin('github'), disabled: loading },
        React.createElement('i', { className: 'ph ph-github-logo', style: { fontSize: '1.2rem' } }), ' GitHub')
    )
  ) : null;

  const switchLinks = React.createElement('div', { style: { textAlign: 'center', marginTop: '24px', fontSize: '0.9rem' } },
    mode === 'login' ? React.createElement(React.Fragment, null,
      React.createElement('a', { href: '#', onClick: (e) => { e.preventDefault(); setMode('forgot'); }, style: { color: 'var(--accent-light)', textDecoration: 'none' } }, 'Forgot password?'),
      React.createElement('br'),
      React.createElement('span', { style: { color: 'var(--text-secondary)' } }, "Don't have an account?"), ' ',
      React.createElement('a', { href: '#', onClick: (e) => { e.preventDefault(); setMode('register'); }, style: { color: 'var(--accent-light)', textDecoration: 'none' } }, 'Sign up')
    ) : mode === 'register' ? React.createElement('span', null,
      'Already have an account? ',
      React.createElement('a', { href: '#', onClick: (e) => { e.preventDefault(); setMode('login'); }, style: { color: 'var(--accent-light)', textDecoration: 'none' } }, 'Sign in')
    ) : React.createElement('a', { href: '#', onClick: (e) => { e.preventDefault(); setMode('login'); }, style: { color: 'var(--accent-light)', textDecoration: 'none' } }, '← Back to sign in')
  );

  return React.createElement('div', { className: 'container-center' },
    React.createElement('div', { className: 'glass', style: { width: '100%', maxWidth: '420px', padding: '2.5rem' } },
      React.createElement('h1', { style: { fontSize: '1.8rem', fontWeight: '700', textAlign: 'center', marginBottom: '8px' } }, 'Connect Point'),
      React.createElement('p', { style: { textAlign: 'center', color: 'var(--text-secondary)', marginBottom: '2rem' } },
        mode === 'login' ? 'Welcome back' : mode === 'register' ? 'Create your account' : 'Reset your password'),
      errorDiv,
      React.createElement('form', { onSubmit: handleEmailAuth },
        mode !== 'forgot' && displayNameField,
        mode !== 'forgot' && emailField,
        mode !== 'forgot' && passwordField,
        mode === 'forgot' && emailField,
        mode === 'forgot' && passwordField,
        submitButton
      ),
      socialButtons,
      switchLinks
    )
  );
    }
