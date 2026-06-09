import SwiftUI

/// Centralized animation constants for the conversation bubble surface.
///
/// Non-modal interactions (cell layout, swipe, reaction pulse) standardize on
/// `.easeOut(0.18)` for visual coherence — introduced by the flatten
/// refactor (`docs/superpowers/specs/2026-05-22-conversation-flatten-perf-design.md`).
///
/// Modal overlays (long-press context overlay) deliberately derogate to
/// springs because they need the perceptual "pop" of damped non-linear
/// progression to communicate Z-elevation — matching the iMessage/WhatsApp
/// feel. The exception is scoped to overlay entry/exit only; nothing else
/// in the conversation surface should reach for springs.
enum BubbleAnimations {
    static let standard: Animation = .easeOut(duration: BubbleAnimationDurations.standard)
    static let reactionFeedback: Animation = .easeOut(duration: BubbleAnimationDurations.reactionFeedback)

    static let overlaySpring: Animation = .spring(response: BubbleAnimationDurations.overlaySpring, dampingFraction: 0.92)
    static let overlayBubble: Animation = .spring(response: BubbleAnimationDurations.overlayBubble, dampingFraction: 0.78)
    static let overlayLift: Animation = .spring(response: BubbleAnimationDurations.overlayLift, dampingFraction: 0.82)
    static let overlayMenu: Animation = .spring(response: BubbleAnimationDurations.overlayMenu, dampingFraction: 0.85)
    static let overlayMenuScale: Animation = .spring(response: BubbleAnimationDurations.overlayMenuScale, dampingFraction: 0.78)
    static let overlayDismiss: Animation = .spring(response: BubbleAnimationDurations.overlayDismiss, dampingFraction: 0.90)
    static let overlayDismissBubble: Animation = .spring(response: BubbleAnimationDurations.overlayDismissBubble, dampingFraction: 0.88)
    static let overlayRevealCrossfade: Animation = .linear(duration: BubbleAnimationDurations.overlayRevealCrossfade)
}

/// Nominal durations in seconds, exposed separately so iOS 16 fallback
/// (`withAnimationCompletion` helper) can schedule completion via `Task.sleep`
/// without needing to introspect an `Animation` (which is not Equatable).
///
/// Spring response is a good proxy for the visible motion duration: a spring
/// is ~98% settled at `response × 1.2`. We use response directly as a safe
/// upper bound (slight overshoot is harmless because the completion block
/// only triggers cleanup, never visible state changes).
enum BubbleAnimationDurations {
    static let standard: TimeInterval = 0.18
    static let reactionFeedback: TimeInterval = 0.20

    // BUG4: snappier open. The custom context overlay previously took ~0.32s+
    // for the action menu to settle (perceptible lag vs iMessage). Tightened the
    // open-side springs (~25-30% faster) while keeping high damping for a fluid,
    // non-bouncy feel. Dismiss timings are left as-is (already quick).
    static let overlaySpring: TimeInterval = 0.24
    static let overlayBubble: TimeInterval = 0.22
    static let overlayLift: TimeInterval = 0.26
    static let overlayMenu: TimeInterval = 0.20
    static let overlayMenuScale: TimeInterval = 0.22
    static let overlayDismiss: TimeInterval = 0.20
    static let overlayDismissBubble: TimeInterval = 0.24
    static let overlayRevealCrossfade: TimeInterval = 0.016
}
