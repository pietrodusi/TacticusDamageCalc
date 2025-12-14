import { Heart, Sword, Shield, Move } from 'lucide-react';

interface StatBadgeProps {
  stat: 'health' | 'damage' | 'armour' | 'movement';
  value: number;
  size?: 'sm' | 'md' | 'lg';
}

const statConfig = {
  health: {
    icon: Heart,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    label: 'HP',
  },
  damage: {
    icon: Sword,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
    label: 'DMG',
  },
  armour: {
    icon: Shield,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    label: 'ARM',
  },
  movement: {
    icon: Move,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    label: 'MOV',
  },
};

export function StatBadge({ stat, value, size = 'md' }: StatBadgeProps) {
  const config = statConfig[stat];
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  const iconSizes = {
    sm: 12,
    md: 16,
    lg: 20,
  };

  return (
    <div
      className={`inline-flex items-center gap-1 rounded ${config.bgColor} ${sizeClasses[size]}`}
    >
      <Icon size={iconSizes[size]} className={config.color} />
      <span className={`font-semibold ${config.color}`}>{value}</span>
    </div>
  );
}
