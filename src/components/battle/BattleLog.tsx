import { useState, useEffect } from 'react';
import type { BattleLogEntry, DamageBreakdown, BattleCharacter } from '../../types';
import type { BuffSource } from '../../services/damage/types';
import { Sword, Move, Sparkles, Clock, RotateCcw, Crosshair, Pencil, X, Zap, ChevronDown, ChevronRight, Wrench, User, Heart } from 'lucide-react';
import { getDamageTypeImageUrl } from '../../services/dataService';

// Extended entry with turn number
export interface TurnLogEntry extends BattleLogEntry {
  turn: number;
  attackType?: 'melee' | 'ranged';
}

// Helper function to format sources inline (name only, value is already shown separately)
// valueKey specifies which property to filter by (e.g., 'damageBonus', 'extraHits', 'critChanceBonus')
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

// Component to display damage breakdown with sources inline
function DamageBreakdownDisplay({ breakdown, sourceName, damageType }: { breakdown: DamageBreakdown; sourceName?: string; damageType?: string }) {
  // Get damage type icon
  const damageTypeIcon = damageType ? getDamageTypeImageUrl(damageType) : undefined;
  // Build global multiplier description with sources inline
  const globalMultiplierText = breakdown.globalMultiplier !== 1
    ? `×${breakdown.globalMultiplier.toFixed(2)}${formatSourcesInline(breakdown.globalMultiplierSources, 'damageMultiplier')}`
    : null;

  // Build flat modifiers description with sources inline
  const flatModText = breakdown.flatModifiers > 0
    ? `+${breakdown.flatModifiers}${formatSourcesInline(breakdown.flatModifierSources, 'damageBonus')}`
    : null;

  // Build crit text with base values + bonuses breakdown
  // Format: +32 (25% base + 75% bonus (WarHowl) = 100% @ 500 base + 0 bonus = 500)
  const hasCritChanceBonus = breakdown.critChanceBonus > 0;
  const hasCritDmgBonus = breakdown.critDmgBonus > 0;

  // Build crit chance breakdown text
  let critChanceText = '';
  if (breakdown.baseCritChance > 0 || hasCritChanceBonus) {
    if (hasCritChanceBonus) {
      // Show base + bonus = effective
      const sources = breakdown.critChanceSources?.length > 0
        ? formatSourcesInline(breakdown.critChanceSources, 'critChanceBonus')
        : '';
      critChanceText = `${breakdown.baseCritChance}% + ${breakdown.critChanceBonus}%${sources} = ${breakdown.critChance.toFixed(0)}%`;
    } else {
      critChanceText = `${breakdown.critChance.toFixed(0)}%`;
    }
  }

  // Build crit damage breakdown text
  let critDamageText = '';
  if (breakdown.baseCritDamage > 0 || hasCritDmgBonus) {
    if (hasCritDmgBonus) {
      // Show base + bonus = effective
      const sources = breakdown.critDamageSources?.length > 0
        ? formatSourcesInline(breakdown.critDamageSources, 'critDamageBonus')
        : '';
      critDamageText = `${breakdown.baseCritDamage} + ${breakdown.critDmgBonus}${sources} = ${breakdown.critDamage}`;
    } else {
      critDamageText = `${breakdown.critDamage}`;
    }
  }

  // Combine crit text
  const critText = breakdown.critChance > 0
    ? `+${breakdown.critBonus.toFixed(0)} (${critChanceText} @ ${critDamageText})`
    : null;

  // Build hits text with extra hits sources inline
  // Format: ×8 (5 + 3 (Saga +2, LC +1))
  const baseHits = breakdown.hits - (breakdown.extraHits || 0);
  const hitsText = breakdown.extraHits > 0
    ? `×${breakdown.hits} (${baseHits} + ${breakdown.extraHits}${formatSourcesInline(breakdown.extraHitsSources, 'extraHits')})`
    : `×${breakdown.hits}`;

  return (
    <div className="mt-1 text-xs space-y-1 bg-gray-900/50 rounded p-1.5">
      {/* Source header if provided */}
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

interface BattleLogProps {
  entries: TurnLogEntry[];
  currentTurn: number;
  editingTurn?: number | null;
  isComplete?: boolean;
  team?: BattleCharacter[];  // Team for displaying reaction attacks with source character info
  onUndoCharacterTurn?: (characterId: string, turn: number) => void;
  onEditTurn?: (turn: number | null) => void;
}

const actionIcons = {
  move: Move,
  attack: Sword,
  meleeAttack: Sword,
  rangedAttack: Crosshair,
  ability: Sparkles,
  wait: Clock,
  repair: Wrench,
  heal: Heart,
};

export function BattleLog({ entries, currentTurn, editingTurn, isComplete, team, onUndoCharacterTurn, onEditTurn }: BattleLogProps) {
  // Track which turns are expanded (current turn always starts expanded)
  const [expandedTurns, setExpandedTurns] = useState<Set<number>>(() => new Set([currentTurn]));

  // When current turn changes, collapse past turns and expand only the new current turn
  useEffect(() => {
    setExpandedTurns(new Set([currentTurn]));
  }, [currentTurn]);

  // When battle is complete, collapse all turns
  useEffect(() => {
    if (isComplete) {
      setExpandedTurns(new Set());
    }
  }, [isComplete]);

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

  // Group entries by turn
  const entriesByTurn: Record<number, TurnLogEntry[]> = {};
  for (let t = 1; t <= currentTurn; t++) {
    entriesByTurn[t] = entries.filter(e => e.turn === t);
  }

  return (
    // Limit height on mobile, expand fully on desktop (lg breakpoint)
    <div className="space-y-2 max-h-[300px] sm:max-h-[400px] lg:max-h-none overflow-y-auto">
      {Array.from({ length: currentTurn }, (_, i) => i + 1).map(turn => {
        const turnEntries = entriesByTurn[turn] || [];
        const isCurrent = turn === currentTurn;
        const isExpanded = expandedTurns.has(turn);

        const isEditing = editingTurn === turn;
        const isPastTurn = turn < currentTurn;

        // Calculate turn damage summary for collapsed view (including follow-up attacks)
        const turnDamage = turnEntries.reduce((sum, e) => {
          const mainDamage = e.damageBreakdown?.damage || e.damage || 0;
          const followUpDamage = e.followUpAttacks?.reduce((fSum, f) => fSum + (f.damage || 0), 0) || 0;
          return sum + mainDamage + followUpDamage;
        }, 0);

        return (
          <div key={turn}>
            {/* Turn Header - Clickable to toggle */}
            <button
              onClick={() => toggleTurn(turn)}
              className={`w-full text-xs font-semibold px-2 py-1.5 rounded flex items-center justify-between transition-colors ${
                isEditing
                  ? 'bg-amber-500/30 text-amber-400 ring-1 ring-amber-500'
                  : isCurrent
                    ? 'bg-imperial-gold/20 text-imperial-gold hover:bg-imperial-gold/30'
                    : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700/70'
              }`}
            >
              <div className="flex items-center gap-1">
                {isExpanded ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
                <span>
                  Turn {turn}
                  {isCurrent && !isEditing && ' (Current)'}
                  {isEditing && ' (Editing)'}
                </span>
                {/* Show damage summary when collapsed */}
                {!isExpanded && turnDamage > 0 && (
                  <span className="text-gray-500 font-normal ml-2">
                    — {turnDamage.toLocaleString()} dmg
                  </span>
                )}
              </div>
              {/* Edit/Close button for turns */}
              {onEditTurn && isPastTurn && (
                isEditing ? (
                  <div
                    onClick={(e) => { e.stopPropagation(); onEditTurn(null); }}
                    className="p-1 rounded hover:bg-gray-600 transition-colors"
                    title="Stop editing"
                  >
                    <X size={12} />
                  </div>
                ) : (
                  <div
                    onClick={(e) => { e.stopPropagation(); onEditTurn(turn); }}
                    className="p-1 rounded hover:bg-gray-600 transition-colors"
                    title="Edit this turn"
                  >
                    <Pencil size={12} />
                  </div>
                )
              )}
            </button>

            {/* Turn Entries - Collapsible */}
            {isExpanded && (
              <div className="mt-1 space-y-1">
                {turnEntries.length === 0 ? (
                  <div className="text-center py-2 text-gray-600 text-xs">
                    No actions {isCurrent ? 'yet' : ''}
                  </div>
                ) : (
                  <>
                    {/* Group entries by character */}
                    {(() => {
                      const characterIds = [...new Set(turnEntries.map(e => e.characterId))];
                      return characterIds.map(charId => {
                        const charEntries = turnEntries.filter(e => e.characterId === charId);
                        const characterName = charEntries[0]?.characterName || 'Unknown';
                        const characterIconUrl = charEntries[0]?.characterIconUrl;

                        return (
                          <div key={charId} className="bg-gray-800/50 rounded p-2">
                            {/* Character header with icon and undo button */}
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-1.5">
                                <div className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                                  {characterIconUrl ? (
                                    <img src={characterIconUrl} alt={characterName} className="w-full h-full object-cover" />
                                  ) : (
                                    <User size={10} className="text-gray-500" />
                                  )}
                                </div>
                                <span className="text-xs font-medium text-gray-300">{characterName}</span>
                              </div>
                              {onUndoCharacterTurn && (
                                <button
                                  onClick={() => onUndoCharacterTurn(charId, turn)}
                                  className="p-1 rounded hover:bg-gray-600 transition-colors"
                                  title={`Undo ${characterName}'s actions`}
                                >
                                  <RotateCcw size={12} className="text-gray-400 hover:text-imperial-gold" />
                                </button>
                              )}
                            </div>
                            {/* Character's actions */}
                            <div className="space-y-1">
                              {charEntries.map((entry, index) => {
                                const Icon = actionIcons[entry.action];
                                return (
                                  <div
                                    key={`${entry.timestamp}-${index}`}
                                    className="flex items-start gap-2 text-sm"
                                  >
                                    <div className="p-1 rounded bg-gray-700">
                                      <Icon size={12} className="text-gray-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-gray-200 text-xs">{entry.message}</p>
                                      {entry.damageBreakdown ? (
                                        entry.action === 'ability' ? (
                                          // Ability damage - purple styling like special attacks
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
                                      ) : entry.action !== 'ability' && entry.damage !== undefined && entry.damage > 0 ? (
                                        <p className="text-red-400 text-xs">
                                          -{entry.damage.toLocaleString()} damage
                                        </p>
                                      ) : null}
                                      {/* Follow-up attacks - rendered inline in order (reactions shown with source header) */}
                                      {entry.followUpAttacks && entry.followUpAttacks.length > 0 && (
                                        <div className="mt-1 space-y-1">
                                          {entry.followUpAttacks.map((followUp, index) => {
                                            const isReaction = followUp.sourceCharacterId && followUp.sourceCharacterId !== entry.characterId;
                                            const sourceChar = isReaction && team ? team.find(c => c.id === followUp.sourceCharacterId) : null;
                                            const attackTypeLabel = followUp.attackType ? ` [${followUp.attackType.toUpperCase()}]` : '';
                                            // Remove the "(CharName)" suffix from ability name since we show source inline
                                            const abilityName = followUp.abilityName.replace(/\s*\([^)]+\)\s*$/, '');
                                            const sourceName = `${abilityName}${attackTypeLabel}`;
                                            const followUpDamageTypeIcon = followUp.damageType ? getDamageTypeImageUrl(followUp.damageType) : undefined;

                                            if (isReaction) {
                                              // Reaction attack - cyan styling with source character header
                                              return (
                                                <div key={index} className="bg-cyan-900/30 rounded p-1.5 border-l-2 border-cyan-500">
                                                  {/* Compact reaction header */}
                                                  <div className="flex items-center gap-1.5 text-xs text-cyan-400 mb-1">
                                                    <div className="w-4 h-4 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                                                      {sourceChar?.iconUrl ? (
                                                        <img src={sourceChar.iconUrl} alt={sourceChar.name} className="w-full h-full object-cover" />
                                                      ) : (
                                                        <User size={10} className="text-gray-500" />
                                                      )}
                                                    </div>
                                                    <span className="font-medium">{sourceChar?.name || 'Unknown'} reacts</span>
                                                  </div>
                                                  {followUp.breakdown ? (
                                                    <DamageBreakdownDisplay breakdown={followUp.breakdown} sourceName={sourceName} damageType={followUp.damageType} />
                                                  ) : (
                                                    <div className="text-xs">
                                                      <div className="flex items-center gap-1 text-cyan-300 font-medium">
                                                        {followUpDamageTypeIcon && (
                                                          <img src={followUpDamageTypeIcon} alt={followUp.damageType} className="w-3 h-3" />
                                                        )}
                                                        <span>{sourceName}</span>
                                                      </div>
                                                      <div className="flex justify-between mt-0.5">
                                                        <span className="flex items-center gap-1 text-gray-500">
                                                          {followUpDamageTypeIcon && (
                                                            <img src={followUpDamageTypeIcon} alt={followUp.damageType} className="w-3 h-3" />
                                                          )}
                                                          {followUp.hits}x {followUp.damageType}:
                                                        </span>
                                                        <span className="text-cyan-300">{followUp.damage.toLocaleString()}</span>
                                                      </div>
                                                    </div>
                                                  )}
                                                </div>
                                              );
                                            } else {
                                              // Regular follow-up - purple styling
                                              return (
                                                <div key={index} className="bg-purple-900/30 rounded p-1.5 border-l-2 border-purple-500">
                                                  {followUp.breakdown ? (
                                                    <DamageBreakdownDisplay breakdown={followUp.breakdown} sourceName={sourceName} damageType={followUp.damageType} />
                                                  ) : (
                                                    <>
                                                      <div className="flex items-center gap-1 text-xs">
                                                        {followUpDamageTypeIcon && (
                                                          <img src={followUpDamageTypeIcon} alt={followUp.damageType} className="w-3 h-3" />
                                                        )}
                                                        <span className="text-purple-300 font-medium">{sourceName}</span>
                                                      </div>
                                                      <div className="text-xs space-y-0.5 mt-0.5">
                                                        <div className="flex justify-between">
                                                          <span className="flex items-center gap-1 text-gray-500">
                                                            {followUpDamageTypeIcon && (
                                                              <img src={followUpDamageTypeIcon} alt={followUp.damageType} className="w-3 h-3" />
                                                            )}
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
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}

      {currentTurn === 0 && (
        <div className="text-center py-6 text-gray-500 text-sm">
          <p>Battle not started</p>
        </div>
      )}
    </div>
  );
}
