package me.meeshy.app.chat

import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.piece.PieceSealing

/**
 * Ce que l'Android natif a le droit d'accuser « lu » (#13793). `POST mark-as-read` est un geste de
 * CONVERSATION (la passerelle fige tout ce que le curseur recouvre, messages scellés compris) : on ne
 * le tire donc que si aucun message non lu n'est un cryptogramme que cet appareil ne sait pas ouvrir.
 * L'accusé « reçu », lui, part ailleurs et ne dépend pas de cette règle.
 */
internal object ReadAcknowledgement {

    /**
     * [window] est le fil chargé, du plus ancien au plus récent ; les [unreadCount] derniers messages des
     * AUTRES en sont les non lus. [arrived] est le `message:new` qui déclenche l'accusé, pas encore
     * forcément écrit dans la fenêtre. Un seul scellé non lu retient l'accusé de toute la conversation :
     * la route ne sait pas en exclure un (et l'exclure message par message demanderait un corps que ni
     * l'outbox ni son coalesceur ne portent).
     */
    fun mayAcknowledge(window: List<ApiMessage>, ownUserId: String?, unreadCount: Int, arrived: ApiMessage? = null): Boolean {
        if (arrived != null && arrived.isFromOthers(ownUserId) && PieceSealing.messageIsSealed(arrived)) return false
        return window.asReversed().asSequence()
            .filter { it.isFromOthers(ownUserId) }
            .take(unreadCount.coerceAtLeast(0))
            .none(PieceSealing::messageIsSealed)
    }

    private fun ApiMessage.isFromOthers(ownUserId: String?): Boolean = senderId != ownUserId
}

/**
 * Un `message:new` ingéré par la session (`IncomingMessageIngestBinding`) est déjà en Room : le fil
 * n'a plus à relire la page (#13797). Reste ce que la charge socket du transport REST/ZMQ ne porte
 * pas et que la liste REST sert : la provenance d'un transfert.
 */
internal object IncomingMessageCompletion {

    fun needsRest(message: ApiMessage): Boolean = message.forwardedFromId != null && message.forwardedFrom == null
}
