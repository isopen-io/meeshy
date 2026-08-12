import SwiftUI

/// Centralized animation constants for the conversation bubble surface.
///
/// Non-modal interactions (cell layout, swipe, reaction pulse) standardize on
/// `.easeOut(0.18)` for visual coherence — introduced by the flatten
/// refactor (`docs/superpowers/specs/2026-05-22-conversation-flatten-perf-design.md`).
enum BubbleAnimations {
    static let overlayRevealCrossfade: Animation = .linear(duration: BubbleAnimationDurations.overlayRevealCrossfade)
}

/// Nominal durations in seconds, kept separate so call sites can schedule
/// completion work without introspecting an `Animation` (not Equatable).
enum BubbleAnimationDurations {
    static let overlayRevealCrossfade: TimeInterval = 0.016
}
