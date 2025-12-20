/**
 * Ability Bonuses Display Service
 * Computes which ability bonuses are applicable for display on character cards
 * during battle simulation.
 */

import type { BattleCharacter } from '../../../types';
import type { DisplayableAbilityBonus, AbilityContext } from '../types';
import { getAbilityHandler } from '../abilityRegistry';
import { getAbilityValues, getAbilityNameSync, getFormattedAbilityDescription } from '../abilityDataLoader';
import { getCooldownDisplayText } from '../cooldownManager';
import { getAuraHandler } from '../handlers/auraHandlers';

/**
 * Get displayable passive ability bonuses for a battle character
 * @param character The battle character to check
 * @returns Array of displayable passive ability bonuses
 */
export function getCharacterPassiveBonuses(
  character: BattleCharacter
): DisplayableAbilityBonus[] {
  const bonuses: DisplayableAbilityBonus[] = [];

  // Build ability context for evaluation
  const context: AbilityContext = {
    characterId: character.id,
    hasMoved: character.hasMoved,
    hasActedThisBattle: character.hasAttackedThisBattle,
    attacksThisTurn: character.attacksThisTurn,
    attackTurnsCount: character.attackTurnsCount,
    hasUsedAbilityThisTurn: character.hasUsedAbilityThisTurn,
    currentHealth: character.currentHealth,
    maxHealth: character.calculatedHealth,
    currentTurn: 1, // Will be updated from battle state
    attackType: 'melee', // Default for display
    abilityToggles: character.abilityToggles,
  };

  // Get default ability level index (level 55 = index 54)
  const defaultLevelIndex = character.abilityLevels
    ? Object.values(character.abilityLevels)[0] ?? 54
    : 54;

  // Evaluate each passive ability
  for (const abilityId of character.passiveAbilities) {
    const handler = getAbilityHandler(abilityId);
    const levelIndex = character.abilityLevels?.[abilityId] ?? defaultLevelIndex;
    const abilityDescription = getFormattedAbilityDescription(abilityId, levelIndex);

    if (handler?.evaluatePassive) {
      const values = getAbilityValues(abilityId, levelIndex);
      if (values) {
        const evaluation = handler.evaluatePassive(values, context);

        // Convert evaluation to displayable bonus
        bonuses.push({
          abilityId: evaluation.abilityId,
          abilityName: evaluation.abilityName,
          abilityDescription,
          bonusText: formatBonusText(evaluation.modifiers),
          isActive: evaluation.applicable,
          reason: evaluation.reason,
          colorClass: evaluation.applicable ? 'text-purple-400' : 'text-gray-500',
          requiresToggle: evaluation.requiresToggle,
          toggleLabel: evaluation.toggleLabel,
        });
      }
    } else {
      // No handler - show ability name with description
      const abilityName = getAbilityNameSync(abilityId);
      bonuses.push({
        abilityId,
        abilityName,
        abilityDescription,
        bonusText: abilityName,  // Show ability name instead of generic "Passive"
        isActive: false,
        reason: 'Passive ability',
        colorClass: 'text-gray-500',
        requiresToggle: false,
      });
    }
  }

  return bonuses;
}

/**
 * Get displayable active ability info for a battle character
 * @param character The battle character to check
 * @returns Array of active ability display info
 */
export function getCharacterActiveAbilities(
  character: BattleCharacter
): Array<{
  abilityId: string;
  abilityName: string;
  isReady: boolean;
  cooldownText: string;
  category: string;
}> {
  const abilities: Array<{
    abilityId: string;
    abilityName: string;
    isReady: boolean;
    cooldownText: string;
    category: string;
  }> = [];

  for (const abilityId of character.activeAbilities) {
    const cooldownState = character.abilityCooldowns[abilityId];
    const handler = getAbilityHandler(abilityId);
    const abilityName = getAbilityNameSync(abilityId);

    abilities.push({
      abilityId,
      abilityName,
      isReady: cooldownState
        ? !cooldownState.usedThisBattle || cooldownState.currentCooldown === 0
        : true,
      cooldownText: cooldownState ? getCooldownDisplayText(cooldownState) : 'Ready',
      category: handler?.category || 'other',
    });
  }

  return abilities;
}

/**
 * Format ability modifiers into a readable bonus text
 */
function formatBonusText(modifiers: {
  baseDamageBonus?: number;
  baseDamageMultiplier?: number;
  extraHits?: number;
  critChanceBonus?: number;
  critDamageBonus?: number;
}): string {
  const parts: string[] = [];

  if (modifiers.baseDamageBonus) {
    parts.push(`+${modifiers.baseDamageBonus} dmg`);
  }

  if (modifiers.baseDamageMultiplier && modifiers.baseDamageMultiplier !== 1) {
    const percent = Math.round((modifiers.baseDamageMultiplier - 1) * 100);
    parts.push(`${percent >= 0 ? '+' : ''}${percent}% dmg`);
  }

  if (modifiers.extraHits) {
    parts.push(`+${modifiers.extraHits} hit${modifiers.extraHits > 1 ? 's' : ''}`);
  }

  if (modifiers.critChanceBonus) {
    parts.push(`+${modifiers.critChanceBonus}% crit`);
  }

  if (modifiers.critDamageBonus) {
    parts.push(`+${modifiers.critDamageBonus} crit dmg`);
  }

  return parts.length > 0 ? parts.join(', ') : 'Passive';
}

