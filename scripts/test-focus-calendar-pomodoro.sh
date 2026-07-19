#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_FILE="$ROOT_DIR/src/App.jsx"
STYLE_FILE="$ROOT_DIR/src/styles.css"
WORKBENCH_FILE="$ROOT_DIR/src/Workbench.jsx"
WORKBENCH_STYLE_FILE="$ROOT_DIR/src/workbench.css"
NATIVE_FILE="$ROOT_DIR/native/CalendarEdgeObjC/main_webview.m"
INFO_FILE="$ROOT_DIR/native/CalendarEdge/Support/Info.plist"
BUILD_SCRIPT="$ROOT_DIR/scripts/build-calendar-edge-app.sh"

require_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "Missing required file: $file" >&2
    exit 1
  fi
}

require_source() {
  local file="$1"
  local pattern="$2"
  local message="$3"
  if ! grep -Fq -- "$pattern" "$file"; then
    echo "FAIL: $message" >&2
    echo "Missing pattern: $pattern" >&2
    echo "File: $file" >&2
    exit 1
  fi
}

reject_source() {
  local file="$1"
  local pattern="$2"
  local message="$3"
  if grep -Fq -- "$pattern" "$file"; then
    echo "FAIL: $message" >&2
    echo "Unexpected pattern: $pattern" >&2
    echo "File: $file" >&2
    exit 1
  fi
}

require_file "$APP_FILE"
require_file "$STYLE_FILE"
require_file "$WORKBENCH_FILE"
require_file "$WORKBENCH_STYLE_FILE"
require_file "$NATIVE_FILE"
require_file "$INFO_FILE"
require_file "$BUILD_SCRIPT"

# --- 两段式面板（2c 紧凑 + 2a 工作台） ---
require_source "$APP_FILE" "function CompactPanel(" "Compact quick panel (2c) should be the default summoned view"
require_source "$APP_FILE" "import Workbench from './Workbench';" "Expanded workbench (2a) should use the active Workbench module"
require_source "$WORKBENCH_FILE" "const NAV_ICONS" "Workbench should have icon navigation"
require_source "$WORKBENCH_FILE" "function DayPanel(" "Workbench should include the selected-day detail panel"
require_source "$APP_FILE" "postNativeMessage('setPanelMode'" "Panel mode changes should be forwarded to native"
require_source "$APP_FILE" "PANEL_MODE_STORAGE_KEY" "Panel mode should persist across sessions"

# --- 快速捕捉（Hermes） ---
require_source "$APP_FILE" "function QuickCaptureInput(" "Quick capture input should replace the Hermes FAB"
require_source "$APP_FILE" "postNativeMessage('sendHermesPrompt'" "Quick capture should send text through the Send to Hermes Shortcut"
require_source "$APP_FILE" "CAPTURE_REFRESH_DELAYS_MS" "Capture success should schedule delayed EventKit refreshes"
reject_source "$APP_FILE" "hermes-fab" "Hermes floating action button should be removed"
reject_source "$APP_FILE" "HermesComposer" "HermesComposer component should be removed"

# --- 视图模型派生 ---
require_source "$APP_FILE" "function parseEventMeta(" "Priority/deadline should be parsed from title markers"
require_source "$APP_FILE" "function detectConflicts(" "Overlapping timed events should be detected"
require_source "$APP_FILE" "function buildDeadlines(" "Deadline countdown items should be aggregated"
require_source "$APP_FILE" "function nowDividerIndex(" "Now divider position should be derived from event times"
require_source "$APP_FILE" "function NowDivider(" "Current-time divider component should exist"
require_source "$APP_FILE" "function DeadlineStrip(" "Deadline countdown strip component should exist"

