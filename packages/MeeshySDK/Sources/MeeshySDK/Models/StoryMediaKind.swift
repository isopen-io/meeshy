import CoreGraphics
import Foundation

// MARK: - Story Media Kind

/// Type-safe wrapper around `StoryMediaObject.mediaType`. The underlying field stays
/// `String` for forward compatibility with API extensions and existing drafts on disk;
/// callers should compare via `.kind == .video` rather than the raw string.
public enum StoryMediaKind: String, Codable, Sendable {
    case image
    case video
}
