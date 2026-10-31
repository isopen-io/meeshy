package me.meeshy.sdk.model.game.progression

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameBlockFixtures
import me.meeshy.sdk.model.game.GameBlockParser
import me.meeshy.sdk.model.game.GameText
import me.meeshy.sdk.model.game.GameTextArg
import me.meeshy.sdk.model.game.GameTextKey
import me.meeshy.sdk.model.game.GloryRank
import me.meeshy.sdk.model.game.LevelTierKey
import me.meeshy.sdk.model.game.SeasonMoment
import me.meeshy.sdk.model.game.engagement.ApiEngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementAxisFamily
import me.meeshy.sdk.model.game.engagement.EngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementProgressResolver
import me.meeshy.sdk.model.game.guide.GameGuideEvents
import org.junit.Test

/**
 * L'ANNEAU DU NIVEAU en tête de sa fiche (iOS `GameHeroView`, #13916) : lu sur la VÉRITÉ du niveau (`level.shown`),
 * il dit le palier, le niveau, ce qui sépare du suivant — ou pourquoi il attend, ou le plafond —, la prochaine
 * épreuve, les deux paires des étincelles, le blason et « Comment gagner ». Il tient la tête (iOS `isHero`) et la fiche
 * n'a plus aucune ligne ; l'anneau et le blason ouvrent leurs précisions (iOS `GameElementDetails.levelRing` / `.rank`).
 */
class ProgressionLevelPieceTest {

    private fun game(): GameBlock = checkNotNull(GameBlockParser.parse(GameBlockFixtures.block()))

    private fun progress(game: GameBlock?): EngagementProgress =
        EngagementProgressResolver.resolve(ApiEngagementProgress.empty.copy(game = game))

    private fun withLadder(game: GameBlock, held: Boolean = false, next: Long? = 91000L, record: Int = 150): GameBlock {
        val ladder = checkNotNull(game.level.ladder).copy(held = held, nextThreshold = next, record = record)
        return game.copy(level = game.level.copy(ladder = ladder))
    }

    @Test
    fun `the piece reads the shown level, its tier, the next step and the standing`() {
        val block = game()
        val piece = ProgressionLevelPiece.of(block)
        assertThat(piece.level).isEqualTo(142)
        assertThat(piece.tier).isEqualTo(LevelTierKey.Nebuleuse)
        assertThat(piece.progress).isEqualTo(0.25)
        assertThat(piece.belowRecord).isTrue()
        assertThat(piece.title).isEqualTo(GameText.of(GameTextKey.HeroLevel, GameTextArg.Count(142)))
        assertThat(piece.toNext.key).isEqualTo(GameTextKey.LevelHeld)
        assertThat(piece.step?.line?.key).isEqualTo(GameTextKey.LevelStepLine)
        assertThat(piece.step?.state?.key).isEqualTo(GameTextKey.RankGlory)
        assertThat(piece.step?.met).isFalse()
        assertThat(piece.rank).isEqualTo(GloryRank.Polyglotte)
        assertThat(piece.division5).isEqualTo(3)
        assertThat(piece.glory).isEqualTo(GameText.of(GameTextKey.RankGlory, GameTextArg.Count(70000)))
        assertThat(piece.standingOrder).isEqualTo(GameGuideEvents.standingOrder(block))
        assertThat(piece.levelRecord).isEqualTo(GameText.of(GameTextKey.SparksLevelRecordLine, GameTextArg.Count(160)))
    }

    @Test
    fun `the line says what separates from the next level, or the ceiling`() {
        val climbing = ProgressionLevelPiece.of(withLadder(game()))
        assertThat(climbing.toNext.key).isEqualTo(GameTextKey.LevelToNext)
        assertThat(climbing.toNext.args.last()).isEqualTo(GameTextArg.Count(143))
        val top = ProgressionLevelPiece.of(withLadder(game(), next = null))
        assertThat(top.toNext.key).isAnyOf(GameTextKey.LevelTop, GameTextKey.LevelCapReached)
        assertThat(ProgressionLevelPiece.of(withLadder(game(), record = 142)).belowRecord).isFalse()
    }

    @Test
    fun `how to earn lists every family by its highest gain`() {
        assertThat(ProgressionLevelPiece.earnItems()).containsExactly(
            LevelEarnItem(EngagementAxisFamily.CONTENT, 1000),
            LevelEarnItem(EngagementAxisFamily.COMMENT, 100),
            LevelEarnItem(EngagementAxisFamily.SOCIAL, 7),
            LevelEarnItem(EngagementAxisFamily.CONVERSATION, 5),
            LevelEarnItem(EngagementAxisFamily.TOOL, 4),
        ).inOrder()
    }

    @Test
    fun `the ring opens the spark pairs, the ceiling and the record`() {
        val climbing = ProgressionPieceDetails.levelRing(withLadder(game()).level)
        assertThat(climbing.kind).isEqualTo(PieceDetailKind.LevelRing)
        assertThat(climbing.value.key).isEqualTo(GameTextKey.LevelToNext)
        assertThat(climbing.progress).isEqualTo(0.25)
        assertThat(climbing.facts.map { it.label.key }).containsExactly(
            GameTextKey.SparksPocketLabel, GameTextKey.SparksLifetimeLabel, GameTextKey.SparksLevelLabel,
            GameTextKey.SparksLevelMaxLabel, GameTextKey.FactRecord,
        ).inOrder()
        val top = ProgressionPieceDetails.levelRing(withLadder(game(), next = null, record = 142).level)
        assertThat(top.progress).isNull()
        assertThat(top.facts.map { it.label.key }.last()).isEqualTo(GameTextKey.FactNextLevel)
    }

    @Test
    fun `the blason opens the glory, the next rank and what it misses`() {
        val detail = ProgressionPieceDetails.rank(game().glory)
        assertThat(detail.kind).isEqualTo(PieceDetailKind.Rank)
        assertThat(detail.value).isEqualTo(GameText.of(GameTextKey.RankGlory, GameTextArg.Count(70000)))
        assertThat(detail.progress).isEqualTo(0.1)
        assertThat(detail.facts.map { it.label.key }).containsExactly(GameTextKey.FactNextRank, GameTextKey.FactMissingForRank).inOrder()
        assertThat(detail.facts.last().value).isEqualTo(GameText.of(GameTextKey.RankGlory, GameTextArg.Count(60000)))
        val top = ProgressionPieceDetails.rank(game().glory.copy(next = null, gloryMissing = null))
        assertThat(top.progress).isNull()
        assertThat(top.facts).isEmpty()
    }

    @Test
    fun `the ring holds the head with a game block and the fiche then has no line`() {
        val block = game()
        val served = progress(block)
        assertThat(ProgressionConceptPieces.isHero(ProgressionConcept.Level, served, block)).isTrue()
        assertThat(ProgressionConceptPieces.isHero(ProgressionConcept.Level, progress(null), null)).isFalse()
        val fiche = ProgressionConceptFiches.make(
            ProgressionConcept.Level, served, block, 0L, SeasonMoment("2026-10-20", 600),
            pieceIsHero = ProgressionConceptPieces.isHero(ProgressionConcept.Level, served, block),
        )
        assertThat(fiche.head).isEqualTo(FicheHead.Piece)
        assertThat(fiche.hasWhere).isFalse()
    }
}
