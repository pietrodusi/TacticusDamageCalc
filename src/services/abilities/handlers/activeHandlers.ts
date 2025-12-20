/**
 * Active Ability Handlers
 * Handlers for active abilities that can be used during battle
 */

import type { AbilityHandler, ComputedAbilityValues, AbilityContext, ActiveAbilityResult, DamageComponent } from '../types';
import type { DamageType } from '../../../types';
import { getAbilityNameSync } from '../abilityDataLoader';

/**
 * WarHowl (Ragnar)
 * Buff that grants extra crit chance, damage percentage, and flat damage
 * Variables: extraCritChance, extraDmgPct, extraDmg, maxDmg
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
          baseDamageMultiplier: 1 + ((values.extraDmgPct as number || 0) / 100),
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
 * Buff that grants damage percentage bonus and movement boost
 * Variables: maxDmg, dmgPct
 * Constants: range: 2
 */
export const TheQuickeningHandler: AbilityHandler = {
  abilityId: 'TheQuickening',
  abilityName: 'The Quickening',
  category: 'buff',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('TheQuickening');

    return {
      abilityId: 'TheQuickening',
      abilityName,
      category: 'buff',
      buffResult: {
        effect: {
          baseDamageMultiplier: (values.dmgPct as number || 100) / 100,
          baseDamageBonus: values.maxDmg as number || 0,
        },
        duration: 1,
      },
      message: abilityName,
    };
  },
};

/**
 * Executioner (Eldryon)
 * Ranged Psychic damage attack
 * Variables: minDmg, maxDmg
 * Constants: range: 2
 */
export const ExecutionerHandler: AbilityHandler = {
  abilityId: 'Executioner',
  abilityName: 'Executioner',
  category: 'damage',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('Executioner');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);

    return {
      abilityId: 'Executioner',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg,
        hits: 1,
        damageProfile: 'Psychic' as DamageType,
      },
      message: abilityName,
    };
  },
};

/**
 * GauntletsOfUltramar (Calgar)
 * Ranged Bolter damage attack
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Bolter, nrOfHits: 1
 */
export const GauntletsOfUltramarHandler: AbilityHandler = {
  abilityId: 'GauntletsOfUltramar',
  abilityName: 'Gauntlets of Ultramar',
  category: 'damage',
  cooldown: -1,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('GauntletsOfUltramar');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const hits = values.nrOfHits as number || 1;

    return {
      abilityId: 'GauntletsOfUltramar',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg * hits,
        hits,
        damageProfile: (values.damageProfile as DamageType) || 'Bolter',
      },
      message: abilityName,
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
    const attackTurnsBonus = context.attackTurnsCount * 0.33;
    const damageMultiplier = 1 + attackTurnsBonus;

    // Apply multiplier to damage
    const multipliedMinDmg = Math.round(minDmg * damageMultiplier);
    const multipliedMaxDmg = Math.round(maxDmg * damageMultiplier);
    const avgDmg = Math.round((multipliedMinDmg + multipliedMaxDmg) / 2);

    // Note: extraDmgPct adds % of enemy max HP as damage, which we can't calculate here
    // This would need to be applied during damage calculation if we know the boss HP

    return {
      abilityId: 'MartialInspiration',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: multipliedMinDmg,
        maxDamage: multipliedMaxDmg,
        averageDamage: avgDmg * hits,
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

// Export all active handlers
export const activeHandlers: AbilityHandler[] = [
  WarHowlHandler,
  TheQuickeningHandler,
  ExecutionerHandler,
  GauntletsOfUltramarHandler,
  DeathFromAboveHandler,
  AberrantHypermorphHandler,
  MartialInspirationHandler,
  KillMaimBurnHandler,
  MomentShackleHandler,
];
