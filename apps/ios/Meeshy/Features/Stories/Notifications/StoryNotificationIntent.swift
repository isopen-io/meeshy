import Foundation
import MeeshySDK

// MARK: - StoryIntent
// Intent describes WHICH list (comments vs reactions) the user wants to consult
// when tapping a story-related notification. The screen uses it to focus the
// correct tab on the story details view.

public enum StoryIntent: Hashable, Codable {
    case comments
    case reactions
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
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: raw) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: raw)
    }
}
