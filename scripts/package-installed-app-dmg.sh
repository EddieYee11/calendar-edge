#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEFAULT_APP_PATH="$HOME/Applications/CalendarEdge.app"
FALLBACK_APP_PATH="/Applications/CalendarEdge.app"
APP_PATH="${1:-}"

if [[ -z "$APP_PATH" ]]; then
  if [[ -d "$DEFAULT_APP_PATH" ]]; then
    APP_PATH="$DEFAULT_APP_PATH"
  elif [[ -d "$FALLBACK_APP_PATH" ]]; then
    APP_PATH="$FALLBACK_APP_PATH"
  else
    echo "Could not find CalendarEdge.app in $DEFAULT_APP_PATH or $FALLBACK_APP_PATH" >&2
    exit 1
  fi
fi

if [[ ! -d "$APP_PATH" ]]; then
  echo "App bundle not found: $APP_PATH" >&2
  exit 1
fi

APP_NAME="$(basename "$APP_PATH" .app)"
INFO_PLIST="$APP_PATH/Contents/Info.plist"
BUILD_DIR="$ROOT_DIR/build"
STAGING_DIR="$BUILD_DIR/dmg-staging"
TEMP_DMG="$BUILD_DIR/${APP_NAME}-temp.dmg"

VERSION="$(
  /usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$INFO_PLIST" 2>/dev/null ||
  /usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$INFO_PLIST"
)"

OUTPUT_DMG="$BUILD_DIR/${APP_NAME}-v${VERSION}-installed-macOS.dmg"
VOLUME_NAME="${APP_NAME} ${VERSION}"

rm -rf "$STAGING_DIR"
rm -f "$TEMP_DMG" "$OUTPUT_DMG"
mkdir -p "$STAGING_DIR"

ditto "$APP_PATH" "$STAGING_DIR/${APP_NAME}.app"
ln -s /Applications "$STAGING_DIR/Applications"

hdiutil create \
  -volname "$VOLUME_NAME" \
  -srcfolder "$STAGING_DIR" \
  -ov \
  -format UDRW \
  "$TEMP_DMG" >/dev/null

hdiutil convert \
  "$TEMP_DMG" \
  -ov \
  -format UDZO \
  -imagekey zlib-level=9 \
  -o "$OUTPUT_DMG" >/dev/null

rm -f "$TEMP_DMG"
rm -rf "$STAGING_DIR"

echo "Created DMG at $OUTPUT_DMG"
