package me.meeshy.sdk.model.composer

/**
 * **L'invite du champ tient dans sa capsule** (#14394) : sur un écran étroit (360 dp), le champ partage la rangée avec
 * le (+) et les emojis rapides. L'invite rétrécit alors juste assez pour tenir, comme le `minimumScaleFactor` d'iOS, et
 * jamais sous [MIN_SCALE] ; au-delà, l'ellipse reprend.
 */
public object ComposerPlaceholderFit {
    public const val MIN_SCALE: Float = 0.75f

    public fun scale(naturalWidth: Int, availableWidth: Int): Float {
        if (naturalWidth <= 0 || availableWidth <= 0 || naturalWidth <= availableWidth) return 1f
        return (availableWidth.toFloat() / naturalWidth).coerceAtLeast(MIN_SCALE)
    }
}
