/**
 * Ability Handlers Index
 * Registers all ability handlers with the registry
 */

import { registerAbilityHandlers } from '../abilityRegistry';
import { passiveHandlers } from './passiveHandlers';
import { activeHandlers } from './activeHandlers';

// Register all handlers
registerAbilityHandlers([...passiveHandlers, ...activeHandlers]);

// Re-export for direct access if needed
export { passiveHandlers } from './passiveHandlers';
export { activeHandlers } from './activeHandlers';
export { auraHandlers, getAuraHandler, hasAuraHandler } from './auraHandlers';
