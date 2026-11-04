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
import me.meeshy.sdk.model.AttachmentConsentError
import me.meeshy.sdk.model.AttachmentTranslationResult
import me.meeshy.sdk.model.ServerTranscriptionWait
import me.meeshy.sdk.model.TranslationFailureEntry
import me.meeshy.sdk.model.TranslationFailureKind
import me.meeshy.sdk.model.translation.AudioTranslationRequestState
import me.meeshy.sdk.session.PerAccountCache
import me.meeshy.sdk.sync.TranslationFailureStore

/**
 * La demande de traduction AUDIO à la demande d'UNE pièce dans UNE langue (feuille « Traduire l'audio »), clé
 * `attachmentId|langue`. Elle tient des horodatages et des états, jamais un contenu : la piste qui arrive est écrite dans
 * Room (`MessageRepository.applyAudioTranslation`), source unique que la bulle lit. Le résultat d'un travail asynchrone
 * arrive par `audio:translation-ready` / progressive / completed ; un `audio:translation-failed` ou un refus de la réponse
 * s'écrit dans [TranslationFailureStore] ; un 403 qui LISTE des consentements garde la notice de clonage vocal, jamais une
 * erreur générique. Purgé à la fin de session ([PerAccountCache], ADR-027).
 */
@Singleton
class AudioTranslationRequestTracker internal constructor(
    private val translate: suspend (attachmentId: String, language: String, sourceLanguage: String?) -> AttachmentTranslateOutcome,
    private val apply: suspend (messageId: String, attachmentId: String, result: AttachmentTranslationResult) -> Unit,
    private val failures: TranslationFailureStore,
    private val nowMillis: () -> Long,
) : PerAccountCache {

    @Inject
    constructor(
        attachments: AttachmentRepository,
        messages: MessageRepository,
        failures: TranslationFailureStore,
        clock: CacheClock,
    ) : this(
        translate = { attachmentId, language, source -> attachments.translate(attachmentId, listOf(language), source) },
        apply = { messageId, attachmentId, result ->
            val url = result.audioUrl?.trim()?.ifBlank { null }
            if (url != null) {
                messages.applyAudioTranslation(
                    messageId, attachmentId, result.targetLanguage, url, result.translatedText.orEmpty(),
                    result.durationMs?.toLong(), null, result.voiceCloned == true, null, null, null,
                )
            }
        },
        failures = failures,
        nowMillis = clock::nowMillis,
    )

    private val requested = MutableStateFlow<Map<String, Long>>(emptyMap())
    private val consents = MutableStateFlow<Map<String, AttachmentConsentError>>(emptyMap())

    /** L'instant de chaque demande en attente (`attachmentId|langue` -> millisecondes) ; jamais un contenu. */
    val requests: StateFlow<Map<String, Long>> = requested.asStateFlow()

    /** Demande la traduction audio de [attachmentId] vers [language]. Sans effet tant qu'une demande attend encore sa réponse. */
    suspend fun request(messageId: String, attachmentId: String, language: String, sourceLanguage: String?) {
        val target = language.trim().lowercase().ifEmpty { return }
        val key = keyOf(attachmentId, target)
        val now = nowMillis()
        val held = requested.value[key]
        if (held != null && ServerTranscriptionWait.isWaiting(held, now, hasArrived = false) && !hasFailed(messageId, attachmentId, target, waiting = true)) return
        requested.update { it + (key to now) }
        consents.update { it - key }
        failures.audioTranslated(messageId, attachmentId, target)
        try {
            when (val outcome = translate(attachmentId, target, sourceLanguage)) {
                is AttachmentTranslateOutcome.Success -> {
                    outcome.response.translations.forEach { apply(messageId, attachmentId, it) }
                    if (outcome.response.translations.any { it.targetLanguage.equals(target, ignoreCase = true) && !it.audioUrl.isNullOrBlank() }) {
                        requested.update { it - key }
                    }
                }
                is AttachmentTranslateOutcome.ConsentRequired -> {
                    consents.update { it + (key to outcome.error) }
                    requested.update { it - key }
                }
                is AttachmentTranslateOutcome.Failed -> fail(messageId, attachmentId, target, key)
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (@Suppress("TooGenericExceptionCaught") failure: Exception) {
            fail(messageId, attachmentId, target, key)
        }
    }

    /**
     * L'état de la demande de ([attachmentId], [language]), tenu à jour : [hasTrack] dit si la piste est déjà dans le cache
     * (elle l'emporte sur toute demande restée), en cours jusqu'au plafond de silence (UNE réémission, à l'échéance).
     */
    @OptIn(ExperimentalCoroutinesApi::class)
    fun observe(messageId: String, attachmentId: String, language: String, hasTrack: Flow<Boolean>): Flow<AudioTranslationRequestState> {
        val target = language.trim().lowercase()
        val key = keyOf(attachmentId, target)
        return combine(
            requested.map { it[key] }.distinctUntilChanged(),
            consents.map { it[key] }.distinctUntilChanged(),
            failures.ledger,
            hasTrack.distinctUntilChanged(),
        ) { at, consent, ledger, track ->
            Snapshot(at, consent, failedIn(ledger.forMessage(messageId), attachmentId, target, waiting = at != null), track)
        }
            .distinctUntilChanged()
            .transformLatest { snapshot ->
                emit(snapshot.state(nowMillis()))
                val at = snapshot.requestedAt
                if (at != null && !snapshot.failed && !snapshot.hasTrack) {
                    val remaining = at + ServerTranscriptionWait.SILENCE_CEILING_MS - nowMillis()
                    if (remaining > 0) delay(remaining)
                    emit(snapshot.state(nowMillis()))
                }
            }
            .distinctUntilChanged()
    }

    private data class Snapshot(val requestedAt: Long?, val consent: AttachmentConsentError?, val failed: Boolean, val hasTrack: Boolean) {
        fun state(nowMs: Long): AudioTranslationRequestState =
            AudioTranslationRequestState.of(requestedAt, nowMs, hasTrack, failed, consent, refused = false)
    }

    private fun fail(messageId: String, attachmentId: String, language: String, key: String) {
        failures.failed(TranslationFailureEntry(messageId, TranslationFailureKind.AUDIO_TRANSLATION, attachmentId = attachmentId, language = language))
        requested.update { it - key }
    }

    private fun hasFailed(messageId: String, attachmentId: String, language: String, waiting: Boolean): Boolean =
        failedIn(failures.ledger.value.forMessage(messageId), attachmentId, language, waiting)

    /** Un échec nommant la langue la vise ; un échec sans langue (l'événement socket) ne vise qu'une langue qui attend. */
    private fun failedIn(entries: List<TranslationFailureEntry>, attachmentId: String, language: String, waiting: Boolean): Boolean =
        entries.any {
            it.kind == TranslationFailureKind.AUDIO_TRANSLATION &&
                (it.attachmentId == null || it.attachmentId == attachmentId) &&
                (if (it.language == null) waiting else it.language.equals(language, ignoreCase = true))
        }

    private fun keyOf(attachmentId: String, language: String): String = "$attachmentId|$language"

    override suspend fun clear() {
        requested.value = emptyMap()
        consents.value = emptyMap()
    }
}
