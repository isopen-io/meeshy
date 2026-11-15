package me.meeshy.sdk.model.fullscreen

import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.VoiceQueueProtection

/**
 * **La garde d'ENVOI d'une réponse à une pièce, rejouée** (iOS `ConversationViewModel+FullscreenReply`). L'offre
 * ([AudioFullscreenOffer]) décide si le BOUTON existe ; cette garde décide si l'ENVOI part — une règle d'affichage n'est pas
 * une règle d'accès, et un second chemin vers la barre ne la contournerait pas.
 */
public object FullscreenPieceReply {

    /** Ce que l'envoi grave : le message cité, la pièce citée (ancre) et le texte nettoyé. */
    public data class Admission(val replyToId: String, val attachmentReplyToId: String, val text: String)

    /** `null` ⇒ rien ne part et l'appelant garde son brouillon. */
    public fun admit(text: String, carrier: ApiMessage?, pieceId: String, conversationIsEncrypted: Boolean): Admission? {
        val trimmed = text.trim().takeIf { it.isNotEmpty() } ?: return null
        if (conversationIsEncrypted) return null
        val message = carrier?.takeIf { it.deletedAt.isNullOrBlank() } ?: return null
        val piece = message.attachments.firstOrNull { it.id == pieceId } ?: return null
        if (VoiceQueueProtection.ofPiece(piece, message)) return null
        return Admission(replyToId = message.id, attachmentReplyToId = piece.id, text = trimmed)
    }
}
