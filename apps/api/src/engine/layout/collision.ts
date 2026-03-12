import type { Position } from "@ep/shared";

/**
 * Collision detection for positioned fields on the 9-position grid.
 *
 * Multiple fields cannot occupy the same position unless the template
 * has multiple safe zones at that position.
 */

export interface PositionConflict {
  position: Position;
  fieldKeys: string[];
}

/**
 * Detect position conflicts in a field→position mapping.
 *
 * Returns an array of conflicts where 2+ fields share the same position.
 * An empty array means no conflicts.
 */
export function detectPositionConflicts(
  positionMap: Record<string, Position>
): PositionConflict[] {
  const groups: Record<string, string[]> = {};

  for (const [fieldKey, position] of Object.entries(positionMap)) {
    if (!groups[position]) groups[position] = [];
    groups[position].push(fieldKey);
  }

  return Object.entries(groups)
    .filter(([, keys]) => keys.length > 1)
    .map(([position, fieldKeys]) => ({
      position: position as Position,
      fieldKeys,
    }));
}

/**
 * Check if the position map has any conflicts.
 */
export function hasConflicts(positionMap: Record<string, Position>): boolean {
  return detectPositionConflicts(positionMap).length > 0;
}

/**
 * Count how many safe zones are available at each position.
 * Used to determine if multiple fields can coexist at a position.
 */
export function countZonesPerPosition(
  safeZones: Array<{ position: Position }>
): Record<Position, number> {
  const counts = {} as Record<Position, number>;
  for (const zone of safeZones) {
    counts[zone.position] = (counts[zone.position] ?? 0) + 1;
  }
  return counts;
}

/**
 * Validate that assigned positions don't exceed available safe zones.
 *
 * @returns Array of conflicts where more fields are assigned to a position
 *          than there are safe zones for it.
 */
export function validatePositionCapacity(
  positionMap: Record<string, Position>,
  safeZones: Array<{ position: Position }>
): PositionConflict[] {
  const zoneCounts = countZonesPerPosition(safeZones);
  const fieldGroups: Record<string, string[]> = {};

  for (const [fieldKey, position] of Object.entries(positionMap)) {
    if (!fieldGroups[position]) fieldGroups[position] = [];
    fieldGroups[position].push(fieldKey);
  }

  return Object.entries(fieldGroups)
    .filter(([position, keys]) => keys.length > (zoneCounts[position as Position] ?? 0))
    .map(([position, fieldKeys]) => ({
      position: position as Position,
      fieldKeys,
    }));
}
