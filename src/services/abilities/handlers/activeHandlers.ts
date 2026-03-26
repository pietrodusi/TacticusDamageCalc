/**
 * Active Ability Handlers
 * Handlers for active abilities that can be used during battle
 */

import type { AbilityHandler, ComputedAbilityValues, AbilityContext, ActiveAbilityResult, DamageComponent } from '../types';
import type { DamageType } from '../../../types';
import { getAbilityNameSync } from '../abilityDataLoader';

// Helper to check if a toggle is active (handles boolean and number values)
const isToggleActive = (value: boolean | number | undefined): boolean => value === true;

/**
 * WarHowl (Ragnar)
 * Buff that grants extra crit chance and flat damage
 * Variables: extraCritChance, extraDmg
 * Note: extraDmgPct and maxDmg are not used (they're not part of the ability effect)
 */
export const WarHowlHandler: AbilityHandler = {
  abilityId: 'WarHowl',
  abilityName: 'War Howl',
  category: 'buff',
  cooldown: -1, // One-time use per battle
  endsTurn: false, // Buff ability - allows continued actions

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('WarHowl');

    return {
      abilityId: 'WarHowl',
      abilityName,
      category: 'buff',
      buffResult: {
        effect: {
          critChanceBonus: values.extraCritChance as number || 0,
          baseDamageBonus: values.extraDmg as number || 0,
        },
        duration: 1, // Lasts until end of turn
      },
      message: abilityName,
    };
  },
};

/**
 * TheQuickening (Mephiston)
 * Target a friendly Blood Angels character to perform an additional melee attack
 * dealing dmgPct% of their own damage, capped at maxDmg
 * Variables: maxDmg, dmgPct
 * Constants: range: 2
 * Note: Actual target selection and attack execution handled in CalculatorPage
 */
export const TheQuickeningHandler: AbilityHandler = {
  abilityId: 'TheQuickening',
  abilityName: 'The Quickening',
  category: 'buff',  // Uses target selection modal
  cooldown: -1,
  endsTurn: true,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('TheQuickening');
    const dmgPct = values.dmgPct as number || 100;
    const maxDmg = values.maxDmg as number || 0;

    return {
      abilityId: 'TheQuickening',
      abilityName,
      category: 'buff',
      message: `${abilityName}: Target Blood Angels attacks at ${dmgPct}% damage (max ${maxDmg})`,
    };
  },
};

/**
 * BloodChalice (Nicodemus)
 * Select friendly non-mechanical units to grant +extraPierceRatio% pierce ratio with melee attacks for this turn
 * Variables: extraPierceRatio, hpToHeal
 * Constants: healthPct: 50
 * Note: Target selection handled in CalculatorPage via BloodChaliceModal
 */
export const BloodChaliceHandler: AbilityHandler = {
  abilityId: 'BloodChalice',
  abilityName: 'Blood Chalice',
  category: 'buff',
  cooldown: -1,
  endsTurn: true,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('BloodChalice');
    const extraPierceRatio = values.extraPierceRatio as number || 0;

    return {
      abilityId: 'BloodChalice',
      abilityName,
      category: 'buff',
      message: `${abilityName}: Grants +${extraPierceRatio}% pierce ratio to selected units`,
    };
  },
};

/**
 * Executioner (Eldryon)
 * Ranged Psychic damage attack that scales with turn count
 * Deals average of (minDmg + maxDmg) / 2 multiplied by the current turn number
 * Variables: minDmg, maxDmg
 * Constants: range: 2
 */
export const ExecutionerHandler: AbilityHandler = {
  abilityId: 'Executioner',
  abilityName: 'Executioner',
  category: 'damage',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('Executioner');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const baseAvgDmg = (minDmg + maxDmg) / 2;

    // Damage scales with the number of turns that have started
    const turnMultiplier = context.currentTurn || 1;
    const scaledAvgDmg = Math.round(baseAvgDmg * turnMultiplier);

    return {
      abilityId: 'Executioner',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: Math.round(minDmg * turnMultiplier),
        maxDamage: Math.round(maxDmg * turnMultiplier),
        averageDamage: scaledAvgDmg,
        hits: 1,
        damageProfile: 'Psychic' as DamageType,
      },
      message: `${abilityName} (Turn ${turnMultiplier})`,
    };
  },
};

/**
 * GauntletsOfUltramar (Calgar)
 * Ranged Bolter damage attack
 * +1 hit when adjacent to boss
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Bolter, nrOfHits: 1
 */
export const GauntletsOfUltramarHandler: AbilityHandler = {
  abilityId: 'GauntletsOfUltramar',
  abilityName: 'Gauntlets of Ultramar',
  category: 'damage',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('GauntletsOfUltramar');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const baseHits = values.nrOfHits as number || 1;

    // +1 hit when adjacent to boss
    const isAdjacentToBoss = context.abilityToggles?.['adjacentToBoss'] ?? false;
    const hits = isAdjacentToBoss ? baseHits + 1 : baseHits;

    return {
      abilityId: 'GauntletsOfUltramar',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg,  // Per-hit damage, not total (hits applied in calculator)
        hits,
        damageProfile: (values.damageProfile as DamageType) || 'Bolter',
      },
      attackType: 'ranged',
      message: isAdjacentToBoss ? `${abilityName} (+1 hit adjacent)` : abilityName,
    };
  },
};

/**
 * DeathFromAbove (Various)
 * Summons an Inceptor unit
 * Variables: summonHp, summonDmg, summonArmor
 * Constants: unitToSpawn: ultraSmnInceptor
 */
export const DeathFromAboveHandler: AbilityHandler = {
  abilityId: 'DeathFromAbove',
  abilityName: 'Death From Above',
  category: 'summon',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('DeathFromAbove');

    return {
      abilityId: 'DeathFromAbove',
      abilityName,
      category: 'summon',
      summonResult: {
        unitId: (values.unitToSpawn as string) || 'ultraSmnInceptor',
        hp: values.summonHp as number || 0,
        damage: values.summonDmg as number || 0,
        armor: values.summonArmor as number || 0,
      },
      message: abilityName,
    };
  },
};

/**
 * MortisRound (Certus)
 * Ranged HeavyRound damage attack with 1 hit
 * Note: Heavy Weapon trait applies double to this ability (handled in damage calculation)
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: HeavyRound
 */
export const MortisRoundHandler: AbilityHandler = {
  abilityId: 'MortisRound',
  abilityName: 'Mortis Round',
  category: 'damage',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('MortisRound');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);

    return {
      abilityId: 'MortisRound',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg,
        hits: 1,  // Fixed 1 hit
        damageProfile: (values.damageProfile as DamageType) || 'HeavyRound',
      },
      attackType: 'ranged',  // Ranged ability
      message: abilityName,
    };
  },
};

/**
 * MacroPlasmaIncinerator (Galatian)
 * Ranged Plasma damage attack with 3 hits
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Plasma, nrOfHits: 3
 */
export const MacroPlasmaIncineratorHandler: AbilityHandler = {
  abilityId: 'MacroPlasmaIncinerator',
  abilityName: 'Macro Plasma Incinerator',
  category: 'damage',
  cooldown: 1,  // Initial cooldown 1 turn

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('MacroPlasmaIncinerator');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const hits = values.nrOfHits as number || 3;

    return {
      abilityId: 'MacroPlasmaIncinerator',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg,
        hits,
        damageProfile: (values.damageProfile as DamageType) || 'Plasma',
      },
      attackType: 'ranged',
      message: abilityName,
    };
  },
};

/**
 * DutyEternal (Galatian)
 * Summons a Redemptor Dreadnought
 * Variables: summonHp, summonDmg, summonArmor
 * Constants: unitId: ultraSmnDreadnought, initialCooldownTurns: 2
 */
export const DutyEternalHandler: AbilityHandler = {
  abilityId: 'DutyEternal',
  abilityName: 'Duty Eternal',
  category: 'summon',
  cooldown: 2,  // Initial cooldown 2 turns

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('DutyEternal');

    return {
      abilityId: 'DutyEternal',
      abilityName,
      category: 'summon',
      summonResult: {
        unitId: (values.unitId as string) || 'ultraSmnDreadnought',
        hp: values.summonHp as number || 0,
        damage: values.summonDmg as number || 0,
        armor: values.summonArmor as number || 0,
      },
      message: abilityName,
    };
  },
};

/**
 * StormOfWrath (Tigurius)
 * Ranged Psychic damage attack with 1 hit
 * Raw damage - ignores attacker bonuses and can't crit
 * Variables: minDmg, maxDmg, maxAdjacentTargets
 * Constants: damageProfile: Psychic
 */
export const StormOfWrathHandler: AbilityHandler = {
  abilityId: 'StormOfWrath',
  abilityName: 'Storm Of Wrath',
  category: 'damage',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('StormOfWrath');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);

    return {
      abilityId: 'StormOfWrath',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg,
        hits: 1,
        damageProfile: (values.damageProfile as DamageType) || 'Psychic',
      },
      rawDamage: true,  // Ignores attacker bonuses and can't crit
      attackType: 'ranged',
      message: abilityName,
    };
  },
};

/**
 * TacticalPrecision (Titus)
 * Melee ability with damage based on Charging toggle:
 * - Charging: 1x Bolter (minDmg, maxDmg) with 100% crit chance and +extraCritDmg
 * - Not Charging: 3x Chain (minDmg_2, maxDmg_2)
 * Variables: minDmg, maxDmg, minDmg_2, maxDmg_2, extraCritDmg
 */
export const TacticalPrecisionHandler: AbilityHandler = {
  abilityId: 'TacticalPrecision',
  abilityName: 'Tactical Precision',
  category: 'damage',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('TacticalPrecision');
    const isCharging = context.abilityToggles?.['TacticalPrecision_charging'] ?? false;

    if (isCharging) {
      // Charging: 1x Bolter with 100% crit chance and +extraCritDmg
      const minDmg = values.minDmg as number || 0;
      const maxDmg = values.maxDmg as number || 0;
      const avgDmg = Math.round((minDmg + maxDmg) / 2);
      const extraCritDmg = values.extraCritDmg as number || 0;

      return {
        abilityId: 'TacticalPrecision',
        abilityName,
        category: 'damage',
        damageResult: {
          minDamage: minDmg,
          maxDamage: maxDmg,
          averageDamage: avgDmg,
          hits: 1,
          damageProfile: (values.damageProfile as DamageType) || 'Bolter',
        },
        abilityModifiers: {
          critChanceBonus: 100,  // 100% crit chance
          critDamageBonus: extraCritDmg,
        },
        attackType: 'melee',
        message: `${abilityName} (Charging)`,
      };
    } else {
      // Not Charging: 3x Chain
      const minDmg2 = values.minDmg_2 as number || 0;
      const maxDmg2 = values.maxDmg_2 as number || 0;
      const avgDmg2 = Math.round((minDmg2 + maxDmg2) / 2);
      const hits2 = values.nrOfHits_2 as number || 3;

      return {
        abilityId: 'TacticalPrecision',
        abilityName,
        category: 'damage',
        damageResult: {
          minDamage: minDmg2,
          maxDamage: maxDmg2,
          averageDamage: avgDmg2,
          hits: hits2,
          damageProfile: (values.damageProfile_2 as DamageType) || 'Chain',
        },
        attackType: 'melee',
        message: abilityName,
      };
    }
  },
};

/**
 * BlackRage (Lucien)
 * Buff ability that grants +extraDmg damage when charging (normal and special attacks)
 * Sets HP to hpPct% and grants +1 movement
 * Requires "Charging" toggle to apply damage bonus (via buff template condition)
 * Variables: extraDmg, hpPct
 * Does not end turn
 */
export const BlackRageHandler: AbilityHandler = {
  abilityId: 'BlackRage',
  abilityName: 'Black Rage',
  category: 'buff',
  cooldown: -1,
  endsTurn: false,  // Buff abilities don't end turn

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('BlackRage');
    const extraDmg = values.extraDmg as number || 0;

    // Black Rage activates and adds a buff to the pool
    // The buff template's customEvaluator checks the Charging toggle
    // Damage bonus only applies when charging
    return {
      abilityId: 'BlackRage',
      abilityName,
      category: 'buff',
      buffResult: {
        effect: {
          baseDamageBonus: extraDmg,  // Stored in buff, applied via buff template condition
        },
        duration: -1,  // Lasts rest of battle
      },
      message: `${abilityName}: +${extraDmg} damage when charging`,
    };
  },
};

/**
 * HammerOfWrath (Mataneo)
 * Deals 2x minDmg-maxDmg Power damage to the boss.
 * This ability ignores all bonuses/modifiers and cannot crit.
 * Low HP toggle (≤50%): deals 2x damage.
 * Variables: minDmg, maxDmg
 * Constants: nrOfHits: 2, healthPct: 50
 */
export const HammerOfWrathHandler: AbilityHandler = {
  abilityId: 'HammerOfWrath',
  abilityName: 'Hammer of Wrath',
  category: 'damage',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('HammerOfWrath');

    // Base damage: 2x Power
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const hits = values.nrOfHits as number || 2;
    const healthPct = values.healthPct as number || 50;

    // Check Low HP toggle for 2x damage
    const isLowHp = isToggleActive(context.abilityToggles['HammerOfWrath_lowHealth']);
    const damageMultiplier = isLowHp ? 2 : 1;

    // Apply multiplier to damage (since rawDamage bypasses all other modifiers)
    const effectiveMinDmg = minDmg * damageMultiplier;
    const effectiveMaxDmg = maxDmg * damageMultiplier;
    const avgDmg = Math.round((effectiveMinDmg + effectiveMaxDmg) / 2);

    const multiplierText = isLowHp ? ` (2x from Low HP ≤${healthPct}%)` : '';

    return {
      abilityId: 'HammerOfWrath',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: effectiveMinDmg,
        maxDamage: effectiveMaxDmg,
        averageDamage: avgDmg,
        hits,
        damageProfile: (values.damageProfile as DamageType) || 'Power',
      },
      rawDamage: true,  // Ignores all bonuses/modifiers and cannot crit
      attackType: 'melee',
      message: `${abilityName}${multiplierText}`,
    };
  },
};

/**
 * AberrantHypermorph (Genestealer)
 * Summons an Aberrant Hypermorph
 * Variables: summonHp, summonDmg, summonArmor
 */
export const AberrantHypermorphHandler: AbilityHandler = {
  abilityId: 'AberrantHypermorph',
  abilityName: 'Aberrant Hypermorph',
  category: 'summon',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('AberrantHypermorph');

    return {
      abilityId: 'AberrantHypermorph',
      abilityName,
      category: 'summon',
      summonResult: {
        unitId: (values.unitId as string) || 'genesSmnAberrant',
        hp: values.summonHp as number || 0,
        damage: values.summonDmg as number || 0,
        armor: values.summonArmor as number || 0,
      },
      message: abilityName,
    };
  },
};

/**
 * MartialInspiration (Kariyan)
 * Melee Eviscerate damage attack with 3 hits
 * Gets +33% damage per turn the character has attacked (from LegacyOfCombat synergy)
 * The multiplier is shown as a Global buff in the damage breakdown
 * Also triggers LegacyOfCombat follow-up attack
 * Variables: minDmg, maxDmg, extraDmgPct (% of enemy max HP as bonus damage)
 * Constants: damageProfile: Eviscerate, nrOfHits: 3, cooldownTurns: 2
 */
export const MartialInspirationHandler: AbilityHandler = {
  abilityId: 'MartialInspiration',
  abilityName: 'Martial Inspiration',
  category: 'damage',
  cooldown: 2,

  executeActive: (values: ComputedAbilityValues, context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('MartialInspiration');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const hits = values.nrOfHits as number || 3;

    // Calculate +33% per attack turn bonus (same as LegacyOfCombat)
    // This is now passed as a global multiplier for proper display
    const basePercentage = 33;
    const attackTurns = context.attackTurnsCount;
    const damageMultiplier = 1 + (attackTurns * basePercentage / 100);

    // Use base damage (multiplier applied via globalMultiplier in calculator)
    const avgDmg = Math.round((minDmg + maxDmg) / 2);

    // Note: extraDmgPct adds % of enemy max HP as damage, which we can't calculate here
    // This would need to be applied during damage calculation if we know the boss HP

    return {
      abilityId: 'MartialInspiration',
      abilityName,
      category: 'damage',
      // Pass multiplier info for Global buff display (only if there are stacks)
      globalMultiplier: attackTurns > 0 ? {
        multiplier: damageMultiplier,
        basePercentage,
        stacks: attackTurns,
        sourceName: abilityName,
      } : undefined,
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg,  // Per-hit damage, not total (hits applied in calculator)
        hits,
        damageProfile: 'Eviscerate' as DamageType,
      },
      message: `${abilityName}`,
    };
  },
};

