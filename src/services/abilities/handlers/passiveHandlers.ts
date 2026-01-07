/**
 * Passive Ability Handlers
 * Handlers for passive abilities that modify character stats
 */

import type { AbilityHandler, ComputedAbilityValues, AbilityContext, PassiveAbilityEvaluation, FollowUpAttack } from '../types';
import { getAbilityNameSync } from '../abilityDataLoader';

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
    const isCharging = context.abilityToggles['SagaOfTheWarriorBorn'] ?? false;

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
 * Passive that adds a Psychic melee attack with 2 hits
 * Variables: minDmg, maxDmg
 * Constants: damageProfile: Psychic, nrOfHits: 2
 */
export const FuryOfTheAncientsHandler: AbilityHandler = {
  abilityId: 'FuryOfTheAncients',
  abilityName: 'Fury of the Ancients',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    // This passive triggers on melee attacks
    const applicable = context.attackType === 'melee';

    return {
      abilityId: 'FuryOfTheAncients',
      abilityName: getAbilityNameSync('FuryOfTheAncients'),
      modifiers: applicable ? {
        // This is an additional attack - handled separately in damage calculation
        overrideDamageProfile: 'Psychic',
        overrideMinDamage: values.minDmg as number,
        overrideMaxDamage: values.maxDmg as number,
        overrideHits: values.nrOfHits as number || 2,
      } : {},
      applicable,
      reason: applicable ? 'Melee attack triggers Psychic damage' : 'Only triggers on melee attacks',
      requiresToggle: false,
    };
  },
};

/**
 * ShockAssault (Various)
 * Grants extra damage on first attack
 * Variables: extraDmg
 */
export const ShockAssaultHandler: AbilityHandler = {
  abilityId: 'ShockAssault',
  abilityName: 'Shock Assault',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    // First attack of the battle
    const isFirstAttack = !context.hasActedThisBattle;

    return {
      abilityId: 'ShockAssault',
      abilityName: getAbilityNameSync('ShockAssault'),
      modifiers: isFirstAttack ? {
        baseDamageBonus: values.extraDmg as number || 0,
      } : {},
      applicable: isFirstAttack,
      reason: isFirstAttack ? 'First attack of battle' : 'Already attacked this battle',
      requiresToggle: false,
    };
  },
};

/**
 * RitesOfBattle (Various)
 * Grants extra damage to attacks
 * Variables: extraDmg, extraDmg_2 (low and high)
 */
export const RitesOfBattleHandler: AbilityHandler = {
  abilityId: 'RitesOfBattle',
  abilityName: 'Rites of Battle',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    // Always applicable - provides flat damage bonus
    const avgExtraDmg = Math.round(
      ((values.extraDmg as number || 0) + (values.extraDmg_2 as number || values.extraDmg as number || 0)) / 2
    );

    return {
      abilityId: 'RitesOfBattle',
      abilityName: getAbilityNameSync('RitesOfBattle'),
      modifiers: {
        baseDamageBonus: avgExtraDmg,
      },
      applicable: true,
      reason: `+${values.extraDmg}-${values.extraDmg_2} damage`,
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
    const isAdjacentToBoss = context.abilityToggles['adjacentToBoss'] ?? false;

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

    // Check if boss has Mechanical trait or Markerlight debuff
    const hasMechanical = context.bossTraits?.includes('Mechanical') ?? false;
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
    const isAdjacentToBoss = context.abilityToggles['adjacentToBoss'] ?? false;

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
  // LegendaryCommanderHandler, // Removed: now using buff pool for team-wide LC application
];
