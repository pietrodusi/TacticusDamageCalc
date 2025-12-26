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

import { PIERCE_RATIOS } from './types';
import type { DamageType } from '../../types';

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
 * Formula: DamVarMod * PierceRatio
 *
 * @param damVarMod - The damage value (base + modifiers + crit)
 * @param damageType - The type of damage (determines pierce ratio)
 * @returns Minimum damage guaranteed by pierce
 */
export function calculatePierceFloor(damVarMod: number, damageType: DamageType): number {
  const pierceRatio = PIERCE_RATIOS[damageType];
  return Math.floor(damVarMod * pierceRatio);
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
  if (critChance <= 0) return 0;
  if (critChance >= 1) return hits;

  const p = critChance;
  const n = hits;
  return p * (1 - Math.pow(p, n)) / (1 - p);
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
 *   MAX[(DamVarMod - Armor), (DamVarMod * PierceRatio)]
 *
 * @param damVarMod - Damage value (base + modifiers + crit)
 * @param armor - Target armor
 * @param damageType - Type of damage
 * @returns Damage for this hit (before global multipliers)
 */
export function calculateSingleHitDamage(
  damVarMod: number,
  armor: number,
  damageType: DamageType
): number {
  const afterArmor = calculateArmorReduction(damVarMod, armor);
  const pierceFloor = calculatePierceFloor(damVarMod, damageType);
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
