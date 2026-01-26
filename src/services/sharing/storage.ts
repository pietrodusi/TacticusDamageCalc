/**
 * Firebase storage service for shared battle simulations
 * Stores battle data in Firebase Realtime Database with short IDs
 */

import { ref, push, get } from 'firebase/database';
import { db, ensureAuth } from '../firebase';
import type { ShareableData } from './types';

/**
 * Stored battle record structure in Firebase
 */
export interface StoredBattle {
  title: string;              // Battle title (required, 100 chars max)
  notes: string;              // Strategy notes (optional, 2000 chars max)
  data: ShareableData;        // Full battle data
  createdAt: number;          // Timestamp
}

/**
 * Save battle data to Firebase and return the unique ID
 * Requires anonymous authentication for write access
 */
export async function saveToStorage(
  data: ShareableData,
  title: string,
  notes?: string
): Promise<string> {
  console.log('Saving battle to Firebase...');

  try {
    await ensureAuth(); // Ensure user is signed in anonymously
    console.log('Auth successful, writing to database...');
  } catch (authError) {
    console.error('Auth failed:', authError);
    throw authError;
  }

  try {
    const sharesRef = ref(db, 'shares');
    const newShareRef = await push(sharesRef, {
      title: title.slice(0, 100),           // Limit title to 100 chars
      notes: (notes || '').slice(0, 2000),  // Limit notes to 2000 chars
      data,
      createdAt: Date.now(),
    } as StoredBattle);

    console.log('Battle saved with ID:', newShareRef.key);
    return newShareRef.key || '';
  } catch (dbError) {
    console.error('Database write failed:', dbError);
    throw new Error('Failed to save battle. Please check Firebase database rules.');
  }
}

/**
 * Load battle data from Firebase by ID
 * No authentication required for reads (public data)
 */
export async function loadFromStorage(id: string): Promise<StoredBattle | null> {
  console.log('Loading battle from Firebase, ID:', id);

  const shareRef = ref(db, `shares/${id}`);
  const snapshot = await get(shareRef);

  if (!snapshot.exists()) {
    console.log('Battle not found in Firebase');
    return null;
  }

  const data = snapshot.val();
  console.log('Loaded battle data:', data);

  // Firebase may transform arrays with missing indices into objects
  // We need to ensure turns and logs are arrays
  if (data?.data?.r?.turns && !Array.isArray(data.data.r.turns)) {
    console.log('Converting turns object to array');
    data.data.r.turns = Object.values(data.data.r.turns);
  }

  // Also fix logs within each turn
  if (data?.data?.r?.turns) {
    for (const turn of data.data.r.turns) {
      if (turn?.logs && !Array.isArray(turn.logs)) {
        turn.logs = Object.values(turn.logs);
      }
    }
  }

  // Fix team array
  if (data?.data?.s?.t && !Array.isArray(data.data.s.t)) {
    console.log('Converting team object to array');
    data.data.s.t = Object.values(data.data.s.t);
  }

  return data as StoredBattle;
}
