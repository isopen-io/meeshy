package me.meeshy.sdk.model.call.camera

import kotlin.math.abs

/**
 * L'élément ajustable du zoom (iOS `accessibilityAdjustableAction`) : TalkBack ne parle qu'en
 * valeurs d'un curseur, on projette donc les crans de [CameraZoomProfile.stops] sur des indices et
 * l'on relit le sens demandé par l'écart entre l'indice courant et l'indice proposé.
 */
object CameraZoomAdjust {
    /** Le cran le plus proche du facteur affiché [display]. */
    fun currentIndex(profile: CameraZoomProfile, display: Float): Int =
        profile.stops.indices.minByOrNull { abs(profile.stops[it] - display) } ?: 0

    /** Le sens d'un réglage vers [requested] depuis [current] ; `null` quand rien ne change. */
    fun step(current: Int, requested: Float): CameraZoomStep? {
        return when {
            requested > current -> CameraZoomStep.Increment
            requested < current -> CameraZoomStep.Decrement
            else -> null
        }
    }
}
