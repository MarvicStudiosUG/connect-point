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
  const [mode, setMode] = useState('login'); // 'login', 'register', 'forgot'
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    displayName: ''
  });
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

  return (
    <div className="container-center">
      <div className="glass" style={{ width: '100%', maxWidth: '420px', padding: '2.5rem' }}>
        {/* Header */}
        <h1 style={{ fontSize: '1.8rem', fontWeight: '700', textAlign: 'center', marginBottom: '8px' }}>
          Connect Point
        </h1>
        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: '2rem' }}>
          {mode === 'login' ? 'Welcome back' : mode === 'register' ? 'Create your account' : 'Reset your password'}
        </p>

        {/* Error message */}
        {error && (
          <div className={`fade-in ${error.startsWith('✅') ? 'success' : ''}`}
               style={{ background: error.startsWith('✅') ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
                        padding: '12px', borderRadius: '12px', marginBottom: '16px', fontSize: '0.9rem' }}>
            {error}
          </div>
        )}

        {/* Email/Password Form */}
        <form onSubmit={handleEmailAuth}>
          {mode !== 'forgot' && (
            <>
              {mode === 'register' && (
                <div className="input-group">
                  <label>Display Name</label>
                  <input
                    className="input-field"
                    type="text"
                    name="displayName"
                    placeholder="John Doe"
                    value={formData.displayName}
                    onChange={handleChange}
                    required
                  />
                </div>
              )}
              <div className="input-group">
                <label>Email</label>
                <input
                  className="input-field"
                  type="email"
                  name="email"
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="input-group">
                <label>Password</label>
                <input
                  className="input-field"
                  type="password"
                  name="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                  required={mode !== 'forgot'}
                />
              </div>
            </>
          )}

          {mode === 'forgot' && (
            <div className="input-group">
              <label>Email address</label>
              <input
                className="input-field"
                type="email"
                name="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>
          )}

          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Please wait...' :
              mode === 'login' ? 'Sign In' :
              mode === 'register' ? 'Create Account' :
              'Send Reset Link'}
          </button>
        </form>

        {/* Social Logins (not shown in forgot password mode) */}
        {mode !== 'forgot' && (
          <div style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>or continue with</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <button className="btn btn-google" onClick={() => handleSocialLogin('google')} disabled={loading}>
                <i className="ph ph-google-logo" style={{ fontSize: '1.2rem' }}></i> Google
              </button>
              <button className="btn btn-github" onClick={() => handleSocialLogin('github')} disabled={loading}>
                <i className="ph ph-github-logo" style={{ fontSize: '1.2rem' }}></i> GitHub
              </button>
            </div>
          </div>
        )}

        {/* Toggle between modes */}
        <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '0.9rem' }}>
          {mode === 'login' && (
            <>
              <a href="#" onClick={(e) => { e.preventDefault(); setMode('forgot'); }} style={{ color: 'var(--accent-light)', textDecoration: 'none' }}>
                Forgot password?
              </a>
              <br />
              <span style={{ color: 'var(--text-secondary)' }}>Don't have an account?</span>{' '}
              <a href="#" onClick={(e) => { e.preventDefault(); setMode('register'); }} style={{ color: 'var(--accent-light)', textDecoration: 'none' }}>
                Sign up
              </a>
            </>
          )}
          {mode === 'register' && (
            <span>
              Already have an account?{' '}
              <a href="#" onClick={(e) => { e.preventDefault(); setMode('login'); }} style={{ color: 'var(--accent-light)', textDecoration: 'none' }}>
                Sign in
              </a>
            </span>
          )}
          {mode === 'forgot' && (
            <a href="#" onClick={(e) => { e.preventDefault(); setMode('login'); }} style={{ color: 'var(--accent-light)', textDecoration: 'none' }}>
              ← Back to sign in
            </a>
          )}
        </div>
      </div>
    </div>
  );
}