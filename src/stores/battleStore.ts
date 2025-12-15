import { create } from 'zustand';
import type { TeamMember, BattleState, BattleCharacter, Action, TurnAction, BattleLogEntry, DamageBreakdown, DamageTotals } from '../types';
import { calculateStats, calculateEquipmentStats } from '../services/dataService';
import { DamageCalculator, type AttackerStats, type DefenderStats, PIERCE_RATIOS } from '../services/damage';

const MAX_TURNS = 6;

function createBattleCharacter(character: TeamMember, index: number): BattleCharacter {
  // Calculate stats based on progression and rank
  const stats = calculateStats(character, character.progressionStepIndex, character.rank);

  return {
    ...character,
    currentHealth: stats.health,
    position: { x: index, y: 0 },
    hasMoved: false,
    hasActed: false,
    buffs: [],
    debuffs: [],
    calculatedDamage: stats.damage,
    calculatedHealth: stats.health,
    calculatedArmour: stats.armour,
    totalDamageDealt: 0,
    damageTotals: { lower: 0, upper: 0, average: 0 },
  };
}

interface BattleStore {
  battleState: BattleState | null;
  currentTurnActions: TurnAction[];
  editingTurn: number | null; // null = current turn, number = editing a past turn

  // Battle lifecycle
  startBattle: (characters: TeamMember[]) => void;
  endBattle: () => void;
  resetBattle: () => void;

  // Turn management
  nextTurn: () => void;
  canAdvanceTurn: () => boolean;
  setEditingTurn: (turn: number | null) => void;
  getActiveTurn: () => number;

  // Actions
  addAction: (characterId: string, action: Action) => void;
  removeAction: (characterId: string, actionIndex: number) => void;
  clearCharacterActions: (characterId: string) => void;
  resetCharacterTurn: (characterId: string, boundsToSubtract: DamageTotals) => void;
  resetCharacterTurnAtTurn: (characterId: string, turn: number, boundsToSubtract: DamageTotals) => void;

  // Character state
  updateCharacterHealth: (characterId: string, newHealth: number) => void;
  setCharacterMoved: (characterId: string, moved: boolean) => void;
  setCharacterActed: (characterId: string, acted: boolean) => void;

  // Damage calculation (placeholder - to be expanded)
  calculateDamage: (attackerId: string, targetId: string, attackType?: 'melee' | 'ranged') => number;
  executeAttack: (attackerId: string, targetId: string, attackType?: 'melee' | 'ranged') => BattleLogEntry;
}

