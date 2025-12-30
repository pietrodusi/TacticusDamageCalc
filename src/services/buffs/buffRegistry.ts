// Buff Registry - Templates for all buff types

import type { BuffTemplate } from '../../types/buff';
import type { BattleCharacter } from '../../types';

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
  requiredToggles: ['adjacentToBoss'],
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
  requiredToggles: ['adjacentToBoss'],
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

/**
 * ExemplarOfTheMontka buff template (Farsight)
 * Grants +extraDmg_2 to all normal attacks by characters that have ranged attacks
 * (Using extraDmg_2 since bosses are always BigTarget)
 * Duration: 1 turn (until end of turn)
 */
export const exemplarOfTheMontkaBuffTemplate: BuffTemplate = {
  buffId: 'exemplar_of_the_montka',
  name: "Exemplar of the Mont'ka",
  sourceAbilityId: 'ExemplarOfTheMontka',
  defaultTargetCondition: {
    type: 'custom',
    customEvaluator: (context, _buff) => {
      // Only applies to normal attacks (not abilities)
      if (context.attackCategory !== 'normal') return false;

      // Only applies to characters that have ranged attacks
      const hasRangedAttack = context.attacker.rangedHits !== undefined && context.attacker.rangedHits > 0;
      return hasRangedAttack;
    },
  },
  getEffects: (values) => {
    // Use extraDmg_2 (BigTarget bonus) since bosses are always BigTarget
    return {
      baseDamageBonus: (values.extraDmg_2 as number) || 0,
    };
  },
  duration: 1,
};

/**
 * WayOfTheShortBlade aura buff template (Farsight passive)
 * Grants armor ignore + damage % bonus to teammates' normal ranged attacks
 * Condition: Character is within range 2 of enemy that is adjacent to friendly
 * Only applies to non-Psychic attacks
 */
export const wayOfTheShortBladeAuraBuffTemplate: BuffTemplate = {
  buffId: 'way_of_the_short_blade_aura',
  name: 'Way of the Short Blade',
  sourceAbilityId: 'WayOfTheShortBlade',
  defaultTargetCondition: {
    type: 'custom',
    customEvaluator: (context, buff) => {
      // Does NOT apply to Farsight himself
      if (context.attacker.id === buff.sourceCharacterId) return false;

      // Only applies to normal ranged attacks
      if (context.attackType !== 'ranged') return false;
      if (context.attackCategory !== 'normal') return false;

      // Check if character has ranged attacks
      const hasRangedAttack = context.attacker.rangedHits !== undefined && context.attacker.rangedHits > 0;
      if (!hasRangedAttack) return false;

      // Don't apply to Psychic attacks
      if (context.attacker.rangedDamageType === 'Psychic') return false;

      // Check condition: within range 2 of adjacent enemy
      // This is controlled by a toggle on the character
      const toggleId = `WayOfTheShortBlade_${buff.sourceCharacterId}_range2`;
      const isInRange = context.attacker.abilityToggles?.[toggleId] ?? false;
      if (!isInRange) return false;

      // Check condition: enemy is adjacent to a friendly character
      // Reuse the "adjacentToBoss" toggle for this (since we're checking if any friendly is adjacent to boss)
      const anyFriendlyAdjacent = context.battleState.team.some(
        c => c.abilityToggles?.['adjacentToBoss']
      );
      return anyFriendlyAdjacent;
    },
  },
  getEffects: (values) => ({
    armorIgnored: (values.armorIgnored as number) || 0,
    baseDamageMultiplier: 1 + ((values.extraDmgPct as number) || 0) / 100,
  }),
  // No duration - permanent aura-style buff (evaluated each attack)
  requiredToggles: ['adjacentToBoss'],
};

/**
 * Doom (non-Aeldari) buff template (Eldryon passive)
 * Friendly units (non-Aeldari) deal +extraDmg with normal attacks
 * Condition: Boss is at range 2 from Eldryon (toggle: bossRange2FromEldryon)
 */
export const doomNonAeldariBuffTemplate: BuffTemplate = {
  buffId: 'doom_non_aeldari',
  name: 'Doom',
  sourceAbilityId: 'Doom',
  defaultTargetCondition: {
    type: 'custom',
    customEvaluator: (context, buff) => {
      // Does NOT apply to Eldryon himself
      if (context.attacker.id === buff.sourceCharacterId) return false;

      // Does NOT apply to Aeldari characters (they get the stronger buff)
      if (context.attacker.faction === 'Aeldari') return false;

      // Only applies to normal attacks
      if (context.attackCategory !== 'normal') return false;

      // Check if boss is at range 2 from Eldryon (toggle)
      const toggleId = `bossRange2FromEldryon`;
      const isInRange = context.battleState.team.some(
        c => c.passiveAbilities.includes('Doom') && c.abilityToggles?.[toggleId]
      );
      return isInRange;
    },
  },
  getEffects: (values) => ({
    baseDamageBonus: (values.extraDmg as number) || 0,
  }),
  // No duration - permanent aura-style buff (evaluated each attack)
  requiredToggles: ['bossRange2FromEldryon'],
};

