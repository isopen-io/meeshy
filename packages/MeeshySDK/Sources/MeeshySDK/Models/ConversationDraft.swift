import Foundation

/// Lightweight per-conversation message draft cached locally via
/// `CacheCoordinator.drafts`. Persists the user's in-progress text so it
/// survives navigation, backgrounding, and process kills.
///
/// This is the SDK-level building block for Task 2.2 of the iOS Local-First
/// Wave 1 plan. The app-side `MessageDraft` (text + reply context + effects)
/// remains the wider compose-state container; this type is the minimal,
/// reusable surface that lives next to the rest of the cache stores so any
/// future surface (e.g. an iPad sidebar showing "you have a draft for N
/// conversations") can read it without going through `UserDefaults`.
///
/// `conversationId` doubles as the cache key (matching how every other
/// `CacheIdentifiable` payload in this codebase keys itself).
public struct ConversationDraft: Codable, Sendable, CacheIdentifiable, Equatable {
    public let conversationId: String
    public var text: String
    public var updatedAt: Date

    public var id: String { conversationId }

    public init(conversationId: String, text: String, updatedAt: Date = Date()) {
        self.conversationId = conversationId
        self.text = text
        self.updatedAt = updatedAt
    }
}
