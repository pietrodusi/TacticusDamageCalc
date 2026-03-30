/**
 * Passive Ability Handlers
 * Handlers for passive abilities that modify character stats
 */

import type { AbilityHandler, ComputedAbilityValues, AbilityContext, PassiveAbilityEvaluation, FollowUpAttack, SummonRequest } from '../types';
import type { DamageType } from '../../../types/character';
import { getAbilityNameSync } from '../abilityDataLoader';
import { hasMechanicalTrait } from '../../../utils/traitUtils';

/**
 * Helper to check if a toggle is active (for boolean toggles in abilityToggles that can also contain numbers for counters)
 */
const isToggleActive = (value: boolean | number | undefined): boolean => value === true;

/**
 * SagaOfTheWarriorBorn (Ragnar)
 * Grants extra hits and crit damage when charging
 * Variables: extraHits (1-3), extraCritDmg
 */
export const SagaOfTheWarriorBornHandler: AbilityHandler = {
  abilityId: 'SagaOfTheWarriorBorn',
  abilityName: 'Saga of the Warrior Born',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    const isCharging = isToggleActive(context.abilityToggles['SagaOfTheWarriorBorn']);

    return {
      abilityId: 'SagaOfTheWarriorBorn',
      abilityName: getAbilityNameSync('SagaOfTheWarriorBorn'),
      modifiers: isCharging ? {
        extraHits: values.extraHits as number || 0,
        critDamageBonus: values.extraCritDmg as number || 0,
      } : {},
      applicable: isCharging,
      reason: isCharging ? 'Charging' : 'Not charging',
      requiresToggle: true,
      toggleLabel: 'Charging',
    };
  },
};

/**
 * FuryOfTheAncients (Mephiston)
 * Passive that provides a separate 2x Psychic melee attack button
 * Triggered manually via button (like TheBetrayer), not applied to normal attacks
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Psychic, nrOfHits: 2
 */
export const FuryOfTheAncientsHandler: AbilityHandler = {
  abilityId: 'FuryOfTheAncients',
  abilityName: 'Fury of the Ancients',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    // This passive provides a separate attack button - no modifiers to normal attacks
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const hits = values.nrOfHits as number || 2;

    return {
      abilityId: 'FuryOfTheAncients',
      abilityName: getAbilityNameSync('FuryOfTheAncients'),
      modifiers: {}, // No modifier to Mephiston's normal attack - this is a separate attack
      applicable: true,
      reason: `${hits}x ${minDmg}-${maxDmg} Psychic (button)`,
      requiresToggle: false,
    };
  },
};

/**
 * ShockAssault (Bellator)
 * Inceptor summons adjacent to Bellator get +extraDmg when they attack.
 * The toggle is on the Inceptor summons ("Adjacent to Bellator"), not on Bellator.
 * Damage buff is applied in executeSummonAttack when the toggle is enabled.
 * Variables: extraDmg
 */
export const ShockAssaultHandler: AbilityHandler = {
  abilityId: 'ShockAssault',
  abilityName: 'Shock Assault',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    // This passive provides a damage buff to adjacent Inceptor summons
    // The toggle appears on Inceptor summon cards ("Adjacent to Bellator")
    // Buff is applied directly in executeSummonAttack, not via triggerData
    const extraDmg = values.extraDmg as number || 0;

    return {
      abilityId: 'ShockAssault',
      abilityName: getAbilityNameSync('ShockAssault'),
      modifiers: {}, // No modifier to Bellator's attack
      applicable: true,
      reason: `Adjacent Inceptors get +${extraDmg} dmg`,
      requiresToggle: false,  // Toggle is on summons, not character
    };
  },
};

/**
 * RitesOfBattle (Calgar)
 * Grants extra damage to adjacent friendly units (not self).
 * Imperial allies get extraDmg_2 (higher), others get extraDmg.
 * Aura effect is handled in battleStore.ts and buffConditions.ts.
 * Variables: extraDmg, extraDmg_2
 */
export const RitesOfBattleHandler: AbilityHandler = {
  abilityId: 'RitesOfBattle',
  abilityName: 'Rites of Battle',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    // Does not apply to self - only buffs adjacent allies (handled as aura in battleStore)
    return {
      abilityId: 'RitesOfBattle',
      abilityName: getAbilityNameSync('RitesOfBattle'),
      modifiers: {},
      applicable: false,
      reason: `Aura: +${values.extraDmg}-${values.extraDmg_2} damage to adjacent allies`,
      requiresToggle: false,
    };
  },
};

/**
 * CamoCloak (Various)
 * Provides damage reduction - not a damage modifier, so we mark it as informational
 * Variables: dmgReduction
 */
export const CamoCloakHandler: AbilityHandler = {
  abilityId: 'CamoCloak',
  abilityName: 'Camo Cloak',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    // Defensive ability - doesn't modify attack damage
    return {
      abilityId: 'CamoCloak',
      abilityName: getAbilityNameSync('CamoCloak'),
      modifiers: {},
      applicable: false,
      reason: `Defensive ability (-${values.dmgReduction} damage taken)`,
      requiresToggle: false,
    };
  },
};

/**
 * LegacyOfCombat (Kariyan)
 * After performing any attack, Kariyan does another attack to the target.
 * 1 Piercing damage attack using minDmg_2/maxDmg_2 (suffix _2 matches damageProfile_2: Piercing).
 * The +33% damage per attack turn bonus ONLY applies when Martial Inspiration is used.
 * Variables: minDmg_2, maxDmg_2 (Piercing follow-up), minDmg, maxDmg (Power - used by active)
 */
export const LegacyOfCombatHandler: AbilityHandler = {
  abilityId: 'LegacyOfCombat',
  abilityName: 'Legacy of Combat',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    // Always triggers after any attack (melee or ability)
    const applicable = context.attackType === 'melee' || context.attackType === 'ability';

    // +33% per attack turn bonus ONLY applies when using Martial Inspiration (ability)
    const isAbilityAttack = context.attackType === 'ability';
    const basePercentage = 33;
    const attackTurns = isAbilityAttack ? context.attackTurnsCount : 0;
    const damageMultiplier = 1 + (attackTurns * basePercentage / 100);

    // Use Piercing damage (minDmg_2/maxDmg_2, 1 hit) - _2 suffix matches damageProfile_2
    const minDamage = values.minDmg_2 as number || 0;
    const maxDamage = values.maxDmg_2 as number || 0;
    const avgDamage = Math.round((minDamage + maxDamage) / 2);
    const hits = 1;

    // Build follow-up attack with multiplier info for display
    const followUpAttack: FollowUpAttack | undefined = applicable ? {
      abilityId: 'LegacyOfCombat',
      abilityName: 'Legacy of Combat',
      damageProfile: 'Piercing',
      minDamage,
      maxDamage,
      hits,
      // Only include multiplier if there are stacks (ability attack with prior attack turns)
      damageMultiplier: attackTurns > 0 ? damageMultiplier : undefined,
      multiplierBasePercentage: attackTurns > 0 ? basePercentage : undefined,
      multiplierStacks: attackTurns > 0 ? attackTurns : undefined,
      multiplierSourceName: attackTurns > 0 ? 'Martial Inspiration' : undefined,
      attackCategory: 'special',  // Follow-up is a special attack
      triggersOnNormalOnly: false,  // Triggers on any attack (normal or ability)
    } : undefined;

    const bonusText = isAbilityAttack && attackTurns > 0
      ? ` (+${basePercentage}%×${attackTurns})`
      : '';

    return {
      abilityId: 'LegacyOfCombat',
      abilityName: getAbilityNameSync('LegacyOfCombat'),
      modifiers: {},  // No modifiers to main attack
      applicable,
      reason: applicable
        ? `Follow-up: ${hits}x ${avgDamage} Piercing${bonusText}`
        : 'Only triggers on attacks',
      requiresToggle: false,
      followUpAttack,
    };
  },
};

/**
 * TheBetrayer (Kharn)
 * After performing a NORMAL attack, Kharn performs a second SPECIAL attack.
 * The special attack is 4 hits of Eviscerate damage.
 * Only triggers on normal attacks, not ability attacks.
 * Variables: minDmg, maxDmg, dmgReductionPct (defensive, not used here)
 * Constants: nrOfHits: 4, damageProfile: Eviscerate
 */
export const TheBetrayerHandler: AbilityHandler = {
  abilityId: 'TheBetrayer',
  abilityName: 'The Betrayer',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    // Only triggers after normal attacks (melee or ranged), not ability attacks
    const isNormalAttack = context.attackType === 'melee' || context.attackType === 'ranged';
    const applicable = isNormalAttack;

    // Use Eviscerate damage (minDmg/maxDmg)
    const minDamage = values.minDmg as number || 0;
    const maxDamage = values.maxDmg as number || 0;
    const avgDamage = Math.round((minDamage + maxDamage) / 2);
    const hits = values.nrOfHits as number || 4;

    // Build follow-up attack (special attack)
    const followUpAttack: FollowUpAttack | undefined = applicable ? {
      abilityId: 'TheBetrayer',
      abilityName: 'The Betrayer',
      damageProfile: 'Eviscerate',
      minDamage,
      maxDamage,
      hits,
      attackCategory: 'special',  // This is a SPECIAL attack
      triggersOnNormalOnly: true,  // Only triggers after normal attacks
    } : undefined;

    return {
      abilityId: 'TheBetrayer',
      abilityName: getAbilityNameSync('TheBetrayer'),
      modifiers: {},  // No modifiers to main attack
      applicable,
      reason: applicable
        ? `Special attack: ${hits}x ${avgDamage} Eviscerate`
        : 'Only triggers on normal attacks',
      requiresToggle: false,
      followUpAttack,
    };
  },
};

/**
 * LegendaryCommander (Trajann)
 *
 * Buff 1 (Damage): Character is adjacent to boss AND has used an active ability this turn
 *   - For non-special abilities: immediately when activated
 *   - For special attack abilities: after the first special attack is executed
 *   - Effect: +extraDmg pre-armor damage bonus
 *
 * Buff 2 (Hits): Buff 1 is active AND Trajann is adjacent to boss
 *   - Effect: +2 hits to the first special attack only
 *
 * Variables: extraDmg (up to 800), nrOfHits (constant 2)
 */
export const LegendaryCommanderHandler: AbilityHandler = {
  abilityId: 'LegendaryCommander',
  abilityName: 'Legendary Commander',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    const extraDmg = values.extraDmg as number || 0;
    const LC_EXTRA_HITS = 2;  // Fixed +2 hits for first special attack

    // Check if character is adjacent to boss
    const isAdjacentToBoss = isToggleActive(context.abilityToggles['adjacentToBoss']);

    // Buff 1 (Damage): Adjacent to boss + has qualified for LC damage (ability "used")
    const damageBonusActive = isAdjacentToBoss && context.hasQualifiedForLCDamage;

    // Buff 2 (Hits): Damage buff active + Trajann adjacent to boss + first special attack
    const isSpecialAttack = context.attackCategory === 'special' || context.attackCategory === 'ability';
    const hitsBonusActive = damageBonusActive &&
                            context.trajannIsAdjacentToBoss &&
                            isSpecialAttack &&
                            context.isFirstSpecialAttackOfTurn;

    const applicable = damageBonusActive;

    // Build modifiers
    const modifiers: { baseDamageBonus?: number; extraHits?: number } = {};
    if (damageBonusActive) {
      modifiers.baseDamageBonus = extraDmg;
    }
    if (hitsBonusActive) {
      modifiers.extraHits = LC_EXTRA_HITS;
    }

    // Build reason text
    let reason = '';
    if (!isAdjacentToBoss) {
      reason = 'Not adjacent to boss';
    } else if (!context.hasQualifiedForLCDamage) {
      reason = 'Ability not yet used';
    } else {
      const parts: string[] = [`+${extraDmg} dmg`];
      if (hitsBonusActive) {
        parts.push(`+${LC_EXTRA_HITS} hits (first special)`);
      }
      reason = parts.join(', ');
    }

    return {
      abilityId: 'LegendaryCommander',
      abilityName: getAbilityNameSync('LegendaryCommander'),
      modifiers,
      applicable,
      reason,
      requiresToggle: false,
    };
  },
};

/**
 * RefusalToBeOutdone (Laviscus)
 * Passive that grants bonus damage based on Outrage accumulated from ally attacks.
 * - Damage bonus = Outrage × extraDmgPct / 100
 * - Crit damage bonus = extraCritDmg × number of Chaos characters that contributed
 * Outrage resets after Laviscus's normal attack.
 * Variables: extraDmgPct, extraCritDmg
 */
export const RefusalToBeOutdoneHandler: AbilityHandler = {
  abilityId: 'RefusalToBeOutdone',
  abilityName: 'Refusal to be Outdone',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    const extraDmgPct = values.extraDmgPct as number || 100;
    const extraCritDmg = values.extraCritDmg as number || 0;

    // Get outrage state from context
    const outrage = context.outrage || 0;
    const chaosContributorCount = context.outrageContributorCount || 0;

    // Calculate bonuses
    // Damage bonus = outrage × extraDmgPct%
    const damageBonus = Math.round(outrage * extraDmgPct / 100);
    // Crit damage bonus = extraCritDmg per Chaos character that contributed
    const critDmgBonus = extraCritDmg * chaosContributorCount;

    const applicable = outrage > 0;

    // Build reason text
    let reason = '';
    if (applicable) {
      const parts: string[] = [];
      if (damageBonus > 0) {
        // Show total modifier with breakdown in parentheses
        parts.push(`+${damageBonus} dmg (${outrage} × ${extraDmgPct}%)`);
      }
      if (critDmgBonus > 0) {
        parts.push(`+${critDmgBonus} crit dmg (${chaosContributorCount} Chaos × ${extraCritDmg})`);
      }
      reason = parts.join(', ');
    } else {
      reason = 'No outrage accumulated';
    }

    return {
      abilityId: 'RefusalToBeOutdone',
      abilityName: getAbilityNameSync('RefusalToBeOutdone'),
      modifiers: applicable ? {
        baseDamageBonus: damageBonus > 0 ? damageBonus : undefined,
        critDamageBonus: critDmgBonus > 0 ? critDmgBonus : undefined,
      } : {},
      applicable,
      reason,
      requiresToggle: false,
    };
  },
};

