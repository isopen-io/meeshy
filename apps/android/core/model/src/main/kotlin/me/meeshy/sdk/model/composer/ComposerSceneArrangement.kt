package me.meeshy.sdk.model.composer

/**
 * Où vont les contrôles du compositeur de story (#13837) : posés SUR la scène ([OVERLAY], le téléphone tenu droit), ou
 * rangés dans deux rails libellés de part et d'autre d'elle ([RAILS], grand écran, téléphone couché, pliable ouvert).
 *
 * La fenêtre décide, jamais le modèle d'appareil : en rails, la scène est le plus grand 9:16 qui tient en HAUTEUR, Publier
 * posé sous elle et les marges déduits ; s'il reste à côté d'elle la place de deux rails et de leurs marges, on les pose.
 * Une hystérésis empêche un redimensionnement en multi-fenêtre de faire clignoter la disposition autour du seuil.
 */
enum class ComposerSceneArrangement {
    OVERLAY,
    RAILS,
    ;

    companion object {
        const val RAIL_WIDTH = 112f
        const val MARGIN = 16f

        /** Publier sous la scène : une cible de 48 dp et l'écart qui la sépare de la scène. */
        const val PUBLISH_RESERVE = 56f
        const val HYSTERESIS = 16f
        const val THRESHOLD = 2 * RAIL_WIDTH + 2 * MARGIN

        private const val RATIO = 9f / 16f

        fun railsSceneHeight(windowHeightDp: Float): Float =
            (windowHeightDp - PUBLISH_RESERVE - 2 * MARGIN).coerceAtLeast(0f)

        fun freeWidth(windowWidthDp: Float, windowHeightDp: Float): Float =
            windowWidthDp - (railsSceneHeight(windowHeightDp) * RATIO).coerceAtMost(windowWidthDp)

        /** [previous] : la disposition en place, que l'hystérésis retient tant que la fenêtre ne passe pas franchement le seuil. */
        fun resolve(
            windowWidthDp: Float,
            windowHeightDp: Float,
            previous: ComposerSceneArrangement? = null,
        ): ComposerSceneArrangement {
            if (railsSceneHeight(windowHeightDp) <= 0f) return OVERLAY
            val threshold = if (previous == RAILS) THRESHOLD - HYSTERESIS else THRESHOLD
            return if (freeWidth(windowWidthDp, windowHeightDp) >= threshold) RAILS else OVERLAY
        }
    }
}
