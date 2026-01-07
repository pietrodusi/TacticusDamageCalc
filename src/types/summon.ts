import type { DamageType } from './index';

/**
 * Summon unit data from summons.json
 */
export interface SummonUnitData {
  name: string;
  FactionId: string;
  GrandAllianceId?: string;
  Movement?: number;
  weapons: SummonWeapon[];
  traits: string[];
  activeAbilities?: string[];
}

/**
 * Summon weapon definition
 */
export interface SummonWeapon {
  hits: number;
  DamageProfile: DamageType;
  Range?: number;  // If present, this is a ranged weapon
}

/**
 * Active summon in battle
 */
export interface BattleSummon {
  id: string;                    // Unique instance ID
  unitId: string;                // Unit type from summons.json (e.g., 'orksOrkBoys')
  name: string;                  // Display name (e.g., 'Ork Boyz')
  sourceCharacterId: string;     // Who summoned this unit
  sourceAbilityId: string;       // Which ability created it

  // Stats (from ability variables)
  hp: number;
  damage: number;
  armor: number;

  // Weapon data (from summons.json)
  meleeHits: number;
  meleeDamageType: DamageType;
  rangedHits?: number;
  rangedDamageType?: DamageType;
  rangedRange?: number;

  // State
  count: number;                 // Number of summons (user can modify, for display only)
  createdAtTurn: number;

  // Image
  iconUrl?: string;

  // Abilities
  activeAbilities?: string[];

  // Tracking
  totalDamageDealt: number;

  // Buff condition toggles (like character abilityToggles)
  abilityToggles?: Record<string, boolean>;
}

/**
 * Summon result from an ability execution
 */
export interface SummonResult {
  unitId: string;
  hp: number;
  damage: number;
  armor: number;
  count: number;
}
