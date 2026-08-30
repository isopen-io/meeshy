package me.meeshy.sdk.model

import kotlinx.serialization.SerialName
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

/**
 * Wire contract of `user:status` (and each entry of `presence:snapshot`'s `users`
 * array, an identical per-user shape) — mirrors the gateway's real payload
 * (`packages/shared/types/socketio-events.ts` `UserStatusEvent`:
 * `{userId, username, isOnline, lastActiveAt}`). A prior `status: String`/
 * `lastSeenAt: String?` shape here matched no field the gateway ever emits, so
 * every live presence update silently decoded to blank defaults — RE-PROUVEN
 * against the shared TS type and the gateway's `_broadcastUserStatus` emitter
 * before fixing (see `NOTES.md`).
 */
@Serializable
data class UserStatusEvent(
    val userId: String,
    val username: String = "",
    val isOnline: Boolean = false,
    val lastActiveAt: String? = null,
)

@Serializable
data class TranslationEvent(
    val messageId: String,
    val conversationId: String,
    val targetLanguage: String,
    val translatedContent: String,
    val translationModel: String? = null,
)

/**
 * A ready voice-note transcript — the payload of `audio:transcription-ready`.
 *
 * Faithful to `packages/shared/types/socketio-events.ts` `TranscriptionReadyEventData`:
 * the transcript NESTS under [transcription], with only the identifiers and
 * [processingTimeMs] at the top level. Same nesting as its sibling
 * [AudioTranslationEvent], and same reason for spelling it out — a flat model
 * makes `text` a missing required field, so every frame throws at decode time and
 * is swallowed by the `runCatching` around the socket listener.
 *
 * Deserialization is lenient (blank text, null language) so a malformed frame is
 * dropped by the merge no-op rather than throwing.
 */
@Serializable
data class TranscriptionReadyEvent(
    val messageId: String,
    val conversationId: String,
    val attachmentId: String? = null,
    val transcription: TranscriptionPayload = TranscriptionPayload(),
    val processingTimeMs: Long? = null,
)

