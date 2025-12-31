/**
 * Trait evaluation service for damage calculation
 * Evaluates which traits apply to an attack and calculates damage modifiers
 */

import traitsData from '../../assets/data/traits.json';
import type { TraitModifier } from './types';

// Type for traits data structure
interface TraitData {
  name: string;
  description: string;
}

const traits = traitsData as Record<string, TraitData>;

/**
 * Result of trait evaluation
 */
export interface TraitEvaluation {
  modifiers: TraitModifier[];
  totalMultiplier: number;
}

/**
 * Context for trait evaluation - all the state needed to check trait conditions
 */
export interface TraitContext {
  attackType: 'melee' | 'ranged';
  hasMoved: boolean;
  hasAttackedThisBattle: boolean;
  attacksThisTurn: number;
  firstAttackTurn: number | null | undefined;  // Turn when character first attacked (for RapidAssault)
  currentTurn: number | undefined;              // Current battle turn (for RapidAssault)
  targetTraits?: string[];                      // Target's traits (e.g., BigTarget, Vehicle)
  abilityToggles?: Record<string, boolean>;     // User-controlled toggles for trait conditions
  fightingRetreatActive?: boolean;              // Darkstrider's Fighting Retreat override for RangedSpecialist
}

/**
 * Trait effect definitions
 * Maps trait IDs to their damage modifier logic
 */
interface TraitEffect {
  check: (ctx: TraitContext) => { applicable: boolean; multiplier: number; reason: string };
}

const TRAIT_EFFECTS: Record<string, TraitEffect> = {
  CrushingStrike: {
    check: (ctx) => {
      if (ctx.attackType !== 'melee') {
        return { applicable: false, multiplier: 1, reason: 'Only applies to melee attacks' };
      }
      // Only active when the "Has not moved" toggle is checked
      const isActive = ctx.abilityToggles?.['CrushingStrike_notMoved'] ?? false;
      if (!isActive) {
        return { applicable: false, multiplier: 1, reason: 'Has not moved condition not checked' };
      }
      return { applicable: true, multiplier: 1.5, reason: 'Has not moved' };
    },
  },
  HeavyWeapon: {
    check: (ctx) => {
      if (ctx.attackType !== 'ranged') {
        return { applicable: false, multiplier: 1, reason: 'Only applies to ranged attacks' };
      }
      if (ctx.hasMoved) {
        return { applicable: false, multiplier: 1, reason: 'Has moved this turn' };
      }
      return { applicable: true, multiplier: 1.25, reason: 'Not moved' };
    },
  },
  Emplacement: {
    check: (ctx) => {
      if (ctx.hasMoved) {
        return { applicable: false, multiplier: 1, reason: 'Has moved this turn' };
      }
      if (ctx.attackType === 'melee') {
        // Emplacement always gives -50% on melee
        return { applicable: true, multiplier: 0.5, reason: 'Melee penalty (not moved)' };
      }
      // Ranged gets +50%
      return { applicable: true, multiplier: 1.5, reason: 'Ranged bonus (not moved)' };
    },
  },
  RapidAssault: {
    check: (ctx) => {
      // RapidAssault applies only on the first turn the character attacks
      // All attacks in that turn (main + follow-ups) get the bonus
      // In later turns, RapidAssault does NOT apply

      // If character hasn't attacked yet, this is their first attack turn
      if (ctx.firstAttackTurn === null || ctx.firstAttackTurn === undefined) {
        return { applicable: true, multiplier: 1.25, reason: 'First attack turn' };
      }

      // If we're on the same turn as the first attack, apply the bonus
      if (ctx.currentTurn !== undefined && ctx.currentTurn === ctx.firstAttackTurn) {
        return { applicable: true, multiplier: 1.25, reason: 'First attack turn' };
      }

      // Later turns - no bonus
      return { applicable: false, multiplier: 1, reason: 'Not first attack turn' };
    },
  },
  BeastSnagga: {
    check: (ctx) => {
      // BeastSnagga: +20% damage on melee attacks against BigTarget or Vehicle
      if (ctx.attackType !== 'melee') {
        return { applicable: false, multiplier: 1, reason: 'Only applies to melee attacks' };
      }

      // Check if target has BigTarget or Vehicle trait
      const targetTraits = ctx.targetTraits || [];
      const hasBigTarget = targetTraits.includes('BigTarget');
      const hasVehicle = targetTraits.includes('Vehicle');

      if (!hasBigTarget && !hasVehicle) {
        return { applicable: false, multiplier: 1, reason: 'Target is not BigTarget or Vehicle' };
      }

      const targetType = hasBigTarget && hasVehicle ? 'BigTarget/Vehicle' : (hasBigTarget ? 'BigTarget' : 'Vehicle');
      return { applicable: true, multiplier: 1.20, reason: `Target is ${targetType}` };
    },
  },
  RangedSpecialist: {
    check: (ctx) => {
      // RangedSpecialist: +33% ranged damage when NOT adjacent to enemy
      if (ctx.attackType !== 'ranged') {
        return { applicable: false, multiplier: 1, reason: 'Only applies to ranged attacks' };
      }

      // Fighting Retreat override: if active AND adjacent to Darkstrider, apply trait even if adjacent to enemy
      if (ctx.fightingRetreatActive) {
        // Check if character has "Adjacent to Darkstrider" toggle active
        const hasAdjacentToDarkstrider = Object.keys(ctx.abilityToggles || {}).some(
          key => key.startsWith('StructuralAnalyser_') && key.endsWith('_adjacent') && ctx.abilityToggles![key]
        );
        if (hasAdjacentToDarkstrider) {
          return { applicable: true, multiplier: 1.33, reason: 'Fighting Retreat + Adjacent to Darkstrider' };
        }
      }

      // If adjacent to enemy, no bonus (positional bonuses like Position apply instead)
      const isAdjacentToEnemy = ctx.abilityToggles?.['RangedSpecialist_adjacentToEnemy'] ?? false;
      if (isAdjacentToEnemy) {
        return { applicable: false, multiplier: 1, reason: 'Adjacent to enemy' };
      }

      return { applicable: true, multiplier: 1.33, reason: 'Not adjacent to enemy' };
    },
  },
};

/**
 * Get the display name for a trait
 */
export function getTraitName(traitId: string): string {
  return traits[traitId]?.name || traitId;
}

/**
 * Evaluate trait modifiers for an attack
 * @param characterTraits Array of trait IDs the character has
 * @param context The context for trait evaluation
 * @returns Evaluation with individual modifiers and combined multiplier
 */
export function evaluateTraitModifiers(
  characterTraits: string[],
  context: TraitContext
): TraitEvaluation {
  const modifiers: TraitModifier[] = [];
  let totalMultiplier = 1;

  for (const traitId of characterTraits) {
    const effect = TRAIT_EFFECTS[traitId];
    if (!effect) continue;

    const result = effect.check(context);
    const traitName = getTraitName(traitId);

    modifiers.push({
      traitId,
      traitName,
      damageMultiplier: result.multiplier,
      applicable: result.applicable,
      reason: result.reason,
    });

    if (result.applicable) {
      totalMultiplier *= result.multiplier;
    }
  }

  return { modifiers, totalMultiplier };
}

/**
 * Get all trait IDs that have damage modifiers
 */
export function getDamageModifierTraits(): string[] {
  return Object.keys(TRAIT_EFFECTS);
}
