/**
 * Buff Conditions Service
 * Defines toggleable conditions that affect buff application
 * Each condition represents a state the user can toggle (e.g., "Charging", "In Range", "Low HP")
 */

import type { BattleCharacter } from '../types';
import { getAbilityValues, getAbilityNameSync } from './abilities';
import { getTeamRequiredToggles } from './buffs/buffRegistry';

/**
 * A toggleable buff condition
 */
export interface BuffCondition {
  id: string;              // Unique ID for the toggle (stored in abilityToggles)
  label: string;           // Display label (e.g., "Charging", "In Range of Dante")
  source: string;          // Source ability/buff name
  sourceCharacter?: string; // Character providing the buff (for auras)
  effect: string;          // Effect description (e.g., "+3 hits, +582 crit dmg")
  isActive: boolean;       // Current toggle state
  category: 'self' | 'aura'; // Whether it's from own ability or teammate
  dependsOn?: string;      // ID of another condition this depends on (must be active to enable this)
}

/**
 * Get all buff conditions applicable to a character
 * This combines own passive conditions and aura conditions from teammates
 */
export function getCharacterBuffConditions(
  character: BattleCharacter,
  team: BattleCharacter[]
): BuffCondition[] {
  const conditions: BuffCondition[] = [];

  // Add "Adjacent to Boss" condition (only if team has buffs that require it)
  conditions.push(...getAdjacentToBossCondition(character, team));

  // Add "Boss at Range 2 from Eldryon" condition (only if team has Eldryon with Doom)
  conditions.push(...getBossRange2FromEldryonCondition(character, team));

  // Add own passive ability conditions
  conditions.push(...getOwnPassiveConditions(character));

  // Add aura conditions from teammates
  conditions.push(...getAuraConditions(character, team));

  return conditions;
}

/**
 * Get conditions from character's own passive abilities
 */
function getOwnPassiveConditions(character: BattleCharacter): BuffCondition[] {
  const conditions: BuffCondition[] = [];

  // Saga of the Warrior Born (Ragnar) - Charging condition
  if (character.passiveAbilities.includes('SagaOfTheWarriorBorn')) {
    const levelIndex = character.abilityLevels?.['SagaOfTheWarriorBorn'] ?? 54;
    const values = getAbilityValues('SagaOfTheWarriorBorn', levelIndex);
    const abilityName = getAbilityNameSync('SagaOfTheWarriorBorn');

    if (values) {
      const extraHits = values.extraHits as number || 0;
      const critDmgBonus = values.critDmgBonus as number || 0;

      const effectParts: string[] = [];
      if (extraHits > 0) effectParts.push(`+${extraHits} hits`);
      if (critDmgBonus > 0) effectParts.push(`+${critDmgBonus} crit dmg`);

      conditions.push({
        id: 'SagaOfTheWarriorBorn',
        label: 'Charging',
        source: abilityName,
        effect: effectParts.join(', ') || 'Passive bonus',
        isActive: character.abilityToggles['SagaOfTheWarriorBorn'] ?? false,
        category: 'self',
      });
    }
  }

  // Crushing Strike trait - Has not moved condition
  if (character.traits.includes('CrushingStrike')) {
    conditions.push({
      id: 'CrushingStrike_notMoved',
      label: 'Has not moved',
      source: 'Crushing Strike',
      effect: '+50% melee dmg',
      isActive: character.abilityToggles['CrushingStrike_notMoved'] ?? false,
      category: 'self',
    });
  }

  // Ranged Specialist trait - Started turn adjacent to enemy condition
  if (character.traits.includes('RangedSpecialist')) {
    conditions.push({
      id: 'RangedSpecialist_adjacentToEnemy',
      label: 'Started turn adjacent to enemy',
      source: 'Ranged Specialist',
      effect: 'Enables positional bonuses (Position)',
      isActive: character.abilityToggles['RangedSpecialist_adjacentToEnemy'] ?? false,
      category: 'self',
    });
  }

  return conditions;
}

/**
 * Get aura conditions from teammates
 */
