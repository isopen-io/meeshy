package me.meeshy.app.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import java.util.Locale
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.getAndUpdate
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.core.common.IoDispatcher
import me.meeshy.sdk.attachment.TranscriptionRequestTracker
import me.meeshy.sdk.lang.ReaderPrism
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.media.TypedMediaCache
import me.meeshy.sdk.model.fullscreen.AudioFullscreenTranscriptLaw
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.sdk.model.playback.BubbleVoiceProjection
import me.meeshy.sdk.model.waveform.WaveformLocation
import me.meeshy.sdk.speech.SoundFileTranscriber
import me.meeshy.sdk.speech.SoundTranscriptionOutcome
import me.meeshy.ui.component.audio.AudioFullscreenSource
import me.meeshy.ui.component.audio.AudioFullscreenTranscriptPort
import me.meeshy.ui.component.audio.AudioFullscreenTranscriptState
import timber.log.Timber

/**
 * **La transcription d'un vocal ouvert en plein écran** (iOS `AudioFullscreenPage+Transcription`) : « Transcrire sur l'appareil »
 * reconnaît la copie ENTIÈRE déjà en cache ([SoundFileTranscriber]) ; quand l'appareil ne sait pas (API < 33, modèle de langue
 * absent), qu'aucune copie n'est là ou que la langue est inconnue, la demande bascule d'elle-même vers le serveur
 * ([TranscriptionRequestTracker]) — la complexité est dans le code, l'utilisateur touche une seule capsule. La transcription du
 * serveur revient par la socket et entre dans Room : elle se lit sur la source, pas ici.
 *
 * Ce que la reconnaissance locale produit reste en MÉMOIRE, par pièce, et meurt avec ce modèle : jamais écrit sur le disque ni en
 * Room. Aucun téléchargement n'est déclenché pour transcrire — une pièce sans copie entière part au serveur.
 */
@HiltViewModel
internal class AudioFullscreenViewModel @Inject constructor(
    private val requests: TranscriptionRequestTracker,
    private val transcriber: SoundFileTranscriber,
    private val wholeFiles: TypedMediaCache,
    private val session: SessionRepository,
    @IoDispatcher private val io: CoroutineDispatcher,
) : ViewModel(), AudioFullscreenTranscriptPort {

    private data class Work(
        val result: AudioFullscreenTranscriptLaw.Local? = null,
        val running: Boolean = false,
        val failed: Boolean = false,
    )

    private val work = MutableStateFlow<Map<String, Work>>(emptyMap())
    private val tracked = HashMap<String, StateFlow<AudioFullscreenTranscriptState>>()

    /**
     * Les langues que la feuille « Traduire l'audio » propose en premier : le Prisme du lecteur (rangs 1 à 4, la locale de l'appareil
     * en dernier), suivi du catalogue par la feuille elle-même. Sans session : aucune.
     */
    fun readerLanguages(): List<String> =
        session.currentUser.value?.let { ReaderPrism.resolve(it, Locale.getDefault()) }.orEmpty()

    /** Une pièce de conversation, dont le porteur est connu : le serveur sait quel message transcrit. */
    override fun offersTranscription(source: AudioFullscreenSource): Boolean =
        source.conversationId.isNotBlank() && source.carrierId.isNotBlank()

    override fun transcript(source: AudioFullscreenSource): StateFlow<AudioFullscreenTranscriptState> =
        tracked.getOrPut(source.attachmentId) {
            combine(
                work.map { it[source.attachmentId] ?: Work() }.distinctUntilChanged(),
                requests.observe(source.carrierId, source.attachmentId),
            ) { local, server ->
                AudioFullscreenTranscriptState(
                    localSegments = local.result?.segments.orEmpty(),
                    localText = local.result?.text,
                    request = AudioFullscreenTranscriptLaw.request(server, local.running, local.failed),
                )
            }
                .distinctUntilChanged()
                .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), AudioFullscreenTranscriptState.Idle)
        }

    override fun transcribeOnDevice(source: AudioFullscreenSource) {
        if (!begin(source.attachmentId)) return
        viewModelScope.launch {
            try {
                when (val heard = recognize(source)) {
                    null, SoundTranscriptionOutcome.ServerWillTranscribe -> handToServer(source)
                    SoundTranscriptionOutcome.Failed -> end(source.attachmentId, failed = true)
                    is SoundTranscriptionOutcome.Heard -> {
                        val local = AudioFullscreenTranscriptLaw.localOf(heard.transcription)
                        end(source.attachmentId, result = local.takeIf { it.text.isNotBlank() }, failed = local.text.isBlank())
                    }
                }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (@Suppress("TooGenericExceptionCaught") failure: Exception) {
                Timber.w(failure, "Plein écran audio : transcription locale impossible")
                end(source.attachmentId, failed = true)
            }
        }
    }

    override fun transcribeOnServer(source: AudioFullscreenSource) {
        if (!begin(source.attachmentId)) return
        viewModelScope.launch {
            try {
                handToServer(source)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (@Suppress("TooGenericExceptionCaught") failure: Exception) {
                Timber.w(failure, "Plein écran audio : demande de transcription mal partie")
                end(source.attachmentId, failed = true)
            }
        }
    }

    /** La reconnaissance sur la copie entière ; `null` : rien à reconnaître ici (pas de copie, langue inconnue) — le serveur s'en charge. */
    private suspend fun recognize(source: AudioFullscreenSource): SoundTranscriptionOutcome? {
        val spoken = if (source.isTranslatedTrack) source.trackLanguage else source.originalLanguage ?: source.trackLanguage
        val language = spoken?.trim()?.ifEmpty { null } ?: return null
        val location = withContext(io) {
            BubbleVoiceProjection.waveformLocation(source.url, isProtected = false) { address ->
                wholeFiles.file(MediaCacheCategory.AUDIO, address)?.absolutePath
            }
        } ?: return null
        val path = (WaveformLocation.parse(location) as? WaveformLocation.Local)?.path ?: return null
        return transcriber.transcribe(path, language)
    }

    /** Le serveur transcrit : l'attente est suivie par le suivi partagé (bulle et fiche voient le même état) ; l'échec y est consigné. */
    private suspend fun handToServer(source: AudioFullscreenSource) {
        try {
            requests.request(source.carrierId, source.attachmentId)
        } finally {
            end(source.attachmentId)
        }
    }

    private fun begin(attachmentId: String): Boolean {
        val before = work.getAndUpdate { all ->
            val current = all[attachmentId] ?: Work()
            if (current.running) all else all + (attachmentId to current.copy(running = true, failed = false))
        }
        return before[attachmentId]?.running != true
    }

    private fun end(attachmentId: String, result: AudioFullscreenTranscriptLaw.Local? = null, failed: Boolean = false) {
        work.update { all ->
            val current = all[attachmentId] ?: Work()
            all + (attachmentId to Work(result = result ?: current.result, running = false, failed = failed))
        }
    }

    private companion object {
        const val STOP_TIMEOUT_MS = 5_000L
    }
}
