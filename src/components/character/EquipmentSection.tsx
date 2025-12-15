import { useState, useMemo, useCallback, useEffect } from 'react';
import { Package, ChevronDown } from 'lucide-react';
import type { Character, EquippedItem, ItemSlotType, ItemStats } from '../../types';
import {
  getItemsForSlot,
  getItem,
  getSlotTypeDisplayName,
  getItemStats,
} from '../../services/dataService';

interface EquipmentSectionProps {
  character: Character;
  initialEquipment?: Record<number, EquippedItem>;
  onEquipmentChange?: (equipment: Record<number, EquippedItem>) => void;
}

interface EquipmentSlotProps {
  slotIndex: number;
  slotType: ItemSlotType;
  faction: string;
  characterId: string;
  equipped?: EquippedItem;
  onEquipItem: (slotIndex: number, equipped: EquippedItem | undefined) => void;
}

// Rarity colors for item display
const rarityColors: Record<string, string> = {
  'Common': 'text-gray-400',
  'Uncommon': 'text-green-400',
  'Rare': 'text-blue-400',
  'Epic': 'text-purple-400',
  'Legendary': 'text-yellow-400',
  'Mythic': 'text-red-300',
};

const rarityBgColors: Record<string, string> = {
  'Common': 'bg-gray-700/50',
  'Uncommon': 'bg-green-900/30',
  'Rare': 'bg-blue-900/30',
  'Epic': 'bg-purple-900/30',
  'Legendary': 'bg-yellow-900/30',
  'Mythic': 'bg-red-900/30',
};

function EquipmentSlot({ slotIndex, slotType, faction, characterId, equipped, onEquipItem }: EquipmentSlotProps) {
  const [isOpen, setIsOpen] = useState(false);

  const availableItems = useMemo(
    () => getItemsForSlot(slotType, faction, characterId),
    [slotType, faction, characterId]
  );

  const equippedItem = equipped ? getItem(equipped.itemId) : null;
  const slotName = getSlotTypeDisplayName(slotType);

  // Get current item stats
  const itemStats = useMemo(() => {
    if (!equipped) return null;
    return getItemStats(equipped.itemId, equipped.level);
  }, [equipped]);

  const handleSelectItem = (itemId: string) => {
    const item = getItem(itemId);
    if (item) {
      // Default to max level (last level in array)
      const maxLevel = item.levels.length - 1;
      onEquipItem(slotIndex, { itemId, level: maxLevel });
    }
    setIsOpen(false);
  };

  const handleClearSlot = () => {
    onEquipItem(slotIndex, undefined);
    setIsOpen(false);
  };

  const handleLevelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (equipped && equippedItem) {
      const newLevel = Math.max(0, Math.min(equippedItem.levels.length - 1, parseInt(e.target.value, 10) - 1));
      onEquipItem(slotIndex, { ...equipped, level: newLevel });
    }
  };

  // Get active stats for this item
  const activeStats = itemStats
    ? Object.entries(itemStats).filter(([, value]) => value !== undefined && value !== 0)
    : [];

  return (
    <div className="relative">
      <div className="flex items-center gap-2 mb-1">
        <Package size={14} className="text-gray-500" />
        <span className="text-xs text-gray-500">{slotName}</span>
      </div>

      {/* Dropdown Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-3 py-2 rounded-lg border text-left flex items-center justify-between transition-colors ${
          equippedItem
            ? `${rarityBgColors[equippedItem.rarity]} border-gray-600 hover:border-gray-500`
            : 'bg-gray-800 border-gray-700 hover:border-gray-600'
        }`}
      >
        <span className={equippedItem ? rarityColors[equippedItem.rarity] : 'text-gray-500'}>
          {equippedItem ? equippedItem.name : 'Empty'}
        </span>
        <ChevronDown size={16} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Level Selector (when item equipped) */}
      {equipped && equippedItem && (
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-gray-500">Lv</span>
          <input
            type="number"
            min={1}
            max={equippedItem.levels.length}
            value={equipped.level + 1}
            onChange={handleLevelChange}
            className="w-12 px-1 py-0.5 text-xs text-center bg-gray-800 border border-gray-700 rounded text-white focus:border-gray-500 focus:outline-none"
          />
          <input
            type="range"
            min={1}
            max={equippedItem.levels.length}
            value={equipped.level + 1}
            onChange={handleLevelChange}
            className="flex-1 h-1 accent-imperial-gold"
          />
        </div>
      )}

      {/* Item Stats (shown under this slot) */}
      {activeStats.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-700/50 space-y-1">
          {activeStats.map(([key, value]) => {
            const config = statConfig[key as keyof ItemStats];
            return (
              <div key={key} className="flex items-center justify-between text-xs">
                <span className="text-gray-400">{config.name}</span>
                <span className="text-green-400 font-semibold">
                  +{formatStatValue(value as number, config.isPercent)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute z-20 mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {/* Clear option */}
            <button
              onClick={handleClearSlot}
              className="w-full px-3 py-2 text-left text-gray-400 hover:bg-gray-700/50 transition-colors text-sm"
            >
              None (Empty)
            </button>

            {availableItems.map(({ id, item }) => (
              <button
                key={id}
                onClick={() => handleSelectItem(id)}
                className={`w-full px-3 py-2 text-left hover:bg-gray-700/50 transition-colors text-sm ${
                  equipped?.itemId === id ? 'bg-gray-700/70' : ''
                }`}
              >
                <span className={rarityColors[item.rarity]}>{item.name}</span>
                <span className="text-gray-500 text-xs ml-2">({item.rarity})</span>
              </button>
            ))}

            {availableItems.length === 0 && (
              <div className="px-3 py-2 text-gray-500 text-sm">
                No items available
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Format stat value for display
// Stats are stored as integers: critChance 20 = 20%, critDmg 22 = 22 flat damage
function formatStatValue(value: number, isPercent: boolean = false): string {
  if (isPercent) {
    return `${value}%`;
  }
  return value.toFixed(0);
}

// Stat display names and formatting
// critChance/blockChance are percentages (20 = 20%), critDmg/blockDmg are flat values
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

export function EquipmentSection({ character, initialEquipment, onEquipmentChange }: EquipmentSectionProps) {
  const [equipment, setEquipment] = useState<Record<number, EquippedItem>>(
    () => initialEquipment ?? {}
  );

  // Sync with initialEquipment when defaults are loaded (empty -> populated)
  useEffect(() => {
    if (initialEquipment && Object.keys(initialEquipment).length > 0) {
      setEquipment(prev => {
        // Only sync if current state is empty (defaults just loaded)
        if (Object.keys(prev).length === 0) {
          return initialEquipment;
        }
        return prev;
      });
    }
  }, [initialEquipment]);

  const handleEquipItem = useCallback((slotIndex: number, equipped: EquippedItem | undefined) => {
    setEquipment(prev => {
      const updated = { ...prev };
      if (equipped) {
        updated[slotIndex] = equipped;
      } else {
        delete updated[slotIndex];
      }
      onEquipmentChange?.(updated);
      return updated;
    });
  }, [onEquipmentChange]);

  // Don't show section if character has no item slots
  if (!character.itemSlots || character.itemSlots.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-display font-semibold text-imperial-gold">
        Equipment
      </h2>

      <div className="card p-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {character.itemSlots.map((slotType, index) => (
            <EquipmentSlot
              key={`${slotType}-${index}`}
              slotIndex={index}
              slotType={slotType}
              faction={character.faction}
              characterId={character.id}
              equipped={equipment[index]}
              onEquipItem={handleEquipItem}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