function getAuraConditions(
  character: BattleCharacter,
  team: BattleCharacter[]
): BuffCondition[] {
  const conditions: BuffCondition[] = [];

  // Find teammates with aura abilities
  for (const teammate of team) {
    if (teammate.id === character.id) continue;

    // Lord of the Host (Dante) - provides buffs to RapidAssault/Flying characters
    if (teammate.passiveAbilities.includes('LordOfTheHost')) {
      // Check if character has RapidAssault or Flying trait
      const hasRapidAssault = character.traits.includes('RapidAssault');
      const hasFlying = character.traits.includes('Flying');

      if (hasRapidAssault || hasFlying) {
        const levelIndex = teammate.abilityLevels?.['LordOfTheHost'] ?? 54;
        const values = getAbilityValues('LordOfTheHost', levelIndex);
        const abilityName = getAbilityNameSync('LordOfTheHost');

        if (values) {
          const extraDmg = values.extraDmg as number || 0;

          // Damage bonus condition - "In Range of [Dante]"
          const dmgToggleId = `LordOfTheHost_${teammate.id}_damage`;
          const isDmgActive = character.abilityToggles[dmgToggleId] ?? false;
          conditions.push({
            id: dmgToggleId,
            label: `In Range of ${teammate.name}`,
            source: abilityName,
            sourceCharacter: teammate.name,
            effect: `+${extraDmg} melee dmg`,
            isActive: isDmgActive,
            category: 'aura',
          });

          // Extra melee hit condition - "Low HP (≤50%)"
          // Can only be enabled if In Range is active
          const hitsToggleId = `LordOfTheHost_${teammate.id}_hits`;
          const isHitsActive = isDmgActive && (character.abilityToggles[hitsToggleId] ?? false);
          conditions.push({
            id: hitsToggleId,
            label: 'Low HP (≤50%)',
            source: abilityName,
            sourceCharacter: teammate.name,
            effect: '+1 melee hit',
            isActive: isHitsActive,
            category: 'aura',
            dependsOn: dmgToggleId,
          });
        }
      }
    }

    // First Among Traitors (Abaddon) - provides damage buff to Chaos characters
    if (teammate.passiveAbilities.includes('FirstAmongTraitors')) {
      // Check if character is Chaos alliance (not Abaddon himself)
      if (character.alliance === 'Chaos') {
        const levelIndex = teammate.abilityLevels?.['FirstAmongTraitors'] ?? 54;
        const values = getAbilityValues('FirstAmongTraitors', levelIndex);
        const abilityName = getAbilityNameSync('FirstAmongTraitors');

        if (values) {
          const extraDmg = values.extraDmg as number || 0;
          const maxDmg = values.maxDmg as number || 0;

          // Damage bonus condition - "In Range of [Abaddon]"
          const dmgToggleId = `FirstAmongTraitors_${teammate.id}_damage`;
          const isDmgActive = character.abilityToggles[dmgToggleId] ?? false;
          conditions.push({
            id: dmgToggleId,
            label: `In Range of ${teammate.name}`,
            source: abilityName,
            sourceCharacter: teammate.name,
            effect: `+${extraDmg} to +${maxDmg} dmg`,
            isActive: isDmgActive,
            category: 'aura',
          });
        }
      }
    }

    // Way of the Short Blade (Farsight) - provides buffs to ranged attackers and T'au Empire melee
    if (teammate.passiveAbilities.includes('WayOfTheShortBlade')) {
      const levelIndex = teammate.abilityLevels?.['WayOfTheShortBlade'] ?? 54;
      const values = getAbilityValues('WayOfTheShortBlade', levelIndex);
      const abilityName = getAbilityNameSync('WayOfTheShortBlade');

      if (values) {
        const armorIgnored = values.armorIgnored as number || 0;
        const extraDmgPct = values.extraDmgPct as number || 0;

        // Check if character has normal ranged attacks (for armor ignore + damage buff)
        const hasRangedAttack = character.rangedHits !== undefined && character.rangedHits > 0;
        const isNotPsychic = character.rangedDamageType !== 'Psychic';

        if (hasRangedAttack && isNotPsychic) {
          // Ranged buff condition - "Within range 2 of adjacent enemy"
          const rangeToggleId = `WayOfTheShortBlade_${teammate.id}_range2`;
          const isRangeActive = character.abilityToggles[rangeToggleId] ?? false;
          conditions.push({
            id: rangeToggleId,
            label: 'Range 2 from adjacent enemy',
            source: abilityName,
            sourceCharacter: teammate.name,
            effect: `-${armorIgnored} armor, +${extraDmgPct}% dmg`,
            isActive: isRangeActive,
            category: 'aura',
          });
        }

        // Check if character is T'au Empire (for melee follow-up)
        // Only for other T'au Empire characters (not Farsight himself)
        const isTauEmpire = character.faction === "T'au Empire" || character.faction === 'Tau';
        const hasMeleeAttack = character.meleeHits !== undefined && character.meleeHits > 0;

        if (isTauEmpire && hasMeleeAttack && hasRangedAttack) {
          // Melee follow-up condition - "Range 2 from Farsight"
          const meleeToggleId = `WayOfTheShortBlade_${teammate.id}_melee`;
          const isMeleeActive = character.abilityToggles[meleeToggleId] ?? false;
          conditions.push({
            id: meleeToggleId,
            label: `Range 2 from ${teammate.name}`,
            source: abilityName,
            sourceCharacter: teammate.name,
            effect: 'Additional ranged attack after melee',
            isActive: isMeleeActive,
            category: 'aura',
          });
        }
      }
    }

    // Structural Analyser (Darkstrider) - provides ranged damage bonus to adjacent T'au allies
    if (teammate.passiveAbilities.includes('StructuralAnalyser')) {
      // Check if character is T'au Empire (not Darkstrider himself)
      const isTauEmpire = character.faction === "T'au Empire" || character.faction === 'Tau';

      if (isTauEmpire) {
        const levelIndex = teammate.abilityLevels?.['StructuralAnalyser'] ?? 54;
        const values = getAbilityValues('StructuralAnalyser', levelIndex);
        const abilityName = getAbilityNameSync('StructuralAnalyser');

        if (values) {
          const extraDmg = values.extraDmg as number || 0;
          const toggleId = `StructuralAnalyser_${teammate.id}_adjacent`;

          conditions.push({
            id: toggleId,
            label: `Adjacent to ${teammate.name}`,
            source: abilityName,
            sourceCharacter: teammate.name,
            effect: `+${extraDmg} ranged dmg (vs Markerlight)`,
            isActive: character.abilityToggles[toggleId] ?? false,
            category: 'aura',
          });
        }
      }
    }
  }

  return conditions;
}

