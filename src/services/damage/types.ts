import type { DamageType } from '../../types';

/**
 * Pierce ratios by damage type
 * These determine the minimum percentage of damage that bypasses armor
 * Based on Tacticus game mechanics
 */
export const PIERCE_RATIOS: Record<DamageType, number> = {
  // Melee physical damage
  Physical: 0.25,    // 25% pierce
  Chain: 0.25,       // 25% pierce (chainswords, etc.)
  Piercing: 0.50,    // 50% pierce
  Power: 0.50,       // 50% pierce (power weapons)
  Eviscerate: 0.50,  // 50% pierce (eviscerator weapons)

  // Ranged ballistic
  Bolter: 0.25,      // 25% pierce
  HeavyRound: 0.25,  // 25% pierce (heavy bolters, autocannons)
  Projectile: 0.25,  // 25% pierce (sluggas, etc.)
  Las: 0.25,         // 25% pierce (lasguns)

  // Ranged energy
  Plasma: 0.50,      // 50% pierce
  Melta: 0.75,       // 75% pierce (anti-armor)
  Flame: 0.50,       // 50% pierce
  Energy: 0.50,      // 50% pierce
  Blast: 0.25,       // 25% pierce (explosive)

  // Psychic
  Psychic: 0.75,     // 75% pierce

  // Xenos
  Bio: 0.50,         // 50% pierce (Tyranid bio weapons)
  Toxic: 0.50,       // 50% pierce
  Gauss: 0.75,       // 75% pierce (Necron)
  Particle: 0.50,    // 50% pierce (Necron)
  Pulse: 0.50,       // 50% pierce (Tau)
};

// Damage variance removed - using single average value only

/**
 * Trait modifier result from trait evaluation
 */
export interface TraitModifier {
  traitId: string;
  traitName: string;
  damageMultiplier: number;  // 1.5 = +50%, 0.5 = -50%
  applicable: boolean;
  reason?: string;  // Why it was/wasn't applied
}

/**
 * Attacker stats needed for damage calculation
 */
/**
 * Individual buff source for tracking in damage breakdown
 */
export interface BuffSource {
  name: string;           // e.g., "Lord of the Host"
  sourceName?: string;    // e.g., "Dante"
  damageBonus?: number;   // Flat damage bonus (pre-armor)
  damageMultiplier?: number; // Damage multiplier (e.g., 1.97 for +97%)
  globalDamageBonus?: number; // Flat damage bonus (post-armor, per hit)
  extraHits?: number;     // Extra hits bonus
  critChanceBonus?: number;  // Crit chance bonus
  critDamageBonus?: number;  // Crit damage bonus
  armorIgnored?: number;  // Armor reduction before damage calculation
}

/**
 * Ability stat modifiers from passive abilities
 */
export interface AbilityModifiers {
  baseDamageBonus?: number;        // Flat damage added (pre-armor)
  baseDamageMultiplier?: number;   // 1.25 = +25% (post-armor global multiplier)
  globalDamageBonus?: number;      // Flat damage added (post-armor, per hit)
  extraHits?: number;              // Additional hits
  critChanceBonus?: number;        // +% crit chance
  critDamageBonus?: number;        // Flat crit damage bonus
  armorIgnored?: number;           // Reduces target armor before damage calculation
  buffSources?: BuffSource[];      // Sources of the buffs for display
}

export interface AttackerStats {
  baseDamage: number;
  damageType: DamageType;
  hits: number;
  critChance: number;       // 0-100 (percentage)
  critDamage: number;       // Flat bonus damage on crit
  critChanceBonus?: number; // Additional crit chance from equipment (percentage)
  critDmgBonus?: number;    // Additional crit damage from equipment
  ignoreCrit?: boolean;     // If true, crit bonus is not added to DamVarMod (crit stats still shown)
  traits?: string[];        // Character trait IDs
  hasMoved?: boolean;       // Whether character has moved this turn
  attackType?: 'melee' | 'ranged'; // Type of attack being performed
  // Battle state for trait calculations
  hasAttackedThisBattle?: boolean;  // For RapidAssault first attack check
  attacksThisTurn?: number;         // For RapidAssault same-turn attacks
  firstAttackTurn?: number | null;  // Turn when character first attacked (for RapidAssault)
  currentTurn?: number;             // Current battle turn (for RapidAssault)
  // Ability modifiers from passive abilities
  abilityModifiers?: AbilityModifiers;
  // User-controlled toggles for trait conditions (e.g., CrushingStrike "has not moved")
  abilityToggles?: Record<string, boolean>;
  // Fighting Retreat override for RangedSpecialist trait
  fightingRetreatActive?: boolean;
  // Crit chain offset for additional attacks
  // If this attack shares a crit chain with a source attack (e.g., Cyclic Ion Blaster),
  // set this to the number of hits in the preceding attack(s).
  // E.g., if source attack had 4 hits, set critChainOffset = 4 for the additional attack.
  critChainOffset?: number;
}

