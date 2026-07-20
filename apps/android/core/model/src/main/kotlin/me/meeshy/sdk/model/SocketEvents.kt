package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/** Mirrors iOS MessageSocketManager event payloads (Sockets/MessageSocketManager.swift). */

@Serializable
data class MessageDeletedEvent(
    val messageId: String,
    val conversationId: String,
    val deletedAt: String? = null,
)

/** `message:pinned` — a conversation member pinned [messageId]. */
@Serializable
data class MessagePinnedEvent(
    val messageId: String,
    val conversationId: String,
    val pinnedAt: String? = null,
    val pinnedBy: String? = null,
)

/** `message:unpinned` — a conversation member removed the pin on [messageId]. */
@Serializable
data class MessageUnpinnedEvent(
    val messageId: String,
    val conversationId: String,
)

@Serializable
data class TypingEvent(
    val conversationId: String,
    val userId: String,
    val username: String? = null,
    val displayName: String? = null,
)

@Serializable
data class ReactionUpdateEvent(
    val messageId: String,
    val conversationId: String,
    val userId: String,
    val emoji: String,
    val count: Int = 0,
)

@Serializable
data class UnreadUpdateEvent(
    val conversationId: String,
    val unreadCount: Int,
    val totalUnread: Int = 0,
)

@Serializable
data class UserStatusEvent(
    val userId: String,
    val status: String,
    val lastSeenAt: String? = null,
)

@Serializable
data class TranslationEvent(
    val messageId: String,
    val conversationId: String,
    val targetLanguage: String,
    val translatedContent: String,
    val translationModel: String? = null,
)

@Serializable
data class TranscriptionReadyEvent(
    val messageId: String,
    val conversationId: String,
    val attachmentId: String? = null,
    val text: String,
    val language: String? = null,
    val confidence: Double? = null,
    val durationMs: Long? = null,
)

/**
 * A progressive cloned-voice audio translation — the payload of `audio:translation-ready`
 * / `audio:translations-progressive` / `audio:translations-completed` (all share the
 * shared `AudioTranslationEventData` shape). The translated audio nests under
 * [translatedAudio] with the top-level target language in [language]; the gateway keys
 * a voice-cloned rendering of the original voice note into the viewer's language.
 *
 * Faithful to `packages/shared/types/socketio-events.ts` `AudioTranslationEventData`.
 * Deserialization is lenient ([url]/[language] default to blank) so a malformed frame
 * is dropped by the merge no-op rather than throwing at decode time.
 */
@Serializable
data class AudioTranslationEvent(
    val messageId: String,
    val conversationId: String,
    val attachmentId: String? = null,
    val language: String = "",
    val translatedAudio: TranslatedAudioPayload = TranslatedAudioPayload(),
    val processingTimeMs: Long? = null,
)

@Serializable
data class TranslatedAudioPayload(
    val id: String? = null,
    val targetLanguage: String? = null,
    val url: String = "",
    val transcription: String = "",
    val durationMs: Long? = null,
    val format: String? = null,
    val cloned: Boolean = false,
    val quality: Double? = null,
    val voiceModelId: String? = null,
    val ttsModel: String? = null,
)

@Serializable
data class AttachmentUpdatedEvent(
    val messageId: String,
    val conversationId: String,
    val attachmentId: String,
    val status: String? = null,
    val url: String? = null,
    val thumbnailUrl: String? = null,
)

@Serializable
data class ConversationUpdatedSocketEvent(
    val conversationId: String,
    val title: String? = null,
    val description: String? = null,
    val avatar: String? = null,
    val updatedAt: String? = null,
)

@Serializable
data class ParticipantLeftEvent(
    val conversationId: String,
    val userId: String,
)

@Serializable
data class ParticipantBannedEvent(
    val conversationId: String,
    val userId: String,
    val bannedAt: String? = null,
)

@Serializable
data class ParticipantRoleUpdatedEvent(
    val conversationId: String,
    val userId: String,
    val role: String,
)

@Serializable
data class PresenceSnapshotEvent(
    val onlineUserIds: List<String> = emptyList(),
)

@Serializable
data class ConversationDeletedSocketEvent(
    val conversationId: String,
    val deletedAt: String? = null,
)

@Serializable
data class ReadStatusSummary(
    val totalMembers: Int = 0,
    val deliveredCount: Int = 0,
    val readCount: Int = 0,
)

