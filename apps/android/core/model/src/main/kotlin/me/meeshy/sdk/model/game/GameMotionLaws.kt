package me.meeshy.sdk.model.game

import kotlin.math.max
import kotlin.math.min

/**
 * L'irisation du prisme suit l'inclinaison (miroir de `GameTilt.swift`) : le roulis en tours borné à
 * ±0,5, le capteur seulement visible et en mouvement.
 */
object GamePrismTilt {
    const val ACTIVE_INTENSITY: Double = 0.6
    const val SENSOR_HZ: Int = 30
    const val SENSOR_INTERVAL_MICROS: Int = 1_000_000 / SENSOR_HZ

    /** Le roulis (radians) ramené en tours, borné à ±0,5. */
    fun turns(fromRoll: Double): Double = min(0.5, max(-0.5, fromRoll / (2 * Math.PI)))

    fun intensity(active: Boolean): Double = if (active) ACTIVE_INTENSITY else 0.0

    /** Le capteur ne tourne que pour une irisation qui BOUGE à l'écran. */
    fun sensorRuns(active: Boolean, visible: Boolean, reduceMotion: Boolean): Boolean =
        active && visible && !reduceMotion
}

/** Le rebond unique du jeu (miroir de `GameMotion`) : une courbe, déclarée une fois. */
object GameBounceSpec {
    const val PRESS_SCALE: Float = 0.94f
    const val ENTRANCE_SCALE: Float = 0.6f
    const val REDUCED_PRESS_OPACITY: Float = 0.6f

    /** Ressort d'enfoncement : bref et amorti (response 0,18 s, amortissement 0,82). */
    const val PRESS_RESPONSE: Float = 0.18f
    const val PRESS_DAMPING: Float = 0.82f

    /** Ressort du relâché : sous-amorti, il DÉPASSE la taille de repos (0,36 s, 0,52). */
    const val RELEASE_RESPONSE: Float = 0.36f
    const val RELEASE_DAMPING: Float = 0.52f

    fun scale(pressed: Boolean, reduceMotion: Boolean): Float =
        if (pressed && !reduceMotion) PRESS_SCALE else 1f

    fun opacity(pressed: Boolean, reduceMotion: Boolean): Float =
        if (pressed && reduceMotion) REDUCED_PRESS_OPACITY else 1f
}

/** La durée effective d'une chorégraphie, ramenée au fondu sous mouvement réduit. */
object GameChoreographyLaw {
    fun effectiveDuration(duration: Double, reduceMotion: Boolean): Double =
        if (reduceMotion) GameTimeline.REDUCED_DURATION else duration

    /** Le temps écoulé lu par la vue : `null` tant que rien n'a été déclenché. */
    fun elapsed(startedAtMillis: Long?, nowMillis: Long, duration: Double, reduceMotion: Boolean): Double? {
        val started = startedAtMillis ?: return null
        val seconds = (nowMillis - started) / 1000.0
        return min(effectiveDuration(duration, reduceMotion), max(0.0, seconds))
    }

    /** Rien ne tourne au repos : l'horloge ne court que du déclenchement à la fin (+ marge). */
    fun isRunning(startedAtMillis: Long?, nowMillis: Long, duration: Double, reduceMotion: Boolean): Boolean {
        val started = startedAtMillis ?: return false
        return (nowMillis - started) / 1000.0 < effectiveDuration(duration, reduceMotion) + 0.05
    }
}

/** La visibilité d'une brique : un point de sa frame rencontre la fenêtre. */
object GameOnScreenLaw {
    fun isVisible(
        left: Float, top: Float, right: Float, bottom: Float,
        windowWidth: Float, windowHeight: Float,
    ): Boolean = right > 0f && bottom > 0f && left < windowWidth && top < windowHeight
}

/** Le facteur Dynamic Type des chiffres posés DANS un objet dessiné, borné à 1,3. */
object GameTypeScaleLaw {
    const val MAXIMUM: Float = 1.3f

    fun factor(fontScale: Float): Float = min(max(fontScale, 1f), MAXIMUM)
}
