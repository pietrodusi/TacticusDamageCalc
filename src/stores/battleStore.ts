import { create } from 'zustand';
import type { TeamMember, BattleState, BattleCharacter, Action, TurnAction, BattleLogEntry, DamageBreakdown, DamageTotals, FollowUpAttackLog } from '../types';
import { calculateStats, calculateEquipmentStats } from '../services/dataService';
import { DamageCalculator, type AttackerStats, type DefenderStats, PIERCE_RATIOS } from '../services/damage';
import { initializeCooldowns, advanceCooldowns, isAbilityReady, useAbility, resetCooldowns, evaluatePassiveAbilities, combineModifiers, getCharacterAuraBonuses, getAbilityValues, executeActiveAbility, getAbilityNameSync } from '../services/abilities';

const MAX_TURNS = 6;

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
    damageTotals: { lower: 0, upper: 0, average: 0 },
    hasAttackedThisBattle: false,
    attacksThisTurn: 0,
    firstAttackTurn: null,  // Track the turn when character first attacked (for RapidAssault)
    attackTurnsCount: 0,  // Track turns with attacks for LegacyOfCombat
    hasUsedAbilityThisTurn: false,  // Track ability usage for LegendaryCommander
    // Ability state
    abilityCooldowns,
    abilityToggles: {},  // User enables these via UI
    activeBuffs: [],
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
  finishBattle: () => void;
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
  setCharacterTurnEnded: (characterId: string, ended: boolean) => void;

  // Damage calculation (placeholder - to be expanded)
  calculateDamage: (attackerId: string, targetId: string, attackType?: 'melee' | 'ranged') => number;
  executeAttack: (attackerId: string, targetId: string, attackType?: 'melee' | 'ranged') => BattleLogEntry;

  // Ability management
  toggleAbility: (characterId: string, abilityId: string) => void;
  isAbilityReady: (characterId: string, abilityId: string) => boolean;
  setLegendaryCommanderBuffAvailable: (available: boolean) => void;
  getLegendaryCommanderBuff: () => { available: boolean; extraDmg: number; extraHits: number } | null;
  executeAbility: (characterId: string, abilityId: string) => BattleLogEntry;

  // Battle settings
  setIgnoreCrit: (ignore: boolean) => void;
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
        legendaryCommanderBuffAvailable: false,
        ignoreCrit: false,
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
      turnEnded: false,
      attacksThisTurn: 0, // Reset attacks count for new turn
      hasUsedAbilityThisTurn: false, // Reset ability usage for new turn (LegendaryCommander)
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
        legendaryCommanderBuffAvailable: false, // Reset LC buff for new turn
      },
      currentTurnActions: [],
    });
  },

  finishBattle: () => {
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
            log: [],
          },
        ],
        isComplete: true,
        legendaryCommanderBuffAvailable: false,
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
                  turnEnded: false,
                  hasUsedAbilityThisTurn: false,
                  activeBuffs: [], // Clear any active buffs from abilities
                  // Reset ability cooldowns (unuse all active abilities)
                  abilityCooldowns: resetCooldowns(char.abilityCooldowns),
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
                    turnEnded: false,
                    hasUsedAbilityThisTurn: false,
                    activeBuffs: [], // Clear any active buffs from abilities
                    // Reset ability cooldowns (unuse all active abilities)
                    abilityCooldowns: resetCooldowns(char.abilityCooldowns),
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
    const buffCritChanceBonus = attacker.activeBuffs.reduce(
      (sum, buff) => sum + (buff.critChanceBonus || 0), 0
    );
    const buffDamageMultiplier = attacker.activeBuffs.reduce(
      (mult, buff) => mult * (buff.baseDamageMultiplier || 1), 1
    );
    const buffDamageBonus = attacker.activeBuffs.reduce(
      (sum, buff) => sum + (buff.baseDamageBonus || 0), 0
    );

    // Apply buff damage multiplier and bonus to base damage
    const buffedBaseDamage = Math.round(attacker.calculatedDamage * buffDamageMultiplier) + buffDamageBonus;

    // Build attacker stats for calculator
    const attackerStats: AttackerStats = {
      baseDamage: buffedBaseDamage,
      damageType,
      hits,
      critChance: equipmentStats.critChance || 0,
      critDamage: equipmentStats.critDmg || 0,
      critChanceBonus: (equipmentStats.critChanceBonus || 0) + buffCritChanceBonus,
      critDmgBonus: equipmentStats.critDmgBonus || 0,
      traits: attacker.traits,
      hasMoved: attacker.hasMoved,
      attackType,
      hasAttackedThisBattle: attacker.hasAttackedThisBattle,
      attacksThisTurn: attacker.attacksThisTurn,
      abilityModifiers: undefined, // Will be set by evaluating passives
    };

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
        currentHealth: attacker.currentHealth,
        maxHealth: attacker.calculatedHealth,
        currentTurn: battleState.turn,
        attackType,
        abilityToggles: attacker.abilityToggles,
      }
    );

    // Combine passive ability modifiers
    const passiveModifiersPreview = passiveResult.evaluations
      .filter(e => e.applicable)
      .map(e => e.modifiers);

    // Get aura bonuses from teammates for preview
    const auraBonusesPreview = getCharacterAuraBonuses(attacker, battleState.team);
    const activeAurasPreview = auraBonusesPreview.filter(a => a.isActive);
    const auraModifiersPreview = activeAurasPreview
      .map(a => {
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
    const buffSourcesPreview = activeAurasPreview.map(a => ({
      name: a.abilityName,
      sourceName: a.sourceCharacterName || 'Unknown',
      damageBonus: a.bonusText.includes('dmg') ? parseInt(a.bonusText.match(/\+(\d+)/)?.[1] || '0', 10) : undefined,
      extraHits: a.bonusText.includes('hit') ? parseInt(a.bonusText.match(/\+(\d+)/)?.[1] || '0', 10) : undefined,
    }));

    // Combine all modifiers
    const combinedModsPreview = combineModifiers([...passiveModifiersPreview, ...auraModifiersPreview]);
    attackerStats.abilityModifiers = {
      ...combinedModsPreview,
      buffSources: buffSourcesPreview,
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

    // Calculate combined modifiers from active buffs (like WarHowl)
    const buffCritChanceBonus = attacker.activeBuffs.reduce(
      (sum, buff) => sum + (buff.critChanceBonus || 0), 0
    );
    const buffDamageMultiplier = attacker.activeBuffs.reduce(
      (mult, buff) => mult * (buff.baseDamageMultiplier || 1), 1
    );
    const buffDamageBonus = attacker.activeBuffs.reduce(
      (sum, buff) => sum + (buff.baseDamageBonus || 0), 0
    );

    // Apply buff damage multiplier and bonus to base damage
    const buffedBaseDamage = Math.round(attacker.calculatedDamage * buffDamageMultiplier) + buffDamageBonus;

    // Log buff effects if any are active
    if (attacker.activeBuffs.length > 0) {
      console.log(`[Active Buffs: +${buffCritChanceBonus}% crit, x${buffDamageMultiplier.toFixed(2)} dmg, +${buffDamageBonus} flat]`);
    }

    // Build attacker stats for calculator
    // If ignoreCrit is enabled, set all crit stats to 0
    const ignoreCrit = battleState.ignoreCrit;
    const currentTurn = battleState.turn;
    const attackerStats: AttackerStats = {
      baseDamage: buffedBaseDamage,
      damageType,
      hits,
      critChance: ignoreCrit ? 0 : (equipmentStats.critChance || 0),
      critDamage: ignoreCrit ? 0 : (equipmentStats.critDmg || 0),
      critChanceBonus: ignoreCrit ? 0 : ((equipmentStats.critChanceBonus || 0) + buffCritChanceBonus),
      critDmgBonus: ignoreCrit ? 0 : (equipmentStats.critDmgBonus || 0),
      traits: attacker.traits,
      hasMoved: attacker.hasMoved,
      attackType,
      hasAttackedThisBattle: attacker.hasAttackedThisBattle,
      attacksThisTurn: attacker.attacksThisTurn,
      firstAttackTurn: attacker.firstAttackTurn,
      currentTurn,
      abilityModifiers: undefined, // Will be set by evaluating passives
    };

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
        currentHealth: attacker.currentHealth,
        maxHealth: attacker.calculatedHealth,
        currentTurn: battleState.turn,
        attackType,
        abilityToggles: attacker.abilityToggles,
      }
    );

    // Combine passive ability modifiers
    const passiveModifiers = passiveResult.evaluations
      .filter(e => e.applicable)
      .map(e => e.modifiers);

    // Get aura bonuses from teammates
    const auraBonuses = getCharacterAuraBonuses(attacker, battleState.team);
    const activeAuras = auraBonuses.filter(a => a.isActive);
    const auraModifiers = activeAuras
      .map(a => {
        // Parse the bonus to create a modifier
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
    const buffSources: Array<{ name: string; sourceName: string; damageBonus?: number; extraHits?: number }> = activeAuras.map(a => {
      const source: { name: string; sourceName: string; damageBonus?: number; extraHits?: number } = {
        name: a.abilityName,
        sourceName: a.sourceCharacterName || 'Unknown',
      };
      if (a.bonusText.includes('dmg')) {
        const match = a.bonusText.match(/\+(\d+)/);
        if (match) source.damageBonus = parseInt(match[1], 10);
      }
      if (a.bonusText.includes('hit')) {
        const match = a.bonusText.match(/\+(\d+)/);
        if (match) source.extraHits = parseInt(match[1], 10);
      }
      return source;
    });

    // Check for LegendaryCommander buff (Trajann's aura - applies to first attack after ability)
    const lcBuff = get().getLegendaryCommanderBuff();
    const lcModifiers: Record<string, number>[] = [];
    if (lcBuff?.available) {
      // Apply LC buff to this attack
      lcModifiers.push({
        baseDamageBonus: lcBuff.extraDmg,
        extraHits: lcBuff.extraHits,
      });
      buffSources.push({
        name: 'Legendary Commander',
        sourceName: 'Trajann',
        damageBonus: lcBuff.extraDmg,
        extraHits: lcBuff.extraHits,
      });
      // Consume the buff
      get().setLegendaryCommanderBuffAvailable(false);
    }

    // Combine all modifiers
    const combinedMods = combineModifiers([...passiveModifiers, ...auraModifiers, ...lcModifiers]);
    attackerStats.abilityModifiers = {
      ...combinedMods,
      buffSources,
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
    console.log(`Lower Bound: ${result.lowerBound.toLocaleString()}`);
    console.log(`Upper Bound: ${result.upperBound.toLocaleString()}`);
    console.log(`Average:     ${result.average.toLocaleString()}`);

    // Track total damage including follow-up attacks
    let totalLowerBound = result.lowerBound;
    let totalUpperBound = result.upperBound;
    let totalAverage = result.average;

    // Handle follow-up attacks from passives (like LegacyOfCombat, TheBetrayer)
    // Filter based on triggersOnNormalOnly - some passives only trigger on normal attacks
    const isNormalAttack = attackType === 'melee' || attackType === 'ranged';
    const eligibleFollowUps = passiveResult.followUpAttacks.filter(followUp => {
      if (followUp.triggersOnNormalOnly && !isNormalAttack) {
        return false;  // Skip if this follow-up only triggers on normal attacks
      }
      return true;
    });

    // Collect follow-up attack logs for the battle log
    const followUpAttackLogs: FollowUpAttackLog[] = [];

    if (eligibleFollowUps.length > 0) {
      console.log('\n--- FOLLOW-UP ATTACKS ---');

      for (const followUp of eligibleFollowUps) {
        // Calculate average damage for the follow-up attack
        const avgDamage = Math.round((followUp.minDamage + followUp.maxDamage) / 2);
        const multipliedDamage = Math.round(avgDamage * (followUp.damageMultiplier || 1));

        // Check for LegendaryCommander buff for this follow-up attack
        const followUpLcBuff = get().getLegendaryCommanderBuff();
        let lcExtraDmg = 0;
        let lcExtraHits = 0;
        if (followUpLcBuff?.available) {
          lcExtraDmg = followUpLcBuff.extraDmg;
          lcExtraHits = followUpLcBuff.extraHits;
          // Consume the buff
          get().setLegendaryCommanderBuffAvailable(false);
          console.log(`[LC Buff applied: +${lcExtraDmg} dmg, +${lcExtraHits} hits]`);
        }

        // Build follow-up attacker stats
        // Follow-up attacks get trait bonuses if eligible (e.g., BeastSnagga +20% vs Big Target)
        // Note: Follow-up attacks happen AFTER the main attack, so hasAttackedThisBattle is true
        // and attacksThisTurn is at least 1
        // RapidAssault applies to follow-ups if this is the first attack turn
        const followUpStats: AttackerStats = {
          baseDamage: multipliedDamage + lcExtraDmg,
          damageType: followUp.damageProfile,
          hits: followUp.hits + lcExtraHits,
          critChance: ignoreCrit ? 0 : (equipmentStats.critChance || 0),
          critDamage: ignoreCrit ? 0 : (equipmentStats.critDmg || 0),
          critChanceBonus: ignoreCrit ? 0 : (equipmentStats.critChanceBonus || 0),
          critDmgBonus: ignoreCrit ? 0 : (equipmentStats.critDmgBonus || 0),
          traits: attacker.traits, // Apply trait bonuses to follow-up attacks
          hasMoved: true,
          attackType: 'melee', // Follow-up attacks count as melee
          hasAttackedThisBattle: true, // Main attack just happened
          attacksThisTurn: 1, // At least 1 attack this turn (the main attack)
          // Use the main attack's firstAttackTurn (if null, this is the first attack turn)
          firstAttackTurn: attacker.firstAttackTurn ?? currentTurn,
          currentTurn,
        };

        // Calculate follow-up damage
        const followUpCalculator = new DamageCalculator(true);
        const followUpResult = followUpCalculator.calculate(followUpStats, defenderStats);

        // Log follow-up attack details
        const bonusText = (followUp.damageMultiplier || 1) > 1
          ? ` (×${followUp.damageMultiplier?.toFixed(2)} from attack turns)`
          : '';
        const categoryText = followUp.attackCategory === 'special' ? ' [SPECIAL]' : '';
        const lcText = lcExtraDmg > 0 ? ` [+LC: ${lcExtraDmg} dmg, ${lcExtraHits} hits]` : '';
        console.log(`\n${followUp.abilityName}${categoryText}: ${followUp.hits + lcExtraHits}x ${followUp.damageProfile}${bonusText}${lcText}`);
        followUpCalculator.printLogs();
        console.log(`Follow-up Lower: ${followUpResult.lowerBound.toLocaleString()}`);
        console.log(`Follow-up Upper: ${followUpResult.upperBound.toLocaleString()}`);
        console.log(`Follow-up Avg:   ${followUpResult.average.toLocaleString()}`);

        // Add to totals
        totalLowerBound += followUpResult.lowerBound;
        totalUpperBound += followUpResult.upperBound;
        totalAverage += followUpResult.average;

        // Collect follow-up attack log for display
        followUpAttackLogs.push({
          abilityName: followUp.abilityName,
          damage: followUpResult.average,
          lowerBound: followUpResult.lowerBound,
          upperBound: followUpResult.upperBound,
          hits: followUp.hits + lcExtraHits,
          damageType: followUp.damageProfile,
        });
      }

      console.log('\n--- COMBINED TOTAL ---');
      console.log(`Total Lower Bound: ${totalLowerBound.toLocaleString()}`);
      console.log(`Total Upper Bound: ${totalUpperBound.toLocaleString()}`);
      console.log(`Total Average:     ${totalAverage.toLocaleString()}`);
    }

    console.groupEnd();

    // Use combined average damage for totals
    const damage = totalAverage;

    // Build damage breakdown for UI (includes follow-up damage in bounds)
    const damageBreakdown: DamageBreakdown = {
      lowerBound: totalLowerBound,
      upperBound: totalUpperBound,
      average: totalAverage,
      perHitAverage: result.perHitAverage,
      hits,
      baseDamage: attacker.calculatedDamage,
      critChance: result.effectiveCritChance * 100,
      critDamage: result.effectiveCritDamage,
      targetArmor: 0,
      pierceRatio: PIERCE_RATIOS[damageType] * 100,
      traitModifiers: result.traitModifiers,
      traitMultiplier: result.traitMultiplier,
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
                    hasAttackedThisBattle: true,
                    attacksThisTurn: char.attacksThisTurn + 1,
                    // Set firstAttackTurn only on the first attack (when it's null)
                    firstAttackTurn: char.firstAttackTurn ?? state.battleState!.turn,
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
      followUpAttacks: followUpAttackLogs.length > 0 ? followUpAttackLogs : undefined,
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

  // Set LegendaryCommander buff availability (called when ability is used)
  setLegendaryCommanderBuffAvailable: (available) => {
    const { battleState } = get();
    if (!battleState) return;

    set({
      battleState: {
        ...battleState,
        legendaryCommanderBuffAvailable: available,
      },
    });
  },

  // Get LegendaryCommander buff info if Trajann is in team and has the ability
  getLegendaryCommanderBuff: () => {
    const { battleState } = get();
    if (!battleState) return null;

    // Find character with LegendaryCommander in team
    const trajann = battleState.team.find(
      (c) => c.passiveAbilities.includes('LegendaryCommander')
    );
    if (!trajann) return null;

    // Get ability values
    const levelIndex = trajann.abilityLevels?.['LegendaryCommander'] ?? 54;
    const values = getAbilityValues('LegendaryCommander', levelIndex);
    if (!values) return null;

    return {
      available: battleState.legendaryCommanderBuffAvailable,
      extraDmg: values.extraDmg as number || 0,
      extraHits: values.nrOfHits as number || 0,
    };
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

    // Build ability context
    const context = {
      characterId: character.id,
      hasMoved: character.hasMoved,
      hasActedThisBattle: character.hasAttackedThisBattle,
      attacksThisTurn: character.attacksThisTurn,
      attackTurnsCount: character.attackTurnsCount,
      hasUsedAbilityThisTurn: character.hasUsedAbilityThisTurn,
      currentHealth: character.currentHealth,
      maxHealth: character.calculatedHealth,
      currentTurn: battleState.turn,
      attackType: 'ability' as const,
      abilityToggles: character.abilityToggles,
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

    // Handle damage abilities
    const ignoreCrit = battleState.ignoreCrit;
    if (result.damageComponents && result.damageComponents.length > 0) {
      // Multi-component damage ability (like KillMaimBurn)
      const equipmentStats = calculateEquipmentStats(character.equipment);

      console.group(`=== TURN ${battleState.turn}: ${character.name} uses ${abilityName} ===`);

      let totalLowerBound = 0;
      let totalUpperBound = 0;
      let totalAverage = 0;
      let componentIndex = 0;

      const defenderStats: DefenderStats = {
        armor: 0,
        blockChance: 0,
        blockDamage: 0,
        maxHealth: 100000,
      };

      for (const component of result.damageComponents) {
        componentIndex++;

        // Check for LegendaryCommander buff for this component
        const lcBuff = get().getLegendaryCommanderBuff();
        let lcExtraDmg = 0;
        let lcExtraHits = 0;
        if (lcBuff?.available) {
          lcExtraDmg = lcBuff.extraDmg;
          lcExtraHits = lcBuff.extraHits;
          get().setLegendaryCommanderBuffAvailable(false);
          console.log(`[LC Buff applied to component ${componentIndex}: +${lcExtraDmg} dmg, +${lcExtraHits} hits]`);
        }

        const hits = component.hits + lcExtraHits;
        const minDamagePerHit = (component.minDamage || component.averageDamage) + lcExtraDmg;
        const maxDamagePerHit = (component.maxDamage || component.averageDamage) + lcExtraDmg;
        const avgDamagePerHit = component.averageDamage + lcExtraDmg;

        // Calculate lower bound using minDamage (no crit)
        // Ability damage counts as an attack
        const lowerStats: AttackerStats = {
          baseDamage: minDamagePerHit,
          damageType: component.damageProfile,
          hits,
          critChance: 0,
          critDamage: 0,
          critChanceBonus: 0,
          critDmgBonus: 0,
          traits: character.traits,
          hasMoved: true,
          attackType: 'melee',
          hasAttackedThisBattle: character.hasAttackedThisBattle,
          attacksThisTurn: character.attacksThisTurn,
          firstAttackTurn: character.firstAttackTurn,
          currentTurn: battleState.turn,
        };
        const lowerCalc = new DamageCalculator(false);
        const lowerResult = lowerCalc.calculate(lowerStats, defenderStats);

        // Calculate upper bound using maxDamage (with crit)
        const upperStats: AttackerStats = {
          baseDamage: maxDamagePerHit,
          damageType: component.damageProfile,
          hits,
          critChance: ignoreCrit ? 0 : (equipmentStats.critChance || 0),
          critDamage: ignoreCrit ? 0 : (equipmentStats.critDmg || 0),
          critChanceBonus: ignoreCrit ? 0 : (equipmentStats.critChanceBonus || 0),
          critDmgBonus: ignoreCrit ? 0 : (equipmentStats.critDmgBonus || 0),
          traits: character.traits,
          hasMoved: true,
          attackType: 'melee',
          hasAttackedThisBattle: character.hasAttackedThisBattle,
          attacksThisTurn: character.attacksThisTurn,
          firstAttackTurn: character.firstAttackTurn,
          currentTurn: battleState.turn,
        };
        const upperCalc = new DamageCalculator(false);
        const upperResult = upperCalc.calculate(upperStats, defenderStats);

        // Calculate average using averageDamage (with crit)
        const avgStats: AttackerStats = {
          baseDamage: avgDamagePerHit,
          damageType: component.damageProfile,
          hits,
          critChance: ignoreCrit ? 0 : (equipmentStats.critChance || 0),
          critDamage: ignoreCrit ? 0 : (equipmentStats.critDmg || 0),
          critChanceBonus: ignoreCrit ? 0 : (equipmentStats.critChanceBonus || 0),
          critDmgBonus: ignoreCrit ? 0 : (equipmentStats.critDmgBonus || 0),
          traits: character.traits,
          hasMoved: true,
          attackType: 'melee',
          hasAttackedThisBattle: character.hasAttackedThisBattle,
          attacksThisTurn: character.attacksThisTurn,
          firstAttackTurn: character.firstAttackTurn,
          currentTurn: battleState.turn,
        };
        const avgCalc = new DamageCalculator(true);
        const avgResult = avgCalc.calculate(avgStats, defenderStats);

        const lcText = lcExtraDmg > 0 ? ` [+LC: ${lcExtraDmg} dmg, ${lcExtraHits} hits]` : '';
        console.log(`\nComponent ${componentIndex}: ${hits}x ${component.damageProfile}${lcText}`);
        avgCalc.printLogs();
        console.log(`Component Lower: ${lowerResult.lowerBound.toLocaleString()}`);
        console.log(`Component Upper: ${upperResult.upperBound.toLocaleString()}`);
        console.log(`Component Avg:   ${avgResult.average.toLocaleString()}`);

        totalLowerBound += lowerResult.lowerBound;
        totalUpperBound += upperResult.upperBound;
        totalAverage += avgResult.average;
      }

      console.log('\n--- COMBINED TOTAL ---');
      console.log(`Total Lower Bound: ${totalLowerBound.toLocaleString()}`);
      console.log(`Total Upper Bound: ${totalUpperBound.toLocaleString()}`);
      console.log(`Total Average:     ${totalAverage.toLocaleString()}`);
      console.groupEnd();

      totalDamage = totalAverage;
      damageBreakdown = {
        lowerBound: totalLowerBound,
        upperBound: totalUpperBound,
        average: totalAverage,
        perHitAverage: totalAverage / result.damageComponents.reduce((s, c) => s + c.hits, 0),
        hits: result.damageComponents.reduce((s, c) => s + c.hits, 0),
        baseDamage: 0,
        critChance: 0,
        critDamage: 0,
        targetArmor: 0,
        pierceRatio: 0,
        traitModifiers: [],
        traitMultiplier: 1,
      };
    } else if (result.damageResult) {
      // Single component damage ability
      const equipmentStats = calculateEquipmentStats(character.equipment);

      console.group(`=== TURN ${battleState.turn}: ${character.name} uses ${abilityName} ===`);

      // Check for LegendaryCommander buff
      const lcBuff = get().getLegendaryCommanderBuff();
      let lcExtraDmg = 0;
      let lcExtraHits = 0;
      if (lcBuff?.available) {
        lcExtraDmg = lcBuff.extraDmg;
        lcExtraHits = lcBuff.extraHits;
        get().setLegendaryCommanderBuffAvailable(false);
        console.log(`[LC Buff applied: +${lcExtraDmg} dmg, +${lcExtraHits} hits]`);
      }

      const hits = result.damageResult.hits + lcExtraHits;

      // Get min/max damage from ability (per hit)
      const minDamagePerHit = (result.damageResult.minDamage || result.damageResult.averageDamage) + lcExtraDmg;
      const maxDamagePerHit = (result.damageResult.maxDamage || result.damageResult.averageDamage) + lcExtraDmg;
      const avgDamagePerHit = result.damageResult.averageDamage + lcExtraDmg;

      const defenderStats: DefenderStats = {
        armor: 0,
        blockChance: 0,
        blockDamage: 0,
        maxHealth: 100000,
      };

      // Calculate lower bound using minDamage (no crit)
      const lowerStats: AttackerStats = {
        baseDamage: minDamagePerHit,
        damageType: result.damageResult.damageProfile,
        hits,
        critChance: 0,  // Lower bound assumes no crits
        critDamage: 0,
        critChanceBonus: 0,
        critDmgBonus: 0,
        traits: character.traits,
        hasMoved: true,
        attackType: 'melee',
        hasAttackedThisBattle: character.hasAttackedThisBattle,
        attacksThisTurn: character.attacksThisTurn,
        firstAttackTurn: character.firstAttackTurn,
        currentTurn: battleState.turn,
      };
      const lowerCalc = new DamageCalculator(false);
      const lowerResult = lowerCalc.calculate(lowerStats, defenderStats);

      // Calculate upper bound using maxDamage (with crit if not ignored)
      const upperStats: AttackerStats = {
        baseDamage: maxDamagePerHit,
        damageType: result.damageResult.damageProfile,
        hits,
        critChance: ignoreCrit ? 0 : (equipmentStats.critChance || 0),
        critDamage: ignoreCrit ? 0 : (equipmentStats.critDmg || 0),
        critChanceBonus: ignoreCrit ? 0 : (equipmentStats.critChanceBonus || 0),
        critDmgBonus: ignoreCrit ? 0 : (equipmentStats.critDmgBonus || 0),
        traits: character.traits,
        hasMoved: true,
        attackType: 'melee',
        hasAttackedThisBattle: character.hasAttackedThisBattle,
        attacksThisTurn: character.attacksThisTurn,
        firstAttackTurn: character.firstAttackTurn,
        currentTurn: battleState.turn,
      };
      const upperCalc = new DamageCalculator(false);
      const upperResult = upperCalc.calculate(upperStats, defenderStats);

      // Calculate average using averageDamage (with crit if not ignored)
      const avgStats: AttackerStats = {
        baseDamage: avgDamagePerHit,
        damageType: result.damageResult.damageProfile,
        hits,
        critChance: ignoreCrit ? 0 : (equipmentStats.critChance || 0),
        critDamage: ignoreCrit ? 0 : (equipmentStats.critDmg || 0),
        critChanceBonus: ignoreCrit ? 0 : (equipmentStats.critChanceBonus || 0),
        critDmgBonus: ignoreCrit ? 0 : (equipmentStats.critDmgBonus || 0),
        traits: character.traits,
        hasMoved: true,
        attackType: 'melee',
        hasAttackedThisBattle: character.hasAttackedThisBattle,
        attacksThisTurn: character.attacksThisTurn,
        firstAttackTurn: character.firstAttackTurn,
        currentTurn: battleState.turn,
      };
      const avgCalc = new DamageCalculator(true);
      const avgResult = avgCalc.calculate(avgStats, defenderStats);

      avgCalc.printLogs();
      console.log('\n--- SUMMARY ---');
      console.log(`Lower Bound: ${lowerResult.lowerBound.toLocaleString()}`);
      console.log(`Upper Bound: ${upperResult.upperBound.toLocaleString()}`);
      console.log(`Average:     ${avgResult.average.toLocaleString()}`);
      console.groupEnd();

      totalDamage = avgResult.average;
      damageBreakdown = {
        lowerBound: lowerResult.lowerBound,
        upperBound: upperResult.upperBound,
        average: avgResult.average,
        perHitAverage: avgResult.perHitAverage,
        hits,
        baseDamage: result.damageResult.averageDamage,
        critChance: avgResult.effectiveCritChance * 100,
        critDamage: avgResult.effectiveCritDamage,
        targetArmor: 0,
        pierceRatio: PIERCE_RATIOS[result.damageResult.damageProfile] * 100,
        traitModifiers: avgResult.traitModifiers,
        traitMultiplier: avgResult.traitMultiplier,
      };
    }

    // Update totals if damage was dealt
    if (totalDamage > 0 && damageBreakdown) {
      set((state) => ({
        battleState: state.battleState
          ? {
              ...state.battleState,
              totalDamageDealt: state.battleState.totalDamageDealt + totalDamage,
              totalDamageBounds: {
                lower: state.battleState.totalDamageBounds.lower + damageBreakdown!.lowerBound,
                upper: state.battleState.totalDamageBounds.upper + damageBreakdown!.upperBound,
                average: state.battleState.totalDamageBounds.average + damageBreakdown!.average,
              },
              team: state.battleState.team.map((char) =>
                char.id === characterId
                  ? {
                      ...char,
                      totalDamageDealt: char.totalDamageDealt + totalDamage,
                      damageTotals: {
                        lower: char.damageTotals.lower + damageBreakdown!.lowerBound,
                        upper: char.damageTotals.upper + damageBreakdown!.upperBound,
                        average: char.damageTotals.average + damageBreakdown!.average,
                      },
                      hasUsedAbilityThisTurn: true,
                      // Damage abilities count as attacks for LegacyOfCombat tracking
                      hasAttackedThisBattle: true,
                      attacksThisTurn: char.attacksThisTurn + 1,
                      // Set firstAttackTurn only on the first attack (when it's null)
                      firstAttackTurn: char.firstAttackTurn ?? state.battleState!.turn,
                    }
                  : char
              ),
            }
          : null,
      }));
    } else if (result.buffResult) {
      // Buff ability - store the buff effect and mark ability as used
      set((state) => ({
        battleState: state.battleState
          ? {
              ...state.battleState,
              team: state.battleState.team.map((char) =>
                char.id === characterId
                  ? {
                      ...char,
                      hasUsedAbilityThisTurn: true,
                      activeBuffs: [...char.activeBuffs, result.buffResult!.effect],
                    }
                  : char
              ),
            }
          : null,
      }));
      console.log(`[Buff applied: ${abilityName}]`, result.buffResult.effect);
    } else {
      // Other non-damage ability - just mark ability as used
      set((state) => ({
        battleState: state.battleState
          ? {
              ...state.battleState,
              team: state.battleState.team.map((char) =>
                char.id === characterId
                  ? { ...char, hasUsedAbilityThisTurn: true }
                  : char
              ),
            }
          : null,
      }));
    }

    // Handle follow-up attacks from passives (like LegacyOfCombat)
    // Build context for passive evaluation
    // Note: Use current attackTurnsCount (damage abilities count as attack turns)
    const passiveContext = {
      characterId: character.id,
      hasMoved: character.hasMoved,
      hasActedThisBattle: true,  // Ability was just used (counts as attack)
      attacksThisTurn: character.attacksThisTurn + 1,  // Just attacked
      attackTurnsCount: character.attackTurnsCount,  // This is the current count (will be incremented next turn)
      hasUsedAbilityThisTurn: true,  // Ability was just used
      currentHealth: character.currentHealth,
      maxHealth: character.calculatedHealth,
      currentTurn: battleState.turn,
      attackType: 'ability' as const,
      abilityToggles: character.abilityToggles,
    };

    // Evaluate passive abilities for follow-up attacks
    const passiveResult = evaluatePassiveAbilities(
      character.passiveAbilities,
      character.abilityLevels || {},
      passiveContext
    );

    // Collect follow-up attack logs
    const followUpAttackLogs: FollowUpAttackLog[] = [];

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

      const defenderStats: DefenderStats = {
        armor: 0,
        blockChance: 0,
        blockDamage: 0,
        maxHealth: 100000,
      };

      for (const followUp of eligibleFollowUps) {
        // Check for LegendaryCommander buff
        const followUpLcBuff = get().getLegendaryCommanderBuff();
        let lcExtraDmg = 0;
        let lcExtraHits = 0;
        if (followUpLcBuff?.available) {
          lcExtraDmg = followUpLcBuff.extraDmg;
          lcExtraHits = followUpLcBuff.extraHits;
          get().setLegendaryCommanderBuffAvailable(false);
          console.log(`[LC Buff applied: +${lcExtraDmg} dmg, +${lcExtraHits} hits]`);
        }

        const hits = followUp.hits + lcExtraHits;
        const multiplier = followUp.damageMultiplier || 1;
        const minDamagePerHit = Math.round(followUp.minDamage * multiplier) + lcExtraDmg;
        const maxDamagePerHit = Math.round(followUp.maxDamage * multiplier) + lcExtraDmg;
        const avgDamagePerHit = Math.round((followUp.minDamage + followUp.maxDamage) / 2 * multiplier) + lcExtraDmg;

        // Calculate lower bound using minDamage (no crit)
        // Follow-up attacks happen after the main attack, so hasAttackedThisBattle is true
        // RapidAssault applies if this is the first attack turn
        const lowerStats: AttackerStats = {
          baseDamage: minDamagePerHit,
          damageType: followUp.damageProfile,
          hits,
          critChance: 0,
          critDamage: 0,
          critChanceBonus: 0,
          critDmgBonus: 0,
          traits: character.traits,
          hasMoved: true,
          attackType: 'melee',
          hasAttackedThisBattle: true,
          attacksThisTurn: 1,
          firstAttackTurn: character.firstAttackTurn ?? battleState.turn,
          currentTurn: battleState.turn,
        };
        const lowerCalc = new DamageCalculator(false);
        const lowerResult = lowerCalc.calculate(lowerStats, defenderStats);

        // Calculate upper bound using maxDamage (with crit)
        const upperStats: AttackerStats = {
          baseDamage: maxDamagePerHit,
          damageType: followUp.damageProfile,
          hits,
          critChance: ignoreCrit ? 0 : (equipmentStats.critChance || 0),
          critDamage: ignoreCrit ? 0 : (equipmentStats.critDmg || 0),
          critChanceBonus: ignoreCrit ? 0 : (equipmentStats.critChanceBonus || 0),
          critDmgBonus: ignoreCrit ? 0 : (equipmentStats.critDmgBonus || 0),
          traits: character.traits,
          hasMoved: true,
          attackType: 'melee',
          hasAttackedThisBattle: true,
          attacksThisTurn: 1,
          firstAttackTurn: character.firstAttackTurn ?? battleState.turn,
          currentTurn: battleState.turn,
        };
        const upperCalc = new DamageCalculator(false);
        const upperResult = upperCalc.calculate(upperStats, defenderStats);

        // Calculate average using averageDamage (with crit)
        const avgStats: AttackerStats = {
          baseDamage: avgDamagePerHit,
          damageType: followUp.damageProfile,
          hits,
          critChance: ignoreCrit ? 0 : (equipmentStats.critChance || 0),
          critDamage: ignoreCrit ? 0 : (equipmentStats.critDmg || 0),
          critChanceBonus: ignoreCrit ? 0 : (equipmentStats.critChanceBonus || 0),
          critDmgBonus: ignoreCrit ? 0 : (equipmentStats.critDmgBonus || 0),
          traits: character.traits,
          hasMoved: true,
          attackType: 'melee',
          hasAttackedThisBattle: true,
          attacksThisTurn: 1,
          firstAttackTurn: character.firstAttackTurn ?? battleState.turn,
          currentTurn: battleState.turn,
        };
        const avgCalc = new DamageCalculator(true);
        const avgResult = avgCalc.calculate(avgStats, defenderStats);

        // Log follow-up attack details
        const bonusText = (followUp.damageMultiplier || 1) > 1
          ? ` (×${followUp.damageMultiplier?.toFixed(2)} from attack turns)`
          : '';
        console.log(`\n${followUp.abilityName}: ${hits}x ${followUp.damageProfile}${bonusText}`);
        avgCalc.printLogs();
        console.log(`Follow-up Lower: ${lowerResult.lowerBound.toLocaleString()}`);
        console.log(`Follow-up Upper: ${upperResult.upperBound.toLocaleString()}`);
        console.log(`Follow-up Avg:   ${avgResult.average.toLocaleString()}`);

        // Add to totals
        totalDamage += avgResult.average;
        if (damageBreakdown) {
          damageBreakdown.lowerBound += lowerResult.lowerBound;
          damageBreakdown.upperBound += upperResult.upperBound;
          damageBreakdown.average += avgResult.average;
        }

        // Collect follow-up attack log for display
        followUpAttackLogs.push({
          abilityName: followUp.abilityName,
          damage: avgResult.average,
          lowerBound: lowerResult.lowerBound,
          upperBound: upperResult.upperBound,
          hits,
          damageType: followUp.damageProfile,
        });
      }

      // Update totals with follow-up damage
      if (followUpAttackLogs.length > 0) {
        const followUpTotalDamage = followUpAttackLogs.reduce((sum, f) => sum + f.damage, 0);
        const followUpTotalLower = followUpAttackLogs.reduce((sum, f) => sum + f.lowerBound, 0);
        const followUpTotalUpper = followUpAttackLogs.reduce((sum, f) => sum + f.upperBound, 0);

        set((state) => ({
          battleState: state.battleState
            ? {
                ...state.battleState,
                totalDamageDealt: state.battleState.totalDamageDealt + followUpTotalDamage,
                totalDamageBounds: {
                  lower: state.battleState.totalDamageBounds.lower + followUpTotalLower,
                  upper: state.battleState.totalDamageBounds.upper + followUpTotalUpper,
                  average: state.battleState.totalDamageBounds.average + followUpTotalDamage,
                },
                team: state.battleState.team.map((char) =>
                  char.id === characterId
                    ? {
                        ...char,
                        totalDamageDealt: char.totalDamageDealt + followUpTotalDamage,
                        damageTotals: {
                          lower: char.damageTotals.lower + followUpTotalLower,
                          upper: char.damageTotals.upper + followUpTotalUpper,
                          average: char.damageTotals.average + followUpTotalDamage,
                        },
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

    return {
      timestamp: Date.now(),
      characterId,
      characterName: character.name,
      action: 'ability' as const,
      damage: totalDamage > 0 ? totalDamage : undefined,
      damageBreakdown,
      message: result.message || `${character.name} uses ${abilityName}`,
      followUpAttacks: followUpAttackLogs.length > 0 ? followUpAttackLogs : undefined,
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
}));
