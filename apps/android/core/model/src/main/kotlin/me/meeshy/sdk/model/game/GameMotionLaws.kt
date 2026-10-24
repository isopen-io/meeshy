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

    /** Raideur d'un ressort Compose (masse 1) équivalente à la « response » d'un ressort SwiftUI. */
    fun stiffness(response: Float): Float {
        val omega = (2 * Math.PI / response).toFloat()
        return omega * omega
    }

    val pressStiffness: Float get() = stiffness(PRESS_RESPONSE)
    val releaseStiffness: Float get() = stiffness(RELEASE_RESPONSE)

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

/** Android n'a pas de réglage Meeshy : « réduire les animations » = échelle d'animation système à zéro. */
object GameReduceMotionLaw {
    fun fromAnimatorScale(scale: Float): Boolean = scale == 0f
}

/**
 * Les trois effets (reflet, onde, irisation) : AUCUN effet hors de leur temps, repli en dégradé sans
 * shader. Les nombres sont ceux des replis de `GameShaders.swift`.
 */
object GameEffectsLaw {
    /** Le temps pendant lequel un `progress` anime vraiment l'effet. */
    fun isActive(progress: Double): Boolean = progress > 0 && progress < 1

    fun clamp01(value: Double): Double = min(1.0, max(0.0, value))

    /** L'irisation figée sous mouvement réduit : une inclinaison de repos. */
    const val RESTING_TILT: Double = 0.25
    const val IRIDESCENCE_ALPHA: Double = 0.35

    fun effectiveTilt(tilt: Double, reduceMotion: Boolean): Double = if (reduceMotion) RESTING_TILT else tilt

    fun iridescenceAlpha(intensity: Double): Double = IRIDESCENCE_ALPHA * clamp01(intensity)

    /** L'opacité de la bande de reflet à l'instant [progress]. */
    fun sheenAlpha(progress: Double, intensity: Double): Double =
        if (!isActive(progress)) 0.0 else 0.8 * clamp01(intensity) * kotlin.math.sin(progress * Math.PI)

    /** Le décalage horizontal de la bande, en fraction de la largeur (de -0,5 à 1,1). */
    fun sheenOffsetFraction(progress: Double): Double = -0.5 + 1.6 * progress

    /** L'anneau d'onde : diamètre en fraction de la plus grande dimension, et opacité. */
    fun ringDiameterFraction(progress: Double): Double = 1.4 * progress

    fun ringAlpha(progress: Double): Double = if (!isActive(progress)) 0.0 else 0.6 * (1 - progress)
}
