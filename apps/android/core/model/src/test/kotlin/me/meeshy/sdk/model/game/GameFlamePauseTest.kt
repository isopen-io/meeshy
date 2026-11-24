package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Test

/**
 * LA FLAMME EN VEILLE (#17372, #20511) — miroir de `canPauseFlame` (`packages/shared/utils/game/flame-pause.ts`), de
 * `GameFlamePauseLaw` / `GameFlamePause` (iOS, #20510) et de `flame-pause-copy.ts` (web, #20509).
 */
class GameFlamePauseTest {

    private fun servedFlame(pause: JsonElement?): GameFlame? {
        val flame = buildJsonObject {
            GameBlockFixtures.flame().forEach { (key, value) -> put(key, value) }
            if (pause != null) put("pause", pause)
        }
        return GameBlockParser.parse(GameBlockFixtures.block(overrides = mapOf("flame" to flame)))?.flame
    }

    private fun pauseJson(from: String = "2026-10-06", until: String = "2026-10-12"): JsonElement = buildJsonObject {
        put("from", from)
        put("until", until)
    }

    @Test
    fun `le bloc lit la veille servie, et un serveur anterieur n en sert pas`() {
        assertThat(servedFlame(pauseJson())?.pause).isEqualTo(GameFlamePause(from = "2026-10-06", until = "2026-10-12"))
        val older = servedFlame(null)
        assertThat(older).isNotNull()
        assertThat(older?.pause).isNull()
    }

    @Test
    fun `une veille illisible se tait et la Flamme se lit quand meme`() {
        val unreadable = listOf(
            pauseJson(from = "demain"),
            pauseJson(until = "2026-13-40"),
            buildJsonObject { put("from", "2026-10-06") },
            JsonPrimitive("2026-10-06"),
        )
        unreadable.forEach { shape ->
            val flame = servedFlame(shape)
            assertThat(flame).isNotNull()
            assertThat(flame?.pause).isNull()
        }
    }

    @Test
    fun `une veille annoncee commence demain et dure de un a sept jours`() {
        assertThat(GameFlamePauseLaw.canPause(today = "2026-10-05", days = 7, status = FlameStatus.Lit, pause = null))
            .isEqualTo(FlamePauseDecision.Allowed(GameFlamePause(from = "2026-10-06", until = "2026-10-12")))
        assertThat(GameFlamePauseLaw.canPause(today = "2026-10-05", days = 1, status = FlameStatus.AtRisk, pause = null))
            .isEqualTo(FlamePauseDecision.Allowed(GameFlamePause(from = "2026-10-06", until = "2026-10-06")))
        listOf(0, 8, -1).forEach { days ->
            assertThat(GameFlamePauseLaw.canPause(today = "2026-10-05", days = days, status = FlameStatus.Lit, pause = null))
                .isEqualTo(FlamePauseDecision.Refused(FlamePauseRefusal.InvalidDays))
        }
        assertThat(GameFlamePauseLaw.dayChoices).containsExactly(1, 2, 3, 4, 5, 6, 7).inOrder()
    }

    @Test
    fun `sans Flamme vivante, pendant une veille ou deux fois par trimestre, la veille est refusee`() {
        listOf(FlameStatus.None, FlameStatus.Out).forEach { status ->
            assertThat(GameFlamePauseLaw.canPause(today = "2026-10-05", days = 3, status = status, pause = null))
                .isEqualTo(FlamePauseDecision.Refused(FlamePauseRefusal.NoFlame))
        }
        val running = GameFlamePause(from = "2026-10-04", until = "2026-10-08")
        assertThat(GameFlamePauseLaw.canPause(today = "2026-10-05", days = 3, status = FlameStatus.Covered, pause = running))
            .isEqualTo(FlamePauseDecision.Refused(FlamePauseRefusal.AlreadyPaused))
        val earlier = GameFlamePause(from = "2026-10-01", until = "2026-10-02")
        assertThat(GameFlamePauseLaw.canPause(today = "2026-10-05", days = 3, status = FlameStatus.Lit, pause = earlier))
            .isEqualTo(FlamePauseDecision.Refused(FlamePauseRefusal.QuarterlyLimit))
        val lastQuarter = GameFlamePause(from = "2026-09-20", until = "2026-09-22")
        assertThat(GameFlamePauseLaw.canPause(today = "2026-10-05", days = 3, status = FlameStatus.Lit, pause = lastQuarter))
            .isEqualTo(FlamePauseDecision.Allowed(GameFlamePause(from = "2026-10-06", until = "2026-10-08")))
        val emptied = GameFlamePause(from = "2026-10-03", until = "2026-10-02")
        assertThat(GameFlamePauseLaw.canPause(today = "2026-10-05", days = 3, status = FlameStatus.Lit, pause = emptied))
            .isEqualTo(FlamePauseDecision.Allowed(GameFlamePause(from = "2026-10-06", until = "2026-10-08")))
    }

    @Test
    fun `la veille annoncee se distingue de la veille en cours`() {
        val announced = GameFlamePause(from = "2026-10-06", until = "2026-10-12")
        assertThat(announced.startsAfter("2026-10-05")).isTrue()
        assertThat(announced.startsAfter("2026-10-06")).isFalse()
        assertThat(announced.startsAfter("2026-10-09")).isFalse()
    }

