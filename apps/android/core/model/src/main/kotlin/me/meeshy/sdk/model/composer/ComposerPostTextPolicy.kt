package me.meeshy.sdk.model.composer

import java.text.BreakIterator

/**
 * Le texte d'un post ou d'un réel — miroir d'iOS `ComposerPostTextPolicy` : le plafond du serveur (5 000 unités UTF-16,
 * `String.length` de la passerelle), un compteur discret qui n'apparaît qu'à l'approche, et une coupe qui ne tranche
 * jamais un caractère (un emoji, un accent composé).
 */
object ComposerPostTextPolicy {
    const val CONTENT_LIMIT: Int = 5000
    const val COUNTER_THRESHOLD: Int = 4000
    const val WARNING_THRESHOLD: Int = 4500

    data class Counter(val used: Int, val limit: Int, val warns: Boolean)

    fun length(text: String): Int = text.length

    fun isOverLimit(text: String): Boolean = length(text) > CONTENT_LIMIT

    fun truncate(text: String): String {
        if (!isOverLimit(text)) return text
        val boundaries = BreakIterator.getCharacterInstance().apply { setText(text) }
        val cut = generateSequence(boundaries.first()) { boundaries.next().takeIf { it != BreakIterator.DONE } }
            .takeWhile { it <= CONTENT_LIMIT }
            .last()
        return text.substring(0, cut)
    }

    fun counter(text: String): Counter? {
        val used = length(text)
        if (used < COUNTER_THRESHOLD) return null
        return Counter(used = used, limit = CONTENT_LIMIT, warns = used >= WARNING_THRESHOLD)
    }
}
