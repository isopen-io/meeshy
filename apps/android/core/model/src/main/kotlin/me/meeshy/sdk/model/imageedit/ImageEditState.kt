package me.meeshy.sdk.model.imageedit

/** Rectangle dans l'espace normalisé [0,1] de l'image orientée. */
public data class NormalizedCrop(
    val x: Float,
    val y: Float,
    val width: Float,
    val height: Float,
) {
    /** Rotation de 90° dans le sens horaire au sein du carré unité. */
    public fun rotatedClockwise(): NormalizedCrop =
        NormalizedCrop(x = 1f - y - height, y = x, width = height, height = width)

    public fun flippedHorizontally(): NormalizedCrop =
        NormalizedCrop(x = 1f - x - width, y = y, width = width, height = height)

    public fun flippedVertically(): NormalizedCrop =
        NormalizedCrop(x = x, y = 1f - y - height, width = width, height = height)
}

/**
 * Description complète et non destructive d'une retouche : une petite valeur rejouable à
 * toute résolution depuis l'original intact. Miroir d'iOS `ImageEditState`.
 */
public data class ImageEditState(
    val orientationTurns: Int = 0,
    val flipHorizontal: Boolean = false,
    val flipVertical: Boolean = false,
    val crop: NormalizedCrop? = null,
    val filter: ImageFilter = ImageFilter.ORIGINAL,
    val adjustments: ImageAdjustments = ImageAdjustments.NEUTRAL,
    val effect: ImageEffect = ImageEffect.NONE,
) {
    init {
        require(orientationTurns in 0..3) { "orientationTurns doit être dans 0..3" }
    }

    public val hasEdits: Boolean
        get() = this != IDENTITY

    /** Vrai quand la géométrie (rotation, miroir, recadrage) est touchée. */
    public val hasGeometryEdits: Boolean
        get() = orientationTurns != 0 || flipHorizontal || flipVertical || crop != null

    public fun rotatedClockwise(): ImageEditState =
        copy(orientationTurns = (orientationTurns + 1) % 4, crop = crop?.rotatedClockwise())

    public fun rotatedCounterClockwise(): ImageEditState =
        copy(
            orientationTurns = (orientationTurns + 3) % 4,
            crop = crop?.rotatedClockwise()?.rotatedClockwise()?.rotatedClockwise(),
        )

    public fun flippedHorizontally(): ImageEditState =
        copy(flipHorizontal = !flipHorizontal, crop = crop?.flippedHorizontally())

    public fun flippedVertically(): ImageEditState =
        copy(flipVertical = !flipVertical, crop = crop?.flippedVertically())

    public companion object {
        public val IDENTITY: ImageEditState = ImageEditState()

        public fun normalizedTurns(turns: Int): Int = ((turns % 4) + 4) % 4
    }
}
