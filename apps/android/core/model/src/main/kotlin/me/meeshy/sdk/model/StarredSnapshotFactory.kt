package me.meeshy.sdk.model

import me.meeshy.sdk.lang.PrismCandidate
import me.meeshy.sdk.lang.PrismTranslationResolver
import me.meeshy.sdk.model.media.MediaKindLabel
import me.meeshy.sdk.model.media.MediaKindStrings

/**
 * Compose l'instantané qu'écrit un message mis en favori (miroir d'iOS
 * `StarredSnapshotFactory`). L'aperçu suit le Prisme : la traduction du rang le plus haut
 * du lecteur (descente de [PrismTranslationResolver], jamais `translations.first()`), sinon
 * le texte, sinon le libellé du média. Il est borné à [PREVIEW_LIMIT] caractères.
 *
 * Un contenu protégé (vue unique, flouté) ou un cryptogramme n'est jamais copié dans
 * l'instantané : seul le libellé du média survit.
 */
public object StarredSnapshotFactory {
    public const val PREVIEW_LIMIT: Int = 280

    public fun snapshot(
        message: ApiMessage,
        conversationName: String?,
        conversationAccentColor: String?,
        preferredLanguages: List<String>,
        mediaStrings: MediaKindStrings?,
        nowMillis: Long,
    ): StarredMessage {
        val kind = attachmentKindOf(message.attachments.firstOrNull())
        return StarredMessage(
            messageId = message.id,
            conversationId = message.conversationId,
            conversationName = conversationName,
            conversationAccentColor = conversationAccentColor,
            senderName = message.sender?.name?.takeIf { it.isNotBlank() },
            senderAvatarUrl = message.sender?.resolvedAvatar?.takeIf { it.isNotBlank() },
            contentPreview = previewOf(message, kind, preferredLanguages, mediaStrings),
            attachmentKind = kind,
            starredAtMillis = nowMillis,
            sentAtIso = message.createdAt,
        )
    }

    /** L'aperçu relu pour une édition : même règle, sans refaire l'instantané. */
    public fun preview(
        message: ApiMessage,
        preferredLanguages: List<String>,
        mediaStrings: MediaKindStrings?,
    ): String = previewOf(message, attachmentKindOf(message.attachments.firstOrNull()), preferredLanguages, mediaStrings)

    private fun previewOf(
        message: ApiMessage,
        kind: StarredAttachmentKind?,
        preferredLanguages: List<String>,
        mediaStrings: MediaKindStrings?,
    ): String {
        val protectedContent = message.isViewOnce == true || message.isBlurred == true
        val text = if (protectedContent) "" else servedText(message, preferredLanguages)
        if (text.isNotBlank()) return text.take(PREVIEW_LIMIT)
        val label = kind?.let { mediaStrings?.summary(it.toLabelKind()) }.orEmpty()
        return label.take(PREVIEW_LIMIT)
    }

    private fun servedText(message: ApiMessage, preferredLanguages: List<String>): String {
        val translated = PrismTranslationResolver.resolve(
            originalLanguage = message.originalLanguage,
            candidates = message.translations
                .filter { it.isEncrypted != true }
                .map { PrismCandidate(it.targetLanguage, it.translatedContent) },
            preferredLanguages = preferredLanguages,
        )
        return translated?.text ?: message.content
    }

    private fun attachmentKindOf(attachment: ApiMessageAttachment?): StarredAttachmentKind? {
        val mime = attachment?.mimeType?.lowercase() ?: return null
        return when {
            attachment.latitude != null && attachment.longitude != null -> StarredAttachmentKind.LOCATION
            mime.startsWith("image/") -> StarredAttachmentKind.IMAGE
            mime.startsWith("video/") -> StarredAttachmentKind.VIDEO
            mime.startsWith("audio/") -> StarredAttachmentKind.AUDIO
            else -> StarredAttachmentKind.FILE
        }
    }

    private fun StarredAttachmentKind.toLabelKind(): MediaKindLabel.Kind = when (this) {
        StarredAttachmentKind.IMAGE -> MediaKindLabel.Kind.PHOTO
        StarredAttachmentKind.VIDEO -> MediaKindLabel.Kind.VIDEO
        StarredAttachmentKind.AUDIO -> MediaKindLabel.Kind.AUDIO
        StarredAttachmentKind.FILE -> MediaKindLabel.Kind.FILE
        StarredAttachmentKind.LOCATION -> MediaKindLabel.Kind.LOCATION
    }
}
