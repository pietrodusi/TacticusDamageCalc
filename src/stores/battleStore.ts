import { create } from 'zustand';
import type { TeamMember, BattleState, BattleCharacter, Action, TurnAction, BattleLogEntry, DamageBreakdown, FollowUpAttackLog, Boss, AppliedBuffInfo, BuffEvaluationContext, DamageType, SelectedMachineOfWar } from '../types';
import { calculateStats, calculateEquipmentStats, getBossAbilityConstantModifiers, getMachineOfWarDamageBonus, getSummonUnitData, getSummonIconUrl } from '../services/dataService';
import { DamageCalculator, type AttackerStats, type DefenderStats, type DamageCaps, type BuffSource, evaluateTraitModifiers, type TraitContext } from '../services/damage';
import { initializeCooldowns, advanceCooldowns, isAbilityReady, useAbility, unuseAbility, resetCooldowns, evaluatePassiveAbilities, combineModifiers, getCharacterAuraBonuses, getAbilityValues, executeActiveAbility, getAbilityNameSync } from '../services/abilities';
import { getApplicableBuffs, combineBuffEffects, addBuffToPool, getBuffTemplate, expireBuffs } from '../services/buffs';
import { hasMechanicalTrait } from '../utils/traitUtils';

const MAX_TURNS = 6;

/**
 * Helper to check if a toggle is active (for boolean toggles in abilityToggles that can also contain numbers for counters)
 */
const isToggleActive = (value: boolean | number | undefined): boolean => value === true;

// Safe deep clone function - uses structuredClone with JSON fallback
function deepClone<T>(obj: T): T {
  try {
    return structuredClone(obj);
  } catch {
    // Fallback to JSON for environments where structuredClone fails
    return JSON.parse(JSON.stringify(obj));
  }
}

// Individual damage bonus source for tracking (e.g., EarlyWarningOverride, LionHelm)
interface DamageBonusSource {
  name: string;
  bonus: number;
}

// Options for executeAttack to support Galvanic Field triggered attacks
interface ExecuteAttackOptions {
  damageMultiplier?: number;    // GalvanicField dmgPct (e.g., 0.80 for 80%)
  perHitDamageCap?: number;     // DEPRECATED - use finalDamageCap instead
  baseDamageCap?: number;        // NEW: Cap 1 - "Its Own Damage" (e.g., Galvanic Field)
  preArmorCap?: number;          // NEW: Cap 2 - "Pre-Armour Damage" (e.g., Psychic Stalk)
  finalDamageCap?: number;       // NEW: Cap 3 - "The Hit" (e.g., Astartes Banner)
  baseDamageBonus?: number;     // Extra flat damage bonus (e.g., Overwatch +extraDmg) - DEPRECATED: use damageBonusSources
  damageBonusSources?: DamageBonusSource[];  // Individual damage bonus sources for detailed display
  skipStateUpdates?: boolean;   // Don't update hasActed, hasAttackedThisBattle, etc.
  abilityName?: string;         // For log display (e.g., "Galvanic Field")
  isOverwatchAttack?: boolean;  // Flag for Overwatch attack (for follow-ups like CyclicIonBlaster)
  isTheQuickeningAttack?: boolean;  // Flag for The Quickening ability (Mephiston)
}

// Result from triggerOptimisedGait helper
interface OptimisedGaitResult {
  totalDamage: number;           // OG damage + Chordclaw follow-up damage
  prophetCounter: number;        // Updated prophet attack counter
  maxPerHitDamage: number;       // Max per-hit damage for Laviscus outrage
  followUpLogs: FollowUpAttackLog[];  // Log entries for OG and Chordclaw
  exitorRhoId: string;           // ID of Exitor-Rho for damage tracking update
  exitorRhoUsedFirstSpecial: boolean; // Flag to track if LC +2 hits were used
}

// Parameters for triggerOptimisedGait helper
interface OptimisedGaitParams {
  triggeringAttackerId: string;      // ID of the character that triggered OG
  triggeringAttackerName: string;    // Name for logging
  triggeringAttackerTraits?: string[]; // Traits to check for Mechanical
  battleState: BattleState;
  defenderStats: DefenderStats;
  bossArmor: number;
  ignoreCrit: boolean;
  prophetAttackCounter: number;
  prophetThreshold: number;
  prophetReductionPct: number;
  prophetMultiplier: number;
  hasExitorRhoUsedFirstSpecial?: boolean; // Track if LC +2 hits already used this turn
}

/**
 * Triggers Optimised Gait reaction when a Mechanical ally attacks the boss.
 * Also triggers Chordclaw follow-up if Exitor-Rho has the buff active.
 *
 * @returns OptimisedGaitResult if OG triggers, null otherwise
 */
function triggerOptimisedGait(params: OptimisedGaitParams): OptimisedGaitResult | null {
  const {
    triggeringAttackerId,
    triggeringAttackerName,
    triggeringAttackerTraits,
    battleState,
    defenderStats,
    bossArmor,
    ignoreCrit,
    prophetAttackCounter: initialProphetCounter,
    prophetThreshold,
    prophetReductionPct,
    prophetMultiplier,
    hasExitorRhoUsedFirstSpecial = false,
  } = params;

  let prophetCounter = initialProphetCounter;

  // Only triggers for Mechanical attackers (Vehicle and LivingMetal also count as Mechanical)
  const attackerHasMechanical = hasMechanicalTrait(triggeringAttackerTraits);
  if (!attackerHasMechanical) return null;

  // Find Exitor-Rho in team (different character from attacker) with OptimizedGait and adjacentToBoss enabled
  const exitorRho = battleState.team.find(
    c => c.id !== triggeringAttackerId &&
         c.passiveAbilities.includes('OptimizedGait') &&
         c.abilityToggles['adjacentToBoss']
  );

  if (!exitorRho) return null;

  console.log('\n--- OPTIMISED GAIT REACTION ---');
  console.log(`Triggered by ${triggeringAttackerName} (Mechanical)`);

  const followUpLogs: FollowUpAttackLog[] = [];
  let totalDamage = 0;
  let maxPerHitDamage = 0;

  // Get ability values for OptimizedGait
  const ogAbilityLevel = exitorRho.abilityLevels?.OptimizedGait ?? 54;
  const ogValues = getAbilityValues('OptimizedGait', ogAbilityLevel, exitorRho.progressionStepIndex);
  const ogMinDmg = (ogValues?.minDmg as number) || 0;
  const ogMaxDmg = (ogValues?.maxDmg as number) || 0;
  const ogHits = (ogValues?.nrOfHits as number) || 2;
  const ogAvgDamage = Math.round((ogMinDmg + ogMaxDmg) / 2);

  // Get Exitor-Rho's equipment stats for crit calculations
  const ogEquipmentStats = calculateEquipmentStats(exitorRho.equipment);

  // Check if this is Exitor-Rho's first special attack of the turn (for LC +2 hits)
  // Combine character state with cumulative tracking from current executeAttack call
  const hasAlreadyUsedFirstSpecial = exitorRho.hasUsedFirstSpecialAttackThisTurn || hasExitorRhoUsedFirstSpecial;

  // Create effective Exitor-Rho with updated hasUsedFirstSpecialAttackThisTurn for buff evaluation
  // This ensures LC +2 hits only applies to the first special attack (not subsequent OG triggers)
  const effectiveExitorRho = hasAlreadyUsedFirstSpecial
    ? { ...exitorRho, hasUsedFirstSpecialAttackThisTurn: true }
    : exitorRho;

  // Build buff pool evaluation context for Optimised Gait (SPECIAL melee attack)
  const ogBuffContext: BuffEvaluationContext = {
    attacker: effectiveExitorRho,  // Use effective state for buff evaluation
    attackType: 'melee',
    attackCategory: 'special',  // SPECIAL attack - gets LC +2 hits on first special per turn
    target: battleState.boss,
    battleState: battleState,
  };

  // Get applicable buffs from the pool
  const ogApplicableBuffs = getApplicableBuffs(battleState.buffPool, ogBuffContext);
  const ogPoolEffects = combineBuffEffects(ogApplicableBuffs);

  // Extract bonuses from pool effects
  const ogExtraDmg = ogPoolEffects.baseDamageBonus || 0;
  const ogExtraHits = ogPoolEffects.extraHits || 0;
  const ogArmorIgnored = ogPoolEffects.armorIgnored || 0;
  const ogPoolMultiplier = ogPoolEffects.baseDamageMultiplier || 1;

  // High Ground: +50% damage multiplier when toggle is enabled
  const ogHighGroundMultiplier = exitorRho.abilityToggles['HighGround'] ? 1.5 : 1;

  // War Machine: dynamic damage multiplier based on selected Machine of War
  const ogWarMachineMultiplier = exitorRho.abilityToggles['WarMachine'] && battleState.machineOfWar
    ? 1 + battleState.machineOfWar.extraDmgPct / 100
    : 1;

  const ogDamageMultiplier = ogPoolMultiplier * ogHighGroundMultiplier * ogWarMachineMultiplier;

  // Build buff sources for breakdown display
  type OGBuffSource = { name: string; sourceName?: string; damageBonus?: number; extraHits?: number; armorIgnored?: number; damageMultiplier?: number };
  const ogBuffSources: OGBuffSource[] = [];

  for (const poolBuff of ogApplicableBuffs) {
    const effects = poolBuff.effects;
    const source: OGBuffSource = { name: poolBuff.name };
    if (effects.baseDamageBonus) source.damageBonus = effects.baseDamageBonus;
    if (effects.extraHits) source.extraHits = effects.extraHits;
    if (effects.armorIgnored) source.armorIgnored = effects.armorIgnored;
    if (effects.baseDamageMultiplier && effects.baseDamageMultiplier !== 1) source.damageMultiplier = effects.baseDamageMultiplier;
    if (Object.keys(source).length > 1) ogBuffSources.push(source);
  }

  // Add High Ground buff source for display
  if (ogHighGroundMultiplier > 1) {
    ogBuffSources.push({
      name: 'High Ground',
      damageMultiplier: ogHighGroundMultiplier,
    });
  }

  // Add Machine of War buff source for display
  if (ogWarMachineMultiplier > 1 && battleState.machineOfWar) {
    ogBuffSources.push({
      name: `Machine of War (+${battleState.machineOfWar.extraDmgPct}%)`,
      damageMultiplier: ogWarMachineMultiplier,
    });
  }

  const hasOGModifiers = ogExtraDmg > 0 || ogExtraHits > 0 || ogArmorIgnored > 0 || ogDamageMultiplier !== 1;

  // Build attacker stats for Optimised Gait reaction
  const ogAttackerStats: AttackerStats = {
    baseDamage: ogAvgDamage + ogExtraDmg,
    damageType: 'Energy',  // Energy damage (respects armor)
    hits: ogHits,  // Extra hits come via abilityModifiers, not added to base
    critChance: ogEquipmentStats.critChance || 0,
    critDamage: ogEquipmentStats.critDmg || 0,
    critChanceBonus: ogEquipmentStats.critChanceBonus || 0,
    critDmgBonus: ogEquipmentStats.critDmgBonus || 0,
    ignoreCrit,
    traits: exitorRho.traits,
    hasMoved: true,
    attackType: 'melee',
    hasAttackedThisBattle: exitorRho.hasAttackedThisBattle,
    abilityModifiers: hasOGModifiers ? {
      baseDamageBonus: ogExtraDmg > 0 ? ogExtraDmg : undefined,
      extraHits: ogExtraHits > 0 ? ogExtraHits : undefined,
      armorIgnored: ogArmorIgnored > 0 ? ogArmorIgnored : undefined,
      baseDamageMultiplier: ogDamageMultiplier !== 1 ? ogDamageMultiplier : undefined,
      buffSources: ogBuffSources,
    } : undefined,
  };

  // Calculate Optimised Gait reaction damage
  const ogCalculator = new DamageCalculator(true);
  const ogResult = ogCalculator.calculate(ogAttackerStats, defenderStats);

  // Apply Prophet of Gork and Mork damage reduction if active
  let ogProphetReduction = 1;
  if (prophetCounter >= prophetThreshold && prophetReductionPct > 0) {
    ogProphetReduction = prophetMultiplier;
    console.log(`[Prophet of Gork and Mork: -${prophetReductionPct}% damage on Optimised Gait (attack ${prophetCounter + 1})]`);
  }
  const adjustedOGDamage = Math.round(ogResult.damage * ogProphetReduction);

  // Increment attack counter for Optimised Gait
  prophetCounter++;

  totalDamage += adjustedOGDamage;
  maxPerHitDamage = Math.max(maxPerHitDamage, ogResult.perHitDamage);

  // Build breakdown for Optimised Gait reaction
  const ogBreakdown: DamageBreakdown = {
    damage: ogResult.damage,
    perHitDamage: ogResult.perHitDamage,
    hits: ogResult.totalHits,
    baseDamage: ogResult.baseDamage,
    flatModifiers: ogResult.flatModifiers,
    flatModifierSources: ogResult.flatModifierSources,
    critBonus: ogResult.critBonus,
    critChanceSources: ogResult.critChanceSources,
    critDamageSources: ogResult.critDamageSources,
    extraHits: ogResult.extraHits,
    extraHitsSources: ogResult.extraHitsSources,
    damVarMod: ogResult.damVarMod,
    targetArmor: bossArmor,
    armorIgnored: ogResult.armorIgnored,
    armorIgnoredSources: ogResult.armorIgnoredSources,
    effectiveArmor: ogResult.effectiveArmor,
    afterArmor: ogResult.afterArmor,
    pierceRatio: ogResult.pierceRatio,
    pierceFloor: ogResult.pierceFloor,
    afterArmorPierce: ogResult.afterArmorPierce,
    globalMultiplier: ogResult.globalMultiplier,
    globalMultiplierSources: ogResult.globalMultiplierSources,
    baseCritChance: ogResult.baseCritChance,
    baseCritDamage: ogResult.baseCritDamage,
    critChanceBonus: ogResult.critChanceTotalBonus,
    critDmgBonus: ogResult.critDamageTotalBonus,
    critChance: ogResult.effectiveCritChance * 100,
    critDamage: ogResult.effectiveCritDamage,
    traitModifiers: ogResult.traitModifiers,
    traitMultiplier: ogResult.traitMultiplier,
    // Block reduction (Daemon trait)
    expectedBlocks: ogResult.expectedBlocks,
    blockReductionPerHit: ogResult.blockReductionPerHit,
    totalBlockReduction: ogResult.totalBlockReduction,
  };

  // Add Prophet of Gork and Mork to global multiplier if active
  if (ogProphetReduction < 1) {
    ogBreakdown.globalMultiplier = (ogBreakdown.globalMultiplier || 1) * ogProphetReduction;
    ogBreakdown.globalMultiplierSources = [
      ...(ogBreakdown.globalMultiplierSources || []),
      { name: 'Prophet of Gork and Mork', damageMultiplier: ogProphetReduction }
    ];
    ogBreakdown.damage = adjustedOGDamage;
    ogBreakdown.perHitDamage = Math.round(ogBreakdown.perHitDamage * ogProphetReduction);
  }

  followUpLogs.push({
    abilityName: `Optimised Gait (${exitorRho.name})`,
    damage: adjustedOGDamage,
    hits: ogResult.totalHits,
    damageType: 'Energy',
    attackType: 'melee',
    breakdown: ogBreakdown,
    // Attribute damage to Exitor-Rho, not the triggering attacker
    sourceCharacterId: exitorRho.id,
    sourceCharacterName: exitorRho.name,
  });

  console.log(`Optimised Gait: ${ogHits}x ${ogAvgDamage} Energy = ${adjustedOGDamage.toLocaleString()}`);

  // Check if Exitor-Rho has Chordclaw buff active - if so, add Chordclaw follow-up
  if (exitorRho.cordClawActive) {
    console.log('\n--- CHORDCLAW FOLLOW-UP (from Optimised Gait) ---');

    const cordClawMinDmg = exitorRho.cordClawMinDmg || 0;
    const cordClawMaxDmg = exitorRho.cordClawMaxDmg || 0;
    const cordClawHits = exitorRho.cordClawHits || 2;
    const cordClawAvgDamage = Math.round((cordClawMinDmg + cordClawMaxDmg) / 2);

    // Build buff pool evaluation context for Chordclaw (additional melee attack)
    // Uses 'normal' attackCategory since it's an additional attack like CIB
    const cordClawBuffContext: BuffEvaluationContext = {
      attacker: exitorRho,
      attackType: 'melee',
      attackCategory: 'normal',
      target: battleState.boss,
      battleState: battleState,
    };

    // Get applicable buffs from the pool
    const cordClawApplicableBuffs = getApplicableBuffs(battleState.buffPool, cordClawBuffContext);
    const cordClawPoolEffects = combineBuffEffects(cordClawApplicableBuffs);

    // Extract bonuses from pool effects
    const cordClawExtraDmg = cordClawPoolEffects.baseDamageBonus || 0;
    // Chordclaw is additional hits like CIB - doesn't get MA/LC bonus
    const cordClawExtraHits = 0;
    const cordClawArmorIgnored = cordClawPoolEffects.armorIgnored || 0;
    const poolCordClawMultiplier = cordClawPoolEffects.baseDamageMultiplier || 1;

    // High Ground: +50% damage multiplier when toggle is enabled
    const cordClawHighGroundMultiplier = exitorRho.abilityToggles['HighGround'] ? 1.5 : 1;

    // War Machine: dynamic damage multiplier based on selected Machine of War
    const cordClawWarMachineMultiplier = exitorRho.abilityToggles['WarMachine'] && battleState.machineOfWar
      ? 1 + battleState.machineOfWar.extraDmgPct / 100
      : 1;

    const cordClawDamageMultiplier = poolCordClawMultiplier * cordClawHighGroundMultiplier * cordClawWarMachineMultiplier;

    // Build buff sources for breakdown display
    type CordClawBuffSource = { name: string; sourceName?: string; damageBonus?: number; extraHits?: number; armorIgnored?: number; damageMultiplier?: number };
    const cordClawBuffSources: CordClawBuffSource[] = [];

    for (const poolBuff of cordClawApplicableBuffs) {
      const effects = poolBuff.effects;
      const source: CordClawBuffSource = { name: poolBuff.name };
      if (effects.baseDamageBonus) source.damageBonus = effects.baseDamageBonus;
      if (effects.extraHits) source.extraHits = effects.extraHits;
      if (effects.armorIgnored) source.armorIgnored = effects.armorIgnored;
      if (effects.baseDamageMultiplier && effects.baseDamageMultiplier !== 1) source.damageMultiplier = effects.baseDamageMultiplier;
      if (Object.keys(source).length > 1) cordClawBuffSources.push(source);
    }

    // Add High Ground buff source for display
    if (cordClawHighGroundMultiplier > 1) {
      cordClawBuffSources.push({
        name: 'High Ground',
        damageMultiplier: cordClawHighGroundMultiplier,
      });
    }

    // Add Machine of War buff source for display
    if (cordClawWarMachineMultiplier > 1 && battleState.machineOfWar) {
      cordClawBuffSources.push({
        name: `Machine of War (+${battleState.machineOfWar.extraDmgPct}%)`,
        damageMultiplier: cordClawWarMachineMultiplier,
      });
    }

    const hasCordClawModifiers = cordClawExtraDmg > 0 || cordClawExtraHits > 0 || cordClawArmorIgnored > 0 || cordClawDamageMultiplier !== 1;

    // Build attacker stats for Chordclaw follow-up
    const cordClawAttackerStats: AttackerStats = {
      baseDamage: cordClawAvgDamage + cordClawExtraDmg,
      damageType: 'DirectDamage',  // DirectDamage bypasses armor
      hits: cordClawHits + cordClawExtraHits,
      critChance: ogEquipmentStats.critChance || 0,
      critDamage: ogEquipmentStats.critDmg || 0,
      critChanceBonus: ogEquipmentStats.critChanceBonus || 0,
      critDmgBonus: ogEquipmentStats.critDmgBonus || 0,
      ignoreCrit,
      traits: exitorRho.traits,
      hasMoved: true,
      attackType: 'melee',
      hasAttackedThisBattle: true,
      abilityModifiers: hasCordClawModifiers ? {
        baseDamageBonus: cordClawExtraDmg > 0 ? cordClawExtraDmg : undefined,
        extraHits: cordClawExtraHits > 0 ? cordClawExtraHits : undefined,
        armorIgnored: cordClawArmorIgnored > 0 ? cordClawArmorIgnored : undefined,
        baseDamageMultiplier: cordClawDamageMultiplier !== 1 ? cordClawDamageMultiplier : undefined,
        buffSources: cordClawBuffSources,
      } : undefined,
    };

    // Calculate Chordclaw follow-up damage
    const cordClawCalculator = new DamageCalculator(true);
    const cordClawResult = cordClawCalculator.calculate(cordClawAttackerStats, defenderStats);

    console.log(`Chordclaw: ${cordClawResult.totalHits}x ${cordClawResult.perHitDamage} = ${cordClawResult.damage}`);

    // Prophet of Gork and Mork: Apply damage reduction to Chordclaw follow-up
    let cordClawProphetReduction = 1;
    if (prophetCounter >= prophetThreshold && prophetReductionPct > 0) {
      cordClawProphetReduction = prophetMultiplier;
      console.log(`[Prophet of Gork and Mork: -${prophetReductionPct}% damage on Chordclaw (attack ${prophetCounter + 1})]`);
    }
    const adjustedCordClawDamage = Math.round(cordClawResult.damage * cordClawProphetReduction);

    // Increment attack counter for Chordclaw (it's a follow-up attack, counts as a separate attack)
    prophetCounter++;

    totalDamage += adjustedCordClawDamage;
    maxPerHitDamage = Math.max(maxPerHitDamage, cordClawResult.perHitDamage);

    // Build breakdown for Chordclaw follow-up
    const cordClawBreakdown: DamageBreakdown = {
      damage: cordClawResult.damage,
      perHitDamage: cordClawResult.perHitDamage,
      hits: cordClawResult.totalHits,
      baseDamage: cordClawResult.baseDamage,
      flatModifiers: cordClawResult.flatModifiers,
      flatModifierSources: cordClawResult.flatModifierSources,
      critBonus: cordClawResult.critBonus,
      critChanceSources: cordClawResult.critChanceSources,
      critDamageSources: cordClawResult.critDamageSources,
      extraHits: cordClawResult.extraHits,
      extraHitsSources: cordClawResult.extraHitsSources,
      damVarMod: cordClawResult.damVarMod,
      targetArmor: bossArmor,
      armorIgnored: cordClawResult.armorIgnored,
      armorIgnoredSources: cordClawResult.armorIgnoredSources,
      effectiveArmor: cordClawResult.effectiveArmor,
      afterArmor: cordClawResult.afterArmor,
      pierceRatio: cordClawResult.pierceRatio,
      pierceFloor: cordClawResult.pierceFloor,
      afterArmorPierce: cordClawResult.afterArmorPierce,
      globalMultiplier: cordClawResult.globalMultiplier,
      globalMultiplierSources: cordClawResult.globalMultiplierSources,
      baseCritChance: cordClawResult.baseCritChance,
      baseCritDamage: cordClawResult.baseCritDamage,
      critChanceBonus: cordClawResult.critChanceTotalBonus,
      critDmgBonus: cordClawResult.critDamageTotalBonus,
      critChance: cordClawResult.effectiveCritChance * 100,
      critDamage: cordClawResult.effectiveCritDamage,
      traitModifiers: cordClawResult.traitModifiers,
      traitMultiplier: cordClawResult.traitMultiplier,
      // Block reduction (Daemon trait)
      expectedBlocks: cordClawResult.expectedBlocks,
      blockReductionPerHit: cordClawResult.blockReductionPerHit,
      totalBlockReduction: cordClawResult.totalBlockReduction,
    };

    // Add Prophet of Gork and Mork to global multiplier if active
    if (cordClawProphetReduction < 1) {
      cordClawBreakdown.globalMultiplier = (cordClawBreakdown.globalMultiplier || 1) * cordClawProphetReduction;
      cordClawBreakdown.globalMultiplierSources = [
        ...(cordClawBreakdown.globalMultiplierSources || []),
        { name: 'Prophet of Gork and Mork', damageMultiplier: cordClawProphetReduction }
      ];
      cordClawBreakdown.damage = adjustedCordClawDamage;
      cordClawBreakdown.perHitDamage = Math.round(cordClawBreakdown.perHitDamage * cordClawProphetReduction);
    }

    followUpLogs.push({
      abilityName: 'Chordclaw (from Optimised Gait)',
      damage: adjustedCordClawDamage,
      hits: cordClawResult.totalHits,
      damageType: 'DirectDamage',
      breakdown: cordClawBreakdown,
      // Attribute damage to Exitor-Rho, not the triggering attacker
      sourceCharacterId: exitorRho.id,
      sourceCharacterName: exitorRho.name,
    });

    console.log(`Total with Chordclaw: ${totalDamage.toLocaleString()}`);
  }

  console.log(`Total Optimised Gait reaction: ${totalDamage.toLocaleString()}`);

  // Track if LC +2 hits were applied to Exitor-Rho's first special attack
  // ogExtraHits comes from ogPoolEffects which includes LC bonus from buffPool
  const exitorRhoUsedFirstSpecial = !hasAlreadyUsedFirstSpecial && ogExtraHits > 0;

  return {
    totalDamage,
    prophetCounter,
    maxPerHitDamage,
    followUpLogs,
    exitorRhoId: exitorRho.id,
    exitorRhoUsedFirstSpecial,
  };
}

function createBattleCharacter(character: TeamMember, index: number): BattleCharacter {
  // Calculate stats based on progression and rank
  const stats = calculateStats(character, character.progressionStepIndex, character.rank);

  // Initialize ability cooldowns for active abilities
  const allAbilities = [...character.activeAbilities, ...character.passiveAbilities];
  const abilityCooldowns = initializeCooldowns(allAbilities);

  // Initialize Doctrina Imperatives stance (default: Protector) and armor buff
  const hasDoctrinaImperatives = character.activeAbilities.includes('DoctrinaImperatives');
  let doctrinaStance: 'protector' | 'conqueror' | null = null;
  let initialActiveBuffs: import('../services/abilities/types').AbilityStatModifier[] = [];
  if (hasDoctrinaImperatives) {
    doctrinaStance = 'protector';  // Default stance is Protector
    const doctrinaValues = getAbilityValues('DoctrinaImperatives', character.abilityLevels?.DoctrinaImperatives ?? 54, character.progressionStepIndex);
    if (doctrinaValues) {
      const extraArmor = doctrinaValues.extraArmor as number || 0;
      initialActiveBuffs = [{ abilityName: 'Doctrina Imperatives', armorBonus: extraArmor }];
    }
  }

  return {
    ...character,
    currentHealth: stats.health,
    position: { x: index, y: 0 },
    hasMoved: false,
    hasActed: false,
    turnEnded: false,
    buffs: [],
    debuffs: [],
    calculatedDamage: stats.damage,
    calculatedHealth: stats.health,
    calculatedArmour: stats.armour,
    totalDamageDealt: 0,
    hasAttackedThisBattle: false,
    attacksThisTurn: 0,
    firstAttackTurn: null,  // Track the turn when character first attacked (for RapidAssault)
    attackTurnsCount: 0,  // Track turns with attacks for LegacyOfCombat
    totalAttacksThisBattle: 0,  // Track total attacks for FirstAmongTraitors
    hasUsedAbilityThisTurn: false,  // Track ability usage
    // Legendary Commander tracking
    hasQualifiedForLCDamage: false,  // LC damage buff qualified (adjacent + ability used)
    pendingLCQualification: false,   // Waiting for first special attack to complete
    hasUsedFirstSpecialAttackThisTurn: false,  // Per-character: for LC +2 hits
    // Ability state
    abilityCooldowns,
    abilityToggles: {},  // User enables these via UI
    activeBuffs: initialActiveBuffs,
    // Laviscus's Refusal to be Outdone passive tracking
    outrage: 0,
    outrageContributors: [],
    // Tan Gi'da's Doctrina Imperatives stance (default: Protector)
    doctrinaImperativeStance: doctrinaStance,
  };
}

interface BattleStore {
  battleState: BattleState | null;
  turnStartSnapshot: BattleState | null;  // Snapshot of state at turn start for undo
  currentTurnActions: TurnAction[];
  editingTurn: number | null; // null = current turn, number = editing a past turn

  // Battle lifecycle
  startBattle: (characters: TeamMember[], boss?: Boss, machineOfWar?: SelectedMachineOfWar) => void;
  endBattle: () => void;
  resetBattle: () => void;

  // Turn management
  nextTurn: (turnLog?: BattleLogEntry[]) => void;
  finishBattle: (turnLog?: BattleLogEntry[]) => void;
  canAdvanceTurn: () => boolean;
  setEditingTurn: (turn: number | null) => void;
  getActiveTurn: () => number;

  // Actions
  addAction: (characterId: string, action: Action) => void;
  removeAction: (characterId: string, actionIndex: number) => void;
  clearCharacterActions: (characterId: string) => void;
  resetCharacterTurn: (characterId: string, damageToSubtract: number) => void;
  resetCharacterTurnAtTurn: (characterId: string, turn: number, damageToSubtract: number) => void;
  restoreTurnStart: () => void;  // Restore entire turn to start state

  // Character state
  updateCharacterHealth: (characterId: string, newHealth: number) => void;
  setCharacterMoved: (characterId: string, moved: boolean) => void;
  setCharacterActed: (characterId: string, acted: boolean) => void;
  setCharacterTurnEnded: (characterId: string, ended: boolean) => void;

  // Damage calculation (placeholder - to be expanded)
  calculateDamage: (attackerId: string, targetId: string, attackType?: 'melee' | 'ranged') => number;
  executeAttack: (attackerId: string, targetId: string, attackType?: 'melee' | 'ranged', options?: ExecuteAttackOptions) => BattleLogEntry;

  // Ability management
  toggleAbility: (characterId: string, abilityId: string, counterValue?: number) => void;
  isAbilityReady: (characterId: string, abilityId: string) => boolean;
  executeAbility: (characterId: string, abilityId: string) => BattleLogEntry;
  markAbilityUsed: (characterId: string, abilityId: string) => void;
  refreshAbilityCooldown: (characterId: string, abilityId: string) => void;

  // Battle settings
  setIgnoreCrit: (ignore: boolean) => void;
  setBossMarkerlight: (hasMarkerlight: boolean) => void;

  // Repair action (Actus's Mechanic trait and DefendTheDivineWork)
  setPendingRepairAction: (action: import('../types').PendingRepairAction | null) => void;
  executeRepairWithGalvanicField: (
    repairerId: string,
    targetIds: string[],
    healAmount: number,
    attackTypeChoices: Record<string, 'melee' | 'ranged'>
  ) => BattleLogEntry[];

  // Summon management
  addSummon: (summon: import('../types').BattleSummon) => void;
  removeSummon: (summonId: string) => void;
  updateSummonCount: (summonId: string, count: number) => void;
  toggleSummonBuffCondition: (summonId: string, conditionId: string) => void;
  executeSummonAttack: (summonId: string, attackType: 'melee' | 'ranged') => BattleLogEntry;

  spawnPossessionSummon: (characterId: string, unitType: 'bloodletter' | 'blueHorror') => void;

  // Special ability executions
  executeTheBetrayerBonus: (characterId: string) => BattleLogEntry;
  executeOverwatchAttack: (characterId: string) => BattleLogEntry;
  executeFuryOfTheAncients: (characterId: string) => BattleLogEntry;
  executeMartialSuperiority: (characterId: string) => BattleLogEntry;
  executeHatefulAssault: (characterId: string) => BattleLogEntry;
  executeUnwaveringSentinel: (characterId: string) => BattleLogEntry;
  executeTheQuickening: (casterId: string, targetId: string) => BattleLogEntry;
  applyBloodChaliceBuff: (casterId: string, targetIds: string[], extraPierceRatio: number) => void;
}

export const useBattleStore = create<BattleStore>((set, get) => ({
  battleState: null,
  turnStartSnapshot: null,
  currentTurnActions: [],
  editingTurn: null,

  startBattle: (characters, boss, machineOfWar) => {
    const battleCharacters = characters.map((char, index) =>
      createBattleCharacter(char, index)
    );

    // Initialize buff pool - add LC buffs if Trajann is in team
    let buffPool: import('../types/buff').PooledBuff[] = [];
    const trajann = battleCharacters.find(c => c.passiveAbilities.includes('LegendaryCommander'));
    if (trajann) {
      const lcDamageTemplate = getBuffTemplate('legendary_commander_damage');
      const lcHitsTemplate = getBuffTemplate('legendary_commander_hits');
      const lcValues = getAbilityValues('LegendaryCommander', trajann.abilityLevels?.LegendaryCommander ?? 54, trajann.progressionStepIndex);

      if (lcValues && lcDamageTemplate) {
        buffPool = addBuffToPool(buffPool, lcDamageTemplate, trajann, lcValues as Record<string, number>, 1);
      }
      if (lcValues && lcHitsTemplate) {
        buffPool = addBuffToPool(buffPool, lcHitsTemplate, trajann, lcValues as Record<string, number>, 1);
      }
    }

    // Initialize Way of the Short Blade aura buff if Farsight is in team
    const farsight = battleCharacters.find(c => c.passiveAbilities.includes('WayOfTheShortBlade'));
    if (farsight) {
      const wotsTemplate = getBuffTemplate('way_of_the_short_blade_aura');
      const wotsValues = getAbilityValues('WayOfTheShortBlade', farsight.abilityLevels?.WayOfTheShortBlade ?? 54, farsight.progressionStepIndex);

      if (wotsValues && wotsTemplate) {
        buffPool = addBuffToPool(buffPool, wotsTemplate, farsight, wotsValues as Record<string, number>, 1);
      }
    }

    // Initialize Doom aura buffs if Eldryon is in team
    const eldryon = battleCharacters.find(c => c.passiveAbilities.includes('Doom'));
    if (eldryon) {
      const doomNonAeldariTemplate = getBuffTemplate('doom_non_aeldari');
      const doomAeldariTemplate = getBuffTemplate('doom_aeldari');
      const doomValues = getAbilityValues('Doom', eldryon.abilityLevels?.Doom ?? 54, eldryon.progressionStepIndex);

      if (doomValues && doomNonAeldariTemplate) {
        buffPool = addBuffToPool(buffPool, doomNonAeldariTemplate, eldryon, doomValues as Record<string, number>, 1);
      }
      if (doomValues && doomAeldariTemplate) {
        buffPool = addBuffToPool(buffPool, doomAeldariTemplate, eldryon, doomValues as Record<string, number>, 1);
      }
    }

    // Initialize Structural Analyser aura buff if Darkstrider is in team
    const darkstrider = battleCharacters.find(c => c.passiveAbilities.includes('StructuralAnalyser'));
    if (darkstrider) {
      const saTemplate = getBuffTemplate('structural_analyser_aura');
      const saValues = getAbilityValues('StructuralAnalyser', darkstrider.abilityLevels?.StructuralAnalyser ?? 54, darkstrider.progressionStepIndex);

      if (saValues && saTemplate) {
        buffPool = addBuffToPool(buffPool, saTemplate, darkstrider, saValues as Record<string, number>, 1);
      }
    }

    // Initialize Destroy the Witch aura buff if Helbrecht is in team
    const helbrecht = battleCharacters.find(c => c.passiveAbilities.includes('DestroyTheWitch'));
    if (helbrecht) {
      const dtwTemplate = getBuffTemplate('destroy_the_witch');
      const dtwValues = getAbilityValues('DestroyTheWitch', helbrecht.abilityLevels?.DestroyTheWitch ?? 54, helbrecht.progressionStepIndex);

      if (dtwValues && dtwTemplate) {
        buffPool = addBuffToPool(buffPool, dtwTemplate, helbrecht, dtwValues as Record<string, number>, 1);
      }
    }

    // Initialize Daughter of the Abyss aura buff if Atlacoya is in team
    const atlacoya = battleCharacters.find(c => c.passiveAbilities.includes('DaughterOfTheAbyss'));
    if (atlacoya) {
      const dotaTemplate = getBuffTemplate('daughter_of_the_abyss');
      const dotaValues = getAbilityValues('DaughterOfTheAbyss', atlacoya.abilityLevels?.DaughterOfTheAbyss ?? 54, atlacoya.progressionStepIndex);

      if (dotaValues && dotaTemplate) {
        buffPool = addBuffToPool(buffPool, dotaTemplate, atlacoya, dotaValues as Record<string, number>, 1);
      }
    }

    // Initialize Stand Vigil aura buff if Aesoth is in team
    const aesoth = battleCharacters.find(c => c.passiveAbilities.includes('StandVigil'));
    if (aesoth) {
      const svTemplate = getBuffTemplate('stand_vigil');
      const svValues = getAbilityValues('StandVigil', aesoth.abilityLevels?.StandVigil ?? 54, aesoth.progressionStepIndex);

      if (svValues && svTemplate) {
        buffPool = addBuffToPool(buffPool, svTemplate, aesoth, svValues as Record<string, number>, 1);
      }
    }

    // Initialize Serene Unifier (Storm of Fire) aura buff if Aun'Shi is in team
    const aunShi = battleCharacters.find(c => c.passiveAbilities.includes('SereneUnifier'));
    if (aunShi) {
      const suTemplate = getBuffTemplate('serene_unifier_storm_of_fire');
      const suValues = getAbilityValues('SereneUnifier', aunShi.abilityLevels?.SereneUnifier ?? 54, aunShi.progressionStepIndex);

      if (suValues && suTemplate) {
        buffPool = addBuffToPool(buffPool, suTemplate, aunShi, suValues as Record<string, number>, 1);
      }
    }

    // Initialize Master Annihilator buff if Vitruvius is in team
    const vitruvius = battleCharacters.find(c => c.passiveAbilities.includes('MasterAnnihilator'));
    if (vitruvius) {
      const maTemplate = getBuffTemplate('master_annihilator');
      const maValues = getAbilityValues('MasterAnnihilator', vitruvius.abilityLevels?.MasterAnnihilator ?? 54, vitruvius.progressionStepIndex);

      if (maValues && maTemplate) {
        buffPool = addBuffToPool(buffPool, maTemplate, vitruvius, maValues as Record<string, number>, 1);
      }
    }

    // Initialize Prophet of Gork and Mork if boss has the passive ability
    let prophetOfGorkAndMork: BattleState['prophetOfGorkAndMork'] = undefined;
    if (boss?.passiveAbilities?.includes('ProphetOfGorkAndMork')) {
      // Get base values from abilities.json
      const prophetValues = getAbilityValues('ProphetOfGorkAndMork', 0, 19); // Constants don't vary by level, use max progression
      if (prophetValues) {
        const baseNrOfAttacks = prophetValues.nrOfAttacks as number || 4;
        const baseDmgPctReduction = prophetValues.dmgPctReduction as number || 90;

        // Only apply ability modifiers if minions killed (boss.applyModifiers is true)
        const bossId = boss.id;
        const modifiers = boss.applyModifiers
          ? getBossAbilityConstantModifiers(bossId, 'ProphetOfGorkAndMork')
          : {};
        const nrOfAttacksIncrease = modifiers.nrOfAttacks || 0;

        prophetOfGorkAndMork = {
          attackThreshold: baseNrOfAttacks + nrOfAttacksIncrease,
          damageReductionPct: baseDmgPctReduction,
        };

        console.log(`[Prophet of Gork and Mork initialized: ${prophetOfGorkAndMork.attackThreshold} attacks to trigger -${prophetOfGorkAndMork.damageReductionPct}% damage]`);
      }
    }

    // Initialize GeminaeSuperia summon if Celestine is in team
    const initialSummons: import('../types').BattleSummon[] = [];
    const celestine = battleCharacters.find(c => c.passiveAbilities.includes('GeminaeSuperia'));
    if (celestine) {
      const gsValues = getAbilityValues('GeminaeSuperia', celestine.abilityLevels?.GeminaeSuperia ?? 54, celestine.progressionStepIndex);
      if (gsValues) {
        const summonData = getSummonUnitData('adeptSmnGeminaeSuperia');
        if (summonData) {
          const meleeWeapon = summonData.weapons.find(w => !w.Range);
          initialSummons.push({
            id: `summon_adeptSmnGeminaeSuperia_${Date.now()}`,
            unitId: 'adeptSmnGeminaeSuperia',
            name: summonData.name,
            sourceCharacterId: celestine.id,
            sourceAbilityId: 'GeminaeSuperia',
            hp: gsValues.summonHp as number || 0,
            damage: gsValues.summonDmg as number || 0,
            armor: gsValues.summonArmor as number || 0,
            meleeHits: meleeWeapon?.hits || 2,
            meleeDamageType: (meleeWeapon?.DamageProfile as import('../types').DamageType) || 'Power',
            traits: summonData.traits || [],
            count: 0,
            createdAtTurn: 1,
            iconUrl: getSummonIconUrl('adeptSmnGeminaeSuperia'),
            activeAbilities: summonData.activeAbilities,
            totalDamageDealt: 0,
          });
        }
      }
    }

    // Initialize SwornProtector summon if Castellan Creed is in team (Kell with count 0, max 1)
    const creed = battleCharacters.find(c => c.passiveAbilities.includes('SwornProtector'));
    if (creed) {
      const spValues = getAbilityValues('SwornProtector', creed.abilityLevels?.SwornProtector ?? 54, creed.progressionStepIndex);
      if (spValues) {
        const summonData = getSummonUnitData('astraSmnKell');
        if (summonData) {
          const meleeWeapon = summonData.weapons.find(w => !w.Range);
          initialSummons.push({
            id: `summon_astraSmnKell_${Date.now()}`,
            unitId: 'astraSmnKell',
            name: summonData.name,
            sourceCharacterId: creed.id,
            sourceAbilityId: 'SwornProtector',
            hp: spValues.summonHp as number || 0,
            damage: spValues.summonDmg as number || 0,
            armor: spValues.summonArmor as number || 0,
            meleeHits: meleeWeapon?.hits || 2,
            meleeDamageType: (meleeWeapon?.DamageProfile as import('../types').DamageType) || 'Power',
            traits: summonData.traits || [],
            count: 0,
            maxCount: 1,
            createdAtTurn: 1,
            iconUrl: getSummonIconUrl('astraSmnKell'),
            activeAbilities: summonData.activeAbilities,
            totalDamageDealt: 0,
          });
        }
      }
    }

    const newBattleState: BattleState = {
      turn: 1,
      maxTurns: MAX_TURNS,
      team: battleCharacters,
      boss: boss, // Store the boss in battle state
      turnHistory: [],
      totalDamageDealt: 0,
      isComplete: false,
      ignoreCrit: false,
      buffPool, // Buff pool with LC buffs if Trajann present
      bossArmorReduction: 0, // Cumulative boss armor reduction from abilities
      bossHasMarkerlight: false, // Markerlight debuff on boss
      bossHasMasterAnnihilatorMark: false, // Master Annihilator debuff on boss (Vitruvius)
      masterAnnihilatorMaxDmg: 0, // Damage cap for Master Annihilator extra hit
      activeAbilitiesUsedCount: 0, // Count of active abilities used in battle
      custodedUsedAbilityThisTurn: false, // Track if Custodes used ability (Stand Vigil range extension)
      bossAttacksReceivedThisTurn: 0, // Prophet of Gork and Mork counter
      prophetOfGorkAndMork, // Prophet ability data (if boss has it)
      // Machine of War damage bonus
      machineOfWar: machineOfWar ? {
        machineId: machineOfWar.machineId,
        extraDmgPct: getMachineOfWarDamageBonus(machineOfWar.machineId, machineOfWar.stars),
      } : undefined,
      // Summoned units (e.g., Ork Boyz from Waaagh!, Geminae Superia from Celestine)
      summons: initialSummons,
    };

    set({
      battleState: newBattleState,
      turnStartSnapshot: deepClone(newBattleState),  // Snapshot for turn 1 undo
      currentTurnActions: [],
    });
  },

  endBattle: () => {
    set((state) => ({
      battleState: state.battleState
        ? { ...state.battleState, isComplete: true }
        : null,
    }));
  },

  resetBattle: () => {
    set({
      battleState: null,
      currentTurnActions: [],
    });
  },

  nextTurn: (turnLog?: BattleLogEntry[]) => {
    const { battleState, currentTurnActions } = get();
    if (!battleState) return;

    const newTurn = battleState.turn + 1;
    const isComplete = newTurn > MAX_TURNS;

    // Reset character action flags for new turn
    const resetTeam = battleState.team.map((char) => ({
      ...char,
      hasMoved: false,
      hasActed: false,
      turnEnded: false,
      attacksThisTurn: 0, // Reset attacks count for new turn
      hasUsedAbilityThisTurn: false, // Reset ability usage for new turn
      // Reset Legendary Commander tracking for new turn
      hasQualifiedForLCDamage: false,
      pendingLCQualification: false,
      hasUsedFirstSpecialAttackThisTurn: false,  // Reset per-character LC +2 hits tracking
      // Reset Darkstrider's Fighting Retreat flag for new turn
      fightingRetreatActive: false,
      // Reset The Betrayer usage for new turn
      hasUsedTheBetrayerThisTurn: false,
      // Reset Overwatch usage for new turn (trait users can use once per turn)
      hasUsedOverwatchThisTurn: false,
      // Reset Calibanite Greatsword usage for new turn (once per turn ability)
      hasUsedCalibaniteThisTurn: false,
      // Reset Fury of the Ancients usage for new turn (once per turn ability)
      hasUsedFuryOfTheAncientsThisTurn: false,
      // Reset Martial Superiority usage for new turn (once per turn ability)
      hasUsedMartialSuperiorityThisTurn: false,
      // Reset Hateful Assault usage for new turn (once per turn ability)
      hasUsedHatefulAssaultThisTurn: false,
      // Reset Laviscus outrage for new turn
      outrage: 0,
      outrageContributors: [],
      // Increment attackTurnsCount if character attacked this turn (for LegacyOfCombat bonus)
      attackTurnsCount: char.attacksThisTurn > 0 ? char.attackTurnsCount + 1 : char.attackTurnsCount,
      // Advance ability cooldowns
      abilityCooldowns: advanceCooldowns(char.abilityCooldowns),
      // Process active buffs: remove buffs without duration, decrement and filter duration-based buffs
      activeBuffs: char.activeBuffs
        .filter(buff => buff.duration !== undefined && buff.duration > 0)  // Keep only buffs with duration
        .map(buff => ({ ...buff, duration: (buff.duration || 1) - 1 }))    // Decrement duration
        .filter(buff => (buff.duration || 0) > 0),                          // Remove expired buffs
      // Reduce buff/debuff durations
      buffs: char.buffs
        .map((b) => ({ ...b, duration: b.duration - 1 }))
        .filter((b) => b.duration > 0),
      debuffs: char.debuffs
        .map((d) => ({ ...d, duration: d.duration - 1 }))
        .filter((d) => d.duration > 0),
      // Decrement Chordclaw buff duration and clear if expired
      cordClawTurnsRemaining: char.cordClawActive
        ? Math.max(0, (char.cordClawTurnsRemaining || 0) - 1)
        : undefined,
      cordClawActive: char.cordClawActive && (char.cordClawTurnsRemaining || 0) > 1
        ? true
        : false,
      // Clear Chordclaw values when buff expires
      ...((char.cordClawActive && (char.cordClawTurnsRemaining || 0) <= 1) ? {
        cordClawMinDmg: undefined,
        cordClawMaxDmg: undefined,
        cordClawHits: undefined,
      } : {}),
      // Decrement Foul Infusion buff duration and clear if expired
      foulInfusionTurnsRemaining: char.foulInfusionActive
        ? Math.max(0, (char.foulInfusionTurnsRemaining || 0) - 1)
        : undefined,
      foulInfusionActive: char.foulInfusionActive && (char.foulInfusionTurnsRemaining || 0) > 1
        ? true
        : false,
      // Clear Foul Infusion values when buff expires
      ...((char.foulInfusionActive && (char.foulInfusionTurnsRemaining || 0) <= 1) ? {
        foulInfusionDmg: undefined,
      } : {}),
      // Decrement Sorcerous Facade buff duration and clear if expired
      sorcerousFacadeTurnsRemaining: char.sorcerousFacadeActive
        ? Math.max(0, (char.sorcerousFacadeTurnsRemaining || 0) - 1)
        : undefined,
      sorcerousFacadeActive: char.sorcerousFacadeActive && (char.sorcerousFacadeTurnsRemaining || 0) > 1
        ? true
        : false,
      // Clear Sorcerous Facade values when buff expires
      ...((char.sorcerousFacadeActive && (char.sorcerousFacadeTurnsRemaining || 0) <= 1) ? {
        sorcerousFacadeMinDmg: undefined,
        sorcerousFacadeMaxDmg: undefined,
      } : {}),
    }));

    // Expire buffs in the pool (decrement duration, remove expired)
    const updatedBuffPool = expireBuffs(battleState.buffPool);

    // Debug: Log buff pool after expiration
    const lcBuffsRemaining = updatedBuffPool.filter(b => b.buffId.startsWith('legendary_commander'));
    console.log(`[NextTurn] Turn ${newTurn}: ${updatedBuffPool.length} buffs in pool (${lcBuffsRemaining.length} LC buffs)`);

    const newBattleState: BattleState = {
      ...battleState,
      turn: newTurn,
      team: resetTeam,
      buffPool: updatedBuffPool,
      turnHistory: [
        ...battleState.turnHistory,
        {
          turnNumber: battleState.turn,
          actions: currentTurnActions,
          log: turnLog || [],
        },
      ],
      isComplete,
      // Reset Prophet of Gork and Mork attack counter for new turn
      bossAttacksReceivedThisTurn: 0,
      // Reset Custodes ability usage for new turn (Stand Vigil range extension)
      custodedUsedAbilityThisTurn: false,
      // Reset Supercharge pierce bonus (only lasts for rest of turn)
      superchargePierceBonus: undefined,
    };

    set({
      battleState: newBattleState,
      turnStartSnapshot: deepClone(newBattleState),  // Snapshot for new turn undo
      currentTurnActions: [],
    });
  },

  finishBattle: (turnLog?: BattleLogEntry[]) => {
    const { battleState, currentTurnActions } = get();
    if (!battleState) return;

    // Complete the battle without incrementing turn
    set({
      battleState: {
        ...battleState,
        turnHistory: [
          ...battleState.turnHistory,
          {
            turnNumber: battleState.turn,
            actions: currentTurnActions,
            log: turnLog || [],
          },
        ],
        isComplete: true,
      },
      currentTurnActions: [],
    });
  },

  canAdvanceTurn: () => {
    const { battleState } = get();
    return battleState !== null && !battleState.isComplete;
  },

  setEditingTurn: (turn) => {
    set({ editingTurn: turn });
  },

  getActiveTurn: () => {
    const { battleState, editingTurn } = get();
    if (!battleState) return 0;
    return editingTurn ?? battleState.turn;
  },

  addAction: (characterId, action) => {
    set((state) => {
      const existingIndex = state.currentTurnActions.findIndex(
        (ta) => ta.characterId === characterId
      );

      if (existingIndex >= 0) {
        const updated = [...state.currentTurnActions];
        updated[existingIndex] = {
          ...updated[existingIndex],
          actions: [...updated[existingIndex].actions, action],
        };
        return { currentTurnActions: updated };
      }

      return {
        currentTurnActions: [
          ...state.currentTurnActions,
          { characterId, actions: [action] },
        ],
      };
    });
  },

  removeAction: (characterId, actionIndex) => {
    set((state) => {
      const turnActionIndex = state.currentTurnActions.findIndex(
        (ta) => ta.characterId === characterId
      );

      if (turnActionIndex < 0) return state;

      const updated = [...state.currentTurnActions];
      const newActions = [...updated[turnActionIndex].actions];
      newActions.splice(actionIndex, 1);

      if (newActions.length === 0) {
        updated.splice(turnActionIndex, 1);
      } else {
        updated[turnActionIndex] = {
          ...updated[turnActionIndex],
          actions: newActions,
        };
      }

      return { currentTurnActions: updated };
    });
  },

  clearCharacterActions: (characterId) => {
    set((state) => ({
      currentTurnActions: state.currentTurnActions.filter(
        (ta) => ta.characterId !== characterId
      ),
    }));
  },

  resetCharacterTurn: (characterId, damageToSubtract) => {
    set((state) => {
      if (!state.battleState) return state;

      return {
        battleState: {
          ...state.battleState,
          team: state.battleState.team.map((char) =>
            char.id === characterId
              ? {
                  ...char,
                  hasMoved: false,
                  hasActed: false,
                  turnEnded: false,
                  hasUsedAbilityThisTurn: false,
                  hasQualifiedForLCDamage: false,
                  pendingLCQualification: false,
                  activeBuffs: [], // Clear any active buffs from abilities
                  // Reset ability cooldowns (unuse all active abilities)
                  abilityCooldowns: resetCooldowns(char.abilityCooldowns),
                  totalDamageDealt: Math.max(0, char.totalDamageDealt - damageToSubtract),
                }
              : char
          ),
          totalDamageDealt: Math.max(0, state.battleState.totalDamageDealt - damageToSubtract),
        },
        currentTurnActions: state.currentTurnActions.filter(
          (ta) => ta.characterId !== characterId
        ),
      };
    });
  },

  resetCharacterTurnAtTurn: (characterId, turn, damageToSubtract) => {
    set((state) => {
      if (!state.battleState) return state;

      const isCurrentTurn = turn === state.battleState.turn;
      // Check if the ID belongs to a summon rather than a team character
      const isSummon = state.battleState.summons.some(s => s.id === characterId);

      if (isCurrentTurn) {
        // For current turn, reset character flags and clear current actions
        return {
          battleState: {
            ...state.battleState,
            team: state.battleState.team.map((char) =>
              char.id === characterId
                ? {
                    ...char,
                    hasMoved: false,
                    hasActed: false,
                    turnEnded: false,
                    hasUsedAbilityThisTurn: false,
                    hasQualifiedForLCDamage: false,
                    pendingLCQualification: false,
                    activeBuffs: [], // Clear any active buffs from abilities
                    // Reset ability cooldowns (unuse all active abilities)
                    abilityCooldowns: resetCooldowns(char.abilityCooldowns),
                    totalDamageDealt: Math.max(0, char.totalDamageDealt - damageToSubtract),
                  }
                : char
            ),
            // Also reset summon damage if the ID is a summon
            summons: isSummon
              ? state.battleState.summons.map(s =>
                  s.id === characterId
                    ? { ...s, totalDamageDealt: Math.max(0, s.totalDamageDealt - damageToSubtract) }
                    : s
                )
              : state.battleState.summons,
            totalDamageDealt: Math.max(0, state.battleState.totalDamageDealt - damageToSubtract),
          },
          currentTurnActions: state.currentTurnActions.filter(
            (ta) => ta.characterId !== characterId
          ),
        };
      }

      // For past turns, update turnHistory and character/summon damage
      return {
        battleState: {
          ...state.battleState,
          team: state.battleState.team.map((char) =>
            char.id === characterId
              ? {
                  ...char,
                  totalDamageDealt: Math.max(0, char.totalDamageDealt - damageToSubtract),
                }
              : char
          ),
          // Also reset summon damage if the ID is a summon
          summons: isSummon
            ? state.battleState.summons.map(s =>
                s.id === characterId
                  ? { ...s, totalDamageDealt: Math.max(0, s.totalDamageDealt - damageToSubtract) }
                  : s
              )
            : state.battleState.summons,
          turnHistory: state.battleState.turnHistory.map((turnRecord) => {
            if (turnRecord.turnNumber !== turn) return turnRecord;
            return {
              ...turnRecord,
              actions: turnRecord.actions.filter(
                (ta) => ta.characterId !== characterId
              ),
            };
          }),
          totalDamageDealt: Math.max(0, state.battleState.totalDamageDealt - damageToSubtract),
        },
      };
    });
  },

  restoreTurnStart: () => {
    const { turnStartSnapshot, battleState } = get();
    if (!turnStartSnapshot || !battleState) return;

    // Preserve current abilityToggles (user checkbox preferences like Doom, High Ground, etc.)
    const currentToggles = new Map(
      battleState.team.map(char => [char.id, char.abilityToggles])
    );

    const restoredState = deepClone(turnStartSnapshot);

    // Restore abilityToggles from current state (preserve user preferences)
    restoredState.team = restoredState.team.map(char => ({
      ...char,
      abilityToggles: currentToggles.get(char.id) || char.abilityToggles,
    }));

    // CRITICAL: Restore customEvaluator functions in buffPool
    // deepClone uses JSON serialization which strips functions
    // We need to restore them from the original buff templates
    restoredState.buffPool = restoredState.buffPool.map(buff => {
      const template = getBuffTemplate(buff.buffId);
      if (template?.defaultTargetCondition?.customEvaluator && buff.targetCondition.type === 'custom') {
        return {
          ...buff,
          targetCondition: {
            ...buff.targetCondition,
            customEvaluator: template.defaultTargetCondition.customEvaluator,
          },
        };
      }
      return buff;
    });

    set({
      battleState: restoredState,
      currentTurnActions: [],
    });
  },

  updateCharacterHealth: (characterId, newHealth) => {
    set((state) => {
      if (!state.battleState) return state;

      return {
        battleState: {
          ...state.battleState,
          team: state.battleState.team.map((char) =>
            char.id === characterId
              ? { ...char, currentHealth: Math.max(0, newHealth) }
              : char
          ),
        },
      };
    });
  },

  setCharacterMoved: (characterId, moved) => {
    set((state) => {
      if (!state.battleState) return state;

      return {
        battleState: {
          ...state.battleState,
          team: state.battleState.team.map((char) =>
            char.id === characterId ? { ...char, hasMoved: moved } : char
          ),
        },
      };
    });
  },

  setCharacterActed: (characterId, acted) => {
    set((state) => {
      if (!state.battleState) return state;

      return {
        battleState: {
          ...state.battleState,
          team: state.battleState.team.map((char) =>
            char.id === characterId ? { ...char, hasActed: acted } : char
          ),
        },
      };
    });
  },

  setCharacterTurnEnded: (characterId, ended) => {
    set((state) => {
      if (!state.battleState) return state;

      return {
        battleState: {
          ...state.battleState,
          team: state.battleState.team.map((char) =>
            char.id === characterId ? { ...char, turnEnded: ended } : char
          ),
        },
      };
    });
  },

  // Damage calculation using the new damage calculator
  calculateDamage: (attackerId, _targetId, attackType = 'melee') => {
    const { battleState } = get();
    if (!battleState) return 0;

    const attacker = battleState.team.find((c) => c.id === attackerId);
    if (!attacker) return 0;

    // Get equipment stats for crit bonuses
    const equipmentStats = calculateEquipmentStats(attacker.equipment);

    // Determine hits and damage type based on attack type
    const hits = attackType === 'ranged' && attacker.rangedHits
      ? attacker.rangedHits
      : attacker.meleeHits;

    const damageType = attackType === 'ranged' && attacker.rangedDamageType
      ? attacker.rangedDamageType
      : attacker.meleeDamageType;

    // Calculate combined modifiers from active buffs (like WarHowl)
    // Note: buff crit bonuses are only tracked in executeAttack for proper source display
    const buffDamageMultiplier = attacker.activeBuffs.reduce(
      (mult, buff) => mult * (buff.baseDamageMultiplier || 1), 1
    );
    const buffDamageBonus = attacker.activeBuffs.reduce(
      (sum, buff) => sum + (buff.baseDamageBonus || 0), 0
    );

    // Apply buff damage multiplier and bonus to base damage
    const buffedBaseDamage = Math.round(attacker.calculatedDamage * buffDamageMultiplier) + buffDamageBonus;

    // Build attacker stats for calculator
    // Equipment base + equipment bonus = total base crit (for proper breakdown display)
    // Buff crit bonuses are passed via abilityModifiers for proper source tracking
    const attackerStats: AttackerStats = {
      baseDamage: buffedBaseDamage,
      damageType,
      hits,
      critChance: (equipmentStats.critChance || 0) + (equipmentStats.critChanceBonus || 0),
      critDamage: (equipmentStats.critDmg || 0) + (equipmentStats.critDmgBonus || 0),
      critChanceBonus: 0, // Buff crit bonus is passed via abilityModifiers
      critDmgBonus: 0, // Ability crit damage bonus will be added via abilityModifiers
      traits: attacker.traits,
      hasMoved: attacker.hasMoved,
      attackType,
      hasAttackedThisBattle: attacker.hasAttackedThisBattle,
      attacksThisTurn: attacker.attacksThisTurn,
      abilityModifiers: undefined, // Will be set by evaluating passives
      abilityToggles: attacker.abilityToggles, // For trait condition toggles (e.g., CrushingStrike)
      fightingRetreatActive: attacker.fightingRetreatActive, // Darkstrider's Fighting Retreat override
    };

    // Find Trajann for LC +2 hits check
    const trajann = battleState.team.find(c => c.passiveAbilities.includes('LegendaryCommander'));
    const trajannIsAdjacentToBoss = isToggleActive(trajann?.abilityToggles['adjacentToBoss']);

    // Check if any Dark Angels teammate (not Asmodai) is adjacent to boss (for FearedInterrogator)
    const asmodai = battleState.team.find(c => c.passiveAbilities.includes('FearedInterrogator'));
    const darkAngelsAdjacentToBoss = asmodai ? battleState.team.some(c =>
      c.id !== asmodai.id && c.faction === 'DarkAngels' && c.abilityToggles['adjacentToBoss']
    ) : false;

    // Evaluate passive abilities for preview
    const passiveResult = evaluatePassiveAbilities(
      attacker.passiveAbilities,
      attacker.abilityLevels || {},
      {
        characterId: attacker.id,
        progressionStepIndex: attacker.progressionStepIndex,
        hasMoved: attacker.hasMoved,
        hasActedThisBattle: attacker.hasAttackedThisBattle,
        attacksThisTurn: attacker.attacksThisTurn,
        attackTurnsCount: attacker.attackTurnsCount,
        hasUsedAbilityThisTurn: attacker.hasUsedAbilityThisTurn,
        hasQualifiedForLCDamage: attacker.hasQualifiedForLCDamage,
        currentHealth: attacker.currentHealth,
        maxHealth: attacker.calculatedHealth,
        currentTurn: battleState.turn,
        activeAbilitiesUsedCount: battleState.activeAbilitiesUsedCount,  // For FuelledByFury
        attackType,
        attackCategory: 'normal',  // Normal attack
        isFirstSpecialAttackOfTurn: !attacker.hasUsedFirstSpecialAttackThisTurn,  // Per-character LC tracking
        trajannIsAdjacentToBoss,
        darkAngelsAdjacentToBoss,
        abilityToggles: attacker.abilityToggles,
        bossTraits: battleState.boss?.traits,
        bossDebuffs: battleState.bossHasMarkerlight ? ['Markerlight'] : [],
      }
    );

    // Combine passive ability modifiers
    const passiveModifiersPreview = passiveResult.evaluations
      .filter(e => e.applicable)
      .map(e => e.modifiers);

    // Get aura bonuses from teammates for preview
    const auraBonusesPreview = getCharacterAuraBonuses(attacker, battleState.team);
    // Filter active auras that match the attack type
    const activeAurasPreview = auraBonusesPreview.filter(a => {
      if (!a.isActive) return false;
      // Check attack type restriction
      if (a.attackTypeRestriction && a.attackTypeRestriction !== attackType) return false;
      return true;
    });
    // Use modifiers directly from the aura if available
    const auraModifiersPreview = activeAurasPreview
      .map(a => {
        if (a.modifiers) {
          return a.modifiers;
        }
        const mods: Record<string, number> = {};
        if (a.bonusText.includes('dmg')) {
          const match = a.bonusText.match(/\+(\d+)/);
          if (match) mods.baseDamageBonus = parseInt(match[1], 10);
        }
        if (a.bonusText.includes('hit')) {
          const match = a.bonusText.match(/\+(\d+)/);
          if (match) mods.extraHits = parseInt(match[1], 10);
        }
        return mods;
      });

    // Build buff sources for preview (merge entries with same name+source)
    const rawBuffSourcesPreview = activeAurasPreview.map(a => {
      if (a.modifiers) {
        return {
          name: a.abilityName,
          sourceName: a.sourceCharacterName || 'Unknown',
          damageBonus: a.modifiers.baseDamageBonus,
          extraHits: a.modifiers.extraHits,
          critChanceBonus: a.modifiers.critChanceBonus,
          critDamageBonus: a.modifiers.critDamageBonus,
        };
      }
      return {
        name: a.abilityName,
        sourceName: a.sourceCharacterName || 'Unknown',
        damageBonus: a.bonusText.includes('dmg') ? parseInt(a.bonusText.match(/\+(\d+)/)?.[1] || '0', 10) : undefined,
        extraHits: a.bonusText.includes('hit') ? parseInt(a.bonusText.match(/\+(\d+)/)?.[1] || '0', 10) : undefined,
      };
    });
    const buffSourcesPreview: typeof rawBuffSourcesPreview = [];
    for (const src of rawBuffSourcesPreview) {
      const key = `${src.name}_${src.sourceName}`;
      const existing = buffSourcesPreview.find(b => `${b.name}_${b.sourceName}` === key);
      if (existing) {
        existing.damageBonus = (existing.damageBonus || 0) + (src.damageBonus || 0);
        existing.extraHits = (existing.extraHits || 0) + (src.extraHits || 0);
        existing.critChanceBonus = (existing.critChanceBonus || 0) + (src.critChanceBonus || 0);
        existing.critDamageBonus = (existing.critDamageBonus || 0) + (src.critDamageBonus || 0);
      } else {
        buffSourcesPreview.push({ ...src });
      }
    }

    // Combine all modifiers
    const combinedModsPreview = combineModifiers([...passiveModifiersPreview, ...auraModifiersPreview]);
    attackerStats.abilityModifiers = {
      ...combinedModsPreview,
      buffSources: buffSourcesPreview,
    };

    // Use boss armor and traits if available, accounting for armor reduction
    const baseBossArmor = battleState.boss?.armor ?? 0;
    const bossArmor = Math.max(0, baseBossArmor - (battleState.bossArmorReduction || 0));

    // Check if boss has Daemon trait for block mechanic
    const hasDaemonTrait = battleState.boss?.traits?.includes('Daemon') ?? false;

    const defenderStats: DefenderStats = {
      armor: bossArmor,
      maxHealth: battleState.boss?.health ?? 100000,
      traits: battleState.boss?.traits,
      // Daemon block stats
      daemonBlockChance: hasDaemonTrait ? 0.25 : undefined,
      daemonBlockMaxAmount: hasDaemonTrait ? (battleState.boss?.damage ?? 0) * 0.5 : undefined,
    };

    const calculator = new DamageCalculator(false);
    const result = calculator.calculate(attackerStats, defenderStats);

    return result.damage;
  },

  executeAttack: (attackerId, targetId, attackType = 'melee', options?: ExecuteAttackOptions) => {
    const { battleState } = get();
    if (!battleState) {
      return {
        timestamp: Date.now(),
        characterId: attackerId,
        characterName: 'Unknown',
        action: 'attack',
        message: 'Battle not started',
      };
    }

    const attacker = battleState.team.find((c) => c.id === attackerId);
    if (!attacker) {
      return {
        timestamp: Date.now(),
        characterId: attackerId,
        characterName: 'Unknown',
        action: 'attack',
        message: 'Attacker not found',
      };
    }

    // Get equipment stats for crit bonuses
    const equipmentStats = calculateEquipmentStats(attacker.equipment);

    // Determine hits and damage type based on attack type
    const hits = attackType === 'ranged' && attacker.rangedHits
      ? attacker.rangedHits
      : attacker.meleeHits;

    const damageType = attackType === 'ranged' && attacker.rangedDamageType
      ? attacker.rangedDamageType
      : attacker.meleeDamageType;

    // Build buff pool evaluation context (normal attack)
    const buffEvalContext: BuffEvaluationContext = {
      attacker,
      attackType,
      attackCategory: 'normal',
      target: battleState.boss,
      battleState,
    };

    // Get applicable buffs from the pool
    const applicablePoolBuffs = getApplicableBuffs(battleState.buffPool, buffEvalContext);
    const poolBuffEffects = combineBuffEffects(applicablePoolBuffs);

    // Combine pool buffs with character's active buffs (legacy support)
    const buffCritChanceBonus = attacker.activeBuffs.reduce(
      (sum, buff) => sum + (buff.critChanceBonus || 0), 0
    ) + (poolBuffEffects.critChanceBonus || 0);
    const buffDamageMultiplier = attacker.activeBuffs.reduce(
      (mult, buff) => mult * (buff.baseDamageMultiplier || 1), 1
    ) * (poolBuffEffects.baseDamageMultiplier || 1);
    // HeraldOfTheApocalypse debuff: +extraDmg to next attack by any team member
    const heraldBonus = battleState.heraldExtraDmgDebuff || 0;
    const buffDamageBonus = attacker.activeBuffs.reduce(
      (sum, buff) => sum + (buff.baseDamageBonus || 0), 0
    ) + (poolBuffEffects.baseDamageBonus || 0) + heraldBonus;
    const poolExtraHits = poolBuffEffects.extraHits || 0;
    const poolCritDmgBonus = poolBuffEffects.critDamageBonus || 0;
    const poolArmorIgnored = poolBuffEffects.armorIgnored || 0;
    // Supercharge (Sarquael): +pierce ratio bonus for ALL team Plasma attacks this turn
    const superchargePierceBonus = (battleState.superchargePierceBonus && damageType === 'Plasma')
      ? battleState.superchargePierceBonus
      : 0;
    // Blood Chalice and other activeBuffs pierce ratio bonus (check meleeOnly flag)
    const buffPierceRatioBonus = attacker.activeBuffs.reduce(
      (sum, buff) => {
        if (!buff.pierceRatioBonus) return sum;
        // Check if buff is melee only and we're not doing melee
        if (buff.meleeOnly && attackType !== 'melee') return sum;
        return sum + buff.pierceRatioBonus;
      }, 0
    );
    const poolPierceRatioBonus = (poolBuffEffects.pierceRatioBonus || 0) + superchargePierceBonus + buffPierceRatioBonus;

    // Markerlight debuff: T'au Empire ranged attacks deal +15% damage
    const isTauEmpire = attacker.faction === "T'au Empire" || attacker.faction === 'Tau';
    const markerlightMultiplier = (isTauEmpire && attackType === 'ranged' && battleState.bossHasMarkerlight) ? 1.15 : 1;

    // High Ground: +50% damage multiplier when toggle is enabled
    const highGroundMultiplier = attacker.abilityToggles['HighGround'] ? 1.5 : 1;

    // War Machine: dynamic damage multiplier based on selected Machine of War
    const warMachineMultiplier = attacker.abilityToggles['WarMachine'] && battleState.machineOfWar
      ? 1 + battleState.machineOfWar.extraDmgPct / 100
      : 1;

    // Log buff effects if any are active
    const hasActiveBuffs = attacker.activeBuffs.length > 0 || applicablePoolBuffs.length > 0;
    if (hasActiveBuffs) {
      console.log(`[Active Buffs: +${buffCritChanceBonus}% crit, x${buffDamageMultiplier.toFixed(2)} dmg, +${buffDamageBonus} flat]`);
      if (applicablePoolBuffs.length > 0) {
        console.log(`[Pool Buffs: ${applicablePoolBuffs.map(b => b.name).join(', ')}]`);
      }
    }

    // Build attacker stats for calculator
    // Note: buffDamageMultiplier is passed as a global multiplier, not pre-applied to base damage
    // Equipment base + equipment bonus = total base crit (for proper breakdown display)
    // Only ability bonuses go in critChanceBonus (from active buffs like WarHowl)
    // If ignoreCrit is enabled, pass the flag to calculator (crit stats still shown, just not applied)
    const ignoreCrit = battleState.ignoreCrit;
    const currentTurn = battleState.turn;

    // Apply damage multiplier (for Galvanic Field dmgPct)
    const effectiveBaseDamage = options?.damageMultiplier
      ? attacker.calculatedDamage * options.damageMultiplier
      : attacker.calculatedDamage;

    // Build damage caps from options
    const damageCaps: DamageCaps | undefined =
      options?.baseDamageCap || options?.preArmorCap || options?.finalDamageCap || options?.perHitDamageCap
        ? {
            baseDamageCap: options.baseDamageCap,
            preArmorCap: options.preArmorCap,
            finalDamageCap: options.finalDamageCap ?? options.perHitDamageCap, // Backwards compat
          }
        : undefined;

    const attackerStats: AttackerStats = {
      baseDamage: effectiveBaseDamage, // Use actual base damage (or modified for Galvanic Field)
      damageType,
      hits,
      critChance: (equipmentStats.critChance || 0) + (equipmentStats.critChanceBonus || 0),
      critDamage: (equipmentStats.critDmg || 0) + (equipmentStats.critDmgBonus || 0),
      critChanceBonus: 0, // Buff crit bonus is passed via abilityModifiers for proper source tracking
      critDmgBonus: 0, // Ability crit damage bonus will be added via abilityModifiers
      ignoreCrit, // Pass flag to calculator - crit bonus won't be added to DamVarMod
      traits: attacker.traits,
      hasMoved: attacker.hasMoved,
      attackType,
      hasAttackedThisBattle: attacker.hasAttackedThisBattle,
      attacksThisTurn: attacker.attacksThisTurn,
      firstAttackTurn: attacker.firstAttackTurn,
      currentTurn,
      abilityModifiers: undefined, // Will be set by evaluating passives
      abilityToggles: attacker.abilityToggles, // For trait condition toggles (e.g., CrushingStrike)
      fightingRetreatActive: attacker.fightingRetreatActive, // Darkstrider's Fighting Retreat override
      damageCaps, // Damage caps from options (Cap 1, Cap 2, Cap 3)
    };

    // Find Trajann for LC +2 hits check
    const trajann = battleState.team.find(c => c.passiveAbilities.includes('LegendaryCommander'));
    const trajannIsAdjacentToBoss = isToggleActive(trajann?.abilityToggles['adjacentToBoss']);

    // Check if any Dark Angels teammate (not Asmodai) is adjacent to boss (for FearedInterrogator)
    const asmodai = battleState.team.find(c => c.passiveAbilities.includes('FearedInterrogator'));
    const darkAngelsAdjacentToBoss = asmodai ? battleState.team.some(c =>
      c.id !== asmodai.id && c.faction === 'DarkAngels' && c.abilityToggles['adjacentToBoss']
    ) : false;

    // Evaluate passive abilities
    const passiveResult = evaluatePassiveAbilities(
      attacker.passiveAbilities,
      attacker.abilityLevels || {},
      {
        characterId: attacker.id,
        progressionStepIndex: attacker.progressionStepIndex,
        hasMoved: attacker.hasMoved,
        hasActedThisBattle: attacker.hasAttackedThisBattle,
        attacksThisTurn: attacker.attacksThisTurn,
        attackTurnsCount: attacker.attackTurnsCount,
        hasUsedAbilityThisTurn: attacker.hasUsedAbilityThisTurn,
        hasQualifiedForLCDamage: attacker.hasQualifiedForLCDamage,
        currentHealth: attacker.currentHealth,
        maxHealth: attacker.calculatedHealth,
        currentTurn: battleState.turn,
        activeAbilitiesUsedCount: battleState.activeAbilitiesUsedCount,  // For FuelledByFury
        attackType,
        attackCategory: 'normal',  // Normal attack
        isFirstSpecialAttackOfTurn: !attacker.hasUsedFirstSpecialAttackThisTurn,  // Per-character LC tracking
        trajannIsAdjacentToBoss,
        darkAngelsAdjacentToBoss,
        abilityToggles: attacker.abilityToggles,
        // Laviscus's Refusal to be Outdone passive
        outrage: attacker.outrage,
        outrageContributorCount: attacker.outrageContributors?.length || 0,
        // Boss state for abilities that check boss traits/debuffs
        bossTraits: battleState.boss?.traits,
        bossDebuffs: battleState.bossHasMarkerlight ? ['Markerlight'] : [],
      }
    );

    // Combine passive ability modifiers
    const passiveModifiers = passiveResult.evaluations
      .filter(e => e.applicable)
      .map(e => e.modifiers);

    // Get aura bonuses from teammates
    const auraBonuses = getCharacterAuraBonuses(attacker, battleState.team);
    // Filter active auras that match the attack type
    const activeAuras = auraBonuses.filter(a => {
      if (!a.isActive) return false;
      // Check attack type restriction
      if (a.attackTypeRestriction && a.attackTypeRestriction !== attackType) return false;
      return true;
    });
    // Use modifiers directly from the aura if available, otherwise parse text
    const auraModifiers = activeAuras
      .map(a => {
        if (a.modifiers) {
          return a.modifiers;
        }
        // Fallback: parse the bonus to create a modifier
        const mods: Record<string, number> = {};
        if (a.bonusText.includes('dmg')) {
          const match = a.bonusText.match(/\+(\d+)/);
          if (match) mods.baseDamageBonus = parseInt(match[1], 10);
        }
        if (a.bonusText.includes('hit')) {
          const match = a.bonusText.match(/\+(\d+)/);
          if (match) mods.extraHits = parseInt(match[1], 10);
        }
        return mods;
      });

    // RitesOfBattle (Calgar) - damage bonus to adjacent allies
    // Imperial characters get extraDmg_2, others get extraDmg
    let ritesOfBattleDmgBonus = 0;
    let ritesOfBattleSource: { name: string; sourceName: string; damageBonus: number } | null = null;
    for (const teammate of battleState.team) {
      if (teammate.id === attacker.id) continue;
      if (teammate.passiveAbilities.includes('RitesOfBattle')) {
        const toggleId = `RitesOfBattle_${teammate.id}_adjacent`;
        if (attacker.abilityToggles[toggleId]) {
          const levelIndex = teammate.abilityLevels?.['RitesOfBattle'] ?? 54;
          const values = getAbilityValues('RitesOfBattle', levelIndex, teammate.progressionStepIndex);
          if (values) {
            const isImperial = attacker.alliance === 'Imperial';
            const extraDmg = isImperial
              ? (values.extraDmg_2 as number || 0)
              : (values.extraDmg as number || 0);
            ritesOfBattleDmgBonus = extraDmg;
            ritesOfBattleSource = {
              name: 'Rites of Battle',
              sourceName: teammate.name,
              damageBonus: extraDmg,
            };
          }
          break; // Only one Calgar can provide the buff
        }
      }
    }

    // ObsessiveAnnunciation (Adamatar) - ranged damage bonus vs enemies adj to Adamatar
    let obsessiveAnnunciationDmgBonus = 0;
    let obsessiveAnnunciationSource: { name: string; sourceName: string; damageBonus: number } | null = null;
    if (attackType === 'ranged') {
      for (const teammate of battleState.team) {
        if (teammate.id === attacker.id) continue;
        if (teammate.passiveAbilities.includes('ObsessiveAnnunciation')) {
          const toggleId = `ObsessiveAnnunciation_${teammate.id}_targetAdj`;
          if (isToggleActive(attacker.abilityToggles[toggleId])) {
            const levelIndex = teammate.abilityLevels?.['ObsessiveAnnunciation'] ?? 54;
            const values = getAbilityValues('ObsessiveAnnunciation', levelIndex, teammate.progressionStepIndex);
            if (values) {
              obsessiveAnnunciationDmgBonus = values.extraDmg as number || 0;
              obsessiveAnnunciationSource = {
                name: 'Obsessive Annunciation',
                sourceName: teammate.name,
                damageBonus: obsessiveAnnunciationDmgBonus,
              };
            }
            break;
          }
        }
      }
    }

    // Build buff sources for display in damage breakdown
    // Define BuffSource type inline
    type BuffSourceType = { name: string; sourceName?: string; damageBonus?: number; damageMultiplier?: number; extraHits?: number; critChanceBonus?: number; critDamageBonus?: number; armorIgnored?: number; pierceRatioBonus?: number };
    const rawBuffSources: BuffSourceType[] = activeAuras.map(a => {
      const source: BuffSourceType = {
        name: a.abilityName,
        sourceName: a.sourceCharacterName || 'Unknown',
      };
      if (a.modifiers) {
        if (a.modifiers.baseDamageBonus) source.damageBonus = a.modifiers.baseDamageBonus;
        if (a.modifiers.extraHits) source.extraHits = a.modifiers.extraHits;
        if (a.modifiers.critChanceBonus) source.critChanceBonus = a.modifiers.critChanceBonus;
        if (a.modifiers.critDamageBonus) source.critDamageBonus = a.modifiers.critDamageBonus;
      } else {
        // Fallback: parse text
        if (a.bonusText.includes('dmg')) {
          const match = a.bonusText.match(/\+(\d+)/);
          if (match) source.damageBonus = parseInt(match[1], 10);
        }
        if (a.bonusText.includes('hit')) {
          const match = a.bonusText.match(/\+(\d+)/);
          if (match) source.extraHits = parseInt(match[1], 10);
        }
      }
      return source;
    });
    // Merge buff sources with the same name+source (e.g. SpotterReworked range2 + heavy)
    const buffSources: BuffSourceType[] = [];
    for (const src of rawBuffSources) {
      const key = `${src.name}_${src.sourceName}`;
      const existing = buffSources.find(b => `${b.name}_${b.sourceName}` === key);
      if (existing) {
        existing.damageBonus = (existing.damageBonus || 0) + (src.damageBonus || 0);
        existing.extraHits = (existing.extraHits || 0) + (src.extraHits || 0);
        existing.critChanceBonus = (existing.critChanceBonus || 0) + (src.critChanceBonus || 0);
        existing.critDamageBonus = (existing.critDamageBonus || 0) + (src.critDamageBonus || 0);
      } else {
        buffSources.push({ ...src });
      }
    }

    // Add passive ability sources (like SagaOfTheWarriorBorn, RefusalToBeOutdone) for display
    for (const evaluation of passiveResult.evaluations) {
      if (evaluation.applicable && evaluation.modifiers) {
        const source: BuffSourceType = {
          name: evaluation.abilityName,
        };
        let hasBonus = false;

        if (evaluation.modifiers.baseDamageBonus) {
          source.damageBonus = evaluation.modifiers.baseDamageBonus;
          hasBonus = true;
        }
        if (evaluation.modifiers.extraHits) {
          source.extraHits = evaluation.modifiers.extraHits;
          hasBonus = true;
        }
        if (evaluation.modifiers.critDamageBonus) {
          source.critDamageBonus = evaluation.modifiers.critDamageBonus;
          hasBonus = true;
        }
        if (evaluation.modifiers.critChanceBonus) {
          source.critChanceBonus = evaluation.modifiers.critChanceBonus;
          hasBonus = true;
        }
        if (evaluation.modifiers.pierceRatioBonus) {
          source.pierceRatioBonus = evaluation.modifiers.pierceRatioBonus;
          hasBonus = true;
        }

        if (hasBonus) {
          buffSources.push(source);
        }
      }
    }

    // Add active buff sources (like WarHowl, Blood Chalice) with their bonuses (legacy character activeBuffs)
    for (const buff of attacker.activeBuffs) {
      const source: BuffSourceType = {
        name: buff.abilityName || 'Buff',
      };
      if (buff.baseDamageBonus) source.damageBonus = buff.baseDamageBonus;
      if (buff.extraHits) source.extraHits = buff.extraHits;
      if (buff.critChanceBonus) source.critChanceBonus = buff.critChanceBonus;
      if (buff.critDamageBonus) source.critDamageBonus = buff.critDamageBonus;
      // Add pierce ratio bonus if applicable (check meleeOnly flag)
      if (buff.pierceRatioBonus && (!buff.meleeOnly || attackType === 'melee')) {
        source.pierceRatioBonus = buff.pierceRatioBonus;
      }
      // Only add if there's at least one bonus
      if (source.damageBonus || source.extraHits || source.critChanceBonus || source.critDamageBonus || source.pierceRatioBonus) {
        buffSources.push(source);
      }
    }

    // Add pool buff sources
    for (const poolBuff of applicablePoolBuffs) {
      const source: BuffSourceType = {
        name: poolBuff.name,
      };
      if (poolBuff.effects.baseDamageBonus) source.damageBonus = poolBuff.effects.baseDamageBonus;
      if (poolBuff.effects.extraHits) source.extraHits = poolBuff.effects.extraHits;
      if (poolBuff.effects.critChanceBonus) source.critChanceBonus = poolBuff.effects.critChanceBonus;
      if (poolBuff.effects.critDamageBonus) source.critDamageBonus = poolBuff.effects.critDamageBonus;
      if (poolBuff.effects.baseDamageMultiplier && poolBuff.effects.baseDamageMultiplier !== 1) {
        source.damageMultiplier = poolBuff.effects.baseDamageMultiplier;
      }
      if (poolBuff.effects.armorIgnored) source.armorIgnored = poolBuff.effects.armorIgnored;
      if (poolBuff.effects.pierceRatioBonus) source.pierceRatioBonus = poolBuff.effects.pierceRatioBonus;
      // Only add if there's at least one bonus
      if (source.damageBonus || source.extraHits || source.critChanceBonus || source.critDamageBonus || source.damageMultiplier || source.armorIgnored || source.pierceRatioBonus) {
        buffSources.push(source);
      }
    }

    // Add RitesOfBattle source for display
    if (ritesOfBattleSource) {
      buffSources.push(ritesOfBattleSource);
    }

    // Add ObsessiveAnnunciation source for display
    if (obsessiveAnnunciationSource) {
      buffSources.push(obsessiveAnnunciationSource);
    }

    // LegendaryCommander is now handled via the buff pool system
    // LC damage and +2 hits bonuses come from poolBuffEffects via getApplicableBuffs
    // For normal attacks, LC +2 hits doesn't apply (only for special attacks)
    const lcModifiers: Record<string, number>[] = [];

    // Combine all modifiers
    const combinedMods = combineModifiers([...passiveModifiers, ...auraModifiers, ...lcModifiers]);

    // Add bonuses from active buffs to abilityModifiers for source tracking
    const totalCritChanceBonus = (combinedMods.critChanceBonus || 0) + buffCritChanceBonus;
    const buffCritDmgBonus = attacker.activeBuffs.reduce(
      (sum, buff) => sum + (buff.critDamageBonus || 0), 0
    ) + poolCritDmgBonus;
    const buffExtraHits = attacker.activeBuffs.reduce(
      (sum, buff) => sum + (buff.extraHits || 0), 0
    ) + poolExtraHits;

    // Combine damage multipliers: passive mods + active buff multiplier + markerlight + high ground + war machine
    const totalDamageMultiplier = (combinedMods.baseDamageMultiplier || 1) * buffDamageMultiplier * markerlightMultiplier * highGroundMultiplier * warMachineMultiplier;
    // Combine flat damage bonuses: passive mods + active buff bonus + options bonus (Overwatch) + RitesOfBattle
    // Support both legacy baseDamageBonus and new damageBonusSources array
    const optionsDamageBonusSources = options?.damageBonusSources || [];
    const optionsDamageBonus = optionsDamageBonusSources.length > 0
      ? optionsDamageBonusSources.reduce((sum, src) => sum + src.bonus, 0)
      : (options?.baseDamageBonus || 0);
    const totalDamageBonus = (combinedMods.baseDamageBonus || 0) + buffDamageBonus + optionsDamageBonus + ritesOfBattleDmgBonus + obsessiveAnnunciationDmgBonus;

    // Add options damage bonus sources for display (Overwatch with detailed breakdown)
    if (optionsDamageBonusSources.length > 0) {
      // Add individual sources from damageBonusSources
      for (const source of optionsDamageBonusSources) {
        buffSources.push({
          name: source.name,
          damageBonus: source.bonus,
        });
      }
    } else if (optionsDamageBonus > 0) {
      // Legacy fallback: single source
      buffSources.push({
        name: options?.abilityName || 'Overwatch',
        damageBonus: optionsDamageBonus,
      });
    }

    // Add Markerlight buff source for display
    if (markerlightMultiplier > 1) {
      buffSources.push({
        name: 'Markerlight',
        damageMultiplier: markerlightMultiplier,
      });
    }

    // Add High Ground buff source for display
    if (highGroundMultiplier > 1) {
      buffSources.push({
        name: 'High Ground',
        damageMultiplier: highGroundMultiplier,
      });
    }

    // Add Machine of War buff source for display
    if (warMachineMultiplier > 1 && battleState.machineOfWar) {
      buffSources.push({
        name: `Machine of War (+${battleState.machineOfWar.extraDmgPct}%)`,
        damageMultiplier: warMachineMultiplier,
      });
    }

    // Add Supercharge buff source for display (pierce ratio bonus for Plasma)
    if (superchargePierceBonus > 0) {
      buffSources.push({
        name: 'Supercharge',
        pierceRatioBonus: superchargePierceBonus,
      });
    }

    // Add Herald of the Apocalypse debuff source for display
    if (heraldBonus > 0) {
      buffSources.push({
        name: 'Herald of the Apocalypse',
        damageBonus: heraldBonus,
      });
    }

    // Update active buff sources with damage multiplier for proper tracking
    // The earlier loop already added buff sources, now update them with multiplier info
    for (const buff of attacker.activeBuffs) {
      if (buff.baseDamageMultiplier && buff.baseDamageMultiplier !== 1) {
        // Find or add the buff source with multiplier
        const existingSource = buffSources.find(s => s.name === (buff.abilityName || 'Buff'));
        if (existingSource) {
          existingSource.damageMultiplier = buff.baseDamageMultiplier;
        } else {
          buffSources.push({
            name: buff.abilityName || 'Buff',
            damageMultiplier: buff.baseDamageMultiplier,
          });
        }
      }
    }

    // Combine armor ignored from passive abilities and pool buffs
    const totalArmorIgnored = (combinedMods.armorIgnored || 0) + poolArmorIgnored;
    // Combine pierce ratio bonus from passive abilities and pool buffs
    const totalPierceRatioBonus = (combinedMods.pierceRatioBonus || 0) + poolPierceRatioBonus;

    attackerStats.abilityModifiers = {
      ...combinedMods,
      baseDamageBonus: totalDamageBonus > 0 ? totalDamageBonus : undefined,
      baseDamageMultiplier: totalDamageMultiplier !== 1 ? totalDamageMultiplier : undefined,
      critChanceBonus: totalCritChanceBonus > 0 ? totalCritChanceBonus : undefined,
      critDamageBonus: (combinedMods.critDamageBonus || 0) + buffCritDmgBonus > 0 ? (combinedMods.critDamageBonus || 0) + buffCritDmgBonus : undefined,
      extraHits: (combinedMods.extraHits || 0) + buffExtraHits > 0 ? (combinedMods.extraHits || 0) + buffExtraHits : undefined,
      armorIgnored: totalArmorIgnored > 0 ? totalArmorIgnored : undefined,
      pierceRatioBonus: totalPierceRatioBonus > 0 ? totalPierceRatioBonus : undefined,
      buffSources,
    };

    // Use boss armor and traits if available, accounting for armor reduction
    const baseBossArmor = battleState.boss?.armor ?? 0;
    const bossArmor = Math.max(0, baseBossArmor - (battleState.bossArmorReduction || 0));

    // Check if boss has Daemon trait for block mechanic
    const hasDaemonTraitExec = battleState.boss?.traits?.includes('Daemon') ?? false;

    const defenderStats: DefenderStats = {
      armor: bossArmor,
      maxHealth: battleState.boss?.health ?? 100000,
      traits: battleState.boss?.traits,
      // Daemon block stats
      daemonBlockChance: hasDaemonTraitExec ? 0.25 : undefined,
      daemonBlockMaxAmount: hasDaemonTraitExec ? (battleState.boss?.damage ?? 0) * 0.5 : undefined,
    };

    // Calculate damage with logging enabled
    const calculator = new DamageCalculator(true);
    const result = calculator.calculate(attackerStats, defenderStats);

    // Print detailed calculation log to console
    console.group(`=== TURN ${currentTurn}: ${attacker.name} ${attackType.toUpperCase()} ATTACK ===`);

    // Log trait modifiers if any applied
    if (result.traitModifiers.length > 0) {
      console.log('\n--- TRAIT MODIFIERS ---');
      for (const mod of result.traitModifiers) {
        if (mod.applicable) {
          const bonusPercent = ((mod.damageMultiplier - 1) * 100).toFixed(0);
          const sign = mod.damageMultiplier >= 1 ? '+' : '';
          console.log(`${mod.traitName}: ${sign}${bonusPercent}% (${mod.reason})`);
        }
      }
      if (result.traitMultiplier !== 1) {
        console.log(`Combined Multiplier: ${result.traitMultiplier.toFixed(2)}x`);
      }
    }

    // Log active buffs (auras from teammates)
    const activeBuffs = auraBonuses.filter(a => a.isActive);
    if (activeBuffs.length > 0) {
      console.log('\n--- ACTIVE BUFFS ---');
      for (const buff of activeBuffs) {
        console.log(`${buff.bonusText} from ${buff.sourceCharacterName}'s ${buff.abilityName}`);
      }
    }

    calculator.printLogs();

    console.log('\n--- SUMMARY ---');
    console.log(`Damage: ${result.damage.toLocaleString()}`);

    // Prophet of Gork and Mork: Track attacks and apply damage reduction
    // Reduction applies AFTER threshold is reached (attacks 5+ if threshold is 4)
    let prophetAttackCounter = battleState.bossAttacksReceivedThisTurn;
    const prophetThreshold = battleState.prophetOfGorkAndMork?.attackThreshold ?? Infinity;
    const prophetReductionPct = battleState.prophetOfGorkAndMork?.damageReductionPct ?? 0;
    const prophetMultiplier = prophetReductionPct > 0 ? (100 - prophetReductionPct) / 100 : 1; // e.g., 90% reduction = 0.1 multiplier

    // Check if Prophet reduction applies to main attack
    let mainAttackProphetReduction = 1;
    if (prophetAttackCounter >= prophetThreshold && prophetReductionPct > 0) {
      mainAttackProphetReduction = prophetMultiplier;
      console.log(`[Prophet of Gork and Mork: -${prophetReductionPct}% damage (attack ${prophetAttackCounter + 1})]`);
    }

    // Track total damage including follow-up attacks
    let totalDamage = Math.round(result.damage * mainAttackProphetReduction);
    // Track max perHitDamage for Laviscus outrage (uses highest perHitDamage from any attack)
    let maxPerHitDamage = result.perHitDamage;

    // Increment counter for main attack
    prophetAttackCounter++;

    // Collect follow-up attack logs for the battle log (declare early for OG trigger)
    const followUpAttackLogs: FollowUpAttackLog[] = [];

    // Store Exitor-Rho damage for later update (if OG triggers)
    let exitorRhoDamageToAdd = 0;
    let exitorRhoIdForUpdate: string | null = null;
    let exitorRhoUsedFirstSpecial = false; // Track if LC +2 hits were used

    // Trigger Optimised Gait after main attack (if attacker is Mechanical)
    const ogResultMainAttack = triggerOptimisedGait({
      triggeringAttackerId: attackerId,
      triggeringAttackerName: attacker.name,
      triggeringAttackerTraits: attacker.traits,
      battleState: get().battleState!,
      defenderStats,
      bossArmor,
      ignoreCrit,
      prophetAttackCounter,
      prophetThreshold,
      prophetReductionPct,
      prophetMultiplier,
      hasExitorRhoUsedFirstSpecial: exitorRhoUsedFirstSpecial, // Track LC +2 hits usage
    });

    // Store pending OG logs to push AFTER additional attacks (sharesCritChain=true)
    // This ensures OG appears after CIB Melee, not before it
    let pendingOGLogs: FollowUpAttackLog[] = [];

    if (ogResultMainAttack) {
      totalDamage += ogResultMainAttack.totalDamage;
      prophetAttackCounter = ogResultMainAttack.prophetCounter;
      maxPerHitDamage = Math.max(maxPerHitDamage, ogResultMainAttack.maxPerHitDamage);
      // Store pending OG logs instead of pushing immediately
      pendingOGLogs = [...ogResultMainAttack.followUpLogs];
      exitorRhoDamageToAdd += ogResultMainAttack.totalDamage;
      exitorRhoIdForUpdate = ogResultMainAttack.exitorRhoId;
      // Track if LC +2 hits were used (only the first OG trigger should get them)
      exitorRhoUsedFirstSpecial = exitorRhoUsedFirstSpecial || ogResultMainAttack.exitorRhoUsedFirstSpecial;
    }

    // Handle follow-up attacks from passives (like LegacyOfCombat, TheBetrayer, WayOfTheShortBlade)
    // Filter based on triggersOnNormalOnly and triggersOnMeleeOnly flags
    const isNormalAttack = attackType === 'melee' || attackType === 'ranged';
    const isMeleeAttack = attackType === 'melee';

    // AstartesBanner (Thoread): detect if banner is active for inline hit computation
    // Banner adds +1 hit after EACH melee attack (main + each follow-up), using same stats + finalDamageCap
    let bannerActive = false;
    let bannerMaxDmg = 0;
    if (isMeleeAttack) {
      const thoread = battleState.team.find(c => c.passiveAbilities.includes('AstartesBanner'));
      if (thoread && thoread.id !== attacker.id) {
        const bannerToggleId = `AstartesBanner_${thoread.id}_range2`;
        if (isToggleActive(attacker.abilityToggles[bannerToggleId])) {
          const bannerLevelIndex = thoread.abilityLevels?.['AstartesBanner'] ?? 54;
          const bannerValues = getAbilityValues('AstartesBanner', bannerLevelIndex, thoread.progressionStepIndex);
          if (bannerValues) {
            bannerActive = true;
            bannerMaxDmg = bannerValues.maxDmg as number || 0;
          }
        }
      }
    }

    // AstartesBanner: +1 hit after main melee attack (same stats, capped at maxDmg)
    if (bannerActive) {
      const bannerStats: AttackerStats = {
        ...attackerStats,
        hits: 1,
        damageCaps: { ...(attackerStats.damageCaps || {}), finalDamageCap: bannerMaxDmg },
        critChainOffset: result.totalHits,
        abilityModifiers: attackerStats.abilityModifiers ? {
          ...attackerStats.abilityModifiers,
          extraHits: undefined,  // Banner is exactly 1 hit
        } : undefined,
      };
      const bannerCalc = new DamageCalculator(true);
      const bannerResult = bannerCalc.calculate(bannerStats, defenderStats);

      // Apply Prophet reduction
      let bannerProphetReduction = 1;
      if (prophetAttackCounter >= prophetThreshold && prophetReductionPct > 0) {
        bannerProphetReduction = prophetMultiplier;
      }
      const adjustedBannerDamage = Math.round(bannerResult.damage * bannerProphetReduction);
      // Banner shares crit chain, so no separate prophet counter increment

      totalDamage += adjustedBannerDamage;
      maxPerHitDamage = Math.max(maxPerHitDamage, bannerResult.perHitDamage);

      // Build breakdown
      const bannerBreakdown: DamageBreakdown = {
        damage: bannerResult.damage,
        perHitDamage: bannerResult.perHitDamage,
        hits: bannerResult.totalHits,
        baseDamage: bannerResult.baseDamage,
        flatModifiers: bannerResult.flatModifiers,
        flatModifierSources: bannerResult.flatModifierSources,
        critBonus: bannerResult.critBonus,
        critChanceSources: bannerResult.critChanceSources,
        critDamageSources: bannerResult.critDamageSources,
        extraHits: bannerResult.extraHits,
        extraHitsSources: bannerResult.extraHitsSources,
        damVarMod: bannerResult.damVarMod,
        targetArmor: bossArmor,
        armorIgnored: bannerResult.armorIgnored,
        armorIgnoredSources: bannerResult.armorIgnoredSources,
        effectiveArmor: bannerResult.effectiveArmor,
        afterArmor: bannerResult.afterArmor,
        pierceRatio: bannerResult.pierceRatio,
        effectivePierceRatio: bannerResult.effectivePierceRatio,
        pierceRatioBonus: bannerResult.pierceRatioBonus,
        pierceRatioBonusSources: bannerResult.pierceRatioBonusSources,
        pierceFloor: bannerResult.pierceFloor,
        afterArmorPierce: bannerResult.afterArmorPierce,
        globalMultiplier: bannerResult.globalMultiplier,
        globalMultiplierSources: bannerResult.globalMultiplierSources,
        baseCritChance: bannerResult.baseCritChance,
        baseCritDamage: bannerResult.baseCritDamage,
        critChanceBonus: bannerResult.critChanceTotalBonus,
        critDmgBonus: bannerResult.critDamageTotalBonus,
        critChance: bannerResult.effectiveCritChance * 100,
        critDamage: bannerResult.effectiveCritDamage,
        traitModifiers: bannerResult.traitModifiers,
        traitMultiplier: bannerResult.traitMultiplier,
        expectedBlocks: bannerResult.expectedBlocks,
        blockReductionPerHit: bannerResult.blockReductionPerHit,
        totalBlockReduction: bannerResult.totalBlockReduction,
      };
      if (bannerProphetReduction < 1) {
        bannerBreakdown.globalMultiplier = (bannerBreakdown.globalMultiplier || 1) * bannerProphetReduction;
        bannerBreakdown.globalMultiplierSources = [
          ...(bannerBreakdown.globalMultiplierSources || []),
          { name: 'Prophet of Gork and Mork', damageMultiplier: bannerProphetReduction }
        ];
        bannerBreakdown.damage = adjustedBannerDamage;
        bannerBreakdown.perHitDamage = Math.round(bannerBreakdown.perHitDamage * bannerProphetReduction);
      }

      followUpAttackLogs.push({
        abilityName: 'Astartes Banner',
        damage: adjustedBannerDamage,
        hits: bannerResult.totalHits,
        damageType: attackerStats.damageType,
        attackType: 'melee',
        breakdown: bannerBreakdown,
      });

      console.log(`\nAstartes Banner (main attack): 1x ${attackerStats.damageType} (cap ${bannerMaxDmg})`);
      bannerCalc.printLogs();
      console.log(`Banner Damage: ${adjustedBannerDamage.toLocaleString()}`);
    }

    // Check for WayOfTheShortBlade aura: T'au Empire characters get ranged follow-up after melee
    // if Farsight is on the team and they have the toggle checked
    const allFollowUps = [...passiveResult.followUpAttacks];
    if (isMeleeAttack) {
      const isTauEmpire = attacker.faction === "T'au Empire" || attacker.faction === 'Tau';
      const hasRangedAttack = attacker.rangedHits !== undefined && attacker.rangedHits > 0;
      const hasMeleeAttack = attacker.meleeHits !== undefined && attacker.meleeHits > 0;

      if (isTauEmpire && hasRangedAttack && hasMeleeAttack) {
        // Find Farsight (character with WayOfTheShortBlade) on the team
        const farsight = battleState.team.find(c => c.passiveAbilities.includes('WayOfTheShortBlade'));
        if (farsight && farsight.id !== attacker.id) {
          // Check if this T'au character has the toggle checked
          const meleeToggleId = `WayOfTheShortBlade_${farsight.id}_melee`;
          const meleeToggleIsActive = isToggleActive(attacker.abilityToggles[meleeToggleId]);

          if (meleeToggleIsActive) {
            // Add ranged follow-up attack from WayOfTheShortBlade aura
            allFollowUps.push({
              abilityId: 'WayOfTheShortBlade',
              abilityName: 'Way of the Short Blade',
              damageProfile: attacker.rangedDamageType || 'Piercing',
              minDamage: 0,
              maxDamage: 0,
              hits: 0,
              attackCategory: 'normal',
              triggersOnMeleeOnly: true,
              useCharacterRangedStats: true,
              multiplierSourceName: 'Way of the Short Blade',  // For global multiplier display
            });

            // If character has CyclicIonBlaster, add its follow-up after the ranged attack
            // (CyclicIonBlaster triggers on normal attacks, which includes the WayOfTheShortBlade ranged follow-up)
            if (attacker.passiveAbilities.includes('CyclicIonBlaster')) {
              const cibLevelIndex = attacker.abilityLevels?.['CyclicIonBlaster'] ?? 54;
              const cibValues = getAbilityValues('CyclicIonBlaster', cibLevelIndex, attacker.progressionStepIndex);
              if (cibValues) {
                const cibMinDmg = cibValues.minDmg as number || 0;
                const cibMaxDmg = cibValues.maxDmg as number || 0;
                const cibExtraDmg = cibValues.extraDmg as number || 0;
                const cibHits = 3;

                // Check if boss has Mechanical trait or Markerlight debuff
                const hasMechanical = battleState.boss?.traits?.includes('Mechanical') ?? false;
                const hasMarkerlight = battleState.bossHasMarkerlight;
                const hasBonus = hasMechanical || hasMarkerlight;

                // Build conditional damage bonus for proper Modifiers display
                const cibConditionalBonus = hasBonus ? {
                  amount: cibExtraDmg,
                  sourceName: hasMechanical && hasMarkerlight ? 'Mechanical/Markerlight' : (hasMechanical ? 'Mechanical' : 'Markerlight'),
                } : undefined;

                allFollowUps.push({
                  abilityId: 'CyclicIonBlaster',
                  abilityName: 'Cyclic Ion Blaster',
                  damageProfile: 'Particle',
                  minDamage: cibMinDmg,  // Base damage without bonus
                  maxDamage: cibMaxDmg,  // Base damage without bonus
                  hits: cibHits,
                  attackCategory: 'normal',
                  triggersOnNormalOnly: true,
                  followUpAttackType: 'ranged',  // CyclicIonBlaster is a ranged attack
                  conditionalDamageBonus: cibConditionalBonus,
                  sharesCritChain: true,  // Additional Attack - shares crit chain and doesn't count for Prophet of Gork and Mork
                });
              }
            }
          }
        }
      }
    }

    // Check for teammate aura follow-ups (ExplosiveMaladies, InfernalPacts)
    for (const teammate of battleState.team) {
      if (teammate.id === attacker.id) continue;

      // ExplosiveMaladies (Pestillian): +1x Blast follow-up on ranged (Chaos: also melee)
      if (teammate.passiveAbilities.includes('ExplosiveMaladies')) {
        const toggleId = `ExplosiveMaladies_${teammate.id}_adjacent`;
        if (isToggleActive(attacker.abilityToggles[toggleId])) {
          const levelIndex = teammate.abilityLevels?.['ExplosiveMaladies'] ?? 54;
          const values = getAbilityValues('ExplosiveMaladies', levelIndex, teammate.progressionStepIndex);
          if (values) {
            const extraDmg = values.extraDmg as number || 0;
            const isChaos = attacker.alliance === 'Chaos';
            if (attackType === 'ranged' || (attackType === 'melee' && isChaos)) {
              allFollowUps.push({
                abilityId: 'ExplosiveMaladies',
                abilityName: 'Explosive Maladies',
                damageProfile: 'Blast' as DamageType,
                minDamage: extraDmg,
                maxDamage: extraDmg,
                hits: 1,
                attackCategory: 'special',
              });
            }
          }
        }
      }

      // InfernalPacts (Abraxas): +1x Psychic follow-up on ranged (Daemons: also melee)
      if (teammate.passiveAbilities.includes('InfernalPacts')) {
        const toggleId = `InfernalPacts_${teammate.id}_adjacent`;
        if (isToggleActive(attacker.abilityToggles[toggleId])) {
          const levelIndex = teammate.abilityLevels?.['InfernalPacts'] ?? 54;
          const values = getAbilityValues('InfernalPacts', levelIndex, teammate.progressionStepIndex);
          if (values) {
            const minDmg = values.minDmg as number || 0;
            const maxDmg = values.maxDmg as number || 0;
            const isDaemon = attacker.traits?.includes('Daemon') ?? false;
            if (attackType === 'ranged' || (attackType === 'melee' && isDaemon)) {
              allFollowUps.push({
                abilityId: 'InfernalPacts',
                abilityName: 'Infernal Pacts',
                damageProfile: 'Psychic' as DamageType,
                minDamage: minDmg,
                maxDamage: maxDmg,
                hits: 1,
                attackCategory: 'special',
              });
            }
          }
        }
      }
    }

    // FoulInfusion (Pestillian): +1x Toxic follow-up on melee attacks
    if (attacker.foulInfusionActive && isMeleeAttack) {
      const dmg = attacker.foulInfusionDmg || 0;
      allFollowUps.push({
        abilityId: 'FoulInfusion',
        abilityName: 'Foul Infusion',
        damageProfile: 'Toxic' as DamageType,
        minDamage: dmg,
        maxDamage: dmg,
        hits: 1,
        attackCategory: 'special',
        triggersOnMeleeOnly: true,
      });
    }

    // SorcerousFacade (Yazaghor): +1x Psychic follow-up on attacks
    if (attacker.sorcerousFacadeActive) {
      allFollowUps.push({
        abilityId: 'SorcerousFacade',
        abilityName: 'Sorcerous Facade',
        damageProfile: 'Psychic' as DamageType,
        minDamage: attacker.sorcerousFacadeMinDmg || 0,
        maxDamage: attacker.sorcerousFacadeMaxDmg || 0,
        hits: 1,
        attackCategory: 'special',
      });
    }

    const eligibleFollowUps = allFollowUps.filter(followUp => {
      if (followUp.triggersOnNormalOnly && !isNormalAttack) {
        return false;  // Skip if this follow-up only triggers on normal attacks
      }
      if (followUp.triggersOnMeleeOnly && !isMeleeAttack) {
        return false;  // Skip if this follow-up only triggers on melee attacks
      }
      // If follow-up uses character ranged stats, check if character has ranged attacks
      if (followUp.useCharacterRangedStats) {
        const hasRangedAttack = attacker.rangedHits !== undefined && attacker.rangedHits > 0;
        if (!hasRangedAttack) return false;
      }
      return true;
    });

    // Track if LC +2 hits was applied to any follow-up attack
    let lcHitsAppliedInNormalFollowUps = false;
    // Track effective attacker state for follow-up evaluations
    let effectiveAttacker = attacker;
    // Track cumulative hits for crit chain offset (for Additional Attacks like Cyclic Ion Blaster)
    // Starts with the source attack's total hits (+ banner hit if active)
    let cumulativeHitsForCritChain = result.totalHits + (bannerActive ? 1 : 0);
    // Track cumulative boss armor reduction from follow-up attacks (e.g., ChampionOfTheFeast)
    let followUpArmorReductionTotal = 0;
    // Track if any follow-up ranged attack occurred (for Structural Analyser Markerlight)
    let hadFollowUpRangedAttack = false;

    if (eligibleFollowUps.length > 0) {
      console.log('\n--- FOLLOW-UP ATTACKS ---');

      for (const followUp of eligibleFollowUps) {
        // If this is NOT an additional attack, push any pending OG logs first
        // This ensures OG appears AFTER additional attacks (CIB) of the previous attack
        if (!followUp.sharesCritChain && pendingOGLogs.length > 0) {
          followUpAttackLogs.push(...pendingOGLogs);
          pendingOGLogs = [];
        }

        // Determine if this follow-up uses character's ranged stats
        const usesCharacterRangedStats = followUp.useCharacterRangedStats ?? false;

        // Get effective follow-up stats (from follow-up definition or character's ranged stats)
        let effectiveMinDamage = followUp.minDamage;
        let effectiveMaxDamage = followUp.maxDamage;
        let effectiveHits = followUp.hits;
        let effectiveDamageProfile = followUp.damageProfile;
        let effectiveAttackType: 'melee' | 'ranged' = followUp.followUpAttackType || 'melee';  // Use explicit type or default to melee

        if (usesCharacterRangedStats) {
          // Use character's normal ranged attack stats
          const rangedStats = {
            minDamage: attacker.calculatedDamage,  // Character base damage
            maxDamage: attacker.calculatedDamage,  // Same as min for expected damage
            hits: attacker.rangedHits || 0,
            damageType: attacker.rangedDamageType || 'Piercing',
          };
          effectiveMinDamage = rangedStats.minDamage;
          effectiveMaxDamage = rangedStats.maxDamage;
          effectiveHits = rangedStats.hits;
          effectiveDamageProfile = rangedStats.damageType as DamageType;
          effectiveAttackType = 'ranged';  // This is a ranged follow-up
        }

        // Track if this is a ranged follow-up (for Structural Analyser)
        if (effectiveAttackType === 'ranged') {
          hadFollowUpRangedAttack = true;
        }

        // Calculate average damage for the follow-up attack
        const avgDamage = Math.round((effectiveMinDamage + effectiveMaxDamage) / 2);
        const multipliedDamage = Math.round(avgDamage * (followUp.damageMultiplier || 1));

        // Get current battle state for buff evaluation
        const currentBattleState = get().battleState!;
        // Create effective battle state with updated attacker for buff evaluation
        const effectiveBattleState = {
          ...currentBattleState,
          team: currentBattleState.team.map(c => c.id === attackerId ? effectiveAttacker : c),
        };

        // Use the follow-up's defined attack category (important for buff evaluation)
        // CyclicIonBlaster has attackCategory: 'normal' which should be respected
        const effectiveAttackCategory = followUp.attackCategory || (usesCharacterRangedStats ? 'normal' : 'special');

        // Build buff pool evaluation context for follow-up attack
        const followUpBuffContext: BuffEvaluationContext = {
          attacker: effectiveAttacker,
          attackType: effectiveAttackType,
          attackCategory: effectiveAttackCategory as 'normal' | 'special' | 'ability',
          target: currentBattleState.boss,
          battleState: effectiveBattleState,
        };

        // Get applicable buffs from the pool (includes LC buffs if conditions met)
        const followUpApplicableBuffs = getApplicableBuffs(currentBattleState.buffPool, followUpBuffContext);
        const followUpPoolEffects = combineBuffEffects(followUpApplicableBuffs);

        // Extract bonuses from pool effects (LC, Way of the Short Blade, Exemplar, Euphoric Strikes, etc.)
        const lcExtraDmg = followUpPoolEffects.baseDamageBonus || 0;
        // Additional Attacks (sharesCritChain) can't receive bonus hits - they're part of the source attack
        // which already received the bonus hits
        const lcExtraHits = followUp.sharesCritChain ? 0 : (followUpPoolEffects.extraHits || 0);
        const followUpArmorIgnored = followUpPoolEffects.armorIgnored || 0;
        const followUpDamageMultiplier = followUpPoolEffects.baseDamageMultiplier || 1;
        const followUpCritChanceBonus = followUpPoolEffects.critChanceBonus || 0;
        const followUpCritDamageBonus = followUpPoolEffects.critDamageBonus || 0;

        // If LC +2 hits was applied, update effective attacker for subsequent follow-ups
        if (lcExtraHits > 0) {
          effectiveAttacker = { ...effectiveAttacker, hasUsedFirstSpecialAttackThisTurn: true };
          lcHitsAppliedInNormalFollowUps = true;
        }

        // Only show pool buff log if Trajann (Legendary Commander) is in the team
        if ((lcExtraDmg > 0 || lcExtraHits > 0) && currentBattleState.team.some(c => c.passiveAbilities.includes('LegendaryCommander'))) {
          console.log(`[Pool Buff applied: +${lcExtraDmg} dmg, +${lcExtraHits} hits]`);
        }

        // Get Lord of the Host aura bonuses for follow-up attacks
        const followUpAuraBonuses = getCharacterAuraBonuses(attacker, battleState.team);
        const activeFollowUpAuras = followUpAuraBonuses.filter(a => {
          if (!a.isActive) return false;
          // Only apply auras that match the attack type
          if (a.attackTypeRestriction && a.attackTypeRestriction !== effectiveAttackType) return false;
          return true;
        });

        // Calculate aura damage and hit bonuses
        // Additional Attacks can't receive bonus hits (they're part of the source attack)
        let auraDmgBonus = 0;
        let auraHitsBonus = 0;
        for (const aura of activeFollowUpAuras) {
          if (aura.modifiers) {
            auraDmgBonus += aura.modifiers.baseDamageBonus || 0;
            if (!followUp.sharesCritChain) {
              auraHitsBonus += aura.modifiers.extraHits || 0;
            }
          }
        }

        if (auraDmgBonus > 0 || auraHitsBonus > 0) {
          console.log(`[Aura Buff applied: +${auraDmgBonus} dmg, +${auraHitsBonus} hits]`);
        }

        // Build follow-up attacker stats
        // Follow-up attacks get trait bonuses if eligible (e.g., BeastSnagga +20% vs Big Target)
        // Note: Follow-up attacks happen AFTER the main attack, so hasAttackedThisBattle is true
        // and attacksThisTurn is at least 1
        // RapidAssault applies to follow-ups if this is the first attack turn

        // Build buff sources for breakdown display (iterate through applicable pool buffs)
        type FollowUpBuffSource = { name: string; sourceName?: string; damageBonus?: number; extraHits?: number; armorIgnored?: number; damageMultiplier?: number; critChanceBonus?: number; critDamageBonus?: number; pierceRatioBonus?: number };
        const followUpBuffSources: FollowUpBuffSource[] = [];

        // Add each applicable pool buff as a source
        for (const poolBuff of followUpApplicableBuffs) {
          const effects = poolBuff.effects;
          const source: FollowUpBuffSource = {
            name: poolBuff.name,
          };

          if (effects.baseDamageBonus) source.damageBonus = effects.baseDamageBonus;
          if (effects.extraHits) source.extraHits = effects.extraHits;
          if (effects.armorIgnored) source.armorIgnored = effects.armorIgnored;
          if (effects.baseDamageMultiplier && effects.baseDamageMultiplier !== 1) {
            source.damageMultiplier = effects.baseDamageMultiplier;
          }
          if (effects.critChanceBonus) source.critChanceBonus = effects.critChanceBonus;
          if (effects.critDamageBonus) source.critDamageBonus = effects.critDamageBonus;

          // Only add if there's at least one bonus
          if (source.damageBonus || source.extraHits || source.armorIgnored || source.damageMultiplier || source.critChanceBonus || source.critDamageBonus) {
            followUpBuffSources.push(source);
          }
        }

        // Add follow-up multiplier source if not from pool (e.g., Way of the Short Blade aura)
        if (followUp.multiplierSourceName && followUpDamageMultiplier !== 1) {
          const hasMultiplierSource = followUpBuffSources.some(s => s.damageMultiplier);
          if (!hasMultiplierSource) {
            followUpBuffSources.push({
              name: followUp.multiplierSourceName,
              damageMultiplier: followUpDamageMultiplier,
            });
          }
        }
        for (const aura of activeFollowUpAuras) {
          if (aura.modifiers) {
            const dmgBonus = aura.modifiers.baseDamageBonus || 0;
            const hitsBonus = aura.modifiers.extraHits || 0;
            if (dmgBonus > 0 || hitsBonus > 0) {
              followUpBuffSources.push({
                name: aura.abilityName,
                sourceName: aura.sourceCharacterName,
                damageBonus: dmgBonus > 0 ? dmgBonus : undefined,
                extraHits: hitsBonus > 0 ? hitsBonus : undefined,
              });
            }
          }
        }

        // Markerlight debuff: T'au Empire ranged attacks deal +15% damage (follow-up attacks)
        const followUpIsTauEmpire = attacker.faction === "T'au Empire" || attacker.faction === 'Tau';
        const followUpMarkerlightMultiplier = (followUpIsTauEmpire && effectiveAttackType === 'ranged' && currentBattleState.bossHasMarkerlight) ? 1.15 : 1;

        // High Ground: +50% damage multiplier when toggle is enabled
        const followUpHighGroundMultiplier = attacker.abilityToggles['HighGround'] ? 1.5 : 1;

        // War Machine: dynamic damage multiplier based on selected Machine of War
        const followUpWarMachineMultiplier = attacker.abilityToggles['WarMachine'] && currentBattleState.machineOfWar
          ? 1 + currentBattleState.machineOfWar.extraDmgPct / 100
          : 1;

        const finalFollowUpMultiplier = followUpDamageMultiplier * followUpMarkerlightMultiplier * followUpHighGroundMultiplier * followUpWarMachineMultiplier;

        // Add Markerlight buff source for display
        if (followUpMarkerlightMultiplier > 1) {
          followUpBuffSources.push({
            name: 'Markerlight',
            damageMultiplier: followUpMarkerlightMultiplier,
          });
        }

        // Add High Ground buff source for display
        if (followUpHighGroundMultiplier > 1) {
          followUpBuffSources.push({
            name: 'High Ground',
            damageMultiplier: followUpHighGroundMultiplier,
          });
        }

        // Add Machine of War buff source for display
        if (followUpWarMachineMultiplier > 1 && currentBattleState.machineOfWar) {
          followUpBuffSources.push({
            name: `Machine of War (+${currentBattleState.machineOfWar.extraDmgPct}%)`,
            damageMultiplier: followUpWarMachineMultiplier,
          });
        }

        // Add conditional damage bonus (e.g., CyclicIonBlaster extraDmg from Markerlight/Mechanical)
        const conditionalDmgBonus = followUp.conditionalDamageBonus?.amount || 0;
        if (conditionalDmgBonus > 0 && followUp.conditionalDamageBonus) {
          followUpBuffSources.push({
            name: followUp.conditionalDamageBonus.sourceName,
            damageBonus: conditionalDmgBonus,
          });
        }

        // Add Overwatch bonus inheritance for follow-up attacks (e.g., CyclicIonBlaster triggered by Overwatch)
        // Only applies to Additional Attacks (sharesCritChain) which are considered part of the source attack
        let overwatchDmgBonus = 0;
        if (options?.isOverwatchAttack && followUp.sharesCritChain && options?.damageBonusSources) {
          for (const source of options.damageBonusSources) {
            followUpBuffSources.push({
              name: source.name,
              damageBonus: source.bonus,
            });
            overwatchDmgBonus += source.bonus;
          }
        }

        // Supercharge (Sarquael): +pierce ratio bonus for ALL team Plasma attacks this turn
        const followUpSuperchargeBonus = (currentBattleState.superchargePierceBonus && effectiveDamageProfile === 'Plasma')
          ? currentBattleState.superchargePierceBonus
          : 0;

        // Add Supercharge buff source for display
        if (followUpSuperchargeBonus > 0) {
          followUpBuffSources.push({
            name: 'Supercharge',
            pierceRatioBonus: followUpSuperchargeBonus,
          });
        }

        // Blood Chalice and other activeBuffs pierce ratio bonus (check meleeOnly flag)
        const followUpBuffPierceRatioBonus = attacker.activeBuffs.reduce(
          (sum, buff) => {
            if (!buff.pierceRatioBonus) return sum;
            // Check if buff is melee only and we're not doing melee
            if (buff.meleeOnly && effectiveAttackType !== 'melee') return sum;
            return sum + buff.pierceRatioBonus;
          }, 0
        );

        // Add activeBuffs pierce ratio sources for display
        for (const buff of attacker.activeBuffs) {
          if (buff.pierceRatioBonus && (!buff.meleeOnly || effectiveAttackType === 'melee')) {
            followUpBuffSources.push({
              name: buff.abilityName || 'Active Buff',
              pierceRatioBonus: buff.pierceRatioBonus,
            });
          }
        }

        const followUpTotalPierceRatioBonus = followUpSuperchargeBonus + followUpBuffPierceRatioBonus;

        const followUpStats: AttackerStats = {
          baseDamage: multipliedDamage,  // Just the ability base damage (avg of min/max * multiplier)
          damageType: effectiveDamageProfile,  // Use effective damage profile (may be from character's ranged)
          hits: effectiveHits,  // Use effective hits (may be from character's ranged)
          critChance: equipmentStats.critChance || 0,
          critDamage: equipmentStats.critDmg || 0,
          critChanceBonus: (equipmentStats.critChanceBonus || 0) + followUpCritChanceBonus,
          critDmgBonus: (equipmentStats.critDmgBonus || 0) + followUpCritDamageBonus,
          ignoreCrit,
          traits: attacker.traits, // Apply trait bonuses to follow-up attacks
          hasMoved: true,
          attackType: effectiveAttackType, // Use effective attack type (melee or ranged)
          hasAttackedThisBattle: true, // Main attack just happened
          attacksThisTurn: 1, // At least 1 attack this turn (the main attack)
          // Use the main attack's firstAttackTurn (if null, this is the first attack turn)
          firstAttackTurn: attacker.firstAttackTurn ?? currentTurn,
          currentTurn,
          // Crit chain offset for Additional Attacks (shares crit chain with source attack)
          critChainOffset: followUp.sharesCritChain ? cumulativeHitsForCritChain : undefined,
          // Pass ability toggles for trait evaluation (e.g., RangedSpecialist adjacency check)
          abilityToggles: attacker.abilityToggles,
          // Pass Fighting Retreat flag for RangedSpecialist override
          fightingRetreatActive: attacker.fightingRetreatActive,
          // Pass damage caps from follow-up definition (e.g., AstartesBanner finalDamageCap)
          damageCaps: followUp.damageCaps,
          // Pass bonuses via abilityModifiers for proper source tracking in breakdown
          abilityModifiers: (lcExtraDmg + auraDmgBonus + conditionalDmgBonus + overwatchDmgBonus > 0 || lcExtraHits + auraHitsBonus > 0 || followUpArmorIgnored > 0 || finalFollowUpMultiplier !== 1 || followUpCritChanceBonus > 0 || followUpCritDamageBonus > 0 || followUpTotalPierceRatioBonus > 0) ? {
            baseDamageBonus: lcExtraDmg + auraDmgBonus + conditionalDmgBonus + overwatchDmgBonus > 0 ? lcExtraDmg + auraDmgBonus + conditionalDmgBonus + overwatchDmgBonus : undefined,
            extraHits: lcExtraHits + auraHitsBonus > 0 ? lcExtraHits + auraHitsBonus : undefined,
            armorIgnored: followUpArmorIgnored > 0 ? followUpArmorIgnored : undefined,
            baseDamageMultiplier: finalFollowUpMultiplier !== 1 ? finalFollowUpMultiplier : undefined,
            critChanceBonus: followUpCritChanceBonus > 0 ? followUpCritChanceBonus : undefined,
            critDamageBonus: followUpCritDamageBonus > 0 ? followUpCritDamageBonus : undefined,
            pierceRatioBonus: followUpTotalPierceRatioBonus > 0 ? followUpTotalPierceRatioBonus : undefined,
            buffSources: followUpBuffSources,
          } : undefined,
        };

        // Calculate follow-up damage
        const followUpCalculator = new DamageCalculator(true);
        const followUpResult = followUpCalculator.calculate(followUpStats, defenderStats);

        // Update cumulative hits for crit chain tracking
        if (followUp.sharesCritChain) {
          // Additional Attack: add hits to the chain
          cumulativeHitsForCritChain += followUpResult.totalHits;
        } else {
          // Regular follow-up: starts a new chain, subsequent Additional Attacks continue from here
          cumulativeHitsForCritChain = followUpResult.totalHits;
        }

        // Log follow-up attack details (totalHits includes base + extra from abilityModifiers)
        const bonusText = (followUp.damageMultiplier || 1) > 1
          ? ` (×${followUp.damageMultiplier?.toFixed(2)} from attack turns)`
          : '';
        const categoryText = followUp.attackCategory === 'special' ? ' [SPECIAL]' : '';
        const attackTypeText = `[${effectiveAttackType.toUpperCase()}/${effectiveAttackCategory}]`;
        // Only show LC text if Trajann (Legendary Commander) is in the team
        const lcText = (lcExtraDmg > 0 || lcExtraHits > 0) && currentBattleState.team.some(c => c.passiveAbilities.includes('LegendaryCommander'))
          ? ` [+LC: ${lcExtraDmg} dmg, ${lcExtraHits} hits]` : '';
        const auraText = auraDmgBonus > 0 || auraHitsBonus > 0 ? ` [+Aura: ${auraDmgBonus} dmg, ${auraHitsBonus} hits]` : '';
        console.log(`\n${followUp.abilityName} ${attackTypeText}${categoryText}: ${followUpResult.totalHits}x ${followUp.damageProfile}${bonusText}${lcText}${auraText}`);
        followUpCalculator.printLogs();
        console.log(`Follow-up Damage: ${followUpResult.damage.toLocaleString()}`);

        // Prophet of Gork and Mork: Apply damage reduction to follow-up attacks
        let followUpProphetReduction = 1;
        if (prophetAttackCounter >= prophetThreshold && prophetReductionPct > 0) {
          followUpProphetReduction = prophetMultiplier;
          console.log(`[Prophet of Gork and Mork: -${prophetReductionPct}% damage on ${followUp.abilityName} (attack ${prophetAttackCounter + 1})]`);
        }
        const adjustedFollowUpDamage = Math.round(followUpResult.damage * followUpProphetReduction);

        // Increment attack counter for non-Additional Attacks (sharesCritChain attacks are part of the source attack)
        if (!followUp.sharesCritChain) {
          prophetAttackCounter++;
        }

        // Add to totals
        totalDamage += adjustedFollowUpDamage;
        // Track max perHitDamage for Laviscus outrage
        maxPerHitDamage = Math.max(maxPerHitDamage, followUpResult.perHitDamage);

        // Build follow-up breakdown for consistent display
        // Breakdown now includes flatModifiers and extraHits with sources from the calculator
        const followUpBreakdown: DamageBreakdown = {
          damage: followUpResult.damage,
          perHitDamage: followUpResult.perHitDamage,
          hits: followUpResult.totalHits,  // Total hits from calculator (base + extra)
          baseDamage: followUpResult.baseDamage,
          flatModifiers: followUpResult.flatModifiers,
          flatModifierSources: followUpResult.flatModifierSources,
          critBonus: followUpResult.critBonus,
          critChanceSources: followUpResult.critChanceSources,
          critDamageSources: followUpResult.critDamageSources,
          extraHits: followUpResult.extraHits,
          extraHitsSources: followUpResult.extraHitsSources,
          damVarMod: followUpResult.damVarMod,
          targetArmor: bossArmor,
          armorIgnored: followUpResult.armorIgnored,
          armorIgnoredSources: followUpResult.armorIgnoredSources,
          effectiveArmor: followUpResult.effectiveArmor,
          afterArmor: followUpResult.afterArmor,
          pierceRatio: followUpResult.pierceRatio,
          effectivePierceRatio: followUpResult.effectivePierceRatio,
          pierceRatioBonus: followUpResult.pierceRatioBonus,
          pierceRatioBonusSources: followUpResult.pierceRatioBonusSources,
          pierceFloor: followUpResult.pierceFloor,
          afterArmorPierce: followUpResult.afterArmorPierce,
          globalMultiplier: followUpResult.globalMultiplier,
          globalMultiplierSources: followUpResult.globalMultiplierSources,
          // Crit breakdown values
          baseCritChance: followUpResult.baseCritChance,
          baseCritDamage: followUpResult.baseCritDamage,
          critChanceBonus: followUpResult.critChanceTotalBonus,
          critDmgBonus: followUpResult.critDamageTotalBonus,
          critChance: followUpResult.effectiveCritChance * 100,
          critDamage: followUpResult.effectiveCritDamage,
          traitModifiers: followUpResult.traitModifiers,
          traitMultiplier: followUpResult.traitMultiplier,
          // Block reduction (Daemon trait)
          expectedBlocks: followUpResult.expectedBlocks,
          blockReductionPerHit: followUpResult.blockReductionPerHit,
          totalBlockReduction: followUpResult.totalBlockReduction,
        };

        // Add Prophet of Gork and Mork to global multiplier if active
        if (followUpProphetReduction < 1) {
          followUpBreakdown.globalMultiplier = (followUpBreakdown.globalMultiplier || 1) * followUpProphetReduction;
          followUpBreakdown.globalMultiplierSources = [
            ...(followUpBreakdown.globalMultiplierSources || []),
            { name: 'Prophet of Gork and Mork', damageMultiplier: followUpProphetReduction }
          ];
          followUpBreakdown.damage = adjustedFollowUpDamage;
          followUpBreakdown.perHitDamage = Math.round(followUpBreakdown.perHitDamage * followUpProphetReduction);
        }

        // Collect follow-up attack log for display
        followUpAttackLogs.push({
          abilityName: followUp.abilityName,
          damage: adjustedFollowUpDamage,
          hits: followUpResult.totalHits,
          damageType: followUp.damageProfile,
          attackType: effectiveAttackType,  // Include attack type for display
          breakdown: followUpBreakdown,
        });

        // AstartesBanner: +1 hit after melee follow-up (same stats, capped at maxDmg)
        if (bannerActive && effectiveAttackType === 'melee') {
          const bannerFollowUpStats: AttackerStats = {
            ...followUpStats,
            hits: 1,
            damageCaps: { ...(followUpStats.damageCaps || {}), finalDamageCap: bannerMaxDmg },
            critChainOffset: cumulativeHitsForCritChain,
            abilityModifiers: followUpStats.abilityModifiers ? {
              ...followUpStats.abilityModifiers,
              extraHits: undefined,
            } : undefined,
          };
          const bannerFollowUpCalc = new DamageCalculator(true);
          const bannerFollowUpResult = bannerFollowUpCalc.calculate(bannerFollowUpStats, defenderStats);
          cumulativeHitsForCritChain += bannerFollowUpResult.totalHits;

          // Apply Prophet reduction (shares crit chain, no separate counter increment)
          let bannerFollowUpProphetReduction = 1;
          if (prophetAttackCounter >= prophetThreshold && prophetReductionPct > 0) {
            bannerFollowUpProphetReduction = prophetMultiplier;
          }
          const adjustedBannerFollowUpDamage = Math.round(bannerFollowUpResult.damage * bannerFollowUpProphetReduction);

          totalDamage += adjustedBannerFollowUpDamage;
          maxPerHitDamage = Math.max(maxPerHitDamage, bannerFollowUpResult.perHitDamage);

          const bannerFollowUpBreakdown: DamageBreakdown = {
            damage: bannerFollowUpResult.damage,
            perHitDamage: bannerFollowUpResult.perHitDamage,
            hits: bannerFollowUpResult.totalHits,
            baseDamage: bannerFollowUpResult.baseDamage,
            flatModifiers: bannerFollowUpResult.flatModifiers,
            flatModifierSources: bannerFollowUpResult.flatModifierSources,
            critBonus: bannerFollowUpResult.critBonus,
            critChanceSources: bannerFollowUpResult.critChanceSources,
            critDamageSources: bannerFollowUpResult.critDamageSources,
            extraHits: bannerFollowUpResult.extraHits,
            extraHitsSources: bannerFollowUpResult.extraHitsSources,
            damVarMod: bannerFollowUpResult.damVarMod,
            targetArmor: bossArmor,
            armorIgnored: bannerFollowUpResult.armorIgnored,
            armorIgnoredSources: bannerFollowUpResult.armorIgnoredSources,
            effectiveArmor: bannerFollowUpResult.effectiveArmor,
            afterArmor: bannerFollowUpResult.afterArmor,
            pierceRatio: bannerFollowUpResult.pierceRatio,
            effectivePierceRatio: bannerFollowUpResult.effectivePierceRatio,
            pierceRatioBonus: bannerFollowUpResult.pierceRatioBonus,
            pierceRatioBonusSources: bannerFollowUpResult.pierceRatioBonusSources,
            pierceFloor: bannerFollowUpResult.pierceFloor,
            afterArmorPierce: bannerFollowUpResult.afterArmorPierce,
            globalMultiplier: bannerFollowUpResult.globalMultiplier,
            globalMultiplierSources: bannerFollowUpResult.globalMultiplierSources,
            baseCritChance: bannerFollowUpResult.baseCritChance,
            baseCritDamage: bannerFollowUpResult.baseCritDamage,
            critChanceBonus: bannerFollowUpResult.critChanceTotalBonus,
            critDmgBonus: bannerFollowUpResult.critDamageTotalBonus,
            critChance: bannerFollowUpResult.effectiveCritChance * 100,
            critDamage: bannerFollowUpResult.effectiveCritDamage,
            traitModifiers: bannerFollowUpResult.traitModifiers,
            traitMultiplier: bannerFollowUpResult.traitMultiplier,
            expectedBlocks: bannerFollowUpResult.expectedBlocks,
            blockReductionPerHit: bannerFollowUpResult.blockReductionPerHit,
            totalBlockReduction: bannerFollowUpResult.totalBlockReduction,
          };
          if (bannerFollowUpProphetReduction < 1) {
            bannerFollowUpBreakdown.globalMultiplier = (bannerFollowUpBreakdown.globalMultiplier || 1) * bannerFollowUpProphetReduction;
            bannerFollowUpBreakdown.globalMultiplierSources = [
              ...(bannerFollowUpBreakdown.globalMultiplierSources || []),
              { name: 'Prophet of Gork and Mork', damageMultiplier: bannerFollowUpProphetReduction }
            ];
            bannerFollowUpBreakdown.damage = adjustedBannerFollowUpDamage;
            bannerFollowUpBreakdown.perHitDamage = Math.round(bannerFollowUpBreakdown.perHitDamage * bannerFollowUpProphetReduction);
          }

          followUpAttackLogs.push({
            abilityName: 'Astartes Banner',
            damage: adjustedBannerFollowUpDamage,
            hits: bannerFollowUpResult.totalHits,
            damageType: followUpStats.damageType,
            attackType: 'melee',
            breakdown: bannerFollowUpBreakdown,
          });

          console.log(`\nAstartes Banner (${followUp.abilityName}): 1x ${followUpStats.damageType} (cap ${bannerMaxDmg})`);
          bannerFollowUpCalc.printLogs();
          console.log(`Banner Damage: ${adjustedBannerFollowUpDamage.toLocaleString()}`);
        }

        // Accumulate boss armor reduction from follow-ups (e.g., ChampionOfTheFeast)
        if (followUp.armorReduction && followUp.armorReduction > 0) {
          followUpArmorReductionTotal += followUp.armorReduction;
          console.log(`[Boss armor reduced by ${followUp.armorReduction} from ${followUp.abilityName}]`);
        }

        // Trigger Optimised Gait for follow-up attacks from Mechanical allies
        // Only trigger for follow-up attacks (sharesCritChain=false), NOT additional attacks (sharesCritChain=true)
        // Additional attacks like CIB are part of the source attack, not separate attacks
        if (!followUp.sharesCritChain) {
          const ogResultFollowUp = triggerOptimisedGait({
            triggeringAttackerId: attackerId,
            triggeringAttackerName: attacker.name,
            triggeringAttackerTraits: attacker.traits,
            battleState: get().battleState!,
            defenderStats,
            bossArmor,
            ignoreCrit,
            prophetAttackCounter,
            prophetThreshold,
            prophetReductionPct,
            prophetMultiplier,
            hasExitorRhoUsedFirstSpecial: exitorRhoUsedFirstSpecial, // Track LC +2 hits usage
          });

          if (ogResultFollowUp) {
            totalDamage += ogResultFollowUp.totalDamage;
            prophetAttackCounter = ogResultFollowUp.prophetCounter;
            maxPerHitDamage = Math.max(maxPerHitDamage, ogResultFollowUp.maxPerHitDamage);
            // Store pending OG logs instead of pushing immediately
            // They will be pushed after additional attacks (CIB) of this follow-up
            pendingOGLogs = [...ogResultFollowUp.followUpLogs];
            exitorRhoDamageToAdd += ogResultFollowUp.totalDamage;
            exitorRhoIdForUpdate = ogResultFollowUp.exitorRhoId;
            // Track if LC +2 hits were used
            exitorRhoUsedFirstSpecial = exitorRhoUsedFirstSpecial || ogResultFollowUp.exitorRhoUsedFirstSpecial;
          }
        }
      }

      // Push any remaining pending OG logs after all follow-ups are processed
      if (pendingOGLogs.length > 0) {
        followUpAttackLogs.push(...pendingOGLogs);
        pendingOGLogs = [];
      }

      console.log('\n--- COMBINED TOTAL ---');
      console.log(`Total Damage: ${totalDamage.toLocaleString()}`);
    } else {
      // No eligible follow-ups, but still push any pending OG from main attack
      if (pendingOGLogs.length > 0) {
        followUpAttackLogs.push(...pendingOGLogs);
        pendingOGLogs = [];
      }
    }

    // Handle Drachnyen follow-up attack (Abaddon)
    // Only triggers on normal melee attacks after Drachnyen is activated
    if (attacker.drachnyenActive && attackType === 'melee') {
      console.log('\n--- DRACHNYEN FOLLOW-UP ---');

      const drachnyenMinDmg = attacker.drachnyenMinDmg || 0;
      const drachnyenMaxDmg = attacker.drachnyenMaxDmg || 0;
      const drachnyenHits = attacker.drachnyenHits || 3;
      const avgDamage = Math.round((drachnyenMinDmg + drachnyenMaxDmg) / 2);

      // Get current battle state for buff evaluation
      const currentBattleStateForDrachnyen = get().battleState!;

      // Build buff pool evaluation context for Drachnyen (special melee attack)
      const drachnyenBuffContext: BuffEvaluationContext = {
        attacker: attacker,
        attackType: 'melee',
        attackCategory: 'special',
        target: currentBattleStateForDrachnyen.boss,
        battleState: currentBattleStateForDrachnyen,
      };

      // Get applicable buffs from the pool (includes LC buffs if conditions met)
      const drachnyenApplicableBuffs = getApplicableBuffs(currentBattleStateForDrachnyen.buffPool, drachnyenBuffContext);
      const drachnyenPoolEffects = combineBuffEffects(drachnyenApplicableBuffs);

      // Extract bonuses from pool effects
      const drachnyenExtraDmg = drachnyenPoolEffects.baseDamageBonus || 0;
      const drachnyenExtraHits = drachnyenPoolEffects.extraHits || 0;
      const drachnyenArmorIgnored = drachnyenPoolEffects.armorIgnored || 0;
      const poolDrachnyenMultiplier = drachnyenPoolEffects.baseDamageMultiplier || 1;
      // Include pierce ratio bonus from activeBuffs (Blood Chalice, etc.) - Drachnyen is a melee attack
      const drachnyenActiveBuffPierceRatio = attacker.activeBuffs.reduce(
        (sum, buff) => {
          if (!buff.pierceRatioBonus) return sum;
          // Drachnyen is melee, so include melee-only buffs
          return sum + buff.pierceRatioBonus;
        }, 0
      );
      const drachnyenPierceRatioBonus = (drachnyenPoolEffects.pierceRatioBonus || 0) + drachnyenActiveBuffPierceRatio;

      // High Ground: +50% damage multiplier when toggle is enabled
      const drachnyenHighGroundMultiplier = attacker.abilityToggles['HighGround'] ? 1.5 : 1;

      // War Machine: dynamic damage multiplier based on selected Machine of War
      const drachnyenWarMachineMultiplier = attacker.abilityToggles['WarMachine'] && currentBattleStateForDrachnyen.machineOfWar
        ? 1 + currentBattleStateForDrachnyen.machineOfWar.extraDmgPct / 100
        : 1;

      const drachnyenDamageMultiplier = poolDrachnyenMultiplier * drachnyenHighGroundMultiplier * drachnyenWarMachineMultiplier;

      // Only show pool buff log if Trajann (Legendary Commander) is in the team
      if ((drachnyenExtraDmg > 0 || drachnyenExtraHits > 0) && currentBattleStateForDrachnyen.team.some(c => c.passiveAbilities.includes('LegendaryCommander'))) {
        console.log(`[Pool Buff applied to Drach'nyen: +${drachnyenExtraDmg} dmg, +${drachnyenExtraHits} hits]`);
      }

      // Build buff sources for breakdown display
      type DrachnyenBuffSource = { name: string; sourceName?: string; damageBonus?: number; extraHits?: number; armorIgnored?: number; damageMultiplier?: number; pierceRatioBonus?: number };
      const drachnyenBuffSources: DrachnyenBuffSource[] = [];

      for (const poolBuff of drachnyenApplicableBuffs) {
        const effects = poolBuff.effects;
        const source: DrachnyenBuffSource = { name: poolBuff.name };
        if (effects.baseDamageBonus) source.damageBonus = effects.baseDamageBonus;
        if (effects.extraHits) source.extraHits = effects.extraHits;
        if (effects.armorIgnored) source.armorIgnored = effects.armorIgnored;
        if (effects.baseDamageMultiplier && effects.baseDamageMultiplier !== 1) {
          source.damageMultiplier = effects.baseDamageMultiplier;
        }
        if (source.damageBonus || source.extraHits || source.armorIgnored || source.damageMultiplier) {
          drachnyenBuffSources.push(source);
        }
      }

      // Add High Ground buff source for display
      if (drachnyenHighGroundMultiplier > 1) {
        drachnyenBuffSources.push({
          name: 'High Ground',
          damageMultiplier: drachnyenHighGroundMultiplier,
        });
      }

      // Add Machine of War buff source for display
      if (drachnyenWarMachineMultiplier > 1 && currentBattleStateForDrachnyen.machineOfWar) {
        drachnyenBuffSources.push({
          name: `Machine of War (+${currentBattleStateForDrachnyen.machineOfWar.extraDmgPct}%)`,
          damageMultiplier: drachnyenWarMachineMultiplier,
        });
      }

      // Add activeBuffs pierce ratio sources (Blood Chalice, etc.) for display
      for (const buff of attacker.activeBuffs) {
        if (buff.pierceRatioBonus && buff.pierceRatioBonus > 0) {
          drachnyenBuffSources.push({
            name: buff.abilityName || 'Active Buff',
            pierceRatioBonus: buff.pierceRatioBonus,
          });
        }
      }

      const hasDrachnyenModifiers = drachnyenExtraDmg > 0 || drachnyenExtraHits > 0 || drachnyenArmorIgnored > 0 || drachnyenDamageMultiplier !== 1 || drachnyenPierceRatioBonus > 0;

      // Build attacker stats for Drachnyen follow-up (uses character's equipment crit)
      const drachnyenAttackerStats: AttackerStats = {
        baseDamage: avgDamage,
        damageType: 'Piercing',
        hits: drachnyenHits,
        critChance: equipmentStats.critChance || 0,
        critDamage: equipmentStats.critDmg || 0,
        critChanceBonus: equipmentStats.critChanceBonus || 0,
        critDmgBonus: equipmentStats.critDmgBonus || 0,
        ignoreCrit,
        traits: attacker.traits,
        hasMoved: true,
        attackType: 'melee',
        hasAttackedThisBattle: true,
        attacksThisTurn: 1,
        firstAttackTurn: attacker.firstAttackTurn ?? currentTurn,
        currentTurn,
        abilityToggles: attacker.abilityToggles,
        fightingRetreatActive: attacker.fightingRetreatActive,
        // Pass bonuses via abilityModifiers for proper source tracking in breakdown
        abilityModifiers: hasDrachnyenModifiers ? {
          baseDamageBonus: drachnyenExtraDmg > 0 ? drachnyenExtraDmg : undefined,
          extraHits: drachnyenExtraHits > 0 ? drachnyenExtraHits : undefined,
          armorIgnored: drachnyenArmorIgnored > 0 ? drachnyenArmorIgnored : undefined,
          baseDamageMultiplier: drachnyenDamageMultiplier !== 1 ? drachnyenDamageMultiplier : undefined,
          pierceRatioBonus: drachnyenPierceRatioBonus > 0 ? drachnyenPierceRatioBonus : undefined,
          buffSources: drachnyenBuffSources,
        } : undefined,
      };

      // Calculate Drachnyen follow-up damage
      const drachnyenCalculator = new DamageCalculator(true);
      const drachnyenResult = drachnyenCalculator.calculate(drachnyenAttackerStats, defenderStats);

      console.log(`Drach'nyen: ${drachnyenResult.totalHits}x ${drachnyenResult.perHitDamage} = ${drachnyenResult.damage}`);

      // Prophet of Gork and Mork: Apply damage reduction to Drachnyen follow-up
      let drachnyenProphetReduction = 1;
      if (prophetAttackCounter >= prophetThreshold && prophetReductionPct > 0) {
        drachnyenProphetReduction = prophetMultiplier;
        console.log(`[Prophet of Gork and Mork: -${prophetReductionPct}% damage on Drach'nyen (attack ${prophetAttackCounter + 1})]`);
      }
      const adjustedDrachnyenDamage = Math.round(drachnyenResult.damage * drachnyenProphetReduction);

      // Increment attack counter for Drachnyen (it's a follow-up attack, counts as a separate attack)
      prophetAttackCounter++;

      totalDamage += adjustedDrachnyenDamage;
      // Track max perHitDamage for Laviscus outrage
      maxPerHitDamage = Math.max(maxPerHitDamage, drachnyenResult.perHitDamage);

      // Build breakdown for Drachnyen follow-up
      const drachnyenBreakdown: DamageBreakdown = {
        damage: drachnyenResult.damage,
        perHitDamage: drachnyenResult.perHitDamage,
        hits: drachnyenResult.totalHits,
        baseDamage: drachnyenResult.baseDamage,
        flatModifiers: drachnyenResult.flatModifiers,
        flatModifierSources: drachnyenResult.flatModifierSources,
        critBonus: drachnyenResult.critBonus,
        critChanceSources: drachnyenResult.critChanceSources,
        critDamageSources: drachnyenResult.critDamageSources,
        extraHits: drachnyenResult.extraHits,
        extraHitsSources: drachnyenResult.extraHitsSources,
        damVarMod: drachnyenResult.damVarMod,
        targetArmor: bossArmor,
        armorIgnored: drachnyenResult.armorIgnored,
        armorIgnoredSources: drachnyenResult.armorIgnoredSources,
        effectiveArmor: drachnyenResult.effectiveArmor,
        afterArmor: drachnyenResult.afterArmor,
        pierceRatio: drachnyenResult.pierceRatio,
        effectivePierceRatio: drachnyenResult.effectivePierceRatio,
        pierceRatioBonus: drachnyenResult.pierceRatioBonus,
        pierceRatioBonusSources: drachnyenResult.pierceRatioBonusSources,
        pierceFloor: drachnyenResult.pierceFloor,
        afterArmorPierce: drachnyenResult.afterArmorPierce,
        globalMultiplier: drachnyenResult.globalMultiplier,
        globalMultiplierSources: drachnyenResult.globalMultiplierSources,
        baseCritChance: drachnyenResult.baseCritChance,
        baseCritDamage: drachnyenResult.baseCritDamage,
        critChanceBonus: drachnyenResult.critChanceTotalBonus,
        critDmgBonus: drachnyenResult.critDamageTotalBonus,
        critChance: drachnyenResult.effectiveCritChance * 100,
        critDamage: drachnyenResult.effectiveCritDamage,
        traitModifiers: drachnyenResult.traitModifiers,
        traitMultiplier: drachnyenResult.traitMultiplier,
      };

      // Add Prophet of Gork and Mork to global multiplier if active
      if (drachnyenProphetReduction < 1) {
        drachnyenBreakdown.globalMultiplier = (drachnyenBreakdown.globalMultiplier || 1) * drachnyenProphetReduction;
        drachnyenBreakdown.globalMultiplierSources = [
          ...(drachnyenBreakdown.globalMultiplierSources || []),
          { name: 'Prophet of Gork and Mork', damageMultiplier: drachnyenProphetReduction }
        ];
        drachnyenBreakdown.damage = adjustedDrachnyenDamage;
        drachnyenBreakdown.perHitDamage = Math.round(drachnyenBreakdown.perHitDamage * drachnyenProphetReduction);
      }

      followUpAttackLogs.push({
        abilityName: "Drach'nyen",
        damage: adjustedDrachnyenDamage,
        hits: drachnyenResult.totalHits,
        damageType: 'Piercing',
        breakdown: drachnyenBreakdown,
      });

      console.log(`Total with Drach'nyen: ${totalDamage.toLocaleString()}`);
    }

    // Handle Chordclaw follow-up attack (Exitor-Rho)
    // Triggers on ALL attacks (melee, ranged, ability) when cordClawActive is true
    if (attacker.cordClawActive) {
      console.log('\n--- CHORDCLAW FOLLOW-UP ---');

      const cordClawMinDmg = attacker.cordClawMinDmg || 0;
      const cordClawMaxDmg = attacker.cordClawMaxDmg || 0;
      const cordClawHits = attacker.cordClawHits || 2;
      const cordClawAvgDamage = Math.round((cordClawMinDmg + cordClawMaxDmg) / 2);

      // Get current battle state for buff evaluation
      const currentBattleStateForCordClaw = get().battleState!;

      // Build buff pool evaluation context for Chordclaw (additional melee attack)
      // Uses 'normal' attackCategory since it's an additional attack like CIB
      const cordClawBuffContext: BuffEvaluationContext = {
        attacker: attacker,
        attackType: 'melee',
        attackCategory: 'normal',
        target: currentBattleStateForCordClaw.boss,
        battleState: currentBattleStateForCordClaw,
      };

      // Get applicable buffs from the pool
      const cordClawApplicableBuffs = getApplicableBuffs(currentBattleStateForCordClaw.buffPool, cordClawBuffContext);
      const cordClawPoolEffects = combineBuffEffects(cordClawApplicableBuffs);

      // Extract bonuses from pool effects
      const cordClawExtraDmg = cordClawPoolEffects.baseDamageBonus || 0;
      // Chordclaw is additional hits like CIB - doesn't get MA/LC bonus
      const cordClawExtraHits = 0;
      const cordClawArmorIgnored = cordClawPoolEffects.armorIgnored || 0;
      const poolCordClawMultiplier = cordClawPoolEffects.baseDamageMultiplier || 1;

      // High Ground: +50% damage multiplier when toggle is enabled
      const cordClawHighGroundMultiplier = attacker.abilityToggles['HighGround'] ? 1.5 : 1;

      // War Machine: dynamic damage multiplier based on selected Machine of War
      const cordClawWarMachineMultiplier = attacker.abilityToggles['WarMachine'] && currentBattleStateForCordClaw.machineOfWar
        ? 1 + currentBattleStateForCordClaw.machineOfWar.extraDmgPct / 100
        : 1;

      const cordClawDamageMultiplier = poolCordClawMultiplier * cordClawHighGroundMultiplier * cordClawWarMachineMultiplier;

      // Build buff sources for breakdown display
      type CordClawBuffSource = { name: string; sourceName?: string; damageBonus?: number; extraHits?: number; armorIgnored?: number; damageMultiplier?: number };
      const cordClawBuffSources: CordClawBuffSource[] = [];

      for (const poolBuff of cordClawApplicableBuffs) {
        const effects = poolBuff.effects;
        const source: CordClawBuffSource = { name: poolBuff.name };
        if (effects.baseDamageBonus) source.damageBonus = effects.baseDamageBonus;
        if (effects.extraHits) source.extraHits = effects.extraHits;
        if (effects.armorIgnored) source.armorIgnored = effects.armorIgnored;
        if (effects.baseDamageMultiplier && effects.baseDamageMultiplier !== 1) source.damageMultiplier = effects.baseDamageMultiplier;
        if (Object.keys(source).length > 1) cordClawBuffSources.push(source);
      }

      // Add High Ground buff source for display
      if (cordClawHighGroundMultiplier > 1) {
        cordClawBuffSources.push({
          name: 'High Ground',
          damageMultiplier: cordClawHighGroundMultiplier,
        });
      }

      // Add Machine of War buff source for display
      if (cordClawWarMachineMultiplier > 1 && currentBattleStateForCordClaw.machineOfWar) {
        cordClawBuffSources.push({
          name: `Machine of War (+${currentBattleStateForCordClaw.machineOfWar.extraDmgPct}%)`,
          damageMultiplier: cordClawWarMachineMultiplier,
        });
      }

      const hasCordClawModifiers = cordClawExtraDmg > 0 || cordClawExtraHits > 0 || cordClawArmorIgnored > 0 || cordClawDamageMultiplier !== 1;

      // Build attacker stats for Chordclaw follow-up
      const cordClawAttackerStats: AttackerStats = {
        baseDamage: cordClawAvgDamage + cordClawExtraDmg,
        damageType: 'DirectDamage',  // DirectDamage bypasses armor
        hits: cordClawHits + cordClawExtraHits,
        critChance: equipmentStats.critChance || 0,
        critDamage: equipmentStats.critDmg || 0,
        critChanceBonus: equipmentStats.critChanceBonus || 0,
        critDmgBonus: equipmentStats.critDmgBonus || 0,
        ignoreCrit,
        traits: attacker.traits,
        hasMoved: true,
        attackType: 'melee',
        hasAttackedThisBattle: true,
        abilityModifiers: hasCordClawModifiers ? {
          baseDamageBonus: cordClawExtraDmg > 0 ? cordClawExtraDmg : undefined,
          extraHits: cordClawExtraHits > 0 ? cordClawExtraHits : undefined,
          armorIgnored: cordClawArmorIgnored > 0 ? cordClawArmorIgnored : undefined,
          baseDamageMultiplier: cordClawDamageMultiplier !== 1 ? cordClawDamageMultiplier : undefined,
          buffSources: cordClawBuffSources,
        } : undefined,
      };

      // Calculate Chordclaw follow-up damage
      const cordClawCalculator = new DamageCalculator(true);
      const cordClawResult = cordClawCalculator.calculate(cordClawAttackerStats, defenderStats);

      console.log(`Chordclaw: ${cordClawResult.totalHits}x ${cordClawResult.perHitDamage} = ${cordClawResult.damage}`);

      // Prophet of Gork and Mork: Apply damage reduction to Chordclaw follow-up
      let cordClawProphetReduction = 1;
      if (prophetAttackCounter >= prophetThreshold && prophetReductionPct > 0) {
        cordClawProphetReduction = prophetMultiplier;
        console.log(`[Prophet of Gork and Mork: -${prophetReductionPct}% damage on Chordclaw (attack ${prophetAttackCounter + 1})]`);
      }
      const adjustedCordClawDamage = Math.round(cordClawResult.damage * cordClawProphetReduction);

      // Increment attack counter for Chordclaw (it's a follow-up attack, counts as a separate attack)
      prophetAttackCounter++;

      totalDamage += adjustedCordClawDamage;
      // Track max perHitDamage for Laviscus outrage
      maxPerHitDamage = Math.max(maxPerHitDamage, cordClawResult.perHitDamage);

      // Build breakdown for Chordclaw follow-up
      const cordClawBreakdown: DamageBreakdown = {
        damage: cordClawResult.damage,
        perHitDamage: cordClawResult.perHitDamage,
        hits: cordClawResult.totalHits,
        baseDamage: cordClawResult.baseDamage,
        flatModifiers: cordClawResult.flatModifiers,
        flatModifierSources: cordClawResult.flatModifierSources,
        critBonus: cordClawResult.critBonus,
        critChanceSources: cordClawResult.critChanceSources,
        critDamageSources: cordClawResult.critDamageSources,
        extraHits: cordClawResult.extraHits,
        extraHitsSources: cordClawResult.extraHitsSources,
        damVarMod: cordClawResult.damVarMod,
        targetArmor: bossArmor,
        armorIgnored: cordClawResult.armorIgnored,
        armorIgnoredSources: cordClawResult.armorIgnoredSources,
        effectiveArmor: cordClawResult.effectiveArmor,
        afterArmor: cordClawResult.afterArmor,
        pierceRatio: cordClawResult.pierceRatio,
        pierceFloor: cordClawResult.pierceFloor,
        afterArmorPierce: cordClawResult.afterArmorPierce,
        globalMultiplier: cordClawResult.globalMultiplier,
        globalMultiplierSources: cordClawResult.globalMultiplierSources,
        baseCritChance: cordClawResult.baseCritChance,
        baseCritDamage: cordClawResult.baseCritDamage,
        critChanceBonus: cordClawResult.critChanceTotalBonus,
        critDmgBonus: cordClawResult.critDamageTotalBonus,
        critChance: cordClawResult.effectiveCritChance * 100,
        critDamage: cordClawResult.effectiveCritDamage,
        traitModifiers: cordClawResult.traitModifiers,
        traitMultiplier: cordClawResult.traitMultiplier,
      };

      // Add Prophet of Gork and Mork to global multiplier if active
      if (cordClawProphetReduction < 1) {
        cordClawBreakdown.globalMultiplier = (cordClawBreakdown.globalMultiplier || 1) * cordClawProphetReduction;
        cordClawBreakdown.globalMultiplierSources = [
          ...(cordClawBreakdown.globalMultiplierSources || []),
          { name: 'Prophet of Gork and Mork', damageMultiplier: cordClawProphetReduction }
        ];
        cordClawBreakdown.damage = adjustedCordClawDamage;
        cordClawBreakdown.perHitDamage = Math.round(cordClawBreakdown.perHitDamage * cordClawProphetReduction);
      }

      followUpAttackLogs.push({
        abilityName: 'Chordclaw',
        damage: adjustedCordClawDamage,
        hits: cordClawResult.totalHits,
        damageType: 'DirectDamage',
        breakdown: cordClawBreakdown,
      });

      console.log(`Total with Chordclaw: ${totalDamage.toLocaleString()}`);
    }

    // === FURY OF THE ANCIENTS AUTO-TRIGGER (Mephiston) ===
    // Automatically triggers once per turn when Mephiston acts (attacks), if not already used
    let furyOfTheAncientsTriggered = false;
    if (attacker.passiveAbilities.includes('FuryOfTheAncients') && !attacker.hasUsedFuryOfTheAncientsThisTurn && !options?.skipStateUpdates) {
      furyOfTheAncientsTriggered = true;

      // Get FuryOfTheAncients ability values
      const furyLevelIndex = attacker.abilityLevels?.FuryOfTheAncients ?? 54;
      const furyAbilityValues = getAbilityValues('FuryOfTheAncients', furyLevelIndex, attacker.progressionStepIndex);

      if (furyAbilityValues) {
        const furyMinDamage = furyAbilityValues.minDmg as number || 0;
        const furyMaxDamage = furyAbilityValues.maxDmg as number || 0;
        const furyAvgDamage = Math.round((furyMinDamage + furyMaxDamage) / 2);
        const furyHits = furyAbilityValues.nrOfHits as number || 2;
        const furyDamageType: DamageType = 'Psychic';

        // Get current battle state for buff evaluation
        const currentBattleStateForFury = get().battleState!;

        // Build buff pool evaluation context for Fury of the Ancients (special melee attack)
        const furyBuffContext: BuffEvaluationContext = {
          attacker: attacker,
          attackType: 'melee',
          attackCategory: 'special',
          target: currentBattleStateForFury.boss,
          battleState: currentBattleStateForFury,
        };

        // Get applicable buffs from the pool
        const furyApplicableBuffs = getApplicableBuffs(currentBattleStateForFury.buffPool, furyBuffContext);
        const furyPoolEffects = combineBuffEffects(furyApplicableBuffs);

        // Extract bonuses from pool effects
        const furyExtraDmg = furyPoolEffects.baseDamageBonus || 0;
        const furyExtraHits = furyPoolEffects.extraHits || 0;
        const furyArmorIgnored = furyPoolEffects.armorIgnored || 0;
        const poolFuryMultiplier = furyPoolEffects.baseDamageMultiplier || 1;
        const furyPoolCritChanceBonus = furyPoolEffects.critChanceBonus || 0;
        const furyPoolCritDmgBonus = furyPoolEffects.critDamageBonus || 0;
        // Include pierce ratio bonus from activeBuffs (Blood Chalice, etc.) - Fury is a melee attack
        const furyActiveBuffPierceRatio = attacker.activeBuffs.reduce(
          (sum, buff) => {
            if (!buff.pierceRatioBonus) return sum;
            // Fury of the Ancients is melee, so include melee-only buffs
            return sum + buff.pierceRatioBonus;
          }, 0
        );
        const furyPoolPierceRatioBonus = (furyPoolEffects.pierceRatioBonus || 0) + furyActiveBuffPierceRatio;

        // High Ground: +50% damage multiplier when toggle is enabled
        const furyHighGroundMultiplier = attacker.abilityToggles['HighGround'] ? 1.5 : 1;

        // War Machine: dynamic damage multiplier based on selected Machine of War
        const furyWarMachineMultiplier = attacker.abilityToggles['WarMachine'] && currentBattleStateForFury.machineOfWar
          ? 1 + currentBattleStateForFury.machineOfWar.extraDmgPct / 100
          : 1;

        const furyDamageMultiplier = poolFuryMultiplier * furyHighGroundMultiplier * furyWarMachineMultiplier;

        // Build buff sources for breakdown display
        type FuryBuffSource = { name: string; sourceName?: string; damageBonus?: number; extraHits?: number; armorIgnored?: number; damageMultiplier?: number; critChanceBonus?: number; critDamageBonus?: number; pierceRatioBonus?: number };
        const furyBuffSources: FuryBuffSource[] = [];

        for (const poolBuff of furyApplicableBuffs) {
          const effects = poolBuff.effects;
          const source: FuryBuffSource = { name: poolBuff.name };
          if (effects.baseDamageBonus) source.damageBonus = effects.baseDamageBonus;
          if (effects.extraHits) source.extraHits = effects.extraHits;
          if (effects.armorIgnored) source.armorIgnored = effects.armorIgnored;
          if (effects.baseDamageMultiplier && effects.baseDamageMultiplier !== 1) source.damageMultiplier = effects.baseDamageMultiplier;
          if (effects.critChanceBonus) source.critChanceBonus = effects.critChanceBonus;
          if (effects.critDamageBonus) source.critDamageBonus = effects.critDamageBonus;
          if (effects.pierceRatioBonus) source.pierceRatioBonus = effects.pierceRatioBonus;
          if (Object.keys(source).length > 1) furyBuffSources.push(source);
        }

        // Add High Ground buff source for display
        if (furyHighGroundMultiplier > 1) {
          furyBuffSources.push({
            name: 'High Ground',
            damageMultiplier: furyHighGroundMultiplier,
          });
        }

        // Add Machine of War buff source for display
        if (furyWarMachineMultiplier > 1 && currentBattleStateForFury.machineOfWar) {
          furyBuffSources.push({
            name: `Machine of War (+${currentBattleStateForFury.machineOfWar.extraDmgPct}%)`,
            damageMultiplier: furyWarMachineMultiplier,
          });
        }

        // Add activeBuffs pierce ratio sources (Blood Chalice, etc.) for display
        for (const buff of attacker.activeBuffs) {
          if (buff.pierceRatioBonus && buff.pierceRatioBonus > 0) {
            furyBuffSources.push({
              name: buff.abilityName || 'Active Buff',
              pierceRatioBonus: buff.pierceRatioBonus,
            });
          }
        }

        const hasFuryModifiers = furyExtraDmg > 0 || furyExtraHits > 0 || furyArmorIgnored > 0 || furyDamageMultiplier !== 1 || furyPoolCritChanceBonus > 0 || furyPoolCritDmgBonus > 0 || furyPoolPierceRatioBonus > 0;

        // Build attacker stats for Fury of the Ancients follow-up
        const furyAttackerStats: AttackerStats = {
          baseDamage: furyAvgDamage,
          damageType: furyDamageType,
          hits: furyHits,
          critChance: (equipmentStats.critChance || 0) + (equipmentStats.critChanceBonus || 0),
          critDamage: (equipmentStats.critDmg || 0) + (equipmentStats.critDmgBonus || 0),
          critChanceBonus: 0,
          critDmgBonus: 0,
          ignoreCrit,
          traits: attacker.traits,
          hasMoved: true,
          attackType: 'melee',
          hasAttackedThisBattle: true,
          abilityModifiers: hasFuryModifiers ? {
            baseDamageBonus: furyExtraDmg > 0 ? furyExtraDmg : undefined,
            extraHits: furyExtraHits > 0 ? furyExtraHits : undefined,
            armorIgnored: furyArmorIgnored > 0 ? furyArmorIgnored : undefined,
            baseDamageMultiplier: furyDamageMultiplier !== 1 ? furyDamageMultiplier : undefined,
            critChanceBonus: furyPoolCritChanceBonus > 0 ? furyPoolCritChanceBonus : undefined,
            critDamageBonus: furyPoolCritDmgBonus > 0 ? furyPoolCritDmgBonus : undefined,
            pierceRatioBonus: furyPoolPierceRatioBonus > 0 ? furyPoolPierceRatioBonus : undefined,
            buffSources: furyBuffSources,
          } : undefined,
        };

        // Calculate Fury of the Ancients follow-up damage
        const furyCalculator = new DamageCalculator(true);
        const furyResult = furyCalculator.calculate(furyAttackerStats, defenderStats);

        console.log(`Fury of the Ancients: ${furyResult.totalHits}x ${furyResult.perHitDamage} = ${furyResult.damage}`);

        // Prophet of Gork and Mork: Apply damage reduction to Fury follow-up
        prophetAttackCounter += 1;
        const furyProphetReduction = (prophetAttackCounter > prophetThreshold) ? prophetMultiplier : 1;
        const adjustedFuryDamage = Math.round(furyResult.damage * furyProphetReduction);

        totalDamage += adjustedFuryDamage;

        // Track max per-hit damage for Laviscus outrage
        maxPerHitDamage = Math.max(maxPerHitDamage, furyResult.perHitDamage);

        // Build breakdown for Fury of the Ancients follow-up
        const furyBreakdown: DamageBreakdown = {
          damage: furyResult.damage,
          perHitDamage: furyResult.perHitDamage,
          hits: furyResult.totalHits,
          baseDamage: furyAvgDamage,
          flatModifiers: furyResult.flatModifiers,
          flatModifierSources: furyResult.flatModifierSources || [],
          critBonus: furyResult.critBonus,
          critChanceSources: furyResult.critChanceSources || [],
          critDamageSources: furyResult.critDamageSources || [],
          extraHits: furyResult.extraHits,
          extraHitsSources: furyResult.extraHitsSources || [],
          damVarMod: furyResult.damVarMod,
          targetArmor: bossArmor,
          armorIgnored: furyResult.armorIgnored,
          armorIgnoredSources: furyResult.armorIgnoredSources,
          effectiveArmor: furyResult.effectiveArmor,
          afterArmor: furyResult.afterArmor,
          pierceRatio: furyResult.pierceRatio,
          pierceRatioBonus: furyResult.pierceRatioBonus,
          pierceRatioBonusSources: furyResult.pierceRatioBonusSources,
          effectivePierceRatio: furyResult.effectivePierceRatio,
          pierceFloor: furyResult.pierceFloor,
          afterArmorPierce: furyResult.afterArmorPierce,
          globalMultiplier: furyResult.globalMultiplier,
          globalMultiplierSources: furyResult.globalMultiplierSources || [],
          baseCritChance: equipmentStats.critChance || 0,
          baseCritDamage: equipmentStats.critDmg || 0,
          critChanceBonus: equipmentStats.critChanceBonus || 0,
          critDmgBonus: equipmentStats.critDmgBonus || 0,
          critChance: furyResult.effectiveCritChance,
          critDamage: furyResult.effectiveCritDamage,
          expectedBlocks: furyResult.expectedBlocks,
          blockReductionPerHit: furyResult.blockReductionPerHit,
          totalBlockReduction: furyResult.totalBlockReduction,
        };

        // Add Prophet reduction to breakdown if active
        if (furyProphetReduction < 1) {
          furyBreakdown.globalMultiplier = (furyBreakdown.globalMultiplier || 1) * furyProphetReduction;
          furyBreakdown.globalMultiplierSources = [
            ...(furyBreakdown.globalMultiplierSources || []),
            { name: 'Prophet of Gork and Mork', damageMultiplier: furyProphetReduction }
          ];
          furyBreakdown.damage = adjustedFuryDamage;
          furyBreakdown.perHitDamage = Math.round(furyBreakdown.perHitDamage * furyProphetReduction);
        }

        followUpAttackLogs.push({
          abilityName: 'Fury of the Ancients',
          damage: adjustedFuryDamage,
          hits: furyResult.totalHits,
          damageType: furyDamageType,
          attackType: 'melee',
          breakdown: furyBreakdown,
        });

        console.log(`Total with Fury of the Ancients: ${totalDamage.toLocaleString()}`);
      }
    }

    console.groupEnd();

    // Build damage breakdown for UI with calculation steps
    // Use result.damage (main attack only), not totalDamage (which includes follow-ups)
    const damageBreakdown: DamageBreakdown = {
      damage: result.damage,
      perHitDamage: result.perHitDamage,
      hits: result.totalHits,
      baseDamage: result.baseDamage,
      flatModifiers: result.flatModifiers,
      flatModifierSources: result.flatModifierSources,
      critBonus: result.critBonus,
      critChanceSources: result.critChanceSources,
      critDamageSources: result.critDamageSources,
      extraHits: result.extraHits,
      extraHitsSources: result.extraHitsSources,
      damVarMod: result.damVarMod,
      targetArmor: bossArmor,
      armorIgnored: result.armorIgnored,
      armorIgnoredSources: result.armorIgnoredSources,
      effectiveArmor: result.effectiveArmor,
      afterArmor: result.afterArmor,
      pierceRatio: result.pierceRatio,
      pierceRatioBonus: result.pierceRatioBonus,
      pierceRatioBonusSources: result.pierceRatioBonusSources,
      effectivePierceRatio: result.effectivePierceRatio,
      pierceFloor: result.pierceFloor,
      afterArmorPierce: result.afterArmorPierce,
      globalMultiplier: result.globalMultiplier,
      globalMultiplierSources: result.globalMultiplierSources,
      // Crit breakdown values
      baseCritChance: result.baseCritChance,
      baseCritDamage: result.baseCritDamage,
      critChanceBonus: result.critChanceTotalBonus,
      critDmgBonus: result.critDamageTotalBonus,
      critChance: result.effectiveCritChance * 100,
      critDamage: result.effectiveCritDamage,
      traitModifiers: result.traitModifiers,
      traitMultiplier: result.traitMultiplier,
      // Block reduction (Daemon trait)
      expectedBlocks: result.expectedBlocks,
      blockReductionPerHit: result.blockReductionPerHit,
      totalBlockReduction: result.totalBlockReduction,
    };

    // Add Prophet of Gork and Mork to global multiplier if active
    if (mainAttackProphetReduction < 1) {
      damageBreakdown.globalMultiplier = (damageBreakdown.globalMultiplier || 1) * mainAttackProphetReduction;
      damageBreakdown.globalMultiplierSources = [
        ...(damageBreakdown.globalMultiplierSources || []),
        { name: 'Prophet of Gork and Mork', damageMultiplier: mainAttackProphetReduction }
      ];
      damageBreakdown.damage = Math.round(damageBreakdown.damage * mainAttackProphetReduction);
      damageBreakdown.perHitDamage = Math.round(damageBreakdown.perHitDamage * mainAttackProphetReduction);
    }

    // Get IDs of buffs to consume (those with consumeOnUse that were applied)
    const buffsToConsume = applicablePoolBuffs
      .filter(buff => buff.consumeOnUse)
      .map(buff => buff.id);

    // Check if attacker is Laviscus (has RefusalToBeOutdone)
    const isLaviscus = attacker.passiveAbilities.includes('RefusalToBeOutdone');
    // Check if attacker is Chaos alliance (for Laviscus outrage contributor tracking)
    // alliance field contains "Chaos", "Imperium", etc.
    const isChaos = attacker.alliance === 'Chaos';
    // Get max perHitDamage for outrage tracking (uses highest perHitDamage from any attack)
    const maxPerHitForOutrage = maxPerHitDamage;

    // Update total damage dealt (both global and per-character)
    // Also consume one-time buffs like Euphoric Strikes
    // Also track outrage for Laviscus
    // Note: skipStateUpdates skips attack count updates but NOT damage tracking
    set((state) => ({
      battleState: state.battleState
        ? {
            ...state.battleState,
            totalDamageDealt: state.battleState.totalDamageDealt + totalDamage,
            // Apply boss armor reduction from follow-up attacks (e.g., ChampionOfTheFeast)
            bossArmorReduction: (state.battleState.bossArmorReduction || 0) + followUpArmorReductionTotal,
            // Update Prophet of Gork and Mork attack counter
            bossAttacksReceivedThisTurn: prophetAttackCounter,
            // Master Annihilator: Mark boss when Vitruvius does a normal attack
            bossHasMasterAnnihilatorMark: attacker.passiveAbilities.includes('MasterAnnihilator')
              ? true
              : state.battleState.bossHasMasterAnnihilatorMark,
            masterAnnihilatorMaxDmg: attacker.passiveAbilities.includes('MasterAnnihilator')
              ? (getAbilityValues('MasterAnnihilator', attacker.abilityLevels?.MasterAnnihilator ?? 54, attacker.progressionStepIndex)?.maxDmg as number) || 0
              : state.battleState.masterAnnihilatorMaxDmg,
            // HeraldOfTheApocalypse: Clear debuff after it's consumed by this attack
            ...(heraldBonus > 0 ? { heraldExtraDmgDebuff: undefined } : {}),
            // Remove consumed buffs from the pool
            buffPool: buffsToConsume.length > 0
              ? state.battleState.buffPool.filter(b => !buffsToConsume.includes(b.id))
              : state.battleState.buffPool,
            team: state.battleState.team.map((char) => {
              if (char.id === attackerId) {
                // Update attacker - always track damage dealt
                const updates: Partial<BattleCharacter> = {
                  totalDamageDealt: char.totalDamageDealt + totalDamage,
                };

                // Skip attack state updates for triggered attacks (like Galvanic Field)
                if (!options?.skipStateUpdates) {
                  updates.hasAttackedThisBattle = true;
                  updates.attacksThisTurn = char.attacksThisTurn + 1;
                  updates.totalAttacksThisBattle = char.totalAttacksThisBattle + 1;  // For FirstAmongTraitors scaling
                  // Set firstAttackTurn only on the first attack (when it's null)
                  updates.firstAttackTurn = char.firstAttackTurn ?? state.battleState!.turn;
                  // Mark first special attack used if LC +2 hits was applied to any follow-up
                  updates.hasUsedFirstSpecialAttackThisTurn = char.hasUsedFirstSpecialAttackThisTurn || lcHitsAppliedInNormalFollowUps;

                  // If Laviscus attacks, reset his outrage
                  if (isLaviscus) {
                    updates.outrage = 0;
                    updates.outrageContributors = [];
                  }

                  // Mark Fury of the Ancients as used if it triggered
                  if (furyOfTheAncientsTriggered) {
                    updates.hasUsedFuryOfTheAncientsThisTurn = true;
                  }
                }

                return { ...char, ...updates };
              }

              // Update Exitor-Rho's damage from Optimised Gait reaction attacks
              if (exitorRhoIdForUpdate && char.id === exitorRhoIdForUpdate) {
                // Exitor-Rho may also have RefusalToBeOutdone, so handle both
                const newOutrage = char.passiveAbilities.includes('RefusalToBeOutdone')
                  ? (char.outrage || 0) + maxPerHitForOutrage
                  : char.outrage;
                const contributors = char.outrageContributors || [];
                const newContributors = char.passiveAbilities.includes('RefusalToBeOutdone') && isChaos && !contributors.includes(attackerId)
                  ? [...contributors, attackerId]
                  : contributors;

                return {
                  ...char,
                  totalDamageDealt: char.totalDamageDealt + exitorRhoDamageToAdd,
                  outrage: newOutrage,
                  outrageContributors: newContributors,
                  // Track that Exitor-Rho has used first special attack this turn (for LC +2 hits)
                  hasUsedFirstSpecialAttackThisTurn: char.hasUsedFirstSpecialAttackThisTurn || exitorRhoUsedFirstSpecial,
                };
              }

              // For other characters: track outrage for Laviscus (always, even for GF attacks)
              if (char.passiveAbilities.includes('RefusalToBeOutdone')) {
                // Accumulate outrage from ally attacks (uses max perHitDamage from any attack)
                const newOutrage = (char.outrage || 0) + maxPerHitForOutrage;
                const contributors = char.outrageContributors || [];
                // Add to contributors if attacker is Chaos and not already in list
                const newContributors = isChaos && !contributors.includes(attackerId)
                  ? [...contributors, attackerId]
                  : contributors;

                return {
                  ...char,
                  outrage: newOutrage,
                  outrageContributors: newContributors,
                };
              }

              return char;
            }),
          }
        : null,
    }));

    // Collect applied buffs for the log
    const appliedBuffs: AppliedBuffInfo[] = [];

    // Add active buffs from abilities (like WarHowl)
    for (const buff of attacker.activeBuffs) {
      const effects: string[] = [];
      if (buff.critChanceBonus) effects.push(`+${buff.critChanceBonus}% Crit`);
      if (buff.baseDamageMultiplier && buff.baseDamageMultiplier !== 1) {
        effects.push(`×${buff.baseDamageMultiplier.toFixed(2)} Dmg`);
      }
      if (buff.baseDamageBonus) effects.push(`+${buff.baseDamageBonus} Dmg`);
      if (effects.length > 0) {
        appliedBuffs.push({
          name: buff.abilityName || 'Buff',
          effect: effects.join(', '),
        });
      }
    }

    // Add aura buffs from teammates
    for (const source of buffSources) {
      const effects: string[] = [];
      if (source.damageBonus) effects.push(`+${source.damageBonus} Dmg`);
      if (source.extraHits) effects.push(`+${source.extraHits} Hit`);
      if (effects.length > 0) {
        appliedBuffs.push({
          name: source.name,
          sourceName: source.sourceName,
          effect: effects.join(', '),
        });
      }
    }

    // Add applicable passive abilities
    for (const evaluation of passiveResult.evaluations) {
      if (evaluation.applicable && evaluation.modifiers) {
        const effects: string[] = [];
        if (evaluation.modifiers.extraHits) effects.push(`+${evaluation.modifiers.extraHits} Hit`);
        if (evaluation.modifiers.critDamageBonus) effects.push(`+${evaluation.modifiers.critDamageBonus} Crit Dmg`);
        if (evaluation.modifiers.baseDamageMultiplier && evaluation.modifiers.baseDamageMultiplier !== 1) {
          const pct = Math.round((evaluation.modifiers.baseDamageMultiplier - 1) * 100);
          effects.push(`${pct >= 0 ? '+' : ''}${pct}% Dmg`);
        }
        if (effects.length > 0) {
          appliedBuffs.push({
            name: evaluation.abilityName,
            effect: effects.join(', '),
          });
        }
      }

      // Handle summonRequest from passives (e.g., AggressiveOnslaught)
      if (evaluation.applicable && evaluation.summonRequest) {
        const summonReq = evaluation.summonRequest;
        const currentState = get().battleState;

        if (currentState) {
          // Check if summons already exist (if ifNotPresent is true)
          const existingSummon = currentState.summons.find(s =>
            s.unitId === summonReq.unitId && s.sourceCharacterId === attackerId
          );

          if (!summonReq.ifNotPresent || !existingSummon) {
            const summonData = getSummonUnitData(summonReq.unitId);
            if (summonData) {
              const meleeWeapon = summonData.weapons.find(w => !w.Range);
              const rangedWeapon = summonData.weapons.find(w => w.Range);

              const newSummon: import('../types').BattleSummon = {
                id: `summon_${summonReq.unitId}_${Date.now()}`,
                unitId: summonReq.unitId,
                name: summonData.name,
                sourceCharacterId: attackerId,
                sourceAbilityId: evaluation.abilityId,
                hp: summonReq.hp,
                damage: summonReq.damage,
                armor: summonReq.armor,
                meleeHits: meleeWeapon?.hits || 1,
                meleeDamageType: (meleeWeapon?.DamageProfile as import('../types').DamageType) || 'Physical',
                rangedHits: rangedWeapon?.hits,
                rangedDamageType: rangedWeapon?.DamageProfile as import('../types').DamageType | undefined,
                rangedRange: rangedWeapon?.Range,
                traits: summonData.traits || [],
                count: summonReq.count,
                createdAtTurn: currentState.turn,
                iconUrl: getSummonIconUrl(summonReq.unitId),
                activeAbilities: summonData.activeAbilities,
                totalDamageDealt: 0,
              };

              set((state) => ({
                battleState: state.battleState
                  ? {
                      ...state.battleState,
                      summons: [...state.battleState.summons, newSummon],
                    }
                  : null,
              }));

              console.log(`[Passive ${evaluation.abilityName}: Summoned ${summonReq.count}x ${summonData.name}]`);
            }
          } else {
            console.log(`[Passive ${evaluation.abilityName}: ${summonReq.unitId} already present, skipping summon]`);
          }
        }
      }
    }

    // Structural Analyser: Darkstrider's ranged attacks apply Markerlight to boss
    // Applies to both main ranged attacks and follow-up ranged attacks (e.g., Way of the Short Blade)
    if ((attackType === 'ranged' || hadFollowUpRangedAttack) && attacker.passiveAbilities.includes('StructuralAnalyser')) {
      const currentState = get().battleState;
      if (currentState && !currentState.bossHasMarkerlight) {
        set({
          battleState: {
            ...currentState,
            bossHasMarkerlight: true,
          },
        });
        console.log('[Structural Analyser: Markerlight enabled on boss after ranged attack]');
      }
    }

    // Handle ControlEdict (Tan Gi'da) - summon Skitarii Vanguard after attack if Protector stance is active
    // If summon exists, increment count (max 5). If not, create one.
    if (attacker.passiveAbilities.includes('ControlEdict') && attacker.doctrinaImperativeStance === 'protector') {
      const currentState = get().battleState;
      if (currentState) {
        const MAX_SKITARII_COUNT = 5;
        const existingVanguard = currentState.summons.find(s => s.unitId === 'admecSmnVanguard');

        if (existingVanguard) {
          // Increment count if under max
          if (existingVanguard.count < MAX_SKITARII_COUNT) {
            set((state) => ({
              battleState: state.battleState
                ? {
                    ...state.battleState,
                    summons: state.battleState.summons.map(s =>
                      s.unitId === 'admecSmnVanguard'
                        ? { ...s, count: s.count + 1 }
                        : s
                    ),
                  }
                : null,
            }));
            console.log(`[Control Edict: Skitarii Vanguard count increased to ${existingVanguard.count + 1} (max ${MAX_SKITARII_COUNT})]`);
          } else {
            console.log(`[Control Edict: Skitarii Vanguard at max count (${MAX_SKITARII_COUNT})]`);
          }
        } else {
          // Create new summon
          const controlEdictValues = getAbilityValues('ControlEdict', attacker.abilityLevels?.ControlEdict ?? 54, attacker.progressionStepIndex) || {};
          const summonData = getSummonUnitData('admecSmnVanguard');
          if (summonData) {
            const meleeWeapon = summonData.weapons.find(w => !w.Range);
            const rangedWeapon = summonData.weapons.find(w => w.Range);

            const newSummon: import('../types').BattleSummon = {
              id: `summon_admecSmnVanguard_${Date.now()}`,
              unitId: 'admecSmnVanguard',
              name: summonData.name,
              sourceCharacterId: attackerId,
              sourceAbilityId: 'ControlEdict',
              hp: controlEdictValues.summonHp as number || 0,
              damage: controlEdictValues.summonDmg as number || 0,
              armor: controlEdictValues.summonArmor as number || 0,
              meleeHits: meleeWeapon?.hits || 1,
              meleeDamageType: (meleeWeapon?.DamageProfile as import('../types').DamageType) || 'Physical',
              rangedHits: rangedWeapon?.hits || 3,
              rangedDamageType: (rangedWeapon?.DamageProfile as import('../types').DamageType) || 'Toxic',
              rangedRange: rangedWeapon?.Range,
              traits: summonData.traits || [],
              count: 1,
              createdAtTurn: currentState.turn,
              iconUrl: getSummonIconUrl('admecSmnVanguard'),
              activeAbilities: summonData.activeAbilities,
              totalDamageDealt: 0,
            };

            set((state) => ({
              battleState: state.battleState
                ? {
                    ...state.battleState,
                    summons: [...state.battleState.summons, newSummon],
                  }
                : null,
            }));

            console.log(`[Control Edict: Summoned Skitarii Vanguard (Protector stance active)]`);
          }
        }
      }
    }

    return {
      timestamp: Date.now(),
      characterId: attackerId,
      characterName: attacker.name,
      characterIconUrl: attacker.iconUrl,
      action: 'attack' as const,
      target: targetId,
      damage: totalDamage,
      damageBreakdown,
      damageType: attackType === 'ranged' ? attacker.rangedDamageType : attacker.meleeDamageType,
      message: `${attacker.name} ${attackType} attacks`,
      followUpAttacks: followUpAttackLogs.length > 0 ? followUpAttackLogs : undefined,
      appliedBuffs: appliedBuffs.length > 0 ? appliedBuffs : undefined,
      attackType,
    };
  },

  // Toggle a passive ability on/off for a character, or set a counter value
  toggleAbility: (characterId, abilityId, counterValue) => {
    const { battleState } = get();
    if (!battleState) return;

    set({
      battleState: {
        ...battleState,
        team: battleState.team.map((char) =>
          char.id === characterId
            ? {
                ...char,
                abilityToggles: {
                  ...char.abilityToggles,
                  // If counterValue is provided, use it; otherwise toggle boolean
                  [abilityId]: counterValue !== undefined ? counterValue : !char.abilityToggles[abilityId],
                },
              }
            : char
        ),
      },
    });
  },

  // Check if an ability is ready to use
  isAbilityReady: (characterId, abilityId) => {
    const { battleState } = get();
    if (!battleState) return false;

    const character = battleState.team.find((c) => c.id === characterId);
    if (!character) return false;

    const cooldownState = character.abilityCooldowns[abilityId];
    if (!cooldownState) return false;

    return isAbilityReady(cooldownState);
  },

  // Mark an ability as used (put it on cooldown)
  markAbilityUsed: (characterId, abilityId) => {
    set((state) => ({
      battleState: state.battleState
        ? {
            ...state.battleState,
            team: state.battleState.team.map((char) =>
              char.id === characterId
                ? {
                    ...char,
                    abilityCooldowns: useAbility(char.abilityCooldowns, abilityId),
                  }
                : char
            ),
          }
        : null,
    }));
  },

  // Refresh an ability's cooldown (reset it to ready state)
  // Used by Inspired to Greatness to allow ability re-use
  refreshAbilityCooldown: (characterId, abilityId) => {
    set((state) => ({
      battleState: state.battleState
        ? {
            ...state.battleState,
            team: state.battleState.team.map((char) =>
              char.id === characterId
                ? {
                    ...char,
                    abilityCooldowns: unuseAbility(char.abilityCooldowns, abilityId),
                  }
                : char
            ),
          }
        : null,
    }));
  },

  // Execute an active ability and calculate damage
  executeAbility: (characterId, abilityId) => {
    const { battleState } = get();
    if (!battleState) {
      return {
        timestamp: Date.now(),
        characterId,
        characterName: 'Unknown',
        action: 'ability' as const,
        message: 'Battle not started',
      };
    }

    const character = battleState.team.find((c) => c.id === characterId);
    if (!character) {
      return {
        timestamp: Date.now(),
        characterId,
        characterName: 'Unknown',
        action: 'ability' as const,
        message: 'Character not found',
      };
    }

    const abilityName = getAbilityNameSync(abilityId);
    const levelIndex = character.abilityLevels?.[abilityId] ?? 54;

    // Find Trajann for LC +2 hits check
    const trajann = battleState.team.find(c => c.passiveAbilities.includes('LegendaryCommander'));
    const trajannIsAdjacentToBoss = isToggleActive(trajann?.abilityToggles['adjacentToBoss']);

    // Check if any Dark Angels teammate (not Asmodai) is adjacent to boss (for FearedInterrogator)
    const asmodai = battleState.team.find(c => c.passiveAbilities.includes('FearedInterrogator'));
    const darkAngelsAdjacentToBoss = asmodai ? battleState.team.some(c =>
      c.id !== asmodai.id && c.faction === 'DarkAngels' && c.abilityToggles['adjacentToBoss']
    ) : false;

    // Build ability context
    const context = {
      characterId: character.id,
      progressionStepIndex: character.progressionStepIndex,
      hasMoved: character.hasMoved,
      hasActedThisBattle: character.hasAttackedThisBattle,
      attacksThisTurn: character.attacksThisTurn,
      attackTurnsCount: character.attackTurnsCount,
      hasUsedAbilityThisTurn: character.hasUsedAbilityThisTurn,
      hasQualifiedForLCDamage: character.hasQualifiedForLCDamage,
      currentHealth: character.currentHealth,
      maxHealth: character.calculatedHealth,
      currentTurn: battleState.turn,
      activeAbilitiesUsedCount: battleState.activeAbilitiesUsedCount,
      attackType: 'ability' as const,
      attackCategory: 'ability' as const,
      isFirstSpecialAttackOfTurn: !character.hasUsedFirstSpecialAttackThisTurn,  // Per-character LC tracking
      trajannIsAdjacentToBoss,
      darkAngelsAdjacentToBoss,
      abilityToggles: character.abilityToggles,
      bossTraits: battleState.boss?.traits,
    };

    // Execute the ability
    const result = executeActiveAbility(abilityId, levelIndex, context);

    if (!result) {
      return {
        timestamp: Date.now(),
        characterId,
        characterName: character.name,
        characterIconUrl: character.iconUrl,
        action: 'ability' as const,
        message: `${character.name} uses ${abilityName} (no effect)`,
      };
    }

    // Update ability cooldown
    set((state) => ({
      battleState: state.battleState
        ? {
            ...state.battleState,
            team: state.battleState.team.map((char) =>
              char.id === characterId
                ? {
                    ...char,
                    abilityCooldowns: useAbility(char.abilityCooldowns, abilityId),
                  }
                : char
            ),
          }
        : null,
    }));

    // Track damage for damage abilities
    let totalDamage = 0;
    let damageBreakdown: DamageBreakdown | undefined;
    const appliedBuffs: AppliedBuffInfo[] = [];
    // Track if LC +2 hits was applied to ability (for state update)
    let lcHitsAppliedToAbility = false;
    // Collect follow-up attack logs (for multi-component abilities and passive follow-ups)
    const followUpAttackLogs: FollowUpAttackLog[] = [];
    // Track max perHitDamage for Laviscus outrage (uses highest perHitDamage from any attack)
    let maxPerHitDamage = 0;
    // Check if attacker is Chaos alliance (for Laviscus outrage contributor tracking)
    const isAbilityUserChaos = character.alliance === 'Chaos';
    // Track attack type for damage abilities (for display in battle log)
    let abilityAttackType: 'melee' | 'ranged' | undefined;

    // Prophet of Gork and Mork: Track attacks for active abilities
    let prophetAttackCounter = battleState.bossAttacksReceivedThisTurn;
    const prophetThreshold = battleState.prophetOfGorkAndMork?.attackThreshold ?? Infinity;
    const prophetReductionPct = battleState.prophetOfGorkAndMork?.damageReductionPct ?? 0;
    const prophetMultiplier = prophetReductionPct > 0 ? (100 - prophetReductionPct) / 100 : 1;

    // Handle damage abilities
    const ignoreCrit = battleState.ignoreCrit;
    if (result.damageComponents && result.damageComponents.length > 0) {
      // Multi-component damage ability (like KillMaimBurn)
      // Each component is treated as a separate special attack with independent buff evaluation
      // Each component is displayed as a follow-up attack with purple shading
      const equipmentStats = calculateEquipmentStats(character.equipment);
      abilityAttackType = result.attackType || 'melee';

      // AstartesBanner detection for multi-component melee abilities
      let componentBannerActive = false;
      let componentBannerMaxDmg = 0;
      if (abilityAttackType === 'melee') {
        const thoread = battleState.team.find(c => c.passiveAbilities.includes('AstartesBanner'));
        if (thoread && thoread.id !== character.id) {
          const bannerToggleId = `AstartesBanner_${thoread.id}_range2`;
          if (isToggleActive(character.abilityToggles[bannerToggleId])) {
            const bannerLevelIndex = thoread.abilityLevels?.['AstartesBanner'] ?? 54;
            const bannerValues = getAbilityValues('AstartesBanner', bannerLevelIndex, thoread.progressionStepIndex);
            if (bannerValues) {
              componentBannerActive = true;
              componentBannerMaxDmg = bannerValues.maxDmg as number || 0;
            }
          }
        }
      }

      console.group(`=== TURN ${battleState.turn}: ${character.name} uses ${abilityName} ===`);

      // Track effective character state for sequential buff evaluations
      let effectiveCharacter: BattleCharacter = { ...character };
      const isAdjacentToBoss = isToggleActive(character.abilityToggles['adjacentToBoss']);
      let componentIndex = 0;

      // Use boss armor if available, accounting for armor reduction
      const baseBossArmor = battleState.boss?.armor ?? 0;
      const bossArmor = Math.max(0, baseBossArmor - (battleState.bossArmorReduction || 0));

      // Check if boss has Daemon trait for block mechanic
      const hasDaemonTraitAbility = battleState.boss?.traits?.includes('Daemon') ?? false;

      const defenderStats: DefenderStats = {
        armor: bossArmor,
        maxHealth: battleState.boss?.health ?? 100000,
        traits: battleState.boss?.traits,
        // Daemon block stats
        daemonBlockChance: hasDaemonTraitAbility ? 0.25 : undefined,
        daemonBlockMaxAmount: hasDaemonTraitAbility ? (battleState.boss?.damage ?? 0) * 0.5 : undefined,
      };

      // Component attack logs (displayed like follow-up attacks with purple shading)
      const componentAttackLogs: FollowUpAttackLog[] = [];

      for (const component of result.damageComponents) {
        componentIndex++;

        // Create effective battle state with updated character for buff evaluation
        const effectiveBattleState = {
          ...battleState,
          team: battleState.team.map(c => c.id === characterId ? effectiveCharacter : c),
        };

        // Create buff evaluation context for THIS component as a special attack
        const componentBuffContext: BuffEvaluationContext = {
          attacker: effectiveCharacter,
          attackType: 'melee',
          attackCategory: 'special',  // Each component is a special attack
          target: battleState.boss,
          battleState: effectiveBattleState,
        };

        // Get applicable buffs for THIS component
        const componentApplicableBuffs = getApplicableBuffs(battleState.buffPool, componentBuffContext);
        const componentPoolEffects = combineBuffEffects(componentApplicableBuffs);

        const lcExtraDmg = componentPoolEffects.baseDamageBonus || 0;
        const lcExtraHits = componentPoolEffects.extraHits || 0;
        const poolComponentMultiplier = componentPoolEffects.baseDamageMultiplier || 1;
        const componentCritChanceBonus = componentPoolEffects.critChanceBonus || 0;
        const componentCritDamageBonus = componentPoolEffects.critDamageBonus || 0;

        // Get ability pierce ratio bonus (e.g., Supercharge)
        // Include team-wide Supercharge bonus for Plasma attacks
        const abilityOwnPierceBonus = result.abilityModifiers?.pierceRatioBonus || 0;
        const superchargeTeamBonus = (battleState.superchargePierceBonus && component.damageProfile === 'Plasma')
          ? battleState.superchargePierceBonus
          : 0;
        // Blood Chalice and other activeBuffs pierce ratio bonus (check meleeOnly flag)
        // KillMaimBurn components are melee attacks
        const componentBuffPierceRatioBonus = character.activeBuffs.reduce(
          (sum, buff) => {
            if (!buff.pierceRatioBonus) return sum;
            // KillMaimBurn is always melee, but check flag anyway for consistency
            if (buff.meleeOnly) return sum + buff.pierceRatioBonus;
            return sum + buff.pierceRatioBonus;
          }, 0
        );
        const abilityPierceRatioBonus = abilityOwnPierceBonus + superchargeTeamBonus + componentBuffPierceRatioBonus;

        // High Ground: +50% damage multiplier when toggle is enabled
        const componentHighGroundMultiplier = character.abilityToggles['HighGround'] ? 1.5 : 1;

        // War Machine: dynamic damage multiplier based on selected Machine of War
        const componentWarMachineMultiplier = character.abilityToggles['WarMachine'] && battleState.machineOfWar
          ? 1 + battleState.machineOfWar.extraDmgPct / 100
          : 1;

        const componentDamageMultiplier = poolComponentMultiplier * componentHighGroundMultiplier * componentWarMachineMultiplier;

        if (lcExtraDmg > 0 || lcExtraHits > 0 || componentDamageMultiplier !== 1) {
          console.log(`[Component ${componentIndex} buffs: +${lcExtraDmg} dmg, +${lcExtraHits} hits, ×${componentDamageMultiplier.toFixed(2)} mult]`);
        }

        // Get Lord of the Host aura bonuses for component attacks (melee only)
        // KillMaimBurn components are melee attacks and should receive aura bonuses
        const componentAuraBonuses = getCharacterAuraBonuses(effectiveCharacter, battleState.team);
        const activeComponentAuras = componentAuraBonuses.filter(a => {
          if (!a.isActive) return false;
          // Only apply melee-restricted auras since KillMaimBurn is melee
          if (a.attackTypeRestriction && a.attackTypeRestriction !== 'melee') return false;
          return true;
        });

        // Calculate aura damage and hit bonuses
        let componentAuraDmgBonus = 0;
        let componentAuraHitsBonus = 0;
        for (const aura of activeComponentAuras) {
          if (aura.modifiers) {
            componentAuraDmgBonus += aura.modifiers.baseDamageBonus || 0;
            componentAuraHitsBonus += aura.modifiers.extraHits || 0;
          }
        }

        if (componentAuraDmgBonus > 0 || componentAuraHitsBonus > 0) {
          console.log(`[Component ${componentIndex} aura buffs: +${componentAuraDmgBonus} dmg, +${componentAuraHitsBonus} hits]`);
        }

        // Build buff sources for breakdown display
        const componentBuffSources: Array<{ name: string; sourceName?: string; damageBonus?: number; extraHits?: number; damageMultiplier?: number; critChanceBonus?: number; critDamageBonus?: number; pierceRatioBonus?: number }> = [];

        // Add pool buff sources (including Daughter of the Abyss multiplier, Euphoric Strikes crit)
        for (const poolBuff of componentApplicableBuffs) {
          const source: { name: string; sourceName?: string; damageBonus?: number; extraHits?: number; damageMultiplier?: number; critChanceBonus?: number; critDamageBonus?: number } = {
            name: poolBuff.name,
          };
          if (poolBuff.effects.baseDamageBonus) source.damageBonus = poolBuff.effects.baseDamageBonus;
          if (poolBuff.effects.extraHits) source.extraHits = poolBuff.effects.extraHits;
          if (poolBuff.effects.baseDamageMultiplier && poolBuff.effects.baseDamageMultiplier !== 1) {
            source.damageMultiplier = poolBuff.effects.baseDamageMultiplier;
          }
          if (poolBuff.effects.critChanceBonus) source.critChanceBonus = poolBuff.effects.critChanceBonus;
          if (poolBuff.effects.critDamageBonus) source.critDamageBonus = poolBuff.effects.critDamageBonus;
          // Only add if there's at least one bonus
          if (source.damageBonus || source.extraHits || source.damageMultiplier || source.critChanceBonus || source.critDamageBonus) {
            componentBuffSources.push(source);
          }
        }

        // Add aura bonus sources
        for (const aura of activeComponentAuras) {
          if (aura.modifiers && (aura.modifiers.baseDamageBonus || aura.modifiers.extraHits)) {
            componentBuffSources.push({
              name: aura.sourceCharacterName ? `${aura.abilityName} (${aura.sourceCharacterName})` : aura.abilityName,
              damageBonus: aura.modifiers.baseDamageBonus,
              extraHits: aura.modifiers.extraHits,
            });
          }
        }

        // Add High Ground buff source for display
        if (componentHighGroundMultiplier > 1) {
          componentBuffSources.push({
            name: 'High Ground',
            damageMultiplier: componentHighGroundMultiplier,
          });
        }

        // Add Machine of War buff source for display
        if (componentWarMachineMultiplier > 1 && battleState.machineOfWar) {
          componentBuffSources.push({
            name: `Machine of War (+${battleState.machineOfWar.extraDmgPct}%)`,
            damageMultiplier: componentWarMachineMultiplier,
          });
        }

        // Add ability's own pierce ratio bonus source (e.g., for Supercharge's own attack)
        if (abilityOwnPierceBonus > 0) {
          componentBuffSources.push({
            name: abilityName,
            pierceRatioBonus: abilityOwnPierceBonus,
          });
        }

        // Add Supercharge team bonus source (for other abilities' Plasma attacks)
        if (superchargeTeamBonus > 0) {
          componentBuffSources.push({
            name: 'Supercharge',
            pierceRatioBonus: superchargeTeamBonus,
          });
        }

        // Add activeBuffs pierce ratio sources (e.g., Blood Chalice)
        // KillMaimBurn is a melee attack so all melee-only buffs apply
        for (const buff of character.activeBuffs) {
          if (buff.pierceRatioBonus) {
            componentBuffSources.push({
              name: buff.abilityName || 'Active Buff',
              pierceRatioBonus: buff.pierceRatioBonus,
            });
          }
        }

        // Calculate total damage and hit bonuses (LC + aura)
        const componentTotalDmgBonus = lcExtraDmg + componentAuraDmgBonus;
        const componentTotalHitsBonus = lcExtraHits + componentAuraHitsBonus;

        const baseHits = component.hits;
        const avgDamagePerHit = component.averageDamage;

        // Calculate damage using averageDamage (with crit)
        // Pass LC + aura bonuses via abilityModifiers for proper source tracking
        const componentStats: AttackerStats = {
          baseDamage: avgDamagePerHit,
          damageType: component.damageProfile,
          hits: baseHits,  // Base hits only, extra hits via abilityModifiers
          critChance: equipmentStats.critChance || 0,
          critDamage: equipmentStats.critDmg || 0,
          critChanceBonus: (equipmentStats.critChanceBonus || 0) + componentCritChanceBonus,
          critDmgBonus: (equipmentStats.critDmgBonus || 0) + componentCritDamageBonus,
          ignoreCrit,
          traits: character.traits,
          hasMoved: true,
          attackType: 'melee',
          hasAttackedThisBattle: character.hasAttackedThisBattle,
          attacksThisTurn: character.attacksThisTurn,
          firstAttackTurn: character.firstAttackTurn,
          currentTurn: battleState.turn,
          abilityToggles: character.abilityToggles,
          fightingRetreatActive: character.fightingRetreatActive,
          // Pass bonuses via abilityModifiers for proper source tracking in breakdown
          abilityModifiers: (componentTotalDmgBonus > 0 || componentTotalHitsBonus > 0 || componentDamageMultiplier !== 1 || componentCritChanceBonus > 0 || componentCritDamageBonus > 0 || abilityPierceRatioBonus > 0) ? {
            baseDamageBonus: componentTotalDmgBonus > 0 ? componentTotalDmgBonus : undefined,
            baseDamageMultiplier: componentDamageMultiplier !== 1 ? componentDamageMultiplier : undefined,
            extraHits: componentTotalHitsBonus > 0 ? componentTotalHitsBonus : undefined,
            critChanceBonus: componentCritChanceBonus > 0 ? componentCritChanceBonus : undefined,
            critDamageBonus: componentCritDamageBonus > 0 ? componentCritDamageBonus : undefined,
            pierceRatioBonus: abilityPierceRatioBonus > 0 ? abilityPierceRatioBonus : undefined,
            buffSources: componentBuffSources,
          } : undefined,
        };
        const componentCalc = new DamageCalculator(true);
        const componentResult = componentCalc.calculate(componentStats, defenderStats);

        console.log(`\nComponent ${componentIndex}: ${componentResult.totalHits}x ${component.damageProfile}`);
        componentCalc.printLogs();
        console.log(`Component Damage: ${componentResult.damage.toLocaleString()}`);

        // Prophet of Gork and Mork: Apply damage reduction per component (each component = 1 attack)
        let componentProphetReduction = 1;
        if (prophetAttackCounter >= prophetThreshold && prophetReductionPct > 0) {
          componentProphetReduction = prophetMultiplier;
          console.log(`[Prophet of Gork and Mork: -${prophetReductionPct}% damage on ${component.damageProfile} (attack ${prophetAttackCounter + 1})]`);
        }
        const adjustedComponentDamage = Math.round(componentResult.damage * componentProphetReduction);
        prophetAttackCounter++;

        totalDamage += adjustedComponentDamage;
        // Track max perHitDamage for Laviscus outrage
        maxPerHitDamage = Math.max(maxPerHitDamage, componentResult.perHitDamage);

        // Build component breakdown for display
        const componentBreakdown: DamageBreakdown = {
          damage: adjustedComponentDamage,
          perHitDamage: componentProphetReduction < 1 ? Math.round(componentResult.perHitDamage * componentProphetReduction) : componentResult.perHitDamage,
          hits: componentResult.totalHits,
          baseDamage: componentResult.baseDamage,
          flatModifiers: componentResult.flatModifiers,
          flatModifierSources: componentResult.flatModifierSources,
          critBonus: componentResult.critBonus,
          critChanceSources: componentResult.critChanceSources,
          critDamageSources: componentResult.critDamageSources,
          extraHits: componentResult.extraHits,
          extraHitsSources: componentResult.extraHitsSources,
          damVarMod: componentResult.damVarMod,
          targetArmor: bossArmor,
          afterArmor: componentResult.afterArmor,
          pierceRatio: componentResult.pierceRatio,
          pierceRatioBonus: componentResult.pierceRatioBonus,
          pierceRatioBonusSources: componentResult.pierceRatioBonusSources,
          effectivePierceRatio: componentResult.effectivePierceRatio,
          pierceFloor: componentResult.pierceFloor,
          afterArmorPierce: componentResult.afterArmorPierce,
          globalMultiplier: componentResult.globalMultiplier,
          globalMultiplierSources: componentResult.globalMultiplierSources,
          baseCritChance: componentResult.baseCritChance,
          baseCritDamage: componentResult.baseCritDamage,
          critChanceBonus: componentResult.critChanceTotalBonus,
          critDmgBonus: componentResult.critDamageTotalBonus,
          critChance: componentResult.effectiveCritChance * 100,
          critDamage: componentResult.effectiveCritDamage,
          traitModifiers: componentResult.traitModifiers,
          traitMultiplier: componentResult.traitMultiplier,
          // Block reduction (Daemon trait)
          expectedBlocks: componentResult.expectedBlocks,
          blockReductionPerHit: componentResult.blockReductionPerHit,
          totalBlockReduction: componentResult.totalBlockReduction,
        };

        // Add Prophet of Gork and Mork to component breakdown if active
        if (componentProphetReduction < 1) {
          componentBreakdown.globalMultiplier = (componentBreakdown.globalMultiplier || 1) * componentProphetReduction;
          componentBreakdown.globalMultiplierSources = [
            ...(componentBreakdown.globalMultiplierSources || []),
            { name: 'Prophet of Gork and Mork', damageMultiplier: componentProphetReduction }
          ];
        }

        // Add component as a follow-up attack log (displays with purple shading)
        const componentName = `${abilityName} (${component.damageProfile})`;
        componentAttackLogs.push({
          abilityName: componentName,
          damage: adjustedComponentDamage,
          hits: componentResult.totalHits,
          damageType: component.damageProfile,
          breakdown: componentBreakdown,
        });

        // AstartesBanner: +1 hit after each melee component (same stats, capped at maxDmg)
        if (componentBannerActive) {
          const bannerComponentStats: AttackerStats = {
            ...componentStats,
            hits: 1,
            damageCaps: { ...(componentStats.damageCaps || {}), finalDamageCap: componentBannerMaxDmg },
            critChainOffset: componentResult.totalHits,
            abilityModifiers: componentStats.abilityModifiers ? {
              ...componentStats.abilityModifiers,
              extraHits: undefined,
            } : undefined,
          };
          const bannerComponentCalc = new DamageCalculator(true);
          const bannerComponentResult = bannerComponentCalc.calculate(bannerComponentStats, defenderStats);

          // Prophet of Gork and Mork: Apply reduction to banner (shares crit chain, no counter increment)
          let bannerComponentProphetReduction = 1;
          if (prophetAttackCounter >= prophetThreshold && prophetReductionPct > 0) {
            bannerComponentProphetReduction = prophetMultiplier;
          }
          const adjustedBannerComponentDamage = Math.round(bannerComponentResult.damage * bannerComponentProphetReduction);

          totalDamage += adjustedBannerComponentDamage;
          maxPerHitDamage = Math.max(maxPerHitDamage, bannerComponentResult.perHitDamage);

          // Build breakdown
          const bannerComponentBreakdown: DamageBreakdown = {
            damage: adjustedBannerComponentDamage,
            perHitDamage: bannerComponentProphetReduction < 1 ? Math.round(bannerComponentResult.perHitDamage * bannerComponentProphetReduction) : bannerComponentResult.perHitDamage,
            hits: bannerComponentResult.totalHits,
            baseDamage: bannerComponentResult.baseDamage,
            flatModifiers: bannerComponentResult.flatModifiers,
            flatModifierSources: bannerComponentResult.flatModifierSources,
            critBonus: bannerComponentResult.critBonus,
            critChanceSources: bannerComponentResult.critChanceSources,
            critDamageSources: bannerComponentResult.critDamageSources,
            extraHits: bannerComponentResult.extraHits,
            extraHitsSources: bannerComponentResult.extraHitsSources,
            damVarMod: bannerComponentResult.damVarMod,
            targetArmor: bossArmor,
            afterArmor: bannerComponentResult.afterArmor,
            pierceRatio: bannerComponentResult.pierceRatio,
            pierceRatioBonus: bannerComponentResult.pierceRatioBonus,
            pierceRatioBonusSources: bannerComponentResult.pierceRatioBonusSources,
            effectivePierceRatio: bannerComponentResult.effectivePierceRatio,
            pierceFloor: bannerComponentResult.pierceFloor,
            afterArmorPierce: bannerComponentResult.afterArmorPierce,
            globalMultiplier: bannerComponentResult.globalMultiplier,
            globalMultiplierSources: bannerComponentResult.globalMultiplierSources,
            baseCritChance: bannerComponentResult.baseCritChance,
            baseCritDamage: bannerComponentResult.baseCritDamage,
            critChanceBonus: bannerComponentResult.critChanceTotalBonus,
            critDmgBonus: bannerComponentResult.critDamageTotalBonus,
            critChance: bannerComponentResult.effectiveCritChance * 100,
            critDamage: bannerComponentResult.effectiveCritDamage,
            traitModifiers: bannerComponentResult.traitModifiers,
            traitMultiplier: bannerComponentResult.traitMultiplier,
            expectedBlocks: bannerComponentResult.expectedBlocks,
            blockReductionPerHit: bannerComponentResult.blockReductionPerHit,
            totalBlockReduction: bannerComponentResult.totalBlockReduction,
          };

          // Add Prophet of Gork and Mork to banner breakdown if active
          if (bannerComponentProphetReduction < 1) {
            bannerComponentBreakdown.globalMultiplier = (bannerComponentBreakdown.globalMultiplier || 1) * bannerComponentProphetReduction;
            bannerComponentBreakdown.globalMultiplierSources = [
              ...(bannerComponentBreakdown.globalMultiplierSources || []),
              { name: 'Prophet of Gork and Mork', damageMultiplier: bannerComponentProphetReduction }
            ];
          }

          componentAttackLogs.push({
            abilityName: 'Astartes Banner',
            damage: adjustedBannerComponentDamage,
            hits: bannerComponentResult.totalHits,
            damageType: component.damageProfile,
            breakdown: bannerComponentBreakdown,
          });

          console.log(`  Banner hit after ${component.damageProfile}: ${bannerComponentResult.damage.toLocaleString()}`);
        }

        // AFTER each component: Update effective character state for next component's buff evaluation
        // NOTE: hasQualifiedForLCDamage is set AFTER all components complete (not per-component)
        // This ensures the ability can't qualify itself for LC during its own resolution

        // If LC +2 hits was applied to this component, mark first special attack as used
        if (lcExtraHits > 0 && !effectiveCharacter.hasUsedFirstSpecialAttackThisTurn) {
          effectiveCharacter = { ...effectiveCharacter, hasUsedFirstSpecialAttackThisTurn: true };
          lcHitsAppliedToAbility = true;
          console.log(`[Component ${componentIndex}: LC +2 hits applied, marking first special attack used]`);
        }
      }

      console.log('\n--- COMBINED TOTAL ---');
      console.log(`Total Damage: ${totalDamage.toLocaleString()}`);
      console.groupEnd();

      // Add component attack logs to follow-up attacks (displays with purple shading)
      followUpAttackLogs.push(...componentAttackLogs);

      // No main damageBreakdown for multi-component abilities - each component shown via followUpAttackLogs
      damageBreakdown = undefined;

      // After ALL components resolved: Mark ability as "used" for LC qualification
      // This ensures follow-up attacks (like The Betrayer) can benefit from LC damage/hits
      if (isAdjacentToBoss && !character.hasQualifiedForLCDamage) {
        set((state) => ({
          battleState: state.battleState ? {
            ...state.battleState,
            team: state.battleState.team.map(c =>
              c.id === characterId ? { ...c, hasQualifiedForLCDamage: true } : c
            ),
          } : null,
        }));
        console.log(`[Multi-component ability completed: ${character.name} now qualifies for LC damage]`);
      }
    } else if (result.damageResult && result.rawDamage) {
      // Raw damage ability (like RadBombardment) - bypasses all bonuses/modifiers and cannot crit
      // This ability explicitly ignores character bonuses, elevation, and crit
      abilityAttackType = result.attackType || 'ranged';
      console.group(`=== TURN ${battleState.turn}: ${character.name} uses ${abilityName} (RAW DAMAGE) ===`);
      console.log('[Raw Damage: ignores all bonuses/modifiers, cannot crit]');

      const baseHits = result.damageResult.hits;
      const avgDamagePerHit = result.damageResult.averageDamage;

      // Use boss armor if available, accounting for armor reduction
      const baseBossArmor = battleState.boss?.armor ?? 0;
      const bossArmor = Math.max(0, baseBossArmor - (battleState.bossArmorReduction || 0));

      // Check if boss has Daemon trait for block mechanic
      const hasDaemonTraitRaw = battleState.boss?.traits?.includes('Daemon') ?? false;

      const defenderStats: DefenderStats = {
        armor: bossArmor,
        maxHealth: battleState.boss?.health ?? 100000,
        traits: battleState.boss?.traits,
        // Daemon block stats
        daemonBlockChance: hasDaemonTraitRaw ? 0.25 : undefined,
        daemonBlockMaxAmount: hasDaemonTraitRaw ? (battleState.boss?.damage ?? 0) * 0.5 : undefined,
      };

      // Raw damage stats: no crit, no traits, no bonuses
      const rawStats: AttackerStats = {
        baseDamage: avgDamagePerHit,
        damageType: result.damageResult.damageProfile,
        hits: baseHits,
        critChance: 0,  // No crit
        critDamage: 0,  // No crit
        critChanceBonus: 0,
        critDmgBonus: 0,
        ignoreCrit: true,  // Force ignore crit
        traits: [],  // No trait bonuses
        hasMoved: true,
        attackType: result.attackType || 'ranged',
        hasAttackedThisBattle: character.hasAttackedThisBattle,
        attacksThisTurn: character.attacksThisTurn,
        firstAttackTurn: character.firstAttackTurn,
        currentTurn: battleState.turn,
        abilityToggles: {},  // No toggles (ignores High Ground, etc.)
        // No abilityModifiers - raw damage has no bonuses
      };

      const rawCalc = new DamageCalculator(true);
      const rawResult = rawCalc.calculate(rawStats, defenderStats);

      rawCalc.printLogs();
      console.log('\n--- SUMMARY ---');
      console.log(`Damage: ${rawResult.damage.toLocaleString()}`);
      console.groupEnd();

      // Prophet of Gork and Mork: Apply damage reduction to raw damage ability
      let rawProphetReduction = 1;
      if (prophetAttackCounter >= prophetThreshold && prophetReductionPct > 0) {
        rawProphetReduction = prophetMultiplier;
        console.log(`[Prophet of Gork and Mork: -${prophetReductionPct}% damage on ${abilityName} (attack ${prophetAttackCounter + 1})]`);
      }
      totalDamage = Math.round(rawResult.damage * rawProphetReduction);
      prophetAttackCounter++;

      maxPerHitDamage = Math.max(maxPerHitDamage, rawResult.perHitDamage);

      // Build breakdown for display
      damageBreakdown = {
        damage: totalDamage,
        perHitDamage: rawProphetReduction < 1 ? Math.round(rawResult.perHitDamage * rawProphetReduction) : rawResult.perHitDamage,
        hits: rawResult.totalHits,
        baseDamage: rawResult.baseDamage,
        flatModifiers: 0,
        flatModifierSources: [],  // No modifiers for raw damage
        critBonus: 0,
        critChanceSources: [],    // No crit for raw damage
        critDamageSources: [],    // No crit for raw damage
        extraHits: 0,
        extraHitsSources: [],     // No extra hits for raw damage
        damVarMod: rawResult.damVarMod,
        targetArmor: bossArmor,
        afterArmor: rawResult.afterArmor,
        pierceRatio: rawResult.pierceRatio,
        pierceFloor: rawResult.pierceFloor,
        afterArmorPierce: rawResult.afterArmorPierce,
        globalMultiplier: rawResult.globalMultiplier,
        globalMultiplierSources: [],  // No multipliers for raw damage
        baseCritChance: 0,
        baseCritDamage: 0,
        critChanceBonus: 0,
        critDmgBonus: 0,
        critChance: 0,
        critDamage: 0,
        // Daemon block stats
        expectedBlocks: rawResult.expectedBlocks,
        blockReductionPerHit: rawResult.blockReductionPerHit,
        totalBlockReduction: rawResult.totalBlockReduction,
      };

      // Add Prophet of Gork and Mork to raw damage breakdown if active
      if (rawProphetReduction < 1) {
        damageBreakdown.globalMultiplier = (damageBreakdown.globalMultiplier || 1) * rawProphetReduction;
        damageBreakdown.globalMultiplierSources = [
          { name: 'Prophet of Gork and Mork', damageMultiplier: rawProphetReduction }
        ];
      }

      // Handle passive ability summonRequests for HammerOfWrath (triggers AggressiveOnslaught)
      if (abilityId === 'HammerOfWrath' && character.passiveAbilities.includes('AggressiveOnslaught')) {
        const isCharging = isToggleActive(character.abilityToggles['AggressiveOnslaught']);
        if (isCharging) {
          const aggressiveOnslaughtLevel = character.abilityLevels?.['AggressiveOnslaught'] ?? 54;
          const aoValues = getAbilityValues('AggressiveOnslaught', aggressiveOnslaughtLevel, character.progressionStepIndex);

          if (aoValues) {
            const summonHp = aoValues.summonHp as number || 0;
            const summonDmg = aoValues.summonDmg as number || 0;
            const summonArmor = aoValues.summonArmor as number || 0;
            const nrOfSummons = aoValues.nrOfSummons as number || 2;
            const unitId = 'bloodSmnIntercessor';

            const currentState = get().battleState;
            if (currentState) {
              // Check if summons already exist for this character
              const existingSummon = currentState.summons.find(s =>
                s.unitId === unitId && s.sourceCharacterId === characterId
              );

              if (!existingSummon) {
                const summonData = getSummonUnitData(unitId);
                if (summonData) {
                  const meleeWeapon = summonData.weapons.find(w => !w.Range);
                  const rangedWeapon = summonData.weapons.find(w => w.Range);

                  const newSummon: import('../types').BattleSummon = {
                    id: `summon_${unitId}_${Date.now()}`,
                    unitId,
                    name: summonData.name,
                    sourceCharacterId: characterId,
                    sourceAbilityId: 'AggressiveOnslaught',
                    hp: summonHp,
                    damage: summonDmg,
                    armor: summonArmor,
                    meleeHits: meleeWeapon?.hits || 1,
                    meleeDamageType: (meleeWeapon?.DamageProfile as import('../types').DamageType) || 'Physical',
                    rangedHits: rangedWeapon?.hits,
                    rangedDamageType: rangedWeapon?.DamageProfile as import('../types').DamageType | undefined,
                    rangedRange: rangedWeapon?.Range,
                    traits: summonData.traits || [],
                    count: nrOfSummons,
                    createdAtTurn: currentState.turn,
                    iconUrl: getSummonIconUrl(unitId),
                    activeAbilities: summonData.activeAbilities,
                    totalDamageDealt: 0,
                  };

                  set((state) => ({
                    battleState: state.battleState
                      ? {
                          ...state.battleState,
                          summons: [...state.battleState.summons, newSummon],
                        }
                      : null,
                  }));

                  console.log(`[AggressiveOnslaught: Summoned ${nrOfSummons}x ${summonData.name} via HammerOfWrath]`);
                }
              } else {
                console.log(`[AggressiveOnslaught: ${unitId} already present, skipping summon]`);
              }
            }
          }
        }
      }
    } else if (result.damageResult || result.useCharacterMeleeStats) {
      // Single component damage ability (like Martial Inspiration, SkyStrike)
      // useCharacterMeleeStats: ability uses character's normal melee weapon stats
      const effectiveDamageResult = result.damageResult || {
        minDamage: character.calculatedDamage,
        maxDamage: character.calculatedDamage,
        averageDamage: character.calculatedDamage,
        hits: character.meleeHits,
        damageProfile: character.meleeDamageType,
      };
      // Displayed as a special attack with purple shading
      const equipmentStats = calculateEquipmentStats(character.equipment);

      console.group(`=== TURN ${battleState.turn}: ${character.name} uses ${abilityName} ===`);

      // Get LC bonuses from buff pool for single-component ability attacks
      const singleAbilityBuffContext: BuffEvaluationContext = {
        attacker: character,
        attackType: result.attackType || 'melee',
        attackCategory: 'ability',
        target: battleState.boss,
        battleState,
      };
      const singleAbilityApplicableBuffs = getApplicableBuffs(battleState.buffPool, singleAbilityBuffContext);
      const singleAbilityPoolEffects = combineBuffEffects(singleAbilityApplicableBuffs);

      const lcExtraDmg = singleAbilityPoolEffects.baseDamageBonus || 0;
      const lcExtraHits = singleAbilityPoolEffects.extraHits || 0;
      const poolDamageMultiplier = singleAbilityPoolEffects.baseDamageMultiplier || 1;
      if (lcExtraHits > 0) lcHitsAppliedToAbility = true;

      // High Ground: +50% damage multiplier when toggle is enabled
      const abilityHighGroundMultiplier = character.abilityToggles['HighGround'] ? 1.5 : 1;

      // War Machine: dynamic damage multiplier based on selected Machine of War
      const abilityWarMachineMultiplier = character.abilityToggles['WarMachine'] && battleState.machineOfWar
        ? 1 + battleState.machineOfWar.extraDmgPct / 100
        : 1;

      // Only show pool buff log if Trajann (Legendary Commander) is in the team
      if ((lcExtraDmg > 0 || lcExtraHits > 0 || poolDamageMultiplier !== 1) && battleState.team.some(c => c.passiveAbilities.includes('LegendaryCommander'))) {
        console.log(`[Pool Buff applied to ability: +${lcExtraDmg} dmg, +${lcExtraHits} hits, ×${poolDamageMultiplier.toFixed(2)} mult]`);
      }

      // Get Lord of the Host aura bonuses for ability attacks
      // Use the ability's attack type for filtering (melee or ranged)
      abilityAttackType = result.attackType || 'melee';
      const abilityAuraBonuses = getCharacterAuraBonuses(character, battleState.team);
      const activeAbilityAuras = abilityAuraBonuses.filter(a => {
        if (!a.isActive) return false;
        // Only apply auras matching the ability's attack type
        if (a.attackTypeRestriction && a.attackTypeRestriction !== abilityAttackType) return false;
        return true;
      });

      // Calculate aura damage and hit bonuses
      let auraDmgBonus = 0;
      let auraHitsBonus = 0;
      for (const aura of activeAbilityAuras) {
        if (aura.modifiers) {
          auraDmgBonus += aura.modifiers.baseDamageBonus || 0;
          auraHitsBonus += aura.modifiers.extraHits || 0;
        }
      }

      if (auraDmgBonus > 0 || auraHitsBonus > 0) {
        console.log(`[Aura Buff applied to ability: +${auraDmgBonus} dmg, +${auraHitsBonus} hits]`);
      }

      // Build buff sources for breakdown display
      const abilityBuffSources: Array<{ name: string; sourceName?: string; damageBonus?: number; extraHits?: number; damageMultiplier?: number; critChanceBonus?: number; critDamageBonus?: number; pierceRatioBonus?: number }> = [];

      // Add pool buff sources (including Daughter of the Abyss multiplier, Legendary Commander, etc.)
      for (const poolBuff of singleAbilityApplicableBuffs) {
        const source: { name: string; sourceName?: string; damageBonus?: number; extraHits?: number; damageMultiplier?: number } = {
          name: poolBuff.name,
        };
        if (poolBuff.effects.baseDamageBonus) source.damageBonus = poolBuff.effects.baseDamageBonus;
        if (poolBuff.effects.extraHits) source.extraHits = poolBuff.effects.extraHits;
        if (poolBuff.effects.baseDamageMultiplier && poolBuff.effects.baseDamageMultiplier !== 1) {
          source.damageMultiplier = poolBuff.effects.baseDamageMultiplier;
        }
        // Only add if there's at least one bonus
        if (source.damageBonus || source.extraHits || source.damageMultiplier) {
          abilityBuffSources.push(source);
        }
      }

      // Add aura bonus sources (merge entries with same name, e.g. SpotterReworked range2 + heavy)
      for (const aura of activeAbilityAuras) {
        if (aura.modifiers && (aura.modifiers.baseDamageBonus || aura.modifiers.extraHits)) {
          const auraSourceName = aura.abilityName;
          const existing = abilityBuffSources.find(s => s.name === auraSourceName);
          if (existing) {
            existing.damageBonus = (existing.damageBonus || 0) + (aura.modifiers.baseDamageBonus || 0);
            existing.extraHits = (existing.extraHits || 0) + (aura.modifiers.extraHits || 0);
          } else {
            abilityBuffSources.push({
              name: auraSourceName,
              damageBonus: aura.modifiers.baseDamageBonus,
              extraHits: aura.modifiers.extraHits,
            });
          }
        }
      }

      // Check for ability global multiplier (e.g., Martial Inspiration +33% per attack turn)
      let abilityGlobalMultiplier: number | undefined;
      if (result.globalMultiplier) {
        const gm = result.globalMultiplier;
        abilityGlobalMultiplier = gm.multiplier;
        // Format: "Martial Inspiration +33%×3" for stacks > 1, or just "+33%" for 1 stack
        const stackText = gm.stacks > 1 ? `×${gm.stacks}` : '';
        abilityBuffSources.push({
          name: `${gm.sourceName} +${gm.basePercentage}%${stackText}`,
          damageMultiplier: gm.multiplier,
        });
      }

      const baseHits = effectiveDamageResult.hits;
      const avgDamagePerHit = effectiveDamageResult.averageDamage;

      // Use boss armor if available, accounting for armor reduction
      const baseBossArmor = battleState.boss?.armor ?? 0;
      const bossArmor = Math.max(0, baseBossArmor - (battleState.bossArmorReduction || 0));

      // Check if boss has Daemon trait for block mechanic
      const hasDaemonTraitAbilityDmg = battleState.boss?.traits?.includes('Daemon') ?? false;

      const defenderStats: DefenderStats = {
        armor: bossArmor,
        maxHealth: battleState.boss?.health ?? 100000,
        traits: battleState.boss?.traits,
        // Daemon block stats
        daemonBlockChance: hasDaemonTraitAbilityDmg ? 0.25 : undefined,
        daemonBlockMaxAmount: hasDaemonTraitAbilityDmg ? (battleState.boss?.damage ?? 0) * 0.5 : undefined,
      };

      // FuelledByFury (Titus): +extraDmg per active ability used in battle
      let fuelledByFuryBonus = 0;
      if (character.passiveAbilities.includes('FuelledByFury')) {
        const fuelledByFuryLevelIndex = character.abilityLevels?.['FuelledByFury'] ?? 54;
        const fuelledByFuryValues = getAbilityValues('FuelledByFury', fuelledByFuryLevelIndex, character.progressionStepIndex);
        if (fuelledByFuryValues) {
          const extraDmgPerAbility = fuelledByFuryValues.extraDmg as number || 0;
          fuelledByFuryBonus = battleState.activeAbilitiesUsedCount * extraDmgPerAbility;
          if (fuelledByFuryBonus > 0) {
            abilityBuffSources.push({
              name: `Fuelled by Fury (+${extraDmgPerAbility} × ${battleState.activeAbilitiesUsedCount})`,
              damageBonus: fuelledByFuryBonus,
            });
            console.log(`[FuelledByFury applied to ability: +${extraDmgPerAbility} × ${battleState.activeAbilitiesUsedCount} = +${fuelledByFuryBonus} dmg]`);
          }
        }
      }

      // Evaluate passive abilities for ability attacks (e.g., Deathwing for PlasmaCannon)
      const abilityPassiveResult = evaluatePassiveAbilities(
        character.passiveAbilities,
        character.abilityLevels || {},
        {
          characterId: character.id,
          progressionStepIndex: character.progressionStepIndex,
          hasMoved: character.hasMoved,
          hasActedThisBattle: character.hasAttackedThisBattle,
          attacksThisTurn: character.attacksThisTurn,
          attackTurnsCount: character.attackTurnsCount,
          hasUsedAbilityThisTurn: character.hasUsedAbilityThisTurn,
          hasQualifiedForLCDamage: character.hasQualifiedForLCDamage,
          currentHealth: character.currentHealth,
          maxHealth: character.calculatedHealth,
          currentTurn: battleState.turn,
          activeAbilitiesUsedCount: battleState.activeAbilitiesUsedCount,
          attackType: abilityAttackType,
          attackCategory: 'ability',
          isFirstSpecialAttackOfTurn: !character.hasUsedFirstSpecialAttackThisTurn,
          trajannIsAdjacentToBoss: isToggleActive(battleState.team.find(c => c.passiveAbilities.includes('LegendaryCommander'))?.abilityToggles['adjacentToBoss']),
          abilityToggles: character.abilityToggles,
          bossTraits: battleState.boss?.traits,
        }
      );

      // Get passive ability damage bonus (e.g., Deathwing)
      let passiveDmgBonus = 0;
      for (const evaluation of abilityPassiveResult.evaluations) {
        if (evaluation.applicable && evaluation.modifiers?.baseDamageBonus) {
          passiveDmgBonus += evaluation.modifiers.baseDamageBonus;
          abilityBuffSources.push({
            name: evaluation.abilityName,
            damageBonus: evaluation.modifiers.baseDamageBonus,
          });
          console.log(`[${evaluation.abilityName} applied to ability: +${evaluation.modifiers.baseDamageBonus} dmg]`);
        }
      }

      // Calculate total damage and hit bonuses (LC + aura + FuelledByFury + passive)
      const totalDmgBonus = lcExtraDmg + auraDmgBonus + fuelledByFuryBonus + passiveDmgBonus;
      const totalHitsBonus = lcExtraHits + auraHitsBonus;

      // Add ability-specific modifiers to buff sources (e.g., Talons of the Emperor scaling)
      if (result.abilityModifiers) {
        const abilityBaseDmgBonus = result.abilityModifiers.baseDamageBonus || 0;
        const abilityBaseDmgMult = result.abilityModifiers.baseDamageMultiplier;
        const abilityExtraHits = result.abilityModifiers.extraHits || 0;

        if (abilityBaseDmgBonus > 0 || abilityBaseDmgMult || abilityExtraHits > 0) {
          abilityBuffSources.push({
            name: result.abilityModifiers.abilityName || abilityName,
            damageBonus: abilityBaseDmgBonus > 0 ? abilityBaseDmgBonus : undefined,
            damageMultiplier: abilityBaseDmgMult,
            extraHits: abilityExtraHits > 0 ? abilityExtraHits : undefined,
          });
        }
      }

      // Add High Ground buff source for display
      if (abilityHighGroundMultiplier > 1) {
        abilityBuffSources.push({
          name: 'High Ground',
          damageMultiplier: abilityHighGroundMultiplier,
        });
      }

      // Add Machine of War buff source for display
      if (abilityWarMachineMultiplier > 1 && battleState.machineOfWar) {
        abilityBuffSources.push({
          name: `Machine of War (+${battleState.machineOfWar.extraDmgPct}%)`,
          damageMultiplier: abilityWarMachineMultiplier,
        });
      }

      // MortisRound: applies HeavyWeapon bonus twice (extra 1.25x on top of trait bonus)
      const mortisRoundHeavyWeaponMultiplier = abilityId === 'MortisRound' &&
        character.traits.includes('HeavyWeapon') &&
        character.abilityToggles['hasNotMoved']
        ? 1.25 : 1;

      // Add MortisRound extra HeavyWeapon buff source for display
      if (mortisRoundHeavyWeaponMultiplier > 1) {
        abilityBuffSources.push({
          name: 'Heavy Weapon (MortisRound x2)',
          damageMultiplier: mortisRoundHeavyWeaponMultiplier,
        });
      }

      // Merge ability-specific crit bonuses (e.g., TacticalPrecision 100% crit when charging)
      const abilityCritChanceBonus = result.abilityModifiers?.critChanceBonus || 0;
      const abilityCritDamageBonus = result.abilityModifiers?.critDamageBonus || 0;

      // Add ability crit bonuses to buff sources for display
      if (abilityCritChanceBonus > 0 || abilityCritDamageBonus > 0) {
        abilityBuffSources.push({
          name: abilityName,
          critChanceBonus: abilityCritChanceBonus > 0 ? abilityCritChanceBonus : undefined,
          critDamageBonus: abilityCritDamageBonus > 0 ? abilityCritDamageBonus : undefined,
        });
      }

      // Supercharge (Sarquael): +pierce ratio bonus for ALL team Plasma attacks this turn
      const singleAbilitySuperchargeBonus = (battleState.superchargePierceBonus && effectiveDamageResult.damageProfile === 'Plasma')
        ? battleState.superchargePierceBonus
        : 0;

      // Add Supercharge buff source for display
      if (singleAbilitySuperchargeBonus > 0) {
        abilityBuffSources.push({
          name: 'Supercharge',
          pierceRatioBonus: singleAbilitySuperchargeBonus,
        });
      }

      // Check if we have any ability modifiers to pass
      const hasModifiers = totalDmgBonus > 0 || totalHitsBonus > 0 || abilityGlobalMultiplier || result.abilityModifiers || poolDamageMultiplier !== 1 || abilityHighGroundMultiplier !== 1 || abilityWarMachineMultiplier !== 1 || mortisRoundHeavyWeaponMultiplier !== 1 || abilityCritChanceBonus > 0 || abilityCritDamageBonus > 0 || singleAbilitySuperchargeBonus > 0;

      // Merge ability-specific modifiers with LC + aura bonuses + pool multipliers + high ground + war machine
      const mergedBaseDmgBonus = totalDmgBonus + (result.abilityModifiers?.baseDamageBonus || 0);
      // Combine all multipliers: pool buff (Daughter of the Abyss) * ability-specific * global multiplier * high ground * war machine * MortisRound extra
      const abilitySpecificMult = result.abilityModifiers?.baseDamageMultiplier || 1;
      const globalMult = abilityGlobalMultiplier || 1;
      const combinedMultiplier = poolDamageMultiplier * abilitySpecificMult * globalMult * abilityHighGroundMultiplier * abilityWarMachineMultiplier * mortisRoundHeavyWeaponMultiplier;
      const mergedBaseDmgMult = combinedMultiplier !== 1 ? combinedMultiplier : undefined;
      const mergedExtraHits = totalHitsBonus + (result.abilityModifiers?.extraHits || 0);

      // Calculate damage using averageDamage (with crit if not ignored)
      // Pass LC + aura bonuses and global multiplier via abilityModifiers for proper source tracking
      const abilityStats: AttackerStats = {
        baseDamage: avgDamagePerHit,
        damageType: effectiveDamageResult.damageProfile,
        hits: baseHits,  // Base hits only, extra hits via abilityModifiers
        // Pre-sum equipment crit values (like normal attacks) - ability bonuses go via abilityModifiers
        critChance: (equipmentStats.critChance || 0) + (equipmentStats.critChanceBonus || 0),
        critDamage: (equipmentStats.critDmg || 0) + (equipmentStats.critDmgBonus || 0),
        critChanceBonus: 0,  // Ability crit bonus passed via abilityModifiers
        critDmgBonus: 0,     // Ability crit damage bonus passed via abilityModifiers
        ignoreCrit,
        traits: character.traits,
        hasMoved: true,
        attackType: abilityAttackType,  // Use ability's attack type for trait evaluation
        hasAttackedThisBattle: character.hasAttackedThisBattle,
        attacksThisTurn: character.attacksThisTurn,
        firstAttackTurn: character.firstAttackTurn,
        currentTurn: battleState.turn,
        abilityToggles: character.abilityToggles,
        fightingRetreatActive: character.fightingRetreatActive,
        // Pass bonuses via abilityModifiers for proper source tracking in breakdown
        abilityModifiers: hasModifiers ? {
          baseDamageBonus: mergedBaseDmgBonus > 0 ? mergedBaseDmgBonus : undefined,
          baseDamageMultiplier: mergedBaseDmgMult,
          extraHits: mergedExtraHits > 0 ? mergedExtraHits : undefined,
          critChanceBonus: abilityCritChanceBonus > 0 ? abilityCritChanceBonus : undefined,
          critDamageBonus: abilityCritDamageBonus > 0 ? abilityCritDamageBonus : undefined,
          pierceRatioBonus: singleAbilitySuperchargeBonus > 0 ? singleAbilitySuperchargeBonus : undefined,
          buffSources: abilityBuffSources,
        } : undefined,
      };
      const abilityCalc = new DamageCalculator(true);
      const abilityResult = abilityCalc.calculate(abilityStats, defenderStats);

      abilityCalc.printLogs();
      console.log('\n--- SUMMARY ---');
      console.log(`Damage: ${abilityResult.damage.toLocaleString()}`);
      console.groupEnd();

      // Prophet of Gork and Mork: Apply damage reduction to single-component ability
      let singleAbilityProphetReduction = 1;
      if (prophetAttackCounter >= prophetThreshold && prophetReductionPct > 0) {
        singleAbilityProphetReduction = prophetMultiplier;
        console.log(`[Prophet of Gork and Mork: -${prophetReductionPct}% damage on ${abilityName} (attack ${prophetAttackCounter + 1})]`);
      }
      totalDamage = Math.round(abilityResult.damage * singleAbilityProphetReduction);
      prophetAttackCounter++;

      // Track max perHitDamage for Laviscus outrage
      maxPerHitDamage = Math.max(maxPerHitDamage, abilityResult.perHitDamage);

      // Build breakdown for display
      const abilityBreakdown: DamageBreakdown = {
        damage: totalDamage,
        perHitDamage: singleAbilityProphetReduction < 1 ? Math.round(abilityResult.perHitDamage * singleAbilityProphetReduction) : abilityResult.perHitDamage,
        hits: abilityResult.totalHits,
        baseDamage: abilityResult.baseDamage,
        flatModifiers: abilityResult.flatModifiers,
        flatModifierSources: abilityResult.flatModifierSources,
        critBonus: abilityResult.critBonus,
        critChanceSources: abilityResult.critChanceSources,
        critDamageSources: abilityResult.critDamageSources,
        extraHits: abilityResult.extraHits,
        extraHitsSources: abilityResult.extraHitsSources,
        damVarMod: abilityResult.damVarMod,
        targetArmor: bossArmor,
        afterArmor: abilityResult.afterArmor,
        pierceRatio: abilityResult.pierceRatio,
        pierceRatioBonus: abilityResult.pierceRatioBonus,
        pierceRatioBonusSources: abilityResult.pierceRatioBonusSources,
        effectivePierceRatio: abilityResult.effectivePierceRatio,
        pierceFloor: abilityResult.pierceFloor,
        afterArmorPierce: abilityResult.afterArmorPierce,
        globalMultiplier: abilityResult.globalMultiplier,
        globalMultiplierSources: abilityResult.globalMultiplierSources,
        baseCritChance: abilityResult.baseCritChance,
        baseCritDamage: abilityResult.baseCritDamage,
        critChanceBonus: abilityResult.critChanceTotalBonus,
        critDmgBonus: abilityResult.critDamageTotalBonus,
        critChance: abilityResult.effectiveCritChance * 100,
        critDamage: abilityResult.effectiveCritDamage,
        traitModifiers: abilityResult.traitModifiers,
        traitMultiplier: abilityResult.traitMultiplier,
      };

      // Add Prophet of Gork and Mork to ability breakdown if active
      if (singleAbilityProphetReduction < 1) {
        abilityBreakdown.globalMultiplier = (abilityBreakdown.globalMultiplier || 1) * singleAbilityProphetReduction;
        abilityBreakdown.globalMultiplierSources = [
          ...(abilityBreakdown.globalMultiplierSources || []),
          { name: 'Prophet of Gork and Mork', damageMultiplier: singleAbilityProphetReduction }
        ];
      }

      // Add as a follow-up attack log (displays with purple shading)
      followUpAttackLogs.push({
        abilityName,
        damage: totalDamage,
        hits: abilityResult.totalHits,
        damageType: effectiveDamageResult.damageProfile,
        breakdown: abilityBreakdown,
      });

      // AstartesBanner: +1 hit after single-component melee ability attack (same stats, capped at maxDmg)
      if (abilityAttackType === 'melee') {
        const thoread = battleState.team.find(c => c.passiveAbilities.includes('AstartesBanner'));
        if (thoread && thoread.id !== character.id) {
          const bannerToggleId = `AstartesBanner_${thoread.id}_range2`;
          if (isToggleActive(character.abilityToggles[bannerToggleId])) {
            const bannerLevelIndex = thoread.abilityLevels?.['AstartesBanner'] ?? 54;
            const bannerValues = getAbilityValues('AstartesBanner', bannerLevelIndex, thoread.progressionStepIndex);
            if (bannerValues) {
              const singleBannerMaxDmg = bannerValues.maxDmg as number || 0;
              const bannerAbilityStats: AttackerStats = {
                ...abilityStats,
                hits: 1,
                damageCaps: { ...(abilityStats.damageCaps || {}), finalDamageCap: singleBannerMaxDmg },
                critChainOffset: abilityResult.totalHits,
                abilityModifiers: abilityStats.abilityModifiers ? {
                  ...abilityStats.abilityModifiers,
                  extraHits: undefined,
                } : undefined,
              };
              const bannerAbilityCalc = new DamageCalculator(true);
              const bannerAbilityResult = bannerAbilityCalc.calculate(bannerAbilityStats, defenderStats);

              // Prophet of Gork and Mork: Apply reduction to banner (shares crit chain, no counter increment)
              let bannerAbilityProphetReduction = 1;
              if (prophetAttackCounter >= prophetThreshold && prophetReductionPct > 0) {
                bannerAbilityProphetReduction = prophetMultiplier;
              }
              const adjustedBannerAbilityDamage = Math.round(bannerAbilityResult.damage * bannerAbilityProphetReduction);

              totalDamage += adjustedBannerAbilityDamage;
              maxPerHitDamage = Math.max(maxPerHitDamage, bannerAbilityResult.perHitDamage);

              // Build breakdown
              const bannerAbilityBreakdown: DamageBreakdown = {
                damage: adjustedBannerAbilityDamage,
                perHitDamage: bannerAbilityProphetReduction < 1 ? Math.round(bannerAbilityResult.perHitDamage * bannerAbilityProphetReduction) : bannerAbilityResult.perHitDamage,
                hits: bannerAbilityResult.totalHits,
                baseDamage: bannerAbilityResult.baseDamage,
                flatModifiers: bannerAbilityResult.flatModifiers,
                flatModifierSources: bannerAbilityResult.flatModifierSources,
                critBonus: bannerAbilityResult.critBonus,
                critChanceSources: bannerAbilityResult.critChanceSources,
                critDamageSources: bannerAbilityResult.critDamageSources,
                extraHits: bannerAbilityResult.extraHits,
                extraHitsSources: bannerAbilityResult.extraHitsSources,
                damVarMod: bannerAbilityResult.damVarMod,
                targetArmor: bossArmor,
                afterArmor: bannerAbilityResult.afterArmor,
                pierceRatio: bannerAbilityResult.pierceRatio,
                pierceRatioBonus: bannerAbilityResult.pierceRatioBonus,
                pierceRatioBonusSources: bannerAbilityResult.pierceRatioBonusSources,
                effectivePierceRatio: bannerAbilityResult.effectivePierceRatio,
                pierceFloor: bannerAbilityResult.pierceFloor,
                afterArmorPierce: bannerAbilityResult.afterArmorPierce,
                globalMultiplier: bannerAbilityResult.globalMultiplier,
                globalMultiplierSources: bannerAbilityResult.globalMultiplierSources,
                baseCritChance: bannerAbilityResult.baseCritChance,
                baseCritDamage: bannerAbilityResult.baseCritDamage,
                critChanceBonus: bannerAbilityResult.critChanceTotalBonus,
                critDmgBonus: bannerAbilityResult.critDamageTotalBonus,
                critChance: bannerAbilityResult.effectiveCritChance * 100,
                critDamage: bannerAbilityResult.effectiveCritDamage,
                traitModifiers: bannerAbilityResult.traitModifiers,
                traitMultiplier: bannerAbilityResult.traitMultiplier,
                expectedBlocks: bannerAbilityResult.expectedBlocks,
                blockReductionPerHit: bannerAbilityResult.blockReductionPerHit,
                totalBlockReduction: bannerAbilityResult.totalBlockReduction,
              };

              // Add Prophet of Gork and Mork to banner breakdown if active
              if (bannerAbilityProphetReduction < 1) {
                bannerAbilityBreakdown.globalMultiplier = (bannerAbilityBreakdown.globalMultiplier || 1) * bannerAbilityProphetReduction;
                bannerAbilityBreakdown.globalMultiplierSources = [
                  ...(bannerAbilityBreakdown.globalMultiplierSources || []),
                  { name: 'Prophet of Gork and Mork', damageMultiplier: bannerAbilityProphetReduction }
                ];
              }

              followUpAttackLogs.push({
                abilityName: 'Astartes Banner',
                damage: adjustedBannerAbilityDamage,
                hits: bannerAbilityResult.totalHits,
                damageType: effectiveDamageResult.damageProfile,
                breakdown: bannerAbilityBreakdown,
              });

              console.log(`  Banner hit after ${abilityName}: ${bannerAbilityResult.damage.toLocaleString()}`);
            }
          }
        }
      }

      // No main damageBreakdown - shown via followUpAttackLogs with purple shading
      damageBreakdown = undefined;
    }

    // Update totals if damage was dealt
    if (totalDamage > 0) {
      // Check if character is adjacent to boss for LC qualification
      const isAdjacentToBoss = isToggleActive(character.abilityToggles['adjacentToBoss']);

      // Get applicable buffs that were used (for consumption)
      // Single-component abilities use singleAbilityApplicableBuffs (if defined)
      // Multi-component abilities use componentApplicableBuffs (collected per component)
      // For simplicity, recalculate here - buffs with consumeOnUse are removed after use
      const abilityBuffContext: BuffEvaluationContext = {
        attacker: character,
        attackType: 'melee',
        attackCategory: 'ability',
        target: battleState.boss,
        battleState,
      };
      const abilityApplicableBuffs = getApplicableBuffs(battleState.buffPool, abilityBuffContext);
      const abilityBuffsToConsume = abilityApplicableBuffs
        .filter(buff => buff.consumeOnUse)
        .map(buff => buff.id);

      // If this damage ability also provides a buff (like Euphoric Strikes), prepare to add it
      const buffTemplate = result.buffResult ? getBuffTemplate(abilityId) : null;
      const abilityValuesForBuff = result.buffResult ? (getAbilityValues(abilityId, levelIndex, character.progressionStepIndex) || {}) : null;

      // If this damage ability also summons units (like LeadingTheCharge), prepare the summon
      let damageAbilitySummon: import('../types').BattleSummon | undefined;
      if (result.summonResult) {
        const summonData = getSummonUnitData(result.summonResult.unitId);
        if (summonData) {
          const summonCount = result.summonResult.count || 1;
          const meleeWeapon = summonData.weapons.find(w => !w.Range);
          const rangedWeapon = summonData.weapons.find(w => w.Range);
          damageAbilitySummon = {
            id: `summon_${result.summonResult.unitId}_${Date.now()}`,
            unitId: result.summonResult.unitId,
            name: summonData.name,
            sourceCharacterId: characterId,
            sourceAbilityId: abilityId,
            hp: result.summonResult.hp,
            damage: result.summonResult.damage,
            armor: result.summonResult.armor,
            meleeHits: meleeWeapon?.hits || 2,
            meleeDamageType: (meleeWeapon?.DamageProfile as import('../types').DamageType) || 'Physical',
            rangedHits: rangedWeapon?.hits,
            rangedDamageType: rangedWeapon?.DamageProfile as import('../types').DamageType | undefined,
            rangedRange: rangedWeapon?.Range,
            traits: summonData.traits || [],
            count: summonCount,
            createdAtTurn: battleState.turn,
            iconUrl: getSummonIconUrl(result.summonResult.unitId),
            activeAbilities: summonData.activeAbilities,
            totalDamageDealt: 0,
          };
          console.log(`[Summon from damage ability: ${summonCount}x ${summonData.name}]`);
        }
      }

      // Note: Outrage tracking moved to AFTER follow-up attacks so maxPerHitDamage includes follow-ups
      // isAbilityUserChaos is defined in outer scope for this purpose

      set((state) => {
        let newBuffPool = state.battleState!.buffPool;

        // Remove consumed buffs
        if (abilityBuffsToConsume.length > 0) {
          newBuffPool = newBuffPool.filter(b => !abilityBuffsToConsume.includes(b.id));
        }

        // Add new buff from this ability if it has one (like Euphoric Strikes)
        if (buffTemplate && abilityValuesForBuff) {
          newBuffPool = addBuffToPool(
            newBuffPool,
            buffTemplate,
            character,
            abilityValuesForBuff as Record<string, number>,
            state.battleState!.turn
          );
          console.log(`[Buff added from damage ability: ${abilityName}]`, buffTemplate.getEffects(abilityValuesForBuff as Record<string, number>));
        }

        return {
          battleState: state.battleState
            ? {
                ...state.battleState,
                totalDamageDealt: state.battleState.totalDamageDealt + totalDamage,
                buffPool: newBuffPool,
                // Add summon from damage ability if present
                summons: damageAbilitySummon
                  ? [...state.battleState.summons, damageAbilitySummon]
                  : state.battleState.summons,
                activeAbilitiesUsedCount: state.battleState.activeAbilitiesUsedCount + 1,
                // Update Prophet of Gork and Mork attack counter
                bossAttacksReceivedThisTurn: prophetAttackCounter,
                // Supercharge: Store pierce bonus for ALL team Plasma attacks rest of turn
                ...(result.superchargePierceBonus ? { superchargePierceBonus: result.superchargePierceBonus } : {}),
                // HeraldOfTheApocalypse: Store +extraDmg debuff on boss for next attack by any team member
                ...(result.bossDebuff?.extraDmg ? { heraldExtraDmgDebuff: result.bossDebuff.extraDmg } : {}),
                team: state.battleState.team.map((char) => {
                  if (char.id === characterId) {
                    // Update ability user
                    // Note: Laviscus outrage does NOT reset on ability use, only on normal attack

                    // Check for CordClaw ability - stores follow-up attack buff
                    const isCordClaw = abilityId === 'CordClaw';
                    const cordClawValues = isCordClaw ? (getAbilityValues('CordClaw', levelIndex, character.progressionStepIndex) || {}) : null;

                    return {
                      ...char,
                      totalDamageDealt: char.totalDamageDealt + totalDamage,
                      hasUsedAbilityThisTurn: true,
                      // Damage abilities count as attacks for LegacyOfCombat tracking
                      hasAttackedThisBattle: true,
                      attacksThisTurn: char.attacksThisTurn + 1,
                      totalAttacksThisBattle: char.totalAttacksThisBattle + 1,  // For FirstAmongTraitors scaling
                      // Set firstAttackTurn only on the first attack (when it's null)
                      firstAttackTurn: char.firstAttackTurn ?? state.battleState!.turn,
                      // LC: Damage/special attack abilities qualify AFTER the first special attack
                      hasQualifiedForLCDamage: isAdjacentToBoss,
                      // Mark first special attack used if LC +2 hits was applied
                      hasUsedFirstSpecialAttackThisTurn: char.hasUsedFirstSpecialAttackThisTurn || lcHitsAppliedToAbility,
                      // CordClaw: Store follow-up attack buff (2x DirectDamage for 2 turns)
                      ...(isCordClaw ? {
                        cordClawActive: true,
                        cordClawMinDmg: cordClawValues!.minDmg_2 as number || 0,
                        cordClawMaxDmg: cordClawValues!.maxDmg_2 as number || 0,
                        cordClawHits: cordClawValues!.nrOfHits_2 as number || 2,
                        cordClawTurnsRemaining: 2,  // This turn + next turn
                      } : {}),
                    };
                  }

                  // Note: Outrage tracking for Laviscus moved to AFTER follow-up attacks

                  return char;
                }),
              }
            : null,
        };
      });
    } else if (result.buffResult) {
      // Buff ability - add buff to pool or character activeBuffs
      const buffTemplate = getBuffTemplate(abilityId);

      // Check if character is adjacent to boss for LC qualification
      const isAdjacentToBoss = isToggleActive(character.abilityToggles['adjacentToBoss']);

      // Special handling for Drachnyen (Abaddon)
      if (abilityId === 'Drachnyen') {
        const abilityValues = getAbilityValues(abilityId, levelIndex, character.progressionStepIndex) || {};
        const newHp = abilityValues.hp as number || character.currentHealth;
        const minDmg = abilityValues.minDmg as number || 0;
        const maxDmg = abilityValues.maxDmg as number || 0;
        const hits = abilityValues.nrOfHits as number || 3;

        set((state) => ({
          battleState: state.battleState
            ? {
                ...state.battleState,
                activeAbilitiesUsedCount: state.battleState.activeAbilitiesUsedCount + 1,
                team: state.battleState.team.map((char) =>
                  char.id === characterId
                    ? {
                        ...char,
                        currentHealth: Math.min(newHp, char.calculatedHealth),  // Set HP (not add)
                        hasUsedAbilityThisTurn: true,
                        hasQualifiedForLCDamage: isAdjacentToBoss,
                        // Enable Drachnyen follow-up attacks
                        drachnyenActive: true,
                        drachnyenMinDmg: minDmg,
                        drachnyenMaxDmg: maxDmg,
                        drachnyenHits: hits,
                      }
                    : char
                ),
              }
            : null,
        }));
        console.log(`[Drachnyen activated: HP → ${newHp}, follow-up ${hits}x Piercing (${minDmg}-${maxDmg})]`);

        // Add to appliedBuffs for BattleLog display
        appliedBuffs.push({
          name: abilityName,
          effect: `HP → ${newHp}, +${hits}x Piercing follow-up`,
        });
      } else if (abilityId === 'FightingRetreat') {
        // Special handling for Fighting Retreat (Darkstrider)
        // 1. Auto-enable Markerlight on boss
        // 2. Reset Darkstrider's hasMoved to allow re-movement
        // 3. Set fightingRetreatActive on Darkstrider AND T'au teammates adjacent to Darkstrider

        // Find the toggle ID for "Adjacent to Darkstrider"
        const adjacentToggleId = `StructuralAnalyser_${characterId}_adjacent`;

        set((state) => ({
          battleState: state.battleState
            ? {
                ...state.battleState,
                // Auto-enable Markerlight on boss
                bossHasMarkerlight: true,
                activeAbilitiesUsedCount: state.battleState.activeAbilitiesUsedCount + 1,
                team: state.battleState.team.map((char) => {
                  if (char.id === characterId) {
                    // Darkstrider himself
                    return {
                      ...char,
                      hasUsedAbilityThisTurn: true,
                      hasQualifiedForLCDamage: isAdjacentToBoss,
                      // Always reset hasMoved to allow re-movement
                      hasMoved: false,
                      // Set fightingRetreatActive for RangedSpecialist override (persists until end of turn)
                      fightingRetreatActive: true,
                    };
                  } else {
                    // Check if this T'au teammate is adjacent to Darkstrider
                    const isAdjacentToDarkstrider = char.abilityToggles?.[adjacentToggleId] ?? false;
                    const isTauEmpire = char.faction === "T'au Empire" || char.faction === 'Tau';

                    if (isTauEmpire && isAdjacentToDarkstrider) {
                      return {
                        ...char,
                        fightingRetreatActive: true,
                      };
                    }
                    return char;
                  }
                }),
              }
            : null,
        }));
        console.log('[Fighting Retreat activated: Markerlight → ON, Movement reset, RangedSpecialist override active for Darkstrider and adjacent T\'au allies]');

        // Add to appliedBuffs for BattleLog display
        appliedBuffs.push({
          name: abilityName,
          effect: 'Markerlight, Movement reset, RangedSpecialist override',
        });
      } else if (abilityId === 'DoctrinaImperatives') {
        // Special handling for Doctrina Imperatives (Tan Gi'da)
        // Toggles between Protector (+armor) and Conqueror stances
        // Only first use counts for LC qualification
        const abilityValues = getAbilityValues(abilityId, levelIndex, character.progressionStepIndex) || {};
        const extraArmor = abilityValues.extraArmor as number || 0;

        // Determine new stance based on current stance
        const currentStance = character.doctrinaImperativeStance;
        let newStance: 'protector' | 'conqueror';
        if (currentStance === null || currentStance === undefined || currentStance === 'conqueror') {
          newStance = 'protector';
        } else {
          newStance = 'conqueror';
        }

        // Check if this is the first use this battle (for LC qualification)
        const isFirstUse = !character.hasUsedDoctrinaThisBattle;

        set((state) => ({
          battleState: state.battleState
            ? {
                ...state.battleState,
                activeAbilitiesUsedCount: isFirstUse
                  ? state.battleState.activeAbilitiesUsedCount + 1
                  : state.battleState.activeAbilitiesUsedCount,
                team: state.battleState.team.map((char) =>
                  char.id === characterId
                    ? {
                        ...char,
                        hasUsedAbilityThisTurn: true,
                        // LC: Only first use counts for qualification
                        hasQualifiedForLCDamage: isFirstUse ? isAdjacentToBoss : char.hasQualifiedForLCDamage,
                        // Track stance and first use
                        doctrinaImperativeStance: newStance,
                        hasUsedDoctrinaThisBattle: true,
                        // Apply armor buff when switching to Protector
                        activeBuffs: newStance === 'protector'
                          ? [
                              ...char.activeBuffs.filter(b => b.abilityName !== 'Doctrina Imperatives'),
                              { abilityName: 'Doctrina Imperatives', armorBonus: extraArmor },
                            ]
                          : char.activeBuffs.filter(b => b.abilityName !== 'Doctrina Imperatives'),
                      }
                    : char
                ),
              }
            : null,
        }));

        const stanceName = newStance === 'protector' ? 'Protector' : 'Conqueror';
        console.log(`[Doctrina Imperatives: switched to ${stanceName}${newStance === 'protector' ? ` (+${extraArmor} armor)` : ''}]`);

        // Add to appliedBuffs for BattleLog display
        appliedBuffs.push({
          name: abilityName,
          effect: newStance === 'protector' ? `${stanceName}: +${extraArmor} Armor` : `${stanceName}: No combat effect`,
        });
      } else if (abilityId === 'CalibaniteGreatsword') {
        // Special handling for Calibanite Greatsword (Forcas)
        // Toggles between Strike (enables Overwatch) and Sweep stances
        // Only first use counts for LC qualification
        // Can be used once per turn

        // Determine new stance based on current stance (default is Strike)
        const currentStance = character.calibaniteGreatswordStance ?? 'strike';
        const newStance: 'strike' | 'sweep' = currentStance === 'strike' ? 'sweep' : 'strike';

        // Check if this is the first use this battle (for LC qualification)
        const isFirstUse = !character.hasUsedCalibaniteThisBattle;

        set((state) => ({
          battleState: state.battleState
            ? {
                ...state.battleState,
                activeAbilitiesUsedCount: isFirstUse
                  ? state.battleState.activeAbilitiesUsedCount + 1
                  : state.battleState.activeAbilitiesUsedCount,
                team: state.battleState.team.map((char) =>
                  char.id === characterId
                    ? {
                        ...char,
                        hasUsedAbilityThisTurn: true,
                        // LC: Only first use counts for qualification
                        hasQualifiedForLCDamage: isFirstUse ? isAdjacentToBoss : char.hasQualifiedForLCDamage,
                        // Track stance and usage
                        calibaniteGreatswordStance: newStance,
                        hasUsedCalibaniteThisTurn: true,
                        hasUsedCalibaniteThisBattle: true,
                      }
                    : char
                ),
              }
            : null,
        }));

        const stanceDisplayName = newStance === 'strike' ? 'Strike Stance' : 'Sweep Stance';
        console.log(`[Calibanite Greatsword: switched to ${stanceDisplayName}${newStance === 'strike' ? ' (Overwatch enabled)' : ''}]`);

        // Add to appliedBuffs for BattleLog display
        appliedBuffs.push({
          name: abilityName,
          effect: newStance === 'strike' ? `${stanceDisplayName}: Overwatch enabled` : `${stanceDisplayName}: No combat effect`,
        });
      } else if (buffTemplate) {
        // Use new buff pool system
        const abilityValues = getAbilityValues(abilityId, levelIndex, character.progressionStepIndex) || {};
        set((state) => ({
          battleState: state.battleState
            ? {
                ...state.battleState,
                buffPool: addBuffToPool(
                  state.battleState.buffPool,
                  buffTemplate,
                  character,
                  abilityValues as Record<string, number>,
                  state.battleState.turn
                ),
                activeAbilitiesUsedCount: state.battleState.activeAbilitiesUsedCount + 1,
                team: state.battleState.team.map((char) =>
                  char.id === characterId
                    ? {
                        ...char,
                        hasUsedAbilityThisTurn: true,
                        // LC: Buff abilities qualify IMMEDIATELY
                        hasQualifiedForLCDamage: isAdjacentToBoss,
                      }
                    : char
                ),
              }
            : null,
        }));
        console.log(`[Buff added to pool: ${abilityName}]`, buffTemplate.getEffects(abilityValues as Record<string, number>));

        // Handle summonResult if present (for abilities like Waaagh! that have both buff and summon)
        if (result.summonResult) {
          const summonData = getSummonUnitData(result.summonResult.unitId);
          if (summonData) {
            const summonCount = result.summonResult.count || 1;
            const meleeWeapon = summonData.weapons.find(w => !w.Range);
            const rangedWeapon = summonData.weapons.find(w => w.Range);

            // Create single summon with count property
            const newSummon: import('../types').BattleSummon = {
              id: `summon_${result.summonResult.unitId}_${Date.now()}`,
              unitId: result.summonResult.unitId,
              name: summonData.name,
              sourceCharacterId: characterId,
              sourceAbilityId: abilityId,
              hp: result.summonResult.hp,
              damage: result.summonResult.damage,
              armor: result.summonResult.armor,
              meleeHits: meleeWeapon?.hits || 2,
              meleeDamageType: (meleeWeapon?.DamageProfile as import('../types').DamageType) || 'Physical',
              rangedHits: rangedWeapon?.hits,
              rangedDamageType: rangedWeapon?.DamageProfile as import('../types').DamageType | undefined,
              rangedRange: rangedWeapon?.Range,
              traits: summonData.traits || [],
              count: summonCount,
              createdAtTurn: battleState.turn,
              iconUrl: getSummonIconUrl(result.summonResult.unitId),
              activeAbilities: summonData.activeAbilities,
              totalDamageDealt: 0,
            };

            set((state) => ({
              battleState: state.battleState
                ? {
                    ...state.battleState,
                    summons: [...state.battleState.summons, newSummon],
                  }
                : null,
            }));

            console.log(`[Summon created: ${summonCount}x ${summonData.name}]`);
          }
        }

        // Add to appliedBuffs for BattleLog display
        const buffEffects = buffTemplate.getEffects(abilityValues as Record<string, number>);
        const effectsText: string[] = [];
        if (buffEffects.baseDamageBonus) effectsText.push(`+${buffEffects.baseDamageBonus} Dmg`);
        if (buffEffects.baseDamageMultiplier && buffEffects.baseDamageMultiplier !== 1) {
          const pct = Math.round((buffEffects.baseDamageMultiplier - 1) * 100);
          effectsText.push(`${pct >= 0 ? '+' : ''}${pct}% Dmg`);
        }
        if (buffEffects.critChanceBonus) effectsText.push(`+${buffEffects.critChanceBonus}% Crit`);
        if (buffEffects.extraHits) effectsText.push(`+${buffEffects.extraHits} Hits`);
        if (buffEffects.armorIgnored) effectsText.push(`-${buffEffects.armorIgnored} Armor`);
        if (effectsText.length > 0) {
          appliedBuffs.push({
            name: abilityName,
            effect: effectsText.join(', '),
          });
        }
      } else {
        // Legacy: store buff on character activeBuffs
        set((state) => ({
          battleState: state.battleState
            ? {
                ...state.battleState,
                activeAbilitiesUsedCount: state.battleState.activeAbilitiesUsedCount + 1,
                team: state.battleState.team.map((char) =>
                  char.id === characterId
                    ? {
                        ...char,
                        hasUsedAbilityThisTurn: true,
                        // LC: Buff abilities qualify IMMEDIATELY (same as pool-based buffs)
                        hasQualifiedForLCDamage: isAdjacentToBoss,
                        activeBuffs: [...char.activeBuffs, { ...result.buffResult!.effect, abilityName }],
                      }
                    : char
                ),
              }
            : null,
        }));
        console.log(`[Buff applied (legacy): ${abilityName}]`, result.buffResult.effect);

        // Add to appliedBuffs for BattleLog display
        const legacyEffect = result.buffResult.effect;
        const legacyEffectsText: string[] = [];
        if (legacyEffect.baseDamageBonus) legacyEffectsText.push(`+${legacyEffect.baseDamageBonus} Dmg`);
        if (legacyEffect.baseDamageMultiplier && legacyEffect.baseDamageMultiplier !== 1) {
          const pct = Math.round((legacyEffect.baseDamageMultiplier - 1) * 100);
          legacyEffectsText.push(`${pct >= 0 ? '+' : ''}${pct}% Dmg`);
        }
        if (legacyEffect.critChanceBonus) legacyEffectsText.push(`+${legacyEffect.critChanceBonus}% Crit`);
        if (legacyEffect.extraHits) legacyEffectsText.push(`+${legacyEffect.extraHits} Hits`);
        if (legacyEffectsText.length > 0) {
          appliedBuffs.push({
            name: abilityName,
            effect: legacyEffectsText.join(', '),
          });
        }
      }
    } else if (result.summonResult) {
      // Summon ability (like EarlyWarningOverride) - create summons and handle special effects
      // Check if character is adjacent to boss for LC qualification
      const isAdjacentToBoss = isToggleActive(character.abilityToggles['adjacentToBoss']);

      // Create summons
      const summonData = getSummonUnitData(result.summonResult.unitId);
      if (summonData) {
        let summonCount = result.summonResult.count || 1;

        // SupremeCommander (Creed): summon 3 Guardsmen if Kell count is 1, otherwise 2
        if (abilityId === 'SupremeCommander') {
          const kellSummon = battleState.summons.find(s => s.unitId === 'astraSmnKell');
          if (kellSummon && kellSummon.count >= 1) {
            summonCount = 3;
            console.log(`[SupremeCommander: Kell present (count ${kellSummon.count}), summoning 3 Guardsmen]`);
          }
        }
        const meleeWeapon = summonData.weapons.find(w => !w.Range);
        const rangedWeapon = summonData.weapons.find(w => w.Range);

        const newSummon: import('../types').BattleSummon = {
          id: `summon_${result.summonResult.unitId}_${Date.now()}`,
          unitId: result.summonResult.unitId,
          name: summonData.name,
          sourceCharacterId: characterId,
          sourceAbilityId: abilityId,
          hp: result.summonResult.hp,
          damage: result.summonResult.damage,
          armor: result.summonResult.armor,
          meleeHits: meleeWeapon?.hits || 2,
          meleeDamageType: (meleeWeapon?.DamageProfile as import('../types').DamageType) || 'Physical',
          rangedHits: rangedWeapon?.hits,
          rangedDamageType: rangedWeapon?.DamageProfile as import('../types').DamageType | undefined,
          rangedRange: rangedWeapon?.Range,
          traits: summonData.traits || [],
          count: summonCount,
          createdAtTurn: battleState.turn,
          iconUrl: getSummonIconUrl(result.summonResult.unitId),
          activeAbilities: summonData.activeAbilities,
          totalDamageDealt: 0,
        };

        set((state) => ({
          battleState: state.battleState
            ? {
                ...state.battleState,
                summons: [...state.battleState.summons, newSummon],
              }
            : null,
        }));

        console.log(`[Summon created: ${summonCount}x ${summonData.name}]`);
      }

      // Handle Overwatch activation (Re'vas Early Warning Override)
      const overwatchExtraDmg = result.overwatchResult?.extraDmg || 0;

      set((state) => ({
        battleState: state.battleState
          ? {
              ...state.battleState,
              activeAbilitiesUsedCount: state.battleState.activeAbilitiesUsedCount + 1,
              team: state.battleState.team.map((char) =>
                char.id === characterId
                  ? {
                      ...char,
                      hasUsedAbilityThisTurn: true,
                      hasQualifiedForLCDamage: isAdjacentToBoss,
                      // Activate Overwatch for Re'vas
                      ...(overwatchExtraDmg > 0 ? {
                        overwatchActive: true,
                        overwatchExtraDmg: overwatchExtraDmg,
                        hasUsedOverwatchThisTurn: false,
                      } : {}),
                    }
                  : char
              ),
            }
          : null,
      }));

      if (overwatchExtraDmg > 0) {
        console.log(`[Overwatch activated: +${overwatchExtraDmg} damage]`);
      }
    } else {
      // Other non-damage ability (e.g., healing without buff, summon) - mark ability as used
      // Check if character is adjacent to boss for LC qualification
      const isAdjacentToBoss = isToggleActive(character.abilityToggles['adjacentToBoss']);

      // Check for Overwatch activation (e.g., Early Warning Override summon ability)
      const overwatchExtraDmg = result.overwatchResult?.extraDmg || 0;

      set((state) => ({
        battleState: state.battleState
          ? {
              ...state.battleState,
              activeAbilitiesUsedCount: state.battleState.activeAbilitiesUsedCount + 1,
              team: state.battleState.team.map((char) =>
                char.id === characterId
                  ? {
                      ...char,
                      hasUsedAbilityThisTurn: true,
                      // LC: Any active ability qualifies IMMEDIATELY
                      hasQualifiedForLCDamage: isAdjacentToBoss,
                      // Activate Overwatch for abilities like Early Warning Override
                      ...(overwatchExtraDmg > 0 ? {
                        overwatchActive: true,
                        overwatchExtraDmg: overwatchExtraDmg,
                        hasUsedOverwatchThisTurn: false,
                      } : {}),
                    }
                  : char
              ),
            }
          : null,
      }));

      if (overwatchExtraDmg > 0) {
        console.log(`[Overwatch activated: +${overwatchExtraDmg} damage]`);
      }
    }

    // LC buffs are now automatically tracked via hasQualifiedForLCDamage
    // The character state was updated above when damage was dealt or buff was applied
    // Re-fetch character to get the updated state with LC qualification
    const refreshedState = get().battleState;
    const updatedCharacter = refreshedState?.team.find((c) => c.id === characterId) || character;

    // Handle follow-up attacks from passives (like LegacyOfCombat)
    // Build context for passive evaluation
    // Note: For LC after MI, attackTurnsCount should include the current turn since MI was just used
    // MI itself uses the attackTurnsCount from before the current turn (passed via abilityContext earlier)
    // LC should see attackTurnsCount + 1 (including current turn)
    const passiveContext = {
      characterId: updatedCharacter.id,
      progressionStepIndex: updatedCharacter.progressionStepIndex,
      hasMoved: updatedCharacter.hasMoved,
      hasActedThisBattle: true,  // Ability was just used (counts as attack)
      attacksThisTurn: updatedCharacter.attacksThisTurn + 1,  // Just attacked
      attackTurnsCount: updatedCharacter.attackTurnsCount + 1,  // Include current turn (ability counts as attack)
      hasUsedAbilityThisTurn: true,  // Ability was just used
      hasQualifiedForLCDamage: updatedCharacter.hasQualifiedForLCDamage,  // LC damage qualification
      currentHealth: updatedCharacter.currentHealth,
      maxHealth: updatedCharacter.calculatedHealth,
      currentTurn: battleState.turn,
      attackType: 'ability' as const,
      attackCategory: 'ability' as const,  // LC attack category
      isFirstSpecialAttackOfTurn: !updatedCharacter.hasUsedFirstSpecialAttackThisTurn,  // Per-character LC +2 hits
      trajannIsAdjacentToBoss: isToggleActive(trajann?.abilityToggles['adjacentToBoss']),  // LC Trajann check
      darkAngelsAdjacentToBoss,  // For FearedInterrogator
      abilityToggles: updatedCharacter.abilityToggles,
      bossTraits: battleState.boss?.traits,
      bossDebuffs: battleState.bossHasMarkerlight ? ['Markerlight'] : [],
    };

    // Evaluate passive abilities for follow-up attacks
    const passiveResult = evaluatePassiveAbilities(
      character.passiveAbilities,
      character.abilityLevels || {},
      passiveContext
    );

    // Collect follow-ups from passive abilities and teammate auras
    const allAbilityFollowUps = [...passiveResult.followUpAttacks];

    // Check for teammate aura follow-ups (ExplosiveMaladies, InfernalPacts)
    for (const teammate of battleState.team) {
      if (teammate.id === character.id) continue;

      // ExplosiveMaladies (Pestillian): +1x Blast follow-up on ranged (Chaos: also melee)
      if (teammate.passiveAbilities.includes('ExplosiveMaladies')) {
        const toggleId = `ExplosiveMaladies_${teammate.id}_adjacent`;
        if (isToggleActive(character.abilityToggles[toggleId])) {
          const levelIndex = teammate.abilityLevels?.['ExplosiveMaladies'] ?? 54;
          const values = getAbilityValues('ExplosiveMaladies', levelIndex, teammate.progressionStepIndex);
          if (values) {
            const extraDmg = values.extraDmg as number || 0;
            const isChaos = character.alliance === 'Chaos';
            // Ability attacks: only trigger for Chaos (melee-equivalent)
            if (isChaos) {
              allAbilityFollowUps.push({
                abilityId: 'ExplosiveMaladies',
                abilityName: 'Explosive Maladies',
                damageProfile: 'Blast' as DamageType,
                minDamage: extraDmg,
                maxDamage: extraDmg,
                hits: 1,
                attackCategory: 'special',
              });
            }
          }
        }
      }

      // InfernalPacts (Abraxas): +1x Psychic follow-up on ranged (Daemons: also melee)
      if (teammate.passiveAbilities.includes('InfernalPacts')) {
        const toggleId = `InfernalPacts_${teammate.id}_adjacent`;
        if (isToggleActive(character.abilityToggles[toggleId])) {
          const levelIndex = teammate.abilityLevels?.['InfernalPacts'] ?? 54;
          const values = getAbilityValues('InfernalPacts', levelIndex, teammate.progressionStepIndex);
          if (values) {
            const minDmg = values.minDmg as number || 0;
            const maxDmg = values.maxDmg as number || 0;
            const isDaemon = character.traits?.includes('Daemon') ?? false;
            // Ability attacks: only trigger for Daemons (melee-equivalent)
            if (isDaemon) {
              allAbilityFollowUps.push({
                abilityId: 'InfernalPacts',
                abilityName: 'Infernal Pacts',
                damageProfile: 'Psychic' as DamageType,
                minDamage: minDmg,
                maxDamage: maxDmg,
                hits: 1,
                attackCategory: 'special',
              });
            }
          }
        }
      }
    }

    // FoulInfusion (Pestillian): +1x Toxic follow-up on melee ability attacks
    // Note: abilities are melee-equivalent, so this triggers
    if (character.foulInfusionActive) {
      const dmg = character.foulInfusionDmg || 0;
      allAbilityFollowUps.push({
        abilityId: 'FoulInfusion',
        abilityName: 'Foul Infusion',
        damageProfile: 'Toxic' as DamageType,
        minDamage: dmg,
        maxDamage: dmg,
        hits: 1,
        attackCategory: 'special',
      });
    }

    // SorcerousFacade (Yazaghor): +1x Psychic follow-up on ability attacks
    if (character.sorcerousFacadeActive) {
      allAbilityFollowUps.push({
        abilityId: 'SorcerousFacade',
        abilityName: 'Sorcerous Facade',
        damageProfile: 'Psychic' as DamageType,
        minDamage: character.sorcerousFacadeMinDmg || 0,
        maxDamage: character.sorcerousFacadeMaxDmg || 0,
        hits: 1,
        attackCategory: 'special',
      });
    }

    // Filter follow-ups that trigger on ability attacks
    const eligibleFollowUps = allAbilityFollowUps.filter(followUp => {
      if (followUp.triggersOnNormalOnly) {
        return false;  // Skip if this follow-up only triggers on normal attacks
      }
      return true;
    });

    // AstartesBanner (Thoread): detect if banner is active for inline hit computation
    // Banner adds +1 hit after EACH melee follow-up, using same stats + finalDamageCap
    let abilityBannerActive = false;
    let abilityBannerMaxDmg = 0;
    {
      const thoread = battleState.team.find(c => c.passiveAbilities.includes('AstartesBanner'));
      if (thoread && thoread.id !== character.id) {
        const bannerToggleId = `AstartesBanner_${thoread.id}_range2`;
        if (isToggleActive(character.abilityToggles[bannerToggleId])) {
          const bannerLevelIndex = thoread.abilityLevels?.['AstartesBanner'] ?? 54;
          const bannerValues = getAbilityValues('AstartesBanner', bannerLevelIndex, thoread.progressionStepIndex);
          if (bannerValues) {
            abilityBannerActive = true;
            abilityBannerMaxDmg = bannerValues.maxDmg as number || 0;
          }
        }
      }
    }

    if (eligibleFollowUps.length > 0) {
      console.log('\n--- FOLLOW-UP ATTACKS (from ability) ---');
      const equipmentStats = calculateEquipmentStats(character.equipment);

      // Use boss armor and traits if available (accounting for armor reduction)
      const baseBossArmorFollowUp = battleState.boss?.armor ?? 0;
      const bossArmorFollowUp = Math.max(0, baseBossArmorFollowUp - (battleState.bossArmorReduction || 0));

      // Check if boss has Daemon trait for block mechanic
      const hasDaemonTraitFollowUp = battleState.boss?.traits?.includes('Daemon') ?? false;

      const defenderStats: DefenderStats = {
        armor: bossArmorFollowUp,
        maxHealth: battleState.boss?.health ?? 100000,
        traits: battleState.boss?.traits,
        // Daemon block stats
        daemonBlockChance: hasDaemonTraitFollowUp ? 0.25 : undefined,
        daemonBlockMaxAmount: hasDaemonTraitFollowUp ? (battleState.boss?.damage ?? 0) * 0.5 : undefined,
      };

      // Track if LC +2 hits was applied to any follow-up attack (so subsequent follow-ups don't also get it)
      let lcHitsAppliedInFollowUps = false;
      // Track effective character state for follow-up evaluations (for per-character LC tracking)
      let effectiveCharacter = updatedCharacter;
      // Track cumulative hits for crit chain offset (for Additional Attacks like Cyclic Ion Blaster)
      // Starts with the ability's base hits (result.damageResult.hits)
      // Note: CyclicIonBlaster has triggersOnNormalOnly=true so it won't trigger here
      let cumulativeHitsForCritChain = result.damageResult?.hits ?? 0;
      // Track cumulative boss armor reduction from follow-up attacks (e.g., ChampionOfTheFeast)
      let followUpArmorReductionTotal = 0;

      for (const followUp of eligibleFollowUps) {
        // Get current battle state for buff evaluation
        const currentBattleStateForFollowUp = get().battleState!;
        // Create effective battle state with updated character for buff evaluation
        const effectiveBattleStateForFollowUp = {
          ...currentBattleStateForFollowUp,
          team: currentBattleStateForFollowUp.team.map(c => c.id === characterId ? effectiveCharacter : c),
        };

        // Build buff pool evaluation context for follow-up attack (special attack)
        const followUpBuffContext: BuffEvaluationContext = {
          attacker: effectiveCharacter,
          attackType: 'melee', // Follow-ups are treated as melee
          attackCategory: 'special',
          target: currentBattleStateForFollowUp.boss,
          battleState: effectiveBattleStateForFollowUp,
        };

        // Get applicable buffs from the pool (includes LC buffs if conditions met)
        const followUpApplicableBuffs = getApplicableBuffs(currentBattleStateForFollowUp.buffPool, followUpBuffContext);
        const followUpPoolEffects = combineBuffEffects(followUpApplicableBuffs);

        // Extract bonuses from pool effects (LC, Way of the Short Blade, Exemplar, Euphoric Strikes, etc.)
        const lcExtraDmg = followUpPoolEffects.baseDamageBonus || 0;
        // Additional Attacks (sharesCritChain) can't receive bonus hits - they're part of the source attack
        // which already received the bonus hits
        const lcExtraHits = followUp.sharesCritChain ? 0 : (followUpPoolEffects.extraHits || 0);
        const followUpArmorIgnored = followUpPoolEffects.armorIgnored || 0;
        const followUpDamageMultiplier = followUpPoolEffects.baseDamageMultiplier || 1;
        const abilityFollowUpCritChanceBonus = followUpPoolEffects.critChanceBonus || 0;
        const abilityFollowUpCritDamageBonus = followUpPoolEffects.critDamageBonus || 0;

        // If LC +2 hits was applied, update effective character for subsequent follow-ups
        if (lcExtraHits > 0) {
          effectiveCharacter = { ...effectiveCharacter, hasUsedFirstSpecialAttackThisTurn: true };
          lcHitsAppliedInFollowUps = true;
        }

        // Only show pool buff log if Trajann (Legendary Commander) is in the team
        if ((lcExtraDmg > 0 || lcExtraHits > 0) && currentBattleStateForFollowUp.team.some(c => c.passiveAbilities.includes('LegendaryCommander'))) {
          console.log(`[Pool Buff applied to ${followUp.abilityName}: +${lcExtraDmg} dmg, +${lcExtraHits} hits]`);
        }

        // Get Lord of the Host aura bonuses for follow-up attacks (melee only)
        const followUpAuraBonuses = getCharacterAuraBonuses(updatedCharacter, battleState.team);
        const activeFollowUpAuras = followUpAuraBonuses.filter(a => {
          if (!a.isActive) return false;
          // Only apply melee-restricted auras since follow-ups are melee
          if (a.attackTypeRestriction && a.attackTypeRestriction !== 'melee') return false;
          return true;
        });

        // Calculate aura damage and hit bonuses
        // Additional Attacks can't receive bonus hits (they're part of the source attack)
        let auraDmgBonus = 0;
        let auraHitsBonus = 0;
        for (const aura of activeFollowUpAuras) {
          if (aura.modifiers) {
            auraDmgBonus += aura.modifiers.baseDamageBonus || 0;
            if (!followUp.sharesCritChain) {
              auraHitsBonus += aura.modifiers.extraHits || 0;
            }
          }
        }

        if (auraDmgBonus > 0 || auraHitsBonus > 0) {
          console.log(`[Aura Buff applied to ${followUp.abilityName}: +${auraDmgBonus} dmg, +${auraHitsBonus} hits]`);
        }

        // Base damage is the average of min/max (multiplier applied via Global)
        const avgDamagePerHit = Math.round((followUp.minDamage + followUp.maxDamage) / 2);

        // Build buff sources for breakdown display (iterate through applicable pool buffs)
        type FollowUpBuffSource = { name: string; sourceName?: string; damageBonus?: number; extraHits?: number; armorIgnored?: number; damageMultiplier?: number; critChanceBonus?: number; critDamageBonus?: number; pierceRatioBonus?: number };
        const followUpBuffSources: FollowUpBuffSource[] = [];

        // Add each applicable pool buff as a source
        for (const poolBuff of followUpApplicableBuffs) {
          const effects = poolBuff.effects;
          const source: FollowUpBuffSource = {
            name: poolBuff.name,
          };

          if (effects.baseDamageBonus) source.damageBonus = effects.baseDamageBonus;
          if (effects.extraHits) source.extraHits = effects.extraHits;
          if (effects.armorIgnored) source.armorIgnored = effects.armorIgnored;
          if (effects.baseDamageMultiplier && effects.baseDamageMultiplier !== 1) {
            source.damageMultiplier = effects.baseDamageMultiplier;
          }
          if (effects.critChanceBonus) source.critChanceBonus = effects.critChanceBonus;
          if (effects.critDamageBonus) source.critDamageBonus = effects.critDamageBonus;

          // Only add if there's at least one bonus
          if (source.damageBonus || source.extraHits || source.armorIgnored || source.damageMultiplier || source.critChanceBonus || source.critDamageBonus) {
            followUpBuffSources.push(source);
          }
        }
        for (const aura of activeFollowUpAuras) {
          if (aura.modifiers) {
            const dmgBonus = aura.modifiers.baseDamageBonus || 0;
            const hitsBonus = aura.modifiers.extraHits || 0;
            if (dmgBonus > 0 || hitsBonus > 0) {
              followUpBuffSources.push({
                name: aura.abilityName,
                sourceName: aura.sourceCharacterName,
                damageBonus: dmgBonus > 0 ? dmgBonus : undefined,
                extraHits: hitsBonus > 0 ? hitsBonus : undefined,
              });
            }
          }
        }

        // Check for ability global multiplier (e.g., Martial Inspiration +33% per attack turn)
        let followUpGlobalMultiplier: number | undefined;
        if (followUp.damageMultiplier && followUp.damageMultiplier !== 1) {
          followUpGlobalMultiplier = followUp.damageMultiplier;
          // Format: "Martial Inspiration +33%×3" for stacks > 1, or just "+33%" for 1 stack
          const stackText = (followUp.multiplierStacks || 0) > 1 ? `×${followUp.multiplierStacks}` : '';
          const sourceName = followUp.multiplierSourceName || 'Ability';
          const basePercent = followUp.multiplierBasePercentage || Math.round((followUp.damageMultiplier - 1) * 100);
          followUpBuffSources.push({
            name: `${sourceName} +${basePercent}%${stackText}`,
            damageMultiplier: followUp.damageMultiplier,
          });
        }

        // High Ground: +50% damage multiplier when toggle is enabled
        const abilityFollowUpHighGroundMultiplier = character.abilityToggles['HighGround'] ? 1.5 : 1;

        // War Machine: dynamic damage multiplier based on selected Machine of War
        const abilityFollowUpWarMachineMultiplier = character.abilityToggles['WarMachine'] && battleState.machineOfWar
          ? 1 + battleState.machineOfWar.extraDmgPct / 100
          : 1;

        // Add High Ground buff source for display
        if (abilityFollowUpHighGroundMultiplier > 1) {
          followUpBuffSources.push({
            name: 'High Ground',
            damageMultiplier: abilityFollowUpHighGroundMultiplier,
          });
        }

        // Add Machine of War buff source for display
        if (abilityFollowUpWarMachineMultiplier > 1 && battleState.machineOfWar) {
          followUpBuffSources.push({
            name: `Machine of War (+${battleState.machineOfWar.extraDmgPct}%)`,
            damageMultiplier: abilityFollowUpWarMachineMultiplier,
          });
        }

        // Supercharge (Sarquael): +pierce ratio bonus for ALL team Plasma attacks this turn
        const abilityFollowUpSuperchargeBonus = (battleState.superchargePierceBonus && followUp.damageProfile === 'Plasma')
          ? battleState.superchargePierceBonus
          : 0;

        // Add Supercharge buff source for display
        if (abilityFollowUpSuperchargeBonus > 0) {
          followUpBuffSources.push({
            name: 'Supercharge',
            pierceRatioBonus: abilityFollowUpSuperchargeBonus,
          });
        }

        // Blood Chalice and other activeBuffs pierce ratio bonus (check meleeOnly flag)
        // Use follow-up's attack type if specified, otherwise default to melee
        const abilityFollowUpAttackType: 'melee' | 'ranged' = followUp.followUpAttackType || 'melee';
        const abilityFollowUpBuffPierceRatioBonus = character.activeBuffs.reduce(
          (sum, buff) => {
            if (!buff.pierceRatioBonus) return sum;
            // Check if buff is melee only and we're not doing melee
            if (buff.meleeOnly && abilityFollowUpAttackType !== 'melee') return sum;
            return sum + buff.pierceRatioBonus;
          }, 0
        );

        // Add activeBuffs pierce ratio sources for display
        for (const buff of character.activeBuffs) {
          if (buff.pierceRatioBonus && (!buff.meleeOnly || abilityFollowUpAttackType === 'melee')) {
            followUpBuffSources.push({
              name: buff.abilityName || 'Active Buff',
              pierceRatioBonus: buff.pierceRatioBonus,
            });
          }
        }

        const abilityFollowUpTotalPierceRatioBonus = abilityFollowUpSuperchargeBonus + abilityFollowUpBuffPierceRatioBonus;

        // Check if we have any modifiers to pass
        const hasFollowUpModifiers = lcExtraDmg + auraDmgBonus > 0 || lcExtraHits + auraHitsBonus > 0 || followUpGlobalMultiplier || followUpArmorIgnored > 0 || followUpDamageMultiplier !== 1 || abilityFollowUpHighGroundMultiplier !== 1 || abilityFollowUpWarMachineMultiplier !== 1 || abilityFollowUpCritChanceBonus > 0 || abilityFollowUpCritDamageBonus > 0 || abilityFollowUpTotalPierceRatioBonus > 0;

        // Combine ability multiplier with pool multiplier and high ground and war machine (multiplicative)
        const combinedDamageMultiplier = (followUpGlobalMultiplier || 1) * followUpDamageMultiplier * abilityFollowUpHighGroundMultiplier * abilityFollowUpWarMachineMultiplier;
        const effectiveDamageMultiplier = combinedDamageMultiplier !== 1 ? combinedDamageMultiplier : undefined;

        // Calculate damage using averageDamage (with crit)
        // Use follow-up's attack type if specified, otherwise default to melee
        const effectiveAttackType: 'melee' | 'ranged' = followUp.followUpAttackType || 'melee';
        const followUpStats: AttackerStats = {
          baseDamage: avgDamagePerHit,  // Just the ability base damage (avg of min/max)
          damageType: followUp.damageProfile,
          hits: followUp.hits,  // Base hits only, extra hits via abilityModifiers
          critChance: equipmentStats.critChance || 0,
          critDamage: equipmentStats.critDmg || 0,
          critChanceBonus: (equipmentStats.critChanceBonus || 0) + abilityFollowUpCritChanceBonus,
          critDmgBonus: (equipmentStats.critDmgBonus || 0) + abilityFollowUpCritDamageBonus,
          ignoreCrit,
          traits: character.traits,
          hasMoved: true,
          attackType: effectiveAttackType,
          hasAttackedThisBattle: true,
          attacksThisTurn: 1,
          firstAttackTurn: character.firstAttackTurn ?? battleState.turn,
          currentTurn: battleState.turn,
          // Crit chain offset for Additional Attacks (shares crit chain with source attack)
          critChainOffset: followUp.sharesCritChain ? cumulativeHitsForCritChain : undefined,
          // Pass ability toggles for trait evaluation (e.g., RangedSpecialist adjacency check)
          abilityToggles: character.abilityToggles,
          // Pass Fighting Retreat flag for RangedSpecialist override
          fightingRetreatActive: character.fightingRetreatActive,
          // Pass bonuses via abilityModifiers for proper source tracking in breakdown
          abilityModifiers: hasFollowUpModifiers ? {
            baseDamageBonus: lcExtraDmg + auraDmgBonus > 0 ? lcExtraDmg + auraDmgBonus : undefined,
            baseDamageMultiplier: effectiveDamageMultiplier,
            extraHits: lcExtraHits + auraHitsBonus > 0 ? lcExtraHits + auraHitsBonus : undefined,
            armorIgnored: followUpArmorIgnored > 0 ? followUpArmorIgnored : undefined,
            critChanceBonus: abilityFollowUpCritChanceBonus > 0 ? abilityFollowUpCritChanceBonus : undefined,
            critDamageBonus: abilityFollowUpCritDamageBonus > 0 ? abilityFollowUpCritDamageBonus : undefined,
            pierceRatioBonus: abilityFollowUpTotalPierceRatioBonus > 0 ? abilityFollowUpTotalPierceRatioBonus : undefined,
            buffSources: followUpBuffSources,
          } : undefined,
        };
        const followUpCalc = new DamageCalculator(true);
        const followUpResult = followUpCalc.calculate(followUpStats, defenderStats);

        // Update cumulative hits for crit chain tracking
        if (followUp.sharesCritChain) {
          // Additional Attack: add hits to the chain
          cumulativeHitsForCritChain += followUpResult.totalHits;
        } else {
          // Regular follow-up: starts a new chain, subsequent Additional Attacks continue from here
          cumulativeHitsForCritChain = followUpResult.totalHits;
        }

        // Log follow-up attack details (totalHits includes base + extra from abilityModifiers)
        const bonusText = (followUp.damageMultiplier || 1) > 1
          ? ` (×${followUp.damageMultiplier?.toFixed(2)} from attack turns)`
          : '';
        // Only show LC text if Trajann (Legendary Commander) is in the team
        const lcText = (lcExtraDmg > 0 || lcExtraHits > 0) && currentBattleStateForFollowUp.team.some(c => c.passiveAbilities.includes('LegendaryCommander'))
          ? ` [+LC: ${lcExtraDmg} dmg, ${lcExtraHits} hits]` : '';
        const auraText = auraDmgBonus > 0 || auraHitsBonus > 0 ? ` [+Aura: ${auraDmgBonus} dmg, ${auraHitsBonus} hits]` : '';
        console.log(`\n${followUp.abilityName}: ${followUpResult.totalHits}x ${followUp.damageProfile}${bonusText}${lcText}${auraText}`);
        followUpCalc.printLogs();
        console.log(`Follow-up Damage: ${followUpResult.damage.toLocaleString()}`);

        // Add to totals
        totalDamage += followUpResult.damage;
        // Track max perHitDamage for Laviscus outrage
        maxPerHitDamage = Math.max(maxPerHitDamage, followUpResult.perHitDamage);
        if (damageBreakdown) {
          damageBreakdown.damage += followUpResult.damage;
        }

        // Build follow-up breakdown for consistent display
        // Breakdown now includes flatModifiers and extraHits with sources from the calculator
        const followUpBreakdown: DamageBreakdown = {
          damage: followUpResult.damage,
          perHitDamage: followUpResult.perHitDamage,
          hits: followUpResult.totalHits,  // Total hits from calculator (base + extra)
          baseDamage: followUpResult.baseDamage,
          flatModifiers: followUpResult.flatModifiers,
          flatModifierSources: followUpResult.flatModifierSources,
          critBonus: followUpResult.critBonus,
          critChanceSources: followUpResult.critChanceSources,
          critDamageSources: followUpResult.critDamageSources,
          extraHits: followUpResult.extraHits,
          extraHitsSources: followUpResult.extraHitsSources,
          damVarMod: followUpResult.damVarMod,
          targetArmor: bossArmorFollowUp,
          armorIgnored: followUpResult.armorIgnored,
          armorIgnoredSources: followUpResult.armorIgnoredSources,
          effectiveArmor: followUpResult.effectiveArmor,
          afterArmor: followUpResult.afterArmor,
          pierceRatio: followUpResult.pierceRatio,
          effectivePierceRatio: followUpResult.effectivePierceRatio,
          pierceRatioBonus: followUpResult.pierceRatioBonus,
          pierceRatioBonusSources: followUpResult.pierceRatioBonusSources,
          pierceFloor: followUpResult.pierceFloor,
          afterArmorPierce: followUpResult.afterArmorPierce,
          globalMultiplier: followUpResult.globalMultiplier,
          globalMultiplierSources: followUpResult.globalMultiplierSources,
          // Crit breakdown values
          baseCritChance: followUpResult.baseCritChance,
          baseCritDamage: followUpResult.baseCritDamage,
          critChanceBonus: followUpResult.critChanceTotalBonus,
          critDmgBonus: followUpResult.critDamageTotalBonus,
          critChance: followUpResult.effectiveCritChance * 100,
          critDamage: followUpResult.effectiveCritDamage,
          traitModifiers: followUpResult.traitModifiers,
          traitMultiplier: followUpResult.traitMultiplier,
          // Block reduction (Daemon trait)
          expectedBlocks: followUpResult.expectedBlocks,
          blockReductionPerHit: followUpResult.blockReductionPerHit,
          totalBlockReduction: followUpResult.totalBlockReduction,
        };

        // Collect follow-up attack log for display
        // Note: No appliedBuffs - modifiers now shown inline in breakdown
        followUpAttackLogs.push({
          abilityName: followUp.abilityName,
          damage: followUpResult.damage,
          hits: followUpResult.totalHits,
          damageType: followUp.damageProfile,
          attackType: followUp.followUpAttackType || 'melee',  // Use follow-up's attack type
          breakdown: followUpBreakdown,
        });

        // AstartesBanner: +1 hit after melee follow-up (same stats, capped at maxDmg)
        if (abilityBannerActive && effectiveAttackType === 'melee') {
          const bannerFollowUpStats: AttackerStats = {
            ...followUpStats,
            hits: 1,
            damageCaps: { ...(followUpStats.damageCaps || {}), finalDamageCap: abilityBannerMaxDmg },
            critChainOffset: cumulativeHitsForCritChain,
            abilityModifiers: followUpStats.abilityModifiers ? {
              ...followUpStats.abilityModifiers,
              extraHits: undefined,
            } : undefined,
          };
          const bannerFollowUpCalc = new DamageCalculator(true);
          const bannerFollowUpResult = bannerFollowUpCalc.calculate(bannerFollowUpStats, defenderStats);
          cumulativeHitsForCritChain += bannerFollowUpResult.totalHits;

          totalDamage += bannerFollowUpResult.damage;
          maxPerHitDamage = Math.max(maxPerHitDamage, bannerFollowUpResult.perHitDamage);
          if (damageBreakdown) {
            damageBreakdown.damage += bannerFollowUpResult.damage;
          }

          const bannerFollowUpBreakdown: DamageBreakdown = {
            damage: bannerFollowUpResult.damage,
            perHitDamage: bannerFollowUpResult.perHitDamage,
            hits: bannerFollowUpResult.totalHits,
            baseDamage: bannerFollowUpResult.baseDamage,
            flatModifiers: bannerFollowUpResult.flatModifiers,
            flatModifierSources: bannerFollowUpResult.flatModifierSources,
            critBonus: bannerFollowUpResult.critBonus,
            critChanceSources: bannerFollowUpResult.critChanceSources,
            critDamageSources: bannerFollowUpResult.critDamageSources,
            extraHits: bannerFollowUpResult.extraHits,
            extraHitsSources: bannerFollowUpResult.extraHitsSources,
            damVarMod: bannerFollowUpResult.damVarMod,
            targetArmor: bossArmorFollowUp,
            armorIgnored: bannerFollowUpResult.armorIgnored,
            armorIgnoredSources: bannerFollowUpResult.armorIgnoredSources,
            effectiveArmor: bannerFollowUpResult.effectiveArmor,
            afterArmor: bannerFollowUpResult.afterArmor,
            pierceRatio: bannerFollowUpResult.pierceRatio,
            effectivePierceRatio: bannerFollowUpResult.effectivePierceRatio,
            pierceRatioBonus: bannerFollowUpResult.pierceRatioBonus,
            pierceRatioBonusSources: bannerFollowUpResult.pierceRatioBonusSources,
            pierceFloor: bannerFollowUpResult.pierceFloor,
            afterArmorPierce: bannerFollowUpResult.afterArmorPierce,
            globalMultiplier: bannerFollowUpResult.globalMultiplier,
            globalMultiplierSources: bannerFollowUpResult.globalMultiplierSources,
            baseCritChance: bannerFollowUpResult.baseCritChance,
            baseCritDamage: bannerFollowUpResult.baseCritDamage,
            critChanceBonus: bannerFollowUpResult.critChanceTotalBonus,
            critDmgBonus: bannerFollowUpResult.critDamageTotalBonus,
            critChance: bannerFollowUpResult.effectiveCritChance * 100,
            critDamage: bannerFollowUpResult.effectiveCritDamage,
            traitModifiers: bannerFollowUpResult.traitModifiers,
            traitMultiplier: bannerFollowUpResult.traitMultiplier,
            expectedBlocks: bannerFollowUpResult.expectedBlocks,
            blockReductionPerHit: bannerFollowUpResult.blockReductionPerHit,
            totalBlockReduction: bannerFollowUpResult.totalBlockReduction,
          };

          followUpAttackLogs.push({
            abilityName: 'Astartes Banner',
            damage: bannerFollowUpResult.damage,
            hits: bannerFollowUpResult.totalHits,
            damageType: followUpStats.damageType,
            attackType: 'melee',
            breakdown: bannerFollowUpBreakdown,
          });

          console.log(`\nAstartes Banner (${followUp.abilityName}): 1x ${followUpStats.damageType} (cap ${abilityBannerMaxDmg})`);
          bannerFollowUpCalc.printLogs();
          console.log(`Banner Damage: ${bannerFollowUpResult.damage.toLocaleString()}`);
        }

        // Accumulate boss armor reduction from follow-ups (e.g., ChampionOfTheFeast)
        if (followUp.armorReduction && followUp.armorReduction > 0) {
          followUpArmorReductionTotal += followUp.armorReduction;
          console.log(`[Boss armor reduced by ${followUp.armorReduction} from ${followUp.abilityName}]`);
        }
      }

      // Update totals with follow-up damage
      if (followUpAttackLogs.length > 0) {
        const followUpTotalDamage = followUpAttackLogs.reduce((sum, f) => sum + f.damage, 0);

        set((state) => ({
          battleState: state.battleState
            ? {
                ...state.battleState,
                totalDamageDealt: state.battleState.totalDamageDealt + followUpTotalDamage,
                // Apply boss armor reduction from follow-up attacks (e.g., ChampionOfTheFeast)
                bossArmorReduction: (state.battleState.bossArmorReduction || 0) + followUpArmorReductionTotal,
                team: state.battleState.team.map((char) =>
                  char.id === characterId
                    ? {
                        ...char,
                        totalDamageDealt: char.totalDamageDealt + followUpTotalDamage,
                        // Mark first special attack used if LC +2 hits was applied to any follow-up
                        hasUsedFirstSpecialAttackThisTurn: char.hasUsedFirstSpecialAttackThisTurn || lcHitsAppliedInFollowUps,
                      }
                    : char
                ),
              }
            : null,
        }));

        console.log('\n--- COMBINED TOTAL (ability + follow-ups) ---');
        console.log(`Total Damage: ${totalDamage.toLocaleString()}`);
      }
    }

    // Track outrage for Laviscus AFTER all follow-up attacks are calculated
    // This ensures maxPerHitDamage includes the highest perHitDamage from ability + all follow-ups
    if (totalDamage > 0 || maxPerHitDamage > 0) {
      const finalMaxPerHitForOutrage = maxPerHitDamage;
      // Check if the ability user is Laviscus (has RefusalToBeOutdone)
      const isAbilityUserLaviscus = character.passiveAbilities.includes('RefusalToBeOutdone');

      set((state) => ({
        battleState: state.battleState
          ? {
              ...state.battleState,
              team: state.battleState.team.map((char) => {
                // Track outrage for characters with RefusalToBeOutdone (Laviscus)
                // Include the ability user if they are Laviscus (e.g., EuphoricStrikes increases own outrage)
                const isLaviscusTrackingOwnAttack = char.id === characterId && isAbilityUserLaviscus;
                const isLaviscusTrackingAllyAttack = char.id !== characterId && char.passiveAbilities.includes('RefusalToBeOutdone');

                if (isLaviscusTrackingOwnAttack || isLaviscusTrackingAllyAttack) {
                  // Accumulate outrage from ability attacks (uses max perHitDamage from ability + follow-ups)
                  const newOutrage = (char.outrage || 0) + finalMaxPerHitForOutrage;
                  const contributors = char.outrageContributors || [];
                  // Add to contributors if attacker is Chaos and not already in list
                  // This applies to both own attacks (Laviscus is Chaos) and ally attacks
                  const newContributors = isAbilityUserChaos && !contributors.includes(characterId)
                    ? [...contributors, characterId]
                    : contributors;

                  return {
                    ...char,
                    outrage: newOutrage,
                    outrageContributors: newContributors,
                  };
                }
                return char;
              }),
            }
          : null,
      }));
    }

    // Track Custodes ability usage for Stand Vigil range extension
    if (character.faction === 'Custodes') {
      set((state) => ({
        battleState: state.battleState
          ? { ...state.battleState, custodedUsedAbilityThisTurn: true }
          : null,
      }));
    }

    // Build message with attack type label for damage abilities
    const attackTypeLabel = abilityAttackType ? ` [${abilityAttackType.toUpperCase()}]` : '';
    const baseMessage = result.message || `${character.name} uses ${abilityName}`;
    // Always append attack type for damage abilities
    const finalMessage = abilityAttackType ? `${baseMessage}${attackTypeLabel}` : baseMessage;

    return {
      timestamp: Date.now(),
      characterId,
      characterName: character.name,
      characterIconUrl: character.iconUrl,
      action: 'ability' as const,
      damage: totalDamage > 0 ? totalDamage : undefined,
      damageBreakdown,
      attackType: abilityAttackType,
      message: finalMessage,
      followUpAttacks: followUpAttackLogs.length > 0 ? followUpAttackLogs : undefined,
      appliedBuffs: appliedBuffs.length > 0 ? appliedBuffs : undefined,
    };
  },

  // Set ignore crit flag
  setIgnoreCrit: (ignore) => {
    const { battleState } = get();
    if (!battleState) return;

    set({
      battleState: {
        ...battleState,
        ignoreCrit: ignore,
      },
    });
  },

  // Set boss Markerlight debuff
  setBossMarkerlight: (hasMarkerlight) => {
    const { battleState } = get();
    if (!battleState) return;

    set({
      battleState: {
        ...battleState,
        bossHasMarkerlight: hasMarkerlight,
      },
    });
  },

  setPendingRepairAction: (action) => {
    const { battleState } = get();
    if (!battleState) return;

    set({
      battleState: {
        ...battleState,
        pendingRepairAction: action ?? undefined,
      },
    });
  },

  executeRepairWithGalvanicField: (repairerId, targetIds, healAmount, attackTypeChoices) => {
    const { battleState } = get();
    if (!battleState || !battleState.boss) return [];

    const logEntries: BattleLogEntry[] = [];
    const repairer = battleState.team.find(c => c.id === repairerId);
    if (!repairer) return [];

    // Get GalvanicField ability values from repairer
    const galvanicFieldLevelIndex = repairer.abilityLevels?.['GalvanicField'] ?? 54;
    const galvanicFieldValues = getAbilityValues('GalvanicField', galvanicFieldLevelIndex, repairer.progressionStepIndex);
    const dmgPct = (galvanicFieldValues?.dmgPct as number) || 100;
    const maxDmgPerHit = (galvanicFieldValues?.maxDmg as number) || 9999;

    // First, apply healing to all targets
    const healingUpdates: { targetId: string; actualHeal: number; newHealth: number }[] = [];
    for (const targetId of targetIds) {
      const target = battleState.team.find(c => c.id === targetId);
      if (!target) continue;
      const actualHeal = Math.min(healAmount, target.calculatedHealth - target.currentHealth);
      const newHealth = target.currentHealth + actualHeal;
      healingUpdates.push({ targetId, actualHeal, newHealth });
    }

    // Update team with healing
    set((state) => ({
      battleState: state.battleState ? {
        ...state.battleState,
        team: state.battleState.team.map(char => {
          const healUpdate = healingUpdates.find(h => h.targetId === char.id);
          if (healUpdate) {
            return { ...char, currentHealth: healUpdate.newHealth };
          }
          return char;
        }),
        pendingRepairAction: undefined,
      } : null,
    }));

    // Now process each target for repair log and Galvanic Field attacks
    for (const targetId of targetIds) {
      const target = battleState.team.find(c => c.id === targetId);
      if (!target) continue;

      const isSelf = targetId === repairerId;
      const healUpdate = healingUpdates.find(h => h.targetId === targetId);
      const actualHeal = healUpdate?.actualHeal || 0;

      // Create repair log entry
      const repairLog: BattleLogEntry = {
        timestamp: Date.now(),
        characterId: repairerId,
        characterName: repairer.name,
        action: 'repair',
        target: target.name,
        healing: actualHeal,
        message: `${repairer.name} repairs ${target.name} for ${actualHeal} HP`,
        followUpAttacks: [],
      };

      // If not self-repair, trigger Galvanic Field attack using executeAttack
      if (!isSelf) {
        const attackType = attackTypeChoices[targetId] || 'melee';

        // Call executeAttack with Galvanic Field options
        // This handles the full attack pipeline: passives, buffs, follow-ups (like Way of the Short Blade)
        const attackLog = get().executeAttack(targetId, 'boss', attackType, {
          damageMultiplier: dmgPct / 100,  // Convert percentage to multiplier
          baseDamageCap: maxDmgPerHit,     // Cap base damage (Cap 1: "Its Own Damage")
          skipStateUpdates: true,  // Don't update hasActed, attacksThisTurn, etc.
          abilityName: 'Galvanic Field',
        });

        // Update attackLog message to mention Galvanic Field trigger
        attackLog.message = `${target.name} attacks via Galvanic Field: ${(attackLog.damage || 0).toLocaleString()} damage`;

        // Push attackLog separately - it has correct characterId for chart attribution
        // This ensures damage shows under the attacking unit (e.g., Farsight), not Actus
        logEntries.push(attackLog);
      }

      // Push repairLog (healing only, no damage)
      logEntries.push(repairLog);
    }

    return logEntries;
  },

  // Summon management implementations
  addSummon: (summon) => {
    set((state) => ({
      battleState: state.battleState
        ? { ...state.battleState, summons: [...state.battleState.summons, summon] }
        : null,
    }));
  },

  spawnPossessionSummon: (characterId, unitType) => {
    const { battleState } = get();
    if (!battleState) return;

    const character = battleState.team.find((c) => c.id === characterId);
    if (!character) return;

    const levelIndex = character.abilityLevels?.Possession ?? 54;
    const values = getAbilityValues('Possession', levelIndex, character.progressionStepIndex);
    if (!values) return;

    const isBloodletter = unitType === 'bloodletter';
    const unitId = isBloodletter ? 'blackSmnBloodletter' : 'thousSmnBlueHorror';
    const hp = isBloodletter ? (values.summonHp as number || 0) : (values.summonHp_2 as number || 0);
    const damage = isBloodletter ? (values.summonDmg as number || 0) : (values.summonDmg_2 as number || 0);

    const summonData = getSummonUnitData(unitId);
    if (!summonData) return;

    const meleeWeapon = summonData.weapons.find(w => !w.Range);
    const rangedWeapon = summonData.weapons.find(w => w.Range);

    const newSummon: import('../types').BattleSummon = {
      id: `summon_${unitId}_${Date.now()}`,
      unitId,
      name: summonData.name,
      sourceCharacterId: characterId,
      sourceAbilityId: 'Possession',
      hp,
      damage,
      armor: 0,
      meleeHits: meleeWeapon?.hits || 1,
      meleeDamageType: (meleeWeapon?.DamageProfile as import('../types').DamageType) || 'Physical',
      rangedHits: rangedWeapon?.hits,
      rangedDamageType: rangedWeapon?.DamageProfile as import('../types').DamageType | undefined,
      rangedRange: rangedWeapon?.Range,
      traits: summonData.traits || [],
      count: 1,
      createdAtTurn: battleState.turn,
      iconUrl: getSummonIconUrl(unitId),
      activeAbilities: summonData.activeAbilities,
      totalDamageDealt: 0,
    };

    set((state) => ({
      battleState: state.battleState
        ? { ...state.battleState, summons: [...state.battleState.summons, newSummon] }
        : null,
    }));

    console.log(`[Possession: Spawned ${summonData.name} (HP: ${hp}, Dmg: ${damage})]`);
  },

  removeSummon: (summonId) => {
    set((state) => ({
      battleState: state.battleState
        ? {
            ...state.battleState,
            summons: state.battleState.summons.filter((s) => s.id !== summonId),
          }
        : null,
    }));
  },

  updateSummonCount: (summonId, count) => {
    set((state) => ({
      battleState: state.battleState
        ? {
            ...state.battleState,
            summons: state.battleState.summons.map((s) =>
              s.id === summonId ? { ...s, count: Math.max(1, count) } : s
            ),
          }
        : null,
    }));
  },

  toggleSummonBuffCondition: (summonId, conditionId) => {
    set((state) => ({
      battleState: state.battleState
        ? {
            ...state.battleState,
            summons: state.battleState.summons.map((s) =>
              s.id === summonId
                ? {
                    ...s,
                    abilityToggles: {
                      ...s.abilityToggles,
                      [conditionId]: !(s.abilityToggles?.[conditionId] ?? false),
                    },
                  }
                : s
            ),
          }
        : null,
    }));
  },

  executeSummonAttack: (summonId, attackType) => {
    const { battleState } = get();
    if (!battleState || !battleState.boss) {
      return {
        timestamp: Date.now(),
        characterId: summonId,
        characterName: 'Unknown',
        action: 'attack' as const,
        message: 'No battle in progress',
      };
    }

    const summon = battleState.summons.find((s) => s.id === summonId);
    if (!summon) {
      return {
        timestamp: Date.now(),
        characterId: summonId,
        characterName: 'Unknown',
        action: 'attack' as const,
        message: 'Summon not found',
      };
    }

    // Get attack parameters based on attack type
    const hits = attackType === 'melee' ? summon.meleeHits : (summon.rangedHits || 0);
    const damageType = attackType === 'melee' ? summon.meleeDamageType : (summon.rangedDamageType || summon.meleeDamageType);

    if (hits <= 0) {
      return {
        timestamp: Date.now(),
        characterId: summonId,
        characterName: summon.name,
        action: 'attack' as const,
        message: `${summon.name} cannot perform ${attackType} attacks`,
      };
    }

    // Calculate boss armor with reduction
    const bossBaseArmor = battleState.boss.armor || 0;
    const bossArmorReduction = battleState.bossArmorReduction || 0;
    const bossArmor = Math.max(0, bossBaseArmor - bossArmorReduction);

    // Apply buff conditions from toggles
    const toggles = summon.abilityToggles || {};
    let flatDamageBonus = 0;
    let extraHitsFromBuffs = 0;
    let damageMultiplier = 1;
    const buffSources: BuffSource[] = [];

    // HighGround: +50% damage
    if (toggles['HighGround']) {
      damageMultiplier *= 1.5;
      buffSources.push({ name: 'High Ground', damageMultiplier: 1.5 });
    }

    // Machine of War: +X% damage
    if (toggles['WarMachine'] && battleState.machineOfWar) {
      const mowMultiplier = 1 + (battleState.machineOfWar.extraDmgPct / 100);
      damageMultiplier *= mowMultiplier;
      buffSources.push({ name: 'Machine of War', damageMultiplier: mowMultiplier });
    }

    // Waaagh! buff from Gulgortz
    const sourceCharacter = battleState.team.find(c => c.id === summon.sourceCharacterId);
    if (sourceCharacter?.activeAbilities.includes('Waaagh')) {
      const waaghToggleId = `Waaagh_${sourceCharacter.id}_adjacent`;
      if (toggles[waaghToggleId]) {
        const waaghBuff = battleState.buffPool.find(b => b.sourceAbilityId === 'Waaagh');
        if (waaghBuff) {
          const levelIndex = sourceCharacter.abilityLevels?.['Waaagh'] ?? 54;
          const values = getAbilityValues('Waaagh', levelIndex, sourceCharacter.progressionStepIndex);
          if (values) {
            const extraDmg = values.extraDmg as number || 0;
            const extraHit = values.extraHit as number || 1;
            flatDamageBonus += extraDmg;
            extraHitsFromBuffs += extraHit;
            buffSources.push({ name: "Waaagh!", damageBonus: extraDmg, extraHits: extraHit });
          }
        }
      }
    }

    // Serene Unifier from Aun'Shi (only phase 3: Storm of Fire)
    for (const teammate of battleState.team) {
      if (teammate.id === summon.sourceCharacterId) continue;
      if (teammate.passiveAbilities.includes('SereneUnifier')) {
        const toggleId = `SereneUnifier_${teammate.id}_adjacent`;
        if (toggles[toggleId]) {
          // Check if it's phase 3 (Storm of Fire)
          const phase = ((battleState.turn - 1) % 3) + 1;
          if (phase === 3) {
            const levelIndex = teammate.abilityLevels?.['SereneUnifier'] ?? 54;
            const values = getAbilityValues('SereneUnifier', levelIndex, teammate.progressionStepIndex);
            if (values) {
              const extraDmg = values.extraDmg as number || 0;
              flatDamageBonus += extraDmg;
              buffSources.push({ name: 'Serene Unifier', damageBonus: extraDmg });
            }
          }
        }
      }
    }

    // Shock Assault from Bellator (for Inceptor summons adjacent to Bellator)
    if (summon.unitId === 'ultraSmnInceptor' && sourceCharacter?.passiveAbilities.includes('ShockAssault')) {
      const toggleId = `ShockAssault_${sourceCharacter.id}_adjacentToBellator`;
      if (toggles[toggleId]) {
        const levelIndex = sourceCharacter.abilityLevels?.['ShockAssault'] ?? 54;
        const values = getAbilityValues('ShockAssault', levelIndex, sourceCharacter.progressionStepIndex);
        if (values) {
          const extraDmg = values.extraDmg as number || 0;
          flatDamageBonus += extraDmg;
          buffSources.push({ name: 'Shock Assault', damageBonus: extraDmg });
        }
      }
    }

    // Summary Execution from Yarrick (for BattleFatigue summons)
    if (summon.traits?.includes('BattleFatigue')) {
      const yarrick = battleState.team.find(c => c.passiveAbilities.includes('SummaryExecution'));
      if (yarrick) {
        const levelIndex = yarrick.abilityLevels?.['SummaryExecution'] ?? 54;
        const values = getAbilityValues('SummaryExecution', levelIndex, yarrick.progressionStepIndex);
        if (values) {
          const extraDmg = values.extraDmg as number || 0;
          flatDamageBonus += extraDmg;
          buffSources.push({ name: 'Summary Execution', damageBonus: extraDmg });

          // Check for Execution happened toggle
          const toggleId = `SummaryExecution_${yarrick.id}_executed`;
          if (toggles[toggleId]) {
            const extraDmg2 = values.extraDmg_2 as number || 0;
            flatDamageBonus += extraDmg2;
            buffSources.push({ name: 'Summary Execution (Executed)', damageBonus: extraDmg2 });
          }
        }
      }
    }

    // Lord of the Host from Dante (for Flying/RapidAssault summons)
    const hasFlying = summon.traits?.includes('Flying');
    const hasRapidAssault = summon.traits?.includes('RapidAssault');
    if ((hasFlying || hasRapidAssault) && attackType === 'melee') {
      for (const teammate of battleState.team) {
        if (teammate.passiveAbilities.includes('LordOfTheHost')) {
          const dmgToggleId = `LordOfTheHost_${teammate.id}_damage`;
          if (toggles[dmgToggleId]) {
            const levelIndex = teammate.abilityLevels?.['LordOfTheHost'] ?? 54;
            const values = getAbilityValues('LordOfTheHost', levelIndex, teammate.progressionStepIndex);
            if (values) {
              const extraDmg = values.extraDmg as number || 0;
              flatDamageBonus += extraDmg;
              buffSources.push({ name: 'Lord of the Host', damageBonus: extraDmg });

              // Check for Low HP extra hit
              const hitsToggleId = `LordOfTheHost_${teammate.id}_hits`;
              if (toggles[hitsToggleId]) {
                extraHitsFromBuffs += 1;
                buffSources.push({ name: 'Lord of the Host (Low HP)', extraHits: 1 });
              }
            }
          }
          break; // Only one Dante can provide the buff
        }
      }
    }

    // Evaluate pool buffs for summons (Master Annihilator, etc.)
    // Create a minimal context for buff evaluation
    const summonAsAttacker = {
      id: summon.id,
      name: summon.name,
      traits: summon.traits || [],
      faction: '', // Summons don't have faction
      alliance: '', // Summons don't have alliance
      meleeDamageType: summon.meleeDamageType,
      rangedDamageType: summon.rangedDamageType || summon.meleeDamageType,
      abilityToggles: toggles,
      passiveAbilities: [],
      activeAbilities: [],
    } as unknown as BattleCharacter;

    const summonBuffContext: BuffEvaluationContext = {
      attacker: summonAsAttacker,
      attackType,
      attackCategory: 'normal',
      target: battleState.boss,
      battleState,
    };

    const applicablePoolBuffs = getApplicableBuffs(battleState.buffPool, summonBuffContext);
    const poolBuffEffects = combineBuffEffects(applicablePoolBuffs);

    // Track Master Annihilator extra hits separately for damage cap
    let masterAnnihilatorExtraHits = 0;
    const maDamageCap = battleState.masterAnnihilatorMaxDmg || 0;

    // Apply pool buff effects
    if (poolBuffEffects.extraHits) {
      // Check if this is from Master Annihilator
      const maBuff = applicablePoolBuffs.find(b => b.buffId === 'master_annihilator');
      if (maBuff && maBuff.effects.extraHits) {
        masterAnnihilatorExtraHits = maBuff.effects.extraHits;
        // Add other extra hits (non-MA) to the regular pool
        extraHitsFromBuffs += poolBuffEffects.extraHits - masterAnnihilatorExtraHits;
      } else {
        extraHitsFromBuffs += poolBuffEffects.extraHits;
      }
      // Add buff sources for display (MA will be handled separately with cap info)
      for (const buff of applicablePoolBuffs) {
        if (buff.effects.extraHits && buff.buffId !== 'master_annihilator') {
          buffSources.push({ name: buff.name, extraHits: buff.effects.extraHits });
        }
      }
    }
    if (poolBuffEffects.baseDamageBonus) {
      flatDamageBonus += poolBuffEffects.baseDamageBonus;
      for (const buff of applicablePoolBuffs) {
        if (buff.effects.baseDamageBonus) {
          buffSources.push({ name: buff.name, damageBonus: buff.effects.baseDamageBonus });
        }
      }
    }
    if (poolBuffEffects.baseDamageMultiplier && poolBuffEffects.baseDamageMultiplier !== 1) {
      damageMultiplier *= poolBuffEffects.baseDamageMultiplier;
      for (const buff of applicablePoolBuffs) {
        if (buff.effects.baseDamageMultiplier && buff.effects.baseDamageMultiplier !== 1) {
          buffSources.push({ name: buff.name, damageMultiplier: buff.effects.baseDamageMultiplier });
        }
      }
    }

    // Evaluate trait modifiers for summons (e.g., RapidAssault, BeastSnagga)
    if (summon.traits && summon.traits.length > 0) {
      const traitContext: TraitContext = {
        attackType,
        hasMoved: false, // Summons don't track movement
        hasAttackedThisBattle: summon.totalDamageDealt > 0,
        attacksThisTurn: 0, // Summons don't track attacks per turn
        firstAttackTurn: summon.totalDamageDealt > 0 ? summon.createdAtTurn : null,
        currentTurn: battleState.turn,
        targetTraits: battleState.boss?.traits || [],
        abilityToggles: toggles,
      };

      const traitEvaluation = evaluateTraitModifiers(summon.traits, traitContext);
      if (traitEvaluation.totalMultiplier !== 1) {
        damageMultiplier *= traitEvaluation.totalMultiplier;
        // Add applicable trait modifiers to buff sources
        for (const mod of traitEvaluation.modifiers) {
          if (mod.applicable) {
            buffSources.push({
              name: mod.traitName,
              damageMultiplier: mod.damageMultiplier,
            });
          }
        }
      }
    }

    // Calculate damage with buffs applied
    const baseDamage = summon.damage;
    const effectiveDamage = baseDamage + flatDamageBonus;
    // Include MA extra hits in effective hits for display, but handle damage separately
    const effectiveHits = hits + extraHitsFromBuffs + masterAnnihilatorExtraHits;
    const baseHits = hits + extraHitsFromBuffs; // Hits without MA cap
    const pierceRatio = 0.3; // Standard pierce ratio

    // Calculate damage per hit: max(baseDamage - armor, baseDamage * pierceRatio)
    const afterArmor = Math.max(0, effectiveDamage - bossArmor);
    const pierceFloor = Math.round(effectiveDamage * pierceRatio);
    let perHitDamage = Math.max(afterArmor, pierceFloor);

    // Apply damage multiplier
    perHitDamage = Math.round(perHitDamage * damageMultiplier);

    // Calculate total damage: base hits at full damage + MA hits at capped damage
    let totalDamage = perHitDamage * baseHits;
    let maCappedPerHit = perHitDamage;
    let maWasCapped = false;

    if (masterAnnihilatorExtraHits > 0) {
      // Apply damage cap for MA extra hit
      if (maDamageCap > 0 && perHitDamage > maDamageCap) {
        maCappedPerHit = maDamageCap;
        maWasCapped = true;
      }
      const maDamage = maCappedPerHit * masterAnnihilatorExtraHits;
      totalDamage += maDamage;

      // Add MA buff source with cap info
      buffSources.push({
        name: 'Master Annihilator',
        extraHits: masterAnnihilatorExtraHits,
        ...(maWasCapped ? { damageBonus: -1 } : {}), // Use damageBonus as flag for "capped"
      });
    }

    console.group(`=== ${summon.name} (${attackType}) ===`);
    console.log(`Base Damage: ${baseDamage}`);
    if (flatDamageBonus > 0) {
      console.log(`Flat Damage Bonus: +${flatDamageBonus}`);
      console.log(`Effective Damage: ${effectiveDamage}`);
    }
    console.log(`Boss Armor: ${bossArmor} (base ${bossBaseArmor} - ${bossArmorReduction} reduction)`);
    console.log(`After Armor: ${afterArmor}`);
    console.log(`Pierce Floor (${(pierceRatio * 100).toFixed(0)}%): ${pierceFloor}`);
    if (damageMultiplier !== 1) {
      console.log(`Damage Multiplier: ${damageMultiplier.toFixed(2)}x`);
    }
    if (extraHitsFromBuffs > 0) {
      console.log(`Extra Hits from Buffs: +${extraHitsFromBuffs}`);
    }
    if (masterAnnihilatorExtraHits > 0) {
      console.log(`Master Annihilator: +${masterAnnihilatorExtraHits} hit${maWasCapped ? ` (capped to ${maCappedPerHit})` : ''}`);
    }
    console.log(`Per Hit: ${perHitDamage} × ${effectiveHits} hits = ${totalDamage}`);
    if (buffSources.length > 0) {
      console.log('Buff Sources:', buffSources);
    }
    console.groupEnd();

    // Trigger Optimised Gait if summon has Mechanical trait
    const followUpAttackLogs: FollowUpAttackLog[] = [];
    let exitorRhoDamageToAdd = 0;
    let exitorRhoIdForUpdate: string | null = null;

    // Prophet of Gork and Mork tracking for OG trigger
    const prophetThreshold = battleState.prophetOfGorkAndMork?.attackThreshold ?? Infinity;
    const prophetReductionPct = battleState.prophetOfGorkAndMork?.damageReductionPct ?? 0;
    const prophetMultiplier = prophetReductionPct > 0 ? (100 - prophetReductionPct) / 100 : 1;
    let prophetAttackCounter = battleState.bossAttacksReceivedThisTurn + 1; // +1 for summon attack

    // Build defenderStats for OG calculation
    const defenderStats: DefenderStats = {
      armor: bossArmor,
      maxHealth: battleState.boss?.health || 0,
      traits: battleState.boss?.traits || [],
    };

    const ogResult = triggerOptimisedGait({
      triggeringAttackerId: summonId,
      triggeringAttackerName: summon.name,
      triggeringAttackerTraits: summon.traits,
      battleState,
      defenderStats,
      bossArmor,
      ignoreCrit: battleState.ignoreCrit,
      prophetAttackCounter,
      prophetThreshold,
      prophetReductionPct,
      prophetMultiplier,
    });

    if (ogResult) {
      totalDamage += ogResult.totalDamage;
      prophetAttackCounter = ogResult.prophetCounter;
      followUpAttackLogs.push(...ogResult.followUpLogs);
      exitorRhoDamageToAdd = ogResult.totalDamage;
      exitorRhoIdForUpdate = ogResult.exitorRhoId;
      console.log(`[Optimised Gait triggered by ${summon.name}]: +${ogResult.totalDamage} damage`);
    }

    // Update battle state with damage dealt (including Exitor-Rho's OG damage if triggered)
    set((state) => {
      if (!state.battleState) return { battleState: null };

      // Get summon-only damage (exclude OG damage from summon's tracking)
      const summonOnlyDamage = totalDamage - exitorRhoDamageToAdd;

      // Update team to add OG damage to Exitor-Rho's tracking
      const updatedTeam = exitorRhoIdForUpdate
        ? state.battleState.team.map((c) =>
            c.id === exitorRhoIdForUpdate
              ? { ...c, totalDamageDealt: c.totalDamageDealt + exitorRhoDamageToAdd }
              : c
          )
        : state.battleState.team;

      return {
        battleState: {
          ...state.battleState,
          totalDamageDealt: state.battleState.totalDamageDealt + totalDamage,
          bossAttacksReceivedThisTurn: prophetAttackCounter,
          team: updatedTeam,
          summons: state.battleState.summons.map((s) =>
            s.id === summonId
              ? { ...s, totalDamageDealt: s.totalDamageDealt + summonOnlyDamage }
              : s
          ),
        },
      };
    });

    // Build damage breakdown for display
    const damageBreakdown: DamageBreakdown = {
      damage: totalDamage,
      perHitDamage,
      hits: effectiveHits,
      baseDamage,
      flatModifiers: flatDamageBonus,
      flatModifierSources: buffSources.filter(s => s.damageBonus).map(s => ({ name: s.name, damageBonus: s.damageBonus })),
      critBonus: 0,
      critChanceSources: [],
      critDamageSources: [],
      extraHits: extraHitsFromBuffs,
      extraHitsSources: buffSources.filter(s => s.extraHits).map(s => ({ name: s.name, extraHits: s.extraHits })),
      damVarMod: effectiveDamage,
      targetArmor: bossArmor,
      afterArmor,
      pierceRatio,
      pierceFloor,
      afterArmorPierce: perHitDamage,
      globalMultiplier: damageMultiplier,
      globalMultiplierSources: buffSources.filter(s => s.damageMultiplier).map(s => ({ name: s.name, damageMultiplier: s.damageMultiplier })),
      baseCritChance: 0,
      baseCritDamage: 0,
      critChanceBonus: 0,
      critDmgBonus: 0,
      critChance: 0,
      critDamage: 0,
    };

    return {
      timestamp: Date.now(),
      characterId: summonId,
      characterName: summon.name,
      characterIconUrl: summon.iconUrl,
      action: attackType === 'melee' ? 'meleeAttack' as const : 'rangedAttack' as const,
      damage: totalDamage,
      damageBreakdown,
      damageType: damageType,
      message: `${summon.name} deals ${totalDamage.toLocaleString()} ${damageType} damage`,
      attackType,
      followUpAttacks: followUpAttackLogs.length > 0 ? followUpAttackLogs : undefined,
    };
  },

  /**
   * Execute The Betrayer bonus attack (Kharn)
   * Manual trigger for the "enemy defeated" bonus attack: 4x Eviscerate hits
   * Does NOT end Kharn's turn, but can only be used once per turn
   */
  executeTheBetrayerBonus: (characterId) => {
    const { battleState } = get();
    if (!battleState || !battleState.boss) {
      return {
        timestamp: Date.now(),
        characterId,
        characterName: 'Unknown',
        action: 'ability' as const,
        message: 'No battle in progress',
      };
    }

    const character = battleState.team.find((c) => c.id === characterId);
    if (!character) {
      return {
        timestamp: Date.now(),
        characterId,
        characterName: 'Unknown',
        action: 'ability' as const,
        message: 'Character not found',
      };
    }

    // Get TheBetrayer ability values
    const levelIndex = character.abilityLevels?.TheBetrayer ?? 54;
    const abilityValues = getAbilityValues('TheBetrayer', levelIndex, character.progressionStepIndex);
    if (!abilityValues) {
      return {
        timestamp: Date.now(),
        characterId,
        characterName: character.name,
        characterIconUrl: character.iconUrl,
        action: 'ability' as const,
        message: 'The Betrayer ability not found',
      };
    }

    const minDamage = abilityValues.minDmg as number || 0;
    const maxDamage = abilityValues.maxDmg as number || 0;
    const avgDamage = Math.round((minDamage + maxDamage) / 2);
    const hits = 4;  // Fixed 4 hits for The Betrayer
    const damageType: DamageType = 'Eviscerate';
    const attackType = 'melee';

    // Calculate boss armor
    const bossBaseArmor = battleState.boss.armor || 0;
    const bossArmorReduction = battleState.bossArmorReduction || 0;
    const bossArmor = Math.max(0, bossBaseArmor - bossArmorReduction);

    // Get equipment stats for crit calculation
    const equipmentStats = calculateEquipmentStats(character.equipment);
    const ignoreCrit = battleState.ignoreCrit || false;

    // === BUFF EVALUATION (same as executeAttack) ===

    // Build buff pool evaluation context (special attack from passive ability)
    const buffEvalContext: BuffEvaluationContext = {
      attacker: character,
      attackType,
      attackCategory: 'special',
      target: battleState.boss,
      battleState,
    };

    // Get applicable buffs from the pool
    const applicablePoolBuffs = getApplicableBuffs(battleState.buffPool, buffEvalContext);
    const poolBuffEffects = combineBuffEffects(applicablePoolBuffs);

    // Combine pool buffs with character's active buffs
    // HeraldOfTheApocalypse debuff: +extraDmg to next attack by any team member
    const heraldBonus = battleState.heraldExtraDmgDebuff || 0;
    const buffCritChanceBonus = character.activeBuffs.reduce(
      (sum, buff) => sum + (buff.critChanceBonus || 0), 0
    ) + (poolBuffEffects.critChanceBonus || 0);
    const buffDamageMultiplier = character.activeBuffs.reduce(
      (mult, buff) => mult * (buff.baseDamageMultiplier || 1), 1
    ) * (poolBuffEffects.baseDamageMultiplier || 1);
    const buffDamageBonus = character.activeBuffs.reduce(
      (sum, buff) => {
        if (buff.normalAttackOnly) return sum;  // Skip normalAttackOnly buffs for special attacks
        return sum + (buff.baseDamageBonus || 0);
      }, 0
    ) + (poolBuffEffects.baseDamageBonus || 0) + heraldBonus;
    const poolExtraHits = poolBuffEffects.extraHits || 0;
    const poolCritDmgBonus = poolBuffEffects.critDamageBonus || 0;
    const poolArmorIgnored = poolBuffEffects.armorIgnored || 0;
    // Blood Chalice and other activeBuffs pierce ratio bonus (check meleeOnly flag)
    const buffPierceRatioBonus = character.activeBuffs.reduce(
      (sum, buff) => {
        if (!buff.pierceRatioBonus) return sum;
        // Check if buff is melee only and we're not doing melee
        if (buff.meleeOnly && attackType !== 'melee') return sum;
        return sum + buff.pierceRatioBonus;
      }, 0
    );
    const poolPierceRatioBonus = (poolBuffEffects.pierceRatioBonus || 0) + buffPierceRatioBonus;

    // War Machine: dynamic damage multiplier based on selected Machine of War
    const warMachineMultiplier = character.abilityToggles['WarMachine'] && battleState.machineOfWar
      ? 1 + battleState.machineOfWar.extraDmgPct / 100
      : 1;

    // Build attacker stats for damage calculation
    const attackerStats: AttackerStats = {
      baseDamage: avgDamage,
      damageType,
      hits,
      critChance: (equipmentStats.critChance || 0) + (equipmentStats.critChanceBonus || 0),
      critDamage: (equipmentStats.critDmg || 0) + (equipmentStats.critDmgBonus || 0),
      critChanceBonus: 0,  // Buff crit bonus is passed via abilityModifiers
      critDmgBonus: 0,
      ignoreCrit,
      traits: character.traits,
      hasMoved: character.hasMoved,
      attackType,
      hasAttackedThisBattle: character.hasAttackedThisBattle,
      attacksThisTurn: character.attacksThisTurn,
      firstAttackTurn: character.firstAttackTurn ?? battleState.turn,
      currentTurn: battleState.turn,
      abilityToggles: character.abilityToggles,
    };

    // Find Trajann for LC +2 hits check
    const trajann = battleState.team.find(c => c.passiveAbilities.includes('LegendaryCommander'));
    const trajannIsAdjacentToBoss = isToggleActive(trajann?.abilityToggles['adjacentToBoss']);

    // Check if any Dark Angels teammate (not Asmodai) is adjacent to boss (for FearedInterrogator)
    const asmodai = battleState.team.find(c => c.passiveAbilities.includes('FearedInterrogator'));
    const darkAngelsAdjacentToBoss = asmodai ? battleState.team.some(c =>
      c.id !== asmodai.id && c.faction === 'DarkAngels' && c.abilityToggles['adjacentToBoss']
    ) : false;

    // Evaluate passive abilities
    const passiveResult = evaluatePassiveAbilities(
      character.passiveAbilities,
      character.abilityLevels || {},
      {
        characterId: character.id,
        progressionStepIndex: character.progressionStepIndex,
        hasMoved: character.hasMoved,
        hasActedThisBattle: character.hasAttackedThisBattle,
        attacksThisTurn: character.attacksThisTurn,
        attackTurnsCount: character.attackTurnsCount,
        hasUsedAbilityThisTurn: character.hasUsedAbilityThisTurn,
        hasQualifiedForLCDamage: character.hasQualifiedForLCDamage,
        currentHealth: character.currentHealth,
        maxHealth: character.calculatedHealth,
        currentTurn: battleState.turn,
        attackType,
        attackCategory: 'special',
        isFirstSpecialAttackOfTurn: !character.hasUsedFirstSpecialAttackThisTurn,
        trajannIsAdjacentToBoss,
        darkAngelsAdjacentToBoss,
        abilityToggles: character.abilityToggles,
        bossTraits: battleState.boss?.traits,
        bossDebuffs: battleState.bossHasMarkerlight ? ['Markerlight'] : [],
      }
    );

    // Combine passive ability modifiers
    const passiveModifiers = passiveResult.evaluations
      .filter(e => e.applicable)
      .map(e => e.modifiers);

    // Get aura bonuses from teammates
    const auraBonuses = getCharacterAuraBonuses(character, battleState.team);
    const activeAuras = auraBonuses.filter(a => {
      if (!a.isActive) return false;
      if (a.attackTypeRestriction && a.attackTypeRestriction !== attackType) return false;
      return true;
    });
    const auraModifiers = activeAuras.map(a => a.modifiers || {});

    // Build buff sources for display
    type BuffSourceType = { name: string; sourceName?: string; damageBonus?: number; damageMultiplier?: number; extraHits?: number; critChanceBonus?: number; critDamageBonus?: number; armorIgnored?: number; pierceRatioBonus?: number };
    const buffSources: BuffSourceType[] = [];

    // Add aura sources (merge entries with same name+source, e.g. SpotterReworked range2 + heavy)
    for (const a of activeAuras) {
      const source: BuffSourceType = { name: a.abilityName, sourceName: a.sourceCharacterName || 'Unknown' };
      if (a.modifiers?.baseDamageBonus) source.damageBonus = a.modifiers.baseDamageBonus;
      if (a.modifiers?.extraHits) source.extraHits = a.modifiers.extraHits;
      if (a.modifiers?.critChanceBonus) source.critChanceBonus = a.modifiers.critChanceBonus;
      if (a.modifiers?.critDamageBonus) source.critDamageBonus = a.modifiers.critDamageBonus;
      if (source.damageBonus || source.extraHits || source.critChanceBonus || source.critDamageBonus) {
        const key = `${source.name}_${source.sourceName}`;
        const existing = buffSources.find(b => `${b.name}_${b.sourceName}` === key);
        if (existing) {
          existing.damageBonus = (existing.damageBonus || 0) + (source.damageBonus || 0);
          existing.extraHits = (existing.extraHits || 0) + (source.extraHits || 0);
          existing.critChanceBonus = (existing.critChanceBonus || 0) + (source.critChanceBonus || 0);
          existing.critDamageBonus = (existing.critDamageBonus || 0) + (source.critDamageBonus || 0);
        } else {
          buffSources.push(source);
        }
      }
    }

    // Add passive ability sources
    for (const evaluation of passiveResult.evaluations) {
      if (evaluation.applicable && evaluation.modifiers) {
        const source: BuffSourceType = { name: evaluation.abilityName };
        if (evaluation.modifiers.baseDamageBonus) source.damageBonus = evaluation.modifiers.baseDamageBonus;
        if (evaluation.modifiers.extraHits) source.extraHits = evaluation.modifiers.extraHits;
        if (evaluation.modifiers.critDamageBonus) source.critDamageBonus = evaluation.modifiers.critDamageBonus;
        if (evaluation.modifiers.critChanceBonus) source.critChanceBonus = evaluation.modifiers.critChanceBonus;
        if (evaluation.modifiers.pierceRatioBonus) source.pierceRatioBonus = evaluation.modifiers.pierceRatioBonus;
        if (source.damageBonus || source.extraHits || source.critChanceBonus || source.critDamageBonus || source.pierceRatioBonus) {
          buffSources.push(source);
        }
      }
    }

    // Add pool buff sources
    for (const poolBuff of applicablePoolBuffs) {
      const source: BuffSourceType = { name: poolBuff.name };
      if (poolBuff.effects.baseDamageBonus) source.damageBonus = poolBuff.effects.baseDamageBonus;
      if (poolBuff.effects.extraHits) source.extraHits = poolBuff.effects.extraHits;
      if (poolBuff.effects.critChanceBonus) source.critChanceBonus = poolBuff.effects.critChanceBonus;
      if (poolBuff.effects.critDamageBonus) source.critDamageBonus = poolBuff.effects.critDamageBonus;
      if (poolBuff.effects.baseDamageMultiplier && poolBuff.effects.baseDamageMultiplier !== 1) {
        source.damageMultiplier = poolBuff.effects.baseDamageMultiplier;
      }
      if (poolBuff.effects.armorIgnored) source.armorIgnored = poolBuff.effects.armorIgnored;
      if (poolBuff.effects.pierceRatioBonus) source.pierceRatioBonus = poolBuff.effects.pierceRatioBonus;
      if (source.damageBonus || source.extraHits || source.critChanceBonus || source.critDamageBonus || source.damageMultiplier || source.armorIgnored || source.pierceRatioBonus) {
        buffSources.push(source);
      }
    }

    // Add Machine of War buff source
    if (warMachineMultiplier > 1 && battleState.machineOfWar) {
      buffSources.push({
        name: `Machine of War (+${battleState.machineOfWar.extraDmgPct}%)`,
        damageMultiplier: warMachineMultiplier,
      });
    }

    // Add Herald of the Apocalypse debuff source for display
    if (heraldBonus > 0) {
      buffSources.push({
        name: 'Herald of the Apocalypse',
        damageBonus: heraldBonus,
      });
    }

    // Add activeBuffs pierce ratio sources (e.g., Blood Chalice)
    for (const buff of character.activeBuffs) {
      if (buff.pierceRatioBonus && (!buff.meleeOnly || attackType === 'melee')) {
        buffSources.push({
          name: buff.abilityName || 'Active Buff',
          pierceRatioBonus: buff.pierceRatioBonus,
        });
      }
    }

    // Combine all modifiers
    const combinedMods = combineModifiers([...passiveModifiers, ...auraModifiers]);
    const totalCritChanceBonus = (combinedMods.critChanceBonus || 0) + buffCritChanceBonus;
    const buffCritDmgBonus = character.activeBuffs.reduce(
      (sum, buff) => sum + (buff.critDamageBonus || 0), 0
    ) + poolCritDmgBonus;
    const buffExtraHits = character.activeBuffs.reduce(
      (sum, buff) => sum + (buff.extraHits || 0), 0
    ) + poolExtraHits;
    const totalDamageMultiplier = (combinedMods.baseDamageMultiplier || 1) * buffDamageMultiplier * warMachineMultiplier;
    const totalDamageBonus = (combinedMods.baseDamageBonus || 0) + buffDamageBonus;
    const totalArmorIgnored = (combinedMods.armorIgnored || 0) + poolArmorIgnored;
    // Combine pierce ratio bonus from passive abilities and pool buffs (buffPierceRatioBonus already included in poolPierceRatioBonus)
    const totalPierceRatioBonus = (combinedMods.pierceRatioBonus || 0) + poolPierceRatioBonus;

    attackerStats.abilityModifiers = {
      ...combinedMods,
      baseDamageBonus: totalDamageBonus > 0 ? totalDamageBonus : undefined,
      baseDamageMultiplier: totalDamageMultiplier !== 1 ? totalDamageMultiplier : undefined,
      critChanceBonus: totalCritChanceBonus > 0 ? totalCritChanceBonus : undefined,
      critDamageBonus: (combinedMods.critDamageBonus || 0) + buffCritDmgBonus > 0 ? (combinedMods.critDamageBonus || 0) + buffCritDmgBonus : undefined,
      extraHits: (combinedMods.extraHits || 0) + buffExtraHits > 0 ? (combinedMods.extraHits || 0) + buffExtraHits : undefined,
      armorIgnored: totalArmorIgnored > 0 ? totalArmorIgnored : undefined,
      pierceRatioBonus: totalPierceRatioBonus > 0 ? totalPierceRatioBonus : undefined,
      buffSources,
    };

    // Check if boss has Daemon trait for block mechanic
    const hasDaemonTraitBetrayer = battleState.boss?.traits?.includes('Daemon') ?? false;

    // Defender stats (boss)
    const defenderStats: DefenderStats = {
      armor: bossArmor,
      maxHealth: battleState.boss?.health ?? 100000,
      traits: battleState.boss.traits,
      // Daemon block stats
      daemonBlockChance: hasDaemonTraitBetrayer ? 0.25 : undefined,
      daemonBlockMaxAmount: hasDaemonTraitBetrayer ? (battleState.boss?.damage ?? 0) * 0.5 : undefined,
    };

    // Calculate damage
    const calculator = new DamageCalculator(true);
    const result = calculator.calculate(attackerStats, defenderStats);

    console.group(`=== The Betrayer Execute (${character.name}) ===`);
    console.log(`Base Damage: ${avgDamage} (${minDamage}-${maxDamage})`);
    console.log(`Hits: ${hits}`);
    console.log(`Damage Type: ${damageType}`);
    if (buffSources.length > 0) {
      console.log(`Active Buffs: ${buffSources.map(b => b.name).join(', ')}`);
    }
    calculator.printLogs();
    console.groupEnd();

    // Update battle state (set hasUsedTheBetrayerThisTurn = true)
    set((state) => ({
      battleState: state.battleState
        ? {
            ...state.battleState,
            totalDamageDealt: state.battleState.totalDamageDealt + result.damage,
            // HeraldOfTheApocalypse: Clear debuff after it's consumed by this attack
            ...(heraldBonus > 0 ? { heraldExtraDmgDebuff: undefined } : {}),
            team: state.battleState.team.map((c) =>
              c.id === characterId
                ? { ...c, totalDamageDealt: c.totalDamageDealt + result.damage, hasUsedTheBetrayerThisTurn: true }
                : c
            ),
          }
        : null,
    }));

    // Build damage breakdown for display
    const damageBreakdown: DamageBreakdown = {
      damage: result.damage,
      perHitDamage: result.perHitDamage,
      hits: result.totalHits,
      baseDamage: avgDamage,
      flatModifiers: result.flatModifiers,
      flatModifierSources: result.flatModifierSources || [],
      critBonus: result.critBonus,
      critChanceSources: result.critChanceSources || [],
      critDamageSources: result.critDamageSources || [],
      extraHits: result.extraHits,
      extraHitsSources: result.extraHitsSources || [],
      damVarMod: result.damVarMod,
      targetArmor: bossArmor,
      armorIgnored: result.armorIgnored,
      armorIgnoredSources: result.armorIgnoredSources,
      effectiveArmor: result.effectiveArmor,
      afterArmor: result.afterArmor,
      pierceRatio: result.pierceRatio,
      effectivePierceRatio: result.effectivePierceRatio,
      pierceRatioBonus: result.pierceRatioBonus,
      pierceRatioBonusSources: result.pierceRatioBonusSources,
      pierceFloor: result.pierceFloor,
      afterArmorPierce: result.afterArmorPierce,
      globalMultiplier: result.globalMultiplier,
      globalMultiplierSources: result.globalMultiplierSources || [],
      baseCritChance: equipmentStats.critChance || 0,
      baseCritDamage: equipmentStats.critDmg || 0,
      critChanceBonus: equipmentStats.critChanceBonus || 0,
      critDmgBonus: equipmentStats.critDmgBonus || 0,
      critChance: result.effectiveCritChance,
      critDamage: result.effectiveCritDamage,
      // Block reduction (Daemon trait)
      expectedBlocks: result.expectedBlocks,
      blockReductionPerHit: result.blockReductionPerHit,
      totalBlockReduction: result.totalBlockReduction,
    };

    return {
      timestamp: Date.now(),
      characterId,
      characterName: character.name,
      characterIconUrl: character.iconUrl,
      action: 'ability' as const,
      damage: result.damage,
      damageBreakdown,
      damageType: damageType,
      attackType: 'melee' as const,
      message: `The Betrayer deals ${result.damage.toLocaleString()} damage (${hits}x ${damageType})`,
    };
  },

  /**
   * Execute Overwatch attack
   * Available for characters with Overwatch trait (once per turn) or after Early Warning Override (+extraDmg)
   * Attack type depends on adjacency: melee if adjacent to boss, ranged otherwise
   * LionHelm (Azrael) provides +extraDmg to Overwatch attacks for characters in range 2
   */
  executeOverwatchAttack: (characterId) => {
    const { battleState, executeAttack } = get();
    if (!battleState || !battleState.boss) {
      return {
        timestamp: Date.now(),
        characterId,
        characterName: 'Unknown',
        action: 'rangedAttack' as const,
        message: 'Battle not active',
      };
    }

    const character = battleState.team.find((c) => c.id === characterId);
    if (!character) {
      return {
        timestamp: Date.now(),
        characterId,
        characterName: 'Unknown',
        action: 'rangedAttack' as const,
        message: 'Character not found',
      };
    }

    // Determine attack type based on adjacency
    // Exception: CalibaniteGreatsword Strike Stance always uses melee attack
    const isAdjacentToBoss = character.abilityToggles?.['adjacentToBoss'] ?? false;
    const hasCalibaniteGreatsword = character.activeAbilities?.includes('CalibaniteGreatsword') ?? false;
    const calibaniteStance = character.calibaniteGreatswordStance ?? 'strike';
    const isCalibaniteStrikeStance = hasCalibaniteGreatsword && calibaniteStance === 'strike';
    const attackType = isCalibaniteStrikeStance ? 'melee' : (isAdjacentToBoss ? 'melee' : 'ranged');

    // Build array of damage bonus sources for detailed breakdown
    const damageBonusSources: DamageBonusSource[] = [];

    // Get Overwatch extra damage from Early Warning Override (Re'vas)
    const hasOverwatchActive = character.overwatchActive ?? false;
    const ewoExtraDmg = hasOverwatchActive ? (character.overwatchExtraDmg || 0) : 0;
    if (ewoExtraDmg > 0) {
      damageBonusSources.push({
        name: 'Early Warning Override',
        bonus: ewoExtraDmg,
      });
    }

    // Check for LionHelm (Azrael) bonus - adds extraDmg to Overwatch attacks
    // For Azrael himself: always active (no toggle needed)
    // For other characters: requires "Range 2 from Azrael" toggle
    const azrael = battleState.team.find((c) => c.passiveAbilities.includes('LionHelm'));
    if (azrael) {
      const isAzrael = character.id === azrael.id;
      const lionHelmToggleId = `LionHelm_${azrael.id}_overwatch`;
      const hasLionHelmBonus = isAzrael || (character.abilityToggles?.[lionHelmToggleId] ?? false);

      if (hasLionHelmBonus) {
        const lionHelmLevelIndex = azrael.abilityLevels?.['LionHelm'] ?? 54;
        const lionHelmValues = getAbilityValues('LionHelm', lionHelmLevelIndex, azrael.progressionStepIndex);
        const lionHelmExtraDmg = (lionHelmValues?.extraDmg as number) || 0;
        if (lionHelmExtraDmg > 0) {
          damageBonusSources.push({
            name: 'Lion Helm',
            bonus: lionHelmExtraDmg,
          });
        }
      }
    }

    // Calculate total bonus for display
    const totalOverwatchBonus = damageBonusSources.reduce((sum, src) => sum + src.bonus, 0);

    // Execute attack with damage bonus sources and Overwatch flag
    const result = executeAttack(characterId, 'boss', attackType, damageBonusSources.length > 0 ? {
      damageBonusSources,
      isOverwatchAttack: true,
    } : { isOverwatchAttack: true });

    // Mark Overwatch as used this turn and deactivate ability bonus (EWO bonus only)
    set((state) => ({
      battleState: state.battleState
        ? {
            ...state.battleState,
            team: state.battleState.team.map((c) =>
              c.id === characterId
                ? { ...c, hasUsedOverwatchThisTurn: true, overwatchActive: false }
                : c
            ),
          }
        : null,
    }));

    const bonusText = totalOverwatchBonus > 0 ? ` (+${totalOverwatchBonus} bonus)` : '';
    console.log(`[Overwatch ${attackType} attack${bonusText}]`);

    return {
      ...result,
      message: `Overwatch ${attackType} deals ${result.damage?.toLocaleString() || 0} damage${bonusText}`,
    };
  },

  /**
   * Execute Fury of the Ancients attack (Mephiston)
   * Manual trigger for the Psychic melee attack: 2x Psychic hits
   * Does NOT end Mephiston's turn, but can only be used once per turn
   */
  executeFuryOfTheAncients: (characterId) => {
    const { battleState } = get();
    if (!battleState || !battleState.boss) {
      return {
        timestamp: Date.now(),
        characterId,
        characterName: 'Unknown',
        action: 'ability' as const,
        message: 'No battle in progress',
      };
    }

    const character = battleState.team.find((c) => c.id === characterId);
    if (!character) {
      return {
        timestamp: Date.now(),
        characterId,
        characterName: 'Unknown',
        action: 'ability' as const,
        message: 'Character not found',
      };
    }

    // Get FuryOfTheAncients ability values
    const levelIndex = character.abilityLevels?.FuryOfTheAncients ?? 54;
    const abilityValues = getAbilityValues('FuryOfTheAncients', levelIndex, character.progressionStepIndex);
    if (!abilityValues) {
      return {
        timestamp: Date.now(),
        characterId,
        characterName: character.name,
        characterIconUrl: character.iconUrl,
        action: 'ability' as const,
        message: 'Fury of the Ancients ability not found',
      };
    }

    const minDamage = abilityValues.minDmg as number || 0;
    const maxDamage = abilityValues.maxDmg as number || 0;
    const avgDamage = Math.round((minDamage + maxDamage) / 2);
    const hits = abilityValues.nrOfHits as number || 2;
    const damageType: DamageType = 'Psychic';
    const attackType = 'melee';

    // Calculate boss armor
    const bossBaseArmor = battleState.boss.armor || 0;
    const bossArmorReduction = battleState.bossArmorReduction || 0;
    const bossArmor = Math.max(0, bossBaseArmor - bossArmorReduction);

    // Get equipment stats for crit calculation
    const equipmentStats = calculateEquipmentStats(character.equipment);
    const ignoreCrit = battleState.ignoreCrit || false;

    // === BUFF EVALUATION ===
    const buffEvalContext: BuffEvaluationContext = {
      attacker: character,
      attackType,
      attackCategory: 'special',
      target: battleState.boss,
      battleState,
    };

    const applicablePoolBuffs = getApplicableBuffs(battleState.buffPool, buffEvalContext);
    const poolBuffEffects = combineBuffEffects(applicablePoolBuffs);

    // HeraldOfTheApocalypse debuff: +extraDmg to next attack by any team member
    const heraldBonus = battleState.heraldExtraDmgDebuff || 0;
    const buffCritChanceBonus = character.activeBuffs.reduce(
      (sum, buff) => sum + (buff.critChanceBonus || 0), 0
    ) + (poolBuffEffects.critChanceBonus || 0);
    const buffDamageMultiplier = character.activeBuffs.reduce(
      (mult, buff) => mult * (buff.baseDamageMultiplier || 1), 1
    ) * (poolBuffEffects.baseDamageMultiplier || 1);
    const buffDamageBonus = character.activeBuffs.reduce(
      (sum, buff) => {
        if (buff.normalAttackOnly) return sum;  // Skip normalAttackOnly buffs for special attacks
        return sum + (buff.baseDamageBonus || 0);
      }, 0
    ) + (poolBuffEffects.baseDamageBonus || 0) + heraldBonus;
    const poolExtraHits = poolBuffEffects.extraHits || 0;
    const poolCritDmgBonus = poolBuffEffects.critDamageBonus || 0;
    const poolArmorIgnored = poolBuffEffects.armorIgnored || 0;
    // Blood Chalice and other activeBuffs pierce ratio bonus (check meleeOnly flag)
    const buffPierceRatioBonus = character.activeBuffs.reduce(
      (sum, buff) => {
        if (!buff.pierceRatioBonus) return sum;
        // Check if buff is melee only and we're not doing melee
        if (buff.meleeOnly && attackType !== 'melee') return sum;
        return sum + buff.pierceRatioBonus;
      }, 0
    );
    const poolPierceRatioBonus = (poolBuffEffects.pierceRatioBonus || 0) + buffPierceRatioBonus;

    // War Machine multiplier
    const warMachineMultiplier = character.abilityToggles['WarMachine'] && battleState.machineOfWar
      ? 1 + battleState.machineOfWar.extraDmgPct / 100
      : 1;

    // Build attacker stats
    const attackerStats: AttackerStats = {
      baseDamage: avgDamage,
      damageType,
      hits,
      critChance: (equipmentStats.critChance || 0) + (equipmentStats.critChanceBonus || 0),
      critDamage: (equipmentStats.critDmg || 0) + (equipmentStats.critDmgBonus || 0),
      critChanceBonus: 0,
      critDmgBonus: 0,
      ignoreCrit,
      traits: character.traits,
      hasMoved: character.hasMoved,
      attackType,
      hasAttackedThisBattle: character.hasAttackedThisBattle,
      attacksThisTurn: character.attacksThisTurn,
      firstAttackTurn: character.firstAttackTurn ?? battleState.turn,
      currentTurn: battleState.turn,
      abilityToggles: character.abilityToggles,
    };

    // Evaluate aura bonuses
    const auraBonuses = getCharacterAuraBonuses(character, battleState.team);
    const activeAuras = auraBonuses.filter(a => {
      if (!a.isActive) return false;
      if (a.attackTypeRestriction && a.attackTypeRestriction !== attackType) return false;
      return true;
    });
    const auraModifiers = activeAuras.map(a => a.modifiers || {});

    // Build buff sources
    type BuffSourceType = { name: string; sourceName?: string; damageBonus?: number; damageMultiplier?: number; extraHits?: number; critChanceBonus?: number; critDamageBonus?: number; armorIgnored?: number; pierceRatioBonus?: number };
    const buffSources: BuffSourceType[] = [];

    // Merge aura entries with same name+source (e.g. SpotterReworked range2 + heavy)
    for (const a of activeAuras) {
      const source: BuffSourceType = { name: a.abilityName, sourceName: a.sourceCharacterName || 'Unknown' };
      if (a.modifiers?.baseDamageBonus) source.damageBonus = a.modifiers.baseDamageBonus;
      if (a.modifiers?.extraHits) source.extraHits = a.modifiers.extraHits;
      if (a.modifiers?.critChanceBonus) source.critChanceBonus = a.modifiers.critChanceBonus;
      if (a.modifiers?.critDamageBonus) source.critDamageBonus = a.modifiers.critDamageBonus;
      if (source.damageBonus || source.extraHits || source.critChanceBonus || source.critDamageBonus) {
        const key = `${source.name}_${source.sourceName}`;
        const existing = buffSources.find(b => `${b.name}_${b.sourceName}` === key);
        if (existing) {
          existing.damageBonus = (existing.damageBonus || 0) + (source.damageBonus || 0);
          existing.extraHits = (existing.extraHits || 0) + (source.extraHits || 0);
          existing.critChanceBonus = (existing.critChanceBonus || 0) + (source.critChanceBonus || 0);
          existing.critDamageBonus = (existing.critDamageBonus || 0) + (source.critDamageBonus || 0);
        } else {
          buffSources.push(source);
        }
      }
    }

    for (const poolBuff of applicablePoolBuffs) {
      const source: BuffSourceType = { name: poolBuff.name };
      if (poolBuff.effects.baseDamageBonus) source.damageBonus = poolBuff.effects.baseDamageBonus;
      if (poolBuff.effects.extraHits) source.extraHits = poolBuff.effects.extraHits;
      if (poolBuff.effects.critChanceBonus) source.critChanceBonus = poolBuff.effects.critChanceBonus;
      if (poolBuff.effects.critDamageBonus) source.critDamageBonus = poolBuff.effects.critDamageBonus;
      if (poolBuff.effects.baseDamageMultiplier && poolBuff.effects.baseDamageMultiplier !== 1) {
        source.damageMultiplier = poolBuff.effects.baseDamageMultiplier;
      }
      if (poolBuff.effects.armorIgnored) source.armorIgnored = poolBuff.effects.armorIgnored;
      if (poolBuff.effects.pierceRatioBonus) source.pierceRatioBonus = poolBuff.effects.pierceRatioBonus;
      if (source.damageBonus || source.extraHits || source.critChanceBonus || source.critDamageBonus || source.damageMultiplier || source.armorIgnored || source.pierceRatioBonus) {
        buffSources.push(source);
      }
    }

    if (warMachineMultiplier > 1 && battleState.machineOfWar) {
      buffSources.push({
        name: `Machine of War (+${battleState.machineOfWar.extraDmgPct}%)`,
        damageMultiplier: warMachineMultiplier,
      });
    }

    // Add Herald of the Apocalypse debuff source for display
    if (heraldBonus > 0) {
      buffSources.push({
        name: 'Herald of the Apocalypse',
        damageBonus: heraldBonus,
      });
    }

    // Add activeBuffs pierce ratio sources (e.g., Blood Chalice)
    for (const buff of character.activeBuffs) {
      if (buff.pierceRatioBonus && (!buff.meleeOnly || attackType === 'melee')) {
        buffSources.push({
          name: buff.abilityName || 'Active Buff',
          pierceRatioBonus: buff.pierceRatioBonus,
        });
      }
    }

    // Combine modifiers
    const combinedMods = combineModifiers(auraModifiers);
    const totalCritChanceBonus = (combinedMods.critChanceBonus || 0) + buffCritChanceBonus;
    const buffCritDmgBonus = character.activeBuffs.reduce(
      (sum, buff) => sum + (buff.critDamageBonus || 0), 0
    ) + poolCritDmgBonus;
    const buffExtraHits = character.activeBuffs.reduce(
      (sum, buff) => sum + (buff.extraHits || 0), 0
    ) + poolExtraHits;
    const totalDamageMultiplier = (combinedMods.baseDamageMultiplier || 1) * buffDamageMultiplier * warMachineMultiplier;
    const totalDamageBonus = (combinedMods.baseDamageBonus || 0) + buffDamageBonus;
    const totalArmorIgnored = (combinedMods.armorIgnored || 0) + poolArmorIgnored;
    // buffPierceRatioBonus already included in poolPierceRatioBonus
    const totalPierceRatioBonus = (combinedMods.pierceRatioBonus || 0) + poolPierceRatioBonus;

    attackerStats.abilityModifiers = {
      ...combinedMods,
      baseDamageBonus: totalDamageBonus > 0 ? totalDamageBonus : undefined,
      baseDamageMultiplier: totalDamageMultiplier !== 1 ? totalDamageMultiplier : undefined,
      critChanceBonus: totalCritChanceBonus > 0 ? totalCritChanceBonus : undefined,
      critDamageBonus: (combinedMods.critDamageBonus || 0) + buffCritDmgBonus > 0 ? (combinedMods.critDamageBonus || 0) + buffCritDmgBonus : undefined,
      extraHits: (combinedMods.extraHits || 0) + buffExtraHits > 0 ? (combinedMods.extraHits || 0) + buffExtraHits : undefined,
      armorIgnored: totalArmorIgnored > 0 ? totalArmorIgnored : undefined,
      pierceRatioBonus: totalPierceRatioBonus > 0 ? totalPierceRatioBonus : undefined,
      buffSources,
    };

    // Daemon block check
    const hasDaemonTrait = battleState.boss?.traits?.includes('Daemon') ?? false;

    const defenderStats: DefenderStats = {
      armor: bossArmor,
      maxHealth: battleState.boss?.health ?? 100000,
      traits: battleState.boss.traits,
      daemonBlockChance: hasDaemonTrait ? 0.25 : undefined,
      daemonBlockMaxAmount: hasDaemonTrait ? (battleState.boss?.damage ?? 0) * 0.5 : undefined,
    };

    // Calculate damage
    const calculator = new DamageCalculator(true);
    const result = calculator.calculate(attackerStats, defenderStats);

    console.group(`=== Fury of the Ancients Execute (${character.name}) ===`);
    console.log(`Base Damage: ${avgDamage} (${minDamage}-${maxDamage})`);
    console.log(`Hits: ${hits}`);
    console.log(`Damage Type: ${damageType}`);
    if (buffSources.length > 0) {
      console.log(`Active Buffs: ${buffSources.map(b => b.name).join(', ')}`);
    }
    calculator.printLogs();
    console.groupEnd();

    // Update battle state
    set((state) => ({
      battleState: state.battleState
        ? {
            ...state.battleState,
            totalDamageDealt: state.battleState.totalDamageDealt + result.damage,
            // HeraldOfTheApocalypse: Clear debuff after it's consumed by this attack
            ...(heraldBonus > 0 ? { heraldExtraDmgDebuff: undefined } : {}),
            team: state.battleState.team.map((c) =>
              c.id === characterId
                ? { ...c, totalDamageDealt: c.totalDamageDealt + result.damage, hasUsedFuryOfTheAncientsThisTurn: true }
                : c
            ),
          }
        : null,
    }));

    // Build damage breakdown
    const damageBreakdown: DamageBreakdown = {
      damage: result.damage,
      perHitDamage: result.perHitDamage,
      hits: result.totalHits,
      baseDamage: avgDamage,
      flatModifiers: result.flatModifiers,
      flatModifierSources: result.flatModifierSources || [],
      critBonus: result.critBonus,
      critChanceSources: result.critChanceSources || [],
      critDamageSources: result.critDamageSources || [],
      extraHits: result.extraHits,
      extraHitsSources: result.extraHitsSources || [],
      damVarMod: result.damVarMod,
      targetArmor: bossArmor,
      armorIgnored: result.armorIgnored,
      armorIgnoredSources: result.armorIgnoredSources,
      effectiveArmor: result.effectiveArmor,
      afterArmor: result.afterArmor,
      pierceRatio: result.pierceRatio,
      effectivePierceRatio: result.effectivePierceRatio,
      pierceRatioBonus: result.pierceRatioBonus,
      pierceRatioBonusSources: result.pierceRatioBonusSources,
      pierceFloor: result.pierceFloor,
      afterArmorPierce: result.afterArmorPierce,
      globalMultiplier: result.globalMultiplier,
      globalMultiplierSources: result.globalMultiplierSources || [],
      baseCritChance: equipmentStats.critChance || 0,
      baseCritDamage: equipmentStats.critDmg || 0,
      critChanceBonus: equipmentStats.critChanceBonus || 0,
      critDmgBonus: equipmentStats.critDmgBonus || 0,
      critChance: result.effectiveCritChance,
      critDamage: result.effectiveCritDamage,
      expectedBlocks: result.expectedBlocks,
      blockReductionPerHit: result.blockReductionPerHit,
      totalBlockReduction: result.totalBlockReduction,
    };

    return {
      timestamp: Date.now(),
      characterId,
      characterName: character.name,
      characterIconUrl: character.iconUrl,
      action: 'ability' as const,
      damage: result.damage,
      damageBreakdown,
      damageType: damageType,
      attackType: 'melee' as const,
      message: `Fury of the Ancients deals ${result.damage.toLocaleString()} damage (${hits}x ${damageType})`,
    };
  },

  /**
   * Execute Martial Superiority attack (Jaeger)
   * Manual trigger for preemptive strike: 2x Power hits
   * Does NOT end Jaeger's turn, but can only be used once per turn
   */
  executeMartialSuperiority: (characterId) => {
    const { battleState } = get();
    if (!battleState || !battleState.boss) {
      return {
        timestamp: Date.now(),
        characterId,
        characterName: 'Unknown',
        action: 'ability' as const,
        message: 'No battle in progress',
      };
    }

    const character = battleState.team.find((c) => c.id === characterId);
    if (!character) {
      return {
        timestamp: Date.now(),
        characterId,
        characterName: 'Unknown',
        action: 'ability' as const,
        message: 'Character not found',
      };
    }

    // Get MartialSuperiority ability values
    const levelIndex = character.abilityLevels?.MartialSuperiority ?? 54;
    const abilityValues = getAbilityValues('MartialSuperiority', levelIndex, character.progressionStepIndex);
    if (!abilityValues) {
      return {
        timestamp: Date.now(),
        characterId,
        characterName: character.name,
        characterIconUrl: character.iconUrl,
        action: 'ability' as const,
        message: 'Martial Superiority ability not found',
      };
    }

    const minDamage = abilityValues.minDmg as number || 0;
    const maxDamage = abilityValues.maxDmg as number || 0;
    const avgDamage = Math.round((minDamage + maxDamage) / 2);
    const hits = abilityValues.nrOfHits as number || 2;
    const damageType: DamageType = 'Power';
    const attackType = 'melee';

    // Calculate boss armor
    const bossBaseArmor = battleState.boss.armor || 0;
    const bossArmorReduction = battleState.bossArmorReduction || 0;
    const bossArmor = Math.max(0, bossBaseArmor - bossArmorReduction);

    // Get equipment stats for crit calculation
    const equipmentStats = calculateEquipmentStats(character.equipment);
    const ignoreCrit = battleState.ignoreCrit || false;

    // === BUFF EVALUATION ===
    const buffEvalContext: BuffEvaluationContext = {
      attacker: character,
      attackType,
      attackCategory: 'special',
      target: battleState.boss,
      battleState,
    };

    const applicablePoolBuffs = getApplicableBuffs(battleState.buffPool, buffEvalContext);
    const poolBuffEffects = combineBuffEffects(applicablePoolBuffs);

    // HeraldOfTheApocalypse debuff: +extraDmg to next attack by any team member
    const heraldBonus = battleState.heraldExtraDmgDebuff || 0;
    const buffCritChanceBonus = character.activeBuffs.reduce(
      (sum, buff) => sum + (buff.critChanceBonus || 0), 0
    ) + (poolBuffEffects.critChanceBonus || 0);
    const buffDamageMultiplier = character.activeBuffs.reduce(
      (mult, buff) => mult * (buff.baseDamageMultiplier || 1), 1
    ) * (poolBuffEffects.baseDamageMultiplier || 1);
    const buffDamageBonus = character.activeBuffs.reduce(
      (sum, buff) => {
        if (buff.normalAttackOnly) return sum;  // Skip normalAttackOnly buffs for special attacks
        return sum + (buff.baseDamageBonus || 0);
      }, 0
    ) + (poolBuffEffects.baseDamageBonus || 0) + heraldBonus;
    const poolExtraHits = poolBuffEffects.extraHits || 0;
    const poolCritDmgBonus = poolBuffEffects.critDamageBonus || 0;
    const poolArmorIgnored = poolBuffEffects.armorIgnored || 0;
    // Blood Chalice and other activeBuffs pierce ratio bonus (check meleeOnly flag)
    const buffPierceRatioBonus = character.activeBuffs.reduce(
      (sum, buff) => {
        if (!buff.pierceRatioBonus) return sum;
        if (buff.meleeOnly && attackType !== 'melee') return sum;
        return sum + buff.pierceRatioBonus;
      }, 0
    );
    const poolPierceRatioBonus = (poolBuffEffects.pierceRatioBonus || 0) + buffPierceRatioBonus;

    // War Machine multiplier
    const warMachineMultiplier = character.abilityToggles['WarMachine'] && battleState.machineOfWar
      ? 1 + battleState.machineOfWar.extraDmgPct / 100
      : 1;

    // Build attacker stats
    const attackerStats: AttackerStats = {
      baseDamage: avgDamage,
      damageType,
      hits,
      critChance: (equipmentStats.critChance || 0) + (equipmentStats.critChanceBonus || 0),
      critDamage: (equipmentStats.critDmg || 0) + (equipmentStats.critDmgBonus || 0),
      critChanceBonus: 0,
      critDmgBonus: 0,
      ignoreCrit,
      traits: character.traits,
      hasMoved: character.hasMoved,
      attackType,
      hasAttackedThisBattle: character.hasAttackedThisBattle,
      attacksThisTurn: character.attacksThisTurn,
      firstAttackTurn: character.firstAttackTurn ?? battleState.turn,
      currentTurn: battleState.turn,
      abilityToggles: character.abilityToggles,
    };

    // Evaluate aura bonuses
    const auraBonuses = getCharacterAuraBonuses(character, battleState.team);
    const activeAuras = auraBonuses.filter(a => {
      if (!a.isActive) return false;
      if (a.attackTypeRestriction && a.attackTypeRestriction !== attackType) return false;
      return true;
    });
    const auraModifiers = activeAuras.map(a => a.modifiers || {});

    // Build buff sources
    type BuffSourceType = { name: string; sourceName?: string; damageBonus?: number; damageMultiplier?: number; extraHits?: number; critChanceBonus?: number; critDamageBonus?: number; armorIgnored?: number; pierceRatioBonus?: number };
    const buffSources: BuffSourceType[] = [];

    // Merge aura entries with same name+source (e.g. SpotterReworked range2 + heavy)
    for (const a of activeAuras) {
      const source: BuffSourceType = { name: a.abilityName, sourceName: a.sourceCharacterName || 'Unknown' };
      if (a.modifiers?.baseDamageBonus) source.damageBonus = a.modifiers.baseDamageBonus;
      if (a.modifiers?.extraHits) source.extraHits = a.modifiers.extraHits;
      if (a.modifiers?.critChanceBonus) source.critChanceBonus = a.modifiers.critChanceBonus;
      if (a.modifiers?.critDamageBonus) source.critDamageBonus = a.modifiers.critDamageBonus;
      if (source.damageBonus || source.extraHits || source.critChanceBonus || source.critDamageBonus) {
        const key = `${source.name}_${source.sourceName}`;
        const existing = buffSources.find(b => `${b.name}_${b.sourceName}` === key);
        if (existing) {
          existing.damageBonus = (existing.damageBonus || 0) + (source.damageBonus || 0);
          existing.extraHits = (existing.extraHits || 0) + (source.extraHits || 0);
          existing.critChanceBonus = (existing.critChanceBonus || 0) + (source.critChanceBonus || 0);
          existing.critDamageBonus = (existing.critDamageBonus || 0) + (source.critDamageBonus || 0);
        } else {
          buffSources.push(source);
        }
      }
    }

    for (const poolBuff of applicablePoolBuffs) {
      const source: BuffSourceType = { name: poolBuff.name };
      if (poolBuff.effects.baseDamageBonus) source.damageBonus = poolBuff.effects.baseDamageBonus;
      if (poolBuff.effects.extraHits) source.extraHits = poolBuff.effects.extraHits;
      if (poolBuff.effects.critChanceBonus) source.critChanceBonus = poolBuff.effects.critChanceBonus;
      if (poolBuff.effects.critDamageBonus) source.critDamageBonus = poolBuff.effects.critDamageBonus;
      if (poolBuff.effects.baseDamageMultiplier && poolBuff.effects.baseDamageMultiplier !== 1) {
        source.damageMultiplier = poolBuff.effects.baseDamageMultiplier;
      }
      if (poolBuff.effects.armorIgnored) source.armorIgnored = poolBuff.effects.armorIgnored;
      if (poolBuff.effects.pierceRatioBonus) source.pierceRatioBonus = poolBuff.effects.pierceRatioBonus;
      if (source.damageBonus || source.extraHits || source.critChanceBonus || source.critDamageBonus || source.damageMultiplier || source.armorIgnored || source.pierceRatioBonus) {
        buffSources.push(source);
      }
    }

    if (warMachineMultiplier > 1 && battleState.machineOfWar) {
      buffSources.push({
        name: `Machine of War (+${battleState.machineOfWar.extraDmgPct}%)`,
        damageMultiplier: warMachineMultiplier,
      });
    }

    // Add Herald of the Apocalypse debuff source for display
    if (heraldBonus > 0) {
      buffSources.push({
        name: 'Herald of the Apocalypse',
        damageBonus: heraldBonus,
      });
    }

    // Add activeBuffs pierce ratio sources (e.g., Blood Chalice)
    for (const buff of character.activeBuffs) {
      if (buff.pierceRatioBonus && (!buff.meleeOnly || attackType === 'melee')) {
        buffSources.push({
          name: buff.abilityName || 'Active Buff',
          pierceRatioBonus: buff.pierceRatioBonus,
        });
      }
    }

    // Combine modifiers
    const combinedMods = combineModifiers(auraModifiers);
    const totalCritChanceBonus = (combinedMods.critChanceBonus || 0) + buffCritChanceBonus;
    const buffCritDmgBonus = character.activeBuffs.reduce(
      (sum, buff) => sum + (buff.critDamageBonus || 0), 0
    ) + poolCritDmgBonus;
    const buffExtraHits = character.activeBuffs.reduce(
      (sum, buff) => sum + (buff.extraHits || 0), 0
    ) + poolExtraHits;
    const totalDamageMultiplier = (combinedMods.baseDamageMultiplier || 1) * buffDamageMultiplier * warMachineMultiplier;
    const totalDamageBonus = (combinedMods.baseDamageBonus || 0) + buffDamageBonus;
    const totalArmorIgnored = (combinedMods.armorIgnored || 0) + poolArmorIgnored;
    const totalPierceRatioBonus = (combinedMods.pierceRatioBonus || 0) + poolPierceRatioBonus;

    attackerStats.abilityModifiers = {
      ...combinedMods,
      baseDamageBonus: totalDamageBonus > 0 ? totalDamageBonus : undefined,
      baseDamageMultiplier: totalDamageMultiplier !== 1 ? totalDamageMultiplier : undefined,
      critChanceBonus: totalCritChanceBonus > 0 ? totalCritChanceBonus : undefined,
      critDamageBonus: (combinedMods.critDamageBonus || 0) + buffCritDmgBonus > 0 ? (combinedMods.critDamageBonus || 0) + buffCritDmgBonus : undefined,
      extraHits: (combinedMods.extraHits || 0) + buffExtraHits > 0 ? (combinedMods.extraHits || 0) + buffExtraHits : undefined,
      armorIgnored: totalArmorIgnored > 0 ? totalArmorIgnored : undefined,
      pierceRatioBonus: totalPierceRatioBonus > 0 ? totalPierceRatioBonus : undefined,
      buffSources,
    };

    // Daemon block check
    const hasDaemonTrait = battleState.boss?.traits?.includes('Daemon') ?? false;

    const defenderStats: DefenderStats = {
      armor: bossArmor,
      maxHealth: battleState.boss?.health ?? 100000,
      traits: battleState.boss.traits,
      daemonBlockChance: hasDaemonTrait ? 0.25 : undefined,
      daemonBlockMaxAmount: hasDaemonTrait ? (battleState.boss?.damage ?? 0) * 0.5 : undefined,
    };

    // Calculate damage
    const calculator = new DamageCalculator(true);
    const result = calculator.calculate(attackerStats, defenderStats);

    console.group(`=== Martial Superiority Execute (${character.name}) ===`);
    console.log(`Base Damage: ${avgDamage} (${minDamage}-${maxDamage})`);
    console.log(`Hits: ${hits}`);
    console.log(`Damage Type: ${damageType}`);
    if (buffSources.length > 0) {
      console.log(`Active Buffs: ${buffSources.map(b => b.name).join(', ')}`);
    }
    calculator.printLogs();
    console.groupEnd();

    // Update battle state
    set((state) => ({
      battleState: state.battleState
        ? {
            ...state.battleState,
            totalDamageDealt: state.battleState.totalDamageDealt + result.damage,
            // HeraldOfTheApocalypse: Clear debuff after it's consumed by this attack
            ...(heraldBonus > 0 ? { heraldExtraDmgDebuff: undefined } : {}),
            team: state.battleState.team.map((c) =>
              c.id === characterId
                ? { ...c, totalDamageDealt: c.totalDamageDealt + result.damage, hasUsedMartialSuperiorityThisTurn: true }
                : c
            ),
          }
        : null,
    }));

    // Build damage breakdown
    const damageBreakdown: DamageBreakdown = {
      damage: result.damage,
      perHitDamage: result.perHitDamage,
      hits: result.totalHits,
      baseDamage: avgDamage,
      flatModifiers: result.flatModifiers,
      flatModifierSources: result.flatModifierSources || [],
      critBonus: result.critBonus,
      critChanceSources: result.critChanceSources || [],
      critDamageSources: result.critDamageSources || [],
      extraHits: result.extraHits,
      extraHitsSources: result.extraHitsSources || [],
      damVarMod: result.damVarMod,
      targetArmor: bossArmor,
      armorIgnored: result.armorIgnored,
      armorIgnoredSources: result.armorIgnoredSources,
      effectiveArmor: result.effectiveArmor,
      afterArmor: result.afterArmor,
      pierceRatio: result.pierceRatio,
      effectivePierceRatio: result.effectivePierceRatio,
      pierceRatioBonus: result.pierceRatioBonus,
      pierceRatioBonusSources: result.pierceRatioBonusSources,
      pierceFloor: result.pierceFloor,
      afterArmorPierce: result.afterArmorPierce,
      globalMultiplier: result.globalMultiplier,
      globalMultiplierSources: result.globalMultiplierSources || [],
      baseCritChance: equipmentStats.critChance || 0,
      baseCritDamage: equipmentStats.critDmg || 0,
      critChanceBonus: equipmentStats.critChanceBonus || 0,
      critDmgBonus: equipmentStats.critDmgBonus || 0,
      critChance: result.effectiveCritChance,
      critDamage: result.effectiveCritDamage,
      expectedBlocks: result.expectedBlocks,
      blockReductionPerHit: result.blockReductionPerHit,
      totalBlockReduction: result.totalBlockReduction,
    };

    return {
      timestamp: Date.now(),
      characterId,
      characterName: character.name,
      characterIconUrl: character.iconUrl,
      action: 'ability' as const,
      damage: result.damage,
      damageBreakdown,
      damageType: damageType,
      attackType: 'melee' as const,
      message: `Martial Superiority deals ${result.damage.toLocaleString()} damage (${hits}x ${damageType})`,
    };
  },

  /**
   * Execute Hateful Assault attack (Angrax)
   * Bonus melee attack: 2x Power hits
   * Does NOT end turn, can only be used once per turn
   */
  executeHatefulAssault: (characterId) => {
    const { battleState } = get();
    if (!battleState || !battleState.boss) {
      return {
        timestamp: Date.now(),
        characterId,
        characterName: 'Unknown',
        action: 'ability' as const,
        message: 'No battle in progress',
      };
    }

    const character = battleState.team.find((c) => c.id === characterId);
    if (!character) {
      return {
        timestamp: Date.now(),
        characterId,
        characterName: 'Unknown',
        action: 'ability' as const,
        message: 'Character not found',
      };
    }

    // Get HatefulAssault ability values
    const levelIndex = character.abilityLevels?.HatefulAssault ?? 54;
    const abilityValues = getAbilityValues('HatefulAssault', levelIndex, character.progressionStepIndex);
    if (!abilityValues) {
      return {
        timestamp: Date.now(),
        characterId,
        characterName: character.name,
        characterIconUrl: character.iconUrl,
        action: 'ability' as const,
        message: 'Hateful Assault ability not found',
      };
    }

    const minDamage = abilityValues.minDmg as number || 0;
    const maxDamage = abilityValues.maxDmg as number || 0;
    const avgDamage = Math.round((minDamage + maxDamage) / 2);
    const hits = abilityValues.nrOfHits as number || 2;
    const damageType: DamageType = 'Power';
    const attackType = 'melee';

    // Calculate boss armor
    const bossBaseArmor = battleState.boss.armor || 0;
    const bossArmorReduction = battleState.bossArmorReduction || 0;
    const bossArmor = Math.max(0, bossBaseArmor - bossArmorReduction);

    // Get equipment stats for crit calculation
    const equipmentStats = calculateEquipmentStats(character.equipment);
    const ignoreCrit = battleState.ignoreCrit || false;

    // === BUFF EVALUATION ===
    const buffEvalContext: BuffEvaluationContext = {
      attacker: character,
      attackType,
      attackCategory: 'special',
      target: battleState.boss,
      battleState,
    };

    const applicablePoolBuffs = getApplicableBuffs(battleState.buffPool, buffEvalContext);
    const poolBuffEffects = combineBuffEffects(applicablePoolBuffs);

    // HeraldOfTheApocalypse debuff: +extraDmg to next attack by any team member
    const heraldBonus = battleState.heraldExtraDmgDebuff || 0;
    const buffCritChanceBonus = character.activeBuffs.reduce(
      (sum, buff) => sum + (buff.critChanceBonus || 0), 0
    ) + (poolBuffEffects.critChanceBonus || 0);
    const buffDamageMultiplier = character.activeBuffs.reduce(
      (mult, buff) => mult * (buff.baseDamageMultiplier || 1), 1
    ) * (poolBuffEffects.baseDamageMultiplier || 1);
    const buffDamageBonus = character.activeBuffs.reduce(
      (sum, buff) => {
        if (buff.normalAttackOnly) return sum;  // Skip normalAttackOnly buffs for special attacks
        return sum + (buff.baseDamageBonus || 0);
      }, 0
    ) + (poolBuffEffects.baseDamageBonus || 0) + heraldBonus;
    const poolExtraHits = poolBuffEffects.extraHits || 0;
    const poolCritDmgBonus = poolBuffEffects.critDamageBonus || 0;
    const poolArmorIgnored = poolBuffEffects.armorIgnored || 0;
    // Blood Chalice and other activeBuffs pierce ratio bonus (check meleeOnly flag)
    const buffPierceRatioBonus = character.activeBuffs.reduce(
      (sum, buff) => {
        if (!buff.pierceRatioBonus) return sum;
        if (buff.meleeOnly && attackType !== 'melee') return sum;
        return sum + buff.pierceRatioBonus;
      }, 0
    );
    const poolPierceRatioBonus = (poolBuffEffects.pierceRatioBonus || 0) + buffPierceRatioBonus;

    // War Machine multiplier
    const warMachineMultiplier = character.abilityToggles['WarMachine'] && battleState.machineOfWar
      ? 1 + battleState.machineOfWar.extraDmgPct / 100
      : 1;

    // Build attacker stats
    const attackerStats: AttackerStats = {
      baseDamage: avgDamage,
      damageType,
      hits,
      critChance: (equipmentStats.critChance || 0) + (equipmentStats.critChanceBonus || 0),
      critDamage: (equipmentStats.critDmg || 0) + (equipmentStats.critDmgBonus || 0),
      critChanceBonus: 0,
      critDmgBonus: 0,
      ignoreCrit,
      traits: character.traits,
      hasMoved: character.hasMoved,
      attackType,
      hasAttackedThisBattle: character.hasAttackedThisBattle,
      attacksThisTurn: character.attacksThisTurn,
      firstAttackTurn: character.firstAttackTurn ?? battleState.turn,
      currentTurn: battleState.turn,
      abilityToggles: character.abilityToggles,
    };

    // Evaluate aura bonuses
    const auraBonuses = getCharacterAuraBonuses(character, battleState.team);
    const activeAuras = auraBonuses.filter(a => {
      if (!a.isActive) return false;
      if (a.attackTypeRestriction && a.attackTypeRestriction !== attackType) return false;
      return true;
    });
    const auraModifiers = activeAuras.map(a => a.modifiers || {});

    // Build buff sources
    type BuffSourceType = { name: string; sourceName?: string; damageBonus?: number; damageMultiplier?: number; extraHits?: number; critChanceBonus?: number; critDamageBonus?: number; armorIgnored?: number; pierceRatioBonus?: number };
    const buffSources: BuffSourceType[] = [];

    // Merge aura entries with same name+source
    for (const a of activeAuras) {
      const source: BuffSourceType = { name: a.abilityName, sourceName: a.sourceCharacterName || 'Unknown' };
      if (a.modifiers?.baseDamageBonus) source.damageBonus = a.modifiers.baseDamageBonus;
      if (a.modifiers?.extraHits) source.extraHits = a.modifiers.extraHits;
      if (a.modifiers?.critChanceBonus) source.critChanceBonus = a.modifiers.critChanceBonus;
      if (a.modifiers?.critDamageBonus) source.critDamageBonus = a.modifiers.critDamageBonus;
      if (source.damageBonus || source.extraHits || source.critChanceBonus || source.critDamageBonus) {
        const key = `${source.name}_${source.sourceName}`;
        const existing = buffSources.find(b => `${b.name}_${b.sourceName}` === key);
        if (existing) {
          existing.damageBonus = (existing.damageBonus || 0) + (source.damageBonus || 0);
          existing.extraHits = (existing.extraHits || 0) + (source.extraHits || 0);
          existing.critChanceBonus = (existing.critChanceBonus || 0) + (source.critChanceBonus || 0);
          existing.critDamageBonus = (existing.critDamageBonus || 0) + (source.critDamageBonus || 0);
        } else {
          buffSources.push(source);
        }
      }
    }

    for (const poolBuff of applicablePoolBuffs) {
      const source: BuffSourceType = { name: poolBuff.name };
      if (poolBuff.effects.baseDamageBonus) source.damageBonus = poolBuff.effects.baseDamageBonus;
      if (poolBuff.effects.extraHits) source.extraHits = poolBuff.effects.extraHits;
      if (poolBuff.effects.critChanceBonus) source.critChanceBonus = poolBuff.effects.critChanceBonus;
      if (poolBuff.effects.critDamageBonus) source.critDamageBonus = poolBuff.effects.critDamageBonus;
      if (poolBuff.effects.baseDamageMultiplier && poolBuff.effects.baseDamageMultiplier !== 1) {
        source.damageMultiplier = poolBuff.effects.baseDamageMultiplier;
      }
      if (poolBuff.effects.armorIgnored) source.armorIgnored = poolBuff.effects.armorIgnored;
      if (poolBuff.effects.pierceRatioBonus) source.pierceRatioBonus = poolBuff.effects.pierceRatioBonus;
      if (source.damageBonus || source.extraHits || source.critChanceBonus || source.critDamageBonus || source.damageMultiplier || source.armorIgnored || source.pierceRatioBonus) {
        buffSources.push(source);
      }
    }

    if (warMachineMultiplier > 1 && battleState.machineOfWar) {
      buffSources.push({
        name: `Machine of War (+${battleState.machineOfWar.extraDmgPct}%)`,
        damageMultiplier: warMachineMultiplier,
      });
    }

    // Add Herald of the Apocalypse debuff source for display
    if (heraldBonus > 0) {
      buffSources.push({
        name: 'Herald of the Apocalypse',
        damageBonus: heraldBonus,
      });
    }

    // Add activeBuffs pierce ratio sources (e.g., Blood Chalice)
    for (const buff of character.activeBuffs) {
      if (buff.pierceRatioBonus && (!buff.meleeOnly || attackType === 'melee')) {
        buffSources.push({
          name: buff.abilityName || 'Active Buff',
          pierceRatioBonus: buff.pierceRatioBonus,
        });
      }
    }

    // Combine modifiers
    const combinedMods = combineModifiers(auraModifiers);
    const totalCritChanceBonus = (combinedMods.critChanceBonus || 0) + buffCritChanceBonus;
    const buffCritDmgBonus = character.activeBuffs.reduce(
      (sum, buff) => sum + (buff.critDamageBonus || 0), 0
    ) + poolCritDmgBonus;
    const buffExtraHits = character.activeBuffs.reduce(
      (sum, buff) => sum + (buff.extraHits || 0), 0
    ) + poolExtraHits;
    const totalDamageMultiplier = (combinedMods.baseDamageMultiplier || 1) * buffDamageMultiplier * warMachineMultiplier;
    const totalDamageBonus = (combinedMods.baseDamageBonus || 0) + buffDamageBonus;
    const totalArmorIgnored = (combinedMods.armorIgnored || 0) + poolArmorIgnored;
    const totalPierceRatioBonus = (combinedMods.pierceRatioBonus || 0) + poolPierceRatioBonus;

    attackerStats.abilityModifiers = {
      ...combinedMods,
      baseDamageBonus: totalDamageBonus > 0 ? totalDamageBonus : undefined,
      baseDamageMultiplier: totalDamageMultiplier !== 1 ? totalDamageMultiplier : undefined,
      critChanceBonus: totalCritChanceBonus > 0 ? totalCritChanceBonus : undefined,
      critDamageBonus: (combinedMods.critDamageBonus || 0) + buffCritDmgBonus > 0 ? (combinedMods.critDamageBonus || 0) + buffCritDmgBonus : undefined,
      extraHits: (combinedMods.extraHits || 0) + buffExtraHits > 0 ? (combinedMods.extraHits || 0) + buffExtraHits : undefined,
      armorIgnored: totalArmorIgnored > 0 ? totalArmorIgnored : undefined,
      pierceRatioBonus: totalPierceRatioBonus > 0 ? totalPierceRatioBonus : undefined,
      buffSources,
    };

    // Daemon block check
    const hasDaemonTrait = battleState.boss?.traits?.includes('Daemon') ?? false;

    const defenderStats: DefenderStats = {
      armor: bossArmor,
      maxHealth: battleState.boss?.health ?? 100000,
      traits: battleState.boss.traits,
      daemonBlockChance: hasDaemonTrait ? 0.25 : undefined,
      daemonBlockMaxAmount: hasDaemonTrait ? (battleState.boss?.damage ?? 0) * 0.5 : undefined,
    };

    // Calculate damage
    const calculator = new DamageCalculator(true);
    const result = calculator.calculate(attackerStats, defenderStats);

    console.group(`=== Hateful Assault Execute (${character.name}) ===`);
    console.log(`Base Damage: ${avgDamage} (${minDamage}-${maxDamage})`);
    console.log(`Hits: ${hits}`);
    console.log(`Damage Type: ${damageType}`);
    if (buffSources.length > 0) {
      console.log(`Active Buffs: ${buffSources.map(b => b.name).join(', ')}`);
    }
    calculator.printLogs();
    console.groupEnd();

    // Update battle state
    set((state) => ({
      battleState: state.battleState
        ? {
            ...state.battleState,
            totalDamageDealt: state.battleState.totalDamageDealt + result.damage,
            // HeraldOfTheApocalypse: Clear debuff after it's consumed by this attack
            ...(heraldBonus > 0 ? { heraldExtraDmgDebuff: undefined } : {}),
            team: state.battleState.team.map((c) =>
              c.id === characterId
                ? { ...c, totalDamageDealt: c.totalDamageDealt + result.damage, hasUsedHatefulAssaultThisTurn: true }
                : c
            ),
          }
        : null,
    }));

    // Build damage breakdown
    const damageBreakdown: DamageBreakdown = {
      damage: result.damage,
      perHitDamage: result.perHitDamage,
      hits: result.totalHits,
      baseDamage: avgDamage,
      flatModifiers: result.flatModifiers,
      flatModifierSources: result.flatModifierSources || [],
      critBonus: result.critBonus,
      critChanceSources: result.critChanceSources || [],
      critDamageSources: result.critDamageSources || [],
      extraHits: result.extraHits,
      extraHitsSources: result.extraHitsSources || [],
      damVarMod: result.damVarMod,
      targetArmor: bossArmor,
      armorIgnored: result.armorIgnored,
      armorIgnoredSources: result.armorIgnoredSources,
      effectiveArmor: result.effectiveArmor,
      afterArmor: result.afterArmor,
      pierceRatio: result.pierceRatio,
      effectivePierceRatio: result.effectivePierceRatio,
      pierceRatioBonus: result.pierceRatioBonus,
      pierceRatioBonusSources: result.pierceRatioBonusSources,
      pierceFloor: result.pierceFloor,
      afterArmorPierce: result.afterArmorPierce,
      globalMultiplier: result.globalMultiplier,
      globalMultiplierSources: result.globalMultiplierSources || [],
      baseCritChance: equipmentStats.critChance || 0,
      baseCritDamage: equipmentStats.critDmg || 0,
      critChanceBonus: equipmentStats.critChanceBonus || 0,
      critDmgBonus: equipmentStats.critDmgBonus || 0,
      critChance: result.effectiveCritChance,
      critDamage: result.effectiveCritDamage,
      expectedBlocks: result.expectedBlocks,
      blockReductionPerHit: result.blockReductionPerHit,
      totalBlockReduction: result.totalBlockReduction,
    };

    return {
      timestamp: Date.now(),
      characterId,
      characterName: character.name,
      characterIconUrl: character.iconUrl,
      action: 'ability' as const,
      damage: result.damage,
      damageBreakdown,
      damageType: damageType,
      attackType: 'melee' as const,
      message: `Hateful Assault deals ${result.damage.toLocaleString()} damage (${hits}x ${damageType})`,
    };
  },

  /**
   * Execute Unwavering Sentinel attack (Tyrith)
   * Bonus ranged attack: 2x Bolter hits
   * Does NOT end Tyrith's turn, unlimited uses per turn
   */
  executeUnwaveringSentinel: (characterId) => {
    const { battleState } = get();
    if (!battleState || !battleState.boss) {
      return {
        timestamp: Date.now(),
        characterId,
        characterName: 'Unknown',
        action: 'ability' as const,
        message: 'No battle in progress',
      };
    }

    const character = battleState.team.find((c) => c.id === characterId);
    if (!character) {
      return {
        timestamp: Date.now(),
        characterId,
        characterName: 'Unknown',
        action: 'ability' as const,
        message: 'Character not found',
      };
    }

    // Get UnwaveringSentinel ability values
    const levelIndex = character.abilityLevels?.UnwaveringSentinel ?? 54;
    const abilityValues = getAbilityValues('UnwaveringSentinel', levelIndex, character.progressionStepIndex);
    if (!abilityValues) {
      return {
        timestamp: Date.now(),
        characterId,
        characterName: character.name,
        characterIconUrl: character.iconUrl,
        action: 'ability' as const,
        message: 'Unwavering Sentinel ability not found',
      };
    }

    const minDamage = abilityValues.minDmg as number || 0;
    const maxDamage = abilityValues.maxDmg as number || 0;
    const avgDamage = Math.round((minDamage + maxDamage) / 2);
    const hits = abilityValues.nrOfHits as number || 2;
    const damageType: DamageType = 'Bolter';
    const attackType = 'ranged' as const;

    // Calculate boss armor
    const bossBaseArmor = battleState.boss.armor || 0;
    const bossArmorReduction = battleState.bossArmorReduction || 0;
    const bossArmor = Math.max(0, bossBaseArmor - bossArmorReduction);

    // Get equipment stats for crit calculation
    const equipmentStats = calculateEquipmentStats(character.equipment);
    const ignoreCrit = battleState.ignoreCrit || false;

    // === BUFF EVALUATION ===
    const buffEvalContext: BuffEvaluationContext = {
      attacker: character,
      attackType,
      attackCategory: 'special',
      target: battleState.boss,
      battleState,
    };

    const applicablePoolBuffs = getApplicableBuffs(battleState.buffPool, buffEvalContext);
    const poolBuffEffects = combineBuffEffects(applicablePoolBuffs);

    // HeraldOfTheApocalypse debuff: +extraDmg to next attack by any team member
    const heraldBonus = battleState.heraldExtraDmgDebuff || 0;
    const buffCritChanceBonus = character.activeBuffs.reduce(
      (sum, buff) => sum + (buff.critChanceBonus || 0), 0
    ) + (poolBuffEffects.critChanceBonus || 0);
    const buffDamageMultiplier = character.activeBuffs.reduce(
      (mult, buff) => mult * (buff.baseDamageMultiplier || 1), 1
    ) * (poolBuffEffects.baseDamageMultiplier || 1);
    const buffDamageBonus = character.activeBuffs.reduce(
      (sum, buff) => {
        if (buff.normalAttackOnly) return sum;
        return sum + (buff.baseDamageBonus || 0);
      }, 0
    ) + (poolBuffEffects.baseDamageBonus || 0) + heraldBonus;
    const poolExtraHits = poolBuffEffects.extraHits || 0;
    const poolCritDmgBonus = poolBuffEffects.critDamageBonus || 0;
    const poolArmorIgnored = poolBuffEffects.armorIgnored || 0;
    const buffPierceRatioBonus = character.activeBuffs.reduce(
      (sum, buff) => {
        if (!buff.pierceRatioBonus) return sum;
        if (buff.meleeOnly) return sum;  // Skip melee-only buffs for ranged attack
        return sum + buff.pierceRatioBonus;
      }, 0
    );
    const poolPierceRatioBonus = (poolBuffEffects.pierceRatioBonus || 0) + buffPierceRatioBonus;

    // War Machine multiplier
    const warMachineMultiplier = character.abilityToggles['WarMachine'] && battleState.machineOfWar
      ? 1 + battleState.machineOfWar.extraDmgPct / 100
      : 1;

    // Build attacker stats
    const attackerStats: AttackerStats = {
      baseDamage: avgDamage,
      damageType,
      hits,
      critChance: (equipmentStats.critChance || 0) + (equipmentStats.critChanceBonus || 0),
      critDamage: (equipmentStats.critDmg || 0) + (equipmentStats.critDmgBonus || 0),
      critChanceBonus: 0,
      critDmgBonus: 0,
      ignoreCrit,
      traits: character.traits,
      hasMoved: character.hasMoved,
      attackType: 'ranged',
      hasAttackedThisBattle: character.hasAttackedThisBattle,
      attacksThisTurn: character.attacksThisTurn,
      firstAttackTurn: character.firstAttackTurn ?? battleState.turn,
      currentTurn: battleState.turn,
      abilityToggles: character.abilityToggles,
    };

    // Evaluate aura bonuses
    const auraBonuses = getCharacterAuraBonuses(character, battleState.team);
    const activeAuras = auraBonuses.filter(a => {
      if (!a.isActive) return false;
      if (a.attackTypeRestriction && a.attackTypeRestriction !== 'ranged') return false;
      return true;
    });
    const auraModifiers = activeAuras.map(a => a.modifiers || {});

    // Build buff sources
    type BuffSourceType = { name: string; sourceName?: string; damageBonus?: number; damageMultiplier?: number; extraHits?: number; critChanceBonus?: number; critDamageBonus?: number; armorIgnored?: number; pierceRatioBonus?: number };
    const buffSources: BuffSourceType[] = [];

    for (const a of activeAuras) {
      const source: BuffSourceType = { name: a.abilityName, sourceName: a.sourceCharacterName || 'Unknown' };
      if (a.modifiers?.baseDamageBonus) source.damageBonus = a.modifiers.baseDamageBonus;
      if (a.modifiers?.extraHits) source.extraHits = a.modifiers.extraHits;
      if (a.modifiers?.critChanceBonus) source.critChanceBonus = a.modifiers.critChanceBonus;
      if (a.modifiers?.critDamageBonus) source.critDamageBonus = a.modifiers.critDamageBonus;
      if (source.damageBonus || source.extraHits || source.critChanceBonus || source.critDamageBonus) {
        const key = `${source.name}_${source.sourceName}`;
        const existing = buffSources.find(b => `${b.name}_${b.sourceName}` === key);
        if (existing) {
          existing.damageBonus = (existing.damageBonus || 0) + (source.damageBonus || 0);
          existing.extraHits = (existing.extraHits || 0) + (source.extraHits || 0);
          existing.critChanceBonus = (existing.critChanceBonus || 0) + (source.critChanceBonus || 0);
          existing.critDamageBonus = (existing.critDamageBonus || 0) + (source.critDamageBonus || 0);
        } else {
          buffSources.push(source);
        }
      }
    }

    for (const poolBuff of applicablePoolBuffs) {
      const source: BuffSourceType = { name: poolBuff.name };
      if (poolBuff.effects.baseDamageBonus) source.damageBonus = poolBuff.effects.baseDamageBonus;
      if (poolBuff.effects.extraHits) source.extraHits = poolBuff.effects.extraHits;
      if (poolBuff.effects.critChanceBonus) source.critChanceBonus = poolBuff.effects.critChanceBonus;
      if (poolBuff.effects.critDamageBonus) source.critDamageBonus = poolBuff.effects.critDamageBonus;
      if (poolBuff.effects.baseDamageMultiplier && poolBuff.effects.baseDamageMultiplier !== 1) {
        source.damageMultiplier = poolBuff.effects.baseDamageMultiplier;
      }
      if (poolBuff.effects.armorIgnored) source.armorIgnored = poolBuff.effects.armorIgnored;
      if (poolBuff.effects.pierceRatioBonus) source.pierceRatioBonus = poolBuff.effects.pierceRatioBonus;
      if (source.damageBonus || source.extraHits || source.critChanceBonus || source.critDamageBonus || source.damageMultiplier || source.armorIgnored || source.pierceRatioBonus) {
        buffSources.push(source);
      }
    }

    if (warMachineMultiplier > 1 && battleState.machineOfWar) {
      buffSources.push({
        name: `Machine of War (+${battleState.machineOfWar.extraDmgPct}%)`,
        damageMultiplier: warMachineMultiplier,
      });
    }

    // Add Herald of the Apocalypse debuff source for display
    if (heraldBonus > 0) {
      buffSources.push({
        name: 'Herald of the Apocalypse',
        damageBonus: heraldBonus,
      });
    }

    for (const buff of character.activeBuffs) {
      if (buff.pierceRatioBonus && !buff.meleeOnly) {
        buffSources.push({
          name: buff.abilityName || 'Active Buff',
          pierceRatioBonus: buff.pierceRatioBonus,
        });
      }
    }

    // Combine modifiers
    const combinedMods = combineModifiers(auraModifiers);
    const totalCritChanceBonus = (combinedMods.critChanceBonus || 0) + buffCritChanceBonus;
    const buffCritDmgBonus = character.activeBuffs.reduce(
      (sum, buff) => sum + (buff.critDamageBonus || 0), 0
    ) + poolCritDmgBonus;
    const buffExtraHits = character.activeBuffs.reduce(
      (sum, buff) => sum + (buff.extraHits || 0), 0
    ) + poolExtraHits;
    const totalDamageMultiplier = (combinedMods.baseDamageMultiplier || 1) * buffDamageMultiplier * warMachineMultiplier;
    const totalDamageBonus = (combinedMods.baseDamageBonus || 0) + buffDamageBonus;
    const totalArmorIgnored = (combinedMods.armorIgnored || 0) + poolArmorIgnored;
    const totalPierceRatioBonus = (combinedMods.pierceRatioBonus || 0) + poolPierceRatioBonus;

    attackerStats.abilityModifiers = {
      ...combinedMods,
      baseDamageBonus: totalDamageBonus > 0 ? totalDamageBonus : undefined,
      baseDamageMultiplier: totalDamageMultiplier !== 1 ? totalDamageMultiplier : undefined,
      critChanceBonus: totalCritChanceBonus > 0 ? totalCritChanceBonus : undefined,
      critDamageBonus: (combinedMods.critDamageBonus || 0) + buffCritDmgBonus > 0 ? (combinedMods.critDamageBonus || 0) + buffCritDmgBonus : undefined,
      extraHits: (combinedMods.extraHits || 0) + buffExtraHits > 0 ? (combinedMods.extraHits || 0) + buffExtraHits : undefined,
      armorIgnored: totalArmorIgnored > 0 ? totalArmorIgnored : undefined,
      pierceRatioBonus: totalPierceRatioBonus > 0 ? totalPierceRatioBonus : undefined,
      buffSources,
    };

    // Daemon block check
    const hasDaemonTrait = battleState.boss?.traits?.includes('Daemon') ?? false;

    const defenderStats: DefenderStats = {
      armor: bossArmor,
      maxHealth: battleState.boss?.health ?? 100000,
      traits: battleState.boss.traits,
      daemonBlockChance: hasDaemonTrait ? 0.25 : undefined,
      daemonBlockMaxAmount: hasDaemonTrait ? (battleState.boss?.damage ?? 0) * 0.5 : undefined,
    };

    // Calculate damage
    const calculator = new DamageCalculator(true);
    const result = calculator.calculate(attackerStats, defenderStats);

    console.group(`=== Unwavering Sentinel Execute (${character.name}) ===`);
    console.log(`Base Damage: ${avgDamage} (${minDamage}-${maxDamage})`);
    console.log(`Hits: ${hits}`);
    console.log(`Damage Type: ${damageType}`);
    if (buffSources.length > 0) {
      console.log(`Active Buffs: ${buffSources.map(b => b.name).join(', ')}`);
    }
    calculator.printLogs();
    console.groupEnd();

    // Update battle state - no hasUsed flag (unlimited uses per turn)
    set((state) => ({
      battleState: state.battleState
        ? {
            ...state.battleState,
            totalDamageDealt: state.battleState.totalDamageDealt + result.damage,
            // HeraldOfTheApocalypse: Clear debuff after it's consumed by this attack
            ...(heraldBonus > 0 ? { heraldExtraDmgDebuff: undefined } : {}),
            team: state.battleState.team.map((c) =>
              c.id === characterId
                ? { ...c, totalDamageDealt: c.totalDamageDealt + result.damage }
                : c
            ),
          }
        : null,
    }));

    // Build damage breakdown
    const damageBreakdown: DamageBreakdown = {
      damage: result.damage,
      perHitDamage: result.perHitDamage,
      hits: result.totalHits,
      baseDamage: avgDamage,
      flatModifiers: result.flatModifiers,
      flatModifierSources: result.flatModifierSources || [],
      critBonus: result.critBonus,
      critChanceSources: result.critChanceSources || [],
      critDamageSources: result.critDamageSources || [],
      extraHits: result.extraHits,
      extraHitsSources: result.extraHitsSources || [],
      damVarMod: result.damVarMod,
      targetArmor: bossArmor,
      armorIgnored: result.armorIgnored,
      armorIgnoredSources: result.armorIgnoredSources,
      effectiveArmor: result.effectiveArmor,
      afterArmor: result.afterArmor,
      pierceRatio: result.pierceRatio,
      effectivePierceRatio: result.effectivePierceRatio,
      pierceRatioBonus: result.pierceRatioBonus,
      pierceRatioBonusSources: result.pierceRatioBonusSources,
      pierceFloor: result.pierceFloor,
      afterArmorPierce: result.afterArmorPierce,
      globalMultiplier: result.globalMultiplier,
      globalMultiplierSources: result.globalMultiplierSources || [],
      baseCritChance: equipmentStats.critChance || 0,
      baseCritDamage: equipmentStats.critDmg || 0,
      critChanceBonus: equipmentStats.critChanceBonus || 0,
      critDmgBonus: equipmentStats.critDmgBonus || 0,
      critChance: result.effectiveCritChance,
      critDamage: result.effectiveCritDamage,
      expectedBlocks: result.expectedBlocks,
      blockReductionPerHit: result.blockReductionPerHit,
      totalBlockReduction: result.totalBlockReduction,
    };

    return {
      timestamp: Date.now(),
      characterId,
      characterName: character.name,
      characterIconUrl: character.iconUrl,
      action: 'ability' as const,
      damage: result.damage,
      damageBreakdown,
      damageType: damageType,
      attackType: 'ranged' as const,
      message: `Unwavering Sentinel deals ${result.damage.toLocaleString()} damage (${hits}x ${damageType})`,
    };
  },

  /**
   * Execute The Quickening (Mephiston)
   * Target Blood Angels character performs a melee attack with dmgPct% damage, capped at maxDmg
   * Ends Mephiston's turn
   */
  executeTheQuickening: (casterId, targetId) => {
    const { battleState, executeAttack } = get();
    if (!battleState || !battleState.boss) {
      return {
        timestamp: Date.now(),
        characterId: casterId,
        characterName: 'Unknown',
        action: 'ability' as const,
        message: 'No battle in progress',
      };
    }

    const caster = battleState.team.find((c) => c.id === casterId);
    const target = battleState.team.find((c) => c.id === targetId);
    if (!caster || !target) {
      return {
        timestamp: Date.now(),
        characterId: casterId,
        characterName: 'Unknown',
        action: 'ability' as const,
        message: 'Character not found',
      };
    }

    // Verify target is Blood Angels
    if (target.faction !== 'BloodAngels') {
      return {
        timestamp: Date.now(),
        characterId: casterId,
        characterName: caster.name,
        characterIconUrl: caster.iconUrl,
        action: 'ability' as const,
        message: 'Target must be Blood Angels',
      };
    }

    // Get TheQuickening ability values
    const levelIndex = caster.abilityLevels?.TheQuickening ?? 54;
    const abilityValues = getAbilityValues('TheQuickening', levelIndex, caster.progressionStepIndex);
    if (!abilityValues) {
      return {
        timestamp: Date.now(),
        characterId: casterId,
        characterName: caster.name,
        characterIconUrl: caster.iconUrl,
        action: 'ability' as const,
        message: 'The Quickening ability not found',
      };
    }

    const dmgPct = (abilityValues.dmgPct as number) || 100;
    const maxDmg = (abilityValues.maxDmg as number) || 0;

    // Execute attack for target with damage multiplier and cap
    const result = executeAttack(targetId, 'boss', 'melee', {
      damageMultiplier: dmgPct / 100,
      baseDamageCap: maxDmg,
      isTheQuickeningAttack: true,  // Flag for special handling
    });

    // Mark caster's turn as ended and ability as used
    set((state) => ({
      battleState: state.battleState
        ? {
            ...state.battleState,
            team: state.battleState.team.map((c) =>
              c.id === casterId
                ? { ...c, hasActed: true, hasUsedAbilityThisTurn: true }
                : c
            ),
          }
        : null,
    }));

    return {
      ...result,
      characterId: casterId,
      characterName: caster.name,
      characterIconUrl: caster.iconUrl,
      message: `The Quickening: ${target.name} attacks for ${result.damage?.toLocaleString() || 0} damage (${dmgPct}% of own damage, max ${maxDmg})`,
    };
  },

  /**
   * Apply Blood Chalice buff (Nicodemus)
   * Grants +extraPierceRatio% pierce ratio with melee attacks to selected targets for this turn
   */
  applyBloodChaliceBuff: (_casterId, targetIds, extraPierceRatio) => {
    const { battleState } = get();
    if (!battleState) return;

    set((state) => ({
      battleState: state.battleState
        ? {
            ...state.battleState,
            team: state.battleState.team.map((char) => {
              if (targetIds.includes(char.id)) {
                // Add the Blood Chalice buff to target's activeBuffs
                return {
                  ...char,
                  activeBuffs: [
                    ...char.activeBuffs,
                    {
                      abilityName: 'Blood Chalice',
                      pierceRatioBonus: extraPierceRatio,
                      meleeOnly: true,  // Only applies to melee attacks
                    },
                  ],
                };
              }
              return char;
            }),
          }
        : null,
    }));
  },
}));