export const useBattleStore = create<BattleStore>((set, get) => ({
  battleState: null,
  currentTurnActions: [],
  editingTurn: null,

  startBattle: (characters) => {
    const battleCharacters = characters.map((char, index) =>
      createBattleCharacter(char, index)
    );

    set({
      battleState: {
        turn: 1,
        maxTurns: MAX_TURNS,
        team: battleCharacters,
        turnHistory: [],
        totalDamageDealt: 0,
        totalDamageBounds: { lower: 0, upper: 0, average: 0 },
        isComplete: false,
      },
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

  nextTurn: () => {
    const { battleState, currentTurnActions } = get();
    if (!battleState) return;

    const newTurn = battleState.turn + 1;
    const isComplete = newTurn > MAX_TURNS;

    // Reset character action flags for new turn
    const resetTeam = battleState.team.map((char) => ({
      ...char,
      hasMoved: false,
      hasActed: false,
      // Reduce buff/debuff durations
      buffs: char.buffs
        .map((b) => ({ ...b, duration: b.duration - 1 }))
        .filter((b) => b.duration > 0),
      debuffs: char.debuffs
        .map((d) => ({ ...d, duration: d.duration - 1 }))
        .filter((d) => d.duration > 0),
    }));

    set({
      battleState: {
        ...battleState,
        turn: newTurn,
        team: resetTeam,
        turnHistory: [
          ...battleState.turnHistory,
          {
            turnNumber: battleState.turn,
            actions: currentTurnActions,
            log: [],
          },
        ],
        isComplete,
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

  resetCharacterTurn: (characterId, boundsToSubtract) => {
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
                  totalDamageDealt: Math.max(0, char.totalDamageDealt - boundsToSubtract.average),
                  damageTotals: {
                    lower: Math.max(0, char.damageTotals.lower - boundsToSubtract.lower),
                    upper: Math.max(0, char.damageTotals.upper - boundsToSubtract.upper),
                    average: Math.max(0, char.damageTotals.average - boundsToSubtract.average),
                  },
                }
              : char
          ),
          totalDamageDealt: Math.max(0, state.battleState.totalDamageDealt - boundsToSubtract.average),
          totalDamageBounds: {
            lower: Math.max(0, state.battleState.totalDamageBounds.lower - boundsToSubtract.lower),
            upper: Math.max(0, state.battleState.totalDamageBounds.upper - boundsToSubtract.upper),
            average: Math.max(0, state.battleState.totalDamageBounds.average - boundsToSubtract.average),
          },
        },
        currentTurnActions: state.currentTurnActions.filter(
          (ta) => ta.characterId !== characterId
        ),
      };
    });
  },

  resetCharacterTurnAtTurn: (characterId, turn, boundsToSubtract) => {
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
                    totalDamageDealt: Math.max(0, char.totalDamageDealt - boundsToSubtract.average),
                    damageTotals: {
                      lower: Math.max(0, char.damageTotals.lower - boundsToSubtract.lower),
                      upper: Math.max(0, char.damageTotals.upper - boundsToSubtract.upper),
                      average: Math.max(0, char.damageTotals.average - boundsToSubtract.average),
                    },
                  }
                : char
            ),
            totalDamageDealt: Math.max(0, state.battleState.totalDamageDealt - boundsToSubtract.average),
            totalDamageBounds: {
              lower: Math.max(0, state.battleState.totalDamageBounds.lower - boundsToSubtract.lower),
              upper: Math.max(0, state.battleState.totalDamageBounds.upper - boundsToSubtract.upper),
              average: Math.max(0, state.battleState.totalDamageBounds.average - boundsToSubtract.average),
            },
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
                  totalDamageDealt: Math.max(0, char.totalDamageDealt - boundsToSubtract.average),
                  damageTotals: {
                    lower: Math.max(0, char.damageTotals.lower - boundsToSubtract.lower),
                    upper: Math.max(0, char.damageTotals.upper - boundsToSubtract.upper),
                    average: Math.max(0, char.damageTotals.average - boundsToSubtract.average),
                  },
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
          totalDamageDealt: Math.max(0, state.battleState.totalDamageDealt - boundsToSubtract.average),
          totalDamageBounds: {
            lower: Math.max(0, state.battleState.totalDamageBounds.lower - boundsToSubtract.lower),
            upper: Math.max(0, state.battleState.totalDamageBounds.upper - boundsToSubtract.upper),
            average: Math.max(0, state.battleState.totalDamageBounds.average - boundsToSubtract.average),
          },
        },
      };
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

    // Build attacker stats for calculator
    const attackerStats: AttackerStats = {
      baseDamage: attacker.calculatedDamage,
      damageType,
      hits,
      critChance: equipmentStats.critChance || 0,
      critDamage: equipmentStats.critDmg || 0,
      critChanceBonus: equipmentStats.critChanceBonus || 0,
      critDmgBonus: equipmentStats.critDmgBonus || 0,
    };

    // For now, use 0 armor (no enemy defined yet)
    const defenderStats: DefenderStats = {
      armor: 0,
      blockChance: 0,
      blockDamage: 0,
      maxHealth: 100000,
    };

    const calculator = new DamageCalculator(false);
    const result = calculator.calculate(attackerStats, defenderStats);

    return result.average;
  },

  executeAttack: (attackerId, targetId, attackType = 'melee') => {
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

    // Build attacker stats for calculator
    const attackerStats: AttackerStats = {
      baseDamage: attacker.calculatedDamage,
      damageType,
      hits,
      critChance: equipmentStats.critChance || 0,
      critDamage: equipmentStats.critDmg || 0,
      critChanceBonus: equipmentStats.critChanceBonus || 0,
      critDmgBonus: equipmentStats.critDmgBonus || 0,
    };

    // For now, use 0 armor (no enemy defined yet)
    const defenderStats: DefenderStats = {
      armor: 0,
      blockChance: 0,
      blockDamage: 0,
      maxHealth: 100000,
    };

    // Calculate damage with logging enabled
    const calculator = new DamageCalculator(true);
    const result = calculator.calculate(attackerStats, defenderStats);

    // Print detailed calculation log to console
    const currentTurn = battleState.turn;
    console.group(`=== TURN ${currentTurn}: ${attacker.name} ${attackType.toUpperCase()} ATTACK ===`);
    calculator.printLogs();
    console.log('\n--- SUMMARY ---');
    console.log(`Lower Bound: ${result.lowerBound.toLocaleString()}`);
    console.log(`Upper Bound: ${result.upperBound.toLocaleString()}`);
    console.log(`Average:     ${result.average.toLocaleString()}`);
    console.groupEnd();

    // Use average damage for totals
    const damage = result.average;

    // Build damage breakdown for UI
    const damageBreakdown: DamageBreakdown = {
      lowerBound: result.lowerBound,
      upperBound: result.upperBound,
      average: result.average,
      perHitAverage: result.perHitAverage,
      hits,
      baseDamage: attacker.calculatedDamage,
      critChance: result.effectiveCritChance * 100,
      critDamage: result.effectiveCritDamage,
      targetArmor: 0,
      pierceRatio: PIERCE_RATIOS[damageType] * 100,
    };

    // Update total damage dealt (both global and per-character) with bounds
    set((state) => ({
      battleState: state.battleState
        ? {
            ...state.battleState,
            totalDamageDealt: state.battleState.totalDamageDealt + damage,
            totalDamageBounds: {
              lower: state.battleState.totalDamageBounds.lower + damageBreakdown.lowerBound,
              upper: state.battleState.totalDamageBounds.upper + damageBreakdown.upperBound,
              average: state.battleState.totalDamageBounds.average + damageBreakdown.average,
            },
            team: state.battleState.team.map((char) =>
              char.id === attackerId
                ? {
                    ...char,
                    totalDamageDealt: char.totalDamageDealt + damage,
                    damageTotals: {
                      lower: char.damageTotals.lower + damageBreakdown.lowerBound,
                      upper: char.damageTotals.upper + damageBreakdown.upperBound,
                      average: char.damageTotals.average + damageBreakdown.average,
                    },
                  }
                : char
            ),
          }
        : null,
    }));

    return {
      timestamp: Date.now(),
      characterId: attackerId,
      characterName: attacker.name,
      action: 'attack' as const,
      target: targetId,
      damage,
      damageBreakdown,
      message: `${attacker.name} ${attackType} attacks`,
    };
  },
}));
