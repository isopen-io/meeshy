import CoreGraphics
import Foundation

// MARK: - Story Text Position

public struct StoryTextPosition: Codable, Sendable {
    public var x: CGFloat
    public var y: CGFloat

    public init(x: CGFloat = 0.5, y: CGFloat = 0.5) {
        self.x = x; self.y = y
    }

    public static let center = StoryTextPosition(x: 0.5, y: 0.5)
    public static let top = StoryTextPosition(x: 0.5, y: 0.2)
    public static let bottom = StoryTextPosition(x: 0.5, y: 0.8)
}