/**
 * CyclicIonBlaster (Re'Vas)
 * Every time Re'Vas performs a normal attack, triggers another attack.
 * The follow-up attack is 3 hits of Particle damage using avg(minDmg, maxDmg).
 * If the enemy boss has Markerlight debuff or Mechanical trait, adds +extraDmg damage.
 * Variables: minDmg, maxDmg, extraDmg
 * Constants: nrOfHits: 3, damageProfile: Particle
 */
export const CyclicIonBlasterHandler: AbilityHandler = {
  abilityId: 'CyclicIonBlaster',
  abilityName: 'Cyclic Ion Blaster',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    // Only triggers after normal attacks (ranged for Re'Vas)
    const isNormalAttack = context.attackType === 'melee' || context.attackType === 'ranged';
    const applicable = isNormalAttack;

    // Get base damage values (without conditional bonus)
    const minDamage = values.minDmg as number || 0;
    const maxDamage = values.maxDmg as number || 0;
    const extraDmg = values.extraDmg as number || 0;
    const hits = 3;  // From constants.nrOfHits

    // Check if boss has Mechanical trait (Vehicle/LivingMetal count) or Markerlight debuff
    const hasMechanical = hasMechanicalTrait(context.bossTraits);
    const hasMarkerlight = context.bossDebuffs?.includes('Markerlight') ?? false;
    const hasMarkerlightOrMechanical = hasMechanical || hasMarkerlight;

    // Calculate average damage for display (includes conditional bonus)
    const bonusDamage = hasMarkerlightOrMechanical ? extraDmg : 0;
    const avgDamage = Math.round((minDamage + maxDamage) / 2 + bonusDamage);

    // Build follow-up attack - inherits attack type from triggering attack
    // CyclicIonBlaster after ranged → ranged, after melee → melee
    // This is an "Additional Attack" - shares crit chain with source attack
    const followUpAttackType: 'melee' | 'ranged' = context.attackType === 'ranged' ? 'ranged' : 'melee';

    // Build conditional damage bonus for proper Modifiers display
    const conditionalDamageBonus = hasMarkerlightOrMechanical ? {
      amount: extraDmg,
      sourceName: hasMechanical && hasMarkerlight ? 'Mechanical/Markerlight' : (hasMechanical ? 'Mechanical' : 'Markerlight'),
    } : undefined;

    const followUpAttack: FollowUpAttack | undefined = applicable ? {
      abilityId: 'CyclicIonBlaster',
      abilityName: 'Cyclic Ion Blaster',
      damageProfile: 'Particle',
      minDamage,  // Base damage without bonus
      maxDamage,  // Base damage without bonus
      hits,
      attackCategory: 'normal',  // Follow-up is a normal attack (same type as triggering attack)
      triggersOnNormalOnly: true,  // Only triggers on normal attacks
      followUpAttackType,  // Inherit attack type from triggering attack
      sharesCritChain: true,  // Additional Attack: continues crit chain from source attack
      conditionalDamageBonus,  // Bonus passed through abilityModifiers for Modifiers display
    } : undefined;

    // Build bonus text showing the source of the bonus
    let bonusText = '';
    if (hasMarkerlightOrMechanical) {
      const source = hasMechanical && hasMarkerlight ? 'Mechanical/Markerlight' : (hasMechanical ? 'Mechanical' : 'Markerlight');
      bonusText = ` (+${extraDmg} from ${source})`;
    }

    return {
      abilityId: 'CyclicIonBlaster',
      abilityName: getAbilityNameSync('CyclicIonBlaster'),
      modifiers: {},  // No modifiers to main attack
      applicable,
      reason: applicable
        ? `Follow-up: ${hits}x ${avgDamage} Particle${bonusText}`
        : 'Only triggers on normal attacks',
      requiresToggle: false,
      followUpAttack,
    };
  },
};

/**
 * WayOfTheShortBlade (Farsight)
 * When Farsight or T'au Empire characters perform a melee attack,
 * they immediately perform their normal ranged attack as a follow-up.
 *
 * Also provides armor ignore + damage % bonus to other characters' ranged attacks,
 * but that part is handled by the buff pool system (wayOfTheShortBladeAuraBuffTemplate).
 *
 * This handler handles Farsight's own melee -> ranged follow-up.
 * T'au Empire teammates get the follow-up via toggle ("Range 2 from Farsight") in battleStore.
 */
export const WayOfTheShortBladeHandler: AbilityHandler = {
  abilityId: 'WayOfTheShortBlade',
  abilityName: 'Way of the Short Blade',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (_values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    // Only triggers after melee attacks
    const isMeleeAttack = context.attackType === 'melee';
    const applicable = isMeleeAttack;

    // Build follow-up attack (uses character's normal ranged stats)
    // The actual damage values are placeholders - battleStore will use character's ranged stats
    const followUpAttack: FollowUpAttack | undefined = applicable ? {
      abilityId: 'WayOfTheShortBlade',
      abilityName: 'Way of the Short Blade',
      damageProfile: 'Plasma',  // Placeholder - will be overwritten by character's rangedDamageType
      minDamage: 0,  // Placeholder - will be overwritten
      maxDamage: 0,  // Placeholder - will be overwritten
      hits: 0,  // Placeholder - will be overwritten by character's rangedHits
      attackCategory: 'normal',  // This IS a normal ranged attack
      triggersOnMeleeOnly: true,  // Only triggers after melee attacks
      useCharacterRangedStats: true,  // Use the character's actual ranged attack stats
    } : undefined;

    return {
      abilityId: 'WayOfTheShortBlade',
      abilityName: getAbilityNameSync('WayOfTheShortBlade'),
      modifiers: {},  // No modifiers to main attack from this handler
      applicable,
      reason: applicable
        ? 'Melee triggers ranged follow-up'
        : 'Only triggers after melee attacks',
      requiresToggle: false,
      followUpAttack,
    };
  },
};

/**
 * ChampionOfTheFeast (Godswyl)
 * After moving (or end of turn if no move), deals Power damage.
 * Note: Armor reduction ignored since bosses have Immune trait.
 * Always triggers (no toggle needed).
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Power, nrOfHits: 1
 */
export const ChampionOfTheFeastHandler: AbilityHandler = {
  abilityId: 'ChampionOfTheFeast',
  abilityName: 'Champion Of The Feast',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const minDamage = values.minDmg as number || 0;
    const maxDamage = values.maxDmg as number || 0;
    const avgDamage = Math.round((minDamage + maxDamage) / 2);
    const hits = values.nrOfHits as number || 1;

    // Always triggers (user confirmed no toggle for movement condition)
    const applicable = true;

    // Build follow-up attack (special attack)
    // Note: armorReduction ignored since bosses have Immune trait
    const followUpAttack: FollowUpAttack | undefined = applicable ? {
      abilityId: 'ChampionOfTheFeast',
      abilityName: 'Champion Of The Feast',
      damageProfile: 'Power',
      minDamage,
      maxDamage,
      hits,
      attackCategory: 'special',  // Special follow-up attack
    } : undefined;

    return {
      abilityId: 'ChampionOfTheFeast',
      abilityName: getAbilityNameSync('ChampionOfTheFeast'),
      modifiers: {},
      applicable,
      reason: applicable
        ? `Follow-up: ${hits}x ${avgDamage} Power`
        : '',
      requiresToggle: false,
      followUpAttack,
    };
  },
};

// GalvanicField (Actus) - When Actus repairs another unit, that unit attacks the boss
// Note: Logic handled in battleStore.executeRepairWithGalvanicField, handler provides metadata only
// Uses Cap 1 ("Its Own Damage") to cap base damage BEFORE dmgPct multiplier is applied
export const GalvanicFieldHandler: AbilityHandler = {
  abilityId: 'GalvanicField',
  abilityName: 'Galvanic Field',
  category: 'passive',
  cooldown: -1,

  // This passive is triggered programmatically when Actus repairs another unit
  // The actual damage calculation is in battleStore.executeRepairWithGalvanicField
  // maxDmg uses baseDamageCap (Cap 1) to cap base damage before dmgPct and other modifiers
  evaluatePassive: (_values, _context) => {
    return {
      abilityId: 'GalvanicField',
      abilityName: getAbilityNameSync('GalvanicField'),
      modifiers: {},
      applicable: false, // Not automatically applied - triggered via repair action
      reason: 'Triggers when repairing another unit',
      requiresToggle: false,
    };
  },
};

/**
 * LightImUp (Gulgortz)
 * After performing a normal attack, Gulgortz performs a second attack against the boss.
 * The follow-up attack is a ranged attack with 3 hits of Projectile damage.
 * Variables: minDmg, maxDmg
 * Constants: nrOfHits: 3, damageProfile: Projectile
 */
export const LightImUpHandler: AbilityHandler = {
  abilityId: 'LightImUp',
  abilityName: "Light 'im up!",
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    // Only triggers after normal attacks (melee or ranged)
    const isNormalAttack = context.attackType === 'melee' || context.attackType === 'ranged';
    const applicable = isNormalAttack;

    // Get damage values from abilities.json
    const minDamage = values.minDmg as number || 0;
    const maxDamage = values.maxDmg as number || 0;
    const hits = values.nrOfHits as number || 3;

    // Calculate average damage for display
    const avgDamage = Math.round((minDamage + maxDamage) / 2);

    // Build follow-up attack - always ranged Projectile
    const followUpAttack: FollowUpAttack | undefined = applicable ? {
      abilityId: 'LightImUp',
      abilityName: "Light 'im up!",
      damageProfile: 'Projectile',
      minDamage,
      maxDamage,
      hits,
      attackCategory: 'normal',  // Follow-up is treated as a normal attack
      triggersOnNormalOnly: true,  // Only triggers on normal attacks
      followUpAttackType: 'ranged',  // Always a ranged attack
    } : undefined;

    return {
      abilityId: 'LightImUp',
      abilityName: getAbilityNameSync('LightImUp'),
      modifiers: {},  // No modifiers to main attack
      applicable,
      reason: applicable
        ? `Follow-up: ${hits}x ${avgDamage} Projectile`
        : 'Only triggers on normal attacks',
      requiresToggle: false,
      followUpAttack,
    };
  },
};

/**
 * StandVigil (Aesoth)
 * Passive aura that grants +extraDmgPct% damage to Special Attacks for nearby allies.
 * - Default: Adjacent allies (toggle "Adjacent to Aesoth (Stand Vigil)")
 * - If a Custodes uses an Active Ability this turn: Range 2 allies (toggle text changes)
 * Variables: extraDmgPct
 * Note: Buff logic handled via standVigilBuffTemplate in buffRegistry.ts
 */
export const StandVigilHandler: AbilityHandler = {
  abilityId: 'StandVigil',
  abilityName: 'Stand Vigil',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const extraDmgPct = values.extraDmgPct as number || 0;

    // This is an aura - the actual buff is applied via buff pool to other team members
    // The handler just provides metadata
    return {
      abilityId: 'StandVigil',
      abilityName: getAbilityNameSync('StandVigil'),
      modifiers: {},  // Aesoth doesn't benefit from his own aura
      applicable: true,  // Always active
      reason: `+${extraDmgPct}% dmg to allies' Special Attacks`,
      requiresToggle: false,  // No toggle for Aesoth himself
    };
  },
};

/**
 * SereneUnifier (Aun'Shi)
 * Turn-cycling aura that provides different effects based on the current turn:
 * - Turn 1, 4: Sense of Stone (no combat effect)
 * - Turn 2, 5: Zephyr's Grace (no combat effect - movement buff ignored)
 * - Turn 3, 6: Storm of Fire (+extraDmg to normal attacks)
 *
 * Range: Adjacent to Aun'Shi (non-Tau), Range 2 from Aun'Shi (Tau)
 * Variables: extraDmg (damage bonus for Storm of Fire), dmgReductionPct (defensive, ignored)
 * Note: Buff logic handled via sereneUnifierStormOfFireBuffTemplate in buffRegistry.ts
 */
export const SereneUnifierHandler: AbilityHandler = {
  abilityId: 'SereneUnifier',
  abilityName: 'Serene Unifier',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    const extraDmg = values.extraDmg as number || 0;

    // Calculate current phase based on turn (1-indexed, cycles 1-2-3)
    const turn = context.currentTurn || 1;
    const phase = ((turn - 1) % 3) + 1;  // 1, 2, 3, 1, 2, 3
    const phaseNames = ['Sense of Stone', "Zephyr's Grace", 'Storm of Fire'];
    const phaseName = phaseNames[phase - 1];

    // Storm of Fire (phase 3) is the only phase with combat effect
    const isStormOfFire = phase === 3;

    // This is an aura - the actual buff is applied via buff pool to team members
    // The handler just provides metadata
    return {
      abilityId: 'SereneUnifier',
      abilityName: getAbilityNameSync('SereneUnifier'),
      modifiers: {},  // Aun'Shi doesn't benefit from own aura (no self-buff)
      applicable: true,  // Always active
      reason: isStormOfFire
        ? `${phaseName}: +${extraDmg} dmg (allies' normal attacks)`
        : `${phaseName}: No combat effect`,
      requiresToggle: false,  // No toggle for Aun'Shi himself
    };
  },
};

