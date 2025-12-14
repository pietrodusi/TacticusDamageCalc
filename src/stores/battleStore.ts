import { create } from 'zustand';
import type { TeamMember, BattleState, BattleCharacter, Action, TurnAction, BattleLogEntry } from '../types';
import { calculateStats } from '../services/dataService';

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
  resetCharacterTurn: (characterId: string, damageToSubtract: number) => void;
  resetCharacterTurnAtTurn: (characterId: string, turn: number, damageToSubtract: number) => void;

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

  // Damage calculation: calculatedDamage * hits based on attack type
  calculateDamage: (attackerId, _targetId, attackType = 'melee') => {
    const { battleState } = get();
    if (!battleState) return 0;

    const attacker = battleState.team.find((c) => c.id === attackerId);
    if (!attacker) return 0;

    // Use calculated damage (based on rarity/rank)
    const damage = attacker.calculatedDamage;

    // Calculate damage based on attack type
    if (attackType === 'ranged' && attacker.rangedHits) {
      return damage * attacker.rangedHits;
    }

    // Default to melee
    return damage * attacker.meleeHits;
  },

  executeAttack: (attackerId, targetId, attackType = 'melee') => {
    const { battleState, calculateDamage } = get();
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
    const damage = calculateDamage(attackerId, targetId, attackType);

    // Update total damage dealt (both global and per-character)
    set((state) => ({
      battleState: state.battleState
        ? {
            ...state.battleState,
            totalDamageDealt: state.battleState.totalDamageDealt + damage,
            team: state.battleState.team.map((char) =>
              char.id === attackerId
                ? { ...char, totalDamageDealt: char.totalDamageDealt + damage }
                : char
            ),
          }
        : null,
    }));

    const hits = attackType === 'ranged' ? attacker?.rangedHits : attacker?.meleeHits;
    const unitDamage = attacker?.calculatedDamage || 0;

    return {
      timestamp: Date.now(),
      characterId: attackerId,
      characterName: attacker?.name || 'Unknown',
      action: 'attack' as const,
      target: targetId,
      damage,
      message: `${attacker?.name} ${attackType} attacks (${unitDamage} × ${hits})`,
    };
  },
}));
