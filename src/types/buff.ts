// Buff system types

import type { BattleCharacter, BattleState } from './battle';
import type { Boss } from './boss';

// Target condition types - determines WHO receives the buff
export type BuffTargetConditionType =
  | 'self'           // Only the source character
  | 'characterId'    // Specific character by ID
  | 'characterName'  // Specific character by name
  | 'allAllies'      // All friendly characters
  | 'hasTrait'       // Characters with specific trait
  | 'attackType'     // Only for specific attack type
  | 'custom';        // Custom evaluator function

// Attack category for determining buff applicability
export type AttackCategory = 'normal' | 'special' | 'ability';

// Context for evaluating buff conditions
export interface BuffEvaluationContext {
  attacker: BattleCharacter;
  attackType: 'melee' | 'ranged';
  attackCategory?: AttackCategory;  // 'normal' for basic attacks, 'special'/'ability' for special attacks
  target?: Boss;
  battleState: BattleState;
}

// Target condition definition
export interface BuffTargetCondition {
  type: BuffTargetConditionType;

  // For specific conditions
  characterId?: string;
  characterName?: string;
  traitRequired?: string;
  attackType?: 'melee' | 'ranged';

  // For complex conditions
  customEvaluator?: (context: BuffEvaluationContext, buff: PooledBuff) => boolean;
}

// Buff effects - what bonuses the buff provides
// Named PooledBuffEffect to avoid conflict with BuffEffect in battle.ts
export interface PooledBuffEffect {
  baseDamageBonus?: number;
  baseDamageMultiplier?: number;
  extraHits?: number;
  critChanceBonus?: number;
  critDamageBonus?: number;
  armorIgnored?: number;  // Reduces target armor before damage calculation
  attackType?: 'melee' | 'ranged';  // Restrict buff to specific attack type
}

// A buff instance in the pool
export interface PooledBuff {
  id: string;                    // Unique instance ID (for removal)
  buffId: string;                // Buff definition ID (e.g., 'war_howl')
  name: string;                  // Display name
  sourceCharacterId: string;     // Who created this buff
  sourceAbilityId: string;       // Which ability created it

  // Target condition - determines WHO receives the buff
  targetCondition: BuffTargetCondition;

  // Effects
  effects: PooledBuffEffect;

  // When added (for display/tracking)
  addedAtTurn: number;

  // Duration in turns (undefined = permanent)
  duration?: number;
  // Turns remaining (decremented each turn, removed when 0)
  turnsRemaining?: number;

  // If true, this buff is consumed (removed) after being used once
  consumeOnUse?: boolean;
}

// Buff template for defining buff types
export interface BuffTemplate {
  buffId: string;
  name: string;
  sourceAbilityId: string;

  // Default target condition (can be overridden when adding)
  defaultTargetCondition: BuffTargetCondition;

  // Effects (can use ability values)
  getEffects: (abilityValues: Record<string, number>) => PooledBuffEffect;

  // Duration in turns (undefined = permanent)
  duration?: number;

  // If true, buff is consumed (removed) after being used once
  consumeOnUse?: boolean;

  // Toggle IDs this buff requires (e.g., 'adjacentToBoss')
  // Used to show/hide toggles based on team composition
  requiredToggles?: string[];
}
