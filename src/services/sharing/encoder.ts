/**
 * Encoder: Converts battle state to compact shareable format
 */

import type { BattleState, Turn, BattleLogEntry, DamageBreakdown, FollowUpAttackLog, AppliedBuffInfo } from '../../types/battle';
import type { TeamMember } from '../../types/character';
import type { SelectedBoss } from '../../types/boss';
import type { SelectedMachineOfWar } from '../../types/machineOfWar';
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
} from './types';

// Default ability level - levels at this value are not stored
const DEFAULT_ABILITY_LEVEL = 54;

/**
 * Encode battle state to compact shareable format
 */
export function encodeBattleState(
  battleState: BattleState,
  team: TeamMember[],
  selectedBoss: SelectedBoss | null,
  selectedMachine: SelectedMachineOfWar | null,
  notes?: string
): ShareableData {
  return {
    v: SHARE_DATA_VERSION,
    s: encodeSetup(team, selectedBoss, selectedMachine),
    r: encodeResults(battleState),
    ...(notes && notes.trim() ? { n: notes.trim().slice(0, 500) } : {}),
  };
}

/**
 * Encode team setup
 */
function encodeSetup(
  team: TeamMember[],
  selectedBoss: SelectedBoss | null,
  selectedMachine: SelectedMachineOfWar | null
): CompactSetup {
  const setup: CompactSetup = {
    t: team.map(encodeTeamMember),
  };

  if (selectedBoss) {
    setup.b = {
      i: selectedBoss.bossId,
      r: selectedBoss.rank,
      m: selectedBoss.applyModifiers,
    };
  }

  if (selectedMachine) {
    setup.m = {
      i: selectedMachine.machineId,
      s: selectedMachine.stars,
    };
  }

  return setup;
}

/**
 * Encode a team member
 */
function encodeTeamMember(member: TeamMember): CompactTeamMember {
  const compact: CompactTeamMember = {
    i: member.id,
    p: member.progressionStepIndex,
    r: member.rank,
  };

  // Only include ability levels that differ from default
  if (member.abilityLevels) {
    const nonDefaultLevels: Record<string, number> = {};
    for (const [abilityId, level] of Object.entries(member.abilityLevels)) {
      if (level !== DEFAULT_ABILITY_LEVEL) {
        nonDefaultLevels[abilityId] = level;
      }
    }
    if (Object.keys(nonDefaultLevels).length > 0) {
      compact.a = nonDefaultLevels;
    }
  }

  // Encode equipment
  if (member.equipment && Object.keys(member.equipment).length > 0) {
    compact.e = Object.entries(member.equipment).map(([slotStr, item]) => ({
      s: parseInt(slotStr, 10),
      i: item.itemId,
      l: item.level,
    }));
  }

  return compact;
}

/**
 * Encode battle results
 */
function encodeResults(battleState: BattleState): CompactResults {
  return {
    td: battleState.totalDamageDealt,
    turns: battleState.turnHistory.map(encodeTurn),
  };
}

/**
 * Encode a single turn
 */
function encodeTurn(turn: Turn): CompactTurn {
  return {
    n: turn.turnNumber,
    logs: turn.log.map(encodeLogEntry),
  };
}

/**
 * Encode a battle log entry
 */
function encodeLogEntry(entry: BattleLogEntry): CompactLogEntry {
  const compact: CompactLogEntry = {
    cid: entry.characterId,
    cn: entry.characterName,
    a: entry.action,
    m: entry.message,
  };

  // Optional fields
  if (entry.characterIconUrl) compact.ci = entry.characterIconUrl;
  if (entry.target) compact.t = entry.target;
  if (entry.damage !== undefined && entry.damage > 0) compact.d = entry.damage;
  if (entry.damageType) compact.dt = entry.damageType;
  if (entry.attackType) compact.at = entry.attackType;
  if (entry.healing !== undefined && entry.healing > 0) compact.h = entry.healing;

  // Damage breakdown
  if (entry.damageBreakdown) {
    compact.bd = encodeDamageBreakdown(entry.damageBreakdown);
  }

  // Follow-up attacks
  if (entry.followUpAttacks && entry.followUpAttacks.length > 0) {
    compact.fu = entry.followUpAttacks.map(encodeFollowUp);
  }

  // Applied buffs
  if (entry.appliedBuffs && entry.appliedBuffs.length > 0) {
    compact.ab = entry.appliedBuffs.map(encodeAppliedBuff);
  }

  return compact;
}

/**
 * Encode damage breakdown
 */
