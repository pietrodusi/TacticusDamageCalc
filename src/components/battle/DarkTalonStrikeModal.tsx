import { X } from 'lucide-react';
import { getDamageTypeImageUrl } from '../../services/dataService';

export type DarkTalonStrikeMode = 'directDamage' | 'bolter';

interface DarkTalonStrikeModalProps {
  isOpen: boolean;
  onClose: () => void;
  characterName: string;
  directDamageValues: { minDmg: number; maxDmg: number; hits: number };
  bolterValues: { minDmg: number; maxDmg: number; hits: number };
  onSelect: (mode: DarkTalonStrikeMode) => void;
}

export function DarkTalonStrikeModal({
  isOpen,
  onClose,
  characterName,
  directDamageValues,
  bolterValues,
  onSelect,
}: DarkTalonStrikeModalProps) {
  if (!isOpen) return null;

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
            Dark Talon Strike
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
            Choose attack type for <span className="font-medium text-gray-200">{characterName}</span>:
          </p>

          <div className="grid grid-cols-2 gap-3">
            {/* DirectDamage option */}
            <button
              onClick={() => onSelect('directDamage')}
              className="p-4 rounded-lg border border-gray-600 bg-gray-700/50 hover:border-yellow-500 hover:bg-yellow-500/10 transition-all group"
            >
              <div className="flex flex-col items-center gap-2">
                <img
                  src={getDamageTypeImageUrl('DirectDamage')}
                  alt="DirectDamage"
                  className="w-10 h-10"
                />
                <span className="font-medium text-gray-100">Direct Damage</span>
                <span className="text-sm text-gray-400">
                  {directDamageValues.hits}x {directDamageValues.minDmg}-{directDamageValues.maxDmg}
                </span>
              </div>
            </button>

            {/* Bolter option */}
            <button
              onClick={() => onSelect('bolter')}
              className="p-4 rounded-lg border border-gray-600 bg-gray-700/50 hover:border-blue-500 hover:bg-blue-500/10 transition-all group"
            >
              <div className="flex flex-col items-center gap-2">
                <img
                  src={getDamageTypeImageUrl('Bolter')}
                  alt="Bolter"
                  className="w-10 h-10"
                />
                <span className="font-medium text-gray-100">Bolter</span>
                <span className="text-sm text-gray-400">
                  {bolterValues.hits}x {bolterValues.minDmg}-{bolterValues.maxDmg}
                </span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
