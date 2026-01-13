import { useMemo, useState, useCallback, useRef } from 'react';
import type {
  HexCoord,
  CharacterPlacement,
  BossPlacement,
  SummonPlacement,
  TokenType,
  Point,
} from '../../types/strategium';
import { getMapWithImage } from '../../services/strategium/mapMetadata';
import {
  hexToPixel,
  hexCorners,
  getBossOccupiedHexes,
  pixelToHex,
} from '../../services/strategium/hexUtils';
import type { GridOverrides } from './CalibrationPanel';

interface HexGridProps {
  mapId: string;
  currentTurn: number;
  characterPlacements: CharacterPlacement[];
  bossPlacement: BossPlacement | null;
  summonPlacements: SummonPlacement[];
  selectedTokenId: string | null;
  selectedTokenType: TokenType | null;
  onHexClick: (hex: HexCoord) => void;
  onTokenClick: (tokenId: string, tokenType: TokenType) => void;
  onCharacterMove?: (characterId: string, hex: HexCoord) => void;
  onBossMove?: (hex: HexCoord) => void;
  onBossRotate?: () => void;
  // Calibration mode props
  calibrationMode?: boolean;
  gridOverrides?: GridOverrides;
  gridOpacity?: number;
}

// Color palette for characters (5 distinct colors for up to 5 team members)
const CHARACTER_COLORS = [
  { fill: 'rgba(59, 130, 246, 0.25)', stroke: '#3b82f6', dark: '#1e3a5f' },   // Blue
  { fill: 'rgba(168, 85, 247, 0.25)', stroke: '#a855f7', dark: '#4c1d95' },   // Purple
  { fill: 'rgba(236, 72, 153, 0.25)', stroke: '#ec4899', dark: '#831843' },   // Pink
  { fill: 'rgba(249, 115, 22, 0.25)', stroke: '#f97316', dark: '#7c2d12' },   // Orange
  { fill: 'rgba(20, 184, 166, 0.25)', stroke: '#14b8a6', dark: '#134e4a' },   // Teal
];

