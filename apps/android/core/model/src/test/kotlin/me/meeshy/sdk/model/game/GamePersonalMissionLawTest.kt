package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GamePersonalMissionLawTest {

    private fun input(level: Int = 20, nowMinute: Int = 600, multilingual: Boolean = false, usage: Map<String, Double> = emptyMap(), hours: List<Double>? = null) =
        PersonalMissionInput("u1", "2026-10-05", level, 5, nowMinute, hours, usage, multilingual)

    @Test
    fun `la plage dure deux heures pleines entre 8 h et 21 h`() {
        (1..100).forEach { n ->
            val draw = GamePersonalMissionLaw.draw(input().copy(userId = "user-$n"))!!
            assertThat(draw.endMinute - draw.startMinute).isEqualTo(120)
            assertThat(draw.startMinute % 60).isEqualTo(0)
            assertThat(draw.startMinute).isAtLeast(8 * 60)
            assertThat(draw.startMinute).isAtMost(21 * 60)
            assertThat(draw.mission.glory).isEqualTo(0)
        }
    }

    @Test
    fun `le niveau fixe la difficulte et jamais d'Or`() {
        assertThat(GamePersonalMissionLaw.draw(input(level = 5))!!.mission.difficulty).isEqualTo(MissionDifficulty.Easy)
        assertThat(GamePersonalMissionLaw.draw(input(level = 20))!!.mission.difficulty).isEqualTo(MissionDifficulty.Medium)
        assertThat(GamePersonalMissionLaw.draw(input(level = 99))!!.mission.difficulty).isEqualTo(MissionDifficulty.Hard)
    }

    @Test
    fun `tire tard, plus aucune plage ne tient et rien n'est tire`() {
        assertThat(GamePersonalMissionLaw.draw(input(nowMinute = 21 * 60 + 61))).isNull()
        assertThat(GamePersonalMissionLaw.windowStillFits(21 * 60 + 61)).isFalse()
        assertThat(GamePersonalMissionLaw.windowStillFits(600)).isTrue()
        val late = GamePersonalMissionLaw.draw(input(nowMinute = 20 * 60))!!
        assertThat(late.startMinute).isAtLeast(19 * 60)
    }

    @Test
    fun `une mission de langue n'est jamais proposee a un compte monolingue`() {
        (1..60).forEach { n ->
            val mission = GamePersonalMissionLaw.draw(input(multilingual = false).copy(userId = "user-$n"))!!.mission
            assertThat(mission.prism).isFalse()
        }
    }

    @Test
    fun `la loi est deterministe`() {
        assertThat(GamePersonalMissionLaw.draw(input())).isEqualTo(GamePersonalMissionLaw.draw(input()))
    }

    @Test
    fun `l'etat de la plage`() {
        val s = 1_000L
        val e = 2_000L
        assertThat(GamePersonalMissionLaw.state(s, e, false, 999L)).isEqualTo(PersonalMissionState.Upcoming)
        assertThat(GamePersonalMissionLaw.state(s, e, false, 1_000L)).isEqualTo(PersonalMissionState.Active)
        assertThat(GamePersonalMissionLaw.state(s, e, false, 2_000L)).isEqualTo(PersonalMissionState.Missed)
        assertThat(GamePersonalMissionLaw.state(s, e, true, 5_000L)).isEqualTo(PersonalMissionState.Completed)
        assertThat(GamePersonalMissionLaw.isOpen(s, e, 1_999L)).isTrue()
        assertThat(GamePersonalMissionLaw.isOpen(s, e, 2_000L)).isFalse()
    }

    @Test
    fun `l'histogramme ignore les minutes hors de la journee`() {
        val h = GamePersonalMissionLaw.activeHoursHistogram(listOf(0, 59, 60, 1439, 1440, -1))
        assertThat(h).hasSize(24)
        assertThat(h[0]).isEqualTo(2)
        assertThat(h[1]).isEqualTo(1)
        assertThat(h[23]).isEqualTo(1)
    }

    @Test
    fun `l'activite nommee par la notification`() {
        assertThat(GamePersonalMissionLaw.activity("send-voice")).isEqualTo(PersonalActivity.Voice)
        assertThat(GamePersonalMissionLaw.activity("inconnu")).isEqualTo(PersonalActivity.Chat)
    }
}
