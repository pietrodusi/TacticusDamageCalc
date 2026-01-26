/**
 * Compression utilities for URL-safe encoding/decoding
 * Uses LZ-String for compression
 */

import LZString from 'lz-string';
import type { ShareableData } from './types';
import { isValidShareData } from './decoder';

/**
 * Compress shareable data to a URL-safe string
 */
export function compressToUrl(data: ShareableData): string {
  const json = JSON.stringify(data);
  const compressed = LZString.compressToEncodedURIComponent(json);
  return compressed;
}

/**
 * Decompress URL string back to shareable data
 * Returns null if decompression or parsing fails
 */
export function decompressFromUrl(compressed: string): ShareableData | null {
  try {
    const json = LZString.decompressFromEncodedURIComponent(compressed);
    if (!json) {
      console.error('Failed to decompress share data');
      return null;
    }

    const data = JSON.parse(json);

    if (!isValidShareData(data)) {
      console.error('Invalid share data structure');
      return null;
    }

    return data;
  } catch (error) {
    console.error('Failed to parse share data:', error);
    return null;
  }
}

/**
 * Generate full shareable URL
 */
export function generateShareUrl(data: ShareableData, baseUrl?: string): string {
  const compressed = compressToUrl(data);
  const base = baseUrl || `${window.location.origin}/TacticusDamageCalc`;
  return `${base}/calculator/shared?d=${compressed}`;
}

/**
 * Extract compressed data from URL
 */
export function extractDataFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.searchParams.get('d');
  } catch {
    // Try to extract from query string directly
    const match = url.match(/[?&]d=([^&]+)/);
    return match ? match[1] : null;
  }
}

/**
 * Parse share data from current URL
 */
export function parseShareDataFromUrl(): ShareableData | null {
  const params = new URLSearchParams(window.location.search);
  const compressed = params.get('d');

  if (!compressed) {
    return null;
  }

  return decompressFromUrl(compressed);
}
