/**
 * Decoder: Converts compact shareable format back to displayable data
 */

import type { BossRank } from '../../types/boss';
import type { MachineOfWarStars } from '../../types/machineOfWar';
import type { BuffSource } from '../damage/types';
import {
  SHARE_DATA_VERSION,
  type ShareableData,
  type CompactSetup,
  type CompactTeamMember,
  type CompactResults,
  type CompactTurn,
  type CompactLogEntry,
  type CompactDamageBreakdown,
  type CompactBuffSource,
  type CompactFollowUp,
  type CompactAppliedBuff,
  type DecodedShareData,
  type DecodedSetup,
  type DecodedTeamMember,
  type DecodedResults,
  type DecodedTurn,
  type DecodedLogEntry,
  type DecodedDamageBreakdown,
  type DecodedFollowUp,
} from './types';

/**
 * Decode shareable data to displayable format
 * Returns null if data is invalid
 */
export function decodeShareData(data: ShareableData): DecodedShareData | null {
  try {
    // Version check - for now we only support v1
    if (data.v > SHARE_DATA_VERSION) {
      console.warn(`Unsupported share data version: ${data.v}`);
      return null;
    }

    return {
      version: data.v,
      setup: decodeSetup(data.s),
      results: decodeResults(data.r),
      ...(data.n ? { notes: data.n } : {}),
    };
  } catch (error) {
    console.error('Failed to decode share data:', error);
    return null;
  }
}

/**
 * Decode setup
 */
function decodeSetup(setup: CompactSetup): DecodedSetup {
  const decoded: DecodedSetup = {
    team: setup.t.map(decodeTeamMember),
  };

  if (setup.b) {
    decoded.boss = {
      id: setup.b.i,
      rank: setup.b.r as BossRank,
      applyModifiers: setup.b.m,
    };
  }

  if (setup.m) {
    decoded.machine = {
      id: setup.m.i,
      stars: setup.m.s as MachineOfWarStars,
    };
  }

  return decoded;
}

/**
 * Decode team member
 */
function decodeTeamMember(member: CompactTeamMember): DecodedTeamMember {
  const decoded: DecodedTeamMember = {
    characterId: member.i,
    progressionStepIndex: member.p,
    rank: member.r,
  };

  // Restore ability levels (merging with default)
  if (member.a && Object.keys(member.a).length > 0) {
    decoded.abilityLevels = { ...member.a };
  }

  // Decode equipment
  if (member.e && member.e.length > 0) {
    decoded.equipment = {};
    for (const eq of member.e) {
      decoded.equipment[eq.s] = {
        itemId: eq.i,
        level: eq.l,
      };
    }
  }

  return decoded;
}

/**
 * Decode results
 */
function decodeResults(results: CompactResults): DecodedResults {
  // Firebase may transform empty arrays to undefined, so handle that case
  const turns = results.turns || [];
  return {
    totalDamage: results.td,
    turns: turns.map(decodeTurn),
  };
}

/**
 * Decode turn
 */
function decodeTurn(turn: CompactTurn): DecodedTurn {
  // Firebase may transform empty arrays to undefined, so handle that case
  const logs = turn.logs || [];
  return {
    turnNumber: turn.n,
    logs: logs.map(decodeLogEntry),
  };
}

/**
 * Decode log entry
 */
function decodeLogEntry(entry: CompactLogEntry): DecodedLogEntry {
  const decoded: DecodedLogEntry = {
    characterId: entry.cid,
    characterName: entry.cn,
    action: entry.a,
    message: entry.m,
  };

  // Optional fields
  if (entry.ci) decoded.characterIconUrl = entry.ci;
  if (entry.t) decoded.target = entry.t;
  if (entry.d !== undefined) decoded.damage = entry.d;
  if (entry.dt) decoded.damageType = entry.dt;
  if (entry.at) decoded.attackType = entry.at;
  if (entry.h !== undefined) decoded.healing = entry.h;

  // Damage breakdown
  if (entry.bd) {
    decoded.damageBreakdown = decodeDamageBreakdown(entry.bd);
  }

  // Follow-up attacks
  if (entry.fu && entry.fu.length > 0) {
    decoded.followUpAttacks = entry.fu.map(decodeFollowUp);
  }

  // Applied buffs
  if (entry.ab && entry.ab.length > 0) {
    decoded.appliedBuffs = entry.ab.map(decodeAppliedBuff);
  }

  return decoded;
}

