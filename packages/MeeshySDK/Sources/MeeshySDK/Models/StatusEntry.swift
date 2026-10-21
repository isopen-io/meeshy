import CoreGraphics
import Foundation

// MARK: - Status Entry
public struct StatusEntry: Identifiable, Codable, CacheIdentifiable {
    public let id: String
    public let userId: String
    public let username: String
    public let avatarColor: String
    public let moodEmoji: String
    public let content: String?
    public let audioUrl: String?
    public let createdAt: Date
    public let expiresAt: Date?
    public var visibility: String?
    public var reactionSummary: [String: Int]?
    public let viaUsername: String?

    /// Reuses the story countdown's own catalog keys (`story.viewer.expires*`
    /// in `story.viewer.expiresNow`/`expiresInHours`/`expiresInMinutes`) rather
    /// than minting duplicate ones — a status is the same "ephemeral post"
    /// concept as a story, just without a dedicated seconds-level key, so
    /// anything under a minute collapses into the same "expiring soon" label
    /// (mirrors `StoryViewerView+Content.storyTimeRemaining`, which has no
    /// seconds granularity either). Previously hardcoded the bare English
    /// word "expired" regardless of the user's language — Prisme violation.
    public var timeRemaining: String {
        guard let expires = expiresAt else { return "" }
        let seconds = Int(expires.timeIntervalSinceNow)
        if seconds < 60 {
            return String(localized: "story.viewer.expiresNow", defaultValue: "Expire bientôt", bundle: .main)
        }
        let hours = seconds / 3600
        if hours > 0 {
            return String(localized: "story.viewer.expiresInHours", defaultValue: "Expire dans \(hours)h", bundle: .main)
        }
        let minutes = seconds / 60
        return String(localized: "story.viewer.expiresInMinutes", defaultValue: "Expire dans \(minutes)min", bundle: .main)
    }

    /// Was a hand-rolled French-only relative-time string built from scratch —
    /// re-forging exactly what `RelativeTimeFormatter` (this same module,
    /// already used by `StoryItem`) exists to centralize. Delegates instead so
    /// a StatusEntry gets the same 5-language coverage, day-boundary "hier",
    /// and absolute-date fallback as every other relative timestamp in the app.
    public var timeAgo: String {
        RelativeTimeFormatter.longString(for: createdAt)
    }

    public init(id: String, userId: String, username: String, avatarColor: String, moodEmoji: String,
                content: String? = nil, audioUrl: String? = nil, createdAt: Date = Date(),
                expiresAt: Date? = nil, visibility: String? = nil, reactionSummary: [String: Int]? = nil,
                viaUsername: String? = nil) {
        self.id = id; self.userId = userId; self.username = username; self.avatarColor = avatarColor
        self.moodEmoji = moodEmoji; self.content = content; self.audioUrl = audioUrl
        self.createdAt = createdAt; self.expiresAt = expiresAt; self.visibility = visibility
        self.reactionSummary = reactionSummary; self.viaUsername = viaUsername
    }
}
