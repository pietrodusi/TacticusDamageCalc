import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus, X, User, Pencil } from 'lucide-react';
import type { TeamMember } from '../../types';
import { StatBadge } from '../ui';
import {
  calculateStats,
  getAllProgressionSteps,
  getRankImageUrl,
  getRarityImageUrl,
  getAbilityDisplayLevel,
  getAbilityInfo,
  ensureAbilitiesLoaded,
  DEFAULT_ABILITY_LEVEL,
  calculateEquipmentStats,
} from '../../services/dataService';

interface TeamSlotProps {
  character?: TeamMember;
  slotIndex: number;
  onRemove?: (characterId: string) => void;
  /** Custom navigation state when clicking empty slot to add character */
  navigationState?: { addToTeam: boolean; returnTo?: string };
}

export function TeamSlot({ character, slotIndex, onRemove, navigationState }: TeamSlotProps) {
  const progressionSteps = getAllProgressionSteps();
  const [abilitiesLoaded, setAbilitiesLoaded] = useState(false);

  useEffect(() => {
    ensureAbilitiesLoaded().then(() => setAbilitiesLoaded(true));
  }, []);

  // Default navigation state for calculator
  const navState = navigationState || { addToTeam: true };

  if (!character) {
    return (
      <Link
        to="/characters"
        state={navState}
        className="card p-4 flex flex-col items-center justify-center min-h-[180px] border-dashed hover:border-imperial-gold group"
      >
        <div className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center mb-3 group-hover:bg-gray-600 transition-colors">
          <Plus size={24} className="text-gray-500 group-hover:text-imperial-gold transition-colors" />
        </div>
        <span className="text-sm text-gray-500 group-hover:text-gray-400">
          Slot {slotIndex + 1}
        </span>
        <span className="text-xs text-gray-600">Click to add</span>
      </Link>
    );
  }

  const currentStep = progressionSteps[character.progressionStepIndex];
  const calculatedStats = calculateStats(character, character.progressionStepIndex, character.rank);

  return (
    <div className="card p-4 relative">
      {/* Modify Button */}
      <Link
        to={`/characters/${encodeURIComponent(character.id)}`}
        className="absolute top-2 left-2 p-1 rounded-full bg-gray-700 hover:bg-blue-900 text-gray-400 hover:text-blue-400 transition-colors z-10"
        title="Modify character"
      >
        <Pencil size={16} />
      </Link>

      {/* Remove Button */}
      {onRemove && (
        <button
          onClick={() => onRemove(character.id)}
          className="absolute top-2 right-2 p-1 rounded-full bg-gray-700 hover:bg-red-900 text-gray-400 hover:text-red-400 transition-colors z-10"
          title="Remove from team"
        >
          <X size={16} />
        </button>
      )}

      <div className="flex flex-col items-center">
        {/* Character Image */}
        <div className="w-14 h-14 rounded-full bg-gray-700 flex items-center justify-center mb-2 overflow-hidden">
          {character.iconUrl ? (
            <img
              src={character.iconUrl}
              alt={character.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <User size={28} className="text-gray-500" />
          )}
        </div>

        {/* Name */}
        <h4 className="text-sm font-semibold text-gray-100 text-center mb-2 line-clamp-1">
          {character.name}
        </h4>

        {/* Rarity and Rank Icons */}
        <div className="flex items-center gap-2 mb-2">
          {currentStep && getRarityImageUrl(currentStep.rarity) && (
            <img
              src={getRarityImageUrl(currentStep.rarity)}
              alt={currentStep.rarity}
              className="w-5 h-5 object-contain"
              title={`${currentStep.rarity} ${currentStep.stars}★`}
            />
          )}
          {getRankImageUrl(character.rank) && (
            <img
              src={getRankImageUrl(character.rank)}
              alt=""
              className="w-5 h-5 object-contain"
              title={`Rank ${character.rank + 1}`}
            />
          )}
        </div>

        {/* Calculated Stats */}
        <div className="flex gap-1 flex-wrap justify-center">
          <StatBadge stat="health" value={calculatedStats.health} size="sm" />
          <StatBadge stat="damage" value={calculatedStats.damage} size="sm" />
        </div>

        {/* Equipment Bonuses - shown prominently under stats */}
        <EquipmentBonuses character={character} />

        {/* Ability Levels */}
        {abilitiesLoaded && (character.activeAbilities.length > 0 || character.passiveAbilities.length > 0) && (
          <div className="mt-2 pt-2 border-t border-gray-700/50 w-full">
            <div className="space-y-1">
              {character.activeAbilities.map((abilityId) => {
                const level = character.abilityLevels?.[abilityId] ?? DEFAULT_ABILITY_LEVEL;
                const info = getAbilityInfo(abilityId, level);
                if (!info) return null;
                return (
                  <div key={abilityId} className="flex items-center justify-between text-xs">
                    <span className="text-amber-400 truncate max-w-[80px]" title={info.name}>
                      {info.name}
                    </span>
                    <span className="text-gray-500 ml-1">
                      Lv{getAbilityDisplayLevel(level)}
                    </span>
                  </div>
                );
              })}
              {character.passiveAbilities.map((abilityId) => {
                const level = character.abilityLevels?.[abilityId] ?? DEFAULT_ABILITY_LEVEL;
                const info = getAbilityInfo(abilityId, level);
                if (!info) return null;
                return (
                  <div key={abilityId} className="flex items-center justify-between text-xs">
                    <span className="text-blue-400 truncate max-w-[80px]" title={info.name}>
                      {info.name}
                    </span>
                    <span className="text-gray-500 ml-1">
                      Lv{getAbilityDisplayLevel(level)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Equipment bonuses shown prominently under character stats
function EquipmentBonuses({ character }: { character: TeamMember }) {
  const equipmentStats = useMemo(
    () => calculateEquipmentStats(character.equipment),
    [character.equipment]
  );

  // Check if there are any non-zero stats
  const hasStats = Object.values(equipmentStats).some(v => v !== undefined && v !== 0);

  if (!hasStats) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1 justify-center text-xs">
      {equipmentStats.critChance !== undefined && equipmentStats.critChance > 0 && (
        <span className="px-1.5 py-0.5 bg-orange-900/40 text-orange-300 rounded">
          +{equipmentStats.critChance}% Crit
        </span>
      )}
      {equipmentStats.critDmg !== undefined && equipmentStats.critDmg > 0 && (
        <span className="px-1.5 py-0.5 bg-orange-900/40 text-orange-300 rounded">
          +{equipmentStats.critDmg} CritDmg
        </span>
      )}
      {equipmentStats.blockChance !== undefined && equipmentStats.blockChance > 0 && (
        <span className="px-1.5 py-0.5 bg-blue-900/40 text-blue-300 rounded">
          +{equipmentStats.blockChance}% Block
        </span>
      )}
      {equipmentStats.blockDmg !== undefined && equipmentStats.blockDmg > 0 && (
        <span className="px-1.5 py-0.5 bg-blue-900/40 text-blue-300 rounded">
          +{equipmentStats.blockDmg} BlockDmg
        </span>
      )}
      {equipmentStats.hp !== undefined && equipmentStats.hp > 0 && (
        <span className="px-1.5 py-0.5 bg-green-900/40 text-green-300 rounded">
          +{equipmentStats.hp} HP
        </span>
      )}
      {equipmentStats.fixedArmor !== undefined && equipmentStats.fixedArmor > 0 && (
        <span className="px-1.5 py-0.5 bg-gray-700/60 text-gray-300 rounded">
          +{equipmentStats.fixedArmor} Armor
        </span>
      )}
      {equipmentStats.critChanceBonus !== undefined && equipmentStats.critChanceBonus > 0 && (
        <span className="px-1.5 py-0.5 bg-yellow-900/40 text-yellow-300 rounded">
          +{equipmentStats.critChanceBonus}% CritBonus
        </span>
      )}
      {equipmentStats.blockChanceBonus !== undefined && equipmentStats.blockChanceBonus > 0 && (
        <span className="px-1.5 py-0.5 bg-cyan-900/40 text-cyan-300 rounded">
          +{equipmentStats.blockChanceBonus}% BlockBonus
        </span>
      )}
    </div>
  );
}
