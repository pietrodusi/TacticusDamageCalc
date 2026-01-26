/**
 * Compact types for battle sharing URL serialization.
 * Uses short property names to minimize URL length.
 */

import type { DamageType, EquippedItem } from '../../types/character';
import type { BossRank } from '../../types/boss';
import type { MachineOfWarStars } from '../../types/machineOfWar';
import type { BuffSource } from '../damage/types';

// Version for backwards compatibility
export const SHARE_DATA_VERSION = 1;

/**
 * Root shareable data structure
 */
export interface ShareableData {
  v: number;                    // Version for backwards compat
  s: CompactSetup;              // Team + Boss + Machine setup
  r: CompactResults;            // Battle results with breakdowns
  n?: string;                   // User notes (max 500 chars)
}

/**
 * Compact team/boss/machine setup
 */
export interface CompactSetup {
  t: CompactTeamMember[];       // Team (5 max)
  b?: CompactBoss;              // Boss (optional)
  m?: CompactMachine;           // Machine of War (optional)
}

/**
 * Compact boss info
 */
export interface CompactBoss {
  i: string;                    // bossId
  r: number;                    // rank (13-18)
  m: boolean;                   // applyModifiers
}

/**
 * Compact machine of war
 */
export interface CompactMachine {
  i: string;                    // machineId
  s: number;                    // stars (11-14)
}

/**
 * Compact team member
 */
export interface CompactTeamMember {
  i: string;                    // characterId
  p: number;                    // progressionStepIndex
  r: number;                    // rank
  a?: Record<string, number>;   // abilityLevels (non-default only)
  e?: CompactEquipment[];       // equipment
}

/**
 * Compact equipment item
 */
export interface CompactEquipment {
  s: number;                    // slot index
  i: string;                    // itemId
  l: number;                    // level
}

/**
 * Compact battle results
 */
export interface CompactResults {
  td: number;                   // totalDamage
  turns: CompactTurn[];         // turn-by-turn data
}

/**
 * Compact turn data
 */
export interface CompactTurn {
  n: number;                    // turn number
  logs: CompactLogEntry[];      // action logs with breakdowns
}

/**
 * Compact log entry
 */
export interface CompactLogEntry {
  cid: string;                  // characterId
  cn: string;                   // characterName
  ci?: string;                  // characterIconUrl
  a: string;                    // action type
  t?: string;                   // target
  d?: number;                   // damage
  dt?: DamageType;              // damageType
  at?: 'melee' | 'ranged';      // attackType
  h?: number;                   // healing
  m: string;                    // message
  bd?: CompactDamageBreakdown;  // damageBreakdown
  fu?: CompactFollowUp[];       // followUpAttacks
  ab?: CompactAppliedBuff[];    // appliedBuffs
}

/**
 * Compact damage breakdown
 */
export interface CompactDamageBreakdown {
  dmg: number;                  // damage
  phd: number;                  // perHitDamage
  hits: number;                 // hits

  // Calculation steps
  bd: number;                   // baseDamage
  fm: number;                   // flatModifiers
  fms?: CompactBuffSource[];    // flatModifierSources
  cb: number;                   // critBonus
  ccs?: CompactBuffSource[];    // critChanceSources
  cds?: CompactBuffSource[];    // critDamageSources
  eh: number;                   // extraHits
  ehs?: CompactBuffSource[];    // extraHitsSources
  dvm: number;                  // damVarMod
  ta: number;                   // targetArmor
  ai?: number;                  // armorIgnored
  ais?: CompactBuffSource[];    // armorIgnoredSources
  ea?: number;                  // effectiveArmor
  aa: number;                   // afterArmor
  pr: number;                   // pierceRatio
  prb?: number;                 // pierceRatioBonus
  prbs?: CompactBuffSource[];   // pierceRatioBonusSources
  epr?: number;                 // effectivePierceRatio
  pf: number;                   // pierceFloor
  aap: number;                  // afterArmorPierce
  gm: number;                   // globalMultiplier
  gms?: CompactBuffSource[];    // globalMultiplierSources
  gdb?: number;                 // globalDamageBonus
  gdbs?: CompactBuffSource[];   // globalDamageBonusSources

  // Crit info
  bcc: number;                  // baseCritChance
  bcd: number;                  // baseCritDamage
  ccb: number;                  // critChanceBonus
  cdb: number;                  // critDmgBonus
  cc: number;                   // critChance (effective)
  cd: number;                   // critDamage (effective)

