import CoreGraphics
import Foundation

// MARK: - Story Clip Transition (Timeline V2)

/// Transition between two adjacent clips of the same slide (intra-slide).
/// Distinct from `StoryTransitionEffect` which is the inter-slide opening/closing animation.
public struct StoryClipTransition: Codable, Identifiable, Sendable {
    public let id: String
    public let fromClipId: String
    public let toClipId: String
    public let kind: StoryTransitionKind
    public let duration: Float
    public let easing: StoryEasing?

    public init(id: String = UUID().uuidString,
                fromClipId: String,
                toClipId: String,
                kind: StoryTransitionKind,
                duration: Float,
                easing: StoryEasing? = nil) {
        self.id = id
        self.fromClipId = fromClipId
        self.toClipId = toClipId
        self.kind = kind
        self.duration = duration
        self.easing = easing
    }
}
