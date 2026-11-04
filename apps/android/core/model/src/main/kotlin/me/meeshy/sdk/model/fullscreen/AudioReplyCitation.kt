package me.meeshy.sdk.model.fullscreen

import me.meeshy.sdk.model.DurationFormat

/**
 * **Ce que la barre de réponse cite d'un vocal** : son auteur et sa durée (« Vocal · 1:12 »). Jamais sa transcription — la
 * citation ne montre que ce que la bulle d'un vocal montre.
 */
public data class AudioReplyCitation(val author: String, val durationLabel: String?) {

    public companion object {
        public fun of(authorName: String?, durationMs: Long): AudioReplyCitation = AudioReplyCitation(
            author = authorName?.trim().orEmpty(),
            durationLabel = durationMs.takeIf { it > 0L }?.let { DurationFormat.clock(it / MS_PER_SECOND) },
        )

        private const val MS_PER_SECOND = 1000.0
    }
}
