/**
 * Firebase initialization and authentication
 * Used for storing shared battle simulations
 */

import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getAuth, signInAnonymously } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyDxH7XjI9KzYYjIbY4jkfBU9zFwCBr115A',
  authDomain: 'tacticus-damage-calc.firebaseapp.com',
  databaseURL: 'https://tacticus-damage-calc-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'tacticus-damage-calc',
  storageBucket: 'tacticus-damage-calc.firebasestorage.app',
  messagingSenderId: '683918489980',
  appId: '1:683918489980:web:9f34034ff4ab694ada8cf9',
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);

/**
 * Ensure user is signed in anonymously (required for write access)
 * Firebase anonymous auth allows writes without requiring user accounts
 */
export async function ensureAuth() {
  if (!auth.currentUser) {
    try {
      await signInAnonymously(auth);
    } catch (error) {
      console.error('Firebase anonymous auth failed:', error);
      throw new Error('Authentication failed. Please ensure Anonymous Auth is enabled in Firebase Console.');
    }
  }
  return auth.currentUser;
}
