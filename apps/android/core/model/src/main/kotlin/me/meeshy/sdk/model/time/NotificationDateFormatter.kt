package me.meeshy.sdk.model.time

import java.time.Instant
import java.time.ZoneId
import java.time.temporal.ChronoUnit

/** Un barreau du sous-titre de notification ; le texte est rendu côté UI (miroir iOS `NotificationDateFormatter`). */
public sealed interface NotificationDateLabel {
    /** Moins d'une minute, ou futur (horloge décalée) : « à l'instant ». */
    public data object Now : NotificationDateLabel
    public data class MinutesAgo(val value: Int) : NotificationDateLabel
    public data class HoursAgo(val value: Int) : NotificationDateLabel

    /** La veille calendaire : « hier 14:30 » ; l'heure se rend dans le fuseau et la locale du lecteur. */
    public data class YesterdayAt(val epochMillis: Long) : NotificationDateLabel

    /** Plus ancien : date et heure locales du lecteur. */
    public data class AbsoluteDateTime(val epochMillis: Long) : NotificationDateLabel
}

public object NotificationDateFormatter {
    public fun label(epochMillis: Long, referenceMillis: Long, zoneId: ZoneId): NotificationDateLabel {
        val seconds = (referenceMillis - epochMillis) / 1_000L
        if (seconds < RelativeTime.MINUTE_SECONDS) return NotificationDateLabel.Now
        if (seconds < RelativeTime.HOUR_SECONDS) {
            return NotificationDateLabel.MinutesAgo((seconds / RelativeTime.MINUTE_SECONDS).toInt())
        }
        val dayDelta = ChronoUnit.DAYS.between(
            Instant.ofEpochMilli(epochMillis).atZone(zoneId).toLocalDate(),
            Instant.ofEpochMilli(referenceMillis).atZone(zoneId).toLocalDate(),
        )
        return when {
            dayDelta <= 0L -> NotificationDateLabel.HoursAgo((seconds / RelativeTime.HOUR_SECONDS).toInt())
            dayDelta == 1L -> NotificationDateLabel.YesterdayAt(epochMillis)
            else -> NotificationDateLabel.AbsoluteDateTime(epochMillis)
        }
    }
}
