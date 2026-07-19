# Left Trigger Context Menu Design

## Goal
Reduce accidental activation and add a low-clutter native control surface for restarting or quitting CalendarEdge.

## Product Behavior
- The app opens when the pointer rests inside a small bottom-left trigger zone.
- The panel slides in from the left side, matching the new trigger origin.
- Right-clicking the panel or trigger zone opens a native menu with:
  - Restart CalendarEdge
  - Quit CalendarEdge
- The main React panel remains visually unchanged. No persistent Quit button is added to the home view.

## Native Architecture
- Modify the active Objective-C implementation in `native/CalendarEdgeObjC/main_webview.m`.
- Keep the existing WKWebView and EventKit data flow unchanged.
- Introduce shared constants for the trigger zone size and panel inset.
- Reuse the current hover-delay and mouse-watch lifecycle, but point its safe hover frame at the bottom-left corner.
- Add a native `NSMenu` owned by `CEAppDelegate`, attach it to the transparent hotspot window, and also present it for right-clicks inside `CEPanelWindow`.

## Restart Behavior
Restart launches a new instance of the current app bundle with `NSWorkspace`, then terminates the current process. This keeps the menu behavior independent of shell scripts or Launch Services command-line assumptions.

## Verification
- Add a regression script that checks the active source for bottom-left trigger logic, left-side panel positioning, and native context menu actions.
- Run the regression script before implementation to verify it fails against current behavior.
- Run the regression script after implementation.
- Build the app with `./scripts/build-calendar-edge-app.sh`.
