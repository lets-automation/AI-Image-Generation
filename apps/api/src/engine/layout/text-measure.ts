import { createCanvas } from "@napi-rs/canvas";
import type { Language } from "@ep/shared";
import { getCanvasFont } from "../fonts/loader.js";

/**
 * Text measurement utilities for computing font sizes that fit within bounds.
 *
 * Uses a hidden canvas to measure text metrics before rendering on the actual image.
 */

// Canvas context type from @napi-rs/canvas
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CanvasCtx = any;

// Reuse a single measurement context for performance
let measureCtx: CanvasCtx = null;

function getMeasureCtx(): CanvasCtx {
  if (!measureCtx) {
    const canvas = createCanvas(1, 1);
    measureCtx = canvas.getContext("2d");
  }
  return measureCtx;
}

export interface TextMeasurement {
  width: number;
  height: number;
  fontSize: number;
  lines: string[];
}

/**
 * Measure text at a given font size.
 * Returns the width and height needed to render the text.
 */
export function measureText(
  text: string,
  language: Language,
  fontSize: number
): { width: number; height: number } {
  const ctx = getMeasureCtx();
  ctx.font = getCanvasFont(language, fontSize);
  const metrics = ctx.measureText(text);
  return {
    width: metrics.width,
    height: fontSize * 1.2, // line height approximation
  };
}

/**
 * Calculate the maximum font size that fits text within given bounds.
 *
 * Supports multi-line wrapping: tries to fit text by wrapping at word
 * boundaries. Uses binary search for efficiency.
 *
 * @param text - The text to render
 * @param language - Language (determines font)
 * @param maxWidth - Maximum width in pixels
 * @param maxHeight - Maximum height in pixels
 * @param maxFontSize - Upper bound for font size (from safe zone config)
 * @param minFontSize - Lower bound before giving up (default 8px)
 */
export function fitTextInBounds(
  text: string,
  language: Language,
  maxWidth: number,
  maxHeight: number,
  maxFontSize = 72,
  minFontSize = 8
): TextMeasurement {
  const ctx = getMeasureCtx();
  let bestFit: TextMeasurement | null = null;

  // Binary search for optimal font size
  let lo = minFontSize;
  let hi = maxFontSize;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    ctx.font = getCanvasFont(language, mid);
    const lines = wrapText(ctx, text, maxWidth);
    const lineHeight = mid * 1.3;
    const totalHeight = lines.length * lineHeight;
    const maxLineWidth = Math.max(...lines.map((l) => ctx.measureText(l).width));

    if (maxLineWidth <= maxWidth && totalHeight <= maxHeight) {
      bestFit = {
        width: maxLineWidth,
        height: totalHeight,
        fontSize: mid,
        lines,
      };
      lo = mid + 1; // Try larger
    } else {
      hi = mid - 1; // Too big
    }
  }

  // If nothing fits, use minimum size
  if (!bestFit) {
    ctx.font = getCanvasFont(language, minFontSize);
    const lines = wrapText(ctx, text, maxWidth);
    bestFit = {
      width: Math.max(...lines.map((l) => ctx.measureText(l).width), 0),
      height: lines.length * minFontSize * 1.3,
      fontSize: minFontSize,
      lines,
    };
  }

  return bestFit;
}

/**
 * Wrap text to fit within maxWidth by breaking at word boundaries.
 */
export function wrapText(
  ctx: { measureText: (text: string) => { width: number } },
  text: string,
  maxWidth: number
): string[] {
  if (maxWidth <= 0) return [text];

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const measurement = ctx.measureText(testLine);

    if (measurement.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [""];
}
