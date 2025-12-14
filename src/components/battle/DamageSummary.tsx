import { TrendingUp, Target } from 'lucide-react';
import type { BattleState } from '../../types';

interface DamageSummaryProps {
  battleState: BattleState;
}

export function DamageSummary({ battleState }: DamageSummaryProps) {
  const avgDamagePerTurn =
    battleState.turn > 1
      ? Math.round(battleState.totalDamageDealt / (battleState.turn - 1))
      : 0;

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-gray-800/50 rounded-lg p-4">
        <div className="flex items-center gap-2 text-gray-400 mb-2">
          <Target size={20} />
          <span className="text-sm">Total Damage</span>
        </div>
        <p className="text-3xl font-bold text-red-500">
          {battleState.totalDamageDealt.toLocaleString()}
        </p>
      </div>

      <div className="bg-gray-800/50 rounded-lg p-4">
        <div className="flex items-center gap-2 text-gray-400 mb-2">
          <TrendingUp size={20} />
          <span className="text-sm">Avg per Turn</span>
        </div>
        <p className="text-3xl font-bold text-amber-500">
          {avgDamagePerTurn.toLocaleString()}
        </p>
      </div>
    </div>
  );
}
