import type { MapMetadata, MapMetadataCollection } from '../../types/strategium';
import mapMetadataJson from '../../assets/data/mapMetadata.json';
import {
  getDataDrivenMaps,
  getDataDrivenMapMetadata,
} from './boardDataService';

// Import map images using Vite's glob import
const mapImages = import.meta.glob<{ default: string }>(
  '../../assets/images/maps/*.webp',
  { eager: true }
);

// Create a map of filename -> resolved URL
const mapImageUrls: Record<string, string> = {};
for (const path in mapImages) {
  const filename = path.split('/').pop() || '';
  mapImageUrls[filename] = mapImages[path].default;
}

// Type the imported JSON
const mapMetadata = mapMetadataJson as MapMetadataCollection;

/**
 * Get all available maps (manual + data-driven)
 */
export function getAllMaps(): MapMetadata[] {
  return [...Object.values(mapMetadata.maps), ...getDataDrivenMaps()];
}

/**
 * Get maps available for a specific boss
 * Supports both legacy bossId and new bossIds array
 * Includes data-driven maps
 */
export function getMapMetadataForBoss(bossId: string): MapMetadata[] {
  const manual = Object.values(mapMetadata.maps).filter((map) => {
    if (map.bossIds && map.bossIds.includes(bossId)) {
      return true;
    }
    return map.bossId === bossId;
  });

  const dataDriven = getDataDrivenMaps().filter(
    (m) => m.bossIds?.includes(bossId)
  );

  return [...dataDriven, ...manual];
}

/**
 * Get metadata for a specific map (manual or data-driven)
 */
export function getMapMetadata(mapId: string): MapMetadata | null {
  return mapMetadata.maps[mapId] || getDataDrivenMapMetadata(mapId) || null;
}

/**
 * Get the resolved image URL for a map
 */
export function getMapImageUrl(mapId: string): string | null {
  const meta = getMapMetadata(mapId);
  if (!meta) return null;
  return mapImageUrls[meta.imageFile] || null;
}

/**
 * Get map metadata with resolved image URL
 */
export interface MapMetadataWithImage extends MapMetadata {
  imageUrl: string | null;
}

export function getMapWithImage(mapId: string): MapMetadataWithImage | null {
  const meta = getMapMetadata(mapId);
  if (!meta) return null;
  return {
    ...meta,
    imageUrl: mapImageUrls[meta.imageFile] || null,
  };
}

/**
 * Get all maps for a boss with resolved image URLs
 */
export function getMapsForBossWithImages(bossId: string): MapMetadataWithImage[] {
  return getMapMetadataForBoss(bossId).map((meta) => ({
    ...meta,
    imageUrl: mapImageUrls[meta.imageFile] || null,
  }));
}
