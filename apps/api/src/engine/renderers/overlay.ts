import sharp from "sharp";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { Language, Position } from "@ep/shared";
import { resolveAllSafeZones, findBestZone, type ResolvedSafeZone } from "../layout/safezone.js";
import { fitTextInBounds } from "../layout/text-measure.js";
import { ensureFontLoaded, getCanvasFont } from "../fonts/loader.js";
import { getGridCellBounds } from "../layout/grid.js";
import { logger } from "../../utils/logger.js";

/**
 * Overlay Renderer
 *
 * Renders text and logo overlays onto a base template image using:
 * - Sharp for base image loading/manipulation
 * - @napi-rs/canvas for text and logo overlay compositing
 *
 * No external AI API calls — fully local rendering.
 */

export interface OverlayField {
  fieldKey: string;
  value: string;
  fieldType: "TEXT" | "TEXTAREA" | "IMAGE" | "PHONE" | "EMAIL" | "URL" | "NUMBER" | "COLOR" | "SELECT";
  position: Position;
}

export interface OverlayOptions {
  baseImageUrl: string;
  baseImageBuffer?: Buffer;
  safeZones: Array<{
    id: string;
    type: "text" | "logo" | "both";
    x: number;
    y: number;
    width: number;
    height: number;
    padding: number;
    maxFontSize?: number;
    position: Position;
  }>;
  fields: OverlayField[];
  language: Language;
  imageWidth: number;
  imageHeight: number;
  /** If true, render at 25% scale with watermark (for preview) */
  preview?: boolean;
}

export interface OverlayResult {
  buffer: Buffer;
  width: number;
  height: number;
  format: "png";
}

/**
 * Render text and logo overlays onto the base template image.
 */
