/**
 * Active Ability Handlers
 * Handlers for active abilities that can be used during battle
 */

import type { AbilityHandler, ComputedAbilityValues, AbilityContext, ActiveAbilityResult, DamageComponent } from '../types';
import type { DamageType } from '../../../types';
import { getAbilityNameSync } from '../abilityDataLoader';

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
        averageDamage: avgDmg,  // Per-hit damage, not total (hits applied in calculator)
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
];
