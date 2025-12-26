/**
 * Abilities System Types
 * Core interfaces for ability evaluation and execution
 */

import type { DamageType } from '../../types';

/**
 * Ability attack range type from abilities.json
 */
export type AbilityRangeType = 'Melee' | 'Ranged' | 'Normal';

/**
 * Ability category for grouping and handling
 */
export type AbilityCategory =
  | 'damage'      // Deals direct damage
  | 'summon'      // Summons units
  | 'healing'     // Heals HP
  | 'buff'        // Applies buffs to self/allies
  | 'passive'     // Passive stat modifiers
  | 'other';      // Special abilities

/**
 * Raw ability stats from abilities.json
 */
export interface RawAbilityStats {
  attackRangeType?: AbilityRangeType;
  upgrades: unknown;
  variables: Record<string, number[] | string[]>;
  constants?: Record<string, string>;
  variablesAffectedByRarityBonus?: string[];
}

/**
 * Computed ability values at a specific level
 */
export interface ComputedAbilityValues {
  // Damage
  minDmg?: number;
  maxDmg?: number;
  dmg?: number;
  nrOfHits?: number;
  damageProfile?: DamageType;

  // Extra damage modifiers
  extraDmg?: number;
  extraDmgPct?: number;
  dmgPct?: number;

  // Crit modifiers
  extraCritChance?: number;
  extraCritDmg?: number;

  // Hit modifiers
  extraHits?: number;

  // Summon stats
  summonHp?: number;
  summonDmg?: number;
  summonArmor?: number;
  unitId?: string;
  unitToSpawn?: string;

  // Healing
  hpToHeal?: number;

  // Defense
  dmgReduction?: number;
  armorReduction?: number;
  blockDmg?: number;

  // Other
  range?: number;
  chance?: number;
  effectTurns?: number;

  // Allow any additional computed values
  [key: string]: number | string | undefined;
}

/**
 * Ability stat modifier that modifies attacker stats for damage calculation
 */
export interface AbilityStatModifier {
  // Source ability name for display
  abilityName?: string;

  // Pre-armor damage bonuses
  baseDamageBonus?: number;        // Flat damage added to base (pre-armor)
  baseDamageMultiplier?: number;   // 1.25 = +25% damage (pre-armor)

  // Global (post-armor) damage bonuses
  globalDamageBonus?: number;      // Flat damage added after armor/pierce (per hit)
  globalDamageMultiplier?: number; // 1.25 = +25% damage (post-armor), same as baseDamageMultiplier

  // Hit bonuses
  extraHits?: number;              // Additional hits per attack

  // Crit bonuses
  critChanceBonus?: number;        // +% crit chance (percentage points)
  critDamageBonus?: number;        // Flat crit damage bonus

  // Override for ability-based attacks
  overrideDamageProfile?: DamageType;
  overrideMinDamage?: number;
  overrideMaxDamage?: number;
  overrideHits?: number;
}

/**
 * Context for ability evaluation
 */
export interface AbilityContext {
  // Character state
  characterId: string;
  hasMoved: boolean;
  hasActedThisBattle: boolean;
  attacksThisTurn: number;
  attackTurnsCount: number;  // Number of turns character has attacked (for LegacyOfCombat)
  hasUsedAbilityThisTurn: boolean;  // Whether an active ability was used this turn
  hasQualifiedForLCDamage: boolean;  // LC damage buff: adjacent to boss + ability "used" (immediately for buffs, after first special for special attacks)
  currentHealth?: number;
  maxHealth?: number;

  // Battle state
  currentTurn: number;

  // Attack info
  attackType: 'melee' | 'ranged' | 'ability';
  attackCategory?: AttackCategory;  // 'normal', 'special', or 'ability'
  isFirstSpecialAttackOfTurn: boolean;  // For LC +2 hits (first special attack this turn)

  // Team state (for auras like Legendary Commander)
  trajannIsAdjacentToBoss: boolean;

  // Ability-specific toggles (user-controlled for conditional abilities)
  abilityToggles: Record<string, boolean>;

  // Laviscus's Refusal to be Outdone passive
  outrage?: number;  // Accumulated outrage value from ally attacks
  outrageContributorCount?: number;  // Number of Chaos characters that contributed to outrage
}

/**
 * Attack category for distinguishing normal attacks from special attacks
 * - 'normal': Regular melee/ranged attacks
 * - 'special': Follow-up attacks from passives like TheBetrayer
 * - 'ability': Active ability attacks like KillMaimBurn
 */
export type AttackCategory = 'normal' | 'special' | 'ability';

/**
 * Follow-up attack triggered by passive abilities (like LegacyOfCombat, TheBetrayer)
 */
export interface FollowUpAttack {
  abilityId: string;
  abilityName: string;
  damageProfile: DamageType;
  minDamage: number;
  maxDamage: number;
  hits: number;
  damageMultiplier?: number;  // Applied to damage (e.g., 1.99 for +99%)
  // For proper Global multiplier display (e.g., "Martial Inspiration +33%×3")
  multiplierBasePercentage?: number;  // e.g., 33 for +33%
  multiplierStacks?: number;          // e.g., 3 for 3 attack turns
  multiplierSourceName?: string;      // e.g., "Martial Inspiration"
  attackCategory: AttackCategory;  // Whether this is a normal, special, or ability attack
  triggersOnNormalOnly?: boolean;  // If true, only triggers after normal attacks (not abilities)
}

