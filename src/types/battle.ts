import type { Character, TeamMember } from './character';
import type { Boss } from './boss';
import type { AbilityCooldownState, AbilityStatModifier } from '../services/abilities/types';
import type { PooledBuff } from './buff';
import type { BuffSource } from '../services/damage/types';

export type ActionType = 'move' | 'attack' | 'meleeAttack' | 'rangedAttack' | 'ability' | 'wait' | 'repair';

// Pending repair action state for Actus's Mechanic trait and DefendTheDivineWork ability
export interface PendingRepairAction {
  repairerId: string;                    // Actus's character ID
  repairType: 'mechanic' | 'ddw';        // Single repair vs multi-select (Defend the Divine Work)
  selectedTargets?: string[];            // Character IDs selected for repair
  attackTypeChoices?: Record<string, 'melee' | 'ranged'>;  // Attack type choice per target
  pendingAttackChoices?: string[];       // Target IDs still needing attack type choice
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
  // Track total damage dealt by this character
  totalDamageDealt: number;
  // Track attacks for trait bonuses
  hasAttackedThisBattle: boolean;  // For RapidAssault first attack check
  attacksThisTurn: number;         // For RapidAssault same-turn attacks
  firstAttackTurn: number | null;  // Turn number when character first attacked (for RapidAssault)
  attackTurnsCount: number;        // Number of turns character has attacked (for LegacyOfCombat)
  totalAttacksThisBattle: number;  // Total attacks performed (for FirstAmongTraitors scaling)
  hasUsedAbilityThisTurn: boolean; // Track if active ability used this turn
  // Legendary Commander tracking
  hasQualifiedForLCDamage: boolean;  // LC damage: adjacent to boss + ability "used" (immediately for buffs, after first special for special attacks)
  pendingLCQualification: boolean;   // For special attack abilities: waiting for first special attack to complete
  hasUsedFirstSpecialAttackThisTurn: boolean;  // Per-character: for LC +2 hits (only first special attack gets bonus)
  // Ability state
  abilityCooldowns: Record<string, AbilityCooldownState>;  // Track ability cooldowns
  abilityToggles: Record<string, boolean>;  // User-controlled toggles for conditional passives
  activeBuffs: AbilityStatModifier[];  // Active ability buffs (from abilities like WarHowl)
  // Laviscus's Refusal to be Outdone passive tracking
  outrage?: number;  // Accumulated outrage value from ally attacks
  outrageContributors?: string[];  // Character IDs of Chaos chars that contributed this turn
  // Abaddon's Drachnyen ability tracking
  drachnyenActive?: boolean;  // When true, adds follow-up attack after normal melee
  drachnyenMinDmg?: number;   // Cached damage values for Drachnyen follow-up
  drachnyenMaxDmg?: number;
  drachnyenHits?: number;
  // Darkstrider's Fighting Retreat ability tracking
  fightingRetreatActive?: boolean;  // When true, RangedSpecialist applies regardless of adjacency toggle
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

// Damage breakdown for attacks - includes all calculation steps for display
export interface DamageBreakdown {
  // Final values
  damage: number;
  perHitDamage: number;
  hits: number;

  // Calculation steps (for Battle Log display)
  baseDamage: number;           // Character's damage stat or ability avg
  flatModifiers: number;        // Sum of baseDamageBonus from buffs
  flatModifierSources: BuffSource[]; // Sources with individual values (e.g., {name: "War Howl", damageBonus: 50})
  critBonus: number;            // Expected crit from streak formula
  critChanceSources: BuffSource[];  // Sources of crit chance bonuses with values
  critDamageSources: BuffSource[];  // Sources of crit damage bonuses with values
  extraHits: number;            // Extra hits from abilities
  extraHitsSources: BuffSource[];   // Sources of extra hits with values
  damVarMod: number;            // baseDamage + flatModifiers + critBonus
  targetArmor: number;
  armorIgnored?: number;        // Amount of armor ignored by buffs
  armorIgnoredSources?: BuffSource[]; // Sources of armor ignored with values
  effectiveArmor?: number;      // Actual armor used in calculation (targetArmor - armorIgnored)
  afterArmor: number;           // damVarMod - armor
  pierceRatio: number;
  pierceRatioBonus?: number;    // Pierce ratio bonus percentage (e.g., 10 for +10%)
  pierceRatioBonusSources?: BuffSource[]; // Sources of pierce ratio bonus with values
  effectivePierceRatio?: number; // Total pierce ratio (base + bonus)
  pierceFloor: number;          // damVarMod * effectivePierceRatio
  afterArmorPierce: number;     // MAX(afterArmor, pierceFloor)
  globalMultiplier: number;     // Combined trait + ability multipliers
  globalMultiplierSources: BuffSource[]; // e.g., [{name: "RapidAssault", damageMultiplier: 1.25}]
  globalDamageBonus?: number;   // Flat damage bonus (post-armor, per hit)
  globalDamageBonusSources?: BuffSource[]; // e.g., [{name: "Lord of the Host", globalDamageBonus: 100}]

  // Crit info - base values and bonuses for breakdown display
  baseCritChance: number;      // Base crit chance from equipment
  baseCritDamage: number;      // Base crit damage from equipment
  critChanceBonus: number;     // Total crit chance bonus (equipment + abilities)
  critDmgBonus: number;        // Total crit damage bonus (equipment + abilities)
  critChance: number;          // Effective crit chance (base + bonus, 0-1)
  critDamage: number;          // Effective crit damage

  // Trait modifiers
  traitModifiers?: TraitModifierInfo[];
  traitMultiplier?: number;
}

// Follow-up attack log entry (from passives like LegacyOfCombat, TheBetrayer)
export interface FollowUpAttackLog {
  abilityName: string;
  damage: number;
  hits: number;
  damageType: string;
  attackType?: 'melee' | 'ranged';  // Attack type for display
  // Full breakdown for consistent display with main attack
  breakdown?: DamageBreakdown;
  // Applied buffs for display
  appliedBuffs?: AppliedBuffInfo[];
}

// Applied buff info for display in battle log
export interface AppliedBuffInfo {
  name: string;
  sourceName?: string;
  effect?: string; // e.g., "+15% Crit", "+50 Dmg"
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
  appliedBuffs?: AppliedBuffInfo[];  // Buffs that were applied during this action
  attackType?: 'melee' | 'ranged';  // Attack type for display in battle log
}

export interface BattleState {
  turn: number;
  maxTurns: number;
  team: BattleCharacter[];
  boss?: Boss;
  turnHistory: Turn[];
  totalDamageDealt: number;
  isComplete: boolean;
  // If true, crit chance is treated as 0% for all damage calculations
  ignoreCrit: boolean;
  // Buff pool - all active buffs in battle
  buffPool: PooledBuff[];
  // Cumulative boss armor reduction from abilities (e.g., ChampionOfTheFeast)
  bossArmorReduction: number;
  // Pending repair action for Actus's Mechanic/DDW abilities
  pendingRepairAction?: PendingRepairAction;
  // Boss debuffs - Markerlight gives T'au Empire +15% ranged damage
  bossHasMarkerlight: boolean;
}

export interface BattleSimulationConfig {
  characters: Character[];
  maxTurns: number;
}
