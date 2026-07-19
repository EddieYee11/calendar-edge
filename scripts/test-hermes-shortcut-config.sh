#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_FILE="$ROOT_DIR/native/CalendarEdgeObjC/main_webview.m"
PLIST_FILE="$ROOT_DIR/native/CalendarEdge/Support/Info.plist"

require_source() {
  local pattern="$1"
  local message="$2"
  if ! grep -Fq -- "$pattern" "$SOURCE_FILE"; then
    echo "FAIL: $message" >&2
    exit 1
  fi
}

reject_source() {
  local pattern="$1"
  local message="$2"
  if grep -Fq -- "$pattern" "$SOURCE_FILE"; then
    echo "FAIL: $message" >&2
    exit 1
  fi
}

require_source 'static NSString * const CEHermesShortcutName = @"Send to Hermes";' "Shortcut name should stay stable"
require_source 'task.executableURL = [NSURL fileURLWithPath:@"/usr/bin/shortcuts"];' "Hermes capture should use the system Shortcuts CLI"
require_source 'task.arguments = @[@"run", CEHermesShortcutName, @"--input-path", @"-"];' "Hermes capture should pass text through stdin"

if plutil -p "$PLIST_FILE" | rg -q 'NSAppTransportSecurity|NSExceptionDomains'; then
  echo "FAIL: Info.plist should not allow private-network HTTP exceptions" >&2
  exit 1
fi

reject_source 'http://' "Hermes capture should not contain an insecure HTTP bridge"
reject_source 'NSURLSession' "Hermes capture should not use a network session"
reject_source 'NSMutableURLRequest' "Hermes capture should not build a network request"
reject_source 'sendHermesRequestBody' "Legacy Hermes bridge methods should be removed"

echo "Hermes Shortcut configuration checks passed."
