import type { BoardData, BoardBossMapping, HexCellData } from '../../types/boardData';
import type { MapMetadata, HexCoord } from '../../types/strategium';

// Static imports of board JSON files
import GB_01 from '../../assets/data/boards/GB_01.json';
import GB_02 from '../../assets/data/boards/GB_02.json';
import GB_Screamer_01 from '../../assets/data/boards/GB_Screamer_01.json';
import GB_Dakka_04 from '../../assets/data/boards/GB_Dakka_04.json';
import GB_Khaine_02 from '../../assets/data/boards/GB_Khaine_02.json';
import GB_Belisarius_03 from '../../assets/data/boards/GB_Belisarius_03.json';
import GB_Riptide_01 from '../../assets/data/boards/GB_Riptide_01.json';
import GB_SK_02 from '../../assets/data/boards/GB_SK_02.json';
import GB_Mortarion_04 from '../../assets/data/boards/GB_Mortarion_04.json';

// Board data registry
const BOARDS: Record<string, BoardData> = {
  GB_01: GB_01 as unknown as BoardData,
  GB_02: GB_02 as unknown as BoardData,
  GB_Screamer_01: GB_Screamer_01 as unknown as BoardData,
  GB_Dakka_04: GB_Dakka_04 as unknown as BoardData,
  GB_Khaine_02: GB_Khaine_02 as unknown as BoardData,
  GB_Belisarius_03: GB_Belisarius_03 as unknown as BoardData,
  GB_Riptide_01: GB_Riptide_01 as unknown as BoardData,
  GB_SK_02: GB_SK_02 as unknown as BoardData,
  GB_Mortarion_04: GB_Mortarion_04 as unknown as BoardData,
};

// Board-to-boss mapping configuration
const BOARD_BOSS_MAPPINGS: BoardBossMapping[] = [
  {
    boardId: 'GB_01',
    bossIds: [
      'GuildBoss1Boss1TyranTervigonLeviathan',
      'GuildBoss1Boss2TyranTervigonKronos',
      'GuildBoss1Boss3TyranTervigonGorgon',
    ],
    displayName: 'Tervigon (Game Data)',
    bossSize: 3,
    imageFile: 'GB_01_Visual.webp',
  },
  {
    boardId: 'GB_02',
    bossIds: [
      'GuildBoss2Boss1TyranHiveTyrantLeviathan',
      'GuildBoss2Boss2TyranHiveTyrantKronos',
      'GuildBoss2Boss3TyranHiveTyrantGorgon',
    ],
    displayName: 'Hive Tyrant (Game Data)',
    bossSize: 3,
    imageFile: 'GB_02_Visual.webp',
  },
  {
    boardId: 'GB_Screamer_01',
    bossIds: ['GuildBoss6Boss1TyranScreamerKiller'],
    displayName: 'Screamer-Killer (Game Data)',
    bossSize: 3,
    imageFile: 'GB_Screamer_01_Visual.webp',
  },
  {
    boardId: 'GB_Dakka_04',
    bossIds: ['GuildBoss4Boss1OrksGhazghkull'],
    displayName: 'Ghazghkull (Game Data)',
    bossSize: 3,
    imageFile: 'GB_Dakka_04_Visual.webp',
  },
  {
    boardId: 'GB_Khaine_02',
    bossIds: ['GuildBoss8Boss1EldarAvatar'],
    displayName: 'Avatar of Khaine (Game Data)',
    bossSize: 7,
    imageFile: 'GB_Khaine_02_Visual.webp',
  },
  {
    boardId: 'GB_Belisarius_03',
    bossIds: ['GuildBoss10Boss1AdmecBelisarius'],
    displayName: 'Belisarius Cawl (Game Data)',
    bossSize: 3,
    imageFile: 'GB_Belisarius_03_Visual.webp',
  },
  {
    boardId: 'GB_Riptide_01',
    bossIds: ['GuildBoss11Boss1TauRiptide'],
    displayName: 'Riptide (Game Data)',
    bossSize: 7,
    imageFile: 'GB_Riptide_01_Visual.webp',
  },
  {
    boardId: 'GB_SK_02',
    bossIds: ['GuildBoss3Boss1NecroSilentKing'],
    displayName: 'Szarekh (Game Data)',
    bossSize: 1,
    imageFile: 'GB_SK_02_Visual.webp',
  },
  {
    boardId: 'GB_Mortarion_04',
    bossIds: ['GuildBoss5Boss1DeathMortarion'],
    displayName: 'Mortarion (Game Data)',
    bossSize: 7,
    imageFile: 'GB_Mortarion_04_Visual.webp',
  },
];