/**
 * Defender stats needed for damage calculation
 */
export interface DefenderStats {
  armor: number;
  maxHealth: number;
  traits?: string[];  // Target traits (e.g., BigTarget, Vehicle)
}

/**
 * Result of a single hit calculation
 */
export interface HitResult {
  rawDamage: number;         // Damage before armor
  afterArmor: number;        // Damage after armor reduction
  pierceFloor: number;       // Minimum damage from pierce ratio
  finalDamage: number;       // MAX(afterArmor, pierceFloor)
  isCrit: boolean;
  isBlocked: boolean;
}

/**
 * Complete damage calculation result
 */
export interface DamageResult {
  // Single damage value (no more bounds)
  damage: number;              // Total calculated damage
  perHitDamage: number;        // Damage per hit
  totalHits: number;           // Number of hits

  // Calculation breakdown for Battle Log display
  baseDamage: number;           // Character's damage stat or ability avg
  flatModifiers: number;        // Sum of baseDamageBonus from buffs
  flatModifierSources: BuffSource[]; // Sources with individual values
  extraHits: number;            // Extra hits from abilities
  extraHitsSources: BuffSource[];   // Sources of extra hits with values
  critChanceSources: BuffSource[];  // Sources of crit chance bonuses with values
  critDamageSources: BuffSource[];  // Sources of crit damage bonuses with values

  // Non-crit path (d0)
  damVarMod0: number;           // baseDamage + flatModifiers (no crit)
  afterArmor0: number;          // damVarMod0 - armor
  pierceFloor0: number;         // damVarMod0 * pierceRatio
  d0: number;                   // MAX(afterArmor0, pierceFloor0) - non-crit hit damage

  // Crit path (d1)
  damVarMod1: number;           // baseDamage + flatModifiers + critDamage
  afterArmor1: number;          // damVarMod1 - armor
  pierceFloor1: number;         // damVarMod1 * pierceRatio
  d1: number;                   // MAX(afterArmor1, pierceFloor1) - crit hit damage

  // Expected crits
  expectedCrits: number;        // Expected number of crit hits from streak formula
  expectedCritsStartIndex: number; // Starting hit index for crit chain (1 for normal, >1 for additional attacks)

  // Legacy fields (for backwards compatibility in Battle Log)
  critBonus: number;            // @deprecated - kept for backwards compatibility
  damVarMod: number;            // @deprecated - alias for damVarMod0
  afterArmor: number;           // @deprecated - alias for afterArmor0
  pierceFloor: number;          // @deprecated - alias for pierceFloor0
  afterArmorPierce: number;     // @deprecated - now shows weighted average
  globalMultiplier: number;     // Combined trait + ability multipliers
  globalMultiplierSources: BuffSource[]; // Sources with multiplier values
  globalDamageBonus: number;    // Flat damage bonus applied after armor/pierce (per hit)
  globalDamageBonusSources: BuffSource[]; // Sources with globalDamageBonus values
  armorIgnored: number;         // Amount of armor ignored
  armorIgnoredSources: BuffSource[]; // Sources with armorIgnored values
  effectiveArmor: number;       // Actual armor used in calculation (armor - armorIgnored)

  // Stats used in calculation (for logging)
  attackerStats: AttackerStats;
  defenderStats: DefenderStats;

  // Calculation details - crit breakdown
  baseCritChance: number;       // Base crit chance from equipment (0-100)
  baseCritDamage: number;       // Base crit damage from equipment
  critChanceTotalBonus: number; // Total crit chance bonus (equipment + abilities)
  critDamageTotalBonus: number; // Total crit damage bonus (equipment + abilities)
  effectiveCritChance: number;  // Total crit chance (base + bonus, 0-1)
  effectiveCritDamage: number;  // Total crit damage (base + bonus)
  pierceRatio: number;          // Pierce ratio for damage type

  // Trait modifiers applied
  traitModifiers: TraitModifier[];
  traitMultiplier: number;      // Combined multiplier from all traits
}

/**
 * Calculation log entry for debugging
 */
export interface CalculationLog {
  step: string;
  description: string;
  value: number | string;
}
