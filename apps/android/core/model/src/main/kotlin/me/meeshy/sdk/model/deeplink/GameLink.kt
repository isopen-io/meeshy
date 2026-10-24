package me.meeshy.sdk.model.deeplink

/**
 * A season or league-week link of the Game: `/me/progression/saison/{n}`,
 * `/me/progression/ligue/{monday}`. Mirror of iOS `GameLink` / `GameLinkParser`
 * and of `packages/shared/utils/game/game-links.ts`. A bare or invalid parameter
 * opens the current season / week (null), never a browser or an empty screen.
 */
sealed interface GameLink {
    data class Season(val number: Int?) : GameLink
    data class LeagueWeek(val key: String?) : GameLink
}

object GameLinkParser {

    const val MAX_SEASON: Int = 9999

    private val seasonPattern = Regex("^[1-9][0-9]{0,3}$")
    private val dayPattern = Regex("^([0-9]{4})-([0-9]{2})-([0-9]{2})$")

    /** The Game link of address segments (`["me","progression","saison","3"]`), null outside the Game. */
    fun link(components: List<String>): GameLink? {
        if (components.size < 3 || components[0] != "me" || components[1] != "progression") return null
        val param = if (components.size == 4) components[3] else null
        return when (components[2]) {
            "saison" -> GameLink.Season(param?.let(::seasonNumber))
            "ligue" -> GameLink.LeagueWeek(param?.takeIf(::isLeagueWeekKey))
            else -> null
        }
    }

    /** 1 to 9999, no sign, decimal or leading zero. */
    fun seasonNumber(raw: String): Int? {
        if (!seasonPattern.matches(raw)) return null
        return raw.toIntOrNull()?.takeIf { it <= MAX_SEASON }
    }

    /** A real `YYYY-MM-DD` day that is a Monday (UTC). */
    fun isLeagueWeekKey(raw: String): Boolean {
        val match = dayPattern.matchEntire(raw) ?: return false
        val (year, month, day) = match.destructured
        val date = runCatching { java.time.LocalDate.of(year.toInt(), month.toInt(), day.toInt()) }.getOrNull()
            ?: return false
        return date.dayOfWeek == java.time.DayOfWeek.MONDAY
    }
}