/**
 * Get "Adjacent to Boss" condition for characters
 * Only shows if team has buffs that require this toggle (e.g., Legendary Commander, Way of the Short Blade)
 */
function getAdjacentToBossCondition(
  character: BattleCharacter,
  team: BattleCharacter[]
): BuffCondition[] {
  const conditions: BuffCondition[] = [];

  // Check if any buff in the team requires this toggle
  const requiredToggles = getTeamRequiredToggles(team);
  if (!requiredToggles.has('adjacentToBoss')) {
    return conditions;
  }

  // Add "Adjacent to Boss" toggle
  const toggleId = 'adjacentToBoss';
  conditions.push({
    id: toggleId,
    label: 'Adjacent to Boss',
    source: 'Position',
    effect: 'Enables positional bonuses',
    isActive: character.abilityToggles[toggleId] ?? false,
    category: 'self',
  });

  return conditions;
}

/**
 * Get "Boss at Range 2 from Eldryon" condition
 * Only shows for Eldryon if team has Doom ability
 * When active, all teammates get damage bonus from Doom
 */
function getBossRange2FromEldryonCondition(
  character: BattleCharacter,
  team: BattleCharacter[]
): BuffCondition[] {
  const conditions: BuffCondition[] = [];

  // Check if any buff in the team requires this toggle
  const requiredToggles = getTeamRequiredToggles(team);
  if (!requiredToggles.has('bossRange2FromEldryon')) {
    return conditions;
  }

  // Only show this toggle for Eldryon (the character with Doom)
  if (!character.passiveAbilities.includes('Doom')) {
    return conditions;
  }

  // Get Doom values for effect description
  const levelIndex = character.abilityLevels?.['Doom'] ?? 54;
  const values = getAbilityValues('Doom', levelIndex);
  const abilityName = getAbilityNameSync('Doom');

  if (values) {
    const extraDmg = values.extraDmg as number || 0;
    const extraDmg_2 = values.extraDmg_2 as number || 0;

    // Add "Boss at Range 2" toggle
    const toggleId = 'bossRange2FromEldryon';
    conditions.push({
      id: toggleId,
      label: 'Boss at Range 2',
      source: abilityName,
      effect: `Allies: +${extraDmg} normal dmg, Aeldari: +${extraDmg_2} all dmg`,
      isActive: character.abilityToggles[toggleId] ?? false,
      category: 'self',
    });
  }

  return conditions;
}

/**
 * Check if a character has any buff conditions
 */
export function hasBuffConditions(
  character: BattleCharacter,
  team: BattleCharacter[]
): boolean {
  return getCharacterBuffConditions(character, team).length > 0;
}