/**
 * OptimizedGait (Exitor-Rho)
 * Reaction passive: When another friendly Mechanical unit attacks the boss while
 * Exitor-Rho is adjacent to the boss, Exitor-Rho deals 2x Energy damage.
 * This is a SPECIAL attack (gets LC bonuses).
 * Variables: minDmg, maxDmg
 * Constants: nrOfHits: 2, damageProfile: Energy
 * Note: The actual reaction trigger is handled in battleStore.executeAttack()
 */
export const OptimizedGaitHandler: AbilityHandler = {
  abilityId: 'OptimizedGait',
  abilityName: 'Optimised Gait',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const hits = values.nrOfHits as number || 2;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);

    // Check if Exitor-Rho is adjacent to boss
    const isAdjacentToBoss = isToggleActive(context.abilityToggles['adjacentToBoss']);

    // This passive provides metadata - the actual reaction trigger is in battleStore
    // when another Mechanical unit attacks
    return {
      abilityId: 'OptimizedGait',
      abilityName: getAbilityNameSync('OptimizedGait'),
      modifiers: {},  // No modifiers to Exitor-Rho's own attacks
      applicable: isAdjacentToBoss,
      reason: isAdjacentToBoss
        ? `Reaction: ${hits}x ${avgDmg} Energy when Mechanical ally attacks boss`
        : 'Requires adjacent to boss',
      requiresToggle: true,
      toggleLabel: 'Adjacent to Boss',
    };
  },
};

/**
 * FuelledByFury (Titus)
 * Deals +extraDmg damage with all attacks for each time a friendly character
 * has used an active ability this battle.
 * Variables: extraDmg, hp
 */
export const FuelledByFuryHandler: AbilityHandler = {
  abilityId: 'FuelledByFury',
  abilityName: 'Fuelled by Fury',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    // Get count of active abilities used this battle
    const abilitiesUsed = context.activeAbilitiesUsedCount || 0;
    const extraDmgPerAbility = values.extraDmg as number || 0;
    const totalBonus = abilitiesUsed * extraDmgPerAbility;

    return {
      abilityId: 'FuelledByFury',
      abilityName: getAbilityNameSync('FuelledByFury'),
      modifiers: totalBonus > 0 ? {
        baseDamageBonus: totalBonus,
      } : {},
      applicable: totalBonus > 0,
      reason: abilitiesUsed > 0
        ? `+${extraDmgPerAbility} × ${abilitiesUsed} abilities = +${totalBonus} damage`
        : 'No abilities used yet',
      requiresToggle: false,
    };
  },
};

/**
 * VisionsOfHeresy (Lucien)
 * After normal attack, performs a follow-up 2x Bolter ranged attack.
 * At or below healthPct%: ALL attacks have +extraPierceRatio% pierce ratio.
 * Variables: minDmg, maxDmg, extraPierceRatio, healthPct
 * Constants: damageProfile: Bolter, nrOfHits: 2, range: 2
 */
export const VisionsOfHeresyHandler: AbilityHandler = {
  abilityId: 'VisionsOfHeresy',
  abilityName: 'Visions of Heresy',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const hits = values.nrOfHits as number || 2;
    const extraPierceRatio = values.extraPierceRatio as number || 0;
    const healthPct = values.healthPct as number || 50;

    // Check if at or below health threshold for pierce bonus (applies to ALL attacks)
    const belowHealthThreshold = isToggleActive(context.abilityToggles['VisionsOfHeresy_lowHealth']);

    // Follow-up attack only triggers on normal attacks
    const isNormalAttack = context.attackCategory === 'normal';
    const followUpAttack: FollowUpAttack | undefined = isNormalAttack ? {
      abilityId: 'VisionsOfHeresy',
      abilityName: 'Visions of Heresy',
      minDamage: minDmg,
      maxDamage: maxDmg,
      hits,
      damageProfile: 'Bolter',
      attackCategory: 'special',
      triggersOnNormalOnly: true,  // Only triggers after normal attacks
      followUpAttackType: 'ranged',  // Ranged follow-up attack
    } : undefined;

    // Build reason message
    let reason = '';
    if (isNormalAttack) {
      reason = `Follow-up: ${hits}x Bolter (${avgDmg} avg dmg)`;
    }
    if (belowHealthThreshold) {
      reason += (reason ? ', ' : '') + `+${extraPierceRatio}% pierce (Low HP)`;
    }
    if (!reason) {
      reason = 'No follow-up (special attack)';
    }

    return {
      abilityId: 'VisionsOfHeresy',
      abilityName: getAbilityNameSync('VisionsOfHeresy'),
      // Pierce bonus applies to ALL attacks when below health threshold
      modifiers: belowHealthThreshold ? {
        pierceRatioBonus: extraPierceRatio,
      } : {},
      applicable: belowHealthThreshold || isNormalAttack,  // Applicable if pierce bonus OR follow-up
      reason,
      requiresToggle: true,
      toggleLabel: `Low HP (≤${healthPct}%)`,
      followUpAttack,
    };
  },
};

/**
 * LordOfTempests (Njal)
 * Normal attacks deal +extraDmg damage per Ice hex surrounding Njal (up to 6).
 * The hex of each enemy hit is covered in Ice at end of attack.
 * Uses counter to track number of surrounding Ice hexes.
 * Variables: extraDmg
 */
export const LordOfTempestsHandler: AbilityHandler = {
  abilityId: 'LordOfTempests',
  abilityName: 'Lord Of Tempests',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    // Only applies to normal attacks (melee or ranged)
    const isNormalAttack = context.attackCategory === 'normal';

    // Counter tracks number of surrounding Ice hexes (0-6)
    const iceHexCount = (context.abilityToggles['LordOfTempests'] as unknown as number) ?? 0;
    const extraDmgPerHex = values.extraDmg as number || 0;
    const totalBonus = iceHexCount * extraDmgPerHex;

    const applicable = isNormalAttack && iceHexCount > 0;

    return {
      abilityId: 'LordOfTempests',
      abilityName: getAbilityNameSync('LordOfTempests'),
      modifiers: applicable ? {
        baseDamageBonus: totalBonus,
      } : {},
      applicable,
      reason: isNormalAttack
        ? (iceHexCount > 0 ? `+${extraDmgPerHex} × ${iceHexCount} Ice hexes = +${totalBonus} damage` : 'No Ice hexes')
        : 'Only applies to normal attacks',
      requiresToggle: false,  // Using counter instead
      toggleLabel: 'Surrounding Ice Hexes',
    };
  },
};

/**
 * HuntersBeyondDeath (Tjark)
 * Deals +extraDmg damage against Psyker bosses.
 * Also reduces nearby enemy Psyker damage (defensive, not modeled).
 * Variables: extraDmg, dmgReduction (defensive)
 */
export const HuntersBeyondDeathHandler: AbilityHandler = {
  abilityId: 'HuntersBeyondDeath',
  abilityName: 'Hunters Beyond Death',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    const extraDmg = values.extraDmg as number || 0;

    // Check if boss has Psyker trait
    const bossIsPsyker = context.bossTraits?.includes('Psyker') ?? false;
    const applicable = bossIsPsyker;

    return {
      abilityId: 'HuntersBeyondDeath',
      abilityName: getAbilityNameSync('HuntersBeyondDeath'),
      modifiers: applicable ? {
        baseDamageBonus: extraDmg,
      } : {},
      applicable,
      reason: bossIsPsyker
        ? `+${extraDmg} damage vs Psyker`
        : 'Boss is not a Psyker',
      requiresToggle: false,
    };
  },
};

/**
 * SavageKiller (Ulf)
 * After killing an enemy with a normal melee attack, performs a follow-up attack.
 * Does NOT work on bosses (bosses can't be killed mid-attack).
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Power, nrOfHits: 5
 */
export const SavageKillerHandler: AbilityHandler = {
  abilityId: 'SavageKiller',
  abilityName: 'Savage Killer',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (_values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    // This ability only triggers when killing an enemy, which doesn't happen against bosses
    return {
      abilityId: 'SavageKiller',
      abilityName: getAbilityNameSync('SavageKiller'),
      modifiers: {},
      applicable: false,
      reason: 'Does not work on bosses',
      requiresToggle: false,
    };
  },
};

/**
 * LionHelm (Azrael)
 * Aura that grants +extraDmg to adjacent friendly units
 * Also provides block chance (defensive, not modeled)
 * Variables: extraDmg, blockDmg, blockChance
 */
export const LionHelmHandler: AbilityHandler = {
  abilityId: 'LionHelm',
  abilityName: 'Lion Helm',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    const extraDmg = values.extraDmg as number || 0;

    // Toggle for whether character is adjacent to Azrael
    const adjacentToAzrael = isToggleActive(context.abilityToggles['LionHelm']);
    const applicable = adjacentToAzrael;

    return {
      abilityId: 'LionHelm',
      abilityName: getAbilityNameSync('LionHelm'),
      modifiers: applicable ? {
        baseDamageBonus: extraDmg,
      } : {},
      applicable,
      reason: adjacentToAzrael
        ? `+${extraDmg} damage (adjacent to Azrael)`
        : 'Not adjacent to Azrael',
      requiresToggle: true,
      toggleLabel: 'Adjacent to Azrael',
    };
  },
};

/**
 * FearedInterrogator (Asmodai)
 * +extraDmg when any Dark Angels teammate is adjacent to boss
 * +extraHits against Chaos enemies (based on boss grand alliance)
 * Variables: extraDmg, extraHits
 */
export const FearedInterrogatorHandler: AbilityHandler = {
  abilityId: 'FearedInterrogator',
  abilityName: 'Feared Interrogator',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    const extraDmg = values.extraDmg as number || 0;
    const extraHits = values.extraHits as number || 0;

    // Bonus damage when any Dark Angels teammate is adjacent to boss
    const darkAngelsAdjacentToBoss = context.darkAngelsAdjacentToBoss ?? false;

    // Check if boss is Chaos (for extra hits)
    const bossIsChaos = context.bossTraits?.includes('Chaos') ?? false;

    const applicable = darkAngelsAdjacentToBoss || bossIsChaos;

    return {
      abilityId: 'FearedInterrogator',
      abilityName: getAbilityNameSync('FearedInterrogator'),
      modifiers: {
        baseDamageBonus: darkAngelsAdjacentToBoss ? extraDmg : 0,
        extraHits: bossIsChaos ? extraHits : 0,
      },
      applicable,
      reason: [
        darkAngelsAdjacentToBoss ? `+${extraDmg} damage (DA adj. to boss)` : null,
        bossIsChaos ? `+${extraHits} hits vs Chaos` : null,
      ].filter(Boolean).join(', ') || 'Conditions not met',
      requiresToggle: false,  // No longer requires own toggle - uses teammates' adjacentToBoss
    };
  },
};

/**
 * Deathwing (Baraqiel)
 * Grants +extraDmg damage when damage is blocked (toggle)
 * If adjacent to another Dark Angel, bonus is doubled (x2)
 * Applies to melee attacks and PlasmaCannon ability
 * Variables: extraDmg, dmgReduction
 */
export const DeathwingHandler: AbilityHandler = {
  abilityId: 'Deathwing',
  abilityName: 'Deathwing',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    const extraDmg = values.extraDmg as number || 0;

    // Check if "Damage Blocked" toggle is active
    const isDamageBlocked = isToggleActive(context.abilityToggles['Deathwing_damageBlocked']);
    // Check if "Adjacent to Another Dark Angel" toggle is active (doubles the bonus)
    const isAdjacentDA = isToggleActive(context.abilityToggles['Deathwing_adjacentDA']);

    // Only applies to melee attacks and PlasmaCannon ability
    const isMeleeAttack = context.attackType === 'melee';
    const isPlasmaCannonAbility = context.attackCategory === 'ability'; // PlasmaCannon is an ability

    const applicable = isDamageBlocked && (isMeleeAttack || isPlasmaCannonAbility);

    // Calculate bonus: base extraDmg, doubled if adjacent to DA
    const multiplier = isAdjacentDA ? 2 : 1;
    const totalBonus = extraDmg * multiplier;

    return {
      abilityId: 'Deathwing',
      abilityName: getAbilityNameSync('Deathwing'),
      modifiers: applicable ? {
        baseDamageBonus: totalBonus,
      } : {},
      applicable,
      reason: applicable
        ? `+${totalBonus} damage${isAdjacentDA ? ' (x2 adjacent DA)' : ''}`
        : isDamageBlocked
          ? 'Only applies to melee and PlasmaCannon'
          : 'Damage Blocked not active',
      requiresToggle: true,
    };
  },
};

/**
 * EnmityForTheUnworthy (Forcas)
 * +extraDmgPct% per adjacent unit, +extraDmg per adjacent Dark Angel
 * Max 6 adjacent units (counter-based)
 * Variables: extraDmgPct, extraDmg
 */
