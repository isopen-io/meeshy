import Foundation

// MARK: - Remote event value type

/// Strongly-typed payload for `USER_PREFERENCES_UPDATED` (conversation
/// scope). Mirrors the gateway's `UserPreferencesConversationUpdatedEventData`.
public struct UserPreferencesUpdatedRemote: Sendable, Hashable {
    public let userId: String
    public let conversationId: String
    public let version: Int
    public let reset: Bool
    public let preferences: RemotePreferencesPayload?

    public init(
        userId: String,
        conversationId: String,
        version: Int,
        reset: Bool,
        preferences: RemotePreferencesPayload?
    ) {
        self.userId = userId
        self.conversationId = conversationId
        self.version = version
        self.reset = reset
        self.preferences = preferences
    }
}

public struct RemotePreferencesPayload: Sendable, Hashable {
    public let isPinned: Bool
    public let isMuted: Bool
    public let mentionsOnly: Bool
    public let isArchived: Bool
    public let tags: [String]
    public let categoryId: String?
    public let orderInCategory: Int?
    public let customName: String?
    public let reaction: String?
    public let deletedForUserAt: Date?
    public let clearHistoryBefore: Date?
    public let appearance: ConversationAppearance?

    public init(
        isPinned: Bool,
        isMuted: Bool,
        mentionsOnly: Bool,
        isArchived: Bool,
        tags: [String],
        categoryId: String?,
        orderInCategory: Int?,
        customName: String?,
        reaction: String?,
        deletedForUserAt: Date?,
        clearHistoryBefore: Date?,
        appearance: ConversationAppearance? = nil
    ) {
        self.appearance = appearance
        self.isPinned = isPinned
        self.isMuted = isMuted
        self.mentionsOnly = mentionsOnly
        self.isArchived = isArchived
        self.tags = tags
        self.categoryId = categoryId
        self.orderInCategory = orderInCategory
        self.customName = customName
        self.reaction = reaction
        self.deletedForUserAt = deletedForUserAt
        self.clearHistoryBefore = clearHistoryBefore
    }
}

/// Store-owned input for `applyReadReceipt`. Decoupled from the socket
/// layer's `ReadStatusUpdateEvent` so the wiring layer maps socket → store.
public struct ReadStatusEvent: Sendable, Hashable {
    public let conversationId: String
    public let unreadCount: Int
    public let lastReadAt: Date?

    public init(conversationId: String, unreadCount: Int, lastReadAt: Date?) {
        self.conversationId = conversationId
        self.unreadCount = unreadCount
        self.lastReadAt = lastReadAt
    }
}

/// Store-owned input for `applyServerUnread`. Découplé de
/// `UnreadUpdateEvent` (couche socket, qui porte AUSSI le pont ✦ et sa
/// tri-valeur d'annonce) : le store ne connaît que le compteur, et la couche
/// de câblage fait la projection socket → store.
public struct ConversationUnreadEvent: Sendable, Hashable {
    public let conversationId: String
    public let unreadCount: Int

    public init(conversationId: String, unreadCount: Int) {
        self.conversationId = conversationId
        self.unreadCount = unreadCount
    }
}

/// Store-owned input for `applyConversationDeleted`.
public struct ConversationDeletedEvent: Sendable, Hashable {
    public let conversationId: String

    public init(conversationId: String) {
        self.conversationId = conversationId
    }
}
