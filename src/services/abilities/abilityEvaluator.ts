/**
 * Ability Evaluator
 * Main engine for evaluating passive abilities and executing active abilities
 */

import type {
  AbilityContext,
  AbilityStatModifier,
  PassiveAbilityEvaluation,
  PassiveAbilitiesResult,
  ActiveAbilityResult,
  FollowUpAttack,
} from './types';

import { getAbilityHandler } from './abilityRegistry';
import { getAbilityValues, getAbilityNameSync, classifyAbility } from './abilityDataLoader';

/**
 * Combine multiple ability stat modifiers into one
 */
export function combineModifiers(modifiers: AbilityStatModifier[]): AbilityStatModifier {
  const combined: AbilityStatModifier = {
    baseDamageBonus: 0,
    baseDamageMultiplier: 1,
    globalDamageBonus: 0,
    extraHits: 0,
    critChanceBonus: 0,
    critDamageBonus: 0,
    armorIgnored: 0,
    pierceRatioBonus: 0,
  };

  for (const mod of modifiers) {
    // Additive bonuses
    if (mod.baseDamageBonus) {
      combined.baseDamageBonus! += mod.baseDamageBonus;
    }
    if (mod.globalDamageBonus) {
      combined.globalDamageBonus! += mod.globalDamageBonus;
    }
    if (mod.extraHits) {
      combined.extraHits! += mod.extraHits;
    }
    if (mod.critChanceBonus) {
      combined.critChanceBonus! += mod.critChanceBonus;
    }
    if (mod.critDamageBonus) {
      combined.critDamageBonus! += mod.critDamageBonus;
    }
    if (mod.armorIgnored) {
      combined.armorIgnored! += mod.armorIgnored;
    }
    if (mod.pierceRatioBonus) {
      combined.pierceRatioBonus! += mod.pierceRatioBonus;
    }

    // Multiplicative bonuses (stack multiplicatively)
    if (mod.baseDamageMultiplier) {
      combined.baseDamageMultiplier! *= mod.baseDamageMultiplier;
    }

    // Override values (last one wins)
    if (mod.overrideDamageProfile) {
      combined.overrideDamageProfile = mod.overrideDamageProfile;
    }
    if (mod.overrideMinDamage !== undefined) {
      combined.overrideMinDamage = mod.overrideMinDamage;
    }
    if (mod.overrideMaxDamage !== undefined) {
      combined.overrideMaxDamage = mod.overrideMaxDamage;
    }
    if (mod.overrideHits !== undefined) {
      combined.overrideHits = mod.overrideHits;
    }
  }

  return combined;
}

/**
 * Evaluate all passive abilities for a character
 *
 * @param passiveAbilityIds - Array of passive ability IDs
 * @param abilityLevels - Map of ability ID to level index
 * @param context - Ability evaluation context
 * @returns Combined evaluation result
 */
export function evaluatePassiveAbilities(
  passiveAbilityIds: string[],
  abilityLevels: Record<string, number>,
  context: AbilityContext
): PassiveAbilitiesResult {
  const evaluations: PassiveAbilityEvaluation[] = [];
  const applicableModifiers: AbilityStatModifier[] = [];
  const followUpAttacks: FollowUpAttack[] = [];

  for (const abilityId of passiveAbilityIds) {
    const handler = getAbilityHandler(abilityId);
    const levelIndex = abilityLevels[abilityId] ?? 54; // Default to level 55

    if (handler?.evaluatePassive) {
      // Use registered handler
      const values = getAbilityValues(abilityId, levelIndex, context.progressionStepIndex);
      if (values) {
        const evaluation = handler.evaluatePassive(values, context);
        evaluations.push(evaluation);

        if (evaluation.applicable) {
          applicableModifiers.push(evaluation.modifiers);

          // Collect follow-up attacks
          if (evaluation.followUpAttack) {
            followUpAttacks.push(evaluation.followUpAttack);
          }
        }
      }
    } else {
      // No handler registered - ability not implemented yet
      // Could add a default evaluation here for simple cases
      evaluations.push({
        abilityId,
        abilityName: getAbilityNameSync(abilityId),
        modifiers: {},
        applicable: false,
        reason: 'Not implemented',
        requiresToggle: false,
      });
    }
  }

  return {
    evaluations,
    combinedModifiers: combineModifiers(applicableModifiers),
    followUpAttacks,
  };
}

/**
 * Execute an active ability
 *
 * @param abilityId - The ability ID to execute
 * @param levelIndex - The ability level index
 * @param context - Ability evaluation context
 * @returns The result of executing the ability
 */
export function executeActiveAbility(
  abilityId: string,
  levelIndex: number,
  context: AbilityContext
): ActiveAbilityResult | null {
  const handler = getAbilityHandler(abilityId);
  const values = getAbilityValues(abilityId, levelIndex, context.progressionStepIndex);

  if (!values) {
    console.warn(`No ability data found for ${abilityId}`);
    return null;
  }

  if (handler?.executeActive) {
    return handler.executeActive(values, context);
  }

  // No handler registered - return a default result based on ability category
  const category = classifyAbility(abilityId);
  const abilityName = getAbilityNameSync(abilityId);

  return {
    abilityId,
    abilityName,
    category,
    message: `${abilityName} (not implemented)`,
  };
}

/**
 * Apply ability modifiers to base damage
 */
export function applyAbilityModifiersToDamage(
  baseDamage: number,
  modifiers: AbilityStatModifier
): number {
  let damage = baseDamage;

  // Apply flat bonus first
  if (modifiers.baseDamageBonus) {
    damage += modifiers.baseDamageBonus;
  }

  // Then apply multiplier
  if (modifiers.baseDamageMultiplier) {
    damage = Math.round(damage * modifiers.baseDamageMultiplier);
  }

  return damage;
}

/**
 * Apply ability modifiers to hits
 */
export function applyAbilityModifiersToHits(
  baseHits: number,
  modifiers: AbilityStatModifier
): number {
  let hits = baseHits;

  if (modifiers.extraHits) {
    hits += modifiers.extraHits;
  }

  if (modifiers.overrideHits !== undefined) {
    hits = modifiers.overrideHits;
  }

  return hits;
}

/**
 * Apply ability modifiers to crit stats
 */
export function applyAbilityModifiersToCrit(
  baseCritChance: number,
  baseCritDamage: number,
  modifiers: AbilityStatModifier
): { critChance: number; critDamage: number } {
  return {
    critChance: baseCritChance + (modifiers.critChanceBonus || 0),
    critDamage: baseCritDamage + (modifiers.critDamageBonus || 0),
  };
}
