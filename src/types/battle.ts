import type { Character, TeamMember } from './character';
import type { AbilityCooldownState, AbilityStatModifier } from '../services/abilities/types';

export type ActionType = 'move' | 'attack' | 'meleeAttack' | 'rangedAttack' | 'ability' | 'wait';

// Damage totals with bounds
export interface DamageTotals {
  lower: number;
  upper: number;
  average: number;
}

export interface BattleCharacter extends TeamMember {
  currentHealth: number;
  position: { x: number; y: number };
  hasMoved: boolean;
  hasActed: boolean;
  turnEnded: boolean;  // True when character's turn is completely over (all actions disabled)
  buffs: Buff[];
  debuffs: Debuff[];
  // Calculated stats based on rarity/rank
  calculatedDamage: number;
  calculatedHealth: number;
  calculatedArmour: number;
  // Track total damage dealt by this character (average for backwards compat)
  totalDamageDealt: number;
  // Track damage bounds
  damageTotals: DamageTotals;
  // Track attacks for trait bonuses
  hasAttackedThisBattle: boolean;  // For RapidAssault first attack check
  attacksThisTurn: number;         // For RapidAssault same-turn attacks
  firstAttackTurn: number | null;  // Turn number when character first attacked (for RapidAssault)
  attackTurnsCount: number;        // Number of turns character has attacked (for LegacyOfCombat)
  hasUsedAbilityThisTurn: boolean; // For LegendaryCommander - track if active ability used this turn
  // Ability state
  abilityCooldowns: Record<string, AbilityCooldownState>;  // Track ability cooldowns
  abilityToggles: Record<string, boolean>;  // User-controlled toggles for conditional passives
  activeBuffs: AbilityStatModifier[];  // Active ability buffs (from abilities like WarHowl)
}

export interface Buff {
  id: string;
  name: string;
  duration: number; // turns remaining
  effect: BuffEffect;
}

export interface Debuff {
  id: string;
  name: string;
  duration: number;
  effect: DebuffEffect;
}

export interface BuffEffect {
  damageBonus?: number;
  damageMultiplier?: number;
  armourBonus?: number;
  movementBonus?: number;
}

export interface DebuffEffect {
  damagePenalty?: number;
  damageMultiplier?: number; // < 1 for reduction
  armourPenalty?: number;
  movementPenalty?: number;
}

export interface Action {
  type: ActionType;
  characterId: string;
  targetId?: string;
  targetPosition?: { x: number; y: number };
}

export interface TurnAction {
  characterId: string;
  actions: Action[];
}

export interface Turn {
  turnNumber: number;
  actions: TurnAction[];
  log: BattleLogEntry[];
}

// Trait modifier info for display
export interface TraitModifierInfo {
  traitId: string;
  traitName: string;
  damageMultiplier: number;
  applicable: boolean;
  reason?: string;
}

// Damage breakdown for attacks
export interface DamageBreakdown {
  lowerBound: number;
  upperBound: number;
  average: number;
  perHitAverage: number;
  hits: number;
  // Stats used in calculation
  baseDamage: number;
  critChance: number;
  critDamage: number;
  targetArmor: number;
  pierceRatio: number;
  // Trait modifiers
  traitModifiers?: TraitModifierInfo[];
  traitMultiplier?: number;
}

// Follow-up attack log entry (from passives like LegacyOfCombat, TheBetrayer)
export interface FollowUpAttackLog {
  abilityName: string;
  damage: number;
  lowerBound: number;
  upperBound: number;
  hits: number;
  damageType: string;
}

export interface BattleLogEntry {
  timestamp: number;
  characterId: string;
  characterName: string;
  action: ActionType;
  target?: string;
  damage?: number;
  damageBreakdown?: DamageBreakdown;
  healing?: number;
  message: string;
  followUpAttacks?: FollowUpAttackLog[];  // Follow-up attacks from passives
}

export interface BattleState {
  turn: number;
  maxTurns: number;
  team: BattleCharacter[];
  boss?: BattleCharacter;
  turnHistory: Turn[];
  totalDamageDealt: number;
  // Track total damage bounds
  totalDamageBounds: DamageTotals;
  isComplete: boolean;
  // LegendaryCommander (Trajann) aura buff tracking
  // True after any ability is used, consumed by first attack after
  legendaryCommanderBuffAvailable: boolean;
  // If true, crit chance is treated as 0% for all damage calculations
  ignoreCrit: boolean;
}

export interface BattleSimulationConfig {
  characters: Character[];
  maxTurns: number;
}
