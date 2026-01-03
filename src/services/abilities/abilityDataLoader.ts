/**
 * Ability Data Loader
 * Loads and computes ability values from JSON data
 */

import type { DamageType } from '../../types';
import type {
  RawAbilityStats,
  ComputedAbilityValues,
  AbilityCategory,
  AbilityRangeType,
} from './types';

// Import abilities stats directly (this file doesn't have escape issues)
import abilitiesStatsData from '../../assets/data/abilities.json';

// Type assertion for the imported data (cast through unknown to handle edge cases like empty objects)
const abilitiesStats = abilitiesStatsData as unknown as Record<string, RawAbilityStats>;

// Variables that need to be doubled (JSON values are halved)
const VARIABLES_TO_DOUBLE = new Set([
  // Damage
  'minDmg', 'maxDmg', 'extraMaxDmg', 'dmg', 'extraDmg',
  'blockDmg', 'extraCritDmg',
  'spawnDmg', 'summonDmg', 'summonCritDmg', 'summonBlockDmg',
  'dmgReduction',
  // HP
  'hp', 'maxHp', 'minHp', 'extraHp',
  'hpToHeal', 'maxHpToHeal', 'hpToRepair',
  'spawnHp', 'summonHp', 'shieldHp',
  // Armor
  'extraArmor', 'armorReduction', 'armorIgnored',
  'spawnArmor', 'summonArmor',
]);

/**
 * Check if a variable should be doubled after loading
 * Handles both base names and suffixed variants (e.g., minDmg_2)
 */
function shouldDoubleVariable(key: string): boolean {
  // Check exact match
  if (VARIABLES_TO_DOUBLE.has(key)) return true;

  // Check for suffixed variants (e.g., minDmg_2, maxDmg_3)
  for (const baseVar of VARIABLES_TO_DOUBLE) {
    if (key.startsWith(baseVar + '_')) return true;
  }

  return false;
}

// Cache for ability display names (loaded lazily)
let abilitiesDisplayCache: Record<string, { name: string; description: string }> | null = null;
let displayLoadPromise: Promise<void> | null = null;

/**
 * Fix JSON escape issues in abilitiesData.json
 */
