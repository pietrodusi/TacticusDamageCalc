// Manages the buff pool - adding, removing, and querying buffs

import type {
  PooledBuff,
  BuffTemplate,
  PooledBuffEffect,
  BuffEvaluationContext,
  BuffTargetCondition,
} from '../../types/buff';
import type { BattleCharacter } from '../../types/battle';
import { shouldBuffApply } from './conditionEvaluator';

// Generate unique IDs for buff instances
let buffIdCounter = 0;
function generateBuffId(): string {
  return `buff_${Date.now()}_${++buffIdCounter}`;
}

/**
 * Add a buff to the pool from a template
 * Can be called multiple times for stacking
 */
export function addBuffToPool(
  buffPool: PooledBuff[],
  template: BuffTemplate,
  sourceCharacter: BattleCharacter,
  abilityValues: Record<string, number>,
  turn: number,
  targetConditionOverride?: BuffTargetCondition
): PooledBuff[] {
  const newBuff: PooledBuff = {
    id: generateBuffId(),
    buffId: template.buffId,
    name: template.name,
    sourceCharacterId: sourceCharacter.id,
    sourceAbilityId: template.sourceAbilityId,
    targetCondition: targetConditionOverride || template.defaultTargetCondition,
    effects: template.getEffects(abilityValues),
    addedAtTurn: turn,
    duration: template.duration,
    turnsRemaining: template.duration,
  };

  return [...buffPool, newBuff];
}

/**
 * Remove a specific buff instance from the pool by ID
 */
export function removeBuffFromPool(
  buffPool: PooledBuff[],
  buffInstanceId: string
): PooledBuff[] {
  return buffPool.filter(buff => buff.id !== buffInstanceId);
}

/**
 * Remove all buffs with a specific buffId (e.g., all WarHowl buffs)
 */
export function removeAllBuffsOfType(
  buffPool: PooledBuff[],
  buffId: string
): PooledBuff[] {
  return buffPool.filter(buff => buff.buffId !== buffId);
}

/**
 * Remove all buffs from a specific source character
 */
export function removeBuffsFromSource(
  buffPool: PooledBuff[],
  sourceCharacterId: string
): PooledBuff[] {
  return buffPool.filter(buff => buff.sourceCharacterId !== sourceCharacterId);
}

/**
 * Get all buffs that apply to an attacker in the current context
 */
export function getApplicableBuffs(
  buffPool: PooledBuff[],
  context: BuffEvaluationContext
): PooledBuff[] {
  // Debug: Log buff pool state for LC buffs
  const lcBuffs = buffPool.filter(b => b.buffId.startsWith('legendary_commander'));
  if (lcBuffs.length > 0) {
    console.log(`[BuffPool] Turn ${context.battleState.turn}: ${lcBuffs.length} LC buffs in pool`);
    const qualified = context.battleState.team.filter(c => c.hasQualifiedForLCDamage);
    console.log(`[BuffPool] Characters with hasQualifiedForLCDamage: ${qualified.map(c => c.name).join(', ') || 'none'}`);
  }

  return buffPool.filter(buff => shouldBuffApply(buff, context));
}

/**
 * Combine effects from multiple buffs into a single effect object
 * Additive for flat bonuses, multiplicative for multipliers
 */
export function combineBuffEffects(buffs: PooledBuff[]): PooledBuffEffect {
  const combined: PooledBuffEffect = {
    baseDamageBonus: 0,
    baseDamageMultiplier: 1,
    extraHits: 0,
    critChanceBonus: 0,
    critDamageBonus: 0,
    armorIgnored: 0,
    pierceRatioBonus: 0,
  };

  for (const buff of buffs) {
    const effects = buff.effects;
    combined.baseDamageBonus! += effects.baseDamageBonus || 0;
    combined.baseDamageMultiplier! *= effects.baseDamageMultiplier || 1;
    combined.extraHits! += effects.extraHits || 0;
    combined.critChanceBonus! += effects.critChanceBonus || 0;
    combined.critDamageBonus! += effects.critDamageBonus || 0;
    combined.armorIgnored! += effects.armorIgnored || 0;
    combined.pierceRatioBonus! += effects.pierceRatioBonus || 0;
  }

  return combined;
}

/**
 * Get combined effects from applicable buffs with source tracking
 * Returns both combined effects and list of sources for display
 */
export function getApplicableBuffEffects(
  buffPool: PooledBuff[],
  context: BuffEvaluationContext
): { effects: PooledBuffEffect; sources: Array<{ name: string; effects: PooledBuffEffect }> } {
  const applicableBuffs = getApplicableBuffs(buffPool, context);
  const effects = combineBuffEffects(applicableBuffs);
  const sources = applicableBuffs.map(buff => ({
    name: buff.name,
    effects: buff.effects,
  }));

  return { effects, sources };
}

/**
 * Count how many instances of a specific buff are in the pool
 */
export function countBuffInstances(buffPool: PooledBuff[], buffId: string): number {
  return buffPool.filter(buff => buff.buffId === buffId).length;
}

/**
 * Check if a specific buff type exists in the pool
 */
export function hasBuffOfType(buffPool: PooledBuff[], buffId: string): boolean {
  return buffPool.some(buff => buff.buffId === buffId);
}

/**
 * Advance buff durations at turn change
 * Decrements turnsRemaining for all buffs with duration
 * Removes buffs that have expired (turnsRemaining <= 0)
 * Permanent buffs (no duration set) are always kept
 */
export function expireBuffs(buffPool: PooledBuff[]): PooledBuff[] {
  return buffPool
    .map(buff => {
      // If buff has no duration, keep it as-is (permanent aura-style buff)
      // Check both duration and turnsRemaining to be safe
      if (buff.duration === undefined || buff.turnsRemaining === undefined) {
        return buff;
      }
      // Decrement turns remaining
      return {
        ...buff,
        turnsRemaining: buff.turnsRemaining - 1,
      };
    })
    // Remove expired buffs (keep permanent buffs)
    .filter(buff => buff.duration === undefined || buff.turnsRemaining === undefined || buff.turnsRemaining > 0);
}
