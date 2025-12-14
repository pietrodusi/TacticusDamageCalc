export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary' | 'Mythic';
export type Alliance = 'Imperial' | 'Chaos' | 'Xenos';
export type DamageType = 'Physical' | 'Piercing' | 'Power' | 'Bolter' | 'Psychic' | 'Melta' | 'Flame';

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

// Team member with selected progression and rank
export interface TeamMember extends Character {
  progressionStepIndex: number;
  rank: number;
}
