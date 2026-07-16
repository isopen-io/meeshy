package me.meeshy.sdk.model

/**
 * Pure countdown breakdown for a live-location share — port of the `formattedRemaining`
 * logic in iOS `LiveLocationBadge.swift`. iOS bakes the localised word ("restantes")
 * into the string; the Android core returns only the numeric shape ([clockLabel]) plus a
 * structured [Remaining.Tier], leaving the "… remaining" wording to a localised resource
 * app-side (EN/FR/ES/PT). The Compose badge re-derives this each second off the clock.
 */
object LiveLocationCountdown {

    /** Which magnitude band the remaining time falls in — drives the label shape. */
    enum class Tier {
        /** One hour or more left — `"Xh0M"` (`"1h05"`). */
        HOURS,

        /** Under an hour, at least a minute left — `"XminYY"` (`"5min03"`). */
        MINUTES,

        /** Under a minute left — `"Xs"` (`"42s"`). */
        SECONDS,
    }

    /**
     * The remaining time split into whole [hours]/[minutes]/[seconds] plus the display
     * [tier] and the iOS-shaped numeric [clockLabel].
     */
    data class Remaining(
        val hours: Int,
        val minutes: Int,
        val seconds: Int,
        val tier: Tier,
    ) {
        /** The numeric portion of the iOS badge label, without the localised suffix. */
        val clockLabel: String
            get() = when (tier) {
                Tier.HOURS -> "%dh%02d".format(hours, minutes)
                Tier.MINUTES -> "%dmin%02d".format(minutes, seconds)
                Tier.SECONDS -> "%ds".format(seconds)
            }
    }

    /**
     * Reduces a remaining-millis reading into a [Remaining] breakdown. Mirrors iOS
     * `formattedRemaining`, which floors to whole seconds (`Int(remainingTime)`) before
     * splitting: the hour band appears at >= 60 total minutes, the minute band at >= 60
     * total seconds, the second band otherwise. A negative reading (clock skew past the
     * deadline) clamps to zero, so the badge never shows a negative countdown.
     */
    fun of(remainingMillis: Long): Remaining {
        val totalSeconds = (remainingMillis.coerceAtLeast(0L) / 1_000L).toInt()
        val hours = totalSeconds / 3_600
        val minutes = (totalSeconds % 3_600) / 60
        val seconds = totalSeconds % 60
        val tier = when {
            totalSeconds >= 3_600 -> Tier.HOURS
            totalSeconds >= 60 -> Tier.MINUTES
            else -> Tier.SECONDS
        }
        return Remaining(hours = hours, minutes = minutes, seconds = seconds, tier = tier)
    }
}
