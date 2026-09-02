package me.meeshy.sdk.model

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonNames
import me.meeshy.sdk.lang.LanguageResolver

@Serializable
data class ApiMessageReplyPreview(
    val id: String,
    val content: String = "",
    val senderDisplayName: String? = null,
    val deletedAt: String? = null,
    val attachments: List<ApiMessageAttachment>? = null,
)

/**
 * Frozen snapshot of the post (status/story/reel/post) a message replies to —
 * port of APIPostReplyTarget (MessageModels.swift). Received via the modern
 * `postReplyTo` key (legacy `storyReplyTo`). Survives the post's expiry because
 * it is captured at reply time. A non-null [moodEmoji] marks a mood/status
 * reply (emoji + content render); otherwise it is a story reply (thumbnail +
 * reaction/comment/share counts).
 */
@Serializable
data class ApiPostReplyTarget(
    val id: String,
    val type: String? = null,
    val reactionCount: Int = 0,
    val commentCount: Int = 0,
    val shareCount: Int = 0,
    val createdAt: String? = null,
    val thumbnailUrl: String? = null,
    val previewText: String = "",
    val moodEmoji: String? = null,
)

/** A pre-loaded text translation — port of APITextTranslation (MessageModels.swift). */
@Serializable
data class ApiTextTranslation(
    val id: String? = null,
    val messageId: String? = null,
    val sourceLanguage: String = "",
    override val targetLanguage: String,
    override val translatedContent: String,
    val translationModel: String? = null,
    val confidenceScore: Double? = null,
    val cached: Boolean = false,
) : LanguageResolver.TranslationLike

@Serializable
data class ApiMessageSender(
    val id: String? = null,
    val userId: String? = null,
    val displayName: String? = null,
    val username: String? = null,
    val avatar: String? = null,
)

/**
 * The SOURCE conversation of a forwarded message, hoisted onto the payload by
 * the gateway (`forwardedFromConversation`) alongside `forwardedFromId`. Carries
 * exactly the fields the gateway selects: `id`, `title`, `identifier`, `type`,
 * `avatar`. Used to name the forward badge — see [ForwardBadgePolicy].
 */
@Serializable
data class ApiForwardedConversation(
    val id: String? = null,
    val title: String? = null,
    val identifier: String? = null,
    val type: String? = null,
    val avatar: String? = null,
)

/** Message — port of APIMessage (MessageModels.swift). */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiMessage(
    val id: String,
    val conversationId: String,
    val senderId: String? = null,
    val content: String = "",
    val messageType: String = "text",
    val originalLanguage: String? = null,
    val isEdited: Boolean = false,
    val editedAt: String? = null,
    val deletedAt: String? = null,
    val replyToId: String? = null,
    val storyReplyToId: String? = null,
    @JsonNames("storyReplyTo")
    val postReplyTo: ApiPostReplyTarget? = null,
    val createdAt: String? = null,
    val sender: ApiMessageSender? = null,
    val translations: List<ApiTextTranslation> = emptyList(),
    val reactionSummary: Map<String, Int>? = null,
    val deliveredCount: Int = 0,
    val readCount: Int = 0,
    val readByAllAt: String? = null,
    val replyTo: ApiMessageReplyPreview? = null,
    val clientMessageId: String? = null,
    val attachments: List<ApiMessageAttachment> = emptyList(),
    val pinnedAt: String? = null,
    val pinnedBy: String? = null,
    val forwardedFromId: String? = null,
    val forwardedFromConversationId: String? = null,
    val forwardedFromConversation: ApiForwardedConversation? = null,
    val effectFlags: Int? = null,
    val isBlurred: Boolean? = null,
    val isViewOnce: Boolean? = null,
    val viewOnceCount: Int = 0,
    val expiresAt: String? = null,
    /**
     * `"user" | "system" | "ads" | "app" | "agent" | "authority"` — port of
     * `messageSource` (MessageModels.swift / `packages/shared/types/message-types.ts`).
     * A system message (e.g. a join/leave notice) is never a turn at talk: it
     * never groups with a neighbour — see `MessageGrouping` (feature/chat).
     */
    val messageSource: String? = null,
) {
    /**
     * Content to display under the Prisme Linguistique: the preferred translation,
     * or the original [content] when no translation targets a preferred language.
     */
    fun displayContent(prefs: LanguageResolver.ContentLanguagePreferences): String =
        LanguageResolver.preferredTranslation(translations, prefs)?.translatedContent ?: content

    /** True when the displayed content is a translation rather than the original. */
    fun isTranslated(prefs: LanguageResolver.ContentLanguagePreferences): Boolean =
        LanguageResolver.preferredTranslation(translations, prefs) != null

    /**
     * The resolved visual/lifecycle effects for this message. A positive
     * [effectFlags] bitfield is authoritative; otherwise lifecycle flags are
     * derived from the legacy `isBlurred` / `isViewOnce` / expiry fields — the
     * exact rule iOS `APIMessage.toMessage` applies.
     */
    val effects: MessageEffects
        get() = MessageEffectsResolver.resolve(
            effectFlags = effectFlags,
            isBlurred = isBlurred,
            isViewOnce = isViewOnce,
            hasExpiry = !expiresAt.isNullOrBlank(),
        )

    /**
     * True for a notice the conversation emits about itself (someone joined,
     * someone left) rather than a turn at talk. A join notice carries the
     * arriver as its author, so this mark — not the sender id — is what keeps
     * it out of the newcomer's first bubble group. See `MessageGrouping`
     * (feature/chat) and its two mirrors: `apps/web/utils/message-grouping.ts`,
     * `apps/ios/.../Bubble/MessageDayGrouping.swift`.
     *
     * The comparison is exact, like both mirrors: a casing change on the
     * gateway must move the three platforms together, not pass unnoticed here.
     */
    val isSystemMessage: Boolean
        get() = messageSource == "system"
}

@Serializable
data class SendMessageRequest(
    val content: String,
    val originalLanguage: String,
    val messageType: String = "text",
    val replyToId: String? = null,
    // Wire twin of `ApiMessage.storyReplyToId` above — the RECEIVE side already
    // carried it; the SEND side never did, so no client could ever construct a
    // request the gateway's `storyReplyToId` (SendMessageBodySchema) accepts.
    val storyReplyToId: String? = null,
    val clientMessageId: String,
    val attachmentIds: List<String>? = null,
    val forwardedFromId: String? = null,
    val forwardedFromConversationId: String? = null,
    val effectFlags: Int? = null,
    val isBlurred: Boolean? = null,
    val isViewOnce: Boolean? = null,
    val ephemeralDuration: Int? = null,
    val expiresAt: String? = null,
    val maxViewOnceCount: Int? = null,
)
