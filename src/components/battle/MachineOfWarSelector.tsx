import { useState } from 'react';
import { Cog, X, ChevronDown } from 'lucide-react';
import type { MachineOfWarStars } from '../../types';
import {
  getMachineOfWarList,
  getMachineOfWarAtStars,
  getAvailableMachineOfWarStars,
} from '../../services/dataService';

interface MachineOfWarSelectorProps {
  selectedMachineId: string | null;
  selectedStars: MachineOfWarStars;
  onSelectMachine: (machineId: string, stars?: MachineOfWarStars) => void;
  onUpdateStars: (stars: MachineOfWarStars) => void;
  onClearMachine: () => void;
}

export function MachineOfWarSelector({
  selectedMachineId,
  selectedStars,
  onSelectMachine,
  onUpdateStars,
  onClearMachine,
}: MachineOfWarSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const machineList = getMachineOfWarList();

  // Get the full machine data if one is selected
  const selectedMachine = selectedMachineId
    ? getMachineOfWarAtStars(selectedMachineId, selectedStars)
    : null;

  // Get available star levels
  const availableStars = getAvailableMachineOfWarStars();

  if (!selectedMachine) {
    return (
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Cog size={20} className="text-amber-500" />
          <h3 className="font-semibold text-gray-200">Machine of War</h3>
        </div>

        <div className="relative">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="w-full p-3 bg-gray-700 hover:bg-gray-600 rounded-lg border border-gray-600 hover:border-amber-500/50 transition-colors flex items-center justify-between"
          >
            <span className="text-gray-400">Select a Machine of War...</span>
            <ChevronDown size={18} className="text-gray-500" />
          </button>

          {isOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50 max-h-80 overflow-y-auto">
              {machineList.map((machine) => (
                <button
                  key={machine.id}
                  onClick={() => {
                    onSelectMachine(machine.id);
                    setIsOpen(false);
                  }}
                  className="w-full p-3 hover:bg-gray-700 flex items-center gap-3 transition-colors border-b border-gray-700/50 last:border-0"
                >
                  <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {machine.iconUrl ? (
                      <img
                        src={machine.iconUrl}
                        alt={machine.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Cog size={20} className="text-gray-500" />
                    )}
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-medium text-gray-200">{machine.name}</div>
                    <div className="text-xs text-gray-500">{machine.faction}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="card p-4 relative border-amber-900/30">
      {/* Clear Button */}
      <button
        onClick={onClearMachine}
        className="absolute top-2 right-2 p-1 rounded-full bg-gray-700 hover:bg-amber-900 text-gray-400 hover:text-amber-400 transition-colors z-10"
        title="Remove Machine of War"
      >
        <X size={16} />
      </button>

      <div className="flex items-center gap-2 mb-3">
        <Cog size={20} className="text-amber-500" />
        <h3 className="font-semibold text-gray-200">Machine of War</h3>
      </div>

      <div className="flex items-start gap-4">
        {/* Machine Image */}
        <div className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden flex-shrink-0 ring-2 ring-amber-500/30">
          {selectedMachine.iconUrl ? (
            <img
              src={selectedMachine.iconUrl}
              alt={selectedMachine.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <Cog size={32} className="text-gray-500" />
          )}
        </div>

        {/* Machine Info */}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-semibold text-gray-100">{selectedMachine.name}</h4>
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="text-xs text-gray-500 hover:text-gray-300 underline"
            >
              change
            </button>
          </div>

          {/* Stars Selector */}
          <div className="mb-2">
            <select
              value={selectedStars}
              onChange={(e) => onUpdateStars(Number(e.target.value) as MachineOfWarStars)}
              className="w-full px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded text-gray-200 focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            >
              {availableStars.map((stars) => (
                <option key={stars} value={stars}>
                  Mythic {stars}★
                </option>
              ))}
            </select>
          </div>

          {/* Damage Bonus */}
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-2 py-0.5 bg-amber-900/40 text-amber-300 rounded">
              +{selectedMachine.extraDmgPct}% Damage
            </span>
            <span className="px-2 py-0.5 bg-gray-700/60 text-gray-400 rounded">
              {selectedMachine.mythicAbilityName}
            </span>
          </div>
        </div>
      </div>

      {/* Machine Dropdown (when changing) */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50 max-h-80 overflow-y-auto">
          {machineList.map((machine) => (
            <button
              key={machine.id}
              onClick={() => {
                onSelectMachine(machine.id);
                setIsOpen(false);
              }}
              className={`w-full p-3 hover:bg-gray-700 flex items-center gap-3 transition-colors border-b border-gray-700/50 last:border-0 ${
                machine.id === selectedMachineId ? 'bg-gray-700' : ''
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                {machine.iconUrl ? (
                  <img
                    src={machine.iconUrl}
                    alt={machine.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Cog size={20} className="text-gray-500" />
                )}
              </div>
              <div className="text-left">
                <div className="text-sm font-medium text-gray-200">{machine.name}</div>
                <div className="text-xs text-gray-500">{machine.faction}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
