import { Move, Sparkles, Clock } from 'lucide-react';
import type { BattleCharacter, ActionType } from '../../types';
import { getDamageTypeImageUrl } from '../../services/dataService';
import { getAbilityNameSync, getAbilityValues, executeActiveAbility, classifyAbility, isAbilityReady, getCooldownDisplayText, getFormattedAbilityDescription } from '../../services/abilities';

interface ActionPanelProps {
  character: BattleCharacter;
  onAction: (type: ActionType) => void;
}

export function ActionPanel({ character, onAction }: ActionPanelProps) {
  const hasRanged = character.rangedHits !== undefined && character.rangedHits > 0;
  const hasActiveAbility = character.activeAbilities.length > 0;

  // Get active ability info
  const activeAbilityId = character.activeAbilities[0];
  const activeAbilityName = activeAbilityId ? getAbilityNameSync(activeAbilityId) : null;
  const abilityLevelIndex = activeAbilityId
    ? (character.abilityLevels?.[activeAbilityId] ?? 54)
    : 54;

  // Get ability damage preview
  const getAbilityDamagePreview = () => {
    if (!activeAbilityId) return null;

    const values = getAbilityValues(activeAbilityId, abilityLevelIndex);
    if (!values) return null;

    const category = classifyAbility(activeAbilityId);

    // For damage abilities, show damage info
    if (category === 'damage') {
      const result = executeActiveAbility(activeAbilityId, abilityLevelIndex, {
        characterId: character.id,
        hasMoved: character.hasMoved,
        hasActedThisBattle: character.hasAttackedThisBattle,
        attacksThisTurn: character.attacksThisTurn,
        attackTurnsCount: character.attackTurnsCount,
        hasUsedAbilityThisTurn: character.hasUsedAbilityThisTurn,
        hasQualifiedForLCDamage: character.hasQualifiedForLCDamage,
        currentHealth: character.currentHealth,
        maxHealth: character.calculatedHealth,
        currentTurn: 1,
        attackType: 'ability',
        attackCategory: 'ability',
        isFirstSpecialAttackOfTurn: true,  // Preview assumes first special attack
        trajannIsAdjacentToBoss: false,  // Preview doesn't check Trajann position
        abilityToggles: character.abilityToggles,
      });

      if (result?.damageComponents) {
        // Multi-component ability
        const totalAvg = result.damageComponents.reduce(
          (sum, c) => sum + c.averageDamage * c.hits, 0
        );
        return { type: 'damage', avg: totalAvg, components: result.damageComponents };
      } else if (result?.damageResult) {
        // Single damage component
        const total = result.damageResult.averageDamage;
        return {
          type: 'damage',
          avg: total,
          damageType: result.damageResult.damageProfile,
          hits: result.damageResult.hits
        };
      }
    }

    // For buff abilities
    if (category === 'buff') {
      return { type: 'buff' };
    }

    // For healing abilities
    if (category === 'healing') {
      const hpToHeal = values.hpToHeal as number || 0;
      return { type: 'healing', amount: hpToHeal };
    }

    // For summon abilities
    if (category === 'summon') {
      return { type: 'summon' };
    }

    return null;
  };

  const abilityPreview = hasActiveAbility ? getAbilityDamagePreview() : null;

  // Check if turn is ended (all actions disabled)
  const isTurnEnded = character.turnEnded;

  // Check if ability is ready (not on cooldown)
  const abilityCooldownState = activeAbilityId ? character.abilityCooldowns[activeAbilityId] : null;
  const abilityReady = abilityCooldownState ? isAbilityReady(abilityCooldownState) : true;
  const cooldownText = abilityCooldownState ? getCooldownDisplayText(abilityCooldownState) : '';

  // Get ability description for tooltip
  const activeAbilityDescription = activeAbilityId
    ? getFormattedAbilityDescription(activeAbilityId, abilityLevelIndex)
    : null;

  const colorClasses = {
    green: 'hover:bg-green-900/50 hover:border-green-600 text-green-500',
    red: 'hover:bg-red-900/50 hover:border-red-600 text-red-500',
    blue: 'hover:bg-blue-900/50 hover:border-blue-600 text-blue-500',
    amber: 'hover:bg-amber-900/50 hover:border-amber-600 text-amber-500',
    gray: 'hover:bg-gray-700/50 hover:border-gray-500 text-gray-400',
  };

  const disabledClasses = 'opacity-50 cursor-not-allowed';

  // Use calculated damage (based on rarity/rank)
  const damage = character.calculatedDamage;
  const meleeTotalDamage = damage * character.meleeHits;
  const rangedTotalDamage = hasRanged ? damage * (character.rangedHits || 0) : 0;

  // Get damage type icons
  const meleeDamageTypeIcon = getDamageTypeImageUrl(character.meleeDamageType);
  const rangedDamageTypeIcon = character.rangedDamageType
    ? getDamageTypeImageUrl(character.rangedDamageType)
    : undefined;

  return (
    <div className="space-y-2">
      {/* Attack Actions */}
      <div className="grid grid-cols-2 gap-2">
        {/* Melee Attack */}
        <button
          onClick={() => !isTurnEnded && !character.hasActed && onAction('meleeAttack')}
          disabled={isTurnEnded || character.hasActed}
          className={`flex flex-col items-center gap-1 p-3 rounded-lg border border-gray-700 transition-colors ${
            isTurnEnded || character.hasActed ? disabledClasses : colorClasses.red
          }`}
        >
          <div className="flex items-center gap-1">
            {meleeDamageTypeIcon && (
              <img src={meleeDamageTypeIcon} alt={character.meleeDamageType} className="w-5 h-5" />
            )}
            <span className="text-xs font-medium">Melee</span>
          </div>
          <span className="text-[10px] text-gray-400">
            {damage} × {character.meleeHits} = {meleeTotalDamage.toLocaleString()}
          </span>
        </button>

        {/* Ranged Attack (only show if character has ranged) */}
        {hasRanged && (
          <button
            onClick={() => !isTurnEnded && !character.hasActed && onAction('rangedAttack')}
            disabled={isTurnEnded || character.hasActed}
            className={`flex flex-col items-center gap-1 p-3 rounded-lg border border-gray-700 transition-colors ${
              isTurnEnded || character.hasActed ? disabledClasses : colorClasses.blue
            }`}
          >
            <div className="flex items-center gap-1">
              {rangedDamageTypeIcon && (
                <img src={rangedDamageTypeIcon} alt={character.rangedDamageType} className="w-5 h-5" />
              )}
              <span className="text-xs font-medium">Ranged</span>
            </div>
            <span className="text-[10px] text-gray-400">
              {damage} × {character.rangedHits} = {rangedTotalDamage.toLocaleString()}
            </span>
          </button>
        )}
      </div>

      {/* Other Actions */}
      <div className="grid grid-cols-3 gap-2">
        {/* Move */}
        <button
          onClick={() => !isTurnEnded && !character.hasMoved && onAction('move')}
          disabled={isTurnEnded || character.hasMoved}
          className={`flex flex-col items-center gap-1 p-2 rounded-lg border border-gray-700 transition-colors ${
            isTurnEnded || character.hasMoved ? disabledClasses : colorClasses.green
          }`}
        >
          <Move size={18} />
          <span className="text-xs font-medium">Move</span>
        </button>

        {/* Ability */}
        <button
          onClick={() => !isTurnEnded && !(character.hasActed || !hasActiveAbility || !abilityReady) && onAction('ability')}
          disabled={isTurnEnded || character.hasActed || !hasActiveAbility || !abilityReady}
          className={`flex flex-col items-center gap-1 p-2 rounded-lg border border-gray-700 transition-colors ${
            isTurnEnded || character.hasActed || !hasActiveAbility || !abilityReady ? disabledClasses : colorClasses.amber
          }`}
          title={activeAbilityName
            ? `${activeAbilityName}${!abilityReady ? ` (${cooldownText})` : ''}\n\n${activeAbilityDescription || ''}`
            : 'No ability'
          }
        >
          <Sparkles size={18} />
          <span className="text-xs font-medium truncate max-w-full">
            {activeAbilityName || 'No Ability'}
          </span>
          {!abilityReady ? (
            <span className="text-[10px] text-red-400">
              {cooldownText}
            </span>
          ) : abilityPreview && (
            <span className="text-[10px] text-gray-400">
              {abilityPreview.type === 'damage' && `~${abilityPreview.avg?.toLocaleString()} dmg`}
              {abilityPreview.type === 'buff' && 'Buff'}
              {abilityPreview.type === 'healing' && `+${abilityPreview.amount} HP`}
              {abilityPreview.type === 'summon' && 'Summon'}
            </span>
          )}
        </button>

        {/* Wait */}
        <button
          onClick={() => !isTurnEnded && onAction('wait')}
          disabled={isTurnEnded}
          className={`flex flex-col items-center gap-1 p-2 rounded-lg border border-gray-700 transition-colors ${
            isTurnEnded ? disabledClasses : colorClasses.gray
          }`}
        >
          <Clock size={18} />
          <span className="text-xs font-medium">Wait</span>
        </button>
      </div>
    </div>
  );
}
