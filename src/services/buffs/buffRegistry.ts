// Buff Registry - Templates for all buff types

import type { BuffTemplate } from '../../types/buff';
import type { BattleCharacter } from '../../types';

/**
 * Helper to check if a toggle is active (for boolean toggles in abilityToggles that can also contain numbers for counters)
 */
const isToggleActive = (value: boolean | number | undefined): boolean => value === true;

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
      const isInRange = isToggleActive(context.attacker.abilityToggles?.[toggleId]);
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
 * Friendly units deal +extraDmg with ranged attacks against targets with Markerlight
 * - T'au Empire units: Range 2 from Darkstrider (toggle: _range2)
 * - Non-Tau units: Adjacent to Darkstrider (toggle: _adjacent)
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

      // Check the appropriate toggle based on faction
      const isTauEmpire = context.attacker.faction === "T'au Empire" || context.attacker.faction === 'Tau';

      if (isTauEmpire) {
        // T'au Empire: check Range 2 toggle
        const toggleId = `StructuralAnalyser_${buff.sourceCharacterId}_range2`;
        return isToggleActive(context.attacker.abilityToggles?.[toggleId]);
      } else {
        // Non-Tau: check Adjacent toggle
        const toggleId = `StructuralAnalyser_${buff.sourceCharacterId}_adjacent`;
        return isToggleActive(context.attacker.abilityToggles?.[toggleId]);
      }
    },
  },
  getEffects: (values) => ({
    baseDamageBonus: (values.extraDmg as number) || 0,
  }),
  // No duration - permanent aura-style buff (evaluated each attack)
  // No requiredToggles since the toggle is dynamic (based on Darkstrider's ID)
};

/**
 * CrusadeOfWrath buff template (Helbrecht active)
 * All friendly units within range 2 of Helbrecht gain bonus damage and pierce ratio for melee attacks
 * Duration: 2 rounds (this round and next)
 * Variables: extraDmg, extraPierceRatio
 */
export const crusadeOfWrathBuffTemplate: BuffTemplate = {
  buffId: 'crusade_of_wrath',
  name: 'Crusade Of Wrath',
  sourceAbilityId: 'CrusadeOfWrath',
  defaultTargetCondition: {
    type: 'custom',
    customEvaluator: (context, buff) => {
      // Only applies to melee attacks
      if (context.attackType !== 'melee') return false;

      // Check if character is within range 2 of Helbrecht (toggle)
      const toggleId = `CrusadeOfWrath_${buff.sourceCharacterId}_range2`;
      return isToggleActive(context.attacker.abilityToggles?.[toggleId]);
    },
  },
  getEffects: (values) => ({
    baseDamageBonus: (values.extraDmg as number) || 0,
    pierceRatioBonus: (values.extraPierceRatio as number) || 0,
  }),
  duration: 2, // Lasts this round and next
  // No requiredToggles since the toggle is dynamic (based on Helbrecht's ID)
};

/**
 * DestroyTheWitch buff template (Helbrecht passive)
 * Helbrecht and friendly adjacent units deal +extraDmg with melee attacks against Psyker bosses
 * No duration - permanent aura-style buff
 * Variables: extraDmg
 */
export const destroyTheWitchBuffTemplate: BuffTemplate = {
  buffId: 'destroy_the_witch',
  name: 'Destroy The Witch',
  sourceAbilityId: 'DestroyTheWitch',
  defaultTargetCondition: {
    type: 'custom',
    customEvaluator: (context, buff) => {
      // Only applies to melee attacks
      if (context.attackType !== 'melee') return false;

      // Only applies against Psyker bosses
      const bossHasPsykerTrait = context.target?.traits?.includes('Psyker') ?? false;
      if (!bossHasPsykerTrait) return false;

      // Applies to Helbrecht himself
      if (context.attacker.id === buff.sourceCharacterId) return true;

      // Applies to characters adjacent to Helbrecht (toggle)
      const toggleId = `DestroyTheWitch_${buff.sourceCharacterId}_adjacent`;
      return isToggleActive(context.attacker.abilityToggles?.[toggleId]);
    },
  },
  getEffects: (values) => ({
    baseDamageBonus: (values.extraDmg as number) || 0,
  }),
  // No duration - permanent aura-style buff (evaluated each attack)
  // No requiredToggles since the toggle is dynamic (based on Helbrecht's ID)
};

/**
 * Exemplar of Hate buff template (Asmodai active)
 * All friendly units gain +extraDmg damage for melee attacks OR Overwatch attacks
 * Duration: 2 rounds (this round and next)
 * Variables: extraDmg
 */
