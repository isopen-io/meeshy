package me.meeshy.sdk.model.game.pages

import me.meeshy.sdk.model.game.GameDay
import me.meeshy.sdk.model.game.GameTrophiesBlock
import me.meeshy.sdk.model.game.LeagueCup
import me.meeshy.sdk.model.game.LeagueKey

/** La période d'une coupe de ligue : une semaine (son lundi) ou un mois (`AAAA-MM`). */
public sealed interface TrophyPeriod {
    public data class Week(val weekKey: String) : TrophyPeriod
    public data class Month(val month: String) : TrophyPeriod
}

/** Ce qu'une clé de trophée désigne (iOS `TrophySpec`). Une clé inconnue ne se nomme pas. */
public sealed interface TrophySpec {
    public data class LeagueCupOf(val period: TrophyPeriod, val league: LeagueKey, val cup: LeagueCup) : TrophySpec
    public data class SeasonCup(val season: Int) : TrophySpec
    public data class Prestige(val number: Int) : TrophySpec
    public data class Flame(val days: Int) : TrophySpec
}

/**
 * Les trophées de la vitrine (iOS `GameTrophies.parse`, `GameShowcaseRules.shelfOrder`) : la clé rend son trophée,
 * l'étagère se parcourt dans l'ordre que le serveur a calculé. Un trophée ne rapporte JAMAIS de points ni de Gloire.
 */
public object GameTrophyShelf {

    private const val MAX_PRESTIGE = 5
    private val flameDays = listOf(100, 365)

    public fun parse(key: String): TrophySpec? {
        val parts = key.split('.')
        if (parts.firstOrNull() != "trophy" || parts.size < 2) return null
        if (parts[1] == "league-cup" && parts.size == 5) return leagueCup(parts)
        val number = parts.getOrNull(2)?.takeIf { parts.size == 3 }?.let(::positiveInt) ?: return null
        return when (parts[1]) {
            "season-cup" -> TrophySpec.SeasonCup(number)
            "prestige" -> number.takeIf { it <= MAX_PRESTIGE }?.let(TrophySpec::Prestige)
            "flame" -> number.takeIf { it in flameDays }?.let(TrophySpec::Flame)
            else -> null
        }
    }

    /** L'étagère : les clés rangées qui existent, puis tout ce que l'ordre ne cite pas, dans l'ordre servi. */
    public fun shelfOrder(trophies: GameTrophiesBlock): List<String> {
        val owned = trophies.items.map { it.key }.toSet()
        val ordered = trophies.order.filter { it in owned }.distinct()
        val rest = trophies.items.map { it.key }.filterNot { it in ordered }
        return (ordered + rest).distinct()
    }

    /** L'étagère montrée : l'ordre servi, sans les clés d'une version plus récente que ce client. */
    public fun shown(trophies: GameTrophiesBlock): List<String> = shelfOrder(trophies).filter { parse(it) != null }

    private fun leagueCup(parts: List<String>): TrophySpec? {
        val league = LeagueKey.entries.firstOrNull { it.name.lowercase() == parts[3] } ?: return null
        val cup = LeagueCup.entries.firstOrNull { it.name.lowercase() == parts[4] } ?: return null
        val period = when {
            GameDay.isDayKey(parts[2]) -> TrophyPeriod.Week(parts[2])
            isMonthKey(parts[2]) -> TrophyPeriod.Month(parts[2])
            else -> return null
        }
        return TrophySpec.LeagueCupOf(period, league, cup)
    }

    private fun isMonthKey(value: String): Boolean {
        val parts = value.split('-')
        if (parts.size != 2 || parts[0].length != 4 || parts[1].length != 2) return false
        if (!value.all { it == '-' || it in '0'..'9' }) return false
        return parts[1].toInt() in 1..12
    }

    private fun positiveInt(value: String): Int? =
        value.takeIf { it.isNotEmpty() && it[0] in '1'..'9' && it.all { c -> c in '0'..'9' } }?.toIntOrNull()
}
