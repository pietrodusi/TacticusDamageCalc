import { create } from 'zustand';
import type { TeamMember, BattleState, BattleCharacter, Action, TurnAction, BattleLogEntry, DamageBreakdown, FollowUpAttackLog, Boss, AppliedBuffInfo, BuffEvaluationContext } from '../types';
import { calculateStats, calculateEquipmentStats } from '../services/dataService';
import { DamageCalculator, type AttackerStats, type DefenderStats } from '../services/damage';
import { initializeCooldowns, advanceCooldowns, isAbilityReady, useAbility, resetCooldowns, evaluatePassiveAbilities, combineModifiers, getCharacterAuraBonuses, getAbilityValues, executeActiveAbility, getAbilityNameSync } from '../services/abilities';
import { getApplicableBuffs, combineBuffEffects, addBuffToPool, getBuffTemplate, expireBuffs } from '../services/buffs';

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
  currentTurnActions: TurnAction[];
  editingTurn: number | null; // null = current turn, number = editing a past turn

  // Battle lifecycle
  startBattle: (characters: TeamMember[], boss?: Boss) => void;
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
  resetCharacterTurn: (characterId: string, damageToSubtract: number) => void;
  resetCharacterTurnAtTurn: (characterId: string, turn: number, damageToSubtract: number) => void;

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
  executeAbility: (characterId: string, abilityId: string) => BattleLogEntry;

  // Battle settings
  setIgnoreCrit: (ignore: boolean) => void;
}

