import { useState } from 'react';
import { User, CheckCircle, RotateCcw, Zap, Settings, Sparkles } from 'lucide-react';
import type { BattleCharacter, ActionType, SelectedMachineOfWar } from '../../types';
import { ActionPanel } from './ActionPanel';
import { getCharacterTraitBonuses, hasTraitBonuses } from '../../services/traitBonuses';
import { getCharacterBuffConditions, hasBuffConditions } from '../../services/buffConditions';
import { getAbilityNameSync, getFormattedAbilityDescription } from '../../services/abilities';

interface BattleCharacterCardProps {
  character: BattleCharacter;
  team: BattleCharacter[];
  isSelected: boolean;
  currentTurn?: number;
  selectedMachineOfWar?: SelectedMachineOfWar | null;
  onSelect: () => void;
  onAction: (type: ActionType) => void;
  onUndo: () => void;
  onToggleAbility?: (abilityId: string) => void;
}

export function BattleCharacterCard({
  character,
  team,
  isSelected,
  currentTurn,
  selectedMachineOfWar,
  onSelect,
  onAction,
  onUndo,
  onToggleAbility,
}: BattleCharacterCardProps) {
  const [hoveredPassive, setHoveredPassive] = useState<string | null>(null);
  const hasActedThisTurn = character.hasMoved && character.hasActed;
  const hasAnyAction = character.hasMoved || character.hasActed;

  // Get passive abilities for display
  const passiveAbilities = character.passiveAbilities.map(id => ({
    id,
    name: getAbilityNameSync(id),
    description: getFormattedAbilityDescription(id, character.abilityLevels?.[id] ?? 54),
  }));

  // Get trait bonuses for display
  const showTraitBonuses = hasTraitBonuses(character);
  const traitBonuses = showTraitBonuses ? getCharacterTraitBonuses(character, currentTurn) : [];

  // Get buff conditions for display
  const showBuffConditions = hasBuffConditions(character, team, selectedMachineOfWar);
  const buffConditions = showBuffConditions ? getCharacterBuffConditions(character, team, selectedMachineOfWar) : [];

  return (
    <div
      className={`card p-3 transition-all ${
        isSelected ? 'ring-2 ring-imperial-gold' : ''
      } ${character.hasActed ? 'ring-2 ring-green-500' : ''} ${hasActedThisTurn ? 'opacity-60' : ''}`}
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

      {/* Passive Abilities */}
      {passiveAbilities.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-700/50">
          <div className="flex items-center gap-1 mb-1">
            <Sparkles size={12} className="text-purple-400" />
            <span className="text-xs font-medium text-gray-400">Passive</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {passiveAbilities.map((passive) => (
              <div
                key={passive.id}
                className="relative"
                onMouseEnter={() => setHoveredPassive(passive.id)}
                onMouseLeave={() => setHoveredPassive(null)}
              >
                <span className="px-2 py-0.5 rounded text-xs bg-purple-900/40 text-purple-300 cursor-help">
                  {passive.name}
                </span>
                {/* Tooltip */}
                {hoveredPassive === passive.id && passive.description && (
                  <div className="absolute z-50 bottom-full left-0 mb-1 w-64 p-2 bg-gray-900 border border-gray-700 rounded-lg shadow-xl text-xs text-gray-300 whitespace-pre-wrap">
                    <div className="font-medium text-purple-300 mb-1">{passive.name}</div>
                    <div>{passive.description}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trait Bonuses */}
      {showTraitBonuses && traitBonuses.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-700/50">
          <div className="flex items-center gap-1 mb-1">
            <Zap size={12} className="text-imperial-gold" />
            <span className="text-xs font-medium text-gray-400">Trait Bonuses</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {traitBonuses.map((bonus, index) => (
              <div
                key={`${bonus.traitId}-${index}`}
                className={`px-2 py-0.5 rounded text-xs ${
                  bonus.isActive
                    ? 'bg-gray-700/80'
                    : 'bg-gray-800/50 line-through opacity-50'
                } ${bonus.colorClass}`}
                title={`${bonus.traitName}: ${bonus.reason}`}
              >
                {bonus.bonusText}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Buff Conditions */}
      {showBuffConditions && (
        <div className="mt-2 pt-2 border-t border-gray-700/50">
          <div className="flex items-center gap-1 mb-1">
            <Settings size={12} className="text-blue-400" />
            <span className="text-xs font-medium text-gray-400">Buff Conditions</span>
          </div>
          <div className="space-y-1.5">
            {buffConditions.map((condition) => {
              // Check if this condition depends on another and if that parent is active
              const parentCondition = condition.dependsOn
                ? buffConditions.find(c => c.id === condition.dependsOn)
                : null;
              const isDisabled = parentCondition ? !parentCondition.isActive : false;

              return (
                <label
                  key={condition.id}
                  className={`flex items-start gap-2 group ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={condition.isActive}
                    disabled={isDisabled}
                    onChange={() => !isDisabled && onToggleAbility?.(condition.id)}
                    className={`w-3.5 h-3.5 mt-0.5 rounded border-gray-600 bg-gray-700 focus:ring-offset-0 ${
                      isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'
                    } ${
                      condition.category === 'self'
                        ? 'text-purple-500 focus:ring-purple-500'
                        : 'text-yellow-500 focus:ring-yellow-500'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-medium ${
                      isDisabled
                        ? 'text-gray-600'
                        : condition.isActive
                          ? (condition.category === 'self' ? 'text-purple-300' : 'text-yellow-300')
                          : 'text-gray-500'
                    }`}>
                      {condition.dependsOn && <span className="mr-1">↳</span>}
                      {condition.label}
                    </div>
                    <div className="text-xs text-gray-500">
                      <span className={condition.isActive && !isDisabled ? 'text-green-400' : ''}>{condition.effect}</span>
                      {condition.sourceCharacter && (
                        <span className="ml-1">({condition.source})</span>
                      )}
                      {!condition.sourceCharacter && (
                        <span className="ml-1">({condition.source})</span>
                      )}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Action Panel (only if selected) */}
      {isSelected && (
        <div className="mt-3 pt-3 border-t border-gray-700">
          <ActionPanel character={character} onAction={onAction} />
        </div>
      )}
    </div>
  );
}