/**
 * Doom (Aeldari) buff template (Eldryon passive)
 * Friendly Aeldari units deal +extraDmg_2 with ALL attacks (normal and special)
 * Condition: Boss is at range 2 from Eldryon (toggle: bossRange2FromEldryon)
 */
export const doomAeldariBuffTemplate: BuffTemplate = {
  buffId: 'doom_aeldari',
  name: 'Doom',
  sourceAbilityId: 'Doom',
  defaultTargetCondition: {
    type: 'custom',
    customEvaluator: (context, buff) => {
      // Does NOT apply to Eldryon himself
      if (context.attacker.id === buff.sourceCharacterId) return false;

      // Only applies to Aeldari characters
      if (context.attacker.faction !== 'Aeldari') return false;

      // Applies to ALL attacks (normal and special)

      // Check if boss is at range 2 from Eldryon (toggle)
      const toggleId = `bossRange2FromEldryon`;
      const isInRange = context.battleState.team.some(
        c => c.passiveAbilities.includes('Doom') && c.abilityToggles?.[toggleId]
      );
      return isInRange;
    },
  },
  getEffects: (values) => ({
    baseDamageBonus: (values.extraDmg_2 as number) || 0,
  }),
  // No duration - permanent aura-style buff (evaluated each attack)
  requiredToggles: ['bossRange2FromEldryon'],
};

/**
 * Structural Analyser aura buff template (Darkstrider passive)
 * Friendly T'au Empire units adjacent to Darkstrider deal +extraDmg with ranged attacks
 * Condition: Boss has Markerlight AND character is adjacent to Darkstrider (toggle)
 */
export const structuralAnalyserBuffTemplate: BuffTemplate = {
  buffId: 'structural_analyser_aura',
  name: 'Structural Analyser',
  sourceAbilityId: 'StructuralAnalyser',
  defaultTargetCondition: {
    type: 'custom',
    customEvaluator: (context, buff) => {
      // Does NOT apply to Darkstrider himself
      if (context.attacker.id === buff.sourceCharacterId) return false;

      // Only applies to ranged attacks
      if (context.attackType !== 'ranged') return false;

      // Only if boss has Markerlight
      if (!context.battleState.bossHasMarkerlight) return false;

      // Check if attacker is T'au Empire
      const isTauEmpire = context.attacker.faction === "T'au Empire" || context.attacker.faction === 'Tau';
      if (!isTauEmpire) return false;

      // Check if "Adjacent to Darkstrider" toggle is active
      const toggleId = `StructuralAnalyser_${buff.sourceCharacterId}_adjacent`;
      return context.attacker.abilityToggles?.[toggleId] ?? false;
    },
  },
  getEffects: (values) => ({
    baseDamageBonus: (values.extraDmg as number) || 0,
  }),
  // No duration - permanent aura-style buff (evaluated each attack)
  // No requiredToggles since the toggle is dynamic (based on Darkstrider's ID)
};

// Registry of all buff templates by ability ID
export const buffTemplateRegistry: Record<string, BuffTemplate> = {
  WarHowl: warHowlBuffTemplate,
  TheQuickening: theQuickeningBuffTemplate,
  // LC buffs are registered by buff ID since they're not triggered by ability activation
  legendary_commander_damage: legendaryCommanderDamageBuffTemplate,
  legendary_commander_hits: legendaryCommanderHitsBuffTemplate,
  EuphoricStrikes: euphoricStrikesBuffTemplate,
  ExemplarOfTheMontka: exemplarOfTheMontkaBuffTemplate,
  // WayOfTheShortBlade aura is a permanent buff, registered by buff ID
  way_of_the_short_blade_aura: wayOfTheShortBladeAuraBuffTemplate,
  // Doom aura buffs (Eldryon passive)
  doom_non_aeldari: doomNonAeldariBuffTemplate,
  doom_aeldari: doomAeldariBuffTemplate,
  // Structural Analyser aura (Darkstrider passive)
  structural_analyser_aura: structuralAnalyserBuffTemplate,
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

/**
 * Get all required toggles for buffs present in the team
 * Scans all buff templates and collects toggles required by abilities in the team
 */
export function getTeamRequiredToggles(team: BattleCharacter[]): Set<string> {
  const toggles = new Set<string>();

  // Check all registered buff templates
  for (const template of Object.values(buffTemplateRegistry)) {
    if (!template.requiredToggles?.length) continue;

    // Check if this buff's source ability is in the team
    const hasAbility = team.some(c =>
      c.passiveAbilities.includes(template.sourceAbilityId) ||
      c.activeAbilities.includes(template.sourceAbilityId)
    );

    if (hasAbility) {
      template.requiredToggles.forEach(t => toggles.add(t));
    }
  }

  return toggles;
}
