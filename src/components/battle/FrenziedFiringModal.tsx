import { useState } from 'react';
import { X, Plus, Minus } from 'lucide-react';

interface FrenziedFiringModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (freeHexes: number) => void;
}

export function FrenziedFiringModal({
  isOpen,
  onClose,
  onConfirm,
}: FrenziedFiringModalProps) {
  const [freeHexes, setFreeHexes] = useState(0);

  if (!isOpen) return null;

  const totalHits = 1 + freeHexes;

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
            Frenzied Firing
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
            How many free hexes are adjacent to the boss?
          </p>

          {/* Counter */}
          <div className="flex items-center justify-center gap-4 mb-4">
            <button
              onClick={() => setFreeHexes(Math.max(0, freeHexes - 1))}
              disabled={freeHexes <= 0}
              className="p-2 rounded-lg border border-gray-600 bg-gray-700/50 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Minus className="w-5 h-5 text-gray-300" />
            </button>

            <div className="text-center min-w-[60px]">
              <div className="text-2xl font-bold text-gray-100">{freeHexes}</div>
              <div className="text-xs text-gray-500">free hexes</div>
            </div>

            <button
              onClick={() => setFreeHexes(Math.min(9, freeHexes + 1))}
              disabled={freeHexes >= 9}
              className="p-2 rounded-lg border border-gray-600 bg-gray-700/50 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="w-5 h-5 text-gray-300" />
            </button>
          </div>

          <div className="text-center text-sm text-gray-300 mb-4">
            <span className="font-medium text-yellow-400">{totalHits}</span> {totalHits === 1 ? 'hit' : 'hits'} total
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(freeHexes)}
              className="flex-1 px-4 py-2 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-white font-medium transition-colors"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