/**
 * Result of passive ability evaluation
 */
export interface PassiveAbilityEvaluation {
  abilityId: string;
  abilityName: string;
  modifiers: AbilityStatModifier;
  applicable: boolean;
  reason: string;
  requiresToggle: boolean;
  toggleLabel?: string;  // Label for the toggle (e.g., "Killed enemy")
  followUpAttack?: FollowUpAttack;  // Additional attack triggered after main attack
}

/**
 * Ability cooldown state for tracking usage
 */
export interface AbilityCooldownState {
  abilityId: string;
  currentCooldown: number;   // -1 = used (one-time), 0 = ready, >0 = turns remaining
  maxCooldown: number;       // From ability data (-1 for one-time)
  usedThisBattle: boolean;
}

/**
 * Single damage component for multi-part abilities
 */
export interface DamageComponent {
  minDamage: number;
  maxDamage: number;
  averageDamage: number;
  hits: number;
  damageProfile: DamageType;
}

/**
 * Global multiplier info for abilities that apply damage multipliers
 */
export interface AbilityGlobalMultiplier {
  multiplier: number;           // e.g., 1.99 for +99%
  basePercentage: number;       // e.g., 33 for +33%
  stacks: number;               // e.g., 3 for 3 attack turns
  sourceName: string;           // e.g., "Martial Inspiration"
}

/**
 * Result of executing an active ability
 */
export interface ActiveAbilityResult {
  abilityId: string;
  abilityName: string;
  category: AbilityCategory;

  // Global multiplier from ability (shown in Global multiplier line)
  globalMultiplier?: AbilityGlobalMultiplier;

  // For damage abilities (single damage type)
  damageResult?: DamageComponent;

  // For multi-part damage abilities (like KillMaimBurn with 3 damage types)
  damageComponents?: DamageComponent[];

  // For summon abilities
  summonResult?: {
    unitId: string;
    hp: number;
    damage: number;
    armor: number;
  };

  // For healing abilities
  healingResult?: {
    amount: number;
  };

  // For buff abilities
  buffResult?: {
    effect: AbilityStatModifier;
    duration: number;
  };

  // Log message
  message: string;
}

/**
 * Handler definition for an ability
 */
export interface AbilityHandler {
  abilityId: string;
  abilityName: string;
  category: AbilityCategory;
  cooldown: number;  // -1 for one-time, positive for reusable
  endsTurn?: boolean;  // Whether using this ability ends the character's turn (default: true for damage, false for buff)

  // For passives: evaluate if it applies and return modifiers
  evaluatePassive?: (
    values: ComputedAbilityValues,
    context: AbilityContext
  ) => PassiveAbilityEvaluation;

  // For actives: execute the ability
  executeActive?: (
    values: ComputedAbilityValues,
    context: AbilityContext
  ) => ActiveAbilityResult;
}

/**
 * Combined result of evaluating all passive abilities
 */
export interface PassiveAbilitiesResult {
  evaluations: PassiveAbilityEvaluation[];
  combinedModifiers: AbilityStatModifier;
  followUpAttacks: FollowUpAttack[];  // All follow-up attacks from passives
}

/**
 * Displayable ability bonus for UI (like DisplayableTraitBonus)
 */
export interface DisplayableAbilityBonus {
  abilityId: string;
  abilityName: string;
  abilityDescription?: string; // Formatted description with values interpolated
  bonusText: string;        // e.g., "+3 hits", "+25% damage"
  isActive: boolean;
  reason: string;
  colorClass: string;       // Tailwind class for coloring
  requiresToggle: boolean;  // If user needs to enable/disable
  toggleLabel?: string;     // e.g., "Killed enemy"
  sourceCharacterId?: string;  // For aura bonuses, the character providing the aura
  sourceCharacterName?: string;
  attackTypeRestriction?: 'melee' | 'ranged';  // If set, only applies to this attack type
  modifiers?: AbilityStatModifier;  // The actual modifiers to apply
}

/**
 * Aura bonus definition - affects teammates, not the source character
 */
export interface AuraBonus {
  auraId: string;           // Unique ID for this aura bonus (e.g., "LordOfTheHost_damage")
  sourceAbilityId: string;  // The ability providing this aura
  sourceAbilityName: string;
  requiredTraits?: string[];  // Traits the target must have (e.g., ["RapidAssault", "Flying"])
  requiredAlliance?: string;  // Alliance the target must have (e.g., "Chaos")
  requiresLowHealth?: boolean;  // If true, only applies below 50% health
  modifiers: AbilityStatModifier;
  toggleLabel: string;      // Label for the toggle
  bonusText: string;        // Display text for the bonus
  attackTypeRestriction?: 'melee' | 'ranged';  // If set, only applies to this attack type
  scalingContext?: {        // For auras that scale with source character's stats
    sourceCharacterId: string;
    baseBonus: number;
    perStackBonus: number;
    maxBonus: number;
    maxStacks: number;
  };
}

/**
 * Aura handler for abilities that affect teammates
 */
export interface AuraAbilityHandler {
  abilityId: string;
  abilityName: string;

  // Get aura bonuses this ability provides to teammates
  getAuraBonuses: (
    values: ComputedAbilityValues,
    sourceCharacterId: string,
    sourceCharacterName: string
  ) => AuraBonus[];
}
