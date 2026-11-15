package me.meeshy.sdk.model.composer.timeline

/**
 * **La fenêtre VISIBLE de la frise** (#13481, miroir de `ComposerSceneFriseViewport` iOS, #14213) : la portion du temps
 * de la slide que la largeur montre. Entière par défaut ; le pincement la resserre jusqu'à [MINIMUM_SPAN] — une scène de
 * deux heures se règle alors à la seconde —, le glissé du fond la fait défiler. Toujours dans la slide.
 */
data class FriseViewport(val start: Float, val span: Float) {

    val end: Float get() = start + span

    /** La même fenêtre ramenée dans une slide de [duration] secondes (la slide a pu raccourcir pendant le zoom). */
    fun clamped(duration: Float): FriseViewport {
        val total = maxOf(duration, 0f)
        val width = (if (span.isFinite()) span else total).coerceAtLeast(minOf(MINIMUM_SPAN, total)).coerceAtMost(total)
        val from = (if (start.isFinite()) start else 0f).coerceAtMost(total - width).coerceAtLeast(0f)
        return FriseViewport(from, width)
    }

    /** La place de [seconds] dans la fenêtre : 0 au bord gauche, 1 au bord droit, hors de [0, 1] quand il n'est pas visible. */
    fun fraction(seconds: Float): Float = if (span <= 0f || !seconds.isFinite()) 0f else (seconds - start) / span

    fun timeAt(fraction: Float): Float = start + (if (fraction.isFinite()) fraction else 0f).coerceIn(0f, 1f) * span

    /** **Pincer** : la fenêtre se resserre ([scale] > 1) ou s'élargit autour de [anchor], qui garde sa place à l'écran. */
    fun zoomed(scale: Float, anchor: Float, duration: Float): FriseViewport {
        if (!scale.isFinite() || scale <= 0f || span <= 0f) return clamped(duration)
        val pivot = anchor.coerceIn(start, end)
        val place = (pivot - start) / span
        val width = FriseViewport(0f, span / scale).clamped(duration).span
        return FriseViewport(pivot - place * width, width).clamped(duration)
    }

    /** **Faire défiler** de [fraction] de largeur : un glissé vers la droite (positif) montre ce qui précède. */
    fun panned(fraction: Float, duration: Float): FriseViewport =
        FriseViewport(start - (if (fraction.isFinite()) fraction else 0f) * span, span).clamped(duration)

    /** La fenêtre qui montre [seconds] : inchangée s'il est visible, sinon la page qui commence (ou finit) à lui. */
    fun showing(seconds: Float, duration: Float): FriseViewport {
        if (!seconds.isFinite() || seconds in start..end) return clamped(duration)
        return FriseViewport(if (seconds < start) seconds else seconds - span, span).clamped(duration)
    }

    companion object {
        /** La fenêtre la plus étroite : trois secondes. */
        const val MINIMUM_SPAN: Float = 3f

        fun whole(duration: Float): FriseViewport = FriseViewport(0f, maxOf(duration, 0f))

        /** La tête après [elapsed] secondes de lecture : elle avance, jamais au-delà de la fin ni à rebours. */
        fun advanced(playhead: Float, elapsed: Float, duration: Float): Float {
            val step = if (elapsed.isFinite()) maxOf(elapsed, 0f) else 0f
            return (playhead + step).coerceIn(0f, maxOf(duration, 0f))
        }
    }
}
