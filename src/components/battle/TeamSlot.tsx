import { Link } from 'react-router-dom';
import { Plus, X, User, Pencil } from 'lucide-react';
import type { TeamMember } from '../../types';
import { StatBadge } from '../ui';
import {
  calculateStats,
  getAllProgressionSteps,
  getRankImageUrl,
  getRarityImageUrl,
} from '../../services/dataService';

interface TeamSlotProps {
  character?: TeamMember;
  slotIndex: number;
  onRemove?: (characterId: string) => void;
}

export function TeamSlot({ character, slotIndex, onRemove }: TeamSlotProps) {
  const progressionSteps = getAllProgressionSteps();

  if (!character) {
    return (
      <Link
        to="/characters"
        state={{ addToTeam: true }}
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
      </div>
    </div>
  );
}
