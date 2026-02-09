import { useState, useMemo, useEffect, useCallback, type ReactNode } from 'react';
import type { Character } from '../../types';
import {
  getAbilityInfo,
  DEFAULT_ABILITY_LEVEL,
  getAbilityDisplayLevel,
  getAbilityLevelIndex,
  ensureAbilitiesLoaded,
} from '../../services/dataService';

interface AbilitySectionProps {
  character: Character;
  initialAbilityLevels?: Record<string, number>;
  onAbilityLevelsChange?: (abilityLevels: Record<string, number>) => void;
  progressionStepIndex?: number;
}

interface AbilityCardProps {
  abilityId: string;
  type: 'active' | 'passive';
  initialLevel?: number;
  onLevelChange?: (abilityId: string, level: number) => void;
  progressionStepIndex?: number;
}

// Parse description with {{VAR:value}} and {{CONST:value}} markers into React elements
function parseDescription(description: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /\{\{(VAR|CONST):([^}]+)\}\}/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(description)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(description.slice(lastIndex, match.index));
    }

    const [, type, value] = match;
    if (type === 'VAR') {
      // Variables (level-dependent) - highlight in green
      parts.push(
        <span key={key++} className="text-green-400 font-semibold">
          {value}
        </span>
      );
    } else {
      // Constants - highlight in cyan
      parts.push(
        <span key={key++} className="text-cyan-400 font-semibold">
          {value}
        </span>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < description.length) {
    parts.push(description.slice(lastIndex));
  }

  return parts;
}

function AbilityCard({ abilityId, type, initialLevel, onLevelChange, progressionStepIndex }: AbilityCardProps) {
  const [levelIndex, setLevelIndex] = useState(initialLevel ?? DEFAULT_ABILITY_LEVEL);

  const ability = useMemo(
    () => getAbilityInfo(abilityId, levelIndex, progressionStepIndex),
    [abilityId, levelIndex, progressionStepIndex]
  );

  if (!ability) return null;

  const handleLevelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const displayLevel = parseInt(e.target.value, 10);
    const newLevelIndex = getAbilityLevelIndex(displayLevel);
    setLevelIndex(newLevelIndex);
    onLevelChange?.(abilityId, newLevelIndex);
  };

  const isActive = type === 'active';
  const bgClass = isActive ? 'bg-amber-900/20' : 'bg-blue-900/20';
  const borderClass = isActive ? 'border-amber-700/50' : 'border-blue-700/50';
  const titleClass = isActive ? 'text-amber-400' : 'text-blue-400';
  const accentClass = isActive ? 'accent-amber-500' : 'accent-blue-500';

  return (
    <div className={`rounded-lg border p-4 ${bgClass} ${borderClass}`}>
      <div className="flex items-center justify-between mb-2">
        <h4 className={`font-semibold ${titleClass}`}>{ability.name}</h4>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Lv</span>
          <input
            type="number"
            min={1}
            max={65}
            value={getAbilityDisplayLevel(levelIndex)}
            onChange={handleLevelChange}
            className="w-12 px-1 py-0.5 text-xs text-center bg-gray-800 border border-gray-700 rounded text-white focus:border-gray-500 focus:outline-none"
          />
          <input
            type="range"
            min={1}
            max={65}
            value={getAbilityDisplayLevel(levelIndex)}
            onChange={handleLevelChange}
            className={`w-20 h-1 ${accentClass}`}
          />
        </div>
      </div>
      <p className="text-sm text-gray-300 whitespace-pre-line">
        {parseDescription(ability.description)}
      </p>
    </div>
  );
}

export function AbilitySection({ character, initialAbilityLevels, onAbilityLevelsChange, progressionStepIndex }: AbilitySectionProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [abilityLevels, setAbilityLevels] = useState<Record<string, number>>(
    () => initialAbilityLevels ?? {}
  );

  useEffect(() => {
    ensureAbilitiesLoaded().then(() => setIsLoaded(true));
  }, []);

  const handleAbilityLevelChange = useCallback((abilityId: string, level: number) => {
    setAbilityLevels(prev => {
      const updated = { ...prev, [abilityId]: level };
      onAbilityLevelsChange?.(updated);
      return updated;
    });
  }, [onAbilityLevelsChange]);

  // Don't show section if character has no abilities
  const hasAbilities =
    character.activeAbilities.length > 0 || character.passiveAbilities.length > 0;
  if (!hasAbilities) {
    return null;
  }

  // Show loading while abilities data is loading
  if (!isLoaded) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-display font-semibold text-imperial-gold">
          Abilities
        </h2>
        <p className="text-gray-400">Loading abilities...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-display font-semibold text-imperial-gold">
        Abilities
      </h2>

      <div className="grid gap-4 md:grid-cols-2">
        {character.activeAbilities.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-amber-500">Active Abilities</h3>
            {character.activeAbilities.map((abilityId) => (
              <AbilityCard
                key={abilityId}
                abilityId={abilityId}
                type="active"
                initialLevel={abilityLevels[abilityId]}
                onLevelChange={handleAbilityLevelChange}
                progressionStepIndex={progressionStepIndex}
              />
            ))}
          </div>
        )}

        {character.passiveAbilities.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-blue-500">Passive Abilities</h3>
            {character.passiveAbilities.map((abilityId) => (
              <AbilityCard
                key={abilityId}
                abilityId={abilityId}
                type="passive"
                initialLevel={abilityLevels[abilityId]}
                onLevelChange={handleAbilityLevelChange}
                progressionStepIndex={progressionStepIndex}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
