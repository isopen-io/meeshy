package me.meeshy.app.chat

import javax.inject.Inject
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import me.meeshy.sdk.attachment.TranscriptionRefetchScheduler
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.conversation.LocalSendState
import me.meeshy.sdk.model.TranscriptionRetryScheduler
import me.meeshy.sdk.model.isoToEpochMillisOrNull

/**
 * La relecture unique des vocaux déjà là sans transcription (miroir de la boucle de `ConversationViewModel+Translations`,
 * iOS) : à l'ouverture du fil, les messages SYNCHRONISÉS plus anciens que l'ouverture dont une pièce audio n'a pas son
 * texte repartent chercher UNE fois, 5 s plus tard ([TranscriptionRefetchScheduler]). Les arrivées en direct ne sont
 * pas relues : leur `transcription:ready` est en route, comme sur iOS. Un id n'est planifié qu'UNE fois par écran,
 * quelles que soient les évolutions de la fenêtre ; un message de bout en bout n'est jamais demandé au serveur.
 */
class ChatTranscriptionRetryController internal constructor(
    private val scheduler: TranscriptionRefetchScheduler,
    private val nowMillis: () -> Long,
) : ChatController {

    @Inject
    constructor(scheduler: TranscriptionRefetchScheduler, clock: CacheClock) : this(scheduler, clock::nowMillis)

    private val planned = mutableSetOf<String>()

    override fun attach(host: ChatControllerHost) {
        val openedAt = nowMillis()
        host.scope.launch {
            host.messages
                .map { window -> TranscriptionRetryScheduler.idsMissingTranscription(window.preexisting(openedAt)) }
                .distinctUntilChanged()
                .collect { ids ->
                    val fresh = ids.filter(planned::add)
                    scheduler.schedule(host.conversationId, fresh, host.scope)
                }
        }
    }

    private fun List<LocalMessage>.preexisting(openedAt: Long) =
        filter { it.sendState == LocalSendState.SYNCED }
            .map { it.message }
            .filter { (isoToEpochMillisOrNull(it.createdAt) ?: Long.MAX_VALUE) < openedAt }
}
