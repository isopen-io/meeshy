package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Locks the canonical 1/3/5 presence rule shared with web
 * (`packages/shared/utils/user-presence.ts`) and iOS (`UserPresence.state`):
 *   isOnline == true -> ONLINE (GREEN, pulse) — the backend flag is authoritative,
 *                       anti-stale guard: ignored when lastActiveAt > 5min
 *   <= 60s   -> ONLINE  (green, pulse)
 *   <= 3min  -> AWAY    (orange)
 *   <= 5min  -> IDLE    (grey, DISPLAYED)
 *   > 5min   -> OFFLINE (no dot); no data + disconnected -> OFFLINE.
 */
class PresenceTest {

    private val now = 1_700_000_000_000L // fixed reference clock (ms)

    private fun iso(epochMillis: Long): String =
        java.time.Instant.ofEpochMilli(epochMillis).toString()

    // MARK: - isOnline backend flag is authoritative

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

    @Test
    fun `connected user stays online while last active is within five minutes`() {
        assertThat(UserPresence(isOnline = true, lastActiveAt = iso(now - 60_001)).state(now))
            .isEqualTo(PresenceState.ONLINE)
        assertThat(UserPresence(isOnline = true, lastActiveAt = iso(now - 299_000)).state(now))
            .isEqualTo(PresenceState.ONLINE)
        assertThat(UserPresence(isOnline = true, lastActiveAt = iso(now - 300_000)).state(now))
            .isEqualTo(PresenceState.ONLINE)
    }

    @Test
    fun `anti-stale guard - isOnline is ignored when last active is beyond 5 minutes`() {
        assertThat(UserPresence(isOnline = true, lastActiveAt = iso(now - 300_001)).state(now))
            .isEqualTo(PresenceState.OFFLINE)
        assertThat(UserPresence(isOnline = true, lastActiveAt = iso(now - 1_800_000)).state(now))
            .isEqualTo(PresenceState.OFFLINE)
    }

    // MARK: - Time decay when disconnected

    @Test
    fun `state is online when active within the last 60 seconds`() {
        assertThat(UserPresence(isOnline = false, lastActiveAt = iso(now - 20_000)).state(now))
            .isEqualTo(PresenceState.ONLINE)
    }

    @Test
    fun `state is online at exactly the 60 second boundary`() {
        assertThat(UserPresence(isOnline = false, lastActiveAt = iso(now - 60_000)).state(now))
            .isEqualTo(PresenceState.ONLINE)
    }

    @Test
    fun `state is away just past 60 seconds`() {
        assertThat(UserPresence(isOnline = false, lastActiveAt = iso(now - 60_001)).state(now))
            .isEqualTo(PresenceState.AWAY)
    }

    @Test
    fun `state is away at exactly the three minute boundary`() {
        assertThat(UserPresence(isOnline = false, lastActiveAt = iso(now - 180_000)).state(now))
            .isEqualTo(PresenceState.AWAY)
    }

    @Test
    fun `state is idle just past the three minute boundary`() {
        assertThat(UserPresence(isOnline = false, lastActiveAt = iso(now - 180_001)).state(now))
            .isEqualTo(PresenceState.IDLE)
    }

    @Test
    fun `state is idle at exactly the five minute boundary`() {
        assertThat(UserPresence(isOnline = false, lastActiveAt = iso(now - 300_000)).state(now))
            .isEqualTo(PresenceState.IDLE)
    }

    @Test
    fun `state is offline just past the five minute boundary`() {
        assertThat(UserPresence(isOnline = false, lastActiveAt = iso(now - 300_001)).state(now))
            .isEqualTo(PresenceState.OFFLINE)
    }

    @Test
    fun `state is online when last active is in the future`() {
        assertThat(UserPresence(isOnline = false, lastActiveAt = iso(now + 120_000)).state(now))
            .isEqualTo(PresenceState.ONLINE)
    }

    // MARK: - Freshly disconnected users decay by time

    @Test
    fun `state is away when disconnected but active 2 minutes ago`() {
        assertThat(UserPresence(isOnline = false, lastActiveAt = iso(now - 120_000)).state(now))
            .isEqualTo(PresenceState.AWAY)
    }

    @Test
    fun `state is idle when disconnected and active 4 minutes ago`() {
        assertThat(UserPresence(isOnline = false, lastActiveAt = iso(now - 240_000)).state(now))
            .isEqualTo(PresenceState.IDLE)
    }

    @Test
    fun `state is offline when disconnected past 5 minutes`() {
        assertThat(UserPresence(isOnline = false, lastActiveAt = iso(now - 360_000)).state(now))
            .isEqualTo(PresenceState.OFFLINE)
    }

    // MARK: - Window constants (cross-platform parity)

    @Test
    fun `windows are 60s - 3min - 5min`() {
        assertThat(UserPresence.ONLINE_WINDOW_MS).isEqualTo(60_000L)
        assertThat(UserPresence.AWAY_WINDOW_MS).isEqualTo(180_000L)
        assertThat(UserPresence.IDLE_WINDOW_MS).isEqualTo(300_000L)
    }
}
