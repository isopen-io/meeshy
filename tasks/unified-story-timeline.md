# Unified Story Timeline — playback-gated progress

## Goal
Coordinate the reader's slide progress bar / auto-advance with ACTUAL media
playback: freeze the timeline (and canvas playhead) when the slide's primary
video stalls/buffers; resume in phase (no jump) when it plays. Image-only /
audio-only / failed-video / user-pause paths MUST never deadlock.

## Verified current state (re-confirmed by code review)
- Viewer drives the bar from `StoryReaderTimerController.onProgressChange` (wall
  clock) + auto-advance from `.onCompletion` -> `goToNext()` (installPrefetchPipeline
  674/692). `onPlaybackTime` is plumbed through StoryReaderRepresentable but the
  viewer IGNORES it -> the bar free-runs, decoupled from playback.
- Canvas playhead (`currentTime`) is a separate wall clock in `displayLinkTick`,
  gated only on `mode==.play, contentReadyFired, !isPlaybackPaused`.
- Story players use the DEFAULT `automaticallyWaitsToMinimizeStalling = true`
  -> `.waitingToPlayAtSpecifiedRate` DOES fire on stall.
- No `timeControlStatus` observation exists anywhere. `StoryReaderTimerControlling`
  has NO mocks (only concrete class conforms) -> extending the protocol is safe.

## Design (master signal + 2 freeze inputs + watchdog)
- NEW `StoryPlaybackHealth.isProgressing(status:isUserPaused:isFailed:watchdogExpired:)`
  pure SDK rule engine (MeeshyUI/Story/Canvas). nil status (no video) -> true;
  userPaused -> true; failed -> true; watchdog -> true; .playing -> true;
  .waitingToPlayAtSpecifiedRate / unexpected .paused -> false.
- Canvas polls the PRIMARY player each displayLinkTick (bg video first, else first
  foreground video), runs watchdog timing, sets internal `isPlaybackStalled`, emits
  `onPlaybackProgressing(Bool)` on change. Gates its own playhead advance on
  `!isPlaybackStalled`. Resets stall state on slide change. No KVO -> no teardown/leaks.
  Deviation from spec's KVO suggestion justified: polling = zero observer lifecycle,
  uniformly covers async-attached foreground players, link keeps ticking during stall
  so resume is detected.
- Timer gains `setPlaybackStalled(_:)` + `isPlaybackStalled`, independent of `setPaused`;
  advances only when `isActive && !isPaused && !isPlaybackStalled`; resume re-seeds
  `lastTick` (no jump). Cleared by `setCurrentSlide`/`reset`.
- App: StoryViewerView+Canvas wires `onPlaybackProgressing -> slideTimer.setPlaybackStalled(!progressing)`.

## Build/test/verify
- SDK: xcodebuild test -scheme MeeshySDK-Package (iPhone 16 Pro)
- App: ./apps/ios/meeshy.sh build && ./apps/ios/meeshy.sh test
- Manual sim: (1) bg video stall freezes+resumes bar in phase; (2) image-only advances;
  (3) broken video URL does NOT hard-stall (watchdog); (4) long-press/mute/loop unchanged.
