package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import org.junit.Test

class GameMissionWindowTest {

    private val day = "2026-10-27"

    private fun mission(id: String, done: Boolean) = GameMission(
        id = id, templateKey = "send_texts", difficulty = MissionDifficulty.Easy, signal = "s",
        prism = false, target = 3, progress = if (done) 3 else 0, reward = 100, glory = 0,
        completedAt = if (done) "2026-10-27T10:00:00Z" else null,
    )

    private fun missions(vararg done: Boolean, rerollAvailable: Boolean = true) = GameMissions(
        dayKey = day, prismDay = false, unlocked = true,
        items = done.mapIndexed { index, isDone -> mission("m$index", isDone) },
        rerollAvailable = rerollAvailable,
    )

    private fun at(iso: String) = Instant.parse(iso).toEpochMilli()

    @Test
    fun `le jour de jeu se ferme a minuit du fuseau du compte, jamais de l appareil`() {
        val paris = MissionWindow.ofDay(day, "Europe/Paris")
        val tokyo = MissionWindow.ofDay(day, "Asia/Tokyo")

        assertThat(paris.endMillis).isEqualTo(at("2026-10-27T23:00:00Z"))
        assertThat(tokyo.endMillis).isEqualTo(at("2026-10-27T15:00:00Z"))
        assertThat(MissionWindow.ofDay(day, null).endMillis).isEqualTo(at("2026-10-28T00:00:00Z"))
    }

    @Test
    fun `une cle de jour illisible laisse la carte sans minuteur`() {
        val window = MissionWindow.ofDay("pas-un-jour", "Europe/Paris")

        assertThat(window.endMillis).isNull()
        assertThat(window.phase(completed = false, nowMillis = 0L)).isNull()
    }

    @Test
    fun `la plage de la mission personnelle est celle que la passerelle sert`() {
        val personal = GamePersonalMission(
            id = "p1", templateKey = "send_texts", difficulty = MissionDifficulty.Easy, signal = "s", prism = false,
            target = 3, progress = 0, reward = 100, glory = 0, startsAt = "2026-10-27T14:00:00.000Z",
            endsAt = "2026-10-27T16:00:00.000Z", state = PersonalMissionState.Upcoming,
        )

        val window = MissionWindow.of(personal)

        assertThat(window.startMillis).isEqualTo(at("2026-10-27T14:00:00Z"))
        assertThat(window.phase(false, at("2026-10-27T13:00:00Z"))).isEqualTo(MissionPhase.Upcoming(3_600_000L))
        assertThat(window.phase(false, at("2026-10-27T15:00:00Z"))).isEqualTo(MissionPhase.Running(3_600_000L))
        assertThat(window.phase(true, at("2026-10-27T17:00:00Z"))).isEqualTo(MissionPhase.Finished)
        assertThat(window.phase(false, at("2026-10-27T17:00:00Z"))).isEqualTo(MissionPhase.Missed)
    }

    @Test
    fun `la rangee du changement disparait apres la fin du jour de jeu`() {
        val todo = missions(false, true, false)

        assertThat(GameMissionCardLaws.rerollRowShown(todo, "Europe/Paris", affordable = true, nowMillis = at("2026-10-27T20:00:00Z"))).isTrue()
        assertThat(GameMissionCardLaws.rerollRowShown(todo, "Europe/Paris", affordable = true, nowMillis = at("2026-10-27T23:00:00Z"))).isFalse()
    }

    @Test
    fun `sans Meesh la rangee reste pour dire combien il en manque, sans acte a faire elle se tait`() {
        val now = at("2026-10-27T12:00:00Z")

        assertThat(GameMissionCardLaws.rerollRowShown(missions(false, rerollAvailable = false), null, affordable = false, nowMillis = now)).isTrue()
        assertThat(GameMissionCardLaws.rerollRowShown(missions(false, rerollAvailable = false), null, affordable = true, nowMillis = now)).isFalse()
        assertThat(GameMissionCardLaws.rerollRowShown(missions(true, true, true), null, affordable = false, nowMillis = now)).isFalse()
    }

    @Test
    fun `le bouton Changer ne vit que tant que la plage court`() {
        assertThat(GameMissionCardLaws.rerollButtonShown(canReroll = true, completed = false, phase = null)).isTrue()
        assertThat(GameMissionCardLaws.rerollButtonShown(true, false, MissionPhase.Running(1_000L))).isTrue()
        assertThat(GameMissionCardLaws.rerollButtonShown(true, false, MissionPhase.Missed)).isFalse()
        assertThat(GameMissionCardLaws.rerollButtonShown(true, true, MissionPhase.Running(1_000L))).isFalse()
        assertThat(GameMissionCardLaws.rerollButtonShown(false, false, MissionPhase.Running(1_000L))).isFalse()
    }

    @Test
    fun `le minuteur est calme - une minute au-dela d une heure, trente secondes ensuite, une heure une fois la plage passee`() {
        val window = MissionWindow(null, at("2026-10-27T12:00:00Z"))

        assertThat(GameMissionCardLaws.refreshDelayMillis(window, at("2026-10-27T09:00:00Z"))).isEqualTo(60_000L)
        assertThat(GameMissionCardLaws.refreshDelayMillis(window, at("2026-10-27T11:30:00Z"))).isEqualTo(30_000L)
        assertThat(GameMissionCardLaws.refreshDelayMillis(window, at("2026-10-27T13:00:00Z"))).isEqualTo(3_600_000L)
        assertThat(GameMissionCardLaws.refreshDelayMillis(MissionWindow(null, null), 0L)).isEqualTo(3_600_000L)
    }
}
