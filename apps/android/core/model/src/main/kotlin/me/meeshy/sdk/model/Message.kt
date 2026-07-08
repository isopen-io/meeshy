package me.meeshy.sdk.model

import kotlinx.serialization.Serializable
import me.meeshy.sdk.lang.LanguageResolver

@Serializable
data class ApiMessageReplyPreview(
    val id: String,
    val content: String = "",
    val senderDisplayName: String? = null,
    val deletedAt: String? = null,
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
)
