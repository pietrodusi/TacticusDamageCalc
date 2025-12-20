import { User, Trophy } from 'lucide-react';
import type { BattleCharacter, DamageTotals } from '../../types';
import { DamageBar } from './DamageBar';

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

        {/* Total Damage with DamageBar */}
        <div className="space-y-3">
          <p className="text-3xl font-bold text-white">
            Average Total Damage: {totalDamageBounds.average.toLocaleString()}
          </p>
          <div className="max-w-md mx-auto">
            <DamageBar
              lowerBound={totalDamageBounds.lower}
              average={totalDamageBounds.average}
              upperBound={totalDamageBounds.upper}
              maxScale={maxUpperBound}
              height={12}
            />
          </div>
        </div>
      </div>

      {/* Character Damage Breakdown */}
      <div className="card p-4">
        <h3 className="text-lg font-semibold text-gray-100 mb-4">Damage Breakdown</h3>

        {/* Legend */}
        <div className="flex items-center gap-4 mb-4 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-red-600" />
            <span className="text-gray-400">Unlucky (low roll)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-amber-400" />
            <span className="text-gray-400">Expected</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-green-500" />
            <span className="text-gray-400">Lucky (high roll)</span>
          </div>
        </div>

        <div className="space-y-3">
          {sortedTeam.map((character, index) => {
            const { lower, upper, average } = character.damageTotals;

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

                  {/* DamageBar component */}
                  <DamageBar
                    lowerBound={lower}
                    average={average}
                    upperBound={upper}
                    maxScale={maxUpperBound}
                    height={10}
                  />
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
