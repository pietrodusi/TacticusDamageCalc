import { User, CheckCircle, RotateCcw, Zap, Sparkles, Users } from 'lucide-react';
import type { BattleCharacter, ActionType } from '../../types';
import { ActionPanel } from './ActionPanel';
import { getCharacterTraitBonuses, hasTraitBonuses } from '../../services/traitBonuses';
import { getCharacterPassiveBonuses, getCharacterAuraBonuses, hasPassiveAbilities, getLegendaryCommanderBuffDisplay } from '../../services/abilities';

interface BattleCharacterCardProps {
  character: BattleCharacter;
  team: BattleCharacter[];
  isSelected: boolean;
  legendaryCommanderBuffAvailable: boolean;
  currentTurn?: number;
  onSelect: () => void;
  onAction: (type: ActionType) => void;
  onUndo: () => void;
  onToggleAbility?: (abilityId: string) => void;
}

export function BattleCharacterCard({
  character,
  team,
  isSelected,
  legendaryCommanderBuffAvailable,
  currentTurn,
  onSelect,
  onAction,
  onUndo,
  onToggleAbility,
}: BattleCharacterCardProps) {
  const hasActedThisTurn = character.hasMoved && character.hasActed;
  const hasAnyAction = character.hasMoved || character.hasActed;

  // Get trait bonuses for display
  const showTraitBonuses = hasTraitBonuses(character);
  const traitBonuses = showTraitBonuses ? getCharacterTraitBonuses(character, currentTurn) : [];

  // Get passive ability bonuses for display (filter out LegendaryCommander as it's shown in Buffs)
  const showPassiveAbilities = hasPassiveAbilities(character);
  const passiveBonuses = showPassiveAbilities
    ? getCharacterPassiveBonuses(character).filter(b => b.abilityId !== 'LegendaryCommander')
    : [];

  // Get aura bonuses from teammates
  const auraBonuses = getCharacterAuraBonuses(character, team);

  // Get LegendaryCommander buff (Trajann's aura)
  const lcBuff = getLegendaryCommanderBuffDisplay(team, legendaryCommanderBuffAvailable);

  // Show buffs section if there are aura bonuses or LC buff
  const showAuraBonuses = auraBonuses.length > 0 || lcBuff !== null;

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

      {/* Passive Ability */}
      {showPassiveAbilities && passiveBonuses.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-700/50">
          <div className="flex items-center gap-1 mb-1">
            <Sparkles size={12} className="text-purple-400" />
            <span className="text-xs font-medium text-gray-400">Passive Ability</span>
          </div>
          <div className="space-y-1">
            {passiveBonuses.map((bonus) => (
              <div
                key={bonus.abilityId}
                className="flex items-center gap-1"
              >
                {bonus.requiresToggle && onToggleAbility ? (
                  <label
                    className={`flex items-center gap-2 group ${
                      character.turnEnded ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                    }`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={bonus.isActive}
                      onChange={() => !character.turnEnded && onToggleAbility(bonus.abilityId)}
                      disabled={character.turnEnded}
                      className={`w-3.5 h-3.5 rounded border-gray-600 bg-gray-700 text-purple-500 focus:ring-purple-500 focus:ring-offset-0 ${
                        character.turnEnded ? 'cursor-not-allowed' : 'cursor-pointer'
                      }`}
                    />
                    <span
                      className={`text-xs ${bonus.isActive ? 'text-purple-300' : 'text-gray-500'}`}
                      title={bonus.abilityDescription || `${bonus.abilityName}: ${bonus.reason}`}
                    >
                      <span className="font-medium">{bonus.abilityName}</span>
                      {bonus.toggleLabel && (
                        <span className="text-gray-500 ml-1">({bonus.toggleLabel})</span>
                      )}
                    </span>
                  </label>
                ) : (
                  <div
                    className={`px-2 py-0.5 rounded text-xs ${
                      bonus.isActive
                        ? 'bg-purple-900/30'
                        : 'bg-gray-800/50'
                    } ${bonus.colorClass}`}
                    title={bonus.abilityDescription || bonus.abilityName}
                  >
                    {bonus.abilityName}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Buffs Section - only shown when selected */}
      {isSelected && showAuraBonuses && (
        <div className="mt-2 pt-2 border-t border-gray-700/50">
          <div className="flex items-center gap-1 mb-1">
            <Users size={12} className="text-yellow-400" />
            <span className="text-xs font-medium text-gray-400">Buffs</span>
          </div>
          <div className="space-y-1">
            {/* LegendaryCommander buff (no toggle - automatic) */}
            {lcBuff && (
              <div
                className="flex items-center gap-2"
                onClick={(e) => e.stopPropagation()}
              >
                <span className={`text-xs ${lcBuff.isActive ? 'text-orange-300' : 'text-gray-500'}`}>
                  <span className="font-medium">{lcBuff.bonusText}</span>
                  <span className="text-gray-500 ml-1">
                    from {lcBuff.sourceCharacterName}'s {lcBuff.abilityName}
                  </span>
                  <span className={`ml-1 ${lcBuff.isActive ? 'text-orange-400' : 'text-gray-600'}`}>
                    ({lcBuff.isActive ? 'Ready' : 'Waiting for ability'})
                  </span>
                </span>
              </div>
            )}
            {/* Other aura bonuses (with toggle) */}
            {auraBonuses.map((bonus) => (
              <label
                key={bonus.abilityId}
                className={`flex items-center gap-2 group ${
                  character.turnEnded ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={bonus.isActive}
                  onChange={() => !character.turnEnded && onToggleAbility?.(bonus.abilityId)}
                  disabled={character.turnEnded}
                  className={`w-3.5 h-3.5 rounded border-gray-600 bg-gray-700 text-yellow-500 focus:ring-yellow-500 focus:ring-offset-0 ${
                    character.turnEnded ? 'cursor-not-allowed' : 'cursor-pointer'
                  }`}
                />
                <span className={`text-xs ${bonus.isActive ? 'text-yellow-300' : 'text-gray-500'}`}>
                  <span className="font-medium">{bonus.bonusText}</span>
                  <span className="text-gray-500 ml-1">
                    from {bonus.sourceCharacterName}'s {bonus.abilityName}
                    {bonus.reason.includes('Low HP') && (
                      <span className="text-orange-400 ml-1">(requires &lt;50% HP)</span>
                    )}
                  </span>
                </span>
              </label>
            ))}
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
