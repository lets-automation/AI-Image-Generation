/**
 * Image orientation options for user-facing generation.
 * Users pick an orientation; the system maps it to provider-specific sizes.
 */

export const Orientation = {
  SQUARE: "SQUARE",
  SQUARE_HD: "SQUARE_HD",
  PORTRAIT: "PORTRAIT",
  LANDSCAPE: "LANDSCAPE",
  STORY: "STORY",
  WIDE: "WIDE",
} as const;

export type Orientation = (typeof Orientation)[keyof typeof Orientation];

export interface OrientationConfig {
  code: Orientation;
  label: string;
  description: string;
  /** Aspect ratio as width:height */
  ratio: string;
  /** Default pixel dimensions (width x height) */
  width: number;
  height: number;
  icon: string; // CSS class or emoji hint for UI
}

export const ORIENTATION_CONFIGS: Record<Orientation, OrientationConfig> = {
  SQUARE: {
    code: "SQUARE",
    label: "Square",
    description: "1:1 — Instagram posts, profile pictures",
    ratio: "1:1",
    width: 1024,
    height: 1024,
    icon: "square",
  },
  SQUARE_HD: {
    code: "SQUARE_HD",
    label: "Square HD",
    description: "1:1 2K — High-resolution prints, large displays",
    ratio: "1:1",
    width: 2048,
    height: 2048,
    icon: "square_hd",
  },
  PORTRAIT: {
    code: "PORTRAIT",
    label: "Portrait",
    description: "3:4 — Posters, flyers, Pinterest pins",
    ratio: "3:4",
    width: 768,
    height: 1024,
    icon: "portrait",
  },
  LANDSCAPE: {
    code: "LANDSCAPE",
    label: "Landscape",
    description: "4:3 — Presentations, banners",
    ratio: "4:3",
    width: 1024,
    height: 768,
    icon: "landscape",
  },
  STORY: {
    code: "STORY",
    label: "Story",
    description: "9:16 — Instagram/WhatsApp stories, reels",
    ratio: "9:16",
    width: 576,
    height: 1024,
    icon: "story",
  },
  WIDE: {
    code: "WIDE",
    label: "Wide",
    description: "16:9 — YouTube thumbnails, covers",
    ratio: "16:9",
    width: 1024,
    height: 576,
    icon: "wide",
  },
};

export const ALL_ORIENTATIONS = Object.values(Orientation);

/**
 * Map orientation to OpenAI size parameter.
 * OpenAI accepts specific size strings.
 * SQUARE_HD maps to 1024x1024 — OpenAI max square is 1024x1024,
 * the pipeline upscales to 2048x2048 via Sharp Lanczos resampling.
 */
export const OPENAI_SIZE_MAP: Record<Orientation, string> = {
  SQUARE: "1024x1024",
  SQUARE_HD: "1024x1024", // Generate at max native, upscale to 2048 via Sharp
  PORTRAIT: "1024x1536",
  LANDSCAPE: "1536x1024",
  STORY: "1024x1536",  // Closest supported (OpenAI doesn't have 9:16, use portrait)
  WIDE: "1536x1024",   // Closest supported
};

/**
 * Map orientation to Ideogram aspect_ratio enum.
 */
export const IDEOGRAM_ASPECT_MAP: Record<Orientation, string> = {
  SQUARE: "ASPECT_1_1",
  SQUARE_HD: "ASPECT_1_1", // Same 1:1 ratio, upscaled to 2048 via Sharp
  PORTRAIT: "ASPECT_3_4",
  LANDSCAPE: "ASPECT_4_3",
  STORY: "ASPECT_9_16",
  WIDE: "ASPECT_16_9",
};
