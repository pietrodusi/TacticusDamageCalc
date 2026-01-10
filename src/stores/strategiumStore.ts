import { create } from 'zustand';
import type {
  HexCoord,
  TokenPosition,
  CharacterPlacement,
  SummonPlacement,
  BossPlacement,
  TokenType,
  MapMetadata,
} from '../types/strategium';
import { getMapMetadataForBoss, getMapMetadata } from '../services/strategium/mapMetadata';
import { getBossAtRank } from '../services/dataService';
import { useTeamStore } from './teamStore';

const MAX_TURNS = 6;

// Helper to generate unique IDs for summons
let summonCounter = 0;
const generateSummonId = () => `summon-${++summonCounter}`;

// Helper to check if two hex coordinates are equal
const hexEquals = (a: HexCoord, b: HexCoord): boolean => a.q === b.q && a.r === b.r;

// Helper to get hexes occupied by a boss token
const getBossOccupiedHexes = (center: HexCoord, size: 1 | 3 | 7, rotation: number = 0): HexCoord[] => {
  if (size === 1) return [center];

  const directions: HexCoord[] = [
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
    { q: 0, r: 1 },
  ];

  if (size === 7) {
    // Center + all 6 neighbors
    return [center, ...directions.map((d) => ({ q: center.q + d.q, r: center.r + d.r }))];
  }

  // size === 3: Center + 2 adjacent hexes based on rotation
  const idx = Math.floor(rotation / 60) % 6;
  return [
    center,
    { q: center.q + directions[idx].q, r: center.r + directions[idx].r },
    { q: center.q + directions[(idx + 1) % 6].q, r: center.r + directions[(idx + 1) % 6].r },
  ];
};

interface StrategiumState {
  // Setup state (team/boss/machine come from teamStore)
  selectedMapId: string | null;

  // Planning state
  isPlanning: boolean;
  currentTurn: number;

  // Token placements
  characterPlacements: CharacterPlacement[];
  summonPlacements: SummonPlacement[];
  bossPlacement: BossPlacement | null;

  // Selection state
  selectedTokenId: string | null;
  selectedTokenType: TokenType | null;
}

interface StrategiumActions {
  // Setup actions (team/boss/machine managed via teamStore)
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
  addSummon: (unitId: string, unitName: string, iconUrl?: string) => string;
  placeSummon: (instanceId: string, hex: HexCoord) => void;
  moveSummon: (instanceId: string, hex: HexCoord) => void;
  removeSummon: (instanceId: string) => void;

