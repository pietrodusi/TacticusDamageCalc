/**
 * Buff Conditions Service
 * Defines toggleable conditions that affect buff application
 * Each condition represents a state the user can toggle (e.g., "Charging", "In Range", "Low HP")
 */

import type { BattleCharacter } from '../types';
import { getAbilityValues, getAbilityNameSync } from './abilities';

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

  // Add "Adjacent to Boss" condition for all characters
  conditions.push(...getAdjacentToBossCondition(character));

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
  }

  return conditions;
}

/**
 * Get "Adjacent to Boss" condition for all characters
 * This is used by Legendary Commander and potentially other abilities
 */
function getAdjacentToBossCondition(
  character: BattleCharacter
): BuffCondition[] {
  const conditions: BuffCondition[] = [];

  // Add "Adjacent to Boss" toggle for every character
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
 * Check if a character has any buff conditions
 * Always returns true now since every character has the "Adjacent to Boss" toggle
 */
export function hasBuffConditions(
  _character: BattleCharacter,
  _team: BattleCharacter[]
): boolean {
  // Every character has the "Adjacent to Boss" toggle
  return true;
}
