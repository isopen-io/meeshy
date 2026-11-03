package me.meeshy.sdk.model.scene

import me.meeshy.sdk.model.StoryLocationObject

/** Un cadre dans l'espace du canevas, en pixels (rotation ignorée : boîte englobante de la cible). */
public data class SceneTapFrame(val left: Double, val top: Double, val width: Double, val height: Double) {
    public val centerX: Double get() = left + width / 2
    public val centerY: Double get() = top + height / 2
}

/**
 * Le cadre tapable d'une pastille de lieu (miroir de `StoryLocationLayer.badgeFrame` + cible minimale du
 * `StoryLocationReaderTapOverlay`, iOS) : il tombe EXACTEMENT sur le badge, car il partage sa mesure
 * ([SceneLocationPillMetrics]) ; un badge plus petit que [minimumSide] garde une cible de cette taille, centrée sur lui.
 */
public object StoryLocationTapFrame {

    public fun of(
        location: StoryLocationObject,
        canvasWidth: Double,
        canvasHeight: Double,
        textWidth: Double,
        textHeight: Double,
        minimumSide: Double,
    ): SceneTapFrame {
        val measures = SceneLocationPillMetrics.measures(canvasWidth, location.scale)
        val size = SceneLocationPillMetrics.pillSize(measures, textWidth, textHeight, canvasWidth)
        return ofSize(location, canvasWidth, canvasHeight, size.width, size.height, minimumSide)
    }

    /** Le cadre d'un badge dont la taille est déjà connue (un gabarit du registre, mesuré par son dessinateur). */
    public fun ofSize(
        location: StoryLocationObject,
        canvasWidth: Double,
        canvasHeight: Double,
        badgeWidth: Double,
        badgeHeight: Double,
        minimumSide: Double,
    ): SceneTapFrame {
        val size = SceneLocationPillMetrics.PillSize(badgeWidth, badgeHeight)
        val centerX = location.x * canvasWidth
        val centerY = location.y * canvasHeight
        val badgeCenterX = centerX - size.width * location.anchor.x + size.width / 2
        val badgeCenterY = centerY - size.height * location.anchor.y + size.height / 2
        val width = maxOf(size.width, minimumSide)
        val height = maxOf(size.height, minimumSide)
        return SceneTapFrame(badgeCenterX - width / 2, badgeCenterY - height / 2, width, height)
    }
}