export const EnmityForTheUnworthyHandler: AbilityHandler = {
  abilityId: 'EnmityForTheUnworthy',
  abilityName: 'Enmity for the Unworthy',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    const extraDmgPct = values.extraDmgPct as number || 0;
    const extraDmg = values.extraDmg as number || 0;

    // Counter for adjacent units (0-6)
    const adjacentCount = (context.abilityToggles['EnmityForTheUnworthy_units'] as unknown as number) ?? 0;
    // Counter for adjacent Dark Angels (0-6)
    const adjacentDACount = (context.abilityToggles['EnmityForTheUnworthy_DA'] as unknown as number) ?? 0;

    const dmgPctBonus = adjacentCount * extraDmgPct;
    const flatDmgBonus = adjacentDACount * extraDmg;

    const applicable = dmgPctBonus > 0 || flatDmgBonus > 0;

    return {
      abilityId: 'EnmityForTheUnworthy',
      abilityName: getAbilityNameSync('EnmityForTheUnworthy'),
      modifiers: applicable ? {
        baseDamageMultiplier: dmgPctBonus > 0 ? (100 + dmgPctBonus) / 100 : undefined,
        baseDamageBonus: flatDmgBonus > 0 ? flatDmgBonus : undefined,
      } : {},
      applicable,
      reason: [
        dmgPctBonus > 0 ? `+${dmgPctBonus}% dmg (${adjacentCount} adj.)` : null,
        flatDmgBonus > 0 ? `+${flatDmgBonus} dmg (${adjacentDACount} DA)` : null,
      ].filter(Boolean).join(', ') || 'No adjacent units',
      requiresToggle: false,
    };
  },
};

/**
 * GrimRetribution (Sarquael)
 * Overwatch reaction - shoots 1x Plasma when attacked by enemy
 * Note: Reaction timing during enemy turn is not modeled
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Plasma, nrOfHits: 1
 */
export const GrimRetributionHandler: AbilityHandler = {
  abilityId: 'GrimRetribution',
  abilityName: 'Grim Retribution',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);

    // Overwatch reaction is triggered during enemy turn - not directly modeled
    // Just show the damage info
    return {
      abilityId: 'GrimRetribution',
      abilityName: getAbilityNameSync('GrimRetribution'),
      modifiers: {},
      applicable: false,  // Reaction timing not modeled
      reason: `Overwatch: 1x ${avgDmg} Plasma (enemy turn reaction)`,
      requiresToggle: false,
    };
  },
};

/**
 * Boltstorm (Burchard)
 * Normal ranged attacks deal additional 3x Bolter damage
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Bolter, nrOfHits: 3
 */
export const BoltstormHandler: AbilityHandler = {
  abilityId: 'Boltstorm',
  abilityName: 'Boltstorm',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    // Only triggers on normal ranged attacks
    const isNormalRanged = context.attackType === 'ranged' && context.attackCategory === 'normal';
    const applicable = isNormalRanged;

    const minDamage = values.minDmg as number || 0;
    const maxDamage = values.maxDmg as number || 0;
    const avgDamage = Math.round((minDamage + maxDamage) / 2);
    const hits = values.nrOfHits as number || 3;

    const followUpAttack: FollowUpAttack | undefined = applicable ? {
      abilityId: 'Boltstorm',
      abilityName: 'Boltstorm',
      damageProfile: 'Bolter',
      minDamage,
      maxDamage,
      hits,
      attackCategory: 'normal',  // Additional normal attack (like CyclicIonBlaster)
      triggersOnNormalOnly: true,
      followUpAttackType: 'ranged',  // Always ranged (only triggers on ranged attacks)
      sharesCritChain: true,  // Additional Attack: continues crit chain from source attack
    } : undefined;

    return {
      abilityId: 'Boltstorm',
      abilityName: getAbilityNameSync('Boltstorm'),
      modifiers: {},
      applicable,
      reason: applicable
        ? `Follow-up: ${hits}x ${avgDamage} Bolter`
        : 'Only triggers on normal ranged attacks',
      requiresToggle: false,
      followUpAttack,
    };
  },
};

/**
 * MartialSuperiority (Jaeger)
 * Preemptive strike - deals 2x Power damage before enemy melee attack
 * Note: Reaction timing during enemy turn is not modeled
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Power, nrOfHits: 2
 */
export const MartialSuperiorityHandler: AbilityHandler = {
  abilityId: 'MartialSuperiority',
  abilityName: 'Martial Superiority',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);

    // Preemptive strike during enemy turn - not directly modeled
    return {
      abilityId: 'MartialSuperiority',
      abilityName: getAbilityNameSync('MartialSuperiority'),
      modifiers: {},
      applicable: false,  // Reaction timing not modeled
      reason: `Preemptive: 2x ${avgDmg} Power (enemy turn)`,
      requiresToggle: false,
    };
  },
};

/**
 * AstartesBanner (Thoread)
 * Aura - allies within range 2 score an additional hit with melee attacks (shared crit chain)
 * The additional hit uses the character's own melee damage, capped at maxDmg (Cap 3)
 * Variables: dmg (unused), maxDmg (per-hit damage cap)
 * Constants: range: 2, extraHits: 1
 *
 * This is handled as an aura toggle in buffConditions.ts ("In Range 2 from Thoread")
 * and as a follow-up attack injected in battleStore.ts (not through this passive handler).
 * The handler here is a no-op stub since the effect is team-wide.
 */
export const AstartesBannerHandler: AbilityHandler = {
  abilityId: 'AstartesBanner',
  abilityName: 'Astartes Banner',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const maxDmgPerHit = values.maxDmg as number || 0;

    return {
      abilityId: 'AstartesBanner',
      abilityName: getAbilityNameSync('AstartesBanner'),
      modifiers: {},
      applicable: false,
      reason: `Aura: +1 melee hit (cap ${maxDmgPerHit}) to allies in range 2`,
      requiresToggle: false,
    };
  },
};

/**
 * UnwaveringSentinel (Tyrith)
 * Bonus attack - deals 2x Bolter damage, unlimited uses per turn
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Bolter, nrOfHits: 2, range: 2
 */
export const UnwaveringSentinelHandler: AbilityHandler = {
  abilityId: 'UnwaveringSentinel',
  abilityName: 'Unwavering Sentinel',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;

    return {
      abilityId: 'UnwaveringSentinel',
      abilityName: getAbilityNameSync('UnwaveringSentinel'),
      modifiers: {},
      applicable: true,
      reason: `Bonus attack: 2x ${minDmg}-${maxDmg} Bolter`,
      requiresToggle: false,
    };
  },
};

/**
 * FireOfAbsolution (Vindicta)
 * Deals Flame damage to adjacent enemies - not relevant for single-target calculator
 */
export const FireOfAbsolutionHandler: AbilityHandler = {
  abilityId: 'FireOfAbsolution',
  abilityName: 'Fire of Absolution',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (_values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    return {
      abilityId: 'FireOfAbsolution',
      abilityName: getAbilityNameSync('FireOfAbsolution'),
      modifiers: {},
      applicable: false,
      reason: 'AoE damage to adjacent enemies (not modeled)',
      requiresToggle: false,
    };
  },
};

/**
 * RighteousRepugnance (Morvenn Vahl)
 * Chance-based 3x Power follow-up attack when dealing melee damage
 * Variables: minDmg, maxDmg, chance
 * Constants: damageProfile: Power, nrOfHits: 3
 */
export const RighteousRepugnanceHandler: AbilityHandler = {
  abilityId: 'RighteousRepugnance',
  abilityName: 'Righteous Repugnance',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    const isMelee = context.attackType === 'melee';
    const applicable = isMelee;
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const hits = values.nrOfHits as number || 3;
    const chance = values.chance as number || 40;

    // Chance-based follow-up attack
    const followUpAttack: FollowUpAttack | undefined = applicable ? {
      abilityId: 'RighteousRepugnance',
      abilityName: 'Righteous Repugnance',
      damageProfile: 'Power',
      minDamage: minDmg,
      maxDamage: maxDmg,
      hits,
      attackCategory: 'special',
      triggersOnMeleeOnly: true,
      triggersOnNormalOnly: true,
      sharesCritChain: true,
    } : undefined;

    return {
      abilityId: 'RighteousRepugnance',
      abilityName: getAbilityNameSync('RighteousRepugnance'),
      modifiers: {},
      applicable,
      reason: applicable ? `${chance}% chance: ${hits}x Power follow-up` : 'Only triggers on melee attacks',
      requiresToggle: false,
      followUpAttack,
    };
  },
};

/**
 * CondemnorStake (Roswitha)
 * All Roswitha's attacks deal +extraDmg if boss has Psyker trait
 * Variables: extraDmg
 */
export const CondemnorStakeHandler: AbilityHandler = {
  abilityId: 'CondemnorStake',
  abilityName: 'Condemnor Stake',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    const extraDmg = values.extraDmg as number || 0;
    const bossIsPsyker = context.bossTraits?.includes('Psyker') ?? false;

    return {
      abilityId: 'CondemnorStake',
      abilityName: getAbilityNameSync('CondemnorStake'),
      modifiers: bossIsPsyker ? { baseDamageBonus: extraDmg } : {},
      applicable: bossIsPsyker,
      reason: bossIsPsyker ? `+${extraDmg} damage vs Psyker` : 'Boss is not a Psyker',
      requiresToggle: false,
    };
  },
};

/**
 * GeminaeSuperia (Celestine)
 * When attacked, summons a Geminae Superia - defensive/reaction, not usable in calculator
 * Variables: summonHp, summonDmg, summonArmor
 * Constants: unitId: adeptSmnGeminaeSuperia
 */
export const GeminaeSuperiasHandler: AbilityHandler = {
  abilityId: 'GeminaeSuperia',
  abilityName: 'Geminae Superia',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const summonDmg = values.summonDmg as number || 0;
    const summonHp = values.summonHp as number || 0;
    const summonArmor = values.summonArmor as number || 0;

    // Reaction during enemy turn - not directly modeled
    return {
      abilityId: 'GeminaeSuperia',
      abilityName: getAbilityNameSync('GeminaeSuperia'),
      modifiers: {},
      applicable: false,  // Reaction timing not modeled
      reason: `Reaction: Summons Geminae (HP: ${summonHp}, Dmg: ${summonDmg}, Armor: ${summonArmor})`,
      requiresToggle: false,
    };
  },
};

/**
 * SwornProtector (Creed)
 * When attacked, summons Kell - defensive/reaction, not usable in calculator
 * Variables: summonHp, summonDmg, summonArmor
 * Constants: unitId: astraSmnKell
 */
export const SwornProtectorHandler: AbilityHandler = {
  abilityId: 'SwornProtector',
  abilityName: 'Sworn Protector',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const summonDmg = values.summonDmg as number || 0;
    const summonHp = values.summonHp as number || 0;

    // Reaction during enemy turn - not directly modeled
    return {
      abilityId: 'SwornProtector',
      abilityName: getAbilityNameSync('SwornProtector'),
      modifiers: {},
      applicable: false,  // Reaction timing not modeled
      reason: `Reaction: Summons Kell when attacked (HP: ${summonHp}, Dmg: ${summonDmg})`,
      requiresToggle: false,
    };
  },
};

/**
 * ToughToKill (Dreir)
 * Regenerates health + reduces crit chance/damage against him - defensive, not modeled
 * Variables: critChanceReduction, critDmgReduction, hpToHeal
 */
export const ToughToKillHandler: AbilityHandler = {
  abilityId: 'ToughToKill',
  abilityName: 'Tough to Kill',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const critChanceReduction = values.critChanceReduction as number || 25;
    const critDmgReduction = values.critDmgReduction as number || 0;
    const hpToHeal = values.hpToHeal as number || 30;

    // Defensive ability - not modeled for attacker damage calculation
    return {
      abilityId: 'ToughToKill',
      abilityName: getAbilityNameSync('ToughToKill'),
      modifiers: {},
      applicable: false,  // Defensive ability
      reason: `Defensive: Regen ${hpToHeal} HP, enemies -${critChanceReduction}% crit, -${critDmgReduction} crit dmg`,
      requiresToggle: false,
    };
  },
};

/**
 * AvalancheOfMuscle (Kut)
 * +extraDmg when charging
 * Variables: extraDmg
 */
export const AvalancheOfMuscleHandler: AbilityHandler = {
  abilityId: 'AvalancheOfMuscle',
  abilityName: 'Avalanche of Muscle',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    const extraDmg = values.extraDmg as number || 0;
    const isCharging = isToggleActive(context.abilityToggles?.['AvalancheOfMuscle']);

    return {
      abilityId: 'AvalancheOfMuscle',
      abilityName: getAbilityNameSync('AvalancheOfMuscle'),
      modifiers: isCharging ? { baseDamageBonus: extraDmg } : {},
      applicable: isCharging,
      reason: isCharging ? `+${extraDmg} damage (charging)` : 'Not charging',
      requiresToggle: true,
      toggleLabel: 'Charging',
    };
  },
};

/**
 * Nightshroud (Sibyll)
 * Adjacent allies get Infiltrate and damage reduction - defensive/aura, not modeled
 * Variables: dmgReduction
 */
export const NightshroudHandler: AbilityHandler = {
  abilityId: 'Nightshroud',
  abilityName: 'Nightshroud',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const dmgReduction = values.dmgReduction as number || 0;

    // Defensive aura ability - not modeled for attacker damage calculation
    return {
      abilityId: 'Nightshroud',
      abilityName: getAbilityNameSync('Nightshroud'),
      modifiers: {},
      applicable: false,  // Defensive ability
      reason: `Aura: Adjacent allies Infiltrate, -${dmgReduction} damage taken`,
      requiresToggle: false,
    };
  },
};

// SpotterReworked moved to auraHandlers.ts (team-wide aura)

/**
 * SummaryExecution (Yarrick)
 * Units with Battle Fatigue +extraDmg
 * Variables: extraDmg, extraDmg_2 (after first execution)
 */
export const SummaryExecutionHandler: AbilityHandler = {
  abilityId: 'SummaryExecution',
  abilityName: 'Summary Execution',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (_values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    return {
      abilityId: 'SummaryExecution',
      abilityName: getAbilityNameSync('SummaryExecution'),
      modifiers: {},
      applicable: false,
      reason: 'Buffs summons with Battle Fatigue (see summon cards)',
      requiresToggle: false,
    };
  },
};

