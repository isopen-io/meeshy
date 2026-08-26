import QuartzCore

/// Idle-power decision for the composer's high-frequency edit clock
/// (`StoryCanvasUIView.editDisplayLink`).
///
/// The edit display link exists to keep the display's high refresh-rate
/// clock alive for buttery gesture transforms and to drive the ~18 fps glass
/// backdrop re-feed (`StoryEditBackdropThrottle`) — see the doc comment on
/// `editDisplayLink`. None of that matters on a screen nobody is touching:
/// left open and idle, a fixed 60–120 Hz `CADisplayLink` plus a looping
/// video/audio preview (`playsVideoInEditMode` / `playsAudioInEditMode`)
/// keep the GPU/decoder awake indefinitely — the device heats up after a few
/// minutes with zero interaction (issue #3906).
///
/// This pure gate answers a single question — "given how long ago the last
/// user interaction happened, and whether a media clock genuinely needs to
/// keep running right now regardless of touch activity, should the edit
/// clock run at full rate or idle down?" — so `StoryCanvasUIView` can
/// pause/resume `editDisplayLink` (and, mirroring that, suspend/resume the
/// edit-mode preview loop) without any of that policy living in the view
/// itself.
nonisolated enum EditClockRegime: Equatable {
    /// Full high-frequency clock: gestures stay responsive, the preview loop
    /// (if any) plays normally.
    case full
    /// No interaction for at least `idleDelay` AND no media genuinely needs
    /// the clock right now — it (and the preview loop) can be suspended
    /// until the next interaction or the next time media starts playing.
    case idle
}

enum EditClockThrottle {
    /// "Quelques secondes" (spec) of grace before the edit clock idles down.
    /// Long enough that a brief pause between two edits (reading a caption,
    /// picking a color) never causes a visible hitch on resume; short enough
    /// that leaving the composer open and untouched stops heating the
    /// device quickly.
    /// `nonisolated` (the MeeshyUI module defaults to `MainActor`) so the
    /// pure gate is callable from the non-isolated test target and any
    /// context — same rationale as `StoryEditBackdropThrottle`.
    nonisolated static let defaultIdleDelay: CFTimeInterval = 4.0

    /// `now` and `lastInteractionAt` share the same clock domain as
    /// `CADisplayLink.timestamp` (`CACurrentMediaTime()`), so callers can
    /// feed the tick's timestamp straight through without conversion.
    ///
    /// `isMediaActivelyPlaying` is an OVERRIDE, not an input folded into a
    /// formula: genuine ongoing playback the user explicitly started (e.g.
    /// the timeline preview transport) always wins full-rate, no matter how
    /// long ago the last touch was — a playing preview must never freeze
    /// mid-frame just because the finger left the screen. It must NOT be fed
    /// from the ambient edit-mode loop (`playsVideoInEditMode` /
    /// `playsAudioInEditMode`) that this very throttle exists to suspend:
    /// doing so would make that loop permanently "active" in its own eyes,
    /// so it could never be judged idle.
    ///
    /// A regressing clock (`now < lastInteractionAt`) reads as "still within
    /// the grace window" rather than "idle" — same defensive posture as
    /// `StoryEditBackdropThrottle.shouldEmit`.
    nonisolated static func regime(now: CFTimeInterval,
                                   lastInteractionAt: CFTimeInterval,
                                   isMediaActivelyPlaying: Bool,
                                   idleDelay: CFTimeInterval = defaultIdleDelay) -> EditClockRegime {
        guard !isMediaActivelyPlaying else { return .full }
        return (now - lastInteractionAt) >= idleDelay ? .idle : .full
    }
}
