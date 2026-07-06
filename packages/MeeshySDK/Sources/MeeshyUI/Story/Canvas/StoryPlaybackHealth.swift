import AVFoundation

/// Stateless rule engine that maps the slide's PRIMARY media player state to a
/// single question: *is the unified story timeline allowed to advance right now?*
///
/// This is the heart of the "unified timeline" — the reader's progress bar and
/// auto-advance must track ACTUAL playback, freezing when the primary video
/// buffers and resuming when it plays again. The mapping is intentionally pure
/// (no `AVPlayer` reference, no state) so the full deadlock-guard matrix is unit
/// testable without a live player, and so the canvas can feed it either from a
/// poll or from a KVO callback without changing the contract.
///
/// ### Deadlock guards (each forces `true` — "let the wall clock run")
/// A wrong gate that freezes a story forever is worse than the bug it fixes, so
/// the function defaults to *progressing* in every ambiguous case:
/// - `status == nil` — the slide has no primary video (image / colour / gradient
///   / audio-only). It is never gated on VIDEO playback; audio availability is
///   gated separately via `isAudioPending` (R1) with the same watchdog fallback.
/// - `isUserPaused` — a user/lifecycle pause is handled by the timer's separate
///   `setPaused` path; the stall gate must not double-freeze it.
/// - `isFailed` — a failed player can never recover, so fall back to the wall
///   clock immediately rather than hanging on a dead asset.
/// - `watchdogExpired` — a stall that outlives the watchdog window falls back to
///   the wall clock so a permanently-stuck stream (or audio that never schedules)
///   cannot hard-stall the story.
public enum StoryPlaybackHealth {

    /// - Parameters:
    ///   - status: the primary player's `timeControlStatus`, or `nil` when the
    ///     slide has no primary video.
    ///   - isUserPaused: the canvas is paused by the user/lifecycle (long-press,
    ///     sheet, backgrounding) — handled elsewhere, never a stall.
    ///   - isFailed: the primary player's current item reached `.failed`.
    ///   - watchdogExpired: the primary playback has been continuously
    ///     non-`.playing` for longer than the stall watchdog window.
    ///   - isAudioPending: the slide carries resolved audio clips that the
    ///     reader mixer has not scheduled yet (files still downloading /
    ///     caching). Once scheduled, the mixer plays local files — there is no
    ///     mid-flight underrun, so this covers the whole audio-availability
    ///     window. Guarded by the same watchdog as a video stall.
    ///   - isPrimaryMediaPending: the slide's primary VISUAL media is not on
    ///     screen yet — a background image whose FINAL bitmap has not been
    ///     stamped (the 2 s readiness failsafe may have started the timeline
    ///     over the blurry ThumbHash, R2). Background video needs no such
    ///     flag: its buffering is already gated through `status`. Guarded by
    ///     the same watchdog.
    /// - Returns: `true` when the timeline may advance, `false` when it must freeze.
    ///
    /// `nonisolated` : MeeshyUI builds with `SWIFT_DEFAULT_ACTOR_ISOLATION =
    /// MainActor`, which would otherwise pin this pure helper to the main actor
    /// and break its (intentionally non-`@MainActor`) unit tests.
    public static nonisolated func isProgressing(
        status: AVPlayer.TimeControlStatus?,
        isUserPaused: Bool,
        isFailed: Bool,
        watchdogExpired: Bool,
        isAudioPending: Bool = false,
        isPrimaryMediaPending: Bool = false
    ) -> Bool {
        if isUserPaused { return true }
        if isFailed { return true }
        if watchdogExpired { return true }
        if isAudioPending { return false }
        if isPrimaryMediaPending { return false }
        guard let status else { return true }
        switch status {
        case .playing:
            return true
        case .waitingToPlayAtSpecifiedRate, .paused:
            return false
        @unknown default:
            return true
        }
    }
}
