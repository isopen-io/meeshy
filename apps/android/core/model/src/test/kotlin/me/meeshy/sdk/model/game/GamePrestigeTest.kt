package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.model.game.GameLawVectors.boolValue
import me.meeshy.sdk.model.game.GameLawVectors.text
import org.junit.Test

class GamePrestigeTest {

    @Test
    fun `la transition rejoue les vecteurs partages`() {
        GameLawVectors.cases("prestige").forEach {
            val record = it.input["levelRecord"]?.jsonPrimitive?.intOrNull
            val result = GamePrestige.transition(it.input["score"]!!.jsonPrimitive.content.toLong(), it.int("prestige"), record)
            if (it.expected["allowed"].boolValue()) {
                val p = (result as PrestigeTransition.Allowed).passage
                assertWithMessage(it.label).that(listOf(p.prestigeAfter, p.scoreAfter, p.levelAfter, p.levelRecordAfter, p.gloryGained))
                    .isEqualTo(listOf("prestigeAfter", "scoreAfter", "levelAfter", "levelRecordAfter", "gloryGained").map { k -> it.expected[k]!!.jsonPrimitive.intOrNull })
                assertWithMessage(it.label).that(p.trophyKey).isEqualTo(it.expected["trophyKey"].text())
            } else {
                assertWithMessage(it.label).that((result as PrestigeTransition.Refused).reason.wire).isEqualTo(it.expected["reason"].text())
            }
        }
    }

    @Test
    fun `au maximum de cinq etoiles le passage est refuse`() {
        assertThat(GamePrestige.transition(1_000_000L, 5, 100)).isEqualTo(PrestigeTransition.Refused(PrestigeRefusal.AtMaximum))
    }

    @Test
    fun `la cinquieme etoile se pose a la quatrieme`() {
        val allowed = GamePrestige.transition(1_000_000L, 4, 100) as PrestigeTransition.Allowed
        assertThat(allowed.passage.prestigeAfter).isEqualTo(5)
        assertThat(allowed.passage.trophyKey).isEqualTo("trophy.prestige.5")
    }

    @Test
    fun `le record du cycle clos ne descend jamais sous cent`() {
        assertThat(GamePrestige.closedCycleRecord(null, 100)).isEqualTo(100)
        assertThat(GamePrestige.closedCycleRecord(140, 100)).isEqualTo(140)
        assertThat(GamePrestige.pastCycleRecordsAfterPrestige(listOf(100), 120, 100)).containsExactly(100, 120).inOrder()
        assertThat(GamePrestige.pastCycleRecordsAfterPrestige(null, 120, 100)).isNull()
    }

    @Test
    fun `la perte d'acces a la ligue et au duo se dit`() {
        assertThat(GamePrestige.LEAGUE_LEVEL_LOST).isEqualTo(10)
        assertThat(GamePrestige.DUO_LEVEL_LOST).isEqualTo(20)
    }
}
