package me.meeshy.app.calls

import android.content.res.Resources
import java.text.NumberFormat
import java.util.Locale

/**
 * Ce que TalkBack ENTEND de la durée d'un appel — « 2 minutes 5 secondes » —
 * au lieu de « 02:05 » que le synthétiseur lit comme une heure (iOS
 * `CallManager.spokenDuration`). La découpe est pure ([parts]) ; le rendu
 * s'appuie sur les `plurals` du module, donc sur les règles de chaque langue.
 */
object CallSpokenDuration {

    enum class Unit { HOURS, MINUTES, SECONDS }

    data class Part(val unit: Unit, val count: Int)

    /** Les unités non nulles, de la plus grande à la plus petite ; `0 seconde` si tout est nul. */
    fun parts(seconds: Long): List<Part> {
        val total = if (seconds < 0) 0L else seconds
        val result = listOf(
            Part(Unit.HOURS, (total / 3600).toInt()),
            Part(Unit.MINUTES, ((total % 3600) / 60).toInt()),
            Part(Unit.SECONDS, (total % 60).toInt()),
        ).filter { it.count > 0 }
        return result.ifEmpty { listOf(Part(Unit.SECONDS, 0)) }
    }

    fun spoken(resources: Resources, seconds: Long): String =
        parts(seconds).joinToString(" ") { part ->
            val plural = when (part.unit) {
                Unit.HOURS -> R.plurals.call_spoken_hours
                Unit.MINUTES -> R.plurals.call_spoken_minutes
                Unit.SECONDS -> R.plurals.call_spoken_seconds
            }
            resources.getQuantityString(plural, part.count, part.count)
        }

    /** Les chiffres ASCII de [text] rendus dans ceux de [locale] (arabe, etc.). */
    fun localizeDigits(text: String, locale: Locale): String {
        val format = NumberFormat.getIntegerInstance(locale).apply { isGroupingUsed = false }
        return buildString(text.length) {
            text.forEach { c -> append(if (c in '0'..'9') format.format((c - '0').toLong()) else c.toString()) }
        }
    }
}
