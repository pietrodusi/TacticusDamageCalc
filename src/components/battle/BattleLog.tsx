import { useState, useEffect } from 'react';
import type { BattleLogEntry, DamageBreakdown, FollowUpAttackLog } from '../../types';
import { Sword, Move, Sparkles, Clock, RotateCcw, Crosshair, Pencil, X, Zap, ChevronDown, ChevronRight } from 'lucide-react';

// Extended entry with turn number
export interface TurnLogEntry extends BattleLogEntry {
  turn: number;
  attackType?: 'melee' | 'ranged';
}

// Component to display follow-up attacks
function FollowUpAttacksDisplay({ followUps }: { followUps: FollowUpAttackLog[] }) {
  return (
    <div className="mt-1 space-y-1">
      {followUps.map((followUp, index) => (
        <div key={index} className="bg-purple-900/30 rounded p-1.5 border-l-2 border-purple-500">
          <div className="flex items-center gap-1 text-xs">
            <Zap size={10} className="text-purple-400" />
            <span className="text-purple-300 font-medium">{followUp.abilityName}</span>
          </div>
          <div className="text-xs space-y-0.5 mt-0.5">
            <div className="flex justify-between">
              <span className="text-gray-500">{followUp.hits}x {followUp.damageType}:</span>
              <span className="text-purple-300">{followUp.damage.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Range:</span>
              <span>
                <span className="text-red-400">{followUp.lowerBound.toLocaleString()}</span>
                {' - '}
                <span className="text-green-400">{followUp.upperBound.toLocaleString()}</span>
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Component to display damage breakdown
function DamageBreakdownDisplay({ breakdown }: { breakdown: DamageBreakdown }) {
  // Get applicable trait modifiers
  const applicableTraits = breakdown.traitModifiers?.filter(t => t.applicable) || [];
  const hasTraitBonus = applicableTraits.length > 0 && breakdown.traitMultiplier !== 1;

  return (
    <div className="mt-1 text-xs space-y-1 bg-gray-900/50 rounded p-1.5">
      {/* Damage range */}
      <div className="flex justify-between">
        <span className="text-gray-500">Damage:</span>
        <span>
          <span className="text-red-400">{breakdown.lowerBound.toLocaleString()}</span>
          {' - '}
          <span className="text-amber-400 font-medium">{breakdown.average.toLocaleString()}</span>
          {' - '}
          <span className="text-green-400">{breakdown.upperBound.toLocaleString()}</span>
        </span>
      </div>

      {/* Stats breakdown */}
      <div className="flex justify-between text-gray-500">
        <span>Base:</span>
        <span>{breakdown.baseDamage} × {breakdown.hits} hits</span>
      </div>
      {/* Trait bonuses */}
      {hasTraitBonus && (
        <div className="border-t border-gray-700/50 pt-0.5 mt-0.5">
          {applicableTraits.map(trait => {
            const bonusPercent = ((trait.damageMultiplier - 1) * 100).toFixed(0);
            const sign = trait.damageMultiplier >= 1 ? '+' : '';
            const colorClass = trait.damageMultiplier >= 1 ? 'text-green-400/80' : 'text-red-400/80';
            return (
              <div key={trait.traitId} className={`flex justify-between ${colorClass}`}>
                <span>{trait.traitName}:</span>
                <span>{sign}{bonusPercent}%</span>
              </div>
            );
          })}
        </div>
      )}
      {breakdown.critChance > 0 && (
        <div className="flex justify-between text-orange-400/70">
          <span>Crit:</span>
          <span>{breakdown.critChance.toFixed(0)}% / +{breakdown.critDamage}</span>
        </div>
      )}
      <div className="flex justify-between text-gray-500">
        <span>Pierce:</span>
        <span>{breakdown.pierceRatio.toFixed(0)}%</span>
      </div>
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
        const turnDamage = turnEntries.reduce((sum, e) => sum + (e.damageBreakdown?.average || e.damage || 0), 0);

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
                                        <DamageBreakdownDisplay breakdown={entry.damageBreakdown} />
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
