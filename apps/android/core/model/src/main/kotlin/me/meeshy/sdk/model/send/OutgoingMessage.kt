package me.meeshy.sdk.model.send

import me.meeshy.sdk.model.MessageSticker
import me.meeshy.sdk.model.SendMessageRequest
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.composer.SendEligibility

/**
 * Les pièces jointes d'un envoi. [ids] garde son optionnalité : `null` et vide ne s'encodent pas pareil sur le fil
 * (vide est ramené à `null`, comme la requête historique).
 */
data class OutgoingAttachments(val ids: List<String>? = null) {
    companion object {
        val NONE = OutgoingAttachments()
    }
}

/**
 * Un message prêt à partir, avant tout transport : une VALEUR testable sans modèle de vue — miroir de `OutgoingMessage`
 * (iOS). La [relation] est exclusive ; [reusedClientMessageId] est le `cid_` d'un renvoi depuis l'outbox.
 */
data class OutgoingMessage(
    val conversationId: String,
    /** Le texte brut : la langue de composition se détecte sur lui. */
    val content: String,
    val relation: MessageRelation = MessageRelation.None,
    val attachments: OutgoingAttachments = OutgoingAttachments.NONE,
    val messageType: String = "text",
    val originalLanguage: String? = null,
    val reusedClientMessageId: String? = null,
    val location: SharedPlace? = null,
    val sticker: MessageSticker? = null,
    /** Fan-out de partage : copie les pièces du message source sans badge de transfert. */
    val copyAttachmentsFromMessageId: String? = null,
    /** Les seules pièces choisies d'un transfert. */
    val forwardedAttachmentIds: List<String>? = null,
) {
    val text: String get() = content.trim()

    /** Un lieu seul est un contenu envoyable ; texte vide + aucune pièce + aucun lieu ne l'est pas. */
    val isSendable: Boolean
        get() = SendEligibility.canSend(content, attachments.ids.orEmpty(), location)

    /**
     * Le corps REST. La requête n'envoie que la durée éphémère et le bit d'effet, JAMAIS une échéance locale (#7451).
     * [encryptionMode] non nul ⇒ `isEncrypted = true`.
     */
    fun wireRequest(context: SendAttemptContext, content: String = text, encryptionMode: String? = null): SendMessageRequest {
        val effects = context.wireEffects
        return SendMessageRequest(
            content = content,
            originalLanguage = context.language,
            messageType = messageType,
            replyToId = relation.replyToId,
            storyReplyToId = relation.storyReplyToId,
            clientMessageId = context.clientMessageId,
            attachmentIds = attachments.ids?.takeIf { it.isNotEmpty() },
            forwardedFromId = relation.forwardedFromId,
            forwardedFromConversationId = relation.forwardedFromConversationId,
            forwardedAttachmentIds = forwardedAttachmentIds?.filter { it.isNotBlank() }?.distinct()?.takeIf { it.isNotEmpty() },
            effectFlags = effects.effectFlags,
            isBlurred = effects.isBlurred,
            isViewOnce = effects.isViewOnce,
            ephemeralDuration = effects.ephemeralDuration,
            maxViewOnceCount = effects.maxViewOnceCount,
            location = location,
            sticker = sticker,
            attachmentReplyTo = relation.attachmentReplyTo,
            copyAttachmentsFromMessageId = copyAttachmentsFromMessageId,
            isEncrypted = if (encryptionMode != null) true else null,
            encryptionMode = encryptionMode,
        )
    }

    /**
     * Le socket ne porte que du texte nu ; il PERDRAIT en silence l'ancre de pièce citée et le transfert, comme la
     * protection : ces envois restent sur le REST.
     */
    fun socketFallbackEligible(context: SendAttemptContext): Boolean =
        !context.effects.hasAnyEffect &&
            relation.attachmentReplyTo == null &&
            relation.forwardedFromId == null &&
            copyAttachmentsFromMessageId == null
}
