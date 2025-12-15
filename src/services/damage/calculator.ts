/**
 * Damage Calculator for Tacticus Battle Simulation
 *
 * Calculates lower bound, upper bound, and average damage
 * with detailed logging of all calculation steps.
 */

import {
  PIERCE_RATIOS,
  DAMAGE_VARIANCE,
  type AttackerStats,
  type DefenderStats,
  type DamageResult,
  type CalculationLog,
} from './types';

import {
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
  calculateEffectiveBlockChance,
  calculateEffectiveBlockDamage,
  calculateBlockReduction,
  calculateTotalDamage,
} from './formulas';

/**
 * Main damage calculator class with logging support
 */
export class DamageCalculator {
  private logs: CalculationLog[] = [];
  private enableLogging: boolean;

  constructor(enableLogging: boolean = true) {
    this.enableLogging = enableLogging;
  }

  /**
   * Add a log entry
   */
  private log(step: string, description: string, value: number | string): void {
    if (this.enableLogging) {
      this.logs.push({ step, description, value });
    }
  }

  /**
   * Get all logs
   */
  public getLogs(): CalculationLog[] {
    return [...this.logs];
  }

  /**
   * Clear logs
   */
  public clearLogs(): void {
    this.logs = [];
  }

  /**
   * Print logs to console
   */
  public printLogs(): void {
    console.group('=== DAMAGE CALCULATION LOG ===');

    let currentStep = '';
    for (const log of this.logs) {
      if (log.step !== currentStep) {
        if (currentStep) console.groupEnd();
        console.group(`[${log.step}]`);
        currentStep = log.step;
      }
      console.log(`${log.description}: ${log.value}`);
    }

    if (currentStep) console.groupEnd();
    console.groupEnd();
  }