/**
 * KillMaimBurn (Kharn)
 * Multi-part melee attack with 3 damage components, all hitting the same target:
 * 1. Piercing: 1 hit (minDmg/maxDmg)
 * 2. Eviscerate: 6 hits (minDmg_2/maxDmg_2)
 * 3. Plasma: 1 hit (minDmg_3/maxDmg_3)
 * Constants: nrOfHits: 1, damageProfile: Piercing, nrOfHits_2: 6, damageProfile_2: Eviscerate,
 *            nrOfHits_3: 1, damageProfile_3: Plasma, range: 2
 */
export const KillMaimBurnHandler: AbilityHandler = {
  abilityId: 'KillMaimBurn',
  abilityName: 'Kill! Maim! Burn!',
  category: 'damage',
  cooldown: -1,  // One-time use per battle

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('KillMaimBurn');

    // Component 1: Piercing (1 hit)
    const piercing: DamageComponent = {
      minDamage: values.minDmg as number || 0,
      maxDamage: values.maxDmg as number || 0,
      averageDamage: Math.round(((values.minDmg as number || 0) + (values.maxDmg as number || 0)) / 2),
      hits: values.nrOfHits as number || 1,
      damageProfile: 'Piercing' as DamageType,
    };

    // Component 2: Eviscerate (6 hits)
    const eviscerate: DamageComponent = {
      minDamage: values.minDmg_2 as number || 0,
      maxDamage: values.maxDmg_2 as number || 0,
      averageDamage: Math.round(((values.minDmg_2 as number || 0) + (values.maxDmg_2 as number || 0)) / 2),
      hits: values.nrOfHits_2 as number || 6,
      damageProfile: 'Eviscerate' as DamageType,
    };

    // Component 3: Plasma (1 hit)
    const plasma: DamageComponent = {
      minDamage: values.minDmg_3 as number || 0,
      maxDamage: values.maxDmg_3 as number || 0,
      averageDamage: Math.round(((values.minDmg_3 as number || 0) + (values.maxDmg_3 as number || 0)) / 2),
      hits: values.nrOfHits_3 as number || 1,
      damageProfile: 'Plasma' as DamageType,
    };

    const damageComponents = [piercing, eviscerate, plasma];

    return {
      abilityId: 'KillMaimBurn',
      abilityName,
      category: 'damage',
      damageComponents,
      message: abilityName,
    };
  },
};

/**
 * MomentShackle (Trajann)
 * Healing and block buff ability (damage component disregarded for Guild Raid)
 * Variables: hpToHeal, blockChance, blockDmg
 * Provides: Healing + increased block chance and block damage for the turn
 */
export const MomentShackleHandler: AbilityHandler = {
  abilityId: 'MomentShackle',
  abilityName: 'Moment Shackle',
  category: 'healing',
  cooldown: -1,  // One-time use per battle

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('MomentShackle');
    const hpToHeal = values.hpToHeal as number || 0;

    return {
      abilityId: 'MomentShackle',
      abilityName,
      category: 'healing',
      healingResult: {
        amount: hpToHeal,
      },
      buffResult: {
        effect: {
          // Block stats are defensive, not damage modifiers
        },
        duration: 1,
      },
      message: abilityName,
    };
  },
};

/**
 * LightOfSanguinius (Dante)
 * Special melee attack with Melta damage
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Melta, nrOfHits: 5
 */
export const LightOfSanguiniusHandler: AbilityHandler = {
  abilityId: 'LightOfSanguinius',
  abilityName: 'Light of Sanguinius',
  category: 'damage',
  cooldown: -1,  // One-time use

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('LightOfSanguinius');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const hits = values.nrOfHits as number || 5;

    const avgDmg = Math.round((minDmg + maxDmg) / 2);

    return {
      abilityId: 'LightOfSanguinius',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg,
        hits,
        damageProfile: 'Melta' as DamageType,
      },
      message: abilityName,
    };
  },
};

/**
 * EuphoricStrikes (Laviscus)
 * Deals Power damage and grants +crit chance to next attack by ANY team member
 * Variables: minDmg, maxDmg, extraCritChance
 * Constants: damageProfile: Power, nrOfHits: 1
 * Special: Does NOT end Laviscus' turn (endsTurn: false)
 */
export const EuphoricStrikesHandler: AbilityHandler = {
  abilityId: 'EuphoricStrikes',
  abilityName: 'Euphoric Strikes',
  category: 'damage',
  cooldown: -1,  // One-time use
  endsTurn: false,  // Laviscus can still attack after

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('EuphoricStrikes');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const hits = values.nrOfHits as number || 1;
    const extraCritChance = values.extraCritChance as number || 0;

    const avgDmg = Math.round((minDmg + maxDmg) / 2);

    return {
      abilityId: 'EuphoricStrikes',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg,
        hits,
        damageProfile: 'Power' as DamageType,
      },
      // Buff for next attack by any team member
      buffResult: {
        effect: {
          critChanceBonus: extraCritChance,
        },
        duration: 1,
      },
      message: abilityName,
    };
  },
};

/**
 * Drachnyen (Abaddon)
 * Sets Abaddon's HP to a specific value, performs immediate normal melee attack,
 * and grants permanent follow-up attack after each normal melee for rest of battle.
 * Variables: minDmg, maxDmg (for follow-up attack), hp (health to set)
 * Constants: damageProfile: Piercing, nrOfHits: 3
 * Special: Does NOT end turn - triggers normal attack, then enables permanent follow-up
 */
export const DrachnyenHandler: AbilityHandler = {
  abilityId: 'Drachnyen',
  abilityName: "Drach'nyen",
  category: 'buff',  // Primary effect is granting permanent follow-up
  cooldown: -1,  // One-time use
  endsTurn: false,  // The ability triggers a normal attack, doesn't end turn itself

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('Drachnyen');
    const hp = values.hp as number || 0;
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const hits = values.nrOfHits as number || 3;

    return {
      abilityId: 'Drachnyen',
      abilityName,
      category: 'buff',
      // HP modification and follow-up buff info - battleStore handles the actual effects
      healingResult: {
        amount: hp,  // This represents the HP to SET TO (not heal amount)
      },
      // Store follow-up attack info in buff result
      buffResult: {
        effect: {
          // Custom marker - battleStore checks for drachnyenActive flag
        },
        duration: -1,  // Permanent for rest of battle
      },
      // Include damage info for the follow-up attack in the message
      message: `${abilityName}: HP → ${hp}, follow-up ${hits}x Piercing (${minDmg}-${maxDmg})`,
    };
  },
};

/**
 * ExemplarOfTheMontka (Farsight)
 * Team-wide buff that grants damage bonus to all friendly ranged attackers.
 * +extraDmg to normal ranged attacks, +extraDmg_2 if target is BigTarget.
 * Does NOT end Farsight's turn - he can still move and attack.
 * Variables: extraDmg, extraDmg_2
 */
export const ExemplarOfTheMontkaHandler: AbilityHandler = {
  abilityId: 'ExemplarOfTheMontka',
  abilityName: "Exemplar of the Mont'ka",
  category: 'buff',
  cooldown: -1,  // One-time use
  endsTurn: false,  // Farsight can still move and attack

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('ExemplarOfTheMontka');
    const extraDmg = values.extraDmg as number || 0;
    const extraDmg_2 = values.extraDmg_2 as number || 0;

    // Note: The actual team-wide buff is handled by the buff registry (exemplarOfTheMontkaBuffTemplate)
    // This handler just returns the values for the buff system to use
    return {
      abilityId: 'ExemplarOfTheMontka',
      abilityName,
      category: 'buff',
      buffResult: {
        effect: {
          // These values are passed to the buff pool manager
          baseDamageBonus: extraDmg,  // Base bonus (normal targets)
        },
        duration: 1,  // Lasts until end of turn
      },
      message: `${abilityName}: +${extraDmg} ranged dmg (+${extraDmg_2} vs BigTarget)`,
    };
  },
};

/**
 * ThunderousAssault (Godswyl)
 * Melee Power damage attack (1 hit)
 * Push + stun effects are ignored (bosses are Immune)
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Power, nrOfHits: 1
 */
export const ThunderousAssaultHandler: AbilityHandler = {
  abilityId: 'ThunderousAssault',
  abilityName: 'Thunderous Assault',
  category: 'damage',
  cooldown: -1,  // One-time use
  endsTurn: true,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('ThunderousAssault');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const hits = values.nrOfHits as number || 1;

    const avgDmg = Math.round((minDmg + maxDmg) / 2);

    return {
      abilityId: 'ThunderousAssault',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg,
        hits,
        damageProfile: 'Power' as DamageType,
      },
      message: abilityName,
    };
  },
};

// DefendTheDivineWork (Actus) - Multi-target repair that triggers Galvanic Field
// Note: The actual repair/attack logic is handled in CalculatorPage and battleStore
// This handler provides metadata for the ability system
export const DefendTheDivineWorkHandler: AbilityHandler = {
  abilityId: 'DefendTheDivineWork',
  abilityName: 'Defend the Divine Work',
  category: 'healing',
  cooldown: -1,  // One-time use
  endsTurn: true,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('DefendTheDivineWork');
    const hpToRepair = values.hpToRepair as number || 0;

    return {
      abilityId: 'DefendTheDivineWork',
      abilityName,
      category: 'healing',
      healingResult: {
        amount: hpToRepair,
      },
      message: abilityName,
    };
  },
};

/**
 * FightingRetreat (Darkstrider)
 * Buff ability that applies Markerlight to boss and enables RangedSpecialist trait override.
 * Does NOT end turn if Darkstrider is adjacent to boss, and allows re-movement.
 * The actual turn/movement logic is handled in CalculatorPage and battleStore.
 * Variables: dmgReduction (not used - enemy debuffs not simulated)
 */
export const FightingRetreatHandler: AbilityHandler = {
  abilityId: 'FightingRetreat',
  abilityName: 'Fighting Retreat',
  category: 'buff',
  cooldown: -1,  // One-time use per battle
  endsTurn: false,  // Default: doesn't end turn (conditional logic in CalculatorPage)

  executeActive: (_values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('FightingRetreat');

    return {
      abilityId: 'FightingRetreat',
      abilityName,
      category: 'buff',
      buffResult: {
        effect: {},
        duration: 1,  // Lasts until end of turn
      },
      message: abilityName,
    };
  },
};

/**
 * CrusadeOfWrath (Helbrecht)
 * Buff that grants all friendly units within range 2:
 * - +extraDmg damage for melee attacks
 * - +extraPierceRatio% pierce ratio for melee attacks
 * Duration: 2 rounds (this round and next)
 * After using, Helbrecht can still attack
 * Variables: extraDmg, extraPierceRatio
 * Constants: range: 2
 */
export const CrusadeOfWrathHandler: AbilityHandler = {
  abilityId: 'CrusadeOfWrath',
  abilityName: 'Crusade Of Wrath',
  category: 'buff',
  cooldown: -1,
  endsTurn: false, // Helbrecht can still attack after using this ability

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('CrusadeOfWrath');

    return {
      abilityId: 'CrusadeOfWrath',
      abilityName,
      category: 'buff',
      buffResult: {
        effect: {
          baseDamageBonus: values.extraDmg as number || 0,
          pierceRatioBonus: values.extraPierceRatio as number || 0,
        },
        duration: 2, // Lasts this round and next
      },
      message: abilityName,
    };
  },
};

/**
 * Talons of the Emperor (Atlacoya)
 * Damage attack that scales with number of abilities used
 * Deals average(minDmg, maxDmg) + (extraDmg × activeAbilitiesUsedCount)
 * Deals DirectDamage if boss has Psyker trait OR Atlacoya is adjacent to Custodes
 * Variables: minDmg, maxDmg, extraDmg
 * Constants: nrOfHits: 1, damageProfile: Power, damageProfile_2: DirectDamage
 */
export const TalonsOfTheEmperorHandler: AbilityHandler = {
  abilityId: 'TalonsOfTheEmperor',
  abilityName: 'Talons of the Emperor',
  category: 'damage',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('TalonsOfTheEmperor');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const extraDmg = values.extraDmg as number || 0;

    // Base damage is average of minDmg and maxDmg
    const baseAvgDmg = (minDmg + maxDmg) / 2;

    // Calculate scaling damage from abilities used
    const abilitiesUsed = context.activeAbilitiesUsedCount || 0;
    const scalingBonus = extraDmg * abilitiesUsed;

    // Check if damage type should be DirectDamage
    const bossHasPsyker = context.bossTraits?.includes('Psyker') ?? false;
    const adjacentToCustodes = context.abilityToggles['TalonsOfTheEmperor_adjacentToCustodes'] ?? false;
    const useDirect = bossHasPsyker || adjacentToCustodes;

    return {
      abilityId: 'TalonsOfTheEmperor',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: baseAvgDmg,
        hits: 1,
        damageProfile: useDirect ? 'DirectDamage' : 'Power',  // DirectDamage is now supported
      },
      // Add scaling bonus as ability modifier
      abilityModifiers: scalingBonus > 0 ? {
        abilityName: `${abilityName} (+${extraDmg} × ${abilitiesUsed})`,
        baseDamageBonus: scalingBonus,
      } : undefined,
      message: `${abilityName} (${abilitiesUsed} abilities used)${useDirect ? ' [Direct Damage]' : ''}`,
    };
  },
};

/**
 * VexillaMagnifica (Aesoth)
 * Melee Physical damage attack (1 hit)
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Physical, nrOfHits: 1, cooldownTurns: 2
 */
export const VexillaMagnificaHandler: AbilityHandler = {
  abilityId: 'VexillaMagnifica',
  abilityName: 'Vexilla Magnifica',
  category: 'damage',
  cooldown: 2,
  endsTurn: true,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('VexillaMagnifica');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const hits = values.nrOfHits as number || 1;

    const avgDmg = Math.round((minDmg + maxDmg) / 2);

    return {
      abilityId: 'VexillaMagnifica',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg,
        hits,
        damageProfile: 'Physical' as DamageType,
      },
      message: abilityName,
    };
  },
};

/**
 * Waaagh! (Gulgortz)
 * Summons 3 Ork Boyz and grants a buff to all Orks (automatic) and non-Orks with "Adjacent to Gulgortz" toggle
 * Buff grants +extraDmg and +extraHit (1 hit) to the FIRST normal attack
 * Variables: extraDmg, extraHit, nrOfSummons, summonHp, summonDmg, summonArmor
 * Constants: unitToSpawn: orksOrkBoys
 */
export const WaaaghHandler: AbilityHandler = {
  abilityId: 'Waaagh',
  abilityName: 'Waaagh!',
  category: 'buff',  // Primary category is buff since summons are handled separately
  cooldown: -1,  // One-time use per battle
  endsTurn: true,  // Using Waaagh! ends Gulgortz's turn

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('Waaagh');

    return {
      abilityId: 'Waaagh',
      abilityName,
      category: 'buff',
      // Summon 3 Ork Boyz
      summonResult: {
        unitId: (values.unitToSpawn as string) || 'orksOrkBoys',
        hp: values.summonHp as number || 0,
        damage: values.summonDmg as number || 0,
        armor: values.summonArmor as number || 0,
        count: values.nrOfSummons as number || 3,
      },
      // Buff for team (handled via buff pool)
      buffResult: {
        effect: {
          baseDamageBonus: values.extraDmg as number || 0,
          extraHits: values.extraHit as number || 1,
        },
        duration: 1,  // Lasts until used
      },
      message: abilityName,
    };
  },
};

/**
 * Chordclaw (Exitor-Rho)
 * Melee DirectDamage attack (4 hits) that grants a buff for 2 turns.
 * The buff adds a follow-up attack (2x DirectDamage) to ALL of Exitor-Rho's attacks.
 * Variables: minDmg, maxDmg, minDmg_2, maxDmg_2
 * Constants: nrOfHits: 4, nrOfHits_2: 2, damageProfile: DirectDamage
 */
