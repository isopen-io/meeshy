package me.meeshy.sdk.model.game.progression

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameBlockFixtures
import me.meeshy.sdk.model.game.GameBlockParser
import me.meeshy.sdk.model.game.GameLevelStep
import me.meeshy.sdk.model.game.GameText
import me.meeshy.sdk.model.game.GameTextArg
import me.meeshy.sdk.model.game.GameTextKey
import me.meeshy.sdk.model.game.GloryRank
import me.meeshy.sdk.model.game.LevelStepFacts
import me.meeshy.sdk.model.game.LevelStepKind
import org.junit.Test

/**
 * LES PRÉCISIONS DE L'ÉPREUVE DU NIVEAU (iOS `GameElementDetails.levelStep`, #13923) : la ligne d'épreuve de l'anneau
 * s'ouvre sur son nom, réussie ou ce qu'il en reste avec sa jauge, puis les dix épreuves des niveaux, chacune « Niveau N »
 * → « ce qu'elle demande · réussie ou où elle en est » ; son concept est celui du geste qui la fait.
 */
class ProgressionLevelStepDetailTest {

    private fun game(): GameBlock = checkNotNull(GameBlockParser.parse(GameBlockFixtures.block()))

    private val firstMint = GameLevelStep(level = 10, kind = LevelStepKind.Mint, target = 1, current = 0, met = false)

    @Test
    fun `a step still to do says its name, where it stands and its gauge`() {
        val detail = LevelStepDetail.of(firstMint, facts = null)
        assertThat(detail.level).isEqualTo(10)
        assertThat(detail.concept).isEqualTo(ProgressionConcept.Meesh)
        assertThat(detail.name.key).isEqualTo(GameTextKey.LevelStepLine)
        assertThat(detail.met).isFalse()
        assertThat(detail.missing).isEqualTo(
            GameText.of(GameTextKey.DetailLevelStepProgress, GameTextArg.Nested(GameText.of(GameTextKey.Ratio, GameTextArg.Count(0), GameTextArg.Count(1)))),
        )
        assertThat(detail.progress).isEqualTo(0.0)
        assertThat(detail.facts).isEmpty()
    }

    @Test
    fun `a met step says nothing is missing and draws no gauge`() {
        val met = LevelStepDetail.of(firstMint.copy(current = 3, met = true), facts = null)
        assertThat(met.met).isTrue()
        assertThat(met.missing).isNull()
        assertThat(met.progress).isNull()
    }

    @Test
    fun `served facts list the ten steps, each with its goal and its state`() {
        val facts = LevelStepFacts(minted = 1, missionsDone = 0, flameRecord = 9, glory = 500, rank = GloryRank.Murmure)
        val detail = LevelStepDetail.of(firstMint, facts)
        assertThat(detail.facts.map { it.label }).containsExactlyElementsIn(
            listOf(10, 20, 30, 40, 50, 60, 70, 80, 90, 100).map { GameText.of(GameTextKey.BannerLevel, GameTextArg.Count(it)) },
        ).inOrder()
        val first = detail.facts.first().value
        assertThat(first.key).isEqualTo(GameTextKey.JoinedBySpace)
        assertThat(first.args).containsExactly(
            GameTextArg.Nested(GameText(GameTextKey.LevelStepMintFirst)),
            GameTextArg.Verbatim("·"),
            GameTextArg.Nested(GameText(GameTextKey.LevelStepDone)),
        ).inOrder()
        assertThat((detail.facts[1].value.args.last() as GameTextArg.Nested).text.key).isEqualTo(GameTextKey.Ratio)
    }

    @Test
    fun `the step concept is the gesture that makes it, and a rank step speaks in glory`() {
        assertThat(LevelStepKind.Missions.concept).isEqualTo(ProgressionConcept.Missions)
        assertThat(LevelStepKind.Flame.concept).isEqualTo(ProgressionConcept.Flame)
        assertThat(LevelStepKind.Rank.concept).isEqualTo(ProgressionConcept.Glory)
        val rank = LevelStepDetail.of(GameLevelStep(150, LevelStepKind.Rank, target = 6000, current = 5000, met = false, rank = GloryRank.Voix), null)
        assertThat((rank.missing?.args?.single() as GameTextArg.Nested).text.key).isEqualTo(GameTextKey.RankGlory)
        assertThat(rank.progress).isWithin(1e-9).of(5000.0 / 6000.0)
    }

    @Test
    fun `the game block serves the step facts from its ladder, or none before the steps`() {
        val block = game()
        assertThat(block.levelStepFacts).isEqualTo(LevelStepFacts(minted = 3, missionsDone = 12, flameRecord = 9, glory = block.glory.glory, rank = block.glory.rank))
        val bare = block.copy(level = block.level.copy(ladder = block.level.ladder?.copy(steps = null)))
        assertThat(bare.levelStepFacts).isNull()
    }
}
