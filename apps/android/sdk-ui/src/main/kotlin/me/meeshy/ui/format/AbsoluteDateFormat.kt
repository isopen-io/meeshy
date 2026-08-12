package me.meeshy.ui.format

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * The absolute-date rung shared by every relative-time formatter (`short`, `long`) so the two
 * can never drift on how an "older than three months" instant reads. The year is shown only when
 * it differs from the reference year (matching iOS `CallTimeLabel`); the first letter is
 * uppercased so the month reads as a proper label at the start of a line.
 */
internal fun formatAbsoluteDate(
    epochMillis: Long,
    referenceMillis: Long,
    zone: ZoneId,
    locale: Locale,
): String {
    val target = Instant.ofEpochMilli(epochMillis).atZone(zone)
    val reference = Instant.ofEpochMilli(referenceMillis).atZone(zone)
    val pattern = if (target.year != reference.year) "d MMM yyyy" else "d MMM"
    return DateTimeFormatter.ofPattern(pattern, locale)
        .format(target)
        .replaceFirstChar { if (it.isLowerCase()) it.titlecase(locale) else it.toString() }
}