/**
 * DefenderOfTheGreaterGood (Shadowsun)
 * Aura: adjacent allies (T'au: range 2) deal +extraDmg with ranged attacks (not Psychic).
 * 25% chance per round for +1 hit. Handled via buffConditions.ts and battleStore.ts.
 * Variables: extraDmg
 * Constants: chance: 25, extraHit: 1
 */
export const DefenderOfTheGreaterGoodHandler: AbilityHandler = {
  abilityId: 'DefenderOfTheGreaterGood',
  abilityName: 'Defender of the Greater Good',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const extraDmg = values.extraDmg as number || 0;

    return {
      abilityId: 'DefenderOfTheGreaterGood',
      abilityName: getAbilityNameSync('DefenderOfTheGreaterGood'),
      modifiers: {},
      applicable: false,
      reason: `Aura: allies +${extraDmg} ranged dmg (not Psychic). T'au: range 2`,
      requiresToggle: false,
    };
  },
};

/**
 * PathOfCommand (Aethana)
 * Aura: +extraDmg to self, +extraDmg_2 to Aeldari within range 2, +extraCritChance
 * Variables: extraDmg, extraDmg_2, extraCritChance
 * Constants: range: 2
 */
export const PathOfCommandHandler: AbilityHandler = {
  abilityId: 'PathOfCommand',
  abilityName: 'Path of Command',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const extraDmg = values.extraDmg as number || 0;
    const extraCritChance = values.extraCritChance as number || 0;

    return {
      abilityId: 'PathOfCommand',
      abilityName: getAbilityNameSync('PathOfCommand'),
      modifiers: {
        baseDamageBonus: extraDmg,
        critChanceBonus: extraCritChance,
      },
      applicable: true,
      reason: `+${extraDmg} damage, +${extraCritChance}% crit chance (aura buffs Aeldari within range 2)`,
      requiresToggle: false,
    };
  },
};

/**
 * WireweaveNet (Calandis)
 * Reaction: 2x Piercing when enemy enters adjacency
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Piercing, nrOfHits: 2
 */
export const WireweaveNetHandler: AbilityHandler = {
  abilityId: 'WireweaveNet',
  abilityName: 'Wireweave Net',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;

    return {
      abilityId: 'WireweaveNet',
      abilityName: getAbilityNameSync('WireweaveNet'),
      modifiers: {},
      applicable: false,  // Reaction timing not modeled
      reason: `Reaction: 2x Piercing (${minDmg}-${maxDmg}) when enemy enters adjacency`,
      requiresToggle: false,
    };
  },
};

/**
 * TerrorsLament (Jain Zar)
 * Adjacent enemies take -dmgReduction damage and -1 hit
 * Variables: dmgReduction
 * Constants: hitsReduction: 1
 */
export const TerrorsLamentHandler: AbilityHandler = {
  abilityId: 'TerrorsLament',
  abilityName: "Terror's Lament",
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const dmgReduction = values.dmgReduction as number || 0;
    const hitsReduction = values.hitsReduction as number || 1;

    return {
      abilityId: 'TerrorsLament',
      abilityName: getAbilityNameSync('TerrorsLament'),
      modifiers: {},
      applicable: false,  // Enemy debuff not modeled
      reason: `Adjacent enemies: -${dmgReduction} damage, -${hitsReduction} hit`,
      requiresToggle: false,
    };
  },
};

/**
 * InescapableAccuracy (Maugan Ra)
 * +critChance, +critDmg if didn't move this turn
 * Variables: extraCritChance, extraCritDmg
 */
export const InescapableAccuracyHandler: AbilityHandler = {
  abilityId: 'InescapableAccuracy',
  abilityName: 'Inescapable Accuracy',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    const extraCritChance = values.extraCritChance as number || 0;
    const extraCritDmg = values.extraCritDmg as number || 0;
    const didNotMove = isToggleActive(context.abilityToggles?.['InescapableAccuracy']);

    return {
      abilityId: 'InescapableAccuracy',
      abilityName: getAbilityNameSync('InescapableAccuracy'),
      modifiers: didNotMove
        ? { critChanceBonus: extraCritChance, critDamageBonus: extraCritDmg }
        : {},
      applicable: didNotMove,
      reason: didNotMove
        ? `+${extraCritChance}% crit chance, +${extraCritDmg} crit damage (did not move)`
        : 'Moved this turn',
      requiresToggle: true,
      toggleLabel: 'Did not move',
    };
  },
};

/**
 * FabricatorClawArray (Aleph-Null)
 * After moving, repairs one random adjacent Mechanical unit
 * Variables: hpToRepair
 */
export const FabricatorClawArrayHandler: AbilityHandler = {
  abilityId: 'FabricatorClawArray',
  abilityName: 'Fabricator Claw Array',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const hpToRepair = values.hpToRepair as number || 0;

    return {
      abilityId: 'FabricatorClawArray',
      abilityName: getAbilityNameSync('FabricatorClawArray'),
      modifiers: {},
      applicable: false,  // Repair effect not modeled in damage calc
      reason: `Repairs adjacent Mechanical unit for ${hpToRepair} HP`,
      requiresToggle: false,
    };
  },
};

/**
 * MartialApotheosis (Anuphet)
 * Start of turn: 2x Energy to random adjacent enemy
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Energy, nrOfHits: 2
 */
export const MartialApotheosisHandler: AbilityHandler = {
  abilityId: 'MartialApotheosis',
  abilityName: 'Martial Apotheosis',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const hits = values.nrOfHits as number || 2;

    return {
      abilityId: 'MartialApotheosis',
      abilityName: getAbilityNameSync('MartialApotheosis'),
      modifiers: {},
      applicable: false,  // Start-of-turn trigger, not attack modifier
      reason: `Start of turn: ${hits}x Energy (${minDmg}-${maxDmg}) to adjacent enemy`,
      requiresToggle: false,
    };
  },
};

/**
 * InescapableDeath (Imospekh)
 * +extraDmg to attacks, adjacent enemies -1 hit
 * Variables: extraDmg
 * Constants: hitsReduction: 1
 */
export const InescapableDeathHandler: AbilityHandler = {
  abilityId: 'InescapableDeath',
  abilityName: 'Inescapable Death',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const extraDmg = values.extraDmg as number || 0;

    return {
      abilityId: 'InescapableDeath',
      abilityName: getAbilityNameSync('InescapableDeath'),
      modifiers: {
        baseDamageBonus: extraDmg,
      },
      applicable: true,
      reason: `+${extraDmg} damage (adjacent enemies -1 hit)`,
      requiresToggle: false,
    };
  },
};

/**
 * RelentlessMarch (Makhotep)
 * +1 Movement to adjacent allies, repairs Mechanical units
 * Variables: hpToRepair
 */
export const RelentlessMarchHandler: AbilityHandler = {
  abilityId: 'RelentlessMarch',
  abilityName: 'Relentless March',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const hpToRepair = values.hpToRepair as number || 0;

    return {
      abilityId: 'RelentlessMarch',
      abilityName: getAbilityNameSync('RelentlessMarch'),
      modifiers: {},
      applicable: false,  // Movement/repair effect not modeled
      reason: `Adjacent allies +1 Movement, Mechanical units +${hpToRepair} HP`,
      requiresToggle: false,
    };
  },
};

/**
 * LivingLightning (Thutmose)
 * After moving: 1x DirectDamage to random adjacent enemy (raw damage, no crit)
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: DirectDamage, nrOfHits: 1
 */
export const LivingLightningHandler: AbilityHandler = {
  abilityId: 'LivingLightning',
  abilityName: 'Living Lightning',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const hasMoved = isToggleActive(context.abilityToggles?.['LivingLightning']);

    return {
      abilityId: 'LivingLightning',
      abilityName: getAbilityNameSync('LivingLightning'),
      modifiers: {},
      applicable: hasMoved,
      reason: hasMoved
        ? `1x DirectDamage (${minDmg}-${maxDmg}) to adjacent enemy (raw damage)`
        : 'Triggers after moving or at end of turn',
      requiresToggle: true,
      toggleLabel: 'Has moved',
      followUpAttack: hasMoved
        ? {
            abilityId: 'LivingLightning',
            abilityName: getAbilityNameSync('LivingLightning'),
            hits: 1,
            minDamage: minDmg,
            maxDamage: maxDmg,
            damageProfile: 'DirectDamage' as DamageType,
            attackCategory: 'special',
          }
        : undefined,
    };
  },
};

// ============= TYRANIDS =============

/**
 * FeederTendrils (Deathleaper)
 * +extraDmg on kill, heals hpToHeal
 */
export const FeederTendrilsHandler: AbilityHandler = {
  abilityId: 'FeederTendrils',
  abilityName: 'Feeder Tendrils',
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const extraDmg = values.extraDmg as number || 0;
    const hpToHeal = values.hpToHeal as number || 0;
    return {
      abilityId: 'FeederTendrils',
      abilityName: getAbilityNameSync('FeederTendrils'),
      modifiers: { baseDamageBonus: extraDmg },
      applicable: true,
      reason: `+${extraDmg} damage, heals ${hpToHeal} HP on kill`,
      requiresToggle: false,
    };
  },
};

/**
 * Neuroparasite (Neurothrope)
 * +extraDmg, stacks up to buffMaxLevel
 */
export const NeuroparasiteHandler: AbilityHandler = {
  abilityId: 'Neuroparasite',
  abilityName: 'Neuroparasite',
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const extraDmg = values.extraDmg as number || 0;
    const buffMaxLevel = values.buffMaxLevel as number || 10;
    return {
      abilityId: 'Neuroparasite',
      abilityName: getAbilityNameSync('Neuroparasite'),
      modifiers: { baseDamageBonus: extraDmg },
      applicable: true,
      reason: `+${extraDmg} damage per stack (max ${buffMaxLevel})`,
      requiresToggle: false,
    };
  },
};

/**
 * BarbedOvipositor (Parasite of Mortrex)
 * Summons Ripper Swarm on kill
 */
export const BarbedOvipositorHandler: AbilityHandler = {
  abilityId: 'BarbedOvipositor',
  abilityName: 'Barbed Ovipositor',
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const summonHp = values.summonHp as number || 0;
    return {
      abilityId: 'BarbedOvipositor',
      abilityName: getAbilityNameSync('BarbedOvipositor'),
      modifiers: {},
      applicable: false,  // On-kill trigger not modeled
      reason: `On kill: Summons Ripper Swarm (HP: ${summonHp})`,
      requiresToggle: false,
    };
  },
};

/**
 * GuardianOrganism (Tyrant Guard)
 * Reduces damage to adjacent Synapse creatures
 */
export const GuardianOrganismHandler: AbilityHandler = {
  abilityId: 'GuardianOrganism',
  abilityName: 'Guardian Organism',
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const dmgReduction = values.dmgReduction as number || 0;
    const dmgReductionPct = values.dmgReductionPct as number || 25;
    return {
      abilityId: 'GuardianOrganism',
      abilityName: getAbilityNameSync('GuardianOrganism'),
      modifiers: {},
      applicable: false,  // Defensive - protects allies
      reason: `Adjacent Synapse: -${dmgReduction} / -${dmgReductionPct}% damage`,
      requiresToggle: false,
    };
  },
};

/**
 * SynapticLinchpin (Winged Prime)
 * Summons Hormagaunts at turn start
 */
export const SynapticLinchpinHandler: AbilityHandler = {
  abilityId: 'SynapticLinchpin',
  abilityName: 'Synaptic Linchpin',
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const summonHp = values.summonHp as number || 0;
    const maxSummons = values.maxSummons as number || 2;
    return {
      abilityId: 'SynapticLinchpin',
      abilityName: getAbilityNameSync('SynapticLinchpin'),
      modifiers: {},
      applicable: false,  // Turn-start summon not modeled
      reason: `Turn start: Summons Hormagaunt (max ${maxSummons}, HP: ${summonHp})`,
      requiresToggle: false,
    };
  },
};

// ============= ORKS =============

/**
 * KustomForceField (Gibbascrapz)
 * Adjacent units get bonus armor
 * Variables: extraArmor
 */
export const KustomForceFieldHandler: AbilityHandler = {
  abilityId: 'KustomForceField',
  abilityName: 'Kustom Force Field',
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const extraArmor = values.extraArmor as number || 0;
    return {
      abilityId: 'KustomForceField',
      abilityName: getAbilityNameSync('KustomForceField'),
      modifiers: {},
      applicable: false,  // Defensive aura - benefits allies, not this character's damage
      reason: `Aura: Adjacent allies get +${extraArmor} Armor`,
      requiresToggle: false,
    };
  },
};

/**
 * PowerTrip (Snappawrecka)
 * Normal attacks ignore armor, +1 hit when at full health (with armor reduction, self-damage)
 * Variables: armorIgnored, armorReduction
 * Constants: extraHit: 1, hpPct: 5
 */
export const PowerTripHandler: AbilityHandler = {
  abilityId: 'PowerTrip',
  abilityName: 'Power Trip',
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    const armorIgnored = values.armorIgnored as number || 0;
    const armorReduction = values.armorReduction as number || 0;
    const atFullHealth = isToggleActive(context.abilityToggles?.['PowerTrip']);
    return {
      abilityId: 'PowerTrip',
      abilityName: getAbilityNameSync('PowerTrip'),
      modifiers: {
        armorIgnored: armorIgnored,
        extraHits: atFullHealth ? 1 : 0,
      },
      applicable: true,
      reason: atFullHealth
        ? `Ignores ${armorIgnored} Armor, +1 hit, -${armorReduction} enemy Armor (costs 5% HP)`
        : `Ignores ${armorIgnored} Armor`,
      requiresToggle: true,
      toggleLabel: 'At full Health',
    };
  },
};

