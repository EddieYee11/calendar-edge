# Left Trigger Context Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move CalendarEdge activation to the bottom-left corner, slide the panel from the left, and expose Restart/Quit through a native right-click menu.

**Architecture:** Keep the change in the active Objective-C app path. Add a source-level regression script first, then update hotspot geometry, panel geometry, and native context menu handling in `main_webview.m`.

**Tech Stack:** Objective-C, AppKit, WKWebView, zsh regression script, existing Vite build.

---

### Task 1: Regression Script

**Files:**
- Create: `scripts/test-left-trigger-context-menu.sh`

- [ ] **Step 1: Write the failing regression script**

```zsh
#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_FILE="$ROOT_DIR/native/CalendarEdgeObjC/main_webview.m"

require_source() {
  local pattern="$1"
  local message="$2"
  if ! grep -Fq "$pattern" "$SOURCE_FILE"; then
    echo "FAIL: $message" >&2
    echo "Missing pattern: $pattern" >&2
    exit 1
  fi
}

reject_source() {
  local pattern="$1"
  local message="$2"
  if grep -Fq "$pattern" "$SOURCE_FILE"; then
    echo "FAIL: $message" >&2
    echo "Unexpected pattern: $pattern" >&2
    exit 1
  fi
}

require_source "static CGFloat const CETriggerZoneWidth = 112.0;" "bottom-left trigger width should be a named constant"
require_source "static CGFloat const CETriggerZoneHeight = 96.0;" "bottom-left trigger height should be a named constant"
require_source "NSMakeRect(NSMinX(visibleFrame), NSMinY(visibleFrame), CETriggerZoneWidth, CETriggerZoneHeight)" "safe hover frame should live in the bottom-left corner"
require_source "CGFloat x = offscreen ? NSMinX(visibleFrame) - width - CEPanelScreenInset : NSMinX(visibleFrame) + CEPanelScreenInset;" "panel should slide from the left side"
require_source "@interface CEPanelWindow : NSPanel" "panel window class should remain available for menu handling"
require_source "- (void)setContextMenu:(NSMenu *)menu;" "panel window should expose context menu injection"
require_source "- (void)rightMouseUp:(NSEvent *)event" "right-click should be handled natively"
require_source "- (NSMenu *)calendarEdgeContextMenu" "app delegate should build a native context menu"
require_source "Restart CalendarEdge" "context menu should include restart"
require_source "Quit CalendarEdge" "context menu should include quit"
require_source "restartCalendarEdge:" "restart action should be implemented"
require_source "quitCalendarEdge:" "quit action should be implemented"
reject_source "NSMaxX(visibleFrame) - width, NSMinY(visibleFrame), width, visibleFrame.size.height" "old full-height right-edge hotspot should be removed"
reject_source "NSMaxX(visibleFrame) - width, NSMinY(visibleFrame), width, visibleFrame.size.height)" "old right-edge safe hover frame should be removed"
reject_source "offscreen ? NSMaxX(visibleFrame) + 10.0 : NSMaxX(visibleFrame) - width - 10.0" "old right-side panel position should be removed"

echo "Left trigger and context menu source checks passed."
```

- [ ] **Step 2: Run it and verify it fails**

Run: `chmod +x scripts/test-left-trigger-context-menu.sh && ./scripts/test-left-trigger-context-menu.sh`

Expected: fails because `CETriggerZoneWidth` and menu handling are not implemented yet.

### Task 2: Native Behavior

**Files:**
- Modify: `native/CalendarEdgeObjC/main_webview.m`

- [ ] **Step 1: Add shared trigger/panel constants**
- [ ] **Step 2: Let `CEPanelWindow` show an injected context menu on right-click**
- [ ] **Step 3: Let `CEHotspotView` show the same context menu on right-click**
- [ ] **Step 4: Change hotspot and safe hover geometry to bottom-left**
- [ ] **Step 5: Change panel frame to slide in from the left**
- [ ] **Step 6: Add `calendarEdgeContextMenu`, `restartCalendarEdge:`, and `quitCalendarEdge:` to `CEAppDelegate`**
- [ ] **Step 7: Inject the menu into the panel controller and hotspot window**

### Task 3: Verification

**Files:**
- Run: `./scripts/test-left-trigger-context-menu.sh`
- Run: `npm run build`
- Run: `./scripts/build-calendar-edge-app.sh`

- [ ] **Step 1: Run source regression**
- [ ] **Step 2: Run web build**
- [ ] **Step 3: Build and install native app**
- [ ] **Step 4: Update progress files with evidence**
