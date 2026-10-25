package me.meeshy.sdk.model.profile

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.UserStatusEvent
import org.junit.Test

class ProfileLivePresenceTest {

    private val now = Instant.parse("2026-10-24T12:00:00Z").toEpochMilli()
    private fun ago(seconds: Long): String = Instant.ofEpochMilli(now - seconds * 1_000L).toString()
    private fun live(isOnline: Boolean, lastActiveAt: String?) =
        UserStatusEvent(userId = "u1", isOnline = isOnline, lastActiveAt = lastActiveAt)

    @Test
    fun `l'entree temps reel gagne sur le cliche REST`() {
        val state = ProfileLivePresence.state(
            live = live(isOnline = true, lastActiveAt = ago(5)),
            restIsOnline = false,
            restLastActiveAt = ago(3_600),
            nowEpochMillis = now,
        )

        assertThat(state).isEqualTo(PresenceState.ONLINE)
    }

    @Test
    fun `sans temps reel le cliche REST decide`() {
        val state = ProfileLivePresence.state(live = null, restIsOnline = false, restLastActiveAt = ago(120), nowEpochMillis = now)

        assertThat(state).isEqualTo(PresenceState.AWAY)
    }

    @Test
    fun `rien servi par la passerelle donne aucune presence`() {
        assertThat(ProfileLivePresence.state(null, null, null, now)).isNull()
        assertThat(ProfileLivePresence.line(null, null, null, now)).isNull()
    }

    @Test
    fun `la ligne suit la presence vert orange puis gris`() {
        assertThat(ProfileLivePresence.line(null, false, ago(10), now)?.tone).isEqualTo(ProfilePresenceTone.ACTIVE)
        assertThat(ProfileLivePresence.line(null, false, ago(120), now)?.tone).isEqualTo(ProfilePresenceTone.AWAY)
        assertThat(ProfileLivePresence.line(null, false, ago(240), now)?.tone).isEqualTo(ProfilePresenceTone.MUTED)
        assertThat(ProfileLivePresence.line(null, false, ago(86_400), now)?.tone).isEqualTo(ProfilePresenceTone.MUTED)
    }

    @Test
    fun `sans date de derniere activite la ligne ne dit rien`() {
        assertThat(ProfileLivePresence.line(null, restIsOnline = true, restLastActiveAt = null, nowEpochMillis = now)).isNull()
    }

    @Test
    fun `une frappe forcee met la ligne au vert`() {
        val forced = live(isOnline = true, lastActiveAt = Instant.ofEpochMilli(now).toString())

        val line = ProfileLivePresence.line(forced, restIsOnline = false, restLastActiveAt = ago(7_200), nowEpochMillis = now)

        assertThat(line?.tone).isEqualTo(ProfilePresenceTone.ACTIVE)
        assertThat(line?.lastActiveAtEpochMillis).isEqualTo(now)
    }

    @Test
    fun `une entree temps reel sans date garde la date du cliche`() {
        val line = ProfileLivePresence.line(live(isOnline = false, lastActiveAt = null), false, ago(120), now)

        assertThat(line?.tone).isEqualTo(ProfilePresenceTone.AWAY)
    }
}
