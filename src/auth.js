import React, { useState, useEffect, useRef } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithPopup,
  updateProfile,
  sendEmailVerification,
  setPersistence,
  browserLocalPersistence,
} from 'firebase/auth';
import { auth, googleProvider, githubProvider } from './config.js';

export default function Auth({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    displayName: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0); // 0-4
  const [rememberMe, setRememberMe] = useState(false);
  const [resendDisabled, setResendDisabled] = useState(false);

  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  // Auto-focus on mode change
  useEffect(() => {
    if (mode === 'forgot') {
      emailRef.current?.focus();
    } else {
      emailRef.current?.focus();
    }
  }, [mode]);

  // Password strength calculation
  const calculateStrength = (pwd) => {
    let score = 0;
    if (pwd.length >= 6) score++;
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++;
    if (/\d/.test(pwd)) score++;
    if (/[^a-zA-Z0-9]/.test(pwd)) score++;
    return Math.min(score, 4);
  };

  useEffect(() => {
    if (mode === 'register' && formData.password) {
      setPasswordStrength(calculateStrength(formData.password));
    } else {
      setPasswordStrength(0);
    }
  }, [formData.password, mode]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError('');
    setSuccess('');
  };

  const togglePassword = () => setShowPassword((prev) => !prev);

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    setVerificationSent(false);

    try {
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) {
        throw new Error('Please enter a valid email address.');
      }

      if (mode === 'login') {
        await setPersistence(auth, rememberMe ? browserLocalPersistence : 'session');
        const userCred = await signInWithEmailAndPassword(auth, formData.email, formData.password);
        onLogin(userCred.user);
      } else if (mode === 'register') {
        if (formData.password.length < 6) {
          throw new Error('Password must be at least 6 characters.');
        }
        if (formData.password !== formData.confirmPassword) {
          throw new Error('Passwords do not match.');
        }

        const userCred = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
        if (formData.displayName) {
          await updateProfile(userCred.user, { displayName: formData.displayName });
        }
        await sendEmailVerification(userCred.user);
        setVerificationSent(true);
        setSuccess('Account created! A verification email has been sent.');
        // Optionally auto-login
        onLogin(userCred.user);
      } else if (mode === 'forgot') {
        if (!formData.email) {
          throw new Error('Please enter your email address.');
        }
        await sendPasswordResetEmail(auth, formData.email);
        setSuccess('✅ Password reset email sent. Please check your inbox.');
        setFormData((prev) => ({ ...prev, password: '', confirmPassword: '' }));
      }
    } catch (err) {
      // User-friendly error messages
      let msg = err.message.replace('Firebase: ', '');
      if (msg.includes('user-not-found')) msg = 'No account found with this email.';
      else if (msg.includes('wrong-password')) msg = 'Incorrect password.';
      else if (msg.includes('email-already-in-use')) msg = 'This email is already registered.';
      else if (msg.includes('too-many-requests')) msg = 'Too many requests. Try again later.';
      else if (msg.includes('network-request-failed')) msg = 'Network error. Check your connection.';
      setError(msg);
    }
    setLoading(false);
  };

  const handleSocialLogin = async (providerType) => {
    setLoading(true);
    setError('');
    try {
      const provider = providerType === 'google' ? googleProvider : githubProvider;
      await setPersistence(auth, rememberMe ? browserLocalPersistence : 'session');
      const result = await signInWithPopup(auth, provider);
      onLogin(result.user);
    } catch (err) {
      let msg = err.message.replace('Firebase: ', '');
      if (msg.includes('popup-closed-by-user')) msg = 'Sign-in canceled.';
      else if (msg.includes('account-exists-with-different-credential')) msg = 'An account already exists with the same email.';
      setError(msg);
    }
    setLoading(false);
  };

  const resendVerification = async () => {
    if (resendDisabled) return;
    setResendDisabled(true);
    try {
      await sendEmailVerification(auth.currentUser);
      setSuccess('Verification email resent. Check your inbox.');
    } catch {
      setError('Could not resend verification. Try again later.');
    }
    setTimeout(() => setResendDisabled(false), 60000);
  };

  // ---- JSX ----
  return (
    <div className="container-center">
      <div className="glass auth-card">
        {/* Header */}
        <div className="auth-header">
          <h1>Connect Point</h1>
          <p className="auth-subtitle">
            {mode === 'login'
              ? 'Welcome back'
              : mode === 'register'
              ? 'Create your account'
              : 'Reset your password'}
          </p>
        </div>

        {/* Status messages */}
        {error && (
          <div className="fade-in status-message error">
            <i className="ph ph-x-circle"></i> {error}
          </div>
        )}
        {success && (
          <div className="fade-in status-message success">
            <i className="ph ph-check-circle"></i> {success}
          </div>
        )}
        {verificationSent && (
          <div className="fade-in status-message success">
            <i className="ph ph-envelope"></i> Verification email sent!{' '}
            <button className="link-btn" onClick={resendVerification} disabled={resendDisabled}>
              Resend
            </button>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleEmailAuth} className="auth-form">
          {/* Display Name (register only) */}
          {mode === 'register' && (
            <div className="input-group">
              <label htmlFor="displayName">Display Name</label>
              <input
                id="displayName"
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

          {/* Email */}
          {mode !== 'forgot' ? (
            <div className="input-group">
              <label htmlFor="email">Email</label>
              <input
                ref={emailRef}
                id="email"
                className="input-field"
                type="email"
                name="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>
          ) : (
            <div className="input-group">
              <label htmlFor="email-forgot">Email</label>
              <input
                ref={emailRef}
                id="email-forgot"
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

          {/* Password (if not forgot) */}
          {mode !== 'forgot' && (
            <>
              <div className="input-group password-group">
                <label htmlFor="password">Password</label>
                <div className="password-wrapper">
                  <input
                    ref={passwordRef}
                    id="password"
                    className="input-field"
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={handleChange}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={togglePassword}
                    aria-label="Toggle password visibility"
                  >
                    <i className={`ph ${showPassword ? 'ph-eye-slash' : 'ph-eye'}`}></i>
                  </button>
                </div>
              </div>

              {/* Password strength (register) */}
              {mode === 'register' && formData.password.length > 0 && (
                <div className="password-strength">
                  <div className="strength-bar">
                    <div
                      className={`strength-fill strength-${passwordStrength}`}
                      style={{ width: `${(passwordStrength / 4) * 100}%` }}
                    />
                  </div>
                  <span className="strength-label">
                    {passwordStrength === 0 && 'Very weak'}
                    {passwordStrength === 1 && 'Weak'}
                    {passwordStrength === 2 && 'Fair'}
                    {passwordStrength === 3 && 'Good'}
                    {passwordStrength === 4 && 'Strong'}
                  </span>
                </div>
              )}

              {/* Confirm Password (register) */}
              {mode === 'register' && (
                <div className="input-group">
                  <label htmlFor="confirmPassword">Confirm Password</label>
                  <input
                    id="confirmPassword"
                    className="input-field"
                    type={showPassword ? 'text' : 'password'}
                    name="confirmPassword"
                    placeholder="••••••••"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    required
                  />
                </div>
              )}
            </>
          )}

          {/* Remember me (login only) */}
          {mode === 'login' && (
            <div className="remember-me">
              <label>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                Remember me
              </label>
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner-small"></span>
                {mode === 'login' ? 'Signing in...' : mode === 'register' ? 'Creating...' : 'Sending...'}
              </>
            ) : (
              <>
                {mode === 'login' && <i className="ph ph-sign-in"></i>}
                {mode === 'register' && <i className="ph ph-user-plus"></i>}
                {mode === 'forgot' && <i className="ph ph-arrow-right"></i>}
                {mode === 'login' ? 'Sign In' : mode === 'register' ? 'Create Account' : 'Send Reset Link'}
              </>
            )}
          </button>
        </form>

        {/* Social login (not in forgot mode) */}
        {mode !== 'forgot' && (
          <div className="social-section">
            <div className="divider">
              <span>or continue with</span>
            </div>
            <div className="social-buttons">
              <button
                className="btn btn-google"
                onClick={() => handleSocialLogin('google')}
                disabled={loading}
              >
                <i className="ph ph-google-logo"></i> Google
              </button>
              <button
                className="btn btn-github"
                onClick={() => handleSocialLogin('github')}
                disabled={loading}
              >
                <i className="ph ph-github-logo"></i> GitHub
              </button>
            </div>
          </div>
        )}

        {/* Switch links */}
        <div className="auth-switch">
          {mode === 'login' ? (
            <>
              <a href="#forgot" onClick={(e) => { e.preventDefault(); setMode('forgot'); }}>
                Forgot password?
              </a>
              <span className="sep">•</span>
              <span>
                Don't have an account?{' '}
                <a href="#register" onClick={(e) => { e.preventDefault(); setMode('register'); }}>
                  Sign up
                </a>
              </span>
            </>
          ) : mode === 'register' ? (
            <span>
              Already have an account?{' '}
              <a href="#login" onClick={(e) => { e.preventDefault(); setMode('login'); }}>
                Sign in
              </a>
            </span>
          ) : (
            <a href="#login" onClick={(e) => { e.preventDefault(); setMode('login'); }}>
              ← Back to sign in
            </a>
          )}
        </div>
      </div>
    </div>
  );
          }
