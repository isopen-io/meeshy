package me.meeshy.ui.component.audio

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.Stable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import me.meeshy.sdk.model.MessageTranscriptionFiche
import me.meeshy.sdk.model.MessageTranscriptionSegment

/**
 * Ce que l'hôte sait de la transcription d'UN vocal en plus de ce que la source porte déjà : la transcription faite SUR
 * L'APPAREIL (en mémoire, jamais écrite) et l'état de la demande en cours (appareil ou serveur). La transcription du
 * serveur n'est pas ici : elle arrive par Room et se lit sur la source.
 */
@Immutable
public data class AudioFullscreenTranscriptState(
    val localSegments: List<MessageTranscriptionSegment> = emptyList(),
    val localText: String? = null,
    val request: MessageTranscriptionFiche.Request = MessageTranscriptionFiche.Request.IDLE,
) {
    public companion object {
        public val Idle: AudioFullscreenTranscriptState = AudioFullscreenTranscriptState()
    }
}

/**
 * **Ce que le plein écran audio demande à l'hôte pour transcrire et changer de langue** (iOS `AudioFullscreenPage+Transcription`) :
 * transcrire sur l'appareil ou via le serveur, choisir la langue de la piste jouée, ouvrir la feuille « Traduire l'audio ».
 * L'écran ignore le message, le réseau et le moteur de reconnaissance — l'hôte (la conversation) les tient.
 *
 * Chaque membre a un corps par défaut INERTE : un hôte sans transcription (post, réel) n'en pose aucune, et la page n'affiche
 * alors ni action « Transcrire » ni bandeau de langues — jamais un bouton qui ne fait rien.
 */
@Stable
public interface AudioFullscreenTranscriptPort {

    /** Le port sait-il transcrire [source] ? Sinon la page garde son silence d'avant (aucun état vide, aucune action). */
    public fun offersTranscription(source: AudioFullscreenSource): Boolean = false

    /** Le port sait-il traduire ou changer la langue de [source] ? Sinon le disque « Traduire l'audio » n'existe pas. */
    public fun offersLanguages(source: AudioFullscreenSource): Boolean = false

    /** La transcription locale et la demande de [source], suivies en direct. */
    public fun transcript(source: AudioFullscreenSource): StateFlow<AudioFullscreenTranscriptState> = IdleTranscript

    /** « Transcrire sur l'appareil » : la copie déjà en cache est reconnue sur place ; sinon l'hôte bascule vers le serveur. */
    public fun transcribeOnDevice(source: AudioFullscreenSource) {}

    /** « Transcrire via le serveur » : la transcription horodatée revient par la socket et entre dans la source. */
    public fun transcribeOnServer(source: AudioFullscreenSource) {}

    /** Joue la piste de [code] (`AudioLanguageStripLaw.ORIGINAL` pour l'original) sans perdre le contexte ni la file. */
    public fun selectLanguage(source: AudioFullscreenSource, code: String) {}

    /** Ouvre la feuille « Traduire l'audio » de [source]. La lecture continue. */
    public fun openLanguages(source: AudioFullscreenSource) {}
}

private val IdleTranscript: StateFlow<AudioFullscreenTranscriptState> = MutableStateFlow(AudioFullscreenTranscriptState.Idle)
