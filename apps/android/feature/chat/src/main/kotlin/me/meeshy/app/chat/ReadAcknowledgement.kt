package me.meeshy.app.chat

import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.conversation.LocalMessage
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

    /**
     * How long the opening waits for the thread's window before acknowledging anyway (#13793). The wait
     * only exists to SEE the unread messages (a sealed one withholds the receipt) : a server that serves
     * none (expired ephemerals, hidden history, a stale counter) or an offline cold cache must not keep
     * the conversation unread forever. An empty window then holds no known seal.
     */
    const val WINDOW_WAIT_MILLIS: Long = 3_000L

    /**
     * Whether the window has said what the thread holds : the server answered ([CacheResult.Fresh], an
     * empty page included) or the cache already shows messages. A cold, still-revalidating cache has not.
     */
    fun windowAnswered(result: CacheResult<List<LocalMessage>>): Boolean = when (result) {
        is CacheResult.Fresh -> true
        is CacheResult.Stale -> result.value.isNotEmpty()
        is CacheResult.Syncing -> result.value.orEmpty().isNotEmpty()
        CacheResult.Empty -> false
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
