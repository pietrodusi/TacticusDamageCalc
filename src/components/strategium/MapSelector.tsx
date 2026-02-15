import { useState } from 'react';
import { ChevronDown, Map, X } from 'lucide-react';
import { getMapsForBossWithImages, type MapMetadataWithImage } from '../../services/strategium/mapMetadata';
import { isDataDrivenMap } from '../../services/strategium/boardDataService';

interface MapSelectorProps {
  bossId: string;
  selectedMapId: string | null;
  onSelectMap: (mapId: string) => void;
  onClearMap: () => void;
}

export function MapSelector({
  bossId,
  selectedMapId,
  onSelectMap,
  onClearMap,
}: MapSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const availableMaps = getMapsForBossWithImages(bossId);
  const selectedMap = selectedMapId
    ? availableMaps.find((m) => m.mapId === selectedMapId) || null
    : null;

  if (availableMaps.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="flex items-center gap-2 text-gray-400">
          <Map size={20} />
          <span>No maps available for this boss</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Map size={20} className="text-gray-400" />
          <span className="text-gray-300 font-medium">Battle Map</span>
        </div>

        {selectedMap ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {selectedMap.imageUrl && (
                <img
                  src={selectedMap.imageUrl}
                  alt={selectedMap.displayName}
                  className="w-12 h-12 rounded object-cover"
                />
              )}
              <div>
                <div className="text-gray-200 font-medium">{selectedMap.displayName}</div>
                <button
                  onClick={() => setIsOpen(!isOpen)}
                  className="text-sm text-imperial-gold hover:underline"
                >
                  Change
                </button>
              </div>
            </div>
            <button
              onClick={onClearMap}
              className="p-1 text-gray-400 hover:text-red-400 transition-colors"
              title="Clear map selection"
            >
              <X size={18} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
          >
            <span className="text-gray-300">Select a map...</span>
            <ChevronDown size={18} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {availableMaps.map((map) => (
            <MapCard
              key={map.mapId}
              map={map}
              isSelected={map.mapId === selectedMapId}
              onSelect={() => {
                onSelectMap(map.mapId);
                setIsOpen(false);
              }}
            />
          ))}
        </div>
      )}

    </div>
  );
}

interface MapCardProps {
  map: MapMetadataWithImage;
  isSelected: boolean;
  onSelect: () => void;
}

function MapCard({ map, isSelected, onSelect }: MapCardProps) {
  return (
    <button
      onClick={onSelect}
      className={`relative rounded-lg overflow-hidden border-2 transition-all hover:scale-105 ${
        isSelected
          ? 'border-imperial-gold'
          : 'border-gray-600 hover:border-gray-500'
      }`}
    >
      {map.imageUrl ? (
        <img
          src={map.imageUrl}
          alt={map.displayName}
          className="w-full h-auto"
        />
      ) : (
        <div className="w-full aspect-video bg-gray-700 flex items-center justify-center">
          <Map size={32} className="text-gray-500" />
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
        <div className="flex items-center gap-1">
          <span className="text-xs text-white font-medium">{map.displayName}</span>
          {isDataDrivenMap(map.mapId) && (
            <span className="text-[10px] bg-green-600 text-white px-1 rounded leading-tight">GD</span>
          )}
        </div>
      </div>
    </button>
  );
}
