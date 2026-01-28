/**
 * Core Damage Formulas for Tacticus Battle Simulation
 *
 * Based on: https://tacticus.fandom.com/wiki/HDTW_Damage
 *
 * New Formula (simplified - no variance, no blocking):
 *   DamVarMod = BaseDamage + FlatModifiers + CritBonus
 *   tempDD = MAX[(DamVarMod - Armor), (DamVarMod * PierceRatio)]
 *   perHitDamage = tempDD * GlobalMultipliers
 *   DD = perHitDamage * nrOfHits
 *
 * This file contains pure functions for each step of the calculation.
 */

import type { DamageType } from '../../types';
import { getPierceRatio } from './damageProfileLoader';

/**
 * Calculate damage after armor reduction
 *
 * Formula: DamVarMod - Armor (minimum 0)
 *
 * @param damVarMod - The damage value (base + modifiers + crit)
 * @param armor - Target's armor value
 * @returns Damage after armor subtraction
 */
export function calculateArmorReduction(damVarMod: number, armor: number): number {
  return Math.max(0, damVarMod - armor);
}

/**
 * Calculate pierce floor (minimum damage from pierce ratio)
 *
 * Formula: DamVarMod * (PierceRatio + PierceRatioBonus)
 *
 * @param damVarMod - The damage value (base + modifiers + crit)
 * @param damageType - The type of damage (determines pierce ratio)
 * @param pierceRatioBonus - Optional bonus to pierce ratio percentage (e.g., 10 for +10%)
 * @returns Minimum damage guaranteed by pierce
 */
export function calculatePierceFloor(damVarMod: number, damageType: DamageType, pierceRatioBonus: number = 0): number {
  const basePierceRatio = getPierceRatio(damageType);
  // Cap effective pierce ratio at 100%
  const effectivePierceRatio = Math.min(1, basePierceRatio + (pierceRatioBonus / 100));
  return Math.floor(damVarMod * effectivePierceRatio);
}

/**
 * Apply the MAX function from the damage formula
 *
 * Formula: MAX[(DamVarMod - Armor), (DamVarMod * PierceRatio)]
 *
 * @param afterArmor - Damage after armor reduction
 * @param pierceFloor - Minimum damage from pierce ratio
 * @returns The higher of the two values
 */
export function applyPierceMaximum(afterArmor: number, pierceFloor: number): number {
  return Math.max(afterArmor, pierceFloor);
}

/**
 * Calculate crit damage
 *
 * When a crit occurs, damage becomes: (BaseDamage + CritDamage)
 * This replaces the base damage in the calculation.
 *
 * @param baseDamage - The character's base damage stat
 * @param critDamage - The flat crit damage bonus
 * @returns The damage value to use for crit hits
 */
export function calculateCritBaseDamage(baseDamage: number, critDamage: number): number {
  return baseDamage + critDamage;
}

/**
 * Calculate expected number of crits using streak-based formula
 *
 * Formula: E[crits] = Σ(k=1 to n) p^k = p × (1 - p^n) / (1 - p)
 *
 * This accounts for the streak mechanic where consecutive crits
 * can occur up to the number of hits in the attack.
 *
 * @param critChance - Crit chance as decimal (0-1)
 * @param hits - Number of hits
 * @returns Expected number of crit hits
 */
export function calculateExpectedCrits(
  critChance: number,
  hits: number
): number {
  return calculateExpectedCritsWithOffset(critChance, hits, 1);
}

/**
 * Calculate expected number of blocks using streak-based formula
 *
 * Formula: E[blocks] = Σ(k=1 to n) p^k = p × (1 - p^n) / (1 - p)
 *
 * Blocks work the same as crits - if a block succeeds, the next hit
 * also rolls for block, forming a chain.
 *
 * @param blockChance - Block chance as decimal (e.g., 0.25 for Daemon trait)
 * @param hits - Number of hits
 * @returns Expected number of blocked hits
 */
export function calculateExpectedBlocks(
  blockChance: number,
  hits: number
): number {
  if (blockChance <= 0 || hits <= 0) return 0;
  if (blockChance >= 1) return hits;

  const p = blockChance;
  // E[blocks] = p + p^2 + ... + p^n = p × (1 - p^n) / (1 - p)
  return p * (1 - Math.pow(p, hits)) / (1 - p);
}