// All images are 1024x1024
const IMAGE_SIZE = 1024;

// ─── Coordinate system ───────────────────────────────────────────────
//
// TacticusDB board data uses OFFSET coordinates where:
//   - Column = visual column (0 = leftmost playable)
//   - Row 0  = bottom of the board (player deployment side)
//   - Row 9  = top of the board (boss side)
//   - Odd columns are shifted DOWN by half a row
//
// Our hex renderer (hexToPixel) uses AXIAL coordinates where:
//   - q = column, r = axial row
//   - Row 0 is at originY, higher rows go DOWN (increasing SVG y)
//   - Odd columns naturally shift down via the (r + q/2) term
//
// To reconcile, we:
//   1. Flip rows:    flippedRow = (boardHeight - 1) - tdbRow
//   2. Offset→Axial: q = col, r = flippedRow - floor(col / 2)
//
// This maps TDB row 0 (bottom) → high axial r (bottom of SVG)
// and TDB row 9 (top) → low axial r (top of SVG)
// ─────────────────────────────────────────────────────────────────────

// Grid constants at 1024px image scale, measured from TacticusDB rendering.
// These are the precise pixel positions where hexes appear on the 1024x1024 images.
const HEX_SIZE = 46.25;           // colSpacing / 1.5
const VERTICAL_SCALE = 0.885;     // rowSpacing / (hexSize * sqrt(3))
const LEVEL_Y_OFFSET = 11.0;      // vertical pixels per elevation level
const ORIGIN_X = 301.24;          // x-center of hex at (col=0)
const BASE_Y_ELEV0 = 849.0;       // y-center of hex at (col=0, row=0, elev=0) in TDB offset coords
// originY (for our axial system) = BASE_Y_ELEV0 - rowSpacing * (boardHeight - 1)
// where rowSpacing = HEX_SIZE * sqrt(3) * VERTICAL_SCALE

/**
 * Convert TacticusDB offset coordinate (col, row) to our axial coordinate
 * with rows flipped so that TDB row 0 (bottom) maps to high r values.
 */
function tdbToAxial(col: number, row: number, boardHeight: number): HexCoord {
  const flippedRow = (boardHeight - 1) - row;
  return { q: col, r: flippedRow - Math.floor(col / 2) };
}

/**
 * Derive hexGrid configuration from board data.
 */
function deriveHexGridConfig(board: BoardData) {
  const rowSpacing = HEX_SIZE * Math.sqrt(3) * VERTICAL_SCALE;
  const originY = BASE_Y_ELEV0 - rowSpacing * (board.Height - 1);

  return {
    originX: ORIGIN_X,
    originY,
    hexSize: HEX_SIZE,
    verticalScale: VERTICAL_SCALE,
    rotation: 0,
    rows: board.Height,
    cols: board.Width,
    levelYOffset: LEVEL_Y_OFFSET,
    hexMargin: 1.0,
  };
}

/**
 * Determine boss start rotation from platform tiles in axial coordinates.
 * For size-3 bosses, finds which neighbor direction the other tiles are in.
 */
function deriveBossRotation(
  centerHex: HexCoord,
  otherHexes: HexCoord[],
  bossSize: number
): number {
  if (bossSize !== 3 || otherHexes.length < 2) return 0;

  // Flat-top axial neighbor directions
  const directions = [
    { q: 1, r: 0 },   // 0° (right)
    { q: 1, r: -1 },  // 60° (upper-right)
    { q: 0, r: -1 },  // 120° (upper-left)
    { q: -1, r: 0 },  // 180° (left)
    { q: -1, r: 1 },  // 240° (lower-left)
    { q: 0, r: 1 },   // 300° (lower-right)
  ];

  for (let i = 0; i < directions.length; i++) {
    const nq = centerHex.q + directions[i].q;
    const nr = centerHex.r + directions[i].r;
    if (otherHexes.some((h) => h.q === nq && h.r === nr)) {
      return i * 60;
    }
  }

  return 0;
}

/**
 * Build per-hex cell data from board data.
 * All keys are in axial coordinates (row-flipped + offset→axial converted).
 */
