package me.meeshy.ui.format

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.time.format.FormatStyle
import java.util.Locale
import me.meeshy.sdk.model.isoToEpochMillisOrNull

/**
 * Compact, locale-aware label for an ISO-8601 instant such as a post or notification
 * timestamp. The gateway sends raw instants (`2026-07-07T06:56:34.215Z`); rendering
 * them verbatim is jarring, so this formats them in the viewer's zone and locale.
 * Falls back to the raw value when it is not a parseable instant, so a malformed
 * timestamp never blanks the row.
 */
fun shortDateTimeLabel(
    iso: String,
    zone: ZoneId = ZoneId.systemDefault(),
    locale: Locale = Locale.getDefault(),
): String = try {
    Instant.parse(iso)
        .atZone(zone)
        .format(DateTimeFormatter.ofLocalizedDateTime(FormatStyle.SHORT).withLocale(locale))
} catch (e: DateTimeParseException) {
    iso
}

private val BUBBLE_CLOCK: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm", Locale.ROOT)

/**
 * The clock a chat bubble shows next to its delivery check — `HH:mm` in the viewer's zone,
 * exactly like iOS `TimeStringCache` (`dateFormat = "HH:mm"`). An unreadable or missing
 * instant yields `null`: the footer then shows no clock rather than a raw wire string.
 */
fun bubbleClockLabel(
    iso: String?,
    zone: ZoneId = ZoneId.systemDefault(),
): String? = isoToEpochMillisOrNull(iso)
    ?.let { Instant.ofEpochMilli(it).atZone(zone).format(BUBBLE_CLOCK) }
