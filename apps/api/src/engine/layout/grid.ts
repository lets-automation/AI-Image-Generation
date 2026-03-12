import type { Position } from "@ep/shared";
import { GRID_ROWS, GRID_COLS, POSITION_LABELS } from "@ep/shared";

/**
 * Pixel bounds for a positioned element on the canvas.
 */
export interface PixelBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Calculate pixel bounds for a 9-position grid cell.
 *
 * Divides the canvas into a 3x3 grid (equal cells) and returns
 * the pixel coordinates for the given position.
 *
 * @param position - One of the 9 grid positions
 * @param canvasWidth - Total canvas width in pixels
 * @param canvasHeight - Total canvas height in pixels
 * @param padding - Inner padding per cell in pixels (default 10)
 */
export function getGridCellBounds(
  position: Position,
  canvasWidth: number,
  canvasHeight: number,
  padding = 10
): PixelBounds {
  const posInfo = POSITION_LABELS[position];
  const cellWidth = canvasWidth / GRID_COLS;
  const cellHeight = canvasHeight / GRID_ROWS;

  return {
    x: posInfo.col * cellWidth + padding,
    y: posInfo.row * cellHeight + padding,
    width: cellWidth - padding * 2,
    height: cellHeight - padding * 2,
  };
}

/**
 * Get all 9 grid cell bounds for a given canvas size.
 */
export function getAllGridCells(
  canvasWidth: number,
  canvasHeight: number,
  padding = 10
): Record<Position, PixelBounds> {
  const result = {} as Record<Position, PixelBounds>;
  for (const pos of Object.keys(POSITION_LABELS) as Position[]) {
    result[pos] = getGridCellBounds(pos, canvasWidth, canvasHeight, padding);
  }
  return result;
}

/**
 * Check if two pixel bounds overlap.
 */
export function boundsOverlap(a: PixelBounds, b: PixelBounds): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}
