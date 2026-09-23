import Foundation

// MARK: - Reaction Model

public struct MeeshyReaction: Identifiable, Codable, Sendable {
    public let id: String
    public let messageId: String
    public var participantId: String?
    public let emoji: String
    public let createdAt: Date
    public var updatedAt: Date

    public init(id: String = UUID().uuidString, messageId: String, participantId: String? = nil,
                emoji: String, createdAt: Date = Date(), updatedAt: Date = Date()) {
        self.id = id; self.messageId = messageId; self.participantId = participantId
        self.emoji = emoji; self.createdAt = createdAt; self.updatedAt = updatedAt
    }

    @available(*, deprecated, renamed: "participantId")
    public var userId: String? { participantId }
}

public extension MeeshyReaction {
    /// Reconstruct synthetic per-reaction rows from the gateway's AGGREGATED
    /// reaction payload (`reactionSummary` emoji→count + `currentUserReactions`
    /// emojis the authenticated user reacted with). The aggregated payload does
    /// not enumerate individual reactors, so each emoji yields `count` rows; the
    /// FIRST row of an emoji the current user reacted with is tagged with the
    /// current user's `currentUserId` so the downstream ownership check
    /// (`participantId == currentUserId`) lights up "I reacted". Every other row
    /// carries `nil` ownership (the payload can't attribute them).
    ///
    /// Single source of truth shared by both ingestion paths —
    /// `APIMessage.toMessage(currentUserId:)` and
    /// `MessagePersistenceActor.upsertFromAPIMessages` — so they can never
    /// diverge again (T7: the persistence path used to tag the current user's
    /// own reaction with the message AUTHOR's participantId, breaking the
    /// "I reacted" highlight after a cache/REST reload).
    static func reconstructFromSummary(
        messageId: String,
        reactionSummary: [String: Int]?,
        currentUserReactions: [String]?,
        currentUserId: String?
    ) -> [MeeshyReaction] {
        guard let summary = reactionSummary else { return [] }
        let mine = Set(currentUserReactions ?? [])
        return summary.flatMap { emoji, count -> [MeeshyReaction] in
            let meReacted = mine.contains(emoji)
            return (0..<count).map { index in
                MeeshyReaction(
                    messageId: messageId,
                    participantId: (meReacted && index == 0) ? currentUserId : nil,
                    emoji: emoji
                )
            }
        }
    }
}

// MARK: - Reaction Summary

public struct MeeshyReactionSummary: Sendable {
    public let emoji: String
    public let count: Int
    public let includesMe: Bool

    public init(emoji: String, count: Int, includesMe: Bool = false) {
        self.emoji = emoji; self.count = count; self.includesMe = includesMe
    }
}

public typealias MeeshyMessageReaction = MeeshyReactionSummary

// MARK: - Enriched Reaction Models

public struct ReactionUserDetail: Codable, Identifiable, Sendable {
    public let userId: String
    public let username: String
    public let avatar: String?
    public let createdAt: Date

    public var id: String { userId }

    public init(userId: String, username: String, avatar: String? = nil, createdAt: Date = Date()) {
        self.userId = userId
        self.username = username
        self.avatar = avatar
        self.createdAt = createdAt
    }
}

public struct ReactionGroup: Codable, Identifiable, Sendable {
    public let emoji: String
    public let count: Int
    public let users: [ReactionUserDetail]

    public var id: String { emoji }

    public init(emoji: String, count: Int, users: [ReactionUserDetail]) {
        self.emoji = emoji
        self.count = count
        self.users = users
    }
}

public struct ReactionSyncResponse: Codable, Sendable {
    public let messageId: String
    public let reactions: [ReactionGroup]
    public let totalCount: Int
    public let userReactions: [String]
}
