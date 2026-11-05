package me.meeshy.sdk.speech

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.updateAndGet
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.sdk.media.LocalTranscriptions
import me.meeshy.sdk.model.media.TusTranscription
import me.meeshy.sdk.model.speech.LocalTranscriptionMapping
import me.meeshy.sdk.model.speech.LocalTranscriptionResults
import java.util.concurrent.ConcurrentHashMap

/**
 * **Transcription d'un vocal de conversation SUR L'APPAREIL, dès l'arrêt de l'enregistrement** (iOS
 * `VoiceNoteLocalTranscriber`). Meilleur effort : la reconnaissance démarre en tâche de fond ([begin], rend aussitôt), est
 * bornée à [timeoutMs] (8 s), et tout échec — autorisation absente, langue non installée, API < 33, annulation — laisse le
 * fichier partir sans texte : Whisper reste le repli côté serveur. Le résultat est retenu par identifiant de pièce
 * ([LocalTranscriptionResults], 8 au plus) : [results] alimente la bulle optimiste, [await] le fait voyager avec l'upload,
 * [promoted] le rekeye sur l'id serveur.
 */
public class VoiceNoteLocalTranscriber(
    private val scope: CoroutineScope,
    private val transcribe: suspend (path: String, language: String) -> SoundTranscriptionOutcome,
    private val timeoutMs: Long = DEFAULT_TIMEOUT_MS,
) : LocalTranscriptions {
    private val state = MutableStateFlow(LocalTranscriptionResults.Empty)
    private val inFlight = ConcurrentHashMap<String, Deferred<TusTranscription?>>()
    private val aliases = ConcurrentHashMap<String, String>()

    /** Les transcriptions connues, par id de pièce (local, puis serveur après [promoted]) : ce que la bulle optimiste pose. */
    public val results: StateFlow<Map<String, TusTranscription>> get() = mapped

    private val mapped = MutableStateFlow<Map<String, TusTranscription>>(emptyMap())

    /** Idempotent par [attachmentId]. */
    public fun begin(attachmentId: String, path: String, durationMs: Int, language: String) {
        if (inFlight.containsKey(attachmentId) || state.value[attachmentId] != null) return
        val job = scope.async(start = CoroutineStart.LAZY) {
            val outcome = try {
                withTimeoutOrNull(timeoutMs) { transcribe(path, language) }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                null
            }
            val tus = (outcome as? SoundTranscriptionOutcome.Heard)
                ?.let { LocalTranscriptionMapping.toTus(it.transcription, language, durationMs) }
            complete(attachmentId, tus)
            tus
        }
        inFlight[attachmentId] = job
        job.start()
    }

    public fun transcription(attachmentId: String): TusTranscription? = state.value[attachmentId]

    override suspend fun await(attachmentIds: List<String>, tempId: String): Map<String, TusTranscription> {
        for (id in attachmentIds) {
            try {
                inFlight[id]?.await()
            } catch (cancelled: CancellationException) {
                currentCoroutineContext().ensureActive()
            }
        }
        return known(attachmentIds)
    }

    override fun known(attachmentIds: List<String>): Map<String, TusTranscription> =
        attachmentIds.mapNotNull { id -> state.value[id]?.let { id to it } }.toMap()

    override fun promoted(localId: String, serverId: String) {
        if (inFlight.containsKey(localId)) aliases[localId] = serverId
        publish(state.updateAndGet { it.rekeyed(localId, serverId) })
    }

    /** Oublie une pièce (envoyée, ou retirée du tiroir) et abandonne sa reconnaissance. */
    public fun discard(attachmentId: String) {
        inFlight.remove(attachmentId)?.cancel()
        aliases.remove(attachmentId)
        publish(state.updateAndGet { it.without(attachmentId) })
    }

    private fun complete(attachmentId: String, tus: TusTranscription?) {
        inFlight.remove(attachmentId)
        val key = aliases.remove(attachmentId) ?: attachmentId
        if (tus != null) publish(state.updateAndGet { it.with(key, tus) })
    }

    private fun publish(results: LocalTranscriptionResults) {
        mapped.value = results.entries
    }

    public companion object {
        /** Un vocal dure rarement plus d'une minute ; au-delà, l'envoi part sans transcription locale plutôt que d'attendre. */
        public const val DEFAULT_TIMEOUT_MS: Long = 8_000L
    }
}
