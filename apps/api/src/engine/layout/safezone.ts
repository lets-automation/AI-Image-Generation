import type { Position } from "@ep/shared";
import type { PixelBounds } from "./grid.js";

/**
 * Safe zone definition from template (stored as JSONB).
 * Coordinates are percentages (0-100) of template dimensions.
 */
export interface SafeZone {
  id: string;
  type: "text" | "logo" | "both";
  x: number; // percentage
  y: number; // percentage
  width: number; // percentage
  height: number; // percentage
  padding: number; // percentage
  maxFontSize?: number; // px
  position: Position;
}

/**
 * Resolved safe zone with absolute pixel coordinates.
 */
export interface ResolvedSafeZone extends SafeZone {
  pixelBounds: PixelBounds;
}

/**
 * Convert a safe zone's percentage coordinates to pixel bounds.
 *
 * Safe zones are stored as percentages of the template image dimensions.
 * This function converts them to absolute pixel coordinates, applying
 * the inner padding.
 */
export function resolveSafeZone(
  zone: SafeZone,
  imageWidth: number,
  imageHeight: number
): ResolvedSafeZone {
  const rawX = (zone.x / 100) * imageWidth;
  const rawY = (zone.y / 100) * imageHeight;
  const rawW = (zone.width / 100) * imageWidth;
  const rawH = (zone.height / 100) * imageHeight;
  const pad = (zone.padding / 100) * Math.min(imageWidth, imageHeight);

  return {
    ...zone,
    pixelBounds: {
      x: rawX + pad,
      y: rawY + pad,
      width: Math.max(0, rawW - pad * 2),
      height: Math.max(0, rawH - pad * 2),
    },
  };
}

/**
 * Resolve all safe zones for a template.
 */
export function resolveAllSafeZones(
  zones: SafeZone[],
  imageWidth: number,
  imageHeight: number
): ResolvedSafeZone[] {
  return zones.map((z) => resolveSafeZone(z, imageWidth, imageHeight));
}

/**
 * Find the safe zone at a given position.
 * Returns the first zone matching that position, or null.
 */
export function findZoneByPosition(
  zones: ResolvedSafeZone[],
  position: Position
): ResolvedSafeZone | null {
  return zones.find((z) => z.position === position) ?? null;
}

/**
 * Find the best safe zone for a field based on position and type preference.
 *
 * Priority:
 * 1. Exact position + type match
 * 2. Exact position + "both" type
 * 3. Exact position (any type)
 */
export function findBestZone(
  zones: ResolvedSafeZone[],
  position: Position,
  fieldType: "text" | "logo"
): ResolvedSafeZone | null {
  const positional = zones.filter((z) => z.position === position);
  if (positional.length === 0) return null;

  // Prefer exact type match
  const exact = positional.find((z) => z.type === fieldType);
  if (exact) return exact;

  // Then "both" type
  const both = positional.find((z) => z.type === "both");
  if (both) return both;

  // Fallback to first at that position
  return positional[0];
}
