package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Locks the canonical presence rule shared with web
 * (`packages/shared/utils/user-presence.ts`) and iOS (`UserPresence.state`):
 *   isOnline == true -> ONLINE (GREEN, pulse) — the backend flag is authoritative,
 *                       anti-stale guard: ignored when lastActiveAt > 30min
 *   <= 60s   -> ONLINE  (green, pulse)
 *   <= 5min  -> RECENT  (green)
 *   <= 30min -> AWAY    (orange)
 *   > 30min  -> OFFLINE (gray); no data + disconnected -> OFFLINE.
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
    fun `connected user stays online even with a minutes-old last active`() {
        assertThat(UserPresence(isOnline = true, lastActiveAt = iso(now - 60_001)).state(now))
            .isEqualTo(PresenceState.ONLINE)
        assertThat(UserPresence(isOnline = true, lastActiveAt = iso(now - 600_000)).state(now))
            .isEqualTo(PresenceState.ONLINE)
        assertThat(UserPresence(isOnline = true, lastActiveAt = iso(now - 1_800_000)).state(now))
            .isEqualTo(PresenceState.ONLINE)
    }

    @Test
    fun `anti-stale guard - isOnline is ignored when last active is beyond 30 minutes`() {
        assertThat(UserPresence(isOnline = true, lastActiveAt = iso(now - 1_800_001)).state(now))
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
    fun `state is recent just past 60 seconds`() {
        assertThat(UserPresence(isOnline = false, lastActiveAt = iso(now - 60_001)).state(now))
            .isEqualTo(PresenceState.RECENT)
    }

    @Test
    fun `state is recent at exactly the five minute boundary`() {
        assertThat(UserPresence(isOnline = false, lastActiveAt = iso(now - 300_000)).state(now))
            .isEqualTo(PresenceState.RECENT)
    }

    @Test
    fun `state is away just past the five minute boundary`() {
        assertThat(UserPresence(isOnline = false, lastActiveAt = iso(now - 300_001)).state(now))
            .isEqualTo(PresenceState.AWAY)
    }

    @Test
    fun `state is away at exactly the thirty minute boundary`() {
        assertThat(UserPresence(isOnline = false, lastActiveAt = iso(now - 1_800_000)).state(now))
            .isEqualTo(PresenceState.AWAY)
    }

    @Test
    fun `state is offline just past the thirty minute boundary`() {
        assertThat(UserPresence(isOnline = false, lastActiveAt = iso(now - 1_800_001)).state(now))
            .isEqualTo(PresenceState.OFFLINE)
    }

    @Test
    fun `state is online when last active is in the future`() {
        assertThat(UserPresence(isOnline = false, lastActiveAt = iso(now + 120_000)).state(now))
            .isEqualTo(PresenceState.ONLINE)
    }

    // MARK: - Freshly disconnected users decay by time

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