export const useBattleStore = create<BattleStore>((set, get) => ({
  battleState: null,
  currentTurnActions: [],
  editingTurn: null,

  startBattle: (characters, boss) => {
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

    set({
      battleState: {
        turn: 1,
        maxTurns: MAX_TURNS,
        team: battleCharacters,
        boss: boss, // Store the boss in battle state
        turnHistory: [],
        totalDamageDealt: 0,
        isComplete: false,
        ignoreCrit: false,
        buffPool, // Buff pool with LC buffs if Trajann present
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
      hasUsedAbilityThisTurn: false, // Reset ability usage for new turn
      // Reset Legendary Commander tracking for new turn
      hasQualifiedForLCDamage: false,
      pendingLCQualification: false,
      hasUsedFirstSpecialAttackThisTurn: false,  // Reset per-character LC +2 hits tracking
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

    set({
      battleState: {
        ...battleState,
        turn: newTurn,
        team: resetTeam,
        buffPool: updatedBuffPool,
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

    // Use boss armor and traits if available
    const bossArmor = battleState.boss?.armor ?? 0;
    const defenderStats: DefenderStats = {
      armor: bossArmor,
      maxHealth: battleState.boss?.health ?? 100000,
      traits: battleState.boss?.traits,
    };

    const calculator = new DamageCalculator(false);
    const result = calculator.calculate(attackerStats, defenderStats);

    return result.damage;
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
    const attackerStats: AttackerStats = {
      baseDamage: attacker.calculatedDamage, // Use actual base damage, not buffed
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
    type BuffSourceType = { name: string; sourceName?: string; damageBonus?: number; damageMultiplier?: number; extraHits?: number; critChanceBonus?: number; critDamageBonus?: number };
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
      // Only add if there's at least one bonus
      if (source.damageBonus || source.extraHits || source.critChanceBonus || source.critDamageBonus || source.damageMultiplier) {
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

    // Combine damage multipliers: passive mods + active buff multiplier
    const totalDamageMultiplier = (combinedMods.baseDamageMultiplier || 1) * buffDamageMultiplier;
    // Combine flat damage bonuses: passive mods + active buff bonus
    const totalDamageBonus = (combinedMods.baseDamageBonus || 0) + buffDamageBonus;

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

    attackerStats.abilityModifiers = {
      ...combinedMods,
      baseDamageBonus: totalDamageBonus > 0 ? totalDamageBonus : undefined,
      baseDamageMultiplier: totalDamageMultiplier !== 1 ? totalDamageMultiplier : undefined,
      critChanceBonus: totalCritChanceBonus > 0 ? totalCritChanceBonus : undefined,
      critDamageBonus: (combinedMods.critDamageBonus || 0) + buffCritDmgBonus > 0 ? (combinedMods.critDamageBonus || 0) + buffCritDmgBonus : undefined,
      extraHits: (combinedMods.extraHits || 0) + buffExtraHits > 0 ? (combinedMods.extraHits || 0) + buffExtraHits : undefined,
      buffSources,
    };

    // Use boss armor and traits if available
    const bossArmor = battleState.boss?.armor ?? 0;
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

    // Track total damage including follow-up attacks
    let totalDamage = result.damage;
    // Track max perHitDamage for Laviscus outrage (uses highest perHitDamage from any attack)
    let maxPerHitDamage = result.perHitDamage;

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

    // Track if LC +2 hits was applied to any follow-up attack
    let lcHitsAppliedInNormalFollowUps = false;
    // Track effective attacker state for follow-up evaluations
    let effectiveAttacker = attacker;

    if (eligibleFollowUps.length > 0) {
      console.log('\n--- FOLLOW-UP ATTACKS ---');

      for (const followUp of eligibleFollowUps) {
        // Calculate average damage for the follow-up attack
        const avgDamage = Math.round((followUp.minDamage + followUp.maxDamage) / 2);
        const multipliedDamage = Math.round(avgDamage * (followUp.damageMultiplier || 1));

        // Get current battle state for buff evaluation
        const currentBattleState = get().battleState!;
        // Create effective battle state with updated attacker for buff evaluation
        const effectiveBattleState = {
          ...currentBattleState,
          team: currentBattleState.team.map(c => c.id === attackerId ? effectiveAttacker : c),
        };

        // Build buff pool evaluation context for follow-up attack (special attack)
        const followUpBuffContext: BuffEvaluationContext = {
          attacker: effectiveAttacker,
          attackType: 'melee', // Follow-ups are treated as melee
          attackCategory: 'special',
          target: currentBattleState.boss,
          battleState: effectiveBattleState,
        };

        // Get applicable buffs from the pool (includes LC buffs if conditions met)
        const followUpApplicableBuffs = getApplicableBuffs(currentBattleState.buffPool, followUpBuffContext);
        const followUpPoolEffects = combineBuffEffects(followUpApplicableBuffs);

        // Extract LC bonuses from pool effects
        const lcExtraDmg = followUpPoolEffects.baseDamageBonus || 0;
        const lcExtraHits = followUpPoolEffects.extraHits || 0;

        // If LC +2 hits was applied, update effective attacker for subsequent follow-ups
        if (lcExtraHits > 0) {
          effectiveAttacker = { ...effectiveAttacker, hasUsedFirstSpecialAttackThisTurn: true };
          lcHitsAppliedInNormalFollowUps = true;
        }

        if (lcExtraDmg > 0 || lcExtraHits > 0) {
          console.log(`[Pool Buff applied: +${lcExtraDmg} dmg, +${lcExtraHits} hits]`);
        }

        // Get Lord of the Host aura bonuses for follow-up attacks (melee only)
        // Follow-up attacks are treated as melee attacks for aura purposes
        const followUpAuraBonuses = getCharacterAuraBonuses(attacker, battleState.team);
        const activeFollowUpAuras = followUpAuraBonuses.filter(a => {
          if (!a.isActive) return false;
          // Only apply melee-restricted auras since follow-ups are melee
          if (a.attackTypeRestriction && a.attackTypeRestriction !== 'melee') return false;
          return true;
        });

        // Calculate aura damage and hit bonuses
        let auraDmgBonus = 0;
        let auraHitsBonus = 0;
        for (const aura of activeFollowUpAuras) {
          if (aura.modifiers) {
            auraDmgBonus += aura.modifiers.baseDamageBonus || 0;
            auraHitsBonus += aura.modifiers.extraHits || 0;
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

        // Build buff sources for breakdown display (LC + aura bonuses)
        type FollowUpBuffSource = { name: string; sourceName?: string; damageBonus?: number; extraHits?: number };
        const followUpBuffSources: FollowUpBuffSource[] = [];
        if (lcExtraDmg > 0 || lcExtraHits > 0) {
          followUpBuffSources.push({
            name: 'Legendary Commander',
            sourceName: 'Trajann',
            damageBonus: lcExtraDmg > 0 ? lcExtraDmg : undefined,
            extraHits: lcExtraHits > 0 ? lcExtraHits : undefined,
          });
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

        const followUpStats: AttackerStats = {
          baseDamage: multipliedDamage,  // Just the ability base damage (avg of min/max * multiplier)
          damageType: followUp.damageProfile,
          hits: followUp.hits,  // Base hits only, extra hits via abilityModifiers
          critChance: equipmentStats.critChance || 0,
          critDamage: equipmentStats.critDmg || 0,
          critChanceBonus: equipmentStats.critChanceBonus || 0,
          critDmgBonus: equipmentStats.critDmgBonus || 0,
          ignoreCrit,
          traits: attacker.traits, // Apply trait bonuses to follow-up attacks
          hasMoved: true,
          attackType: 'melee', // Follow-up attacks count as melee
          hasAttackedThisBattle: true, // Main attack just happened
          attacksThisTurn: 1, // At least 1 attack this turn (the main attack)
          // Use the main attack's firstAttackTurn (if null, this is the first attack turn)
          firstAttackTurn: attacker.firstAttackTurn ?? currentTurn,
          currentTurn,
          // Pass bonuses via abilityModifiers for proper source tracking in breakdown
          abilityModifiers: (lcExtraDmg + auraDmgBonus > 0 || lcExtraHits + auraHitsBonus > 0) ? {
            baseDamageBonus: lcExtraDmg + auraDmgBonus > 0 ? lcExtraDmg + auraDmgBonus : undefined,
            extraHits: lcExtraHits + auraHitsBonus > 0 ? lcExtraHits + auraHitsBonus : undefined,
            buffSources: followUpBuffSources,
          } : undefined,
        };

        // Calculate follow-up damage
        const followUpCalculator = new DamageCalculator(true);
        const followUpResult = followUpCalculator.calculate(followUpStats, defenderStats);

        // Log follow-up attack details (totalHits includes base + extra from abilityModifiers)
        const bonusText = (followUp.damageMultiplier || 1) > 1
          ? ` (×${followUp.damageMultiplier?.toFixed(2)} from attack turns)`
          : '';
        const categoryText = followUp.attackCategory === 'special' ? ' [SPECIAL]' : '';
        const lcText = lcExtraDmg > 0 || lcExtraHits > 0 ? ` [+LC: ${lcExtraDmg} dmg, ${lcExtraHits} hits]` : '';
        const auraText = auraDmgBonus > 0 || auraHitsBonus > 0 ? ` [+Aura: ${auraDmgBonus} dmg, ${auraHitsBonus} hits]` : '';
        console.log(`\n${followUp.abilityName}${categoryText}: ${followUpResult.totalHits}x ${followUp.damageProfile}${bonusText}${lcText}${auraText}`);
        followUpCalculator.printLogs();
        console.log(`Follow-up Damage: ${followUpResult.damage.toLocaleString()}`);

        // Add to totals
        totalDamage += followUpResult.damage;
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
          breakdown: followUpBreakdown,
        });
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
      };

      // Calculate Drachnyen follow-up damage
      const drachnyenCalculator = new DamageCalculator(true);
      const drachnyenResult = drachnyenCalculator.calculate(drachnyenAttackerStats, defenderStats);

      console.log(`Drach'nyen: ${drachnyenResult.totalHits}x ${drachnyenResult.perHitDamage} = ${drachnyenResult.damage}`);

      totalDamage += drachnyenResult.damage;
      // Track max perHitDamage for Laviscus outrage
      maxPerHitDamage = Math.max(maxPerHitDamage, drachnyenResult.perHitDamage);

      // Build breakdown for Drachnyen follow-up
      const drachnyenBreakdown: DamageBreakdown = {
        damage: drachnyenResult.damage,
        perHitDamage: drachnyenResult.perHitDamage,
        hits: drachnyenResult.totalHits,
        baseDamage: avgDamage,
        flatModifiers: 0,
        flatModifierSources: [],
        critBonus: drachnyenResult.critBonus,
        critChanceSources: [],
        critDamageSources: [],
        extraHits: 0,
        extraHitsSources: [],
        damVarMod: drachnyenResult.damVarMod,
        targetArmor: bossArmor,
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

      followUpAttackLogs.push({
        abilityName: "Drach'nyen",
        damage: drachnyenResult.damage,
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
      afterArmor: result.afterArmor,
      pierceRatio: result.pierceRatio,
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
    set((state) => ({
      battleState: state.battleState
        ? {
            ...state.battleState,
            totalDamageDealt: state.battleState.totalDamageDealt + totalDamage,
            // Remove consumed buffs from the pool
            buffPool: buffsToConsume.length > 0
              ? state.battleState.buffPool.filter(b => !buffsToConsume.includes(b.id))
              : state.battleState.buffPool,
            team: state.battleState.team.map((char) => {
              if (char.id === attackerId) {
                // Update attacker
                const updates: Partial<BattleCharacter> = {
                  totalDamageDealt: char.totalDamageDealt + totalDamage,
                  hasAttackedThisBattle: true,
                  attacksThisTurn: char.attacksThisTurn + 1,
                  totalAttacksThisBattle: char.totalAttacksThisBattle + 1,  // For FirstAmongTraitors scaling
                  // Set firstAttackTurn only on the first attack (when it's null)
                  firstAttackTurn: char.firstAttackTurn ?? state.battleState!.turn,
                  // Mark first special attack used if LC +2 hits was applied to any follow-up
                  hasUsedFirstSpecialAttackThisTurn: char.hasUsedFirstSpecialAttackThisTurn || lcHitsAppliedInNormalFollowUps,
                };

                // If Laviscus attacks, reset his outrage
                if (isLaviscus) {
                  updates.outrage = 0;
                  updates.outrageContributors = [];
                }

                return { ...char, ...updates };
              }

              // For other characters: track outrage for Laviscus
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
      attackType: 'ability' as const,
      attackCategory: 'ability' as const,
      isFirstSpecialAttackOfTurn: !character.hasUsedFirstSpecialAttackThisTurn,  // Per-character LC tracking
      trajannIsAdjacentToBoss,
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

      // Use boss armor if available, otherwise 0
      const bossArmor = battleState.boss?.armor ?? 0;
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

        if (lcExtraDmg > 0 || lcExtraHits > 0) {
          console.log(`[Component ${componentIndex} buffs: +${lcExtraDmg} dmg, +${lcExtraHits} hits]`);
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
        const componentBuffSources: Array<{ name: string; sourceName?: string; damageBonus?: number; extraHits?: number }> = [];
        if (lcExtraDmg > 0 || lcExtraHits > 0) {
          componentBuffSources.push({
            name: 'Legendary Commander',
            damageBonus: lcExtraDmg > 0 ? lcExtraDmg : undefined,
            extraHits: lcExtraHits > 0 ? lcExtraHits : undefined,
          });
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
          // Pass bonuses via abilityModifiers for proper source tracking in breakdown
          abilityModifiers: (componentTotalDmgBonus > 0 || componentTotalHitsBonus > 0) ? {
            baseDamageBonus: componentTotalDmgBonus > 0 ? componentTotalDmgBonus : undefined,
            extraHits: componentTotalHitsBonus > 0 ? componentTotalHitsBonus : undefined,
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
        // After first component, if adjacent to boss, mark ability as "used" for LC qualification
        if (componentIndex === 1 && isAdjacentToBoss && !effectiveCharacter.hasQualifiedForLCDamage) {
          effectiveCharacter = { ...effectiveCharacter, hasQualifiedForLCDamage: true };
          console.log(`[Component ${componentIndex} completed: ${character.name} now qualifies for LC damage]`);
        }

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
      if (lcExtraHits > 0) lcHitsAppliedToAbility = true;

      if (lcExtraDmg > 0 || lcExtraHits > 0) {
        console.log(`[Pool Buff applied to ability: +${lcExtraDmg} dmg, +${lcExtraHits} hits]`);
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
      if (lcExtraDmg > 0 || lcExtraHits > 0) {
        abilityBuffSources.push({
          name: 'Legendary Commander',
          damageBonus: lcExtraDmg > 0 ? lcExtraDmg : undefined,
          extraHits: lcExtraHits > 0 ? lcExtraHits : undefined,
        });
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

      // Use boss armor if available, otherwise 0
      const bossArmor = battleState.boss?.armor ?? 0;
      const defenderStats: DefenderStats = {
        armor: bossArmor,
        maxHealth: battleState.boss?.health ?? 100000,
        traits: battleState.boss?.traits,
      };

      // Calculate total damage and hit bonuses (LC + aura)
      const totalDmgBonus = lcExtraDmg + auraDmgBonus;
      const totalHitsBonus = lcExtraHits + auraHitsBonus;

      // Check if we have any ability modifiers to pass
      const hasModifiers = totalDmgBonus > 0 || totalHitsBonus > 0 || abilityGlobalMultiplier;

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
        // Pass bonuses via abilityModifiers for proper source tracking in breakdown
        abilityModifiers: hasModifiers ? {
          baseDamageBonus: totalDmgBonus > 0 ? totalDmgBonus : undefined,
          baseDamageMultiplier: abilityGlobalMultiplier,
          extraHits: totalHitsBonus > 0 ? totalHitsBonus : undefined,
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
      } else {
        // Legacy: store buff on character activeBuffs
        set((state) => ({
          battleState: state.battleState
            ? {
                ...state.battleState,
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
      }
    } else {
      // Other non-damage ability (e.g., healing without buff) - mark ability as used
      // Check if character is adjacent to boss for LC qualification
      const isAdjacentToBoss = character.abilityToggles['adjacentToBoss'] ?? false;

      set((state) => ({
        battleState: state.battleState
          ? {
              ...state.battleState,
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

      // Use boss armor and traits if available
      const bossArmorFollowUp = battleState.boss?.armor ?? 0;
      const defenderStats: DefenderStats = {
        armor: bossArmorFollowUp,
        maxHealth: battleState.boss?.health ?? 100000,
        traits: battleState.boss?.traits,
      };

      // Track if LC +2 hits was applied to any follow-up attack (so subsequent follow-ups don't also get it)
      let lcHitsAppliedInFollowUps = false;
      // Track effective character state for follow-up evaluations (for per-character LC tracking)
      let effectiveCharacter = updatedCharacter;

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

        // Extract LC bonuses from pool effects
        const lcExtraDmg = followUpPoolEffects.baseDamageBonus || 0;
        const lcExtraHits = followUpPoolEffects.extraHits || 0;

        // If LC +2 hits was applied, update effective character for subsequent follow-ups
        if (lcExtraHits > 0) {
          effectiveCharacter = { ...effectiveCharacter, hasUsedFirstSpecialAttackThisTurn: true };
          lcHitsAppliedInFollowUps = true;
        }

        if (lcExtraDmg > 0 || lcExtraHits > 0) {
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
        let auraDmgBonus = 0;
        let auraHitsBonus = 0;
        for (const aura of activeFollowUpAuras) {
          if (aura.modifiers) {
            auraDmgBonus += aura.modifiers.baseDamageBonus || 0;
            auraHitsBonus += aura.modifiers.extraHits || 0;
          }
        }

        if (auraDmgBonus > 0 || auraHitsBonus > 0) {
          console.log(`[Aura Buff applied to ${followUp.abilityName}: +${auraDmgBonus} dmg, +${auraHitsBonus} hits]`);
        }

        // Base damage is the average of min/max (multiplier applied via Global)
        const avgDamagePerHit = Math.round((followUp.minDamage + followUp.maxDamage) / 2);

        // Build buff sources for breakdown display (LC + aura bonuses + ability multiplier)
        type FollowUpBuffSource = { name: string; sourceName?: string; damageBonus?: number; extraHits?: number; damageMultiplier?: number };
        const followUpBuffSources: FollowUpBuffSource[] = [];
        if (lcExtraDmg > 0 || lcExtraHits > 0) {
          followUpBuffSources.push({
            name: 'Legendary Commander',
            sourceName: 'Trajann',
            damageBonus: lcExtraDmg > 0 ? lcExtraDmg : undefined,
            extraHits: lcExtraHits > 0 ? lcExtraHits : undefined,
          });
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

        // Check if we have any modifiers to pass
        const hasFollowUpModifiers = lcExtraDmg + auraDmgBonus > 0 || lcExtraHits + auraHitsBonus > 0 || followUpGlobalMultiplier;

        // Calculate damage using averageDamage (with crit)
        const followUpStats: AttackerStats = {
          baseDamage: avgDamagePerHit,  // Just the ability base damage (avg of min/max)
          damageType: followUp.damageProfile,
          hits: followUp.hits,  // Base hits only, extra hits via abilityModifiers
          critChance: equipmentStats.critChance || 0,
          critDamage: equipmentStats.critDmg || 0,
          critChanceBonus: equipmentStats.critChanceBonus || 0,
          critDmgBonus: equipmentStats.critDmgBonus || 0,
          ignoreCrit,
          traits: character.traits,
          hasMoved: true,
          attackType: 'melee',
          hasAttackedThisBattle: true,
          attacksThisTurn: 1,
          firstAttackTurn: character.firstAttackTurn ?? battleState.turn,
          currentTurn: battleState.turn,
          // Pass bonuses via abilityModifiers for proper source tracking in breakdown
          abilityModifiers: hasFollowUpModifiers ? {
            baseDamageBonus: lcExtraDmg + auraDmgBonus > 0 ? lcExtraDmg + auraDmgBonus : undefined,
            baseDamageMultiplier: followUpGlobalMultiplier,
            extraHits: lcExtraHits + auraHitsBonus > 0 ? lcExtraHits + auraHitsBonus : undefined,
            buffSources: followUpBuffSources,
          } : undefined,
        };
        const followUpCalc = new DamageCalculator(true);
        const followUpResult = followUpCalc.calculate(followUpStats, defenderStats);

        // Log follow-up attack details (totalHits includes base + extra from abilityModifiers)
        const bonusText = (followUp.damageMultiplier || 1) > 1
          ? ` (×${followUp.damageMultiplier?.toFixed(2)} from attack turns)`
          : '';
        const lcText = lcExtraDmg > 0 || lcExtraHits > 0 ? ` [+LC: ${lcExtraDmg} dmg, ${lcExtraHits} hits]` : '';
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
          breakdown: followUpBreakdown,
        });
      }

      // Update totals with follow-up damage
      if (followUpAttackLogs.length > 0) {
        const followUpTotalDamage = followUpAttackLogs.reduce((sum, f) => sum + f.damage, 0);

        set((state) => ({
          battleState: state.battleState
            ? {
                ...state.battleState,
                totalDamageDealt: state.battleState.totalDamageDealt + followUpTotalDamage,
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
}));
