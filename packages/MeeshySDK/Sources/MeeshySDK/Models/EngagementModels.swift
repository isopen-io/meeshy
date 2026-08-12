import Foundation

/// One micro-action recorded during a consumption session.
/// `atMs` is the monotonic offset from the session start (NOT wall-clock).
public struct EngagementAction: Codable, Sendable, Hashable {
    public enum ActionType: String, Codable, Sendable, Hashable, CaseIterable {
        case openedComments, tappedProfile, expandedText, replayed, muted, unmuted
        case paused, resumed, swipedAway, reacted, shared, bookmarked, commented, reported
    }
    public let type: ActionType
    public let atMs: Int
    public init(type: ActionType, atMs: Int) {
        self.type = type
        self.atMs = atMs
    }
}

/// One video playback position sample (heartbeat).
public struct WatchSample: Codable, Sendable, Hashable {
    public let positionMs: Int
    public let atMs: Int
    public init(positionMs: Int, atMs: Int) {
        self.positionMs = positionMs
        self.atMs = atMs
    }
}

/// A finalized (or crash-recovered) consumption session for one post on one surface.
public struct EngagementSession: Codable, Sendable, Hashable {
    public enum ContentType: String, Codable, Sendable, Hashable {
        case post = "POST", reel = "REEL", story = "STORY", status = "STATUS"
    }
    public enum Surface: String, Codable, Sendable, Hashable {
        case detail, reels, storyViewer, statusBubble
    }

    public let sessionId: String
    public let userId: String
    public let postId: String
    public let contentType: ContentType
    public let surface: Surface
    public let startedAt: Date
    public let dwellMs: Int
    public let watchMs: Int?
    public let mediaDurationMs: Int?
    public let completed: Bool
    public let truncated: Bool
    public let consent: String
    public let actions: [EngagementAction]
    public let watchSamples: [WatchSample]

    public init(sessionId: String, userId: String, postId: String,
                contentType: ContentType, surface: Surface, startedAt: Date,
                dwellMs: Int, watchMs: Int?, mediaDurationMs: Int?,
                completed: Bool, truncated: Bool, consent: String,
                actions: [EngagementAction], watchSamples: [WatchSample]) {
        self.sessionId = sessionId
        self.userId = userId
        self.postId = postId
        self.contentType = contentType
        self.surface = surface
        self.startedAt = startedAt
        self.dwellMs = dwellMs
        self.watchMs = watchMs
        self.mediaDurationMs = mediaDurationMs
        self.completed = completed
        self.truncated = truncated
        self.consent = consent
        self.actions = actions
        self.watchSamples = watchSamples
    }
}

public typealias EngagementSurface = EngagementSession.Surface
