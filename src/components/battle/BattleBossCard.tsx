import { Skull, Shield, Sword, Heart } from 'lucide-react';
import type { Boss } from '../../types';
import { getBossRankDisplayName } from '../../services/dataService';

interface BattleBossCardProps {
  boss: Boss;
  totalDamageDealt: number;
  bossArmorReduction?: number;
}

export function BattleBossCard({
  boss,
  totalDamageDealt,
  bossArmorReduction = 0,
}: BattleBossCardProps) {
  const remainingHealth = Math.max(0, boss.health - totalDamageDealt);
  const healthPercentage = (remainingHealth / boss.health) * 100;
  const isDead = remainingHealth <= 0;

  return (
    <div className={`card p-4 border-red-900/50 ${isDead ? 'opacity-60' : ''}`}>
      {isDead && (
        <div className="flex justify-end mb-2">
          <span className="px-2 py-0.5 bg-green-900/50 text-green-400 text-xs rounded font-medium">
            DEFEATED
          </span>
        </div>
      )}

      <div className="flex items-start gap-4">
        {/* Boss Image */}
        <div className={`w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden flex-shrink-0 ring-2 ${isDead ? 'ring-gray-600' : 'ring-red-500/50'}`}>
          {boss.iconUrl ? (
            <img
              src={boss.iconUrl}
              alt={boss.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <Skull size={32} className="text-gray-500" />
          )}
        </div>

        {/* Boss Info */}
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-gray-100 mb-1">
            {boss.name}
          </h4>
          <div className="text-xs text-gray-500 mb-2">
            {getBossRankDisplayName(boss.rank)}
          </div>

          {/* Health Bar */}
          <div className="mb-2">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-400 flex items-center gap-1">
                <Heart size={12} className="text-red-400" />
                Health
              </span>
              <span className={isDead ? 'text-red-400' : 'text-green-400'}>
                {remainingHealth.toLocaleString()} / {boss.health.toLocaleString()}
              </span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  healthPercentage > 50
                    ? 'bg-green-500'
                    : healthPercentage > 25
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
                }`}
                style={{ width: `${healthPercentage}%` }}
              />
            </div>
          </div>

          {/* Boss Stats */}
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-2 py-0.5 bg-gray-700/60 text-gray-300 rounded flex items-center gap-1">
              <Shield size={12} />
              {bossArmorReduction > 0 ? (
                <>
                  <span className="line-through text-gray-500">{boss.armor}</span>
                  <span className="text-yellow-400">{Math.max(0, boss.armor - bossArmorReduction)}</span>
                  <span className="text-yellow-400/70">(-{bossArmorReduction})</span>
                  Armor
                </>
              ) : (
                <>{boss.armor} Armor</>
              )}
            </span>
            <span className="px-2 py-0.5 bg-red-900/40 text-red-300 rounded flex items-center gap-1">
              <Sword size={12} />
              {boss.damage} Dmg
            </span>
          </div>

          {/* Boss Traits */}
          {boss.traits && boss.traits.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2 text-xs">
              {boss.traits.map((trait) => (
                <span
                  key={trait}
                  className="px-1.5 py-0.5 bg-purple-900/40 text-purple-300 rounded"
                >
                  {trait}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
