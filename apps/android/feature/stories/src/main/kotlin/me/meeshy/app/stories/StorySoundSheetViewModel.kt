package me.meeshy.app.stories

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import java.util.Locale
import java.util.UUID
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.media.MediaIntake
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadSource
import me.meeshy.sdk.model.MobileTranscriptionPayload
import me.meeshy.sdk.model.composer.sound.ComposerAudioRole
import me.meeshy.sdk.model.composer.sound.SoundLanguageChoices
import me.meeshy.sdk.model.composer.sound.SoundTranscriptions
import me.meeshy.sdk.model.waveform.WaveformLocation
import me.meeshy.sdk.model.waveform.WaveformScale
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.speech.SoundFileTranscriber
import me.meeshy.sdk.speech.SoundTranscriptionOutcome
import me.meeshy.sdk.waveform.WaveformMeasuring

/** Où en est le son que la feuille prépare. */
enum class SoundTakePhase { TRANSCRIBING, PREVIEW, PLACING }

/** Ce que la feuille dit d'une transcription absente. */
enum class SoundTranscriptionNotice {
    /** L'appareil ne transcrit pas cette langue : la passerelle le fera à la publication. */
    SERVER,

    /** La reconnaissance a échoué : réessayer ou rédiger. */
    FAILED,

    /** Rien n'a été entendu. */
    SILENT,
}

enum class SoundSheetFailure { IMPORT }

/** Un son enregistré ou importé, pas encore posé : son fichier, sa durée, ce qu'on y a entendu ou écrit. */
@Immutable
data class SoundTakeDraft(
    val item: MediaUploadItem,
    val path: String,
    val durationSeconds: Float?,
    val phase: SoundTakePhase,
    val transcription: MobileTranscriptionPayload? = null,
    val notice: SoundTranscriptionNotice? = null,
    val written: Boolean = false,
)

@Immutable
data class StorySoundSheetState(
    val language: String,
    val suggestions: List<String>,
    val take: SoundTakeDraft? = null,
    /** `null` : le rôle automatique (le fond s'il manque, sinon la scène). */
    val chosenRole: ComposerAudioRole? = null,
    val failure: SoundSheetFailure? = null,
)

/**
 * La feuille « Son de la story » (#13848) — miroir d'`AudioPostComposerView` (iOS) : un son enregistré au micro ou choisi
 * dans les fichiers est transcrit SUR L'APPAREIL dans la langue du son (changer de langue le retranscrit, un texte écrit
 * par l'auteur reste), puis « Ajouter » le téléverse et le remet au compositeur avec son rôle, sa langue et sa
 * transcription. Le micro lui-même vit avec la feuille ([rememberStorySoundRecorder]) : il ne survit jamais à l'écran.
 */
