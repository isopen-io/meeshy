package me.meeshy.sdk.model

import me.meeshy.sdk.model.preview.ConversationPreviewSticker
import me.meeshy.sdk.model.preview.LastMessageAttachmentSummary
import me.meeshy.sdk.model.preview.LastMessageCallSummary
import me.meeshy.sdk.model.preview.LastMessageSystemEvent

/**
 * La NATURE du dernier message — le sous-groupe que #7545 ajoute au groupe « dernier message ».
 * Il décrit le même message que `lastMessageId` et s'écrit donc avec lui, jamais seul.
 * Miroir de `LastMessageNature` (iOS).
 */
data class LastMessageNature(
    val messageType: String? = null,
    val effectFlags: Int? = null,
    /** Secondes — le décompte part de la RÉCEPTION de chaque lecteur (#7451). */
    val ephemeralDuration: Int? = null,
    val isEncrypted: Boolean = false,
    val isForwarded: Boolean = false,
    val systemEvent: LastMessageSystemEvent? = null,
    val callSummary: LastMessageCallSummary? = null,
    val attachmentSummary: LastMessageAttachmentSummary? = null,
    /** Le message EST un sticker (#10752) : seule cette présence le distingue d'une photo. */
    val sticker: ConversationPreviewSticker? = null,
) {
    /** La même nature, son événement système remplacé — un avis complété sur place reste le même message. */
    fun replacingSystemEvent(event: LastMessageSystemEvent): LastMessageNature = copy(systemEvent = event)

    /**
     * Vrai quand le fil ne dit RIEN de la nature (serveur antérieur à #7545). Une nature vide n'est
     * pas « texte simple » : la garder distincte évite de peindre en texte ce qu'on ne connaît pas.
     */
    val isEmpty: Boolean
        get() = messageType == null && effectFlags == null && ephemeralDuration == null &&
            !isEncrypted && !isForwarded && systemEvent == null && callSummary == null &&
            attachmentSummary == null && sticker == null
}
