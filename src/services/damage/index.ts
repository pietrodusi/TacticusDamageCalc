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
  type AttackerStats,
  type DefenderStats,
  type HitResult,
  type DamageResult,
  type CalculationLog,
  type TraitModifier,
  type DamageCaps,
  type BuffSource,
} from './types';

// Trait evaluation
export {
  evaluateTraitModifiers,
  getTraitName,
  getDamageModifierTraits,
  type TraitEvaluation,
  type TraitContext,
} from './traits';

// Formulas (for direct use or testing)
export {
  calculateArmorReduction,
  calculatePierceFloor,
  applyPierceMaximum,
  calculateCritBaseDamage,
  calculateExpectedCritBonus,
  calculateEffectiveCritChance,
  calculateEffectiveCritDamage,
  calculateSingleHitDamage,
  calculateTotalDamage,
} from './formulas';

// Calculator
export { DamageCalculator, calculateDamage } from './calculator';

// Damage Profile Loader
export {
  getPierceRatio,
  getDamageProfileTraits,
  hasDamageProfileTrait,
} from './damageProfileLoader';
