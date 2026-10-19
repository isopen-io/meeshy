import CoreGraphics
import Foundation

// MARK: - Story Easing (Timeline V2)

/// Easing curve applied between two interpolated values (transitions, keyframes).
/// All curves map [0, 1] -> [0, 1] monotonically with `apply(0) == 0` and `apply(1) == 1`.
public enum StoryEasing: String, Codable, CaseIterable, Sendable {
    case linear
    case easeIn
    case easeOut
    case easeInOut

    public func apply(_ t: Float) -> Float {
        switch self {
        case .linear:
            return t
        case .easeIn:
            return t * t
        case .easeOut:
            return 1 - (1 - t) * (1 - t)
        case .easeInOut:
            return t < 0.5 ? 2 * t * t : 1 - pow(-2 * t + 2, 2) / 2
        }
    }
}