/**
 * SquigHound (Snotflogga)
 * Normal attacks deal follow-up 2x Physical, can summon Grot after attack
 * Variables: minDmg, maxDmg, summonHp, summonDmg
 * Constants: nrOfHits: 2, damageProfile: Physical, maxSummons: 5
 */
export const SquigHoundHandler: AbilityHandler = {
  abilityId: 'SquigHound',
  abilityName: 'Squig Hound',
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const summonHp = values.summonHp as number || 0;
    return {
      abilityId: 'SquigHound',
      abilityName: getAbilityNameSync('SquigHound'),
      modifiers: {},
      applicable: true,
      reason: `+2x Physical (${minDmg}-${maxDmg}). May summon Grot (max 5, HP: ${summonHp})`,
      requiresToggle: false,
      followUpAttack: {
        abilityId: 'SquigHound',
        abilityName: getAbilityNameSync('SquigHound'),
        hits: 2,
        minDamage: minDmg,
        maxDamage: maxDmg,
        damageProfile: 'Physical' as DamageType,
        attackCategory: 'special',
        triggersOnNormalOnly: true,
      },
    };
  },
};

/**
 * SmashaEad (Tanksmasha)
 * +extraDmg for normal attacks after moving 2+ hexes, also damage reduction
 * Variables: extraDmg, dmgReductionPct
 */
export const SmashaEadHandler: AbilityHandler = {
  abilityId: 'SmashaEad',
  abilityName: "Smasha 'Ead",
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    const extraDmg = values.extraDmg as number || 0;
    const dmgReductionPct = values.dmgReductionPct as number || 25;
    const hasMoved2Hexes = isToggleActive(context.abilityToggles?.['SmashaEad']);
    return {
      abilityId: 'SmashaEad',
      abilityName: getAbilityNameSync('SmashaEad'),
      modifiers: hasMoved2Hexes ? { baseDamageBonus: extraDmg } : {},
      applicable: hasMoved2Hexes,
      reason: hasMoved2Hexes
        ? `+${extraDmg} Damage for normal attacks, -${dmgReductionPct}% damage taken`
        : 'Triggers when moving 2+ hexes',
      requiresToggle: true,
      toggleLabel: 'Moved 2+ hexes',
    };
  },
};

// ============= BLACK LEGION =============

/**
 * HatefulAssault (Angrax)
 * Reaction: attacks enemy that moves away from adjacent hex
 * Variables: minDmg, maxDmg, extraDmg
 * Constants: nrOfHits: 2
 */
export const HatefulAssaultHandler: AbilityHandler = {
  abilityId: 'HatefulAssault',
  abilityName: 'Hateful Assault',
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const extraDmg = values.extraDmg as number || 0;
    return {
      abilityId: 'HatefulAssault',
      abilityName: getAbilityNameSync('HatefulAssault'),
      modifiers: {},
      applicable: false,  // Reaction ability - not modeled in main damage calc
      reason: `Reaction: 2x Power (${minDmg}-${maxDmg}) when enemy leaves adjacent. +${extraDmg} to normal attacks`,
      requiresToggle: false,
    };
  },
};

/**
 * Possession (Archimatos)
 * Summons Bloodletter or Blue Horror when enemy is defeated
 * Variables: summonHp, summonDmg, summonHp_2, summonDmg_2
 * Constants: unitId: blackSmnBloodletter, unitId_2: thousSmnBlueHorror
 */
export const PossessionHandler: AbilityHandler = {
  abilityId: 'Possession',
  abilityName: 'Possession',
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const summonHp = values.summonHp as number || 0;
    const summonHp2 = values.summonHp_2 as number || 0;
    return {
      abilityId: 'Possession',
      abilityName: getAbilityNameSync('Possession'),
      modifiers: {},
      applicable: false,  // On-kill trigger not modeled
      reason: `On kill: Summons Bloodletter (HP: ${summonHp}) or Blue Horror (HP: ${summonHp2})`,
      requiresToggle: false,
    };
  },
};

/**
 * HeadClaimer (Haarken)
 * +extraDmg per enemy killed, +extraHit per Character killed
 * Variables: extraDmg
 * Constants: extraHit: 1
 */
export const HeadClaimerHandler: AbilityHandler = {
  abilityId: 'HeadClaimer',
  abilityName: 'Head-Claimer',
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    const extraDmg = values.extraDmg as number || 0;
    const killCount = (context.abilityToggles?.['HeadClaimer_Kills'] as number) || 0;
    return {
      abilityId: 'HeadClaimer',
      abilityName: getAbilityNameSync('HeadClaimer'),
      modifiers: {
        baseDamageBonus: extraDmg * killCount,
      },
      applicable: killCount > 0,
      reason: killCount > 0
        ? `+${extraDmg * killCount} Dmg (${killCount} kills)`
        : `+${extraDmg} per kill`,
      requiresToggle: false,
    };
  },
};

/**
 * FleshmetalGuns (Volk)
 * Follow-up attacks after ranged: cycles through 3 effects based on turn
 * T1/T4: 2x Melta, T2/T5: 2x Flame, T3/T6: 2x HeavyRound
 * Variables: minDmg, maxDmg (Melta), minDmg_2, maxDmg_2 (Flame), minDmg_3, maxDmg_3 (HeavyRound)
 */
export const FleshmetalGunsHandler: AbilityHandler = {
  abilityId: 'FleshmetalGuns',
  abilityName: 'Fleshmetal Guns',
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    const isRanged = context.attackType === 'ranged';
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const minDmg2 = values.minDmg_2 as number || 0;
    const maxDmg2 = values.maxDmg_2 as number || 0;
    const minDmg3 = values.minDmg_3 as number || 0;
    const maxDmg3 = values.maxDmg_3 as number || 0;

    // Cycle through 3 phases based on turn: 0=Melta, 1=Flame, 2=HeavyRound
    const phase = ((context.currentTurn - 1) % 3);
    const phaseConfig = [
      { name: 'Melta', profile: 'Melta' as DamageType, min: minDmg, max: maxDmg },
      { name: 'Flame', profile: 'Flame' as DamageType, min: minDmg2, max: maxDmg2 },
      { name: 'HeavyRound', profile: 'HeavyRound' as DamageType, min: minDmg3, max: maxDmg3 },
    ][phase];

    const abilityName = getAbilityNameSync('FleshmetalGuns');

    const followUpAttack: FollowUpAttack | undefined = isRanged ? {
      abilityId: 'FleshmetalGuns',
      abilityName,
      hits: 2,
      minDamage: phaseConfig.min,
      maxDamage: phaseConfig.max,
      damageProfile: phaseConfig.profile,
      attackCategory: 'special',
    } : undefined;

    return {
      abilityId: 'FleshmetalGuns',
      abilityName,
      modifiers: {},
      applicable: isRanged,
      reason: isRanged
        ? `T${context.currentTurn}: 2x ${phaseConfig.name} (${phaseConfig.min}-${phaseConfig.max})`
        : 'Only triggers on ranged attacks',
      requiresToggle: false,
      followUpAttack,
    };
  },
};

// ============= WORLD EATERS =============

/**
 * BeaconOfRage (Azkor)
 * +extraDmg per time attacked (max 8), shares 50% to adjacent Chaos if killed enemy
 * Variables: extraDmg
 * Constants: nrOfAttacks: 8
 */
export const BeaconOfRageHandler: AbilityHandler = {
  abilityId: 'BeaconOfRage',
  abilityName: 'Beacon Of Rage',
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    const extraDmg = values.extraDmg as number || 0;
    const attackCount = context.abilityToggles?.['BeaconOfRage'] ? 1 : 0;
    return {
      abilityId: 'BeaconOfRage',
      abilityName: getAbilityNameSync('BeaconOfRage'),
      modifiers: { baseDamageBonus: extraDmg * attackCount },
      applicable: attackCount > 0,
      reason: attackCount > 0
        ? `+${extraDmg * attackCount} Dmg (${attackCount} attacks received)`
        : `+${extraDmg} per attack taken (max 8). 50% to adj Chaos if killed enemy`,
      requiresToggle: true,
      toggleLabel: 'Been attacked',
    };
  },
};

/**
 * Skullsmasher (Macer)
 * +extraDmg per 10% HP missing, stuns if killed enemy
 * Variables: extraDmg
 * Constants: hpPct: 10
 */
export const SkullsmasherHandler: AbilityHandler = {
  abilityId: 'Skullsmasher',
  abilityName: 'Skullsmasher',
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    const extraDmg = values.extraDmg as number || 0;
    const hpMissing = context.abilityToggles?.['Skullsmasher'] ? 1 : 0;
    return {
      abilityId: 'Skullsmasher',
      abilityName: getAbilityNameSync('Skullsmasher'),
      modifiers: { baseDamageBonus: extraDmg * hpMissing },
      applicable: hpMissing > 0,
      reason: hpMissing > 0
        ? `+${extraDmg * hpMissing} Dmg (${hpMissing * 10}% HP missing). Stuns if killed enemy`
        : `+${extraDmg} per 10% HP missing. Stuns if killed enemy`,
      requiresToggle: true,
      toggleLabel: 'Missing HP (10%)',
    };
  },
};

/**
 * TrophyTaker (Tarvakh)
 * +extraDmg and +extraCritDmg vs targets at/below 50% HP, +extraCritChance per kill
 * Variables: extraDmg, extraCritDmg, extraCritChance
 * Constants: hpPct: 50
 */
export const TrophyTakerHandler: AbilityHandler = {
  abilityId: 'TrophyTaker',
  abilityName: 'Trophy Taker',
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    const extraDmg = values.extraDmg as number || 0;
    const extraCritDmg = values.extraCritDmg as number || 0;
    const extraCritChance = values.extraCritChance as number || 8;
    const targetLowHP = isToggleActive(context.abilityToggles?.['TrophyTaker']);
    return {
      abilityId: 'TrophyTaker',
      abilityName: getAbilityNameSync('TrophyTaker'),
      modifiers: targetLowHP ? { baseDamageBonus: extraDmg } : {},
      applicable: targetLowHP,
      reason: targetLowHP
        ? `+${extraDmg} Dmg, +${extraCritDmg} Crit Dmg vs low HP. +${extraCritChance}% Crit per kill`
        : `+${extraDmg} Dmg vs <50% HP targets. +${extraCritChance}% Crit per kill`,
      requiresToggle: true,
      toggleLabel: 'Target at/below 50% HP',
    };
  },
};

/**
 * WrathfulDevotion (Wrask)
 * Shield on Deep Strike or melee kill for self + adjacent Chaos
 * Variables: shieldHp
 */
export const WrathfulDevotionHandler: AbilityHandler = {
  abilityId: 'WrathfulDevotion',
  abilityName: 'Wrathful Devotion',
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const shieldHp = values.shieldHp as number || 0;
    return {
      abilityId: 'WrathfulDevotion',
      abilityName: getAbilityNameSync('WrathfulDevotion'),
      modifiers: {},
      applicable: false,  // Defensive/trigger - not modeled in damage calc
      reason: `On Deep Strike or melee kill: ${shieldHp} Shield to self + adj Chaos`,
      requiresToggle: false,
    };
  },
};

// =====================
// DEATHGUARD PASSIVES
// =====================

/**
 * CursedPlagueBell (Corrodius)
 * Friendly Chaos units in Contagion get +1 Movement.
 * Enemy Psykers in Contagion take 1x Psychic self-damage when their attacks deal Psychic damage.
 * Variables: dmg
 * Constants: extraMovement: 1, nrOfHits: 1, affectedDamageProfile: Psychic
 */
export const CursedPlagueBellHandler: AbilityHandler = {
  abilityId: 'CursedPlagueBell',
  abilityName: 'Cursed Plague Bell',
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const dmg = values.dmg as number || 0;
    return {
      abilityId: 'CursedPlagueBell',
      abilityName: getAbilityNameSync('CursedPlagueBell'),
      modifiers: {},
      applicable: false, // Aura effect - no modifier to Corrodius himself
      reason: `Aura: Chaos allies in Contagion get +1 Movement. Psykers take 1x ${dmg} Psychic self-damage on Psychic attacks`,
      requiresToggle: false,
    };
  },
};

/**
 * HazeOfCorruption (Maladus)
 * On kill, leftover damage + 1x Toxic to adjacent enemy. Chains on kill.
 * Variables: extraDmg
 * Constants: damageProfile: Toxic, nrOfHits: 1
 */
export const HazeOfCorruptionHandler: AbilityHandler = {
  abilityId: 'HazeOfCorruption',
  abilityName: 'Haze of Corruption',
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const extraDmg = values.extraDmg as number || 0;
    return {
      abilityId: 'HazeOfCorruption',
      abilityName: getAbilityNameSync('HazeOfCorruption'),
      modifiers: {},
      applicable: false, // Trigger on kill - not a modifier
      reason: `On kill: leftover damage + 1x ${extraDmg} Toxic to adj enemy. Chains on kill`,
      requiresToggle: false,
    };
  },
};

/**
 * TaintedNarthecium (Nauseous)
 * 75% chance to revive adjacent Chaos unit with X HP (even if overkilled). Once per turn.
 * Variables: hp
 * Constants: chance: 75
 */
export const TaintedNartheciumHandler: AbilityHandler = {
  abilityId: 'TaintedNarthecium',
  abilityName: 'Tainted Narthecium',
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const hp = values.hp as number || 0;
    return {
      abilityId: 'TaintedNarthecium',
      abilityName: getAbilityNameSync('TaintedNarthecium'),
      modifiers: {},
      applicable: false, // Defensive/revive - not a damage modifier
      reason: `75% chance to revive adj Chaos unit with ${hp} HP (ignores overkill). 1/turn`,
      requiresToggle: false,
    };
  },
};

