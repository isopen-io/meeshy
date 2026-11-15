package me.meeshy.sdk.model.presence

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.UserPresence
import org.junit.Test
import java.time.Instant

class PresenceDecayClockTest {

    private val now = 1_700_000_000_000L
    private fun iso(offsetMs: Long) = Instant.ofEpochMilli(now + offsetMs).toString()

    private fun settledNow(presence: UserPresence) =
        PresenceDecayClock.isSettled(presence, PresenceDecayClock.derive(presence, now))

    @Test
    fun `a recently active peer still decays, so the clock keeps ticking`() {
        assertThat(settledNow(UserPresence(isOnline = false, lastActiveAt = iso(-30_000)))).isFalse()
        assertThat(settledNow(UserPresence(isOnline = true, lastActiveAt = iso(-30_000)))).isFalse()
    }

    @Test
    fun `an offline entry is settled — only a new entry can light it again`() {
        val stale = UserPresence(isOnline = false, lastActiveAt = iso(-600_000))
        assertThat(PresenceDecayClock.derive(stale, now)).isEqualTo(PresenceState.OFFLINE)
        assertThat(settledNow(stale)).isTrue()
        assertThat(settledNow(UserPresence(isOnline = true, lastActiveAt = iso(-600_000)))).isTrue()
    }

    @Test
    fun `an entry without an activity date never changes with time`() {
        assertThat(settledNow(UserPresence(isOnline = true, lastActiveAt = null))).isTrue()
        assertThat(settledNow(UserPresence(isOnline = false, lastActiveAt = null))).isTrue()
    }

    @Test
    fun `a future timestamp is green now but will decay, so it is not settled`() {
        assertThat(settledNow(UserPresence(isOnline = false, lastActiveAt = iso(60_000)))).isFalse()
    }
}
