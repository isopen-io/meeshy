package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import org.junit.Test

class GameMissionClockTest {

    private fun millis(iso: String): Long = Instant.parse(iso).toEpochMilli()

    @Test
    fun `la phase suit a venir, en cours puis manquee`() {
        val start = 1_000L
        val end = 5_000L
        assertThat(GameMissionClock.phase(start, end, false, 400L)).isEqualTo(MissionPhase.Upcoming(600L))
        assertThat(GameMissionClock.phase(start, end, false, 1_000L)).isEqualTo(MissionPhase.Running(4_000L))
        assertThat(GameMissionClock.phase(start, end, false, 5_000L)).isEqualTo(MissionPhase.Missed)
    }

    @Test
    fun `faite avant la fin puis terminee passe la fin`() {
        assertThat(GameMissionClock.phase(null, 5_000L, true, 2_000L)).isEqualTo(MissionPhase.Done)
        assertThat(GameMissionClock.phase(null, 5_000L, true, 6_000L)).isEqualTo(MissionPhase.Finished)
        assertThat(GameMissionClock.phase(1_000L, 5_000L, true, 100L)).isEqualTo(MissionPhase.Done)
    }

    @Test
    fun `sans debut la mission du jour court jusqu'a la fin`() {
        assertThat(GameMissionClock.phase(null, 5_000L, false, 100L)).isEqualTo(MissionPhase.Running(4_900L))
    }

    @Test
    fun `seule la phase en cours autorise l'action et seules les phases d'attente comptent`() {
        assertThat(MissionPhase.Running(1L).allowsAction).isTrue()
        assertThat(MissionPhase.Upcoming(1L).allowsAction).isFalse()
        assertThat(MissionPhase.Missed.allowsAction).isFalse()
        assertThat(MissionPhase.Upcoming(1L).isCounting).isTrue()
        assertThat(MissionPhase.Done.isCounting).isFalse()
    }

    @Test
    fun `la fin du jour est minuit du fuseau du compte`() {
        assertThat(GameMissionClock.endOfDayMillis("2026-10-05", "UTC")).isEqualTo(millis("2026-10-06T00:00:00Z"))
        assertThat(GameMissionClock.endOfDayMillis("2026-10-05", "Europe/Paris")).isEqualTo(millis("2026-10-05T22:00:00Z"))
        assertThat(GameMissionClock.endOfDayMillis("2026-10-05", "America/Los_Angeles")).isEqualTo(millis("2026-10-06T07:00:00Z"))
    }

    @Test
    fun `un compte sans fuseau ferme a minuit UTC et une cle illisible n'a pas de fin`() {
        assertThat(GameMissionClock.endOfDayMillis("2026-10-05", null)).isEqualTo(millis("2026-10-06T00:00:00Z"))
        assertThat(GameMissionClock.endOfDayMillis("2026-10-05", "Nope/Zone")).isEqualTo(millis("2026-10-06T00:00:00Z"))
        assertThat(GameMissionClock.endOfDayMillis("2026-02-30", "UTC")).isNull()
    }

    @Test
    fun `le changement d'heure ne decale pas la fin du jour`() {
        assertThat(GameMissionClock.endOfDayMillis("2026-10-25", "Europe/Paris")).isEqualTo(millis("2026-10-25T23:00:00Z"))
    }

    @Test
    fun `la duree restante est calme, jamais de secondes`() {
        val min = 60_000L
        assertThat(GameMissionClock.calmDuration(0)).isEqualTo(CalmDuration.Minutes(1))
        assertThat(GameMissionClock.calmDuration(59_000L)).isEqualTo(CalmDuration.Minutes(1))
        assertThat(GameMissionClock.calmDuration(25 * min)).isEqualTo(CalmDuration.Minutes(25))
        assertThat(GameMissionClock.calmDuration(125 * min)).isEqualTo(CalmDuration.Hours(2, 5))
        assertThat(GameMissionClock.calmDuration((26 * 60 + 10) * min)).isEqualTo(CalmDuration.DaysHours(1, 2))
    }

    @Test
    fun `le rafraichissement se resserre sous l'heure`() {
        assertThat(GameMissionClock.refreshIntervalMillis(3_600_001L)).isEqualTo(60_000L)
        assertThat(GameMissionClock.refreshIntervalMillis(3_600_000L)).isEqualTo(30_000L)
    }
}
