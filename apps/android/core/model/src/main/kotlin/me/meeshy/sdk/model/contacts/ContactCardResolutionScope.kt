package me.meeshy.sdk.model.contacts

import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.EndToEndRegime
import me.meeshy.sdk.model.piece.PieceSealing

/**
 * Où une carte de visite a le droit de résoudre ses identifiants (miroir de `ContactCardResolutionScope`, iOS,
 * #13622). Seule une conversation lisible par le serveur ([Clear]) autorise `POST /contacts/resolve` : les numéros
 * et e-mails d'une vCard reçue en bout en bout ne partent jamais au serveur, et ce qu'on ne sait pas établir
 * ([Unknown]) ferme comme [EndToEnd]. Échec fermé : le défaut est [Unknown].
 */
enum class ContactCardResolutionScope {
    Clear,
    EndToEnd,
    Unknown,
    ;

    val mayResolveOnServer: Boolean get() = this == Clear

    /** Une pièce qui se dit chiffrée ferme, quoi que dise le reste. */
    fun sealedBy(attachment: ApiMessageAttachment): ContactCardResolutionScope =
        if (PieceSealing.isSealed(attachment)) EndToEnd else this

    /** La conversation servie chiffrée de bout en bout ferme tout ce qu'elle porte. */
    fun inConversation(isEndToEnd: Boolean): ContactCardResolutionScope = if (isEndToEnd) EndToEnd else this

    companion object {
        /** Le bout en bout se lit sur le message porteur : mode servi, drapeau chiffré, ou pièce scellée. */
        fun of(message: ApiMessage): ContactCardResolutionScope {
            val sealed = EndToEndRegime.isEndToEnd(message.encryptionMode) ||
                message.isEncrypted == true ||
                PieceSealing.messageIsSealed(message)
            return if (sealed) EndToEnd else Clear
        }
    }
}
