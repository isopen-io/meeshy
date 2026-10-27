package me.meeshy.app.chat

import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.socket.SocketManager
import me.meeshy.sdk.sync.SyncSeqTracker
import timber.log.Timber

/**
 * Rattrape ce qu'un fil resté ouvert a manqué pendant une coupure (miroir de
 * `ConversationViewModel.syncMissedMessages`, iOS) : à chaque (re)connexion de la socket et à chaque
 * trou de séquence (`gapDetected`) on relit la conversation depuis son dernier message serveur connu.
 *
 * La relecture est [MessageRepository.refresh] : un balayage `after=<dernier message serveur>` fusionné
 * champ à champ, en ajout seulement. Elle ne purge rien, ne touche ni les envois optimistes en vol ni
 * les colonnes locales, et ne réécrit pas une ligne inchangée : la liste n'a donc ni doublon ni
 * clignotement (#12799). Les déclencheurs rapprochés (connexion + trou dans la même rafale) se
 * fondent en UNE relecture ; un déclencheur arrivé pendant une relecture en provoque une seule de plus.
 */
@OptIn(FlowPreview::class)
class ChatResyncController internal constructor(
    private val reconnections: Flow<Unit>,
    private val gaps: Flow<Unit>,
    private val messages: MessageRepository,
) : ChatController {

    @Inject
    constructor(
        socketManager: SocketManager,
        syncSeqTracker: SyncSeqTracker,
        messages: MessageRepository,
    ) : this(socketManager.connected, syncSeqTracker.gapDetected.map { }, messages)

    override fun attach(host: ChatControllerHost) {
        host.scope.launch {
            merge(reconnections, gaps)
                .debounce(BURST_MS)
                .collect { catchUp(host.conversationId) }
        }
    }

    private suspend fun catchUp(conversationId: String) {
        try {
            messages.refresh(conversationId)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (@Suppress("TooGenericExceptionCaught") failure: Exception) {
            Timber.w("Chat resync: rattrapage non applique (%s)", failure.javaClass.simpleName)
        }
    }

    internal companion object {
        /** Une connexion et son trou de séquence arrivent ensemble : une seule relecture. */
        const val BURST_MS = 300L
    }
}
