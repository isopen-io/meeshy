package me.meeshy.sdk.model.conversationlist

/**
 * Loi de vitesse du défilement automatique pendant le glissement d'une conversation (iOS
 * `ChipAutoScroll`) : le doigt qui stationne dans une zone de bord fait défiler la liste, ce qui
 * rend atteignables les en-têtes hors écran. Rampe linéaire (bord = pleine vitesse, sortie de zone
 * = 0). Les grandeurs se donnent en dp ; [density] les convertit en pixels, comme la position du doigt.
 */
object DragAutoScroll {

    const val ZONE_DP = 130f
    const val MAX_SPEED_DP_PER_SECOND = 900f

    /** Plus long pas crédité à une image : après un hoquet de l'horloge la liste ne saute pas. */
    const val MAX_STEP_MILLIS = 50L

    /** Vitesse signée en px/s : négative vers le haut, positive vers le bas, 0 hors des zones de bord. */
    fun speed(fingerY: Float, viewportMinY: Float, viewportMaxY: Float, density: Float = 1f): Float {
        val zone = ZONE_DP * density
        val top = (viewportMinY + zone - fingerY) / zone
        if (top > 0f) return -minOf(1f, top) * MAX_SPEED_DP_PER_SECOND * density
        val bottom = (fingerY - (viewportMaxY - zone)) / zone
        if (bottom > 0f) return minOf(1f, bottom) * MAX_SPEED_DP_PER_SECOND * density
        return 0f
    }

    /** Déplacement en px pour [elapsedMillis] à [speed] px/s ; le pas suit le temps réel, borné. */
    fun displacement(speed: Float, elapsedMillis: Long): Float =
        speed * (elapsedMillis.coerceIn(0L, MAX_STEP_MILLIS) / 1000f)

    fun shouldRun(speed: Float): Boolean = speed != 0f
}
