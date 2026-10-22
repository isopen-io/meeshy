package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameLevelStepsTest {

    private fun facts(
        minted: Int = 0,
        missionsDone: Int = 0,
        flameRecord: Int = 0,
        glory: Int = 0,
        rank: GloryRank = GloryLaws.standing(glory).rank,
    ) = LevelStepFacts(minted, missionsDone, flameRecord, glory, rank)

    private fun allMet() = facts(minted = 5, missionsDone = 10, flameRecord = 30, glory = 35_000)

    @Test
    fun `dix etapes de 10 a 100 une par dizaine`() {
        assertThat(GameLevelSteps.rules.map { it.level }).containsExactly(10, 20, 30, 40, 50, 60, 70, 80, 90, 100).inOrder()
        assertThat(GameLevelSteps.missionsCounted).isEqualTo(10)
    }

    @Test
    fun `sans etape faite le niveau attend a neuf`() {
        assertThat(GameLevelSteps.gate(facts())).isEqualTo(9)
    }

    @Test
    fun `chaque etape faite repousse le palier a la dizaine suivante moins un`() {
        assertThat(GameLevelSteps.gate(facts(minted = 1))).isEqualTo(19)
        assertThat(GameLevelSteps.gate(facts(minted = 1, missionsDone = 1))).isEqualTo(29)
        assertThat(GameLevelSteps.gate(facts(minted = 1, missionsDone = 1, glory = 2_000))).isEqualTo(39)
    }

    @Test
    fun `l'etape de rang attend le Passeur pour libérer le cent`() {
        val almost = allMet().copy(glory = 34_999, rank = GloryRank.Conteur)
        assertThat(GameLevelSteps.gate(almost)).isEqualTo(99)
        assertThat(GameLevelSteps.gate(allMet())).isNull()
    }

    @Test
    fun `sans faits aucune etape ne retient le niveau`() {
        assertThat(GameLevelSteps.gate(null)).isNull()
        assertThat(GameLevelSteps.next(9, null)).isNull()
    }

    @Test
    fun `le Mythe vaut tous les rangs demandes`() {
        val mythe = facts(rank = GloryRank.Mythe, glory = 0)
        val rankStep = GameLevelSteps.ruleAt(100)!!
        assertThat(GameLevelSteps.isMet(rankStep, mythe)).isTrue()
    }

    @Test
    fun `le plafond servi est le plus serre du rang et des etapes`() {
        assertThat(GameLevelSteps.cap(GloryRank.Murmure, facts())).isEqualTo(9)
        assertThat(GameLevelSteps.cap(GloryRank.Murmure, allMet())).isEqualTo(499)
        assertThat(GameLevelSteps.cap(GloryRank.Oracle, allMet())).isNull()
        assertThat(GameLevelSteps.cap(GloryRank.Oracle, null)).isNull()
    }

    @Test
    fun `un niveau retenu a neuf montre l'etape du dix`() {
        val step = GameLevelSteps.next(9, facts())!!
        assertThat(step.level).isEqualTo(10)
        assertThat(step.kind).isEqualTo(LevelStepKind.Mint)
        assertThat(step.target).isEqualTo(1L)
        assertThat(step.current).isEqualTo(0L)
        assertThat(step.met).isFalse()
        assertThat(step.rank).isNull()
    }

    @Test
    fun `l'etape de rang donne la Gloire ou commence le rang`() {
        val step = GameLevelSteps.next(19, facts(glory = 500))!!
        assertThat(step.level).isEqualTo(20)
        val rank = GameLevelSteps.next(29, facts(glory = 500))!!
        assertThat(rank.kind).isEqualTo(LevelStepKind.Rank)
        assertThat(rank.rank).isEqualTo(GloryRank.Echo)
        assertThat(rank.target).isEqualTo(2_000L)
        assertThat(rank.current).isEqualTo(500L)
        assertThat(rank.met).isFalse()
    }

    @Test
    fun `au dela du cent plus aucune etape`() {
        assertThat(GameLevelSteps.next(100, allMet())).isNull()
        assertThat(GameLevelSteps.next(1500, allMet())).isNull()
        assertThat(GameLevelSteps.next(99, allMet())!!.level).isEqualTo(100)
    }

    @Test
    fun `toutes les etapes se listent faites ou a faire`() {
        val all = GameLevelSteps.all(facts(minted = 1))
        assertThat(all).hasSize(10)
        assertThat(all.first().met).isTrue()
        assertThat(all[1].met).isFalse()
    }

    @Test
    fun `un compteur negatif est lu comme zero`() {
        val step = GameLevelSteps.next(9, facts(minted = -4))!!
        assertThat(step.current).isEqualTo(0L)
    }

    @Test
    fun `le niveau servi attend au palier tant que l'etape manque puis monte d'un coup`() {
        val score = GameLevels.threshold(40)
        val held = GameLevels.progress(score, GameLevelSteps.cap(GloryRank.Murmure, facts()), GameLevelSteps.gate(facts()))
        assertThat(held.level).isEqualTo(9)
        val freed = GameLevels.progress(score, GameLevels.CAP_BASE, GameLevelSteps.gate(facts(minted = 1, missionsDone = 1, glory = 2_000, flameRecord = 7)))
        assertThat(freed.level).isEqualTo(49)
        assertThat(freed.held).isTrue()
    }
}
