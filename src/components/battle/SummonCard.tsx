import { X, Minus, Plus, Sword, Shield, Heart, Zap, Settings } from 'lucide-react';
import type { BattleSummon, BattleLogEntry, BattleCharacter, SelectedMachineOfWar, PooledBuff } from '../../types';
import { getSummonBuffConditions, hasSummonBuffConditions } from '../../services/buffConditions';
import { getDamageTypeImageUrl } from '../../services/dataService';

interface SummonCardProps {
  summon: BattleSummon;
  team?: BattleCharacter[];
  selectedMachineOfWar?: SelectedMachineOfWar | null;
  buffPool?: PooledBuff[];
  currentTurn?: number;
  onRemove: (summonId: string) => void;
  onUpdateCount: (summonId: string, count: number) => void;
  onToggleBuffCondition?: (summonId: string, conditionId: string) => void;
  onAttack: (summonId: string, attackType: 'melee' | 'ranged') => BattleLogEntry;
}

export function SummonCard({
  summon,
  team = [],
  selectedMachineOfWar,
  buffPool,
  currentTurn,
  onRemove,
  onUpdateCount,
  onToggleBuffCondition,
  onAttack,
}: SummonCardProps) {
  const hasRanged = summon.rangedHits && summon.rangedHits > 0;
  const hasMelee = summon.meleeHits && summon.meleeHits > 0;

  // Both attack types are always enabled if the summon has the capability
  const canMelee = hasMelee;
  const canRanged = hasRanged;

  // Calculate total damage for display (damage × hits)
  const meleeTotalDamage = summon.damage * summon.meleeHits;
  const rangedTotalDamage = hasRanged ? summon.damage * (summon.rangedHits || 0) : 0;

  // Get damage type icons
  const meleeDamageTypeIcon = getDamageTypeImageUrl(summon.meleeDamageType);
  const rangedDamageTypeIcon = summon.rangedDamageType
    ? getDamageTypeImageUrl(summon.rangedDamageType)
    : undefined;

  // Get buff conditions for this summon
  const buffConditionOptions = {
    selectedMachineOfWar,
    buffPool,
    currentTurn,
  };
  const showBuffConditions = hasSummonBuffConditions(summon, team, buffConditionOptions);
  const buffConditions = showBuffConditions ? getSummonBuffConditions(summon, team, buffConditionOptions) : [];

  const handleMeleeAttack = () => {
    if (canMelee) {
      onAttack(summon.id, 'melee');
    }
  };

  const handleRangedAttack = () => {
    if (canRanged) {
      onAttack(summon.id, 'ranged');
    }
  };

  return (
    <div className="card p-3 bg-green-900/20 border border-green-700/30">
      {/* Header */}
      <div className="flex items-center gap-3">
        {/* Icon */}
        <div className="w-10 h-10 rounded-full bg-green-900/50 flex items-center justify-center overflow-hidden flex-shrink-0 border border-green-600/30">
          {summon.iconUrl ? (
            <img
              src={summon.iconUrl}
              alt={summon.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <Sword size={18} className="text-green-400" />
          )}
        </div>

        {/* Name and Source */}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-green-200 truncate">
            {summon.name}
          </h4>
          <span className="text-xs text-green-400/70">Summon</span>
        </div>

        {/* Remove Button */}
        <button
          onClick={() => onRemove(summon.id)}
          className="p-1 rounded hover:bg-red-900/30 transition-colors"
          title="Remove summon"
        >
          <X size={16} className="text-gray-400 hover:text-red-400" />
        </button>
      </div>

      {/* Count Control */}
      <div className="mt-2 flex items-center gap-2">
        <span className="text-xs text-green-400">Count:</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onUpdateCount(summon.id, summon.count - 1)}
            disabled={summon.count <= 1}
            className="p-1 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Minus size={12} className="text-gray-300" />
          </button>
          <span className="px-2 py-0.5 min-w-[24px] text-center text-sm font-medium text-green-300 bg-green-900/30 rounded">
            {summon.count}
          </span>
          <button
            onClick={() => onUpdateCount(summon.id, summon.count + 1)}
            className="p-1 rounded bg-gray-700 hover:bg-gray-600 transition-colors"
          >
            <Plus size={12} className="text-gray-300" />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-2 flex gap-3 text-xs">
        <div className="flex items-center gap-1">
          <Zap size={12} className="text-yellow-500" />
          <span className="text-gray-300">{summon.damage}</span>
        </div>
        <div className="flex items-center gap-1">
          <Heart size={12} className="text-red-400" />
          <span className="text-gray-300">{summon.hp}</span>
        </div>
        <div className="flex items-center gap-1">
          <Shield size={12} className="text-blue-400" />
          <span className="text-gray-300">{summon.armor}</span>
        </div>
      </div>

      {/* Buff Conditions */}
      {showBuffConditions && (
        <div className="mt-2 pt-2 border-t border-green-700/30">
          <div className="flex items-center gap-1 mb-1">
            <Settings size={12} className="text-blue-400" />
            <span className="text-xs font-medium text-gray-400">Buff Conditions</span>
          </div>
          <div className="space-y-1.5">
            {buffConditions.map((condition) => (
              <label
                key={condition.id}
                className="flex items-start gap-2 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={condition.isActive}
                  onChange={() => onToggleBuffCondition?.(summon.id, condition.id)}
                  className={`w-3.5 h-3.5 mt-0.5 rounded border-gray-600 bg-gray-700 focus:ring-offset-0 cursor-pointer ${
                    condition.category === 'self'
                      ? 'text-purple-500 focus:ring-purple-500'
                      : 'text-yellow-500 focus:ring-yellow-500'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className={`text-xs font-medium ${
                    condition.isActive
                      ? (condition.category === 'self' ? 'text-purple-300' : 'text-yellow-300')
                      : 'text-gray-500'
                  }`}>
                    {condition.label}
                  </div>
                  <div className="text-xs text-gray-500">
                    <span className={condition.isActive ? 'text-green-400' : ''}>{condition.effect}</span>
                    {condition.sourceCharacter && (
                      <span className="ml-1">({condition.source})</span>
                    )}
                    {!condition.sourceCharacter && (
                      <span className="ml-1">({condition.source})</span>
                    )}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Attack Buttons - Same layout as character ActionPanel */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={handleMeleeAttack}
          disabled={!canMelee}
          className={`flex flex-col items-center gap-1 p-2 rounded-lg border border-gray-700 transition-colors ${
            canMelee
              ? 'hover:bg-red-900/50 hover:border-red-600 text-red-500'
              : 'opacity-50 cursor-not-allowed'
          }`}
        >
          <div className="flex items-center gap-1">
            {meleeDamageTypeIcon && (
              <img src={meleeDamageTypeIcon} alt={summon.meleeDamageType} className="w-4 h-4" />
            )}
            <span className="text-xs font-medium">Melee</span>
          </div>
          <span className="text-[10px] text-gray-400">
            {summon.damage} × {summon.meleeHits} = {meleeTotalDamage.toLocaleString()}
          </span>
        </button>
        {hasRanged && (
          <button
            onClick={handleRangedAttack}
            disabled={!canRanged}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg border border-gray-700 transition-colors ${
              canRanged
                ? 'hover:bg-blue-900/50 hover:border-blue-600 text-blue-500'
                : 'opacity-50 cursor-not-allowed'
            }`}
          >
            <div className="flex items-center gap-1">
              {rangedDamageTypeIcon && (
                <img src={rangedDamageTypeIcon} alt={summon.rangedDamageType} className="w-4 h-4" />
              )}
              <span className="text-xs font-medium">Ranged</span>
            </div>
            <span className="text-[10px] text-gray-400">
              {summon.damage} × {summon.rangedHits} = {rangedTotalDamage.toLocaleString()}
            </span>
          </button>
        )}
      </div>

      {/* Damage Dealt */}
      {summon.totalDamageDealt > 0 && (
        <div className="mt-2 text-xs text-green-400/70 text-right">
          Total: {summon.totalDamageDealt.toLocaleString()} damage
        </div>
      )}

      {/* Active Abilities (placeholder for future implementation) */}
      {summon.activeAbilities && summon.activeAbilities.length > 0 && (
        <div className="mt-2 pt-2 border-t border-green-700/30">
          <span className="text-xs text-green-400/70">
            Abilities: {summon.activeAbilities.join(', ')}
          </span>
        </div>
      )}
    </div>
  );
}
