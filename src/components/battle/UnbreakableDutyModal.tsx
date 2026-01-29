import { X, Shield } from 'lucide-react';

interface UnbreakableDutyModalProps {
  isOpen: boolean;
  onClose: () => void;
  characterName: string;
  extraDmg: number;
  onConfirm: (deadAlliesConfirmed: boolean) => void;
}

export function UnbreakableDutyModal({
  isOpen,
  onClose,
  characterName,
  extraDmg,
  onConfirm,
}: UnbreakableDutyModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-gray-800 rounded-lg border border-gray-600 shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-semibold text-gray-100">
              Unbreakable Duty
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <p className="text-gray-200 text-center mb-2">
            Are 2 or more friendly Imperial Characters dead?
          </p>
          <p className="text-sm text-gray-400 text-center">
            If yes, {characterName} gains <span className="text-green-400 font-medium">+{extraDmg} damage</span> to normal attacks for the rest of the battle.
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-center gap-3 p-4 border-t border-gray-700">
          <button
            onClick={() => onConfirm(false)}
            className="px-6 py-2 text-sm rounded font-medium transition-colors bg-gray-600 text-gray-200 hover:bg-gray-500"
          >
            No
          </button>
          <button
            onClick={() => onConfirm(true)}
            className="px-6 py-2 text-sm rounded font-medium transition-colors bg-amber-600 text-gray-100 hover:bg-amber-500"
          >
            Yes
          </button>
        </div>
      </div>
    </div>
  );
}
