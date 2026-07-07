package me.meeshy.app.notifications

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.time.format.FormatStyle
import java.util.Locale

/**
 * Compact, locale-aware label for a notification's ISO-8601 timestamp.
 *
 * The gateway sends `state.createdAt` as a raw instant (`2026-07-07T06:56:34.215Z`);
 * rendering it verbatim is jarring, so this mirrors the iOS notification timestamp by
 * formatting it in the viewer's zone and locale. Falls back to the raw string when the
 * value is not a parseable instant, so a malformed timestamp never blanks the row.
 */
fun notificationTimeLabel(
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
