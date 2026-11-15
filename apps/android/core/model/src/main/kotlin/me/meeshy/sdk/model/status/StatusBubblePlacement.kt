package me.meeshy.sdk.model.status

/** Le coin haut-gauche de la bulle d'humeur, en pixels du repère de la fenêtre. */
data class StatusBubbleOrigin(val x: Int, val y: Int)

/**
 * Où se pose la bulle d'humeur (iOS `StatusBubbleOverlay`) : centrée sur le point touché du badge, juste
 * dessous, ou au-dessus quand le bas de la fenêtre n'a pas la place ; toujours entière dans la fenêtre.
 */
object StatusBubblePlacement {
    @Suppress("LongParameterList")
    fun place(
        anchorX: Int,
        anchorY: Int,
        bubbleWidth: Int,
        bubbleHeight: Int,
        windowWidth: Int,
        windowHeight: Int,
        margin: Int,
        gap: Int,
    ): StatusBubbleOrigin {
        val maxX = (windowWidth - bubbleWidth - margin).coerceAtLeast(margin)
        val x = (anchorX - bubbleWidth / 2).coerceIn(margin, maxX)
        val below = anchorY + gap
        val fitsBelow = below + bubbleHeight <= windowHeight - margin
        val preferred = if (fitsBelow) below else anchorY - gap - bubbleHeight
        val maxY = (windowHeight - bubbleHeight - margin).coerceAtLeast(margin)
        return StatusBubbleOrigin(x = x, y = preferred.coerceIn(margin, maxY))
    }
}
