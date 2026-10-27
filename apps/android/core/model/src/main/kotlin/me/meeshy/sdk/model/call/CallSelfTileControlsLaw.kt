package me.meeshy.sdk.model.call

data class CallTileRect(val xDp: Float, val yDp: Float, val widthDp: Float, val heightDp: Float)

/**
 * Où se pose la rangée de commandes de MA caméra — les pastilles d'objectifs puis la bascule avant /
 * arrière — contre le cadre de ma vignette. Même repère « début → fin » que [CallSelfTileLaw].
 *
 * Elle se centre sur la vignette et se pose de son côté LIBRE : sous la vignette quand celle-ci est
 * dans la moitié haute de l'écran, au-dessus dans la moitié basse ; si le côté choisi ne tient pas
 * dans la zone sûre, l'autre ; sinon elle chevauche le bord du strict nécessaire. Jamais hors des
 * barres système.
 */
object CallSelfTileControlsLaw {
    const val BUTTON_DP: Float = 44f
    const val SPACING_DP: Float = 4f
    const val EDGE_GAP_DP: Float = 6f

    fun rowWidth(count: Int): Float =
        if (count <= 0) 0f else count * BUTTON_DP + (count - 1) * SPACING_DP

    fun frame(
        center: CallTilePoint,
        tile: CallTileSize,
        container: CallTileSize,
        insets: CallSafeInsets,
        count: Int,
    ): CallTileRect? {
        if (count <= 0) return null
        val width = rowWidth(count)
        val minX = insets.startDp + EDGE_GAP_DP
        val maxX = container.widthDp - insets.endDp - EDGE_GAP_DP - width
        val x = clamp(center.xDp - width / 2, minX, maxX)
        val minY = insets.topDp
        val maxY = container.heightDp - insets.bottomDp - BUTTON_DP
        val below = center.yDp + tile.heightDp / 2 + EDGE_GAP_DP
        val above = center.yDp - tile.heightDp / 2 - EDGE_GAP_DP - BUTTON_DP
        val preferBelow = center.yDp < container.heightDp / 2
        val order = if (preferBelow) listOf(below, above) else listOf(above, below)
        val y = order.firstOrNull { it in minY..maxY } ?: clamp(order.first(), minY, maxY)
        return CallTileRect(x, y, width, BUTTON_DP)
    }

    private fun clamp(value: Float, low: Float, high: Float): Float =
        if (low > high) (low + high) / 2 else value.coerceIn(low, high)
}
