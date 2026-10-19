import CoreGraphics
import Foundation

// MARK: - Story Translation

public struct StoryTranslation: Codable, Sendable {
    public let language: String
    public let content: String

    public init(language: String, content: String) {
        self.language = language
        self.content = content
    }
}
