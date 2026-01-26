/**
 * Sharing Service - Public API
 *
 * Provides functionality for sharing battle simulations via URL.
 */

// Types
export {
  SHARE_DATA_VERSION,
  type ShareableData,
  type CompactSetup,
  type CompactTeamMember,
  type CompactResults,
  type CompactTurn,
  type CompactLogEntry,
  type CompactDamageBreakdown,
  type DecodedShareData,
  type DecodedSetup,
  type DecodedTeamMember,
  type DecodedResults,
  type DecodedTurn,
  type DecodedLogEntry,
  type DecodedDamageBreakdown,
  type DecodedFollowUp,
} from './types';

// Encoder
export { encodeBattleState } from './encoder';

// Decoder
export { decodeShareData, isValidShareData } from './decoder';

// Compression (kept for backwards compatibility)
export {
  compressToUrl,
  decompressFromUrl,
  generateShareUrl,
  extractDataFromUrl,
  parseShareDataFromUrl,
} from './compression';

// Firebase Storage
export {
  saveToStorage,
  loadFromStorage,
  type StoredBattle,
} from './storage';
