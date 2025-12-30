import { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { Turn, BattleCharacter } from '../../types';

interface DamagePerTurnChartProps {
  turnHistory: Turn[];
  team: BattleCharacter[];
}

// Color palette for character lines
const LINE_COLORS = [
  '#f59e0b', // amber-500
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
];

interface ChartDataPoint {
  turn: number;
  [characterName: string]: number;
}

type ChartMode = 'cumulative' | 'perTurn';

export function DamagePerTurnChart({ turnHistory, team }: DamagePerTurnChartProps) {
  const [chartMode, setChartMode] = useState<ChartMode>('cumulative');

  // Transform turn history into chart data (both cumulative and per-turn)
  const { cumulativeData, perTurnData } = useMemo(() => {
    // Track cumulative damage per character
    const cumulativeDamage: Record<string, number> = {};
    team.forEach((char) => {
      cumulativeDamage[char.name] = 0;
    });

    const cumulative: ChartDataPoint[] = [];
    const perTurn: ChartDataPoint[] = [];

    // For each turn, calculate both cumulative and per-turn damage
    turnHistory.forEach((turn) => {
      // Calculate this turn's damage per character
      const turnDamage: Record<string, number> = {};
      team.forEach((char) => {
        turnDamage[char.name] = 0;
      });

      turn.log.forEach((entry) => {
        if (entry.damage && entry.damage > 0 && entry.characterName) {
          turnDamage[entry.characterName] =
            (turnDamage[entry.characterName] || 0) + entry.damage;
          cumulativeDamage[entry.characterName] =
            (cumulativeDamage[entry.characterName] || 0) + entry.damage;
        }
      });

      // Create cumulative data point
      const cumulativePoint: ChartDataPoint = { turn: turn.turnNumber };
      team.forEach((char) => {
        cumulativePoint[char.name] = cumulativeDamage[char.name];
      });
      cumulative.push(cumulativePoint);

      // Create per-turn data point
      const perTurnPoint: ChartDataPoint = { turn: turn.turnNumber };
      team.forEach((char) => {
        perTurnPoint[char.name] = turnDamage[char.name];
      });
      perTurn.push(perTurnPoint);
    });

    return { cumulativeData: cumulative, perTurnData: perTurn };
  }, [turnHistory, team]);

  const chartData = chartMode === 'cumulative' ? cumulativeData : perTurnData;

  // Don't render if no data
  if (chartData.length === 0) {
    return null;
  }

  // Format large numbers for Y-axis
  const formatYAxis = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(0)}K`;
    }
    return value.toString();
  };

  // Format tooltip values
  const formatTooltip = (value: number | string | undefined) => {
    if (typeof value === 'number') {
      return value.toLocaleString();
    }
    return value ?? '';
  };

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-100">Damage Over Time</h3>
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => setChartMode('cumulative')}
            className={`px-3 py-1 rounded transition-colors ${
              chartMode === 'cumulative'
                ? 'bg-amber-500 text-gray-900 font-medium'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Cumulative
          </button>
          <button
            onClick={() => setChartMode('perTurn')}
            className={`px-3 py-1 rounded transition-colors ${
              chartMode === 'perTurn'
                ? 'bg-amber-500 text-gray-900 font-medium'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Per Turn
          </button>
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="turn"
              stroke="#9ca3af"
              tick={{ fill: '#9ca3af', fontSize: 12 }}
              tickFormatter={(value) => `T${value}`}
            />
            <YAxis
              stroke="#9ca3af"
              tick={{ fill: '#9ca3af', fontSize: 12 }}
              tickFormatter={formatYAxis}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '0.5rem',
              }}
              labelStyle={{ color: '#f3f4f6' }}
              itemStyle={{ color: '#d1d5db' }}
              formatter={formatTooltip}
              labelFormatter={(label) => `Turn ${label}`}
            />
            <Legend
              wrapperStyle={{ color: '#9ca3af', fontSize: '12px' }}
            />
            {team.map((char, index) => (
              <Line
                key={char.id}
                type="monotone"
                dataKey={char.name}
                stroke={LINE_COLORS[index % LINE_COLORS.length]}
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
