import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Firebase config - loaded from .env or fallback to hardcoded values
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCNWV3_cdnrGXCtQhJsdGu29RR63ARYPVk',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'qr-print-system-421b4.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'qr-print-system-421b4',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'qr-print-system-421b4.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '234806615379',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:234806615379:web:b7bee5ec2e75ceb3d915a6',
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const firebaseApp = app;
export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
