export type BossRank = 13 | 14 | 15 | 16 | 17 | 18;

export interface BossRankInfo {
  rank: BossRank;
  name: string;
  rarity: 'Legendary' | 'Mythic';
}

export const BOSS_RANKS: BossRankInfo[] = [
  { rank: 13, name: 'Legendary 1', rarity: 'Legendary' },
  { rank: 14, name: 'Legendary 2', rarity: 'Legendary' },
  { rank: 15, name: 'Legendary 3', rarity: 'Legendary' },
  { rank: 16, name: 'Legendary 4', rarity: 'Legendary' },
  { rank: 17, name: 'Legendary 5', rarity: 'Legendary' },
  { rank: 18, name: 'Mythic 1', rarity: 'Mythic' },
];

// Raw boss stats from guildBossUnits.json
export interface RawBossStats {
  Health: number;
  Damage: number;
  FixedArmor: number;
  Rank: number;
  StarLevel: number;
  BaseRarity: string;
  ProgressionIndex: number;
  AbilityLevel: number;
}

// Raw boss data from guildBossUnits.json
export interface RawBossData {
  FactionId?: string;  // Optional - some entries are loot objects without faction
  Movement?: number;   // Optional - some entries don't have movement
  stats: RawBossStats[];
  activeAbilities?: string[];
  passiveAbilities?: string[];
}

export interface RawBossesData {
  [bossId: string]: RawBossData;
}

// Boss image data from guildBossImg.json
export interface BossImageData {
  img: string;
}

export interface BossImagesData {
  [bossId: string]: BossImageData;
}

// Processed boss for selection/display
export interface Boss {
  id: string;
  name: string;
  faction: string;
  movement: number;
  activeAbilities: string[];
  passiveAbilities: string[];
  traits: string[];
  iconUrl?: string;
  // Stats at selected rank
  health: number;
  damage: number;
  armor: number;
  rank: BossRank;
  abilityLevel: number;
  // Whether minion-killed modifiers were applied to this boss
  applyModifiers?: boolean;
}

// Boss traits data from guildBossTraits.json
export interface BossTraitsData {
  [bossId: string]: {
    traits: string[];
  };
}

// Boss selection state
export interface SelectedBoss {
  bossId: string;
  rank: BossRank;
  applyModifiers: boolean; // Whether to apply minion-killed modifiers
}

// Boss modifier types from guildBossMods.json
export interface RawBossModsEntry {
  unitIds: string[];
  modifiers: string[][][]; // [track][stage] = modifier IDs
}

export interface RawBossModsData {
  [bossKey: string]: RawBossModsEntry;
}

// Boss modifier detail types from guildBossModDetails.json
export type BossModType =
  | 'bossStatDecrease'
  | 'bossStatPctDecrease'
  | 'bossAbilityAllStatsPctDecrease'
  | 'bossAbilityConstantDecrease'
  | 'bossAbilityConstantIncrease'
  | 'bossAbilityVariableDecrease'
  | 'bossAbilityVariableIncrease'
  | 'bossAbilityVariablePctDecrease'
  | 'unitStatPctDecrease'
  | 'unitAmountDecrease';

export interface RawBossModDetail {
  type: BossModType;
  target: string;
  amount: number;
  locale?: string;
  subtarget?: string;
}

export interface RawBossModDetailsData {
  [modId: string]: RawBossModDetail;
}

// Aggregated stat modifiers for a boss
export interface BossStatModifiers {
  armorPctReduction: number;    // Total % to reduce armor
  damagePctReduction: number;   // Total % to reduce damage
  blockChanceReduction: number; // Flat reduction to block chance
}