@Serializable
data class ReadStatusUpdatedEvent(
    val conversationId: String,
    val participantId: String,
    val userId: String? = null,
    val type: String = "read",
    val updatedAt: String? = null,
    val summary: ReadStatusSummary = ReadStatusSummary(),
)

/** Social socket events — mirrors iOS SocialSocketManager payloads. */

@Serializable
data class SocketPostCreatedData(
    val post: ApiPost,
    val clientMutationId: String? = null,
)

@Serializable
data class SocketPostLikedData(
    val postId: String,
    val userId: String,
    val likesCount: Int = 0,
)

@Serializable
data class SocketPostUnlikedData(
    val postId: String,
    val userId: String,
    val likesCount: Int = 0,
)

@Serializable
data class SocketPostDeletedData(
    val postId: String,
    val deletedAt: String? = null,
)

/**
 * `post:bookmarked` — a personal event emitted only to the acting user's sockets
 * (via `emitToUser`), so [bookmarked] is always the viewer's own state and
 * [bookmarkCount] the gateway's ABSOLUTE bookmark count after the mutation
 * (mirrors [SocketPostLikedData.likesCount]). Port of PostBookmarkedEventData.
 */
@Serializable
data class SocketPostBookmarkedData(
    val postId: String,
    val bookmarked: Boolean = false,
    val bookmarkCount: Int = 0,
)

@Serializable
data class SocketCommentAddedData(
    val postId: String,
    val comment: ApiPostComment,
    val commentCount: Int = 0,
)

@Serializable
data class SocketCommentLikedData(
    val postId: String,
    val commentId: String,
    val userId: String,
    val likesCount: Int = 0,
)

@Serializable
data class SocketCommentDeletedData(
    val postId: String,
    val commentId: String,
    val commentCount: Int = 0,
)

/** Server-authoritative aggregation for one emoji on a comment (mirror of iOS `SocketCommentReactionAggregation`). */
@Serializable
data class SocketCommentReactionAggregation(
    val emoji: String = "",
    val count: Int = 0,
    val userIds: List<String> = emptyList(),
    val hasCurrentUser: Boolean = false,
)

/**
 * `comment:reaction-added` / `comment:reaction-removed` — a user reacted to (or un-reacted from)
 * a comment. Mirror of iOS `SocketCommentReactionUpdateEvent`. [aggregation] carries the absolute
 * post-mutation state for the emoji; [timestamp] is left as the raw ISO string (optional).
 */
@Serializable
data class SocketCommentReactionUpdateData(
    val commentId: String,
    val postId: String,
    val userId: String,
    val emoji: String,
    val action: String = "",
    val aggregation: SocketCommentReactionAggregation? = null,
    val timestamp: String? = null,
)

@Serializable
data class SocketStoryCreatedData(
    val story: ApiPost,
    val clientMutationId: String? = null,
)

@Serializable
data class SocketStoryViewedData(
    val storyId: String,
    val viewerId: String,
    val viewedAt: String? = null,
)

@Serializable
data class SocketStoryReactedData(
    val storyId: String,
    val userId: String,
    val emoji: String,
)

/**
 * `status:created` — a friend published a mood status. The created post is nested
 * under [status] (mirror of iOS `SocketStatusCreatedData`); the gateway does not echo
 * a [clientMutationId] for statuses, so an own-status echo is de-duplicated by id.
 */
@Serializable
data class SocketStatusCreatedData(
    val status: ApiPost,
    val clientMutationId: String? = null,
)

/** `status:updated` — a mood status was edited; [status] carries the full new post. */
@Serializable
data class SocketStatusUpdatedData(
    val status: ApiPost,
)

/** `status:deleted` — a mood status was removed. Mirror of iOS `SocketStatusDeletedData`. */
@Serializable
data class SocketStatusDeletedData(
    val statusId: String,
    val authorId: String = "",
)

/**
 * `status:reacted` — a user reacted to a mood status. Carries no aggregate count
 * (mirror of iOS `SocketStatusReactedData`), so the bar increments by one, skipping
 * the reactor's own echo (guarded in the ViewModel).
 */
@Serializable
data class SocketStatusReactedData(
    val statusId: String,
    val userId: String,
    val emoji: String,
)

@Serializable
data class SocketStoryUnreactedData(
    val storyId: String,
    val userId: String,
    val emoji: String,
)