  // Boss actions
  moveBoss: (hex: HexCoord) => void;
  rotateBoss: () => void;

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

export const useStrategiumStore = create<StrategiumState & StrategiumActions>()((set, get) => ({
  // Initial state (team/boss/machine come from teamStore)
  selectedMapId: null,
  isPlanning: false,
  currentTurn: 0,
  characterPlacements: [],
  summonPlacements: [],
  bossPlacement: null,
  selectedTokenId: null,
  selectedTokenType: null,

  // Setup actions
  setSelectedMap: (mapId) => set({ selectedMapId: mapId }),

  clearSelectedMap: () => set({ selectedMapId: null }),

  // Planning lifecycle
  startPlanning: () => {
    const { selectedMapId } = get();
    // Get team and boss from teamStore
    const { team, selectedBoss } = useTeamStore.getState();
    if (!selectedMapId || !selectedBoss || team.length === 0) return;

    const mapMetadata = getMapMetadata(selectedMapId);
    if (!mapMetadata) return;

    // Get boss data
    const boss = getBossAtRank(selectedBoss.bossId, selectedBoss.rank, false);

    // Initialize boss placement at starting position
    const bossPlacement: BossPlacement = {
      bossId: selectedBoss.bossId,
      bossName: boss?.name || 'Boss',
      iconUrl: boss?.iconUrl,
      size: mapMetadata.bossSize,
      positions: {
        0: { hexCoord: mapMetadata.bossStartPosition, rotation: 0 },
        1: { hexCoord: mapMetadata.bossStartPosition, rotation: 0 },
        2: { hexCoord: mapMetadata.bossStartPosition, rotation: 0 },
        3: { hexCoord: mapMetadata.bossStartPosition, rotation: 0 },
        4: { hexCoord: mapMetadata.bossStartPosition, rotation: 0 },
        5: { hexCoord: mapMetadata.bossStartPosition, rotation: 0 },
        6: { hexCoord: mapMetadata.bossStartPosition, rotation: 0 },
      },
    };

    // Initialize character placements (empty positions)
    const characterPlacements: CharacterPlacement[] = team.map((member) => ({
      characterId: member.id,
      characterName: member.name,
      iconUrl: member.iconUrl,
      positions: { 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null },
    }));

    set({
      isPlanning: true,
      currentTurn: 0,
      bossPlacement,
      characterPlacements,
      summonPlacements: [],
      selectedTokenId: null,
      selectedTokenType: null,
    });
  },

  exitPlanning: () => {
    set({
      isPlanning: false,
      currentTurn: 0,
      selectedTokenId: null,
      selectedTokenType: null,
    });
  },

  // Turn navigation
  setCurrentTurn: (turn) => {
    if (turn >= 0 && turn <= MAX_TURNS) {
      set({ currentTurn: turn, selectedTokenId: null, selectedTokenType: null });
    }
  },

  nextTurn: () => {
    const { currentTurn } = get();
    if (currentTurn < MAX_TURNS) {
      set({ currentTurn: currentTurn + 1, selectedTokenId: null, selectedTokenType: null });
    }
  },

  prevTurn: () => {
    const { currentTurn } = get();
    if (currentTurn > 0) {
      set({ currentTurn: currentTurn - 1, selectedTokenId: null, selectedTokenType: null });
    }
  },

  // Character placement
  placeCharacter: (characterId, hex) => {
    const { currentTurn, isHexOccupied } = get();
    if (isHexOccupied(hex, currentTurn, characterId)) return;

    set((state) => ({
      characterPlacements: state.characterPlacements.map((p) => {
        if (p.characterId !== characterId) return p;

        // Set position for current turn and all future turns
        const newPositions = { ...p.positions };
        for (let t = currentTurn; t <= MAX_TURNS; t++) {
          newPositions[t] = { hexCoord: hex };
        }
        return { ...p, positions: newPositions };
      }),
    }));
  },

  moveCharacter: (characterId, hex) => {
    const { currentTurn, isHexOccupied } = get();
    if (isHexOccupied(hex, currentTurn, characterId)) return;

    set((state) => ({
      characterPlacements: state.characterPlacements.map((p) => {
        if (p.characterId !== characterId) return p;

        // Set position for current turn and all future turns
        const newPositions = { ...p.positions };
        for (let t = currentTurn; t <= MAX_TURNS; t++) {
          newPositions[t] = { hexCoord: hex };
        }
        return { ...p, positions: newPositions };
      }),
    }));
  },

  removeCharacterFromGrid: (characterId) => {
    const { currentTurn } = get();

    set((state) => ({
      characterPlacements: state.characterPlacements.map((p) => {
        if (p.characterId !== characterId) return p;

        // Clear position for current turn and all future turns
        const newPositions = { ...p.positions };
        for (let t = currentTurn; t <= MAX_TURNS; t++) {
          newPositions[t] = null;
        }
        return { ...p, positions: newPositions };
      }),
    }));
  },

  // Summon placement
  addSummon: (unitId, unitName, iconUrl) => {
    const instanceId = generateSummonId();
    const newSummon: SummonPlacement = {
      instanceId,
      unitId,
      unitName,
      iconUrl,
      positions: { 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null },
    };

    set((state) => ({
      summonPlacements: [...state.summonPlacements, newSummon],
    }));

    return instanceId;
  },

  placeSummon: (instanceId, hex) => {
    const { currentTurn, isHexOccupied } = get();
    if (isHexOccupied(hex, currentTurn, instanceId)) return;

    set((state) => ({
      summonPlacements: state.summonPlacements.map((s) => {
        if (s.instanceId !== instanceId) return s;

        const newPositions = { ...s.positions };
        for (let t = currentTurn; t <= MAX_TURNS; t++) {
          newPositions[t] = { hexCoord: hex };
        }
        return { ...s, positions: newPositions };
      }),
    }));
  },

  moveSummon: (instanceId, hex) => {
    const { currentTurn, isHexOccupied } = get();
    if (isHexOccupied(hex, currentTurn, instanceId)) return;

    set((state) => ({
      summonPlacements: state.summonPlacements.map((s) => {
        if (s.instanceId !== instanceId) return s;

        const newPositions = { ...s.positions };
        for (let t = currentTurn; t <= MAX_TURNS; t++) {
          newPositions[t] = { hexCoord: hex };
        }
        return { ...s, positions: newPositions };
      }),
    }));
  },

  removeSummon: (instanceId) => {
    set((state) => ({
      summonPlacements: state.summonPlacements.filter((s) => s.instanceId !== instanceId),
    }));
  },

  // Boss actions
  moveBoss: (hex) => {
    const { currentTurn, bossPlacement } = get();
    if (!bossPlacement) return;

    set((state) => {
      if (!state.bossPlacement) return state;

      const currentPosition = state.bossPlacement.positions[currentTurn];
      const newPositions = { ...state.bossPlacement.positions };

      for (let t = currentTurn; t <= MAX_TURNS; t++) {
        newPositions[t] = { hexCoord: hex, rotation: currentPosition?.rotation || 0 };
      }

      return { bossPlacement: { ...state.bossPlacement, positions: newPositions } };
    });
  },

  rotateBoss: () => {
    const { currentTurn, bossPlacement } = get();
    if (!bossPlacement || bossPlacement.size !== 3) return;

    set((state) => {
      if (!state.bossPlacement) return state;

      const currentPosition = state.bossPlacement.positions[currentTurn];
      const currentRotation = currentPosition?.rotation || 0;
      const newRotation = (currentRotation + 60) % 360;

      const newPositions = { ...state.bossPlacement.positions };
      for (let t = currentTurn; t <= MAX_TURNS; t++) {
        const pos = newPositions[t];
        newPositions[t] = { hexCoord: pos.hexCoord, rotation: newRotation };
      }

      return { bossPlacement: { ...state.bossPlacement, positions: newPositions } };
    });
  },

  // Token selection
  selectToken: (id, type) => {
    set({ selectedTokenId: id, selectedTokenType: type });
  },

  clearSelection: () => {
    set({ selectedTokenId: null, selectedTokenType: null });
  },

  // Utility actions
  clearTurn: (turn) => {
    set((state) => {
      // Reset all positions for this turn to previous turn's position (or null for turn 1)
      const characterPlacements = state.characterPlacements.map((p) => {
        const newPositions = { ...p.positions };
        if (turn === 1) {
          newPositions[turn] = null;
        } else {
          newPositions[turn] = p.positions[turn - 1];
        }
        // Also update future turns
        for (let t = turn + 1; t <= MAX_TURNS; t++) {
          newPositions[t] = newPositions[turn];
        }
        return { ...p, positions: newPositions };
      });

      const summonPlacements = state.summonPlacements.map((s) => {
        const newPositions = { ...s.positions };
        if (turn === 1) {
          newPositions[turn] = null;
        } else {
          newPositions[turn] = s.positions[turn - 1];
        }
        for (let t = turn + 1; t <= MAX_TURNS; t++) {
          newPositions[t] = newPositions[turn];
        }
        return { ...s, positions: newPositions };
      });

      // Reset boss to previous turn's position
      let bossPlacement = state.bossPlacement;
      if (bossPlacement && turn > 1) {
        const newPositions = { ...bossPlacement.positions };
        newPositions[turn] = bossPlacement.positions[turn - 1];
        for (let t = turn + 1; t <= MAX_TURNS; t++) {
          newPositions[t] = newPositions[turn];
        }
        bossPlacement = { ...bossPlacement, positions: newPositions };
      }

      return { characterPlacements, summonPlacements, bossPlacement };
    });
  },

  resetAllPlacements: () => {
    const { selectedMapId, bossPlacement } = get();
    const mapMetadata = selectedMapId ? getMapMetadata(selectedMapId) : null;

    set((state) => ({
      characterPlacements: state.characterPlacements.map((p) => ({
        ...p,
        positions: { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null },
      })),
      summonPlacements: [],
      bossPlacement: bossPlacement && mapMetadata
        ? {
            ...bossPlacement,
            positions: {
              1: { hexCoord: mapMetadata.bossStartPosition, rotation: 0 },
              2: { hexCoord: mapMetadata.bossStartPosition, rotation: 0 },
              3: { hexCoord: mapMetadata.bossStartPosition, rotation: 0 },
              4: { hexCoord: mapMetadata.bossStartPosition, rotation: 0 },
              5: { hexCoord: mapMetadata.bossStartPosition, rotation: 0 },
              6: { hexCoord: mapMetadata.bossStartPosition, rotation: 0 },
            },
          }
        : state.bossPlacement,
    }));
  },

  resetAll: () => {
    summonCounter = 0;
    set({
      selectedMapId: null,
      isPlanning: false,
      currentTurn: 0,
      characterPlacements: [],
      summonPlacements: [],
      bossPlacement: null,
      selectedTokenId: null,
      selectedTokenType: null,
    });
  },

  // Computed helpers
  getCharacterPositionAtTurn: (characterId, turn) => {
    const { characterPlacements } = get();
    const placement = characterPlacements.find((p) => p.characterId === characterId);
    return placement?.positions[turn] || null;
  },

  getSummonPositionAtTurn: (instanceId, turn) => {
    const { summonPlacements } = get();
    const placement = summonPlacements.find((s) => s.instanceId === instanceId);
    return placement?.positions[turn] || null;
  },

  getBossPositionAtTurn: (turn) => {
    const { bossPlacement } = get();
    return bossPlacement?.positions[turn] || null;
  },

  isHexOccupied: (hex, turn, excludeTokenId) => {
    const { characterPlacements, summonPlacements, bossPlacement } = get();

    // Check character positions
    for (const placement of characterPlacements) {
      if (excludeTokenId && placement.characterId === excludeTokenId) continue;
      const pos = placement.positions[turn];
      if (pos && hexEquals(pos.hexCoord, hex)) return true;
    }

    // Check summon positions
    for (const placement of summonPlacements) {
      if (excludeTokenId && placement.instanceId === excludeTokenId) continue;
      const pos = placement.positions[turn];
      if (pos && hexEquals(pos.hexCoord, hex)) return true;
    }

    // Check boss position (multi-hex)
    if (bossPlacement && (!excludeTokenId || excludeTokenId !== bossPlacement.bossId)) {
      const bossPos = bossPlacement.positions[turn];
      if (bossPos) {
        const bossHexes = getBossOccupiedHexes(bossPos.hexCoord, bossPlacement.size, bossPos.rotation);
        if (bossHexes.some((bh) => hexEquals(bh, hex))) return true;
      }
    }

    return false;
  },

  getAvailableMapsForBoss: (bossId) => {
    return getMapMetadataForBoss(bossId);
  },
}));
