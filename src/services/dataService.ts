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
  AbilitiesDisplayData,
  AbilitiesStatsData,
  ResolvedAbility,
  ItemSlotType,
  ItemsData,
  Item,
  ItemStats,
  EquippedItem,
  Boss,
  BossRank,
  RawBossesData,
  BossImagesData,
  RawBossModsData,
  RawBossModDetailsData,
  BossStatModifiers,
  BossTraitsData,
  MachineOfWarInfo,
  MachineOfWarStars,
  MachineOfWarWithBonus,
  SummonUnitData,
} from '../types';
import { BOSS_RANKS } from '../types';

// Import static JSON data
import rawCharactersData from '../assets/data/characters.json';
import charactersImgData from '../assets/data/charactersImg.json';
import progressionData from '../assets/data/progression.json';
import itemsData from '../assets/data/items.json';
import rawBossesData from '../assets/data/guildBossUnits.json';
import bossImgData from '../assets/data/guildBossImg.json';
import bossModsData from '../assets/data/guildBossMods.json';
import bossModDetailsData from '../assets/data/guildBossModDetails.json';
import bossTraitsData from '../assets/data/guildBossTraits.json';
import summonsData from '../assets/data/summons.json';

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

// Import boss images
const bossImages = import.meta.glob<{ default: string }>(
  '../assets/images/bosses/*.png',
  { eager: true }
);

