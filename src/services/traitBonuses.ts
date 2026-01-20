/**
 * Trait Bonuses Display Service
 * Computes which trait bonuses are applicable for display on character cards
 * during battle simulation.
 */

import traitsData from '../assets/data/traits.json';
import type { BattleCharacter } from '../types';

// Type for traits data structure
interface TraitData {
  name: string;
  description: string;
}

const traits = traitsData as Record<string, TraitData>;

/**
 * A trait bonus that can be displayed on a character card
 */
export interface DisplayableTraitBonus {
  traitId: string;
  traitName: string;
  bonusText: string;       // e.g., "+50% melee", "+25% ranged"
  isActive: boolean;       // Whether the bonus is currently applicable
  reason: string;          // Why it is/isn't active
  colorClass: string;      // Tailwind class for coloring (green for positive, red for negative)
}

/**
 * Trait bonus definition for computing displayable bonuses
 */
interface TraitBonusDefinition {
  compute: (character: BattleCharacter, currentTurn?: number) => DisplayableTraitBonus | DisplayableTraitBonus[] | null;
}

/**
 * Get the display name for a trait
 */
function getTraitName(traitId: string): string {
  return traits[traitId]?.name || traitId;
}

/**
 * Trait bonus definitions
 * Each trait that provides damage bonuses is defined here with its display logic
 */
const TRAIT_BONUS_DEFINITIONS: Record<string, TraitBonusDefinition> = {
  CrushingStrike: {
    compute: (character) => {
      // Only active when the "Has not moved" toggle is checked
      const isActive = character.abilityToggles['CrushingStrike_notMoved'] ?? false;
      return {
        traitId: 'CrushingStrike',
        traitName: getTraitName('CrushingStrike'),
        bonusText: '+50% melee (CrushingStrike)',
        isActive,
        reason: isActive ? 'Has not moved' : 'Has not moved condition not checked',
        colorClass: isActive ? 'text-green-400' : 'text-gray-500',
      };
    },
  },
  HeavyWeapon: {
    compute: (character) => {
      // Only show if character has ranged attack
      if (!character.rangedHits) return null;

      // Only active when the "Has not moved" toggle is checked
      const isActive = character.abilityToggles['HeavyWeapon_notMoved'] ?? false;
      return {
        traitId: 'HeavyWeapon',
        traitName: getTraitName('HeavyWeapon'),
        bonusText: '+25% ranged',
        isActive,
        reason: isActive ? 'Has not moved' : 'Has not moved condition not checked',
        colorClass: isActive ? 'text-green-400' : 'text-gray-500',
      };
    },
  },
  Emplacement: {
    compute: (character) => {
      const isActive = !character.hasMoved;
      const bonuses: DisplayableTraitBonus[] = [];

      // Melee penalty (always shown since all characters have melee)
      bonuses.push({
        traitId: 'Emplacement',
        traitName: getTraitName('Emplacement'),
        bonusText: '-50% melee',
        isActive,
        reason: isActive ? 'Has not moved' : 'Moved this turn',
        colorClass: isActive ? 'text-red-400' : 'text-gray-500',
      });

      // Ranged bonus (only if has ranged attack)
      if (character.rangedHits) {
        bonuses.push({
          traitId: 'Emplacement',
          traitName: getTraitName('Emplacement'),
          bonusText: '+50% ranged',
          isActive,
          reason: isActive ? 'Has not moved' : 'Moved this turn',
          colorClass: isActive ? 'text-green-400' : 'text-gray-500',
        });
      }

      return bonuses;
    },
  },
  RapidAssault: {
    compute: (character, currentTurn) => {
      // RapidAssault applies only on the first turn the character attacks
      // All attacks in that turn get the bonus, but not in later turns

      // If character hasn't attacked yet, RapidAssault will trigger on first attack
      const hasntAttackedYet = character.firstAttackTurn === null || character.firstAttackTurn === undefined;

      // If we're on the same turn as the first attack, it's still active
      const isFirstAttackTurn = !hasntAttackedYet && currentTurn !== undefined && currentTurn === character.firstAttackTurn;

      const isActive = hasntAttackedYet || isFirstAttackTurn;

      let reason: string;
      if (hasntAttackedYet) {
        reason = 'Will trigger on first attack';
      } else if (isFirstAttackTurn) {
        reason = 'First attack turn';
      } else {
        reason = 'Only applies on first attack turn';
      }

      return {
        traitId: 'RapidAssault',
        traitName: getTraitName('RapidAssault'),
        bonusText: '+25% damage (RapidAssault)',
        isActive,
        reason,
        colorClass: isActive ? 'text-green-400' : 'text-gray-500',
      };
    },
  },
  BeastSnagga: {
    compute: () => {
      // BeastSnagga: +20% melee damage against BigTarget or Vehicle
      // Always shown as active since we can't know the target from character card
      // The actual check happens during damage calculation
      return {
        traitId: 'BeastSnagga',
        traitName: getTraitName('BeastSnagga'),
        bonusText: '+20% melee (BeastSnagga)',
        isActive: true,
        reason: 'vs BigTarget/Vehicle',
        colorClass: 'text-green-400',
      };
    },
  },
  RangedSpecialist: {
    compute: (character) => {
      // Only show if character has ranged attack
      if (!character.rangedHits) return null;

      // RangedSpecialist: +33% ranged damage when NOT adjacent to enemy
      // Active when the "Started turn adjacent to enemy" toggle is NOT checked
      const isAdjacentToEnemy = character.abilityToggles['RangedSpecialist_adjacentToEnemy'] ?? false;
      const isActive = !isAdjacentToEnemy;

      return {
        traitId: 'RangedSpecialist',
        traitName: getTraitName('RangedSpecialist'),
        bonusText: '+33% ranged',
        isActive,
        reason: isActive ? 'Not adjacent to enemy' : 'Adjacent to enemy',
        colorClass: isActive ? 'text-green-400' : 'text-gray-500',
      };
    },
  },
};

/**
 * Get all applicable trait bonuses for a battle character
 * @param character The battle character to check
 * @param currentTurn Optional current battle turn (for RapidAssault)
 * @returns Array of displayable trait bonuses
 */
export function getCharacterTraitBonuses(character: BattleCharacter, currentTurn?: number): DisplayableTraitBonus[] {
  const bonuses: DisplayableTraitBonus[] = [];

  for (const traitId of character.traits) {
    const definition = TRAIT_BONUS_DEFINITIONS[traitId];
    if (!definition) continue;

    const result = definition.compute(character, currentTurn);
    if (result) {
      if (Array.isArray(result)) {
        bonuses.push(...result);
      } else {
        bonuses.push(result);
      }
    }
  }

  return bonuses;
}

/**
 * Get only the active trait bonuses for a character
 * @param character The battle character to check
 * @param currentTurn Optional current battle turn (for RapidAssault)
 * @returns Array of active trait bonuses only
 */
export function getActiveTraitBonuses(character: BattleCharacter, currentTurn?: number): DisplayableTraitBonus[] {
  return getCharacterTraitBonuses(character, currentTurn).filter(bonus => bonus.isActive);
}

/**
 * Check if a character has any damage modifier traits
 * @param character The battle character to check
 * @returns True if the character has any traits that affect damage
 */
export function hasTraitBonuses(character: BattleCharacter): boolean {
  return character.traits.some(traitId => traitId in TRAIT_BONUS_DEFINITIONS);
}
