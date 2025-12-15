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

/**
 * Damage variance constants
 * Base damage varies by ±20% before armor calculations
 */
export const DAMAGE_VARIANCE = {
  MIN_MULTIPLIER: 0.8,  // -20%
  MAX_MULTIPLIER: 1.2,  // +20%
  AVG_MULTIPLIER: 1.0,  // Average (no variance)
};

/**
 * Attacker stats needed for damage calculation
 */
export interface AttackerStats {
  baseDamage: number;
  damageType: DamageType;
  hits: number;
  critChance: number;       // 0-100 (percentage)
  critDamage: number;       // Flat bonus damage on crit
  critChanceBonus?: number; // Additional crit chance from equipment (percentage)
  critDmgBonus?: number;    // Additional crit damage from equipment
}

/**
 * Defender stats needed for damage calculation
 */
export interface DefenderStats {
  armor: number;
  blockChance: number;       // 0-100 (percentage)
  blockDamage: number;       // Damage reduction when blocking
  blockChanceBonus?: number; // Additional block chance from equipment
  blockDmgBonus?: number;    // Additional block damage from equipment
  maxHealth: number;
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
  // Bounds
  lowerBound: number;        // Minimum possible damage (no crits, min variance, all blocks)
  upperBound: number;        // Maximum possible damage (all crits, max variance, no blocks)
  average: number;           // Expected average damage

  // Detailed breakdown for average calculation
  perHitAverage: number;     // Average damage per hit
  totalHits: number;         // Number of hits

  // Stats used in calculation (for logging)
  attackerStats: AttackerStats;
  defenderStats: DefenderStats;

  // Calculation details
  effectiveCritChance: number;  // Total crit chance (base + bonus)
  effectiveCritDamage: number;  // Total crit damage (base + bonus)
  effectiveBlockChance: number; // Total block chance
  pierceRatio: number;          // Pierce ratio for damage type
}

/**
 * Calculation log entry for debugging
 */
export interface CalculationLog {
  step: string;
  description: string;
  value: number | string;
}
