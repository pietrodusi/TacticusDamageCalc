/**
 * Damage Calculation Module
 *
 * Provides damage calculation for Tacticus battle simulation based on:
 * https://tacticus.fandom.com/wiki/HDTW_Damage
 *
 * Main Formula:
 *   MAX[(DamVar - Armor) vs (DamVar * Pierce Ratio)] * Hits = Damage
 *
 * Usage:
 *   import { calculateDamage, DamageCalculator } from './services/damage';
 *
 *   // Quick calculation
 *   const result = calculateDamage(attackerStats, defenderStats, true);
 *
 *   // Or with class for more control
 *   const calc = new DamageCalculator(true);
 *   const result = calc.calculate(attackerStats, defenderStats);
 *   calc.printLogs();
 */

// Types
export {
  PIERCE_RATIOS,
  DAMAGE_VARIANCE,
  type AttackerStats,
  type DefenderStats,
  type HitResult,
  type DamageResult,
  type CalculationLog,
} from './types';

// Formulas (for direct use or testing)
export {
  calculateDamageVariance,
  getMinDamageVariance,
  getMaxDamageVariance,
  getAvgDamageVariance,
  calculateArmorReduction,
  calculatePierceFloor,
  applyPierceMaximum,
  calculateCritBaseDamage,
  calculateExpectedCritBonus,
  calculateEffectiveCritChance,
  calculateEffectiveCritDamage,
  calculateBlockReduction,
  calculateEffectiveBlockChance,
  calculateEffectiveBlockDamage,
  calculateSingleHitDamage,
  calculateTotalDamage,
} from './formulas';

// Calculator
export { DamageCalculator, calculateDamage } from './calculator';