export async function renderOverlay(options: OverlayOptions): Promise<OverlayResult> {
  const {
    safeZones,
    fields,
    language,
    imageWidth,
    imageHeight,
    preview = false,
  } = options;

  // Determine output dimensions
  const scale = preview ? 0.25 : 1;
  const outWidth = Math.round(imageWidth * scale);
  const outHeight = Math.round(imageHeight * scale);

  // Ensure font is loaded for the selected language
  ensureFontLoaded(language);
  ensureFontLoaded("ENGLISH"); // Always have English as fallback

  // Load base image
  let baseBuffer: Buffer;
  if (options.baseImageBuffer) {
    baseBuffer = options.baseImageBuffer;
  } else {
    // Fetch from URL
    const response = await fetch(options.baseImageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch base image: ${response.status}`);
    }
    baseBuffer = Buffer.from(await response.arrayBuffer());
  }

  // Resize base image to output dimensions using Sharp
  const resizedBase = await sharp(baseBuffer)
    .resize(outWidth, outHeight, { fit: "fill" })
    .png()
    .toBuffer();

  // Create canvas for overlay compositing
  const canvas = createCanvas(outWidth, outHeight);
  const ctx = canvas.getContext("2d");

  // Draw resized base image onto canvas
  const baseImage = await loadImage(resizedBase);
  ctx.drawImage(baseImage, 0, 0, outWidth, outHeight);

  // Resolve safe zones to pixel coordinates (scaled)
  const resolvedZones = resolveAllSafeZones(safeZones, outWidth, outHeight);

  // Render each field
  for (const field of fields) {
    try {
      if (field.fieldType === "IMAGE") {
        await renderLogoField(ctx, field, resolvedZones, outWidth, outHeight);
      } else {
        renderTextField(ctx, field, resolvedZones, language, outWidth, outHeight);
      }
    } catch (err) {
      logger.warn({ fieldKey: field.fieldKey, err }, "Failed to render field, skipping");
    }
  }

  // Add watermark for preview mode
  if (preview) {
    renderWatermark(ctx, outWidth, outHeight);
  }

  // Export canvas to PNG buffer
  const outputBuffer = canvas.toBuffer("image/png");

  return {
    buffer: Buffer.from(outputBuffer),
    width: outWidth,
    height: outHeight,
    format: "png",
  };
}

// ─── Text Rendering ──────────────────────────────────────────

function renderTextField(
  ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  field: OverlayField,
  zones: ResolvedSafeZone[],
  language: Language,
  canvasWidth: number,
  canvasHeight: number
): void {
  // Find the best zone for this text field
  let zone = findBestZone(zones, field.position, "text");

  // Fallback to grid cell if no safe zone matches
  const bounds = zone
    ? zone.pixelBounds
    : getGridCellBounds(field.position, canvasWidth, canvasHeight, 20);

  const maxFontSize = zone?.maxFontSize ?? 48;

  // Fit text within bounds
  const measurement = fitTextInBounds(
    field.value,
    language,
    bounds.width,
    bounds.height,
    maxFontSize,
    8
  );

  // Draw text
  ctx.font = getCanvasFont(language, measurement.fontSize);
  ctx.fillStyle = "#FFFFFF";
  ctx.textBaseline = "top";

  // Add subtle text shadow for readability
  ctx.shadowColor = "rgba(0, 0, 0, 0.7)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;

  const lineHeight = measurement.fontSize * 1.3;
  const totalTextHeight = measurement.lines.length * lineHeight;

  // Center text vertically within bounds
  let startY = bounds.y + (bounds.height - totalTextHeight) / 2;

  for (const line of measurement.lines) {
    const lineMetrics = ctx.measureText(line);
    // Center text horizontally within bounds
    const startX = bounds.x + (bounds.width - lineMetrics.width) / 2;
    ctx.fillText(line, startX, startY);
    startY += lineHeight;
  }

  // Reset shadow
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

// ─── Logo Rendering ──────────────────────────────────────────

async function renderLogoField(
  ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  field: OverlayField,
  zones: ResolvedSafeZone[],
  canvasWidth: number,
  canvasHeight: number
): Promise<void> {
  const zone = findBestZone(zones, field.position, "logo");
  const bounds = zone
    ? zone.pixelBounds
    : getGridCellBounds(field.position, canvasWidth, canvasHeight, 20);

  // field.value is the logo URL
  const logoUrl = field.value;
  if (!logoUrl) return;

  // blob: URLs are browser-only (in-memory) and cannot be fetched server-side.
  // These happen when the user selects a logo in the browser but it hasn't been
  // uploaded to cloud storage yet. Skip gracefully.
  if (logoUrl.startsWith("blob:")) {
    logger.warn(
      { fieldKey: field.fieldKey },
      "Logo URL is a browser blob — cannot fetch server-side, skipping logo"
    );
    return;
  }

  try {
    const response = await fetch(logoUrl);
    if (!response.ok) return;
    const logoBuffer = Buffer.from(await response.arrayBuffer());

    // Get logo dimensions
    const logoMeta = await sharp(logoBuffer).metadata();
    if (!logoMeta.width || !logoMeta.height) return;

    // Calculate scaled size maintaining aspect ratio
    const aspectRatio = logoMeta.width / logoMeta.height;
    let logoWidth = bounds.width;
    let logoHeight = logoWidth / aspectRatio;

    if (logoHeight > bounds.height) {
      logoHeight = bounds.height;
      logoWidth = logoHeight * aspectRatio;
    }

    // Resize logo
    const resizedLogo = await sharp(logoBuffer)
      .resize(Math.round(logoWidth), Math.round(logoHeight), { fit: "inside" })
      .png()
      .toBuffer();

    const logoImage = await loadImage(resizedLogo);

    // Center logo within bounds
    const logoX = bounds.x + (bounds.width - logoWidth) / 2;
    const logoY = bounds.y + (bounds.height - logoHeight) / 2;

    ctx.drawImage(logoImage, logoX, logoY, logoWidth, logoHeight);
  } catch (err) {
    logger.warn({ logoUrl, err }, "Failed to load/render logo");
  }
}

// ─── Watermark ───────────────────────────────────────────────

function renderWatermark(
  ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  width: number,
  height: number
): void {
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold ${Math.round(Math.min(width, height) * 0.08)}px "Noto Sans"`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Diagonal watermark
  ctx.translate(width / 2, height / 2);
  ctx.rotate(-Math.PI / 4);
  ctx.fillText("PREVIEW", 0, 0);

  ctx.restore();
}
