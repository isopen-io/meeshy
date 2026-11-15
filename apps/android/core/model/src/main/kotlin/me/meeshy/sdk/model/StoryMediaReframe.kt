package me.meeshy.sdk.model

import kotlin.math.max
import kotlin.math.min

/**
 * Recadrer PAR LE GESTE sur l'objet de la scène (spec 2026-10-31, #13973, lot A-E4, iOS `MediaCropRect`) : glisser déplace
 * la fenêtre dans la source à l'inverse du doigt — l'image suit le doigt —, pincer resserre (ou élargit) la fenêtre autour
 * de son centre. Les PROPORTIONS de la fenêtre ne changent jamais : le cadre posé sur la scène garde sa forme pendant le
 * geste. La fenêtre reste dans la source et au-dessus du plancher ; la source entière se lit « aucun recadrage ».
 */
object StoryMediaReframe {

    /** [panX] et [panY] : le déplacement du doigt en fractions du cadre ; [zoom] : le facteur du pincement (> 1 rapproche). */
    fun reframed(crop: StoryMediaCrop?, panX: Double, panY: Double, zoom: Double): StoryMediaCrop? {
        val current = crop ?: StoryMediaCrop.FULL
        val factor = zoom.takeIf { it.isFinite() && it > 0.0 } ?: 1.0
        val (width, height) = sized(current.width / factor, current.height / factor)
        val centerX = current.x + current.width / 2 - finite(panX) * current.width
        val centerY = current.y + current.height / 2 - finite(panY) * current.height
        val x = (centerX - width / 2).coerceIn(0.0, 1.0 - width)
        val y = (centerY - height / 2).coerceIn(0.0, 1.0 - height)
        return StoryMediaCrop.fromPayloadBounds(x, y, width, height)
    }

    private fun sized(width: Double, height: Double): Pair<Double, Double> {
        val shrink = min(1.0, min(1.0 / width, 1.0 / height))
        val grow = max(1.0, max(StoryMediaCrop.MINIMUM_SIDE / (width * shrink), StoryMediaCrop.MINIMUM_SIDE / (height * shrink)))
        return min(1.0, width * shrink * grow) to min(1.0, height * shrink * grow)
    }

    private fun finite(value: Double): Double = if (value.isFinite()) value else 0.0
}

/** Pivoter un média d'un quart de tour, dans le sens du glyphe — antihoraire, comme iOS `StoryMediaRotation`. */
object StoryMediaRotation {
    const val QUARTER_TURN_DEG: Float = -90f

    fun turned(degrees: Float): Float = normalized((if (degrees.isFinite()) degrees else 0f) + QUARTER_TURN_DEG)

    /** L'angle ramené dans [0, 360). */
    fun normalized(degrees: Float): Float {
        val rest = degrees % 360f
        return if (rest < 0f) rest + 360f else rest
    }
}
