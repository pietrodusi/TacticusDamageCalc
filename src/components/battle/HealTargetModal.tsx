import { useState, useMemo } from 'react';
import { X, Heart, Sparkles } from 'lucide-react';
import type { BattleCharacter } from '../../types';
import { hasMechanicalTrait } from '../../utils/traitUtils';

interface HealTargetModalProps {
  isOpen: boolean;
  onClose: () => void;
  healer: BattleCharacter;
  team: BattleCharacter[];
  healAmount: number;
  buffInfo?: {
    critChanceBonus: number;
    critDamageBonus: number;
  };
  onConfirm: (targetId: string) => void;
}

export function HealTargetModal({
  isOpen,
  onClose,
  healer,
  team,
  healAmount,
  buffInfo,
  onConfirm,
}: HealTargetModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Filter to non-Mechanical team members (healers can heal non-mechanical units)
  const healableTeam = useMemo(() => {
    return team.filter(char => !hasMechanicalTrait(char.traits));
  }, [team]);

  const handleSelect = (characterId: string) => {
    setSelectedId(characterId);
  };

  const handleConfirm = () => {
    if (selectedId) {
      onConfirm(selectedId);
      setSelectedId(null);
    }
  };

  const handleClose = () => {
    setSelectedId(null);
    onClose();
  };

  if (!isOpen) return null;

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
            <Heart className="w-5 h-5 text-green-500" />
            <h2 className="text-lg font-semibold text-gray-100">
              Select Heal Target
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
            Select a friendly unit to heal. {buffInfo && (
              <span className="text-green-400">
                Target gains +{buffInfo.critChanceBonus}% crit chance and +{buffInfo.critDamageBonus} crit damage for 2 turns.
              </span>
            )}
          </p>

          {healableTeam.length === 0 ? (
            <p className="text-gray-500 text-center py-4">
              No healable units in team
            </p>
          ) : (
            <div className="space-y-2">
              {healableTeam.map(char => {
                const isSelected = selectedId === char.id;
                const isSelf = char.id === healer.id;
                const healthPercent = Math.round((char.currentHealth / char.calculatedHealth) * 100);
                const healPreview = Math.min(healAmount, char.calculatedHealth - char.currentHealth);
                const isAtFullHealth = char.currentHealth >= char.calculatedHealth;

                return (
                  <button
                    key={char.id}
                    onClick={() => handleSelect(char.id)}
                    className={`w-full p-3 rounded-lg border transition-all text-left ${
                      isSelected
                        ? 'border-green-500 bg-green-500/10'
                        : 'border-gray-600 bg-gray-700/50 hover:border-gray-500'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {/* Selection indicator */}
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          isSelected
                            ? 'border-green-500 bg-green-500'
                            : 'border-gray-500'
                        }`}>
                          {isSelected && (
                            <div className="w-2 h-2 bg-gray-900 rounded-full" />
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-100">{char.name}</span>
                            {isSelf && (
                              <span className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                                Self
                              </span>
                            )}
                            {isAtFullHealth && (
                              <span className="text-xs px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">
                                Full HP
                              </span>
                            )}
                          </div>

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
                        {healPreview > 0 ? (
                          <span className="text-xs text-green-400">
                            +{healPreview} HP
                          </span>
                        ) : (
                          <span className="text-xs text-gray-500">
                            No healing needed
                          </span>
                        )}

                        {/* Buff indicator */}
                        {buffInfo && (
                          <div className="flex items-center gap-1 text-xs text-amber-400 mt-1">
                            <Sparkles className="w-3 h-3" />
                            <span>+{buffInfo.critChanceBonus}% crit</span>
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
            {selectedId
              ? `${healableTeam.find(c => c.id === selectedId)?.name} selected`
              : 'Select a target'}
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
                  ? 'bg-green-500 text-gray-900 hover:bg-green-400'
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
              }`}
            >
              Heal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
