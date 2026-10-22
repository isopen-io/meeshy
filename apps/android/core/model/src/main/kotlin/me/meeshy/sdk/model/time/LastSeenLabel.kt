package me.meeshy.sdk.model.time

import java.time.Instant
import java.time.ZoneId
import java.time.temporal.ChronoUnit

/** Le libellé de dernière connexion ; l'heure `HH:mm` se rend côté UI (miroir iOS `lastSeenString`). */
public sealed interface LastSeenLabel {
    /** Moins d'une minute : « En ligne ». */
    public data object Online : LastSeenLabel
    public data class MinutesAgo(val value: Int) : LastSeenLabel
    public data class HoursAgo(val value: Int) : LastSeenLabel

    /** Hier, avec l'heure exacte. */
    public data class YesterdayAt(val epochMillis: Long) : LastSeenLabel

    /** Avant-hier, avec l'heure exacte. */
    public data class BeforeYesterdayAt(val epochMillis: Long) : LastSeenLabel

    /** Au-delà : date absolue ET heure exacte. */
    public data class DateAt(val epochMillis: Long) : LastSeenLabel
}

public object LastSeenFormat {
    public fun label(epochMillis: Long, referenceMillis: Long, zoneId: ZoneId): LastSeenLabel {
        val seconds = (referenceMillis - epochMillis) / 1_000L
        if (seconds < RelativeTime.MINUTE_SECONDS) return LastSeenLabel.Online
        if (seconds < RelativeTime.HOUR_SECONDS) {
            return LastSeenLabel.MinutesAgo((seconds / RelativeTime.MINUTE_SECONDS).toInt())
        }
        val dayDelta = ChronoUnit.DAYS.between(
            Instant.ofEpochMilli(epochMillis).atZone(zoneId).toLocalDate(),
            Instant.ofEpochMilli(referenceMillis).atZone(zoneId).toLocalDate(),
        )
        return when {
            dayDelta <= 0L -> LastSeenLabel.HoursAgo((seconds / RelativeTime.HOUR_SECONDS).toInt())
            dayDelta == 1L -> LastSeenLabel.YesterdayAt(epochMillis)
            dayDelta == 2L -> LastSeenLabel.BeforeYesterdayAt(epochMillis)
            else -> LastSeenLabel.DateAt(epochMillis)
        }
    }
}