export function HexGrid({
  mapId,
  currentTurn,
  characterPlacements,
  bossPlacement,
  summonPlacements,
  selectedTokenId,
  selectedTokenType,
  onHexClick,
  onTokenClick,
  onCharacterMove,
  onBossMove,
  onBossRotate,
  calibrationMode = false,
  gridOverrides,
  gridOpacity = 0,
}: HexGridProps) {
  const [hoveredHex, setHoveredHex] = useState<HexCoord | null>(null);

  // Drag state for map-based token dragging
  const [draggingToken, setDraggingToken] = useState<{ id: string; type: TokenType; colorIndex: number } | null>(null);
  const [dragPosition, setDragPosition] = useState<Point | null>(null);
  const [dragStartHex, setDragStartHex] = useState<HexCoord | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const mapData = useMemo(() => getMapWithImage(mapId), [mapId]);

  // Use overrides in calibration mode, otherwise use map metadata
  const effectiveHexGrid = useMemo(() => {
    if (!mapData) return null;
    if (calibrationMode && gridOverrides) {
      return {
        originX: gridOverrides.originX,
        originY: gridOverrides.originY,
        hexSize: gridOverrides.hexSize,
        verticalScale: gridOverrides.verticalScale,
        rotation: 0,
        rows: gridOverrides.rows,
        cols: gridOverrides.cols,
      };
    }
    return mapData.hexGrid;
  }, [mapData, calibrationMode, gridOverrides]);

  // Generate hex grid
  const hexes = useMemo(() => {
    if (!effectiveHexGrid) return [];

    const { rows, cols } = effectiveHexGrid;
    const result: HexCoord[] = [];

    for (let r = 0; r < rows; r++) {
      for (let q = 0; q < cols; q++) {
        // Offset coordinates to axial
        const axialQ = q - Math.floor(r / 2);
        result.push({ q: axialQ, r });
      }
    }

    return result;
  }, [effectiveHexGrid]);

  // Get boss hexes for current turn
  const bossHexes = useMemo(() => {
    if (!bossPlacement) return [];
    const pos = bossPlacement.positions[currentTurn];
    if (!pos) return [];
    return getBossOccupiedHexes(pos.hexCoord, bossPlacement.size, pos.rotation || 0);
  }, [bossPlacement, currentTurn]);

  // Get occupied hexes map
  const occupiedHexes = useMemo(() => {
    const map = new Map<string, { type: TokenType; id: string; colorIndex?: number }>();

    // Characters
    characterPlacements.forEach((placement, index) => {
      const pos = placement.positions[currentTurn];
      if (pos) {
        map.set(`${pos.hexCoord.q},${pos.hexCoord.r}`, {
          type: 'character',
          id: placement.characterId,
          colorIndex: index % CHARACTER_COLORS.length,
        });
      }
    });

    // Summons
    for (const placement of summonPlacements) {
      const pos = placement.positions[currentTurn];
      if (pos) {
        map.set(`${pos.hexCoord.q},${pos.hexCoord.r}`, {
          type: 'summon',
          id: placement.instanceId,
        });
      }
    }

    // Boss
    for (const hex of bossHexes) {
      map.set(`${hex.q},${hex.r}`, { type: 'boss', id: bossPlacement?.bossId || '' });
    }

    return map;
  }, [characterPlacements, summonPlacements, bossHexes, bossPlacement, currentTurn]);

  // Handle hex click
  const handleHexClick = useCallback(
    (hex: HexCoord) => {
      const key = `${hex.q},${hex.r}`;
      const occupant = occupiedHexes.get(key);

      if (occupant) {
        // If boss is selected and clicking on a boss hex, move the boss
        if (occupant.type === 'boss' && selectedTokenId === occupant.id && selectedTokenType === 'boss') {
          onHexClick(hex);
        } else {
          onTokenClick(occupant.id, occupant.type);
        }
      } else {
        onHexClick(hex);
      }
    },
    [occupiedHexes, onHexClick, onTokenClick, selectedTokenId, selectedTokenType]
  );

  // Handle drag and drop
  const handleDrop = useCallback(
    (e: React.DragEvent, hex: HexCoord) => {
      e.preventDefault();
      const tokenId = e.dataTransfer.getData('tokenId');
      const tokenType = e.dataTransfer.getData('tokenType') as TokenType;

      if (tokenId && tokenType === 'character') {
        onHexClick(hex);
      }
    },
    [onHexClick]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  if (!mapData || !effectiveHexGrid) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-500">
        Map not found
      </div>
    );
  }

  const { imageUrl, imageWidth } = mapData;
  const { originX, originY, hexSize, verticalScale = 0.55 } = effectiveHexGrid;

  // Use actual image dimensions for SVG viewBox to preserve aspect ratio
  const svgWidth = imageWidth;
  const svgHeight = 1787;

  // Convert screen coordinates to SVG coordinates (works with both mouse and touch via PointerEvent)
  const screenToSvg = useCallback((clientX: number, clientY: number): Point | null => {
    if (!svgRef.current) return null;
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    // Scale factor between screen and viewBox
    const scaleX = svgWidth / rect.width;
    const scaleY = svgHeight / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }, [svgWidth, svgHeight]);

  // Handle pointer move for dragging (works on touch and mouse)
  const handleSvgPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingToken) return;
    const pos = screenToSvg(e.clientX, e.clientY);
    if (pos) {
      setDragPosition(pos);
    }
  }, [draggingToken, screenToSvg]);

  // Handle pointer up for dropping (works on touch and mouse)
  const handleSvgPointerUp = useCallback((_e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingToken || !dragPosition) {
      setDraggingToken(null);
      setDragPosition(null);
      setDragStartHex(null);
      return;
    }

    // Convert drag position to hex
    const hex = pixelToHex(dragPosition, hexSize, { x: originX, y: originY }, verticalScale);

    // Check if the hex is valid (within grid bounds) and different from start
    const isWithinBounds = hexes.some(h => h.q === hex.q && h.r === hex.r);
    const hasMoved = !dragStartHex || hex.q !== dragStartHex.q || hex.r !== dragStartHex.r;

    if (isWithinBounds && hasMoved) {
      if (draggingToken.type === 'character' && onCharacterMove) {
        onCharacterMove(draggingToken.id, hex);
      } else if (draggingToken.type === 'boss' && onBossMove) {
        onBossMove(hex);
      }
    }

    setDraggingToken(null);
    setDragPosition(null);
    setDragStartHex(null);
  }, [draggingToken, dragPosition, dragStartHex, hexSize, originX, originY, verticalScale, hexes, onCharacterMove, onBossMove]);

  // Handle pointer leave to cancel drag
  const handleSvgPointerLeave = useCallback(() => {
    setDraggingToken(null);
    setDragPosition(null);
    setDragStartHex(null);
  }, []);

  return (
    <div className="w-full h-full overflow-auto bg-gray-950 flex items-center justify-center">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-full h-auto md:w-auto md:h-full md:max-w-full"
        style={{ cursor: draggingToken ? 'grabbing' : 'default', touchAction: 'none' }}
        onPointerMove={handleSvgPointerMove}
        onPointerUp={(e) => {
          svgRef.current?.releasePointerCapture?.(e.pointerId);
          handleSvgPointerUp(e);
        }}
        onPointerLeave={handleSvgPointerLeave}
        onPointerCancel={(e) => {
          svgRef.current?.releasePointerCapture?.(e.pointerId);
          setDraggingToken(null);
          setDragPosition(null);
          setDragStartHex(null);
        }}
      >
        {/* Map background */}
        {imageUrl && (
          <image
            href={imageUrl}
            x={0}
            y={0}
            width={svgWidth}
            height={svgHeight}
          />
        )}

        {/* Hex grid overlay */}
        <g className="hex-grid" opacity={gridOpacity}>
          {hexes.map((hex) => {
            const center = hexToPixel(hex, hexSize, { x: originX, y: originY }, verticalScale);
            const corners = hexCorners(center, hexSize, verticalScale);
            const points = corners.map((c) => `${c.x},${c.y}`).join(' ');
            const key = `${hex.q},${hex.r}`;
            const occupant = occupiedHexes.get(key);
            const isHovered = hoveredHex?.q === hex.q && hoveredHex?.r === hex.r;
            const isBossHex = bossHexes.some((bh) => bh.q === hex.q && bh.r === hex.r);
            const isOccupantSelected = occupant && selectedTokenId === occupant.id && selectedTokenType === occupant.type;

            let fillColor = 'transparent';
            let strokeColor = 'rgba(255,255,255,0.3)';
            let strokeWidth = 1;

            if (occupant?.type === 'character') {
              const colorIndex = occupant.colorIndex ?? 0;
              const charColor = CHARACTER_COLORS[colorIndex];
              fillColor = charColor.fill;
              strokeColor = isOccupantSelected ? '#eab308' : charColor.stroke;
              strokeWidth = isOccupantSelected ? 3 : 2;
            } else if (occupant?.type === 'summon') {
              fillColor = 'rgba(34, 197, 94, 0.5)'; // green
              strokeColor = isOccupantSelected ? '#eab308' : '#22c55e';
              strokeWidth = isOccupantSelected ? 3 : 2;
            } else if (isBossHex) {
              fillColor = 'rgba(239, 68, 68, 0.5)'; // red
            } else if (isHovered) {
              fillColor = 'rgba(234, 179, 8, 0.4)'; // yellow hover
              strokeColor = '#fbbf24';
              strokeWidth = 3;
            }

            return (
              <g key={key}>
                <polygon
                  points={points}
                  fill={fillColor}
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  className="cursor-pointer transition-colors"
                  style={{ touchAction: 'manipulation' }}
                  onPointerDown={() => handleHexClick(hex)}
                  onPointerEnter={() => setHoveredHex(hex)}
                  onPointerLeave={() => setHoveredHex(null)}
                  onDrop={(e) => handleDrop(e, hex)}
                  onDragOver={handleDragOver}
                />
                {/* Show coordinates in calibration mode */}
                {calibrationMode && (
                  <text
                    x={center.x}
                    y={center.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="rgba(255,255,255,0.7)"
                    fontSize={hexSize * 0.22}
                    pointerEvents="none"
                  >
                    {hex.q},{hex.r}
                  </text>
                )}
              </g>
            );
          })}
        </g>

        {/* Movement arrows (from previous turn) */}
        <g className="movement-arrows">
          {characterPlacements.map((placement, index) => {
            if (currentTurn === 0) return null;
            const prevPos = placement.positions[currentTurn - 1];
            const currPos = placement.positions[currentTurn];
            if (!prevPos || !currPos) return null;
            if (prevPos.hexCoord.q === currPos.hexCoord.q && prevPos.hexCoord.r === currPos.hexCoord.r) {
              return null;
            }

            const from = hexToPixel(prevPos.hexCoord, hexSize, { x: originX, y: originY }, verticalScale);
            const to = hexToPixel(currPos.hexCoord, hexSize, { x: originX, y: originY }, verticalScale);
            const colorIndex = index % CHARACTER_COLORS.length;
            const charColor = CHARACTER_COLORS[colorIndex];

            return (
              <g key={`arrow-${placement.characterId}`}>
                {/* Ghost at previous position */}
                <circle
                  cx={from.x}
                  cy={from.y}
                  r={hexSize * 0.35}
                  fill={charColor.fill.replace('0.25)', '0.4)')}
                  stroke={charColor.stroke}
                  strokeOpacity={0.8}
                  strokeWidth={2}
                />
                {/* Arrow */}
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={charColor.stroke}
                  strokeOpacity={0.9}
                  strokeWidth={3}
                  markerEnd={`url(#arrowhead-${colorIndex})`}
                />
              </g>
            );
          })}

          {/* Boss movement arrow */}
          {bossPlacement && currentTurn > 0 && (() => {
            const prevPos = bossPlacement.positions[currentTurn - 1];
            const currPos = bossPlacement.positions[currentTurn];
            if (!prevPos || !currPos) return null;
            if (prevPos.hexCoord.q === currPos.hexCoord.q && prevPos.hexCoord.r === currPos.hexCoord.r) {
              return null;
            }

            const from = hexToPixel(prevPos.hexCoord, hexSize, { x: originX, y: originY }, verticalScale);
            const to = hexToPixel(currPos.hexCoord, hexSize, { x: originX, y: originY }, verticalScale);

            return (
              <g key="arrow-boss">
                <circle
                  cx={from.x}
                  cy={from.y}
                  r={hexSize * 0.5}
                  fill="rgba(239, 68, 68, 0.4)"
                  stroke="rgba(239, 68, 68, 0.8)"
                  strokeWidth={2}
                />
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke="rgba(239, 68, 68, 0.9)"
                  strokeWidth={4}
                  markerEnd="url(#arrowhead-red)"
                />
              </g>
            );
          })()}
        </g>

        {/* Tokens */}
        <g className="tokens">
          {/* Boss token */}
          {bossPlacement && bossPlacement.positions[currentTurn] && draggingToken?.type !== 'boss' && (
            <BossToken
              bossPlacement={bossPlacement}
              position={bossPlacement.positions[currentTurn]}
              hexSize={hexSize}
              verticalScale={verticalScale}
              origin={{ x: originX, y: originY }}
              isSelected={selectedTokenId === bossPlacement.bossId && selectedTokenType === 'boss'}
              onCenterClick={() => onTokenClick(bossPlacement.bossId, 'boss')}
              onHexClick={onHexClick}
              onDragStart={(center) => {
                setDraggingToken({ id: bossPlacement.bossId, type: 'boss', colorIndex: -1 });
                setDragPosition(center);
                setDragStartHex(bossPlacement.positions[currentTurn].hexCoord);
              }}
              onRotate={onBossRotate}
              onPointerCapture={(pointerId) => svgRef.current?.setPointerCapture?.(pointerId)}
            />
          )}

          {/* Character tokens */}
          {characterPlacements.map((placement, index) => {
            const pos = placement.positions[currentTurn];
            if (!pos) return null;
            // Don't render if this token is being dragged
            if (draggingToken?.id === placement.characterId) return null;

            const center = hexToPixel(pos.hexCoord, hexSize, { x: originX, y: originY }, verticalScale);
            const corners = hexCorners(center, hexSize, verticalScale);
            const hexPoints = corners.map((c) => `${c.x},${c.y}`).join(' ');
            const isSelected = selectedTokenId === placement.characterId && selectedTokenType === 'character';
            const colorIndex = index % CHARACTER_COLORS.length;
            const charColor = CHARACTER_COLORS[colorIndex];

            return (
              <g
                key={placement.characterId}
                className="cursor-grab"
                style={{ cursor: 'grab', touchAction: 'none' }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  // Capture pointer on SVG for reliable touch dragging
                  svgRef.current?.setPointerCapture?.(e.pointerId);
                  // Select the character
                  if (selectedTokenId !== placement.characterId) {
                    onTokenClick(placement.characterId, 'character');
                  }
                  // Start drag tracking
                  setDraggingToken({ id: placement.characterId, type: 'character', colorIndex });
                  setDragPosition(center);
                  setDragStartHex(pos.hexCoord);
                }}
              >
                {/* Hex fill polygon */}
                <polygon
                  points={hexPoints}
                  fill={charColor.fill}
                  stroke={isSelected ? '#eab308' : charColor.stroke}
                  strokeWidth={isSelected ? 3 : 2}
                />
                {/* Token circle */}
                <circle
                  cx={center.x}
                  cy={center.y}
                  r={hexSize * 0.4}
                  fill={charColor.dark}
                  stroke={isSelected ? '#eab308' : charColor.stroke}
                  strokeWidth={isSelected ? 3 : 2}
                />
                {/* Portrait */}
                {placement.iconUrl && (
                  <clipPath id={`clip-${placement.characterId}`}>
                    <circle cx={center.x} cy={center.y} r={hexSize * 0.35} />
                  </clipPath>
                )}
                {placement.iconUrl ? (
                  <image
                    href={placement.iconUrl}
                    x={center.x - hexSize * 0.35}
                    y={center.y - hexSize * 0.35}
                    width={hexSize * 0.7}
                    height={hexSize * 0.7}
                    clipPath={`url(#clip-${placement.characterId})`}
                    preserveAspectRatio="xMidYMid slice"
                  />
                ) : (
                  <text
                    x={center.x}
                    y={center.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="white"
                    fontSize={hexSize * 0.3}
                    fontWeight="bold"
                  >
                    {placement.characterName.charAt(0)}
                  </text>
                )}
              </g>
            );
          })}

          {/* Summon tokens */}
          {summonPlacements.map((placement) => {
            const pos = placement.positions[currentTurn];
            if (!pos) return null;

            const center = hexToPixel(pos.hexCoord, hexSize, { x: originX, y: originY }, verticalScale);
            const isSelected = selectedTokenId === placement.instanceId && selectedTokenType === 'summon';

            return (
              <g
                key={placement.instanceId}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onTokenClick(placement.instanceId, 'summon');
                }}
              >
                <circle
                  cx={center.x}
                  cy={center.y}
                  r={hexSize * 0.35}
                  fill="#1e4620"
                  stroke={isSelected ? '#eab308' : '#22c55e'}
                  strokeWidth={isSelected ? 3 : 2}
                />
                <text
                  x={center.x}
                  y={center.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="white"
                  fontSize={hexSize * 0.25}
                  fontWeight="bold"
                >
                  {placement.unitName.charAt(0)}
                </text>
              </g>
            );
          })}
        </g>

        {/* Ghost token while dragging */}
        {draggingToken && dragPosition && (
          <g className="drag-ghost" style={{ pointerEvents: 'none' }}>
            {(() => {
              // Character ghost
              if (draggingToken.type === 'character') {
                const charColor = CHARACTER_COLORS[draggingToken.colorIndex];
                const placement = characterPlacements.find(p => p.characterId === draggingToken.id);
                return (
                  <>
                    <circle
                      cx={dragPosition.x}
                      cy={dragPosition.y}
                      r={hexSize * 0.4}
                      fill={charColor.dark}
                      stroke={charColor.stroke}
                      strokeWidth={3}
                      opacity={0.8}
                    />
                    {placement?.iconUrl ? (
                      <>
                        <clipPath id="clip-ghost">
                          <circle cx={dragPosition.x} cy={dragPosition.y} r={hexSize * 0.35} />
                        </clipPath>
                        <image
                          href={placement.iconUrl}
                          x={dragPosition.x - hexSize * 0.35}
                          y={dragPosition.y - hexSize * 0.35}
                          width={hexSize * 0.7}
                          height={hexSize * 0.7}
                          clipPath="url(#clip-ghost)"
                          preserveAspectRatio="xMidYMid slice"
                          opacity={0.8}
                        />
                      </>
                    ) : placement && (
                      <text
                        x={dragPosition.x}
                        y={dragPosition.y}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="white"
                        fontSize={hexSize * 0.3}
                        fontWeight="bold"
                        opacity={0.8}
                      >
                        {placement.characterName.charAt(0)}
                      </text>
                    )}
                  </>
                );
              }

              // Boss ghost
              if (draggingToken.type === 'boss' && bossPlacement) {
                return (
                  <>
                    <circle
                      cx={dragPosition.x}
                      cy={dragPosition.y}
                      r={hexSize * 0.5}
                      fill="#4a1515"
                      stroke="#ef4444"
                      strokeWidth={3}
                      opacity={0.8}
                    />
                    {bossPlacement.iconUrl ? (
                      <>
                        <clipPath id="clip-ghost-boss">
                          <circle cx={dragPosition.x} cy={dragPosition.y} r={hexSize * 0.45} />
                        </clipPath>
                        <image
                          href={bossPlacement.iconUrl}
                          x={dragPosition.x - hexSize * 0.45}
                          y={dragPosition.y - hexSize * 0.45}
                          width={hexSize * 0.9}
                          height={hexSize * 0.9}
                          clipPath="url(#clip-ghost-boss)"
                          preserveAspectRatio="xMidYMid slice"
                          opacity={0.8}
                        />
                      </>
                    ) : (
                      <text
                        x={dragPosition.x}
                        y={dragPosition.y}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="white"
                        fontSize={hexSize * 0.4}
                        fontWeight="bold"
                        opacity={0.8}
                      >
                        B
                      </text>
                    )}
                  </>
                );
              }

              return null;
            })()}
          </g>
        )}

        {/* Arrow marker definitions */}
        <defs>
          {/* Character arrow markers */}
          {CHARACTER_COLORS.map((color, index) => (
            <marker
              key={`arrowhead-${index}`}
              id={`arrowhead-${index}`}
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill={color.stroke} fillOpacity={0.7} />
            </marker>
          ))}
          {/* Boss arrow marker */}
          <marker
            id="arrowhead-red"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="rgba(239, 68, 68, 0.7)" />
          </marker>
        </defs>
      </svg>
    </div>
  );
}