/**
 * Calculate expected number of crits with hit offset (for chained crit streaks)
 *
 * Formula: E[crits] = p^startIndex + p^(startIndex+1) + ... + p^(startIndex+hits-1)
 *                   = p^startIndex × (1 - p^hits) / (1 - p)
 *
 * This is used for "Additional Attacks" that share a crit chain with the source attack.
 * If source attack has 4 hits, and additional attack has 3 hits, the additional attack
 * uses hit indices 5-7 in the crit streak (startIndex = 5).
 *
 * @param critChance - Crit chance as decimal (0-1)
 * @param hits - Number of hits in this attack
 * @param startIndex - Starting hit index (1-indexed). For source attack = 1.
 *                     For additional attacks = sourceHits + 1
 * @returns Expected number of crit hits
 */
export function calculateExpectedCritsWithOffset(
  critChance: number,
  hits: number,
  startIndex: number = 1
): number {
  if (critChance <= 0 || hits <= 0) return 0;
  if (critChance >= 1) return hits;
  if (startIndex < 1) startIndex = 1;

  const p = critChance;
  // p^startIndex × (1 - p^hits) / (1 - p)
  return Math.pow(p, startIndex) * (1 - Math.pow(p, hits)) / (1 - p);
}

/**
 * @deprecated Use calculateExpectedCrits instead - kept for backwards compatibility
 * Calculate expected crit bonus using streak-based solution
 *
 * Formula: E[crit bonus] = CritDamage * sum(k=1 to n) of p^k
 *
 * This accounts for the streak mechanic where consecutive crits
 * can occur up to the number of hits in the attack.
 *
 * For p = 0.35 (35% crit chance) with 5 hits:
 *   sum = 0.35 + 0.35^2 + 0.35^3 + 0.35^4 + 0.35^5
 *   sum = 0.35 + 0.1225 + 0.042875 + 0.01500625 + 0.0052521875
 *   sum ≈ 0.5356
 *
 * @param critChance - Crit chance as decimal (0-1)
 * @param critDamage - Flat crit damage bonus
 * @param maxStreakLength - Maximum streak length (should equal number of hits)
 * @returns Expected additional damage from crits per hit
 */
export function calculateExpectedCritBonus(
  critChance: number,
  critDamage: number,
  maxStreakLength: number = 5
): number {
  // Sum of geometric series: p + p^2 + p^3 + ... + p^n
  let sum = 0;
  for (let k = 1; k <= maxStreakLength; k++) {
    sum += Math.pow(critChance, k);
  }
  return critDamage * sum;
}

/**
 * Calculate effective crit chance
 *
 * @param baseCritChance - Base crit chance (0-100)
 * @param critChanceBonus - Additional crit chance from equipment (0-100)
 * @returns Total crit chance as decimal (0-1), capped at 1
 */
export function calculateEffectiveCritChance(
  baseCritChance: number,
  critChanceBonus: number = 0
): number {
  const totalPercent = baseCritChance + critChanceBonus;
  return Math.min(totalPercent / 100, 1);
}

/**
 * Calculate effective crit damage
 *
 * @param baseCritDamage - Base crit damage bonus
 * @param critDmgBonus - Additional crit damage from equipment
 * @returns Total crit damage
 */
export function calculateEffectiveCritDamage(
  baseCritDamage: number,
  critDmgBonus: number = 0
): number {
  return baseCritDamage + critDmgBonus;
}

/**
 * Calculate single hit damage (complete formula - no variance)
 *
 * Full formula for one hit:
 *   MAX[(DamVarMod - Armor), (DamVarMod * (PierceRatio + PierceRatioBonus))]
 *
 * @param damVarMod - Damage value (base + modifiers + crit)
 * @param armor - Target armor
 * @param damageType - Type of damage
 * @param pierceRatioBonus - Optional bonus to pierce ratio percentage (e.g., 10 for +10%)
 * @returns Damage for this hit (before global multipliers)
 */
export function calculateSingleHitDamage(
  damVarMod: number,
  armor: number,
  damageType: DamageType,
  pierceRatioBonus: number = 0
): number {
  const afterArmor = calculateArmorReduction(damVarMod, armor);
  const pierceFloor = calculatePierceFloor(damVarMod, damageType, pierceRatioBonus);
  return applyPierceMaximum(afterArmor, pierceFloor);
}

/**
 * Calculate total damage for all hits
 *
 * @param damagePerHit - Damage per individual hit
 * @param hits - Number of hits
 * @returns Total damage
 */
export function calculateTotalDamage(damagePerHit: number, hits: number): number {
  return damagePerHit * hits;
}
