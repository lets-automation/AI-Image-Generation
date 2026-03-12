#!/bin/bash
# Download required Noto Sans font files for all 10 supported languages.
# Run this script from the fonts/ directory.
# These are all OFL-licensed fonts from Google Fonts.

ASSETS_DIR="$(dirname "$0")/assets"
mkdir -p "$ASSETS_DIR"

echo "Downloading Noto Sans font families..."

# Base URL for Google Fonts static downloads via jsDelivr CDN
CDN="https://cdn.jsdelivr.net/gh/google/fonts@main/ofl"

# English (Latin) — base font
curl -L -o "$ASSETS_DIR/NotoSans-Regular.ttf" \
  "$CDN/notosans/NotoSans-Regular.ttf"
curl -L -o "$ASSETS_DIR/NotoSans-Bold.ttf" \
  "$CDN/notosans/NotoSans-Bold.ttf"

# Hindi (Devanagari)
curl -L -o "$ASSETS_DIR/NotoSansDevanagari-Regular.ttf" \
  "$CDN/notosansdevanagari/NotoSansDevanagari-Regular.ttf"

# Arabic
curl -L -o "$ASSETS_DIR/NotoSansArabic-Regular.ttf" \
  "$CDN/notosansarabic/NotoSansArabic-Regular.ttf"

# Japanese
curl -L -o "$ASSETS_DIR/NotoSansJP-Regular.ttf" \
  "$CDN/notosansjp/NotoSansJP-Regular.ttf"

# Chinese Simplified
curl -L -o "$ASSETS_DIR/NotoSansSC-Regular.ttf" \
  "$CDN/notosanssc/NotoSansSC-Regular.ttf"

# Korean
curl -L -o "$ASSETS_DIR/NotoSansKR-Regular.ttf" \
  "$CDN/notosanskr/NotoSansKR-Regular.ttf"

echo ""
echo "Done! Expected files in $ASSETS_DIR:"
ls -la "$ASSETS_DIR"/*.ttf 2>/dev/null || echo "No .ttf files found"
echo ""
echo "Required files:"
echo "  NotoSans-Regular.ttf, NotoSans-Bold.ttf (Latin: EN, ES, FR, PT, DE)"
echo "  NotoSansDevanagari-Regular.ttf (Hindi)"
echo "  NotoSansArabic-Regular.ttf (Arabic)"
echo "  NotoSansJP-Regular.ttf (Japanese)"
echo "  NotoSansSC-Regular.ttf (Chinese)"
echo "  NotoSansKR-Regular.ttf (Korean)"
echo ""
echo "Note: CJK fonts are large (~15-20MB each). This is normal."