export const exemplarOfHateBuffTemplate: BuffTemplate = {
  buffId: 'exemplar_of_hate',
  name: 'Exemplar of Hate',
  sourceAbilityId: 'ExemplarOfHate',
  defaultTargetCondition: {
    type: 'custom',
    customEvaluator: (context, _buff) => {
      // Applies to melee attacks
      if (context.attackType === 'melee') return true;

      // Applies to Overwatch attacks (ranged or melee while overwatchActive)
      if (context.attacker.overwatchActive) return true;

      return false;
    },
  },
  getEffects: (values) => ({
    baseDamageBonus: (values.extraDmg as number) || 0,
  }),
  duration: 2, // Lasts this round and next
};

/**
 * Daughter of the Abyss (Atlacoya passive)
 * All friendly units deal +extraDmgPct% damage to Psyker bosses when Atlacoya is within range 2
 * Target: all friendly units
 * Condition: Boss has Psyker trait AND Atlacoya is within range 2 of boss (toggle)
 * No duration - permanent aura-style buff
 * Variables: extraDmgPct
 */
export const daughterOfTheAbyssBuffTemplate: BuffTemplate = {
  buffId: 'daughter_of_the_abyss',
  name: 'Daughter of the Abyss',
  sourceAbilityId: 'DaughterOfTheAbyss',
  defaultTargetCondition: {
    type: 'custom',
    customEvaluator: (context, buff) => {
      // Only applies against Psyker bosses
      const bossHasPsykerTrait = context.target?.traits?.includes('Psyker') ?? false;
      if (!bossHasPsykerTrait) return false;

      // Check if Atlacoya is within range 2 of boss (toggle)
      const atlacoyaRange2Toggle = `DaughterOfTheAbyss_${buff.sourceCharacterId}_range2FromBoss`;
      const atlacoya = context.battleState.team.find(c => c.id === buff.sourceCharacterId);
      return isToggleActive(atlacoya?.abilityToggles?.[atlacoyaRange2Toggle]);
    },
  },
  getEffects: (values) => ({
    baseDamageMultiplier: 1 + ((values.extraDmgPct as number) || 0) / 100,
  }),
  // No duration - permanent aura-style buff (evaluated each attack)
  requiredToggles: ['DaughterOfTheAbyss_range2FromBoss'],  // Generic toggle ID (will be character-specific in UI)
};

/**
 * Waaagh! buff template (Gulgortz active)
 * Grants +extraDmg and +extraHit to the first normal attack
 * Target: All Orks (automatic) + non-Orks with "Adjacent to Gulgortz" toggle + Gulgortz himself
 * Consumed after first normal attack uses it
 * Variables: extraDmg, extraHit
 */
export const waaaghBuffTemplate: BuffTemplate = {
  buffId: 'waaagh',
  name: 'Waaagh!',
  sourceAbilityId: 'Waaagh',
  defaultTargetCondition: {
    type: 'custom',
    customEvaluator: (context, buff) => {
      // Only applies to normal attacks (not abilities)
      if (context.attackCategory !== 'normal') return false;

      // Gulgortz himself gets the buff (source character)
      if (context.attacker.id === buff.sourceCharacterId) return true;

      // All Orks get the buff automatically
      if (context.attacker.faction === 'Orks') return true;

      // Non-Orks need the "Adjacent to Gulgortz" toggle
      const toggleId = `Waaagh_${buff.sourceCharacterId}_adjacent`;
      return isToggleActive(context.attacker.abilityToggles?.[toggleId]);
    },
  },
  getEffects: (values) => ({
    baseDamageBonus: (values.extraDmg as number) || 0,
    extraHits: (values.extraHit as number) || 1,
  }),
  duration: 1,  // Lasts until used
  consumeOnUse: true,  // Remove after first attack uses it
  requiredToggles: ['Waaagh_adjacent'],  // Generic toggle ID for non-Orks
};

/**
 * StandVigil buff template (Aesoth passive aura)
 * Grants +extraDmgPct% damage to Special Attacks for nearby allies
 * - Default: Adjacent to Aesoth (toggle)
 * - If Custodes used Active Ability this turn: Range 2 from Aesoth (same toggle, different label)
 * Variables: extraDmgPct
 */
export const standVigilBuffTemplate: BuffTemplate = {
  buffId: 'stand_vigil',
  name: 'Stand Vigil',
  sourceAbilityId: 'StandVigil',
  defaultTargetCondition: {
    type: 'custom',
    customEvaluator: (context, buff) => {
      // Only applies to Special Attacks (NOT normal attacks)
      // This includes 'ability' (active abilities) and 'special' (follow-up attacks, multi-component)
      if (context.attackCategory === 'normal') return false;

      // Does NOT apply to Aesoth himself
      if (context.attacker.id === buff.sourceCharacterId) return false;

      // Check toggle (same toggle ID whether adjacent or range 2)
      const toggleId = `StandVigil_${buff.sourceCharacterId}`;
      return isToggleActive(context.attacker.abilityToggles?.[toggleId]);
    },
  },
  getEffects: (values) => ({
    baseDamageMultiplier: 1 + ((values.extraDmgPct as number) || 0) / 100,
  }),
  // No duration - permanent aura-style buff (evaluated each attack)
};

