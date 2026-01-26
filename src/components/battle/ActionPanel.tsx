import { Sparkles, Clock, Wrench, Crosshair } from 'lucide-react';
import type { BattleCharacter, ActionType } from '../../types';
import { getDamageTypeImageUrl } from '../../services/dataService';
import { getAbilityNameSync, getAbilityValues, executeActiveAbility, classifyAbility, isAbilityReady, getCooldownDisplayText, getFormattedAbilityDescription } from '../../services/abilities';

interface ActionPanelProps {
  character: BattleCharacter;
  team?: BattleCharacter[];
  onAction: (type: ActionType) => void;
  onExecuteBetrayer?: () => void;
  onExecuteOverwatch?: () => void;
}

export function ActionPanel({ character, team, onAction, onExecuteBetrayer, onExecuteOverwatch }: ActionPanelProps) {
  const hasRanged = character.rangedHits !== undefined && character.rangedHits > 0;
  const hasActiveAbility = character.activeAbilities.length > 0;
  const hasMechanicTrait = character.traits.includes('Mechanic');
  const hasTheBetrayerAbility = character.passiveAbilities?.includes('TheBetrayer') ?? false;
  const isAdjacentToBoss = character.abilityToggles?.['adjacentToBoss'] ?? false;
  // Overwatch check - available for:
  // 1. Characters with Overwatch trait (e.g., Azrael) - always available once per turn
  // 2. Re'vas (has EarlyWarningOverride) - available after EWO is used
  // 3. Forcas (has CalibaniteGreatsword) - available when in Strike Stance
  const hasOverwatchTrait = character.traits.includes('Overwatch');
  const hasEarlyWarningOverride = character.activeAbilities?.includes('EarlyWarningOverride') ?? false;
  const hasCalibaniteGreatsword = character.activeAbilities?.includes('CalibaniteGreatsword') ?? false;
  const hasOverwatchActive = character.overwatchActive ?? false;  // Activated by Early Warning Override (has +extraDmg from EWO)
  const hasUsedOverwatchThisTurn = character.hasUsedOverwatchThisTurn ?? false;
  // Forcas's CalibaniteGreatsword stance: 'strike' enables Overwatch, 'sweep' disables it. Default is 'strike'.
  const calibaniteStance = character.calibaniteGreatswordStance ?? 'strike';
  const isInStrikeStance = hasCalibaniteGreatsword && calibaniteStance === 'strike';
  // Show for characters with Overwatch trait OR Re'vas (has EWO) OR Forcas (has CalibaniteGreatsword)
  const showOverwatchButton = hasOverwatchTrait || hasEarlyWarningOverride || hasCalibaniteGreatsword;
  // For Re'vas: enabled after EWO is used (overwatchActive)
  // For Overwatch trait characters: always available once per turn
  // For Forcas: available when in Strike Stance
  const canUseOverwatch = !hasUsedOverwatchThisTurn && (
    (hasOverwatchTrait && !hasEarlyWarningOverride && !hasCalibaniteGreatsword) ||  // Overwatch trait only: always available
    (hasEarlyWarningOverride && hasOverwatchActive) ||  // Re'vas with EWO: only after activating EWO
    isInStrikeStance  // Forcas with CalibaniteGreatsword: only in Strike Stance
  );

  // Calculate total Overwatch bonus (EWO + LionHelm)
  const getOverwatchBonus = (): number => {
    let bonus = hasOverwatchActive ? (character.overwatchExtraDmg || 0) : 0;

    // Check for LionHelm bonus from Azrael
    // For Azrael himself: always active (no toggle needed)
    // For other characters: requires "Range 2 from Azrael" toggle
    if (team) {
      const azrael = team.find((c) => c.passiveAbilities.includes('LionHelm'));
      if (azrael) {
        const isAzrael = character.id === azrael.id;
        const lionHelmToggleId = `LionHelm_${azrael.id}_overwatch`;
        const hasLionHelmBonus = isAzrael || (character.abilityToggles?.[lionHelmToggleId] ?? false);

        if (hasLionHelmBonus) {
          const lionHelmLevelIndex = azrael.abilityLevels?.['LionHelm'] ?? 54;
          const lionHelmValues = getAbilityValues('LionHelm', lionHelmLevelIndex);
          bonus += (lionHelmValues?.extraDmg as number) || 0;
        }
      }
    }

    return bonus;
  };
  const overwatchBonus = getOverwatchBonus();

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

  // Get Execute (The Betrayer) damage preview for Kharn
  const getExecuteDamagePreview = () => {
    if (!hasTheBetrayerAbility) return null;

    const levelIndex = character.abilityLevels?.TheBetrayer ?? 54;
    const values = getAbilityValues('TheBetrayer', levelIndex);
    if (!values) return null;

    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);
    const hits = 4;
    return { avg: avgDmg, hits, total: avgDmg * hits };
  };

  const executePreview = hasTheBetrayerAbility ? getExecuteDamagePreview() : null;

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

  // Get Doctrina Imperatives stance for display
  const getDoctrinaStanceDisplay = (): string | null => {
    if (activeAbilityId !== 'DoctrinaImperatives') return null;
    const stance = character.doctrinaImperativeStance;
    if (stance === 'protector') return 'Protector';
    if (stance === 'conqueror') return 'Conqueror';
    return null;  // Not yet activated
  };
  const doctrinaStance = getDoctrinaStanceDisplay();

  // Get Calibanite Greatsword stance for display
  const getCalibaniteStanceDisplay = (): 'Strike' | 'Sweep' | null => {
    if (activeAbilityId !== 'CalibaniteGreatsword') return null;
    const stance = character.calibaniteGreatswordStance ?? 'strike';  // Default to strike
    return stance === 'strike' ? 'Strike' : 'Sweep';
  };
  const calibaniteStanceDisplay = getCalibaniteStanceDisplay();

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
  const eviscerateDamageTypeIcon = getDamageTypeImageUrl('Eviscerate');

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
      <div className={`grid gap-2 ${hasMechanicTrait || hasTheBetrayerAbility || showOverwatchButton ? 'grid-cols-2 sm:grid-cols-2' : 'grid-cols-1'}`}>
        {/* Repair (only for Mechanic trait) */}
        {hasMechanicTrait && (
          <button
            onClick={() => !isTurnEnded && !character.hasActed && onAction('repair')}
            disabled={isTurnEnded || character.hasActed}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg border border-gray-700 transition-colors ${
              isTurnEnded || character.hasActed ? disabledClasses : 'hover:bg-cyan-900/50 hover:border-cyan-600 text-cyan-500'
            }`}
            title="Repair a friendly Mechanical unit"
          >
            <Wrench size={18} />
            <span className="text-xs font-medium">Repair</span>
          </button>
        )}

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
          {/* Show current stance for Doctrina Imperatives */}
          {doctrinaStance ? (
            <span className={`text-[10px] ${doctrinaStance === 'Protector' ? 'text-green-400' : 'text-red-400'}`}>
              {doctrinaStance} Imperative
            </span>
          ) : calibaniteStanceDisplay ? (
            <span className={`text-[10px] ${calibaniteStanceDisplay === 'Strike' ? 'text-green-400' : 'text-red-400'}`}>
              {calibaniteStanceDisplay} Stance
            </span>
          ) : !abilityReady ? (
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

        {/* Wait - hidden for now */}
        {false && (
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
        )}

        {/* The Betrayer (bonus attack for Kharn) */}
        {hasTheBetrayerAbility && onExecuteBetrayer && (
          <button
            onClick={() => !isTurnEnded && !character.hasUsedTheBetrayerThisTurn && onExecuteBetrayer()}
            disabled={isTurnEnded || character.hasUsedTheBetrayerThisTurn}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg border border-gray-700 transition-colors ${
              isTurnEnded || character.hasUsedTheBetrayerThisTurn ? disabledClasses : 'hover:bg-orange-900/50 hover:border-orange-600 text-orange-500'
            }`}
            title="The Betrayer: Bonus attack when enemy defeated (4x Eviscerate)"
          >
            <div className="flex items-center gap-1">
              {eviscerateDamageTypeIcon && (
                <img src={eviscerateDamageTypeIcon} alt="Eviscerate" className="w-5 h-5" />
              )}
              <span className="text-xs font-medium">The Betrayer</span>
            </div>
            {executePreview && (
              <span className="text-[10px] text-gray-400">
                ~{executePreview.total.toLocaleString()} dmg
              </span>
            )}
          </button>
        )}

        {/* Overwatch (visible for all characters with Overwatch trait) */}
        {/* For Re'vas: requires Early Warning Override to be used first */}
        {/* For others: available once per turn, may have LionHelm bonus */}
        {showOverwatchButton && onExecuteOverwatch && (
          <button
            onClick={() => canUseOverwatch && onExecuteOverwatch()}
            disabled={!canUseOverwatch}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg border border-gray-700 transition-colors ${
              !canUseOverwatch ? disabledClasses : 'hover:bg-cyan-900/50 hover:border-cyan-600 text-cyan-500'
            }`}
            title={`Overwatch: ${isInStrikeStance ? 'Melee' : (isAdjacentToBoss ? 'Melee' : 'Ranged')} attack${overwatchBonus > 0 ? ` with +${overwatchBonus} damage` : ''}${hasEarlyWarningOverride && !hasOverwatchActive ? ' (requires Early Warning Override)' : ''}${hasCalibaniteGreatsword && calibaniteStance === 'sweep' ? ' (requires Strike Stance)' : ''}`}
          >
            <div className="flex items-center gap-1">
              <Crosshair size={18} />
              <span className="text-xs font-medium">Overwatch</span>
            </div>
            <span className="text-[10px] text-gray-400">
              {isInStrikeStance ? 'Melee' : (isAdjacentToBoss ? 'Melee' : 'Ranged')}{overwatchBonus > 0 ? ` +${overwatchBonus}` : ''}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
