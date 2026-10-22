package me.meeshy.sdk.model

/**
 * Horloge « M:SS » à chiffres latins, minutes cumulées (« 61:35 »), jamais d'heures — miroir de
 * `DurationFormat` iOS. Une valeur non finie ou négative donne « 0:00 ». Pour les chiffres du
 * lecteur, voir `LocalizedNumber.duration`.
 */
public object DurationFormat {
    public fun wholeSeconds(seconds: Double): Int =
        if (!seconds.isFinite() || seconds <= 0.0) 0 else seconds.coerceAtMost(Int.MAX_VALUE.toDouble()).toInt()

    public fun clock(seconds: Double): String = clock(wholeSeconds = wholeSeconds(seconds))

    public fun clock(wholeSeconds: Int): String {
        val bounded = wholeSeconds.coerceAtLeast(0)
        return "${bounded / 60}:${(bounded % 60).toString().padStart(2, '0')}"
    }
}
