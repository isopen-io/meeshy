package me.meeshy.sdk.model

/**
 * Glisser vers le haut réduit l'aperçu pour dégager le menu coupé (miroir de iOS `MessageOverlayRevealLaw`, #9043).
 *
 * Le doigt sert d'abord la réduction, puis le RESTE du parcours nourrit le geste existant (« Plus… » vers le haut,
 * fermeture vers le bas). Un message court, dont le menu tient déjà à l'écran, n'a rien à réduire (`floor == 1`).
 */
public object MessageOverlayRevealLaw {
    /** L'aperçu ne descend jamais sous 40 % de sa taille de repos. */
    public const val MINIMUM_FACTOR: Float = 0.4f

    /** Le facteur de réduction rendu (1 = repos) et le parcours que la réduction n'a pas consommé. */
    public data class Split(val factor: Float, val residual: Float)

    /** Le plancher du facteur : juste ce qu'il faut pour que le menu caché remonte, jamais sous [MINIMUM_FACTOR]. */
    public fun floor(hiddenHeight: Float, shrinkableHeight: Float): Float {
        if (hiddenHeight <= 0f || shrinkableHeight <= 0f) return 1f
        return maxOf(MINIMUM_FACTOR, 1f - hiddenHeight / shrinkableHeight)
    }

    /** Partage un parcours vertical (négatif = vers le haut) entre la réduction de l'aperçu et le geste existant. */
    public fun split(translation: Float, committed: Float, floor: Float, shrinkableHeight: Float): Split {
        if (shrinkableHeight <= 0f) return Split(factor = 1f, residual = translation)
        val factor = minOf(1f, maxOf(floor, committed + translation / shrinkableHeight))
        val consumed = (factor - committed) * shrinkableHeight
        return Split(factor = factor, residual = translation - consumed)
    }

    /** De combien le menu remonte pour un facteur donné. */
    public fun rise(factor: Float, shrinkableHeight: Float): Float = (1f - factor) * shrinkableHeight

    /** Sous lecteur d'écran le menu doit être atteignable SANS geste : l'overlay s'ouvre déjà réduit. */
    public fun restingFactor(floor: Float, assistiveReveal: Boolean): Float = if (assistiveReveal) floor else 1f
}
