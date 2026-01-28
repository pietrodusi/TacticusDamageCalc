import { useState, useMemo } from 'react';
import { X, Zap, Swords } from 'lucide-react';
import type { BattleCharacter } from '../../types';

interface TheQuickeningModalProps {
  isOpen: boolean;
  onClose: () => void;
  caster: BattleCharacter;  // Mephiston
  team: BattleCharacter[];
  dmgPct: number;   // Damage percentage
  maxDmg: number;   // Maximum damage cap
  onConfirm: (targetId: string) => void;
}

export function TheQuickeningModal({
  isOpen,
  onClose,
  caster,
  team,
  dmgPct,
  maxDmg,
  onConfirm,
}: TheQuickeningModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Filter to Blood Angels only (excluding Mephiston)
  const eligibleTargets = useMemo(() => {
    return team.filter(char =>
      char.id !== caster.id &&
      char.faction === 'BloodAngels'
    );
  }, [team, caster.id]);

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

  const selectedTarget = eligibleTargets.find(t => t.id === selectedId);

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
            <Zap className="w-5 h-5 text-purple-500" />
            <h2 className="text-lg font-semibold text-gray-100">
              The Quickening
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
            Select a friendly Blood Angels unit to perform an additional melee attack at {dmgPct}% damage (max {maxDmg}).
          </p>

          {eligibleTargets.length === 0 ? (
            <div className="text-gray-500 text-center py-4">
              <p>No Blood Angels teammates available</p>
              <p className="text-xs mt-2">The Quickening can only target Blood Angels units</p>
            </div>
          ) : (
            <div className="space-y-2">
              {eligibleTargets.map((char) => {
                const isSelected = selectedId === char.id;
                // Use calculatedDamage as the base damage stat
                const baseDmg = char.calculatedDamage;
                const estimatedDmg = Math.min(Math.round(baseDmg * dmgPct / 100), maxDmg);

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
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-100">{char.name}</span>
                          </div>

                          {/* Melee stats */}
                          <div className="flex items-center gap-2 mt-1">
                            <Swords className="w-3 h-3 text-gray-400" />
                            <span className="text-xs text-gray-400">
                              {baseDmg} x{char.meleeHits} ({char.meleeDamageType})
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        {/* Damage preview */}
                        <span className="text-xs text-purple-400">
                          ~{estimatedDmg} base dmg
                        </span>
                        <div className="text-xs text-gray-500">
                          {dmgPct}% (max {maxDmg})
                        </div>
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
              ? `${selectedTarget.name} attacks at ${dmgPct}%`
              : 'Select Blood Angels target'}
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
                  ? 'bg-purple-500 text-gray-100 hover:bg-purple-400'
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
