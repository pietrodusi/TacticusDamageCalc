import { Link } from 'react-router-dom';
import { User, Check } from 'lucide-react';
import type { CharacterListItem } from '../../types';

interface CharacterCardProps {
  character: CharacterListItem;
  onClick?: (characterId: string) => void;
  isInTeam?: boolean;
}

export function CharacterCard({ character, onClick, isInTeam }: CharacterCardProps) {
  const cardContent = (
    <>
      <div className="w-20 h-20 rounded-full bg-gray-700 flex items-center justify-center mb-3 overflow-hidden relative">
        {character.iconUrl ? (
          <img
            src={character.iconUrl}
            alt={character.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <User size={40} className="text-gray-500" />
        )}
        {isInTeam && (
          <div className="absolute inset-0 bg-green-900/70 flex items-center justify-center rounded-full">
            <Check size={32} className="text-green-400" />
          </div>
        )}
      </div>
      <h3 className="text-sm font-semibold text-center text-gray-100 line-clamp-2">
        {character.name}
      </h3>
    </>
  );

  // If onClick is provided, use a button instead of Link
  if (onClick) {
    return (
      <button
        onClick={() => !isInTeam && onClick(character.id)}
        disabled={isInTeam}
        className={`card p-4 flex flex-col items-center transition-transform duration-200 ${
          isInTeam ? 'opacity-60 cursor-not-allowed' : 'hover:scale-105'
        }`}
      >
        {cardContent}
      </button>
    );
  }

  return (
    <Link
      to={`/characters/${encodeURIComponent(character.id)}`}
      className="card p-4 flex flex-col items-center hover:scale-105 transition-transform duration-200"
    >
      {cardContent}
    </Link>
  );
}
