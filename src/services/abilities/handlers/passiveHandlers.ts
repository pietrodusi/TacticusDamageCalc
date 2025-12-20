/**
 * Passive Ability Handlers
 * Handlers for passive abilities that modify character stats
 */

import type { AbilityHandler, ComputedAbilityValues, AbilityContext, PassiveAbilityEvaluation, FollowUpAttack } from '../types';
import { getAbilityNameSync } from '../abilityDataLoader';

/**
 * SagaOfTheWarriorBorn (Ragnar)
 * Grants extra hits and crit damage when the character has killed an enemy
 * Variables: extraHits (1-3), extraCritDmg
 */
export const SagaOfTheWarriorBornHandler: AbilityHandler = {
  abilityId: 'SagaOfTheWarriorBorn',
  abilityName: 'Saga of the Warrior Born',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    const hasKilled = context.abilityToggles['SagaOfTheWarriorBorn'] ?? false;

    return {
      abilityId: 'SagaOfTheWarriorBorn',
      abilityName: getAbilityNameSync('SagaOfTheWarriorBorn'),
      modifiers: hasKilled ? {
        extraHits: values.extraHits as number || 0,
        critDamageBonus: values.extraCritDmg as number || 0,
      } : {},
      applicable: hasKilled,
      reason: hasKilled ? 'Killed enemy this battle' : 'No kills yet',
      requiresToggle: true,
      toggleLabel: 'Killed enemy',
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
 * For Big Target bosses, use Piercing damage (minDmg_2/maxDmg_2, 1 hit).
 * The +33% damage per attack turn bonus ONLY applies when Martial Inspiration is used.
 * Variables: minDmg_2, maxDmg_2 (Piercing), nrOfHits_2
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
    const attackTurnsBonus = isAbilityAttack ? context.attackTurnsCount * 0.33 : 0;
    const damageMultiplier = 1 + attackTurnsBonus;

    // Use Piercing damage for Big Target (minDmg_2/maxDmg_2)
    const minDamage = values.minDmg_2 as number || 0;
    const maxDamage = values.maxDmg_2 as number || 0;
    const avgDamage = Math.round((minDamage + maxDamage) / 2);
    const hits = values.nrOfHits_2 as number || 1;

    // Build follow-up attack
    const followUpAttack: FollowUpAttack | undefined = applicable ? {
      abilityId: 'LegacyOfCombat',
      abilityName: 'Legacy of Combat',
      damageProfile: 'Piercing',
      minDamage,
      maxDamage,
      hits,
      damageMultiplier,
      attackCategory: 'special',  // Follow-up is a special attack
      triggersOnNormalOnly: false,  // Triggers on any attack (normal or ability)
    } : undefined;

    const bonusText = isAbilityAttack && context.attackTurnsCount > 0
      ? ` (+${Math.round(attackTurnsBonus * 100)}% from ${context.attackTurnsCount} attack turns)`
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
 * Grants bonus damage and extra hits if an active ability was used this turn
 * Variables: extraDmg (up to 800), nrOfHits (1-2)
 */
export const LegendaryCommanderHandler: AbilityHandler = {
  abilityId: 'LegendaryCommander',
  abilityName: 'Legendary Commander',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    // Only applies if an active ability was used this turn
    const applicable = context.hasUsedAbilityThisTurn;

    const extraDmg = values.extraDmg as number || 0;
    const extraHits = values.nrOfHits as number || 0;

    return {
      abilityId: 'LegendaryCommander',
      abilityName: getAbilityNameSync('LegendaryCommander'),
      modifiers: applicable ? {
        baseDamageBonus: extraDmg,
        extraHits: extraHits,
      } : {},
      applicable,
      reason: applicable
        ? `+${extraDmg} damage, +${extraHits} hits (ability used)`
        : 'No ability used this turn',
      requiresToggle: false,
    };
  },
};

// Export all passive handlers
export const passiveHandlers: AbilityHandler[] = [
  SagaOfTheWarriorBornHandler,
  FuryOfTheAncientsHandler,
  ShockAssaultHandler,
  RitesOfBattleHandler,
  CamoCloakHandler,
  LegacyOfCombatHandler,
  TheBetrayerHandler,
  LegendaryCommanderHandler,
];
