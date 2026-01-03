/**
 * Damage Profile Loader
 * Loads damage profiles from JSON and provides pierce ratio lookup
 * Source of truth: damageProfiles.json
 */

import type { DamageType } from '../../types';
import damageProfilesData from '../../assets/data/damageProfiles.json';

/**
 * Damage profile structure from JSON
 */
interface DamageProfile {
  PiercingRatio: number;  // Integer percentage (1-100)
  Traits?: string[];      // Optional traits (e.g., "NoBlocking")
}

type DamageProfiles = Record<string, DamageProfile>;

// Cache loaded profiles (singleton pattern)
let profilesCache: DamageProfiles | null = null;

/**
 * Load damage profiles from JSON (called once on first use)
 */
function loadDamageProfiles(): DamageProfiles {
  if (profilesCache) return profilesCache;

  try {
    profilesCache = damageProfilesData as DamageProfiles;
    return profilesCache;
  } catch (error) {
    console.error('Failed to load damage profiles:', error);
    // Return empty object, getPierceRatio will use fallback
    profilesCache = {};
    return profilesCache;
  }
}

/**
 * Get pierce ratio for a damage type
 * Converts JSON percentage (1-100) to decimal (0.01-1.00)
 *
 * @param damageType - The damage type
 * @returns Pierce ratio as decimal (0.0-1.0)
 */
export function getPierceRatio(damageType: DamageType): number {
  const profiles = loadDamageProfiles();
  const profile = profiles[damageType];

  if (!profile) {
    console.warn(`No damage profile found for ${damageType}, using default 25%`);
    return 0.25;
  }

  const ratio = profile.PiercingRatio;

  // Validate and clamp to [0, 100]
  if (ratio < 0 || ratio > 100) {
    console.warn(`Invalid pierce ratio ${ratio} for ${damageType}, clamping to [0, 100]`);
    return Math.max(0, Math.min(100, ratio)) / 100;
  }

  // Convert percentage to decimal: 1 → 0.01, 40 → 0.40, 100 → 1.00
  return ratio / 100;
}

/**
 * Get damage profile traits (for future use, e.g., NoBlocking for Psychic)
 *
 * @param damageType - The damage type
 * @returns Array of trait IDs (e.g., ["NoBlocking", "OnFire"])
 */
export function getDamageProfileTraits(damageType: DamageType): string[] {
  const profiles = loadDamageProfiles();
  const profile = profiles[damageType];
  return profile?.Traits || [];
}

/**
 * Check if damage profile has a specific trait
 *
 * @param damageType - The damage type
 * @param trait - The trait ID to check
 * @returns True if profile has the trait
 */
export function hasDamageProfileTrait(damageType: DamageType, trait: string): boolean {
  return getDamageProfileTraits(damageType).includes(trait);
}
