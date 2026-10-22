package me.meeshy.sdk.model.media

import kotlin.math.floor

/**
 * Durée au format `m:ss` (minutes sans zéro de tête). `null` quand la durée est
 * négative, NaN ou infinie — la surface n'affiche alors rien plutôt qu'un faux « 0:00 ».
 */
public fun formatMediaDuration(seconds: Double?): String? {
    if (seconds == null || seconds.isNaN() || seconds.isInfinite() || seconds < 0) return null
    val total = floor(seconds).toLong()
    return "${total / 60}:${(total % 60).toString().padStart(2, '0')}"
}

public fun formatMediaDurationMillis(millis: Long?): String? =
    formatMediaDuration(millis?.let { it / 1000.0 })

/**
 * Version parlée pour TalkBack (« 1 minute 5 secondes », « 12 secondes »). Les unités
 * viennent de ressources pluralisées passées en [minutesLabel] / [secondsLabel] ; une
 * unité nulle est omise, sauf quand la durée entière est nulle.
 */
public fun spokenMediaDuration(
    totalSeconds: Double?,
    minutesLabel: (Int) -> String,
    secondsLabel: (Int) -> String,
): String? {
    if (totalSeconds == null || totalSeconds.isNaN() || totalSeconds.isInfinite() || totalSeconds < 0) return null
    val total = floor(totalSeconds).toLong()
    val m = (total / 60).toInt()
    val s = (total % 60).toInt()
    return when {
        m == 0 -> secondsLabel(s)
        s == 0 -> minutesLabel(m)
        else -> "${minutesLabel(m)} ${secondsLabel(s)}"
    }
}
