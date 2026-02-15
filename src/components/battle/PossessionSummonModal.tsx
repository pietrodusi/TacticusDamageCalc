import { X } from 'lucide-react';
import { getDamageTypeImageUrl } from '../../services/dataService';

interface PossessionSummonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (unitType: 'bloodletter' | 'blueHorror') => void;
}

export function PossessionSummonModal({
  isOpen,
  onClose,
  onSelect,
}: PossessionSummonModalProps) {
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
            Spawn Possession
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
            Choose which daemon to summon.
          </p>

          <div className="grid grid-cols-2 gap-3">
            {/* Bloodletter option */}
            <button
              onClick={() => onSelect('bloodletter')}
              className="p-4 rounded-lg border border-gray-600 bg-gray-700/50 hover:border-red-500 hover:bg-red-500/10 transition-all group"
            >
              <div className="flex flex-col items-center gap-2">
                <img
                  src={getDamageTypeImageUrl('Piercing')}
                  alt="Piercing"
                  className="w-8 h-8"
                />
                <span className="font-medium text-gray-100">Bloodletter</span>
                <div className="flex items-center gap-1.5 text-sm text-gray-400">
                  <span>1x Piercing</span>
                </div>
              </div>
            </button>

            {/* Blue Horror option */}
            <button
              onClick={() => onSelect('blueHorror')}
              className="p-4 rounded-lg border border-gray-600 bg-gray-700/50 hover:border-blue-500 hover:bg-blue-500/10 transition-all group"
            >
              <div className="flex flex-col items-center gap-2">
                <img
                  src={getDamageTypeImageUrl('Flame')}
                  alt="Flame"
                  className="w-8 h-8"
                />
                <span className="font-medium text-gray-100">Blue Horror</span>
                <div className="flex items-center gap-1.5 text-sm text-gray-400">
                  <span>2x Flame</span>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
