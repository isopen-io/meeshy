import CoreGraphics
import Foundation

// MARK: - Story Transition Kind (Timeline V2)

/// Kind of inter-clip transition rendered by the timeline compositor.
/// Launch-supported: `crossfade` (opacity ramp) and `dissolve` (CIDissolveTransition mask).
/// Future: `push`, `wipe`, `swipeLeft`, `swipeRight`, `zoomIn`, `zoomOut`.
public enum StoryTransitionKind: String, Codable, CaseIterable, Sendable {
    case crossfade
    case dissolve
}
