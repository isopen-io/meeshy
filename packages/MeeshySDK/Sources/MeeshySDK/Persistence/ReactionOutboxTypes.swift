import Foundation

// MARK: - Reaction Action

/// Direction of a reaction mutation persisted in the outbox.
///
/// Wave 1 Task 3.6 — moved out of the deleted `ReactionQueue` into a dedicated
/// types file. The raw values (`"add"` / `"remove"`) are stable on-disk
/// identifiers — they appear inside the JSON-encoded payload of every pending
/// `OutboxRecord` of kind `.sendReaction`. Renaming a case is a migration,
/// not a refactor.
public enum ReactionAction: String, Codable, Sendable {
    case add
    case remove
}

// MARK: - Reaction Outbox Payload

/// JSON-encoded payload written into `OutboxRecord.payload` for every
/// `kind == .sendReaction` row. Re-hydrated by `OutboxDispatcher` at retry
/// time to rebuild the reaction parameters handed to `ReactionService`.
///
/// Wave 1 Task 3.6 — moved out of the deleted `ReactionQueue` into a dedicated
/// types file alongside `ReactionAction`. The shape is unchanged so on-device
/// rows written by previous app versions decode without migration.
public struct ReactionOutboxPayload: Codable, Sendable {
    public let messageId: String
    public let emoji: String
    public let action: ReactionAction
    public let conversationId: String
    public let clientMessageId: String

    public init(
        messageId: String,
        emoji: String,
        action: ReactionAction,
        conversationId: String,
        clientMessageId: String
    ) {
        self.messageId = messageId
        self.emoji = emoji
        self.action = action
        self.conversationId = conversationId
        self.clientMessageId = clientMessageId
    }
}
