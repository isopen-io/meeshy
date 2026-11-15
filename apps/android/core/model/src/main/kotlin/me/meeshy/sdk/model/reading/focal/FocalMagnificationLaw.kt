package me.meeshy.sdk.model.reading.focal

import kotlin.math.abs

/**
 * La magnificence ne s'arme pas au premier pixel défilé : un pouce qui ripe ne pose ni carte ni
 * pastilles. Deux portes, l'une ou l'autre : la vitesse (un défilement franc) ou la durée (un
 * défilement lent mais soutenu). Une fois armée, elle le reste. Miroir de `FocalMagnificationLaw.swift`.
 *
 * Loi pure, sans horloge murale : la peau injecte l'instant.
 */
public object FocalMagnificationLaw {

    public const val SUSTAINED_SCROLL_MS: Double = 4_000.0
    public const val HIGH_VELOCITY_THRESHOLD: Double = 1_200.0

    /**
     * @param scrollStartedAt début du défilement en cours (ms), null au repos.
     * @param now instant de l'événement (ms).
     * @param velocity vitesse verticale en points par seconde, signe libre.
     */
    public fun isArmed(
        alreadyArmed: Boolean,
        scrollStartedAt: Double?,
        now: Double,
        velocity: Double,
        sustainedMs: Double = SUSTAINED_SCROLL_MS,
        velocityThreshold: Double = HIGH_VELOCITY_THRESHOLD,
    ): Boolean {
        if (alreadyArmed) return true
        if (abs(velocity) >= velocityThreshold) return true
        if (scrollStartedAt == null) return false
        return now - scrollStartedAt >= sustainedMs
    }
}
