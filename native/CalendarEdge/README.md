# CalendarEdge

`CalendarEdge` is a lightweight macOS utility that opens a SlidePad-style panel from the right screen edge and renders upcoming events from the system Calendar database using `EventKit`.

## Why this route

- Lower idle overhead than a browser tab or embedded web app
- No Electron, no Tauri, no Chromium runtime
- Reads the same local calendar data used by Apple Calendar
- Keeps the interaction model close to SlidePad: edge trigger + slide-out panel

## Current scope

- Right-edge hotspot
- Slide-out panel
- Calendar permission request
- Upcoming events list
- Open Apple Calendar button

## Build and install

```bash
./scripts/build-calendar-edge-app.sh
```

The build script will:

- compile the native app
- create `build/CalendarEdge.app`
- copy it to `~/Applications/CalendarEdge.app`
- apply ad-hoc signing so macOS can launch it more smoothly

## Run

Open either of these:

- `~/Applications/CalendarEdge.app`
- `build/CalendarEdge.app`
