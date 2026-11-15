import Foundation

// MARK: - Socket.IO Event Data Models

public struct SocketPostCreatedData: Decodable, Sendable {
    public let post: APIPost
    /// U1 — echoed from the createPost request's cmid so an offline author can
    /// reconcile its optimistic temp post (id == cmid) with this server post
    /// instead of rendering a duplicate. Absent for posts created without a cmid.
    public let clientMutationId: String?

    public init(post: APIPost, clientMutationId: String?) {
        self.post = post
        self.clientMutationId = clientMutationId
    }
}

public struct SocketPostUpdatedData: Decodable, Sendable {
    public let post: APIPost
}

public struct SocketPostDeletedData: Decodable, Sendable {
    public let postId: String
    public let authorId: String
}

public struct SocketPostLikedData: Decodable, Sendable {
    public let postId: String
    public let userId: String
    public let emoji: String
    public let likeCount: Int
    public let reactionSummary: [String: Int]
}

public struct SocketPostUnlikedData: Decodable, Sendable {
    public let postId: String
    public let userId: String
    public let likeCount: Int
    public let reactionSummary: [String: Int]
}

public struct SocketPostRepostedData: Decodable, Sendable {
    public let originalPostId: String
    public let repost: APIPost
}

public struct SocketStoryCreatedData: Decodable, Sendable {
    public let story: APIPost
}

public struct SocketStoryUpdatedData: Decodable, Sendable {
    public let story: APIPost
    /// true quand l'édition a remis l'engagement à zéro côté serveur (vues,
    /// réactions, impressions) — les clients doivent repasser la story en
    /// « non vue ». Absent/false sur les mises à jour de métadonnées seules
    /// (visibilité). Miroir de `StoryUpdatedEventData.engagementReset`.
    public let engagementReset: Bool?
}

public struct SocketStoryDeletedData: Decodable, Sendable {
    public let storyId: String
    public let authorId: String
}

public struct SocketStoryViewedData: Decodable, Sendable {
    public let storyId: String
    public let viewerId: String
    public let viewerUsername: String
    public let viewCount: Int
}

public struct SocketStoryReactedData: Decodable, Sendable {
    public let storyId: String
    public let userId: String
    public let emoji: String
}

public struct SocketStoryUnreactedData: Decodable, Sendable {
    public let storyId: String
    public let userId: String
    public let emoji: String
    public init(storyId: String, userId: String, emoji: String) {
        self.storyId = storyId
        self.userId = userId
        self.emoji = emoji
    }
}

public struct SocketStatusCreatedData: Decodable, Sendable {
    public let status: APIPost
}

public struct SocketStatusDeletedData: Decodable, Sendable {
    public let statusId: String
    public let authorId: String
}

public struct SocketStatusReactedData: Decodable, Sendable {
    public let statusId: String
    public let userId: String
    public let emoji: String
}

public struct SocketStatusUnreactedData: Decodable, Sendable {
    public let statusId: String
    public let userId: String
    public let emoji: String
    public init(statusId: String, userId: String, emoji: String) {
        self.statusId = statusId
        self.userId = userId
        self.emoji = emoji
    }
}

public struct SocketConversationDeletedData: Decodable, Sendable {
    public let conversationId: String
}

public struct SocketCommentAddedData: Decodable, Sendable {
    public let postId: String
    public let comment: APIPostComment
    public let commentCount: Int
    /// cmid du POST créateur, ré-émis par le gateway dans l'écho — permet à
    /// l'ÉMETTEUR de remplacer sa ligne optimiste (insérée sous cet id local)
    /// au lieu d'en insérer une seconde sous l'id serveur. `nil` quand le
    /// créateur n'a pas envoyé de `X-Client-Mutation-Id`.
    public let clientMutationId: String?

    public init(postId: String, comment: APIPostComment, commentCount: Int, clientMutationId: String? = nil) {
        self.postId = postId
        self.comment = comment
        self.commentCount = commentCount
        self.clientMutationId = clientMutationId
    }
}

/// Écho d'édition d'un commentaire (`comment:updated`) — porte le commentaire
/// COMPLET : le client remplace la ligne en place (idempotent par id).
public struct SocketCommentUpdatedData: Decodable, Sendable {
    public let postId: String
    public let comment: APIPostComment

    public init(postId: String, comment: APIPostComment) {
        self.postId = postId
        self.comment = comment
    }
}

