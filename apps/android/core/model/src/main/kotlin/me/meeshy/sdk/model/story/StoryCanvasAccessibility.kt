package me.meeshy.sdk.model.story

/**
 * L'annonce TalkBack du canvas de lecture (miroir de `StoryCanvasAccessibility.label`, iOS). Le canvas est dessiné, pas
 * composé de vues : sans cette phrase, un lecteur d'écran sait qu'une story joue et rien de ce qu'elle dit. Les segments
 * arrivent DÉJÀ localisés et résolus par le Prisme (l'annonce dit ce que l'écran montre) ; cette fonction pure fixe
 * l'ORDRE : position, auteur, textes, stickers (ils commentent, ils ne portent pas le message), transcription.
 */
object StoryCanvasAccessibility {

    fun label(
        position: String,
        author: String?,
        texts: List<String>,
        stickers: List<String>,
        transcript: String?,
    ): String {
        val segments = buildList {
            add(position.trim())
            author.clean()?.let(::add)
            texts.cleaned().takeIf { it.isNotEmpty() }?.let { add(it.joinToString(". ")) }
            stickers.cleaned().takeIf { it.isNotEmpty() }?.let { add(it.joinToString(". ")) }
            transcript.clean()?.let(::add)
        }
        return segments.filter { it.isNotEmpty() }.joinToString(", ")
    }

    private fun String?.clean(): String? = this?.trim()?.takeIf { it.isNotEmpty() }

    private fun List<String>.cleaned(): List<String> = mapNotNull { it.clean() }
}
