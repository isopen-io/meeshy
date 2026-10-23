package me.meeshy.ui.component.bubble

import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ApiMessageReplyPreview
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.util.resolveMediaUrl

/**
 * Ce que la citation d'une réponse affiche : le texte servi, la nature du média cité,
 * sa vignette et son auteur.
 */
internal data class BubbleQuotedReply(
    val text: String?,
    val isDeleted: Boolean,
    val mediaKind: ReplyMediaKind,
    val thumbnailUrl: String?,
    val senderName: String?,
)

/**
 * Le SEUL constructeur de la citation côté Android — miroir de
 * `APIMessageReplyTo.toReplyReference(currentUserId:preferredLanguages:)` (iOS), qui décide
 * protection et Prisme au même endroit.
 *
 * - Un message cité PROTÉGÉ (vue unique, flouté, chiffré — [ApiMessageReplyPreview.isProtected])
 *   ne republie rien : le texte devient le placeholder iOS (« 👁️ 🖼️ », « 🌫️ 💬 », « 🔒 🎵 »),
 *   et aucune vignette ni URL du média ne part.
 * - Sinon le texte est élu par le Prisme du lecteur ; une traduction chiffrée n'est pas une
 *   traduction et se saute ; aucune traduction servie ⇒ l'original.
 * - L'auteur retombe sur `sender.displayName`, puis `username`.
 */
internal object BubbleQuotedReplyBuilder {

    fun build(
        reply: ApiMessageReplyPreview?,
        preferences: LanguageResolver.ContentLanguagePreferences,
        mediaBaseUrl: String?,
    ): BubbleQuotedReply? {
        if (reply == null) return null
        val senderName = listOf(reply.senderDisplayName, reply.sender?.displayName, reply.sender?.username)
            .firstOrNull { !it.isNullOrBlank() }
        if (reply.deletedAt != null) {
            return BubbleQuotedReply(
                text = null,
                isDeleted = true,
                mediaKind = ReplyMediaKind.None,
                thumbnailUrl = null,
                senderName = senderName,
            )
        }
        val attachments = reply.attachments.orEmpty()
        val representative = representativeOf(reply, attachments)
        if (reply.isProtected) {
            return BubbleQuotedReply(
                text = protectedPlaceholder(reply, representative),
                isDeleted = false,
                mediaKind = ReplyMediaKind.None,
                thumbnailUrl = null,
                senderName = senderName,
            )
        }
        val image = representative?.takeIf { it.isQuotedImage }
        return BubbleQuotedReply(
            text = servedText(reply, preferences),
            isDeleted = false,
            mediaKind = when {
                image != null -> ReplyMediaKind.Image
                representative != null -> ReplyMediaKind.File
                else -> ReplyMediaKind.None
            },
            thumbnailUrl = image
                ?.let { it.thumbnailUrl ?: it.fileUrl }
                ?.let { resolveMediaUrl(it, mediaBaseUrl) },
            senderName = senderName,
        )
    }

    private fun representativeOf(
        reply: ApiMessageReplyPreview,
        attachments: List<ApiMessageAttachment>,
    ): ApiMessageAttachment? {
        val named = reply.attachmentReplyTo?.attachmentId
        if (named != null) return attachments.firstOrNull { it.id == named }
        return attachments.firstOrNull { it.isQuotedImage } ?: attachments.firstOrNull()
    }

    private fun servedText(
        reply: ApiMessageReplyPreview,
        preferences: LanguageResolver.ContentLanguagePreferences,
    ): String {
        val readable = reply.translations.orEmpty().filter { it.isEncrypted != true }
        return LanguageResolver
            .preferredTranslation(readable, preferences, reply.originalLanguage)
            ?.translatedContent
            ?: reply.content
    }

    private fun protectedPlaceholder(
        reply: ApiMessageReplyPreview,
        representative: ApiMessageAttachment?,
    ): String {
        val flags = reply.effectFlags ?: 0L
        val protectionIcon = when {
            reply.isViewOnce == true || (flags and MessageEffectFlags.VIEW_ONCE) != 0L -> "👁️"
            reply.isBlurred == true || (flags and MessageEffectFlags.BLURRED) != 0L -> "🌫️"
            else -> "🔒"
        }
        return "$protectionIcon ${contentTypeIcon(representative?.mimeType)}"
    }

    private fun contentTypeIcon(mimeType: String?): String = when {
        mimeType == null -> "💬"
        mimeType.startsWith("image/") -> "🖼️"
        mimeType.startsWith("video/") -> "🎬"
        mimeType.startsWith("audio/") -> "🎵"
        mimeType == "application/x-location" -> "📍"
        else -> "📎"
    }

    private val ApiMessageAttachment.isQuotedImage: Boolean
        get() = mimeType?.startsWith("image/") == true
}
