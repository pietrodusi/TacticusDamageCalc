import { useState, useMemo } from 'react';
import { X, Sparkles } from 'lucide-react';
import type { BattleCharacter } from '../../types';

interface SorcerousFacadeModalProps {
  isOpen: boolean;
  onClose: () => void;
  caster: BattleCharacter;
  team: BattleCharacter[];
  minDmg: number;
  maxDmg: number;
  onConfirm: (targetIds: string[]) => void;
}

// Eligible targets: Psyker trait characters (excludes caster)
function isEligible(character: BattleCharacter): boolean {
  return character.traits?.includes('Psyker') ?? false;
}

export function SorcerousFacadeModal({
  isOpen,
  onClose,
  caster,
  team,
  minDmg,
  maxDmg,
  onConfirm,
}: SorcerousFacadeModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Filter to eligible Psyker team members (excluding caster)
  const eligibleTeam = useMemo(() => {
    return team.filter(char => char.id !== caster.id && isEligible(char));
  }, [team, caster.id]);

  const handleSelect = (characterId: string) => {
    setSelectedId(prev => prev === characterId ? null : characterId);
  };

  const handleConfirm = () => {
    // Always include caster + selected Psyker
    const targets = selectedId ? [caster.id, selectedId] : [caster.id];
    onConfirm(targets);
    setSelectedId(null);
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
            <Sparkles className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-semibold text-gray-100">
              Sorcerous Facade
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
            Select a Psyker ally to also receive +1x {minDmg}-{maxDmg} Psychic on attacks (1 turn).
          </p>

          {/* Caster info */}
          <div className="mb-4 p-3 rounded-lg border border-purple-500/50 bg-purple-500/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full border-2 border-purple-500 bg-purple-500 flex items-center justify-center">
                  <div className="w-2 h-2 bg-gray-900 rounded-full" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-100">{caster.name}</span>
                    <span className="text-xs px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded">
                      Caster
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    Receives buff automatically
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs text-purple-400">
                <span>+1x {minDmg}-{maxDmg} Psychic</span>
              </div>
            </div>
          </div>

          {/* Eligible Psyker allies */}
          {eligibleTeam.length === 0 ? (
            <p className="text-gray-500 text-center py-4">
              No other Psyker allies on team
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 mb-2">Select a Psyker ally:</p>
              {eligibleTeam.map(char => {
                const isSelected = selectedId === char.id;

                return (
                  <button
                    key={char.id}
                    onClick={() => handleSelect(char.id)}
                    className={`w-full p-3 rounded-lg border transition-all text-left ${
                      isSelected
                        ? 'border-purple-500 bg-purple-500/10'
                        : 'border-gray-600 bg-gray-700/50 hover:border-gray-500'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {/* Selection indicator */}
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          isSelected
                            ? 'border-purple-500 bg-purple-500'
                            : 'border-gray-500'
                        }`}>
                          {isSelected && (
                            <div className="w-2 h-2 bg-gray-900 rounded-full" />
                          )}
                        </div>

                        <div>
                          <span className="font-medium text-gray-100">{char.name}</span>
                          <div className="text-xs text-gray-400 mt-0.5">
                            Psyker
                          </div>
                        </div>
                      </div>

                      {isSelected && (
                        <div className="flex items-center gap-1 text-xs text-purple-400">
                          <span>+1x {minDmg}-{maxDmg} Psychic</span>
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
            {selectedId
              ? '2 targets will receive buff'
              : 'Caster receives buff'}
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
              className="px-4 py-2 text-sm rounded font-medium transition-colors bg-purple-600 text-gray-100 hover:bg-purple-500"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
