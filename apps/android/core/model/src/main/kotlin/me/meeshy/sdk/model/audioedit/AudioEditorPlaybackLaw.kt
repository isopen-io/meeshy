package me.meeshy.sdk.model.audioedit

/**
 * Les lois pures de l'aperçu de l'éditeur audio : d'où repart la lecture, quand la boucle de rognage rebondit,
 * jusqu'où un saut de ±5 s peut aller. Le lecteur n'en est que l'exécutant.
 */
public object AudioEditorPlaybackLaw {

    /** Marge avant la fin de la fenêtre sous laquelle on repart du début plutôt que de jouer 50 ms. */
    public const val END_MARGIN: Double = 0.05

    /** Le pas des boutons −5 s / +5 s. */
    public const val SKIP_SECONDS: Double = 5.0

    /** Où démarre la lecture depuis [current] : le début de [region] si l'on est dehors ou au bout, sinon [current]. */
    public fun startPosition(current: Double, region: ClosedFloatingPointRange<Double>?): Double {
        if (region == null) return current
        return if (current < region.start || current >= region.endInclusive - END_MARGIN) region.start else current
    }

    /** `true` quand la boucle de rognage doit rebondir au début de [region]. */
    public fun shouldLoop(current: Double, region: ClosedFloatingPointRange<Double>?): Boolean =
        region != null && current >= region.endInclusive

    /** La position après un saut de [delta] secondes, bornée à la piste. */
    public fun skipped(current: Double, delta: Double, duration: Double): Double =
        (current + delta).coerceIn(0.0, maxOf(0.0, duration))

    /** La fraction 0..1 de lecture, jamais hors bornes ni NaN. */
    public fun progress(current: Double, duration: Double): Double =
        if (duration <= 0.0) 0.0 else (current / duration).coerceIn(0.0, 1.0)
}