/**
 * ExplosiveMaladies (Pestillian)
 * Adjacent allies deal +1x Blast on ranged attacks. Chaos also on melee.
 * Variables: extraDmg
 * Constants: affectedDamageProfile: Blast, nrOfHits: 1
 */
export const ExplosiveMaladiesHandler: AbilityHandler = {
  abilityId: 'ExplosiveMaladies',
  abilityName: 'Explosive Maladies',
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const extraDmg = values.extraDmg as number || 0;
    // Teammate aura - follow-up is handled in battleStore via toggle on the attacker
    return {
      abilityId: 'ExplosiveMaladies',
      abilityName: getAbilityNameSync('ExplosiveMaladies'),
      modifiers: {},
      applicable: false,
      reason: `Adjacent allies: +1x ${extraDmg} Blast on ranged (Chaos: also melee)`,
      requiresToggle: false,
    };
  },
};

/**
 * DestroyerHive (Typhus)
 * At turn start, deals 1x Direct to random adjacent enemy.
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: DirectDamage, nrOfHits: 1
 */
export const DestroyerHiveHandler: AbilityHandler = {
  abilityId: 'DestroyerHive',
  abilityName: 'Destroyer Hive',
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    return {
      abilityId: 'DestroyerHive',
      abilityName: getAbilityNameSync('DestroyerHive'),
      modifiers: {},
      applicable: false, // Turn start trigger - not a damage modifier
      reason: `Turn start: 1x ${minDmg}-${maxDmg} Direct to random adj enemy`,
      requiresToggle: false,
    };
  },
};

// =======================
// THOUSANDSONS PASSIVES
// =======================

/**
 * InfernalPacts (Abraxas)
 * Adjacent Chaos allies get +1x Psychic on ranged attacks. Daemons also on melee.
 * Variables: minDmg, maxDmg
 * Constants: affectedDamageProfile: Psychic, nrOfHits: 1
 */
export const InfernalPactsHandler: AbilityHandler = {
  abilityId: 'InfernalPacts',
  abilityName: 'Infernal Pacts',
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    // Teammate aura - follow-up is handled in battleStore via toggle on the attacker
    return {
      abilityId: 'InfernalPacts',
      abilityName: getAbilityNameSync('InfernalPacts'),
      modifiers: {},
      applicable: false,
      reason: `Adjacent Chaos allies: +1x ${minDmg}-${maxDmg} Psychic on ranged (Daemons: also melee)`,
      requiresToggle: false,
    };
  },
};

/**
 * PsychicStalk (Ahriman)
 * Flame/Psychic attacks to enemies on Fire deal +dmgPct%. Chaos allies get +extraDmg.
 * Ahriman's ranged attacks set target hex on Fire.
 * Variables: extraDmgPct, maxDmg, extraDmg
 * Constants: affectedDamageProfile: Flame, affectedDamageProfile_2: Psychic
 */
export const PsychicStalkHandler: AbilityHandler = {
  abilityId: 'PsychicStalk',
  abilityName: 'Psychic Stalk',
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    const extraDmgPct = values.extraDmgPct as number || 25;
    const extraDmg = values.extraDmg as number || 0;
    const bossOnFire = context.bossDebuffs?.includes('OnHexWithFire') ?? false;

    return {
      abilityId: 'PsychicStalk',
      abilityName: getAbilityNameSync('PsychicStalk'),
      modifiers: bossOnFire ? {
        baseDamageMultiplier: 1 + (extraDmgPct / 100),
        baseDamageBonus: extraDmg,
      } : {},
      applicable: bossOnFire,
      reason: bossOnFire
        ? `+${extraDmgPct}% Flame/Psychic dmg, +${extraDmg} Chaos dmg`
        : 'Boss not on Fire hex',
      requiresToggle: false,
    };
  },
};

/**
 * ArcaneShield (Thaumachus)
 * After moving, applies shield to closest friendly unit within range 2.
 * Variables: shieldHp
 * Constants: range: 2
 */
export const ArcaneShieldHandler: AbilityHandler = {
  abilityId: 'ArcaneShield',
  abilityName: 'Arcane Shield',
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const shieldHp = values.shieldHp as number || 0;
    return {
      abilityId: 'ArcaneShield',
      abilityName: getAbilityNameSync('ArcaneShield'),
      modifiers: {},
      applicable: false, // Defensive/trigger - not a damage modifier
      reason: `After moving: ${shieldHp} Shield to closest ally in range 2 (prefers TS > Chaos > others > self)`,
      requiresToggle: false,
    };
  },
};

/**
 * TimeFlux (Toth)
 * Regen at turn start. Leaves time ghost when moving. Revives at ghost location on death.
 * Variables: hpToHeal, hp, maxHpToHeal
 */
export const TimeFluxHandler: AbilityHandler = {
  abilityId: 'TimeFlux',
  abilityName: 'Time Flux',
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const hpToHeal = values.hpToHeal as number || 0;
    const hp = values.hp as number || 0;
    const maxHpToHeal = values.maxHpToHeal as number || 0;
    return {
      abilityId: 'TimeFlux',
      abilityName: getAbilityNameSync('TimeFlux'),
      modifiers: {},
      applicable: false, // Defensive/regen - not a damage modifier
      reason: `Turn start: regen ${hpToHeal} HP + last hit dmg (max ${maxHpToHeal}). Time ghost revives with ${hp} HP`,
      requiresToggle: false,
    };
  },
};

/**
 * RealityUnbound (Yazaghor)
 * +extraMaxDmg per enemy hit by Psychic this turn. If 3+, gains +movement and +range.
 * Variables: extraMaxDmg
 * Constants: extraRange: 1, extraMovement: 1
 */
export const RealityUnboundHandler: AbilityHandler = {
  abilityId: 'RealityUnbound',
  abilityName: 'Reality Unbound',
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    const extraMaxDmg = values.extraMaxDmg as number || 0;
    const enemiesHit = isToggleActive(context.abilityToggles?.['RealityUnbound']);

    return {
      abilityId: 'RealityUnbound',
      abilityName: getAbilityNameSync('RealityUnbound'),
      modifiers: enemiesHit ? {
        baseDamageBonus: extraMaxDmg, // Per enemy hit by Psychic
      } : {},
      applicable: enemiesHit,
      reason: enemiesHit
        ? `+${extraMaxDmg} max dmg per enemy hit by Psychic. If 3+: +1 Move, +1 Range`
        : `No enemies hit by Psychic this turn`,
      requiresToggle: true,
      toggleLabel: 'Enemies hit by Psychic',
    };
  },
};

// ==========================
// EMPERORSCHILDREN PASSIVES
// ==========================

/**
 * ObsessiveAnnunciation (Adamatar)
 * Enemies adjacent to Adamatar take +extraDmg from ranged attacks.
 * If overkill this turn, they also take +extraCritDmg from Chaos attacks.
 * Variables: extraDmg, extraCritDmg
 */
export const ObsessiveAnnunciationHandler: AbilityHandler = {
  abilityId: 'ObsessiveAnnunciation',
  abilityName: 'Obsessive Annunciation',
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const extraDmg = values.extraDmg as number || 0;
    const extraCritDmg = values.extraCritDmg as number || 0;
    return {
      abilityId: 'ObsessiveAnnunciation',
      abilityName: getAbilityNameSync('ObsessiveAnnunciation'),
      modifiers: {},
      applicable: false,
      reason: `Ranged allies: +${extraDmg} dmg vs enemies adj to Adamatar. If overkill: +${extraCritDmg} crit dmg from Chaos`,
      requiresToggle: false,
    };
  },
};

/**
 * EcstaticSlaughter (Hascule)
 * When Thrilled or adj enemy overkilled, deals 3x Eviscerate to adj enemy. Taunts survivor.
 * Variables: minDmg, maxDmg, nrOfRounds
 * Constants: damageProfile: Eviscerate, nrOfHits: 3
 */
export const EcstaticSlaughterHandler: AbilityHandler = {
  abilityId: 'EcstaticSlaughter',
  abilityName: 'Ecstatic Slaughter',
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const triggered = isToggleActive(context.abilityToggles?.['EcstaticSlaughter']);

    const followUpAttack: FollowUpAttack | undefined = triggered ? {
      abilityId: 'EcstaticSlaughter',
      abilityName: 'Ecstatic Slaughter',
      damageProfile: 'Eviscerate' as DamageType,
      minDamage: minDmg,
      maxDamage: maxDmg,
      hits: 3,
      attackCategory: 'special',
    } : undefined;

    return {
      abilityId: 'EcstaticSlaughter',
      abilityName: getAbilityNameSync('EcstaticSlaughter'),
      modifiers: {},
      applicable: triggered,
      reason: triggered
        ? `3x ${minDmg}-${maxDmg} Eviscerate follow-up`
        : 'Trigger: Thrilled or adj overkill',
      requiresToggle: true,
      toggleLabel: 'Thrilled / Adj Overkill',
      followUpAttack,
    };
  },
};

/**
 * ArmourOfShriekingSouls (Lucius)
 * Killer becomes Elated (loses HP/turn). When killer dies, Lucius revives.
 * Variables: minHp, maxHp, hp
 */
export const ArmourOfShriekingSoulsHandler: AbilityHandler = {
  abilityId: 'ArmourOfShriekingSouls',
  abilityName: 'Armour of Shrieking Souls',
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const minHp = values.minHp as number || 0;
    const maxHp = values.maxHp as number || 0;
    const hp = values.hp as number || 0;
    return {
      abilityId: 'ArmourOfShriekingSouls',
      abilityName: getAbilityNameSync('ArmourOfShriekingSouls'),
      modifiers: {},
      applicable: false, // Defensive/on-death - not a damage modifier
      reason: `On death: killer Elated (loses ${minHp}-${maxHp} HP/turn). When killer dies, revive with ${hp} HP`,
      requiresToggle: false,
    };
  },
};

/**
 * TerrifyingCrescendo (Shiron)
 * Ranged attacks deal +extraDmg per overkill/suppress (max 6 stacks).
 * Variables: extraDmg, buffMaxLevel
 */
export const TerrifyingCrescendoHandler: AbilityHandler = {
  abilityId: 'TerrifyingCrescendo',
  abilityName: 'Terrifying Crescendo',
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    const extraDmg = values.extraDmg as number || 0;
    const stacks = isToggleActive(context.abilityToggles?.['TerrifyingCrescendo']);

    return {
      abilityId: 'TerrifyingCrescendo',
      abilityName: getAbilityNameSync('TerrifyingCrescendo'),
      modifiers: stacks ? {
        baseDamageBonus: extraDmg, // Per stack - user should track stacks
      } : {},
      applicable: stacks,
      reason: stacks
        ? `+${extraDmg} dmg per overkill/suppress (max 6). Toggle = has stacks`
        : `No stacks yet. Gain stacks by overkill/suppress`,
      requiresToggle: true,
      toggleLabel: 'Has Crescendo stacks',
    };
  },
};

// ==================== Genestealers ====================

/**
 * TwistedScience (Hollan)
 * Units healed by Hollan gain HP and Genestealer Cults units also get +extraDmg
 * Variables: hp, extraDmg
 */
export const TwistedScienceHandler: AbilityHandler = {
  abilityId: 'TwistedScience',
  abilityName: 'Twisted Science',
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    const hp = values.hp as number || 0;
    const extraDmg = values.extraDmg as number || 0;
    // Toggle indicates the unit has been affected by Twisted Science buff
    const isAffected = isToggleActive(context.abilityToggles?.['TwistedScience']);

    return {
      abilityId: 'TwistedScience',
      abilityName: getAbilityNameSync('TwistedScience'),
      modifiers: isAffected ? {
        baseDamageBonus: extraDmg, // Only for Genestealer Cults units
      } : {},
      applicable: isAffected,
      reason: isAffected
        ? `Affected by Twisted Science: +${hp} max HP, +${extraDmg} dmg (GSC only)`
        : `Heal to apply: +${hp} max HP, +${extraDmg} dmg (GSC only)`,
      requiresToggle: true,
      toggleLabel: 'Affected by Twisted Science',
    };
  },
};

/**
 * DecoysAndMisdirection (Isaak)
 * Enemies stepping on decoys take Blast damage. Friendlies stepping on decoys deal bonus damage.
 * Variables: minDmg, maxDmg, extraDmg
 * Constants: damageProfile = "Blast", range = "2", unitToSpawn = "genesSmnDecoy", nrOfHits = "1"
 */
export const DecoysAndMisdirectionHandler: AbilityHandler = {
  abilityId: 'DecoysAndMisdirection',
  abilityName: 'Decoys and Misdirection',
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const extraDmg = values.extraDmg as number || 0;
    // Toggle indicates friendly unit moved onto a decoy
    const onDecoy = isToggleActive(context.abilityToggles?.['DecoysAndMisdirection']);

    return {
      abilityId: 'DecoysAndMisdirection',
      abilityName: getAbilityNameSync('DecoysAndMisdirection'),
      modifiers: onDecoy ? {
        baseDamageBonus: extraDmg,
      } : {},
      applicable: onDecoy,
      reason: onDecoy
        ? `Moved onto decoy: +${extraDmg} dmg this turn (GSC units also place new decoy)`
        : `Enemies on decoys take 1x ${minDmg}-${maxDmg} Blast. Friendlies get +${extraDmg} dmg`,
      requiresToggle: true,
      toggleLabel: 'Moved onto decoy',
    };
  },
};

/**
 * HypersensoryAbilities (Judh)
 * First attack each enemy turn: can't fall below hpPct% of current HP, moves to free hex,
 * places decoy, counter-attacks if within range
 * Variables: hpPct, minDmg, maxDmg
 * Constants: damageProfile = "Projectile", range = "2", nrOfHits = "3", unitToSpawn = "genesSmnDecoy"
 */
