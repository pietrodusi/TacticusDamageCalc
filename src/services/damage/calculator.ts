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
  type TraitModifier,
  type BuffSource,
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

import { evaluateTraitModifiers } from './traits';

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
   * Format DamVar with variance applied
   */
  private formatDamVarWithVariance(
    baseDamage: number,
    traitModifiers: TraitModifier[],
    buffSources: BuffSource[],
    varianceMultiplier: number,
    finalDamVar: number
  ): string {
    const parts: string[] = [`${baseDamage} (Base)`];

    for (const mod of traitModifiers) {
      if (mod.applicable && mod.damageMultiplier !== 1) {
        const bonusAmount = Math.round(baseDamage * (mod.damageMultiplier - 1));
        const sign = bonusAmount >= 0 ? '+' : '';
        parts.push(`${sign} ${Math.abs(bonusAmount)} (${mod.traitName})`);
      }
    }

    // Add buff sources (auras from teammates)
    for (const buff of buffSources) {
      if (buff.damageBonus && buff.damageBonus > 0) {
        parts.push(`+ ${buff.damageBonus} (${buff.name})`);
      }
    }

    const varianceLabel = varianceMultiplier === 1 ? '' : ` × ${varianceMultiplier}`;
    return `${parts.join(' ')}${varianceLabel} = ${finalDamVar}`;
  }

  /**
   * Format DamVar with variance and crit damage applied (for upper bound)
   */
  private formatDamVarWithVarianceAndCrit(
    baseDamage: number,
    traitModifiers: TraitModifier[],
    buffSources: BuffSource[],
    critDamage: number,
    varianceMultiplier: number,
    finalDamVar: number
  ): string {
    const parts: string[] = [`${baseDamage} (Base)`];

    for (const mod of traitModifiers) {
      if (mod.applicable && mod.damageMultiplier !== 1) {
        const bonusAmount = Math.round(baseDamage * (mod.damageMultiplier - 1));
        const sign = bonusAmount >= 0 ? '+' : '';
        parts.push(`${sign} ${Math.abs(bonusAmount)} (${mod.traitName})`);
      }
    }

    // Add buff sources (auras from teammates)
    for (const buff of buffSources) {
      if (buff.damageBonus && buff.damageBonus > 0) {
        parts.push(`+ ${buff.damageBonus} (${buff.name})`);
      }
    }

    if (critDamage > 0) {
      parts.push(`+ ${critDamage} (Crit)`);
    }

    const varianceLabel = varianceMultiplier === 1 ? '' : ` × ${varianceMultiplier}`;
    return `${parts.join(' ')}${varianceLabel} = ${finalDamVar}`;
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

    // === STEP 0: Evaluate Trait Modifiers ===
    let traitModifiers: TraitModifier[] = [];
    let traitMultiplier = 1;

    if (attacker.traits && attacker.traits.length > 0 && attacker.attackType) {
      const traitEval = evaluateTraitModifiers(
        attacker.traits,
        {
          attackType: attacker.attackType,
          hasMoved: attacker.hasMoved ?? false,
          hasAttackedThisBattle: attacker.hasAttackedThisBattle ?? false,
          attacksThisTurn: attacker.attacksThisTurn ?? 0,
          firstAttackTurn: attacker.firstAttackTurn,
          currentTurn: attacker.currentTurn,
        }
      );
      traitModifiers = traitEval.modifiers;
      traitMultiplier = traitEval.totalMultiplier;

      // Log trait modifiers
      this.log('TRAITS', 'Character Traits', attacker.traits.join(', '));
      this.log('TRAITS', 'Attack Type', attacker.attackType);
      this.log('TRAITS', 'Has Moved', attacker.hasMoved ? 'Yes' : 'No');

      for (const mod of traitModifiers) {
        if (mod.applicable) {
          const bonusPercent = ((mod.damageMultiplier - 1) * 100).toFixed(0);
          const sign = mod.damageMultiplier >= 1 ? '+' : '';
          this.log('TRAITS', `${mod.traitName}`, `${sign}${bonusPercent}% (${mod.reason})`);
        } else {
          this.log('TRAITS', `${mod.traitName}`, `Not applied: ${mod.reason}`);
        }
      }

      this.log('TRAITS', 'Combined Trait Multiplier', `${traitMultiplier.toFixed(2)}x`);
    }

    // Apply trait multiplier to base damage
    let effectiveBaseDamage = Math.round(attacker.baseDamage * traitMultiplier);

    // === STEP 0.5: Apply Ability Modifiers ===
    let effectiveHits = attacker.hits;
    let abilityCritChanceBonus = 0;
    let abilityCritDamageBonus = 0;

    if (attacker.abilityModifiers) {
      const mods = attacker.abilityModifiers;

      // Apply base damage bonus (flat)
      if (mods.baseDamageBonus) {
        const newDamage = effectiveBaseDamage + mods.baseDamageBonus;
        this.log('ABILITIES', 'Base Damage Bonus', `+${mods.baseDamageBonus} (${effectiveBaseDamage} → ${newDamage})`);
        effectiveBaseDamage = newDamage;
      }

      // Apply base damage multiplier (percentage)
      if (mods.baseDamageMultiplier && mods.baseDamageMultiplier !== 1) {
        const newDamage = Math.round(effectiveBaseDamage * mods.baseDamageMultiplier);
        const bonusPercent = Math.round((mods.baseDamageMultiplier - 1) * 100);
        this.log('ABILITIES', 'Base Damage Multiplier', `${bonusPercent >= 0 ? '+' : ''}${bonusPercent}% (${effectiveBaseDamage} → ${newDamage})`);
        effectiveBaseDamage = newDamage;
      }

      // Apply extra hits
      if (mods.extraHits) {
        const newHits = effectiveHits + mods.extraHits;
        this.log('ABILITIES', 'Extra Hits', `+${mods.extraHits} (${effectiveHits} → ${newHits})`);
        effectiveHits = newHits;
      }

      // Store crit bonuses to apply later
      if (mods.critChanceBonus) {
        abilityCritChanceBonus = mods.critChanceBonus;
        this.log('ABILITIES', 'Crit Chance Bonus', `+${mods.critChanceBonus}%`);
      }

      if (mods.critDamageBonus) {
        abilityCritDamageBonus = mods.critDamageBonus;
        this.log('ABILITIES', 'Crit Damage Bonus', `+${mods.critDamageBonus}`);
      }
    }

    // Extract buff sources for display in DamVar breakdown
    const buffSources: BuffSource[] = attacker.abilityModifiers?.buffSources || [];

    // === STEP 1: Log Input Stats ===
    this.log('INPUT', 'Attacker Base Damage', attacker.baseDamage);
    if (traitMultiplier !== 1) {
      this.log('INPUT', 'Effective Base Damage (after traits)', effectiveBaseDamage);
    }
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
      (attacker.critChanceBonus || 0) + abilityCritChanceBonus
    );
    const effectiveCritDamage = calculateEffectiveCritDamage(
      attacker.critDamage,
      (attacker.critDmgBonus || 0) + abilityCritDamageBonus
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

    const minDamVar = getMinDamageVariance(effectiveBaseDamage);
    const minDamVarBreakdown = this.formatDamVarWithVariance(
      attacker.baseDamage,
      traitModifiers,
      buffSources,
      DAMAGE_VARIANCE.MIN_MULTIPLIER,
      minDamVar
    );
    this.log('LOWER_BOUND', 'Damage Variance (DamVar)', minDamVarBreakdown);

    const minAfterArmor = calculateArmorReduction(minDamVar, defender.armor);
    this.log('LOWER_BOUND', 'After Armor (DamVar - Armor)', minAfterArmor);

    const minPierceFloor = calculatePierceFloor(minDamVar, attacker.damageType);
    this.log('LOWER_BOUND', 'Pierce Floor (DamVar * Pierce)', minPierceFloor);

    const minPerHit = applyPierceMaximum(minAfterArmor, minPierceFloor);
    this.log('LOWER_BOUND', 'Per Hit = MAX(afterArmor, pierceFloor)', minPerHit);

    // Apply block to lower bound (assume all hits blocked)
    const minPerHitBlocked = calculateBlockReduction(minPerHit, effectiveBlockDamage);
    this.log('LOWER_BOUND', 'Per Hit After Block', minPerHitBlocked);

    const lowerBound = calculateTotalDamage(minPerHitBlocked, effectiveHits);
    this.log('LOWER_BOUND', `Total (${effectiveHits} hits)`, lowerBound);

    // === STEP 4: Calculate Upper Bound ===
    // Upper bound: Max variance, all crits, no blocks
    this.log('UPPER_BOUND', 'Variance Multiplier', `${DAMAGE_VARIANCE.MAX_MULTIPLIER} (+20%)`);

    const critBaseDamage = calculateCritBaseDamage(effectiveBaseDamage, effectiveCritDamage);
    this.log('UPPER_BOUND', 'Crit Base Damage (base + critDmg)', critBaseDamage);

    const maxDamVar = getMaxDamageVariance(critBaseDamage);
    const maxDamVarBreakdown = this.formatDamVarWithVarianceAndCrit(
      attacker.baseDamage,
      traitModifiers,
      buffSources,
      effectiveCritDamage,
      DAMAGE_VARIANCE.MAX_MULTIPLIER,
      maxDamVar
    );
    this.log('UPPER_BOUND', 'Damage Variance (DamVar)', maxDamVarBreakdown);

    const maxAfterArmor = calculateArmorReduction(maxDamVar, defender.armor);
    this.log('UPPER_BOUND', 'After Armor (DamVar - Armor)', maxAfterArmor);

    const maxPierceFloor = calculatePierceFloor(maxDamVar, attacker.damageType);
    this.log('UPPER_BOUND', 'Pierce Floor (DamVar * Pierce)', maxPierceFloor);

    const maxPerHit = applyPierceMaximum(maxAfterArmor, maxPierceFloor);
    this.log('UPPER_BOUND', 'Per Hit = MAX(afterArmor, pierceFloor)', maxPerHit);

    const upperBound = calculateTotalDamage(maxPerHit, effectiveHits);
    this.log('UPPER_BOUND', `Total (${effectiveHits} hits)`, upperBound);

    // === STEP 5: Calculate Average ===
    // Average: No variance, streak-based crit, probability-weighted block
    this.log('AVERAGE', 'Variance Multiplier', `${DAMAGE_VARIANCE.AVG_MULTIPLIER} (0%)`);

    // Base damage per hit (no crit)
    const avgDamVar = getAvgDamageVariance(effectiveBaseDamage);
    const avgDamVarBreakdown = this.formatDamVarWithVariance(
      attacker.baseDamage,
      traitModifiers,
      buffSources,
      DAMAGE_VARIANCE.AVG_MULTIPLIER,
      avgDamVar
    );
    this.log('AVERAGE', 'Base Damage Variance', avgDamVarBreakdown);

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
    const critDamVar = getAvgDamageVariance(effectiveBaseDamage + effectiveCritDamage);
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

    const average = avgPerHit * effectiveHits;
    this.log('AVERAGE', `Total (${effectiveHits} hits)`, average.toFixed(2));

    // === STEP 6: Build Result ===
    this.log('RESULT', 'Lower Bound', lowerBound);
    this.log('RESULT', 'Upper Bound', upperBound);
    this.log('RESULT', 'Average', Math.round(average));

    return {
      lowerBound,
      upperBound,
      average: Math.round(average),
      perHitAverage: avgPerHit,
      totalHits: effectiveHits,
      attackerStats: attacker,
      defenderStats: defender,
      effectiveCritChance,
      effectiveCritDamage,
      effectiveBlockChance,
      pierceRatio,
      traitModifiers,
      traitMultiplier,
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
