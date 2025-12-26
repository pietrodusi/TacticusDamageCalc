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
  // LegendaryCommanderHandler, // Removed: now using buff pool for team-wide LC application
];
