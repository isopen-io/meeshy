package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Locks the canonical presence-dot rule shared with web (`getUserStatus`) and iOS
 * (`UserPresence.state`), pure time decay on lastActiveAt (frozen by the gateway on
 * disconnect):
 *   <= 60s   -> ONLINE  (orange, pulse)
 *   <= 5min  -> RECENT  (orange)
 *   <= 30min -> AWAY    (gray)
 *   > 30min  -> OFFLINE (no dot); isOnline is only a fallback when no timestamp.
 */
class PresenceTest {

    private val now = 1_700_000_000_000L // fixed reference clock (ms)

    private fun iso(epochMillis: Long): String =
        java.time.Instant.ofEpochMilli(epochMillis).toString()

    // MARK: - Fallback on isOnline when no reliable timestamp

    @Test
    fun `state is offline when disconnected with no last active`() {
        assertThat(UserPresence(isOnline = false, lastActiveAt = null).state(now))
            .isEqualTo(PresenceState.OFFLINE)
    }

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

    // MARK: - Time decay drives the dot regardless of isOnline

    @Test
    fun `state is online when active within the last 60 seconds`() {
        assertThat(UserPresence(isOnline = true, lastActiveAt = iso(now - 20_000)).state(now))
            .isEqualTo(PresenceState.ONLINE)
    }

    @Test
    fun `state is online at exactly the 60 second boundary`() {
        assertThat(UserPresence(isOnline = true, lastActiveAt = iso(now - 60_000)).state(now))
            .isEqualTo(PresenceState.ONLINE)
    }

    @Test
    fun `state is recent just past 60 seconds`() {
        assertThat(UserPresence(isOnline = true, lastActiveAt = iso(now - 60_001)).state(now))
            .isEqualTo(PresenceState.RECENT)
    }

    @Test
    fun `state is recent at exactly the five minute boundary`() {
        assertThat(UserPresence(isOnline = true, lastActiveAt = iso(now - 300_000)).state(now))
            .isEqualTo(PresenceState.RECENT)
    }

    @Test
    fun `state is away just past the five minute boundary`() {
        assertThat(UserPresence(isOnline = true, lastActiveAt = iso(now - 300_001)).state(now))
            .isEqualTo(PresenceState.AWAY)
    }

    @Test
    fun `state is away at exactly the thirty minute boundary`() {
        assertThat(UserPresence(isOnline = true, lastActiveAt = iso(now - 1_800_000)).state(now))
            .isEqualTo(PresenceState.AWAY)
    }

    @Test
    fun `state is offline just past the thirty minute boundary`() {
        assertThat(UserPresence(isOnline = true, lastActiveAt = iso(now - 1_800_001)).state(now))
            .isEqualTo(PresenceState.OFFLINE)
    }

    @Test
    fun `state is online when last active is in the future`() {
        assertThat(UserPresence(isOnline = true, lastActiveAt = iso(now + 120_000)).state(now))
            .isEqualTo(PresenceState.ONLINE)
    }

    // MARK: - Freshly disconnected users decay by time (the reported bug fix)

    @Test
    fun `state is recent when disconnected but active 3 minutes ago`() {
        assertThat(UserPresence(isOnline = false, lastActiveAt = iso(now - 180_000)).state(now))
            .isEqualTo(PresenceState.RECENT)
    }

    @Test
    fun `state is away when disconnected and active 10 minutes ago`() {
        assertThat(UserPresence(isOnline = false, lastActiveAt = iso(now - 600_000)).state(now))
            .isEqualTo(PresenceState.AWAY)
    }

    @Test
    fun `state is offline when disconnected past 30 minutes`() {
        assertThat(UserPresence(isOnline = false, lastActiveAt = iso(now - 1_860_000)).state(now))
            .isEqualTo(PresenceState.OFFLINE)
    }
}
