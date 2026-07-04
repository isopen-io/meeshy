import Foundation

/// Wave 1 Task 3.2 — payload structs for non-message offline mutations.
///
/// Each payload is `Codable & Sendable & Equatable` and embeds
/// `clientMutationId` (the dedup key shared with the gateway `MutationLog`,
/// Task 3.3). One file, many structs, because:
///   1. They share the same semantic role (offline mutation envelopes).
///   2. They're small (3-8 fields each) — splitting into 15 files would
///      scatter trivial types across the persistence dir.
///   3. The full contract is reviewable in one read alongside the matching
///      `OutboxKind` cases in `OutboxRecord.swift`.
///
/// When the gateway grows a matching DTO per kind (Task 3.5), the wire
/// shape MUST stay aligned with these structs — `JSONEncoder` is canonical.
/// Keep field names camelCase to match the rest of the iOS Codable surface;
/// the gateway-side TS types will use the same shape via `@meeshy/shared`.

// MARK: - Conversations & messages metadata

/// R6 — payload du kind `.markStoryViewed` : le « vu » d'une story survit à
/// un kill/offline et se rejoue au reconnect. `storyId` sert aussi d'anchor
/// de coalescing (latest-wins par story).
public struct MarkStoryViewedPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let storyId: String

    public init(clientMutationId: String, storyId: String) {
        self.clientMutationId = clientMutationId
        self.storyId = storyId
    }
}

public struct MarkAsReadPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let conversationId: String
    public let upToMessageId: String

    public init(clientMutationId: String, conversationId: String, upToMessageId: String) {
        self.clientMutationId = clientMutationId
        self.conversationId = conversationId
        self.upToMessageId = upToMessageId
    }
}

public struct CreateConversationPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    /// One of `"direct" | "group" | "community"` — mirrors `CommonSchemas.conversationType`.
    public let type: String
    public let title: String?
    public let participantIds: [String]

    public init(
        clientMutationId: String,
        type: String,
        title: String?,
        participantIds: [String]
    ) {
        self.clientMutationId = clientMutationId
        self.type = type
        self.title = title
        self.participantIds = participantIds
    }
}

public struct UpdateConversationPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let conversationId: String
    public let title: String?
    public let description: String?
    public let avatarUrl: String?

    public init(
        clientMutationId: String,
        conversationId: String,
        title: String?,
        description: String?,
        avatarUrl: String?
    ) {
        self.clientMutationId = clientMutationId
        self.conversationId = conversationId
        self.title = title
        self.description = description
        self.avatarUrl = avatarUrl
    }
}

// MARK: - Social graph (friends, blocks)

public struct SendFriendRequestPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let targetUserId: String

    public init(clientMutationId: String, targetUserId: String) {
        self.clientMutationId = clientMutationId
        self.targetUserId = targetUserId
    }
}

public struct RespondFriendRequestPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let friendRequestId: String
    public let action: Action

    public enum Action: String, Codable, Sendable {
        case accept
        case reject
    }

    public init(clientMutationId: String, friendRequestId: String, action: Action) {
        self.clientMutationId = clientMutationId
        self.friendRequestId = friendRequestId
        self.action = action
    }
}

public struct BlockUserPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let targetUserId: String

    public init(clientMutationId: String, targetUserId: String) {
        self.clientMutationId = clientMutationId
        self.targetUserId = targetUserId
    }
}

public struct UnblockUserPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let targetUserId: String

    public init(clientMutationId: String, targetUserId: String) {
        self.clientMutationId = clientMutationId
        self.targetUserId = targetUserId
    }
}

// MARK: - Self-service: profile + settings

public struct UpdateProfilePayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let displayName: String?
    public let bio: String?
    public let avatarUrl: String?

    public init(
        clientMutationId: String,
        displayName: String?,
        bio: String?,
        avatarUrl: String?
    ) {
        self.clientMutationId = clientMutationId
        self.displayName = displayName
        self.bio = bio
        self.avatarUrl = avatarUrl
    }
}

/// Wave 1 Phase C — the gateway exposes 7 preference categories (privacy,
/// audio, message, notification, video, document, application) at
/// `PUT|PATCH /me/preferences/{category}`. Instead of inflating
/// `OutboxKind` with 7 cases, a single `.updateSettings` row carries the
/// category alongside an opaque `body` JSON blob — the dispatcher routes
/// to the correct path by reading `payload.category`, and the gateway
/// dedup key is `updateSettings:${category}` so two categories with the
/// same cmid would still be distinct mutation log rows.
///
/// `body` is encoded once at enqueue time so we don't need to know the
/// concrete preference struct (PrivacyPreferences, AudioPreferences, …)
/// here — keeps the SDK payload layer category-agnostic.
public struct UpdateSettingsPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    /// One of `"privacy" | "audio" | "message" | "notification" | "video"
    /// | "document" | "application"` — matches the gateway category name.
    public let category: String
    /// JSON-encoded category body (e.g. encoded `PrivacyPreferences`).
    /// Stored as raw `Data` so the SDK doesn't need to know the concrete
    /// preference struct type at this layer.
    public let body: Data

    public init(
        clientMutationId: String,
        category: String,
        body: Data
    ) {
        self.clientMutationId = clientMutationId
        self.category = category
        self.body = body
    }
}