function encodeDamageBreakdown(bd: DamageBreakdown): CompactDamageBreakdown {
  const compact: CompactDamageBreakdown = {
    dmg: bd.damage,
    phd: bd.perHitDamage,
    hits: bd.hits,
    bd: bd.baseDamage,
    fm: bd.flatModifiers,
    cb: bd.critBonus,
    eh: bd.extraHits,
    dvm: bd.damVarMod,
    ta: bd.targetArmor,
    aa: bd.afterArmor,
    pr: bd.pierceRatio,
    pf: bd.pierceFloor,
    aap: bd.afterArmorPierce,
    gm: bd.globalMultiplier,
    bcc: bd.baseCritChance,
    bcd: bd.baseCritDamage,
    ccb: bd.critChanceBonus,
    cdb: bd.critDmgBonus,
    cc: bd.critChance,
    cd: bd.critDamage,
  };

  // Optional sources (only if non-empty)
  if (bd.flatModifierSources?.length) {
    compact.fms = bd.flatModifierSources.map(encodeBuffSource);
  }
  if (bd.critChanceSources?.length) {
    compact.ccs = bd.critChanceSources.map(encodeBuffSource);
  }
  if (bd.critDamageSources?.length) {
    compact.cds = bd.critDamageSources.map(encodeBuffSource);
  }
  if (bd.extraHitsSources?.length) {
    compact.ehs = bd.extraHitsSources.map(encodeBuffSource);
  }
  if (bd.armorIgnored !== undefined && bd.armorIgnored > 0) {
    compact.ai = bd.armorIgnored;
  }
  if (bd.armorIgnoredSources?.length) {
    compact.ais = bd.armorIgnoredSources.map(encodeBuffSource);
  }
  if (bd.effectiveArmor !== undefined) {
    compact.ea = bd.effectiveArmor;
  }
  if (bd.pierceRatioBonus !== undefined && bd.pierceRatioBonus > 0) {
    compact.prb = bd.pierceRatioBonus;
  }
  if (bd.pierceRatioBonusSources?.length) {
    compact.prbs = bd.pierceRatioBonusSources.map(encodeBuffSource);
  }
  if (bd.effectivePierceRatio !== undefined) {
    compact.epr = bd.effectivePierceRatio;
  }
  if (bd.globalMultiplierSources?.length) {
    compact.gms = bd.globalMultiplierSources.map(encodeBuffSource);
  }
  if (bd.globalDamageBonus !== undefined && bd.globalDamageBonus > 0) {
    compact.gdb = bd.globalDamageBonus;
  }
  if (bd.globalDamageBonusSources?.length) {
    compact.gdbs = bd.globalDamageBonusSources.map(encodeBuffSource);
  }

  // Block reduction
  if (bd.expectedBlocks !== undefined && bd.expectedBlocks > 0) {
    compact.eb = bd.expectedBlocks;
  }
  if (bd.blockReductionPerHit !== undefined) {
    compact.brph = bd.blockReductionPerHit;
  }
  if (bd.totalBlockReduction !== undefined && bd.totalBlockReduction > 0) {
    compact.tbr = bd.totalBlockReduction;
  }

  return compact;
}

/**
 * Encode buff source
 */
function encodeBuffSource(source: BuffSource): CompactBuffSource {
  const compact: CompactBuffSource = {
    n: source.name,
  };

  // Only include non-zero values
  if (source.damageBonus !== undefined && source.damageBonus !== 0) {
    compact.db = source.damageBonus;
  }
  if (source.damageMultiplier !== undefined && source.damageMultiplier !== 0 && source.damageMultiplier !== 1) {
    compact.dm = source.damageMultiplier;
  }
  if (source.critChanceBonus !== undefined && source.critChanceBonus !== 0) {
    compact.ccb = source.critChanceBonus;
  }
  if (source.critDamageBonus !== undefined && source.critDamageBonus !== 0) {
    compact.cdb = source.critDamageBonus;
  }
  if (source.extraHits !== undefined && source.extraHits !== 0) {
    compact.eh = source.extraHits;
  }
  if (source.armorIgnored !== undefined && source.armorIgnored !== 0) {
    compact.ai = source.armorIgnored;
  }
  if (source.pierceRatioBonus !== undefined && source.pierceRatioBonus !== 0) {
    compact.prb = source.pierceRatioBonus;
  }
  if (source.globalDamageBonus !== undefined && source.globalDamageBonus !== 0) {
    compact.gdb = source.globalDamageBonus;
  }

  return compact;
}

/**
 * Encode follow-up attack
 */
function encodeFollowUp(followUp: FollowUpAttackLog): CompactFollowUp {
  const compact: CompactFollowUp = {
    an: followUp.abilityName,
    dmg: followUp.damage,
    hits: followUp.hits,
    dt: followUp.damageType,
  };

  if (followUp.attackType) compact.at = followUp.attackType;
  if (followUp.breakdown) compact.bd = encodeDamageBreakdown(followUp.breakdown);
  if (followUp.appliedBuffs?.length) {
    compact.ab = followUp.appliedBuffs.map(encodeAppliedBuff);
  }
  if (followUp.sourceCharacterId) compact.scid = followUp.sourceCharacterId;
  if (followUp.sourceCharacterName) compact.scn = followUp.sourceCharacterName;

  return compact;
}

/**
 * Encode applied buff
 */
function encodeAppliedBuff(buff: AppliedBuffInfo): CompactAppliedBuff {
  const compact: CompactAppliedBuff = {
    n: buff.name,
  };
  if (buff.sourceName) compact.sn = buff.sourceName;
  if (buff.effect) compact.e = buff.effect;
  return compact;
}
