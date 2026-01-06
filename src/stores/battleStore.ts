import { create } from 'zustand';
import type { TeamMember, BattleState, BattleCharacter, Action, TurnAction, BattleLogEntry, DamageBreakdown, FollowUpAttackLog, Boss, AppliedBuffInfo, BuffEvaluationContext, DamageType, SelectedMachineOfWar } from '../types';
import { calculateStats, calculateEquipmentStats, getBossAbilityConstantModifiers, getMachineOfWarDamageBonus, getSummonUnitData, getSummonIconUrl } from '../services/dataService';
import { DamageCalculator, type AttackerStats, type DefenderStats, type DamageCaps } from '../services/damage';
import { initializeCooldowns, advanceCooldowns, isAbilityReady, useAbility, unuseAbility, resetCooldowns, evaluatePassiveAbilities, combineModifiers, getCharacterAuraBonuses, getAbilityValues, executeActiveAbility, getAbilityNameSync } from '../services/abilities';
import { getApplicableBuffs, combineBuffEffects, addBuffToPool, getBuffTemplate, expireBuffs } from '../services/buffs';

const MAX_TURNS = 6;

// Safe deep clone function - uses structuredClone with JSON fallback
function deepClone<T>(obj: T): T {
  try {
    return structuredClone(obj);
  } catch {
    // Fallback to JSON for environments where structuredClone fails
    return JSON.parse(JSON.stringify(obj));
  }
}

// Options for executeAttack to support Galvanic Field triggered attacks
interface ExecuteAttackOptions {
  damageMultiplier?: number;    // GalvanicField dmgPct (e.g., 0.80 for 80%)
  perHitDamageCap?: number;     // DEPRECATED - use finalDamageCap instead
  baseDamageCap?: number;        // NEW: Cap 1 - "Its Own Damage" (e.g., Galvanic Field)
  preArmorCap?: number;          // NEW: Cap 2 - "Pre-Armour Damage" (e.g., Psychic Stalk)
  finalDamageCap?: number;       // NEW: Cap 3 - "The Hit" (e.g., Astartes Banner)
  skipStateUpdates?: boolean;   // Don't update hasActed, hasAttackedThisBattle, etc.
  abilityName?: string;         // For log display (e.g., "Galvanic Field")
}

