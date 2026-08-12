package me.meeshy.app.calls

import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale
import me.meeshy.sdk.util.isoToEpochMillis

/**
 * Pure relative timestamp for a call-journal row — port of the iOS call-history
 * date formatting. Isolated from the Composable so every arm is JVM-tested.
 *
 * The gateway sends ISO-8601 [String]s ([CallRecord.startedAt]); this parses via
 * the SDK's single [isoToEpochMillis] source of truth and degrades an
 * absent/unparsable value to `""` (the row simply shows no time — never a crash).
 */
object CallTimeLabel {

    /**
     * A relative label for [startedAtIso] as of [nowMillis]:
     * same day → 24-hour time; the day before → [yesterday]; within the week →
     * the weekday name; beyond → the date (with the year only when it differs).
     */
    fun label(
        startedAtIso: String?,
        nowMillis: Long,
        zone: ZoneId,
        locale: Locale,
        yesterday: String,
    ): String {
        val millis = isoToEpochMillis(startedAtIso)
        if (millis <= 0L) return ""
        val target = Instant.ofEpochMilli(millis).atZone(zone)
        val current = Instant.ofEpochMilli(nowMillis).atZone(zone)
        val daysDiff = ChronoUnit.DAYS.between(target.toLocalDate(), current.toLocalDate())
        return when {
            daysDiff <= 0L -> timeOfDay(target)
            daysDiff == 1L -> yesterday
            daysDiff <= 6L -> weekday(target, locale)
            else -> date(target, locale, includeYear = target.year != current.year)
        }
    }

    private fun timeOfDay(dateTime: ZonedDateTime): String =
        TIME_FORMAT.format(dateTime)

    private fun weekday(dateTime: ZonedDateTime, locale: Locale): String =
        DateTimeFormatter.ofPattern("EEEE", locale).format(dateTime).firstLetterUppercased(locale)

    private fun date(dateTime: ZonedDateTime, locale: Locale, includeYear: Boolean): String =
        DateTimeFormatter.ofPattern(if (includeYear) "d MMM yyyy" else "d MMM", locale)
            .format(dateTime)
            .firstLetterUppercased(locale)

    private fun String.firstLetterUppercased(locale: Locale): String =
        replaceFirstChar { if (it.isLowerCase()) it.titlecase(locale) else it.toString() }

    private val TIME_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")
}
