/**
 * SharedBattleView - Read-only view of shared battle simulation results
 * Displays team setup, turn-by-turn log with damage breakdowns, and totals
 */

import { useState, useMemo } from 'react';
import { User, Trophy, Shield, Sword, Heart, ChevronDown, ChevronRight, Zap, Crosshair, Move, Sparkles, Clock, Wrench, Skull } from 'lucide-react';
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
import type { Character } from '../../types/character';
import type { Boss } from '../../types/boss';
import type { MachineOfWarWithBonus } from '../../types/machineOfWar';
import type {
  DecodedShareData,
  DecodedLogEntry,
  DecodedDamageBreakdown,
  DecodedFollowUp,
  DecodedTurn,
} from '../../services/sharing/types';
import type { BuffSource } from '../../services/damage/types';
import {
  getDamageTypeImageUrl,
  getBossRankDisplayName,
  getRarityImageUrl,
  getRankImageUrl,
  getRankDisplayName,
  getProgressionStepDisplayName,
  getAllProgressionSteps,
  calculateStats,
  getItem,
  getSlotTypeDisplayName,
  getAbilityInfo,
  getAbilityDisplayLevel,
  DEFAULT_ABILITY_LEVEL,
} from '../../services/dataService';
import type { DecodedTeamMember } from '../../services/sharing/types';

interface SharedBattleViewProps {
  data: DecodedShareData;
  characters: (Character | null)[]; // Loaded character data for display
  boss?: Boss | null;
  machine?: MachineOfWarWithBonus | null;
  title?: string;  // Battle title from Firebase storage
  notes?: string;  // Strategy notes from Firebase storage
}

// Color palette for chart lines (matches DamagePerTurnChart)
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