function createBattleCharacter(character: TeamMember, index: number): BattleCharacter {
  // Calculate stats based on progression and rank
  const stats = calculateStats(character, character.progressionStepIndex, character.rank);

  // Initialize ability cooldowns for active abilities
  const allAbilities = [...character.activeAbilities, ...character.passiveAbilities];
  const abilityCooldowns = initializeCooldowns(allAbilities);

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
    activeBuffs: [],
    // Laviscus's Refusal to be Outdone passive tracking
    outrage: 0,
    outrageContributors: [],
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
  toggleAbility: (characterId: string, abilityId: string) => void;
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
  executeSummonAttack: (summonId: string, attackType: 'melee' | 'ranged') => BattleLogEntry;

  // Special ability executions
  executeTheBetrayerBonus: (characterId: string) => BattleLogEntry;
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
      const lcValues = getAbilityValues('LegendaryCommander', trajann.abilityLevels?.LegendaryCommander ?? 54);

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
      const wotsValues = getAbilityValues('WayOfTheShortBlade', farsight.abilityLevels?.WayOfTheShortBlade ?? 54);

      if (wotsValues && wotsTemplate) {
        buffPool = addBuffToPool(buffPool, wotsTemplate, farsight, wotsValues as Record<string, number>, 1);
      }
    }

    // Initialize Doom aura buffs if Eldryon is in team
    const eldryon = battleCharacters.find(c => c.passiveAbilities.includes('Doom'));
    if (eldryon) {
      const doomNonAeldariTemplate = getBuffTemplate('doom_non_aeldari');
      const doomAeldariTemplate = getBuffTemplate('doom_aeldari');
      const doomValues = getAbilityValues('Doom', eldryon.abilityLevels?.Doom ?? 54);

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
      const saValues = getAbilityValues('StructuralAnalyser', darkstrider.abilityLevels?.StructuralAnalyser ?? 54);

      if (saValues && saTemplate) {
        buffPool = addBuffToPool(buffPool, saTemplate, darkstrider, saValues as Record<string, number>, 1);
      }
    }

    // Initialize Destroy the Witch aura buff if Helbrecht is in team
    const helbrecht = battleCharacters.find(c => c.passiveAbilities.includes('DestroyTheWitch'));
    if (helbrecht) {
      const dtwTemplate = getBuffTemplate('destroy_the_witch');
      const dtwValues = getAbilityValues('DestroyTheWitch', helbrecht.abilityLevels?.DestroyTheWitch ?? 54);

      if (dtwValues && dtwTemplate) {
        buffPool = addBuffToPool(buffPool, dtwTemplate, helbrecht, dtwValues as Record<string, number>, 1);
      }
    }

    // Initialize Daughter of the Abyss aura buff if Atlacoya is in team
    const atlacoya = battleCharacters.find(c => c.passiveAbilities.includes('DaughterOfTheAbyss'));
    if (atlacoya) {
      const dotaTemplate = getBuffTemplate('daughter_of_the_abyss');
      const dotaValues = getAbilityValues('DaughterOfTheAbyss', atlacoya.abilityLevels?.DaughterOfTheAbyss ?? 54);

      if (dotaValues && dotaTemplate) {
        buffPool = addBuffToPool(buffPool, dotaTemplate, atlacoya, dotaValues as Record<string, number>, 1);
      }
    }

    // Initialize Stand Vigil aura buff if Aesoth is in team
    const aesoth = battleCharacters.find(c => c.passiveAbilities.includes('StandVigil'));
    if (aesoth) {
      const svTemplate = getBuffTemplate('stand_vigil');
      const svValues = getAbilityValues('StandVigil', aesoth.abilityLevels?.StandVigil ?? 54);

      if (svValues && svTemplate) {
        buffPool = addBuffToPool(buffPool, svTemplate, aesoth, svValues as Record<string, number>, 1);
      }
    }

    // Initialize Serene Unifier (Storm of Fire) aura buff if Aun'Shi is in team
    const aunShi = battleCharacters.find(c => c.passiveAbilities.includes('SereneUnifier'));
    if (aunShi) {
      const suTemplate = getBuffTemplate('serene_unifier_storm_of_fire');
      const suValues = getAbilityValues('SereneUnifier', aunShi.abilityLevels?.SereneUnifier ?? 54);

      if (suValues && suTemplate) {
        buffPool = addBuffToPool(buffPool, suTemplate, aunShi, suValues as Record<string, number>, 1);
      }
    }

    // Initialize Prophet of Gork and Mork if boss has the passive ability
    let prophetOfGorkAndMork: BattleState['prophetOfGorkAndMork'] = undefined;
    if (boss?.passiveAbilities?.includes('ProphetOfGorkAndMork')) {
      // Get base values from abilities.json
      const prophetValues = getAbilityValues('ProphetOfGorkAndMork', 0); // Constants don't vary by level
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
      activeAbilitiesUsedCount: 0, // Count of active abilities used in battle
      custodedUsedAbilityThisTurn: false, // Track if Custodes used ability (Stand Vigil range extension)
      bossAttacksReceivedThisTurn: 0, // Prophet of Gork and Mork counter
      prophetOfGorkAndMork, // Prophet ability data (if boss has it)
      // Machine of War damage bonus
      machineOfWar: machineOfWar ? {
        machineId: machineOfWar.machineId,
        extraDmgPct: getMachineOfWarDamageBonus(machineOfWar.machineId, machineOfWar.stars),
      } : undefined,
      // Summoned units (e.g., Ork Boyz from Waaagh!)
      summons: [],
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
      // Increment attackTurnsCount if character attacked this turn (for LegacyOfCombat bonus)
      attackTurnsCount: char.attacksThisTurn > 0 ? char.attackTurnsCount + 1 : char.attackTurnsCount,
      // Advance ability cooldowns
      abilityCooldowns: advanceCooldowns(char.abilityCooldowns),
      // Clear active buffs from abilities (they last one turn)
      activeBuffs: [],
      // Reduce buff/debuff durations
      buffs: char.buffs
        .map((b) => ({ ...b, duration: b.duration - 1 }))
        .filter((b) => b.duration > 0),
      debuffs: char.debuffs
        .map((d) => ({ ...d, duration: d.duration - 1 }))
        .filter((d) => d.duration > 0),
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
            totalDamageDealt: Math.max(0, state.battleState.totalDamageDealt - damageToSubtract),
          },
          currentTurnActions: state.currentTurnActions.filter(
            (ta) => ta.characterId !== characterId
          ),
        };
      }

      // For past turns, update turnHistory and character damage
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
    const trajannIsAdjacentToBoss = trajann?.abilityToggles['adjacentToBoss'] ?? false;

    // Evaluate passive abilities for preview
    const passiveResult = evaluatePassiveAbilities(
      attacker.passiveAbilities,
      attacker.abilityLevels || {},
      {
        characterId: attacker.id,
        hasMoved: attacker.hasMoved,
        hasActedThisBattle: attacker.hasAttackedThisBattle,
        attacksThisTurn: attacker.attacksThisTurn,
        attackTurnsCount: attacker.attackTurnsCount,
        hasUsedAbilityThisTurn: attacker.hasUsedAbilityThisTurn,
        hasQualifiedForLCDamage: attacker.hasQualifiedForLCDamage,
        currentHealth: attacker.currentHealth,
        maxHealth: attacker.calculatedHealth,
        currentTurn: battleState.turn,
        attackType,
        attackCategory: 'normal',  // Normal attack
        isFirstSpecialAttackOfTurn: !attacker.hasUsedFirstSpecialAttackThisTurn,  // Per-character LC tracking
        trajannIsAdjacentToBoss,
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

    // Build buff sources for preview
    const buffSourcesPreview = activeAurasPreview.map(a => {
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

    // Combine all modifiers
    const combinedModsPreview = combineModifiers([...passiveModifiersPreview, ...auraModifiersPreview]);
    attackerStats.abilityModifiers = {
      ...combinedModsPreview,
      buffSources: buffSourcesPreview,
    };

    // Use boss armor and traits if available, accounting for armor reduction
    const baseBossArmor = battleState.boss?.armor ?? 0;
    const bossArmor = Math.max(0, baseBossArmor - (battleState.bossArmorReduction || 0));
    const defenderStats: DefenderStats = {
      armor: bossArmor,
      maxHealth: battleState.boss?.health ?? 100000,
      traits: battleState.boss?.traits,
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
    const buffDamageBonus = attacker.activeBuffs.reduce(
      (sum, buff) => sum + (buff.baseDamageBonus || 0), 0
    ) + (poolBuffEffects.baseDamageBonus || 0);
    const poolExtraHits = poolBuffEffects.extraHits || 0;
    const poolCritDmgBonus = poolBuffEffects.critDamageBonus || 0;
    const poolArmorIgnored = poolBuffEffects.armorIgnored || 0;
    const poolPierceRatioBonus = poolBuffEffects.pierceRatioBonus || 0;

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
    const trajannIsAdjacentToBoss = trajann?.abilityToggles['adjacentToBoss'] ?? false;

    // Evaluate passive abilities
    const passiveResult = evaluatePassiveAbilities(
      attacker.passiveAbilities,
      attacker.abilityLevels || {},
      {
        characterId: attacker.id,
        hasMoved: attacker.hasMoved,
        hasActedThisBattle: attacker.hasAttackedThisBattle,
        attacksThisTurn: attacker.attacksThisTurn,
        attackTurnsCount: attacker.attackTurnsCount,
        hasUsedAbilityThisTurn: attacker.hasUsedAbilityThisTurn,
        hasQualifiedForLCDamage: attacker.hasQualifiedForLCDamage,
        currentHealth: attacker.currentHealth,
        maxHealth: attacker.calculatedHealth,
        currentTurn: battleState.turn,
        attackType,
        attackCategory: 'normal',  // Normal attack
        isFirstSpecialAttackOfTurn: !attacker.hasUsedFirstSpecialAttackThisTurn,  // Per-character LC tracking
        trajannIsAdjacentToBoss,
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

    // Build buff sources for display in damage breakdown
    // Define BuffSource type inline
    type BuffSourceType = { name: string; sourceName?: string; damageBonus?: number; damageMultiplier?: number; extraHits?: number; critChanceBonus?: number; critDamageBonus?: number; armorIgnored?: number; pierceRatioBonus?: number };
    const buffSources: BuffSourceType[] = activeAuras.map(a => {
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

        if (hasBonus) {
          buffSources.push(source);
        }
      }
    }

    // Add active buff sources (like WarHowl) with their bonuses (legacy character activeBuffs)
    for (const buff of attacker.activeBuffs) {
      const source: BuffSourceType = {
        name: buff.abilityName || 'Buff',
      };
      if (buff.baseDamageBonus) source.damageBonus = buff.baseDamageBonus;
      if (buff.extraHits) source.extraHits = buff.extraHits;
      if (buff.critChanceBonus) source.critChanceBonus = buff.critChanceBonus;
      if (buff.critDamageBonus) source.critDamageBonus = buff.critDamageBonus;
      // Only add if there's at least one bonus
      if (source.damageBonus || source.extraHits || source.critChanceBonus || source.critDamageBonus) {
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
    // Combine flat damage bonuses: passive mods + active buff bonus
    const totalDamageBonus = (combinedMods.baseDamageBonus || 0) + buffDamageBonus;

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

    attackerStats.abilityModifiers = {
      ...combinedMods,
      baseDamageBonus: totalDamageBonus > 0 ? totalDamageBonus : undefined,
      baseDamageMultiplier: totalDamageMultiplier !== 1 ? totalDamageMultiplier : undefined,
      critChanceBonus: totalCritChanceBonus > 0 ? totalCritChanceBonus : undefined,
      critDamageBonus: (combinedMods.critDamageBonus || 0) + buffCritDmgBonus > 0 ? (combinedMods.critDamageBonus || 0) + buffCritDmgBonus : undefined,
      extraHits: (combinedMods.extraHits || 0) + buffExtraHits > 0 ? (combinedMods.extraHits || 0) + buffExtraHits : undefined,
      armorIgnored: totalArmorIgnored > 0 ? totalArmorIgnored : undefined,
      pierceRatioBonus: poolPierceRatioBonus > 0 ? poolPierceRatioBonus : undefined,
      buffSources,
    };

    // Use boss armor and traits if available, accounting for armor reduction
    const baseBossArmor = battleState.boss?.armor ?? 0;
    const bossArmor = Math.max(0, baseBossArmor - (battleState.bossArmorReduction || 0));
    const defenderStats: DefenderStats = {
      armor: bossArmor,
      maxHealth: battleState.boss?.health ?? 100000,
      traits: battleState.boss?.traits,
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

    // Handle follow-up attacks from passives (like LegacyOfCombat, TheBetrayer, WayOfTheShortBlade)
    // Filter based on triggersOnNormalOnly and triggersOnMeleeOnly flags
    const isNormalAttack = attackType === 'melee' || attackType === 'ranged';
    const isMeleeAttack = attackType === 'melee';

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
          const isToggleActive = attacker.abilityToggles[meleeToggleId] ?? false;

          if (isToggleActive) {
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
              const cibValues = getAbilityValues('CyclicIonBlaster', cibLevelIndex);
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

    // Collect follow-up attack logs for the battle log
    const followUpAttackLogs: FollowUpAttackLog[] = [];

    // Track if LC +2 hits was applied to any follow-up attack
    let lcHitsAppliedInNormalFollowUps = false;
    // Track effective attacker state for follow-up evaluations
    let effectiveAttacker = attacker;
    // Track cumulative hits for crit chain offset (for Additional Attacks like Cyclic Ion Blaster)
    // Starts with the source attack's total hits
    let cumulativeHitsForCritChain = result.totalHits;
    // Track cumulative boss armor reduction from follow-up attacks (e.g., ChampionOfTheFeast)
    let followUpArmorReductionTotal = 0;
    // Track if any follow-up ranged attack occurred (for Structural Analyser Markerlight)
    let hadFollowUpRangedAttack = false;

    if (eligibleFollowUps.length > 0) {
      console.log('\n--- FOLLOW-UP ATTACKS ---');

      for (const followUp of eligibleFollowUps) {
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
        type FollowUpBuffSource = { name: string; sourceName?: string; damageBonus?: number; extraHits?: number; armorIgnored?: number; damageMultiplier?: number; critChanceBonus?: number; critDamageBonus?: number };
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
          // Pass bonuses via abilityModifiers for proper source tracking in breakdown
          abilityModifiers: (lcExtraDmg + auraDmgBonus + conditionalDmgBonus > 0 || lcExtraHits + auraHitsBonus > 0 || followUpArmorIgnored > 0 || finalFollowUpMultiplier !== 1 || followUpCritChanceBonus > 0 || followUpCritDamageBonus > 0) ? {
            baseDamageBonus: lcExtraDmg + auraDmgBonus + conditionalDmgBonus > 0 ? lcExtraDmg + auraDmgBonus + conditionalDmgBonus : undefined,
            extraHits: lcExtraHits + auraHitsBonus > 0 ? lcExtraHits + auraHitsBonus : undefined,
            armorIgnored: followUpArmorIgnored > 0 ? followUpArmorIgnored : undefined,
            baseDamageMultiplier: finalFollowUpMultiplier !== 1 ? finalFollowUpMultiplier : undefined,
            critChanceBonus: followUpCritChanceBonus > 0 ? followUpCritChanceBonus : undefined,
            critDamageBonus: followUpCritDamageBonus > 0 ? followUpCritDamageBonus : undefined,
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

        // Accumulate boss armor reduction from follow-ups (e.g., ChampionOfTheFeast)
        if (followUp.armorReduction && followUp.armorReduction > 0) {
          followUpArmorReductionTotal += followUp.armorReduction;
          console.log(`[Boss armor reduced by ${followUp.armorReduction} from ${followUp.abilityName}]`);
        }
      }

      console.log('\n--- COMBINED TOTAL ---');
      console.log(`Total Damage: ${totalDamage.toLocaleString()}`);
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
      type DrachnyenBuffSource = { name: string; sourceName?: string; damageBonus?: number; extraHits?: number; armorIgnored?: number; damageMultiplier?: number };
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

      const hasDrachnyenModifiers = drachnyenExtraDmg > 0 || drachnyenExtraHits > 0 || drachnyenArmorIgnored > 0 || drachnyenDamageMultiplier !== 1;

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
                }

                return { ...char, ...updates };
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

    return {
      timestamp: Date.now(),
      characterId: attackerId,
      characterName: attacker.name,
      action: 'attack' as const,
      target: targetId,
      damage: totalDamage,
      damageBreakdown,
      message: `${attacker.name} ${attackType} attacks`,
      followUpAttacks: followUpAttackLogs.length > 0 ? followUpAttackLogs : undefined,
      appliedBuffs: appliedBuffs.length > 0 ? appliedBuffs : undefined,
      attackType,
    };
  },

  // Toggle a passive ability on/off for a character
  toggleAbility: (characterId, abilityId) => {
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
                  [abilityId]: !char.abilityToggles[abilityId],
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
    const trajannIsAdjacentToBoss = trajann?.abilityToggles['adjacentToBoss'] ?? false;

    // Build ability context
    const context = {
      characterId: character.id,
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

    // Handle damage abilities
    const ignoreCrit = battleState.ignoreCrit;
    if (result.damageComponents && result.damageComponents.length > 0) {
      // Multi-component damage ability (like KillMaimBurn)
      // Each component is treated as a separate special attack with independent buff evaluation
      // Each component is displayed as a follow-up attack with purple shading
      const equipmentStats = calculateEquipmentStats(character.equipment);

      console.group(`=== TURN ${battleState.turn}: ${character.name} uses ${abilityName} ===`);

      // Track effective character state for sequential buff evaluations
      let effectiveCharacter: BattleCharacter = { ...character };
      const isAdjacentToBoss = character.abilityToggles['adjacentToBoss'] ?? false;
      let componentIndex = 0;

      // Use boss armor if available, accounting for armor reduction
      const baseBossArmor = battleState.boss?.armor ?? 0;
      const bossArmor = Math.max(0, baseBossArmor - (battleState.bossArmorReduction || 0));
      const defenderStats: DefenderStats = {
        armor: bossArmor,
        maxHealth: battleState.boss?.health ?? 100000,
        traits: battleState.boss?.traits,
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
        const componentBuffSources: Array<{ name: string; sourceName?: string; damageBonus?: number; extraHits?: number; damageMultiplier?: number; critChanceBonus?: number; critDamageBonus?: number }> = [];

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
          abilityModifiers: (componentTotalDmgBonus > 0 || componentTotalHitsBonus > 0 || componentDamageMultiplier !== 1 || componentCritChanceBonus > 0 || componentCritDamageBonus > 0) ? {
            baseDamageBonus: componentTotalDmgBonus > 0 ? componentTotalDmgBonus : undefined,
            baseDamageMultiplier: componentDamageMultiplier !== 1 ? componentDamageMultiplier : undefined,
            extraHits: componentTotalHitsBonus > 0 ? componentTotalHitsBonus : undefined,
            critChanceBonus: componentCritChanceBonus > 0 ? componentCritChanceBonus : undefined,
            critDamageBonus: componentCritDamageBonus > 0 ? componentCritDamageBonus : undefined,
            buffSources: componentBuffSources,
          } : undefined,
        };
        const componentCalc = new DamageCalculator(true);
        const componentResult = componentCalc.calculate(componentStats, defenderStats);

        console.log(`\nComponent ${componentIndex}: ${componentResult.totalHits}x ${component.damageProfile}`);
        componentCalc.printLogs();
        console.log(`Component Damage: ${componentResult.damage.toLocaleString()}`);

        totalDamage += componentResult.damage;
        // Track max perHitDamage for Laviscus outrage
        maxPerHitDamage = Math.max(maxPerHitDamage, componentResult.perHitDamage);

        // Build component breakdown for display
        const componentBreakdown: DamageBreakdown = {
          damage: componentResult.damage,
          perHitDamage: componentResult.perHitDamage,
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
        };

        // Add component as a follow-up attack log (displays with purple shading)
        const componentName = `${abilityName} (${component.damageProfile})`;
        componentAttackLogs.push({
          abilityName: componentName,
          damage: componentResult.damage,
          hits: componentResult.totalHits,
          damageType: component.damageProfile,
          breakdown: componentBreakdown,
        });

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
    } else if (result.damageResult) {
      // Single component damage ability (like Martial Inspiration)
      // Displayed as a special attack with purple shading
      const equipmentStats = calculateEquipmentStats(character.equipment);

      console.group(`=== TURN ${battleState.turn}: ${character.name} uses ${abilityName} ===`);

      // Get LC bonuses from buff pool for single-component ability attacks
      const singleAbilityBuffContext: BuffEvaluationContext = {
        attacker: character,
        attackType: 'melee',
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

      // Get Lord of the Host aura bonuses for ability attacks (melee only)
      // Martial Inspiration is a melee attack and should receive aura bonuses
      const abilityAuraBonuses = getCharacterAuraBonuses(character, battleState.team);
      const activeAbilityAuras = abilityAuraBonuses.filter(a => {
        if (!a.isActive) return false;
        // Only apply melee-restricted auras since Martial Inspiration is melee
        if (a.attackTypeRestriction && a.attackTypeRestriction !== 'melee') return false;
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
      const abilityBuffSources: Array<{ name: string; sourceName?: string; damageBonus?: number; extraHits?: number; damageMultiplier?: number }> = [];

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

      // Add aura bonus sources
      for (const aura of activeAbilityAuras) {
        if (aura.modifiers && (aura.modifiers.baseDamageBonus || aura.modifiers.extraHits)) {
          abilityBuffSources.push({
            name: aura.sourceCharacterName ? `${aura.abilityName} (${aura.sourceCharacterName})` : aura.abilityName,
            damageBonus: aura.modifiers.baseDamageBonus,
            extraHits: aura.modifiers.extraHits,
          });
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

      const baseHits = result.damageResult.hits;
      const avgDamagePerHit = result.damageResult.averageDamage;

      // Use boss armor if available, accounting for armor reduction
      const baseBossArmor = battleState.boss?.armor ?? 0;
      const bossArmor = Math.max(0, baseBossArmor - (battleState.bossArmorReduction || 0));
      const defenderStats: DefenderStats = {
        armor: bossArmor,
        maxHealth: battleState.boss?.health ?? 100000,
        traits: battleState.boss?.traits,
      };

      // Calculate total damage and hit bonuses (LC + aura)
      const totalDmgBonus = lcExtraDmg + auraDmgBonus;
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

      // Check if we have any ability modifiers to pass
      const hasModifiers = totalDmgBonus > 0 || totalHitsBonus > 0 || abilityGlobalMultiplier || result.abilityModifiers || poolDamageMultiplier !== 1 || abilityHighGroundMultiplier !== 1 || abilityWarMachineMultiplier !== 1;

      // Merge ability-specific modifiers with LC + aura bonuses + pool multipliers + high ground + war machine
      const mergedBaseDmgBonus = totalDmgBonus + (result.abilityModifiers?.baseDamageBonus || 0);
      // Combine all multipliers: pool buff (Daughter of the Abyss) * ability-specific * global multiplier * high ground * war machine
      const abilitySpecificMult = result.abilityModifiers?.baseDamageMultiplier || 1;
      const globalMult = abilityGlobalMultiplier || 1;
      const combinedMultiplier = poolDamageMultiplier * abilitySpecificMult * globalMult * abilityHighGroundMultiplier * abilityWarMachineMultiplier;
      const mergedBaseDmgMult = combinedMultiplier !== 1 ? combinedMultiplier : undefined;
      const mergedExtraHits = totalHitsBonus + (result.abilityModifiers?.extraHits || 0);

      // Calculate damage using averageDamage (with crit if not ignored)
      // Pass LC + aura bonuses and global multiplier via abilityModifiers for proper source tracking
      const abilityStats: AttackerStats = {
        baseDamage: avgDamagePerHit,
        damageType: result.damageResult.damageProfile,
        hits: baseHits,  // Base hits only, extra hits via abilityModifiers
        critChance: equipmentStats.critChance || 0,
        critDamage: equipmentStats.critDmg || 0,
        critChanceBonus: equipmentStats.critChanceBonus || 0,
        critDmgBonus: equipmentStats.critDmgBonus || 0,
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
        abilityModifiers: hasModifiers ? {
          baseDamageBonus: mergedBaseDmgBonus > 0 ? mergedBaseDmgBonus : undefined,
          baseDamageMultiplier: mergedBaseDmgMult,
          extraHits: mergedExtraHits > 0 ? mergedExtraHits : undefined,
          buffSources: abilityBuffSources,
        } : undefined,
      };
      const abilityCalc = new DamageCalculator(true);
      const abilityResult = abilityCalc.calculate(abilityStats, defenderStats);

      abilityCalc.printLogs();
      console.log('\n--- SUMMARY ---');
      console.log(`Damage: ${abilityResult.damage.toLocaleString()}`);
      console.groupEnd();

      totalDamage = abilityResult.damage;
      // Track max perHitDamage for Laviscus outrage
      maxPerHitDamage = Math.max(maxPerHitDamage, abilityResult.perHitDamage);

      // Build breakdown for display
      const abilityBreakdown: DamageBreakdown = {
        damage: abilityResult.damage,
        perHitDamage: abilityResult.perHitDamage,
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

      // Add as a follow-up attack log (displays with purple shading)
      followUpAttackLogs.push({
        abilityName,
        damage: abilityResult.damage,
        hits: abilityResult.totalHits,
        damageType: result.damageResult.damageProfile,
        breakdown: abilityBreakdown,
      });

      // No main damageBreakdown - shown via followUpAttackLogs with purple shading
      damageBreakdown = undefined;
    }

    // Update totals if damage was dealt
    if (totalDamage > 0) {
      // Check if character is adjacent to boss for LC qualification
      const isAdjacentToBoss = character.abilityToggles['adjacentToBoss'] ?? false;

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
      const abilityValuesForBuff = result.buffResult ? (getAbilityValues(abilityId, levelIndex) || {}) : null;

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
                activeAbilitiesUsedCount: state.battleState.activeAbilitiesUsedCount + 1,
                team: state.battleState.team.map((char) => {
                  if (char.id === characterId) {
                    // Update ability user
                    // Note: Laviscus outrage does NOT reset on ability use, only on normal attack
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
      const isAdjacentToBoss = character.abilityToggles['adjacentToBoss'] ?? false;

      // Special handling for Drachnyen (Abaddon)
      if (abilityId === 'Drachnyen') {
        const abilityValues = getAbilityValues(abilityId, levelIndex) || {};
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
      } else if (buffTemplate) {
        // Use new buff pool system
        const abilityValues = getAbilityValues(abilityId, levelIndex) || {};
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
    } else {
      // Other non-damage ability (e.g., healing without buff) - mark ability as used
      // Check if character is adjacent to boss for LC qualification
      const isAdjacentToBoss = character.abilityToggles['adjacentToBoss'] ?? false;

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
                    }
                  : char
              ),
            }
          : null,
      }));
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
      trajannIsAdjacentToBoss: trajann?.abilityToggles['adjacentToBoss'] ?? false,  // LC Trajann check
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

    // Filter follow-ups that trigger on ability attacks
    const eligibleFollowUps = passiveResult.followUpAttacks.filter(followUp => {
      if (followUp.triggersOnNormalOnly) {
        return false;  // Skip if this follow-up only triggers on normal attacks
      }
      return true;
    });

    if (eligibleFollowUps.length > 0) {
      console.log('\n--- FOLLOW-UP ATTACKS (from ability) ---');
      const equipmentStats = calculateEquipmentStats(character.equipment);

      // Use boss armor and traits if available (accounting for armor reduction)
      const baseBossArmorFollowUp = battleState.boss?.armor ?? 0;
      const bossArmorFollowUp = Math.max(0, baseBossArmorFollowUp - (battleState.bossArmorReduction || 0));
      const defenderStats: DefenderStats = {
        armor: bossArmorFollowUp,
        maxHealth: battleState.boss?.health ?? 100000,
        traits: battleState.boss?.traits,
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
        type FollowUpBuffSource = { name: string; sourceName?: string; damageBonus?: number; extraHits?: number; armorIgnored?: number; damageMultiplier?: number; critChanceBonus?: number; critDamageBonus?: number };
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

        // Check if we have any modifiers to pass
        const hasFollowUpModifiers = lcExtraDmg + auraDmgBonus > 0 || lcExtraHits + auraHitsBonus > 0 || followUpGlobalMultiplier || followUpArmorIgnored > 0 || followUpDamageMultiplier !== 1 || abilityFollowUpHighGroundMultiplier !== 1 || abilityFollowUpWarMachineMultiplier !== 1 || abilityFollowUpCritChanceBonus > 0 || abilityFollowUpCritDamageBonus > 0;

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
          afterArmor: followUpResult.afterArmor,
          pierceRatio: followUpResult.pierceRatio,
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

      set((state) => ({
        battleState: state.battleState
          ? {
              ...state.battleState,
              team: state.battleState.team.map((char) => {
                // For other characters: track outrage for Laviscus
                if (char.id !== characterId && char.passiveAbilities.includes('RefusalToBeOutdone')) {
                  // Accumulate outrage from ally ability attacks (uses max perHitDamage from ability + follow-ups)
                  const newOutrage = (char.outrage || 0) + finalMaxPerHitForOutrage;
                  const contributors = char.outrageContributors || [];
                  // Add to contributors if attacker is Chaos and not already in list
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

    return {
      timestamp: Date.now(),
      characterId,
      characterName: character.name,
      action: 'ability' as const,
      damage: totalDamage > 0 ? totalDamage : undefined,
      damageBreakdown,
      message: result.message || `${character.name} uses ${abilityName}`,
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
    const galvanicFieldValues = getAbilityValues('GalvanicField', galvanicFieldLevelIndex);
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

    // Simple damage calculation for summons:
    // - No crit
    // - No equipment bonuses
    // - No trait bonuses
    // - Just base damage, armor, and pierce ratio
    const baseDamage = summon.damage;
    const pierceRatio = 0.3; // Standard pierce ratio

    // Calculate damage per hit: max(baseDamage - armor, baseDamage * pierceRatio)
    const afterArmor = Math.max(0, baseDamage - bossArmor);
    const pierceFloor = Math.round(baseDamage * pierceRatio);
    const perHitDamage = Math.max(afterArmor, pierceFloor);
    const totalDamage = perHitDamage * hits;

    console.group(`=== ${summon.name} (${attackType}) ===`);
    console.log(`Base Damage: ${baseDamage}`);
    console.log(`Boss Armor: ${bossArmor} (base ${bossBaseArmor} - ${bossArmorReduction} reduction)`);
    console.log(`After Armor: ${afterArmor}`);
    console.log(`Pierce Floor (${(pierceRatio * 100).toFixed(0)}%): ${pierceFloor}`);
    console.log(`Per Hit: ${perHitDamage} × ${hits} hits = ${totalDamage}`);
    console.groupEnd();

    // Update battle state with damage dealt
    set((state) => ({
      battleState: state.battleState
        ? {
            ...state.battleState,
            totalDamageDealt: state.battleState.totalDamageDealt + totalDamage,
            summons: state.battleState.summons.map((s) =>
              s.id === summonId
                ? { ...s, totalDamageDealt: s.totalDamageDealt + totalDamage }
                : s
            ),
          }
        : null,
    }));

    // Build damage breakdown for display
    const damageBreakdown: DamageBreakdown = {
      damage: totalDamage,
      perHitDamage,
      hits,
      baseDamage,
      flatModifiers: 0,
      flatModifierSources: [],
      critBonus: 0,
      critChanceSources: [],
      critDamageSources: [],
      extraHits: 0,
      extraHitsSources: [],
      damVarMod: baseDamage,
      targetArmor: bossArmor,
      afterArmor,
      pierceRatio,
      pierceFloor,
      afterArmorPierce: perHitDamage,
      globalMultiplier: 1,
      globalMultiplierSources: [],
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
      action: attackType === 'melee' ? 'meleeAttack' as const : 'rangedAttack' as const,
      damage: totalDamage,
      damageBreakdown,
      message: `${summon.name} deals ${totalDamage.toLocaleString()} ${damageType} damage`,
      attackType,
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
    const abilityValues = getAbilityValues('TheBetrayer', levelIndex);
    if (!abilityValues) {
      return {
        timestamp: Date.now(),
        characterId,
        characterName: character.name,
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
    const buffCritChanceBonus = character.activeBuffs.reduce(
      (sum, buff) => sum + (buff.critChanceBonus || 0), 0
    ) + (poolBuffEffects.critChanceBonus || 0);
    const buffDamageMultiplier = character.activeBuffs.reduce(
      (mult, buff) => mult * (buff.baseDamageMultiplier || 1), 1
    ) * (poolBuffEffects.baseDamageMultiplier || 1);
    const buffDamageBonus = character.activeBuffs.reduce(
      (sum, buff) => sum + (buff.baseDamageBonus || 0), 0
    ) + (poolBuffEffects.baseDamageBonus || 0);
    const poolExtraHits = poolBuffEffects.extraHits || 0;
    const poolCritDmgBonus = poolBuffEffects.critDamageBonus || 0;
    const poolArmorIgnored = poolBuffEffects.armorIgnored || 0;
    const poolPierceRatioBonus = poolBuffEffects.pierceRatioBonus || 0;

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
    const trajannIsAdjacentToBoss = trajann?.abilityToggles['adjacentToBoss'] ?? false;

    // Evaluate passive abilities
    const passiveResult = evaluatePassiveAbilities(
      character.passiveAbilities,
      character.abilityLevels || {},
      {
        characterId: character.id,
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

    // Add aura sources
    for (const a of activeAuras) {
      const source: BuffSourceType = { name: a.abilityName, sourceName: a.sourceCharacterName || 'Unknown' };
      if (a.modifiers?.baseDamageBonus) source.damageBonus = a.modifiers.baseDamageBonus;
      if (a.modifiers?.extraHits) source.extraHits = a.modifiers.extraHits;
      if (a.modifiers?.critChanceBonus) source.critChanceBonus = a.modifiers.critChanceBonus;
      if (a.modifiers?.critDamageBonus) source.critDamageBonus = a.modifiers.critDamageBonus;
      if (source.damageBonus || source.extraHits || source.critChanceBonus || source.critDamageBonus) {
        buffSources.push(source);
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
        if (source.damageBonus || source.extraHits || source.critChanceBonus || source.critDamageBonus) {
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

    attackerStats.abilityModifiers = {
      ...combinedMods,
      baseDamageBonus: totalDamageBonus > 0 ? totalDamageBonus : undefined,
      baseDamageMultiplier: totalDamageMultiplier !== 1 ? totalDamageMultiplier : undefined,
      critChanceBonus: totalCritChanceBonus > 0 ? totalCritChanceBonus : undefined,
      critDamageBonus: (combinedMods.critDamageBonus || 0) + buffCritDmgBonus > 0 ? (combinedMods.critDamageBonus || 0) + buffCritDmgBonus : undefined,
      extraHits: (combinedMods.extraHits || 0) + buffExtraHits > 0 ? (combinedMods.extraHits || 0) + buffExtraHits : undefined,
      armorIgnored: totalArmorIgnored > 0 ? totalArmorIgnored : undefined,
      pierceRatioBonus: poolPierceRatioBonus > 0 ? poolPierceRatioBonus : undefined,
      buffSources,
    };

    // Defender stats (boss)
    const defenderStats: DefenderStats = {
      armor: bossArmor,
      maxHealth: battleState.boss?.health ?? 100000,
      traits: battleState.boss.traits,
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
      afterArmor: result.afterArmor,
      pierceRatio: result.pierceRatio,
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
    };

    return {
      timestamp: Date.now(),
      characterId,
      characterName: character.name,
      action: 'ability' as const,
      damage: result.damage,
      damageBreakdown,
      message: `The Betrayer deals ${result.damage.toLocaleString()} damage (${hits}x ${damageType})`,
    };
  },
}));
