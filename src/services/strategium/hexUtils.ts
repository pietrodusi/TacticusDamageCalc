import type { HexCoord, Point } from '../../types/strategium';

/**
 * Convert axial hex coordinates to pixel position (center of hex)
 * Uses flat-top hexagon orientation with isometric vertical scaling
 * @param hex The hex coordinate (axial coordinates)
 * @param size The hex size (center to vertex for regular hex)
 * @param origin The pixel origin point
 * @param verticalScale Vertical compression factor for isometric view (default 0.55)
 */
export function hexToPixel(hex: HexCoord, size: number, origin: Point, verticalScale: number = 1): Point {
  // Flat-top axial hex layout with isometric compression
  // For flat-top hexes with axial coordinates:
  // x = size * 3/2 * q
  // y = size * sqrt(3) * (r + q/2)
  const x = size * 1.5 * hex.q;
  const y = size * Math.sqrt(3) * (hex.r + hex.q / 2) * verticalScale;

  return {
    x: origin.x + x,
    y: origin.y + y,
  };
}

/**
 * Convert pixel position to nearest hex coordinates
 * @param point The pixel position
 * @param size The hex size
 * @param origin The pixel origin point
 * @param verticalScale Vertical compression factor for isometric view (default 1)
 */
export function pixelToHex(point: Point, size: number, origin: Point, verticalScale: number = 1): HexCoord {
  const x = point.x - origin.x;
  // Undo the vertical scale to get the original y
  const y = (point.y - origin.y) / verticalScale;

  const q = (2 / 3 * x) / size;
  const r = (-1 / 3 * x + Math.sqrt(3) / 3 * y) / size;

  return hexRound({ q, r });
}

/**
 * Round fractional hex coordinates to nearest hex
 */
export function hexRound(hex: { q: number; r: number }): HexCoord {
  // Convert to cube coordinates
  const x = hex.q;
  const z = hex.r;
  const y = -x - z;

  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);

  const xDiff = Math.abs(rx - x);
  const yDiff = Math.abs(ry - y);
  const zDiff = Math.abs(rz - z);

  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz;
  } else if (yDiff > zDiff) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }

  return { q: rx, r: rz };
}

/**
 * Get the 6 corner points of a hexagon
 * Uses flat-top orientation with isometric vertical scaling
 * @param center Center point of the hex
 * @param size Hex size (center to vertex for regular hex)
 * @param verticalScale Vertical compression factor for isometric view (default 0.55)
 */
export function hexCorners(center: Point, size: number, verticalScale: number = 1): Point[] {
  const corners: Point[] = [];
  // Flat-top: starts at right vertex (0 degrees), then every 60 degrees
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i);
    corners.push({
      x: center.x + size * Math.cos(angle),
      y: center.y + size * Math.sin(angle) * verticalScale,
    });
  }
  return corners;
}

/**
 * Calculate distance between two hexes
 */
export function hexDistance(a: HexCoord, b: HexCoord): number {
  // Convert to cube coordinates
  const ax = a.q;
  const az = a.r;
  const ay = -ax - az;

  const bx = b.q;
  const bz = b.r;
  const by = -bx - bz;

  return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz));
}

/**
 * Get the 6 neighboring hexes
 */
export function hexNeighbors(hex: HexCoord): HexCoord[] {
  const directions: HexCoord[] = [
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
    { q: 0, r: 1 },
  ];
  return directions.map((d) => ({ q: hex.q + d.q, r: hex.r + d.r }));
}

/**
 * Get all hexes occupied by a boss token
 * @param center Center hex of the boss
 * @param size Boss size (1, 3, or 7 hexes)
 * @param rotation Rotation in degrees (0, 60, 120, 180, 240, 300) for 3-hex bosses
 */
export function getBossOccupiedHexes(center: HexCoord, size: 1 | 3 | 7, rotation: number = 0): HexCoord[] {
  if (size === 1) {
    return [center];
  }

  const directions: HexCoord[] = [
    { q: 1, r: 0 },   // 0°
    { q: 1, r: -1 },  // 60°
    { q: 0, r: -1 },  // 120°
    { q: -1, r: 0 },  // 180°
    { q: -1, r: 1 },  // 240°
    { q: 0, r: 1 },   // 300°
  ];

  if (size === 7) {
    // Center + all 6 neighbors (flower pattern)
    return [center, ...directions.map((d) => ({ q: center.q + d.q, r: center.r + d.r }))];
  }

  // size === 3: Triangle pattern
  // Center + 2 adjacent hexes based on rotation
  const idx = Math.floor((rotation % 360) / 60);
  return [
    center,
    { q: center.q + directions[idx].q, r: center.r + directions[idx].r },
    { q: center.q + directions[(idx + 1) % 6].q, r: center.r + directions[(idx + 1) % 6].r },
  ];
}

/**
 * Check if two hex coordinates are equal
 */
export function hexEquals(a: HexCoord, b: HexCoord): boolean {
  return a.q === b.q && a.r === b.r;
}

/**
 * Create a unique string key for a hex coordinate
 */
export function hexKey(hex: HexCoord): string {
  return `${hex.q},${hex.r}`;
}

/**
 * Get hexes within a given range of a center hex
 */
export function hexesInRange(center: HexCoord, range: number): HexCoord[] {
  const results: HexCoord[] = [];
  for (let q = -range; q <= range; q++) {
    for (let r = Math.max(-range, -q - range); r <= Math.min(range, -q + range); r++) {
      results.push({ q: center.q + q, r: center.r + r });
    }
  }
  return results;
}

/**
 * Get a line of hexes from start to end
 */
export function hexLine(start: HexCoord, end: HexCoord): HexCoord[] {
  const N = hexDistance(start, end);
  if (N === 0) return [start];

  const results: HexCoord[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const q = start.q * (1 - t) + end.q * t;
    const r = start.r * (1 - t) + end.r * t;
    results.push(hexRound({ q, r }));
  }
  return results;
}
