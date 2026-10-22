package me.meeshy.sdk.model.composer

import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * D'où à où un objet apparaît (miroir de `ComposerObjectTiming` iOS). La fenêtre se
 * manipule en début/fin et se range en début + durée ; `end == null` = permanent.
 */
data class ComposerObjectTiming(val start: Double, val end: Double?) {

    val isPermanent: Boolean get() = end == null

    /** Un objet permanent posé à zéro range DEUX null, jamais 0 + null. */
    val storedStartTime: Double? get() = if (end != null || start > 0) start else null

    /** `null` PRÉSERVÉ : allonger la slide ne raccourcit pas un objet permanent. */
    val storedDuration: Double? get() = end?.let { max(MINIMUM_WINDOW, it - start) }

    val madePermanent: ComposerObjectTiming get() = ComposerObjectTiming(start, null)

    fun moved(to: Double, slideDuration: Double): ComposerObjectTiming {
        val length = end?.let { it - start }
        val upper = max(0.0, slideDuration - (length ?: 0.0))
        val newStart = min(max(0.0, to), upper)
        return ComposerObjectTiming(newStart, length?.let { newStart + it })
    }

    fun trimmingStart(to: Double): ComposerObjectTiming {
        val e = end ?: return ComposerObjectTiming(max(0.0, to), null)
        return ComposerObjectTiming(min(max(0.0, to), e - MINIMUM_WINDOW), e)
    }

    fun trimmingEnd(to: Double, slideDuration: Double): ComposerObjectTiming {
        val floor = start + MINIMUM_WINDOW
        return ComposerObjectTiming(start, min(max(to, floor), max(slideDuration, floor)))
    }

    /** Les deux bornes de « De X s à Y s » ; `end == null` rend `endText == null` (« à la fin »). */
    fun windowParts(decimalSeparator: Char = ','): WindowParts =
        WindowParts(formatSeconds(start, decimalSeparator), end?.let { formatSeconds(it, decimalSeparator) })

    data class WindowParts(val startText: String, val endText: String?)

    companion object {
        const val MINIMUM_WINDOW: Double = 0.3

        fun of(start: Double?, duration: Double?): ComposerObjectTiming {
            val s = max(0.0, start ?: 0.0)
            if (duration == null || duration <= 0) return ComposerObjectTiming(s, null)
            return ComposerObjectTiming(s, s + duration)
        }

        /** « 1,2 » ; l'entier perd sa décimale nulle (« 6 »). Le « s » vient de la ressource. */
        fun formatSeconds(value: Double, decimalSeparator: Char = ','): String {
            val tenths = (value * 10).roundToInt()
            val whole = tenths / 10
            val frac = tenths % 10
            return if (frac == 0) "$whole" else "$whole$decimalSeparator$frac"
        }
    }
}
