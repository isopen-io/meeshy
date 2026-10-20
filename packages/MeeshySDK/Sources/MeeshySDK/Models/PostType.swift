import CoreGraphics
import Foundation

// MARK: - Post Type

public enum PostType: String, CaseIterable, Sendable {
    case post = "POST"
    case reel = "REEL"
    case story = "STORY"
    case status = "STATUS"

    public var displayName: String {
        switch self {
        case .post: return String(localized: "content.type.post", defaultValue: "Post", bundle: .main)
        case .reel: return String(localized: "content.type.reel", defaultValue: "Réel", bundle: .main)
        case .story: return String(localized: "content.type.story", defaultValue: "Story", bundle: .main)
        case .status: return String(localized: "content.type.status", defaultValue: "Statut", bundle: .main)
        }
    }

    public var icon: String {
        switch self {
        case .post: return "square.and.pencil"
        case .reel: return "play.rectangle.on.rectangle.fill"
        case .story: return "camera.fill"
        case .status: return "face.smiling"
        }
    }
}
