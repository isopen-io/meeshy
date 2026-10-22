package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameGloryTest {

    @Test
    fun `les dix rangs gagnes commencent a leurs seuils`() {
        assertThat(GloryLaws.earnedRanks.map { GloryLaws.minGlory(it) }).containsExactly(
            0, 2000, 6000, 15_000, 35_000, 70_000, 130_000, 230_000, 380_000, 600_000,
        ).inOrder()
        assertThat(GloryLaws.minGlory(GloryRank.Mythe)).isNull()
    }

    @Test
    fun `l'echelle compte cinquante marches croissantes`() {
        val ladder = GloryLaws.ladder
        assertThat(ladder).hasSize(50)
        assertThat(ladder.map { it.minGlory }).isInStrictOrder()
        assertThat(ladder.first().minGlory).isEqualTo(0)
        assertThat(ladder.last().rank).isEqualTo(GloryRank.Legende)
        assertThat(ladder.last().division5).isEqualTo(1)
        assertThat(ladder.last().minGlory).isEqualTo(920_000)
    }

    @Test
    fun `les divisions descendent de V a I dans chaque rang`() {
        val murmure = GloryLaws.ladder.filter { it.rank == GloryRank.Murmure }
        assertThat(murmure.map { it.division5 }).containsExactly(5, 4, 3, 2, 1).inOrder()
        assertThat(murmure.map { it.minGlory }).containsExactly(0, 400, 800, 1200, 1600).inOrder()
    }

    @Test
    fun `la division heritee projette cinq crans sur trois`() {
        assertThat((5 downTo 1).map(GloryLaws::legacyDivision)).containsExactly(3, 3, 2, 2, 1).inOrder()
    }

    @Test
    fun `bornes de rang a la Gloire pile et un point avant`() {
        assertThat(GloryLaws.standing(1999).rank).isEqualTo(GloryRank.Murmure)
        assertThat(GloryLaws.standing(2000).rank).isEqualTo(GloryRank.Echo)
        assertThat(GloryLaws.standing(2000).division5).isEqualTo(5)
        assertThat(GloryLaws.standing(599_999).rank).isEqualTo(GloryRank.Oracle)
        assertThat(GloryLaws.standing(600_000).rank).isEqualTo(GloryRank.Legende)
    }

    @Test
    fun `une Gloire negative se lit comme zero`() {
        val s = GloryLaws.standing(-10)
        assertThat(s.glory).isEqualTo(0)
        assertThat(s.rank).isEqualTo(GloryRank.Murmure)
        assertThat(s.gloryMissing).isEqualTo(400)
    }

    @Test
    fun `la progression mesure la division courante`() {
        val s = GloryLaws.standing(399)
        assertThat(s.divisionMinGlory).isEqualTo(0)
        assertThat(s.next!!.minGlory).isEqualTo(400)
        assertThat(s.gloryMissing).isEqualTo(1)
        assertThat(s.progress).isWithin(1e-9).of(0.9975)
    }

    @Test
    fun `Legende I tient jusqu'au million faute de place puis reste Legende I`() {
        val s = GloryLaws.standing(5_000_000)
        assertThat(s.rank).isEqualTo(GloryRank.Legende)
        assertThat(s.division5).isEqualTo(1)
        assertThat(s.next).isNull()
        assertThat(s.gloryMissing).isNull()
        assertThat(s.progress).isEqualTo(1.0)
        assertThat(s.mythic).isNull()
    }

    @Test
    fun `le Mythe vient du serveur et jamais du seuil`() {
        val seat = MythicSeatRef(number = 7, edition = 12)
        val served = GloryLaws.standing(1_000_000, mythicSeat = seat)
        assertThat(served.rank).isEqualTo(GloryRank.Mythe)
        assertThat(served.division).isNull()
        assertThat(served.division5).isNull()
        assertThat(served.next).isNull()
        assertThat(served.mythic).isEqualTo(seat)
        assertThat(GloryLaws.standing(10, mythic = true).rank).isEqualTo(GloryRank.Mythe)
        assertThat(GloryLaws.standing(10, mythic = true).mythic).isNull()
    }

    @Test
    fun `une place illisible ne fait pas un Mythe`() {
        val bad = GloryLaws.standing(1_000_000, mythicSeat = MythicSeatRef(number = 101, edition = 1))
        assertThat(bad.rank).isEqualTo(GloryRank.Legende)
        assertThat(GloryLaws.standing(1_000_000, mythicSeat = MythicSeatRef(1, 0)).rank).isEqualTo(GloryRank.Legende)
    }

    @Test
    fun `la Gloire du premier passage d'un niveau`() {
        assertThat(GloryLaws.gloryForLevel(1)).isEqualTo(0)
        assertThat(GloryLaws.gloryForLevel(2)).isEqualTo(100)
        assertThat(GloryLaws.gloryForLevel(100)).isEqualTo(100)
        assertThat(GloryLaws.gloryForLevel(101)).isEqualTo(0)
        assertThat(GloryLaws.gloryForLevel(110)).isEqualTo(1000)
    }

    @Test
    fun `la forme close des nouveaux niveaux egale la somme niveau par niveau`() {
        listOf(0 to 1, 1 to 2, 30 to 34, 95 to 130, 100 to 100, 999 to 1500, 105 to 107).forEach { (previous, level) ->
            val sum = (previous + 1..level).sumOf { GloryLaws.gloryForLevel(it) }
            assertThat(GloryLaws.gloryForNewLevels(level, previous)).isEqualTo(if (level > previous) sum else 0)
        }
        assertThat(GloryLaws.gloryForNewLevels(34, 30)).isEqualTo(400)
        assertThat(GloryLaws.gloryForNewLevels(1500, 999)).isEqualTo(51_000)
        assertThat(GloryLaws.gloryForNewLevels(32, 36)).isEqualTo(0)
    }

    @Test
    fun `la Gloire par evenement`() {
        assertThat(GloryLaws.POINTS_MINT).isEqualTo(1000)
        assertThat(GloryLaws.POINTS_LEAGUE_UP).isEqualTo(300)
        assertThat(GloryLaws.POINTS_LEAGUE_CUP).isEqualTo(1000)
        assertThat(GloryLaws.POINTS_SEASON).isEqualTo(5000)
        assertThat(GloryLaws.POINTS_PRESTIGE).isEqualTo(10_000)
        assertThat(MissionDifficulty.entries.map(GloryLaws::gloryForMission)).containsExactly(40, 100, 250, 500).inOrder()
        assertThat(GloryLaws.AchievementRarity.entries.map(GloryLaws::gloryForAchievement))
            .containsExactly(100, 250, 600, 1500, 4000).inOrder()
        assertThat(GloryLaws.gloryForChest(100)).isEqualTo(10)
        assertThat(GloryLaws.gloryForChest(10_000)).isEqualTo(1000)
        assertThat(GloryLaws.gloryForChest(-3)).isEqualTo(0)
    }

    @Test
    fun `les records de Flamme ne paient qu'une fois franchis`() {
        assertThat(GloryLaws.gloryForFlameRecords(previousLongest = 6, longest = 7)).isEqualTo(500)
        assertThat(GloryLaws.gloryForFlameRecords(previousLongest = 7, longest = 7)).isEqualTo(0)
        assertThat(GloryLaws.gloryForFlameRecords(previousLongest = 0, longest = 31)).isEqualTo(2000)
        assertThat(GloryLaws.gloryForFlameRecords(previousLongest = 0, longest = 400)).isEqualTo(27_000)
    }
}
