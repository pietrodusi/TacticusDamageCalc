import { User, Trophy } from 'lucide-react';
import type { BattleCharacter } from '../../types';

interface BattleSummaryProps {
  team: BattleCharacter[];
  totalDamage: number;
  onReset: () => void;
}

export function BattleSummary({ team, totalDamage, onReset }: BattleSummaryProps) {
  // Sort characters by damage dealt (highest first)
  const sortedTeam = [...team].sort((a, b) => b.totalDamageDealt - a.totalDamageDealt);

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
        <p className="text-3xl font-bold text-white">
          Total Damage: {totalDamage.toLocaleString()}
        </p>
      </div>

      {/* Character Damage Breakdown */}
      <div className="card p-4">
        <h3 className="text-lg font-semibold text-gray-100 mb-4">Damage Breakdown</h3>
        <div className="space-y-3">
          {sortedTeam.map((character, index) => {
            const damagePercent = totalDamage > 0
              ? (character.totalDamageDealt / totalDamage) * 100
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
                    <span className="text-imperial-gold font-bold ml-2">
                      {character.totalDamageDealt.toLocaleString()}
                    </span>
                  </div>
                  {/* Damage Bar */}
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-red-600 to-red-400 transition-all duration-500"
                      style={{ width: `${damagePercent}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {damagePercent.toFixed(1)}% of total damage
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
