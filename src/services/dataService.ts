import type {
  Character,
  CharacterListItem,
  RawCharactersData,
  CharactersInfoData,
  ProgressionData,
  ProgressionStep,
  CalculatedStats,
  Rarity,
  Alliance,
  DamageType,
} from '../types';

// Import static JSON data
import rawCharactersData from '../assets/data/characters.json';
import charactersInfoData from '../assets/data/charactersInfo.json';
import progressionData from '../assets/data/progression.json';

// Import all portrait images using Vite's glob import
const portraitImages = import.meta.glob<{ default: string }>(
  '../assets/images/portraits/*.webp',
  { eager: true }
);

// Import rank images
const rankImages = import.meta.glob<{ default: string }>(
  '../assets/images/ranks/*.png',
  { eager: true }
);

// Import rarity images
const rarityImages = import.meta.glob<{ default: string }>(
  '../assets/images/rarity/*.png',
  { eager: true }
);

// Import damage type images
const damageImages = import.meta.glob<{ default: string }>(
  '../assets/images/damage/*.webp',
  { eager: true }
);

// Import faction images
const factionImages = import.meta.glob<{ default: string }>(
  '../assets/images/factions/*.png',
  { eager: true }
);

// Create a map of filename to resolved URL
const portraitMap: Record<string, string> = {};
for (const path in portraitImages) {
  const filename = path.split('/').pop() || '';
  portraitMap[filename] = portraitImages[path].default;
}

// Create rank image map (e.g., 'stone1' -> url)
const rankImageMap: Record<string, string> = {};
for (const path in rankImages) {
  const filename = path.split('/').pop()?.replace('.png', '') || '';
  rankImageMap[filename] = rankImages[path].default;
}

// Create rarity image map (e.g., 'common' -> url)
const rarityImageMap: Record<string, string> = {};
for (const path in rarityImages) {
  const filename = path.split('/').pop()?.replace('.png', '') || '';
  rarityImageMap[filename] = rarityImages[path].default;
}

// Create damage type image map (e.g., 'physical' -> url)
const damageImageMap: Record<string, string> = {};
for (const path in damageImages) {
  const filename = path.split('/').pop()?.replace('.webp', '') || '';
  damageImageMap[filename] = damageImages[path].default;
}

// Create faction image map (e.g., 'Ultramarines' -> url)
const factionImageMap: Record<string, string> = {};
for (const path in factionImages) {
  const filename = path.split('/').pop()?.replace('.png', '') || '';
  factionImageMap[filename] = factionImages[path].default;
}

// Type assertions for imported JSON
const characters = rawCharactersData as RawCharactersData;
const charactersInfo = charactersInfoData as CharactersInfoData;
const progression = progressionData as ProgressionData;

// Helper to resolve portrait URL from charactersInfo img path
function resolvePortraitUrl(imgPath: string | undefined): string | undefined {
  if (!imgPath) return undefined;
  // Extract filename from path (e.g., '/portraits/VarroTigurius.webp' -> 'VarroTigurius.webp')
  const filename = imgPath.split('/').pop() || '';
  return portraitMap[filename];
}

// Map GrandAllianceId to Alliance type
function mapAlliance(grandAllianceId: string): Alliance {
  const allianceMap: Record<string, Alliance> = {
    'Imperial': 'Imperial',
    'Chaos': 'Chaos',
    'Xenos': 'Xenos',
  };
  return allianceMap[grandAllianceId] || 'Imperial';
}

// Map DamageProfile to DamageType
function mapDamageType(damageProfile: string): DamageType {
  const typeMap: Record<string, DamageType> = {
    'Physical': 'Physical',
    'Piercing': 'Piercing',
    'Power': 'Power',
    'Bolter': 'Bolter',
    'Psychic': 'Psychic',
    'Melta': 'Melta',
    'Flame': 'Flame',
  };
  return typeMap[damageProfile] || 'Physical';
}

// Map BaseRarity string to Rarity type
function mapRarity(baseRarity: string): Rarity {
  const rarityMap: Record<string, Rarity> = {
    'Common': 'Common',
    'Uncommon': 'Uncommon',
    'Rare': 'Rare',
    'Epic': 'Epic',
    'Legendary': 'Legendary',
    'Mythic': 'Mythic',
  };
  return rarityMap[baseRarity] || 'Common';
}