export const CordClawHandler: AbilityHandler = {
  abilityId: 'CordClaw',
  abilityName: 'Chordclaw',
  category: 'damage',
  cooldown: -1,  // One-time use per battle
  endsTurn: true,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('CordClaw');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const hits = values.nrOfHits as number || 4;

    // Buff values for follow-up attack on future attacks
    const nrOfHits_2 = values.nrOfHits_2 as number || 2;
    const avgDmg_2 = Math.round(((values.minDmg_2 as number || 0) + (values.maxDmg_2 as number || 0)) / 2);

    const avgDmg = Math.round((minDmg + maxDmg) / 2);

    return {
      abilityId: 'CordClaw',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg,
        hits,
        damageProfile: 'DirectDamage' as DamageType,
      },
      // Buff that grants follow-up attack to all future attacks for 2 turns
      // Note: The actual follow-up damage values are stored directly on the character
      // in battleStore.ts when this ability executes
      buffResult: {
        effect: {
          // The buff itself has no stat effects - it just signals the follow-up attack buff is active
        },
        duration: 2,  // This turn + next turn
      },
      message: `${abilityName}: ${hits}x ${avgDmg} DirectDamage + buff (${nrOfHits_2}x ${avgDmg_2} DirectDamage for 2 turns)`,
    };
  },
};

/**
 * InspiredToGreatness (Aun'Shi)
 * Enables a friendly unit to use their active ability again, at the lowest level between
 * their ability and Inspired to Greatness. Also heals the target.
 * - If target has already used ability: hpToHeal + ability re-use
 * - If target hasn't used ability yet: hpToHeal_2 (larger heal, no re-use)
 * Variables: hpToHeal, hpToHeal_2
 * Note: Actual target selection and ability re-execution handled in CalculatorPage
 */
export const InspiredToGreatnessHandler: AbilityHandler = {
  abilityId: 'InspiredToGreatness',
  abilityName: 'Inspired to Greatness',
  category: 'buff',  // Primary is enabling ability re-use
  cooldown: -1,  // One-time use per battle
  endsTurn: true,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('InspiredToGreatness');
    const hpToHeal = values.hpToHeal as number || 0;
    const hpToHeal_2 = values.hpToHeal_2 as number || 0;

    // Note: The actual logic is handled in CalculatorPage via modal
    // This handler provides the values and metadata
    return {
      abilityId: 'InspiredToGreatness',
      abilityName,
      category: 'buff',
      healingResult: {
        amount: hpToHeal,  // Will be overridden based on target selection
      },
      message: `${abilityName}: +${hpToHeal} HP (ability used) / +${hpToHeal_2} HP (ability not used)`,
    };
  },
};

/**
 * RadBombardment (Vitruvius)
 * Special ranged attack that deals raw damage - ignores all bonuses/modifiers and cannot crit
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Toxic, nrOfHits: 1
 */
export const RadBombardmentHandler: AbilityHandler = {
  abilityId: 'RadBombardment',
  abilityName: 'Rad Bombardment',
  category: 'damage',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('RadBombardment');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);

    return {
      abilityId: 'RadBombardment',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg,
        hits: 1,
        damageProfile: 'Toxic' as DamageType,
      },
      // Raw damage: ignores all Vitruvius's bonuses/modifiers (including elevation) and cannot crit
      rawDamage: true,
      attackType: 'ranged',
      message: abilityName,
    };
  },
};

/**
 * EarlyWarningOverride (Re'vas)
 * Summons 2 Shield Drones and activates Overwatch mode.
 * Overwatch grants a +extraDmg bonus to a single ranged attack this turn.
 * Variables: extraDmg, summonHp, summonDmg, summonArmor
 * Constants: unitId: tauSmnDroneShield, nrOfSummons: 2
 */
export const EarlyWarningOverrideHandler: AbilityHandler = {
  abilityId: 'EarlyWarningOverride',
  abilityName: 'Early Warning Override',
  category: 'summon',
  cooldown: -1,  // One-time use per battle
  endsTurn: true,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('EarlyWarningOverride');

    return {
      abilityId: 'EarlyWarningOverride',
      abilityName,
      category: 'summon',
      // Summon 2 Shield Drones
      summonResult: {
        unitId: (values.unitId as string) || 'tauSmnDroneShield',
        hp: values.summonHp as number || 0,
        damage: values.summonDmg as number || 0,
        armor: values.summonArmor as number || 0,
        count: values.nrOfSummons as number || 2,
      },
      // Overwatch activation (extraDmg for ranged attack)
      overwatchResult: {
        extraDmg: values.extraDmg as number || 0,
      },
      message: abilityName,
    };
  },
};

/**
 * DoctrinaImperatives (Tan Gi'da)
 * Stance-switching ability that toggles between Protector and Conqueror Imperatives.
 * - Protector: +extraArmor to self and adjacent Mechanical units
 * - Conqueror: +extraDmg vs reduced armor targets (not relevant for bosses)
 * Can be used once per turn (cooldown: 0), doesn't end turn.
 * Only first use counts for "ability used" condition (Legendary Commander).
 * Variables: extraDmg, extraArmor
 */
export const DoctrinaImperativesHandler: AbilityHandler = {
  abilityId: 'DoctrinaImperatives',
  abilityName: 'Doctrina Imperatives',
  category: 'buff',
  cooldown: 0,  // Once per turn (resets at turn start)
  endsTurn: false,  // Can attack after using

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('DoctrinaImperatives');
    const extraArmor = values.extraArmor as number || 0;

    // Note: Stance switching logic is handled in battleStore.ts
    // This handler returns the Protector buff values for display
    // The battleStore decides which stance to apply based on current state
    return {
      abilityId: 'DoctrinaImperatives',
      abilityName,
      category: 'buff',
      buffResult: {
        effect: {
          armorBonus: extraArmor,
        },
        duration: -1,  // Permanent until stance switches
      },
      message: `${abilityName}: Protector (+${extraArmor} Armor)`,
    };
  },
};

/**
 * Foehammer (Arjac)
 * Ranged Power damage attack with +extraDmg per defeated character
 * Variables: minDmg, maxDmg, extraDmg
 * Constants: damageProfile: Power, range: 2, nrOfHits: 1
 * Counter: Foehammer_defeated - number of characters defeated
 */
export const FoehammerHandler: AbilityHandler = {
  abilityId: 'Foehammer',
  abilityName: 'Foehammer',
  category: 'damage',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('Foehammer');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const extraDmgPerDefeated = values.extraDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);

    // Get defeated character count from toggle counter
    const defeatedCount = (context.abilityToggles?.['Foehammer_defeated'] as unknown as number) ?? 0;
    const bonusDamage = extraDmgPerDefeated * defeatedCount;

    return {
      abilityId: 'Foehammer',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg,
        hits: 1,
        damageProfile: 'Power' as DamageType,
      },
      // Pass bonus damage as modifier for display in BattleLog
      abilityModifiers: bonusDamage > 0 ? {
        baseDamageBonus: bonusDamage,
        abilityName: `${defeatedCount} Defeated`,  // Custom source name for display
      } : undefined,
      attackType: 'ranged',
      message: defeatedCount > 0
        ? `${abilityName} (+${bonusDamage} from ${defeatedCount} defeated)`
        : abilityName,
    };
  },
};

/**
 * Stormcaller (Njal)
 * Ranged Psychic damage attack with 3 hits
 * Creates Ice hexes on enemies hit
 * Ignores all bonuses/modifiers and cannot crit
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Psychic, range: 3, nrOfHits: 3
 */
export const StormcallerHandler: AbilityHandler = {
  abilityId: 'Stormcaller',
  abilityName: 'Stormcaller',
  category: 'damage',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('Stormcaller');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const hits = values.nrOfHits as number || 3;

    return {
      abilityId: 'Stormcaller',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg,
        hits,
        damageProfile: 'Psychic' as DamageType,
      },
      attackType: 'ranged',
      rawDamage: true,  // Ignores all bonuses/modifiers and cannot crit
      message: abilityName,
    };
  },
};

/**
 * GrapnelLauncher (Tjark)
 * Ranged Physical damage attack with 1 hit
 * Knockback effect (ignored - bosses are Immune)
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Physical, range: 3, nrOfHits: 1
 */
export const GrapnelLauncherHandler: AbilityHandler = {
  abilityId: 'GrapnelLauncher',
  abilityName: 'Grapnel Launcher',
  category: 'damage',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('GrapnelLauncher');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);

    return {
      abilityId: 'GrapnelLauncher',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg,
        hits: 1,
        damageProfile: 'Physical' as DamageType,
      },
      attackType: 'ranged',
      message: abilityName,
    };
  },
};

/**
 * GreatFrostAxe (Ulf)
 * Melee Piercing damage attack with 4 hits
 * Creates Ice hexes, +critDmg from Ice already applied to this attack
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Piercing, nrOfHits: 4
 */
export const GreatFrostAxeHandler: AbilityHandler = {
  abilityId: 'GreatFrostAxe',
  abilityName: 'Great Frost Axe',
  category: 'damage',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('GreatFrostAxe');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const hits = values.nrOfHits as number || 4;

    return {
      abilityId: 'GreatFrostAxe',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg,
        hits,
        damageProfile: 'Piercing' as DamageType,
      },
      attackType: 'melee',
      message: abilityName,
    };
  },
};

/**
 * DarkTalonStrike (Azrael)
 * User chooses between: 1x DirectDamage OR 6x Bolter
 * Toggle: Bolter Mode - when checked uses 6x Bolter, otherwise 1x DirectDamage
 * Variables: minDmg, maxDmg, minDmg_2, maxDmg_2
 * Constants: damageProfile: DirectDamage, damageProfile_2: Bolter, nrOfHits: 1, nrOfHits_2: 6
 */
export const DarkTalonStrikeHandler: AbilityHandler = {
  abilityId: 'DarkTalonStrike',
  abilityName: 'Dark Talon Strike',
  category: 'damage',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('DarkTalonStrike');
    const isBolterMode = context.abilityToggles?.['DarkTalonStrike_bolterMode'] ?? false;

    if (isBolterMode) {
      // Bolter Mode: 6x Bolter
      const minDmg = values.minDmg_2 as number || 0;
      const maxDmg = values.maxDmg_2 as number || 0;
      const avgDmg = Math.round((minDmg + maxDmg) / 2);
      const hits = values.nrOfHits_2 as number || 6;

      return {
        abilityId: 'DarkTalonStrike',
        abilityName,
        category: 'damage',
        damageResult: {
          minDamage: minDmg,
          maxDamage: maxDmg,
          averageDamage: avgDmg,
          hits,
          damageProfile: 'Bolter' as DamageType,
        },
        attackType: 'ranged',
        message: `${abilityName} (Bolter)`,
      };
    } else {
      // DirectDamage Mode: 1x DirectDamage
      const minDmg = values.minDmg as number || 0;
      const maxDmg = values.maxDmg as number || 0;
      const avgDmg = Math.round((minDmg + maxDmg) / 2);
      const hits = values.nrOfHits as number || 1;

      return {
        abilityId: 'DarkTalonStrike',
        abilityName,
        category: 'damage',
        damageResult: {
          minDamage: minDmg,
          maxDamage: maxDmg,
          averageDamage: avgDmg,
          hits,
          damageProfile: 'DirectDamage' as DamageType,
        },
        attackType: 'ranged',
        message: `${abilityName} (DirectDamage)`,
      };
    }
  },
};

/**
 * Supercharge (Sarquael)
 * Special Ranged attack: 1x Plasma damage with +extraPierceRatio pierce ratio
 * For the rest of the turn, all Plasma damage attacks get +extraPierceRatio pierce ratio
 * Variables: minDmg, maxDmg, extraPierceRatio
 * Constants: damageProfile: Plasma, nrOfHits: 1
 */
export const SuperchargeHandler: AbilityHandler = {
  abilityId: 'Supercharge',
  abilityName: 'Supercharge',
  category: 'damage',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('Supercharge');

    // Single damage component: 1x Plasma with pierce bonus
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);

    const extraPierceRatio = values.extraPierceRatio as number || 0;

    return {
      abilityId: 'Supercharge',
      abilityName,
      category: 'damage',
      damageComponents: [
        {
          minDamage: minDmg,
          maxDamage: maxDmg,
          averageDamage: avgDmg,
          hits: 1,
          damageProfile: 'Plasma' as DamageType,
        },
      ],
      abilityModifiers: {
        pierceRatioBonus: extraPierceRatio,
      },
      // Store the pierce bonus so battleStore can apply it for rest of turn
      superchargePierceBonus: extraPierceRatio,
      attackType: 'ranged',
      message: `${abilityName} (+${extraPierceRatio}% pierce for Plasma this turn)`,
    };
  },
};

/**
 * PlasmaCannon (Baraqiel)
 * Ranged 3x Plasma damage with cooldown
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Plasma, nrOfHits: 3, cooldownTurns: 1, initialCooldownTurns: 1
 */
export const PlasmaCannonHandler: AbilityHandler = {
  abilityId: 'PlasmaCannon',
  abilityName: 'Plasma Cannon',
  category: 'damage',
  cooldown: 1,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('PlasmaCannon');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const hits = values.nrOfHits as number || 3;

    return {
      abilityId: 'PlasmaCannon',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg,
        hits,
        damageProfile: 'Plasma' as DamageType,
      },
      attackType: 'ranged',
      message: abilityName,
    };
  },
};

/**
 * CalibaniteGreatsword (Forcas)
 * Stance-switching ability that toggles between Strike and Sweep stances.
 * - Strike Stance (initial): Enables Overwatch attack
 * - Sweep Stance: No effect in battle simulation
 * Can be used once per turn (cooldown: 0), doesn't end turn.
 * Only first use counts for "ability used" condition (Legendary Commander).
 */
export const CalibaniteGreatswordHandler: AbilityHandler = {
  abilityId: 'CalibaniteGreatsword',
  abilityName: 'Calibanite Greatsword',
  category: 'buff',
  cooldown: 0,  // Once per turn (resets at turn start)
  endsTurn: false,  // Can attack after using

  executeActive: (_values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('CalibaniteGreatsword');

    // Note: Stance switching logic is handled in battleStore.ts
    // This handler returns a result for display purposes
    // The battleStore decides which stance to switch to based on current state
    return {
      abilityId: 'CalibaniteGreatsword',
      abilityName,
      category: 'buff',
      buffResult: {
        effect: {},  // No direct stat effect, stance enables/disables Overwatch
        duration: -1,  // Permanent until stance switches
      },
      message: `${abilityName}: Stance switched`,
    };
  },
};

/**
 * ExemplarOfHate (Asmodai)
 * Team-wide buff that grants +extraDmg damage for melee and Overwatch attacks
 * Duration: 2 rounds (this round and next)
 * Variables: extraDmg
 */
export const ExemplarOfHateHandler: AbilityHandler = {
  abilityId: 'ExemplarOfHate',
  abilityName: 'Exemplar of Hate',
  category: 'buff',
  cooldown: -1,
  endsTurn: true,  // Using this ability ends Asmodai's turn

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('ExemplarOfHate');
    const extraDmg = values.extraDmg as number || 0;

    return {
      abilityId: 'ExemplarOfHate',
      abilityName,
      category: 'buff',
      buffResult: {
        effect: {
          baseDamageBonus: extraDmg,
        },
        duration: 2, // This turn and next
      },
      message: `${abilityName}: Team +${extraDmg} dmg (melee/Overwatch)`,
    };
  },
};

/**
 * FragstormGrenadeLauncher (Burchard)
 * Ranged 6x Blast damage
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Blast, nrOfHits: 6, range: 2
 */
export const FragstormGrenadeLauncherHandler: AbilityHandler = {
  abilityId: 'FragstormGrenadeLauncher',
  abilityName: 'Fragstorm Grenade Launcher',
  category: 'damage',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('FragstormGrenadeLauncher');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const hits = values.nrOfHits as number || 6;

    return {
      abilityId: 'FragstormGrenadeLauncher',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg,
        hits,
        damageProfile: 'Blast' as DamageType,
      },
      attackType: 'ranged',
      message: abilityName,
    };
  },
};

