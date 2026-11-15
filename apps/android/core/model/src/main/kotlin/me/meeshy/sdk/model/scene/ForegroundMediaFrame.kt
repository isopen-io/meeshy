package me.meeshy.sdk.model.scene

import kotlin.math.abs

/**
 * Le cadre de base d'un média de PREMIER PLAN (un `StoryMediaObject` hors fond), en unités de design — port de
 * `StoryMediaLayerRules.baseMediaDesignSize` (iOS). Un carré, ou un média dont le ratio n'est pas mesuré, prend la
 * moitié de la largeur de design ; tout autre ratio s'inscrit dans une enveloppe de 65 % de cette largeur. Le
 * composeur et le lecteur y lisent la même taille, pour qu'un média posé ait la forme qu'il aura chez chacun (loi 6).
 */
object ForegroundMediaFrame {

    private const val SQUARE_FRACTION: Double = 0.5
    private const val ENVELOPE_FRACTION: Double = 0.65
    private const val SQUARE_TOLERANCE: Double = 0.05
    private const val MIN_RATIO: Double = 0.1
    private const val MAX_RATIO: Double = 10.0

    fun baseDesignSize(aspectRatio: Double?): CanvasSize {
        val ratio = aspectRatio?.takeIf { it.isFinite() && it > 0.0 }?.coerceIn(MIN_RATIO, MAX_RATIO) ?: 1.0
        if (abs(ratio - 1.0) < SQUARE_TOLERANCE) {
            val side = CanvasGeometry.DESIGN_WIDTH * SQUARE_FRACTION
            return CanvasSize(side, side)
        }
        val target = CanvasGeometry.DESIGN_WIDTH * ENVELOPE_FRACTION
        return if (ratio < 1.0) CanvasSize(target * ratio, target) else CanvasSize(target, target / ratio)
    }

    /** La taille peinte sur un canevas de [canvasWidth] de large, à l'échelle propre de l'objet. */
    fun renderedSize(aspectRatio: Double?, scale: Double, canvasWidth: Double): CanvasSize {
        val base = baseDesignSize(aspectRatio)
        val factor = CanvasGeometry.scaleFactor(canvasWidth) * (scale.takeIf { it.isFinite() && it > 0.0 } ?: 1.0)
        return CanvasSize(base.width * factor, base.height * factor)
    }

    /** Le ratio mesuré d'un média aux dimensions connues ; `null` tant que l'une manque. */
    fun measuredAspectRatio(width: Int?, height: Int?): Double? =
        if (width != null && height != null && width > 0 && height > 0) width.toDouble() / height else null
}
