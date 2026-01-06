import { useState } from 'react';
import { User, Trophy, ChevronDown, ChevronUp } from 'lucide-react';
import type { BattleCharacter, Turn } from '../../types';
import { DamagePerTurnChart } from './DamagePerTurnChart';
import {
  analyzeDamageByAttackType,
  type CharacterDamageBreakdown,
} from '../../services/damage/damageAnalyzer';

interface BattleSummaryProps {
  team: BattleCharacter[];
  totalDamage: number;
  turnHistory: Turn[];
  onReset: () => void;
}

export function BattleSummary({ team, totalDamage, turnHistory, onReset }: BattleSummaryProps) {
  // Track expanded characters for breakdown view
  const [expandedCharacters, setExpandedCharacters] = useState<Set<string>>(new Set());

  // Sort characters by damage dealt (highest first)
  const sortedTeam = [...team].sort((a, b) => b.totalDamageDealt - a.totalDamageDealt);

  // Find max damage for scaling progress bars
  const maxDamage = Math.max(...team.map(c => c.totalDamageDealt), 1);

  // Analyze damage by attack type
  const damageBreakdowns = analyzeDamageByAttackType(turnHistory);

  // Toggle character expansion
  const toggleExpanded = (characterId: string) => {
    setExpandedCharacters(prev => {
      const newSet = new Set(prev);
      if (newSet.has(characterId)) {
        newSet.delete(characterId);
      } else {
        newSet.add(characterId);
      }
      return newSet;
    });
  };

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
            const breakdown = damageBreakdowns.get(character.id);
            const isExpanded = expandedCharacters.has(character.id);

            // Percent of total
            const totalPercent = totalDamage > 0
              ? (damage / totalDamage) * 100
              : 0;

            // Progress bar width
            const barWidth = maxDamage > 0 ? (damage / maxDamage) * 100 : 0;

            return (
              <div
                key={character.id}
                className="bg-gray-800/50 rounded-lg overflow-hidden"
              >
                {/* Main row */}
                <div
                  className="flex items-center gap-4 p-3 cursor-pointer hover:bg-gray-700/30 transition-colors"
                  onClick={() => toggleExpanded(character.id)}
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
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">
                          {totalPercent.toFixed(1)}% of total
                        </span>
                        {breakdown && (
                          isExpanded ? (
                            <ChevronUp size={16} className="text-gray-400" />
                          ) : (
                            <ChevronDown size={16} className="text-gray-400" />
                          )
                        )}
                      </div>
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

                {/* Expanded breakdown */}
                {isExpanded && breakdown && (
                  <AttackTypeBreakdown breakdown={breakdown} />
                )}
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

/**
 * Damage source breakdown component - normal attacks and abilities (adds to 100%)
 */
function AttackTypeBreakdown({ breakdown }: { breakdown: CharacterDamageBreakdown }) {
  const { byAttackType, byAbility, totalDamage } = breakdown;

  // Build list of damage sources (these add to 100%)
  type DamageSource = { name: string; damage: number; color: string };
  const sources: DamageSource[] = [];

  // 1. Normal attacks first
  if (byAttackType.normalMelee > 0) {
    sources.push({ name: 'Normal Melee', damage: byAttackType.normalMelee, color: 'bg-red-500' });
  }
  if (byAttackType.normalRanged > 0) {
    sources.push({ name: 'Normal Ranged', damage: byAttackType.normalRanged, color: 'bg-blue-500' });
  }

  // 2. Abilities (active abilities and passive follow-ups) - sorted by damage within this group
  const abilities = Object.entries(byAbility)
    .filter(([_, damage]) => damage > 0)
    .sort(([, a], [, b]) => b - a);

  for (const [name, damage] of abilities) {
    sources.push({ name, damage, color: 'bg-purple-500' });
  }

  if (sources.length === 0) {
    return null;
  }

  return (
    <div className="px-4 pb-4 pt-2 border-t border-gray-700/50">
      <div className="space-y-2">
        {sources.map((source) => {
          const percent = totalDamage > 0 ? (source.damage / totalDamage) * 100 : 0;
          return (
            <div key={source.name} className="flex items-center gap-2">
              <div className="w-28 text-xs text-gray-300 truncate" title={source.name}>
                {source.name}
              </div>
              <div className="flex-1 h-4 bg-gray-700 rounded overflow-hidden">
                <div
                  className={`h-full ${source.color} rounded`}
                  style={{ width: `${percent}%` }}
                />
              </div>
              <div className="w-24 text-xs text-gray-300 text-right">
                {source.damage.toLocaleString()} ({percent.toFixed(1)}%)
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
