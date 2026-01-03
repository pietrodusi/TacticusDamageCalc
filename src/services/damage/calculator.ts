/**
 * Damage Calculator for Tacticus Battle Simulation
 *
 * New Formula (simplified - single average value):
 *   DamVarMod = BaseDamage + FlatModifiers + CritBonus
 *   tempDD = MAX[(DamVarMod - Armor), (DamVarMod * PierceRatio)]
 *   perHitDamage = tempDD * GlobalMultipliers
 *   DD = perHitDamage * nrOfHits
 */

import {
  type AttackerStats,
  type DefenderStats,
  type DamageResult,
  type CalculationLog,
  type TraitModifier,
  type BuffSource,
} from './types';

import { getPierceRatio } from './damageProfileLoader';

import {
  calculateArmorReduction,
  calculatePierceFloor,
  applyPierceMaximum,
  calculateExpectedCritsWithOffset,
  calculateEffectiveCritChance,
  calculateEffectiveCritDamage,
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
   * Calculate damage with full breakdown
   *
   * New formula:
   *   DamVarMod = BaseDamage + FlatModifiers + CritBonus
   *   tempDD = MAX[(DamVarMod - Armor), (DamVarMod * PierceRatio)]
   *   perHitDamage = tempDD * GlobalMultipliers
   *   DD = perHitDamage * nrOfHits
   *
   * @param attacker - Attacker stats
   * @param defender - Defender stats
   * @returns Complete damage result
   */
  public calculate(attacker: AttackerStats, defender: DefenderStats): DamageResult {
    this.clearLogs();

    const baseDamage = attacker.baseDamage;
    let effectiveHits = attacker.hits;

    // === CAP 1: Apply Base Damage Cap ("Its Own Damage") ===
    // Caps base damage BEFORE any modifiers are applied (e.g., Galvanic Field)
    let effectiveBaseDamage = baseDamage;
    let baseDamageCapApplied: { original: number; capped: number } | undefined;

    if (attacker.damageCaps?.baseDamageCap !== undefined && baseDamage > attacker.damageCaps.baseDamageCap) {
      effectiveBaseDamage = attacker.damageCaps.baseDamageCap;
      baseDamageCapApplied = { original: baseDamage, capped: effectiveBaseDamage };
      this.log('DAMAGE_CAP', 'Base Damage Cap (Cap 1: "Its Own Damage")',
        `${baseDamage} → ${effectiveBaseDamage}`);
    }

    // === STEP 1: Calculate Flat Modifiers ===
    let flatModifiers = 0;
    const flatModifierSources: BuffSource[] = [];
    let abilityCritChanceBonus = 0;
    let abilityCritDamageBonus = 0;
    let extraHits = 0;
    let globalDamageBonus = 0;
    let armorIgnored = 0;
    let pierceRatioBonus = 0;
    const critChanceSources: BuffSource[] = [];
    const critDamageSources: BuffSource[] = [];
    const extraHitsSources: BuffSource[] = [];
    const globalDamageBonusSources: BuffSource[] = [];
    const armorIgnoredSources: BuffSource[] = [];
    const pierceRatioBonusSources: BuffSource[] = [];

    if (attacker.abilityModifiers) {
      const mods = attacker.abilityModifiers;

      // Flat damage bonus - added BEFORE armor
      if (mods.baseDamageBonus) {
        flatModifiers += mods.baseDamageBonus;
        // Track sources from buffSources with individual values
        if (mods.buffSources) {
          for (const source of mods.buffSources) {
            if (source.damageBonus && source.damageBonus > 0) {
              flatModifierSources.push({
                name: source.name,
                sourceName: source.sourceName,
                damageBonus: source.damageBonus,
              });
            }
          }
        }
        this.log('FLAT_MODIFIERS', 'Base Damage Bonus', `+${mods.baseDamageBonus}`);
      }

      // Global damage bonus - added AFTER armor/pierce (per hit)
      if (mods.globalDamageBonus) {
        globalDamageBonus += mods.globalDamageBonus;
        // Track sources from buffSources with individual values
        if (mods.buffSources) {
          for (const source of mods.buffSources) {
            if (source.globalDamageBonus && source.globalDamageBonus > 0) {
              globalDamageBonusSources.push({
                name: source.name,
                sourceName: source.sourceName,
                globalDamageBonus: source.globalDamageBonus,
              });
            }
          }
        }
        this.log('GLOBAL_BONUS', 'Global Damage Bonus (post-armor)', `+${mods.globalDamageBonus}`);
      }

      // Extra hits - track sources
      if (mods.extraHits) {
        extraHits += mods.extraHits;
        effectiveHits += mods.extraHits;
        // Track sources from buffSources with individual values
        if (mods.buffSources) {
          for (const source of mods.buffSources) {
            if (source.extraHits && source.extraHits > 0) {
              extraHitsSources.push({
                name: source.name,
                sourceName: source.sourceName,
                extraHits: source.extraHits,
              });
            }
          }
        }
        this.log('FLAT_MODIFIERS', 'Extra Hits', `+${mods.extraHits} (${attacker.hits} → ${effectiveHits})`);
      }

      // Crit chance bonus - track sources
      if (mods.critChanceBonus) {
        abilityCritChanceBonus = mods.critChanceBonus;
        // Track sources from buffSources with individual values
        if (mods.buffSources) {
          for (const source of mods.buffSources) {
            if (source.critChanceBonus && source.critChanceBonus > 0) {
              critChanceSources.push({
                name: source.name,
                sourceName: source.sourceName,
                critChanceBonus: source.critChanceBonus,
              });
            }
          }
        }
        this.log('FLAT_MODIFIERS', 'Crit Chance Bonus', `+${mods.critChanceBonus}%`);
      }

      // Crit damage bonus - track sources
      if (mods.critDamageBonus) {
        abilityCritDamageBonus = mods.critDamageBonus;
        // Track sources from buffSources with individual values
        if (mods.buffSources) {
          for (const source of mods.buffSources) {
            if (source.critDamageBonus && source.critDamageBonus > 0) {
              critDamageSources.push({
                name: source.name,
                sourceName: source.sourceName,
                critDamageBonus: source.critDamageBonus,
              });
            }
          }
        }
        this.log('FLAT_MODIFIERS', 'Crit Damage Bonus', `+${mods.critDamageBonus}`);
      }

      // Armor ignored - track sources
      if (mods.armorIgnored) {
        armorIgnored += mods.armorIgnored;
        // Track sources from buffSources with individual values
        if (mods.buffSources) {
          for (const source of mods.buffSources) {
            if (source.armorIgnored && source.armorIgnored > 0) {
              armorIgnoredSources.push({
                name: source.name,
                sourceName: source.sourceName,
                armorIgnored: source.armorIgnored,
              });
            }
          }
        }
        this.log('FLAT_MODIFIERS', 'Armor Ignored', `-${mods.armorIgnored} armor`);
      }

      // Pierce ratio bonus - track sources
      if (mods.pierceRatioBonus) {
        pierceRatioBonus += mods.pierceRatioBonus;
        // Track sources from buffSources with individual values
        if (mods.buffSources) {
          for (const source of mods.buffSources) {
            if (source.pierceRatioBonus && source.pierceRatioBonus > 0) {
              pierceRatioBonusSources.push({
                name: source.name,
                sourceName: source.sourceName,
                pierceRatioBonus: source.pierceRatioBonus,
              });
            }
          }
        }
        this.log('FLAT_MODIFIERS', 'Pierce Ratio Bonus', `+${mods.pierceRatioBonus}%`);
      }
    }

    // === STEP 2: Calculate Effective Crit Stats ===
    // Track base and bonus values for breakdown display
    const baseCritChance = attacker.critChance;  // Base crit chance from equipment (0-100)
    const baseCritDamage = attacker.critDamage;  // Base crit damage from equipment
    const critChanceTotalBonus = (attacker.critChanceBonus || 0) + abilityCritChanceBonus;
    const critDamageTotalBonus = (attacker.critDmgBonus || 0) + abilityCritDamageBonus;

    const effectiveCritChance = calculateEffectiveCritChance(
      baseCritChance,
      critChanceTotalBonus
    );
    const effectiveCritDamage = calculateEffectiveCritDamage(
      baseCritDamage,
      critDamageTotalBonus
    );

    // Calculate expected number of crits using streak formula with offset
    // critChainOffset is the number of hits from previous attacks in the crit chain
    // startIndex = offset + 1 (1-indexed, so first hit is 1, not 0)
    const critChainStartIndex = (attacker.critChainOffset ?? 0) + 1;
    const expectedCrits = attacker.ignoreCrit
      ? 0
      : calculateExpectedCritsWithOffset(effectiveCritChance, effectiveHits, critChainStartIndex);

    this.log('CRIT', 'Effective Crit Chance', `${(effectiveCritChance * 100).toFixed(1)}%`);
    this.log('CRIT', 'Effective Crit Damage', effectiveCritDamage);
    this.log('CRIT', 'Expected Crits (streak)', expectedCrits.toFixed(3));

    // Show streak formula with chain offset info
    if (critChainStartIndex > 1) {
      const endIndex = critChainStartIndex + effectiveHits - 1;
      this.log('CRIT', 'Streak Formula', `E[crits] = ${(effectiveCritChance * 100).toFixed(0)}%^${critChainStartIndex} + ... + ${(effectiveCritChance * 100).toFixed(0)}%^${endIndex} (chain: hits ${critChainStartIndex}-${endIndex})`);
    } else {
      this.log('CRIT', 'Streak Formula', `E[crits] = ${(effectiveCritChance * 100).toFixed(0)}% × (1 - ${(effectiveCritChance * 100).toFixed(0)}%^${effectiveHits}) / (1 - ${(effectiveCritChance * 100).toFixed(0)}%)`);
    }
    if (attacker.ignoreCrit) {
      this.log('CRIT', 'Ignore Crit', 'Crit not applied to damage');
    }

    // === STEP 3: Calculate DamVarMod for both paths ===
    // d0 path: non-crit hits
    const damVarMod0 = effectiveBaseDamage + flatModifiers;
    // d1 path: crit hits (add crit damage)
    const damVarMod1 = effectiveBaseDamage + flatModifiers + effectiveCritDamage;

    this.log('DAMVARMOD', 'Base Damage', effectiveBaseDamage);
    this.log('DAMVARMOD', '+ Flat Modifiers', flatModifiers);
    this.log('DAMVARMOD', '= DamVarMod (non-crit)', damVarMod0.toFixed(2));
    this.log('DAMVARMOD', '+ Crit Damage', effectiveCritDamage);
    this.log('DAMVARMOD', '= DamVarMod (crit)', damVarMod1.toFixed(2));

    // === CAP 2: Apply Pre-Armor Damage Cap ("Pre-Armour Damage") ===
    // Caps DamVarMod BEFORE armor reduction (e.g., Psychic Stalk)
    let cappedDamVarMod0 = damVarMod0;
    let cappedDamVarMod1 = damVarMod1;
    let preArmorCapApplied: {
      nonCrit: { original: number; capped: number };
      crit: { original: number; capped: number };
    } | undefined;

    if (attacker.damageCaps?.preArmorCap !== undefined) {
      const cap = attacker.damageCaps.preArmorCap;
      const nonCritCapped = damVarMod0 > cap;
      const critCapped = damVarMod1 > cap;

      if (nonCritCapped) {
        cappedDamVarMod0 = cap;
        this.log('DAMAGE_CAP', 'Pre-Armor Cap (non-crit, Cap 2: "Pre-Armour Damage")',
          `${damVarMod0.toFixed(2)} → ${cap.toFixed(2)}`);
      }

      if (critCapped) {
        cappedDamVarMod1 = cap;
        this.log('DAMAGE_CAP', 'Pre-Armor Cap (crit, Cap 2: "Pre-Armour Damage")',
          `${damVarMod1.toFixed(2)} → ${cap.toFixed(2)}`);
      }

      if (nonCritCapped || critCapped) {
        preArmorCapApplied = {
          nonCrit: { original: damVarMod0, capped: cappedDamVarMod0 },
          crit: { original: damVarMod1, capped: cappedDamVarMod1 },
        };
      }
    }

    // === STEP 4: Apply Armor/Pierce to BOTH paths ===
    const basePierceRatio = getPierceRatio(attacker.damageType);
    const effectivePierceRatio = basePierceRatio + (pierceRatioBonus / 100);

    // Calculate effective armor (reduced by armor ignored, min 0)
    const effectiveArmor = Math.max(0, defender.armor - armorIgnored);

    // Non-crit path (d0) - use capped DamVarMod
    const afterArmor0 = calculateArmorReduction(cappedDamVarMod0, effectiveArmor);
    const pierceFloor0 = calculatePierceFloor(cappedDamVarMod0, attacker.damageType, pierceRatioBonus);
    const d0 = applyPierceMaximum(afterArmor0, pierceFloor0);

    // Crit path (d1) - use capped DamVarMod
    const afterArmor1 = calculateArmorReduction(cappedDamVarMod1, effectiveArmor);
    const pierceFloor1 = calculatePierceFloor(cappedDamVarMod1, attacker.damageType, pierceRatioBonus);
    const d1 = applyPierceMaximum(afterArmor1, pierceFloor1);

    if (armorIgnored > 0) {
      this.log('ARMOR_PIERCE', 'Target Armor', defender.armor);
      this.log('ARMOR_PIERCE', 'Armor Ignored', `-${armorIgnored}`);
      this.log('ARMOR_PIERCE', 'Effective Armor', effectiveArmor);
    } else {
      this.log('ARMOR_PIERCE', 'Target Armor', defender.armor);
    }
    this.log('ARMOR_PIERCE', `Pierce Ratio (${attacker.damageType})`, `${(basePierceRatio * 100).toFixed(0)}%`);
    if (pierceRatioBonus > 0) {
      this.log('ARMOR_PIERCE', 'Pierce Ratio Bonus', `+${pierceRatioBonus}%`);
      this.log('ARMOR_PIERCE', 'Effective Pierce Ratio', `${(effectivePierceRatio * 100).toFixed(0)}%`);
    }
    this.log('ARMOR_PIERCE', 'd0 (non-crit): MAX(' + afterArmor0.toFixed(0) + ', ' + pierceFloor0 + ')', d0.toFixed(2));
    this.log('ARMOR_PIERCE', 'd1 (crit): MAX(' + afterArmor1.toFixed(0) + ', ' + pierceFloor1 + ')', d1.toFixed(2));

    // Calculate expected per-hit damage (weighted average before multipliers)
    const expectedNonCrits = effectiveHits - expectedCrits;
    const weightedPerHitBeforeMultipliers = (d0 * expectedNonCrits + d1 * expectedCrits) / effectiveHits;
    this.log('ARMOR_PIERCE', 'E[per hit] = (d0×' + expectedNonCrits.toFixed(2) + ' + d1×' + expectedCrits.toFixed(2) + ')/' + effectiveHits, weightedPerHitBeforeMultipliers.toFixed(2));

    // Legacy values for backwards compatibility
    const damVarMod = damVarMod0;  // Alias for display
    const afterArmor = afterArmor0;
    const pierceFloor = pierceFloor0;
    const afterArmorPierce = weightedPerHitBeforeMultipliers;  // Weighted average
    const critBonus = d1 - d0;  // Crit damage contribution per crit hit

    // === STEP 5: Calculate Global Multipliers ===
    // Traits are now applied AFTER armor/pierce as global multipliers
    let traitModifiers: TraitModifier[] = [];
    let traitMultiplier = 1;
    const globalMultiplierSources: BuffSource[] = [];

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
          targetTraits: defender.traits,
          abilityToggles: attacker.abilityToggles,
          fightingRetreatActive: attacker.fightingRetreatActive,
        }
      );
      traitModifiers = traitEval.modifiers;
      traitMultiplier = traitEval.totalMultiplier;

      // Log applicable traits
      for (const mod of traitModifiers) {
        if (mod.applicable && mod.damageMultiplier !== 1) {
          const bonusPercent = ((mod.damageMultiplier - 1) * 100).toFixed(0);
          const sign = mod.damageMultiplier >= 1 ? '+' : '';
          globalMultiplierSources.push({
            name: mod.traitName,
            damageMultiplier: mod.damageMultiplier,
          });
          this.log('GLOBAL_MULT', `${mod.traitName}`, `${sign}${bonusPercent}% (${mod.reason})`);
        }
      }
    }

    // Ability multiplier (baseDamageMultiplier) is also a global multiplier
    // Track sources from buffSources for proper naming
    let abilityMultiplier = 1;
    if (attacker.abilityModifiers?.baseDamageMultiplier && attacker.abilityModifiers.baseDamageMultiplier !== 1) {
      abilityMultiplier = attacker.abilityModifiers.baseDamageMultiplier;
      const bonusPercent = Math.round((abilityMultiplier - 1) * 100);

      // Use buff source names if available, otherwise use generic "Ability"
      let foundSource = false;
      if (attacker.abilityModifiers.buffSources) {
        for (const source of attacker.abilityModifiers.buffSources) {
          if (source.damageMultiplier && source.damageMultiplier !== 1) {
            globalMultiplierSources.push({
              name: source.name,
              sourceName: source.sourceName,
              damageMultiplier: source.damageMultiplier,
            });
            const srcBonusPercent = Math.round((source.damageMultiplier - 1) * 100);
            this.log('GLOBAL_MULT', source.name, `${srcBonusPercent >= 0 ? '+' : ''}${srcBonusPercent}%`);
            foundSource = true;
          }
        }
      }

      // Fallback to generic name if no source found
      if (!foundSource) {
        globalMultiplierSources.push({
          name: 'Ability',
          damageMultiplier: abilityMultiplier,
        });
        this.log('GLOBAL_MULT', 'Ability Multiplier', `${bonusPercent >= 0 ? '+' : ''}${bonusPercent}%`);
      }
    }

    const globalMultiplier = traitMultiplier * abilityMultiplier;
    this.log('GLOBAL_MULT', 'Combined Global Multiplier', `${globalMultiplier.toFixed(2)}x`);

    // === STEP 6: Calculate Per-Hit Damage ===
    // Apply global multiplier first, then add global damage bonus (post-armor flat bonus)
    const perHitBeforeBonus = afterArmorPierce * globalMultiplier;
    const perHitDamage = perHitBeforeBonus + globalDamageBonus;

    // === CAP 3: Apply Final Damage Cap ("The Hit") ===
    // Caps per-hit damage AFTER all modifiers (e.g., Astartes Banner, Master Annihilator)
    let cappedPerHitDamage = perHitDamage;
    let finalDamageCapApplied: { original: number; capped: number } | undefined;

    if (attacker.damageCaps?.finalDamageCap !== undefined && perHitDamage > attacker.damageCaps.finalDamageCap) {
      cappedPerHitDamage = attacker.damageCaps.finalDamageCap;
      finalDamageCapApplied = { original: perHitDamage, capped: cappedPerHitDamage };
      this.log('DAMAGE_CAP', 'Final Damage Cap (Cap 3: "The Hit")',
        `${perHitDamage.toFixed(2)} → ${cappedPerHitDamage.toFixed(2)}`);
    }

    if (globalDamageBonus > 0) {
      this.log('GLOBAL_BONUS', 'After Multiplier', perHitBeforeBonus.toFixed(2));
      this.log('GLOBAL_BONUS', '+ Global Damage Bonus', `+${globalDamageBonus}`);
    }
    this.log('RESULT', 'Per Hit Damage', cappedPerHitDamage.toFixed(2));

    // === STEP 7: Calculate Total Damage ===
    const totalDamage = calculateTotalDamage(cappedPerHitDamage, effectiveHits);
    const damage = Math.round(totalDamage);

    this.log('RESULT', `Total (${effectiveHits} hits)`, damage);

    // === Build Result ===
    return {
      damage,
      perHitDamage: cappedPerHitDamage,
      totalHits: effectiveHits,

      // Calculation breakdown for Battle Log
      baseDamage,
      flatModifiers,
      flatModifierSources,
      extraHits,
      extraHitsSources,
      critChanceSources,
      critDamageSources,

      // Non-crit path (d0)
      damVarMod0,
      afterArmor0,
      pierceFloor0,
      d0,

      // Crit path (d1)
      damVarMod1,
      afterArmor1,
      pierceFloor1,
      d1,

      // Expected crits
      expectedCrits,
      expectedCritsStartIndex: critChainStartIndex,

      // Legacy fields for backwards compatibility
      critBonus,
      damVarMod,
      afterArmor,
      pierceFloor,
      afterArmorPierce,

      globalMultiplier,
      globalMultiplierSources,
      globalDamageBonus,
      globalDamageBonusSources,
      armorIgnored,
      armorIgnoredSources,
      effectiveArmor,
      pierceRatioBonus,
      pierceRatioBonusSources,

      // Stats
      attackerStats: attacker,
      defenderStats: defender,

      // Crit breakdown values
      baseCritChance,
      baseCritDamage,
      critChanceTotalBonus,
      critDamageTotalBonus,
      effectiveCritChance,
      effectiveCritDamage,
      pierceRatio: basePierceRatio,
      effectivePierceRatio,
      traitModifiers,
      traitMultiplier,

      // Damage caps applied
      capsApplied: (baseDamageCapApplied || preArmorCapApplied || finalDamageCapApplied)
        ? {
            baseDamageCap: baseDamageCapApplied,
            preArmorCap: preArmorCapApplied,
            finalDamageCap: finalDamageCapApplied,
          }
        : undefined,
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
