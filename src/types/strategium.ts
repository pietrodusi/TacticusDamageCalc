import type { TeamMember } from './character';
import type { BossRank } from './boss';

// Hex coordinate system (axial coordinates for flat-top hexagons)
export interface HexCoord {
  q: number; // Column
  r: number; // Row
}

// Token position on the hex grid
export interface TokenPosition {
  hexCoord: HexCoord;
  rotation?: number; // For 3-hex boss (0, 60, 120, 180, 240, 300 degrees)
}

// Character placement tracking across turns
export interface CharacterPlacement {
  characterId: string;
  characterName: string;
  iconUrl?: string;
  positions: Record<number, TokenPosition | null>; // Turn (1-6) -> position
}

// Summon placement tracking across turns
export interface SummonPlacement {
  instanceId: string; // Unique instance ID
  unitId: string; // Type from summons.json
  unitName: string;
  iconUrl?: string;
  positions: Record<number, TokenPosition | null>; // Turn (1-6) -> position
}

// Boss placement tracking across turns
export interface BossPlacement {
  bossId: string;
  bossName: string;
  iconUrl?: string;
  size: 1 | 3 | 7;
  positions: Record<number, TokenPosition>; // Turn (1-6) -> position (always has position)
}

// Hex grid configuration for a map
export interface HexGridConfig {
  originX: number; // Pixel X of hex (0,0)
  originY: number; // Pixel Y of hex (0,0)
  hexSize: number; // Hex size (center to corner for regular hex)
  verticalScale: number; // Vertical compression for isometric view (0.5-1.0, default 0.55)
  rotation: number; // Grid rotation in degrees
  rows: number; // Number of rows
  cols: number; // Number of columns
  levelYOffset?: number; // Pixels to offset per elevation level
  hexMargin?: number; // Hex size multiplier for margin (0.8-1.0, default 1.0)
}

// Map metadata for a specific boss map
export interface MapMetadata {
  mapId: string;
  imageFile: string;
  bossId?: string; // Deprecated: use bossIds instead
  bossIds?: string[]; // Array of boss IDs that can use this map
  displayName: string;
  imageWidth: number;
  imageHeight: number;
  hexGrid: HexGridConfig;
  bossStartPosition: HexCoord;
  bossStartRotation?: number; // Initial rotation for 3-hex bosses (0, 60, 120, 180, 240, 300)
  bossSize: 1 | 3 | 7;
  hexLevels?: Record<string, number>; // "q,r" -> elevation level (0 = ground)
  isDataDriven?: boolean; // True for maps generated from TacticusDB board data
}

// Map metadata collection
export interface MapMetadataCollection {
  maps: Record<string, MapMetadata>;
}

// Selected boss for Strategium (similar to teamStore)
export interface StrategiumSelectedBoss {
  bossId: string;
  rank: BossRank;
}

// Selected machine of war for Strategium
export interface StrategiumSelectedMachine {
  machineId: string;
  stars: number;
}

// Token types for selection
export type TokenType = 'character' | 'summon' | 'boss';

// Strategium store state
export interface StrategiumState {
  // Setup state
  team: TeamMember[];
  selectedBoss: StrategiumSelectedBoss | null;
  selectedMachineOfWar: StrategiumSelectedMachine | null;
  selectedMapId: string | null;

  // Planning state
  isPlanning: boolean;
  currentTurn: number; // 1-6

  // Token placements
  characterPlacements: CharacterPlacement[];
  summonPlacements: SummonPlacement[];
  bossPlacement: BossPlacement | null;

  // Selection state
  selectedTokenId: string | null;
  selectedTokenType: TokenType | null;
}

// Strategium store actions
export interface StrategiumActions {
  // Setup actions
  setTeam: (team: TeamMember[]) => void;
  addCharacter: (member: TeamMember) => void;
  removeCharacter: (characterId: string) => void;
  clearTeam: () => void;
  setSelectedBoss: (bossId: string, rank: BossRank) => void;
  clearSelectedBoss: () => void;
  setSelectedMachineOfWar: (machineId: string, stars: number) => void;
  clearSelectedMachineOfWar: () => void;
  setSelectedMap: (mapId: string) => void;
  clearSelectedMap: () => void;

  // Planning lifecycle
  startPlanning: () => void;
  exitPlanning: () => void;

  // Turn navigation
  setCurrentTurn: (turn: number) => void;
  nextTurn: () => void;
  prevTurn: () => void;

  // Character placement
  placeCharacter: (characterId: string, hex: HexCoord) => void;
  moveCharacter: (characterId: string, hex: HexCoord) => void;
  removeCharacterFromGrid: (characterId: string) => void;

  // Summon placement
  addSummon: (unitId: string, unitName: string, iconUrl?: string) => string; // Returns instanceId
  placeSummon: (instanceId: string, hex: HexCoord) => void;
  moveSummon: (instanceId: string, hex: HexCoord) => void;
  removeSummon: (instanceId: string) => void;

  // Boss actions
  moveBoss: (hex: HexCoord) => void;
  rotateBoss: () => void; // Rotates 60 degrees

  // Token selection
  selectToken: (id: string, type: TokenType) => void;
  clearSelection: () => void;

  // Utility actions
  clearTurn: (turn: number) => void;
  resetAllPlacements: () => void;
  resetAll: () => void;

  // Computed helpers
  getCharacterPositionAtTurn: (characterId: string, turn: number) => TokenPosition | null;
  getSummonPositionAtTurn: (instanceId: string, turn: number) => TokenPosition | null;
  getBossPositionAtTurn: (turn: number) => TokenPosition | null;
  isHexOccupied: (hex: HexCoord, turn: number, excludeTokenId?: string) => boolean;
  getAvailableMapsForBoss: (bossId: string) => MapMetadata[];
}

// Combined store type
export type StrategiumStore = StrategiumState & StrategiumActions;

// Movement data for visualization
export interface TokenMovement {
  tokenId: string;
  tokenType: TokenType;
  fromPosition: TokenPosition;
  toPosition: TokenPosition;
}

// Hex cell visual state
export type HexCellState =
  | 'empty'
  | 'hovered'
  | 'occupied-character'
  | 'occupied-summon'
  | 'occupied-boss'
  | 'valid-drop'
  | 'invalid-drop'
  | 'selected';

// Point for pixel coordinates
export interface Point {
  x: number;
  y: number;
}
