package me.meeshy.sdk.model.reading.focal

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

/**
 * Horodatage du message EN FOCUS : « Aujourd'hui 12:45 », « Hier 18:45 », « Mardi 23:40 » dans la
 * semaine, puis « Sam. 3 oct. » avec l'année si elle diffère de l'année en cours. Jour ET heure,
 * toujours. La liste lit la même règle avec le joint « à » ([listLabel]).
 *
 * Règle pure : `now`, le fuseau et la locale sont injectés (le fuseau compte les jours ET nomme le
 * jour de semaine), et les mots « Aujourd'hui / Hier / Avant-hier » viennent des ressources localisées
 * de l'appelant. Miroir de `FocalFocusTimestamp.swift`.
 */
public object FocalFocusTimestamp {

    /** Au-delà de cette ancienneté (jours calendaires), la date abrégée remplace le nom du jour. */
    public const val WEEKDAY_WINDOW_DAYS: Int = 6

    public const val DEFAULT_ABBREVIATED_PATTERN: String = "EEE d MMM"
    public const val DEFAULT_ABBREVIATED_PATTERN_WITH_YEAR: String = "EEE d MMM y"

    public data class Words(
        val today: String,
        val yesterday: String,
        val dayBeforeYesterday: String,
    )

    public fun label(
        sentAt: Instant,
        timeString: String,
        now: Instant,
        zone: ZoneId,
        locale: Locale,
        words: Words,
        joiner: String = " ",
        dateJoiner: String = " · ",
        abbreviatedPattern: String = DEFAULT_ABBREVIATED_PATTERN,
        abbreviatedPatternWithYear: String = DEFAULT_ABBREVIATED_PATTERN_WITH_YEAR,
    ): String {
        val sentDay = sentAt.atZone(zone).toLocalDate()
        val today = now.atZone(zone).toLocalDate()
        val daysDiff = ChronoUnit.DAYS.between(sentDay, today)
        return when {
            daysDiff <= 0 -> "${words.today}$joiner$timeString"
            daysDiff == 1L -> "${words.yesterday}$joiner$timeString"
            daysDiff == 2L -> "${words.dayBeforeYesterday}$joiner$timeString"
            daysDiff <= WEEKDAY_WINDOW_DAYS -> {
                val weekday = DateTimeFormatter.ofPattern("EEEE", locale).format(sentDay)
                "${capitalized(weekday, locale)}$joiner$timeString"
            }
            else -> {
                val pattern = if (sentDay.year == today.year) abbreviatedPattern else abbreviatedPatternWithYear
                val date = DateTimeFormatter.ofPattern(pattern, locale).format(sentDay)
                "${capitalized(date, locale)}$dateJoiner$timeString"
            }
        }
    }

    /** Le joint « à » de la LISTE (« Aujourd'hui à 5:49 », « Mardi à 23:50 », « Sam. 3 oct. 2025 à 14:41 »). */
    public fun listLabel(
        sentAt: Instant,
        timeString: String,
        now: Instant,
        zone: ZoneId,
        locale: Locale,
        words: Words,
        atWord: String,
        abbreviatedPattern: String = DEFAULT_ABBREVIATED_PATTERN,
        abbreviatedPatternWithYear: String = DEFAULT_ABBREVIATED_PATTERN_WITH_YEAR,
    ): String = label(
        sentAt = sentAt,
        timeString = timeString,
        now = now,
        zone = zone,
        locale = locale,
        words = words,
        joiner = " $atWord ",
        dateJoiner = " $atWord ",
        abbreviatedPattern = abbreviatedPattern,
        abbreviatedPatternWithYear = abbreviatedPatternWithYear,
    )

    private fun capitalized(text: String, locale: Locale): String {
        if (text.isEmpty()) return text
        val first = text.substring(0, text.offsetByCodePoints(0, 1))
        return first.uppercase(locale) + text.substring(first.length)
    }
}