// Import summon images
const summonImages = import.meta.glob<{ default: string }>(
  '../assets/images/summons/*.webp',
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

// Create boss image map (e.g., 'portrait_guild_tervigon' -> url)
const bossImageMap: Record<string, string> = {};
for (const path in bossImages) {
  const filename = path.split('/').pop()?.replace('.png', '') || '';
  bossImageMap[filename] = bossImages[path].default;
}

// Create summon image map (e.g., 'orksOrkBoys' -> url)
const summonImageMap: Record<string, string> = {};
for (const path in summonImages) {
  const filename = path.split('/').pop()?.replace('.webp', '') || '';
  summonImageMap[filename] = summonImages[path].default;
}

// Type assertions for imported JSON
const characters = rawCharactersData as RawCharactersData;
const charactersInfo = charactersImgData as CharactersInfoData;
const summons = summonsData as Record<string, SummonUnitData>;
const progression = progressionData as ProgressionData;
const items = itemsData as ItemsData;
const bosses = rawBossesData as RawBossesData;
const bossImages2 = bossImgData as BossImagesData;
const bossMods = bossModsData as RawBossModsData;
const bossModDetails = bossModDetailsData as RawBossModDetailsData;
const bossTraits = bossTraitsData as BossTraitsData;

// Variables that need to be doubled (JSON values are halved)
const VARIABLES_TO_DOUBLE = new Set([
  // Damage
  'minDmg', 'maxDmg', 'extraMaxDmg', 'dmg', 'extraDmg',
  'blockDmg', 'extraCritDmg',
  'spawnDmg', 'summonDmg', 'summonCritDmg', 'summonBlockDmg',
  'dmgReduction',
  // HP
  'hp', 'maxHp', 'minHp', 'extraHp',
  'hpToHeal', 'maxHpToHeal', 'hpToRepair',
  'spawnHp', 'summonHp', 'shieldHp',
  // Armor
  'extraArmor', 'armorReduction', 'armorIgnored',
  'spawnArmor', 'summonArmor',
]);

function shouldDoubleVariable(key: string): boolean {
  if (VARIABLES_TO_DOUBLE.has(key)) return true;
  for (const baseVar of VARIABLES_TO_DOUBLE) {
    if (key.startsWith(baseVar + '_')) return true;
  }
  return false;
}

// Ability data - loaded lazily to handle JSON with non-standard escapes
let abilitiesDisplay: AbilitiesDisplayData | null = null;
let abilitiesStats: AbilitiesStatsData | null = null;
let abilitiesLoadPromise: Promise<void> | null = null;

// Fix invalid escape sequences in JSON strings
function fixJsonEscapes(raw: string): string {
  let result = raw;

  // Replace \' with ' (invalid in JSON - backslash + single quote)
  result = result.replace(/\\'/g, "'");

  // Convert \xNN to \u00NN (JSON only supports \u escapes, not \x)
  result = result.replace(/\\x([0-9a-fA-F]{2})/g, '\\u00$1');

  // Fix unescaped quotes in style tags: <style=\" value "> should be <style=\" value \">
  // The pattern matches: two spaces + unescaped quote + >
  // We need to escape the closing quote in style attributes
  result = result.replace(/ {2}">/g, '  \\">')

  return result;
}

async function loadAbilitiesData(): Promise<void> {
  if (abilitiesDisplay && abilitiesStats) return;

  if (!abilitiesLoadPromise) {
    abilitiesLoadPromise = (async () => {
      try {
        // Fetch as text to avoid JSON parse issues
        const [displayRes, statsRes] = await Promise.all([
          fetch(new URL('../assets/data/abilitiesData.json', import.meta.url).href),
          fetch(new URL('../assets/data/abilities.json', import.meta.url).href),
        ]);

        const displayText = await displayRes.text();
        const statsText = await statsRes.text();

        abilitiesDisplay = JSON.parse(fixJsonEscapes(displayText));
        abilitiesStats = JSON.parse(fixJsonEscapes(statsText));
      } catch (e) {
        console.error('Failed to load abilities data:', e);
        abilitiesDisplay = {};
        abilitiesStats = {};
      }
    })();
  }

  await abilitiesLoadPromise;
}

// Preload abilities data
loadAbilitiesData();

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
    'Chain': 'Chain',
    'Piercing': 'Piercing',
    'Power': 'Power',
    'Eviscerate': 'Eviscerate',
    'Bolter': 'Bolter',
    'HeavyRound': 'HeavyRound',
    'Projectile': 'Projectile',
    'Las': 'Las',
    'Plasma': 'Plasma',
    'Melta': 'Melta',
    'Flame': 'Flame',
    'Energy': 'Energy',
    'Blast': 'Blast',
    'Psychic': 'Psychic',
    'Bio': 'Bio',
    'Toxic': 'Toxic',
    'Gauss': 'Gauss',
    'Particle': 'Particle',
    'Pulse': 'Pulse',
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

    itemSlots: (raw.itemSlots || []) as ItemSlotType[],

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

// ============ Ability Functions ============

// Default ability level (0-indexed, so 54 = level 55)
export const DEFAULT_ABILITY_LEVEL = 54;

// Get ability level index from display level (1-65 -> 0-64)
export function getAbilityLevelIndex(displayLevel: number): number {
  return Math.max(0, Math.min(64, displayLevel - 1));
}

// Get display level from index (0-64 -> 1-65)
export function getAbilityDisplayLevel(index: number): number {
  return index + 1;
}

// Replace variables in ability description with actual values
// Variables are marked with {{VAR:value}} and constants with {{CONST:value}} for highlighting
function replaceAbilityVariables(
  description: string,
  abilityId: string,
  levelIndex: number
): string {
  if (!abilitiesStats) return description;
  const stats = abilitiesStats[abilityId];
  if (!stats) return description;

  let result = description;

  // Replace variables like {[variableName]} with marked values for highlighting
  result = result.replace(/\{\[(\w+)\]\}/g, (match, varName) => {
    // First check variables (level-dependent)
    if (stats.variables && stats.variables[varName]) {
      const values = stats.variables[varName];
      const index = Math.min(levelIndex, values.length - 1);
      let value = values[index];
      // Double damage/HP/armor variables (JSON values are halved)
      if (typeof value === 'number' && shouldDoubleVariable(varName)) {
        value = value * 2;
      }
      return `{{VAR:${value?.toString() ?? match}}}`;
    }
    // Then check constants (fixed values)
    if (stats.constants && stats.constants[varName]) {
      return `{{CONST:${stats.constants[varName]}}}`;
    }
    return match;
  });

  // Clean up style tags for plain text display
  // Remove <style=...>...</style> tags, keeping inner content
  result = result.replace(/<style=[^>]*>([^<]*)<\/style>/g, '$1');
  // Remove any remaining unclosed style tags
  result = result.replace(/<style=[^>]*>/g, '');
  result = result.replace(/<\/style>/g, '');
  // Replace \n (backslash + n) with actual newlines
  // Using split/join to avoid regex escaping confusion
  result = result.split('\\n').join('\n');
  // Replace <i>...</i> with the content
  result = result.replace(/<i>([^<]*)<\/i>/g, '$1');

  return result;
}

// Get ability display info (name and description with variables replaced)
export function getAbilityInfo(
  abilityId: string,
  levelIndex: number = DEFAULT_ABILITY_LEVEL
): { name: string; description: string } | null {
  if (!abilitiesDisplay) return null;
  const displayData = abilitiesDisplay[abilityId];
  if (!displayData) {
    return null;
  }

  return {
    name: displayData.name,
    description: replaceAbilityVariables(displayData.description, abilityId, levelIndex),
  };
}

// Ensure abilities data is loaded (call this before using ability functions)
export async function ensureAbilitiesLoaded(): Promise<void> {
  await loadAbilitiesData();
}

// Get resolved abilities for a character
export function getCharacterAbilities(
  character: Character,
  levelIndex: number = DEFAULT_ABILITY_LEVEL
): ResolvedAbility[] {
  const abilities: ResolvedAbility[] = [];

  // Add active abilities
  for (const abilityId of character.activeAbilities) {
    const info = getAbilityInfo(abilityId, levelIndex);
    if (info) {
      abilities.push({
        id: abilityId,
        name: info.name,
        description: info.description,
        type: 'active',
      });
    }
  }

  // Add passive abilities
  for (const abilityId of character.passiveAbilities) {
    const info = getAbilityInfo(abilityId, levelIndex);
    if (info) {
      abilities.push({
        id: abilityId,
        name: info.name,
        description: info.description,
        type: 'passive',
      });
    }
  }

  return abilities;
}

// ============ Equipment Functions ============

// Get all items
export function getAllItems(): ItemsData {
  return items;
}

// Get a single item by ID
export function getItem(itemId: string): Item | null {
  return items[itemId] || null;
}

// Get items available for a specific slot type, faction, and character
export function getItemsForSlot(slotType: ItemSlotType, faction: string, characterId: string): { id: string; item: Item }[] {
  return Object.entries(items)
    .filter(([, item]) => {
      // Match slot type
      if (item.itemType !== slotType) return false;
      // Check faction restriction (if no allowedFactions, item is available to all)
      if (item.allowedFactions && !item.allowedFactions.includes(faction)) return false;
      // Check unit restriction (if allowedUnits exists, character must be in the list)
      if (item.allowedUnits && !item.allowedUnits.includes(characterId)) return false;
      return true;
    })
    .map(([id, item]) => ({ id, item }))
    .sort((a, b) => {
      // Sort by rarity (Common -> Legendary, Mythic at end), then by name
      const rarityOrder: Record<string, number> = {
        'Common': 0,
        'Uncommon': 1,
        'Rare': 2,
        'Epic': 3,
        'Legendary': 4,
        'Mythic': 5,
      };
      const rarityDiff = (rarityOrder[a.item.rarity] || 0) - (rarityOrder[b.item.rarity] || 0);
      if (rarityDiff !== 0) return rarityDiff;
      return a.item.name.localeCompare(b.item.name);
    });
}

// Get item stats at a specific level
export function getItemStats(itemId: string, level: number): ItemStats | null {
  const item = items[itemId];
  if (!item) return null;
  const levelData = item.levels[level];
  if (!levelData) return null;
  return levelData.stats;
}

// Calculate total equipment stats from equipped items
export function calculateEquipmentStats(equipment: Record<number, EquippedItem> | undefined): ItemStats {
  const totalStats: ItemStats = {};

  if (!equipment) return totalStats;

  for (const equipped of Object.values(equipment)) {
    const stats = getItemStats(equipped.itemId, equipped.level);
    if (stats) {
      // Add each stat
      if (stats.critChance) totalStats.critChance = (totalStats.critChance || 0) + stats.critChance;
      if (stats.critDmg) totalStats.critDmg = (totalStats.critDmg || 0) + stats.critDmg;
      if (stats.critChanceBonus) totalStats.critChanceBonus = (totalStats.critChanceBonus || 0) + stats.critChanceBonus;
      if (stats.critDmgBonus) totalStats.critDmgBonus = (totalStats.critDmgBonus || 0) + stats.critDmgBonus;
      if (stats.hp) totalStats.hp = (totalStats.hp || 0) + stats.hp;
      if (stats.fixedArmor) totalStats.fixedArmor = (totalStats.fixedArmor || 0) + stats.fixedArmor;
      if (stats.blockChance) totalStats.blockChance = (totalStats.blockChance || 0) + stats.blockChance;
      if (stats.blockDmg) totalStats.blockDmg = (totalStats.blockDmg || 0) + stats.blockDmg;
      if (stats.blockChanceBonus) totalStats.blockChanceBonus = (totalStats.blockChanceBonus || 0) + stats.blockChanceBonus;
      if (stats.blockDmgBonus) totalStats.blockDmgBonus = (totalStats.blockDmgBonus || 0) + stats.blockDmgBonus;
    }
  }

  return totalStats;
}

// Get slot type display name
export function getSlotTypeDisplayName(slotType: ItemSlotType): string {
  const names: Record<ItemSlotType, string> = {
    'I_Crit': 'Crit',
    'I_Booster_Crit': 'Crit Booster',
    'I_Defensive': 'Defensive',
    'I_Block': 'Block',
    'I_Booster_Block': 'Block Booster',
  };
  return names[slotType] || slotType;
}

// Score an item based on slot type priority
function scoreItemForSlot(item: Item, slotType: ItemSlotType): number {
  // Get max level stats
  const maxLevel = item.levels.length - 1;
  const stats = item.levels[maxLevel]?.stats;
  if (!stats) return 0;

  switch (slotType) {
    case 'I_Crit':
      // Prioritize critChance, then critDmg
      return (stats.critChance || 0) * 1000 + (stats.critDmg || 0);

    case 'I_Booster_Crit':
      // Prioritize critChanceBonus, then blockChanceBonus
      return (stats.critChanceBonus || 0) * 1000 + (stats.blockChanceBonus || 0) * 100 + (stats.critDmgBonus || 0);

    case 'I_Defensive':
      // Prioritize blockChance, then hp, then armor
      return (stats.blockChance || 0) * 1000 + (stats.hp || 0) + (stats.fixedArmor || 0) * 10;

    case 'I_Block':
      // Prioritize blockChance, then blockDmg
      return (stats.blockChance || 0) * 1000 + (stats.blockDmg || 0);

    case 'I_Booster_Block':
      // Prioritize blockChanceBonus, then blockDmgBonus
      return (stats.blockChanceBonus || 0) * 1000 + (stats.blockDmgBonus || 0);

    default:
      return 0;
  }
}

// Get the best default equipment for a character
export function getDefaultEquipment(characterId: string, faction: string, itemSlots: ItemSlotType[]): Record<number, EquippedItem> {
  const equipment: Record<number, EquippedItem> = {};

  itemSlots.forEach((slotType, slotIndex) => {
    const availableItems = getItemsForSlot(slotType, faction, characterId);

    if (availableItems.length === 0) return;

    // Score and sort items by priority
    const scoredItems = availableItems.map(({ id, item }) => ({
      id,
      item,
      score: scoreItemForSlot(item, slotType),
    }));

    // Sort by score descending (best first)
    scoredItems.sort((a, b) => b.score - a.score);

    // Pick the best item at max level
    const best = scoredItems[0];
    if (best) {
      equipment[slotIndex] = {
        itemId: best.id,
        level: best.item.levels.length - 1, // Max level
      };
    }
  });

  return equipment;
}

// ============ Boss Functions ============

// Boss display names (from boss IDs)
const bossDisplayNames: Record<string, string> = {
  'GuildBoss1Boss1TyranTervigonLeviathan': 'Tervigon (Leviathan)',
  'GuildBoss1Boss2TyranTervigonKronos': 'Tervigon (Kronos)',
  'GuildBoss1Boss3TyranTervigonGorgon': 'Tervigon (Gorgon)',
  'GuildBoss2Boss1TyranHiveTyrantLeviathan': 'Hive Tyrant (Leviathan)',
  'GuildBoss2Boss2TyranHiveTyrantKronos': 'Hive Tyrant (Kronos)',
  'GuildBoss2Boss3TyranHiveTyrantGorgon': 'Hive Tyrant (Gorgon)',
  'GuildBoss3Boss1NecroSilentKing': 'Silent King',
  'GuildBoss4Boss1OrksGhazghkull': 'Ghazghkull',
  'GuildBoss5Boss1DeathMortarion': 'Mortarion',
  'GuildBoss6Boss1TyranScreamerKiller': 'Screamer-Killer',
  'GuildBoss7Boss1AstraRogaldorn': 'Rogal Dorn',
  'GuildBoss8Boss1EldarAvatar': 'Avatar of Khaine',
  'GuildBoss9Boss1ThousMagnus': 'Magnus the Red',
  'GuildBoss10Boss1AdmecBelisarius': 'Belisarius Cawl',
  'GuildBoss11Boss1TauRiptide': 'Riptide',
};

// Helper to resolve boss portrait URL from bossImg path
function resolveBossPortraitUrl(imgPath: string | undefined): string | undefined {
  if (!imgPath) return undefined;
  // Extract filename from path (e.g., '/bosses/portrait_guild_tervigon.png' -> 'portrait_guild_tervigon')
  const filename = imgPath.split('/').pop()?.replace('.png', '') || '';
  return bossImageMap[filename];
}

// Get boss display name from ID
export function getBossDisplayName(bossId: string): string {
  return bossDisplayNames[bossId] || bossId;
}

// Get list of all available bosses (for selection)
export interface BossListItem {
  id: string;
  name: string;
  faction: string;
  iconUrl?: string;
}

export function getBossList(): BossListItem[] {
  return Object.entries(bosses)
    .filter(([id, boss]) => {
      // Filter out loot objects without faction
      if (!boss.FactionId) return false;
      // Filter out MiniBoss, Npc, and Minion entries
      if (id.includes('MiniBoss') || id.includes('Npc') || id.includes('Minion')) return false;
      return true;
    })
    .map(([id, boss]) => {
      const imgData = bossImages2[id];
      return {
        id,
        name: getBossDisplayName(id),
        faction: boss.FactionId!,
        iconUrl: resolveBossPortraitUrl(imgData?.img),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Get stat modifiers for a boss (all modifiers applied)
export function getBossStatModifiers(bossId: string): BossStatModifiers {
  const result: BossStatModifiers = {
    armorPctReduction: 0,
    damagePctReduction: 0,
    blockChanceReduction: 0,
  };

  // Find the modifier entry where this boss ID is the main boss (first unitId)
  const modEntry = Object.values(bossMods).find(
    entry => entry.unitIds[0] === bossId
  );

  if (!modEntry) return result;

  // Process all modifiers (including duplicates for stacking)
  for (const track of modEntry.modifiers) {
    for (const stage of track) {
      for (const modId of stage) {
        const modDetail = bossModDetails[modId];
        if (!modDetail) continue;

        // Only process stat modifiers that affect the boss directly
        if (modDetail.type === 'bossStatPctDecrease') {
          if (modDetail.target === 'fixedArmor') {
            result.armorPctReduction += modDetail.amount;
          } else if (modDetail.target === 'dmg') {
            result.damagePctReduction += modDetail.amount;
          } else if (modDetail.target === 'critDmg') {
            // We could track this too if needed
          }
        } else if (modDetail.type === 'bossStatDecrease') {
          if (modDetail.target === 'blockChance') {
            result.blockChanceReduction += modDetail.amount;
          }
        }
      }
    }
  }

  return result;
}

/**
 * Get boss ability constant modifiers
 * Returns the total increase to apply to each constant for a given ability
 * Example: ProphetOfGorkAndMork's nrOfAttacks can be increased by modifiers
 */
export function getBossAbilityConstantModifiers(
  bossId: string,
  abilityId: string
): Record<string, number> {
  const result: Record<string, number> = {};

  // Find the modifier entry where this boss ID is the main boss (first unitId)
  const modEntry = Object.values(bossMods).find(
    entry => entry.unitIds[0] === bossId
  );

  if (!modEntry) return result;

  // Process all modifiers (including duplicates for stacking)
  for (const track of modEntry.modifiers) {
    for (const stage of track) {
      for (const modId of stage) {
        const modDetail = bossModDetails[modId];
        if (!modDetail) continue;

        // Only process ability constant increase modifiers for the target ability
        if (modDetail.type === 'bossAbilityConstantIncrease' && modDetail.target === abilityId) {
          const constantName = modDetail.subtarget;
          if (constantName) {
            result[constantName] = (result[constantName] || 0) + modDetail.amount;
          }
        }
      }
    }
  }

  return result;
}

// Get boss stats at a specific rank (13-18 = Legendary 1 to Mythic 1)
// Stats are reduced by all applicable modifiers from guildBossMods if applyModifiers is true
export function getBossAtRank(bossId: string, rank: BossRank, applyModifiers: boolean = true): Boss | null {
  const bossData = bosses[bossId];
  if (!bossData || !bossData.FactionId) return null;

  // Find stats for the requested rank
  const statsForRank = bossData.stats.find(s => s.Rank === rank);
  if (!statsForRank) return null;

  const imgData = bossImages2[bossId];

  // Get stat modifiers and apply them if enabled
  let armorMultiplier = 1;
  let damageMultiplier = 1;

  if (applyModifiers) {
    const modifiers = getBossStatModifiers(bossId);
    // Apply percentage reductions (reduce stat by X%)
    armorMultiplier = Math.max(0, 100 - modifiers.armorPctReduction) / 100;
    damageMultiplier = Math.max(0, 100 - modifiers.damagePctReduction) / 100;
  }

  // Get traits for this boss
  const traitsData = bossTraits[bossId];

  return {
    id: bossId,
    name: getBossDisplayName(bossId),
    faction: bossData.FactionId,
    movement: bossData.Movement || 0,
    activeAbilities: bossData.activeAbilities || [],
    passiveAbilities: bossData.passiveAbilities || [],
    traits: traitsData?.traits || [],
    iconUrl: resolveBossPortraitUrl(imgData?.img),
    health: statsForRank.Health,
    damage: Math.floor(statsForRank.Damage * damageMultiplier),
    armor: Math.floor(statsForRank.FixedArmor * armorMultiplier),
    rank: rank,
    abilityLevel: statsForRank.AbilityLevel,
    applyModifiers,  // Pass through whether minion-killed modifiers were applied
  };
}

// Get rank display name for boss (e.g., "Legendary 1", "Mythic 1")
export function getBossRankDisplayName(rank: BossRank): string {
  const rankInfo = BOSS_RANKS.find(r => r.rank === rank);
  return rankInfo?.name || `Rank ${rank}`;
}

// Get all available ranks for a boss
// Returns Legendary 1-5 (ranks 13-17) and only the first Mythic entry (rank 18)
export function getAvailableBossRanks(bossId: string): BossRank[] {
  const bossData = bosses[bossId];
  if (!bossData) return [];

  const allRanks = bossData.stats
    .filter(s => s.Rank >= 13 && s.Rank <= 18)
    .map(s => s.Rank as BossRank)
    .sort((a, b) => a - b);

  // Filter to only include legendaries (13-17) and the first mythic (18)
  const legendaryRanks = allRanks.filter(r => r <= 17);
  const hasMythic = allRanks.includes(18);

  return hasMythic ? [...legendaryRanks, 18] : legendaryRanks;
}

// ============================================================================
// Machine of War Functions
// ============================================================================

// Mapping of Machine of War ID to their mythic ability
const MACHINE_OF_WAR_MYTHIC_ABILITIES: Record<string, string> = {
  tyranBiovore: 'HyperCorrosiveAcid',
  deathCrawler: 'BlightedLand',
};

// Supported Machines of War (only these are implemented)
const SUPPORTED_MACHINES_OF_WAR = ['tyranBiovore', 'deathCrawler'];

// Get list of available Machines of War
export function getMachineOfWarList(): MachineOfWarInfo[] {
  const machines: MachineOfWarInfo[] = [];

  for (const machineId of SUPPORTED_MACHINES_OF_WAR) {
    const rawChar = characters[machineId];
    if (!rawChar) continue;

    const info = charactersInfo[machineId];
    const mythicAbilityId = MACHINE_OF_WAR_MYTHIC_ABILITIES[machineId];

    // Get ability display name from abilitiesDisplay
    let mythicAbilityName = mythicAbilityId;
    if (abilitiesDisplay && abilitiesDisplay[mythicAbilityId]) {
      mythicAbilityName = abilitiesDisplay[mythicAbilityId].name || mythicAbilityId;
    }

    const iconUrl = resolvePortraitUrl(info?.img);

    machines.push({
      id: machineId,
      name: rawChar.name || machineId,
      faction: rawChar.FactionId || 'Unknown',
      ...(iconUrl && { iconUrl }),
      mythicAbilityId,
      mythicAbilityName,
    });
  }

  return machines;
}

// Get display name for a Machine of War
export function getMachineOfWarDisplayName(machineId: string): string {
  const rawChar = characters[machineId];
  return rawChar?.name || machineId;
}

// Get extraDmgPct for a Machine of War at specific stars
// Stars 11-14 map to indices 0-3 in the extraDmgPct array
export function getMachineOfWarDamageBonus(
  machineId: string,
  stars: MachineOfWarStars
): number {
  const mythicAbilityId = MACHINE_OF_WAR_MYTHIC_ABILITIES[machineId];
  if (!mythicAbilityId || !abilitiesStats) return 0;

  const abilityData = abilitiesStats[mythicAbilityId];
  if (!abilityData?.variables?.extraDmgPct) return 0;

  const extraDmgPctArray = abilityData.variables.extraDmgPct as number[];
  const index = stars - 11; // Stars 11 -> index 0, 12 -> 1, etc.

  if (index < 0 || index >= extraDmgPctArray.length) return 0;

  return extraDmgPctArray[index];
}

// Get Machine of War with calculated bonus
export function getMachineOfWarAtStars(
  machineId: string,
  stars: MachineOfWarStars
): MachineOfWarWithBonus | null {
  const list = getMachineOfWarList();
  const machine = list.find((m) => m.id === machineId);
  if (!machine) return null;

  const extraDmgPct = getMachineOfWarDamageBonus(machineId, stars);

  return {
    ...machine,
    extraDmgPct,
    stars,
  };
}

// Get available star levels for Machine of War (always 11-14)
export function getAvailableMachineOfWarStars(): MachineOfWarStars[] {
  return [11, 12, 13, 14];
}

// ============================================================================
// Summon Functions
// ============================================================================

/**
 * Get summon unit data by ID
 * @param unitId The summon unit ID (e.g., 'orksOrkBoys')
 * @returns SummonUnitData or null if not found
 */
export function getSummonUnitData(unitId: string): SummonUnitData | null {
  return summons[unitId] || null;
}

/**
 * Get summon icon URL by unit ID
 * @param unitId The summon unit ID (e.g., 'orksOrkBoys')
 * @returns Resolved image URL or undefined if not found
 */
export function getSummonIconUrl(unitId: string): string | undefined {
  return summonImageMap[unitId];
}

/**
 * Get all available summons
 * @returns Record of all summon unit data
 */
export function getAllSummons(): Record<string, SummonUnitData> {
  return summons;
}
