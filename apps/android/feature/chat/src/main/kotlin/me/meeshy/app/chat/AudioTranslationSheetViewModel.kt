package me.meeshy.app.chat

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import me.meeshy.sdk.attachment.AudioTranslationRequestTracker
import me.meeshy.sdk.model.translation.AudioTranslationRequestState
import timber.log.Timber

/** Un vocal du message et la langue dont on le traduit (celle de SA transcription). */
@Immutable
internal data class AudioTranslationTarget(val attachmentId: String, val sourceLanguage: String?)

/**
 * Ce que l'hôte sait du message : ses vocaux ouverts, les langues proposées, le refus de chiffrement
 * ([refused] : la traduction passe par l'appareil, la requête ne part pas) et les pistes déjà dans le cache
 * ([readyTracks], `attachmentId|langue`). Les pistes arrivent à chaque émission du cache ; la structure, elle, ne change pas.
 */
@Immutable
internal data class AudioTranslationSheetInput(
    val messageId: String,
    val voices: List<AudioTranslationTarget>,
    val languages: List<String>,
    val refused: Boolean,
    val readyTracks: Set<String>,
) {
    fun structure(): Structure = Structure(messageId, voices, languages, refused)

    @Immutable
    data class Structure(val messageId: String, val voices: List<AudioTranslationTarget>, val languages: List<String>, val refused: Boolean)
}

@Immutable
internal data class AudioTranslationRow(val language: String, val state: AudioTranslationRequestState)

@Immutable
internal data class AudioTranslationSheetUiState(val rows: List<AudioTranslationRow> = emptyList()) {
    /** Le premier consentement manquant : la feuille montre la notice de clonage vocal au lieu d'une erreur générique. */
    val consent: AudioTranslationRequestState.ConsentRequired?
        get() = rows.firstNotNullOfOrNull { it.state as? AudioTranslationRequestState.ConsentRequired }
}

internal sealed interface AudioTranslationSheetEvent {
    /** Toucher une langue : la traduire si elle ne l'est pas, la jouer si la piste est prête. */
    data class Tap(val language: String) : AudioTranslationSheetEvent
}

internal sealed interface AudioTranslationSheetEffect {
    /** La piste est prête : le fil la joue (même canal que les drapeaux) et la feuille se ferme. */
    data class PlayTrack(val messageId: String, val language: String) : AudioTranslationSheetEffect
}

/**
 * La feuille « Traduire l'audio » : une ligne par langue proposée, son état (au repos, en cours avec un spinner, prête,
 * échec avec « Réessayer », consentement manquant, refus de chiffrement) lu du suivi unique des demandes
 * ([AudioTranslationRequestTracker]) — la même vérité que le fil, qui bascule tout seul sur la piste dès qu'elle arrive.
 */
@HiltViewModel
internal class AudioTranslationSheetViewModel @Inject constructor(
    private val tracker: AudioTranslationRequestTracker,
) : ViewModel() {

    private val input = MutableStateFlow<AudioTranslationSheetInput?>(null)
    private val effects = Channel<AudioTranslationSheetEffect>(Channel.BUFFERED)
    val effect: Flow<AudioTranslationSheetEffect> = effects.receiveAsFlow()

    @OptIn(ExperimentalCoroutinesApi::class)
    val uiState: StateFlow<AudioTranslationSheetUiState> = input
        .filterNotNull()
        .map { it.structure() }
        .distinctUntilChanged()
        .flatMapLatest { structure -> rowsOf(structure) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), AudioTranslationSheetUiState())

    /** L'hôte pose (et rafraîchit) ce qu'il sait du message ; un second appel identique ne réabonne rien. */
    fun bind(value: AudioTranslationSheetInput) {
        input.value = value
    }

    fun onEvent(event: AudioTranslationSheetEvent) {
        when (event) {
            is AudioTranslationSheetEvent.Tap -> tap(event.language)
        }
    }

    private fun tap(language: String) {
        val current = input.value ?: return
        val target = language.trim().lowercase().ifEmpty { return }
        val state = uiState.value.rows.firstOrNull { it.language == target }?.state
        when {
            current.refused || state is AudioTranslationRequestState.Refused || state is AudioTranslationRequestState.InFlight -> Unit
            state is AudioTranslationRequestState.Ready -> effects.trySend(AudioTranslationSheetEffect.PlayTrack(current.messageId, target))
            else -> viewModelScope.launch {
                try {
                    current.voices
                        .filterNot { "${it.attachmentId}|$target" in current.readyTracks }
                        .forEach { tracker.request(current.messageId, it.attachmentId, target, it.sourceLanguage) }
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: Exception) {
                    Timber.e(failure, "Traduction audio : demande mal lancée")
                }
            }
        }
    }

    private fun rowsOf(structure: AudioTranslationSheetInput.Structure): Flow<AudioTranslationSheetUiState> {
        if (structure.voices.isEmpty() || structure.languages.isEmpty()) return flowOf(AudioTranslationSheetUiState())
        return combine(structure.languages.map { language -> rowOf(structure, language) }) { rows ->
            AudioTranslationSheetUiState(rows.toList())
        }
    }

    private fun rowOf(structure: AudioTranslationSheetInput.Structure, language: String): Flow<AudioTranslationRow> {
        val perVoice = structure.voices.map { voice ->
            tracker.observe(structure.messageId, voice.attachmentId, language, hasTrack(voice.attachmentId, language))
        }
        return combine(perVoice) { states -> AudioTranslationRequestState.aggregate(states.toList()) }
            .map { state -> AudioTranslationRow(language, if (structure.refused) AudioTranslationRequestState.Refused else state) }
    }

    private fun hasTrack(attachmentId: String, language: String): Flow<Boolean> =
        input.filterNotNull().map { "$attachmentId|$language" in it.readyTracks }

    private companion object {
        const val STOP_TIMEOUT_MS = 5_000L
    }
}
