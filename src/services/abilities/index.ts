/**
 * Abilities System
 * Public exports for the abilities module
 */

// Types
export type {
  AbilityRangeType,
  AbilityCategory,
  RawAbilityStats,
  ComputedAbilityValues,
  AbilityStatModifier,
  AbilityContext,
  AbilityCooldownState,
  PassiveAbilityEvaluation,
  ActiveAbilityResult,
  AbilityHandler,
  PassiveAbilitiesResult,
  DisplayableAbilityBonus,
  AuraBonus,
  AuraAbilityHandler,
  FollowUpAttack,
  AttackCategory,
  DamageComponent,
} from './types';

// Data loader
export {
  getAbilityValues,
  getAbilityName,
  getAbilityNameSync,
  getAbilityDescriptionSync,
  getFormattedAbilityDescription,
  getRawAbilityStats,
  getAllAbilityIds,
  abilityExists,
  getAbilityRangeType,
  classifyAbility,
  isDamageAbility,
  isModifierAbility,
  getAbilityCooldown,
  getAbilityInitialCooldown,
} from './abilityDataLoader';

// Registry
export {
  registerAbilityHandler,
  getAbilityHandler,
  hasAbilityHandler,
  getRegisteredAbilityIds,
  getAllHandlers,
  registerAbilityHandlers,
  abilityEndsTurn,
} from './abilityRegistry';

// Evaluator
export {
  combineModifiers,
  evaluatePassiveAbilities,
  executeActiveAbility,
  applyAbilityModifiersToDamage,
  applyAbilityModifiersToHits,
  applyAbilityModifiersToCrit,
} from './abilityEvaluator';

// Cooldown manager
export {
  initializeCooldowns,
  isAbilityReady,
  useAbility,
  unuseAbility,
  advanceCooldowns,
  resetCooldowns,
  getCooldownRemaining,
  getCooldownDisplayText,
} from './cooldownManager';

// UI helpers
export {
  getCharacterPassiveBonuses,
  getCharacterActiveAbilities,
  getCharacterAuraBonuses,
  hasPassiveAbilities,
  hasActiveAbilities,
  hasAuraBonuses,
  getLegendaryCommanderBuffDisplay,
  getLegendaryCommanderHitsBuffDisplay,
  getLegendaryCommanderBuffs,
  isEligibleForLcHitsBuff,
  isEligibleForLcBuff,
} from './ui/abilityBonuses';

// Aura handlers
export { getAuraHandler, hasAuraHandler } from './handlers/auraHandlers';

// Import and register handlers
import './handlers';
