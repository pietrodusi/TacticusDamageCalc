import { User, Trophy } from 'lucide-react';
import type { BattleCharacter, DamageTotals } from '../../types';

interface BattleSummaryProps {
  team: BattleCharacter[];
  totalDamage: number;
  totalDamageBounds: DamageTotals;
  onReset: () => void;
}

export function BattleSummary({ team, totalDamageBounds, onReset }: BattleSummaryProps) {
  // Sort characters by average damage dealt (highest first)
  const sortedTeam = [...team].sort((a, b) => b.damageTotals.average - a.damageTotals.average);

  // Find max upper bound for scaling progress bars
  const maxUpperBound = Math.max(...team.map(c => c.damageTotals.upper), 1);

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

        {/* Total Damage with bounds */}
        <div className="space-y-1">
          <p className="text-3xl font-bold text-white">
            Average Total Damage: {totalDamageBounds.average.toLocaleString()}
          </p>
          <p className="text-sm text-gray-400">
            Range: <span className="text-red-400">{totalDamageBounds.lower.toLocaleString()}</span>
            {' - '}
            <span className="text-green-400">{totalDamageBounds.upper.toLocaleString()}</span>
          </p>
        </div>
      </div>

      {/* Character Damage Breakdown */}
      <div className="card p-4">
        <h3 className="text-lg font-semibold text-gray-100 mb-4">Damage Breakdown</h3>

        {/* Legend */}
        <div className="flex items-center gap-4 mb-4 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-red-700" />
            <span className="text-gray-400">Min (no crit)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-amber-500" />
            <span className="text-gray-400">Expected</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-green-500" />
            <span className="text-gray-400">Max (all crit)</span>
          </div>
        </div>

        <div className="space-y-3">
          {sortedTeam.map((character, index) => {
            const { lower, upper, average } = character.damageTotals;

            // Calculate percentages relative to max upper bound
            const lowerPercent = (lower / maxUpperBound) * 100;
            const avgPercent = (average / maxUpperBound) * 100;
            const upperPercent = (upper / maxUpperBound) * 100;

            // Percent of total (using average)
            const totalPercent = totalDamageBounds.average > 0
              ? (average / totalDamageBounds.average) * 100
              : 0;

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

                {/* Name and Damage Bars */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-gray-100 truncate">
                      {character.name}
                    </span>
                    <div className="text-right ml-2">
                      <span className="text-imperial-gold font-bold">
                        {average.toLocaleString()}
                      </span>
                      <span className="text-xs text-gray-500 ml-1">
                        ({lower.toLocaleString()} - {upper.toLocaleString()})
                      </span>
                    </div>
                  </div>

                  {/* Multi-color Damage Bar - segmented visualization */}
                  <div className="h-3 bg-gray-700 rounded-full overflow-hidden relative">
                    {/* Lower bound segment (red) - guaranteed minimum damage */}
                    <div
                      className="absolute h-full bg-red-700 transition-all duration-500 rounded-l-full"
                      style={{ width: `${lowerPercent}%`, left: 0 }}
                    />
                    {/* Average segment (amber) - from lower to average */}
                    <div
                      className="absolute h-full bg-amber-500 transition-all duration-500"
                      style={{
                        width: `${avgPercent - lowerPercent}%`,
                        left: `${lowerPercent}%`
                      }}
                    />
                    {/* Upper segment (green) - from average to upper */}
                    <div
                      className="absolute h-full bg-green-500 transition-all duration-500 rounded-r-full"
                      style={{
                        width: `${upperPercent - avgPercent}%`,
                        left: `${avgPercent}%`
                      }}
                    />
                    {/* Average marker line */}
                    <div
                      className="absolute h-full w-0.5 bg-white/70 transition-all duration-500"
                      style={{ left: `${avgPercent}%` }}
                    />
                  </div>

                  <div className="text-xs text-gray-400 mt-1">
                    {totalPercent.toFixed(1)}% of total damage
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
