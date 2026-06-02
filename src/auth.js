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
  browserSessionPersistence,
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
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [rememberMe, setRememberMe] = useState(false);
  const [resendDisabled, setResendDisabled] = useState(false);

  const emailRef = useRef(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, [mode]);

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
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) {
        throw new Error('Please enter a valid email address.');
      }

      if (mode === 'login') {
        const persistenceType = rememberMe
          ? browserLocalPersistence
          : browserSessionPersistence;
        await setPersistence(auth, persistenceType);
        const userCred = await signInWithEmailAndPassword(
          auth,
          formData.email,
          formData.password
        );
        onLogin(userCred.user);
      } else if (mode === 'register') {
        if (formData.password.length < 6) {
          throw new Error('Password must be at least 6 characters.');
        }
        if (formData.password !== formData.confirmPassword) {
          throw new Error('Passwords do not match.');
        }

        const userCred = await createUserWithEmailAndPassword(
          auth,
          formData.email,
          formData.password
        );
        if (formData.displayName) {
          await updateProfile(userCred.user, {
            displayName: formData.displayName,
          });
        }
        await sendEmailVerification(userCred.user);
        setVerificationSent(true);
        setSuccess('Account created! A verification email has been sent.');
        onLogin(userCred.user);
      } else if (mode === 'forgot') {
        if (!formData.email) {
          throw new Error('Please enter your email address.');
        }
        await sendPasswordResetEmail(auth, formData.email);
        setSuccess('Password reset email sent. Check your inbox.');
        setFormData((prev) => ({ ...prev, password: '', confirmPassword: '' }));
      }
    } catch (err) {
      let msg = err.message.replace('Firebase: ', '');
      if (msg.includes('user-not-found'))
        msg = 'No account found with this email.';
      else if (msg.includes('wrong-password'))
        msg = 'Incorrect password.';
      else if (msg.includes('email-already-in-use'))
        msg = 'This email is already registered.';
      else if (msg.includes('too-many-requests'))
        msg = 'Too many attempts. Try again later.';
      else if (msg.includes('network-request-failed'))
        msg = 'Network error. Check your connection.';
      setError(msg);
    }
    setLoading(false);
  };

  const handleSocialLogin = async (providerType) => {
    setLoading(true);
    setError('');
    try {
      const provider =
        providerType === 'google' ? googleProvider : githubProvider;
      await setPersistence(
        auth,
        rememberMe ? browserLocalPersistence : browserSessionPersistence
      );
      const result = await signInWithPopup(auth, provider);
      onLogin(result.user);
    } catch (err) {
      let msg = err.message.replace('Firebase: ', '');
      if (msg.includes('popup-closed-by-user'))
        msg = 'Sign‑in cancelled.';
      else if (msg.includes('account-exists-with-different-credential'))
        msg = 'An account already exists with this email.';
      setError(msg);
    }
    setLoading(false);
  };

  const resendVerification = async () => {
    if (resendDisabled || !auth.currentUser) return;
    setResendDisabled(true);
    try {
      await sendEmailVerification(auth.currentUser);
      setSuccess('Verification email resent. Check your inbox.');
    } catch {
      setError('Could not resend verification. Try again later.');
    }
    setTimeout(() => setResendDisabled(false), 60000);
  };

  // ── INLINE STYLES (independent of CSS file) ──
  const pageStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 100%)',
    fontFamily: 'Inter, sans-serif',
    color: '#f0f0f5',
    padding: '20px',
  };

  const cardStyle = {
    background: 'rgba(255,255,255,0.06)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius: '24px',
    padding: '2rem',
    width: '100%',
    maxWidth: '420px',
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  };

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.05)',
    color: '#f0f0f5',
    fontSize: '1rem',
    outline: 'none',
    marginBottom: '12px',
    boxSizing: 'border-box',
  };

  const labelStyle = {
    display: 'block',
    marginBottom: '4px',
    fontSize: '0.85rem',
    color: '#a0a0b8',
  };

  const btnPrimary = {
    width: '100%',
    padding: '12px',
    borderRadius: '12px',
    border: 'none',
    background: '#7f5af0',
    color: '#fff',
    fontWeight: '600',
    fontSize: '1rem',
    cursor: 'pointer',
    marginTop: '8px',
  };

  const btnSocial = {
    flex: 1,
    padding: '10px',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.05)',
    color: '#f0f0f5',
    fontWeight: '500',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  };

  const linkStyle = {
    color: '#9b7eff',
    textDecoration: 'none',
  };

  // ── BUILD UI ──
  const headerEl = React.createElement(
    'div',
    { style: { textAlign: 'center', marginBottom: '24px' } },
    React.createElement('h1', { style: { fontSize: '1.8rem', fontWeight: '700' } }, 'Connect Point'),
    React.createElement(
      'p',
      { style: { color: '#a0a0b8', marginTop: '8px' } },
      mode === 'login'
        ? 'Welcome back'
        : mode === 'register'
        ? 'Create your account'
        : 'Reset your password'
    )
  );

  const errorEl = error
    ? React.createElement(
        'div',
        {
          style: {
            background: 'rgba(239,68,68,0.2)',
            padding: '12px',
            borderRadius: '12px',
            marginBottom: '16px',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          },
        },
        React.createElement('i', { className: 'ph ph-x-circle' }),
        error
      )
    : null;

  const successEl = success && !verificationSent
    ? React.createElement(
        'div',
        {
          style: {
            background: 'rgba(34,197,94,0.2)',
            padding: '12px',
            borderRadius: '12px',
            marginBottom: '16px',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          },
        },
        React.createElement('i', { className: 'ph ph-check-circle' }),
        success
      )
    : null;

  const verifyEl = verificationSent
    ? React.createElement(
        'div',
        {
          style: {
            background: 'rgba(34,197,94,0.2)',
            padding: '12px',
            borderRadius: '12px',
            marginBottom: '16px',
            fontSize: '0.9rem',
          },
        },
        'Verification email sent! ',
        React.createElement(
          'button',
          {
            onClick: resendVerification,
            disabled: resendDisabled,
            style: { ...linkStyle, background: 'none', border: 'none', cursor: 'pointer' },
          },
          'Resend'
        )
      )
    : null;

  const displayNameField =
    mode === 'register'
      ? React.createElement(
          'div',
          null,
          React.createElement('label', { style: labelStyle }, 'Display Name'),
          React.createElement('input', {
            type: 'text',
            name: 'displayName',
            placeholder: 'John Doe',
            value: formData.displayName,
            onChange: handleChange,
            style: inputStyle,
            required: true,
          })
        )
      : null;

  const emailField = React.createElement(
    'div',
    null,
    React.createElement('label', { style: labelStyle }, 'Email'),
    React.createElement('input', {
      ref: emailRef,
      type: 'email',
      name: 'email',
      placeholder: 'you@example.com',
      value: formData.email,
      onChange: handleChange,
      style: inputStyle,
      required: true,
    })
  );

  const passwordField =
    mode !== 'forgot'
      ? React.createElement(
          'div',
          null,
          React.createElement('label', { style: labelStyle }, 'Password'),
          React.createElement(
            'div',
            { style: { position: 'relative' } },
            React.createElement('input', {
              type: showPassword ? 'text' : 'password',
              name: 'password',
              placeholder: '••••••••',
              value: formData.password,
              onChange: handleChange,
              style: inputStyle,
              required: true,
            }),
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: togglePassword,
                style: {
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#a0a0b8',
                  cursor: 'pointer',
                },
              },
              React.createElement('i', {
                className: `ph ${showPassword ? 'ph-eye-slash' : 'ph-eye'}`,
              })
            )
          ),
          mode === 'register' && formData.password.length > 0
            ? React.createElement(
                'div',
                { style: { marginBottom: '12px' } },
                React.createElement(
                  'div',
                  {
                    style: {
                      height: '6px',
                      background: 'rgba(255,255,255,0.1)',
                      borderRadius: '3px',
                      overflow: 'hidden',
                      marginBottom: '4px',
                    },
                  },
                  React.createElement('div', {
                    style: {
                      height: '100%',
                      width: `${(passwordStrength / 4) * 100}%`,
                      background:
                        passwordStrength <= 1
                          ? '#ef4444'
                          : passwordStrength === 2
                          ? '#f97316'
                          : passwordStrength === 3
                          ? '#eab308'
                          : '#22c55e',
                      borderRadius: '3px',
                      transition: 'width 0.3s',
                    },
                  })
                ),
                React.createElement(
                  'span',
                  { style: { fontSize: '0.75rem', color: '#a0a0b8' } },
                  passwordStrength === 0
                    ? 'Very weak'
                    : passwordStrength === 1
                    ? 'Weak'
                    : passwordStrength === 2
                    ? 'Fair'
                    : passwordStrength === 3
                    ? 'Good'
                    : 'Strong'
                )
              )
            : null,
          mode === 'register'
            ? React.createElement(
                'div',
                null,
                React.createElement('label', { style: labelStyle }, 'Confirm Password'),
                React.createElement('input', {
                  type: showPassword ? 'text' : 'password',
                  name: 'confirmPassword',
                  placeholder: '••••••••',
                  value: formData.confirmPassword,
                  onChange: handleChange,
                  style: inputStyle,
                  required: true,
                })
              )
            : null
        )
      : null;

  const rememberMeCheck =
    mode === 'login'
      ? React.createElement(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '12px',
              color: '#a0a0b8',
              fontSize: '0.9rem',
            },
          },
          React.createElement('input', {
            type: 'checkbox',
            checked: rememberMe,
            onChange: (e) => setRememberMe(e.target.checked),
          }),
          'Remember me'
        )
      : null;

  const submitBtn = React.createElement(
    'button',
    {
      type: 'submit',
      disabled: loading,
      style: {
        ...btnPrimary,
        opacity: loading ? 0.7 : 1,
      },
    },
    loading
      ? 'Please wait...'
      : mode === 'login'
      ? 'Sign In'
      : mode === 'register'
      ? 'Create Account'
      : 'Send Reset Link'
  );

  const formEl = React.createElement(
    'form',
    { onSubmit: handleEmailAuth },
    displayNameField,
    emailField,
    passwordField,
    rememberMeCheck,
    submitBtn
  );

  const socialSection =
    mode !== 'forgot'
      ? React.createElement(
          'div',
          { style: { marginTop: '20px' } },
          React.createElement(
            'div',
            {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginBottom: '16px',
                color: '#a0a0b8',
                fontSize: '0.85rem',
              },
            },
            React.createElement('div', { style: { flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' } }),
            'or continue with',
            React.createElement('div', { style: { flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' } })
          ),
          React.createElement(
            'div',
            { style: { display: 'flex', gap: '12px' } },
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: () => handleSocialLogin('google'),
                disabled: loading,
                style: btnSocial,
              },
              React.createElement('i', { className: 'ph ph-google-logo', style: { fontSize: '1.2rem' } }),
              ' Google'
            ),
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: () => handleSocialLogin('github'),
                disabled: loading,
                style: { ...btnSocial, background: '#24292e', color: '#fff' },
              },
              React.createElement('i', { className: 'ph ph-github-logo', style: { fontSize: '1.2rem' } }),
              ' GitHub'
            )
          )
        )
      : null;

  const switchLinks = React.createElement(
    'div',
    {
      style: {
        textAlign: 'center',
        marginTop: '24px',
        fontSize: '0.9rem',
        color: '#a0a0b8',
      },
    },
    mode === 'login'
      ? React.createElement(
          React.Fragment,
          null,
          React.createElement(
            'a',
            {
              href: '#',
              onClick: (e) => {
                e.preventDefault();
                setMode('forgot');
              },
              style: linkStyle,
            },
            'Forgot password?'
          ),
          React.createElement('br'),
          "Don't have an account? ",
          React.createElement(
            'a',
            {
              href: '#',
              onClick: (e) => {
                e.preventDefault();
                setMode('register');
              },
              style: linkStyle,
            },
            'Sign up'
          )
        )
      : mode === 'register'
      ? React.createElement(
          React.Fragment,
          null,
          'Already have an account? ',
          React.createElement(
            'a',
            {
              href: '#',
              onClick: (e) => {
                e.preventDefault();
                setMode('login');
              },
              style: linkStyle,
            },
            'Sign in'
          )
        )
      : React.createElement(
          'a',
          {
            href: '#',
            onClick: (e) => {
              e.preventDefault();
              setMode('login');
            },
            style: linkStyle,
          },
          '← Back to sign in'
        )
  );

  return React.createElement(
    'div',
    { style: pageStyle },
    React.createElement(
      'div',
      { style: cardStyle },
      headerEl,
      errorEl,
      successEl,
      verifyEl,
      formEl,
      socialSection,
      switchLinks
    )
  );
                                }
