import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Check, User } from 'lucide-react';
import { useCharacter } from '../hooks/useCharacters';
import { CharacterStats, DEFAULT_PROGRESSION_STEP, DEFAULT_RANK } from '../components/character';
import { LoadingSpinner } from '../components/ui';
import { useTeamStore } from '../stores/teamStore';

export function CharacterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: character, isLoading, error } = useCharacter(id || '');
  const { addCharacter, updateCharacterProgression, team, canAddCharacter } = useTeamStore();

  // Find if character is already in team (use id from params for initial state)
  const existingTeamMember = team.find((c) => c.id === id);

  const [selectedProgressionStep, setSelectedProgressionStep] = useState(
    () => existingTeamMember?.progressionStepIndex ?? DEFAULT_PROGRESSION_STEP
  );
  const [selectedRank, setSelectedRank] = useState(
    () => existingTeamMember?.rank ?? DEFAULT_RANK
  );

  // Re-check team membership with loaded character
  const teamMember = team.find((c) => c.id === character?.id);
  const isInTeam = !!teamMember;

  const handleProgressionChange = (progressionStepIndex: number, rank: number) => {
    setSelectedProgressionStep(progressionStepIndex);
    setSelectedRank(rank);
  };

  const handleAddToTeam = () => {
    if (character && canAddCharacter()) {
      addCharacter(character, selectedProgressionStep, selectedRank);
      navigate('/calculator');
    }
  };

  const handleUpdateTeam = () => {
    if (character && isInTeam) {
      updateCharacterProgression(character.id, selectedProgressionStep, selectedRank);
      navigate('/calculator');
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
      </div>

      {/* Abilities Section */}
      {(character.activeAbilities.length > 0 || character.passiveAbilities.length > 0) && (
        <div>
          <h2 className="text-2xl font-display font-semibold text-imperial-gold mb-4">
            Abilities
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {character.activeAbilities.length > 0 && (
              <div className="rounded-lg border p-4 bg-amber-900/20 border-amber-700/50">
                <h3 className="text-lg font-semibold text-amber-500 mb-2">Active Abilities</h3>
                <ul className="space-y-1">
                  {character.activeAbilities.map((ability) => (
                    <li key={ability} className="text-gray-300">{ability}</li>
                  ))}
                </ul>
              </div>
            )}
            {character.passiveAbilities.length > 0 && (
              <div className="rounded-lg border p-4 bg-blue-900/20 border-blue-700/50">
                <h3 className="text-lg font-semibold text-blue-500 mb-2">Passive Abilities</h3>
                <ul className="space-y-1">
                  {character.passiveAbilities.map((ability) => (
                    <li key={ability} className="text-gray-300">{ability}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
