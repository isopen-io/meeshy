package me.meeshy.sdk.model.imageedit

/** Ratios proposés par les chips du recadrage. Miroir d'iOS `CropRatio`. */
public enum class CropRatio(public val aspectRatio: Double?, public val label: String?, public val proOnly: Boolean = false) {
    FREE(null, null),
    SQUARE(1.0, "1:1"),
    RATIO_4_3(4.0 / 3.0, "4:3"),
    RATIO_16_9(16.0 / 9.0, "16:9"),
    RATIO_9_16(9.0 / 16.0, "9:16", proOnly = true),
    ;

    public companion object {
        public fun available(isPro: Boolean): List<CropRatio> = entries.filter { isPro || !it.proOnly }
    }
}

/** Décisions pures du cycle de vie du cadre : rectangle initial, changement de ratio, cuisson. */
public object CropFrame {

    private const val RATIO_FILL = 0.92f
    private const val RATIO_RECENTER_FILL = 0.95f
    private const val FREE_MIN_EDGE = 40f
    private const val MIN_NORMALIZED = 0.02f
    private const val FULL_FRAME_ORIGIN = 0.006f
    private const val FULL_FRAME_SIZE = 0.988f

    public fun centered(aspect: Double, bounds: CropRect, fill: Float = RATIO_FILL): CropRect {
        val ratio = aspect.toFloat()
        var w = bounds.width * fill
        var h = w / ratio
        if (h > bounds.height * fill) {
            h = bounds.height * fill
            w = h * ratio
        }
        return CropRect(bounds.centerX - w / 2f, bounds.centerY - h / 2f, w, h)
    }

    public fun initial(saved: NormalizedCrop?, ratio: Double?, display: CropRect): CropRect = when {
        saved != null -> CropRect(
            display.left + saved.x * display.width,
            display.top + saved.y * display.height,
            saved.width * display.width,
            saved.height * display.height,
        )
        ratio != null -> centered(ratio, display)
        else -> display
    }

    /** Recentre le cadre sur son centre au nouveau ratio, borné à 95 % de l'image. */
    public fun adjustedToRatio(current: CropRect, ratio: Double?, display: CropRect): CropRect {
        if (display.width <= 1f || display.height <= 1f) return current
        if (ratio == null) {
            return if (current.width < FREE_MIN_EDGE || current.height < FREE_MIN_EDGE) display else current
        }
        val r = ratio.toFloat()
        val maxW = minOf(current.width, display.width * RATIO_RECENTER_FILL)
        val maxH = minOf(current.height, display.height * RATIO_RECENTER_FILL)
        val (w, h) = if (maxW / r <= maxH) maxW to maxW / r else maxH * r to maxH
        val proposed = CropRect(current.centerX - w / 2f, current.centerY - h / 2f, w, h)
        return proposed.intersect(display)
    }

    /**
     * Valeur à graver dans l'état d'édition, ou `null` pour ne rien changer. Le recadrage n'est cuit
     * que si l'utilisateur a saisi le cadre ou qu'un recadrage existait déjà : ouvrir puis fermer
     * l'outil est un no-op. [Baked.crop] vaut `null` pour un cadre plein.
     */
    public fun bake(touched: Boolean, hasSavedCrop: Boolean, frame: CropRect, display: CropRect): Baked? {
        if (!touched && !hasSavedCrop) return null
        if (display.width <= 1f || display.height <= 1f || frame.width <= 1f || frame.height <= 1f) return null
        val raw = CropRect(
            (frame.left - display.left) / display.width,
            (frame.top - display.top) / display.height,
            frame.width / display.width,
            frame.height / display.height,
        )
        val n = raw.intersect(CropRect(0f, 0f, 1f, 1f))
        if (n.width <= MIN_NORMALIZED || n.height <= MIN_NORMALIZED) return null
        val full = n.left < FULL_FRAME_ORIGIN && n.top < FULL_FRAME_ORIGIN &&
            n.width > FULL_FRAME_SIZE && n.height > FULL_FRAME_SIZE
        return Baked(if (full) null else NormalizedCrop(n.left, n.top, n.width, n.height))
    }

    public data class Baked(val crop: NormalizedCrop?)
}
