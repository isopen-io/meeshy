package me.meeshy.sdk.model.game.progression

import me.meeshy.sdk.model.game.GameLeagueBlock
import me.meeshy.sdk.model.game.LeagueAccess
import me.meeshy.sdk.model.game.LeagueCloses
import me.meeshy.sdk.model.game.LeagueKey

/**
 * LE DÉTAIL DE LA JOUTE, en tête de sa fiche (miroir de `GameLeagueDetailCard`, iOS #9541) : la gemme du cercle, la
 * place dans le groupe, les points de la semaine et le temps jusqu'à la fermeture. Il n'existe que si la joute publique
 * est OUVERTE et le joueur PLACÉ dans un groupe (iOS `GameLeagueDetail.current`) : sinon la fiche dit pourquoi, la tête
 * ne répète pas une absence.
 */
public data class ProgressionLeaguePiece(
    val league: LeagueKey,
    val rank: Int,
    val groupSize: Int,
    val weekPoints: Int,
    val closes: LeagueCloses,
) {
    public companion object {
        public fun of(block: GameLeagueBlock?): ProgressionLeaguePiece? {
            val league = block?.takeIf { it.access == LeagueAccess.Open } ?: return null
            val current = league.current ?: return null
            return ProgressionLeaguePiece(current.league, current.rank, current.groupSize, current.weekPoints, league.closes)
        }
    }
}
