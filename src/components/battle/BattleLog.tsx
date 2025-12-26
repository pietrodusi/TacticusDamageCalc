import { useState, useEffect } from 'react';
import type { BattleLogEntry, DamageBreakdown, FollowUpAttackLog } from '../../types';
import type { BuffSource } from '../../services/damage/types';
import { Sword, Move, Sparkles, Clock, RotateCcw, Crosshair, Pencil, X, Zap, ChevronDown, ChevronRight } from 'lucide-react';

// Extended entry with turn number
export interface TurnLogEntry extends BattleLogEntry {
  turn: number;
  attackType?: 'melee' | 'ranged';
}

// Helper function to format sources inline with individual values
// valueKey specifies which property to display (e.g., 'damageBonus', 'extraHits', 'critChanceBonus')
function formatSourcesInline(sources: BuffSource[], valueKey: keyof BuffSource): string {
  if (!sources || sources.length === 0) return '';
  const parts = sources.map(s => {
    const value = s[valueKey] as number | undefined;
    if (value !== undefined && value !== 0) {
      // Format multipliers as percentages
      if (valueKey === 'damageMultiplier') {
        const percent = Math.round((value - 1) * 100);
        return `${s.name} ${percent >= 0 ? '+' : ''}${percent}%`;
      }
      // Format crit chance as percentage
      if (valueKey === 'critChanceBonus') {
        return `${s.name} +${value}%`;
      }
      return `${s.name} +${value}`;
    }
    return s.name;
  });
  return ` (${parts.join(', ')})`;
}

// Component to display damage breakdown with sources inline
function DamageBreakdownDisplay({ breakdown, sourceName }: { breakdown: DamageBreakdown; sourceName?: string }) {
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
            <span>−{breakdown.targetArmor} → {breakdown.afterArmor.toFixed(0)}</span>
          </div>
        )}
        <div className="flex justify-between text-gray-500">
          <span>Pierce ({(breakdown.pierceRatio * 100).toFixed(0)}%):</span>
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
          <span>Per Hit:</span>
          <span>{breakdown.perHitDamage.toFixed(0)}</span>
        </div>
        <div className="flex justify-between text-gray-400">
          <span>× Hits:</span>
          <span>{hitsText}</span>
        </div>
      </div>
    </div>
  );
}

// Component to display follow-up attacks with full breakdown
function FollowUpAttacksDisplay({ followUps }: { followUps: FollowUpAttackLog[] }) {
  return (
    <div className="mt-1 space-y-1">
      {followUps.map((followUp, index) => (
        <div key={index} className="bg-purple-900/30 rounded p-1.5 border-l-2 border-purple-500">
          {followUp.breakdown ? (
            // Full breakdown display - modifiers shown inline via DamageBreakdownDisplay
            <DamageBreakdownDisplay breakdown={followUp.breakdown} sourceName={followUp.abilityName} />
          ) : (
            // Fallback for old data without breakdown
            <>
              <div className="flex items-center gap-1 text-xs">
                <Zap size={10} className="text-purple-400" />
                <span className="text-purple-300 font-medium">{followUp.abilityName}</span>
              </div>
              <div className="text-xs space-y-0.5 mt-0.5">
                <div className="flex justify-between">
                  <span className="text-gray-500">{followUp.hits}x {followUp.damageType}:</span>
                  <span className="text-purple-300">{followUp.damage.toLocaleString()}</span>
                </div>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

interface BattleLogProps {
  entries: TurnLogEntry[];
  currentTurn: number;
  editingTurn?: number | null;
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
};

export function BattleLog({ entries, currentTurn, editingTurn, onUndoCharacterTurn, onEditTurn }: BattleLogProps) {
  // Track which turns are expanded (current turn always starts expanded)
  const [expandedTurns, setExpandedTurns] = useState<Set<number>>(() => new Set([currentTurn]));

  // When current turn changes, collapse past turns and expand only the new current turn
  useEffect(() => {
    setExpandedTurns(new Set([currentTurn]));
  }, [currentTurn]);

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
    <div className="space-y-2 max-h-[500px] lg:max-h-none overflow-y-auto">
      {Array.from({ length: currentTurn }, (_, i) => i + 1).map(turn => {
        const turnEntries = entriesByTurn[turn] || [];
        const isCurrent = turn === currentTurn;
        const isExpanded = expandedTurns.has(turn);

        const isEditing = editingTurn === turn;
        const isPastTurn = turn < currentTurn;

        // Calculate turn damage summary for collapsed view
        const turnDamage = turnEntries.reduce((sum, e) => sum + (e.damageBreakdown?.damage || e.damage || 0), 0);

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
                    — {turnDamage.toLocaleString()} avg dmg
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

                        return (
                          <div key={charId} className="bg-gray-800/50 rounded p-2">
                            {/* Character header with undo button */}
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium text-gray-300">{characterName}</span>
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
                                        <DamageBreakdownDisplay
                                          breakdown={entry.damageBreakdown}
                                          sourceName={entry.action === 'ability' ? undefined : (entry.attackType === 'ranged' ? 'Ranged Attack' : 'Melee Attack')}
                                        />
                                      ) : entry.damage !== undefined && entry.damage > 0 ? (
                                        <p className="text-red-400 text-xs">
                                          -{entry.damage.toLocaleString()} damage
                                        </p>
                                      ) : null}
                                      {/* Follow-up attacks */}
                                      {entry.followUpAttacks && entry.followUpAttacks.length > 0 && (
                                        <FollowUpAttacksDisplay followUps={entry.followUpAttacks} />
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
