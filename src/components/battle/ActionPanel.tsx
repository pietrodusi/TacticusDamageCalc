import { Move, Sparkles, Clock } from 'lucide-react';
import type { BattleCharacter, ActionType } from '../../types';
import { getDamageTypeImageUrl } from '../../services/dataService';

interface ActionPanelProps {
  character: BattleCharacter;
  onAction: (type: ActionType) => void;
}

export function ActionPanel({ character, onAction }: ActionPanelProps) {
  const hasRanged = character.rangedHits !== undefined && character.rangedHits > 0;

  const colorClasses = {
    green: 'hover:bg-green-900/50 hover:border-green-600 text-green-500',
    red: 'hover:bg-red-900/50 hover:border-red-600 text-red-500',
    blue: 'hover:bg-blue-900/50 hover:border-blue-600 text-blue-500',
    amber: 'hover:bg-amber-900/50 hover:border-amber-600 text-amber-500',
    gray: 'hover:bg-gray-700/50 hover:border-gray-500 text-gray-400',
  };

  const disabledClasses = 'opacity-50 cursor-not-allowed';

  // Use calculated damage (based on rarity/rank)
  const damage = character.calculatedDamage;
  const meleeTotalDamage = damage * character.meleeHits;
  const rangedTotalDamage = hasRanged ? damage * (character.rangedHits || 0) : 0;

  // Get damage type icons
  const meleeDamageTypeIcon = getDamageTypeImageUrl(character.meleeDamageType);
  const rangedDamageTypeIcon = character.rangedDamageType
    ? getDamageTypeImageUrl(character.rangedDamageType)
    : undefined;

  return (
    <div className="space-y-2">
      {/* Attack Actions */}
      <div className="grid grid-cols-2 gap-2">
        {/* Melee Attack */}
        <button
          onClick={() => !character.hasActed && onAction('meleeAttack')}
          disabled={character.hasActed}
          className={`flex flex-col items-center gap-1 p-3 rounded-lg border border-gray-700 transition-colors ${
            character.hasActed ? disabledClasses : colorClasses.red
          }`}
        >
          <div className="flex items-center gap-1">
            {meleeDamageTypeIcon && (
              <img src={meleeDamageTypeIcon} alt={character.meleeDamageType} className="w-5 h-5" />
            )}
            <span className="text-xs font-medium">Melee</span>
          </div>
          <span className="text-[10px] text-gray-400">
            {damage} × {character.meleeHits} = {meleeTotalDamage.toLocaleString()}
          </span>
        </button>

        {/* Ranged Attack (only if character has ranged) */}
        {hasRanged ? (
          <button
            onClick={() => !character.hasActed && onAction('rangedAttack')}
            disabled={character.hasActed}
            className={`flex flex-col items-center gap-1 p-3 rounded-lg border border-gray-700 transition-colors ${
              character.hasActed ? disabledClasses : colorClasses.blue
            }`}
          >
            <div className="flex items-center gap-1">
              {rangedDamageTypeIcon && (
                <img src={rangedDamageTypeIcon} alt={character.rangedDamageType} className="w-5 h-5" />
              )}
              <span className="text-xs font-medium">Ranged</span>
            </div>
            <span className="text-[10px] text-gray-400">
              {damage} × {character.rangedHits} = {rangedTotalDamage.toLocaleString()}
            </span>
          </button>
        ) : (
          <div className="flex flex-col items-center justify-center gap-1 p-3 rounded-lg border border-gray-700 opacity-30">
            <span className="text-xs font-medium text-gray-500">No Ranged</span>
          </div>
        )}
      </div>

      {/* Other Actions */}
      <div className="grid grid-cols-3 gap-2">
        {/* Move */}
        <button
          onClick={() => !character.hasMoved && onAction('move')}
          disabled={character.hasMoved}
          className={`flex flex-col items-center gap-1 p-2 rounded-lg border border-gray-700 transition-colors ${
            character.hasMoved ? disabledClasses : colorClasses.green
          }`}
        >
          <Move size={18} />
          <span className="text-xs font-medium">Move</span>
        </button>

        {/* Ability */}
        <button
          onClick={() => !(character.hasActed || character.activeAbilities.length === 0) && onAction('ability')}
          disabled={character.hasActed || character.activeAbilities.length === 0}
          className={`flex flex-col items-center gap-1 p-2 rounded-lg border border-gray-700 transition-colors ${
            character.hasActed || character.activeAbilities.length === 0 ? disabledClasses : colorClasses.amber
          }`}
        >
          <Sparkles size={18} />
          <span className="text-xs font-medium">Ability</span>
        </button>

        {/* Wait */}
        <button
          onClick={() => onAction('wait')}
          className={`flex flex-col items-center gap-1 p-2 rounded-lg border border-gray-700 transition-colors ${colorClasses.gray}`}
        >
          <Clock size={18} />
          <span className="text-xs font-medium">Wait</span>
        </button>
      </div>
    </div>
  );
}