function buildCellData(board: BoardData): Map<string, HexCellData> {
  const cellData = new Map<string, HexCellData>();

  // Process all tiles
  board.Tiles.forEach((col, colIdx) => {
    col.Tile.forEach((tile, rowIdx) => {
      const { q, r } = tdbToAxial(colIdx, rowIdx, board.Height);
      const key = `${q},${r}`;
      const isBlock = tile.TileId === 'Block';
      const isUnplayable = tile.ForceUnplayable === 1;

      cellData.set(key, {
        terrain: tile.TileId,
        elevation: tile.Elevation,
        isPlayable: !isBlock && !isUnplayable,
      });
    });
  });

  // Mark player spawn positions (first spawn set)
  if (board.SpawnPointSets.length > 0) {
    const spawnGroup = board.SpawnPointSets[0].SpawnPointGroups[0];
    if (spawnGroup) {
      spawnGroup.SpawnPoints.forEach((sp, idx) => {
        const { q, r } = tdbToAxial(sp.Column, sp.Row, board.Height);
        const key = `${q},${r}`;
        const cell = cellData.get(key);
        if (cell) {
          cell.spawnRole = 'player';
          cell.spawnIndex = idx + 1;
        }
      });
    }
  }

  // Mark boss platform hexes
  for (const platform of board.BossPlatforms) {
    for (const tile of platform.Tiles) {
      const { q, r } = tdbToAxial(tile.Column, tile.Row, board.Height);
      const key = `${q},${r}`;
      const cell = cellData.get(key);
      if (cell) {
        cell.spawnRole = 'boss';
      }
    }
  }

  return cellData;
}

/**
 * Convert board data to MapMetadata format compatible with the existing system.
 */
function boardToMapMetadata(
  board: BoardData,
  mapping: BoardBossMapping
): MapMetadata {
  const hexGrid = deriveHexGridConfig(board);

  // Build hexLevels in axial coordinates
  const hexLevels: Record<string, number> = {};
  board.Tiles.forEach((col, colIdx) => {
    col.Tile.forEach((tile, rowIdx) => {
      if (tile.Elevation > 0) {
        const { q, r } = tdbToAxial(colIdx, rowIdx, board.Height);
        hexLevels[`${q},${r}`] = tile.Elevation;
      }
    });
  });

  // Derive boss start position from first platform (in axial coords)
  let bossStartPosition: HexCoord = { q: 3, r: 1 }; // default
  let bossStartRotation = 0;
  if (board.BossPlatforms.length > 0) {
    const platform = board.BossPlatforms[0];
    const centerTile = platform.Tiles[platform.InitialSpawnPosition] || platform.Tiles[0];
    bossStartPosition = tdbToAxial(centerTile.Column, centerTile.Row, board.Height);

    // Convert all platform tiles to axial for rotation derivation
    const allAxialTiles = platform.Tiles.map((t) =>
      tdbToAxial(t.Column, t.Row, board.Height)
    );
    const otherTiles = allAxialTiles.filter(
      (h) => h.q !== bossStartPosition.q || h.r !== bossStartPosition.r
    );
    bossStartRotation = deriveBossRotation(bossStartPosition, otherTiles, platform.Size);
  }

  return {
    mapId: `${mapping.boardId}_data`,
    imageFile: mapping.imageFile,
    bossIds: mapping.bossIds,
    displayName: mapping.displayName,
    imageWidth: IMAGE_SIZE,
    imageHeight: IMAGE_SIZE,
    hexGrid,
    bossStartPosition,
    bossStartRotation,
    bossSize: mapping.bossSize,
    hexLevels,
    isDataDriven: true,
  };
}

// Lazy-initialized caches
let _dataDrivenMaps: MapMetadata[] | null = null;
let _cellDataCache: Map<string, Map<string, HexCellData>> | null = null;

/**
 * Get all data-driven maps converted to MapMetadata format.
 */
export function getDataDrivenMaps(): MapMetadata[] {
  if (!_dataDrivenMaps) {
    _dataDrivenMaps = BOARD_BOSS_MAPPINGS.map((mapping) => {
      const board = BOARDS[mapping.boardId];
      return boardToMapMetadata(board, mapping);
    });
  }
  return _dataDrivenMaps;
}

/**
 * Get MapMetadata for a specific data-driven map by mapId.
 */
export function getDataDrivenMapMetadata(mapId: string): MapMetadata | null {
  return getDataDrivenMaps().find((m) => m.mapId === mapId) ?? null;
}

/**
 * Get per-hex cell data for a data-driven map.
 */
export function getDataDrivenCellData(
  mapId: string
): Map<string, HexCellData> | null {
  if (!_cellDataCache) {
    _cellDataCache = new Map();
    for (const mapping of BOARD_BOSS_MAPPINGS) {
      const board = BOARDS[mapping.boardId];
      _cellDataCache.set(`${mapping.boardId}_data`, buildCellData(board));
    }
  }
  return _cellDataCache.get(mapId) ?? null;
}

/**
 * Check if a mapId corresponds to a data-driven map.
 */
export function isDataDrivenMap(mapId: string): boolean {
  return mapId.endsWith('_data') && !!getDataDrivenMapMetadata(mapId);
}
