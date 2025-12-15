/**
 * Core Damage Formulas for Tacticus Battle Simulation
 *
 * Based on: https://tacticus.fandom.com/wiki/HDTW_Damage
 *
 * Main Formula:
 *   MAX[(DamVar - Armor) vs (DamVar * Pierce Ratio)] * Hits = Damage dealt
 *
 * Where DamVar = Damage * (1 +/- up to 0.2)
 *
 * This file contains pure functions for each step of the calculation.
 */

import { PIERCE_RATIOS, DAMAGE_VARIANCE } from './types';
import type { DamageType } from '../../types';

/**
 * Calculate damage variance (DamVar)
 *
 * Formula: DamVar = BaseDamage * varianceMultiplier
 *
 * @param baseDamage - The character's base damage stat
 * @param varianceMultiplier - Multiplier from 0.8 to 1.2 (±20%)
 * @returns The varied damage value
 */
export function calculateDamageVariance(baseDamage: number, varianceMultiplier: number): number {
  return Math.floor(baseDamage * varianceMultiplier);
}

/**
 * Get the minimum damage variance (for lower bound)
 */
export function getMinDamageVariance(baseDamage: number): number {
  return calculateDamageVariance(baseDamage, DAMAGE_VARIANCE.MIN_MULTIPLIER);
}

/**
 * Get the maximum damage variance (for upper bound)
 */
export function getMaxDamageVariance(baseDamage: number): number {
  return calculateDamageVariance(baseDamage, DAMAGE_VARIANCE.MAX_MULTIPLIER);
}

/**
 * Get the average damage variance
 */
export function getAvgDamageVariance(baseDamage: number): number {
  return calculateDamageVariance(baseDamage, DAMAGE_VARIANCE.AVG_MULTIPLIER);
}

/**
 * Calculate damage after armor reduction
 *
 * Formula: DamVar - Armor (minimum 0)
 *
 * @param damageVariance - The varied damage value
 * @param armor - Target's armor value
 * @returns Damage after armor subtraction
 */
export function calculateArmorReduction(damageVariance: number, armor: number): number {
  return Math.max(0, damageVariance - armor);
}

/**
 * Calculate pierce floor (minimum damage from pierce ratio)
 *
 * Formula: DamVar * PierceRatio
 *
 * @param damageVariance - The varied damage value
 * @param damageType - The type of damage (determines pierce ratio)
 * @returns Minimum damage guaranteed by pierce
 */
export function calculatePierceFloor(damageVariance: number, damageType: DamageType): number {
  const pierceRatio = PIERCE_RATIOS[damageType];
  return Math.floor(damageVariance * pierceRatio);
}

/**
 * Apply the MAX function from the damage formula
 *
 * Formula: MAX[(DamVar - Armor) vs (DamVar * Pierce Ratio)]
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
 * This replaces the base damage in the variance calculation.
 *
 * @param baseDamage - The character's base damage stat
 * @param critDamage - The flat crit damage bonus
 * @returns The damage value to use for crit hits
 */
export function calculateCritBaseDamage(baseDamage: number, critDamage: number): number {
  return baseDamage + critDamage;
}

/**
 * Calculate expected crit bonus using streak-based solution
 *
 * Formula: E[crit bonus] = CritDamage * sum(k=1 to 5) of p^k
 *
 * This accounts for the streak mechanic where consecutive crits
 * have increasing probability.
 *
 * For p = 0.35 (35% crit chance):
 *   sum = 0.35 + 0.35^2 + 0.35^3 + 0.35^4 + 0.35^5
 *   sum = 0.35 + 0.1225 + 0.042875 + 0.01500625 + 0.0052521875
 *   sum ≈ 0.5356
 *
 * @param critChance - Crit chance as decimal (0-1)
 * @param critDamage - Flat crit damage bonus
 * @param maxStreakLength - Maximum streak length (default 5)
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
 * Calculate effective crit chance (simplified for average)
 *
 * For average calculations, we use the simple probability approach
 * rather than streak-based. The streak formula is applied to the
 * damage bonus calculation instead.
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
 * Calculate block reduction
 *
 * When a block occurs, damage is reduced by block damage value.
 *
 * @param damage - Incoming damage
 * @param blockDamage - Block damage reduction value
 * @returns Damage after block (minimum 0)
 */
export function calculateBlockReduction(damage: number, blockDamage: number): number {
  return Math.max(0, damage - blockDamage);
}

/**
 * Calculate effective block chance
 *
 * @param baseBlockChance - Base block chance (0-100)
 * @param blockChanceBonus - Additional block chance from equipment (0-100)
 * @returns Total block chance as decimal (0-1), capped at 1
 */
export function calculateEffectiveBlockChance(
  baseBlockChance: number,
  blockChanceBonus: number = 0
): number {
  const totalPercent = baseBlockChance + blockChanceBonus;
  return Math.min(totalPercent / 100, 1);
}

/**
 * Calculate effective block damage
 *
 * @param baseBlockDamage - Base block damage reduction
 * @param blockDmgBonus - Additional block damage from equipment
 * @returns Total block damage reduction
 */
export function calculateEffectiveBlockDamage(
  baseBlockDamage: number,
  blockDmgBonus: number = 0
): number {
  return baseBlockDamage + blockDmgBonus;
}

/**
 * Calculate single hit damage (complete formula)
 *
 * Full formula for one hit:
 *   MAX[(DamVar - Armor) vs (DamVar * Pierce Ratio)]
 *
 * @param baseDamage - Base damage (or base + critDmg if crit)
 * @param armor - Target armor
 * @param damageType - Type of damage
 * @param varianceMultiplier - Damage variance (0.8-1.2)
 * @returns Damage for this hit
 */
export function calculateSingleHitDamage(
  baseDamage: number,
  armor: number,
  damageType: DamageType,
  varianceMultiplier: number = DAMAGE_VARIANCE.AVG_MULTIPLIER
): number {
  const damVar = calculateDamageVariance(baseDamage, varianceMultiplier);
  const afterArmor = calculateArmorReduction(damVar, armor);
  const pierceFloor = calculatePierceFloor(damVar, damageType);
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
