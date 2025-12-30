import { User, Trophy } from 'lucide-react';
import type { BattleCharacter, Turn } from '../../types';
import { DamagePerTurnChart } from './DamagePerTurnChart';

interface BattleSummaryProps {
  team: BattleCharacter[];
  totalDamage: number;
  turnHistory: Turn[];
  onReset: () => void;
}

export function BattleSummary({ team, totalDamage, turnHistory, onReset }: BattleSummaryProps) {
  // Sort characters by damage dealt (highest first)
  const sortedTeam = [...team].sort((a, b) => b.totalDamageDealt - a.totalDamageDealt);

  // Find max damage for scaling progress bars
  const maxDamage = Math.max(...team.map(c => c.totalDamageDealt), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Trophy className="text-imperial-gold" size={32} />
          <h2 className="text-2xl font-display font-bold text-imperial-gold">
            Battle Complete!
          </h2>
          <Trophy className="text-imperial-gold" size={32} />
        </div>

        {/* Total Damage */}
        <div className="space-y-3">
          <p className="text-3xl font-bold text-white">
            Total Damage: {totalDamage.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Cumulative Damage Chart */}
      {turnHistory.length > 0 && (
        <DamagePerTurnChart turnHistory={turnHistory} team={team} />
      )}

      {/* Character Damage Breakdown */}
      <div className="card p-4">
        <h3 className="text-lg font-semibold text-gray-100 mb-4">Damage Breakdown</h3>

        <div className="space-y-3">
          {sortedTeam.map((character, index) => {
            const damage = character.totalDamageDealt;

            // Percent of total
            const totalPercent = totalDamage > 0
              ? (damage / totalDamage) * 100
              : 0;

            // Progress bar width
            const barWidth = maxDamage > 0 ? (damage / maxDamage) * 100 : 0;

            return (
              <div
                key={character.id}
                className="flex items-center gap-4 p-3 bg-gray-800/50 rounded-lg"
              >
                {/* Rank */}
                <div className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-700 text-gray-300 font-bold text-sm">
                  {index + 1}
                </div>

                {/* Portrait */}
                <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden flex-shrink-0 ring-2 ring-gray-600">
                  {character.iconUrl ? (
                    <img
                      src={character.iconUrl}
                      alt={character.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User size={24} className="text-gray-500" />
                  )}
                </div>

                {/* Name and Damage Bar */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-gray-100 truncate">
                      {character.name}
                    </span>
                    <span className="text-xs text-gray-400 ml-2">
                      {totalPercent.toFixed(1)}% of total
                    </span>
                  </div>

                  {/* Simple damage bar */}
                  <div className="relative h-6 bg-gray-700 rounded overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded"
                      style={{ width: `${barWidth}%` }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xs font-medium text-white drop-shadow-md">
                        {damage.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reset Button */}
      <div className="flex justify-center">
        <button onClick={onReset} className="btn-primary px-8 py-3">
          Start New Simulation
        </button>
      </div>
    </div>
  );
}