// MARK: - Stories

/// Wraps an existing `StoryOfflineQueueItem` by id so the outbox can adopt
/// story-publish without duplicating the slide-snapshot payload (which lives
/// in `StoryOfflineQueue` JSON file). When the queues merge (Tier C), this
/// shrinks to a pure pointer and the slide payload moves into `OutboxRecord.payload`.
public struct PublishStoryPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let offlineQueueItemId: String

    public init(clientMutationId: String, offlineQueueItemId: String) {
        self.clientMutationId = clientMutationId
        self.offlineQueueItemId = offlineQueueItemId
    }
}

public struct RepostStoryPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let originalStoryId: String
    /// `nil` = public repost ; non-nil = private repost into a conversation.
    public let targetConversationId: String?

    public init(
        clientMutationId: String,
        originalStoryId: String,
        targetConversationId: String?
    ) {
        self.clientMutationId = clientMutationId
        self.originalStoryId = originalStoryId
        self.targetConversationId = targetConversationId
    }
}

// MARK: - Posts & comments

public struct CreatePostPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let content: String
    public let attachmentIds: [String]
    /// `"public" | "friends" | "community:<id>"` — kept as free-form string to
    /// avoid coupling the offline payload to backend enum churn.
    public let visibility: String
    /// Source language of `content`, forwarded to the gateway so the Prisme
    /// translation pipeline detects the right source. `nil` lets the gateway
    /// auto-detect. Optional so older persisted rows (pre-U1 ST3) decode as nil.
    public let originalLanguage: String?
    /// U1b — local media file paths (stored relative to the pending-media dir,
    /// resolved via `OfflineQueue.absoluteMediaPath(forStored:)`) for an OFFLINE
    /// media post: the dispatcher uploads them via TUS on reconnect, then creates
    /// the post with the resulting ids (+ any already-uploaded `attachmentIds`).
    /// `nil`/empty = text-only or already-uploaded post. Optional so older
    /// persisted rows decode as nil. Mirrors message media durability (S7b/S8).
    public let localMediaPaths: [String]?
    /// Server-side post type (`"POST" | "REEL" | "STATUS" | …`), forwarded to the
    /// gateway so an OFFLINE create lands on the right surface — a video /
    /// multi-image post created offline becomes a `REEL` exactly like the online
    /// path (`ReelComposition.defaultType`), and a mood becomes a `STATUS`.
    /// `nil` = the gateway default (`POST`). Optional so older persisted rows
    /// (pre-reel-offline) decode as nil and keep replaying as plain posts.
    public let type: String?
    /// STATUS/mood emoji (`type == "STATUS"`). Optional + ignored by the gateway
    /// for non-status types. Carried here so a mood survives offline durably via
    /// the same `.createPost` row as posts/reels.
    public let moodEmoji: String?
    /// Already-uploaded audio URL for an audio STATUS. `nil` for text/visual.
    public let audioUrl: String?
    /// Duration (seconds) of `audioUrl`. `nil` when there is no audio.
    public let audioDuration: Int?
    /// Explicit recipient ids for `EXCEPT` / `ONLY` visibility (and audience
    /// scoping for statuses). `nil` for the public/friends default.
    public let visibilityUserIds: [String]?

    public init(
        clientMutationId: String,
        content: String,
        attachmentIds: [String],
        visibility: String,
        originalLanguage: String? = nil,
        localMediaPaths: [String]? = nil,
        type: String? = nil,
        moodEmoji: String? = nil,
        audioUrl: String? = nil,
        audioDuration: Int? = nil,
        visibilityUserIds: [String]? = nil
    ) {
        self.clientMutationId = clientMutationId
        self.content = content
        self.attachmentIds = attachmentIds
        self.visibility = visibility
        self.originalLanguage = originalLanguage
        self.localMediaPaths = localMediaPaths
        self.type = type
        self.moodEmoji = moodEmoji
        self.audioUrl = audioUrl
        self.audioDuration = audioDuration
        self.visibilityUserIds = visibilityUserIds
    }
}

public struct ToggleLikePostPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let postId: String
    /// `true` = like, `false` = unlike. Encoded explicitly (not as presence)
    /// so the offline replay is deterministic regardless of server state.
    public let liked: Bool

    public init(clientMutationId: String, postId: String, liked: Bool) {
        self.clientMutationId = clientMutationId
        self.postId = postId
        self.liked = liked
    }
}

public struct CreateCommentPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let postId: String
    public let parentCommentId: String?
    public let content: String

    public init(
        clientMutationId: String,
        postId: String,
        parentCommentId: String?,
        content: String
    ) {
        self.clientMutationId = clientMutationId
        self.postId = postId
        self.parentCommentId = parentCommentId
        self.content = content
    }
}

public struct DeleteCommentPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let commentId: String

    public init(clientMutationId: String, commentId: String) {
        self.clientMutationId = clientMutationId
        self.commentId = commentId
    }
}

public struct ToggleLikeCommentPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let commentId: String
    public let liked: Bool

    public init(clientMutationId: String, commentId: String, liked: Bool) {
        self.clientMutationId = clientMutationId
        self.commentId = commentId
        self.liked = liked
    }
}