/**
 * HolyDuel (Jaeger)
 * Activates but does nothing relevant for damage calculation.
 * In-game: challenges target to 1v1, grants +extraDmg and -dmgReduction
 * but neither effect is modeled in this calculator.
 */
export const HolyDuelHandler: AbilityHandler = {
  abilityId: 'HolyDuel',
  abilityName: 'Holy Duel',
  category: 'buff',
  cooldown: -1,
  endsTurn: false,

  executeActive: (_values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('HolyDuel');

    return {
      abilityId: 'HolyDuel',
      abilityName,
      category: 'buff',
      message: `${abilityName} activated`,
    };
  },
};

/**
 * UnbreakableDuty (Thoread)
 * When 2+ friendly Imperial characters are dead, grants +extraDmg to normal attacks for rest of battle
 * Also grants +extraHp and -dmgReductionPct% (defensive, not modeled)
 * Variables: extraDmg, extraHp, dmgReductionPct
 * Constants: range: 2
 */
export const UnbreakableDutyHandler: AbilityHandler = {
  abilityId: 'UnbreakableDuty',
  abilityName: 'Unbreakable Duty',
  category: 'buff',
  cooldown: -1,
  endsTurn: false,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('UnbreakableDuty');
    const extraDmg = values.extraDmg as number || 0;

    return {
      abilityId: 'UnbreakableDuty',
      abilityName,
      category: 'buff',
      buffResult: {
        effect: {
          baseDamageBonus: extraDmg,
          normalAttackOnly: true,  // Only applies to normal attacks
        },
        duration: 99,  // Lasts until end of battle
      },
      message: `${abilityName}: +${extraDmg} damage (normal attacks)`,
    };
  },
};

/**
 * ArmoriumCherub (Vindicta)
 * Ranged 4x Flame damage, does not end turn
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Flame, nrOfHits: 4, range: 2
 */
export const ArmoriumCherubHandler: AbilityHandler = {
  abilityId: 'ArmoriumCherub',
  abilityName: 'Armorium Cherub',
  category: 'damage',
  cooldown: -1,
  endsTurn: false,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('ArmoriumCherub');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const hits = values.nrOfHits as number || 4;

    return {
      abilityId: 'ArmoriumCherub',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg,
        hits,
        damageProfile: 'Flame' as DamageType,
      },
      attackType: 'ranged',
      message: abilityName,
    };
  },
};

/**
 * SanctorumMissile (Morvenn Vahl)
 * Ranged 2x Blast damage
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Blast, nrOfHits: 2, range: 3
 */
export const SanctorumMissileHandler: AbilityHandler = {
  abilityId: 'SanctorumMissile',
  abilityName: 'Sanctorum Missile',
  category: 'damage',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('SanctorumMissile');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const hits = values.nrOfHits as number || 2;

    return {
      abilityId: 'SanctorumMissile',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg,
        hits,
        damageProfile: 'Blast' as DamageType,
      },
      attackType: 'ranged',
      message: abilityName,
    };
  },
};

/**
 * BrazierOfHolyFire (Roswitha)
 * Ranged 2x Flame damage, or 4x if boss has Daemon trait
 * If Daemon: also grants +extraDmgPct_2% damage to all characters for 2 turns
 * Variables: minDmg, maxDmg, extraDmgPct, extraDmgPct_2
 * Constants: damageProfile: Flame, nrOfHits: 2, nrOfHits_2: 4
 */
export const BrazierOfHolyFireHandler: AbilityHandler = {
  abilityId: 'BrazierOfHolyFire',
  abilityName: 'Brazier of Holy Fire',
  category: 'damage',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('BrazierOfHolyFire');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const bossIsDaemon = context.bossTraits?.includes('Daemon') ?? false;
    const hits = bossIsDaemon ? (values.nrOfHits_2 as number || 4) : (values.nrOfHits as number || 2);

    return {
      abilityId: 'BrazierOfHolyFire',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg,
        hits,
        damageProfile: 'Flame' as DamageType,
      },
      // If boss is Daemon, also grant team-wide damage buff
      ...(bossIsDaemon ? {
        buffResult: {
          effect: {
            baseDamageMultiplier: 1 + ((values.extraDmgPct_2 as number || 10) / 100),
          },
          duration: 2,
        },
      } : {}),
      attackType: 'ranged',
      message: abilityName,
    };
  },
};

/**
 * SkyStrike (Celestine)
 * Special melee attack: same damage as normal attack + extraDmg bonus
 * Celestine flies to target and attacks
 * Variables: extraDmg
 * Constants: initialCooldownTurns: 1
 */
export const SkyStrikeHandler: AbilityHandler = {
  abilityId: 'SkyStrike',
  abilityName: 'Sky Strike',
  category: 'damage',
  cooldown: -1,
  endsTurn: true,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('SkyStrike');
    const extraDmg = values.extraDmg as number || 0;

    return {
      abilityId: 'SkyStrike',
      abilityName,
      category: 'damage',
      useCharacterMeleeStats: true,
      attackType: 'melee',
      abilityModifiers: {
        abilityName,
        baseDamageBonus: extraDmg,
      },
      message: abilityName,
    };
  },
};

/**
 * ThriceBlessedConflagration (Exorcist)
 * Ranged 1x Flame damage with +extraDmgPct% to Daemons
 * Variables: minDmg, maxDmg, extraDmgPct, nrOfRounds
 * Constants: nrOfHits: 1, damageProfile: Flame
 */
export const ThriceBlessedConflagrationHandler: AbilityHandler = {
  abilityId: 'ThriceBlessedConflagration',
  abilityName: 'Thrice-Blessed Conflagration',
  category: 'damage',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('ThriceBlessedConflagration');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const extraDmgPct = values.extraDmgPct as number || 0;

    return {
      abilityId: 'ThriceBlessedConflagration',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg,
        hits: 1,
        damageProfile: 'Flame' as DamageType,
      },
      attackType: 'ranged',
      message: `${abilityName} (+${extraDmgPct}% vs Daemon)`,
    };
  },
};

/**
 * DevastatingRefrain (Exorcist)
 * Ranged 1x Blast damage
 * Variables: minDmg, maxDmg, chance
 * Constants: nrOfHits: 1, damageProfile: Blast
 */
export const DevastatingRefrainHandler: AbilityHandler = {
  abilityId: 'DevastatingRefrain',
  abilityName: 'Devastating Refrain',
  category: 'damage',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('DevastatingRefrain');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);

    return {
      abilityId: 'DevastatingRefrain',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg,
        hits: 1,
        damageProfile: 'Blast' as DamageType,
      },
      attackType: 'ranged',
      message: abilityName,
    };
  },
};

/**
 * VigilanceEternal (Tyrith)
 * Melee 3x Power damage, range 2, cooldown 2
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Power, nrOfHits: 3, range: 2, cooldownTurns: 2
 */
export const VigilanceEternalHandler: AbilityHandler = {
  abilityId: 'VigilanceEternal',
  abilityName: 'Vigilance Eternal',
  category: 'damage',
  cooldown: 2,
  endsTurn: false,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('VigilanceEternal');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const hits = values.nrOfHits as number || 3;

    return {
      abilityId: 'VigilanceEternal',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg,
        hits,
        damageProfile: 'Power' as DamageType,
      },
      attackType: 'melee',
      message: abilityName,
    };
  },
};

/**
 * SupremeCommander (Creed)
 * Summons 2 Guardsmen and potentially Kell
 * Variables: summonHp, summonDmg, summonArmor
 * Constants: nrOfSummons: 2, unitId: astraSmnGuardsman
 */
export const SupremeCommanderHandler: AbilityHandler = {
  abilityId: 'SupremeCommander',
  abilityName: 'Supreme Commander',
  category: 'summon',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('SupremeCommander');
    const summonHp = values.summonHp as number || 0;
    const summonDmg = values.summonDmg as number || 0;
    const summonArmor = values.summonArmor as number || 0;

    return {
      abilityId: 'SupremeCommander',
      abilityName,
      category: 'summon',
      summonResult: {
        unitId: 'astraSmnGuardsman',
        hp: summonHp,
        damage: summonDmg,
        armor: summonArmor,
        count: 2,
      },
      message: `${abilityName}: Summons 2 Guardsmen (HP: ${summonHp}, Dmg: ${summonDmg})`,
    };
  },
};

/**
 * LeadingTheCharge (Dreir)
 * 3x Power damage + summons 2 Death Riders
 * Variables: minDmg, maxDmg, nrOfSummons, summonHp, summonDmg, summonArmor, extraPierceRatio
 * Constants: damageProfile: Power, range: 4, nrOfHits: 3
 */
export const LeadingTheChargeHandler: AbilityHandler = {
  abilityId: 'LeadingTheCharge',
  abilityName: 'Leading the Charge',
  category: 'damage',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('LeadingTheCharge');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const hits = values.nrOfHits as number || 3;
    const summonHp = values.summonHp as number || 0;
    const summonDmg = values.summonDmg as number || 0;
    const summonArmor = values.summonArmor as number || 0;

    return {
      abilityId: 'LeadingTheCharge',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg,
        hits,
        damageProfile: 'Power' as DamageType,
      },
      summonResult: {
        unitId: 'astraSmnDeathRider',
        hp: summonHp,
        damage: summonDmg,
        armor: summonArmor,
        count: 2,
      },
      attackType: 'melee',
      message: abilityName,
    };
  },
};

/**
 * FragBomb (Kut Skoden)
 * 6x Blast to target + 3x Blast to adjacent
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Blast, nrOfHits: 6, nrOfHits_2: 3
 */
export const FragBombHandler: AbilityHandler = {
  abilityId: 'FragBomb',
  abilityName: 'Frag Bomb',
  category: 'damage',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('FragBomb');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const targetHits = values.nrOfHits as number || 6;
    const adjacentHits = values.nrOfHits_2 as number || 3;

    return {
      abilityId: 'FragBomb',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg,
        hits: targetHits,
        damageProfile: 'Blast' as DamageType,
      },
      attackType: 'melee',
      message: `${abilityName}: ${targetHits}x Blast to target, ${adjacentHits}x Blast to adjacent`,
    };
  },
};

/**
 * MalleusRocketLauncher (Malleus)
 * Ranged Blast damage with multiple projectiles
 * Variables: minDmg, maxDmg, extraDmg
 * Constants: nrOfProjectiles: 3, damageProfile: Blast, nrOfHits: 1, range: 2
 */
export const MalleusRocketLauncherHandler: AbilityHandler = {
  abilityId: 'MalleusRocketLauncher',
  abilityName: 'Malleus Rocket Barrage',
  category: 'damage',
  cooldown: 1,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('MalleusRocketLauncher');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const extraDmg = values.extraDmg as number || 0;

    return {
      abilityId: 'MalleusRocketLauncher',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg,
        hits: 1,
        damageProfile: 'Blast' as DamageType,
      },
      attackType: 'ranged',
      message: `${abilityName}: 3 projectiles, +${extraDmg} vs BigTarget`,
    };
  },
};

/**
 * ForwardSpotter (Malleus)
 * Summons a Guardsman
 * Variables: summonHp, summonDmg, summonArmor
 * Constants: nrOfSummons: 1, unitId: astraSmnGuardsman, initialCooldownTurns: 2
 */
export const ForwardSpotterHandler: AbilityHandler = {
  abilityId: 'ForwardSpotter',
  abilityName: 'Forward Spotter',
  category: 'summon',
  cooldown: 2,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('ForwardSpotter');
    const summonHp = values.summonHp as number || 0;
    const summonDmg = values.summonDmg as number || 0;
    const summonArmor = values.summonArmor as number || 0;

    return {
      abilityId: 'ForwardSpotter',
      abilityName,
      category: 'summon',
      summonResult: {
        unitId: 'astraSmnGuardsman',
        hp: summonHp,
        damage: summonDmg,
        armor: summonArmor,
        count: 1,
      },
      message: `${abilityName}: Summons Guardsman (HP: ${summonHp}, Dmg: ${summonDmg})`,
    };
  },
};

/**
 * PsychicMaelstrom (Sibyll)
 * 1x Psychic damage with chance to hit additional enemies
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Psychic, nrOfHits: 1, range: 2, chance: 75/50/25/10
 */
export const PsychicMaelstromHandler: AbilityHandler = {
  abilityId: 'PsychicMaelstrom',
  abilityName: 'Psychic Maelstrom',
  category: 'damage',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('PsychicMaelstrom');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);

    // Cascading hit probabilities
    const c1 = (values.chance as number || 75) / 100;
    const c2 = (values.chance_2 as number || 50) / 100;
    const c3 = (values.chance_3 as number || 25) / 100;
    const c4 = (values.chance_4 as number || 10) / 100;

    // Expected hits: 1 (guaranteed) + p1 + p1*p2 + p1*p2*p3 + p1*p2*p3*p4
    const expectedHits = 1 + c1 + (c1 * c2) + (c1 * c2 * c3) + (c1 * c2 * c3 * c4);

    return {
      abilityId: 'PsychicMaelstrom',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg,
        hits: expectedHits,
        damageProfile: 'Psychic' as DamageType,
      },
      rawDamage: true,
      attackType: 'ranged',
      message: `${abilityName} (${expectedHits.toFixed(2)} expected hits)`,
    };
  },
};

/**
 * BasiliskBarrage (Thaddeus)
 * 2x Blast damage with multiple projectiles
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Blast, nrOfHits: 2, nrOfProjectiles: 5
 */
export const BasiliskBarrageHandler: AbilityHandler = {
  abilityId: 'BasiliskBarrage',
  abilityName: 'Basilisk Barrage',
  category: 'damage',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('BasiliskBarrage');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const hits = values.nrOfHits as number || 2;
    const projectiles = values.nrOfProjectiles as number || 5;

    return {
      abilityId: 'BasiliskBarrage',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg,
        hits: hits * projectiles,
        damageProfile: 'Blast' as DamageType,
      },
      attackType: 'ranged',
      message: `${abilityName}: ${projectiles} projectiles, ${hits}x Blast each`,
    };
  },
};

/**
 * SendInTheNextWave (Yarrick)
 * Summons 2 Guardsmen
 * Variables: summonHp, summonDmg, summonArmor, maxSummons
 * Constants: nrOfSummons: 2, unitId: astraSmnGuardsman
 */
export const SendInTheNextWaveHandler: AbilityHandler = {
  abilityId: 'SendInTheNextWave',
  abilityName: 'Send In The Next Wave',
  category: 'summon',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('SendInTheNextWave');
    const summonHp = values.summonHp as number || 0;
    const summonDmg = values.summonDmg as number || 0;
    const summonArmor = values.summonArmor as number || 0;
    const maxSummons = values.maxSummons as number || 4;

    return {
      abilityId: 'SendInTheNextWave',
      abilityName,
      category: 'summon',
      summonResult: {
        unitId: 'astraSmnGuardsman',
        hp: summonHp,
        damage: summonDmg,
        armor: summonArmor,
        count: 2,
      },
      message: `${abilityName}: Summons 2 Guardsmen (max ${maxSummons}, HP: ${summonHp}, Dmg: ${summonDmg})`,
    };
  },
};

/**
 * SeekerMissileFrequencyLock (Sho'syl)
 * 1x Heavy Round damage, long range
 * Variables: minDmg, maxDmg
 * Constants: range: 5, nrOfHits: 1, damageProfile: HeavyRound
 */
export const SeekerMissileFrequencyLockHandler: AbilityHandler = {
  abilityId: 'SeekerMissileFrequencyLock',
  abilityName: 'Seeker Missile Frequency Lock',
  category: 'damage',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('SeekerMissileFrequencyLock');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);

    return {
      abilityId: 'SeekerMissileFrequencyLock',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg,
        hits: 1,
        damageProfile: 'HeavyRound' as DamageType,
      },
      attackType: 'ranged',
      message: `${abilityName}: Range 5`,
    };
  },
};

/**
 * MV71SniperDroneSquad (Sho'syl)
 * Summons Sniper Drones
 * Variables: summonHp, summonDmg, summonArmor
 * Constants: unitId: tauSmnDroneSniper, maxSummons: 3
 */
