import { useState, useMemo } from 'react';
import { X, Wrench, Heart, Zap } from 'lucide-react';
import type { BattleCharacter } from '../../types';

interface RepairTargetModalProps {
  isOpen: boolean;
  onClose: () => void;
  repairer: BattleCharacter;
  team: BattleCharacter[];
  repairType: 'mechanic' | 'ddw';
  repairAmount: number;
  onConfirm: (targetIds: string[]) => void;
}

// Check if character has Mechanical trait (or LivingMetal which implies Mechanical)
function isMechanical(character: BattleCharacter): boolean {
  return character.traits.includes('Mechanical') || character.traits.includes('LivingMetal');
}

export function RepairTargetModal({
  isOpen,
  onClose,
  repairer,
  team,
  repairType,
  repairAmount,
  onConfirm,
}: RepairTargetModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Filter to only Mechanical team members
  const mechanicalTeam = useMemo(() => {
    return team.filter(isMechanical);
  }, [team]);

  // Check if character has both melee and ranged attacks
  const hasBothAttacks = (char: BattleCharacter) => {
    const hasMelee = char.meleeHits > 0;
    const hasRanged = char.rangedHits !== undefined && char.rangedHits > 0;
    return hasMelee && hasRanged;
  };

  const handleToggle = (characterId: string) => {
    if (repairType === 'mechanic') {
      // Single select mode
      setSelectedIds([characterId]);
    } else {
      // Multi-select mode for DDW
      setSelectedIds(prev =>
        prev.includes(characterId)
          ? prev.filter(id => id !== characterId)
          : [...prev, characterId]
      );
    }
  };

  const handleConfirm = () => {
    if (selectedIds.length > 0) {
      onConfirm(selectedIds);
      setSelectedIds([]);
    }
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
            <Wrench className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-semibold text-gray-100">
              {repairType === 'mechanic' ? 'Select Repair Target' : 'Defend the Divine Work'}
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
            {repairType === 'mechanic'
              ? 'Select a Mechanical unit to repair.'
              : 'Select Mechanical units to repair. Each unit (except self) will trigger a Galvanic Field attack.'}
          </p>

          {mechanicalTeam.length === 0 ? (
            <p className="text-gray-500 text-center py-4">
              No Mechanical units in team
            </p>
          ) : (
            <div className="space-y-2">
              {mechanicalTeam.map(char => {
                const isSelected = selectedIds.includes(char.id);
                const isSelf = char.id === repairer.id;
                const healthPercent = Math.round((char.currentHealth / char.calculatedHealth) * 100);
                const healPreview = Math.min(repairAmount, char.calculatedHealth - char.currentHealth);

                return (
                  <button
                    key={char.id}
                    onClick={() => handleToggle(char.id)}
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
                            {isSelf && (
                              <span className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                                Self
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
                        {healPreview > 0 && (
                          <span className="text-xs text-green-400">
                            +{healPreview} HP
                          </span>
                        )}

                        {/* Galvanic Field indicator */}
                        {!isSelf && (
                          <div className="flex items-center gap-1 text-xs text-amber-400 mt-1">
                            <Zap className="w-3 h-3" />
                            <span>Attacks</span>
                            {hasBothAttacks(char) && (
                              <span className="text-gray-500">(choice)</span>
                            )}
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
            {selectedIds.length > 0
              ? `${selectedIds.length} selected`
              : 'Select target(s)'}
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
              disabled={selectedIds.length === 0}
              className={`px-4 py-2 text-sm rounded font-medium transition-colors ${
                selectedIds.length > 0
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
