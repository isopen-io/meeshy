package me.meeshy.sdk.model.scene

import kotlin.math.ceil
import kotlin.math.max

/**
 * La pose d'un texte dans son cadre, encre comprise (iOS `contentWidth = wrapWidth + inkPad * 2`). Les glyphes
 * calligraphiques débordent leur avance typographique : l'encre est réservée DANS le cadre, de chaque côté, sans élargir
 * la largeur de coupe — le texte se coupe à la même place, la boîte s'élargit autour.
 */
object SceneTextFrameGeometry {
    /** La boîte et la position où poser le texte mesuré (design-pixels, origine en haut à gauche de la boîte). */
    data class Placement(val metrics: StoryTextFrameGeometry.Metrics, val textX: Double, val textY: Double)

    /** La réserve d'encre par côté : le plus grand débord, arrondi au-dessus ; jamais négative, un débord non fini compte pour rien. */
    fun inkReserve(leftOverhang: Double, rightOverhang: Double): Double =
        ceil(max(0.0, max(leftOverhang.takeIf { it.isFinite() } ?: 0.0, rightOverhang.takeIf { it.isFinite() } ?: 0.0)))

    fun place(
        shape: StoryTextFrameShape,
        isFramed: Boolean,
        textWidth: Double,
        textHeight: Double,
        oGlyphWidth: Double,
        paddingScale: Double,
        inkPad: Double,
    ): Placement {
        val ink = max(0.0, inkPad.takeIf { it.isFinite() } ?: 0.0)
        val metrics = StoryTextFrameGeometry.metrics(
            shape = shape,
            isFramed = isFramed,
            textWidth = textWidth + ink * 2,
            textHeight = textHeight,
            oGlyphWidth = oGlyphWidth,
            paddingScale = paddingScale,
        )
        return Placement(metrics, textX = metrics.glyphX + ink, textY = metrics.glyphY)
    }
}
