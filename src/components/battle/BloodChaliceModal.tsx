import { useState, useMemo } from 'react';
import { X, Droplet, Swords } from 'lucide-react';
import type { BattleCharacter } from '../../types';
import { hasMechanicalTrait } from '../../utils/traitUtils';

interface BloodChaliceModalProps {
  isOpen: boolean;
  onClose: () => void;
  caster: BattleCharacter;  // Nicodemus
  team: BattleCharacter[];
  extraPierceRatio: number;  // Pierce ratio bonus percentage
  onConfirm: (targetIds: string[]) => void;
}

export function BloodChaliceModal({
  isOpen,
  onClose,
  caster,
  team,
  extraPierceRatio,
  onConfirm,
}: BloodChaliceModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Filter to non-mechanical units only (excluding Nicodemus)
  const eligibleTargets = useMemo(() => {
    return team.filter(char =>
      char.id !== caster.id &&
      !hasMechanicalTrait(char.traits)
    );
  }, [team, caster.id]);

  const handleToggle = (characterId: string) => {
    setSelectedIds(prev =>
      prev.includes(characterId)
        ? prev.filter(id => id !== characterId)
        : [...prev, characterId]
    );
  };

  const handleConfirm = () => {
    onConfirm(selectedIds);
    setSelectedIds([]);
  };

  const handleClose = () => {
    setSelectedIds([]);
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
            <Droplet className="w-5 h-5 text-red-500" />
            <h2 className="text-lg font-semibold text-gray-100">
              Blood Chalice
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
            Select friendly non-mechanical units to grant +{extraPierceRatio}% pierce ratio with melee attacks this turn.
          </p>

          {eligibleTargets.length === 0 ? (
            <div className="text-gray-500 text-center py-4">
              <p>No eligible non-mechanical teammates available</p>
            </div>
          ) : (
            <div className="space-y-2">
              {eligibleTargets.map((char) => {
                const isSelected = selectedIds.includes(char.id);

                return (
                  <button
                    key={char.id}
                    onClick={() => handleToggle(char.id)}
                    className={`w-full p-3 rounded-lg border transition-all text-left ${
                      isSelected
                        ? 'border-red-500 bg-red-500/10'
                        : 'border-gray-600 bg-gray-700/50 hover:border-gray-500'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {/* Selection checkbox */}
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                          isSelected
                            ? 'border-red-500 bg-red-500'
                            : 'border-gray-500'
                        }`}>
                          {isSelected && (
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-100">{char.name}</span>
                          </div>

                          {/* Melee stats */}
                          <div className="flex items-center gap-2 mt-1">
                            <Swords className="w-3 h-3 text-gray-400" />
                            <span className="text-xs text-gray-400">
                              {char.calculatedDamage} x{char.meleeHits} ({char.meleeDamageType})
                            </span>
                          </div>
                        </div>
                      </div>

                      {isSelected && (
                        <div className="text-right">
                          <span className="text-xs text-red-400">
                            +{extraPierceRatio}% Pierce
                          </span>
                        </div>
                      )}
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
            {selectedIds.length > 0
              ? `${selectedIds.length} unit${selectedIds.length > 1 ? 's' : ''} selected`
              : 'Select targets (optional)'}
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
              className="px-4 py-2 text-sm rounded font-medium transition-colors bg-red-500 text-gray-100 hover:bg-red-400"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