export const MV71SniperDroneSquadHandler: AbilityHandler = {
  abilityId: 'MV71SniperDroneSquad',
  abilityName: 'MV71 Sniper Drone Squad',
  category: 'summon',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('MV71SniperDroneSquad');
    const summonHp = values.summonHp as number || 0;
    const summonDmg = values.summonDmg as number || 0;
    const summonArmor = values.summonArmor as number || 0;

    return {
      abilityId: 'MV71SniperDroneSquad',
      abilityName,
      category: 'summon',
      summonResult: {
        unitId: 'tauSmnDroneSniper',
        hp: summonHp,
        damage: summonDmg,
        armor: summonArmor,
        count: 1,
      },
      message: `${abilityName}: Summons Sniper Drone (max 3, HP: ${summonHp}, Dmg: ${summonDmg})`,
    };
  },
};

/**
 * ExemplarOfTheKauyon (Shadowsun)
 * 2x Blast damage + summons Command Link drone
 * Variables: dmg, summonHp, summonDmg, summonArmor
 * Constants: unitId: tauSmnDroneCommandLink, damageProfile: Blast, nrOfHits: 2
 */
export const ExemplarOfTheKauyonHandler: AbilityHandler = {
  abilityId: 'ExemplarOfTheKauyon',
  abilityName: 'Exemplar of the Kauyon',
  category: 'damage',
  cooldown: 1,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('ExemplarOfTheKauyon');
    const dmg = values.dmg as number || 0;
    const avgDmg = dmg;
    const hits = values.nrOfHits as number || 2;
    const summonHp = values.summonHp as number || 0;
    const summonDmg = values.summonDmg as number || 0;
    const summonArmor = values.summonArmor as number || 0;

    return {
      abilityId: 'ExemplarOfTheKauyon',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: dmg,
        maxDamage: dmg,
        averageDamage: avgDmg,
        hits,
        damageProfile: 'Blast' as DamageType,
      },
      summonResult: {
        unitId: 'tauSmnDroneCommandLink',
        hp: summonHp,
        damage: summonDmg,
        armor: summonArmor,
        count: 1,
      },
      attackType: 'ranged',
      message: abilityName,
    };
  },
};

/**
 * HeavyRailRifle (Tson'ji)
 * 2x Piercing damage with chance to hit again
 * Variables: minDmg, maxDmg, chance
 * Constants: damageProfile: Piercing, nrOfHits: 2
 */
export const HeavyRailRifleHandler: AbilityHandler = {
  abilityId: 'HeavyRailRifle',
  abilityName: 'Heavy Rail Rifle',
  category: 'damage',
  cooldown: 1,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('HeavyRailRifle');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const hits = values.nrOfHits as number || 2;
    const chance = values.chance as number || 25;

    return {
      abilityId: 'HeavyRailRifle',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg,
        hits,
        damageProfile: 'Piercing' as DamageType,
      },
      attackType: 'ranged',
      message: `${abilityName}: ${chance}% to repeat on kill`,
    };
  },
};

/**
 * TwinSmartMissileSystem (Tson'ji)
 * 3x Blast damage to enemies with Markerlight
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Blast, nrOfHits: 3
 */
export const TwinSmartMissileSystemHandler: AbilityHandler = {
  abilityId: 'TwinSmartMissileSystem',
  abilityName: 'Twin Smart Missile System',
  category: 'damage',
  cooldown: 0,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('TwinSmartMissileSystem');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const hits = values.nrOfHits as number || 3;

    return {
      abilityId: 'TwinSmartMissileSystem',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg,
        hits,
        damageProfile: 'Blast' as DamageType,
      },
      attackType: 'ranged',
      message: `${abilityName}: Hits enemies with Markerlight (no crit/modifiers)`,
    };
  },
};

/**
 * Loki_SwoopingHawk (Aethana)
 * 1x Piercing melee damage, varies by range to target
 * Variables: dmg (comma-separated for range 1,2,3)
 * Constants: damageProfile: Piercing, nrOfHits: 1
 */
export const LokiSwoopingHawkHandler: AbilityHandler = {
  abilityId: 'Loki_SwoopingHawk',
  abilityName: 'Swooping Hawk',
  category: 'damage',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('Loki_SwoopingHawk');
    // dmg is comma-separated: "36,28,20" for range 1,2,3 - use range 1 (max damage)
    const dmgValue = values.dmg;
    const dmgStr = typeof dmgValue === 'string' ? dmgValue : String(dmgValue || '0,0,0');
    const dmgValues = dmgStr.split(',').map(Number);
    const maxDmg = dmgValues[0] || 0;  // Range 1 (highest)
    const minDmg = dmgValues[2] || 0;  // Range 3 (lowest)
    const avgDmg = Math.round((maxDmg + minDmg) / 2);

    return {
      abilityId: 'Loki_SwoopingHawk',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg,
        hits: 1,
        damageProfile: 'Piercing' as DamageType,
      },
      attackType: 'melee',
      message: `${abilityName}: Damage varies by range (${maxDmg}/${dmgValues[1]}/${minDmg})`,
    };
  },
};

/**
 * FireAndReposition (Calandis)
 * Movement ability with damage reduction buff, no direct damage
 * Variables: dmgReduction
 */
export const FireAndRepositionHandler: AbilityHandler = {
  abilityId: 'FireAndReposition',
  abilityName: 'Fire And Reposition',
  category: 'buff',
  cooldown: -1,
  endsTurn: false,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('FireAndReposition');
    const dmgReduction = values.dmgReduction as number || 0;

    return {
      abilityId: 'FireAndReposition',
      abilityName,
      category: 'buff',
      buffResult: {
        effect: {
          // Damage reduction is defensive and not directly modeled in calculator
        },
        duration: 1,
      },
      message: `${abilityName}: Move, attack, move again. -${dmgReduction} ranged damage next enemy turn`,
    };
  },
};

/**
 * SilentDeath (Jain Zar)
 * 3x Piercing to target and up to 3 adjacent enemies
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Piercing, nrOfHits: 3, nrOfTargets: 3
 */
export const SilentDeathHandler: AbilityHandler = {
  abilityId: 'SilentDeath',
  abilityName: 'Silent Death',
  category: 'damage',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('SilentDeath');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const hits = values.nrOfHits as number || 3;
    const nrOfTargets = values.nrOfTargets as number || 3;

    return {
      abilityId: 'SilentDeath',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg,
        hits,
        damageProfile: 'Piercing' as DamageType,
      },
      attackType: 'melee',
      message: `${abilityName}: Hits up to ${nrOfTargets + 1} adjacent enemies`,
    };
  },
};

/**
 * HarvesterOfSouls (Maugan Ra)
 * 2x Heavy ranged (range 3), hits target and adjacent enemies, +1 hit if didn't move
 * Variables: minDmg, maxDmg
 * Constants: nrOfHits: 2, range: 3, extraHit: 1
 */
export const HarvesterOfSoulsHandler: AbilityHandler = {
  abilityId: 'HarvesterOfSouls',
  abilityName: 'Harvester Of Souls',
  category: 'damage',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('HarvesterOfSouls');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const baseHits = values.nrOfHits as number || 2;
    const extraHit = !context.hasMoved ? 1 : 0;
    const hits = baseHits + extraHit;

    return {
      abilityId: 'HarvesterOfSouls',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg,
        hits,
        damageProfile: 'Heavy' as DamageType,
      },
      attackType: 'ranged',
      message: `${abilityName}: ${hits} hits${!context.hasMoved ? ' (stationary +1)' : ''}`,
    };
  },
};

/**
 * ScarabHive (Aleph-Null)
 * Summons 2 Scarab Swarms that attack with Piercing
 * Variables: summonHp, summonDmg, summonArmor
 * Constants: unitId: necroSmnSwarm
 */
export const ScarabHiveHandler: AbilityHandler = {
  abilityId: 'ScarabHive',
  abilityName: 'Scarab Hive',
  category: 'summon',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('ScarabHive');
    const summonHp = values.summonHp as number || 0;
    const summonDmg = values.summonDmg as number || 0;
    const summonArmor = values.summonArmor as number || 0;

    return {
      abilityId: 'ScarabHive',
      abilityName,
      category: 'summon',
      summonResult: {
        unitId: 'necroSmnSwarm',
        hp: summonHp,
        damage: summonDmg,
        armor: summonArmor,
        count: 2,
      },
      message: `${abilityName}: Summons 2 Scarab Swarms (HP: ${summonHp}, Dmg: ${summonDmg})`,
    };
  },
};

/**
 * ResurrectionOrb (Anuphet)
 * Summons Necron Warriors
 * Variables: summonHp, summonDmg, summonArmor
 * Constants: unitId: necroSmnWarrior
 */
export const ResurrectionOrbHandler: AbilityHandler = {
  abilityId: 'ResurrectionOrb',
  abilityName: 'Resurrection Orb',
  category: 'summon',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('ResurrectionOrb');
    const summonHp = values.summonHp as number || 0;
    const summonDmg = values.summonDmg as number || 0;
    const summonArmor = values.summonArmor as number || 0;

    return {
      abilityId: 'ResurrectionOrb',
      abilityName,
      category: 'summon',
      summonResult: {
        unitId: 'necroSmnWarrior',
        hp: summonHp,
        damage: summonDmg,
        armor: summonArmor,
        count: 1,
      },
      message: `${abilityName}: Resurrects Necron Warrior (HP: ${summonHp}, Dmg: ${summonDmg})`,
    };
  },
};

/**
 * MultiThreatEliminator (Imospekh)
 * 6x Gauss ranged, +1 hit per kill, chains to adjacent enemies
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Gauss, extraHit: 1, range: 2
 */
export const MultiThreatEliminatorHandler: AbilityHandler = {
  abilityId: 'MultiThreatEliminator',
  abilityName: 'Multi-Threat Eliminator',
  category: 'damage',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('MultiThreatEliminator');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const extraHit = values.extraHit as number || 1;

    return {
      abilityId: 'MultiThreatEliminator',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg,
        hits: 6,
        damageProfile: 'Gauss' as DamageType,
      },
      attackType: 'ranged',
      message: `${abilityName}: Range 2, +${extraHit} hit per kill, chains to adjacent`,
    };
  },
};

/**
 * AdaptiveStrategy (Makhotep)
 * Triggers RelentlessMarch for adjacent summons, lets them attack
 * Variables: minDmg, maxDmg (damage per hit when summons attack)
 */
export const AdaptiveStrategyHandler: AbilityHandler = {
  abilityId: 'AdaptiveStrategy',
  abilityName: 'Adaptive Strategy',
  category: 'buff',
  cooldown: 1,
  endsTurn: true,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('AdaptiveStrategy');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;

    return {
      abilityId: 'AdaptiveStrategy',
      abilityName,
      category: 'buff',
      buffResult: {
        effect: {},
        duration: 1,
      },
      message: `${abilityName}: Adjacent summons attack (${minDmg}-${maxDmg} per hit) + RelentlessMarch`,
    };
  },
};

/**
 * HarbingerOfDestruction (Thutmose)
 * 1x DirectDamage ranged, hits target + up to 2 random enemies
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: DirectDamage, nrOfHits: 1, range: 2
 * Note: Ignores bonuses/modifiers, cannot crit
 */
export const HarbingerOfDestructionHandler: AbilityHandler = {
  abilityId: 'HarbingerOfDestruction',
  abilityName: 'Harbinger of Destruction',
  category: 'damage',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('HarbingerOfDestruction');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);

    return {
      abilityId: 'HarbingerOfDestruction',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg,
        hits: 1,
        damageProfile: 'DirectDamage' as DamageType,
      },
      attackType: 'ranged',
      rawDamage: true,  // Ignores bonuses/modifiers, cannot crit
      message: `${abilityName}: Range 2, hits up to 3 enemies (raw damage, no crit)`,
    };
  },
};

// ============= TYRANIDS =============

/**
 * BioMinefield (Biovore)
 * Summons 3 Spore Mines, later explode for Bio damage
 */
export const BioMinefieldHandler: AbilityHandler = {
  abilityId: 'BioMinefield',
  abilityName: 'Bio-Minefield',
  category: 'summon',
  cooldown: -1,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('BioMinefield');
    const summonHp = values.summonHp as number || 0;
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    return {
      abilityId: 'BioMinefield',
      abilityName,
      category: 'summon',
      summonResult: { unitId: 'tyranSmnSporeMine', hp: summonHp, damage: 0, armor: 0, count: 3 },
      message: `${abilityName}: 3 Spore Mines (explode: ${minDmg}-${maxDmg} Bio)`,
    };
  },
};

/**
 * SporeMineLauncher (Biovore)
 * Launches Spore Mines at target
 */
export const SporeMineLauncherHandler: AbilityHandler = {
  abilityId: 'SporeMineLauncher',
  abilityName: 'Spore Mine Launcher',
  category: 'summon',
  cooldown: 0,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('SporeMineLauncher');
    const summonHp = values.summonHp as number || 0;
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    return {
      abilityId: 'SporeMineLauncher',
      abilityName,
      category: 'summon',
      summonResult: { unitId: 'tyranSmnSporeMine', hp: summonHp, damage: 0, armor: 0, count: 1 },
      message: `${abilityName}: Launch Spore Mine (explode: ${minDmg}-${maxDmg} Bio)`,
    };
  },
};

/**
 * FearOfTheUnseen (Deathleaper)
 * 3x DirectDamage ranged
 */
export const FearOfTheUnseenHandler: AbilityHandler = {
  abilityId: 'FearOfTheUnseen',
  abilityName: 'Fear of the Unseen',
  category: 'damage',
  cooldown: -1,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('FearOfTheUnseen');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    return {
      abilityId: 'FearOfTheUnseen',
      abilityName,
      category: 'damage',
      damageResult: { minDamage: minDmg, maxDamage: maxDmg, averageDamage: avgDmg, hits: 3, damageProfile: 'DirectDamage' as DamageType },
      attackType: 'ranged',
      rawDamage: true,
      message: `${abilityName}: Range 2 (raw damage, no crit)`,
    };
  },
};

/**
 * SpiritLeech (Neurothrope)
 * 1x Psychic ranged + heal
 */
export const SpiritLeechHandler: AbilityHandler = {
  abilityId: 'SpiritLeech',
  abilityName: 'Spirit Leech',
  category: 'damage',
  cooldown: -1,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('SpiritLeech');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const hpToHealPct = values.hpToHealPct as number || 40;
    return {
      abilityId: 'SpiritLeech',
      abilityName,
      category: 'damage',
      damageResult: { minDamage: minDmg, maxDamage: maxDmg, averageDamage: avgDmg, hits: 1, damageProfile: 'Psychic' as DamageType },
      attackType: 'ranged',
      message: `${abilityName}: Range 3, heals ${hpToHealPct}% of damage dealt`,
    };
  },
};

/**
 * ItItches (Parasite of Mortrex)
 * Summons Ripper Swarm
 */
export const ItItchesHandler: AbilityHandler = {
  abilityId: 'ItItches',
  abilityName: 'It Itches...',
  category: 'summon',
  cooldown: -1,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('ItItches');
    const summonHp = values.summonHp as number || 0;
    const summonDmg = values.summonDmg as number || 0;
    const summonArmor = values.summonArmor as number || 0;
    return {
      abilityId: 'ItItches',
      abilityName,
      category: 'summon',
      summonResult: { unitId: 'tyranSmnRipperSwarm', hp: summonHp, damage: summonDmg, armor: summonArmor, count: 1 },
      message: `${abilityName}: Summons Ripper Swarm`,
    };
  },
};

/**
 * CrushingClaws (Tyrant Guard)
 * 2x Piercing + 2x Physical melee
 */
export const CrushingClawsHandler: AbilityHandler = {
  abilityId: 'CrushingClaws',
  abilityName: 'Crushing Claws',
  category: 'damage',
  cooldown: -1,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('CrushingClaws');

    const piercing: DamageComponent = {
      minDamage: values.minDmg as number || 0,
      maxDamage: values.maxDmg as number || 0,
      averageDamage: Math.round(((values.minDmg as number || 0) + (values.maxDmg as number || 0)) / 2),
      hits: values.nrOfHits as number || 2,
      damageProfile: 'Piercing' as DamageType,
    };

    const physical: DamageComponent = {
      minDamage: values.minDmg_2 as number || 0,
      maxDamage: values.maxDmg_2 as number || 0,
      averageDamage: Math.round(((values.minDmg_2 as number || 0) + (values.maxDmg_2 as number || 0)) / 2),
      hits: values.nrOfHits_2 as number || 1,
      damageProfile: 'Physical' as DamageType,
    };

    return {
      abilityId: 'CrushingClaws',
      abilityName,
      category: 'damage',
      damageComponents: [piercing, physical],
      attackType: 'melee',
      message: abilityName,
    };
  },
};

