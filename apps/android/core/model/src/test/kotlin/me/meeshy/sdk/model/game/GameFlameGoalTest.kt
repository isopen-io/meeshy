package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Test

/**
 * L'OBJECTIF DE FLAMME (#17379, #20523) — miroir de `servedFlameGoal` / `nextFlameGoal` / `flameGoalNextSeenKey`
 * (`packages/shared/utils/game/flame-goal.ts`), de `GameFlameGoalLaw` (iOS, #20522) et de `flameGoalView`
 * (`apps/web/src/lib/view/flame-goal-copy.ts`, #20521).
 */
class GameFlameGoalTest {

    private fun servedFlame(goal: JsonElement?): GameFlame? {
        val flame = buildJsonObject {
            GameBlockFixtures.flame().forEach { (key, value) -> put(key, value) }
            if (goal != null) put("goal", goal)
        }
        return GameBlockParser.parse(GameBlockFixtures.block(overrides = mapOf("flame" to flame)))?.flame
    }

    private fun goalJson(offer: List<Int>, current: JsonElement? = null): JsonElement = buildJsonObject {
        put("offer", buildJsonArray { offer.forEach { add(JsonPrimitive(it)) } })
        if (current != null) put("current", current)
    }

    private fun currentJson(target: Int, remaining: Int, reached: Boolean, next: Int?): JsonElement = buildJsonObject {
        put("target", target)
        put("remaining", remaining)
        put("reached", reached)
        if (next == null) put("next", JsonNull) else put("next", next)
    }

    @Test
    fun `le bloc lit l objectif servi, et un serveur anterieur n en sert pas`() {
        assertThat(servedFlame(goalJson(listOf(7, 14, 30)))?.goal)
            .isEqualTo(GameServedFlameGoal(offer = listOf(7, 14, 30), current = null))
        assertThat(servedFlame(goalJson(emptyList(), currentJson(14, 5, reached = false, next = null)))?.goal)
            .isEqualTo(GameServedFlameGoal(offer = emptyList(), current = GameServedFlameGoal.Current(14, 5, false, null)))
        val older = servedFlame(null)
        assertThat(older).isNotNull()
        assertThat(older?.goal).isNull()
    }

    @Test
    fun `un objectif illisible se tait et la Flamme se lit quand meme`() {
        val unreadable = listOf(
            JsonPrimitive(7),
            buildJsonObject { put("offer", "7") },
            goalJson(listOf(-7)),
            goalJson(emptyList(), currentJson(-1, 0, reached = false, next = null)),
            goalJson(emptyList(), buildJsonObject { put("target", 7) }),
        )
        unreadable.forEach { shape ->
            val flame = servedFlame(shape)
            assertThat(flame).isNotNull()
            assertThat(flame?.goal).isNull()
        }
    }

    @Test
    fun `l echelle prolonge les choix du premier jour par les formes de la Flamme`() {
        assertThat(GameFlameGoalLaw.firstChoices).containsExactly(7, 14, 30).inOrder()
        assertThat(GameFlameGoalLaw.ladder).containsExactly(7, 14, 30, 100, 365).inOrder()
        assertThat(GameFlameGoalLaw.next(after = 7)).isEqualTo(14)
        assertThat(GameFlameGoalLaw.next(after = 30)).isEqualTo(100)
        assertThat(GameFlameGoalLaw.next(after = 365)).isNull()
    }

    @Test
    fun `l objectif choisi se dit tout de suite comme la passerelle le servira`() {
        assertThat(GameFlameGoalLaw.servedAfterChoosing(target = 14, streak = 1))
            .isEqualTo(GameServedFlameGoal(emptyList(), GameServedFlameGoal.Current(14, 13, false, null)))
        assertThat(GameFlameGoalLaw.servedAfterChoosing(target = 14, streak = 14))
            .isEqualTo(GameServedFlameGoal(listOf(30), GameServedFlameGoal.Current(14, 0, true, 30)))
        assertThat(GameFlameGoalLaw.servedAfterChoosing(target = 365, streak = 400))
            .isEqualTo(GameServedFlameGoal(emptyList(), GameServedFlameGoal.Current(365, 0, true, null)))
        assertThat(GameFlameGoalLaw.servedAfterChoosing(target = 7, streak = 0)).isNull()
        assertThat(GameFlameGoalLaw.servedAfterChoosing(target = 0, streak = 3)).isNull()
    }

    @Test
    fun `la carte propose, dit ce qu il reste, puis salue jusqu a ce qu on ferme le signe`() {
        val offer = GameServedFlameGoal(listOf(7, 14, 30), null)
        assertThat(GameFlameGoalLaw.section(offer, guideSeen = emptyList())).isEqualTo(FlameGoalSection.Choose(listOf(7, 14, 30)))

        val running = GameServedFlameGoal(emptyList(), GameServedFlameGoal.Current(14, 5, false, null))
        assertThat(GameFlameGoalLaw.section(running, guideSeen = emptyList())).isEqualTo(FlameGoalSection.Running(14, 5))

        val reached = GameServedFlameGoal(listOf(14), GameServedFlameGoal.Current(7, 0, true, 14))
        assertThat(GameFlameGoalLaw.section(reached, guideSeen = emptyList())).isEqualTo(FlameGoalSection.Reached(7, 14))
        assertThat(GameFlameGoalLaw.section(reached, guideSeen = listOf("flame-goal-next-7"))).isNull()
        assertThat(GameFlameGoalLaw.section(reached, guideSeen = listOf("flame-goal-next-14")))
            .isEqualTo(FlameGoalSection.Reached(7, 14))

        assertThat(GameFlameGoalLaw.section(null, guideSeen = emptyList())).isNull()
        assertThat(GameFlameGoalLaw.section(GameServedFlameGoal(emptyList(), null), guideSeen = emptyList())).isNull()
    }

    @Test
    fun `la cle qui ferme le signe est celle de l objectif atteint`() {
        assertThat(GameFlameGoalLaw.nextSeenKey(reachedTarget = 7)).isEqualTo("flame-goal-next-7")
        assertThat(GameFlameGoalLaw.nextSeenKey(reachedTarget = -3)).isEqualTo("flame-goal-next-0")
    }

    @Test
    fun `la reponse du choix rend l objectif servi, et une reponse illisible rend null`() {
        val text = """{"success":true,"data":{"status":"already-chosen","goal":{"offer":[],"current":""" +
            """{"target":7,"remaining":6,"reached":false,"next":null}}}}"""
        val response = GameWriteParser.chooseFlameGoal(text)
        assertThat(response?.goal).isEqualTo(GameServedFlameGoal(emptyList(), GameServedFlameGoal.Current(7, 6, false, null)))
        assertThat(response?.alreadyDone).isTrue()
        assertThat(GameWriteParser.chooseFlameGoal("""{"success":true,"data":{"status":"chosen"}}""")).isNull()
    }

    @Test
    fun `le refus d un objectif dit sa raison, et une raison inconnue garde la phrase generale`() {
        assertThat(GameCopyLaws.flameGoalRefusal("not-offered")).isEqualTo(GameText(GameTextKey.FlameGoalNotOffered))
        assertThat(GameCopyLaws.flameGoalRefusal("no-flame")).isEqualTo(GameText(GameTextKey.FlameGoalNoFlame))
        assertThat(GameCopyLaws.flameGoalRefusal("autre")).isNull()
        assertThat(GameCopyLaws.flameGoalRefusal(null)).isNull()
    }
}
