package me.meeshy.sdk.model.media

/**
 * Grades d'un poster vidéo persisté sous une clé partagée avec des écrivains de grade BULLE. Miroir de
 * `VideoPosterGrade` (iOS). La question n'est pas « ce poster fait-il 1 080 px ? » mais « une
 * ré-extraction ferait-elle MIEUX ? ».
 */
public object VideoPosterGrade {
    /** Plus grand côté (px) d'un poster de bulle. */
    public const val BUBBLE_MAX_DIMENSION: Int = 400

    /** Plus grand côté (px) exigé d'un poster plein écran quand la source le permet. */
    public const val FULLSCREEN_MIN_DIMENSION: Int = 1_080

    /** Plus grand côté (px) auquel on extrait : 1 080p exact, 4K rabattu (budget mémoire). */
    public const val EXTRACTION_MAX_DIMENSION: Int = 1_920

    /** Plus grand côté (px) auquel un poster persisté est décodé pour une surface de liste ou de bulle. */
    public const val LIST_DECODE_MAX_DIMENSION: Int = 600

    /**
     * Source connue : net si le poster atteint `min(1 080, source)`. Source inconnue (cas nominal d'une
     * vidéo) : net dès qu'il dépasse le grade bulle, seul plancher défendable.
     */
    public fun isFullscreenSharp(posterMaxDimension: Int, sourceMaxDimension: Int?): Boolean {
        if (sourceMaxDimension == null || sourceMaxDimension <= 0) return posterMaxDimension > BUBBLE_MAX_DIMENSION
        return posterMaxDimension >= minOf(FULLSCREEN_MIN_DIMENSION, sourceMaxDimension)
    }
}

/** Ce qui tient la place d'une première image encore en extraction : le thumbHash patiente, le dégradé est le repli. */
public enum class PendingPosterLayer {
    THUMB_HASH, GRADIENT;

    public companion object {
        public fun of(thumbHash: String?): PendingPosterLayer =
            if (thumbHash.isNullOrEmpty()) GRADIENT else THUMB_HASH
    }
}
