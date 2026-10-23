package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import me.meeshy.sdk.model.game.GameLawVectors.array
import me.meeshy.sdk.model.game.GameLawVectors.boolValue
import me.meeshy.sdk.model.game.GameLawVectors.intValue
import me.meeshy.sdk.model.game.GameLawVectors.text
import org.junit.Test

class GameChestTest {

    @Test
    fun `les points suivent une droite de 500 a 10000 selon l'effort`() {
        assertThat(GameChestLaw.pointsForEffort(0)).isEqualTo(500)
        assertThat(GameChestLaw.pointsForEffort(300)).isEqualTo(500)
        assertThat(GameChestLaw.pointsForEffort(4500)).isEqualTo(10_000)
        assertThat(GameChestLaw.pointsForEffort(99_999)).isEqualTo(10_000)
        assertThat(GameChestLaw.pointsForEffort(2400)).isEqualTo(5250)
    }

    @Test
    fun `la Gloire du coffre est un point pour dix`() {
        assertThat(GameChestLaw.gloryForChest(500)).isEqualTo(50)
        assertThat(GameChestLaw.gloryForChest(10_000)).isEqualTo(1000)
        assertThat(GameChestLaw.contentForEffort(300, 1221).glory).isEqualTo(50)
    }

    @Test
    fun `les deux primes possibles sont le prix entier et son cinquieme arrondi`() {
        assertThat(GameChestLaw.bonusAmounts(1221)).isEqualTo(1221 to 244)
        assertThat(GameChestLaw.bonusAmounts(7)).isEqualTo(7 to 1)
        assertThat(GameChestLaw.bonusAmounts(-3)).isEqualTo(0 to 0)
    }

    @Test
    fun `l'effort d'une mission est sa base plus ses points par unite fois l'objectif`() {
        val effort = GameChestLaw.missionEffort(ChestMission("send-texts", MissionDifficulty.Easy, 5))
        assertThat(effort).isEqualTo(40 + 15 * 5)
        assertThat(GameChestLaw.missionEffort(ChestMission("unknown", null, 9))).isEqualTo(40)
        assertThat(GameChestLaw.dayEffort(listOf(ChestMission("send-texts", MissionDifficulty.Easy, 5), ChestMission("unknown", null, 9)))).isEqualTo(115 + 40)
    }

    @Test
    fun `le coffre est deterministe, la prime n'est jamais en plus du prix et rien n'est une Meesh`() {
        val a = GameChestLaw.daily("u1", "2026-10-05", 1200, 1221)
        assertThat(a).isEqualTo(GameChestLaw.daily("u1", "2026-10-05", 1200, 1221))
        val seen = (1..400).map { GameChestLaw.daily("user-$it", "2026-10-05", 1200, 1000) }
        assertThat(seen.map { it.bonus }.toSet()).containsExactly(ChestBonus.NoBonus, ChestBonus.Fifth, ChestBonus.Whole)
        seen.forEach { assertThat(it.points).isEqualTo(GameChestLaw.pointsForEffort(1200) + it.bonusPoints) }
        assertThat(seen.any { it.fragment }).isTrue()
        assertThat(seen.any { it.freeze }).isTrue()
    }

    @Test
    fun `le cours de la prime est fige a l'ouverture du jour de jeu, jamais apres maintenant`() {
        assertThat(GameChestLaw.priceCutoffMillis(listOf(500L, null, 300L), 1_000L)).isEqualTo(300L)
        assertThat(GameChestLaw.priceCutoffMillis(listOf(5_000L), 1_000L)).isEqualTo(1_000L)
        assertThat(GameChestLaw.priceCutoffMillis(emptyList(), 1_000L)).isEqualTo(1_000L)
    }

    @Test
    fun `les fragments d'etoile se lisent sans double compte`() {
        assertThat(GameStarFragments.seasonStepGivesFragment(5)).isTrue()
        assertThat(GameStarFragments.seasonStepGivesFragment(10)).isFalse()
        assertThat(GameStarFragments.seasonStepGivesFragment(40)).isFalse()
        assertThat(GameStarFragments.seasonStepGivesFragment(45)).isFalse()
        assertThat(GameStarFragments.collected(2, listOf(listOf(5, 15, 25, 35, 40), listOf(5, 5, 10)))).isEqualTo(7)
        assertThat(GameStarFragments.collected(1, listOf(listOf(0, 45, -5)))).isEqualTo(1)
    }

    @Test
    fun `les vecteurs partages du coffre et des fragments sont rejoues`() {
        GameLawVectors.cases("chest").forEach {
            val c = GameChestLaw.daily(it.str("userId"), it.str("dayKey"), it.int("effort"), it.int("nextMeeshPrice"))
            assertWithMessage(it.label).that(c.points).isEqualTo(it.expected["points"].intValue())
            assertWithMessage(it.label).that(c.fragment).isEqualTo(it.expected["fragment"].boolValue())
            assertWithMessage(it.label).that(c.freeze).isEqualTo(it.expected["freeze"].boolValue())
            assertWithMessage(it.label).that(c.glory).isEqualTo(it.expected["glory"].intValue())
            assertWithMessage(it.label).that(c.bonus?.name?.lowercase()).isEqualTo(it.expected["bonus"].text().replace("none", "nobonus"))
            assertWithMessage(it.label).that(c.bonusPoints).isEqualTo(it.expected["bonusPoints"].intValue())
        }
        GameLawVectors.cases("star-fragments").forEach {
            val seasons = it.input["seasons"].array().map { s -> s.array().map { n -> n.intValue()!! } }
            assertWithMessage(it.label).that(GameStarFragments.collected(it.int("chestDays"), seasons)).isEqualTo(it.expected["collected"].intValue())
        }
    }
}
