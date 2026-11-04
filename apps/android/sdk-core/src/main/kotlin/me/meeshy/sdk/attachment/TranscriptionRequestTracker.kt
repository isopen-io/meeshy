package me.meeshy.sdk.attachment

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.transformLatest
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.lang.AttachmentTranscriptPrism
import me.meeshy.sdk.media.MediaRepository
import me.meeshy.sdk.model.ApiAttachmentTranscription
import me.meeshy.sdk.model.MessageTranscriptionFiche.Request
import me.meeshy.sdk.model.ServerTranscriptionWait
import me.meeshy.sdk.model.TranslationFailureEntry
import me.meeshy.sdk.model.TranslationFailureKind
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.PerAccountCache
import me.meeshy.sdk.sync.TranslationFailureStore

/**
 * La demande de transcription À LA DEMANDE d'une pièce son (bulle ET fiche : un seul état, miroir de l'attente
 * serveur d'iOS). « Transcription… » reste affiché tant que la tâche tourne ; passé
 * [ServerTranscriptionWait.SILENCE_CEILING_MS] sans rien recevoir « Transcrire » revient et la demande peut se refaire ;
 * un échec (réponse refusée, ou `audio:transcription-failed` reçu par la socket et écrit dans [TranslationFailureStore])
 * s'affiche et propose de réessayer. Le texte qui arrive n'est PAS tenu ici : Room (charge du message et lignes
 * dédiées) reste l'unique source, le tracker ne tient que l'horodatage de la demande par pièce — jamais un contenu.
 */
@Singleton
class TranscriptionRequestTracker internal constructor(
    private val request: suspend (attachmentId: String) -> NetworkResult<ApiAttachmentTranscription?>,
    private val apply: suspend (messageId: String, attachmentId: String, transcription: ApiAttachmentTranscription) -> Unit,
    private val failures: TranslationFailureStore,
    private val nowMillis: () -> Long,
) : PerAccountCache {

    @Inject
    constructor(
        media: MediaRepository,
        messages: MessageRepository,
        failures: TranslationFailureStore,
        clock: CacheClock,
    ) : this(
        request = media::requestTranscription,
        apply = { messageId, attachmentId, done ->
            val text = AttachmentTranscriptPrism.originalText(done)
            if (text != null) {
                messages.applyTranscription(
                    messageId, attachmentId, text, done.language, done.confidence, done.durationMs?.toLong(),
                    done.segments, done.speakerCount,
                )
            }
        },
        failures = failures,
        nowMillis = clock::nowMillis,
    )

    private val requested = MutableStateFlow<Map<String, Long>>(emptyMap())

    /** L'instant de la demande de chaque pièce en attente (pièce -> millisecondes) ; jamais un contenu. */
    val requests: StateFlow<Map<String, Long>> = requested.asStateFlow()

    /**
     * Demande la transcription de [attachmentId] (message [messageId]). Sans effet tant qu'une demande attend encore sa
     * réponse. Le résultat d'une transcription lancée arrive par la socket ; celle qui existait déjà revient ici et
     * entre dans le cache.
     */
    suspend fun request(messageId: String, attachmentId: String) {
        val now = nowMillis()
        val held = requested.value[attachmentId]
        if (held != null && ServerTranscriptionWait.isWaiting(held, now, hasArrived = false) && !hasFailed(messageId, attachmentId)) return
        requested.update { it + (attachmentId to now) }
        failures.transcribed(messageId, attachmentId)
        try {
            when (val result = request(attachmentId)) {
                is NetworkResult.Failure -> fail(messageId, attachmentId)
                is NetworkResult.Success -> result.data?.let { done ->
                    apply(messageId, attachmentId, done)
                    requested.update { it - attachmentId }
                }
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (@Suppress("TooGenericExceptionCaught") failure: Exception) {
            fail(messageId, attachmentId)
        }
    }

    /**
     * L'état de la demande de [attachmentId], tenu à jour : en cours jusqu'au plafond de silence (UNE réémission, à
     * l'échéance, pas de minuterie à la seconde), en échec dès que la socket ou la réponse l'a dit.
     */
    @OptIn(ExperimentalCoroutinesApi::class)
    fun observe(messageId: String, attachmentId: String): Flow<Request> =
        combine(
            requested.map { it[attachmentId] }.distinctUntilChanged(),
            failures.ledger.map { ledger -> failedIn(ledger.forMessage(messageId), attachmentId) }.distinctUntilChanged(),
        ) { at, failed -> at to failed }
            .transformLatest { (at, failed) ->
                emit(ServerTranscriptionWait.requestState(at, nowMillis(), hasArrived = false, failed = failed))
                if (at != null && !failed) {
                    val remaining = at + ServerTranscriptionWait.SILENCE_CEILING_MS - nowMillis()
                    if (remaining > 0) delay(remaining)
                    emit(ServerTranscriptionWait.requestState(at, nowMillis(), hasArrived = false, failed = false))
                }
            }
            .distinctUntilChanged()

    private fun fail(messageId: String, attachmentId: String) {
        failures.failed(TranslationFailureEntry(messageId, TranslationFailureKind.TRANSCRIPTION, attachmentId))
        requested.update { it - attachmentId }
    }

    private fun hasFailed(messageId: String, attachmentId: String): Boolean =
        failedIn(failures.ledger.value.forMessage(messageId), attachmentId)

    private fun failedIn(entries: List<TranslationFailureEntry>, attachmentId: String): Boolean =
        entries.any { it.kind == TranslationFailureKind.TRANSCRIPTION && (it.attachmentId == null || it.attachmentId == attachmentId) }

    override suspend fun clear() {
        requested.value = emptyMap()
    }
}
