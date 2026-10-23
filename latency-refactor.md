# Latency tool refactor plan

## Goal

Turn the 1,426-line `latency-tool.html` into small, understandable files without
changing what the tool measures or how users run it. Keep it a static browser
app with no build step or new runtime dependencies. This document is a plan;
the implementation should be done in small, reviewable steps.

## Current responsibilities

`latency-tool.html` currently contains all of the following:

- Page markup for Loopback, External Stream, and How it works tabs.
- Page-specific CSS and an early `RTCPeerConnection` wrapper used to observe
  OvenPlayer's peer connection.
- Shared settings, sample matching, statistics, chart rendering, logging, and
  CSV export.
- Loopback canvas generation, WebRTC negotiation, pixel detection, polling,
  and cleanup.
- OvenPlayer setup, peer-connection capture, `getStats()` polling, external
  pixel detection, and cleanup.
- OBS marker event polling, timestamp conversion, and the copy-script action.
- Event handlers that connect the page controls to all of the above.

The repository already uses separate CSS and plain JavaScript files for the
main site under `assets/`. There is no package manifest, test runner, bundler,
or lint configuration to reuse.

## Proposed file layout

```text
latency-tool.html
assets/
  css/
    latency-tool.css
  js/
    latency-tool/
      config.js          # Shared thresholds, limits, and polling intervals
      stats.js           # Pure latency statistics and sample-buffer helpers
      charts.js          # Badges, histogram, timeline, log, and CSV rendering
      marker.js          # Luminance detection and unambiguous event matching
      loopback.js        # Local source, peer negotiation, detection, cleanup
      external.js        # OvenPlayer, captured PC, getStats, detection, cleanup
      obs-sync.js        # OBS event polling, clock conversion, connect/disconnect
      bootstrap.js       # DOM lookup, control listeners, application startup
      peer-capture.js    # Synchronous classic script; loaded before OvenPlayer
```

Use browser ES modules for the application files and explicit imports/exports
between them. Keep the peer-capture wrapper as a small classic script loaded
synchronously before OvenPlayer: its ordering is behaviorally significant.
Document the script order in the HTML. Avoid introducing a bundler or global
application namespace unless implementation constraints require it.

Keep the existing OBS Python source in its visible `<code id="markerScript">`
markup for now; it is user-copyable content, not page application logic.
Preserve the existing Bootstrap and OvenPlayer CDN loading and network
prerequisite. Extract only the page-specific CSS; do not redesign the UI as
part of this refactor.

## Refactor sequence

### 1. Capture existing behavior

- Record the current controls, stats fields, exported CSV columns, and user
  flows for each tab.
- Treat latency sampling, source-event ambiguity rejection, timestamp basis,
  and stop/reconnect cleanup as compatibility requirements.
- Keep this behavior inventory with the pull request description or review
  checklist; do not add a second user-facing guide.

### 2. Separate static presentation

- Move the contents of the inline `<style>` block to
  `assets/css/latency-tool.css`.
- Move the page-specific synchronous peer-connection capture wrapper to
  `assets/js/latency-tool/peer-capture.js`, retaining its custom event contract.
- Leave page markup, the OBS script text, and existing CDN dependencies in
  `latency-tool.html`.
- Verify the capture script still runs before OvenPlayer is loaded.

### 3. Extract shared, low-risk logic

- Put shared thresholds and limits in `config.js`.
- Move pure sample/statistics operations (including median/percentile behavior
  and bounded sample/event queues) to `stats.js` or `marker.js`, as appropriate.
- Move charts, badges, logs, and CSV download rendering to `charts.js`.
- Keep DOM access out of pure calculations where practical.
- Verify even-sized medians, bounded buffers, ambiguous marker matches,
  histogram/timeline rendering, and CSV headers/values.

### 4. Isolate the Loopback flow

- Move Loopback-only state and behavior into `loopback.js`: source animation,
  local peer negotiation, remote marker detection, `getStats()` logging,
  startup/stop/error cleanup, and sample updates.
- Pass required DOM elements and shared services in explicitly rather than
  relying on top-level HTML globals.
- Keep start failure and repeated start/stop paths safe and idempotent.
- Verify each supported codec selection, warm-up discard, clear, export, and
  stop behavior.

### 5. Isolate the External Stream and OBS sync flows

- Move OvenPlayer lifecycle, captured-peer ownership, stats polling, external
  marker detection, and teardown into `external.js`.
- Move OBS event polling, validation, source-event queueing, page/helper clock
  conversion, and cancellation into `obs-sync.js`.
- Preserve the capture hook's ownership boundary so Loopback peers are never
  treated as the OvenPlayer peer.
- Preserve generation/player guards for delayed detection attempts and ensure
  disabling sync disconnects polling and clears pending events.
- Verify reconnects, toggling detection/sync, missing video, invalid event
  responses, and stop cleanup.

### 6. Add a small entry point and remove the old inline app

- Make `bootstrap.js` create the app services, bind controls, and start only
  after the document markup is available.
- Replace the large inline application script with the ordered capture,
  third-party, and module script tags.
- Remove duplicated inline code only after its replacement is wired and
  verified; avoid changing element IDs or displayed wording in this step.

## Validation and completion criteria

There is no existing automated frontend test or build command. Do not add a
new dependency solely for the refactor. Validate incrementally in a browser
served over HTTP (ES modules are not reliably usable from `file://`):

- All three tabs render and Bootstrap tab controls work.
- Loopback starts, reports latency and periodic stats, then stops without
  lingering tracks, peer connections, timers, or animation frames.
- External Stream connects; the captured OvenPlayer peer—not Loopback peers—
  feeds the stats table; stop/reconnect leaves no stale polling or detection.
- OBS source timestamps still correlate with detected marker events, and
  disabling/disconnecting sync prevents further samples.
- Clear and CSV export work in both measurement paths, and no browser console
  errors appear during start/stop/reconnect scenarios.

Keep each extraction as a small commit or independently reviewable change.
After the final step, compare the behavior inventory against the app and review
the script ordering and cleanup paths before considering the refactor complete.
