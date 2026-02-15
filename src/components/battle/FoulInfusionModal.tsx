import { useState, useMemo } from 'react';
import { X, Skull } from 'lucide-react';
import type { BattleCharacter } from '../../types';

interface FoulInfusionModalProps {
  isOpen: boolean;
  onClose: () => void;
  caster: BattleCharacter;
  team: BattleCharacter[];
  dmg: number;
  onConfirm: (targetIds: string[]) => void;
}

// Eligible targets: Chaos alliance characters (includes caster)
function isEligible(character: BattleCharacter): boolean {
  return character.alliance === 'Chaos';
}

export function FoulInfusionModal({
  isOpen,
  onClose,
  caster,
  team,
  dmg,
  onConfirm,
}: FoulInfusionModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Filter to eligible team members (excluding caster - they get buff automatically if Chaos)
  const eligibleTeam = useMemo(() => {
    return team.filter(char => char.id !== caster.id && isEligible(char));
  }, [team, caster.id]);

  const casterIsEligible = isEligible(caster);

  const handleToggle = (characterId: string) => {
    setSelectedIds(prev =>
      prev.includes(characterId)
        ? prev.filter(id => id !== characterId)
        : [...prev, characterId]
    );
  };

  const handleConfirm = () => {
    // Include caster if they're Chaos (Pestillian is Chaos, so always)
    const targets = casterIsEligible ? [caster.id, ...selectedIds] : [...selectedIds];
    onConfirm(targets);
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
            <Skull className="w-5 h-5 text-green-500" />
            <h2 className="text-lg font-semibold text-gray-100">
              Foul Infusion
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
            Select Chaos allies in Contagion range to receive +1x {dmg} Toxic on melee attacks for 2 turns.
          </p>

          {/* Caster info */}
          <div className="mb-4 p-3 rounded-lg border border-green-500/50 bg-green-500/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full border-2 border-green-500 bg-green-500 flex items-center justify-center">
                  <div className="w-2 h-2 bg-gray-900 rounded-full" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-100">{caster.name}</span>
                    <span className="text-xs px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">
                      Caster
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {casterIsEligible ? 'Receives buff automatically' : 'Not Chaos - no buff'}
                  </div>
                </div>
              </div>
              {casterIsEligible && (
                <div className="flex items-center gap-1 text-xs text-green-400">
                  <span>+1x {dmg} Toxic</span>
                </div>
              )}
            </div>
          </div>

          {/* Eligible allies */}
          {eligibleTeam.length === 0 ? (
            <p className="text-gray-500 text-center py-4">
              No other Chaos allies on team
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 mb-2">Select Chaos allies in Contagion range:</p>
              {eligibleTeam.map(char => {
                const isSelected = selectedIds.includes(char.id);

                return (
                  <button
                    key={char.id}
                    onClick={() => handleToggle(char.id)}
                    className={`w-full p-3 rounded-lg border transition-all text-left ${
                      isSelected
                        ? 'border-green-500 bg-green-500/10'
                        : 'border-gray-600 bg-gray-700/50 hover:border-gray-500'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {/* Selection indicator */}
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                          isSelected
                            ? 'border-green-500 bg-green-500'
                            : 'border-gray-500'
                        }`}>
                          {isSelected && (
                            <svg className="w-3 h-3 text-gray-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>

                        <div>
                          <span className="font-medium text-gray-100">{char.name}</span>
                          <div className="text-xs text-gray-400 mt-0.5">
                            Chaos
                          </div>
                        </div>
                      </div>

                      {isSelected && (
                        <div className="flex items-center gap-1 text-xs text-green-400">
                          <span>+1x {dmg} Toxic</span>
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
              ? `${selectedIds.length + (casterIsEligible ? 1 : 0)} target${(selectedIds.length + (casterIsEligible ? 1 : 0)) > 1 ? 's' : ''} will receive buff`
              : casterIsEligible ? 'Caster receives buff' : 'Select Chaos allies'}
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
              className="px-4 py-2 text-sm rounded font-medium transition-colors bg-green-600 text-gray-100 hover:bg-green-500"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
