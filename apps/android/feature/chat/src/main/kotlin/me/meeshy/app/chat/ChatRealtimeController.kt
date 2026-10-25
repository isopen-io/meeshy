package me.meeshy.app.chat

import androidx.compose.runtime.Immutable
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.sdk.conversation.MessageDeltaApplier
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.model.AudioTranslationFailedEvent
import me.meeshy.sdk.model.AudioTranslationStage
import me.meeshy.sdk.model.ConversationJoinErrorEvent
import me.meeshy.sdk.model.ConversationSocketEvent
import me.meeshy.sdk.model.MessageArrived
import me.meeshy.sdk.model.MessageRestoredForMeEvent
import me.meeshy.sdk.model.PendingMessagesDeliveredEvent
import me.meeshy.sdk.model.TranscriptionFailedEvent
import me.meeshy.sdk.model.TranslationFailedEvent
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.ConversationSocketEventsManager
import me.meeshy.sdk.socket.OrderedEventLane
import timber.log.Timber

/**
 * Ce que le temps réel du fil sait et que la liste des bulles ne porte pas : l'accès retiré par la
 * passerelle (`conversation:join-error` d'appartenance) et les enrichissements définitivement en
 * échec (le « traduction… » / « transcription… » s'éteint au lieu d'attendre à vie).
 */
@Immutable
data class ChatRealtimeState(
    val accessRevokedReason: String? = null,
    val failedTranslationMessageIds: Set<String> = emptySet(),
    val failedAudioTranslationIds: Set<String> = emptySet(),
    val failedTranscriptionIds: Set<String> = emptySet(),
) {
    val isAccessRevoked: Boolean get() = accessRevokedReason != null
}

/**
 * Le fil se met à jour EN DIRECT sur tous les événements, sans recharger la conversation (miroir de
 * `ConversationSocketHandler` et de son extension `+MediaEvents`, iOS).
 *
 * Chaque événement de la famille ([ConversationSocketEventsManager.events]) entre dans UNE file
 * ordonnée par conversation ([OrderedEventLane]) :
 *  - `message:new` y attend que sa ligne soit en Room (quelle que soit la voie d'ingestion), donc un
 *    enrichissement reçu juste après s'applique APRÈS son message, jamais devant ;
 *  - suppression, expiration, épingle, échéance d'un éphémère, masquage personnel, consommation et
 *    purge d'une vue unique, réactions d'une pièce modifient Room sur place ([MessageDeltaApplier]),
 *    sans appel réseau : la bulle ne saute pas ;
 *  - un retour en vue personnel et une file hors ligne rejouée n'ont pas de charge : seul un
 *    rechargement est honnête.
 *
 * Porte aussi la réaction d'une pièce : optimiste, émise par socket, défaite si la passerelle refuse.
 */
class ChatRealtimeController @Inject constructor(
    private val socketEvents: ConversationSocketEventsManager,
    private val deltas: MessageDeltaApplier,
    private val messages: MessageRepository,
    private val session: SessionRepository,
) : ChatController {

    private val _state = MutableStateFlow(ChatRealtimeState())

    /** L'état temps réel du fil ouvert, à côté de `ChatViewModel.state`. */
    val state: StateFlow<ChatRealtimeState> = _state.asStateFlow()

    private var host: ChatControllerHost? = null
    private var lane: OrderedEventLane? = null

    override fun attach(host: ChatControllerHost) {
        this.host = host
        val screenLane = OrderedEventLane(host.scope)
        lane = screenLane
        host.scope.launch {
            socketEvents.events
                .filter { it.concerns(host.conversationId) }
                .collect { event -> screenLane.submit(host.conversationId) { guarded { handle(host, event) } } }
        }
    }

    override fun detach() {
        host = null
        lane = null
    }

    /**
     * Réaction de CE lecteur sur une pièce : Room bouge tout de suite, la socket confirme ; sur un
     * refus (ou sans réponse) le geste est défait par son inverse. Rend `false` sans rien émettre
     * quand le message est inconnu ou encore une bulle locale.
     */
    suspend fun toggleAttachmentReaction(messageId: String, attachmentId: String, emoji: String, adding: Boolean): Boolean {
        if (!deltas.toggleAttachmentReaction(messageId, attachmentId, emoji, adding)) return false
        val accepted = socketEvents.emitAttachmentReaction(messageId, attachmentId, emoji, adding)
        if (!accepted) deltas.toggleAttachmentReaction(messageId, attachmentId, emoji, !adding)
        return accepted
    }

    /** Barrière des tests : rend la main quand tout événement déjà reçu est appliqué. */
    internal suspend fun awaitPendingEvents() {
        val current = host ?: return
        lane?.barrier(current.conversationId)
    }

    private suspend fun handle(host: ChatControllerHost, event: ConversationSocketEvent) {
        if (deltas.apply(event, session.currentUser.value?.id)) return
        when (event) {
            is MessageArrived -> awaitRow(host, event)
            is MessageRestoredForMeEvent, is PendingMessagesDeliveredEvent -> messages.refresh(host.conversationId)
            is AudioTranslationStage -> applyAudioTranslation(event)
            is TranslationFailedEvent -> _state.update {
                it.copy(failedTranslationMessageIds = it.failedTranslationMessageIds + event.messageId)
            }
            is AudioTranslationFailedEvent -> _state.update {
                it.copy(failedAudioTranslationIds = it.failedAudioTranslationIds + (event.attachmentId ?: event.messageId))
            }
            is TranscriptionFailedEvent -> _state.update {
                it.copy(failedTranscriptionIds = it.failedTranscriptionIds + (event.attachmentId ?: event.messageId))
            }
            is ConversationJoinErrorEvent -> if (event.isMembershipDenied) {
                _state.update { it.copy(accessRevokedReason = event.message ?: event.reason.orEmpty()) }
            }
            else -> Unit
        }
    }

    /** Le message est en Room quand la fenêtre le montre ; au-delà d'un délai, la file repart. */
    private suspend fun awaitRow(host: ChatControllerHost, event: MessageArrived) {
        withTimeoutOrNull(ARRIVAL_WAIT_MS) {
            host.messages.first { window ->
                window.any { local ->
                    local.message.id == event.messageId ||
                        (event.clientMessageId != null && local.message.clientMessageId == event.clientMessageId)
                }
            }
        }
    }

    private suspend fun applyAudioTranslation(stage: AudioTranslationStage) {
        val event = stage.event
        val audio = event.translatedAudio
        messages.applyAudioTranslation(
            event.messageId,
            event.attachmentId,
            event.language,
            audio.url,
            audio.transcription,
            audio.durationMs,
            audio.format,
            audio.cloned,
            audio.quality,
            audio.voiceModelId,
            audio.ttsModel,
        )
    }

    private suspend fun guarded(block: suspend () -> Unit) {
        try {
            block()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (@Suppress("TooGenericExceptionCaught") failure: Exception) {
            Timber.w("Chat realtime: evenement non applique (%s)", failure.javaClass.simpleName)
        }
    }

    internal companion object {
        /** L'attente maximale d'une ligne avant que les enrichissements suivants ne passent. */
        const val ARRIVAL_WAIT_MS = 10_000L
    }
}
