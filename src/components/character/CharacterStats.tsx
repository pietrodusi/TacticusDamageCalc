import { useState, useEffect, useRef } from 'react';
import type { Character } from '../../types';
import { StatBadge, RarityBadge } from '../ui';
import { Zap, Target, Crosshair, ChevronDown } from 'lucide-react';
import {
  calculateStats,
  getAllProgressionSteps,
  getProgressionStepDisplayName,
  getMaxRankForStep,
  getRankDisplayName,
  getRankImageUrl,
  getRarityImageUrl,
  getDamageTypeImageUrl,
} from '../../services/dataService';
import { getTraitName } from '../../services/damage';

interface CharacterStatsProps {
  character: Character;
  progressionStepIndex?: number;
  rank?: number;
  onProgressionChange?: (progressionStepIndex: number, rank: number) => void;
}

// Default to Mythic 12★ (index 17) and Adamantine II (rank 19)
export const DEFAULT_PROGRESSION_STEP = 17;
export const DEFAULT_RANK = 19;

export function CharacterStats({
  character,
  progressionStepIndex,
  rank,
  onProgressionChange,
}: CharacterStatsProps) {
  const progressionSteps = getAllProgressionSteps();
  const [internalStepIndex, setInternalStepIndex] = useState<number>(progressionStepIndex ?? DEFAULT_PROGRESSION_STEP);
  const [internalRank, setInternalRank] = useState<number>(rank ?? DEFAULT_RANK);

  // Use controlled or internal state
  const selectedStepIndex = progressionStepIndex ?? internalStepIndex;
  const selectedRank = rank ?? internalRank;

  const setSelectedStepIndex = (index: number) => {
    setInternalStepIndex(index);
    // Cap rank if it exceeds max for new step
    const newMaxRank = getMaxRankForStep(index);
    const newRank = selectedRank >= newMaxRank ? (newMaxRank > 0 ? newMaxRank - 1 : 0) : selectedRank;
    if (newRank !== selectedRank) {
      setInternalRank(newRank);
    }
    if (onProgressionChange) {
      onProgressionChange(index, newRank);
    }
  };

  const setSelectedRank = (newRank: number) => {
    setInternalRank(newRank);
    if (onProgressionChange) {
      onProgressionChange(selectedStepIndex, newRank);
    }
  };
  const [rarityDropdownOpen, setRarityDropdownOpen] = useState(false);
  const [rankDropdownOpen, setRankDropdownOpen] = useState(false);
  const rarityDropdownRef = useRef<HTMLDivElement>(null);
  const rankDropdownRef = useRef<HTMLDivElement>(null);

  // Get max rank for selected progression step
  const maxRank = getMaxRankForStep(selectedStepIndex);
  const currentStep = progressionSteps[selectedStepIndex];

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (rarityDropdownRef.current && !rarityDropdownRef.current.contains(event.target as Node)) {
        setRarityDropdownOpen(false);
      }
      if (rankDropdownRef.current && !rankDropdownRef.current.contains(event.target as Node)) {
        setRankDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Calculate current stats based on selected progression step and rank
  const currentStats = calculateStats(character, selectedStepIndex, selectedRank);

  // Generate rank options
  const rankOptions = [];
  for (let i = 0; i < maxRank; i++) {
    rankOptions.push({ value: i, label: getRankDisplayName(i) });
  }

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex items-center gap-3 flex-wrap">
        <RarityBadge rarity={character.baseRarity} />
        <span className="text-gray-400">{character.faction}</span>
        <span className="text-gray-500">•</span>
        <span className="text-gray-400">{character.alliance}</span>
      </div>

      {/* Progression & Rank Selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Progression Step Selector (Custom Dropdown) */}
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            Rarity & Stars
          </label>
          <div className="relative" ref={rarityDropdownRef}>
            <button
              type="button"
              onClick={() => setRarityDropdownOpen(!rarityDropdownOpen)}
              className="w-full flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 pr-10 text-gray-100 focus:outline-none focus:border-imperial-gold cursor-pointer text-left"
            >
              {currentStep && (
                <>
                  {getRarityImageUrl(currentStep.rarity) && (
                    <img src={getRarityImageUrl(currentStep.rarity)} alt="" className="w-5 h-5 object-contain" />
                  )}
                  <span>{getProgressionStepDisplayName(currentStep)} ({currentStep.unitStatMultiplierPct}%)</span>
                </>
              )}
            </button>
            <ChevronDown
              size={20}
              className={`absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none transition-transform ${rarityDropdownOpen ? 'rotate-180' : ''}`}
            />
            {rarityDropdownOpen && (
              <div className="absolute z-50 mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg shadow-lg max-h-60 overflow-auto">
                {progressionSteps.map((step, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => {
                      setSelectedStepIndex(index);
                      setRarityDropdownOpen(false);
                    }}
                    className={`w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-gray-700 ${selectedStepIndex === index ? 'bg-gray-700' : ''}`}
                  >
                    {getRarityImageUrl(step.rarity) && (
                      <img src={getRarityImageUrl(step.rarity)} alt="" className="w-5 h-5 object-contain" />
                    )}
                    <span className="text-gray-100">{getProgressionStepDisplayName(step)} ({step.unitStatMultiplierPct}%)</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Rank Selector (Custom Dropdown) */}
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            Rank
          </label>
          <div className="relative" ref={rankDropdownRef}>
            <button
              type="button"
              onClick={() => setRankDropdownOpen(!rankDropdownOpen)}
              className="w-full flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 pr-10 text-gray-100 focus:outline-none focus:border-imperial-gold cursor-pointer text-left"
            >
              {getRankImageUrl(selectedRank) && (
                <img src={getRankImageUrl(selectedRank)} alt="" className="w-5 h-5 object-contain" />
              )}
              <span>{getRankDisplayName(selectedRank)}</span>
            </button>
            <ChevronDown
              size={20}
              className={`absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none transition-transform ${rankDropdownOpen ? 'rotate-180' : ''}`}
            />
            {rankDropdownOpen && (
              <div className="absolute z-50 mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg shadow-lg max-h-60 overflow-auto">
                {rankOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setSelectedRank(option.value);
                      setRankDropdownOpen(false);
                    }}
                    className={`w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-gray-700 ${selectedRank === option.value ? 'bg-gray-700' : ''}`}
                  >
                    {getRankImageUrl(option.value) && (
                      <img src={getRankImageUrl(option.value)} alt="" className="w-5 h-5 object-contain" />
                    )}
                    <span className="text-gray-100">{option.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats Display */}
      <div>
        <h3 className="text-lg font-semibold text-imperial-gold mb-3">
          Stats at {currentStep ? getProgressionStepDisplayName(currentStep) : ''} {getRankDisplayName(selectedRank)}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatBadge stat="health" value={currentStats.health} size="lg" />
          <StatBadge stat="damage" value={currentStats.damage} size="lg" />
          <StatBadge stat="armour" value={currentStats.armour} size="lg" />
          <StatBadge stat="movement" value={character.movement} size="lg" />
        </div>
      </div>

      {/* Melee Attack */}
      <div>
        <h3 className="text-lg font-semibold text-imperial-gold mb-3 flex items-center gap-2">
          <Target size={20} />
          Melee Attack
        </h3>
        <div className="bg-gray-800/50 rounded-lg p-4 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Damage Type</span>
            <span className="text-gray-100 font-medium flex items-center gap-2">
              {getDamageTypeImageUrl(character.meleeDamageType) && (
                <img src={getDamageTypeImageUrl(character.meleeDamageType)} alt="" className="w-5 h-5 object-contain" />
              )}
              {character.meleeDamageType}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Hits</span>
            <span className="text-gray-100 font-medium">{character.meleeHits}x</span>
          </div>
        </div>
      </div>

      {/* Ranged Attack */}
      {character.rangedHits && (
        <div>
          <h3 className="text-lg font-semibold text-imperial-gold mb-3 flex items-center gap-2">
            <Crosshair size={20} />
            Ranged Attack
          </h3>
          <div className="bg-gray-800/50 rounded-lg p-4 space-y-2">
            {character.rangedDamageType && (
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Damage Type</span>
                <span className="text-gray-100 font-medium flex items-center gap-2">
                  {getDamageTypeImageUrl(character.rangedDamageType) && (
                    <img src={getDamageTypeImageUrl(character.rangedDamageType)} alt="" className="w-5 h-5 object-contain" />
                  )}
                  {character.rangedDamageType}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-400">Hits</span>
              <span className="text-gray-100 font-medium">{character.rangedHits}x</span>
            </div>
            {character.rangedDistance && (
              <div className="flex justify-between">
                <span className="text-gray-400">Range</span>
                <span className="text-gray-100 font-medium">{character.rangedDistance} hexes</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Traits */}
      {character.traits.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-imperial-gold mb-3 flex items-center gap-2">
            <Zap size={20} />
            Traits
          </h3>
          <div className="flex flex-wrap gap-2">
            {character.traits.map((trait) => (
              <span
                key={trait}
                className="px-3 py-1 bg-gray-700 rounded-full text-sm text-gray-200"
              >
                {getTraitName(trait)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
