import { TrendingUp, Target, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { BattleState } from '../../types';
import { DamageBar } from './DamageBar';

interface DamageSummaryProps {
  battleState: BattleState;
}

export function DamageSummary({ battleState }: DamageSummaryProps) {
  const { totalDamageBounds } = battleState;
  const completedTurns = battleState.turn - 1;

  const avgDamagePerTurn = completedTurns > 0
    ? Math.round(totalDamageBounds.average / completedTurns)
    : 0;

  // Calculate max scale from all characters' upper bounds
  const maxUpperBound = Math.max(
    ...battleState.team.map(c => c.damageTotals.upper),
    totalDamageBounds.upper,
    1
  );

  return (
    <div className="space-y-4">
      {/* Visual Damage Bar */}
      <div className="bg-gray-800/50 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-400 mb-3">Total Damage Range</h3>
        <DamageBar
          lowerBound={totalDamageBounds.lower}
          average={totalDamageBounds.average}
          upperBound={totalDamageBounds.upper}
          maxScale={maxUpperBound}
          height={12}
        />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Lower Bound */}
      <div className="bg-gray-800/50 rounded-lg p-4">
        <div className="flex items-center gap-2 text-gray-400 mb-2">
          <ArrowDownRight size={20} className="text-gray-500" />
          <span className="text-sm">Lower Bound</span>
        </div>
        <p className="text-2xl font-bold text-gray-400">
          {totalDamageBounds.lower.toLocaleString()}
        </p>
      </div>

      {/* Average (main display) */}
      <div className="bg-gray-800/50 rounded-lg p-4 ring-1 ring-amber-500/30">
        <div className="flex items-center gap-2 text-gray-400 mb-2">
          <Target size={20} className="text-amber-500" />
          <span className="text-sm">Average Damage</span>
        </div>
        <p className="text-2xl font-bold text-amber-500">
          {totalDamageBounds.average.toLocaleString()}
        </p>
      </div>

      {/* Upper Bound */}
      <div className="bg-gray-800/50 rounded-lg p-4">
        <div className="flex items-center gap-2 text-gray-400 mb-2">
          <ArrowUpRight size={20} className="text-green-500" />
          <span className="text-sm">Upper Bound</span>
        </div>
        <p className="text-2xl font-bold text-green-500">
          {totalDamageBounds.upper.toLocaleString()}
        </p>
      </div>

      {/* Avg per Turn */}
      <div className="bg-gray-800/50 rounded-lg p-4">
        <div className="flex items-center gap-2 text-gray-400 mb-2">
          <TrendingUp size={20} />
          <span className="text-sm">Avg per Turn</span>
        </div>
        <p className="text-2xl font-bold text-imperial-gold">
          {avgDamagePerTurn.toLocaleString()}
        </p>
      </div>
      </div>
    </div>
  );
}
