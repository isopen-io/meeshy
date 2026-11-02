package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import me.meeshy.sdk.model.game.GameLawVectors.doubleValue
import me.meeshy.sdk.model.game.GameLawVectors.intValue
import org.junit.Test

class GameBoostsTest {

    @Test
    fun `le Vent arriere des etincelles souffle a 7 niveaux d'ecart et pas avant`() {
        assertThat(GameBoostLaws.sparksTailwindFactor(level = 30, levelRecord = 36)).isEqualTo(1.0)
        assertThat(GameBoostLaws.sparksTailwindFactor(level = 29, levelRecord = 36)).isEqualTo(1.25)
        assertThat(GameBoostLaws.sparksTailwindFactor(level = 36, levelRecord = 36)).isEqualTo(1.0)
        assertThat(GameBoostLaws.sparksTailwindFactor(level = 1, levelRecord = 1)).isEqualTo(1.0)
    }

    @Test
    fun `la loi d'avant les etincelles souffle des que le niveau passe sous le record`() {
        assertThat(GameBoostLaws.tailwindFactor(35, 36)).isEqualTo(1.25)
        assertThat(GameBoostLaws.tailwindFactor(36, 36)).isEqualTo(1.0)
        assertThat(GameBoostLaws.tailwindFactor(40, 36)).isEqualTo(1.0)
    }

    @Test
    fun `l'Heure du Prisme dure une heure sur un quart d'heure entre 9 h et 21 h`() {
        (1..300).forEach { n ->
            val w = GameBoostLaws.prismHourWindow("user-$n", "2026-10-05")
            assertThat(w.endMinute - w.startMinute).isEqualTo(60)
            assertThat(w.startMinute % 15).isEqualTo(0)
            assertThat(w.startMinute).isAtLeast(9 * 60)
            assertThat(w.endMinute).isAtMost(21 * 60)
        }
    }

    @Test
    fun `les missions comptent double dans la fenetre en minutes locales, bornes debut inclus et fin exclue`() {
        val w = PrismHourWindow(900, 960)
        assertThat(GameBoostLaws.missionMultiplier(w, 899)).isEqualTo(1)
        assertThat(GameBoostLaws.missionMultiplier(w, 900)).isEqualTo(2)
        assertThat(GameBoostLaws.missionMultiplier(w, 959)).isEqualTo(2)
        assertThat(GameBoostLaws.missionMultiplier(w, 960)).isEqualTo(1)
        assertThat(GameBoostLaws.missionMultiplier(null, 930)).isEqualTo(1)
    }

    @Test
    fun `les vecteurs partages des boosts sont rejoues`() {
        GameLawVectors.cases("tailwind").forEach {
            assertWithMessage(it.label).that(GameBoostLaws.tailwindFactor(it.int("level"), it.int("levelRecord"))).isEqualTo(it.expected["factor"].doubleValue())
        }
        GameLawVectors.cases("prism-hour").forEach {
            val w = GameBoostLaws.prismHourWindow(it.str("userId"), it.str("dayKey"))
            assertWithMessage(it.label).that(w.startMinute).isEqualTo(it.expected["startMinute"].intValue())
            assertWithMessage(it.label).that(w.endMinute).isEqualTo(it.expected["endMinute"].intValue())
        }
    }
}
