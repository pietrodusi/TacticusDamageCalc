/**
 * SharedBattleView - Read-only view of shared battle simulation results
 * Displays team setup, turn-by-turn log with damage breakdowns, and totals
 */

import { useState } from 'react';
import { User, Trophy, Shield, Sword, Heart, ChevronDown, ChevronRight, Zap, Crosshair, Move, Sparkles, Clock, Wrench, Skull } from 'lucide-react';
import type { Character } from '../../types/character';
import type { Boss } from '../../types/boss';
import type { MachineOfWarWithBonus } from '../../types/machineOfWar';
import type {
  DecodedShareData,
  DecodedLogEntry,
  DecodedDamageBreakdown,
  DecodedFollowUp,
} from '../../services/sharing/types';
import type { BuffSource } from '../../services/damage/types';
import { getDamageTypeImageUrl, getBossRankDisplayName } from '../../services/dataService';

interface SharedBattleViewProps {
  data: DecodedShareData;
  characters: (Character | null)[]; // Loaded character data for display
  boss?: Boss | null;
  machine?: MachineOfWarWithBonus | null;
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

export function SharedBattleView({ data, characters, boss, machine }: SharedBattleViewProps) {
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
          iconUrl: log.characterIconUrl,
          damage: mainDamage + followUpDamage,
        });
      }
    }
  }

  const sortedCharacterDamage = [...characterDamage.entries()].sort((a, b) => b[1].damage - a[1].damage);
  const maxCharDamage = Math.max(...sortedCharacterDamage.map(([, d]) => d.damage), 1);

  return (
    <div className="space-y-6">
      {/* User Notes */}
      {data.notes && (
        <div className="card p-4 bg-blue-900/20 border-blue-500/30">
          <h3 className="text-sm font-semibold text-blue-400 mb-2">Strategy Notes</h3>
          <p className="text-gray-300 text-sm whitespace-pre-wrap">{data.notes}</p>
        </div>
      )}

      {/* Battle Summary Header */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Trophy className="text-imperial-gold" size={28} />
          <h2 className="text-xl font-display font-bold text-imperial-gold">
            Shared Battle Results
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
          <div className="space-y-2">
            {characters.map((char, idx) => {
              if (!char) return null;
              const setup = data.setup.team[idx];
              return (
                <div key={char.id} className="flex items-center gap-3 bg-gray-800/50 rounded p-2">
                  <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden flex-shrink-0 ring-2 ring-gray-600">
                    {char.iconUrl ? (
                      <img src={char.iconUrl} alt={char.name} className="w-full h-full object-cover" />
                    ) : (
                      <User size={20} className="text-gray-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-100 truncate">{char.name}</div>
                    <div className="text-xs text-gray-500">
                      Rank {setup?.rank}
                    </div>
                  </div>
                </div>
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
                      <TurnLogEntries logs={turn.logs} />
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
function TurnLogEntries({ logs }: { logs: DecodedLogEntry[] }) {
  const characterIds = [...new Set(logs.map(e => e.characterId))];

  return (
    <>
      {characterIds.map(charId => {
        const charEntries = logs.filter(e => e.characterId === charId);
        const characterName = charEntries[0]?.characterName || 'Unknown';
        const characterIconUrl = charEntries[0]?.characterIconUrl;

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
