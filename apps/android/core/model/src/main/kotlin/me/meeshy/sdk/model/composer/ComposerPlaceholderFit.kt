package me.meeshy.sdk.model.composer

/**
 * **L'invite du champ tient dans sa capsule** (#14394) : sur un écran étroit (360 dp), le champ partage la rangée avec
 * le (+) et les emojis rapides. L'invite rétrécit alors juste assez pour tenir, comme le `minimumScaleFactor` d'iOS, et
 * jamais sous [MIN_SCALE] ; au-delà, l'ellipse reprend.
 */
public object ComposerPlaceholderFit {
    public const val MIN_SCALE: Float = 0.75f

    /** Le pas de la descente, quand la mesure à l'échelle du rapport déborde encore (crénage, arrondi au pixel). */
    public const val STEP: Float = 0.02f

    /**
     * L'échelle dont la MESURE tient dans [availableWidth] (#14394) : le simple rapport des largeurs laisse le texte
     * déborder d'un pixel (une police ne se réduit pas linéairement), et l'ellipse le coupait encore.
     */
    public fun fit(availableWidth: Int, measureAt: (Float) -> Int): Float {
        val first = scale(measureAt(1f), availableWidth)
        return generateSequence(first) { (it - STEP).coerceAtLeast(MIN_SCALE) }
            .takeWhile { it > MIN_SCALE - STEP / 2 }
            .firstOrNull { it == 1f || it <= MIN_SCALE || measureAt(it) <= availableWidth }
            ?: MIN_SCALE
    }

    public fun scale(naturalWidth: Int, availableWidth: Int): Float {
        if (naturalWidth <= 0 || availableWidth <= 0 || naturalWidth <= availableWidth) return 1f
        return (availableWidth.toFloat() / naturalWidth).coerceAtLeast(MIN_SCALE)
    }
}
