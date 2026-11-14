package me.meeshy.sdk.model

import kotlin.math.abs

/** De quel côté de l'écran la bulle vit : la mienne à droite, la leur à gauche. */
enum class EphemeralBurnSide {
    MINE,
    THEIRS,
    ;

    companion object {
        fun of(isMine: Boolean): EphemeralBurnSide = if (isMine) MINE else THEIRS
    }
}

/** Les trois temps que l'effet parcourt avec le même `progress` : la braise s'allume, le front traverse, les cendres. */
enum class EphemeralBurnPhase { IGNITION, SPREAD, ASHES }

/**
 * La combustion d'un éphémère (#17938, #18556) — miroir de `packages/shared/utils/ephemeral-burn.ts` et de
 * `EphemeralBurn` + `EphemeralBurnLaw` (`packages/MeeshySDK/.../Models/`). Ne peint rien : la durée que l'hôte et la vue
 * lisent au même endroit, le vent, le sens du front figé à l'allumage, les trois temps, et la fraîcheur d'une mort (une
 * mort plus vieille que la combustion part sans rejouer son feu).
 */
object EphemeralBurnLaw {
    const val FULL_MILLIS: Long = 1200L
    const val FADE_MILLIS: Long = 250L
    const val WIND_DEAD_ZONE: Double = 0.08
    const val DEFAULT_WIND: Double = 0.35
    const val IGNITION_END: Double = 0.15
    const val SPREAD_END: Double = 0.8
    const val FRESH_DEATH_WINDOW_MILLIS: Long = FULL_MILLIS - 100L

    private const val ROLL_WEIGHT = 4.0
    private const val LATERAL_WEIGHT = 2.0

    fun durationMillis(reduceMotion: Boolean): Long = if (reduceMotion) FADE_MILLIS else FULL_MILLIS

    /** Le vent brut, `+1` vers la droite, borné à ±1 ; `null` sans capteur ou sous la zone morte. */
    fun rawWind(rollTurns: Double?, lateralG: Double?): Double? {
        val roll = rollTurns?.takeIf { it.isFinite() }
        val lateral = lateralG?.takeIf { it.isFinite() }
        if (roll == null && lateral == null) return null
        val raw = (roll ?: 0.0) * ROLL_WEIGHT + (lateral ?: 0.0) * LATERAL_WEIGHT
        if (abs(raw) < WIND_DEAD_ZONE) return null
        return raw.coerceIn(-1.0, 1.0)
    }

    /** Le vent effectif : le geste quand il existe, sinon ±0,35 vers le bord extérieur de la bulle. Jamais nul. */
    fun wind(raw: Double?, side: EphemeralBurnSide): Double =
        raw ?: if (side == EphemeralBurnSide.MINE) DEFAULT_WIND else -DEFAULT_WIND

    /** `+1` : le feu part du bord gauche et avance vers la droite. */
    fun frontDirection(wind: Double): Int = if (wind >= 0.0) 1 else -1

    fun phaseOf(progress: Double): EphemeralBurnPhase = when {
        progress < IGNITION_END -> EphemeralBurnPhase.IGNITION
        progress < SPREAD_END -> EphemeralBurnPhase.SPREAD
        else -> EphemeralBurnPhase.ASHES
    }

    fun isFreshDeath(deathAtMillis: Long, nowMillis: Long): Boolean = nowMillis - deathAtMillis < FRESH_DEATH_WINDOW_MILLIS
}
