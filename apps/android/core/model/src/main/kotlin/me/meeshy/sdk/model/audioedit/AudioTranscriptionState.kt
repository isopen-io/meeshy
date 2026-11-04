package me.meeshy.sdk.model.audioedit

/** Pourquoi la transcription de l'éditeur n'a rien rendu — l'écran traduit chaque raison en phrase. */
public enum class AudioTranscriptionFailure { FILE_MISSING, EMPTY, NO_SPEECH, FAILED }

/** Le texte transcrit qui voyage avec l'audio confirmé (miroir de `StoryVoiceTranscription`, iOS). */
public data class AudioEditTranscription(val language: String, val text: String)

/**
 * Le cycle de vie de la transcription dans l'éditeur — miroir d'`AudioTranscriptionState` (iOS). Elle n'est
 * jamais une version du journal : changer de version la remet à [Idle], car les mots appartiennent à un rendu.
 */
public sealed interface AudioTranscriptionState {
    public data object Idle : AudioTranscriptionState
    public data object Running : AudioTranscriptionState
    public data class Done(val text: String, val language: String) : AudioTranscriptionState
    public data class Failed(val reason: AudioTranscriptionFailure) : AudioTranscriptionState
    public data object PermissionDenied : AudioTranscriptionState

    public val isRunning: Boolean get() = this is Running

    public val canStart: Boolean get() = this !is Running

    /** Le bouton dit « Transcrire à nouveau » dès qu'une tentative a abouti ou échoué. */
    public val offersRetry: Boolean get() = this is Done || this is Failed || this is PermissionDenied

    /** Ce qui part avec l'export : un texte obtenu et non vide, rien d'autre. */
    public fun exported(): AudioEditTranscription? =
        (this as? Done)?.takeIf { it.text.isNotBlank() }?.let { AudioEditTranscription(it.language, it.text) }
}

/** Les langues proposées à la transcription : celles de l'interface, la langue de l'appareil en tête de choix par défaut. */
public object AudioTranscriptionLanguages {
    public val CODES: List<String> = listOf("fr", "en", "es", "pt", "de", "it", "ar")

    /** La langue de l'appareil si on sait la transcrire, l'anglais sinon. */
    public fun defaultFor(deviceLanguage: String?): String =
        deviceLanguage?.lowercase()?.takeIf { it in CODES } ?: "en"
}
