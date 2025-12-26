import { useState } from 'react';
import { Skull, X, ChevronDown } from 'lucide-react';
import type { Boss, BossRank } from '../../types';
import {
  getBossList,
  getBossAtRank,
  getBossRankDisplayName,
  getAvailableBossRanks,
} from '../../services/dataService';

interface BossSelectorProps {
  selectedBossId: string | null;
  selectedRank: BossRank;
  applyModifiers: boolean;
  onSelectBoss: (bossId: string, rank?: BossRank) => void;
  onUpdateRank: (rank: BossRank) => void;
  onToggleModifiers: (apply: boolean) => void;
  onClearBoss: () => void;
}

export function BossSelector({
  selectedBossId,
  selectedRank,
  applyModifiers,
  onSelectBoss,
  onUpdateRank,
  onToggleModifiers,
  onClearBoss,
}: BossSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const bossList = getBossList();

  // Get the full boss data if one is selected (with or without modifiers based on setting)
  const selectedBoss: Boss | null = selectedBossId
    ? getBossAtRank(selectedBossId, selectedRank, applyModifiers)
    : null;

  // Get available ranks for the selected boss
  const availableRanks = selectedBossId
    ? getAvailableBossRanks(selectedBossId)
    : [];

  if (!selectedBoss) {
    return (
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Skull size={20} className="text-red-500" />
          <h3 className="font-semibold text-gray-200">Enemy Boss</h3>
        </div>

        <div className="relative">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="w-full p-3 bg-gray-700 hover:bg-gray-600 rounded-lg border border-gray-600 hover:border-red-500/50 transition-colors flex items-center justify-between"
          >
            <span className="text-gray-400">Select a boss...</span>
            <ChevronDown size={18} className="text-gray-500" />
          </button>

          {isOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50 max-h-80 overflow-y-auto">
              {bossList.map((boss) => (
                <button
                  key={boss.id}
                  onClick={() => {
                    onSelectBoss(boss.id);
                    setIsOpen(false);
                  }}
                  className="w-full p-3 hover:bg-gray-700 flex items-center gap-3 transition-colors border-b border-gray-700/50 last:border-0"
                >
                  <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {boss.iconUrl ? (
                      <img
                        src={boss.iconUrl}
                        alt={boss.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Skull size={20} className="text-gray-500" />
                    )}
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-medium text-gray-200">{boss.name}</div>
                    <div className="text-xs text-gray-500">{boss.faction}</div>
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
    <div className="card p-4 relative border-red-900/30">
      {/* Clear Button */}
      <button
        onClick={onClearBoss}
        className="absolute top-2 right-2 p-1 rounded-full bg-gray-700 hover:bg-red-900 text-gray-400 hover:text-red-400 transition-colors z-10"
        title="Remove boss"
      >
        <X size={16} />
      </button>

      <div className="flex items-center gap-2 mb-3">
        <Skull size={20} className="text-red-500" />
        <h3 className="font-semibold text-gray-200">Enemy Boss</h3>
      </div>

      <div className="flex items-start gap-4">
        {/* Boss Image */}
        <div className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden flex-shrink-0 ring-2 ring-red-500/30">
          {selectedBoss.iconUrl ? (
            <img
              src={selectedBoss.iconUrl}
              alt={selectedBoss.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <Skull size={32} className="text-gray-500" />
          )}
        </div>

        {/* Boss Info */}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-semibold text-gray-100">{selectedBoss.name}</h4>
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="text-xs text-gray-500 hover:text-gray-300 underline"
            >
              change
            </button>
          </div>

          {/* Rank Selector */}
          <div className="mb-2">
            <select
              value={selectedRank}
              onChange={(e) => onUpdateRank(Number(e.target.value) as BossRank)}
              className="w-full px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded text-gray-200 focus:border-red-500 focus:ring-1 focus:ring-red-500"
            >
              {availableRanks.map((rank) => (
                <option key={rank} value={rank}>
                  {getBossRankDisplayName(rank)}
                </option>
              ))}
            </select>
          </div>

          {/* Boss Stats */}
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-2 py-0.5 bg-green-900/40 text-green-300 rounded">
              {selectedBoss.health.toLocaleString()} HP
            </span>
            <span className="px-2 py-0.5 bg-gray-700/60 text-gray-300 rounded">
              {selectedBoss.armor} Armor
            </span>
            <span className="px-2 py-0.5 bg-red-900/40 text-red-300 rounded">
              {selectedBoss.damage} Dmg
            </span>
          </div>

          {/* Minion Killed Checkbox */}
          <label className="flex items-center gap-2 mt-2 cursor-pointer">
            <input
              type="checkbox"
              checked={applyModifiers}
              onChange={(e) => onToggleModifiers(e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-red-500 focus:ring-red-500 focus:ring-offset-gray-800"
            />
            <span className="text-xs text-gray-400">Minions Killed</span>
          </label>
        </div>
      </div>

      {/* Boss Dropdown (when changing) */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50 max-h-80 overflow-y-auto">
          {bossList.map((boss) => (
            <button
              key={boss.id}
              onClick={() => {
                onSelectBoss(boss.id);
                setIsOpen(false);
              }}
              className={`w-full p-3 hover:bg-gray-700 flex items-center gap-3 transition-colors border-b border-gray-700/50 last:border-0 ${
                boss.id === selectedBossId ? 'bg-gray-700' : ''
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                {boss.iconUrl ? (
                  <img
                    src={boss.iconUrl}
                    alt={boss.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Skull size={20} className="text-gray-500" />
                )}
              </div>
              <div className="text-left">
                <div className="text-sm font-medium text-gray-200">{boss.name}</div>
                <div className="text-xs text-gray-500">{boss.faction}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
