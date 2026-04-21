#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_FILE="$ROOT_DIR/native/CalendarEdgeObjC/main_webview.m"
BUILD_DIR="$ROOT_DIR/build"
APP_DIR="$BUILD_DIR/CalendarEdge.app"
OBJ_DIR="$BUILD_DIR/obj"
EXECUTABLE="$APP_DIR/Contents/MacOS/CalendarEdge"
INSTALL_DIR="$HOME/Applications/CalendarEdge.app"

cd "$ROOT_DIR"
npm run build

rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources" "$OBJ_DIR"

clang \
  -fobjc-arc \
  -framework AppKit \
  -framework EventKit \
  -framework QuartzCore \
  -framework WebKit \
  -o "$EXECUTABLE" \
  "$SOURCE_FILE"

cp "$ROOT_DIR/native/CalendarEdge/Support/Info.plist" "$APP_DIR/Contents/Info.plist"
rm -rf "$APP_DIR/Contents/Resources/WebUI"
cp -R "$ROOT_DIR/dist" "$APP_DIR/Contents/Resources/WebUI"

# 移除 crossorigin 属性：WKWebView 加载 file:// 时 crossorigin 触发 CORS 失败导致白屏
sed -i '' 's/ crossorigin="[^"]*"//g; s/ crossorigin//g' \
  "$APP_DIR/Contents/Resources/WebUI/index.html"

codesign --force --deep --sign - "$APP_DIR" >/dev/null

mkdir -p "$HOME/Applications"
rm -rf "$INSTALL_DIR"
cp -R "$APP_DIR" "$INSTALL_DIR"

echo "Built app bundle at $APP_DIR"
echo "Installed app at $INSTALL_DIR"
