import { useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useCharacterList } from '../hooks/useCharacters';
import { CharacterCard } from '../components/character';
import { LoadingSpinner } from '../components/ui';
import { getFactionsByAlliance, getAllianceOrder, getFactionImageUrl, getFactionDisplayName } from '../services/dataService';
import { useTeamStore } from '../stores/teamStore';

export function CharacterListPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: characters, isLoading, error } = useCharacterList();
  const [searchQuery, setSearchQuery] = useState('');
  const factionsByAlliance = getFactionsByAlliance();
  const allianceOrder = getAllianceOrder();
  const { team } = useTeamStore();

  // Check if we're in "add to team" mode and get return path
  const locationState = location.state as { addToTeam?: boolean; returnTo?: string } | null;
  const addToTeamMode = locationState?.addToTeam === true;
  const returnTo = locationState?.returnTo || '/calculator';

  const handleCharacterClick = (characterId: string) => {
    if (addToTeamMode) {
      // Check if already in team
      if (team.some(c => c.id === characterId)) return;

      // Navigate to detail page to configure the character before adding
      navigate(`/characters/${encodeURIComponent(characterId)}`, {
        state: { addToTeam: true, returnTo }
      });
    }
  };

  const filteredCharacters = useMemo(() => {
    if (!characters) return [];
    if (!searchQuery.trim()) return characters;

    const query = searchQuery.toLowerCase();
    return characters.filter((char) => char.name.toLowerCase().includes(query));
  }, [characters, searchQuery]);

  // Group characters by faction
  const charactersByFaction = useMemo(() => {
    const grouped: Record<string, typeof filteredCharacters> = {};
    for (const alliance of allianceOrder) {
      for (const faction of factionsByAlliance[alliance]) {
        grouped[faction] = filteredCharacters.filter(char => char.faction === faction);
      }
    }
    return grouped;
  }, [filteredCharacters, factionsByAlliance, allianceOrder]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <p className="text-red-500 text-lg mb-4">Failed to load characters</p>
        <p className="text-gray-400">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-imperial-gold mb-2">
          {addToTeamMode ? 'Select a Character' : 'Characters'}
        </h1>
        <p className="text-gray-400">
          {addToTeamMode
            ? 'Click on a character to add them to your team'
            : 'Browse all Tacticus characters and their stats'}
        </p>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search
          size={20}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
        />
        <input
          type="text"
          placeholder="Search characters..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-imperial-gold transition-colors"
        />
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-12">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-400">Loading characters from Wiki...</p>
        </div>
      )}

      {/* Characters by Alliance and Faction */}
      {!isLoading && filteredCharacters.length > 0 && (
        <div className="space-y-12">
          {allianceOrder.map((alliance) => {
            const allianceFactions = factionsByAlliance[alliance];
            const allianceHasCharacters = allianceFactions.some(
              faction => charactersByFaction[faction]?.length > 0
            );
            if (!allianceHasCharacters) return null;

            return (
              <div key={alliance}>
                {/* Alliance Header */}
                <h2 className="text-2xl font-display font-bold text-gray-100 mb-6 pb-2 border-b border-gray-700">
                  {alliance}
                </h2>

                {/* Factions within Alliance */}
                <div className="space-y-8">
                  {allianceFactions.map((faction) => {
                    const factionCharacters = charactersByFaction[faction];
                    if (!factionCharacters || factionCharacters.length === 0) return null;

                    return (
                      <div key={faction}>
                        {/* Faction Header */}
                        <div className="flex items-center gap-3 mb-4">
                          {getFactionImageUrl(getFactionDisplayName(faction)) && (
                            <img
                              src={getFactionImageUrl(getFactionDisplayName(faction))}
                              alt={getFactionDisplayName(faction)}
                              className="w-8 h-8 object-contain"
                            />
                          )}
                          <h3 className="text-lg font-display font-semibold text-imperial-gold">
                            {getFactionDisplayName(faction)}
                          </h3>
                          <span className="text-sm text-gray-500">({factionCharacters.length})</span>
                        </div>

                        {/* Faction Characters Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                          {factionCharacters.map((character) => (
                            <CharacterCard
                              key={character.id}
                              character={character}
                              onClick={addToTeamMode ? handleCharacterClick : undefined}
                              isInTeam={addToTeamMode ? team.some(c => c.id === character.id) : undefined}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* No Results */}
      {!isLoading && characters && filteredCharacters.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-400">No characters found matching "{searchQuery}"</p>
        </div>
      )}

      {/* Results Count */}
      {!isLoading && characters && (
        <p className="text-sm text-gray-500 text-center">
          Showing {filteredCharacters.length} of {characters.length} characters
        </p>
      )}
    </div>
  );
}