# --- 番茄钟（25 分钟 + 事件绑定） ---
require_source "$APP_FILE" "const POMODORO_DURATION_SECONDS = 25 * 60;" "Pomodoro should keep the fixed 25-minute focus duration"
require_source "$APP_FILE" "function handlePomodoroStartForEvent(" "Focus should be startable from a specific event"
require_source "$APP_FILE" "pomodoroBoundTitle" "Pomodoro should carry the bound event title"
require_source "$APP_FILE" "postNativeMessage('schedulePomodoroNotification'" "Pomodoro start/resume should schedule a native notification"
require_source "$APP_FILE" "postNativeMessage('cancelPomodoroNotification')" "Pomodoro pause/stop should cancel the native notification"

# --- 月历工作台 ---
require_source "$WORKBENCH_FILE" "function MonthView(" "Calendar month page should be split out of the main workbench render"
require_source "$WORKBENCH_FILE" "function DayPanel(" "Selected-day action center should exist"
require_source "$WORKBENCH_FILE" "spreadInstances(" "Calendar view should group event instances across visible days"
require_source "$WORKBENCH_FILE" "remindersForSelectedDay" "Selected-day action center should follow the selected date"
require_source "$APP_FILE" "postNativeMessage('setCalendarMonth'" "Calendar page should request native month data when month changes"
require_source "$APP_FILE" "conflictDayKeys" "Month cells should surface time-conflict days"
require_source "$APP_FILE" "toggleThemeFromMenu()" "Native context menu theme hook should remain a safe no-op"
reject_source "$APP_FILE" "function FocusView(" "Legacy FocusView should be removed"
reject_source "$APP_FILE" "function TasksView(" "Legacy TasksView should be removed"

# --- Edgee 月历信息效率与当日行动中心 ---
require_source "$WORKBENCH_FILE" "function MonthView(" "Expanded workbench should keep a dedicated month view"
require_source "$WORKBENCH_FILE" "remindersByDay" "Dated reminders should be grouped for month/day use"
require_source "$WORKBENCH_FILE" "remindersForSelectedDay" "Selected day should aggregate its reminders"
require_source "$WORKBENCH_FILE" "weekRowCount" "Month grid should adapt between four and six week rows"
require_source "$WORKBENCH_FILE" "baseVisibleCount" "Month chip capacity should adapt to available row height"
require_source "$WORKBENCH_FILE" "densityOffset" "Month density should support simple, standard, and compact modes"
require_source "$WORKBENCH_FILE" "['simple', '精简']" "Settings should expose the three requested density modes"
require_source "$WORKBENCH_FILE" "activeEventUid" "Month event selection should be separate from editing"
require_source "$WORKBENCH_FILE" "onDoubleClick={(evt)" "Month event double click should explicitly open editing"
require_source "$WORKBENCH_FILE" "function ConflictResolutionDialog(" "Conflict changes should have a confirmation preview"
require_source "$WORKBENCH_FILE" "nextFreeSlot(byDay[dateKey]" "Conflict preview should choose a genuinely free slot"
require_source "$WORKBENCH_FILE" "仅保存在本机，不修改 Apple Calendar" "Local event completion semantics should be explicit"
require_source "$WORKBENCH_FILE" "当日行动中心" "Selected day should be presented as a unified action center"
reject_source "$WORKBENCH_FILE" "<span className=\"xr-chip-time\"" "Month chips should not render event times"
require_source "$WORKBENCH_STYLE_FILE" ".xr-day-section" "Daily event/reminder groups should be styled"
require_source "$WORKBENCH_STYLE_FILE" ".xr-conflict-dialog" "Conflict preview should be styled"
require_source "$INFO_FILE" "<string>Edgee</string>" "Edgee should remain the user-facing app name"
reject_source "$INFO_FILE" "Edgee（CalendarEdge）" "Permission copy should not mix the visible and internal names"

