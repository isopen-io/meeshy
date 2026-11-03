package me.meeshy.sdk.model.conversationlist

import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationLastMessage
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ApiMessageCount
import me.meeshy.sdk.model.LastMessageNature
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.sdk.model.preview.ConversationPreviewSticker
import me.meeshy.sdk.model.preview.LastMessageAttachmentSummary
import me.meeshy.sdk.model.preview.LastMessageSystemEvent
import me.meeshy.sdk.model.preview.PreviewParam
import me.meeshy.sdk.model.preview.previewTruncated

/**
 * Facette « dernier message » d'une ligne de liste : TOUT ce qui décrit UN message, écrit d'un bloc.
 * Miroir de `LastMessageFacet` (iOS). Écrire l'aperçu sans l'auteur, la pièce jointe ou le drapeau
 * « vue unique » laisserait la ligne décrire un MÉLANGE de deux messages — fausse, donc jamais
 * corrigée. Une facette incomplète, elle, se corrige à la synchro suivante.
 *
 * L'auteur n'est jamais hérité du message précédent : un écho allégé sans expéditeur donne un
 * auteur `null` (jamais le nom d'un autre sous le message de Bob).
 */
data class LastMessageFacet(
    val id: String?,
    val preview: String?,
    val senderName: String?,
    /** `User.id` du pair que [senderName] nomme ; `null` pour « Vous » ou un auteur inconnu. */
    val senderUserId: String?,
    /** Instant ISO 8601 du message : le RANG de la ligne. */
    val createdAt: String?,
    val attachments: List<ApiMessageAttachment> = emptyList(),
    val attachmentCount: Int = 0,
    val isBlurred: Boolean = false,
    val isViewOnce: Boolean = false,
    val expiresAt: String? = null,
    val translations: Map<String, String>? = null,
    val originalLanguage: String? = null,
    val location: SharedPlace? = null,
    val nature: LastMessageNature? = null,
) {
    val createdAtMillis: Long? get() = isoToEpochMillisOrNull(createdAt)

    companion object {
        /**
         * La facette d'un message reçu ou envoyé.
         *
         * @param readerId le lecteur : son message se dit [youLabel] ;
         * @param viewerLanguages restreint la carte du Prisme aux langues du lecteur (vide = toutes) ;
         * @param peerName repli de l'auteur dans un direct quand la trame n'a pas d'enveloppe.
         */
        fun of(
            message: ApiMessage,
            readerId: String?,
            youLabel: String,
            viewerLanguages: List<String> = emptyList(),
            peerName: String? = null,
        ): LastMessageFacet {
            val mine = readerId.isMeaningful() &&
                (message.senderId == readerId || message.sender?.resolvedUserId == readerId)
            val authorName = if (mine) {
                youLabel
            } else {
                message.sender?.name?.takeIf { it.isNotBlank() } ?: peerName
            }
            val peerId = if (mine || authorName == null) null else message.sender?.resolvedUserId ?: message.senderId
            val protectedText = message.isEncrypted == true
            return LastMessageFacet(
                id = message.id,
                preview = message.content.takeIf { it.isNotBlank() && !protectedText }?.previewTruncated(),
                senderName = authorName,
                senderUserId = peerId,
                createdAt = message.createdAt,
                attachments = message.attachments,
                attachmentCount = message.attachments.size,
                isBlurred = message.isBlurred ?: false,
                isViewOnce = message.isViewOnce ?: false,
                expiresAt = message.expiresAt,
                translations = if (protectedText) null else previewTranslations(message, viewerLanguages),
                originalLanguage = message.originalLanguage,
                location = message.location,
                nature = natureOf(message),
            )
        }

        private fun previewTranslations(message: ApiMessage, viewerLanguages: List<String>): Map<String, String>? =
            message.translations
                .filter { it.isEncrypted != true && it.translatedContent.isNotBlank() }
                .filter { viewerLanguages.isEmpty() || it.targetLanguage in viewerLanguages }
                .associate { it.targetLanguage to it.translatedContent.previewTruncated() }
                .takeIf { it.isNotEmpty() }

        private fun natureOf(message: ApiMessage): LastMessageNature? =
            LastMessageNature(
                messageType = message.messageType,
                effectFlags = message.effectFlags,
                ephemeralDuration = message.ephemeralDuration,
                isEncrypted = message.isEncrypted ?: false,
                isForwarded = message.forwardedFromId != null || message.forwardedFrom != null,
                systemEvent = message.systemEvent?.let { event ->
                    LastMessageSystemEvent(event.key, event.params.mapValues { PreviewParam.Text(it.value) })
                },
                attachmentSummary = attachmentSummary(message.attachments),
                sticker = message.sticker?.let { ConversationPreviewSticker(it.templateId, it.emoji) },
            ).takeUnless { it.isEmpty }

        private fun attachmentSummary(attachments: List<ApiMessageAttachment>): LastMessageAttachmentSummary? {
            if (attachments.isEmpty()) return null
            val kinds = attachments.groupingBy { kindOf(it.mimeType) }.eachCount()
            val size = attachments.sumOf { (it.fileSize ?: 0).toLong() }
            return LastMessageAttachmentSummary(count = attachments.size, kinds = kinds, totalSize = size)
        }

        private fun kindOf(mimeType: String?): String = when {
            mimeType?.startsWith("image/") == true -> "image"
            mimeType?.startsWith("video/") == true -> "video"
            mimeType?.startsWith("audio/") == true -> "audio"
            else -> "file"
        }
    }
}

