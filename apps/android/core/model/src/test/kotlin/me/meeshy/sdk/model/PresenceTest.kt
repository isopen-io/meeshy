package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PresenceTest {

    private val now = 1_700_000_000_000L // fixed reference clock (ms)

    private fun iso(epochMillis: Long): String =
        java.time.Instant.ofEpochMilli(epochMillis).toString()

    // MARK: - offline

    @Test
    fun `state is offline when not online regardless of last active`() {
        assertThat(UserPresence(isOnline = false, lastActiveAt = iso(now)).state(now))
            .isEqualTo(PresenceState.OFFLINE)
    }

    @Test
    fun `state is offline when not online even with a stale timestamp`() {
        assertThat(UserPresence(isOnline = false, lastActiveAt = iso(now - 600_000)).state(now))
            .isEqualTo(PresenceState.OFFLINE)
    }

    // MARK: - online (no reliable timestamp keeps online)

    @Test
    fun `state is online when online with a null last active`() {
        assertThat(UserPresence(isOnline = true, lastActiveAt = null).state(now))
            .isEqualTo(PresenceState.ONLINE)
    }

    @Test
    fun `state is online when online with a blank last active`() {
        assertThat(UserPresence(isOnline = true, lastActiveAt = "").state(now))
            .isEqualTo(PresenceState.ONLINE)
    }

    @Test
    fun `state is online when online with an unparseable last active`() {
        assertThat(UserPresence(isOnline = true, lastActiveAt = "not-a-date").state(now))
            .isEqualTo(PresenceState.ONLINE)
    }

    // MARK: - online vs away threshold (5 minutes)

    @Test
    fun `state is online when last active is recent`() {
        assertThat(UserPresence(isOnline = true, lastActiveAt = iso(now - 60_000)).state(now))
            .isEqualTo(PresenceState.ONLINE)
    }

    @Test
    fun `state is online at exactly the five minute boundary`() {
        assertThat(UserPresence(isOnline = true, lastActiveAt = iso(now - 300_000)).state(now))
            .isEqualTo(PresenceState.ONLINE)
    }

    @Test
    fun `state is away just past the five minute boundary`() {
        assertThat(UserPresence(isOnline = true, lastActiveAt = iso(now - 300_001)).state(now))
            .isEqualTo(PresenceState.AWAY)
    }

    @Test
    fun `state is away when last active is well over five minutes ago`() {
        assertThat(UserPresence(isOnline = true, lastActiveAt = iso(now - 3_600_000)).state(now))
            .isEqualTo(PresenceState.AWAY)
    }

    @Test
    fun `state is online when last active is in the future`() {
        assertThat(UserPresence(isOnline = true, lastActiveAt = iso(now + 120_000)).state(now))
            .isEqualTo(PresenceState.ONLINE)
    }
}