# --- 样式 ---
require_source "$STYLE_FILE" ".compact-panel" "Compact panel styles should exist"
require_source "$STYLE_FILE" ".quick-capture" "Quick capture styles should exist"
require_source "$STYLE_FILE" ".next-up-card" "Next-up focus card styles should exist"
require_source "$STYLE_FILE" ".now-divider" "Current-time divider styles should exist"
require_source "$STYLE_FILE" ".deadline-capsule" "Deadline capsule styles should exist"
require_source "$STYLE_FILE" ".mini-week-strip" "Mini week strip styles should exist"
require_source "$STYLE_FILE" ".workbench" "Workbench grid styles should exist"
require_source "$STYLE_FILE" ".icon-rail" "Icon rail styles should exist"
require_source "$STYLE_FILE" ".day-detail-aside" "Day detail aside styles should exist"
require_source "$STYLE_FILE" ".surface-cream" "Cream month workspace scope should exist"
require_source "$STYLE_FILE" ".conflict-badge" "Conflict badge styles should exist"
require_source "$STYLE_FILE" ".pomodoro-card" "Pomodoro card styles should exist"
require_source "$STYLE_FILE" ".month-grid" "Month calendar grid styles should exist"
require_source "$STYLE_FILE" ".calendar-day.is-selected" "Selected day styles should exist"
require_source "$STYLE_FILE" ".event-chip" "Calendar event chip styles should exist"
require_source "$STYLE_FILE" ".action-center-header" "Action center header styles should exist"
require_source "$STYLE_FILE" ".action-summary-card" "Action summary styles should exist"
reject_source "$STYLE_FILE" "hermes-fab" "Hermes FAB styles should be removed"

# --- 原生 ---
require_source "$NATIVE_FILE" "#import <UserNotifications/UserNotifications.h>" "Native app should import UserNotifications"
require_source "$NATIVE_FILE" "schedulePomodoroNotification" "Native bridge should handle Pomodoro notification scheduling"
require_source "$NATIVE_FILE" "cancelPomodoroNotification" "Native bridge should handle Pomodoro notification cancellation"
require_source "$NATIVE_FILE" "setCalendarMonth" "Native bridge should handle calendar month changes"
require_source "$NATIVE_FILE" "calendarRange" "Snapshots should include a calendar range"
require_source "$NATIVE_FILE" "requestAuthorizationWithOptions" "Notification permission should be requested before scheduling"
require_source "$NATIVE_FILE" "removePendingNotificationRequestsWithIdentifiers" "Pause/stop should cancel pending Pomodoro notifications"
require_source "$NATIVE_FILE" "Toggle Theme" "Native context menu should expose theme switching"
require_source "$NATIVE_FILE" "Refresh" "Native context menu should expose refresh"
require_source "$NATIVE_FILE" "Open Calendar" "Native context menu should expose opening Calendar"
require_source "$NATIVE_FILE" "Open Reminders" "Native context menu should expose opening Reminders"
require_source "$NATIVE_FILE" "static CGFloat const CECompactPanelWidth = 440.0;" "Compact panel should be 440pt wide"
require_source "$NATIVE_FILE" "static CGFloat const CEExpandedPanelWidth = 1240.0;" "Expanded workbench should be 1240pt wide"
require_source "$NATIVE_FILE" "CEPanelModeDefaultsKey" "Panel mode should persist in NSUserDefaults"
require_source "$NATIVE_FILE" "setPanelModeString" "Native should handle animated panel mode switches"
require_source "$NATIVE_FILE" "MIN(targetSize.width, visibleFrame.size.width - CEPanelScreenInset * 2.0)" "Native panel should shrink on narrow screens"
require_source "$NATIVE_FILE" "stopMouseWatcher" "Mode switch should suppress the mouse watcher during resize"
reject_source "$NATIVE_FILE" "components.day = 8;" "EventKit fetch should no longer be fixed to only 8 days"
reject_source "$NATIVE_FILE" "CEPanelWidth = 980.0" "Legacy single-size panel constants should be removed"

require_source "$BUILD_SCRIPT" "-framework UserNotifications" "Build script should link UserNotifications"

echo "Two-stage panel, month workbench, and Pomodoro source checks passed."