/**
 * SereneUnifier Storm of Fire buff template (Aun'Shi passive aura)
 * Grants +extraDmg to normal attacks during Storm of Fire phase (turns 3, 6)
 * - T'au Empire: Range 2 from Aun'Shi (toggle with "_range2" suffix)
 * - Non-Tau: Adjacent to Aun'Shi (toggle with "_adjacent" suffix)
 * Variables: extraDmg
 */
export const sereneUnifierStormOfFireBuffTemplate: BuffTemplate = {
  buffId: 'serene_unifier_storm_of_fire',
  name: 'Storm of Fire',
  sourceAbilityId: 'SereneUnifier',
  defaultTargetCondition: {
    type: 'custom',
    customEvaluator: (context, buff) => {
      // Only applies to normal attacks (not abilities)
      if (context.attackCategory !== 'normal') return false;

      // Does NOT apply to Aun'Shi himself
      if (context.attacker.id === buff.sourceCharacterId) return false;

      // Check current turn - Storm of Fire is active on turns 3, 6 (phase 3)
      const turn = context.battleState?.turn || 1;
      const phase = ((turn - 1) % 3) + 1;  // 1, 2, 3, 1, 2, 3
      if (phase !== 3) return false;

      // Check if character has the appropriate toggle active based on faction
      const isTau = context.attacker.faction === "T'au Empire" || context.attacker.faction === 'Tau';
      const rangeType = isTau ? 'range2' : 'adjacent';
      const toggleId = `SereneUnifier_${buff.sourceCharacterId}_${rangeType}`;
      return isToggleActive(context.attacker.abilityToggles?.[toggleId]);
    },
  },
  getEffects: (values) => ({
    baseDamageBonus: (values.extraDmg as number) || 0,
  }),
  // No duration - permanent aura-style buff (evaluated each attack based on turn phase)
};

/**
 * MasterAnnihilator buff template (Vitruvius passive)
 * When boss is marked by Vitruvius's normal attack, all friendly attacks get +1 hit
 * - Applies to main attacks and separate follow-up attacks (The Betrayer, Legacy of Combat, etc.)
 * - Does NOT apply to additional hits that share crit chain (CIB, Chordclaw) - handled in battleStore
 * - Does NOT apply to Psychic damage attacks
 * Variables: maxDmg (damage cap for extra hit - applied in battleStore)
 */
export const masterAnnihilatorBuffTemplate: BuffTemplate = {
  buffId: 'master_annihilator',
  name: 'Master Annihilator',
  sourceAbilityId: 'MasterAnnihilator',
  defaultTargetCondition: {
    type: 'custom',
    customEvaluator: (context, _buff) => {
      // Check if boss is marked
      if (!context.battleState.bossHasMasterAnnihilatorMark) return false;

      // Don't apply to Psychic damage attacks
      // Check based on attack type and character's damage type
      const damageType = context.attackType === 'melee'
        ? context.attacker.meleeDamageType
        : context.attacker.rangedDamageType;
      if (damageType === 'Psychic') return false;

      return true;
    },
  },
  getEffects: () => ({
    extraHits: 1,
    // Note: finalDamageCap for the extra hit is applied in battleStore
    // based on battleState.masterAnnihilatorMaxDmg
  }),
  // No duration - permanent debuff on boss (until Vitruvius attacks different enemy or is defeated)
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
  // Helbrecht abilities
  CrusadeOfWrath: crusadeOfWrathBuffTemplate,
  destroy_the_witch: destroyTheWitchBuffTemplate,
  // Asmodai abilities
  ExemplarOfHate: exemplarOfHateBuffTemplate,
  // Atlacoya abilities
  daughter_of_the_abyss: daughterOfTheAbyssBuffTemplate,
  // Gulgortz abilities
  Waaagh: waaaghBuffTemplate,
  // Aesoth abilities
  stand_vigil: standVigilBuffTemplate,
  // Aun'Shi abilities
  serene_unifier_storm_of_fire: sereneUnifierStormOfFireBuffTemplate,
  // Vitruvius abilities
  master_annihilator: masterAnnihilatorBuffTemplate,
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

  // Special case: OptimizedGait (Exitor-Rho) requires adjacentToBoss for reaction trigger
  if (team.some(c => c.passiveAbilities.includes('OptimizedGait'))) {
    toggles.add('adjacentToBoss');
  }

  // Special case: FearedInterrogator (Asmodai) requires adjacentToBoss for Dark Angels teammates
  if (team.some(c => c.passiveAbilities.includes('FearedInterrogator'))) {
    toggles.add('adjacentToBoss');
  }

  return toggles;
}