// Boss token component for multi-hex bosses
interface BossTokenProps {
  bossPlacement: BossPlacement;
  position: { hexCoord: HexCoord; rotation?: number };
  hexSize: number;
  verticalScale: number;
  origin: { x: number; y: number };
  isSelected: boolean;
  onCenterClick: () => void;
  onHexClick: (hex: HexCoord) => void;
  onDragStart?: (center: Point) => void;
  onRotate?: () => void;
  onPointerCapture?: (pointerId: number) => void;
}

function BossToken({ bossPlacement, position, hexSize, verticalScale, origin, isSelected, onCenterClick, onHexClick, onDragStart, onRotate, onPointerCapture }: BossTokenProps) {
  const center = hexToPixel(position.hexCoord, hexSize, origin, verticalScale);
  const bossHexes = getBossOccupiedHexes(position.hexCoord, bossPlacement.size, position.rotation || 0);

  // Track last tap time for double-tap detection
  const lastTapRef = useRef<number>(0);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    // Capture pointer on parent SVG for reliable touch dragging
    onPointerCapture?.(e.pointerId);

    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;

    if (now - lastTapRef.current < DOUBLE_TAP_DELAY && bossPlacement.size === 3) {
      // Double-tap on 3-hex boss - rotate
      onRotate?.();
    } else {
      // Single tap - select, also start drag tracking
      if (!isSelected) {
        onCenterClick();
      }
      onDragStart?.(center);
    }
    lastTapRef.current = now;
  };

  return (
    <g className="cursor-pointer">
      {/* Highlight occupied hexes - clicking moves the boss when selected */}
      {bossHexes.map((hex, i) => {
        const hCenter = hexToPixel(hex, hexSize, origin, verticalScale);
        const corners = hexCorners(hCenter, hexSize, verticalScale);
        const points = corners.map((c) => `${c.x},${c.y}`).join(' ');
        const isCenter = hex.q === position.hexCoord.q && hex.r === position.hexCoord.r;
        return (
          <polygon
            key={i}
            points={points}
            fill="rgba(239, 68, 68, 0.5)"
            stroke={isSelected ? '#eab308' : '#ef4444'}
            strokeWidth={isSelected ? 3 : 2}
            onClick={(e) => {
              e.stopPropagation();
              if (isCenter) {
                onCenterClick();
              } else if (isSelected) {
                // When selected and clicking non-center hex, move boss there
                onHexClick(hex);
              } else {
                // When not selected, clicking any hex selects the boss
                onCenterClick();
              }
            }}
          />
        );
      })}

      {/* Boss portrait at center - tap selects (double-tap rotates), drag moves */}
      <circle
        cx={center.x}
        cy={center.y}
        r={hexSize * 0.5}
        fill="#4a1515"
        stroke={isSelected ? '#eab308' : '#ef4444'}
        strokeWidth={3}
        style={{ cursor: 'grab', touchAction: 'none' }}
        onPointerDown={handlePointerDown}
      />
      {bossPlacement.iconUrl ? (
        <>
          <clipPath id="clip-boss">
            <circle cx={center.x} cy={center.y} r={hexSize * 0.45} />
          </clipPath>
          <image
            href={bossPlacement.iconUrl}
            x={center.x - hexSize * 0.45}
            y={center.y - hexSize * 0.45}
            width={hexSize * 0.9}
            height={hexSize * 0.9}
            clipPath="url(#clip-boss)"
            preserveAspectRatio="xMidYMid slice"
            onPointerDown={handlePointerDown}
            style={{ pointerEvents: 'all', cursor: 'grab', touchAction: 'none' }}
          />
        </>
      ) : (
        <text
          x={center.x}
          y={center.y}
          textAnchor="middle"
          dominantBaseline="central"
          fill="white"
          fontSize={hexSize * 0.4}
          fontWeight="bold"
          pointerEvents="none"
        >
          B
        </text>
      )}
    </g>
  );
}
