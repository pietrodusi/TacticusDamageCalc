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
 * Helper to check if a toggle is active (for boolean toggles in abilityToggles that can also contain numbers for counters)
 */
const isToggleActive = (value: boolean | number | undefined): boolean => value === true;

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
    hasQualifiedForLCDamage: character.hasQualifiedForLCDamage,
    currentHealth: character.currentHealth,
    maxHealth: character.calculatedHealth,
    currentTurn: 1, // Will be updated from battle state
    attackType: 'melee', // Default for display
    attackCategory: 'normal',  // Default for display
    isFirstSpecialAttackOfTurn: true,  // Default for display
    trajannIsAdjacentToBoss: false,  // Will be updated from battle state
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

        // Check alliance requirement
        if (aura.requiredAlliance && character.alliance !== aura.requiredAlliance) {
          continue;
        }

        // Check if toggle is enabled
        const toggleKey = aura.auraId;
        const isToggled = isToggleActive(character.abilityToggles[toggleKey]);

        // Calculate scaled modifiers if scaling context exists
        let modifiers = aura.modifiers;
        let bonusText = aura.bonusText;
        if (aura.scalingContext) {
          const sourceChar = team.find(c => c.id === aura.scalingContext!.sourceCharacterId);
          const attackCount = Math.min(
            sourceChar?.totalAttacksThisBattle ?? 0,
            aura.scalingContext.maxStacks
          );
          const scaledBonus = Math.min(
            aura.scalingContext.baseBonus + (aura.scalingContext.perStackBonus * attackCount),
            aura.scalingContext.maxBonus
          );
          modifiers = { ...aura.modifiers, baseDamageBonus: scaledBonus };
          bonusText = `+${scaledBonus} dmg (${attackCount}/${aura.scalingContext.maxStacks} attacks)`;
        }

        // Create displayable bonus
        bonuses.push({
          abilityId: toggleKey,
          abilityName: aura.sourceAbilityName,
          bonusText,
          isActive: isToggled,
          reason: aura.requiresLowHealth
            ? `From ${teammate.name} (requires ≤50% HP)`
            : `From ${teammate.name}`,
          colorClass: isToggled ? 'text-yellow-400' : 'text-gray-500',
          requiresToggle: true,
          toggleLabel: aura.toggleLabel,
          sourceCharacterId: teammate.id,
          sourceCharacterName: teammate.name,
          attackTypeRestriction: aura.attackTypeRestriction,
          modifiers,
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
 * Check if a character is eligible for LC buffs
 * Trajann is NOT eligible (doesn't receive his own buff)
 */
export function isEligibleForLcBuff(character: BattleCharacter): boolean {
  // Trajann doesn't receive his own buff
  if (character.passiveAbilities.includes('LegendaryCommander')) {
    return false;
  }
  return true;
}

/**
 * Check if a character is eligible for LC hits buff specifically
 * Eligible = has damage-dealing active ability OR passive ability with special attack
 * Trajann is NOT eligible (doesn't receive his own buff)
 */
export function isEligibleForLcHitsBuff(character: BattleCharacter): boolean {
  // Trajann doesn't receive his own buff
  if (character.passiveAbilities.includes('LegendaryCommander')) {
    return false;
  }

  // Check for damage-dealing active abilities
  for (const abilityId of character.activeAbilities) {
    const handler = getAbilityHandler(abilityId);
    if (handler?.category === 'damage') {
      return true;
    }
  }

  // Check for passive abilities with special attack (follow-up attack)
  // These are passives like LegacyOfCombat, TheBetrayer that trigger additional attacks
  const passivesWithSpecialAttack = ['LegacyOfCombat', 'TheBetrayer', 'FuryOfTheAncients'];
  for (const abilityId of character.passiveAbilities) {
    if (passivesWithSpecialAttack.includes(abilityId)) {
      return true;
    }
  }

  return false;
}

/**
 * Get LegendaryCommander buffs for a character as toggleable checkboxes
 * Returns both damage and hits buffs that the user can enable/disable
 * @param character The character to check
 * @param team All characters in the team
 * @returns Array of displayable buff info, empty if Trajann isn't in the team or character is Trajann
 */
export function getLegendaryCommanderBuffs(
  character: BattleCharacter,
  team: BattleCharacter[]
): DisplayableAbilityBonus[] {
  const buffs: DisplayableAbilityBonus[] = [];

  // Trajann doesn't receive his own buff
  if (!isEligibleForLcBuff(character)) {
    return buffs;
  }

  // Find Trajann in team
  const trajann = team.find(c => c.passiveAbilities.includes('LegendaryCommander'));
  if (!trajann) return buffs;

  // Get ability values
  const levelIndex = trajann.abilityLevels?.['LegendaryCommander'] ?? 54;
  const values = getAbilityValues('LegendaryCommander', levelIndex);
  if (!values) return buffs;

  const extraDmg = values.extraDmg as number || 0;
  const extraHits = values.nrOfHits as number || 0;

  // Damage buff - available to all characters (except Trajann)
  const dmgToggleKey = 'LegendaryCommander_damage';
  const dmgIsActive = isToggleActive(character.abilityToggles[dmgToggleKey]);

  buffs.push({
    abilityId: dmgToggleKey,
    abilityName: 'Legendary Commander',
    bonusText: `+${extraDmg} dmg`,
    isActive: dmgIsActive,
    reason: `From ${trajann.name}`,
    colorClass: dmgIsActive ? 'text-orange-400' : 'text-gray-500',
    requiresToggle: true,
    toggleLabel: 'Extra damage',
    sourceCharacterId: trajann.id,
    sourceCharacterName: trajann.name,
  });

  // Hits buff - only for characters with special attacks
  if (isEligibleForLcHitsBuff(character)) {
    const hitsToggleKey = 'LegendaryCommander_hits';
    const hitsIsActive = isToggleActive(character.abilityToggles[hitsToggleKey]);

    buffs.push({
      abilityId: hitsToggleKey,
      abilityName: 'Legendary Commander',
      bonusText: `+${extraHits} hit${extraHits > 1 ? 's' : ''} (special)`,
      isActive: hitsIsActive,
      reason: `From ${trajann.name}`,
      colorClass: hitsIsActive ? 'text-orange-400' : 'text-gray-500',
      requiresToggle: true,
      toggleLabel: 'Extra hits',
      sourceCharacterId: trajann.id,
      sourceCharacterName: trajann.name,
    });
  }

  return buffs;
}

/**
 * Get LegendaryCommander hits buff display for a character (legacy)
 * @deprecated Use getLegendaryCommanderBuffs instead
 */
export function getLegendaryCommanderHitsBuffDisplay(
  character: BattleCharacter,
  team: BattleCharacter[],
  _hitsBuffActive: boolean,
  _hitsBuffConsumed: boolean
): DisplayableAbilityBonus | null {
  const buffs = getLegendaryCommanderBuffs(character, team);
  return buffs.find(b => b.abilityId === 'LegendaryCommander_hits') || null;
}

/**
 * Get LegendaryCommander buff display for a character (legacy)
 * @deprecated Use getLegendaryCommanderBuffs instead
 */
export function getLegendaryCommanderBuffDisplay(
  team: BattleCharacter[],
  _legendaryCommanderBuffAvailable: boolean
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
    isActive: false,
    reason: 'Toggle in character card',
    colorClass: 'text-gray-500',
    requiresToggle: false,
    sourceCharacterId: trajann.id,
    sourceCharacterName: trajann.name,
  };
}
