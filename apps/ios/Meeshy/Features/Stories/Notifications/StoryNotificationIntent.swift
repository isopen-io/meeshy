import Foundation
import MeeshySDK

// MARK: - StoryIntent
// Intent describes WHICH surface the user wants when tapping a story-related
// notification: the comments list, the reactions/viewers sheet, or just the
// story itself (`.view`, used by friend-new-content notifications where the
// user simply wants to watch the freshly published story).

public enum StoryIntent: Hashable, Codable {
    case comments
    case reactions
    case view
}

// MARK: - StoryNotificationContext
// Snapshot of the notification metadata necessary to render the story
// notification screen even when the underlying story is no longer available
// (expired). Captures the actor that triggered the notification and the
// trigger details (a reaction emoji or a comment preview).

public struct StoryNotificationContext: Hashable, Codable {
    public let actorAvatar: String?
    public let actorDisplayName: String
    public let trigger: Trigger
    public let occurredAt: Date

    public enum Trigger: Hashable, Codable {
        case reaction(emoji: String)
        case comment(preview: String)
    }

    public init(
        actorAvatar: String?,
        actorDisplayName: String,
        trigger: Trigger,
        occurredAt: Date
    ) {
        self.actorAvatar = actorAvatar
        self.actorDisplayName = actorDisplayName
        self.trigger = trigger
        self.occurredAt = occurredAt
    }
}

// MARK: - APINotification → StoryNotificationContext mapping
// Maps the SDK notification payload to the local context used by the
// notification target screen. Designed to be resilient: every fallback
// chain produces a sensible default so the screen can always render.

public extension StoryNotificationContext {
    static func from(_ notification: APINotification) -> StoryNotificationContext {
        let trigger: Trigger
        switch notification.notificationType {
        case .storyReaction, .statusReaction:
            let emoji = notification.metadata?.reactionEmoji
                ?? notification.metadata?.emoji
                ?? "❤️"
            trigger = .reaction(emoji: emoji)
        default:
            let preview = notification.metadata?.commentPreview
                ?? notification.metadata?.messagePreview
                ?? ""
            trigger = .comment(preview: preview)
        }

        let actor = notification.actor
        let displayName = actor?.displayName
            ?? actor?.username
            ?? ""

        return StoryNotificationContext(
            actorAvatar: actor?.avatar,
            actorDisplayName: displayName,
            trigger: trigger,
            occurredAt: parseDate(notification.createdAt) ?? Date()
        )
    }

    private static func parseDate(_ raw: String) -> Date? {
        // Modern Date.ISO8601FormatStyle supports fractional seconds and
        // is more efficient than legacy ISO8601DateFormatter.
        if let date = try? Date(raw, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true)) {
            return date
        }
        return try? Date(raw, strategy: .iso8601)
    }
}
