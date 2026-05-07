import Foundation

public enum StoryTimelineEngineError: Error, Sendable, Equatable {
    case assetLoadFailed(clipId: String, reason: String)
    case audioEngineUnavailable(reason: String)
    case configurationFailed(reason: String)
    case noProjectConfigured
}

public enum StoryTimelineExportError: Error, Sendable, Equatable {
    case notImplemented
    case sessionFailed(String)
}

public enum StoryTimelineExportPreset: Sendable {
    case hd720, hd1080, hd4k
}
