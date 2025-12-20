/**
 * Ability Registry
 * Central registry for ability handlers
 * Each ability that needs special handling is registered here
 */

import type { AbilityHandler } from './types';

// Registry of ability handlers
const abilityHandlers: Map<string, AbilityHandler> = new Map();

/**
 * Register an ability handler
 */
export function registerAbilityHandler(handler: AbilityHandler): void {
  abilityHandlers.set(handler.abilityId, handler);
}

/**
 * Get a registered ability handler
 */
export function getAbilityHandler(abilityId: string): AbilityHandler | null {
  return abilityHandlers.get(abilityId) || null;
}

/**
 * Check if an ability has a registered handler
 */
export function hasAbilityHandler(abilityId: string): boolean {
  return abilityHandlers.has(abilityId);
}

/**
 * Get all registered ability IDs
 */
export function getRegisteredAbilityIds(): string[] {
  return Array.from(abilityHandlers.keys());
}

/**
 * Get all registered handlers
 */
export function getAllHandlers(): AbilityHandler[] {
  return Array.from(abilityHandlers.values());
}

/**
 * Register multiple handlers at once
 */
export function registerAbilityHandlers(handlers: AbilityHandler[]): void {
  for (const handler of handlers) {
    registerAbilityHandler(handler);
  }
}

/**
 * Check if an ability ends the character's turn when used
 * Default behavior:
 * - Buff abilities don't end turn (unless explicitly set)
 * - Other abilities (damage, summon, healing) end the turn
 */
export function abilityEndsTurn(abilityId: string): boolean {
  const handler = getAbilityHandler(abilityId);
  if (!handler) {
    return true; // Unknown abilities end the turn by default
  }

  // If explicitly set, use that value
  if (handler.endsTurn !== undefined) {
    return handler.endsTurn;
  }

  // Default behavior based on category
  return handler.category !== 'buff';
}

// Note: Individual ability handlers are defined in handlers/passiveHandlers.ts
// and handlers/activeHandlers.ts, then registered here.