function fixJsonEscapes(raw: string): string {
  let result = raw;
  result = result.replace(/\\'/g, "'");
  result = result.replace(/\\x([0-9a-fA-F]{2})/g, '\\u00$1');
  result = result.replace(/ {2}">/g, '  \\">');
  return result;
}

/**
 * Load abilities display data (names and descriptions)
 */
async function loadAbilitiesDisplay(): Promise<void> {
  if (abilitiesDisplayCache) return;

  if (!displayLoadPromise) {
    displayLoadPromise = (async () => {
      try {
        const response = await fetch(
          new URL('../../assets/data/abilitiesData.json', import.meta.url).href
        );
        const text = await response.text();
        abilitiesDisplayCache = JSON.parse(fixJsonEscapes(text));
      } catch (e) {
        console.error('Failed to load abilities display data:', e);
        abilitiesDisplayCache = {};
      }
    })();
  }

  await displayLoadPromise;
}

// Start loading display data immediately
loadAbilitiesDisplay();

/**
 * Get the display name for an ability
 */
export async function getAbilityName(abilityId: string): Promise<string> {
  await loadAbilitiesDisplay();
  return abilitiesDisplayCache?.[abilityId]?.name || abilityId;
}

/**
 * Get ability name synchronously (may return ID if not loaded yet)
 */
export function getAbilityNameSync(abilityId: string): string {
  return abilitiesDisplayCache?.[abilityId]?.name || abilityId;
}

/**
 * Get ability description synchronously (may return empty string if not loaded yet)
 */
export function getAbilityDescriptionSync(abilityId: string): string {
  return abilitiesDisplayCache?.[abilityId]?.description || '';
}

/**
 * Strip style tags from ability description for plain text display
 */
function stripStyleTags(text: string): string {
  // Remove <style=...>...</style> patterns, keeping the inner text
  let result = text.replace(/<style=[^>]*>([^<]*)<\/style>/g, '$1');
  // Remove any remaining unclosed style tags
  result = result.replace(/<style=[^>]*>/g, '');
  result = result.replace(/<\/style>/g, '');
  // Remove <i>...</i> tags, keeping inner text
  result = result.replace(/<\/?i>/g, '');
  // Remove i2p markers (plural/one variants)
  result = result.replace(/\[i2p_Plural\].*?\[i2p_One\]/gs, '');
  result = result.replace(/\[i2p_One\].*?\[i2p_Plural\]/gs, '');
  result = result.replace(/\[i2p_\w+\]/g, '');
  // Convert escaped newlines to actual newlines
  result = result.replace(/\\n/g, '\n');
  // Collapse multiple newlines
  result = result.replace(/\n{3,}/g, '\n\n');
  return result.trim();
}

/**
 * Get ability description formatted with values at specified level
 * @param abilityId - The ability ID
 * @param levelIndex - Level index (0-64)
 * @returns Formatted description with values interpolated
 */
export function getFormattedAbilityDescription(
  abilityId: string,
  levelIndex: number
): string {
  const description = getAbilityDescriptionSync(abilityId);
  if (!description) return '';

  const values = getAbilityValues(abilityId, levelIndex);
  if (!values) return stripStyleTags(description);

  // Replace {[variableName]} placeholders with actual values
  let formatted = description.replace(/\{\[(\w+)\]\}/g, (_, varName) => {
    const value = values[varName];
    if (value !== undefined) {
      return String(value);
    }
    return `{${varName}}`;
  });

  return stripStyleTags(formatted);
}

/**
 * Get raw ability stats for an ability
 */
export function getRawAbilityStats(abilityId: string): RawAbilityStats | null {
  return abilitiesStats[abilityId] || null;
}

/**
 * Get all ability IDs
 */
export function getAllAbilityIds(): string[] {
  return Object.keys(abilitiesStats);
}

/**
 * Check if an ability exists
 */
export function abilityExists(abilityId: string): boolean {
  return abilityId in abilitiesStats;
}

/**
 * Get the attack range type for an ability
 */
export function getAbilityRangeType(abilityId: string): AbilityRangeType | null {
  const stats = abilitiesStats[abilityId];
  return stats?.attackRangeType || null;
}

/**
 * Map damage profile string to DamageType
 */
function mapDamageProfile(profile: string | undefined): DamageType | undefined {
  if (!profile) return undefined;

  const typeMap: Record<string, DamageType> = {
    Physical: 'Physical',
    Chain: 'Chain',
    Piercing: 'Piercing',
    Power: 'Power',
    Eviscerate: 'Eviscerate',
    Bolter: 'Bolter',
    HeavyRound: 'HeavyRound',
    Projectile: 'Projectile',
    Las: 'Las',
    Plasma: 'Plasma',
    Melta: 'Melta',
    Flame: 'Flame',
    Energy: 'Energy',
    Blast: 'Blast',
    Psychic: 'Psychic',
    Bio: 'Bio',
    Toxic: 'Toxic',
    Gauss: 'Gauss',
    Particle: 'Particle',
    Pulse: 'Pulse',
    DirectDamage: 'DirectDamage',  // DirectDamage is now a first-class type
  };

  return typeMap[profile];
}

/**
 * Get computed ability values at a specific level
 *
 * @param abilityId - The ability ID
 * @param levelIndex - Level index (0-64, where 0 = level 1, 64 = level 65)
 * @param rarityMultiplier - Optional rarity bonus multiplier (default 1.0)
 */
export function getAbilityValues(
  abilityId: string,
  levelIndex: number,
  rarityMultiplier: number = 1.0
): ComputedAbilityValues | null {
  const stats = abilitiesStats[abilityId];
  if (!stats) return null;

  const clampedLevel = Math.max(0, Math.min(64, levelIndex));
  const result: ComputedAbilityValues = {};

  // Extract variables at the specified level
  if (stats.variables) {
    const affectedByRarity = new Set(stats.variablesAffectedByRarityBonus || []);

    for (const [key, values] of Object.entries(stats.variables)) {
      if (Array.isArray(values) && values.length > 0) {
        const index = Math.min(clampedLevel, values.length - 1);
        const rawValue = values[index];

        // Handle numeric values
        if (typeof rawValue === 'number') {
          let value = rawValue;

          // Double damage-related variables (JSON values are halved)
          if (shouldDoubleVariable(key)) {
            value *= 2;
          }

          // Apply rarity multiplier if applicable
          if (affectedByRarity.has(key) && rarityMultiplier !== 1.0) {
            value = Math.round(value * rarityMultiplier);
          }
          result[key] = value;
        } else {
          // String values are stored as-is
          result[key] = rawValue;
        }
      }
    }
  }

  // Extract constants
  if (stats.constants) {
    for (const [key, value] of Object.entries(stats.constants)) {
      // Parse numeric constants
      const numValue = parseFloat(value);
      if (!isNaN(numValue)) {
        result[key] = numValue;
      } else {
        result[key] = value;
      }
    }
  }

  // Map damage profile to DamageType
  if (result.damageProfile && typeof result.damageProfile === 'string') {
    result.damageProfile = mapDamageProfile(result.damageProfile as string);
  }

  return result;
}

/**
 * Classify an ability into a category based on its variables and constants
 */
export function classifyAbility(abilityId: string): AbilityCategory {
  const stats = abilitiesStats[abilityId];
  if (!stats) return 'other';

  const vars = Object.keys(stats.variables || {});
  const hasConsts = Object.keys(stats.constants || {});

  // Check for summon abilities
  if (
    vars.some((v) => v.includes('summon') || v.includes('Summon')) ||
    hasConsts.includes('unitId') ||
    hasConsts.includes('unitToSpawn')
  ) {
    return 'summon';
  }

  // Check for healing abilities
  if (vars.some((v) => v.includes('heal') || v.includes('Heal') || v === 'hpToHeal' || v === 'hpToRepair')) {
    return 'healing';
  }

  // Check for buff/debuff abilities (modify stats without direct damage)
  if (
    vars.some((v) => v.includes('bonus') || v.includes('Bonus') || v.includes('reduction') || v.includes('Reduction')) &&
    !vars.some((v) => v.includes('Dmg') || v.includes('dmg'))
  ) {
    return 'buff';
  }

  // Check for damage abilities
  if (vars.some((v) => v.includes('Dmg') || v.includes('dmg') || v.includes('Damage'))) {
    // If it has attackRangeType, it's a direct damage ability
    if (stats.attackRangeType) {
      return 'damage';
    }
    // Otherwise it might be a passive damage bonus
    return 'passive';
  }

  return 'other';
}

/**
 * Check if an ability is a damage-dealing ability (has attack range type)
 */
export function isDamageAbility(abilityId: string): boolean {
  const stats = abilitiesStats[abilityId];
  return !!stats?.attackRangeType;
}

/**
 * Check if an ability provides stat modifiers (passive or buff)
 */
export function isModifierAbility(abilityId: string): boolean {
  const stats = abilitiesStats[abilityId];
  if (!stats?.variables) return false;

  const vars = Object.keys(stats.variables);
  return vars.some(
    (v) =>
      v.includes('extra') ||
      v.includes('Extra') ||
      v.includes('bonus') ||
      v.includes('Bonus') ||
      v.includes('Pct') ||
      v === 'dmgPct'
  );
}

/**
 * Get the cooldown for an ability
 * Returns -1 for one-time abilities (no cooldownTurns in constants)
 * Returns positive number for reusable abilities (from constants.cooldownTurns)
 */
export function getAbilityCooldown(abilityId: string): number {
  const stats = abilitiesStats[abilityId];
  if (!stats?.constants) return -1;

  const cooldownTurns = stats.constants.cooldownTurns;
  if (cooldownTurns !== undefined) {
    const cooldown = parseInt(String(cooldownTurns), 10);
    return isNaN(cooldown) ? -1 : cooldown;
  }

  return -1;
}
