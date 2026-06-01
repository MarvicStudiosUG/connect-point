import React, { useState, useEffect, useRef } from 'react';
import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signInWithPopup, updateProfile,
  sendEmailVerification, setPersistence, browserLocalPersistence, browserSessionPersistence
} from 'firebase/auth';
import { auth, googleProvider, githubProvider } from './config.js';

export default function Auth({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email:'', password:'', displayName:'', confirmPassword:'' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [rememberMe, setRememberMe] = useState(false);
  const [resendDisabled, setResendDisabled] = useState(false);
  const emailRef = useRef(null);

  useEffect(() => { emailRef.current?.focus(); }, [mode]);

  const calcStrength = pwd => {
    let score = 0;
    if (pwd.length >= 6) score++;
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++;
    if (/\d/.test(pwd)) score++;
    if (/[^a-zA-Z0-9]/.test(pwd)) score++;
    return Math.min(score,4);
  };

  useEffect(() => {
    if (mode === 'register' && form.password) {
      setPasswordStrength(calcStrength(form.password));
    } else setPasswordStrength(0);
  }, [form.password, mode]);

  const handleChange = e => {
    const {name, value} = e.target;
    setForm(prev => ({...prev, [name]: value}));
    setError(''); setSuccess('');
  };

  const togglePassword = () => setShowPassword(prev => !prev);

  const handleEmailAuth = async e => {
    e.preventDefault(); setLoading(true); setError(''); setSuccess(''); setVerificationSent(false);
    try {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) throw new Error('Please enter a valid email.');
      if (mode === 'login') {
        await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
        const userCred = await signInWithEmailAndPassword(auth, form.email, form.password);
        onLogin(userCred.user);
      } else if (mode === 'register') {
        if (form.password.length < 6) throw new Error('Password must be at least 6 characters.');
        if (form.password !== form.confirmPassword) throw new Error('Passwords do not match.');
        const userCred = await createUserWithEmailAndPassword(auth, form.email, form.password);
        if (form.displayName) await updateProfile(userCred.user, { displayName: form.displayName });
        await sendEmailVerification(userCred.user);
        setVerificationSent(true);
        setSuccess('Account created! Verification email sent.');
        onLogin(userCred.user);
      } else if (mode === 'forgot') {
        await sendPasswordResetEmail(auth, form.email);
        setSuccess('Password reset email sent. Check your inbox.');
      }
    } catch (err) {
      let msg = err.message.replace('Firebase: ', '');
      if (msg.includes('user-not-found')) msg = 'No account found with this email.';
      else if (msg.includes('wrong-password')) msg = 'Incorrect password.';
      else if (msg.includes('email-already-in-use')) msg = 'This email is already registered.';
      setError(msg);
    }
    setLoading(false);
  };

  const handleSocialLogin = async providerType => {
    setLoading(true); setError('');
    try {
      const provider = providerType === 'google' ? googleProvider : githubProvider;
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      const result = await signInWithPopup(auth, provider);
      onLogin(result.user);
    } catch (err) {
      let msg = err.message.replace('Firebase: ', '');
      if (msg.includes('popup-closed-by-user')) msg = 'Sign-in cancelled.';
      setError(msg);
    }
    setLoading(false);
  };

  const resendVerification = async () => {
    if (resendDisabled || !auth.currentUser) return;
    setResendDisabled(true);
    try { await sendEmailVerification(auth.currentUser); setSuccess('Verification email resent.'); }
    catch { setError('Could not resend verification.'); }
    setTimeout(() => setResendDisabled(false), 60000);
  };

  // ---- Building UI ----
  const header = React.createElement('div', { className: 'auth-header' },
    React.createElement('h1', null, 'Connect Point'),
    React.createElement('p', { className: 'auth-subtitle' }, mode === 'login' ? 'Welcome back' : mode === 'register' ? 'Create your account' : 'Reset your password')
  );

  const errorDiv = error ? React.createElement('div', { className: 'fade-in error-msg' }, error) : null;
  const successDiv = success && !verificationSent ? React.createElement('div', { className: 'fade-in success-msg' }, success) : null;
  const verifyDiv = verificationSent ? React.createElement('div', { className: 'fade-in success-msg' },
    'Verification email sent! ',
    React.createElement('button', { className: 'link-btn', onClick: resendVerification, disabled: resendDisabled }, 'Resend')
  ) : null;

  const displayNameField = mode === 'register' ? React.createElement('div', { className: 'input-group' },
    React.createElement('label', null, 'Display Name'),
    React.createElement('input', { className: 'input-field', type:'text', name:'displayName', placeholder:'John Doe', value:form.displayName, onChange:handleChange, required:true })
  ) : null;

  const emailField = React.createElement('div', { className: 'input-group' },
    React.createElement('label', null, 'Email'),
    React.createElement('input', { ref:emailRef, className:'input-field', type:'email', name:'email', placeholder:'you@example.com', value:form.email, onChange:handleChange, required:true })
  );

  const passwordField = mode !== 'forgot' ? React.createElement(React.Fragment, null,
    React.createElement('div', { className: 'input-group password-group' },
      React.createElement('label', null, 'Password'),
      React.createElement('div', { className: 'password-wrapper' },
        React.createElement('input', { className:'input-field', type: showPassword ? 'text' : 'password', name:'password', placeholder:'••••••••', value:form.password, onChange:handleChange, required:true }),
        React.createElement('button', { type:'button', className:'password-toggle', onClick:togglePassword, 'aria-label':'Toggle' },
          React.createElement('i', { className: `ph ${showPassword ? 'ph-eye-slash' : 'ph-eye'}` })
        )
      )
    ),
    mode === 'register' && form.password.length > 0 ? React.createElement('div', { className: 'password-strength' },
      React.createElement('div', { className: 'strength-bar' },
        React.createElement('div', { className: `strength-fill strength-${passwordStrength}`, style: { width: `${(passwordStrength/4)*100}%` } })
      ),
      React.createElement('span', { className: 'strength-label' },
        passwordStrength === 0 ? 'Very weak' : passwordStrength === 1 ? 'Weak' : passwordStrength === 2 ? 'Fair' : passwordStrength === 3 ? 'Good' : 'Strong')
    ) : null,
    mode === 'register' ? React.createElement('div', { className:'input-group' },
      React.createElement('label', null, 'Confirm Password'),
      React.createElement('input', { className:'input-field', type: showPassword ? 'text' : 'password', name:'confirmPassword', placeholder:'••••••••', value:form.confirmPassword, onChange:handleChange, required:true })
    ) : null
  ) : null;

  const rememberMeCheck = mode === 'login' ? React.createElement('div', { className:'remember-me' },
    React.createElement('label', null,
      React.createElement('input', { type:'checkbox', checked:rememberMe, onChange: e => setRememberMe(e.target.checked) }),
      ' Remember me'
    )
  ) : null;

  const submitBtnContent = loading ? React.createElement(React.Fragment, null, React.createElement('span', { className:'spinner-small' }), ' Please wait...') :
    React.createElement(React.Fragment, null,
      mode === 'login' ? React.createElement('i', { className:'ph ph-sign-in' }) : mode === 'register' ? React.createElement('i', { className:'ph ph-user-plus' }) : React.createElement('i', { className:'ph ph-arrow-right' }),
      ' ' + (mode === 'login' ? 'Sign In' : mode === 'register' ? 'Create Account' : 'Send Reset Link')
    );

  const submitBtn = React.createElement('button', { type:'submit', className:'btn btn-primary btn-block', disabled:loading }, submitBtnContent);

  const socialSection = mode !== 'forgot' ? React.createElement('div', { className:'social-section' },
    React.createElement('div', { className:'divider' }, React.createElement('span', null, 'or continue with')),
    React.createElement('div', { className:'social-buttons' },
      React.createElement('button', { className:'btn btn-google', onClick:() => handleSocialLogin('google'), disabled:loading },
        React.createElement('i', { className:'ph ph-google-logo' }), ' Google'),
      React.createElement('button', { className:'btn btn-github', onClick:() => handleSocialLogin('github'), disabled:loading },
        React.createElement('i', { className:'ph ph-github-logo' }), ' GitHub')
    )
  ) : null;

  const switchLinks = React.createElement('div', { className:'auth-switch' },
    mode === 'login' ? React.createElement(React.Fragment, null,
      React.createElement('a', { href:'#', onClick:e => {e.preventDefault(); setMode('forgot');} }, 'Forgot password?'),
      React.createElement('span', { className:'sep' }, ' • '),
      React.createElement('span', null, "Don't have an account? ", React.createElement('a', { href:'#', onClick:e => {e.preventDefault(); setMode('register');} }, 'Sign up'))
    ) : mode === 'register' ? React.createElement('span', null,
      'Already have an account? ', React.createElement('a', { href:'#', onClick:e => {e.preventDefault(); setMode('login');} }, 'Sign in')
    ) : React.createElement('a', { href:'#', onClick:e => {e.preventDefault(); setMode('login');} }, 'Back to sign in')
  );

  const formElement = React.createElement('form', { onSubmit:handleEmailAuth, className:'auth-form' },
    displayNameField, emailField, passwordField, rememberMeCheck, submitBtn
  );

  return React.createElement('div', { className:'container-center' },
    React.createElement('div', { className:'glass', style:{ width:'100%', maxWidth:'420px', padding:'2.5rem' } },
      header, errorDiv, successDiv, verifyDiv, formElement, socialSection, switchLinks
    )
  );
                                                                }
