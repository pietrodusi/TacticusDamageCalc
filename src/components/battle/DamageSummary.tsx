import { TrendingUp, Target } from 'lucide-react';
import type { BattleState } from '../../types';

interface DamageSummaryProps {
  battleState: BattleState;
}

export function DamageSummary({ battleState }: DamageSummaryProps) {
  const { totalDamageDealt } = battleState;
  const completedTurns = battleState.turn - 1;

  const avgDamagePerTurn = completedTurns > 0
    ? Math.round(totalDamageDealt / completedTurns)
    : 0;

  return (
    <div className="space-y-4">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Total Damage (main display) */}
        <div className="bg-gray-800/50 rounded-lg p-4 ring-1 ring-amber-500/30">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <Target size={20} className="text-amber-500" />
            <span className="text-sm">Total Damage</span>
          </div>
          <p className="text-2xl font-bold text-amber-500">
            {totalDamageDealt.toLocaleString()}
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