  // Block reduction
  eb?: number;                  // expectedBlocks
  brph?: number;                // blockReductionPerHit
  tbr?: number;                 // totalBlockReduction
}

/**
 * Compact buff source
 */
export interface CompactBuffSource {
  n: string;                    // name
  db?: number;                  // damageBonus
  dm?: number;                  // damageMultiplier
  ccb?: number;                 // critChanceBonus
  cdb?: number;                 // critDamageBonus
  eh?: number;                  // extraHits
  ai?: number;                  // armorIgnored
  prb?: number;                 // pierceRatioBonus
  gdb?: number;                 // globalDamageBonus
}

/**
 * Compact follow-up attack
 */
export interface CompactFollowUp {
  an: string;                   // abilityName
  dmg: number;                  // damage
  hits: number;                 // hits
  dt: string;                   // damageType
  at?: 'melee' | 'ranged';      // attackType
  bd?: CompactDamageBreakdown;  // breakdown
  ab?: CompactAppliedBuff[];    // appliedBuffs
  scid?: string;                // sourceCharacterId
  scn?: string;                 // sourceCharacterName
}

/**
 * Compact applied buff info
 */
export interface CompactAppliedBuff {
  n: string;                    // name
  sn?: string;                  // sourceName
  e?: string;                   // effect
}

/**
 * Decoded data for display (expanded back to full types)
 */
export interface DecodedShareData {
  version: number;
  setup: DecodedSetup;
  results: DecodedResults;
  notes?: string;
}

export interface DecodedSetup {
  team: DecodedTeamMember[];
  boss?: {
    id: string;
    rank: BossRank;
    applyModifiers: boolean;
  };
  machine?: {
    id: string;
    stars: MachineOfWarStars;
  };
}

export interface DecodedTeamMember {
  characterId: string;
  progressionStepIndex: number;
  rank: number;
  abilityLevels?: Record<string, number>;
  equipment?: Record<number, EquippedItem>;
}

export interface DecodedResults {
  totalDamage: number;
  turns: DecodedTurn[];
}

export interface DecodedTurn {
  turnNumber: number;
  logs: DecodedLogEntry[];
}

export interface DecodedLogEntry {
  characterId: string;
  characterName: string;
  characterIconUrl?: string;
  action: string;
  target?: string;
  damage?: number;
  damageType?: DamageType;
  attackType?: 'melee' | 'ranged';
  healing?: number;
  message: string;
  damageBreakdown?: DecodedDamageBreakdown;
  followUpAttacks?: DecodedFollowUp[];
  appliedBuffs?: { name: string; sourceName?: string; effect?: string }[];
}

export interface DecodedDamageBreakdown {
  damage: number;
  perHitDamage: number;
  hits: number;
  baseDamage: number;
  flatModifiers: number;
  flatModifierSources: BuffSource[];
  critBonus: number;
  critChanceSources: BuffSource[];
  critDamageSources: BuffSource[];
  extraHits: number;
  extraHitsSources: BuffSource[];
  damVarMod: number;
  targetArmor: number;
  armorIgnored?: number;
  armorIgnoredSources?: BuffSource[];
  effectiveArmor?: number;
  afterArmor: number;
  pierceRatio: number;
  pierceRatioBonus?: number;
  pierceRatioBonusSources?: BuffSource[];
  effectivePierceRatio?: number;
  pierceFloor: number;
  afterArmorPierce: number;
  globalMultiplier: number;
  globalMultiplierSources: BuffSource[];
  globalDamageBonus?: number;
  globalDamageBonusSources?: BuffSource[];
  baseCritChance: number;
  baseCritDamage: number;
  critChanceBonus: number;
  critDmgBonus: number;
  critChance: number;
  critDamage: number;
  expectedBlocks?: number;
  blockReductionPerHit?: number;
  totalBlockReduction?: number;
}

export interface DecodedFollowUp {
  abilityName: string;
  damage: number;
  hits: number;
  damageType: string;
  attackType?: 'melee' | 'ranged';
  breakdown?: DecodedDamageBreakdown;
  appliedBuffs?: { name: string; sourceName?: string; effect?: string }[];
  sourceCharacterId?: string;
  sourceCharacterName?: string;
}
