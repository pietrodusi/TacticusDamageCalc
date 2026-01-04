import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Play, RotateCcw, Trash2, PackageX } from 'lucide-react';
import { useTeamStore } from '../stores/teamStore';
import { useBattleStore } from '../stores/battleStore';
import { TeamSlot, BossSelector, MachineOfWarSelector } from '../components/battle';
import type { ActionType, BattleCharacter, BossRank } from '../types';
import {
  BattleCharacterCard,
  BattleLog,
  BattleSummary,
  BattleBossCard,
  DamageSummary,
  RepairTargetModal,
  AttackTypeModal,
} from '../components/battle';
import type { TurnLogEntry } from '../components/battle/BattleLog';
import { abilityEndsTurn, getAbilityValues } from '../services/abilities';
import { getBossAtRank, getMachineOfWarDamageBonus } from '../services/dataService';

// Helper to calculate total damage from log entries
function calculateDamageFromEntries(entries: TurnLogEntry[]): number {
  return entries.reduce((total, entry) => {
    if (entry.damageBreakdown) {
      return total + entry.damageBreakdown.damage;
    } else if (entry.damage) {
      return total + entry.damage;
    }
    return total;
  }, 0);
}

export function CalculatorPage() {
  const {
    team,
    removeCharacter,
    clearTeam,
    clearAllEquipment,
    selectedBoss,
    setSelectedBoss,
    updateBossRank,
    toggleBossModifiers,
    clearBoss,
    selectedMachineOfWar,
    setSelectedMachineOfWar,
    updateMachineOfWarStars,
    clearMachineOfWar,
  } = useTeamStore();
  const {
    battleState,
    startBattle,
    resetBattle,
    nextTurn,
    finishBattle,
    addAction,
    setCharacterMoved,
    setCharacterActed,
    executeAttack,
    executeAbility,
    resetCharacterTurnAtTurn,
    restoreTurnStart,
    editingTurn,
    setEditingTurn,
    getActiveTurn,
    toggleAbility,
    setIgnoreCrit,
    setCharacterTurnEnded,
    executeRepairWithGalvanicField,
    markAbilityUsed,
    setBossMarkerlight,
  } = useBattleStore();

  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [battleLog, setBattleLog] = useState<TurnLogEntry[]>([]);
  const battleSummaryRef = useRef<HTMLDivElement>(null);

  // Scroll to battle summary when battle is complete
  useEffect(() => {
    if (battleState?.isComplete && battleSummaryRef.current) {
      battleSummaryRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [battleState?.isComplete]);

  // Repair modal state (for Actus's Mechanic trait and DefendTheDivineWork)
  const [repairModalOpen, setRepairModalOpen] = useState(false);
  const [attackTypeModalOpen, setAttackTypeModalOpen] = useState(false);
  const [repairContext, setRepairContext] = useState<{
    repairerId: string;
    repairType: 'mechanic' | 'ddw';
    healAmount: number;
    selectedTargets: string[];
    attackTypeChoices: Record<string, 'melee' | 'ranged'>;
    pendingAttackChoiceTargets: string[];
  } | null>(null);

  // Get the active turn (editing turn or current turn)
  const activeTurn = getActiveTurn();
  const isEditingPastTurn = editingTurn !== null && editingTurn < (battleState?.turn ?? 0);

  // Get character action state from battle log for a specific turn
  const getCharacterTurnState = (characterId: string, turn: number) => {
    const entries = battleLog.filter(e => e.characterId === characterId && e.turn === turn);
    const hasAttacked = entries.some(e =>
      e.action === 'attack' || e.action === 'meleeAttack' || e.action === 'rangedAttack'
    );
    const hasUsedAbility = entries.some(e => e.action === 'ability');
    const hasMoved = entries.some(e => e.action === 'move') || hasAttacked;
    const hasActed = hasAttacked || hasUsedAbility;
    const hasWaited = entries.some(e => e.action === 'wait');

    return {
      hasMoved: hasMoved || hasWaited,
      hasActed: hasActed || hasWaited,
    };
  };

  // Get effective character state (considering editing mode)
  const getEffectiveCharacter = (character: BattleCharacter): BattleCharacter => {
    if (!isEditingPastTurn || editingTurn === null) {
      return character;
    }
    // When editing a past turn, use action state from battle log
    const turnState = getCharacterTurnState(character.id, editingTurn);
    return {
      ...character,
      hasMoved: turnState.hasMoved,
      hasActed: turnState.hasActed,
    };
  };

  const handleStartBattle = () => {
    if (team.length === 0) return;
    // Get the boss data if one is selected (with or without modifiers based on setting)
    const boss = selectedBoss
      ? getBossAtRank(selectedBoss.bossId, selectedBoss.rank, selectedBoss.applyModifiers) ?? undefined
      : undefined;
    // Get Machine of War data with extraDmgPct
    const machineOfWarData = selectedMachineOfWar
      ? {
          machineId: selectedMachineOfWar.machineId,
          stars: selectedMachineOfWar.stars,
          extraDmgPct: getMachineOfWarDamageBonus(selectedMachineOfWar.machineId, selectedMachineOfWar.stars),
        }
      : undefined;
    startBattle(team, boss, machineOfWarData);
    setBattleLog([]);
    setSelectedCharacterId(null);
  };

  const handleResetBattle = () => {
    resetBattle();
    setBattleLog([]);
    setSelectedCharacterId(null);
  };

  const handleNextTurn = () => {
    if (!battleState) return;

    // Filter log entries for the current turn to pass to turnHistory
    const currentTurnLog = battleLog.filter(entry => entry.turn === battleState.turn);

    // On turn 6, finish the battle instead of going to turn 7
    if (battleState.turn === 6) {
      finishBattle(currentTurnLog);
    } else {
      nextTurn(currentTurnLog);
    }
    setSelectedCharacterId(null);
  };

  const isLastTurn = battleState?.turn === 6;

  const handleUndoActions = (_characterId: string) => {
    if (!battleState) return;

    const currentTurn = battleState.turn;

    // Restore entire turn to start state using snapshot
    restoreTurnStart();

    // Remove ALL log entries for the current turn (entire turn is reset)
    setBattleLog(prev => prev.filter(entry => entry.turn !== currentTurn));
  };

  const handleUndoCharacterTurn = (characterId: string, turn: number) => {
    if (!battleState) return;

    // Calculate damage to subtract from this character's actions in the specified turn
    const characterEntries = battleLog.filter(
      entry => entry.characterId === characterId && entry.turn === turn
    );
    const damageToSubtract = calculateDamageFromEntries(characterEntries);

    // Reset character turn in store (handles both current and past turns)
    resetCharacterTurnAtTurn(characterId, turn, damageToSubtract);

    // Remove this character's log entries for the specified turn
    setBattleLog(prev => prev.filter(
      entry => !(entry.characterId === characterId && entry.turn === turn)
    ));
  };

  const handleAction = (characterId: string, actionType: ActionType) => {
    if (!battleState) return;

    const character = battleState.team.find((c) => c.id === characterId);
    if (!character) return;

    // Use activeTurn for logging (supports editing past turns)
    const targetTurn = activeTurn;

    switch (actionType) {
      case 'move':
        // Only modify current turn flags if not editing past turn
        if (!isEditingPastTurn) {
          setCharacterMoved(characterId, true);
        }
        addAction(characterId, { type: 'move', characterId });
        setBattleLog((prev) => [
          ...prev,
          {
            timestamp: Date.now(),
            characterId,
            characterName: character.name,
            action: 'move' as const,
            message: `${character.name} moves`,
            turn: targetTurn,
          },
        ]);
        break;

      case 'attack':
      case 'meleeAttack': {
        // Only modify current turn flags if not editing past turn
        if (!isEditingPastTurn) {
          setCharacterActed(characterId, true);
          setCharacterTurnEnded(characterId, true); // Basic attack ends turn
        }
        addAction(characterId, { type: 'meleeAttack', characterId, targetId: 'boss' });

        // Execute attack and add to log (executeAttack updates total damage in store)
        // Note: hasMoved reflects actual movement, not action state
        const meleeLog = executeAttack(characterId, 'boss', 'melee');
        setBattleLog((prev) => [...prev, { ...meleeLog, turn: targetTurn }]);
        break;
      }

      case 'rangedAttack': {
        // Only modify current turn flags if not editing past turn
        if (!isEditingPastTurn) {
          setCharacterActed(characterId, true);
          setCharacterTurnEnded(characterId, true); // Basic attack ends turn
        }
        addAction(characterId, { type: 'rangedAttack', characterId, targetId: 'boss' });

        // Execute attack and add to log (executeAttack updates total damage in store)
        // Note: hasMoved reflects actual movement, not action state
        const rangedLog = executeAttack(characterId, 'boss', 'ranged');
        setBattleLog((prev) => [...prev, { ...rangedLog, turn: targetTurn }]);
        break;
      }

      case 'ability': {
        // Execute ability and get damage result
        const abilityId = character.activeAbilities[0];

        // Special handling for DefendTheDivineWork - opens repair modal for multi-target selection
        if (abilityId === 'DefendTheDivineWork') {
          const ddwLevelIndex = character.abilityLevels?.['DefendTheDivineWork'] ?? 54;
          const ddwValues = getAbilityValues('DefendTheDivineWork', ddwLevelIndex);
          const hpToRepair = (ddwValues?.hpToRepair as number) || 0;

          setRepairContext({
            repairerId: characterId,
            repairType: 'ddw',
            healAmount: hpToRepair,
            selectedTargets: [],
            attackTypeChoices: {},
            pendingAttackChoiceTargets: [],
          });
          setRepairModalOpen(true);
          break;
        }

        // Only modify current turn flags if not editing past turn
        if (!isEditingPastTurn) {
          // Check if this ability ends the turn
          let endsTurn = abilityId ? abilityEndsTurn(abilityId) : true;

          // Fighting Retreat: Never ends Darkstrider's turn
          if (abilityId === 'FightingRetreat') {
            endsTurn = false;
          }

          if (endsTurn) {
            setCharacterActed(characterId, true);
            setCharacterTurnEnded(characterId, true);
          }
          // LC hits buff activation is handled inside executeAbility
        }
        addAction(characterId, { type: 'ability', characterId });

        if (abilityId) {
          const abilityLog = executeAbility(characterId, abilityId);
          setBattleLog((prev) => [...prev, { ...abilityLog, turn: targetTurn }]);
        } else {
          setBattleLog((prev) => [
            ...prev,
            {
              timestamp: Date.now(),
              characterId,
              characterName: character.name,
              action: 'ability' as const,
              message: `${character.name} has no ability`,
              turn: targetTurn,
            },
          ]);
        }
        break;
      }

      case 'wait':
        // Only modify current turn flags if not editing past turn
        if (!isEditingPastTurn) {
          setCharacterMoved(characterId, true);
          setCharacterActed(characterId, true);
        }
        addAction(characterId, { type: 'wait', characterId });
        setBattleLog((prev) => [
          ...prev,
          {
            timestamp: Date.now(),
            characterId,
            characterName: character.name,
            action: 'wait' as const,
            message: `${character.name} waits`,
            turn: targetTurn,
          },
        ]);
        break;

      case 'repair': {
        // Open repair target modal for Mechanic trait
        // Calculate heal amount: character's damage × max(meleeHits, rangedHits)
        const maxHits = Math.max(character.meleeHits, character.rangedHits || 0);
        const healAmount = character.calculatedDamage * maxHits;

        setRepairContext({
          repairerId: characterId,
          repairType: 'mechanic',
          healAmount,
          selectedTargets: [],
          attackTypeChoices: {},
          pendingAttackChoiceTargets: [],
        });
        setRepairModalOpen(true);
        break;
      }
    }
  };

  // Helper to check if character has both melee and ranged attacks
  const hasBothAttacks = (char: BattleCharacter) => {
    const hasMelee = char.meleeHits > 0;
    const hasRanged = char.rangedHits !== undefined && char.rangedHits > 0;
    return hasMelee && hasRanged;
  };

  // Handle repair target selection
  const handleRepairTargetConfirm = (targetIds: string[]) => {
    if (!repairContext || !battleState) return;

    const repairer = battleState.team.find(c => c.id === repairContext.repairerId);
    if (!repairer) return;

    // Find targets that need attack type choice (non-self with both melee and ranged)
    const pendingAttackChoiceTargets = targetIds.filter(targetId => {
      if (targetId === repairContext.repairerId) return false; // Self-repair doesn't trigger attack
      const target = battleState.team.find(c => c.id === targetId);
      return target && hasBothAttacks(target);
    });

    // Set default attack type for targets without both attacks (melee by default)
    const attackTypeChoices: Record<string, 'melee' | 'ranged'> = {};
    targetIds.forEach(targetId => {
      if (targetId === repairContext.repairerId) return; // Skip self
      const target = battleState.team.find(c => c.id === targetId);
      if (target && !hasBothAttacks(target)) {
        // Default to melee, or ranged if no melee
        attackTypeChoices[targetId] = target.meleeHits > 0 ? 'melee' : 'ranged';
      }
    });

    setRepairContext({
      ...repairContext,
      selectedTargets: targetIds,
      attackTypeChoices,
      pendingAttackChoiceTargets,
    });

    setRepairModalOpen(false);

    // If there are attack type choices needed, open the modal
    if (pendingAttackChoiceTargets.length > 0) {
      setAttackTypeModalOpen(true);
    } else {
      // No choices needed, execute repair immediately
      executeRepairAction(targetIds, attackTypeChoices);
    }
  };

  // Handle attack type selection for Galvanic Field
  const handleAttackTypeSelect = (attackType: 'melee' | 'ranged') => {
    if (!repairContext || repairContext.pendingAttackChoiceTargets.length === 0) return;

    const currentTargetId = repairContext.pendingAttackChoiceTargets[0];
    const remainingTargets = repairContext.pendingAttackChoiceTargets.slice(1);
    const updatedChoices = {
      ...repairContext.attackTypeChoices,
      [currentTargetId]: attackType,
    };

    if (remainingTargets.length > 0) {
      // More choices needed
      setRepairContext({
        ...repairContext,
        attackTypeChoices: updatedChoices,
        pendingAttackChoiceTargets: remainingTargets,
      });
    } else {
      // All choices made, execute repair
      setAttackTypeModalOpen(false);
      executeRepairAction(repairContext.selectedTargets, updatedChoices);
    }
  };

  // Execute the repair action with Galvanic Field
  const executeRepairAction = (targetIds: string[], attackTypeChoices: Record<string, 'melee' | 'ranged'>) => {
    if (!repairContext || !battleState) return;

    const targetTurn = activeTurn;

    // Only modify current turn flags if not editing past turn
    if (!isEditingPastTurn) {
      setCharacterActed(repairContext.repairerId, true);
      setCharacterTurnEnded(repairContext.repairerId, true);

      // Mark DefendTheDivineWork as used (one-time per battle)
      if (repairContext.repairType === 'ddw') {
        markAbilityUsed(repairContext.repairerId, 'DefendTheDivineWork');
      }
    }

    // Execute repair and get log entries
    const logEntries = executeRepairWithGalvanicField(
      repairContext.repairerId,
      targetIds,
      repairContext.healAmount,
      attackTypeChoices
    );

    // Add to battle log
    setBattleLog((prev) => [
      ...prev,
      ...logEntries.map(entry => ({ ...entry, turn: targetTurn })),
    ]);

    // Clear repair context
    setRepairContext(null);
  };

  // Cancel repair action
  const handleRepairCancel = () => {
    setRepairModalOpen(false);
    setAttackTypeModalOpen(false);
    setRepairContext(null);
  };

  // Team setup mode
  if (!battleState) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-imperial-gold mb-2">
            Damage Calculator
          </h1>
          <p className="text-gray-400">
            Build your team of up to 5 characters and simulate a 6-turn Guild Raid battle
          </p>
        </div>

        {/* Team Slots */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-100">Your Team</h2>
            {team.length > 0 && (
              <div className="flex items-center gap-4">
                <button
                  onClick={clearAllEquipment}
                  className="flex items-center gap-2 text-sm text-amber-400 hover:text-amber-300 transition-colors"
                >
                  <PackageX size={16} />
                  Remove Equip
                </button>
                <button
                  onClick={clearTeam}
                  className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors"
                >
                  <Trash2 size={16} />
                  Clear All
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {Array.from({ length: 5 }, (_, i) => (
              <TeamSlot
                key={i}
                slotIndex={i}
                character={team[i]}
                onRemove={removeCharacter}
              />
            ))}
          </div>

          {/* Machine of War Selector */}
          <div className="mt-6">
            <MachineOfWarSelector
              selectedMachineId={selectedMachineOfWar?.machineId ?? null}
              selectedStars={selectedMachineOfWar?.stars ?? 14}
              onSelectMachine={setSelectedMachineOfWar}
              onUpdateStars={updateMachineOfWarStars}
              onClearMachine={clearMachineOfWar}
            />
          </div>

          {/* Boss Selector */}
          <div className="mt-4">
            <BossSelector
              selectedBossId={selectedBoss?.bossId ?? null}
              selectedRank={selectedBoss?.rank ?? (13 as BossRank)}
              applyModifiers={selectedBoss?.applyModifiers ?? true}
              onSelectBoss={setSelectedBoss}
              onUpdateRank={updateBossRank}
              onToggleModifiers={toggleBossModifiers}
              onClearBoss={clearBoss}
            />
          </div>
        </div>

        {/* Start Battle Button */}
        <div className="flex justify-center">
          <button
            onClick={handleStartBattle}
            disabled={team.length === 0}
            className={`flex items-center gap-2 px-8 py-4 rounded-lg font-bold text-lg transition-all ${
              team.length > 0
                ? 'btn-primary hover:scale-105'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            <Play size={24} />
            Start Battle Simulation
          </button>
        </div>

        {/* Info */}
        {team.length === 0 && (
          <div className="text-center">
            <p className="text-gray-500 mb-2">No characters selected</p>
            <Link to="/characters" className="text-imperial-gold hover:underline">
              Browse characters to add to your team →
            </Link>
          </div>
        )}
      </div>
    );
  }

  // Battle mode
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-imperial-gold">
            Battle Simulation
          </h1>
          <p className="text-gray-400 text-sm">
            {battleState.isComplete
              ? 'Battle Complete!'
              : `Turn ${battleState.turn} of ${battleState.maxTurns}`}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={battleState.ignoreCrit}
              onChange={(e) => setIgnoreCrit(e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-imperial-gold focus:ring-imperial-gold focus:ring-offset-gray-800"
            />
            <span className="text-sm text-gray-300">Ignore Crit</span>
          </label>
          <button
            onClick={handleResetBattle}
            className="btn-secondary flex items-center gap-2"
          >
            <RotateCcw size={18} />
            Reset
          </button>
        </div>
      </div>

      {/* Damage Summary */}
      {!battleState.isComplete && (
        <DamageSummary battleState={battleState} />
      )}

      {/* Next Turn / Finish Battle Button */}
      {!battleState.isComplete && (
        <div className="flex justify-center">
          <button
            onClick={handleNextTurn}
            className="btn-primary flex items-center gap-2 px-6 py-3"
          >
            {isLastTurn ? 'Finish Battle' : `End Turn ${battleState.turn} →`}
          </button>
        </div>
      )}

      {/* Main Battle Area */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Characters - Column Layout */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-100">Characters</h2>
          <div className="space-y-2">
            {battleState.team.map((character) => {
              const effectiveCharacter = getEffectiveCharacter(character);
              return (
                <BattleCharacterCard
                  key={character.id}
                  character={effectiveCharacter}
                  team={battleState.team}
                  isSelected={selectedCharacterId === character.id}
                  currentTurn={battleState.turn}
                  selectedMachineOfWar={selectedMachineOfWar}
                  onSelect={() =>
                    setSelectedCharacterId(
                      selectedCharacterId === character.id ? null : character.id
                    )
                  }
                  onAction={(type) => handleAction(character.id, type)}
                  onUndo={() => handleUndoActions(character.id)}
                  onToggleAbility={(abilityId) => toggleAbility(character.id, abilityId)}
                />
              );
            })}
          </div>
        </div>

        {/* Right Column: Boss Card + Battle Log */}
        <div className="space-y-3">
          {/* Boss Card - shown if boss is selected */}
          {battleState.boss && (() => {
            // Only show Markerlight if team has T'au Empire characters or CyclicIonBlaster
            const hasMarkerlightRelevance = battleState.team.some(char =>
              char.faction === "T'au Empire" || char.faction === 'Tau' ||
              char.passiveAbilities.includes('CyclicIonBlaster')
            );

            return (
              <>
                <h2 className="text-lg font-semibold text-gray-100">Enemy Boss</h2>
                <BattleBossCard
                  boss={battleState.boss}
                  totalDamageDealt={battleState.totalDamageDealt}
                  bossArmorReduction={battleState.bossArmorReduction}
                  bossHasMarkerlight={battleState.bossHasMarkerlight}
                  onMarkerlightChange={hasMarkerlightRelevance ? setBossMarkerlight : undefined}
                  prophetOfGorkAndMork={battleState.prophetOfGorkAndMork}
                  bossAttacksReceivedThisTurn={battleState.bossAttacksReceivedThisTurn}
                />
              </>
            );
          })()}

          {/* Battle Log */}
          <h2 className="text-lg font-semibold text-gray-100">Battle Log</h2>
          <div className="card p-4">
            <BattleLog
              entries={battleLog}
              currentTurn={battleState.turn}
              editingTurn={editingTurn}
              isComplete={battleState.isComplete}
              onUndoCharacterTurn={handleUndoCharacterTurn}
              onEditTurn={setEditingTurn}
            />
          </div>
        </div>
      </div>

      {/* Battle Summary - shown when complete */}
      {battleState.isComplete && (
        <div ref={battleSummaryRef}>
          <BattleSummary
            team={battleState.team}
            totalDamage={battleState.totalDamageDealt}
            turnHistory={battleState.turnHistory}
            onReset={handleResetBattle}
          />
        </div>
      )}

      {/* Repair Target Modal (Actus's Mechanic trait) */}
      {repairContext && (
        <RepairTargetModal
          isOpen={repairModalOpen}
          onClose={handleRepairCancel}
          repairer={battleState.team.find(c => c.id === repairContext.repairerId)!}
          team={battleState.team}
          repairType={repairContext.repairType}
          repairAmount={repairContext.healAmount}
          onConfirm={handleRepairTargetConfirm}
        />
      )}

      {/* Attack Type Modal (Galvanic Field attack type choice) */}
      {repairContext && repairContext.pendingAttackChoiceTargets.length > 0 && (
        <AttackTypeModal
          isOpen={attackTypeModalOpen}
          onClose={handleRepairCancel}
          attacker={battleState.team.find(c => c.id === repairContext.pendingAttackChoiceTargets[0])!}
          onSelect={handleAttackTypeSelect}
        />
      )}
    </div>
  );
}
