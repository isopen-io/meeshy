package me.meeshy.sdk.model.speech

/** Un segment horodaté. Miroir d'`OnDeviceTranscriptionSegment` (iOS), en millisecondes. */
data class OnDeviceTranscriptionSegment(
    val text: String,
    val startMs: Long,
    val durationMs: Long,
    val confidence: Double,
) {
    val endMs: Long get() = startMs + durationMs
}

/**
 * Le résultat d'une reconnaissance sur appareil : texte, langue, confiance, segments
 * horodatés et débit de parole (mots par minute, `null` si indéterminable).
 */
data class OnDeviceTranscription(
    val text: String,
    val language: String,
    val confidence: Double,
    val segments: List<OnDeviceTranscriptionSegment> = emptyList(),
    val speakingRate: Double? = null,
) {
    companion object {
        /** Confiance globale : moyenne des segments, 0 sans segment (comme iOS). */
        fun averageConfidence(segments: List<OnDeviceTranscriptionSegment>): Double =
            if (segments.isEmpty()) 0.0 else segments.sumOf { it.confidence } / segments.size

        /** Mots par minute sur l'étendue parlée ; `null` si l'étendue est nulle ou sans mot. */
        fun speakingRate(segments: List<OnDeviceTranscriptionSegment>): Double? {
            if (segments.isEmpty()) return null
            val spanMs = segments.maxOf { it.endMs } - segments.minOf { it.startMs }
            val words = segments.sumOf { wordCount(it.text) }
            if (spanMs <= 0 || words == 0) return null
            return words * 60_000.0 / spanMs
        }

        /**
         * `SpeechRecognizer` ne rend pas d'horodatage par mot : le texte final devient UN segment
         * couvrant [audioDurationMs] (inconnu ⇒ aucun segment, débit `null`).
         */
        fun fromRecognition(
            text: String,
            language: String,
            confidence: Double,
            audioDurationMs: Long?,
        ): OnDeviceTranscription {
            val clean = text.trim()
            val segments = if (clean.isEmpty() || audioDurationMs == null || audioDurationMs <= 0) {
                emptyList()
            } else {
                listOf(OnDeviceTranscriptionSegment(clean, 0L, audioDurationMs, confidence))
            }
            return OnDeviceTranscription(
                text = clean,
                language = language,
                confidence = if (clean.isEmpty()) 0.0 else confidence,
                segments = segments,
                speakingRate = speakingRate(segments),
            )
        }

        private fun wordCount(text: String): Int = text.trim().split(Regex("\\s+")).count { it.isNotEmpty() }
    }
}

/** Ce que le flux de reconnaissance émet : des hypothèses partielles puis UN résultat final. */
sealed interface OnDeviceRecognitionEvent {
    data class Partial(val text: String) : OnDeviceRecognitionEvent
    data class Final(val transcription: OnDeviceTranscription) : OnDeviceRecognitionEvent
}
