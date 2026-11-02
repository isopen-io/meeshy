package me.meeshy.app.calls

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale
import me.meeshy.sdk.model.call.CallRecord
import me.meeshy.sdk.util.isoToEpochMillis

/** One line of the call detail card; [value] is `null` for [Kind.TYPE] (localised by the sheet). */
data class CallDetailFact(val kind: Kind, val value: String?) {
    enum class Kind { TYPE, DATE, DURATION, DATA, PHONE }
}

/**
 * The facts the call detail sheet lists, in the iOS `CallDetailSheet.details` order:
 * type, date, then duration, data and number only when the record carries them.
 * Pure, so every arm is JVM-tested; an unparsable date simply drops its line.
 */
object CallDetailFacts {
    fun of(record: CallRecord, zone: ZoneId, locale: Locale): List<CallDetailFact> = listOfNotNull(
        CallDetailFact(CallDetailFact.Kind.TYPE, null),
        date(record.startedAt, zone, locale)?.let { CallDetailFact(CallDetailFact.Kind.DATE, it) },
        record.durationLabel.ifBlank { null }?.let { CallDetailFact(CallDetailFact.Kind.DURATION, it) },
        record.dataLabel?.let { CallDetailFact(CallDetailFact.Kind.DATA, it) },
        record.peer?.phoneNumber?.ifBlank { null }?.let { CallDetailFact(CallDetailFact.Kind.PHONE, it) },
    )

    private fun date(iso: String, zone: ZoneId, locale: Locale): String? {
        val millis = isoToEpochMillis(iso)
        if (millis <= 0L) return null
        return DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT)
            .withLocale(locale)
            .format(Instant.ofEpochMilli(millis).atZone(zone))
    }
}
