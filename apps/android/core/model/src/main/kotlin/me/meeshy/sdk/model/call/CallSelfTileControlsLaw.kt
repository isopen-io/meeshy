package me.meeshy.sdk.model.call

import kotlin.math.max
import kotlin.math.min

data class CallTileRect(val xDp: Float, val yDp: Float, val widthDp: Float, val heightDp: Float)

/** Les deux rangées posées hors de ma vignette ; `null` pour une rangée sans bouton. */
data class CallSelfTileControlFrames(val effects: CallTileRect?, val camera: CallTileRect?)

/**
 * Où se posent les commandes de MA caméra AUTOUR de ma vignette (iOS `CallSelfTileControlsPlacement`) :
 * Effets · Écran au-dessus, Retourner · Caméra en dessous. Même repère « début → fin » que [CallSelfTileLaw].
 *
 * Une rangée vit dans [bounds] — l'écran moins les barres système, l'en-tête en haut et la pilule en bas. Chaque
 * rangée se centre sur la vignette, à [EDGE_GAP_DP] de son bord ; pour la hauteur, dans l'ordre :
 * 1. à SON côté ;
 * 2. sinon de l'AUTRE côté, au-delà de la rangée qui y vit déjà ;
 * 3. sinon à son côté, ramenée dans la zone : elle chevauche le bord de la vignette du strict nécessaire.
 * Au repos, la vignette laisse la place d'une rangée de chaque côté ([restingCenter]) : le cas 1 est la règle.
 */
object CallSelfTileControlsLaw {
    const val BUTTON_DP: Float = 44f
    const val SPACING_DP: Float = 4f
    const val EDGE_GAP_DP: Float = 6f
    const val ROW_GAP_DP: Float = 6f
    const val ROW_SPAN_DP: Float = BUTTON_DP + EDGE_GAP_DP

    private enum class Side { Above, Below }

    fun rowWidth(count: Int): Float =
        if (count <= 0) 0f else count * BUTTON_DP + (count - 1) * SPACING_DP

    fun bounds(container: CallTileSize, insets: CallSafeInsets): CallTileRect {
        val top = insets.topDp + CallSelfTileLaw.TOP_CLEARANCE_DP
        val bottom = container.heightDp - insets.bottomDp - CallSelfTileLaw.BOTTOM_CLEARANCE_DP
        val start = insets.startDp + EDGE_GAP_DP
        val end = container.widthDp - insets.endDp - EDGE_GAP_DP
        return CallTileRect(start, top, max(0f, end - start), max(0f, bottom - top))
    }

    fun restingCenter(center: CallTilePoint, tile: CallTileSize, bounds: CallTileRect): CallTilePoint {
        val lowest = bounds.yDp + ROW_SPAN_DP + tile.heightDp / 2
        val highest = bounds.yDp + bounds.heightDp - ROW_SPAN_DP - tile.heightDp / 2
        if (lowest > highest) return center
        return CallTilePoint(center.xDp, center.yDp.coerceIn(lowest, highest))
    }

    fun rows(
        center: CallTilePoint,
        tile: CallTileSize,
        bounds: CallTileRect,
        effectsCount: Int,
        cameraCount: Int,
    ): CallSelfTileControlFrames {
        val geometry = Geometry(center, tile, bounds)
        val effectsAtHome = effectsCount > 0 && geometry.fits(Side.Above, depth = 0)
        val cameraAtHome = cameraCount > 0 && geometry.fits(Side.Below, depth = 0)
        return CallSelfTileControlFrames(
            effects = geometry.row(effectsCount, Side.Above, effectsAtHome, depthAway = if (cameraAtHome) 1 else 0),
            camera = geometry.row(cameraCount, Side.Below, cameraAtHome, depthAway = if (effectsAtHome) 1 else 0),
        )
    }

    private class Geometry(val center: CallTilePoint, val tile: CallTileSize, val bounds: CallTileRect) {
        private val minY = bounds.yDp
        private val maxY = bounds.yDp + bounds.heightDp

        fun top(side: Side, depth: Int): Float {
            val distance = EDGE_GAP_DP + depth * (BUTTON_DP + ROW_GAP_DP)
            return when (side) {
                Side.Above -> center.yDp - tile.heightDp / 2 - distance - BUTTON_DP
                Side.Below -> center.yDp + tile.heightDp / 2 + distance
            }
        }

        fun fits(side: Side, depth: Int): Boolean {
            val y = top(side, depth)
            return y >= minY && y + BUTTON_DP <= maxY
        }

        fun row(count: Int, home: Side, isAtHome: Boolean, depthAway: Int): CallTileRect? {
            if (count <= 0) return null
            val width = rowWidth(count)
            val x = clamp(center.xDp - width / 2, bounds.xDp, bounds.xDp + bounds.widthDp - width)
            val away = if (home == Side.Above) Side.Below else Side.Above
            val y = when {
                isAtHome -> top(home, 0)
                fits(away, depthAway) -> top(away, depthAway)
                else -> clamp(top(home, 0), minY, maxY - BUTTON_DP)
            }
            return CallTileRect(x, y, width, BUTTON_DP)
        }
    }

    private fun clamp(value: Float, low: Float, high: Float): Float =
        if (low > high) (low + high) / 2 else min(max(value, low), high)
}