@Serializable
data class TranscriptionPayload(
    val id: String? = null,
    val text: String = "",
    val language: String? = null,
    val confidence: Double? = null,
    val durationMs: Long? = null,
    val source: String? = null,
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

/**
 * `conversation:participant-left`.
 *
 * `userId` est NULLABLE, et ce n'est pas une précaution : un visiteur venu par
 * un lien partagé n'a aucune ligne `User`, donc la passerelle émet `null`. Tant
 * que ce champ était déclaré `String`, kotlinx échouait à décoder le document
 * ENTIER — l'événement n'atteignait aucun collecteur, en silence. Même famille
 * que `ParticipantRoleUpdatedEvent`, dont le `role` de premier niveau n'a jamais
 * existé sur le fil.
 *
 * `participantId` est la seule identité TOUJOURS servie : c'est sur elle qu'on
 * retire la bonne ligne. Elle reste optionnelle pour tolérer une passerelle
 * antérieure au contrat, où seuls les départs de comptes étaient annoncés.
 */
@Serializable
data class ParticipantLeftEvent(
    val conversationId: String,
    val userId: String? = null,
    val participantId: String? = null,
) {
    /** La personne nommée est-elle [identity] ? Un compte se reconnaît par son
     *  `User.id`, un visiteur de lien par son `Participant.id`. */
    fun names(identity: String): Boolean =
        identity.isNotEmpty() && (identity == userId || identity == participantId)
}

/** `conversation:participant-banned` — voir [ParticipantLeftEvent] pour la
 *  nullabilité de `userId`. `closedShareLinkId` nomme le lien que ce
 *  bannissement a fermé : bannir sort de la conversation ET invalide la porte
 *  empruntée. `null` quand il n'y avait pas de lien à fermer. */
@Serializable
data class ParticipantBannedEvent(
    val conversationId: String,
    val userId: String? = null,
    val participantId: String? = null,
    val bannedAt: String? = null,
    val closedShareLinkId: String? = null,
) {
    fun names(identity: String): Boolean =
        identity.isNotEmpty() && (identity == userId || identity == participantId)
}

/**
 * `participant:role-updated`.
 *
 * Le rang voyage sous **`newRole`** au premier niveau — c'est ce que la
 * passerelle émet depuis toujours. Ce champ s'appelait ici `role` sans
 * `@SerialName`, donc absent de la charge utile : NON-optionnel et sans défaut,
 * il faisait lever `MissingFieldException` à chaque événement, avalée par le
 * `runCatching` du listener. Aucun changement de rang n'atteignait le
 * trombinoscope, en silence.
 *
 * Ne PAS lire le `participant.role` imbriqué à sa place : il porte le rôle
 * GLOBAL (`USER|ADMIN|…`) depuis le cycle 92 bis, le rang de conversation étant
 * passé sous `participant.conversationRole`.
 */
@Serializable
data class ParticipantRoleUpdatedEvent(
    val conversationId: String,
    val userId: String,
    @SerialName("newRole") val role: String,
)

/**
 * Wire contract of `presence:snapshot` — mirrors the gateway's real payload
 * (`PresenceSnapshotEventData`: `{users: [{userId, username, isOnline,
 * lastActiveAt}]}`), reusing [UserStatusEvent] for each entry since the shape is
 * identical. A prior flat `onlineUserIds: List<String>` shape matched no field
 * the gateway ever emits — see [UserStatusEvent]'s own doc comment.
 */
@Serializable
data class PresenceSnapshotEvent(
    val users: List<UserStatusEvent> = emptyList(),
)

@Serializable
data class ConversationDeletedSocketEvent(
    val conversationId: String,
    val deletedAt: String? = null,
)

/**
 * `conversation:restored` — la MONTANTE du couple `delete-for-me` /
 * `restore-for-me` (#4389, moitié cliente de #4344).
 *
 * Diffusée sur la room PERSONNELLE du restaurateur, jamais celle de la
 * conversation : le geste est personnel, et les autres membres n'ont rien à
 * apprendre — la conversation ne les a jamais quittés.
 *
 * `userId` est déclaré comme sur [ConversationDeletedSocketEvent]… à ceci près
 * que la descendante ne le porte PAS ici : son modèle Kotlin s'arrête à
 * `conversationId` + `deletedAt`, quand la passerelle émet bien `userId`. On ne
 * corrige pas ce voisin dans ce lot, mais on ne reproduit pas son omission :
 * `userId` est ce qui permettra de distinguer une restauration à soi d'un
 * événement reçu par erreur, le jour où cette room cesse d'être une preuve.
 * Il est OPTIONNEL par prudence de décodage — kotlinx échoue sur le document
 * ENTIER quand un champ requis manque, et un tel échec est silencieux.
 */
@Serializable
data class ConversationRestoredSocketEvent(
    val conversationId: String,
    val userId: String? = null,
)

/** `conversation:closed` — the whole conversation ended for EVERY participant
 *  (creator-only full delete), distinct from [ConversationDeletedSocketEvent]
 *  which is scoped to the caller's own devices only (`delete-for-me`). */
@Serializable
data class ConversationClosedSocketEvent(
    val conversationId: String,
    val closedBy: String,
    val closedAt: String? = null,
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
    /**
     * `User.id` of the actor, or `null` when the actor is an ANONYMOUS
     * participant — they have no `User` row, so [participantId] is their only
     * identity. Expected on every action of a share-link guest.
     *
     * A `Participant.id` must never arrive here: both id spaces are 24-char
     * ObjectId strings, so nothing downstream could tell them apart. Consumers
     * identifying the actor must read `userId ?: participantId`, in that order
     * — the same rule that names the actor's personal room.
     */
    val userId: String? = null,
    val type: String = "read",
    val updatedAt: String? = null,
    val summary: ReadStatusSummary = ReadStatusSummary(),
)
// Ce miroir ne déclare volontairement NI `lastReadAt` NI `unreadCount`. Ces
// deux champs du contrat décrivent l'ACTEUR (sa frontière de lecture, son
// arriéré), pas la conversation, et le serveur ne les met que dans la copie
// adressée à la room personnelle de l'acteur — la copie de l'éventail, celle
// qui porte les coches à tous les pairs, ne les porte pas. Les ajouter ici
// suppose donc d'écouter l'événement sur `user:<userId ?: participantId>` et
// de vérifier « l'acteur, c'est moi » avant d'y toucher.

/** Social socket events — mirrors iOS SocialSocketManager payloads. */

@Serializable
data class SocketPostCreatedData(
    val post: ApiPost,
    val clientMutationId: String? = null,
)

/**
 * `post:updated` — the author edited a post (caption, media, mood, ...) and the gateway
 * broadcast the COMPLETE new post to every feed/post room. The broadcast is a single
 * unpersonalized object shared by all recipients, so its viewer-specific fields
 * ([ApiPost.isLikedByMe] etc.) are NOT the recipient's own state — the fold preserves
 * those from the cached copy via [PostUpdateMerge]. Mirror of iOS `SocketPostUpdatedData`
 * (which nests the post under a `post` key), and the content-edit sibling of
 * [SocketPostCreatedData] / [SocketPostTranslationUpdatedData].
 */
@Serializable
data class SocketPostUpdatedData(
    val post: ApiPost,
)

/**
 * `post:reposted` — a user reposted (or quote-reposted) a post; the gateway broadcast the
 * repost as a COMPLETE new post ([repost], authored by the reposter, embedding the original
 * under [ApiPost.repostOf]) to every visibility-filtered feed room. [originalPostId] names
 * the post that was reposted. The feed folds [repost] onto the head exactly like a
 * `post:created` arrival — a repost is itself a new feed post. Mirror of iOS
 * `SocketPostRepostedData` (`{ originalPostId, repost }`), the arrival sibling of
 * [SocketPostCreatedData].
 */
@Serializable
data class SocketPostRepostedData(
    val originalPostId: String,
    val repost: ApiPost,
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

/**
 * `comment:updated` — a comment was edited server-side (content, effects, regenerated
 * translations). Carries the COMPLETE new comment so the client replaces the matched row
 * in place, idempotent by id — the edit sibling of [SocketCommentAddedData]. Mirror of iOS
 * `SocketCommentUpdatedData` (both nest the full [ApiPostComment] under `comment`).
 */
@Serializable
data class SocketCommentUpdatedData(
    val postId: String,
    val comment: ApiPostComment,
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

/**
 * `story:updated` — an author edited a story; carries the COMPLETE new story under
 * [story] (the edit sibling of [SocketStoryCreatedData]). [engagementReset] is `true`
 * when the edit wiped views/reactions server-side (a content edit) — the open viewer
 * then re-seeds the slide's reaction count from the fresh story; `false`/absent on a
 * metadata-only change (e.g. visibility) leaves any live reaction count in place.
 * Mirror of iOS `SocketStoryUpdatedData`.
 */
@Serializable
data class SocketStoryUpdatedData(
    val story: ApiPost,
    val engagementReset: Boolean? = null,
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

/**
 * `story:deleted` — an author removed a story. The gateway broadcasts it to every
 * friend's feed room (over-broadcast is safe: a recipient who never had the story
 * ignores it), so an open viewer folds it out live. Mirror of iOS
 * `SocketStoryDeletedData`; [authorId] defaults to empty for forward-compatible decoding.
 */
@Serializable
data class SocketStoryDeletedData(
    val storyId: String,
    val authorId: String = "",
)

/**
 * `story:translation-updated` — the gateway translated a story's on-canvas text
 * overlay and broadcasts the new translations for the object at [textObjectIndex]
 * (the flat index into the story's translatable texts). Mirror of iOS
 * `SocketStoryTranslationUpdatedData`. [translations] is a language→text map;
 * an empty map is a no-op the merge ignores.
 */
@Serializable
data class SocketStoryTranslationUpdatedData(
    val postId: String,
    val textObjectIndex: Int,
    val translations: Map<String, String> = emptyMap(),
)

/**
 * `post:translation-updated` — the gateway translated a post's text into [language]
 * server-side and broadcasts the finished entry so an open feed card can switch to it
 * without a refetch (the caption sibling of [SocketStoryTranslationUpdatedData], which
 * carries per-overlay maps instead). Mirror of iOS `SocketPostTranslationUpdatedData`.
 * [translation] has the same shape as [ApiPostTranslationEntry] — text plus optional
 * model/confidence/timestamp — so it decodes straight into one; a blank text is a no-op
 * the [PostTranslationMerge] ignores.
 */
@Serializable
data class SocketPostTranslationUpdatedData(
    val postId: String,
    val language: String,
    val translation: ApiPostTranslationEntry,
)

/**
 * `comment:translation-updated` — the gateway translated a comment's text into [language]
 * server-side and broadcasts the finished entry so an open comment thread can switch that
 * row to it without a refetch (the comment-keyed sibling of
 * [SocketPostTranslationUpdatedData], one rung over: it carries [commentId] too). Mirror of
 * iOS `SocketCommentTranslationUpdatedData`. [translation] has the same shape as
 * [ApiPostTranslationEntry] — text plus optional model/confidence/timestamp — so it decodes
 * straight into one; a blank text is a no-op the [PostTranslationMerge] ignores.
 */
@Serializable
data class SocketCommentTranslationUpdatedData(
    val postId: String,
    val commentId: String,
    val language: String,
    val translation: ApiPostTranslationEntry,
)

/**
 * `status:unreacted` — a user removed their reaction from a mood status. Same shape as
 * [SocketStatusReactedData] (mirror of the shared `StatusUnreactedEventData`): it carries
 * no aggregate count, so the bar decrements the emoji by one (clamped ≥0, dropping the
 * spent bucket), skipping the un-reactor's own echo (guarded in the ViewModel). A SOTA
 * symmetry the iOS bar handlers lack — the gateway emits it on every reaction removal.
 */
@Serializable
data class SocketStatusUnreactedData(
    val statusId: String,
    val userId: String,
    val emoji: String,
)
