#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_FILE="$ROOT_DIR/native/CalendarEdgeObjC/main_webview.m"

require_source() {
  local pattern="$1"
  local message="$2"
  if ! grep -Fq -- "$pattern" "$SOURCE_FILE"; then
    echo "FAIL: $message" >&2
    echo "Missing pattern: $pattern" >&2
    exit 1
  fi
}

reject_source() {
  local pattern="$1"
  local message="$2"
  if grep -Fq -- "$pattern" "$SOURCE_FILE"; then
    echo "FAIL: $message" >&2
    echo "Unexpected pattern: $pattern" >&2
    exit 1
  fi
}

require_source "static CGFloat const CETriggerZoneWidth = 40.0;" "bottom-left trigger width should stay compact enough not to block normal corner actions"
require_source "static CGFloat const CETriggerZoneHeight = 40.0;" "bottom-left trigger height should stay compact enough not to block normal corner actions"
require_source "NSRect screenFrame = targetScreen.frame;" "safe hover frame should use the physical screen frame, not visibleFrame"
require_source "NSMakeRect(NSMinX(screenFrame), NSMinY(screenFrame), CETriggerZoneWidth, CETriggerZoneHeight)" "safe hover frame should live in the physical bottom-left corner"
require_source "NSRect screenFrame = screen.frame;" "hotspot window should use the physical screen frame, not visibleFrame"
require_source "NSMakeRect(NSMinX(screenFrame), NSMinY(screenFrame), CETriggerZoneWidth, CETriggerZoneHeight)" "hotspot window should live in the physical bottom-left corner"
require_source "CGFloat x = offscreen ? NSMinX(visibleFrame) - width - CEPanelScreenInset : NSMinX(visibleFrame) + CEPanelScreenInset;" "panel should slide from the left side"
require_source "CGFloat y = NSMinY(visibleFrame) + CEPanelScreenInset;" "panel should align to the lower-left edge after bottom-left trigger"
require_source "@interface CEPanelWindow : NSPanel" "panel window class should remain available for menu handling"
require_source "- (void)setContextMenu:(NSMenu *)menu;" "panel window should expose context menu injection"
require_source "- (void)rightMouseUp:(NSEvent *)event" "right-click should be handled natively"
require_source "- (NSMenu *)calendarEdgeContextMenu" "app delegate should build a native context menu"
require_source "Restart Edgee" "context menu should use the Edgee app name for restart"
require_source "Quit Edgee" "context menu should use the Edgee app name for quit"
require_source "restartCalendarEdge:" "restart action should be implemented"
require_source "quitCalendarEdge:" "quit action should be implemented"
reject_source "NSMaxX(visibleFrame) - width, NSMinY(visibleFrame), width, visibleFrame.size.height" "old full-height right-edge hotspot should be removed"
reject_source "NSMaxX(visibleFrame) - width, NSMinY(visibleFrame), width, visibleFrame.size.height)" "old right-edge safe hover frame should be removed"
reject_source "offscreen ? NSMaxX(visibleFrame) + 10.0 : NSMaxX(visibleFrame) - width - 10.0" "old right-side panel position should be removed"
reject_source "return NSMakeRect(NSMinX(visibleFrame), NSMinY(visibleFrame), CETriggerZoneWidth, CETriggerZoneHeight)" "trigger should not be based on visibleFrame because Dock can move the bottom edge"

echo "Left trigger and context menu source checks passed."
