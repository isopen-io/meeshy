import QuartzCore

/// WS2.1 — frame-rate gate for the per-frame glass-backdrop re-feed driven by
/// the canvas `editDisplayLink` while editing over a *playing* video background.
///
/// The edit display link ticks at up to 120 Hz, but re-capturing the canvas
/// backdrop (a `CARenderer` pass in `StoryBackdropCapture`) every tick would be
/// wasteful — the human eye reads a glass blur as "live" well below the display
/// refresh. This pure gate caps the re-feed to ~18 fps. Extracted from
/// `StoryCanvasUIView.editTick` so the cadence is unit-testable without a live
/// `CADisplayLink`.
enum StoryEditBackdropThrottle {
    /// ~18 fps. Below this the glass visibly stutters against a 24-30 fps video;
    /// above it the extra CARenderer passes buy no perceptible smoothness.
    /// `nonisolated` (the MeeshyUI module defaults to `MainActor`) so the pure
    /// gate is callable from the non-isolated test target and any context.
    nonisolated static let defaultMinInterval: CFTimeInterval = 1.0 / 18.0

    /// Emit when at least `minInterval` has elapsed since the last emit. A
    /// `last` of 0 (never emitted) always passes — the first tick re-feeds
    /// immediately. A regressing clock (`now < last`) is treated as "too soon"
    /// rather than emitting, so a paused/reset display link can't burst.
    nonisolated static func shouldEmit(now: CFTimeInterval,
                                       last: CFTimeInterval,
                                       minInterval: CFTimeInterval = defaultMinInterval) -> Bool {
        now - last >= minInterval
    }
}