/**
 * AlphaWarrior (Winged Prime)
 * Summons Tyranid Warrior
 */
export const AlphaWarriorHandler: AbilityHandler = {
  abilityId: 'AlphaWarrior',
  abilityName: 'Alpha Warrior',
  category: 'summon',
  cooldown: -1,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('AlphaWarrior');
    const summonHp = values.summonHp as number || 0;
    const summonDmg = values.summonDmg as number || 0;
    const summonArmor = values.summonArmor as number || 0;
    return {
      abilityId: 'AlphaWarrior',
      abilityName,
      category: 'summon',
      summonResult: { unitId: 'tyranSmnWarrior', hp: summonHp, damage: summonDmg, armor: summonArmor, count: 1 },
      message: `${abilityName}: Summons Tyranid Warrior`,
    };
  },
};

// ============= ORKS =============

/**
 * GrotTank (Gibbascrapz)
 * Summons a Grot Tank with stats scaling with rounds
 * Variables: summonHp, summonDmg, summonArmor, extraHp
 * Constants: unitId: orksGrotTank
 */
export const GrotTankHandler: AbilityHandler = {
  abilityId: 'GrotTank',
  abilityName: 'Grot Tank',
  category: 'summon',
  cooldown: -1,
  executeActive: (values: ComputedAbilityValues, context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('GrotTank');
    const summonHp = values.summonHp as number || 0;
    const summonDmg = values.summonDmg as number || 0;
    const summonArmor = values.summonArmor as number || 0;
    const extraHp = values.extraHp as number || 0;
    const currentTurn = context.currentTurn || 1;
    const totalHp = summonHp + (extraHp * currentTurn);
    return {
      abilityId: 'GrotTank',
      abilityName,
      category: 'summon',
      summonResult: { unitId: 'orksGrotTank', hp: totalHp, damage: summonDmg, armor: summonArmor, count: 1 },
      message: `${abilityName}: Grot Tank (HP: ${totalHp} [+${extraHp}/turn], Dmg: ${summonDmg}, Armor: ${summonArmor})`,
    };
  },
};

/**
 * SquigLaunchas (Rukkatrukk)
 * 3x Physical damage, can summon Large Squig if conditions met
 * Variables: minDmg, maxDmg, summonHp, summonDmg, summonArmor
 * Constants: damageProfile: Physical, nrOfHits: 3, unitId: orksSmnSquig
 * Note: Raw damage, no crit
 */
export const SquigLaunchasHandler: AbilityHandler = {
  abilityId: 'SquigLaunchas',
  abilityName: 'Squig Launchas',
  category: 'damage',
  cooldown: 1,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('SquigLaunchas');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const summonHp = values.summonHp as number || 0;
    const summonDmg = values.summonDmg as number || 0;
    return {
      abilityId: 'SquigLaunchas',
      abilityName,
      category: 'damage',
      damageResult: { minDamage: minDmg, maxDamage: maxDmg, averageDamage: avgDmg, hits: 3, damageProfile: 'Physical' as DamageType },
      attackType: 'ranged',
      rawDamage: true,
      message: `${abilityName}: 3x Physical (raw, no crit). May summon Large Squig (HP: ${summonHp}, Dmg: ${summonDmg})`,
    };
  },
};

/**
 * SquigMine (Rukkatrukk)
 * Creates trap mines that deal 3x Blast damage
 * Variables: minDmg, maxDmg, nrOfTiles
 * Constants: damageProfile: Blast, nrOfHits: 3, range: 2
 * Note: Raw damage, no crit
 */
export const SquigMineHandler: AbilityHandler = {
  abilityId: 'SquigMine',
  abilityName: 'Squig Mine',
  category: 'damage',
  cooldown: 1,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('SquigMine');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const nrOfTiles = values.nrOfTiles as number || 2;
    return {
      abilityId: 'SquigMine',
      abilityName,
      category: 'damage',
      damageResult: { minDamage: minDmg, maxDamage: maxDmg, averageDamage: avgDmg, hits: 3, damageProfile: 'Blast' as DamageType },
      attackType: 'ranged',
      rawDamage: true,
      message: `${abilityName}: Marks ${nrOfTiles + 1} hexes, 3x Blast on trigger (raw, no crit)`,
    };
  },
};

/**
 * DakkaDakkaDakka (Snappawrecka)
 * 6x+ Projectile ranged, gains extra hits per repair (max 16)
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Projectile, nrOfHits: 6, extraHits: 2, maxNrOfHits: 16, healthPct: 15
 * Note: Self-damages 15% HP
 */
export const DakkaDakkaDakkaHandler: AbilityHandler = {
  abilityId: 'DakkaDakkaDakka',
  abilityName: 'Dakka! Dakka! Dakka!',
  category: 'damage',
  cooldown: -1,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('DakkaDakkaDakka');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    return {
      abilityId: 'DakkaDakkaDakka',
      abilityName,
      category: 'damage',
      damageResult: { minDamage: minDmg, maxDamage: maxDmg, averageDamage: avgDmg, hits: 6, damageProfile: 'Projectile' as DamageType },
      attackType: 'ranged',
      message: `${abilityName}: 6x Projectile (+2 per repair, max 16). Costs 15% HP. Overflow hits random enemies`,
    };
  },
};

/**
 * GetEmRuntz (Snotflogga)
 * Summons Grots adjacent to enemies
 * Variables: summonHp, summonDmg, summonArmor
 * Constants: unitId: orksGrot
 */
export const GetEmRuntzHandler: AbilityHandler = {
  abilityId: 'GetEmRuntz',
  abilityName: "Get 'Em Runtz",
  category: 'summon',
  cooldown: -1,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('GetEmRuntz');
    const summonHp = values.summonHp as number || 0;
    const summonDmg = values.summonDmg as number || 0;
    return {
      abilityId: 'GetEmRuntz',
      abilityName,
      category: 'summon',
      summonResult: { unitId: 'orksGrot', hp: summonHp, damage: summonDmg, armor: 0, count: 1 },
      message: `${abilityName}: Summons Grots near enemies (HP: ${summonHp}, Dmg: ${summonDmg}). Grots immediately attack, apply Taunt`,
    };
  },
};

/**
 * UnstoppableMomentumReworked (Tanksmasha)
 * Charge attack: 1x Direct damage + extraDmg per hex traversed
 * Variables: minDmg, maxDmg, extraDmg
 * Constants: damageProfile: DirectDamage, nrOfHits: 1, initialCooldownTurns: 1
 */
export const UnstoppableMomentumReworkedHandler: AbilityHandler = {
  abilityId: 'UnstoppableMomentumReworked',
  abilityName: 'Unstoppable Momentum',
  category: 'damage',
  cooldown: 1,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('UnstoppableMomentumReworked');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const extraDmg = values.extraDmg as number || 0;
    return {
      abilityId: 'UnstoppableMomentumReworked',
      abilityName,
      category: 'damage',
      damageResult: { minDamage: minDmg, maxDamage: maxDmg, averageDamage: avgDmg, hits: 1, damageProfile: 'DirectDamage' as DamageType },
      attackType: 'melee',
      message: `${abilityName}: Charge in line, 1x Direct (+${extraDmg}/hex). Pushes, Suppresses (Stuns BigTarget)`,
    };
  },
};

// ============= BLACK LEGION =============

/**
 * BringerOfDespair (Angrax)
 * 4x Power melee to target + 4x Power to random adjacent enemy
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Power, nrOfHits: 4, nrOfHits_2: 4
 */
export const BringerOfDespairHandler: AbilityHandler = {
  abilityId: 'BringerOfDespair',
  abilityName: 'Bringer of Despair',
  category: 'damage',
  cooldown: -1,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('BringerOfDespair');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    return {
      abilityId: 'BringerOfDespair',
      abilityName,
      category: 'damage',
      damageResult: { minDamage: minDmg, maxDamage: maxDmg, averageDamage: avgDmg, hits: 4, damageProfile: 'Power' as DamageType },
      attackType: 'melee',
      message: `${abilityName}: 4x Power + 4x Power to adjacent enemy. Double Battle Fatigue`,
    };
  },
};

/**
 * Incursion (Archimatos)
 * Summons Bloodletters near target enemy
 * Variables: summonHp, summonDmg, summonArmor
 * Constants: range: 2, unitId: blackSmnBloodletter, maxSummons: 6
 */
export const IncursionHandler: AbilityHandler = {
  abilityId: 'Incursion',
  abilityName: 'Daemonic Incursion',
  category: 'summon',
  cooldown: -1,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('Incursion');
    const summonHp = values.summonHp as number || 0;
    const summonDmg = values.summonDmg as number || 0;
    return {
      abilityId: 'Incursion',
      abilityName,
      category: 'summon',
      summonResult: { unitId: 'blackSmnBloodletter', hp: summonHp, damage: summonDmg, armor: 0, count: 1 },
      message: `${abilityName}: Summons Bloodletters (max 6, HP: ${summonHp}). Immediate attack`,
    };
  },
};

/**
 * HadesAutocannons (Forgefiend)
 * 6x Flame ranged vs summons, extra crit damage
 * Variables: minDmg, maxDmg, extraCritDmg
 * Constants: damageProfile: Flame, nrOfHits: 6, munitionsCost: 1
 */
export const HadesAutocannonsHandler: AbilityHandler = {
  abilityId: 'HadesAutocannons',
  abilityName: 'Hades Autocannons',
  category: 'damage',
  cooldown: 0,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('HadesAutocannons');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const extraCritDmg = values.extraCritDmg as number || 0;
    return {
      abilityId: 'HadesAutocannons',
      abilityName,
      category: 'damage',
      damageResult: { minDamage: minDmg, maxDamage: maxDmg, averageDamage: avgDmg, hits: 6, damageProfile: 'Flame' as DamageType },
      attackType: 'ranged',
      message: `${abilityName}: 6x Flame vs summons (+${extraCritDmg} Crit Dmg). Costs 1 munition`,
    };
  },
};

/**
 * DaemonicOrdnance (Forgefiend)
 * 3x Flame ranged, AoE
 * Variables: minDmg, maxDmg, extraCritDmg
 * Constants: damageProfile: Flame, nrOfHits: 3, range: 2
 */
export const DaemonicOrdnanceHandler: AbilityHandler = {
  abilityId: 'DaemonicOrdnance',
  abilityName: 'Daemonic Ordnance',
  category: 'damage',
  cooldown: 0,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('DaemonicOrdnance');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const extraCritDmg = values.extraCritDmg as number || 0;
    return {
      abilityId: 'DaemonicOrdnance',
      abilityName,
      category: 'damage',
      damageResult: { minDamage: minDmg, maxDamage: maxDmg, averageDamage: avgDmg, hits: 3, damageProfile: 'Flame' as DamageType },
      attackType: 'ranged',
      message: `${abilityName}: 3x Flame AoE (+${extraCritDmg} Crit Dmg). Costs 1 munition`,
    };
  },
};

/**
 * HeraldOfTheApocalypse (Haarken)
 * 2x Piercing melee, also hits enemy directly behind target
 * Variables: minDmg, maxDmg, extraDmg
 * Constants: damageProfile: Piercing, nrOfHits: 2, range: 2 (for Battle Fatigue)
 */
export const HeraldOfTheApocalypseHandler: AbilityHandler = {
  abilityId: 'HeraldOfTheApocalypse',
  abilityName: 'Herald of the Apocalypse',
  category: 'damage',
  cooldown: -1,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('HeraldOfTheApocalypse');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const extraDmg = values.extraDmg as number || 0;
    return {
      abilityId: 'HeraldOfTheApocalypse',
      abilityName,
      category: 'damage',
      damageResult: { minDamage: minDmg, maxDamage: maxDmg, averageDamage: avgDmg, hits: 2, damageProfile: 'Piercing' as DamageType },
      attackType: 'melee',
      bossDebuff: { extraDmg },
      message: `${abilityName}: 2x Piercing + enemy behind. +${extraDmg} to next attack on target. Battle Fatigue`,
    };
  },
};

/**
 * FrenziedFiring (Volk)
 * 1x+ Heavy ranged, extra hits for adjacent free hexes (max 10)
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: HeavyRound, nrOfHits: 1, maxNrOfHits: 10, range: 3
 */
export const FrenziedFiringHandler: AbilityHandler = {
  abilityId: 'FrenziedFiring',
  abilityName: 'Frenzied Firing',
  category: 'damage',
  cooldown: -1,
  executeActive: (values: ComputedAbilityValues, context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('FrenziedFiring');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const freeHexes = context.abilityToggles?.['FrenziedFiring_freeHexes'] as number || 0;
    const hits = Math.min(1 + freeHexes, 10);
    return {
      abilityId: 'FrenziedFiring',
      abilityName,
      category: 'damage',
      damageResult: { minDamage: minDmg, maxDamage: maxDmg, averageDamage: avgDmg, hits, damageProfile: 'HeavyRound' as DamageType },
      attackType: 'ranged',
      message: `${abilityName}: ${hits}x HeavyRound (${freeHexes} free hexes). FleshmetalGuns bonus`,
    };
  },
};

// ============= WORLD EATERS =============

/**
 * OverwhelmingWrath (Azkor)
 * 2x Eviscerate melee to all adjacent, Taunts, reduces ranged damage
 * Variables: minDmg, maxDmg, dmgReductionPct
 * Constants: damageProfile: Eviscerate, nrOfHits: 2
 */
export const OverwhelmingWrathHandler: AbilityHandler = {
  abilityId: 'OverwhelmingWrath',
  abilityName: 'Overwhelming Wrath',
  category: 'damage',
  cooldown: -1,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('OverwhelmingWrath');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const dmgReductionPct = values.dmgReductionPct as number || 24;
    return {
      abilityId: 'OverwhelmingWrath',
      abilityName,
      category: 'damage',
      damageResult: { minDamage: minDmg, maxDamage: maxDmg, averageDamage: avgDmg, hits: 2, damageProfile: 'Eviscerate' as DamageType },
      attackType: 'melee',
      message: `${abilityName}: Taunts all adjacent, -${dmgReductionPct}% ranged dmg taken. 2x Eviscerate next turn`,
    };
  },
};

/**
 * JakhalStimms (Macer)
 * 4x Physical melee to target + adjacent enemies, doesn't end turn
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Physical, nrOfHits: 4, hpPct: 25
 */
export const JakhalStimmsHandler: AbilityHandler = {
  abilityId: 'JakhalStimms',
  abilityName: 'Jakhal Stimms',
  category: 'damage',
  cooldown: -1,
  endsTurn: false,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('JakhalStimms');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    return {
      abilityId: 'JakhalStimms',
      abilityName,
      category: 'damage',
      damageResult: { minDamage: minDmg, maxDamage: maxDmg, averageDamage: avgDmg, hits: 4, damageProfile: 'Physical' as DamageType },
      attackType: 'melee',
      message: `${abilityName}: 4x Physical to target + shared adjacent. Costs 25% HP. No turn end`,
    };
  },
};

/**
 * MurderousSwing (Tarvakh)
 * 1x Piercing melee to all adjacent, +extraDmg if single target
 * Variables: minDmg, maxDmg, extraDmg
 * Constants: damageProfile: Piercing, nrOfHits: 1
 */
export const MurderousSwingHandler: AbilityHandler = {
  abilityId: 'MurderousSwing',
  abilityName: 'Murderous Swing',
  category: 'damage',
  cooldown: -1,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('MurderousSwing');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const extraDmg = values.extraDmg as number || 0;
    return {
      abilityId: 'MurderousSwing',
      abilityName,
      category: 'damage',
      damageResult: { minDamage: minDmg, maxDamage: maxDmg, averageDamage: avgDmg, hits: 1, damageProfile: 'Piercing' as DamageType },
      attackType: 'melee',
      message: `${abilityName}: 1x Piercing to all adjacent. +${extraDmg} Dmg if single target`,
    };
  },
};

/**
 * BloodyFury (Wrask)
 * 1x+ Chain melee, +1 hit per time attacked (max 8)
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Chain, nrOfHits: 1, extraHit: 1, maxNrOfHits: 8
 */
