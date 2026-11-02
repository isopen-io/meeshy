package me.meeshy.sdk.model.game.pages

import me.meeshy.sdk.model.game.LeagueCurrent
import me.meeshy.sdk.model.game.LeagueWeekEntry
import me.meeshy.sdk.model.game.LeagueZone

/** Ce qui sépare de la montée, dit par un fait et non par une phrase : l'écran l'habille. */
public sealed interface LeagueGap {
    public data object AtTop : LeagueGap
    public data object InPromotion : LeagueGap
    public data class ToPromotion(val points: Int) : LeagueGap
}

/** Une ligne du classement : l'entrée servie, et si une étiquette de zone s'ouvre au-dessus d'elle. */
public data class LeagueStandingRow(val entry: LeagueWeekEntry, val opensZone: Boolean)

/**
 * Le classement tel que la passerelle le sert, sans rien recalculer (iOS `LeagueStandingsList`) : l'ordre est
 * celui du serveur, l'étiquette de zone s'ouvre à la première ligne et à chaque changement de zone.
 */
public object LeagueStandings {

    public fun rows(entries: List<LeagueWeekEntry>): List<LeagueStandingRow> =
        entries.mapIndexed { index, entry ->
            LeagueStandingRow(entry, opensZone = index == 0 || entries[index - 1].zone != entry.zone)
        }

    public fun gap(current: LeagueCurrent): LeagueGap = when (val points = current.pointsToPromotion) {
        null -> LeagueGap.AtTop
        0 -> LeagueGap.InPromotion
        else -> LeagueGap.ToPromotion(points)
    }

    /** La ligue Amis se tait quand le seul membre est moi : rien à comparer. */
    public fun friendsAreAlone(count: Int): Boolean = count <= 1

    public fun isPromotion(zone: LeagueZone): Boolean = zone == LeagueZone.Promotion
}