private fun String?.isMeaningful(): Boolean = !this.isNullOrBlank()

/** Le groupe « dernier message » que la ligne porte, recopiable en bloc. */
fun ApiConversation.lastMessageFacet(): LastMessageFacet? =
    lastMessage?.let { last ->
        LastMessageFacet(
            id = last.id,
            preview = last.content,
            senderName = last.senderName,
            senderUserId = last.senderId,
            createdAt = last.createdAt,
            attachments = last.attachments.orEmpty(),
            attachmentCount = last.count?.attachments ?: last.attachments?.size ?: 0,
            isBlurred = last.isBlurred,
            isViewOnce = last.isViewOnce,
            expiresAt = last.expiresAt,
            translations = lastMessageTranslations,
            originalLanguage = lastMessageOriginalLanguage ?: last.originalLanguage,
            location = last.location,
            nature = last.nature,
        )
    }

/** Remplace EN BLOC le groupe « dernier message » (aperçu, auteur, pièces, drapeaux, Prisme, lieu, nature). */
fun ApiConversation.applyingLastMessage(facet: LastMessageFacet): ApiConversation {
    val nature = facet.nature
    return copy(
        lastMessage = ApiConversationLastMessage(
            id = facet.id,
            content = facet.preview,
            senderId = facet.senderUserId,
            senderName = facet.senderName,
            messageType = nature?.messageType,
            originalLanguage = facet.originalLanguage,
            createdAt = facet.createdAt,
            isBlurred = facet.isBlurred,
            isViewOnce = facet.isViewOnce,
            expiresAt = facet.expiresAt,
            attachments = facet.attachments.takeIf { it.isNotEmpty() },
            count = ApiMessageCount(attachments = facet.attachmentCount).takeIf { facet.attachmentCount > 0 },
            location = facet.location,
            effectFlags = nature?.effectFlags,
            ephemeralDuration = nature?.ephemeralDuration,
            isEncrypted = nature?.isEncrypted,
            isForwarded = nature?.isForwarded,
            systemEvent = nature?.systemEvent,
            callSummary = nature?.callSummary,
            attachmentSummary = nature?.attachmentSummary,
            sticker = nature?.sticker,
        ),
        lastMessageTranslations = facet.translations?.takeIf { it.isNotEmpty() },
        lastMessageOriginalLanguage = facet.originalLanguage,
    )
}

/** Plus AUCUN message visible : la ligne n'a plus d'aperçu (jamais le texte de ce qui a disparu). */
fun ApiConversation.clearingLastMessage(): ApiConversation =
    copy(lastMessage = null, lastMessageTranslations = null, lastMessageOriginalLanguage = null)

/**
 * La garde d'ordre du groupe : un événement plus ANCIEN que l'aperçu en place ne le remplace jamais,
 * mais le MÊME message (ou un alias de lui, tel le `cid_…` d'un envoi optimiste) le complète.
 */
fun ApiConversation.admitsLastMessage(id: String?, createdAtMillis: Long?, aliases: List<String> = emptyList()): Boolean {
    val current = lastMessage ?: return true
    if (id != null && id == current.id) return true
    if (current.id != null && current.id in aliases) return true
    val incoming = createdAtMillis ?: return true
    val known = isoToEpochMillisOrNull(current.createdAt) ?: return true
    return incoming > known
}