export const HypersensoryAbilitiesHandler: AbilityHandler = {
  abilityId: 'HypersensoryAbilities',
  abilityName: 'Hypersensory Abilities',
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const hpPct = values.hpPct as number || 30;
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;

    // This is a defensive/reaction ability - doesn't modify own attacks
    return {
      abilityId: 'HypersensoryAbilities',
      abilityName: getAbilityNameSync('HypersensoryAbilities'),
      modifiers: {},
      applicable: false,
      reason: `First attack/enemy turn: can't drop below ${hpPct}% HP, move + place decoy, counter 3x ${minDmg}-${maxDmg} Projectile (range 2)`,
      requiresToggle: false,
    };
  },
};

/**
 * CosmicHorror (The Patermine)
 * On defeating enemy: places decoy on that hex, enemies around may be suppressed.
 * When moving onto decoy: heals for hp.
 * Variables: chance, hp, extraDmg
 * Constants: unitToSpawn = "genesSmnDecoy"
 */
export const CosmicHorrorHandler: AbilityHandler = {
  abilityId: 'CosmicHorror',
  abilityName: 'Cosmic Horror',
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    const chance = values.chance as number || 40;
    const hp = values.hp as number || 0;
    const extraDmg = values.extraDmg as number || 0;
    // Toggle indicates Patermine defeated an enemy this battle (has stacks for bonus)
    const hasStacks = isToggleActive(context.abilityToggles?.['CosmicHorror']);

    return {
      abilityId: 'CosmicHorror',
      abilityName: getAbilityNameSync('CosmicHorror'),
      modifiers: hasStacks ? {
        baseDamageBonus: extraDmg,
      } : {},
      applicable: hasStacks,
      reason: hasStacks
        ? `+${extraDmg} dmg. On kill: place decoy, ${chance}% suppress/fatigue nearby. Move to decoy: heal ${hp}`
        : `On kill: place decoy, ${chance}% suppress/fatigue nearby. Move to decoy: heal ${hp}`,
      requiresToggle: true,
      toggleLabel: 'Has Cosmic Horror stacks',
    };
  },
};

/**
 * SpiritualLeader (Xybia)
 * After moving, places decoy on empty adjacent hex. If 2+ decoys adjacent, summons Neophyte Hybrid.
 * Variables: summonHp, summonDmg, summonArmor
 * Constants: unitId_2 = "genesSmnDecoy", unitId = "genesSmnNeophyte"
 */
export const SpiritualLeaderHandler: AbilityHandler = {
  abilityId: 'SpiritualLeader',
  abilityName: 'Spiritual Leader',
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const summonHp = values.summonHp as number || 0;
    const summonDmg = values.summonDmg as number || 0;
    const summonArmor = values.summonArmor as number || 0;

    // This is a post-movement passive - doesn't modify attacks directly
    return {
      abilityId: 'SpiritualLeader',
      abilityName: getAbilityNameSync('SpiritualLeader'),
      modifiers: {},
      applicable: false,
      reason: `After moving: place decoy. If 2+ decoys adj: summon Neophyte (HP:${summonHp}, Dmg:${summonDmg}, Armor:${summonArmor})`,
      requiresToggle: false,
    };
  },
};

// ==================== LeaguesOfVotann ====================

/**
 * GrimEfficiency (Uthar)
 * Grants armor and pierce ratio bonuses to units within range
 * Variables: extraArmor, extraPierceRatio
 * Constants: range: 2
 */
export const GrimEfficiencyHandler: AbilityHandler = {
  abilityId: 'GrimEfficiency',
  abilityName: 'Grim Efficiency',
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const extraArmor = values.extraArmor as number || 0;
    const extraPierceRatio = values.extraPierceRatio as number || 10;

    // This is an aura passive - provides bonuses to nearby units
    return {
      abilityId: 'GrimEfficiency',
      abilityName: getAbilityNameSync('GrimEfficiency'),
      modifiers: {
        pierceRatioBonus: extraPierceRatio,
      },
      applicable: true,
      reason: `Aura (range 2): +${extraArmor} armor, +${extraPierceRatio}% pierce ratio`,
      requiresToggle: false,
    };
  },
};

/**
 * EcogSupport (Vynn)
 * When Vynn repairs a friendly unit, summons an E-COG (max 3).
 * Summoning is handled in battleStore.ts executeRepairWithGalvanicField().
 * Variables: summonHp, summonDmg, summonArmor
 * Constants: maxSummons: 3, unitId: votanSmnEcog
 */
export const EcogSupportHandler: AbilityHandler = {
  abilityId: 'EcogSupport',
  abilityName: 'E-COG Support',
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const summonHp = values.summonHp as number || 0;
    const summonDmg = values.summonDmg as number || 0;
    const summonArmor = values.summonArmor as number || 0;

    return {
      abilityId: 'EcogSupport',
      abilityName: getAbilityNameSync('EcogSupport'),
      modifiers: {},
      applicable: false,
      reason: `On repair: summon E-COG (max 3). HP:${summonHp}, Dmg:${summonDmg}, Armor:${summonArmor}`,
      requiresToggle: false,
    };
  },
};

/**
 * PredictiveGuidance (Ammuk)
 * Aura: enemies within 2 hexes are affected.
 * If enemy didn't move: LoV/Mechanical allies deal +extraDmg melee damage.
 * If enemy moved: LoV/Mechanical allies deal +extraDmg_2 ranged damage.
 * LoV allies also score +1 hit against affected enemies.
 * Variables: extraDmg, extraDmg_2
 * Constants: range: 2, extraHits: 1
 */
export const PredictiveGuidanceHandler: AbilityHandler = {
  abilityId: 'PredictiveGuidance',
  abilityName: 'Predictive Guidance',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const extraDmg = values.extraDmg as number || 0;
    const extraDmg_2 = values.extraDmg_2 as number || 0;

    return {
      abilityId: 'PredictiveGuidance',
      abilityName: getAbilityNameSync('PredictiveGuidance'),
      modifiers: {},
      applicable: false,
      reason: `Aura: LoV/Mechanical allies +${extraDmg} melee / +${extraDmg_2} ranged dmg. LoV: +1 hit`,
      requiresToggle: false,
    };
  },
};

// ==================== AdeptusMechanicus ====================

/**
 * HeavyGravCannon (Sy-gex)
 * Ranged attacks vs Gravis, Terminator, or Mechanical deal extra damage and pierce ratio
 * Variables: extraDmg, extraPierceRatio
 */
export const HeavyGravCannonHandler: AbilityHandler = {
  abilityId: 'HeavyGravCannon',
  abilityName: 'Heavy Grav-Cannon',
  category: 'passive',
  cooldown: -1,
  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    const extraDmg = values.extraDmg as number || 0;
    const extraPierceRatio = values.extraPierceRatio as number || 40;
    const validTarget = hasMechanicalTrait(context.bossTraits);

    return {
      abilityId: 'HeavyGravCannon',
      abilityName: getAbilityNameSync('HeavyGravCannon'),
      modifiers: validTarget ? {
        baseDamageBonus: extraDmg,
        pierceRatioBonus: extraPierceRatio,
      } : {},
      applicable: validTarget,
      reason: validTarget
        ? `+${extraDmg} dmg, +${extraPierceRatio}% pierce vs Mechanical`
        : 'Boss is not Mechanical',
      requiresToggle: false,
    };
  },
};

/**
 * AggressiveOnslaught (Mataneo)
 * When charging and Mataneo performs a normal attack or uses HammerOfWrath,
 * summon 2x Jump Pack Intercessors if not already present.
 * Variables: summonDmg, summonHp, summonArmor
 * Constants: nrOfSummons: 2, unitId: bloodSmnIntercessor
 */
export const AggressiveOnslaughtHandler: AbilityHandler = {
  abilityId: 'AggressiveOnslaught',
  abilityName: 'Aggressive Onslaught',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    // Only triggers when charging (toggle)
    const isCharging = isToggleActive(context.abilityToggles['AggressiveOnslaught']);

    // Triggers on normal attacks (HammerOfWrath summons are handled separately in battleStore)
    const isNormalAttack = context.attackCategory === 'normal';
    const applicable = isCharging && isNormalAttack;

    // Get summon stats
    const summonDmg = values.summonDmg as number || 0;
    const summonHp = values.summonHp as number || 0;
    const summonArmor = values.summonArmor as number || 0;
    const nrOfSummons = values.nrOfSummons as number || 2;

    // Build summon request (creates summons if not already present)
    const summonRequest: SummonRequest | undefined = applicable ? {
      unitId: 'bloodSmnIntercessor',
      count: nrOfSummons,
      hp: summonHp,
      damage: summonDmg,
      armor: summonArmor,
      ifNotPresent: true,  // Only create if summons don't exist
    } : undefined;

    return {
      abilityId: 'AggressiveOnslaught',
      abilityName: getAbilityNameSync('AggressiveOnslaught'),
      modifiers: {},  // No modifiers to Mataneo's own attack
      applicable,
      reason: isCharging
        ? `Charging: Summon 2x Jump Pack Intercessors (HP:${summonHp}, Dmg:${summonDmg}, Armor:${summonArmor})`
        : 'Requires Charging',
      requiresToggle: true,
      toggleLabel: 'Charging',
      summonRequest,
    };
  },
};

/**
 * MedicusMinistorum (Isabella)
 * Adjacent allies regenerate HP after taking damage - not relevant for damage calculator
 * Variables: hpToHeal
 */
export const MedicusMinistorumHandler: AbilityHandler = {
  abilityId: 'MedicusMinistorum',
  abilityName: 'Medicus Ministorum',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (_values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    return {
      abilityId: 'MedicusMinistorum',
      abilityName: getAbilityNameSync('MedicusMinistorum'),
      modifiers: {},
      applicable: false,
      reason: 'Healing passive - not relevant for damage',
      requiresToggle: false,
    };
  },
};

// Export all passive handlers
// Note: LegendaryCommander is now handled via the buff pool system (buffRegistry.ts)
export const passiveHandlers: AbilityHandler[] = [
  SagaOfTheWarriorBornHandler,
  FuryOfTheAncientsHandler,
  ShockAssaultHandler,
  RitesOfBattleHandler,
  CamoCloakHandler,
  LegacyOfCombatHandler,
  TheBetrayerHandler,
  RefusalToBeOutdoneHandler,
  CyclicIonBlasterHandler,
  WayOfTheShortBladeHandler,
  ChampionOfTheFeastHandler,
  GalvanicFieldHandler,
  LightImUpHandler,
  StandVigilHandler,
  SereneUnifierHandler,
  OptimizedGaitHandler,
  FuelledByFuryHandler,
  VisionsOfHeresyHandler,
  LordOfTempestsHandler,
  HuntersBeyondDeathHandler,
  SavageKillerHandler,
  LionHelmHandler,
  FearedInterrogatorHandler,
  DeathwingHandler,
  EnmityForTheUnworthyHandler,
  GrimRetributionHandler,
  BoltstormHandler,
  MartialSuperiorityHandler,
  AstartesBannerHandler,
  UnwaveringSentinelHandler,
  FireOfAbsolutionHandler,
  RighteousRepugnanceHandler,
  CondemnorStakeHandler,
  GeminaeSuperiasHandler,
  SwornProtectorHandler,
  ToughToKillHandler,
  AvalancheOfMuscleHandler,
  NightshroudHandler,
  SummaryExecutionHandler,
  DefenderOfTheGreaterGoodHandler,
  PathOfCommandHandler,
  WireweaveNetHandler,
  TerrorsLamentHandler,
  InescapableAccuracyHandler,
  FabricatorClawArrayHandler,
  MartialApotheosisHandler,
  InescapableDeathHandler,
  RelentlessMarchHandler,
  LivingLightningHandler,
  FeederTendrilsHandler,
  NeuroparasiteHandler,
  BarbedOvipositorHandler,
  GuardianOrganismHandler,
  SynapticLinchpinHandler,
  KustomForceFieldHandler,
  PowerTripHandler,
  SquigHoundHandler,
  SmashaEadHandler,
  HatefulAssaultHandler,
  PossessionHandler,
  HeadClaimerHandler,
  FleshmetalGunsHandler,
  BeaconOfRageHandler,
  SkullsmasherHandler,
  TrophyTakerHandler,
  WrathfulDevotionHandler,
  // DeathGuard
  CursedPlagueBellHandler,
  HazeOfCorruptionHandler,
  TaintedNartheciumHandler,
  ExplosiveMaladiesHandler,
  DestroyerHiveHandler,
  // ThousandSons
  InfernalPactsHandler,
  PsychicStalkHandler,
  ArcaneShieldHandler,
  TimeFluxHandler,
  RealityUnboundHandler,
  // EmperorsChildren
  ObsessiveAnnunciationHandler,
  EcstaticSlaughterHandler,
  ArmourOfShriekingSoulsHandler,
  TerrifyingCrescendoHandler,
  // Genestealers
  TwistedScienceHandler,
  DecoysAndMisdirectionHandler,
  HypersensoryAbilitiesHandler,
  CosmicHorrorHandler,
  SpiritualLeaderHandler,
  // LeaguesOfVotann
  GrimEfficiencyHandler,
  EcogSupportHandler,
  PredictiveGuidanceHandler,
  // AdeptusMechanicus
  HeavyGravCannonHandler,
  // Blood Angels
  AggressiveOnslaughtHandler,
  // Sisterhood
  MedicusMinistorumHandler,
  // LegendaryCommanderHandler, // Removed: now using buff pool for team-wide LC application
];
