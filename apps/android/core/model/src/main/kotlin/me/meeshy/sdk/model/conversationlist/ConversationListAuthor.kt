package me.meeshy.sdk.model.conversationlist

import me.meeshy.sdk.model.preview.PreviewFieldUpdate

/**
 * Qui a écrit le dernier message, tel que la LIGNE DE LISTE le préfixe — miroir de
 * `ConversationListAuthor` (iOS). Pur : le mot « Toi » est passé en paramètre (localisé par l'app).
 *
 * Rien n'est posé qui ne soit PORTÉ par l'événement : l'absence d'information reste `Unchanged`, ce
 * qui garde l'auteur périmé d'un autre message hors de la ligne.
 */
object ConversationListAuthor {

    /** Ce que l'événement AFFIRME de l'auteur : rien, ou un nom (voire l'absence d'auteur). */
    sealed interface Resolution {
        /** L'événement ne dit rien de l'auteur : au site de décider. */
        data object Unchanged : Resolution

        /** L'événement affirme un auteur, ou son absence (`null`). */
        data class Display(val name: String?) : Resolution

        /** Le nom pour un site où « rien de dit » vaut « aucun auteur » (message NEUF). */
        val nameForNewMessage: String? get() = (this as? Display)?.name
    }

    /** L'auteur d'une ligne dont on TIENT l'expéditeur : « Toi » pour le lecteur, son nom servi sinon. */
    fun name(senderId: String?, senderName: String?, readerId: String?, youLabel: String): String? =
        if (!readerId.isNullOrEmpty() && senderId == readerId) youLabel else senderName

    /** L'id qui voyage AVEC le nom d'un PAIR ; « Toi », un auteur inconnu ou un id vide rendent `null`. */
    fun peerUserId(senderUserId: String?, senderName: String?, readerId: String?, youLabel: String): String? =
        senderUserId?.takeIf { it.isNotEmpty() && senderName != null && senderName != youLabel && it != readerId }

    /**
     * Ordre : moi, puis « Toi » tenu sur le même message, puis le nom SERVI (clé présente = affirmation),
     * puis le pair d'un direct, sinon rien.
     */
    fun resolve(
        eventSenderId: String?,
        eventSenderUserId: String? = null,
        eventSenderName: PreviewFieldUpdate<String> = PreviewFieldUpdate.Unchanged,
        readerId: String?,
        youLabel: String,
        eventMessageId: String? = null,
        rowMessageId: String? = null,
        rowSenderName: String? = null,
        directPeerUserId: String? = null,
        directPeerName: String? = null,
    ): Resolution {
        if (!readerId.isNullOrEmpty() && (eventSenderId == readerId || eventSenderUserId == readerId)) {
            return Resolution.Display(youLabel)
        }
        if (eventMessageId != null && eventMessageId == rowMessageId && rowSenderName == youLabel) {
            return Resolution.Unchanged
        }
        if (eventSenderName is PreviewFieldUpdate.Replaced) {
            return Resolution.Display(eventSenderName.value?.trim()?.takeIf { it.isNotEmpty() })
        }
        if (directPeerUserId != null && eventSenderId == directPeerUserId) return Resolution.Display(directPeerName)
        return Resolution.Unchanged
    }
}
