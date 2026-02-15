// Types for TacticusDB board JSON data (game-extracted map definitions)

/** Terrain types from TacticusDB board data */
export type TerrainType =
  | 'Grass'
  | 'DryBush'
  | 'Swamp'
  | 'Block'
  | 'Water'
  | 'Fire'
  | 'FirstAid'
  | 'Trench';

/** Single tile definition from board JSON */
export interface BoardTile {
  TileId: TerrainType;
  Elevation: number;
  Rotation: number;
  RoomID: number;
  ForceUnplayable: number; // 0 = playable, 1 = unplayable
}

/** Column of tiles in the board grid */
export interface BoardColumn {
  Tile: BoardTile[];
}

/** Spawn point position on the board */
export interface BoardSpawnPoint {
  Column: number;
  Row: number;
  Direction: number;
  Room: number;
  SpawnPointType: number;
  Tag: string;
  SecondarySpawn: number;
}

/** Spawn point group (team of spawn points) */
export interface BoardSpawnPointGroup {
  TeamWithPlayerIndex: number;
  MachineOfWarPosition: number;
  SpawnPoints: BoardSpawnPoint[];
}

/** Set of spawn point groups */
export interface BoardSpawnPointSet {
  SpawnPointGroups: BoardSpawnPointGroup[];
  TileEffectSpawnPoints: unknown[];
  GameModeTiles: unknown[];
  OverrideDeploymentCameraZ: number;
  DeploymentCameraZ: number;
}

/** Boss platform definition (multi-hex boss area) */
export interface BoardBossPlatform {
  Size: number; // 3 or 7
  Tiles: { Column: number; Row: number }[];
  InitialSpawnPosition: number;
  Direction: number;
}

/** Full board JSON schema from TacticusDB */
export interface BoardData {
  Id: string;
  Width: number; // Number of playable columns
  Height: number; // Number of playable rows
  Tiles: BoardColumn[];
  SpawnPointSets: BoardSpawnPointSet[];
  BossPlatforms: BoardBossPlatform[];
  Doors: unknown[];
  TreasureBeachWaveHeight: number;
  fullCols: number; // Full grid columns (including non-playable)
  fullRows: number; // Full grid rows (including non-playable)
  playableColOffset: number; // Column offset to playable area
}

/** Per-hex metadata for data-driven maps */
export interface HexCellData {
  terrain: TerrainType;
  elevation: number;
  isPlayable: boolean; // false for Block tiles or ForceUnplayable=1
  spawnRole?: 'player' | 'boss';
  spawnIndex?: number; // 1-5 for player slots
}

/** Configuration mapping a board to its boss IDs */
export interface BoardBossMapping {
  boardId: string;
  bossIds: string[];
  displayName: string;
  bossSize: 1 | 3 | 7;
  imageFile: string;
}
