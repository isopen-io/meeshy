package me.meeshy.sdk.model.piece

import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.isEndToEndBlob

/**
 * **La règle UNIQUE d'une pièce « scellée »** (#13493) : la bulle, le contrôleur de téléchargement, l'aperçu et le hub
 * posent la même question à cette fonction — jamais chacun la sienne. Échec fermé : le doute retient.
 *
 * Une pièce est scellée si elle est marquée chiffrée (même sans mode e2ee) ou si c'est un blob e2ee ; un message est
 * scellé s'il est un cryptogramme e2ee illisible ici ou porte une pièce scellée.
 */
object PieceSealing {

    fun isSealed(piece: ApiMessageAttachment): Boolean = piece.isEncrypted == true || piece.isEndToEndBlob

    fun messageIsSealed(message: ApiMessage): Boolean = message.isEndToEndSealed || message.attachments.any(::isSealed)

    /**
     * La pièce est-elle retenue — ni ouverte, ni partagée, ni enregistrée, ni prévisualisée ? Oui si elle ou son
     * porteur est scellé ; et, dans une conversation chiffrée de bout en bout, dès que l'information manque (pièce
     * ou porteur inconnus) : ce qu'on ne sait pas lire ne sort pas.
     */
    fun withholds(piece: ApiMessageAttachment?, carrier: ApiMessage?, conversationIsEncrypted: Boolean): Boolean =
        (piece != null && isSealed(piece)) ||
            (carrier != null && messageIsSealed(carrier)) ||
            (conversationIsEncrypted && (piece == null || carrier == null))
}
