import { X, Sword, Crosshair } from 'lucide-react';
import type { BattleCharacter } from '../../types';
import { getDamageTypeImageUrl } from '../../services/dataService';

interface AttackTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  attacker: BattleCharacter;
  onSelect: (attackType: 'melee' | 'ranged') => void;
}

export function AttackTypeModal({
  isOpen,
  onClose,
  attacker,
  onSelect,
}: AttackTypeModalProps) {
  if (!isOpen) return null;

  const meleeDamageType = attacker.meleeDamageType || 'Physical';
  const rangedDamageType = attacker.rangedDamageType || 'Physical';
  const meleeHits = attacker.meleeHits;
  const rangedHits = attacker.rangedHits || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-gray-800 rounded-lg border border-gray-600 shadow-xl max-w-sm w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-gray-100">
            Choose Attack Type
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <p className="text-sm text-gray-400 mb-4">
            <span className="font-medium text-gray-200">{attacker.name}</span> can perform either a melee or ranged attack via Galvanic Field.
          </p>

          <div className="grid grid-cols-2 gap-3">
            {/* Melee option */}
            <button
              onClick={() => onSelect('melee')}
              className="p-4 rounded-lg border border-gray-600 bg-gray-700/50 hover:border-red-500 hover:bg-red-500/10 transition-all group"
            >
              <div className="flex flex-col items-center gap-2">
                <Sword className="w-8 h-8 text-red-400 group-hover:text-red-300" />
                <span className="font-medium text-gray-100">Melee</span>
                <div className="flex items-center gap-1.5 text-sm text-gray-400">
                  <img
                    src={getDamageTypeImageUrl(meleeDamageType)}
                    alt={meleeDamageType}
                    className="w-4 h-4"
                  />
                  <span>{meleeHits} hits</span>
                </div>
              </div>
            </button>

            {/* Ranged option */}
            <button
              onClick={() => onSelect('ranged')}
              className="p-4 rounded-lg border border-gray-600 bg-gray-700/50 hover:border-blue-500 hover:bg-blue-500/10 transition-all group"
            >
              <div className="flex flex-col items-center gap-2">
                <Crosshair className="w-8 h-8 text-blue-400 group-hover:text-blue-300" />
                <span className="font-medium text-gray-100">Ranged</span>
                <div className="flex items-center gap-1.5 text-sm text-gray-400">
                  <img
                    src={getDamageTypeImageUrl(rangedDamageType)}
                    alt={rangedDamageType}
                    className="w-4 h-4"
                  />
                  <span>{rangedHits} hits</span>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