@HiltViewModel
class StorySoundSheetViewModel internal constructor(
    private val transcriber: SoundFileTranscriber,
    private val waveforms: WaveformMeasuring,
    private val session: SessionRepository,
    private val deviceLanguage: () -> String?,
    private val newTrackId: () -> String,
) : ViewModel() {

    @Inject
    constructor(
        transcriber: SoundFileTranscriber,
        waveforms: WaveformMeasuring,
        session: SessionRepository,
    ) : this(transcriber, waveforms, session, { Locale.getDefault().language }, { "rec-${UUID.randomUUID()}" })

    private val user get() = session.currentUser.value

    private val _state = MutableStateFlow(
        SoundLanguageChoices.initial(user?.systemLanguage, deviceLanguage()).let { language ->
            StorySoundSheetState(language = language, suggestions = suggestionsFor(language))
        },
    )
    val state: StateFlow<StorySoundSheetState> = _state.asStateFlow()

    private var transcription: Job? = null

    /** Un son prêt à préparer : il remplace celui d'avant, qui part avec son fichier. */
    fun onTake(item: MediaUploadItem, durationSeconds: Float?) {
        val path = (item.source as? MediaUploadSource.OnDisk)?.file?.path
        if (path == null) {
            MediaIntake.release(item)
            _state.update { it.copy(failure = SoundSheetFailure.IMPORT) }
            return
        }
        discardTake()
        _state.update {
            it.copy(take = SoundTakeDraft(item, path, durationSeconds?.takeIf { s -> s.isFinite() && s > 0f }, SoundTakePhase.TRANSCRIBING), failure = null)
        }
        transcribe()
    }

    fun onImportFailed() = _state.update { it.copy(failure = SoundSheetFailure.IMPORT) }

    fun onLanguage(code: String) {
        val language = SoundLanguageChoices.normalized(code) ?: return
        if (language == _state.value.language || isUploading) return
        _state.update { it.copy(language = language, suggestions = suggestionsFor(language)) }
        val take = _state.value.take ?: return
        if (take.written) {
            _state.update { it.copy(take = take.copy(transcription = take.transcription?.copy(language = language))) }
        } else {
            transcribe()
        }
    }

    fun onRetryTranscription() {
        if (_state.value.take?.phase == SoundTakePhase.PREVIEW) transcribe()
    }

    fun onWriteTranscription(text: String) {
        if (isUploading) return
        transcription?.cancel()
        _state.update { state ->
            val take = state.take ?: return@update state
            val written = SoundTranscriptions.manual(text, state.language)
            state.copy(take = take.copy(phase = SoundTakePhase.PREVIEW, transcription = written, notice = null, written = written != null))
        }
    }

    fun onRole(role: ComposerAudioRole) = _state.update { it.copy(chosenRole = role) }

    /** Le son se pose : sa langue et sa transcription sont celles qu'« Ajouter » a vues, rien ne les change en route. */
    private val isUploading: Boolean get() = _state.value.take?.phase == SoundTakePhase.PLACING

    fun onRedo() {
        discardTake()
        _state.update { it.copy(take = null, failure = null) }
    }

    /**
     * Remet le son prêt sur l'appareil à [onPlaced] — sa langue et sa transcription sont celles qu'« Ajouter » a vues — avec
     * son fichier : le compositeur le pose aussitôt et l'envoie en arrière-plan (#15598). Seule l'onde se mesure ici.
     */
    fun onAdd(automatic: ComposerAudioRole, onPlaced: (ComposedStorySound, ComposerAudioRole, MediaUploadItem) -> Unit) {
        val take = _state.value.take?.takeIf { it.phase == SoundTakePhase.PREVIEW } ?: return
        val role = _state.value.chosenRole ?: automatic
        _state.update { it.copy(take = take.copy(phase = SoundTakePhase.PLACING), failure = null) }
        viewModelScope.launch {
            val waveform = runCatching { WaveformScale.peakNormalized(waveforms.measure(WaveformLocation.Local(take.path), WAVEFORM_SAMPLES).toList()) }.getOrDefault(emptyList())
            val sound = ComposedStorySound(
                trackId = newTrackId(),
                postMediaId = "",
                url = LOCAL_FILE + take.path,
                durationSeconds = take.durationSeconds,
                waveform = waveform,
                language = _state.value.language,
                transcription = take.transcription,
            )
            transcription?.cancel()
            _state.update { it.copy(take = null, chosenRole = null) }
            onPlaced(sound, role, take.item)
        }
    }

    /**
     * « OK » ferme la feuille : un son prêt n'y reste pas en suspens, il se pose comme par « Ajouter » (#16206) — l'auteur
     * qui a choisi un son et touche OK s'attend à le voir sur la scène. Un son encore en préparation reste dans la feuille.
     */
    fun onDone(automatic: ComposerAudioRole, onPlaced: (ComposedStorySound, ComposerAudioRole, MediaUploadItem) -> Unit) =
        onAdd(automatic, onPlaced)

    private fun transcribe() {
        transcription?.cancel()
        val take = _state.value.take ?: return
        val language = _state.value.language
        _state.update { it.copy(take = take.copy(phase = SoundTakePhase.TRANSCRIBING, notice = null)) }
        transcription = viewModelScope.launch {
            val outcome = transcriber.transcribe(take.path, language)
            _state.update { state ->
                val current = state.take?.takeIf { it.path == take.path } ?: return@update state
                state.copy(take = current.heard(outcome))
            }
        }
    }

    private fun SoundTakeDraft.heard(outcome: SoundTranscriptionOutcome): SoundTakeDraft = when (outcome) {
        is SoundTranscriptionOutcome.Heard -> SoundTranscriptions.payload(outcome.transcription).let { payload ->
            copy(phase = SoundTakePhase.PREVIEW, transcription = payload, notice = if (payload == null) SoundTranscriptionNotice.SILENT else null)
        }
        SoundTranscriptionOutcome.ServerWillTranscribe -> copy(phase = SoundTakePhase.PREVIEW, transcription = null, notice = SoundTranscriptionNotice.SERVER)
        SoundTranscriptionOutcome.Failed -> copy(phase = SoundTakePhase.PREVIEW, transcription = null, notice = SoundTranscriptionNotice.FAILED)
    }

    private fun discardTake() {
        transcription?.cancel()
        _state.value.take?.let { MediaIntake.release(it.item); java.io.File(it.path).delete() }
    }

    private fun suggestionsFor(language: String): List<String> =
        SoundLanguageChoices.suggested(user?.systemLanguage, user?.regionalLanguage, deviceLanguage(), language)

    /** Les langues proposées pour un son déjà posé, la sienne comprise. */
    fun suggestionsAround(language: String?): List<String> = suggestionsFor(SoundLanguageChoices.normalized(language.orEmpty()) ?: _state.value.language)

    override fun onCleared() {
        discardTake()
    }

    private companion object {
        const val WAVEFORM_SAMPLES = 80
        const val LOCAL_FILE = "file://"
    }
}
