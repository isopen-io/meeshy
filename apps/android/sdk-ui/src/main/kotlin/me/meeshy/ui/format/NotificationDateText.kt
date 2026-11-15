package me.meeshy.ui.format

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale
import me.meeshy.sdk.model.time.LastSeenFormat
import me.meeshy.sdk.model.time.LastSeenLabel
import me.meeshy.sdk.model.time.NotificationDateFormatter
import me.meeshy.sdk.model.time.NotificationDateLabel
import me.meeshy.ui.R

/** Le vocabulaire du sous-titre de notification (`notification.date.*`) : `ago` et `yesterdayAt` portent `%s`, minutes et heures `%d`. */
public data class NotificationDateStrings(
    val now: String,
    val minutes: String,
    val hours: String,
    val ago: String,
    val yesterdayAt: String,
)

/** Le vocabulaire de dernière connexion (`time.lastSeen.*`). */
public data class LastSeenStrings(
    val online: String,
    val seen: String,
    val yesterdayAt: String,
    val beforeYesterdayAt: String,
    val dateAt: String,
    val minutes: String,
    val hours: String,
    val ago: String,
)

private fun clock(epochMillis: Long, zone: ZoneId, locale: Locale): String =
    DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale).format(Instant.ofEpochMilli(epochMillis).atZone(zone))

private fun dateTime(epochMillis: Long, zone: ZoneId, locale: Locale): String =
    DateTimeFormatter.ofLocalizedDateTime(FormatStyle.SHORT).withLocale(locale).format(Instant.ofEpochMilli(epochMillis).atZone(zone))

private fun date(epochMillis: Long, zone: ZoneId, locale: Locale): String =
    DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale).format(Instant.ofEpochMilli(epochMillis).atZone(zone))

/** « à l'instant » / « il y a 6 min » / « il y a 3 h » / « hier 14:30 » / date et heure locales. */
public object NotificationDateText {
    public fun text(
        epochMillis: Long,
        referenceMillis: Long,
        zone: ZoneId,
        locale: Locale,
        strings: NotificationDateStrings,
    ): String = when (val label = NotificationDateFormatter.label(epochMillis, referenceMillis, zone)) {
        NotificationDateLabel.Now -> strings.now
        is NotificationDateLabel.MinutesAgo ->
            String.format(locale, strings.ago, String.format(locale, strings.minutes, label.value))
        is NotificationDateLabel.HoursAgo ->
            String.format(locale, strings.ago, String.format(locale, strings.hours, label.value))
        is NotificationDateLabel.YesterdayAt ->
            String.format(locale, strings.yesterdayAt, clock(label.epochMillis, zone, locale))
        is NotificationDateLabel.AbsoluteDateTime -> dateTime(label.epochMillis, zone, locale)
    }
}

/** « En ligne » sous une minute, « Vu il y a 5 min », puis l'heure exacte ajoutée au-delà de 24 h. */
public object LastSeenText {
    public fun text(
        epochMillis: Long,
        referenceMillis: Long,
        zone: ZoneId,
        locale: Locale,
        strings: LastSeenStrings,
    ): String = when (val label = LastSeenFormat.label(epochMillis, referenceMillis, zone)) {
        LastSeenLabel.Online -> strings.online
        is LastSeenLabel.MinutesAgo -> seen(strings, locale, String.format(locale, strings.minutes, label.value))
        is LastSeenLabel.HoursAgo -> seen(strings, locale, String.format(locale, strings.hours, label.value))
        is LastSeenLabel.YesterdayAt -> String.format(locale, strings.yesterdayAt, clock(label.epochMillis, zone, locale))
        is LastSeenLabel.BeforeYesterdayAt ->
            String.format(locale, strings.beforeYesterdayAt, clock(label.epochMillis, zone, locale))
        is LastSeenLabel.DateAt -> String.format(
            locale,
            strings.dateAt,
            date(label.epochMillis, zone, locale),
            clock(label.epochMillis, zone, locale),
        )
    }

    private fun seen(strings: LastSeenStrings, locale: Locale, relative: String): String =
        String.format(locale, strings.seen, String.format(locale, strings.ago, relative))
}

@Composable
public fun rememberNotificationDateStrings(): NotificationDateStrings = NotificationDateStrings(
    now = stringResource(R.string.notification_date_now),
    minutes = stringResource(R.string.notification_date_minutes),
    hours = stringResource(R.string.notification_date_hours),
    ago = stringResource(R.string.notification_date_ago),
    yesterdayAt = stringResource(R.string.notification_date_yesterdayAt),
)

@Composable
public fun rememberLastSeenStrings(): LastSeenStrings = LastSeenStrings(
    online = stringResource(R.string.time_lastSeen_online),
    seen = stringResource(R.string.time_lastSeen_seen),
    yesterdayAt = stringResource(R.string.time_lastSeen_yesterdayAt),
    beforeYesterdayAt = stringResource(R.string.time_lastSeen_beforeYesterdayAt),
    dateAt = stringResource(R.string.time_lastSeen_dateAt),
    minutes = stringResource(R.string.notification_date_minutes),
    hours = stringResource(R.string.notification_date_hours),
    ago = stringResource(R.string.notification_date_ago),
)
