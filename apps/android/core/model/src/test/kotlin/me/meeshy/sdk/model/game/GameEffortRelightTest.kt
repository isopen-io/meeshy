package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import me.meeshy.sdk.model.game.GameOptimisticFixtures.flame
import me.meeshy.sdk.model.game.GameOptimisticFixtures.game
import me.meeshy.sdk.model.game.GameOptimisticFixtures.meesh
import me.meeshy.sdk.model.game.GameOptimisticFixtures.state
import org.junit.Test

/**
 * LE RALLUMAGE PAR L'EFFORT SE DIT (#20474) — miroir de `GameEffortRelight`, `GameCopy.effortRelight`,
 * `GameFlamePanelView.saysRelightClosed` et `GameOptimistic.afterRelight` / `withRelit` (iOS, #20473) et
 * d'`effortRelightLine` (web, #20471).
 */
class GameEffortRelightTest {

    private fun effortJson(
        lostDays: JsonElement = JsonPrimitive(12),
        dreamsDone: JsonElement = JsonPrimitive(1),
        dreamsNeeded: JsonElement = JsonPrimitive(2),
        closesOn: JsonElement = JsonPrimitive("2026-10-21"),
        daysLeft: JsonElement = JsonPrimitive(1),
    ): JsonObject = buildJsonObject {
        put("lostDays", lostDays)
        put("dreamsDone", dreamsDone)
        put("dreamsNeeded", dreamsNeeded)
        put("closesOn", closesOn)
        put("daysLeft", daysLeft)
    }

    private fun servedFlame(effort: JsonElement?): GameFlame? {
        val flame = buildJsonObject {
            GameBlockFixtures.flame().forEach { (key, value) -> if (key != "status") put(key, value) }
            put("status", "out")
            if (effort != null) put("effortRelight", effort)
        }
        return GameBlockParser.parse(GameBlockFixtures.block(overrides = mapOf("flame" to flame)))?.flame
    }

    private val effort = GameEffortRelight(lostDays = 12, dreamsDone = 1, dreamsNeeded = 2, closesOn = "2026-10-21", daysLeft = 1)

    @Test
    fun `le bloc lit le rallumage par l effort, et un serveur anterieur ne le sert pas`() {
        assertThat(servedFlame(effortJson())?.effortRelight).isEqualTo(effort)
        val older = servedFlame(null)
        assertThat(older).isNotNull()
        assertThat(older?.effortRelight).isNull()
    }

    @Test
    fun `une forme hors de la loi se tait et la Flamme se lit quand meme`() {
        val unlawful = listOf(
            effortJson(lostDays = JsonPrimitive(0)),
            effortJson(dreamsDone = JsonPrimitive(-1)),
            effortJson(dreamsNeeded = JsonPrimitive(0)),
            effortJson(daysLeft = JsonPrimitive(-1)),
            effortJson(closesOn = JsonPrimitive("demain")),
            effortJson(closesOn = JsonPrimitive(21)),
            effortJson(lostDays = JsonPrimitive("12")),
            JsonPrimitive("rallume"),
        )
        unlawful.forEach { form ->
            val served = servedFlame(form)
            assertThat(served).isNotNull()
            assertThat(served?.status).isEqualTo(FlameStatus.Out)
            assertThat(served?.effortRelight).isNull()
        }
    }

    @Test
    fun `il manque toujours au moins un reve tant que la Flamme est eteinte`() {
        assertThat(effort.dreamsMissing).isEqualTo(1)
        assertThat(effort.copy(dreamsDone = 0).dreamsMissing).isEqualTo(2)
        assertThat(effort.copy(dreamsDone = 2).dreamsMissing).isEqualTo(1)
        assertThat(effort.copy(dreamsDone = 5).dreamsMissing).isEqualTo(1)
    }

    @Test
    fun `la phrase dit les reves qui manquent, les jours qui reviennent, et jusqu a quand`() {
        val tomorrow = GameCopyLaws.effortRelight(effort)
        assertThat(tomorrow.key).isEqualTo(GameTextKey.EffortRelightTomorrow)
        assertThat(tomorrow.args).containsExactly(
            GameTextArg.Nested(GameText.of(GameTextKey.EffortDreams, GameTextArg.Count(1))),
            GameTextArg.Nested(GameCopyLaws.days(12)),
        ).inOrder()

        val today = GameCopyLaws.effortRelight(effort.copy(dreamsDone = 0, daysLeft = 0))
        assertThat(today.key).isEqualTo(GameTextKey.EffortRelightToday)
        assertThat(today.args.first()).isEqualTo(GameTextArg.Nested(GameCopyLaws.effortDreams(2)))
    }

    @Test
    fun `ne peut plus etre rallumee se tait tant que l effort la rallume encore`() {
        val out = flame(status = FlameStatus.Out, canRelight = false)
        assertThat(out.saysRelightClosed(cannotPayRelight = false)).isTrue()
        assertThat(out.copy(effortRelight = effort).saysRelightClosed(cannotPayRelight = false)).isFalse()
        assertThat(out.saysRelightClosed(cannotPayRelight = true)).isFalse()
        assertThat(out.copy(canRelight = true).saysRelightClosed(cannotPayRelight = false)).isFalse()
        assertThat(flame(status = FlameStatus.Lit).saysRelightClosed(cannotPayRelight = false)).isFalse()
    }

    @Test
    fun `un rallumage paye retire la phrase sans attendre la relecture`() {
        val out = flame(status = FlameStatus.Out, canRelight = true).copy(effortRelight = effort)
        val s = state(game(held = 5, flame = out), meesh(balance = 5))

        assertThat(GameOptimistic.afterRelight(s).game.flame.effortRelight).isNull()
        assertThat(GameOptimistic.withRelit(s, streak = 12, balance = 2).game.flame.effortRelight).isNull()
    }

    @Test
    fun `un geste refuse et la Veilleuse gardent la phrase`() {
        val out = flame(status = FlameStatus.Out, canRelight = false).copy(effortRelight = effort)
        val s = state(game(held = 5, flame = out), meesh(balance = 5))

        assertThat(GameOptimistic.afterRelight(s)).isSameInstanceAs(s)
        assertThat(out.replacing(freezes = 2).effortRelight).isEqualTo(effort)
    }
}
