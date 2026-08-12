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
    val effectFlags: Int? = null,
    val isBlurred: Boolean? = null,
    val isViewOnce: Boolean? = null,
    val viewOnceCount: Int = 0,
    val expiresAt: String? = null,
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
}

@Serializable
data class SendMessageRequest(
    val content: String,
    val originalLanguage: String,
    val messageType: String = "text",
    val replyToId: String? = null,
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