/**
 * Check if a character has any passive abilities with bonuses
 */
export function hasPassiveAbilities(character: BattleCharacter): boolean {
  return character.passiveAbilities.length > 0;
}

/**
 * Check if a character has any active abilities
 */
export function hasActiveAbilities(character: BattleCharacter): boolean {
  return character.activeAbilities.length > 0;
}

/**
 * Get aura bonuses from teammates that apply to this character
 * @param character The character to check for received auras
 * @param team All characters in the team
 * @returns Array of displayable aura bonuses
 */
export function getCharacterAuraBonuses(
  character: BattleCharacter,
  team: BattleCharacter[]
): DisplayableAbilityBonus[] {
  const bonuses: DisplayableAbilityBonus[] = [];

  // Get default ability level index
  const defaultLevelIndex = 54;

  // Check each teammate for auras that affect this character
  for (const teammate of team) {
    // Skip self
    if (teammate.id === character.id) continue;

    // Check each passive ability of the teammate for aura effects
    for (const abilityId of teammate.passiveAbilities) {
      const auraHandler = getAuraHandler(abilityId);
      if (!auraHandler) continue;

      // Get ability values
      const levelIndex = teammate.abilityLevels?.[abilityId] ?? defaultLevelIndex;
      const values = getAbilityValues(abilityId, levelIndex);
      if (!values) continue;

      // Get all aura bonuses this ability provides
      const auraBonuses = auraHandler.getAuraBonuses(values, teammate.id, teammate.name);

      // Check each aura bonus to see if this character qualifies
      for (const aura of auraBonuses) {
        // Check trait requirements
        if (aura.requiredTraits && aura.requiredTraits.length > 0) {
          const hasRequiredTrait = aura.requiredTraits.some(
            trait => character.traits.includes(trait)
          );
          if (!hasRequiredTrait) continue;
        }

        // Check if toggle is enabled
        const toggleKey = aura.auraId;
        const isToggled = character.abilityToggles[toggleKey] ?? false;

        // Create displayable bonus
        bonuses.push({
          abilityId: toggleKey,
          abilityName: aura.sourceAbilityName,
          bonusText: aura.bonusText,
          isActive: isToggled,
          reason: aura.requiresLowHealth
            ? `From ${teammate.name} (requires <50% HP)`
            : `From ${teammate.name}`,
          colorClass: isToggled ? 'text-yellow-400' : 'text-gray-500',
          requiresToggle: true,
          toggleLabel: aura.toggleLabel,
          sourceCharacterId: teammate.id,
          sourceCharacterName: teammate.name,
        });
      }
    }
  }

  return bonuses;
}

/**
 * Check if a character has any aura bonuses from teammates
 */
export function hasAuraBonuses(character: BattleCharacter, team: BattleCharacter[]): boolean {
  return getCharacterAuraBonuses(character, team).length > 0;
}

/**
 * Get LegendaryCommander buff display for a character
 * This is a team-wide buff from Trajann that applies to the first attack after an ability is used
 * @param team All characters in the team
 * @param legendaryCommanderBuffAvailable Whether the buff is currently available
 * @returns Displayable buff info or null if Trajann isn't in the team
 */
export function getLegendaryCommanderBuffDisplay(
  team: BattleCharacter[],
  legendaryCommanderBuffAvailable: boolean
): DisplayableAbilityBonus | null {
  // Find character with LegendaryCommander
  const trajann = team.find(c => c.passiveAbilities.includes('LegendaryCommander'));
  if (!trajann) return null;

  // Get ability values
  const levelIndex = trajann.abilityLevels?.['LegendaryCommander'] ?? 54;
  const values = getAbilityValues('LegendaryCommander', levelIndex);
  if (!values) return null;

  const extraDmg = values.extraDmg as number || 0;
  const extraHits = values.nrOfHits as number || 0;

  return {
    abilityId: 'LegendaryCommander',
    abilityName: 'Legendary Commander',
    bonusText: `+${extraDmg} dmg, +${extraHits} hit${extraHits > 1 ? 's' : ''}`,
    isActive: legendaryCommanderBuffAvailable,
    reason: legendaryCommanderBuffAvailable
      ? 'Ready (first attack after ability)'
      : 'Waiting for ability',
    colorClass: legendaryCommanderBuffAvailable ? 'text-orange-400' : 'text-gray-500',
    requiresToggle: false,  // No toggle - automatic based on ability usage
    sourceCharacterId: trajann.id,
    sourceCharacterName: trajann.name,
  };
}