  /**
   * Calculate damage with full breakdown
   *
   * @param attacker - Attacker stats
   * @param defender - Defender stats
   * @returns Complete damage result with bounds and average
   */
  public calculate(attacker: AttackerStats, defender: DefenderStats): DamageResult {
    this.clearLogs();

    // === STEP 1: Log Input Stats ===
    this.log('INPUT', 'Attacker Base Damage', attacker.baseDamage);
    this.log('INPUT', 'Attacker Damage Type', attacker.damageType);
    this.log('INPUT', 'Attacker Hits', attacker.hits);
    this.log('INPUT', 'Attacker Crit Chance', `${attacker.critChance}%`);
    this.log('INPUT', 'Attacker Crit Damage', attacker.critDamage);
    this.log('INPUT', 'Attacker Crit Chance Bonus', `${attacker.critChanceBonus || 0}%`);
    this.log('INPUT', 'Attacker Crit Damage Bonus', attacker.critDmgBonus || 0);
    this.log('INPUT', 'Defender Armor', defender.armor);
    this.log('INPUT', 'Defender Block Chance', `${defender.blockChance}%`);
    this.log('INPUT', 'Defender Block Damage', defender.blockDamage);
    this.log('INPUT', 'Defender Block Chance Bonus', `${defender.blockChanceBonus || 0}%`);
    this.log('INPUT', 'Defender Block Damage Bonus', defender.blockDmgBonus || 0);

    // === STEP 2: Calculate Effective Stats ===
    const pierceRatio = PIERCE_RATIOS[attacker.damageType];
    const effectiveCritChance = calculateEffectiveCritChance(
      attacker.critChance,
      attacker.critChanceBonus
    );
    const effectiveCritDamage = calculateEffectiveCritDamage(
      attacker.critDamage,
      attacker.critDmgBonus
    );
    const effectiveBlockChance = calculateEffectiveBlockChance(
      defender.blockChance,
      defender.blockChanceBonus
    );
    const effectiveBlockDamage = calculateEffectiveBlockDamage(
      defender.blockDamage,
      defender.blockDmgBonus
    );

    this.log('EFFECTIVE', 'Pierce Ratio', `${(pierceRatio * 100).toFixed(0)}%`);
    this.log('EFFECTIVE', 'Total Crit Chance', `${(effectiveCritChance * 100).toFixed(1)}%`);
    this.log('EFFECTIVE', 'Total Crit Damage', effectiveCritDamage);
    this.log('EFFECTIVE', 'Total Block Chance', `${(effectiveBlockChance * 100).toFixed(1)}%`);
    this.log('EFFECTIVE', 'Total Block Damage', effectiveBlockDamage);

    // === STEP 3: Calculate Lower Bound ===
    // Lower bound: Min variance, no crits, all blocks
    this.log('LOWER_BOUND', 'Variance Multiplier', `${DAMAGE_VARIANCE.MIN_MULTIPLIER} (-20%)`);

    const minDamVar = getMinDamageVariance(attacker.baseDamage);
    this.log('LOWER_BOUND', 'Damage Variance (DamVar)', minDamVar);

    const minAfterArmor = calculateArmorReduction(minDamVar, defender.armor);
    this.log('LOWER_BOUND', 'After Armor (DamVar - Armor)', minAfterArmor);

    const minPierceFloor = calculatePierceFloor(minDamVar, attacker.damageType);
    this.log('LOWER_BOUND', 'Pierce Floor (DamVar * Pierce)', minPierceFloor);

    const minPerHit = applyPierceMaximum(minAfterArmor, minPierceFloor);
    this.log('LOWER_BOUND', 'Per Hit = MAX(afterArmor, pierceFloor)', minPerHit);

    // Apply block to lower bound (assume all hits blocked)
    const minPerHitBlocked = calculateBlockReduction(minPerHit, effectiveBlockDamage);
    this.log('LOWER_BOUND', 'Per Hit After Block', minPerHitBlocked);

    const lowerBound = calculateTotalDamage(minPerHitBlocked, attacker.hits);
    this.log('LOWER_BOUND', `Total (${attacker.hits} hits)`, lowerBound);

    // === STEP 4: Calculate Upper Bound ===
    // Upper bound: Max variance, all crits, no blocks
    this.log('UPPER_BOUND', 'Variance Multiplier', `${DAMAGE_VARIANCE.MAX_MULTIPLIER} (+20%)`);

    const critBaseDamage = calculateCritBaseDamage(attacker.baseDamage, effectiveCritDamage);
    this.log('UPPER_BOUND', 'Crit Base Damage (base + critDmg)', critBaseDamage);

    const maxDamVar = getMaxDamageVariance(critBaseDamage);
    this.log('UPPER_BOUND', 'Damage Variance (DamVar)', maxDamVar);

    const maxAfterArmor = calculateArmorReduction(maxDamVar, defender.armor);
    this.log('UPPER_BOUND', 'After Armor (DamVar - Armor)', maxAfterArmor);

    const maxPierceFloor = calculatePierceFloor(maxDamVar, attacker.damageType);
    this.log('UPPER_BOUND', 'Pierce Floor (DamVar * Pierce)', maxPierceFloor);

    const maxPerHit = applyPierceMaximum(maxAfterArmor, maxPierceFloor);
    this.log('UPPER_BOUND', 'Per Hit = MAX(afterArmor, pierceFloor)', maxPerHit);

    const upperBound = calculateTotalDamage(maxPerHit, attacker.hits);
    this.log('UPPER_BOUND', `Total (${attacker.hits} hits)`, upperBound);

    // === STEP 5: Calculate Average ===
    // Average: No variance, streak-based crit, probability-weighted block
    this.log('AVERAGE', 'Variance Multiplier', `${DAMAGE_VARIANCE.AVG_MULTIPLIER} (0%)`);

    // Base damage per hit (no crit)
    const avgDamVar = getAvgDamageVariance(attacker.baseDamage);
    this.log('AVERAGE', 'Base Damage Variance', avgDamVar);

    const avgAfterArmor = calculateArmorReduction(avgDamVar, defender.armor);
    this.log('AVERAGE', 'Base After Armor', avgAfterArmor);

    const avgPierceFloor = calculatePierceFloor(avgDamVar, attacker.damageType);
    this.log('AVERAGE', 'Base Pierce Floor', avgPierceFloor);

    const basePerHit = applyPierceMaximum(avgAfterArmor, avgPierceFloor);
    this.log('AVERAGE', 'Base Per Hit', basePerHit);

    // Calculate expected crit bonus using streak formula
    // E[crit bonus] = CritDamage * sum(k=1 to 5) of p^k
    const expectedCritBonus = calculateExpectedCritBonus(effectiveCritChance, effectiveCritDamage);
    this.log('AVERAGE', 'Expected Crit Bonus (streak formula)', expectedCritBonus.toFixed(2));
    this.log('AVERAGE', 'Streak Formula', `E = ${effectiveCritDamage} * sum(k=1..5) ${(effectiveCritChance * 100).toFixed(0)}%^k`);

    // Calculate crit contribution to per-hit damage
    // When crit occurs, we get extra damage that also goes through armor/pierce
    const critDamVar = getAvgDamageVariance(attacker.baseDamage + effectiveCritDamage);
    const critAfterArmor = calculateArmorReduction(critDamVar, defender.armor);
    const critPierceFloor = calculatePierceFloor(critDamVar, attacker.damageType);
    const critPerHit = applyPierceMaximum(critAfterArmor, critPierceFloor);
    this.log('AVERAGE', 'Crit Per Hit (if crit)', critPerHit);

    // Weighted average: (1-p)*base + p*crit
    // But using streak formula for crit probability
    const avgPerHitPreBlock =
      basePerHit + (critPerHit - basePerHit) * effectiveCritChance;
    this.log('AVERAGE', 'Avg Per Hit Pre-Block', avgPerHitPreBlock.toFixed(2));

    // Apply expected block reduction
    // Expected damage = (1-blockChance)*damage + blockChance*(damage-blockDmg)
    // = damage - blockChance*blockDmg
    const expectedBlockReduction = effectiveBlockChance * effectiveBlockDamage;
    this.log('AVERAGE', 'Expected Block Reduction', expectedBlockReduction.toFixed(2));

    const avgPerHit = Math.max(0, avgPerHitPreBlock - expectedBlockReduction);
    this.log('AVERAGE', 'Avg Per Hit Post-Block', avgPerHit.toFixed(2));

    const average = avgPerHit * attacker.hits;
    this.log('AVERAGE', `Total (${attacker.hits} hits)`, average.toFixed(2));

    // === STEP 6: Build Result ===
    this.log('RESULT', 'Lower Bound', lowerBound);
    this.log('RESULT', 'Upper Bound', upperBound);
    this.log('RESULT', 'Average', Math.round(average));

    return {
      lowerBound,
      upperBound,
      average: Math.round(average),
      perHitAverage: avgPerHit,
      totalHits: attacker.hits,
      attackerStats: attacker,
      defenderStats: defender,
      effectiveCritChance,
      effectiveCritDamage,
      effectiveBlockChance,
      pierceRatio,
    };
  }
}

/**
 * Convenience function for quick damage calculation
 */
export function calculateDamage(
  attacker: AttackerStats,
  defender: DefenderStats,
  log: boolean = false
): DamageResult {
  const calculator = new DamageCalculator(log);
  const result = calculator.calculate(attacker, defender);
  if (log) {
    calculator.printLogs();
  }
  return result;
}
