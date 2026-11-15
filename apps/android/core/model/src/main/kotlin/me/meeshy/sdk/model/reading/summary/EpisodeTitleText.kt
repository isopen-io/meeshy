package me.meeshy.sdk.model.reading.summary

import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.time.format.TextStyle
import java.util.Locale

/**
 * Le titre déterministe d'un épisode, mis en mots : « Aujourd'hui · 12 messages »,
 * « Lun–Mar · 174 messages », « 3 sept. 2025 · 1 message ». Pur : les libellés relatifs (clés
 * `focal.summary.day.*`) et le pluriel viennent du catalogue de l'écran, injectés ; les jours de
 * semaine et les dates suivent la [Locale] du lecteur.
 */
object EpisodeTitleText {
    fun format(
        title: EpisodeTitle,
        locale: Locale,
        relative: (DayLabelKey) -> String,
        messages: (key: String, count: Int) -> String,
    ): String {
        val start = day(title.start, locale, relative)
        val days = title.end?.let { "$start–${day(it, locale, relative)}" } ?: start
        return "$days · ${messages(title.messagesKey, title.messageCount)}"
    }

    private fun day(label: DayLabel, locale: Locale, relative: (DayLabelKey) -> String): String = when (label) {
        is DayLabel.Relative -> relative(label.key)
        is DayLabel.Weekday -> label.day.getDisplayName(TextStyle.SHORT, locale)
        is DayLabel.FullDate -> {
            val style = if (label.includeYear) FormatStyle.MEDIUM else FormatStyle.SHORT
            val formatter = if (label.includeYear) {
                DateTimeFormatter.ofLocalizedDate(style)
            } else {
                DateTimeFormatter.ofPattern("d MMM")
            }
            label.date.format(formatter.withLocale(locale))
        }
    }
}
