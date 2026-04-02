import sharp from "sharp";

/**
 * Smart Resize Utility
 *
 * Resizes an AI-generated image to exact target dimensions WITHOUT cropping.
 *
 * Strategy:
 * 1. If the aspect ratios are close (within 8%), use `fit: "fill"` —
 *    the slight stretch is imperceptible but preserves all content.
 * 2. If the aspect ratios differ significantly, use "contain" fit
 *    with a blurred version of the image as background fill —
 *    visually appealing, no content loss, no ugly padding bars.
 *
 * This replaces `fit: "cover"` which CROPS the image, cutting off
 * text at the edges — a critical defect for poster generation.
 */
export async function resizeToTarget(
  imageBuffer: Buffer,
  targetWidth: number,
  targetHeight: number
): Promise<Buffer> {
  const meta = await sharp(imageBuffer).metadata();
  const srcWidth = meta.width ?? targetWidth;
  const srcHeight = meta.height ?? targetHeight;

  // If already exact match, just ensure PNG format
  if (srcWidth === targetWidth && srcHeight === targetHeight) {
    return sharp(imageBuffer).png().toBuffer();
  }

  const srcRatio = srcWidth / srcHeight;
  const targetRatio = targetWidth / targetHeight;
  const ratioDiff = Math.abs(srcRatio - targetRatio) / Math.max(targetRatio, 0.001);

  // Close aspect ratios → fill (imperceptible distortion, preserves all content)
  if (ratioDiff < 0.08) {
    return sharp(imageBuffer)
      .resize(targetWidth, targetHeight, { fit: "fill" })
      .png()
      .toBuffer();
  }

  // Significant aspect ratio mismatch → contain + blurred background fill
  // 1. Create blurred background (cover crop is fine for a blurred fill layer)
  const blurredBg = await sharp(imageBuffer)
    .resize(targetWidth, targetHeight, { fit: "cover", position: "center" })
    .blur(30)
    .modulate({ brightness: 0.65 })
    .png()
    .toBuffer();

  // 2. Resize original content to fit inside target (no crop, no distortion)
  const contained = await sharp(imageBuffer)
    .resize(targetWidth, targetHeight, { fit: "inside" })
    .png()
    .toBuffer();

  // 3. Get actual contained dimensions for centering
  const containedMeta = await sharp(contained).metadata();
  const cw = containedMeta.width ?? targetWidth;
  const ch = containedMeta.height ?? targetHeight;

  // 4. Composite: sharp content centered on blurred background
  return sharp(blurredBg)
    .composite([{
      input: contained,
      left: Math.round((targetWidth - cw) / 2),
      top: Math.round((targetHeight - ch) / 2),
    }])
    .png()
    .toBuffer();
}
