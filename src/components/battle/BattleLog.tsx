import type { BattleLogEntry } from '../../types';
import { Sword, Move, Sparkles, Clock, RotateCcw, Crosshair, Pencil, X } from 'lucide-react';

// Extended entry with turn number
export interface TurnLogEntry extends BattleLogEntry {
  turn: number;
  attackType?: 'melee' | 'ranged';
}

interface BattleLogProps {
  entries: TurnLogEntry[];
  currentTurn: number;
  editingTurn?: number | null;
  onUndoCharacterTurn?: (characterId: string, turn: number) => void;
  onEditTurn?: (turn: number | null) => void;
}

const actionIcons = {
  move: Move,
  attack: Sword,
  meleeAttack: Sword,
  rangedAttack: Crosshair,
  ability: Sparkles,
  wait: Clock,
};

export function BattleLog({ entries, currentTurn, editingTurn, onUndoCharacterTurn, onEditTurn }: BattleLogProps) {
  // Group entries by turn
  const entriesByTurn: Record<number, TurnLogEntry[]> = {};
  for (let t = 1; t <= currentTurn; t++) {
    entriesByTurn[t] = entries.filter(e => e.turn === t);
  }

  return (
    <div className="space-y-4 max-h-[500px] overflow-y-auto">
      {Array.from({ length: currentTurn }, (_, i) => i + 1).map(turn => {
        const turnEntries = entriesByTurn[turn] || [];
        const isCurrent = turn === currentTurn;

        const isEditing = editingTurn === turn;
        const isPastTurn = turn < currentTurn;

        return (
          <div key={turn} className="space-y-2">
            {/* Turn Header */}
            <div className={`text-xs font-semibold px-2 py-1 rounded flex items-center justify-between ${
              isEditing
                ? 'bg-amber-500/30 text-amber-400 ring-1 ring-amber-500'
                : isCurrent
                  ? 'bg-imperial-gold/20 text-imperial-gold'
                  : 'bg-gray-700/50 text-gray-400'
            }`}>
              <span>
                Turn {turn}
                {isCurrent && !isEditing && ' (Current)'}
                {isEditing && ' (Editing)'}
              </span>
              {/* Edit/Close button for turns */}
              {onEditTurn && isPastTurn && (
                isEditing ? (
                  <button
                    onClick={() => onEditTurn(null)}
                    className="p-1 rounded hover:bg-gray-600 transition-colors"
                    title="Stop editing"
                  >
                    <X size={12} />
                  </button>
                ) : (
                  <button
                    onClick={() => onEditTurn(turn)}
                    className="p-1 rounded hover:bg-gray-600 transition-colors"
                    title="Edit this turn"
                  >
                    <Pencil size={12} />
                  </button>
                )
              )}
            </div>

            {/* Turn Entries */}
            {turnEntries.length === 0 ? (
              <div className="text-center py-2 text-gray-600 text-xs">
                No actions {isCurrent ? 'yet' : ''}
              </div>
            ) : (
              <div className="space-y-1">
                {/* Group entries by character */}
                {(() => {
                  const characterIds = [...new Set(turnEntries.map(e => e.characterId))];
                  return characterIds.map(charId => {
                    const charEntries = turnEntries.filter(e => e.characterId === charId);
                    const characterName = charEntries[0]?.characterName || 'Unknown';

                    return (
                      <div key={charId} className="bg-gray-800/50 rounded p-2">
                        {/* Character header with undo button */}
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-gray-300">{characterName}</span>
                          {onUndoCharacterTurn && (
                            <button
                              onClick={() => onUndoCharacterTurn(charId, turn)}
                              className="p-1 rounded hover:bg-gray-600 transition-colors"
                              title={`Undo ${characterName}'s actions`}
                            >
                              <RotateCcw size={12} className="text-gray-400 hover:text-imperial-gold" />
                            </button>
                          )}
                        </div>
                        {/* Character's actions */}
                        <div className="space-y-1">
                          {charEntries.map((entry, index) => {
                            const Icon = actionIcons[entry.action];
                            return (
                              <div
                                key={`${entry.timestamp}-${index}`}
                                className="flex items-start gap-2 text-sm"
                              >
                                <div className="p-1 rounded bg-gray-700">
                                  <Icon size={12} className="text-gray-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-gray-200 text-xs">{entry.message}</p>
                                  {entry.damage !== undefined && entry.damage > 0 && (
                                    <p className="text-red-400 text-xs">
                                      -{entry.damage.toLocaleString()} damage
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>
        );
      })}

      {currentTurn === 0 && (
        <div className="text-center py-6 text-gray-500 text-sm">
          <p>Battle not started</p>
        </div>
      )}
    </div>
  );
}
