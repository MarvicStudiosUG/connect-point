<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Auth Test</title>
  <style>
    body {
      margin: 0;
      background: #0a0a0f;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      font-family: 'Inter', sans-serif;
    }
    .card {
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 24px;
      padding: 2rem;
      width: 90%;
      max-width: 400px;
      color: white;
      text-align: center;
    }
    input, button {
      width: 100%;
      padding: 12px;
      margin: 8px 0;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.2);
      background: rgba(255,255,255,0.05);
      color: white;
      font-size: 1rem;
    }
    button {
      background: #7f5af0;
      border: none;
      font-weight: bold;
      cursor: pointer;
    }
    .error { color: #ef4444; }
    .success { color: #22c55e; }
  </style>
</head>
<body>
  <div id="root"></div>

  <script type="importmap">
    {
      "imports": {
        "react": "https://esm.sh/react@18.3.1",
        "react-dom/client": "https://esm.sh/react-dom@18.3.1/client",
        "firebase/app": "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js",
        "firebase/auth": "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"
      }
    }
  </script>

  <script type="module">
    import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { initializeApp } from 'firebase/app';
    import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

    // Your real Firebase config
    const firebaseConfig = {
      apiKey: "AIzaSyCHh3Uqe_f5c-wxT-rO4kGAMuwd-avx7SU",
      authDomain: "connect-point-4a02c.firebaseapp.com",
      projectId: "connect-point-4a02c",
      storageBucket: "connect-point-4a02c.firebasestorage.app",
      messagingSenderId: "771521045838",
      appId: "1:771521045838:web:9c753f610e38b77aad6a1f"
    };

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);

    function TestAuth() {
      const [email, setEmail] = useState('');
      const [password, setPassword] = useState('');
      const [message, setMessage] = useState('');

      const login = async () => {
        try {
          await signInWithEmailAndPassword(auth, email, password);
          setMessage('Logged in!');
        } catch (e) {
          setMessage('Error: ' + e.message);
        }
      };

      const register = async () => {
        try {
          await createUserWithEmailAndPassword(auth, email, password);
          setMessage('Account created!');
        } catch (e) {
          setMessage('Error: ' + e.message);
        }
      };

      return React.createElement('div', { className: 'card' },
        React.createElement('h2', null, 'Auth Test'),
        React.createElement('input', { type:'email', placeholder:'Email', value:email, onChange:e => setEmail(e.target.value) }),
        React.createElement('input', { type:'password', placeholder:'Password', value:password, onChange:e => setPassword(e.target.value) }),
        React.createElement('button', { onClick:login }, 'Sign In'),
        React.createElement('button', { onClick:register, style:{ marginTop:'8px', background:'#4ecdc4' } }, 'Register'),
        message && React.createElement('p', { className: message.startsWith('Error') ? 'error' : 'success' }, message)
      );
    }

    const root = createRoot(document.getElementById('root'));
    root.render(React.createElement(TestAuth));
  </script>
</body>
</html>
