import { User, CheckCircle, RotateCcw } from 'lucide-react';
import type { BattleCharacter, ActionType } from '../../types';
import { ActionPanel } from './ActionPanel';

interface BattleCharacterCardProps {
  character: BattleCharacter;
  isSelected: boolean;
  onSelect: () => void;
  onAction: (type: ActionType) => void;
  onUndo: () => void;
}

export function BattleCharacterCard({
  character,
  isSelected,
  onSelect,
  onAction,
  onUndo,
}: BattleCharacterCardProps) {
  const hasActedThisTurn = character.hasMoved && character.hasActed;
  const hasAnyAction = character.hasMoved || character.hasActed;

  return (
    <div
      className={`card p-3 transition-all ${
        isSelected ? 'ring-2 ring-imperial-gold' : ''
      } ${hasActedThisTurn ? 'opacity-60' : ''}`}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 cursor-pointer"
        onClick={onSelect}
      >
        {/* Portrait */}
        <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden flex-shrink-0">
          {character.iconUrl ? (
            <img
              src={character.iconUrl}
              alt={character.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <User size={20} className="text-gray-500" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-gray-100 truncate">
              {character.name}
            </h4>
            {hasActedThisTurn && (
              <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
            )}
            {hasAnyAction && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUndo();
                }}
                className="p-1 rounded hover:bg-gray-600 transition-colors ml-auto"
                title="Undo actions"
              >
                <RotateCcw size={14} className="text-gray-400 hover:text-imperial-gold" />
              </button>
            )}
          </div>

          {/* Action Status */}
          <div className="flex gap-2 mt-1 text-xs">
            <span
              className={`px-2 py-0.5 rounded ${
                character.hasMoved
                  ? 'bg-green-900/50 text-green-400'
                  : 'bg-gray-700 text-gray-400'
              }`}
            >
              {character.hasMoved ? 'Moved' : 'Can Move'}
            </span>
            <span
              className={`px-2 py-0.5 rounded ${
                character.hasActed
                  ? 'bg-green-900/50 text-green-400'
                  : 'bg-gray-700 text-gray-400'
              }`}
            >
              {character.hasActed ? 'Acted' : 'Can Act'}
            </span>
          </div>
        </div>
      </div>

      {/* Action Panel (only if selected) */}
      {isSelected && (
        <div className="mt-3 pt-3 border-t border-gray-700">
          <ActionPanel character={character} onAction={onAction} />
        </div>
      )}
    </div>
  );
}
