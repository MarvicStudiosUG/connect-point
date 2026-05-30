import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, GithubAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCHh3Uqe_f5c-wxT-rO4kGAMuwd-avx7SU",
  authDomain: "connect-point-4a02c.firebaseapp.com",
  projectId: "connect-point-4a02c",
  storageBucket: "connect-point-4a02c.firebasestorage.app",
  messagingSenderId: "771521045838",
  appId: "1:771521045838:web:9c753f610e38b77aad6a1f"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
export const githubProvider = new GithubAuthProvider();