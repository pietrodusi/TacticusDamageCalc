import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, Map, Settings, GripVertical, X, RotateCcw, LogOut } from 'lucide-react';
import { useStrategiumStore } from '../stores/strategiumStore';
import { useTeamStore } from '../stores/teamStore';
import { TeamSlot, BossSelector, MachineOfWarSelector } from '../components/battle';
import { MapSelector, HexGrid, CalibrationPanel } from '../components/strategium';
import type { GridOverrides } from '../components/strategium';
import type { BossRank, MachineOfWarStars } from '../types';
import type { HexCoord } from '../types/strategium';
import { getMapWithImage } from '../services/strategium/mapMetadata';
import { isDataDrivenMap, getDataDrivenCellData } from '../services/strategium/boardDataService';

export function StrategiumPage() {
  // Team, boss, and machine of war from teamStore (shared with Calculator)
  const {
    team,
    removeCharacter,
    clearTeam,
    selectedBoss,
    setSelectedBoss,
    updateBossRank,
    clearBoss,
    selectedMachineOfWar,
    setSelectedMachineOfWar,
    updateMachineOfWarStars,
    clearMachineOfWar,
  } = useTeamStore();

  // Strategium-specific state
  const {
    selectedMapId,
    setSelectedMap,
    clearSelectedMap,
    isPlanning,
    startPlanning,
    exitPlanning,
    currentTurn,
    setCurrentTurn,
    nextTurn,
    prevTurn,
    characterPlacements,
    bossPlacement,
    summonPlacements,
    placeCharacter,
    moveCharacter,
    removeCharacterFromGrid,
    moveBoss,
    rotateBoss,
    selectToken,
    clearSelection,
    selectedTokenId,
    selectedTokenType,
    resetAllPlacements,
  } = useStrategiumStore();

  // Calibration state
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [gridOverrides, setGridOverrides] = useState<GridOverrides | null>(null);
  const [gridOpacity, setGridOpacity] = useState(0);
  const [selectedCalibrationHexes, setSelectedCalibrationHexes] = useState<HexCoord[]>([]);

  // Get map data for calibration
  const mapData = selectedMapId ? getMapWithImage(selectedMapId) : null;

  // Get cell data for data-driven maps (terrain, spawns)
  const cellData = useMemo(() => {
    if (!selectedMapId || !isDataDrivenMap(selectedMapId)) return undefined;
    return getDataDrivenCellData(selectedMapId) ?? undefined;
  }, [selectedMapId]);

  const handleStartCalibration = () => {
    if (mapData) {
      setGridOverrides({
        originX: mapData.hexGrid.originX,
        originY: mapData.hexGrid.originY,
        hexSize: mapData.hexGrid.hexSize,
        verticalScale: mapData.hexGrid.verticalScale ?? 0.55,
        rows: mapData.hexGrid.rows,
        cols: mapData.hexGrid.cols,
        levelYOffset: mapData.hexGrid.levelYOffset ?? 0,
        hexLevels: mapData.hexLevels ?? {},
        hexMargin: mapData.hexGrid.hexMargin ?? 1,
      });
      setIsCalibrating(true);
    }
  };

  const handleStopCalibration = () => {
    setIsCalibrating(false);
    setGridOverrides(null);
    setGridOpacity(0.4);
    setSelectedCalibrationHexes([]);
  };

  // Handle calibration hex selection with multi-select support
  const handleCalibrationHexSelect = (hex: HexCoord, isMultiSelect: boolean) => {
    if (isMultiSelect) {
      // Toggle hex in selection
      const exists = selectedCalibrationHexes.some(h => h.q === hex.q && h.r === hex.r);
      if (exists) {
        setSelectedCalibrationHexes(prev => prev.filter(h => h.q !== hex.q || h.r !== hex.r));
      } else {
        setSelectedCalibrationHexes(prev => [...prev, hex]);
      }
    } else {
      // Replace selection with single hex
      setSelectedCalibrationHexes([hex]);
    }
  };

  const canStartPlanning = team.length > 0 && selectedBoss && selectedMapId;

  const handleStartPlanning = () => {
    if (canStartPlanning) {
      startPlanning();
    }
  };

  const handleBossSelect = (bossId: string, rank?: BossRank) => {
    setSelectedBoss(bossId, rank ?? 13);
    // Clear map selection when boss changes
    clearSelectedMap();
  };

  const handleBossRankUpdate = (rank: BossRank) => {
    updateBossRank(rank);
  };

  const handleMachineSelect = (machineId: string, stars?: MachineOfWarStars) => {
    setSelectedMachineOfWar(machineId, stars ?? 14);
  };

  const handleMachineStarsUpdate = (stars: MachineOfWarStars) => {
    updateMachineOfWarStars(stars);
  };

  // Planning mode
  if (isPlanning) {
    return (
      <div className="md:h-[calc(100vh-120px)] flex flex-col">
        {/* Header - responsive stacking */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-4 mb-2 md:mb-4">
          <div className="flex items-center justify-between md:block">
            <h1 className="text-xl md:text-2xl font-display font-bold text-imperial-gold">
              Battle Plan
            </h1>
            <p className="text-gray-400 text-sm">
              {currentTurn === 0 ? 'Starting Positions' : `Turn ${currentTurn} of 6`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 md:gap-4">
            {/* Map name */}
            {mapData && (
              <span className="text-sm text-gray-300 font-medium hidden md:block">
                {mapData.displayName}
              </span>
            )}

            {/* Turn Navigation - larger touch targets on mobile */}
            <div className="flex items-center gap-1 md:gap-2">
              <button
                onClick={prevTurn}
                disabled={currentTurn === 0}
                className="w-9 h-9 md:w-8 md:h-8 flex items-center justify-center rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ←
              </button>
              <div className="flex gap-0.5 md:gap-1">
                {[0, 1, 2, 3, 4, 5, 6].map((turn) => (
                  <button
                    key={turn}
                    onClick={() => setCurrentTurn(turn)}
                    className={`w-8 h-8 md:w-8 md:h-8 rounded font-bold transition-colors text-sm md:text-base ${
                      turn === currentTurn
                        ? turn === 0 ? 'bg-green-600 text-white' : 'bg-imperial-gold text-black'
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                    }`}
                    title={turn === 0 ? 'Starting positions' : `Turn ${turn}`}
                  >
                    {turn === 0 ? 'S' : turn}
                  </button>
                ))}
              </div>
              <button
                onClick={nextTurn}
                disabled={currentTurn === 6}
                className="w-9 h-9 md:w-8 md:h-8 flex items-center justify-center rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                →
              </button>
            </div>

            {/* Reset button - icon only on mobile */}
            <button
              onClick={resetAllPlacements}
              className="btn-secondary text-sm flex items-center gap-1 px-2 md:px-3"
              title="Reset Positions"
            >
              <RotateCcw size={16} />
              <span className="hidden md:inline">Reset</span>
            </button>

            {/* Exit button - returns to map selection */}
            <button
              onClick={exitPlanning}
              className="btn-secondary text-sm flex items-center gap-1 px-2 md:px-3"
              title="Exit to Map Selection"
            >
              <LogOut size={16} />
              <span className="hidden md:inline">Exit</span>
            </button>

            {/* Calibrate button - hidden on mobile */}
            <button
              onClick={isCalibrating ? handleStopCalibration : handleStartCalibration}
              className={`hidden md:flex items-center gap-1 text-sm px-3 ${
                isCalibrating ? 'btn-primary' : 'btn-secondary'
              }`}
              title={isCalibrating ? 'Stop Calibrating' : 'Calibrate Grid'}
            >
              <Settings size={16} />
              <span>{isCalibrating ? 'Stop' : 'Calibrate'}</span>
            </button>

          </div>
        </div>

        {/* Main Planning Area - stack on mobile, side-by-side on desktop */}
        <div className="flex flex-col md:flex-row md:flex-1 gap-2 md:gap-4 md:min-h-0">
          {/* Character Sidebar - horizontal scroll on mobile, vertical on desktop */}
          <div className="w-full md:w-48 flex-shrink-0 bg-gray-800 rounded-lg p-2 md:p-3 overflow-x-auto md:overflow-y-auto md:overflow-x-hidden">
            <h3 className="text-sm font-semibold text-gray-300 mb-2 md:mb-3 hidden md:block">Characters</h3>
            <div className="flex flex-row md:flex-col gap-2 pb-1 md:pb-0">
              {characterPlacements.map((placement) => {
                const hasPosition = placement.positions[currentTurn] !== null;
                return (
                  <div
                    key={placement.characterId}
                    className={`flex items-center gap-1 md:gap-2 p-1.5 md:p-2 rounded cursor-pointer transition-colors flex-shrink-0 md:flex-shrink ${
                      selectedTokenId === placement.characterId && selectedTokenType === 'character'
                        ? 'bg-imperial-gold/20 border-2 border-imperial-gold'
                        : hasPosition
                        ? 'bg-gray-700/80 border border-gray-600'
                        : 'bg-gray-700 hover:bg-gray-600 border-2 border-dashed border-gray-500'
                    }`}
                    onClick={() => {
                      if (selectedTokenId === placement.characterId) {
                        clearSelection();
                      } else {
                        selectToken(placement.characterId, 'character');
                      }
                    }}
                    draggable={!hasPosition}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('tokenId', placement.characterId);
                      e.dataTransfer.setData('tokenType', 'character');
                      // Auto-select when starting drag (only if not already selected)
                      if (selectedTokenId !== placement.characterId) {
                        selectToken(placement.characterId, 'character');
                      }
                    }}
                  >
                    {placement.iconUrl ? (
                      <img
                        src={placement.iconUrl}
                        alt={placement.characterName}
                        className="w-8 h-8 md:w-8 md:h-8 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 md:w-8 md:h-8 rounded-full bg-gray-600 flex items-center justify-center text-xs flex-shrink-0">
                        {placement.characterName.charAt(0)}
                      </div>
                    )}
                    <span className="text-xs md:text-sm text-gray-200 truncate flex-1 hidden md:block">
                      {placement.characterName}
                    </span>
                    {/* Remove button or drag hint - hidden on mobile for space */}
                    <div className="hidden md:block">
                      {hasPosition ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeCharacterFromGrid(placement.characterId);
                          }}
                          className="p-0.5 hover:bg-red-500/20 rounded transition-colors flex-shrink-0"
                          title="Remove from map"
                        >
                          <X size={12} className="text-gray-400 hover:text-red-400" />
                        </button>
                      ) : (
                        <GripVertical size={14} className="text-gray-400 flex-shrink-0" />
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Boss in horizontal row on mobile */}
              {bossPlacement && (
                <div
                  className={`flex md:hidden items-center gap-1 p-1.5 rounded cursor-pointer transition-colors flex-shrink-0 ${
                    selectedTokenId === bossPlacement.bossId && selectedTokenType === 'boss'
                      ? 'bg-red-500/20 border-2 border-red-500'
                      : 'bg-gray-700 hover:bg-gray-600 border border-red-900'
                  }`}
                  onClick={() => {
                    if (selectedTokenId === bossPlacement.bossId) {
                      clearSelection();
                    } else {
                      selectToken(bossPlacement.bossId, 'boss');
                    }
                  }}
                >
                  {bossPlacement.iconUrl ? (
                    <img
                      src={bossPlacement.iconUrl}
                      alt={bossPlacement.bossName}
                      className="w-8 h-8 rounded-full object-cover flex-shrink-0 ring-2 ring-red-700"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-red-900 flex items-center justify-center text-xs flex-shrink-0">
                      B
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Boss Info - shown on desktop only */}
            {bossPlacement && (
              <div className="hidden md:block">
                <h3 className="text-sm font-semibold text-gray-300 mt-4 mb-3">Boss</h3>
                <div
                  className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                    selectedTokenId === bossPlacement.bossId && selectedTokenType === 'boss'
                      ? 'bg-red-500/20 border border-red-500'
                      : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                  onClick={() => {
                    if (selectedTokenId === bossPlacement.bossId) {
                      clearSelection();
                    } else {
                      selectToken(bossPlacement.bossId, 'boss');
                    }
                  }}
                >
                  {bossPlacement.iconUrl ? (
                    <img
                      src={bossPlacement.iconUrl}
                      alt={bossPlacement.bossName}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-red-900 flex items-center justify-center text-xs">
                      B
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-gray-200 truncate block">
                      {bossPlacement.bossName}
                    </span>
                    <span className="text-xs text-gray-500">
                      {bossPlacement.size} hex{bossPlacement.size > 1 ? 'es' : ''}
                    </span>
                  </div>
                </div>
                {bossPlacement.size === 3 && selectedTokenId === bossPlacement.bossId && (
                  <button
                    onClick={rotateBoss}
                    className="mt-2 w-full btn-secondary text-xs"
                  >
                    Rotate Boss
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Map Area */}
          <div className="w-full md:flex-1 md:min-h-0 bg-gray-900 rounded-lg md:overflow-auto">
            <HexGrid
              mapId={selectedMapId!}
              currentTurn={currentTurn}
              characterPlacements={characterPlacements}
              bossPlacement={bossPlacement}
              summonPlacements={summonPlacements}
              selectedTokenId={selectedTokenId}
              selectedTokenType={selectedTokenType}
              onHexClick={(hex) => {
                if (selectedTokenId && selectedTokenType === 'character') {
                  const placement = characterPlacements.find(p => p.characterId === selectedTokenId);
                  if (placement?.positions[currentTurn]) {
                    moveCharacter(selectedTokenId, hex);
                  } else {
                    placeCharacter(selectedTokenId, hex);
                  }
                  clearSelection();
                } else if (selectedTokenId && selectedTokenType === 'boss') {
                  moveBoss(hex);
                  clearSelection();
                }
              }}
              onTokenClick={(tokenId, tokenType) => {
                if (selectedTokenId === tokenId) {
                  clearSelection();
                } else {
                  selectToken(tokenId, tokenType);
                }
              }}
              onCharacterMove={(characterId, hex) => {
                moveCharacter(characterId, hex);
                clearSelection();
              }}
              onBossMove={(hex) => {
                moveBoss(hex);
                clearSelection();
              }}
              onBossRotate={rotateBoss}
              calibrationMode={isCalibrating}
              gridOverrides={gridOverrides ?? undefined}
              gridOpacity={gridOpacity || (cellData ? 0.5 : 0)}
              cellData={cellData}
              selectedCalibrationHexes={selectedCalibrationHexes}
              onCalibrationHexSelect={handleCalibrationHexSelect}
            />
          </div>

          {/* Calibration Panel */}
          {isCalibrating && gridOverrides && mapData && (
            <CalibrationPanel
              gridOverrides={gridOverrides}
              onGridChange={setGridOverrides}
              gridOpacity={gridOpacity}
              onOpacityChange={setGridOpacity}
              onClose={handleStopCalibration}
              imageWidth={mapData.imageWidth}
              imageHeight={mapData.imageHeight}
              selectedHexes={selectedCalibrationHexes}
            />
          )}
        </div>
      </div>
    );
  }

  // Setup mode
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-imperial-gold mb-2">
          Strategium
        </h1>
        <p className="text-gray-400">
          Plan your character positions and movements across a 6-turn Guild Raid battle
        </p>
      </div>

      {/* Team Slots */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-100">Your Team</h2>
          {team.length > 0 && (
            <button
              onClick={clearTeam}
              className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors"
            >
              <Trash2 size={16} />
              Clear All
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }, (_, i) => (
            <TeamSlot
              key={i}
              slotIndex={i}
              character={team[i]}
              onRemove={removeCharacter}
              navigationState={{ addToTeam: true, returnTo: '/strategium' }}
            />
          ))}
        </div>

        {/* Machine of War Selector */}
        <div className="mt-6">
          <MachineOfWarSelector
            selectedMachineId={selectedMachineOfWar?.machineId ?? null}
            selectedStars={(selectedMachineOfWar?.stars ?? 14) as MachineOfWarStars}
            onSelectMachine={handleMachineSelect}
            onUpdateStars={handleMachineStarsUpdate}
            onClearMachine={clearMachineOfWar}
          />
        </div>

        {/* Boss Selector */}
        <div className="mt-4">
          <BossSelector
            selectedBossId={selectedBoss?.bossId ?? null}
            selectedRank={selectedBoss?.rank ?? (13 as BossRank)}
            applyModifiers={selectedBoss?.applyModifiers ?? true}
            onSelectBoss={handleBossSelect}
            onUpdateRank={handleBossRankUpdate}
            onToggleModifiers={() => {}}
            onClearBoss={() => { clearBoss(); clearSelectedMap(); }}
          />
        </div>

        {/* Map Selector */}
        {selectedBoss && (
          <div className="mt-4">
            <MapSelector
              bossId={selectedBoss.bossId}
              selectedMapId={selectedMapId}
              onSelectMap={setSelectedMap}
              onClearMap={clearSelectedMap}
            />
          </div>
        )}
      </div>

      {/* Start Planning Button */}
      <div className="flex justify-center">
        <button
          onClick={handleStartPlanning}
          disabled={!canStartPlanning}
          className={`flex items-center gap-2 px-8 py-4 rounded-lg font-bold text-lg transition-all ${
            canStartPlanning
              ? 'btn-primary hover:scale-105'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          <Map size={24} />
          Start Battle Plan
        </button>
      </div>

      {/* Info */}
      {!canStartPlanning && (
        <div className="text-center">
          <p className="text-gray-500 mb-2">
            {team.length === 0
              ? 'Add characters to your team'
              : !selectedBoss
              ? 'Select a boss'
              : 'Select a map to begin planning'}
          </p>
          {team.length === 0 && (
            <Link to="/characters" className="text-imperial-gold hover:underline">
              Browse characters to add to your team →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
