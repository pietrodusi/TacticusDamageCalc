// Evaluates buff target conditions to determine which characters receive buff effects

import type {
  BuffTargetCondition,
  BuffEvaluationContext,
  PooledBuff,
} from '../../types/buff';

/**
 * Evaluates a target condition against the current context
 * Returns true if the attacker should receive this buff's effects
 */
export function evaluateTargetCondition(
  condition: BuffTargetCondition,
  context: BuffEvaluationContext,
  buff: PooledBuff
): boolean {
  switch (condition.type) {
    case 'self':
      // Only the character who created the buff receives it
      return context.attacker.id === buff.sourceCharacterId;

    case 'characterId':
      // Specific character by ID
      return context.attacker.id === condition.characterId;

    case 'characterName':
      // Specific character by name (useful for cross-character buffs)
      return context.attacker.name === condition.characterName;

    case 'allAllies':
      // All friendly characters receive this buff
      return true;

    case 'hasTrait':
      // Characters with a specific trait
      if (!condition.traitRequired) return false;
      return context.attacker.traits?.includes(condition.traitRequired) ?? false;

    case 'attackType':
      // Only applies to specific attack types
      if (!condition.attackType) return false;
      return context.attackType === condition.attackType;

    case 'custom':
      // Use custom evaluator function
      if (!condition.customEvaluator) return false;
      const result = condition.customEvaluator(context, buff);
      // Debug logging for LC buffs
      if (buff.buffId.startsWith('legendary_commander')) {
        console.log(`[BuffCondition] ${buff.buffId} for ${context.attacker.name}: ${result ? 'APPLIES' : 'does not apply'}`);
      }
      return result;

    default:
      return false;
  }
}

/**
 * Evaluates whether a buff should apply to the current attacker
 */
export function shouldBuffApply(
  buff: PooledBuff,
  context: BuffEvaluationContext
): boolean {
  return evaluateTargetCondition(buff.targetCondition, context, buff);
}
