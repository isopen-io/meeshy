package me.meeshy.sdk.model.game.progression

import com.google.common.truth.Truth.assertThat
import java.time.ZoneOffset
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameBlockFixtures
import me.meeshy.sdk.model.game.GameBlockParser
import me.meeshy.sdk.model.game.GameLeagueBlock
import me.meeshy.sdk.model.game.LeagueAccess
import me.meeshy.sdk.model.game.LeagueCloses
import me.meeshy.sdk.model.game.LeagueCurrent
import me.meeshy.sdk.model.game.LeagueFriends
import me.meeshy.sdk.model.game.LeagueKey
import me.meeshy.sdk.model.game.LeagueZone
import me.meeshy.sdk.model.game.SeasonMoment
import me.meeshy.sdk.model.game.engagement.ApiEngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementProgressResolver
import org.junit.Test

/**
 * LE DÉTAIL DE LA JOUTE en tête de sa fiche (iOS `GameLeagueDetailCard`, #13916) : il n'existe que pour une joute
 * publique OUVERTE où le joueur est PLACÉ ; alors il tient la tête (iOS `isHero` = `exist`) et « Où j'en suis » ne redit
 * ni la ligue, ni la place, ni les points de la semaine, ni la fermeture.
 */
class ProgressionLeaguePieceTest {

    private val closes = LeagueCloses("2026-10-25", 20 * 60)

    private fun game(): GameBlock = checkNotNull(GameBlockParser.parse(GameBlockFixtures.block()))

    private fun progress(game: GameBlock?): EngagementProgress =
        EngagementProgressResolver.resolve(ApiEngagementProgress.empty.copy(game = game))

    private fun league(access: LeagueAccess = LeagueAccess.Open, placed: Boolean = true) = GameLeagueBlock(
        unlocked = access != LeagueAccess.Locked,
        access = access,
        weekKey = "2026-W43",
        closes = closes,
        current = if (placed) LeagueCurrent(LeagueKey.Jade, "g1", 30, 3, 120, LeagueZone.Safe, pointsToPromotion = 40) else null,
        friends = LeagueFriends(rank = 2, size = 6, weekPoints = 80),
    )

    @Test
    fun `a placed player in an open joust has the piece with its gem, place, week and closing`() {
        assertThat(ProgressionLeaguePiece.of(league()))
            .isEqualTo(ProgressionLeaguePiece(LeagueKey.Jade, rank = 3, groupSize = 30, weekPoints = 120, closes = closes))
    }

    @Test
    fun `no piece while the joust is closed to the player or he is not placed yet`() {
        assertThat(ProgressionLeaguePiece.of(null)).isNull()
        assertThat(ProgressionLeaguePiece.of(league(access = LeagueAccess.Locked))).isNull()
        assertThat(ProgressionLeaguePiece.of(league(access = LeagueAccess.ConsentRequired))).isNull()
        assertThat(ProgressionLeaguePiece.of(league(access = LeagueAccess.Minor))).isNull()
        assertThat(ProgressionLeaguePiece.of(league(placed = false))).isNull()
    }

    @Test
    fun `the joust piece holds the head only when it exists`() {
        val placed = game().copy(league = league())
        assertThat(ProgressionConceptPieces.isHero(ProgressionConcept.League, progress(placed), placed)).isTrue()
        val waiting = game().copy(league = league(placed = false))
        assertThat(ProgressionConceptPieces.isHero(ProgressionConcept.League, progress(waiting), waiting)).isFalse()
        assertThat(ProgressionConceptPieces.isHero(ProgressionConcept.League, progress(null), null)).isFalse()
    }

    @Test
    fun `with the piece in head where tells neither the league nor the place nor the week nor the closing`() {
        val block = game().copy(league = league())
        val progress = progress(block)
        val fiche = ProgressionConceptFiches.make(
            ProgressionConcept.League, progress, block, 0L, SeasonMoment("2026-10-20", 600),
            pieceIsHero = ProgressionConceptPieces.isHero(ProgressionConcept.League, progress, block), zone = ZoneOffset.UTC,
        )
        val shown = listOf(ConceptFact.League, ConceptFact.LeaguePlace, ConceptFact.WeekPoints, ConceptFact.LeagueCloses)
        assertThat(fiche.head).isEqualTo(FicheHead.Piece)
        assertThat(fiche.heroLine).isNull()
        assertThat(fiche.state?.facts.orEmpty()).containsNoneIn(shown)
        assertThat(fiche.facts.mapNotNull { it.identity }).containsNoneIn(shown)
        assertThat(fiche.facts.mapNotNull { it.identity }).contains(ConceptFact.LeagueZone)
    }
}
