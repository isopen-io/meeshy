package me.meeshy.sdk.model

/**
 * Une ligne de transcription et l'instant où elle se dit — miroir de `AudioTranscriptCue` (iOS, #4657).
 * `start` et `end` sont optionnels : une ligne sans minutage se LIT, elle ne s'ALLUME jamais.
 */
public data class AudioTranscriptCue(
    val id: Int,
    val text: String,
    val start: Double? = null,
    val end: Double? = null,
) {
    public companion object {
        public const val DEFAULT_PHRASE_CHARACTERS: Int = 48

        private val SENTENCE_END = setOf('.', '!', '?', '…')

        /**
         * La ligne en cours à l'instant [at]. Bas inclus, haut exclu ; `end` absent = jusqu'à la ligne datée suivante ;
         * la dernière ligne sans `end` court jusqu'à la fin.
         */
        public fun activeIndex(cues: List<AudioTranscriptCue>, at: Double): Int? {
            cues.forEachIndexed { index, cue ->
                val start = cue.start ?: return@forEachIndexed
                if (at < start) return@forEachIndexed
                val upper = cue.end ?: cues.drop(index + 1).firstNotNullOfOrNull { it.start }
                if (upper == null || at < upper) return index
            }
            return null
        }

        /**
         * Regroupe des segments par mot en PHRASES lisibles : une fin de phrase coupe toujours, sinon on coupe avant de
         * dépasser [maxCharacters]. La phrase hérite du début du premier segment et de la fin du dernier.
         */
        public fun phrases(cues: List<AudioTranscriptCue>, maxCharacters: Int = DEFAULT_PHRASE_CHARACTERS): List<AudioTranscriptCue> {
            val result = mutableListOf<AudioTranscriptCue>()
            var current = mutableListOf<AudioTranscriptCue>()

            fun close() {
                if (current.isEmpty()) return
                val text = current.map { it.text.trim() }.filter { it.isNotEmpty() }.joinToString(" ")
                if (text.isNotEmpty()) {
                    result += AudioTranscriptCue(
                        id = result.size,
                        text = text,
                        start = current.firstNotNullOfOrNull { it.start },
                        end = current.mapNotNull { it.end }.lastOrNull(),
                    )
                }
                current = mutableListOf()
            }

            cues.forEach { cue ->
                val word = cue.text.trim()
                val length = current.sumOf { it.text.length + 1 }
                if (current.isNotEmpty() && length + word.length > maxCharacters) close()
                current += cue
                if (word.lastOrNull() in SENTENCE_END) close()
            }
            close()
            return result
        }
    }
}
