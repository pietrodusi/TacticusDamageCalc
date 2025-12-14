import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, RotateCcw, Trash2 } from 'lucide-react';
import { useTeamStore } from '../stores/teamStore';
import { useBattleStore } from '../stores/battleStore';
import { TeamSlot } from '../components/battle';
import type { ActionType, BattleCharacter } from '../types';
import {
  BattleCharacterCard,
  BattleLog,
  DamageSummary,
  BattleSummary,
} from '../components/battle';
import type { TurnLogEntry } from '../components/battle/BattleLog';

export function CalculatorPage() {
  const { team, removeCharacter, clearTeam } = useTeamStore();
  const {
    battleState,
    startBattle,
    resetBattle,
    nextTurn,
    addAction,
    setCharacterMoved,
    setCharacterActed,
    executeAttack,
    resetCharacterTurn,
    resetCharacterTurnAtTurn,
    editingTurn,
    setEditingTurn,
    getActiveTurn,
  } = useBattleStore();

  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [battleLog, setBattleLog] = useState<TurnLogEntry[]>([]);

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
    startBattle(team);
    setBattleLog([]);
    setSelectedCharacterId(null);
  };

  const handleResetBattle = () => {
    resetBattle();
    setBattleLog([]);
    setSelectedCharacterId(null);
  };

  const handleNextTurn = () => {
    nextTurn();
    setSelectedCharacterId(null);
  };

  const handleUndoActions = (characterId: string) => {
    if (!battleState) return;

    const currentTurn = battleState.turn;

    // Calculate damage to subtract from this character's actions this turn
    const characterDamage = battleLog
      .filter(entry => entry.characterId === characterId && entry.turn === currentTurn && entry.damage)
      .reduce((total, entry) => total + (entry.damage || 0), 0);

    // Reset character turn in store (resets flags and subtracts damage)
    resetCharacterTurn(characterId, characterDamage);

    // Remove this character's log entries for the current turn
    setBattleLog(prev => prev.filter(
      entry => !(entry.characterId === characterId && entry.turn === currentTurn)
    ));
  };

  const handleUndoCharacterTurn = (characterId: string, turn: number) => {
    if (!battleState) return;

    // Calculate damage to subtract from this character's actions in the specified turn
    const characterDamage = battleLog
      .filter(entry => entry.characterId === characterId && entry.turn === turn && entry.damage)
      .reduce((total, entry) => total + (entry.damage || 0), 0);

    // Reset character turn in store (handles both current and past turns)
    resetCharacterTurnAtTurn(characterId, turn, characterDamage);

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
          setCharacterMoved(characterId, true);
          setCharacterActed(characterId, true);
        }
        addAction(characterId, { type: 'meleeAttack', characterId, targetId: 'boss' });

        // Execute attack and add to log (executeAttack updates total damage in store)
        const meleeLog = executeAttack(characterId, 'boss', 'melee');
        setBattleLog((prev) => [...prev, { ...meleeLog, turn: targetTurn }]);
        break;
      }

      case 'rangedAttack': {
        // Only modify current turn flags if not editing past turn
        if (!isEditingPastTurn) {
          setCharacterMoved(characterId, true);
          setCharacterActed(characterId, true);
        }
        addAction(characterId, { type: 'rangedAttack', characterId, targetId: 'boss' });

        // Execute attack and add to log (executeAttack updates total damage in store)
        const rangedLog = executeAttack(characterId, 'boss', 'ranged');
        setBattleLog((prev) => [...prev, { ...rangedLog, turn: targetTurn }]);
        break;
      }

      case 'ability':
        // Only modify current turn flags if not editing past turn
        if (!isEditingPastTurn) {
          setCharacterActed(characterId, true);
        }
        addAction(characterId, { type: 'ability', characterId });
        setBattleLog((prev) => [
          ...prev,
          {
            timestamp: Date.now(),
            characterId,
            characterName: character.name,
            action: 'ability' as const,
            message: `${character.name} uses ${character.activeAbilities[0] || 'ability'}`,
            turn: targetTurn,
          },
        ]);
        break;

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
    }
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
              <button
                onClick={clearTeam}
                className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors"
              >
                <Trash2 size={16} />
                Clear All
              </button>
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

        <div className="flex items-center gap-3">
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
      <DamageSummary battleState={battleState} />

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
                  isSelected={selectedCharacterId === character.id}
                  onSelect={() =>
                    setSelectedCharacterId(
                      selectedCharacterId === character.id ? null : character.id
                    )
                  }
                  onAction={(type) => handleAction(character.id, type)}
                  onUndo={() => handleUndoActions(character.id)}
                />
              );
            })}
          </div>
        </div>

        {/* Battle Log */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-100">Battle Log</h2>
          <div className="card p-4">
            <BattleLog
              entries={battleLog}
              currentTurn={battleState.turn}
              editingTurn={editingTurn}
              onUndoCharacterTurn={handleUndoCharacterTurn}
              onEditTurn={setEditingTurn}
            />
          </div>
        </div>
      </div>

      {/* Next Turn / Battle Summary */}
      {battleState.isComplete ? (
        <BattleSummary
          team={battleState.team}
          totalDamage={battleState.totalDamageDealt}
          onReset={handleResetBattle}
        />
      ) : (
        <div className="flex justify-center pt-4">
          <button
            onClick={handleNextTurn}
            className="btn-primary flex items-center gap-2 px-6 py-3"
          >
            Next Turn →
          </button>
        </div>
      )}
    </div>
  );
}
