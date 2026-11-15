package me.meeshy.sdk.model.speech

/**
 * Les échecs typés de la reconnaissance vocale sur l'appareil. Miroir de `TranscriptionError`
 * d'iOS (`apps/ios/.../Models/TranscriptionError.swift`) : mêmes cas, mêmes messages.
 * Égalité par message, comme sur iOS (une cause sous-jacente n'est pas comparable).
 */
sealed class TranscriptionError {

    abstract val message: String

    /** RECORD_AUDIO refusée ou bloquée. */
    data object PermissionDenied : TranscriptionError() {
        override val message: String = "Speech recognition permission denied"
    }

    /** Aucun reconnaisseur utilisable pour cette langue (modèle absent, service indisponible). */
    data class RecognizerUnavailable(val language: String) : TranscriptionError() {
        override val message: String = "Speech recognizer unavailable for language: $language"
    }

    /** La reconnaissance sur appareil n'existe pas (API < 31) ou pas pour cette langue : jamais de repli réseau ici. */
    data class OnDeviceNotSupported(val language: String) : TranscriptionError() {
        override val message: String = "On-device recognition not supported for language: $language"
    }

    class RecognitionFailed(val underlying: Throwable) : TranscriptionError() {
        override val message: String = "Recognition failed: ${underlying.message.orEmpty()}"
        override fun equals(other: Any?): Boolean = other is RecognitionFailed && other.message == message
        override fun hashCode(): Int = message.hashCode()
        override fun toString(): String = "RecognitionFailed($message)"
    }

    class AudioEngineFailed(val underlying: Throwable) : TranscriptionError() {
        override val message: String = "Local audio capture failed: ${underlying.message.orEmpty()}"
        override fun equals(other: Any?): Boolean = other is AudioEngineFailed && other.message == message
        override fun hashCode(): Int = message.hashCode()
        override fun toString(): String = "AudioEngineFailed($message)"
    }

    /**
     * Le micro n'a plus de format exploitable (route d'entrée disparue, matériel en
     * reconfiguration). Rien n'a échoué : on a REFUSÉ de démarrer la capture
     * (voir [AudioInputFormatReadiness]).
     */
    data class TapFormatUnavailable(val sampleRate: Double, val channelCount: Int) : TranscriptionError() {
        override val message: String = "Microphone format unavailable: $sampleRate Hz / $channelCount ch"
    }

    companion object {
        // Valeurs de android.speech.SpeechRecognizer.ERROR_* (le module reste du Kotlin pur).
        private const val ERROR_AUDIO = 3
        private const val ERROR_NO_MATCH = 7
        private const val ERROR_SPEECH_TIMEOUT = 6
        private const val ERROR_INSUFFICIENT_PERMISSIONS = 9
        private const val ERROR_LANGUAGE_NOT_SUPPORTED = 12
        private const val ERROR_LANGUAGE_UNAVAILABLE = 13

        /**
         * Traduit un code `SpeechRecognizer.ERROR_*`. `null` = aucune parole entendue
         * (NO_MATCH, SPEECH_TIMEOUT) : ce n'est pas un échec, la transcription est vide.
         */
        fun fromRecognizerErrorCode(code: Int, language: String): TranscriptionError? = when (code) {
            ERROR_NO_MATCH, ERROR_SPEECH_TIMEOUT -> null
            ERROR_INSUFFICIENT_PERMISSIONS -> PermissionDenied
            ERROR_LANGUAGE_NOT_SUPPORTED -> OnDeviceNotSupported(language)
            ERROR_LANGUAGE_UNAVAILABLE -> RecognizerUnavailable(language)
            ERROR_AUDIO -> AudioEngineFailed(IllegalStateException("audio error $code"))
            else -> RecognitionFailed(IllegalStateException("recognizer error $code"))
        }
    }
}

/** Porte une [TranscriptionError] dans un flux ou une coroutine qui ne connaît que les exceptions. */
class TranscriptionException(val error: TranscriptionError) : Exception(error.message)