    @Test
    fun `seule une Flamme vivante propose la veille`() {
        assertThat(FlameStatus.entries.filter(GameFlamePauseLaw::isBurning))
            .containsExactly(FlameStatus.Lit, FlameStatus.AtRisk, FlameStatus.Covered)
    }

    @Test
    fun `la raison du refus se lit sur le fil, une raison inconnue se tait`() {
        assertThat(FlamePauseRefusal.fromWire("quarterly-limit")).isEqualTo(FlamePauseRefusal.QuarterlyLimit)
        assertThat(FlamePauseRefusal.fromWire("already-paused")).isEqualTo(FlamePauseRefusal.AlreadyPaused)
        assertThat(FlamePauseRefusal.fromWire("no-flame")).isEqualTo(FlamePauseRefusal.NoFlame)
        assertThat(FlamePauseRefusal.fromWire("invalid-days")).isEqualTo(FlamePauseRefusal.InvalidDays)
        assertThat(FlamePauseRefusal.fromWire("une-autre")).isNull()
        assertThat(FlamePauseRefusal.fromWire(null)).isNull()
    }

    @Test
    fun `la reponse de l annonce rend la veille servie`() {
        val response = GameWriteParser.pauseFlame("""{"status":"paused","pause":{"from":"2026-10-06","until":"2026-10-08"}}""")
        assertThat(response).isEqualTo(FlamePauseResponse(status = "paused", pause = GameFlamePause("2026-10-06", "2026-10-08")))
        assertThat(response?.alreadyDone).isFalse()
        assertThat(GameWriteParser.pauseFlame("""{"status":"already-paused","pause":{"from":"2026-10-06","until":"2026-10-08"}}""")?.alreadyDone)
            .isTrue()
        assertThat(GameWriteParser.pauseFlame("""{"status":"paused","pause":{"from":"x","until":"2026-10-08"}}""")).isNull()
        assertThat(GameWriteParser.pauseFlame("""{"status":"paused"}""")).isNull()
    }

    @Test
    fun `le refus d une veille dit sa raison, sinon rien et la phrase generale prend le relais`() {
        assertThat(GameCopyLaws.flamePauseRefusal("quarterly-limit")).isEqualTo(GameText(GameTextKey.FlamePauseQuarterlyLimit))
        assertThat(GameCopyLaws.flamePauseRefusal("already-paused")).isEqualTo(GameText(GameTextKey.FlamePauseAlreadyPaused))
        assertThat(GameCopyLaws.flamePauseRefusal("no-flame")).isEqualTo(GameText(GameTextKey.FlamePauseNoFlame))
        assertThat(GameCopyLaws.flamePauseRefusal("invalid-days")).isNull()
        assertThat(GameCopyLaws.flamePauseRefusal(null)).isNull()
    }

    @Test
    fun `la carte dit la veille, l annonce sur une Flamme vivante, rien sinon`() {
        val lit = GameOptimisticFixtures.flame(status = FlameStatus.Lit)
        val announced = GameFlamePause(from = "2026-10-06", until = "2026-10-12")
        assertThat(GameFlamePauseLaw.section(lit, shown = null, today = "2026-10-05")).isEqualTo(FlamePauseSection.Chooser)
        assertThat(GameFlamePauseLaw.section(lit, shown = announced, today = "2026-10-05"))
            .isEqualTo(FlamePauseSection.Paused(announced, startsTomorrow = true))
        assertThat(GameFlamePauseLaw.section(lit, shown = announced, today = "2026-10-07"))
            .isEqualTo(FlamePauseSection.Paused(announced, startsTomorrow = false))
        assertThat(GameFlamePauseLaw.section(lit.replacing(status = FlameStatus.Out), shown = null, today = "2026-10-05"))
            .isEqualTo(FlamePauseSection.Hidden)
        assertThat(GameFlamePauseLaw.section(lit.replacing(status = FlameStatus.None), shown = null, today = "2026-10-05"))
            .isEqualTo(FlamePauseSection.Hidden)
    }

    @Test
    fun `la phrase de la veille nomme son dernier jour`() {
        val announced = GameFlamePause(from = "2026-10-06", until = "2026-10-12")
        assertThat(GameCopyLaws.flamePaused(FlamePauseSection.Paused(announced, startsTomorrow = true), dayLabel = "lundi 12 octobre"))
            .isEqualTo(GameText.of(GameTextKey.FlamePausedSoon, GameTextArg.Verbatim("lundi 12 octobre")))
        assertThat(GameCopyLaws.flamePaused(FlamePauseSection.Paused(announced, startsTomorrow = false), dayLabel = "lundi 12 octobre"))
            .isEqualTo(GameText.of(GameTextKey.FlamePaused, GameTextArg.Verbatim("lundi 12 octobre")))
        assertThat(GameCopyLaws.flamePauseAction(3))
            .isEqualTo(GameText.of(GameTextKey.FlamePauseAction, GameTextArg.Nested(GameCopyLaws.days(3))))
        assertThat(GameCopyLaws.flamePauseIntro())
            .isEqualTo(GameText.of(GameTextKey.FlamePauseIntro, GameTextArg.Nested(GameCopyLaws.days(7))))
    }
}
