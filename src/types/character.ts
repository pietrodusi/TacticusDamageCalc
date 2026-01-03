export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary' | 'Mythic';
export type Alliance = 'Imperial' | 'Chaos' | 'Xenos';
export type DamageType =
  | 'Physical'
  | 'Chain'
  | 'Piercing'
  | 'Power'
  | 'Eviscerate'
  | 'Bolter'
  | 'HeavyRound'
  | 'Projectile'
  | 'Las'
  | 'Plasma'
  | 'Melta'
  | 'Flame'
  | 'Energy'
  | 'Blast'
  | 'Psychic'
  | 'DirectDamage'
  | 'Bio'
  | 'Toxic'
  | 'Gauss'
  | 'Particle'
  | 'Pulse';
export type ItemSlotType = 'I_Crit' | 'I_Booster_Crit' | 'I_Defensive' | 'I_Block' | 'I_Booster_Block';

// Item stats from items.json
export interface ItemStats {
  critChance?: number;
  critDmg?: number;
  critChanceBonus?: number;
  critDmgBonus?: number;
  hp?: number;
  fixedArmor?: number;
  blockChance?: number;
  blockDmg?: number;
  blockChanceBonus?: number;
  blockDmgBonus?: number;
}

export interface ItemLevel {
  stats: ItemStats;
  dustCost?: number;
  goldCost?: number;
}

export interface Item {
  name: string;
  itemType: ItemSlotType;
  nextInSeries?: string;
  rarity: Rarity;
  levels: ItemLevel[];
  allowedFactions?: string[];
  allowedUnits?: string[];
}

export interface ItemsData {
  [itemId: string]: Item;
}

// Equipped item with selected level
export interface EquippedItem {
  itemId: string;
  level: number; // 0-indexed level within the item's levels array
}

// Raw character data from characters.json
export interface RawCharacterWeapon {
  hits: number;
  DamageProfile: string;
  Range?: number;
}

export interface RawCharacterStats {
  Health: number;
  Damage: number;
  FixedArmor: number;
  ProgressionIndex: number;
}

export interface RawCharacter {
  name: string;
  FactionId: string;
  GrandAllianceId: string;
  BaseRarity: string;
  Movement?: number;
  weapons?: RawCharacterWeapon[];
  stats: RawCharacterStats;
  traits: string[];
  activeAbilities?: string[];
  passiveAbilities?: string[];
  upgradesStatIncrease?: number[][] | null;
  releaseStatus?: string;
  itemSlots?: string[];
}

export interface RawCharactersData {
  [key: string]: RawCharacter;
}

// Character info from charactersInfo.json
export interface CharacterInfo {
  img?: string;
}

export interface CharactersInfoData {
  [key: string]: CharacterInfo;
}

// Progression data from progression.json
export interface ProgressionStep {
  stars: number;
  rarity: string;
  maxXpLevel: number;
  maxRank: number;
  unitStatMultiplierPct: number;
  abilityStatMultiplierPct: number;
  abilityPowerMultiplier: number;
}

export interface ProgressionData {
  heroProgressionSteps: ProgressionStep[];
}

// Computed character for display
export interface Character {
  id: string;
  name: string;
  faction: string;
  alliance: Alliance;
  baseRarity: Rarity;

  // Base stats (before any modifiers)
  baseHealth: number;
  baseDamage: number;
  baseArmour: number;
  movement: number;

  // Attack info
  meleeHits: number;
  meleeDamageType: DamageType;
  rangedHits?: number;
  rangedDamageType?: DamageType;
  rangedDistance?: number;

  // Abilities
  traits: string[];
  activeAbilities: string[];
  passiveAbilities: string[];

  // Upgrade stat increases per rank (array of 6 values per rank)
  // [health1, health2, damage1, damage2, armour1, armour2]
  upgradesStatIncrease: number[][];

  // Equipment slots
  itemSlots: ItemSlotType[];

  // Assets
  iconUrl?: string;
}

export interface CharacterListItem {
  id: string;
  name: string;
  faction: string;
  alliance: Alliance;
  baseRarity: Rarity;
  iconUrl?: string;
  isReleased: boolean;
}

// Calculated stats at a specific rarity and rank
export interface CalculatedStats {
  health: number;
  damage: number;
  armour: number;
}

// Team member with selected progression, rank, ability levels, and equipment
export interface TeamMember extends Character {
  progressionStepIndex: number;
  rank: number;
  // Map of abilityId -> level index (0-64, default 54 = level 55)
  abilityLevels?: Record<string, number>;
  // Map of slot index -> equipped item (slotIndex matches itemSlots array)
  equipment?: Record<number, EquippedItem>;
}

// Ability data from abilitiesData.json
export interface AbilityDisplayData {
  name: string;
  description: string;
}

export interface AbilitiesDisplayData {
  [abilityId: string]: AbilityDisplayData;
}

// Ability stats from abilities.json
export interface AbilityStats {
  attackRangeType?: 'Melee' | 'Ranged';
  upgrades: unknown;
  variables: Record<string, number[]>;
  constants?: Record<string, string>;
  variablesAffectedByRarityBonus?: string[];
}

export interface AbilitiesStatsData {
  [abilityId: string]: AbilityStats;
}

// Resolved ability with name, description (variables replaced), and type
export interface ResolvedAbility {
  id: string;
  name: string;
  description: string;
  type: 'active' | 'passive';
}