/**
 * Decode damage breakdown
 */
function decodeDamageBreakdown(bd: CompactDamageBreakdown): DecodedDamageBreakdown {
  return {
    damage: bd.dmg,
    perHitDamage: bd.phd,
    hits: bd.hits,
    baseDamage: bd.bd,
    flatModifiers: bd.fm,
    flatModifierSources: bd.fms?.map(decodeBuffSource) ?? [],
    critBonus: bd.cb,
    critChanceSources: bd.ccs?.map(decodeBuffSource) ?? [],
    critDamageSources: bd.cds?.map(decodeBuffSource) ?? [],
    extraHits: bd.eh,
    extraHitsSources: bd.ehs?.map(decodeBuffSource) ?? [],
    damVarMod: bd.dvm,
    targetArmor: bd.ta,
    armorIgnored: bd.ai,
    armorIgnoredSources: bd.ais?.map(decodeBuffSource),
    effectiveArmor: bd.ea,
    afterArmor: bd.aa,
    pierceRatio: bd.pr,
    pierceRatioBonus: bd.prb,
    pierceRatioBonusSources: bd.prbs?.map(decodeBuffSource),
    effectivePierceRatio: bd.epr,
    pierceFloor: bd.pf,
    afterArmorPierce: bd.aap,
    globalMultiplier: bd.gm,
    globalMultiplierSources: bd.gms?.map(decodeBuffSource) ?? [],
    globalDamageBonus: bd.gdb,
    globalDamageBonusSources: bd.gdbs?.map(decodeBuffSource),
    baseCritChance: bd.bcc,
    baseCritDamage: bd.bcd,
    critChanceBonus: bd.ccb,
    critDmgBonus: bd.cdb,
    critChance: bd.cc,
    critDamage: bd.cd,
    expectedBlocks: bd.eb,
    blockReductionPerHit: bd.brph,
    totalBlockReduction: bd.tbr,
  };
}

/**
 * Decode buff source
 */
function decodeBuffSource(source: CompactBuffSource): BuffSource {
  return {
    name: source.n,
    damageBonus: source.db,
    damageMultiplier: source.dm,
    critChanceBonus: source.ccb,
    critDamageBonus: source.cdb,
    extraHits: source.eh,
    armorIgnored: source.ai,
    pierceRatioBonus: source.prb,
    globalDamageBonus: source.gdb,
  };
}

/**
 * Decode follow-up attack
 */
function decodeFollowUp(followUp: CompactFollowUp): DecodedFollowUp {
  const decoded: DecodedFollowUp = {
    abilityName: followUp.an,
    damage: followUp.dmg,
    hits: followUp.hits,
    damageType: followUp.dt,
  };

  if (followUp.at) decoded.attackType = followUp.at;
  if (followUp.bd) decoded.breakdown = decodeDamageBreakdown(followUp.bd);
  if (followUp.ab) decoded.appliedBuffs = followUp.ab.map(decodeAppliedBuff);
  if (followUp.scid) decoded.sourceCharacterId = followUp.scid;
  if (followUp.scn) decoded.sourceCharacterName = followUp.scn;

  return decoded;
}

/**
 * Decode applied buff
 */
function decodeAppliedBuff(buff: CompactAppliedBuff): { name: string; sourceName?: string; effect?: string } {
  return {
    name: buff.n,
    sourceName: buff.sn,
    effect: buff.e,
  };
}

/**
 * Validate shareable data structure
 */
export function isValidShareData(data: unknown): data is ShareableData {
  if (!data || typeof data !== 'object') return false;

  const d = data as Record<string, unknown>;

  // Check required fields
  if (typeof d.v !== 'number') return false;
  if (!d.s || typeof d.s !== 'object') return false;
  if (!d.r || typeof d.r !== 'object') return false;

  // Check setup structure
  const setup = d.s as Record<string, unknown>;
  if (!Array.isArray(setup.t)) return false;

  // Check results structure
  const results = d.r as Record<string, unknown>;
  if (typeof results.td !== 'number') return false;
  if (!Array.isArray(results.turns)) return false;

  return true;
}
