package me.meeshy.sdk.model.composer

/**
 * Où en est l'édition du texte du document (iOS : le document garde son état d'édition d'une surface à l'autre) : le
 * curseur ou la sélection que l'auteur a laissés. Valeur BRUTE, jamais rognée à la réception : le texte d'une surface
 * peut arriver après la sélection (une graine posée au montage), et ce qui était voulu doit survivre jusque-là.
 * Elle ne se rogne qu'au moment de se montrer ([shownIn]).
 */
data class ComposerTextSelection(val start: Int, val end: Int) {
    /** La sélection telle qu'un champ de [length] caractères peut la montrer : bornée, `start <= end`. */
    fun shownIn(length: Int): ComposerTextSelection {
        val safe = length.coerceAtLeast(0)
        val low = start.coerceIn(0, safe)
        val high = end.coerceIn(0, safe)
        return ComposerTextSelection(minOf(low, high), maxOf(low, high))
    }

    companion object {
        /** Aucune édition encore : le curseur est en fin de texte, où l'on continue d'écrire. */
        val AT_END = ComposerTextSelection(Int.MAX_VALUE, Int.MAX_VALUE)
    }
}
