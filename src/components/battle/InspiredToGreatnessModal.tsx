import { useState, useMemo } from 'react';
import { X, Sparkles, Heart, RefreshCw } from 'lucide-react';
import type { BattleCharacter } from '../../types';
import type { AbilityCooldownState } from '../../services/abilities/types';
import { getAbilityNameSync, isAbilityReady } from '../../services/abilities';

interface InspiredToGreatnessModalProps {
  isOpen: boolean;
  onClose: () => void;
  caster: BattleCharacter;  // Aun'Shi
  team: BattleCharacter[];
  hpToHeal: number;      // HP healed if target has used ability
  hpToHeal_2: number;    // HP healed if target hasn't used ability
  onConfirm: (targetId: string, hasUsedAbility: boolean) => void;
}

// Check if a character has used their active ability (cooldown started)
function hasUsedActiveAbility(character: BattleCharacter): boolean {
  if (character.activeAbilities.length === 0) return false;

  const abilityId = character.activeAbilities[0];
  const cooldownState = character.abilityCooldowns[abilityId] as AbilityCooldownState | undefined;

  // If no cooldown state, ability hasn't been used
  if (!cooldownState) return false;

  // If usedThisBattle is true OR cooldown is not ready, ability has been used
  return cooldownState.usedThisBattle || !isAbilityReady(cooldownState);
}

export function InspiredToGreatnessModal({
  isOpen,
  onClose,
  caster,
  team,
  hpToHeal,
  hpToHeal_2,
  onConfirm,
}: InspiredToGreatnessModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Filter to exclude Aun'Shi and get eligibility info
  const eligibleTargets = useMemo(() => {
    return team
      .filter(char => char.id !== caster.id)
      .map(char => ({
        character: char,
        hasActiveAbility: char.activeAbilities.length > 0,
        hasUsedAbility: hasUsedActiveAbility(char),
        abilityName: char.activeAbilities.length > 0
          ? getAbilityNameSync(char.activeAbilities[0])
          : null,
      }));
  }, [team, caster.id]);

  const handleSelect = (characterId: string) => {
    setSelectedId(characterId);
  };

  const handleConfirm = () => {
    if (selectedId) {
      const target = eligibleTargets.find(t => t.character.id === selectedId);
      if (target) {
        onConfirm(selectedId, target.hasUsedAbility);
        setSelectedId(null);
      }
    }
  };

  const handleClose = () => {
    setSelectedId(null);
    onClose();
  };

  if (!isOpen) return null;

  const selectedTarget = eligibleTargets.find(t => t.character.id === selectedId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-gray-800 rounded-lg border border-gray-600 shadow-xl max-w-md w-full mx-4 max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-semibold text-gray-100">
              Inspired to Greatness
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          <p className="text-sm text-gray-400 mb-4">
            Select a friendly unit to inspire. If they have already used their ability, they can use it again.
            Otherwise, they receive a larger heal.
          </p>

          {eligibleTargets.length === 0 ? (
            <p className="text-gray-500 text-center py-4">
              No eligible targets
            </p>
          ) : (
            <div className="space-y-2">
              {eligibleTargets.map(({ character: char, hasActiveAbility, hasUsedAbility, abilityName }) => {
                const isSelected = selectedId === char.id;
                const healthPercent = Math.round((char.currentHealth / char.calculatedHealth) * 100);
                const healAmount = hasUsedAbility ? hpToHeal : hpToHeal_2;
                const healPreview = Math.min(healAmount, char.calculatedHealth - char.currentHealth);

                return (
                  <button
                    key={char.id}
                    onClick={() => handleSelect(char.id)}
                    className={`w-full p-3 rounded-lg border transition-all text-left ${
                      isSelected
                        ? 'border-amber-500 bg-amber-500/10'
                        : 'border-gray-600 bg-gray-700/50 hover:border-gray-500'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {/* Selection indicator */}
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          isSelected
                            ? 'border-amber-500 bg-amber-500'
                            : 'border-gray-500'
                        }`}>
                          {isSelected && (
                            <div className="w-2 h-2 bg-gray-900 rounded-full" />
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-100">{char.name}</span>
                            {hasUsedAbility && (
                              <span className="text-xs px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">
                                Ability Used
                              </span>
                            )}
                          </div>

                          {/* Ability name */}
                          {hasActiveAbility && abilityName && (
                            <div className="text-xs text-gray-500 mt-0.5">
                              {abilityName}
                            </div>
                          )}

                          {/* Health bar */}
                          <div className="flex items-center gap-2 mt-1">
                            <Heart className="w-3 h-3 text-red-400" />
                            <div className="w-24 h-1.5 bg-gray-600 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-red-500 rounded-full"
                                style={{ width: `${healthPercent}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-400">
                              {char.currentHealth}/{char.calculatedHealth}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        {/* Heal preview */}
                        {healPreview > 0 && (
                          <span className="text-xs text-green-400">
                            +{healPreview} HP
                          </span>
                        )}

                        {/* Re-use ability indicator */}
                        {hasUsedAbility && (
                          <div className="flex items-center gap-1 text-xs text-amber-400 mt-1">
                            <RefreshCw className="w-3 h-3" />
                            <span>Re-use Ability</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-700 bg-gray-800/50">
          <div className="text-sm text-gray-400">
            {selectedTarget
              ? selectedTarget.hasUsedAbility
                ? `Heal +${hpToHeal} HP & re-use ability`
                : `Heal +${hpToHeal_2} HP (no ability re-use)`
              : 'Select target'}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm text-gray-300 hover:text-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedId}
              className={`px-4 py-2 text-sm rounded font-medium transition-colors ${
                selectedId
                  ? 'bg-amber-500 text-gray-900 hover:bg-amber-400'
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
              }`}
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