// Convert raw character to display character
function rawToCharacter(id: string, raw: RawCharactersData[string]): Character {
  const info = charactersInfo[id];

  // Get melee weapon (first weapon without range)
  const weapons = raw.weapons || [];
  const meleeWeapon = weapons.find(w => !w.Range) || weapons[0];
  // Get ranged weapon (weapon with range)
  const rangedWeapon = weapons.find(w => w.Range);

  return {
    id,
    name: raw.name,
    faction: raw.FactionId,
    alliance: mapAlliance(raw.GrandAllianceId),
    baseRarity: mapRarity(raw.BaseRarity),

    baseHealth: raw.stats.Health,
    baseDamage: raw.stats.Damage,
    baseArmour: raw.stats.FixedArmor,
    movement: raw.Movement || 0,

    meleeHits: meleeWeapon?.hits || 1,
    meleeDamageType: mapDamageType(meleeWeapon?.DamageProfile || 'Physical'),
    rangedHits: rangedWeapon?.hits,
    rangedDamageType: rangedWeapon ? mapDamageType(rangedWeapon.DamageProfile) : undefined,
    rangedDistance: rangedWeapon?.Range,

    traits: raw.traits || [],
    activeAbilities: raw.activeAbilities || [],
    passiveAbilities: raw.passiveAbilities || [],

    upgradesStatIncrease: raw.upgradesStatIncrease || [],

    iconUrl: resolvePortraitUrl(info?.img),
  };
}

