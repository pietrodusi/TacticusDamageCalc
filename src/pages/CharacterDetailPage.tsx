import { useState, useCallback, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Plus, Check, User } from 'lucide-react';
import { useCharacter } from '../hooks/useCharacters';
import { CharacterStats, DEFAULT_PROGRESSION_STEP, DEFAULT_RANK, AbilitySection, EquipmentSection } from '../components/character';
import { LoadingSpinner } from '../components/ui';
import { useTeamStore } from '../stores/teamStore';
import { getDefaultEquipment, calculateEquipmentStats } from '../services/dataService';
import type { EquippedItem, ItemStats } from '../types';

export function CharacterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: character, isLoading, error } = useCharacter(id || '');
  const { addCharacter, updateCharacterProgression, updateCharacterAbilityLevels, updateCharacterEquipment, team, canAddCharacter } = useTeamStore();

  // Get navigation state for return path
  const locationState = location.state as { addToTeam?: boolean; returnTo?: string } | null;
  const returnTo = locationState?.returnTo || '/calculator';

  // Find if character is already in team (use id from params for initial state)
  const existingTeamMember = team.find((c) => c.id === id);

  const [selectedProgressionStep, setSelectedProgressionStep] = useState(
    () => existingTeamMember?.progressionStepIndex ?? DEFAULT_PROGRESSION_STEP
  );
  const [selectedRank, setSelectedRank] = useState(
    () => existingTeamMember?.rank ?? DEFAULT_RANK
  );
  const [abilityLevels, setAbilityLevels] = useState<Record<string, number>>(
    () => existingTeamMember?.abilityLevels ?? {}
  );
  const [equipment, setEquipment] = useState<Record<number, EquippedItem>>(
    () => existingTeamMember?.equipment ?? {}
  );

  // Re-check team membership with loaded character
  const teamMember = team.find((c) => c.id === character?.id);
  const isInTeam = !!teamMember;

  // Calculate default equipment for this character
  const defaultEquipment = useMemo(() => {
    if (!character) return {};
    return getDefaultEquipment(character.id, character.faction, character.itemSlots);
  }, [character]);

  // Initialize equipment with defaults when character loads and not in team
  useEffect(() => {
    if (character && !existingTeamMember && Object.keys(equipment).length === 0) {
      setEquipment(defaultEquipment);
    }
  }, [character, existingTeamMember, defaultEquipment, equipment]);

  const handleProgressionChange = (progressionStepIndex: number, rank: number) => {
    setSelectedProgressionStep(progressionStepIndex);
    setSelectedRank(rank);
  };

  const handleAbilityLevelsChange = useCallback((levels: Record<string, number>) => {
    setAbilityLevels(levels);
  }, []);

  const handleEquipmentChange = useCallback((newEquipment: Record<number, EquippedItem>) => {
    setEquipment(newEquipment);
  }, []);

  const handleAddToTeam = () => {
    if (!character) return;

    if (canAddCharacter()) {
      addCharacter(character, selectedProgressionStep, selectedRank, abilityLevels, equipment);
      navigate(returnTo);
    }
  };

  const handleUpdateTeam = () => {
    if (character && isInTeam) {
      updateCharacterProgression(character.id, selectedProgressionStep, selectedRank);
      updateCharacterAbilityLevels(character.id, abilityLevels);
      updateCharacterEquipment(character.id, equipment);
      navigate(returnTo);
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <p className="text-red-500 text-lg mb-4">Failed to load character</p>
        <p className="text-gray-400">{error.message}</p>
        <Link to="/characters" className="mt-4 btn-secondary">
          Back to Characters
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-gray-400">Loading character data...</p>
      </div>
    );
  }

  if (!character) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <p className="text-gray-400 text-lg mb-4">Character not found</p>
        <Link to="/characters" className="btn-secondary">
          Back to Characters
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Navigation */}
      <Link
        to="/characters"
        className="inline-flex items-center gap-2 text-gray-400 hover:text-imperial-gold transition-colors"
      >
        <ArrowLeft size={20} />
        Back to Characters
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start gap-6">
        {/* Character Image */}
        <div className="w-32 h-32 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center overflow-hidden flex-shrink-0">
          {character.iconUrl ? (
            <img
              src={character.iconUrl}
              alt={character.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <User size={64} className="text-gray-600" />
          )}
        </div>

        {/* Name and Actions */}
        <div className="flex-1">
          <h1 className="text-3xl font-display font-bold text-imperial-gold mb-4">
            {character.name}
          </h1>

          {isInTeam ? (
            <button
              onClick={handleUpdateTeam}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-colors btn-primary"
            >
              <Check size={20} />
              Update Team
            </button>
          ) : (
            <button
              onClick={handleAddToTeam}
              disabled={!canAddCharacter()}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-colors ${
                canAddCharacter()
                  ? 'btn-primary'
                  : 'bg-gray-700 text-gray-400 cursor-not-allowed'
              }`}
            >
              <Plus size={20} />
              {canAddCharacter() ? 'Add to Team' : 'Team Full (5/5)'}
            </button>
          )}
        </div>
      </div>

      {/* Stats Section */}
      <div className="card p-6">
        <CharacterStats
          character={character}
          progressionStepIndex={selectedProgressionStep}
          rank={selectedRank}
          onProgressionChange={handleProgressionChange}
        />

        {/* Equipment Stats Summary */}
        <EquipmentStatsSummary equipment={equipment} />
      </div>

      {/* Abilities Section */}
      <AbilitySection
        character={character}
        initialAbilityLevels={abilityLevels}
        onAbilityLevelsChange={handleAbilityLevelsChange}
        progressionStepIndex={selectedProgressionStep}
      />

      {/* Equipment Section */}
      <EquipmentSection
        character={character}
        initialEquipment={equipment}
        onEquipmentChange={handleEquipmentChange}
      />
    </div>
  );
}

// Stat display config
const statConfig: Record<keyof ItemStats, { name: string; isPercent: boolean }> = {
  critChance: { name: 'Crit Chance', isPercent: true },
  critDmg: { name: 'Crit Damage', isPercent: false },
  critChanceBonus: { name: 'Crit Chance Bonus', isPercent: true },
  critDmgBonus: { name: 'Crit Damage Bonus', isPercent: false },
  hp: { name: 'HP', isPercent: false },
  fixedArmor: { name: 'Armor', isPercent: false },
  blockChance: { name: 'Block Chance', isPercent: true },
  blockDmg: { name: 'Block Damage', isPercent: false },
  blockChanceBonus: { name: 'Block Chance Bonus', isPercent: true },
  blockDmgBonus: { name: 'Block Damage Bonus', isPercent: false },
};

function EquipmentStatsSummary({ equipment }: { equipment: Record<number, EquippedItem> }) {
  const stats = useMemo(() => calculateEquipmentStats(equipment), [equipment]);

  const activeStats = Object.entries(stats).filter(([, value]) => value !== undefined && value !== 0);

  if (activeStats.length === 0) return null;

  return (
    <div className="mt-6 pt-6 border-t border-gray-700">
      <h3 className="text-lg font-semibold text-imperial-gold mb-3">Equipment Bonuses</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {activeStats.map(([key, value]) => {
          const config = statConfig[key as keyof ItemStats];
          return (
            <div key={key} className="flex items-center justify-between bg-gray-800/50 rounded-lg px-3 py-2">
              <span className="text-gray-400">{config.name}</span>
              <span className="text-green-400 font-semibold">
                +{config.isPercent ? `${value}%` : value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
