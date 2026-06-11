package me.meeshy.ui.component.bubble

import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

/** Local short time ("14:32") of an ISO timestamp, or null when unparseable. */
public fun formatBubbleTime(createdAtIso: String?, zone: ZoneId, locale: Locale): String? {
    if (createdAtIso.isNullOrBlank()) return null
    val instant = runCatching { Instant.parse(createdAtIso) }
        .recoverCatching { OffsetDateTime.parse(createdAtIso).toInstant() }
        .getOrNull() ?: return null
    return DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT)
        .withLocale(locale)
        .format(instant.atZone(zone))
}
