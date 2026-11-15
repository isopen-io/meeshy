package me.meeshy.sdk.model.auth

import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin

/** Comment la célébration d'arrivée bouge : le feu d'artifice, ou, sous animations réduites, un fondu sans particule. */
enum class ArrivalCelebrationMotion {
    FIREWORKS,
    FADE,
    ;

    val showsParticles: Boolean get() = this == FIREWORKS

    companion object {
        fun of(reduceMotion: Boolean): ArrivalCelebrationMotion = if (reduceMotion) FADE else FIREWORKS
    }
}

/**
 * Le feu d'artifice en loi PURE du temps (miroir de `ArrivalFireworks`, iOS `ArrivalCelebrationView.swift`) :
 * chaque étincelle se calcule depuis l'instant écoulé, le dessin ne garde aucun état et s'arrête de lui-même.
 */
object ArrivalFireworks {
    /** Une étincelle ; position en fraction de la surface (0…1 sur chaque axe), rayon en dp. */
    data class Spark(
        val x: Double,
        val y: Double,
        val radius: Double,
        val opacity: Double,
        val colorIndex: Int,
    )

    const val BURST_COUNT: Int = 5
    const val SPARKS_PER_BURST: Int = 16
    const val BURST_INTERVAL_SECONDS: Double = 0.32
    const val BURST_LIFE_SECONDS: Double = 1.3
    const val SHOW_DURATION_SECONDS: Double = (BURST_COUNT - 1) * BURST_INTERVAL_SECONDS + BURST_LIFE_SECONDS
    const val PALETTE_COUNT: Int = 5

    /** Le spectacle est fini : plus aucune étincelle ne sera dessinée, l'horloge d'image peut s'arrêter. */
    fun isOver(timeSeconds: Double): Boolean = timeSeconds >= SHOW_DURATION_SECONDS

    /** Les étincelles vivantes à [timeSeconds], plafonnées à [maxSparks]. */
    fun sparks(
        timeSeconds: Double,
        burstCount: Int = BURST_COUNT,
        sparksPerBurst: Int = SPARKS_PER_BURST,
        maxSparks: Int = BURST_COUNT * SPARKS_PER_BURST,
    ): List<Spark> =
        (0 until burstCount)
            .flatMap { burst ->
                val progress = (timeSeconds - burst * BURST_INTERVAL_SECONDS) / BURST_LIFE_SECONDS
                if (progress < 0.0 || progress >= 1.0) emptyList() else burstSparks(burst, progress, sparksPerBurst)
            }
            .take(maxSparks)

    private fun burstSparks(burst: Int, progress: Double, count: Int): List<Spark> {
        val centerX = 0.18 + 0.64 * noise(burst * 3.1 + 0.7)
        val centerY = 0.16 + 0.30 * noise(burst * 5.3 + 1.9)
        val eased = 1 - (1 - progress).pow(3)
        return (0 until count).map { index ->
            val angle = 2 * Math.PI * index / count + noise((burst * 31 + index).toDouble()) * 0.35
            val reach = 0.16 + 0.10 * noise(burst * 17 + index + 0.3)
            Spark(
                x = centerX + cos(angle) * reach * eased,
                y = centerY + sin(angle) * reach * eased * 0.75 + 0.10 * progress * progress,
                radius = 3.2 * (1 - progress * 0.55),
                opacity = max(0.0, min(1.0, 1 - progress)),
                colorIndex = (burst + index) % PALETTE_COUNT,
            )
        }
    }

    /** Pseudo-aléa DÉTERMINISTE dans 0…1 : la même graine rend la même fête. */
    private fun noise(seed: Double): Double {
        val value = sin(seed * 12.9898) * 43758.5453
        return value - floor(value)
    }
}
