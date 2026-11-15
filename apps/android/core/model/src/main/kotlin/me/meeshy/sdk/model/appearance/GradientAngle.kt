package me.meeshy.sdk.model.appearance

import kotlin.math.cos
import kotlin.math.sin

/**
 * L'axe d'un dégradé d'angle CSS (0° = vers le haut, sens horaire), en fractions de la boîte (0..1) — MIROIR du
 * calcul de `AppearanceDesignView.gradientLayer` : l'axe passe par le centre, de longueur 1 dans sa direction.
 */
data class GradientAxis(
    val startX: Double,
    val startY: Double,
    val endX: Double,
    val endY: Double,
)

object GradientAngle {

    fun axis(degrees: Double): GradientAxis {
        val radians = Math.toRadians(degrees)
        val dx = sin(radians) / 2
        val dy = -cos(radians) / 2
        return GradientAxis(startX = 0.5 - dx, startY = 0.5 - dy, endX = 0.5 + dx, endY = 0.5 + dy)
    }
}
