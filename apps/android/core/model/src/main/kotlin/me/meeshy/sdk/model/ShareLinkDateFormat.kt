package me.meeshy.sdk.model

import java.time.Instant
import java.time.ZoneId
import java.time.chrono.IsoChronology
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

/**
 * Les dates de la fiche d'un lien, TOUJOURS grégoriennes : une échéance se compare à
 * un calendrier que l'utilisateur partage avec ses invités, et `ar_SA` rendrait sinon le
 * calendrier Umm al-Qura. Miroir de `ShareLinkDateFormat` (iOS).
 */
public object ShareLinkDateFormat {

    public fun day(epochMillis: Long, locale: Locale = Locale.getDefault(), zone: ZoneId = ZoneId.systemDefault()): String =
        format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM), epochMillis, locale, zone)

    public fun dayAndTime(epochMillis: Long, locale: Locale = Locale.getDefault(), zone: ZoneId = ZoneId.systemDefault()): String =
        format(DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT), epochMillis, locale, zone)

    private fun format(base: DateTimeFormatter, epochMillis: Long, locale: Locale, zone: ZoneId): String =
        base.withChronology(IsoChronology.INSTANCE).withLocale(locale).withZone(zone)
            .format(Instant.ofEpochMilli(epochMillis))
}