export const BloodyFuryHandler: AbilityHandler = {
  abilityId: 'BloodyFury',
  abilityName: 'Bloody Fury',
  category: 'damage',
  cooldown: -1,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('BloodyFury');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    return {
      abilityId: 'BloodyFury',
      abilityName,
      category: 'damage',
      damageResult: { minDamage: minDmg, maxDamage: maxDmg, averageDamage: avgDmg, hits: 1, damageProfile: 'Chain' as DamageType },
      attackType: 'melee',
      message: `${abilityName}: 1x Chain (+1 hit per attack taken, max 8). Overflow to adjacent enemies`,
    };
  },
};

// =====================
// DEATHGUARD ABILITIES
// =====================

/**
 * Poxwalkers (Corrodius)
 * Summons Poxwalkers in 15-25% of free hexes within Contagion aura
 * Variables: summonHp, summonDmg, chance, chance_2
 * Constants: unitId: deathPoxwalker
 */
export const PoxwalkersHandler: AbilityHandler = {
  abilityId: 'Poxwalkers',
  abilityName: 'Poxwalkers',
  category: 'summon',
  cooldown: -1,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('Poxwalkers');
    const summonHp = values.summonHp as number || 0;
    const summonDmg = values.summonDmg as number || 0;
    const chance = values.chance as number || 15;
    const chance2 = values.chance_2 as number || 25;
    return {
      abilityId: 'Poxwalkers',
      abilityName,
      category: 'summon',
      summonResult: { unitId: 'deathPoxwalker', hp: summonHp, damage: summonDmg, armor: 0, count: 1 },
      message: `${abilityName}: Summons Poxwalkers in ${chance}-${chance2}% of free hexes in Contagion aura (HP: ${summonHp}, Dmg: ${summonDmg}). Attack immediately.`,
    };
  },
};

/**
 * FlailSwing (Maladus)
 * 3x Power damage, triggers Haze of Corruption on kill, always overkills
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Power, nrOfHits: 3
 */
export const FlailSwingHandler: AbilityHandler = {
  abilityId: 'FlailSwing',
  abilityName: 'Flail Swing',
  category: 'damage',
  cooldown: -1,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('FlailSwing');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    return {
      abilityId: 'FlailSwing',
      abilityName,
      category: 'damage',
      damageResult: { minDamage: minDmg, maxDamage: maxDmg, averageDamage: avgDmg, hits: 3, damageProfile: 'Power' as DamageType },
      attackType: 'melee',
      message: `${abilityName}: 3x Power. Triggers Haze of Corruption on kill. Always overkills`,
    };
  },
};

/**
 * RevitalizingMalignancy (Nauseous)
 * Heals self and adjacent allies. Extra healing for Chaos. No healing for Imperial.
 * Variables: hpToHeal, hpToHeal_2
 */
export const RevitalizingMalignancyHandler: AbilityHandler = {
  abilityId: 'RevitalizingMalignancy',
  abilityName: 'Revitalising Malignancy',
  category: 'buff',
  cooldown: -1,
  endsTurn: true,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('RevitalizingMalignancy');
    const hpToHeal = values.hpToHeal as number || 0;
    const hpToHeal2 = values.hpToHeal_2 as number || 0;
    return {
      abilityId: 'RevitalizingMalignancy',
      abilityName,
      category: 'buff',
      buffResult: {
        effect: {},
        duration: 0,
      },
      message: `${abilityName}: Heals ${hpToHeal} HP (Chaos: +${hpToHeal2} extra). No heal for Imperial`,
    };
  },
};

/**
 * FoulInfusion (Pestillian)
 * Grants 1x Toxic hit to melee attacks for self and Chaos allies in Contagion.
 * Then performs melee attack against random adjacent enemy.
 * Variables: dmg
 * Constants: damageProfile: Toxic, nrOfHits: 1
 */
export const FoulInfusionHandler: AbilityHandler = {
  abilityId: 'FoulInfusion',
  abilityName: 'Foul Infusion',
  category: 'buff',
  cooldown: -1,
  endsTurn: false,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('FoulInfusion');
    const dmg = values.dmg as number || 0;
    return {
      abilityId: 'FoulInfusion',
      abilityName,
      category: 'buff',
      buffResult: {
        effect: {},
        duration: 2, // This round and next
      },
      message: `${abilityName}: +1x ${dmg} Toxic on melee (2 turns)`,
    };
  },
};

/**
 * EntropyCannons (Plagueburst Crawler)
 * 2x Energy damage to target with reduced armor or in Contagion.
 * Raw damage (no crit, no modifiers). Costs 1 munition.
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Energy, nrOfHits: 2, munitionsCost: 1
 */
export const EntropyCannsHandler: AbilityHandler = {
  abilityId: 'EntropyCannons',
  abilityName: 'Entropy Cannons',
  category: 'damage',
  cooldown: 0, // No cooldown, but costs munitions
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('EntropyCannons');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    return {
      abilityId: 'EntropyCannons',
      abilityName,
      category: 'damage',
      damageResult: { minDamage: minDmg, maxDamage: maxDmg, averageDamage: avgDmg, hits: 2, damageProfile: 'Energy' as DamageType },
      attackType: 'ranged',
      message: `${abilityName}: 2x Energy (raw, no crit). Target must have reduced Armor or be in Contagion. Costs 1 munition`,
    };
  },
};

/**
 * PlagueburstMortar (Plagueburst Crawler)
 * 3x Toxic AoE damage to enemies in target hex + adjacent in Contagion/reduced armor.
 * Raw damage (no crit, no modifiers). Adds Contamination tiles.
 * Variables: minDmg, maxDmg, nrOfTiles
 * Constants: damageProfile: Toxic, nrOfHits: 3, initialCooldownTurns: 1
 */
export const PlagueburstMortarHandler: AbilityHandler = {
  abilityId: 'PlagueburstMortar',
  abilityName: 'Plagueburst Mortar',
  category: 'damage',
  cooldown: 0, // Note: has initial cooldown of 1 turn
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('PlagueburstMortar');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const nrOfTiles = values.nrOfTiles as number || 3;
    return {
      abilityId: 'PlagueburstMortar',
      abilityName,
      category: 'damage',
      damageResult: { minDamage: minDmg, maxDamage: maxDmg, averageDamage: avgDmg, hits: 3, damageProfile: 'Toxic' as DamageType },
      attackType: 'ranged',
      message: `${abilityName}: 3x Toxic AoE (raw, no crit). Adds ${nrOfTiles} Contamination tiles. Suppresses. Initial CD: 1`,
    };
  },
};

/**
 * PlagueWind (Typhus)
 * 1x Psychic to target. Raw damage (no crit, no modifiers).
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Psychic, nrOfHits: 1, range: 2
 */
export const PlagueWindHandler: AbilityHandler = {
  abilityId: 'PlagueWind',
  abilityName: 'Plague Wind',
  category: 'damage',
  cooldown: -1,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('PlagueWind');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    return {
      abilityId: 'PlagueWind',
      abilityName,
      category: 'damage',
      damageResult: { minDamage: minDmg, maxDamage: maxDmg, averageDamage: avgDmg, hits: 1, damageProfile: 'Psychic' as DamageType },
      rawDamage: true,
      attackType: 'ranged',
      message: abilityName,
    };
  },
};

// ======================
// THOUSANDSONS ABILITIES
// ======================

/**
 * MasterOfTheTutelaries (Abraxas)
 * Summons Pink Horror and Screamer.
 * Variables: summonHp, summonDmg, summonHp_2, summonDmg_2
 * Constants: unitId: thousSmnPinkHorror, unitId_2: thousSmnScreamer
 */
export const MasterOfTheTutelariesHandler: AbilityHandler = {
  abilityId: 'MasterOfTheTutelaries',
  abilityName: 'Malefic Maelstrom',
  category: 'summon',
  cooldown: -1,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('MasterOfTheTutelaries');
    const summonHp = values.summonHp as number || 0;
    const summonDmg = values.summonDmg as number || 0;
    const summonHp2 = values.summonHp_2 as number || 0;
    const summonDmg2 = values.summonDmg_2 as number || 0;
    return {
      abilityId: 'MasterOfTheTutelaries',
      abilityName,
      category: 'summon',
      summonResult: { unitId: 'thousSmnPinkHorror', hp: summonHp, damage: summonDmg, armor: 0, count: 1 },
      additionalSummons: [
        { unitId: 'thousSmnScreamer', hp: summonHp2, damage: summonDmg2, armor: 0, count: 1 },
      ],
      message: `${abilityName}: Pink Horror (HP: ${summonHp}, Dmg: ${summonDmg}) + Screamer (HP: ${summonHp2}, Dmg: ${summonDmg2})`,
    };
  },
};

/**
 * Doombolt (Ahriman)
 * 3x Psychic split between all enemies in range 2. +1 hit per Fire hex (max 9).
 * Resets on ranged kill after use.
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Psychic, nrOfHits: 3, range: 2
 */
export const DoomboltHandler: AbilityHandler = {
  abilityId: 'Doombolt',
  abilityName: 'Doombolt',
  category: 'damage',
  cooldown: -1,
  executeActive: (values: ComputedAbilityValues, context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('Doombolt');
    const fireHexes = (context.abilityToggles?.['Doombolt_fireHexes'] as unknown as number) ?? 0;
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const hits = 3 + fireHexes;
    return {
      abilityId: 'Doombolt',
      abilityName,
      category: 'damage',
      damageResult: { minDamage: minDmg, maxDamage: maxDmg, averageDamage: avgDmg, hits, damageProfile: 'Psychic' as DamageType },
      attackType: 'ranged',
      message: `${abilityName}: ${hits}x Psychic split to all enemies in range 2. +1 hit per Fire hex (max 9). Resets on ranged kill`,
    };
  },
};

/**
 * AttemptedPossession (Thaumachus)
 * Possess enemy and its summons, they attack closest enemy.
 * Variables: dmgPct, maxDmg, extraDmg
 * Constants: range: 2
 */
export const AttemptedPossessionHandler: AbilityHandler = {
  abilityId: 'AttemptedPossession',
  abilityName: 'Attempted Possession',
  category: 'damage',
  cooldown: -1,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('AttemptedPossession');
    const dmgPct = values.dmgPct as number || 80;
    const maxDmg = values.maxDmg as number || 0;
    return {
      abilityId: 'AttemptedPossession',
      abilityName,
      category: 'damage',
      damageResult: { minDamage: 0, maxDamage: maxDmg, averageDamage: Math.round(maxDmg / 2), hits: 1, damageProfile: 'Physical' as DamageType },
      attackType: 'ranged',
      message: `${abilityName}: Possess enemy + summons. They attack at ${dmgPct}% dmg (max ${maxDmg}/hit)`,
    };
  },
};

/**
 * HellfyreMissileRack (Toth)
 * 1x Heavy to target + 1x Heavy to each enemy that took Psychic damage this turn.
 * Raw damage (no crit, no modifiers).
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: HeavyRound, range: 3, nrOfHits: 1
 */
export const HellfyreMissileRackHandler: AbilityHandler = {
  abilityId: 'HellfyreMissileRack',
  abilityName: 'Hellfyre Missile Rack',
  category: 'damage',
  cooldown: -1,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('HellfyreMissileRack');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    return {
      abilityId: 'HellfyreMissileRack',
      abilityName,
      category: 'damage',
      damageResult: { minDamage: minDmg, maxDamage: maxDmg, averageDamage: avgDmg, hits: 1, damageProfile: 'HeavyRound' as DamageType },
      attackType: 'ranged',
      message: `${abilityName}: 1x Heavy (raw). Also hits each enemy that took Psychic dmg this turn`,
    };
  },
};

/**
 * SorcerousFacade (Yazaghor)
 * Buff self and target Psyker with +1x Psychic hit on normal attacks.
 * Then attack closest enemy and swap positions with target.
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Psychic, nrOfHits: 1
 */
export const SorcerousFacadeHandler: AbilityHandler = {
  abilityId: 'SorcerousFacade',
  abilityName: 'Sorcerous Facade',
  category: 'buff',
  cooldown: -1,
  endsTurn: false,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('SorcerousFacade');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    return {
      abilityId: 'SorcerousFacade',
      abilityName,
      category: 'buff',
      buffResult: {
        effect: {},
        duration: 1,
      },
      message: `${abilityName}: Self + target Psyker get +1x ${minDmg}-${maxDmg} Psychic on attacks. Swap positions after attack`,
    };
  },
};

/**
 * AetherStride (Z'Kar)
 * Summons Z'Kar as stationary unit. If adjacent to Psyker, attacks immediately.
 * Variables: summonHp, summonDmg, summonArmor
 * Constants: unitId: thousSmnDaemonPrince, initialCooldownTurns: 1, munitionsCost: 1
 */
export const AetherStrideHandler: AbilityHandler = {
  abilityId: 'AetherStride',
  abilityName: 'Aether Stride',
  category: 'summon',
  cooldown: 0, // No cooldown but costs munitions
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('AetherStride');
    const summonHp = values.summonHp as number || 0;
    const summonDmg = values.summonDmg as number || 0;
    const summonArmor = values.summonArmor as number || 0;
    return {
      abilityId: 'AetherStride',
      abilityName,
      category: 'summon',
      summonResult: { unitId: 'thousSmnDaemonPrince', hp: summonHp, damage: summonDmg, armor: summonArmor, count: 1 },
      message: `${abilityName}: Z'Kar (HP: ${summonHp}, Dmg: ${summonDmg}, Armor: ${summonArmor}). Attacks if adj to Psyker. Costs 1 munition`,
    };
  },
};

/**
 * InfernalCannon (Z'Kar)
 * 3x Flame to all enemies on Fire or hit by Psychic this turn.
 * Raw damage (no crit, no modifiers). Adds Fire to target hex.
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Flame, nrOfHits: 3, initialCooldownTurns: 1
 */
export const InfernalCannonHandler: AbilityHandler = {
  abilityId: 'InfernalCannon',
  abilityName: 'Infernal Cannon',
  category: 'damage',
  cooldown: 0, // Note: has initial cooldown of 1 turn
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('InfernalCannon');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    return {
      abilityId: 'InfernalCannon',
      abilityName,
      category: 'damage',
      damageResult: { minDamage: minDmg, maxDamage: maxDmg, averageDamage: avgDmg, hits: 3, damageProfile: 'Flame' as DamageType },
      attackType: 'ranged',
      message: `${abilityName}: 3x Flame (raw) to enemies on Fire or hit by Psychic. Adds Fire. Initial CD: 1`,
    };
  },
};

// =========================
// EMPERORSCHILDREN ABILITIES
// =========================

/**
 * DoomSiren (Adamatar)
 * 3x Direct to adjacent + up to 2 enemies adjacent to target.
 * Grants +1 hit per enemy Overkilled for rest of battle.
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: DirectDamage, nrOfHits: 3, nrOfUnits: 2, extraHit: 1
 */
export const DoomSirenHandler: AbilityHandler = {
  abilityId: 'DoomSiren',
  abilityName: 'Doom Siren',
  category: 'damage',
  cooldown: -1,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('DoomSiren');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    return {
      abilityId: 'DoomSiren',
      abilityName,
      category: 'damage',
      damageResult: { minDamage: minDmg, maxDamage: maxDmg, averageDamage: avgDmg, hits: 3, damageProfile: 'DirectDamage' as DamageType },
      attackType: 'melee',
      message: `${abilityName}: 3x Direct to adj + up to 2 more enemies adj to target. +1 hit per overkill for battle`,
    };
  },
};

/**
 * DaemonicPatrons (Hascule)
 * Taunts adj enemy. Gets +dmg/-dmgPct% per Taunted enemy while watched.
 * Can reuse if kills Taunted enemy, else loses HP.
 * Variables: extraDmg, dmgReductionPct, hpPct
 * Constants: nrOfRounds: 1
 */
export const DaemonicPatronsHandler: AbilityHandler = {
  abilityId: 'DaemonicPatrons',
  abilityName: 'Daemonic Patrons',
  category: 'buff',
  cooldown: -1,
  endsTurn: false,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('DaemonicPatrons');
    const extraDmg = values.extraDmg as number || 0;
    const dmgReductionPct = values.dmgReductionPct as number || 20;
    const hpPct = values.hpPct as number || 50;
    return {
      abilityId: 'DaemonicPatrons',
      abilityName,
      category: 'buff',
      buffResult: {
        effect: { baseDamageBonus: extraDmg },
        duration: 1,
      },
      message: `${abilityName}: Taunt adj enemy. +${extraDmg} dmg, -${dmgReductionPct}% taken per Taunted. Reuse on Taunted kill, else -${hpPct}% HP`,
    };
  },
};

