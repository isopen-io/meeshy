package me.meeshy.sdk.model.sticker

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

/**
 * Le remplissage des emplacements d'un gabarit, et le GEL de la donnée — miroir de `StickerSlotFiller` (iOS). Aucune
 * fonction ne lit l'horloge : l'instant est REÇU (lu une fois, à l'ouverture de la feuille), si bien que tout lecteur
 * voit l'heure que l'auteur a composée et qu'une story archivée garde son sens. La locale est celle de l'auteur.
 */
object StickerSlotFiller {
    /** L'heure telle qu'elle s'affiche dans la locale de l'auteur (« 14:07 », « 2:07 PM »). */
    const val TIME: String = "time"
    /** L'heure en nombre (00–23) : les aiguilles d'un cadran lisent un angle, jamais une chaîne à ré-analyser. */
    const val HOUR: String = "hour"
    const val MINUTE: String = "minute"
    const val DATE: String = "date"
    /** Les mots de l'auteur : le seul emplacement de PROSE. */
    const val TEXT: String = "text"

    fun timeSlots(instant: Instant, zone: ZoneId, locale: Locale): Map<String, String> {
        val local = instant.atZone(zone)
        return mapOf(
            TIME to DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale).format(local),
            HOUR to "%02d".format(Locale.ROOT, local.hour),
            MINUTE to "%02d".format(Locale.ROOT, local.minute),
        )
    }

    fun dateSlots(instant: Instant, zone: ZoneId, locale: Locale): Map<String, String> =
        mapOf(DATE to DateTimeFormatter.ofLocalizedDate(FormatStyle.LONG).withLocale(locale).format(instant.atZone(zone)))

    /**
     * Les emplacements prêts à poser pour [template] : ses mots pour un cadre à prose (`null` sans mots — le cadre ne se
     * pose pas vide), l'heure ou la date figées à [instant] pour une décoration d'heure, chacune réduite à ce qu'elle LIT.
     */
    fun slotsFor(template: StickerTemplate, instant: Instant, zone: ZoneId, locale: Locale, typed: String): Map<String, String>? {
        if (template.takesProse) return typed.trim().takeIf { it.isNotEmpty() }?.let { mapOf(TEXT to it) }
        val read = template.slots.map { it.name }.toSet()
        return (timeSlots(instant, zone, locale) + dateSlots(instant, zone, locale)).filterKeys { it in read }
    }
}
