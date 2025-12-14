import type { Rarity } from '../../types';

interface RarityBadgeProps {
  rarity: Rarity;
  size?: 'sm' | 'md';
}

const rarityColors: Record<Rarity, string> = {
  Common: 'bg-gray-500 text-gray-100',
  Uncommon: 'bg-green-600 text-white',
  Rare: 'bg-blue-600 text-white',
  Epic: 'bg-purple-600 text-white',
  Legendary: 'bg-amber-500 text-black',
  Mythic: 'bg-red-600 text-white',
};

export function RarityBadge({ rarity, size = 'md' }: RarityBadgeProps) {
  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
  };

  return (
    <span className={`rounded font-semibold ${rarityColors[rarity]} ${sizeClasses[size]}`}>
      {rarity}
    </span>
  );
}