// Chart component for shared battle view (works with decoded data)
function SharedDamageChart({ turns, characters }: { turns: DecodedTurn[]; characters: (Character | null)[] }) {
  const [chartMode, setChartMode] = useState<ChartMode>('cumulative');

  // Get valid character names
  const characterNames = useMemo(() => {
    return characters.filter((c): c is Character => c !== null).map(c => c.name);
  }, [characters]);

  // Transform decoded turns into chart data
  const { cumulativeData, perTurnData } = useMemo(() => {
    const cumulativeDamage: Record<string, number> = {};
    characterNames.forEach(name => {
      cumulativeDamage[name] = 0;
    });

    const cumulative: ChartDataPoint[] = [];
    const perTurn: ChartDataPoint[] = [];

    turns.forEach(turn => {
      const turnDamage: Record<string, number> = {};
      characterNames.forEach(name => {
        turnDamage[name] = 0;
      });

      // Process each log entry
      turn.logs.forEach(entry => {
        const damage = entry.damageBreakdown?.damage || entry.damage || 0;
        if (damage > 0 && entry.characterName) {
          turnDamage[entry.characterName] = (turnDamage[entry.characterName] || 0) + damage;
          cumulativeDamage[entry.characterName] = (cumulativeDamage[entry.characterName] || 0) + damage;
        }

        // Include follow-up attack damage
        entry.followUpAttacks?.forEach(followUp => {
          const fuDamage = followUp.breakdown?.damage || followUp.damage || 0;
          const fuCharName = followUp.sourceCharacterName || entry.characterName;
          if (fuDamage > 0 && fuCharName) {
            turnDamage[fuCharName] = (turnDamage[fuCharName] || 0) + fuDamage;
            cumulativeDamage[fuCharName] = (cumulativeDamage[fuCharName] || 0) + fuDamage;
          }
        });
      });

      // Create data points
      const cumulativePoint: ChartDataPoint = { turn: turn.turnNumber };
      const perTurnPoint: ChartDataPoint = { turn: turn.turnNumber };
      characterNames.forEach(name => {
        cumulativePoint[name] = cumulativeDamage[name];
        perTurnPoint[name] = turnDamage[name];
      });
      cumulative.push(cumulativePoint);
      perTurn.push(perTurnPoint);
    });

    return { cumulativeData: cumulative, perTurnData: perTurn };
  }, [turns, characterNames]);

  const chartData = chartMode === 'cumulative' ? cumulativeData : perTurnData;

  // Calculate max for Y-axis
  const maxDamage = useMemo(() => {
    let max = 0;
    chartData.forEach(point => {
      characterNames.forEach(name => {
        const value = point[name];
        if (typeof value === 'number' && value > max) {
          max = value;
        }
      });
    });
    return Math.ceil(max * 1.1);
  }, [chartData, characterNames]);

  if (chartData.length === 0) return null;

  const formatYAxis = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
    return value.toString();
  };

  const formatTooltip = (value: number | string | undefined) => {
    if (typeof value === 'number') return value.toLocaleString();
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
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
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
              domain={[0, maxDamage || 'auto']}
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
            <Legend wrapperStyle={{ color: '#9ca3af', fontSize: '12px' }} />
            {characterNames.map((name, index) => (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
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

// Compact team member card for shared view (collapsible)
function SharedTeamMemberCard({ char, setup }: { char: Character; setup: DecodedTeamMember }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const progressionSteps = getAllProgressionSteps();
  const step = progressionSteps[setup.progressionStepIndex];
  const stats = calculateStats(char, setup.progressionStepIndex, setup.rank);

  // Get equipment info
  const equipmentItems = setup.equipment
    ? Object.entries(setup.equipment).map(([slotIdx, eq]) => {
        const item = getItem(eq.itemId);
        const slotType = char.itemSlots?.[parseInt(slotIdx)];
        return item ? {
          slotName: slotType ? getSlotTypeDisplayName(slotType) : `Slot ${parseInt(slotIdx) + 1}`,
          itemName: item.name,
          level: eq.level + 1,
          rarity: item.rarity,
        } : null;
      }).filter(Boolean)
    : [];

  const rarityColors: Record<string, string> = {
    'Common': 'text-gray-400',
    'Uncommon': 'text-green-400',
    'Rare': 'text-blue-400',
    'Epic': 'text-purple-400',
    'Legendary': 'text-yellow-400',
    'Mythic': 'text-red-300',
  };

  // Get ability levels for collapsed view
  const abilityLevels = [...char.activeAbilities, ...char.passiveAbilities].map(abilityId => {
    const levelIndex = setup.abilityLevels?.[abilityId] ?? DEFAULT_ABILITY_LEVEL;
    return getAbilityDisplayLevel(levelIndex);
  });

  return (
    <div className="bg-gray-800/50 rounded-lg p-3">
      {/* Header (always visible) - clickable to expand/collapse */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 text-left"
      >
        {/* Character icon */}
        <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden flex-shrink-0 ring-2 ring-gray-600">
          {char.iconUrl ? (
            <img src={char.iconUrl} alt={char.name} className="w-full h-full object-cover" />
          ) : (
            <User size={20} className="text-gray-500" />
          )}
        </div>

        {/* Name and icons */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-100 truncate">{char.name}</span>
            {/* Rarity icon */}
            {step && getRarityImageUrl(step.rarity) && (
              <img src={getRarityImageUrl(step.rarity)} alt={step.rarity} className="w-4 h-4 object-contain" title={getProgressionStepDisplayName(step)} />
            )}
            {/* Rank icon */}
            {getRankImageUrl(setup.rank) && (
              <img src={getRankImageUrl(setup.rank)} alt="" className="w-4 h-4 object-contain" title={getRankDisplayName(setup.rank)} />
            )}
          </div>
          {/* Ability levels in collapsed view */}
          <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-500">
            <Sparkles size={10} />
            <span>Lv {abilityLevels.join(' / ')}</span>
          </div>
        </div>

        {/* Expand/collapse indicator */}
        <div className="flex-shrink-0">
          {isExpanded ? (
            <ChevronDown size={16} className="text-gray-400" />
          ) : (
            <ChevronRight size={16} className="text-gray-400" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-gray-700/50">
          {/* Full rarity and rank text */}
          <div className="flex items-center gap-3 mb-3 text-xs">
            {step && (
              <div className="flex items-center gap-1">
                {getRarityImageUrl(step.rarity) && (
                  <img src={getRarityImageUrl(step.rarity)} alt="" className="w-4 h-4 object-contain" />
                )}
                <span className="text-gray-400">{getProgressionStepDisplayName(step)}</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              {getRankImageUrl(setup.rank) && (
                <img src={getRankImageUrl(setup.rank)} alt="" className="w-4 h-4 object-contain" />
              )}
              <span className="text-gray-400">{getRankDisplayName(setup.rank)}</span>
            </div>
          </div>

          {/* Stats Row */}
          <div className="flex gap-4 text-xs">
            <div className="flex items-center gap-1">
              <Heart size={12} className="text-red-400" />
              <span className="text-gray-300">{stats.health.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1">
              <Sword size={12} className="text-amber-400" />
              <span className="text-gray-300">{stats.damage.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1">
              <Shield size={12} className="text-blue-400" />
              <span className="text-gray-300">{stats.armour}</span>
            </div>
          </div>

          {/* Equipment (compact) */}
          {equipmentItems.length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-700/50">
              <div className="text-xs text-gray-500 mb-1">Equipment:</div>
              <div className="flex flex-wrap gap-1">
                {equipmentItems.map((eq, idx) => eq && (
                  <span
                    key={idx}
                    className={`text-xs px-1.5 py-0.5 rounded bg-gray-700/50 ${rarityColors[eq.rarity]}`}
                    title={`${eq.slotName}: ${eq.itemName} Lv${eq.level}`}
                  >
                    {eq.itemName} <span className="text-gray-500">Lv{eq.level}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Abilities (compact) */}
          {(char.activeAbilities.length > 0 || char.passiveAbilities.length > 0) && (
            <div className="mt-2 pt-2 border-t border-gray-700/50">
              <div className="text-xs text-gray-500 mb-1">Abilities:</div>
              <div className="flex flex-wrap gap-1">
                {/* Active abilities */}
                {char.activeAbilities.map(abilityId => {
                  const levelIndex = setup.abilityLevels?.[abilityId] ?? DEFAULT_ABILITY_LEVEL;
                  const ability = getAbilityInfo(abilityId, levelIndex);
                  const displayLevel = getAbilityDisplayLevel(levelIndex);
                  return ability ? (
                    <span
                      key={abilityId}
                      className="text-xs px-1.5 py-0.5 rounded bg-amber-900/30 text-amber-400"
                      title={`Active: ${ability.name} Lv${displayLevel}`}
                    >
                      {ability.name} <span className="text-amber-600">Lv{displayLevel}</span>
                    </span>
                  ) : null;
                })}
                {/* Passive abilities */}
                {char.passiveAbilities.map(abilityId => {
                  const levelIndex = setup.abilityLevels?.[abilityId] ?? DEFAULT_ABILITY_LEVEL;
                  const ability = getAbilityInfo(abilityId, levelIndex);
                  const displayLevel = getAbilityDisplayLevel(levelIndex);
                  return ability ? (
                    <span
                      key={abilityId}
                      className="text-xs px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-400"
                      title={`Passive: ${ability.name} Lv${displayLevel}`}
                    >
                      {ability.name} <span className="text-blue-600">Lv{displayLevel}</span>
                    </span>
                  ) : null;
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Helper function to format sources inline
function formatSourcesInline(sources: BuffSource[], valueKey: keyof BuffSource): string {
  if (!sources || sources.length === 0) return '';
  const parts = sources
    .filter(s => {
      const value = s[valueKey] as number | undefined;
      return value !== undefined && value !== 0;
    })
    .map(s => s.name);
  if (parts.length === 0) return '';
  return ` (${parts.join(', ')})`;
}

// Damage breakdown display component (matches BattleLog style)
function DamageBreakdownDisplay({ breakdown, sourceName, damageType }: {
  breakdown: DecodedDamageBreakdown;
  sourceName?: string;
  damageType?: string;
}) {
  const damageTypeIcon = damageType ? getDamageTypeImageUrl(damageType) : undefined;

  const globalMultiplierText = breakdown.globalMultiplier !== 1
    ? `×${breakdown.globalMultiplier.toFixed(2)}${formatSourcesInline(breakdown.globalMultiplierSources, 'damageMultiplier')}`
    : null;

  const flatModText = breakdown.flatModifiers > 0
    ? `+${breakdown.flatModifiers}${formatSourcesInline(breakdown.flatModifierSources, 'damageBonus')}`
    : null;

  // Crit text
  const hasCritChanceBonus = breakdown.critChanceBonus > 0;
  const hasCritDmgBonus = breakdown.critDmgBonus > 0;

  let critChanceText = '';
  if (breakdown.baseCritChance > 0 || hasCritChanceBonus) {
    if (hasCritChanceBonus) {
      const sources = breakdown.critChanceSources?.length > 0
        ? formatSourcesInline(breakdown.critChanceSources, 'critChanceBonus')
        : '';
      critChanceText = `${breakdown.baseCritChance}% + ${breakdown.critChanceBonus}%${sources} = ${breakdown.critChance.toFixed(0)}%`;
    } else {
      critChanceText = `${breakdown.critChance.toFixed(0)}%`;
    }
  }

  let critDamageText = '';
  if (breakdown.baseCritDamage > 0 || hasCritDmgBonus) {
    if (hasCritDmgBonus) {
      const sources = breakdown.critDamageSources?.length > 0
        ? formatSourcesInline(breakdown.critDamageSources, 'critDamageBonus')
        : '';
      critDamageText = `${breakdown.baseCritDamage} + ${breakdown.critDmgBonus}${sources} = ${breakdown.critDamage}`;
    } else {
      critDamageText = `${breakdown.critDamage}`;
    }
  }

  const critText = breakdown.critChance > 0
    ? `+${breakdown.critBonus.toFixed(0)} (${critChanceText} @ ${critDamageText})`
    : null;

  // Hits text
  const baseHits = breakdown.hits - (breakdown.extraHits || 0);
  const hitsText = breakdown.extraHits > 0
    ? `×${breakdown.hits} (${baseHits} + ${breakdown.extraHits}${formatSourcesInline(breakdown.extraHitsSources, 'extraHits')})`
    : `×${breakdown.hits}`;

  return (
    <div className="mt-1 text-xs space-y-1 bg-gray-900/50 rounded p-1.5">
      {sourceName && (
        <div className="flex items-center gap-1 text-purple-300 font-medium border-b border-gray-700/50 pb-0.5 mb-0.5">
          <Zap size={10} className="text-purple-400" />
          <span>{sourceName}</span>
        </div>
      )}

      {/* Total Damage */}
      <div className="flex justify-between">
        <span className="text-gray-500">Damage:</span>
        <span className="text-amber-400 font-medium">{breakdown.damage.toLocaleString()}</span>
      </div>

      {/* Calculation breakdown */}
      <div className="border-t border-gray-700/50 pt-0.5 mt-0.5 space-y-0.5">
        <div className="flex justify-between text-gray-500">
          <span>Base Dmg:</span>
          <span>{breakdown.baseDamage}</span>
        </div>
        {flatModText && (
          <div className="flex justify-between text-green-400/80">
            <span>+ Modifiers:</span>
            <span>{flatModText}</span>
          </div>
        )}
        {critText && (
          <div className="flex justify-between text-orange-400/70">
            <span>+ Crit:</span>
            <span>{critText}</span>
          </div>
        )}
        <div className="flex justify-between text-gray-400">
          <span>= DamVarMod:</span>
          <span>{breakdown.damVarMod.toFixed(0)}</span>
        </div>
        {breakdown.targetArmor > 0 && (
          <div className="flex justify-between text-gray-500">
            <span>− Armor:</span>
            <span>
              {breakdown.armorIgnored && breakdown.armorIgnored > 0 ? (
                <>−{breakdown.effectiveArmor} <span className="text-green-400">(−{breakdown.armorIgnored} ignored)</span></>
              ) : (
                <>−{breakdown.targetArmor}</>
              )} → {breakdown.afterArmor.toFixed(0)}
            </span>
          </div>
        )}
        <div className="flex justify-between text-gray-500">
          <span className="flex items-center gap-1">
            {damageTypeIcon && (
              <img src={damageTypeIcon} alt={damageType} className="w-3 h-3" />
            )}
            Pierce {breakdown.pierceRatioBonus && breakdown.pierceRatioBonus > 0 ? (
              <>{((breakdown.effectivePierceRatio ?? breakdown.pierceRatio) * 100).toFixed(0)}% ({(breakdown.pierceRatio * 100).toFixed(0)}% <span className="text-green-400">+{breakdown.pierceRatioBonus.toFixed(0)}%{breakdown.pierceRatioBonusSources && breakdown.pierceRatioBonusSources.length > 0 ? ` (${breakdown.pierceRatioBonusSources.map(s => s.name).join(', ')})` : ''}</span>):</>
            ) : (
              <>({(breakdown.pierceRatio * 100).toFixed(0)}%):</>
            )}
          </span>
          <span>{breakdown.pierceFloor.toFixed(0)}</span>
        </div>
        <div className="flex justify-between text-gray-400">
          <span>After Armor/Pierce:</span>
          <span>{breakdown.afterArmorPierce.toFixed(0)}</span>
        </div>
        {globalMultiplierText && (
          <div className="flex justify-between text-blue-400/80">
            <span>× Global:</span>
            <span>{globalMultiplierText}</span>
          </div>
        )}
        <div className="flex justify-between text-gray-400">
          <span>Per Hit{breakdown.totalBlockReduction && breakdown.totalBlockReduction > 0 ? ' - Block' : ''}:</span>
          <span>{breakdown.perHitDamage.toFixed(0)}</span>
        </div>
        {breakdown.totalBlockReduction && breakdown.totalBlockReduction > 0 && (
          <div className="flex justify-between text-purple-400/80">
            <span>− Block (Daemon):</span>
            <span>−{breakdown.blockReductionPerHit?.toFixed(0)}/hit × {breakdown.expectedBlocks?.toFixed(2)} = −{breakdown.totalBlockReduction?.toFixed(0)}</span>
          </div>
        )}
        <div className="flex justify-between text-gray-400">
          <span>× Hits:</span>
          <span>{hitsText}</span>
        </div>
      </div>
    </div>
  );
}

const actionIcons: Record<string, React.ComponentType<{ size: number; className?: string }>> = {
  move: Move,
  attack: Sword,
  meleeAttack: Sword,
  rangedAttack: Crosshair,
  ability: Sparkles,
  wait: Clock,
  repair: Wrench,
  heal: Heart,
};

export function SharedBattleView({ data, characters, boss, machine, title, notes }: SharedBattleViewProps) {
  const [expandedTurns, setExpandedTurns] = useState<Set<number>>(() => new Set());

  const toggleTurn = (turn: number) => {
    setExpandedTurns(prev => {
      const next = new Set(prev);
      if (next.has(turn)) {
        next.delete(turn);
      } else {
        next.add(turn);
      }
      return next;
    });
  };

  // Build a map of characterId -> iconUrl from freshly loaded character data
  // This ensures icons work even if the build changes (URLs contain hashes)
  const characterIconMap = new Map<string, string>();
  data.setup.team.forEach((member, idx) => {
    const char = characters[idx];
    if (char?.iconUrl) {
      characterIconMap.set(member.characterId, char.iconUrl);
    }
  });

  // Helper to get icon URL - prefer fresh data, fall back to stored
  const getIconUrl = (characterId: string, storedIconUrl?: string): string | undefined => {
    return characterIconMap.get(characterId) || storedIconUrl;
  };

  // Calculate per-character damage from logs
  const characterDamage = new Map<string, { name: string; iconUrl?: string; damage: number }>();
  for (const turn of data.results.turns) {
    for (const log of turn.logs) {
      const mainDamage = log.damageBreakdown?.damage || log.damage || 0;
      const followUpDamage = log.followUpAttacks?.reduce((sum, f) => {
        // Only count follow-up damage if it's from the same character
        if (!f.sourceCharacterId || f.sourceCharacterId === log.characterId) {
          return sum + (f.breakdown?.damage || f.damage || 0);
        }
        return sum;
      }, 0) || 0;

      // Also count reaction attacks attributed to other characters
      for (const followUp of log.followUpAttacks || []) {
        if (followUp.sourceCharacterId && followUp.sourceCharacterId !== log.characterId) {
          const existingSource = characterDamage.get(followUp.sourceCharacterId);
          const reactionDamage = followUp.breakdown?.damage || followUp.damage || 0;
          if (existingSource) {
            existingSource.damage += reactionDamage;
          } else {
            characterDamage.set(followUp.sourceCharacterId, {
              name: followUp.sourceCharacterName || 'Unknown',
              iconUrl: getIconUrl(followUp.sourceCharacterId),
              damage: reactionDamage,
            });
          }
        }
      }

      const existing = characterDamage.get(log.characterId);
      if (existing) {
        existing.damage += mainDamage + followUpDamage;
      } else {
        characterDamage.set(log.characterId, {
          name: log.characterName,
          iconUrl: getIconUrl(log.characterId, log.characterIconUrl),
          damage: mainDamage + followUpDamage,
        });
      }
    }
  }

  const sortedCharacterDamage = [...characterDamage.entries()].sort((a, b) => b[1].damage - a[1].damage);
  const maxCharDamage = Math.max(...sortedCharacterDamage.map(([, d]) => d.damage), 1);

  // Use notes from props (Firebase storage) or fallback to data.notes (legacy URL-encoded)
  const displayNotes = notes || data.notes;

  return (
    <div className="space-y-6">
      {/* User Notes */}
      {displayNotes && (
        <div className="card p-4 bg-blue-900/20 border-blue-500/30">
          <h3 className="text-sm font-semibold text-blue-400 mb-2">Strategy Notes</h3>
          <p className="text-gray-300 text-sm whitespace-pre-wrap">{displayNotes}</p>
        </div>
      )}

      {/* Battle Summary Header */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Trophy className="text-imperial-gold" size={28} />
          <h2 className="text-xl font-display font-bold text-imperial-gold">
            {title || 'Shared Battle Results'}
          </h2>
          <Trophy className="text-imperial-gold" size={28} />
        </div>
        <p className="text-2xl font-bold text-white">
          Total Damage: {data.results.totalDamage.toLocaleString()}
        </p>
      </div>

      {/* Team & Boss Setup */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Team */}
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-gray-100 mb-3 flex items-center gap-2">
            <Sword size={16} className="text-imperial-gold" />
            Team ({characters.filter(c => c).length})
          </h3>
          <div className="space-y-3">
            {characters.map((char, idx) => {
              if (!char) return null;
              const setup = data.setup.team[idx];
              if (!setup) return null;
              return (
                <SharedTeamMemberCard key={char.id} char={char} setup={setup} />
              );
            })}
          </div>
        </div>

        {/* Boss & Machine */}
        <div className="space-y-4">
          {boss && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-gray-100 mb-3 flex items-center gap-2">
                <Skull size={16} className="text-red-400" />
                Boss
              </h3>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden flex-shrink-0 ring-2 ring-red-500/50">
                  {boss.iconUrl ? (
                    <img src={boss.iconUrl} alt={boss.name} className="w-full h-full object-cover" />
                  ) : (
                    <Skull size={24} className="text-gray-500" />
                  )}
                </div>
                <div>
                  <div className="font-medium text-gray-100">{boss.name}</div>
                  <div className="text-xs text-gray-500">{getBossRankDisplayName(boss.rank)}</div>
                  <div className="flex gap-3 mt-1 text-xs">
                    <span className="flex items-center gap-1 text-gray-400">
                      <Heart size={12} className="text-red-400" />
                      {boss.health.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1 text-gray-400">
                      <Shield size={12} className="text-blue-400" />
                      {boss.armor}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {machine && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-gray-100 mb-3 flex items-center gap-2">
                <Zap size={16} className="text-yellow-400" />
                Machine of War
              </h3>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {machine.iconUrl ? (
                    <img src={machine.iconUrl} alt={machine.name} className="w-full h-full object-cover" />
                  ) : (
                    <Zap size={20} className="text-gray-500" />
                  )}
                </div>
                <div>
                  <div className="font-medium text-gray-100">{machine.name}</div>
                  <div className="text-xs text-green-400">+{machine.extraDmgPct}% damage ({machine.stars}★)</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Character Damage Breakdown */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-gray-100 mb-3">Damage by Character</h3>
        <div className="space-y-2">
          {sortedCharacterDamage.map(([charId, info], idx) => {
            const percent = data.results.totalDamage > 0
              ? (info.damage / data.results.totalDamage) * 100
              : 0;
            const barWidth = maxCharDamage > 0 ? (info.damage / maxCharDamage) * 100 : 0;

            return (
              <div key={charId} className="flex items-center gap-3 bg-gray-800/50 rounded p-2">
                <div className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-700 text-gray-300 font-bold text-xs">
                  {idx + 1}
                </div>
                <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {info.iconUrl ? (
                    <img src={info.iconUrl} alt={info.name} className="w-full h-full object-cover" />
                  ) : (
                    <User size={16} className="text-gray-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-gray-100 truncate">{info.name}</span>
                    <span className="text-xs text-gray-400">{percent.toFixed(1)}%</span>
                  </div>
                  <div className="relative h-5 bg-gray-700 rounded overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded"
                      style={{ width: `${barWidth}%` }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xs font-medium text-white drop-shadow-md">
                        {info.damage.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Damage Over Time Chart */}
      <SharedDamageChart turns={data.results.turns} characters={characters} />

      {/* Turn-by-Turn Log */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-gray-100 mb-3">Battle Log</h3>
        <div className="space-y-2">
          {data.results.turns.map(turn => {
            const isExpanded = expandedTurns.has(turn.turnNumber);

            // Calculate turn damage summary
            const turnDamage = turn.logs.reduce((sum, e) => {
              const mainDamage = e.damageBreakdown?.damage || e.damage || 0;
              const followUpDamage = e.followUpAttacks?.reduce((fSum, f) => fSum + (f.breakdown?.damage || f.damage || 0), 0) || 0;
              return sum + mainDamage + followUpDamage;
            }, 0);

            return (
              <div key={turn.turnNumber}>
                {/* Turn Header */}
                <button
                  onClick={() => toggleTurn(turn.turnNumber)}
                  className="w-full text-xs font-semibold px-2 py-1.5 rounded flex items-center justify-between transition-colors bg-gray-700/50 text-gray-400 hover:bg-gray-700/70"
                >
                  <div className="flex items-center gap-1">
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span>Turn {turn.turnNumber}</span>
                    {!isExpanded && turnDamage > 0 && (
                      <span className="text-gray-500 font-normal ml-2">
                        — {turnDamage.toLocaleString()} dmg
                      </span>
                    )}
                  </div>
                </button>

                {/* Turn Entries */}
                {isExpanded && (
                  <div className="mt-1 space-y-1">
                    {turn.logs.length === 0 ? (
                      <div className="text-center py-2 text-gray-600 text-xs">No actions</div>
                    ) : (
                      <TurnLogEntries logs={turn.logs} characterIconMap={characterIconMap} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Sub-component for rendering turn log entries (grouped by character)
function TurnLogEntries({ logs, characterIconMap }: { logs: DecodedLogEntry[]; characterIconMap: Map<string, string> }) {
  const characterIds = [...new Set(logs.map(e => e.characterId))];

  return (
    <>
      {characterIds.map(charId => {
        const charEntries = logs.filter(e => e.characterId === charId);
        const characterName = charEntries[0]?.characterName || 'Unknown';
        // Use fresh icon URL from map, fallback to stored URL
        const characterIconUrl = characterIconMap.get(charId) || charEntries[0]?.characterIconUrl;

        return (
          <div key={charId} className="bg-gray-800/50 rounded p-2">
            {/* Character header */}
            <div className="flex items-center gap-1.5 mb-1">
              <div className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                {characterIconUrl ? (
                  <img src={characterIconUrl} alt={characterName} className="w-full h-full object-cover" />
                ) : (
                  <User size={10} className="text-gray-500" />
                )}
              </div>
              <span className="text-xs font-medium text-gray-300">{characterName}</span>
            </div>

            {/* Character's actions */}
            <div className="space-y-1">
              {charEntries.map((entry, index) => {
                const Icon = actionIcons[entry.action] || Sword;
                return (
                  <div key={`${entry.characterId}-${index}`} className="flex items-start gap-2 text-sm">
                    <div className="p-1 rounded bg-gray-700">
                      <Icon size={12} className="text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-200 text-xs">{entry.message}</p>
                      {entry.damageBreakdown ? (
                        entry.action === 'ability' ? (
                          <div className="mt-1 bg-purple-900/30 rounded p-1.5 border-l-2 border-purple-500">
                            <DamageBreakdownDisplay
                              breakdown={entry.damageBreakdown}
                              sourceName={entry.attackType ? `${entry.attackType.charAt(0).toUpperCase() + entry.attackType.slice(1)} Ability` : 'Special Attack'}
                              damageType={entry.damageType}
                            />
                          </div>
                        ) : (
                          <DamageBreakdownDisplay
                            breakdown={entry.damageBreakdown}
                            sourceName={entry.attackType === 'ranged' ? 'Ranged Attack' : 'Melee Attack'}
                            damageType={entry.damageType}
                          />
                        )
                      ) : entry.damage !== undefined && entry.damage > 0 ? (
                        <p className="text-red-400 text-xs">-{entry.damage.toLocaleString()} damage</p>
                      ) : null}

                      {/* Follow-up attacks */}
                      {entry.followUpAttacks && entry.followUpAttacks.length > 0 && (
                        <div className="mt-1 space-y-1">
                          {entry.followUpAttacks.map((followUp, fIdx) => (
                            <FollowUpDisplay
                              key={fIdx}
                              followUp={followUp}
                              mainCharacterId={entry.characterId}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}

// Follow-up attack display
function FollowUpDisplay({ followUp, mainCharacterId }: { followUp: DecodedFollowUp; mainCharacterId: string }) {
  const isReaction = followUp.sourceCharacterId && followUp.sourceCharacterId !== mainCharacterId;
  const attackTypeLabel = followUp.attackType ? ` [${followUp.attackType.toUpperCase()}]` : '';
  const abilityName = followUp.abilityName.replace(/\s*\([^)]+\)\s*$/, '');
  const sourceName = `${abilityName}${attackTypeLabel}`;
  const followUpDamageTypeIcon = followUp.damageType ? getDamageTypeImageUrl(followUp.damageType) : undefined;

  if (isReaction) {
    return (
      <div className="bg-cyan-900/30 rounded p-1.5 border-l-2 border-cyan-500">
        <div className="flex items-center gap-1.5 text-xs text-cyan-400 mb-1">
          <div className="w-4 h-4 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden flex-shrink-0">
            <User size={10} className="text-gray-500" />
          </div>
          <span className="font-medium">{followUp.sourceCharacterName || 'Unknown'} reacts</span>
        </div>
        {followUp.breakdown ? (
          <DamageBreakdownDisplay breakdown={followUp.breakdown} sourceName={sourceName} damageType={followUp.damageType} />
        ) : (
          <div className="text-xs">
            <div className="flex items-center gap-1 text-cyan-300 font-medium">
              {followUpDamageTypeIcon && <img src={followUpDamageTypeIcon} alt={followUp.damageType} className="w-3 h-3" />}
              <span>{sourceName}</span>
            </div>
            <div className="flex justify-between mt-0.5">
              <span className="flex items-center gap-1 text-gray-500">
                {followUp.hits}x {followUp.damageType}:
              </span>
              <span className="text-cyan-300">{followUp.damage.toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-purple-900/30 rounded p-1.5 border-l-2 border-purple-500">
      {followUp.breakdown ? (
        <DamageBreakdownDisplay breakdown={followUp.breakdown} sourceName={sourceName} damageType={followUp.damageType} />
      ) : (
        <>
          <div className="flex items-center gap-1 text-xs">
            {followUpDamageTypeIcon && <img src={followUpDamageTypeIcon} alt={followUp.damageType} className="w-3 h-3" />}
            <span className="text-purple-300 font-medium">{sourceName}</span>
          </div>
          <div className="text-xs space-y-0.5 mt-0.5">
            <div className="flex justify-between">
              <span className="flex items-center gap-1 text-gray-500">
                {followUp.hits}x {followUp.damageType}:
              </span>
              <span className="text-purple-300">{followUp.damage.toLocaleString()}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
