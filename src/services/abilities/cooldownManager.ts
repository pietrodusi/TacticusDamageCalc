/**
 * Cooldown Manager
 * Tracks ability cooldowns during battle
 */

import type { AbilityCooldownState } from './types';
import { getAbilityCooldown } from './abilityDataLoader';

/**
 * Initialize cooldown state for a list of abilities
 */
export function initializeCooldowns(
  abilityIds: string[]
): Record<string, AbilityCooldownState> {
  const cooldowns: Record<string, AbilityCooldownState> = {};

  for (const abilityId of abilityIds) {
    const maxCooldown = getAbilityCooldown(abilityId);
    cooldowns[abilityId] = {
      abilityId,
      currentCooldown: 0, // Ready to use at start
      maxCooldown,
      usedThisBattle: false,
    };
  }

  return cooldowns;
}

/**
 * Check if an ability is ready to use
 */
export function isAbilityReady(cooldownState: AbilityCooldownState): boolean {
  // One-time abilities can only be used once
  if (cooldownState.maxCooldown === -1) {
    return !cooldownState.usedThisBattle;
  }

  // Reusable abilities are ready when cooldown is 0
  return cooldownState.currentCooldown === 0;
}

/**
 * Use an ability (marks it as used and sets cooldown)
 * Cooldown represents turns to WAIT after the use turn.
 * So if cooldown is 2, you wait turns 2 and 3, and it's ready on turn 4.
 * We add 1 because advanceCooldowns is called when transitioning to the next turn.
 */
export function useAbility(
  cooldowns: Record<string, AbilityCooldownState>,
  abilityId: string
): Record<string, AbilityCooldownState> {
  const current = cooldowns[abilityId];
  if (!current) return cooldowns;

  return {
    ...cooldowns,
    [abilityId]: {
      ...current,
      usedThisBattle: true,
      // Add 1 to account for the turn transition decrement
      currentCooldown: current.maxCooldown === -1 ? -1 : current.maxCooldown + 1,
    },
  };
}

/**
 * Undo ability use (for when character turn is reset)
 * Resets the ability back to ready state
 */
export function unuseAbility(
  cooldowns: Record<string, AbilityCooldownState>,
  abilityId: string
): Record<string, AbilityCooldownState> {
  const current = cooldowns[abilityId];
  if (!current) return cooldowns;

  return {
    ...cooldowns,
    [abilityId]: {
      ...current,
      usedThisBattle: false,
      currentCooldown: 0,
    },
  };
}

/**
 * Advance cooldowns at the start of a new turn
 * Decrements all positive cooldowns by 1
 */
export function advanceCooldowns(
  cooldowns: Record<string, AbilityCooldownState>
): Record<string, AbilityCooldownState> {
  const updated: Record<string, AbilityCooldownState> = {};

  for (const [abilityId, state] of Object.entries(cooldowns)) {
    if (state.currentCooldown > 0) {
      updated[abilityId] = {
        ...state,
        currentCooldown: state.currentCooldown - 1,
      };
    } else {
      updated[abilityId] = state;
    }
  }

  return updated;
}

/**
 * Reset all cooldowns (for battle start)
 */
export function resetCooldowns(
  cooldowns: Record<string, AbilityCooldownState>
): Record<string, AbilityCooldownState> {
  const reset: Record<string, AbilityCooldownState> = {};

  for (const [abilityId, state] of Object.entries(cooldowns)) {
    reset[abilityId] = {
      ...state,
      currentCooldown: 0,
      usedThisBattle: false,
    };
  }

  return reset;
}

/**
 * Get remaining cooldown turns for an ability
 * Returns:
 * - 0 if ready to use
 * - -1 if one-time ability already used
 * - positive number for turns remaining
 */
export function getCooldownRemaining(cooldownState: AbilityCooldownState): number {
  if (cooldownState.maxCooldown === -1) {
    return cooldownState.usedThisBattle ? -1 : 0;
  }
  return cooldownState.currentCooldown;
}

/**
 * Get cooldown display text for UI
 * Shows the number of turns to wait (not counting current turn)
 */
export function getCooldownDisplayText(cooldownState: AbilityCooldownState): string {
  if (cooldownState.maxCooldown === -1) {
    return cooldownState.usedThisBattle ? 'Used' : 'Ready';
  }

  if (cooldownState.currentCooldown === 0) {
    return 'Ready';
  }

  // Subtract 1 because the stored value includes the turn transition buffer
  const displayTurns = Math.max(0, cooldownState.currentCooldown - 1);
  if (displayTurns === 0) {
    return 'Ready next turn';
  }
  return `${displayTurns} turn${displayTurns > 1 ? 's' : ''}`;
}
