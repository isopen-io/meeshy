package me.meeshy.sdk.model.reading.focal

import kotlin.math.abs

/**
 * Quand la carte et les détails du message élu se posent-ils ? Au-delà d'une vitesse de lecture,
 * ils attendent que le défilement ralentisse, puis se posent ENSEMBLE. La loi diffère, elle ne
 * retire rien. Miroir de `FocalFocusDetailsMotionLaw.swift`.
 */
public object FocalFocusDetailsMotionLaw {

    /** Vitesse (points par seconde, valeur absolue) au-delà de laquelle on parcourt sans lire. */
    public const val MAX_REVEAL_SPEED: Double = 700.0

    public fun revealsDetails(speed: Double, maxSpeed: Double = MAX_REVEAL_SPEED): Boolean = abs(speed) <= maxSpeed
}

/**
 * Vitesse de défilement tirée des offsets successifs : la seule mesure disponible pendant la
 * décélération. Deux échantillons à moins de [MINIMUM_INTERVAL_SECONDS] ne font pas une vitesse.
 */
public data class ScrollSpeedMeter(
    val speed: Double = 0.0,
    private val lastOffset: Double? = null,
    private val lastTimeSeconds: Double = 0.0,
) {
    public fun note(offset: Double, atSeconds: Double): ScrollSpeedMeter {
        val previous = lastOffset ?: return copy(lastOffset = offset, lastTimeSeconds = atSeconds)
        val interval = atSeconds - lastTimeSeconds
        val next = if (interval >= MINIMUM_INTERVAL_SECONDS) (offset - previous) / interval else speed
        return ScrollSpeedMeter(speed = next, lastOffset = offset, lastTimeSeconds = atSeconds)
    }

    public fun reset(): ScrollSpeedMeter = ScrollSpeedMeter()

    public companion object {
        public const val MINIMUM_INTERVAL_SECONDS: Double = 0.001
    }
}
