package me.meeshy.sdk.model.story

/**
 * Quand l'overlay de chargement du lecteur se montre et se retire — miroir de `StoryReaderLoadingOverlay`
 * et de la grâce du canevas (iOS). Le placeholder (thumbhash, miniature) est monté tant que la slide n'a pas
 * atteint [REMOVE_AT] ; le spinner n'arme qu'après [SPINNER_GRACE_MS] et seulement sous [SPINNER_BELOW].
 */
object StoryLoadingOverlayPolicy {
    const val SPINNER_GRACE_MS: Long = 200
    const val SPINNER_BELOW: Double = 0.20
    const val REMOVE_AT: Double = 0.95

    /** L'overlay (placeholder compris) reste monté tant que la progression est sous le seuil de retrait. */
    fun isMounted(progress: Double): Boolean = progress < REMOVE_AT

    /** À la fin du délai de grâce : le spinner s'arme si la slide n'a presque pas progressé. */
    fun armsSpinner(progressAtGraceEnd: Double): Boolean = progressAtGraceEnd < SPINNER_BELOW

    /** Le spinner visible : armé ET l'overlay encore monté (un cache chaud ne le voit jamais). */
    fun showsSpinner(armed: Boolean, progress: Double): Boolean = armed && isMounted(progress)
}
