package me.meeshy.sdk.model.contacts

import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ConversationClearance
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

    /** Une pièce qui se dit chiffrée, ou porte un mode que le serveur ne lit pas, ferme quoi que dise le reste. */
    fun sealedBy(attachment: ApiMessageAttachment): ContactCardResolutionScope =
        if (PieceSealing.isSealed(attachment) || unreadableByServer(attachment.encryptionMode)) EndToEnd else this

    /** La conversation servie chiffrée de bout en bout ferme tout ce qu'elle porte. */
    fun inConversation(isEndToEnd: Boolean): ContactCardResolutionScope = if (isEndToEnd) EndToEnd else this

    /**
     * Ce que l'appareil SAIT du mode de la conversation (#13628) : seule une conversation connue claire laisse la portée
     * ouverte ; chiffrée ferme en [EndToEnd], jamais servie à cet appareil ferme en [Unknown].
     */
    fun under(clearance: ConversationClearance): ContactCardResolutionScope = when {
        this != Clear -> this
        clearance == ConversationClearance.CLEAR -> Clear
        clearance == ConversationClearance.END_TO_END -> EndToEnd
        else -> Unknown
    }

    companion object {
        /**
         * Le bout en bout se lit sur le message porteur : mode servi que le serveur ne lit pas (`e2ee`, ou un protocole que
         * cette version ne connaît pas), drapeau chiffré, ou pièce scellée.
         */
        fun of(message: ApiMessage): ContactCardResolutionScope {
            val sealed = unreadableByServer(message.encryptionMode) ||
                message.isEncrypted == true ||
                PieceSealing.messageIsSealed(message)
            return if (sealed) EndToEnd else Clear
        }

        private fun unreadableByServer(mode: String?): Boolean =
            ConversationClearance.ofServed(mode) == ConversationClearance.END_TO_END
    }
}