// Get all characters as a list (only Hero trait characters)
export function getCharacterList(): CharacterListItem[] {
  return Object.entries(characters)
    .filter(([, raw]) => raw.traits && raw.traits.includes('Hero'))
    .map(([id, raw]) => {
      const info = charactersInfo[id];
      return {
        id,
        name: raw.name,
        faction: raw.FactionId,
        alliance: mapAlliance(raw.GrandAllianceId),
        baseRarity: mapRarity(raw.BaseRarity),
        iconUrl: resolvePortraitUrl(info?.img),
        isReleased: raw.releaseStatus === 'released',
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Get a single character by ID
export function getCharacter(id: string): Character | null {
  const raw = characters[id];
  if (!raw) return null;
  return rawToCharacter(id, raw);
}

// Get a character by name (case-insensitive search)
export function getCharacterByName(name: string): Character | null {
  const entry = Object.entries(characters).find(
    ([, raw]) => raw.name.toLowerCase() === name.toLowerCase()
  );
  if (!entry) return null;
  return rawToCharacter(entry[0], entry[1]);
}

// Get progression steps
export function getProgressionSteps(): ProgressionStep[] {
  return progression.heroProgressionSteps;
}

// Get progression step by index
export function getProgressionStep(index: number): ProgressionStep | null {
  return progression.heroProgressionSteps[index] || null;
}

// Get all progression steps
export function getAllProgressionSteps(): ProgressionStep[] {
  return progression.heroProgressionSteps;
}

// Get display name for a progression step
export function getProgressionStepDisplayName(step: ProgressionStep): string {
  return `${step.rarity} ${step.stars}★`;
}

// Find progression step index by rarity and stars
export function findProgressionStepIndex(rarity: Rarity, stars: number): number {
  return progression.heroProgressionSteps.findIndex(
    step => step.rarity === rarity && step.stars === stars
  );
}

// Calculate stats for a character at a specific progression step and rank
export function calculateStats(
  character: Character,
  progressionStepIndex: number,
  rank: number // 0-indexed rank
): CalculatedStats {
  // Get the progression step
  const progressionStep = getProgressionStep(progressionStepIndex);
  const multiplierPct = progressionStep?.unitStatMultiplierPct || 100;

  // Start with base stats
  let health = character.baseHealth;
  let damage = character.baseDamage;
  let armour = character.baseArmour;

  // Add upgrade stat increases for completed ranks (0 to rank-1)
  // upgradesStatIncrease[r] contains bonuses gained when upgrading FROM rank r TO rank r+1
  // So at rank 0 (Stone I), no bonuses; at rank 1 (Stone II), add upgradesStatIncrease[0], etc.
  for (let r = 0; r < rank && r < character.upgradesStatIncrease.length; r++) {
    const rankStats = character.upgradesStatIncrease[r];
    if (rankStats && rankStats.length >= 6) {
      health += rankStats[0] + rankStats[1];
      damage += rankStats[2] + rankStats[3];
      armour += rankStats[4] + rankStats[5];
    }
  }

  // Apply rarity multiplier to total (base + rank bonuses)
  health = Math.floor(health * multiplierPct / 100);
  damage = Math.floor(damage * multiplierPct / 100);
  armour = Math.floor(armour * multiplierPct / 100);

  return { health, damage, armour };
}

// Get max rank for a progression step
export function getMaxRankForStep(progressionStepIndex: number): number {
  const step = getProgressionStep(progressionStepIndex);
  return step?.maxRank || 0;
}

// Get rank display name (Stone I, Iron II, etc.)
export function getRankDisplayName(rankIndex: number): string {
  const tiers = ['Stone', 'Iron', 'Bronze', 'Silver', 'Gold', 'Diamond', 'Adamantine'];
  const numerals = ['I', 'II', 'III'];

  const tierIndex = Math.floor(rankIndex / 3);
  const subRank = rankIndex % 3;

  if (tierIndex >= tiers.length) {
    return `Rank ${rankIndex + 1}`;
  }

  return `${tiers[tierIndex]} ${numerals[subRank]}`;
}

// Get all rank names up to a max rank
export function getRankNames(maxRank: number): string[] {
  const names: string[] = [];
  for (let i = 0; i < maxRank; i++) {
    names.push(getRankDisplayName(i));
  }
  return names;
}

// Get rank image URL for a rank index
export function getRankImageUrl(rankIndex: number): string | undefined {
  const tiers = ['stone', 'iron', 'bronze', 'silver', 'gold', 'diamond', 'adamantine'];
  const tierIndex = Math.floor(rankIndex / 3);
  const subRank = (rankIndex % 3) + 1; // 1, 2, 3

  if (tierIndex >= tiers.length) return undefined;

  const key = `${tiers[tierIndex]}${subRank}`;
  return rankImageMap[key];
}

// Get rarity image URL
export function getRarityImageUrl(rarity: string): string | undefined {
  return rarityImageMap[rarity.toLowerCase()];
}

// Get damage type image URL
export function getDamageTypeImageUrl(damageType: string): string | undefined {
  return damageImageMap[damageType.toLowerCase()];
}

// Get faction image URL
export function getFactionImageUrl(faction: string): string | undefined {
  return factionImageMap[faction];
}

// Map FactionId to display name
const factionDisplayNames: Record<string, string> = {
  'Ultramarines': 'Ultramarines',
  'DarkAngels': 'Dark Angels',
  'SpaceWolves': 'Space Wolves',
  'BloodAngels': 'Blood Angels',
  'BlackTemplars': 'Black Templars',
  'Sisterhood': 'Adepta Sororitas',
  'AstraMilitarum': 'Astra Militarum',
  'AdeptusMechanicus': 'Adeptus Mechanicus',
  'Custodes': 'Adeptus Custodes',
  'BlackLegion': 'Black Legion',
  'DeathGuard': 'Death Guard',
  'ThousandSons': 'Thousand Sons',
  'WorldEaters': 'World Eaters',
  'EmperorsChildren': "Emperor's Children",
  'Orks': 'Orks',
  'Necrons': 'Necrons',
  'Aeldari': 'Aeldari',
  'Tau': "T'au Empire",
  'Tyranids': 'Tyranids',
  'Genestealers': 'Genestealer Cults',
};

// Get faction display name from FactionId
export function getFactionDisplayName(factionId: string): string {
  return factionDisplayNames[factionId] || factionId;
}

// Faction order within each alliance
const factionOrderByAlliance: Record<string, string[]> = {
  Imperial: [
    'Ultramarines',
    'DarkAngels',
    'SpaceWolves',
    'BloodAngels',
    'BlackTemplars',
    'Sisterhood',
    'AstraMilitarum',
    'AdeptusMechanicus',
    'Custodes',
  ],
  Chaos: [
    'BlackLegion',
    'DeathGuard',
    'ThousandSons',
    'WorldEaters',
    'EmperorsChildren',
  ],
  Xenos: [
    'Orks',
    'Necrons',
    'Aeldari',
    'Tau',
    'Tyranids',
    'Genestealers',
  ],
};

// Alliance display order
const allianceOrder: Alliance[] = ['Imperial', 'Chaos', 'Xenos'];

// Get all unique factions from characters (in a specific order)
export function getAllFactions(): string[] {
  const allFactions: string[] = [];
  for (const alliance of allianceOrder) {
    allFactions.push(...(factionOrderByAlliance[alliance] || []));
  }

  const factionsInData = new Set<string>();
  for (const id in characters) {
    const char = characters[id];
    // Only count characters with Hero trait
    if (char.traits && char.traits.includes('Hero')) {
      factionsInData.add(char.FactionId);
    }
  }

  // Return factions in order, only including those that have Hero characters
  return allFactions.filter(f => factionsInData.has(f));
}

// Get factions grouped by alliance
export function getFactionsByAlliance(): Record<Alliance, string[]> {
  const factionsInData = new Set<string>();
  for (const id in characters) {
    const char = characters[id];
    // Only count characters with Hero trait
    if (char.traits && char.traits.includes('Hero')) {
      factionsInData.add(char.FactionId);
    }
  }

  const result: Record<Alliance, string[]> = {
    Imperial: [],
    Chaos: [],
    Xenos: [],
  };

  for (const alliance of allianceOrder) {
    const factions = factionOrderByAlliance[alliance] || [];
    result[alliance] = factions.filter(f => factionsInData.has(f));
  }

  return result;
}

// Get alliance display order
export function getAllianceOrder(): Alliance[] {
  return allianceOrder;
}
