// Buff Registry - Templates for all buff types

import type { BuffTemplate } from '../../types/buff';

/**
 * WarHowl buff template (Ragnar)
 * Adds crit chance and flat damage bonus to melee attacks
 * Target: self + all teammates without ranged attacks (melee-only characters)
 * Duration: 1 turn
 */
export const warHowlBuffTemplate: BuffTemplate = {
  buffId: 'war_howl',
  name: 'War Howl',
  sourceAbilityId: 'WarHowl',
  defaultTargetCondition: {
    type: 'custom',
    customEvaluator: (context, buff) => {
      // Only applies to melee attacks
      if (context.attackType !== 'melee') return false;

      // Always applies to the source character (Ragnar)
      if (context.attacker.id === buff.sourceCharacterId) return true;

      // Applies to teammates without ranged attacks (melee-only characters)
      const hasRangedAttack = context.attacker.rangedHits !== undefined && context.attacker.rangedHits > 0;
      return !hasRangedAttack;
    },
  },
  getEffects: (values) => ({
    critChanceBonus: (values.extraCritChance as number) || 0,
    baseDamageBonus: (values.extraDmg as number) || 0,
  }),
  duration: 1,
};

/**
 * TheQuickening buff template (Mephiston)
 * Adds damage multiplier and flat damage bonus
 * Target: self only
 */
export const theQuickeningBuffTemplate: BuffTemplate = {
  buffId: 'the_quickening',
  name: 'The Quickening',
  sourceAbilityId: 'TheQuickening',
  defaultTargetCondition: { type: 'self' },
  getEffects: (values) => ({
    baseDamageMultiplier: ((values.dmgPct as number) || 100) / 100,
    baseDamageBonus: (values.maxDmg as number) || 0,
  }),
};

/**
 * Legendary Commander (Damage) buff template (Trajann)
 * Adds flat damage bonus to ALL characters
 * Condition: ANY character has used ability + is adjacent to boss
 * No duration (permanent aura-style buff)
 */
export const legendaryCommanderDamageBuffTemplate: BuffTemplate = {
  buffId: 'legendary_commander_damage',
  name: 'Legendary Commander',
  sourceAbilityId: 'LegendaryCommander',
  defaultTargetCondition: {
    type: 'custom',
    customEvaluator: (context, _buff) => {
      // Check if ANY character in team has used ability + is adjacent to boss
      const anyCharacterQualified = context.battleState.team.some(
        c => c.hasQualifiedForLCDamage && c.abilityToggles['adjacentToBoss']
      );
      return anyCharacterQualified;
    },
  },
  getEffects: (values) => ({
    baseDamageBonus: (values.extraDmg as number) || 0,
  }),
  // No duration - permanent aura-style buff (evaluated each attack)
};

/**
 * Legendary Commander (Hits) buff template (Trajann)
 * Adds +2 hits to first special attack
 * Condition: LC damage active + Trajann adjacent + character's first special attack
 * No duration (permanent aura-style buff)
 */
export const legendaryCommanderHitsBuffTemplate: BuffTemplate = {
  buffId: 'legendary_commander_hits',
  name: 'Legendary Commander',
  sourceAbilityId: 'LegendaryCommander',
  defaultTargetCondition: {
    type: 'custom',
    customEvaluator: (context, _buff) => {
      // Check LC damage conditions (team-wide)
      const anyCharacterQualified = context.battleState.team.some(
        c => c.hasQualifiedForLCDamage && c.abilityToggles['adjacentToBoss']
      );
      if (!anyCharacterQualified) return false;

      // Check Trajann is adjacent to boss
      const trajann = context.battleState.team.find(
        c => c.passiveAbilities.includes('LegendaryCommander')
      );
      if (!trajann?.abilityToggles['adjacentToBoss']) return false;

      // Per-character: Check if THIS character has already used their first special attack
      if (context.attacker.hasUsedFirstSpecialAttackThisTurn) return false;

      // Only apply to special attacks (abilities or follow-ups)
      if (context.attackCategory !== 'special' && context.attackCategory !== 'ability') return false;

      return true;
    },
  },
  getEffects: (values) => ({
    extraHits: (values.nrOfHits as number) || 2,
  }),
  // No duration - permanent aura-style buff (evaluated each attack)
};

/**
 * EuphoricStrikes buff template (Laviscus)
 * Grants +crit chance to the NEXT attack by ANY team member
 * Consumed after being used once
 */
export const euphoricStrikesBuffTemplate: BuffTemplate = {
  buffId: 'euphoric_strikes',
  name: 'Euphoric Strikes',
  sourceAbilityId: 'EuphoricStrikes',
  defaultTargetCondition: {
    type: 'allAllies',
    // Applies to any team member's next attack
  },
  getEffects: (values) => ({
    critChanceBonus: (values.extraCritChance as number) || 0,
  }),
  duration: 1,
  consumeOnUse: true,  // Remove after first attack uses it
};

// Registry of all buff templates by ability ID
export const buffTemplateRegistry: Record<string, BuffTemplate> = {
  WarHowl: warHowlBuffTemplate,
  TheQuickening: theQuickeningBuffTemplate,
  // LC buffs are registered by buff ID since they're not triggered by ability activation
  legendary_commander_damage: legendaryCommanderDamageBuffTemplate,
  legendary_commander_hits: legendaryCommanderHitsBuffTemplate,
  EuphoricStrikes: euphoricStrikesBuffTemplate,
};

/**
 * Get a buff template by ability ID
 */
export function getBuffTemplate(abilityId: string): BuffTemplate | undefined {
  return buffTemplateRegistry[abilityId];
}

/**
 * Check if an ability has a registered buff template
 */
export function hasBuffTemplate(abilityId: string): boolean {
  return abilityId in buffTemplateRegistry;
}
