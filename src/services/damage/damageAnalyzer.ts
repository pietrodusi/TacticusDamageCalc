/**
 * Damage Analyzer Service
 * Analyzes battle turn history to provide damage breakdowns by attack type and source
 */

import type { Turn } from '../../types/battle';

/**
 * Damage breakdown by attack type for a single character
 */
export interface CharacterDamageBreakdown {
  characterId: string;
  characterName: string;
  totalDamage: number;
  byAttackType: {
    normalMelee: number;
    normalRanged: number;
    specialAttacks: number;      // Active abilities
    passiveFollowUps: number;    // Follow-up attacks from passives
  };
  // Track individual ability damage
  byAbility: Record<string, number>;  // e.g., "Kill Maim Burn" → 95000
}

/**
 * Analyze turn history to get damage breakdown by attack type per character
 */
export function analyzeDamageByAttackType(turnHistory: Turn[]): Map<string, CharacterDamageBreakdown> {
  const breakdowns = new Map<string, CharacterDamageBreakdown>();

  // Helper to ensure character entry exists
  const getOrCreateBreakdown = (characterId: string, characterName: string): CharacterDamageBreakdown => {
    if (!breakdowns.has(characterId)) {
      breakdowns.set(characterId, {
        characterId,
        characterName,
        totalDamage: 0,
        byAttackType: {
          normalMelee: 0,
          normalRanged: 0,
          specialAttacks: 0,
          passiveFollowUps: 0,
        },
        byAbility: {},
      });
    }
    return breakdowns.get(characterId)!;
  };

  // Process all turns
  for (const turn of turnHistory) {
    for (const entry of turn.log) {
      // Skip entries without damage
      if (!entry.damage || entry.damage <= 0) continue;

      const breakdown = getOrCreateBreakdown(entry.characterId, entry.characterName);
      const totalEntryDamage = entry.damage;

      // Calculate follow-up damage total first (entry.damage already includes follow-ups)
      // Track damage that should be attributed to other characters (e.g., Optimised Gait → Exitor-Rho)
      let followUpDamageTotal = 0;
      let damageForOtherCharacters = 0;
      if (entry.followUpAttacks && entry.followUpAttacks.length > 0) {
        for (const followUp of entry.followUpAttacks) {
          const followUpDamage = followUp.damage || 0;
          if (followUpDamage > 0) {
            followUpDamageTotal += followUpDamage;

            // Check if this follow-up should be attributed to a different character
            if (followUp.sourceCharacterId && followUp.sourceCharacterId !== entry.characterId) {
              // Attribute to the source character (e.g., Exitor-Rho for Optimised Gait)
              const sourceBreakdown = getOrCreateBreakdown(
                followUp.sourceCharacterId,
                followUp.sourceCharacterName || 'Unknown'
              );
              sourceBreakdown.byAttackType.passiveFollowUps += followUpDamage;
              sourceBreakdown.totalDamage += followUpDamage;
              if (followUp.abilityName) {
                sourceBreakdown.byAbility[followUp.abilityName] =
                  (sourceBreakdown.byAbility[followUp.abilityName] || 0) + followUpDamage;
              }
              // Track this damage so we don't add it to the entry's character
              damageForOtherCharacters += followUpDamage;
            } else {
              // Normal follow-up - attribute to the entry's character
              breakdown.byAttackType.passiveFollowUps += followUpDamage;
              // Track by ability name
              if (followUp.abilityName) {
                breakdown.byAbility[followUp.abilityName] =
                  (breakdown.byAbility[followUp.abilityName] || 0) + followUpDamage;
              }
            }
          }
        }
      }

      // Main attack damage = entry.damage - follow-up damage (to avoid double-counting)
      const mainAttackDamage = totalEntryDamage - followUpDamageTotal;

      // Categorize main attack by action type
      switch (entry.action) {
        case 'meleeAttack':
          breakdown.byAttackType.normalMelee += mainAttackDamage;
          break;

        case 'rangedAttack':
          breakdown.byAttackType.normalRanged += mainAttackDamage;
          break;

        case 'ability':
          breakdown.byAttackType.specialAttacks += mainAttackDamage;
          // Track by ability name from message (e.g., "Kill Maim Burn deals...")
          const abilityName = extractAbilityName(entry.message);
          if (abilityName) {
            breakdown.byAbility[abilityName] = (breakdown.byAbility[abilityName] || 0) + mainAttackDamage;
          }
          break;

        case 'attack':
          // Generic attack - check attackType field
          if (entry.attackType === 'melee') {
            breakdown.byAttackType.normalMelee += mainAttackDamage;
          } else if (entry.attackType === 'ranged') {
            breakdown.byAttackType.normalRanged += mainAttackDamage;
          } else {
            // Default to melee if unspecified
            breakdown.byAttackType.normalMelee += mainAttackDamage;
          }
          break;
      }

      // Total damage for this character = entry.damage - damage attributed to other characters
      breakdown.totalDamage += totalEntryDamage - damageForOtherCharacters;
    }
  }

  return breakdowns;
}

/**
 * Extract ability name from log message
 * Messages are like "Kill Maim Burn deals 50,000 damage"
 */
function extractAbilityName(message: string): string | null {
  // Try to extract ability name from common message patterns
  const dealsMatch = message.match(/^(.+?)\s+deals?\s+/i);
  if (dealsMatch) {
    return dealsMatch[1].trim();
  }

  // Fallback: use the whole message if short
  if (message.length < 50) {
    return message;
  }

  return null;
}

/**
 * Get formatted attack type label
 */
export function getAttackTypeLabel(type: keyof CharacterDamageBreakdown['byAttackType']): string {
  switch (type) {
    case 'normalMelee': return 'Normal Melee';
    case 'normalRanged': return 'Normal Ranged';
    case 'specialAttacks': return 'Special Attacks';
    case 'passiveFollowUps': return 'Passive Follow-ups';
    default: return type;
  }
}

/**
 * Get color class for attack type
 */
export function getAttackTypeColor(type: keyof CharacterDamageBreakdown['byAttackType']): string {
  switch (type) {
    case 'normalMelee': return 'bg-red-500';
    case 'normalRanged': return 'bg-blue-500';
    case 'specialAttacks': return 'bg-purple-500';
    case 'passiveFollowUps': return 'bg-green-500';
    default: return 'bg-gray-500';
  }
}