public struct SocketCommentDeletedData: Decodable, Sendable {
    public let postId: String
    public let commentId: String
    public let commentCount: Int
}

/// Charge utile de `comment:liked` ET de sa jumelle descendante
/// `comment:unliked` : le contrat déclare deux interfaces de forme identique
/// (`CommentLikedEventData` / `CommentUnlikedEventData`), parce que `likeCount`
/// y est le total ABSOLU après application — jamais un delta. Une seule forme
/// suffit donc ici, comme `SocketCommentReactionUpdateEvent` sert déjà
/// `comment:reaction-added` et `comment:reaction-removed`. Le SENS vit dans le
/// sujet, pas dans les champs.
public struct SocketCommentLikedData: Decodable, Sendable {
    public let postId: String
    public let commentId: String
    public let userId: String
    public let likeCount: Int
}

public struct SocketCommentReactionAggregation: Codable, Sendable {
    public let emoji: String
    public let count: Int
    public let userIds: [String]
    public let hasCurrentUser: Bool
}

public struct SocketCommentReactionUpdateEvent: Codable, Sendable {
    public let commentId: String
    public let postId: String
    public let userId: String
    public let emoji: String
    public let action: String
    public let aggregation: SocketCommentReactionAggregation
    public let timestamp: Date?
}

public struct SocketCommentReactionSyncEvent: Codable, Sendable {
    public let commentId: String
    // postId is required so a sync (request-sync ACK) can locate the comment in
    // a post-scoped cache — the gateway's getCommentReactions returns it and the
    // shared CommentReactionSyncEventData declares it required. Without it iOS
    // could not key the comment to its post.
    public let postId: String
    public let reactions: [SocketCommentReactionAggregation]
    public let totalCount: Int
    public let userReactions: [String]
}

public struct SocketPostBookmarkedData: Decodable, Sendable {
    public let postId: String
    public let bookmarked: Bool
    /// Absolute bookmark count after the mutation (mirrors `likeCount` on the
    /// like events). Optional so decoding survives an older gateway that does
    /// not yet emit it — clients then leave the displayed count untouched.
    public let bookmarkCount: Int?
}

public struct SocketPostReactionAggregation: Codable, Sendable {
    public let emoji: String
    public let count: Int
}

public struct SocketPostReactionUpdateEvent: Codable, Sendable {
    public let postId: String
    public let userId: String
    public let emoji: String
    public let action: String
    public let aggregation: SocketPostReactionAggregation
    public let timestamp: Date?
}

public struct SocketPostReactionSyncEvent: Codable, Sendable {
    public let postId: String
    public let reactions: [SocketPostReactionAggregation]
    public let totalCount: Int
    public let userReactions: [String]
}

public struct SocketStoryTranslationUpdatedData: Decodable, Sendable {
    public let postId: String
    public let textObjectIndex: Int
    public let translations: [String: String]
}

// Socket payloads use camelCase (unlike REST which uses snake_case)
public struct SocketTranslationPayload: Decodable, Sendable {
    public let text: String
    public let translationModel: String?
    public let confidenceScore: Double?
    public let createdAt: String?
}

public struct SocketPostTranslationUpdatedData: Decodable, Sendable {
    public let postId: String
    public let language: String
    public let translation: SocketTranslationPayload
}

public struct SocketCommentTranslationUpdatedData: Decodable, Sendable {
    public let commentId: String
    public let postId: String
    public let language: String
    public let translation: SocketTranslationPayload
}

/// `comment:media-updated` — émis quand le pipeline audio d'un média de commentaire
/// a produit une transcription/traductions. Porte le commentaire enrichi (média
/// transcrit/traduit) à substituer en cache.
public struct SocketCommentMediaUpdatedData: Decodable, Sendable {
    public let postId: String
    public let commentId: String
    public let comment: APIPostComment
}

/// `media:caption-translation-updated` — émis quand le pipeline ZMQ a traduit la
/// LÉGENDE (`PostMedia.caption`) d'un média, post OU commentaire (#6280).
/// DISTINCT de `SocketPostTranslationUpdatedData` (traduit `Post.content`) et de
/// `SocketCommentMediaUpdatedData` (recharge le commentaire ENTIER pour une
/// transcription audio prête). `commentId` est absent quand le média appartient
/// directement à un post.
public struct SocketMediaCaptionTranslationUpdatedData: Decodable, Sendable {
    public let mediaId: String
    public let postId: String
    public let commentId: String?
    public let language: String
    public let translation: SocketTranslationPayload
}
