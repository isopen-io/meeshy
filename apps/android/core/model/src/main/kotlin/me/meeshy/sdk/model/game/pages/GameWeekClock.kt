package me.meeshy.sdk.model.game.pages

import java.time.LocalDate
import java.time.LocalDateTime
import me.meeshy.sdk.model.game.LeagueCloses

/** Le temps qui reste, CALME : des jours et des heures, puis des heures, puis des minutes — jamais de secondes. */
public sealed interface GameDuration {
    public data class DaysHours(val days: Int, val hours: Int) : GameDuration
    public data class Hours(val hours: Int) : GameDuration
    public data class Minutes(val minutes: Int) : GameDuration
}

/**
 * Le temps avant la fermeture de la semaine (le dimanche à 20 h, heure LOCALE) — iOS `GameWave2Format.remaining`.
 * Arrondi à la minute supérieure, jamais sous une minute : une semaine qui se ferme « dans 0 min » n'existe pas.
 */
public object GameWeekClock {
    private const val MINUTES_PER_DAY = 24 * 60
    private const val MINUTES_PER_HOUR = 60

    public fun remaining(closes: LeagueCloses, now: LocalDateTime): GameDuration? {
        val day = runCatching { LocalDate.parse(closes.dayKey) }.getOrNull() ?: return null
        val target = day.atStartOfDay().plusMinutes(closes.minuteOfDay.toLong())
        val seconds = java.time.Duration.between(now, target).seconds
        val minutes = maxOf(1, Math.floorDiv(seconds + SECONDS_ROUND, SECONDS_PER_MINUTE).toInt())
        val days = minutes / MINUTES_PER_DAY
        val hours = (minutes % MINUTES_PER_DAY) / MINUTES_PER_HOUR
        return when {
            days >= 1 -> GameDuration.DaysHours(days, hours)
            hours >= 1 -> GameDuration.Hours(minutes / MINUTES_PER_HOUR)
            else -> GameDuration.Minutes(minutes)
        }
    }

    private const val SECONDS_PER_MINUTE = 60L
    private const val SECONDS_ROUND = 59L
}
