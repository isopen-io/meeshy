package me.meeshy.sdk.model.reading.focal

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * Miroir Kotlin EXACT de `packages/shared/utils/focus-curve.ts` (loi GELÉE, « une forme, deux
 * jeux de constantes ») et de `FocalFocusCurve.swift`. `focusCurve` transforme une distance
 * verticale au focus en `(alpha, scale)` ; `electFocusRow` élit la rangée qui occupe la carte
 * de focus, avec une bande d'hystérésis qui empêche le gagnant de trembler.
 *
 * Fonctions pures. Le fil (Focal) et la liste (Lentille) consomment cette loi et ses
 * constantes, jamais l'inverse : aucune de ces valeurs ne se réécrit hors de ce fichier.
 */
public object FocalFocusCurve {

    public enum class Variant { THREAD, LIST }

    public data class Result(val alpha: Double, val scale: Double) {
        public companion object {
            public val IDENTITY: Result = Result(alpha = 1.0, scale = 1.0)
        }
    }

    public const val THREAD_MAX_DISTANCE: Double = 380.0
    public const val THREAD_SCALE_DECAY: Double = 0.40
    public const val THREAD_ALPHA_DECAY: Double = 0.82
    public const val THREAD_HORIZONTAL_PIVOT: Double = 0.16

    public const val LIST_MAX_DISTANCE: Double = 400.0
    public const val LIST_ALPHA_DECAY: Double = 0.45
    public const val LIST_SCALE_DECAY: Double = 0.10
    public const val LIST_BELOW_BAND_DISTANCE: Double = 160.0
    public const val LIST_BELOW_BAND_ALPHA_CAP: Double = 0.35

    public const val FOCUS_BAND_OFFSET: Double = 140.0
    public const val FOCUS_BAND_HALF_HEIGHT: Double = 45.0

    public const val THREAD_FOCUS_BAND_OFFSET: Double = 150.0
    public const val THREAD_FOCUS_BAND_HYSTERESIS: Double = 95.0

    private fun clampUnit(value: Double): Double = min(1.0, max(0.0, value))

    public fun focusCurve(distance: Double, variant: Variant): Result = when (variant) {
        Variant.THREAD -> {
            val f = clampUnit(distance / THREAD_MAX_DISTANCE)
            Result(alpha = 1 - THREAD_ALPHA_DECAY * f, scale = 1 - THREAD_SCALE_DECAY * f)
        }
        Variant.LIST -> {
            val f = clampUnit(distance / LIST_MAX_DISTANCE)
            val belowBandFade =
                if (distance < 0) -LIST_BELOW_BAND_ALPHA_CAP * clampUnit(-distance / LIST_BELOW_BAND_DISTANCE) else 0.0
            Result(
                alpha = clampUnit(1 - LIST_ALPHA_DECAY * f + belowBandFade),
                scale = 1 - LIST_SCALE_DECAY * f,
            )
        }
    }

    public data class RowCandidate(val id: String, val midY: Double)

    public fun electFocusRow(
        candidates: List<RowCandidate>,
        focusY: Double,
        currentId: String?,
        hysteresis: Double,
    ): String? {
        if (candidates.isEmpty()) return null
        val current = currentId?.let { id -> candidates.firstOrNull { it.id == id } }
        if (current != null && abs(current.midY - focusY) <= hysteresis) return current.id
        return candidates.reduce { best, candidate ->
            val bestDistance = abs(best.midY - focusY)
            val candidateDistance = abs(candidate.midY - focusY)
            when {
                candidateDistance < bestDistance -> candidate
                candidateDistance == bestDistance && candidate.id < best.id -> candidate
                else -> best
            }
        }.id
    }
}