/**
 * LashOfTorment (Lucius)
 * 6x Eviscerate to enemy in range 2. Pulls target 1 hex, taunts if adjacent.
 * Variables: minDmg, maxDmg, nrOfRounds
 * Constants: damageProfile: Eviscerate, nrOfHits: 6, range: 2
 */
export const LashOfTormentHandler: AbilityHandler = {
  abilityId: 'LashOfTorment',
  abilityName: 'Lash of Torment',
  category: 'damage',
  cooldown: -1,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('LashOfTorment');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const nrOfRounds = values.nrOfRounds as number || 1;
    return {
      abilityId: 'LashOfTorment',
      abilityName,
      category: 'damage',
      damageResult: { minDamage: minDmg, maxDamage: maxDmg, averageDamage: avgDmg, hits: 6, damageProfile: 'Eviscerate' as DamageType },
      attackType: 'ranged',
      message: `${abilityName}: 6x Eviscerate (range 2). Pulls target 1 hex toward Lucius, Taunts ${nrOfRounds} round if adj`,
    };
  },
};

/**
 * ExcruciatingFrequencies (Shiron)
 * 1x Blast to all enemies in 3 hex line. +extraCritChance% per unit on affected hexes. Suppresses.
 * Variables: minDmg, maxDmg, extraCritChance
 * Constants: damageProfile: Blast, nrOfHits: 1, nrOfTiles: 3
 */
export const ExcruciatingFrequenciesHandler: AbilityHandler = {
  abilityId: 'ExcruciatingFrequencies',
  abilityName: 'Excruciating Frequencies',
  category: 'damage',
  cooldown: -1,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('ExcruciatingFrequencies');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const extraCritChance = values.extraCritChance as number || 20;
    return {
      abilityId: 'ExcruciatingFrequencies',
      abilityName,
      category: 'damage',
      damageResult: { minDamage: minDmg, maxDamage: maxDmg, averageDamage: avgDmg, hits: 1, damageProfile: 'Blast' as DamageType },
      attackType: 'ranged',
      message: `${abilityName}: 1x Blast to 3 hex line. +${extraCritChance}% crit per unit in line. Suppresses`,
    };
  },
};

// ==================== Genestealers ====================

/**
 * CultDemagogue (Isaak)
 * Targets enemy within range, places decoys, summons Neophyte Hybrids on half of decoys
 * Variables: nrOfSummons (decoys), summonHp_2, summonDmg_2, summonArmor_2
 * Constants: unitId_2 = "genesSmnNeophyte", range, range_2, unitId = "genesSmnDecoy"
 */
export const CultDemagogueHandler: AbilityHandler = {
  abilityId: 'CultDemagogue',
  abilityName: 'Cult Demagogue',
  category: 'summon',
  cooldown: -1,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('CultDemagogue');
    const nrOfSummons = values.nrOfSummons as number || 4;
    return {
      abilityId: 'CultDemagogue',
      abilityName,
      category: 'summon',
      summonResult: {
        unitId: 'genesSmnNeophyte',
        hp: values.summonHp_2 as number || 0,
        damage: values.summonDmg_2 as number || 0,
        armor: values.summonArmor_2 as number || 0,
        count: Math.ceil(nrOfSummons / 2), // Half of decoys become summons
      },
      message: `${abilityName}: Places up to ${nrOfSummons} decoys within 2 hexes of target, then summons Neophyte Hybrids on half of them`,
    };
  },
};

/**
 * HeroicFusillade (Judh)
 * Targets enemy, moves to free surrounding hex, deals 6x Projectile to target and surrounding enemies
 * Variables: minDmg, maxDmg, extraCritDmg
 * Constants: damageProfile = "Projectile", range = "2", nrOfHits = "6"
 */
export const HeroicFusilladeHandler: AbilityHandler = {
  abilityId: 'HeroicFusillade',
  abilityName: 'Heroic Fusillade',
  category: 'damage',
  cooldown: -1,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('HeroicFusillade');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const extraCritDmg = values.extraCritDmg as number || 0;
    return {
      abilityId: 'HeroicFusillade',
      abilityName,
      category: 'damage',
      damageResult: { minDamage: minDmg, maxDamage: maxDmg, averageDamage: avgDmg, hits: 6, damageProfile: 'Projectile' as DamageType },
      attackType: 'ranged',
      message: `${abilityName}: 6x Projectile to target + surrounding enemies. +${extraCritDmg} crit dmg per free hex around target`,
    };
  },
};

/**
 * MightFromBelow (The Patermine)
 * Deals 5x Psychic damage to adjacent enemy, summons Purestrain Genestealers on adjacent decoys
 * Variables: minDmg, maxDmg, summonHp, summonDmg, summonArmor
 * Constants: damageProfile = "Psychic", nrOfHits = "5", unitId = "genesSmnGenestealer"
 */
export const MightFromBelowHandler: AbilityHandler = {
  abilityId: 'MightFromBelow',
  abilityName: 'Might From Below',
  category: 'damage',
  cooldown: -1,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('MightFromBelow');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    return {
      abilityId: 'MightFromBelow',
      abilityName,
      category: 'damage',
      damageResult: { minDamage: minDmg, maxDamage: maxDmg, averageDamage: avgDmg, hits: 5, damageProfile: 'Psychic' as DamageType },
      attackType: 'melee',
      // Also summons Purestrain Genestealers - tracked separately
      summonResult: {
        unitId: 'genesSmnGenestealer',
        hp: values.summonHp as number || 0,
        damage: values.summonDmg as number || 0,
        armor: values.summonArmor as number || 0,
      },
      message: `${abilityName}: 5x Psychic (melee, ignores modifiers). Summons Genestealers on adjacent decoys`,
    };
  },
};

/**
 * MindControl (Xybia)
 * Debuff: Target deals less damage, takes more damage, gets taunted
 * Variables: dmgReduction, extraDmgPct
 * Constants: range = "3"
 */
export const MindControlHandler: AbilityHandler = {
  abilityId: 'MindControl',
  abilityName: 'Mind Control',
  category: 'buff',
  cooldown: -1,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('MindControl');
    const dmgReduction = values.dmgReduction as number || 0;
    const extraDmgPct = values.extraDmgPct as number || 10;
    return {
      abilityId: 'MindControl',
      abilityName,
      category: 'buff',
      buffResult: {
        effect: {
          // This is a debuff on enemy - tracking as informational
        },
        duration: 2, // This round and next
      },
      message: `${abilityName}: Target (within 3, adj to friendly) deals -${dmgReduction} dmg, takes +${extraDmgPct}% dmg, Taunted for 2 rounds`,
    };
  },
};

// ==================== LeaguesOfVotann ====================

/**
 * AncestralFortune (Uthar)
 * Deals 3x Plasma damage, grants +extraCritChance% crit for the turn.
 * Variables: extraCritChance, extraBlockChance, minDmg, maxDmg, nrOfAttacks (6)
 * Constants: nrOfHits: 3, damageProfile: Plasma
 */
export const AncestralFortuneHandler: AbilityHandler = {
  abilityId: 'AncestralFortune',
  abilityName: 'Ancestral Fortune',
  category: 'damage',
  cooldown: -1,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('AncestralFortune');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const extraCritChance = values.extraCritChance as number || 15;
    return {
      abilityId: 'AncestralFortune',
      abilityName,
      category: 'damage',
      damageResult: { minDamage: minDmg, maxDamage: maxDmg, averageDamage: avgDmg, hits: 3, damageProfile: 'Plasma' as DamageType },
      abilityModifiers: { critChanceBonus: extraCritChance },
      buffResult: {
        effect: {
          critChanceBonus: extraCritChance,
        },
        duration: 1,
      },
      attackType: 'melee',
      message: abilityName,
    };
  },
};

/**
 * GravitonRifle (Vynn)
 * Deals 3x Physical damage, suppresses target for 1 round.
 * +extraPierceRatio% pierce against Mechanical targets.
 * Variables: minDmg, maxDmg, extraPierceRatio
 * Constants: nrOfHits: 3, damageProfile: Physical, range: 2, nrOfRounds: 1
 */
export const GravitonRifleHandler: AbilityHandler = {
  abilityId: 'GravitonRifle',
  abilityName: 'Graviton Rifle',
  category: 'damage',
  cooldown: -1,
  executeActive: (values: ComputedAbilityValues, context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('GravitonRifle');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const extraPierceRatio = values.extraPierceRatio as number || 40;
    const isMechanical = context.bossTraits?.includes('Mechanical') ?? false;
    return {
      abilityId: 'GravitonRifle',
      abilityName,
      category: 'damage',
      damageResult: { minDamage: minDmg, maxDamage: maxDmg, averageDamage: avgDmg, hits: 3, damageProfile: 'Physical' as DamageType },
      abilityModifiers: isMechanical ? { pierceRatioBonus: extraPierceRatio } : undefined,
      attackType: 'ranged',
      message: abilityName,
    };
  },
};

/**
 * IronkinSteeljack (Ammuk)
 * Summons an Ironkin Steeljack in a free adjacent hex.
 * Variables: summonHp, summonDmg, summonArmor
 * Constants: unitId: votanSmnSteeljack
 */
export const IronkinSteeljackHandler: AbilityHandler = {
  abilityId: 'IronkinSteeljack',
  abilityName: 'Ironkin Steeljack',
  category: 'summon',
  cooldown: -1,
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('IronkinSteeljack');
    const summonHp = values.summonHp as number || 0;
    const summonDmg = values.summonDmg as number || 0;
    const summonArmor = values.summonArmor as number || 0;
    return {
      abilityId: 'IronkinSteeljack',
      abilityName,
      category: 'summon',
      summonResult: {
        unitId: 'votanSmnSteeljack',
        hp: summonHp,
        damage: summonDmg,
        armor: summonArmor,
        count: 1,
      },
      message: abilityName,
    };
  },
};

// ==================== AdeptusMechanicus ====================

/**
 * SentinelDirectives (Sy-gex)
 * Deals 1x Physical damage, suppresses, doesn't end turn, can't be used with adjacent enemies
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Physical, nrOfHits: 1, range: 3
 */
export const SentinelDirectivesHandler: AbilityHandler = {
  abilityId: 'SentinelDirectives',
  abilityName: 'Sentinel Directives',
  category: 'damage',
  cooldown: -1,
  endsTurn: false, // Doesn't end turn
  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('SentinelDirectives');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    return {
      abilityId: 'SentinelDirectives',
      abilityName,
      category: 'damage',
      damageResult: { minDamage: minDmg, maxDamage: maxDmg, averageDamage: avgDmg, hits: 1, damageProfile: 'Physical' as DamageType },
      attackType: 'ranged',
      message: `${abilityName}: 1x Physical (range 3). Suppresses. Doesn't end turn. Can't use if enemies adjacent`,
    };
  },
};

/**
 * RitesOfRestoration (Isabella)
 * Healing ability - not relevant for damage calculator
 * Variables: hpToHeal, hp
 */
export const RitesOfRestorationHandler: AbilityHandler = {
  abilityId: 'RitesOfRestoration',
  abilityName: 'Rites of Restoration',
  category: 'healing',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('RitesOfRestoration');
    const hpToHeal = values.hpToHeal as number || 0;

    return {
      abilityId: 'RitesOfRestoration',
      abilityName,
      category: 'healing',
      healingResult: { amount: hpToHeal },
      message: abilityName,
    };
  },
};

// Export all active handlers
export const activeHandlers: AbilityHandler[] = [
  WarHowlHandler,
  TheQuickeningHandler,
  BloodChaliceHandler,
  ExecutionerHandler,
  GauntletsOfUltramarHandler,
  DeathFromAboveHandler,
  MortisRoundHandler,
  MacroPlasmaIncineratorHandler,
  DutyEternalHandler,
  StormOfWrathHandler,
  TacticalPrecisionHandler,
  BlackRageHandler,
  HammerOfWrathHandler,
  AberrantHypermorphHandler,
  MartialInspirationHandler,
  KillMaimBurnHandler,
  MomentShackleHandler,
  LightOfSanguiniusHandler,
  EuphoricStrikesHandler,
  DrachnyenHandler,
  ExemplarOfTheMontkaHandler,
  ThunderousAssaultHandler,
  DefendTheDivineWorkHandler,
  FightingRetreatHandler,
  CrusadeOfWrathHandler,
  TalonsOfTheEmperorHandler,
  VexillaMagnificaHandler,
  WaaaghHandler,
  InspiredToGreatnessHandler,
  CordClawHandler,
  RadBombardmentHandler,
  EarlyWarningOverrideHandler,
  DoctrinaImperativesHandler,
  FoehammerHandler,
  StormcallerHandler,
  GrapnelLauncherHandler,
  GreatFrostAxeHandler,
  DarkTalonStrikeHandler,
  SuperchargeHandler,
  PlasmaCannonHandler,
  CalibaniteGreatswordHandler,
  ExemplarOfHateHandler,
  FragstormGrenadeLauncherHandler,
  HolyDuelHandler,
  UnbreakableDutyHandler,
  VigilanceEternalHandler,
  ArmoriumCherubHandler,
  SanctorumMissileHandler,
  BrazierOfHolyFireHandler,
  SkyStrikeHandler,
  ThriceBlessedConflagrationHandler,
  DevastatingRefrainHandler,
  SupremeCommanderHandler,
  LeadingTheChargeHandler,
  FragBombHandler,
  MalleusRocketLauncherHandler,
  ForwardSpotterHandler,
  PsychicMaelstromHandler,
  BasiliskBarrageHandler,
  SendInTheNextWaveHandler,
  SeekerMissileFrequencyLockHandler,
  MV71SniperDroneSquadHandler,
  ExemplarOfTheKauyonHandler,
  HeavyRailRifleHandler,
  TwinSmartMissileSystemHandler,
  LokiSwoopingHawkHandler,
  FireAndRepositionHandler,
  SilentDeathHandler,
  HarvesterOfSoulsHandler,
  ScarabHiveHandler,
  ResurrectionOrbHandler,
  MultiThreatEliminatorHandler,
  AdaptiveStrategyHandler,
  HarbingerOfDestructionHandler,
  BioMinefieldHandler,
  SporeMineLauncherHandler,
  FearOfTheUnseenHandler,
  SpiritLeechHandler,
  ItItchesHandler,
  CrushingClawsHandler,
  AlphaWarriorHandler,
  GrotTankHandler,
  SquigLaunchasHandler,
  SquigMineHandler,
  DakkaDakkaDakkaHandler,
  GetEmRuntzHandler,
  UnstoppableMomentumReworkedHandler,
  BringerOfDespairHandler,
  IncursionHandler,
  HadesAutocannonsHandler,
  DaemonicOrdnanceHandler,
  HeraldOfTheApocalypseHandler,
  FrenziedFiringHandler,
  OverwhelmingWrathHandler,
  JakhalStimmsHandler,
  MurderousSwingHandler,
  BloodyFuryHandler,
  // DeathGuard
  PoxwalkersHandler,
  FlailSwingHandler,
  RevitalizingMalignancyHandler,
  FoulInfusionHandler,
  EntropyCannsHandler,
  PlagueburstMortarHandler,
  PlagueWindHandler,
  // ThousandSons
  MasterOfTheTutelariesHandler,
  DoomboltHandler,
  AttemptedPossessionHandler,
  HellfyreMissileRackHandler,
  SorcerousFacadeHandler,
  AetherStrideHandler,
  InfernalCannonHandler,
  // EmperorsChildren
  DoomSirenHandler,
  DaemonicPatronsHandler,
  LashOfTormentHandler,
  ExcruciatingFrequenciesHandler,
  // Genestealers
  CultDemagogueHandler,
  HeroicFusilladeHandler,
  MightFromBelowHandler,
  MindControlHandler,
  // LeaguesOfVotann
  AncestralFortuneHandler,
  GravitonRifleHandler,
  IronkinSteeljackHandler,
  // AdeptusMechanicus
  SentinelDirectivesHandler,
  // Sisterhood
  RitesOfRestorationHandler,
];
