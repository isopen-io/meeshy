package me.meeshy.sdk.model.friend

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.PresenceState
import org.junit.Test

class FriendPresenceTest {

    private val now = 1_700_000_000_000L

    private fun iso(epochMillis: Long): String =
        java.time.Instant.ofEpochMilli(epochMillis).toString()

    private fun user(isOnline: Boolean?, lastActiveAt: String? = null) =
        FriendRequestUser(id = "u", username = "u", isOnline = isOnline, lastActiveAt = lastActiveAt)

    @Test
    fun `presenceState is offline when isOnline is null`() {
        assertThat(user(isOnline = null).presenceState(now)).isEqualTo(PresenceState.OFFLINE)
    }

    @Test
    fun `presenceState is offline when isOnline is false`() {
        assertThat(user(isOnline = false).presenceState(now)).isEqualTo(PresenceState.OFFLINE)
    }

    @Test
    fun `presenceState is online when online and recently active`() {
        assertThat(user(isOnline = true, lastActiveAt = iso(now - 60_000)).presenceState(now))
            .isEqualTo(PresenceState.ONLINE)
    }

    @Test
    fun `presenceState stays online when connected with a stale timestamp`() {
        // isOnline backend est autoritatif : connecte = vert.
        assertThat(user(isOnline = true, lastActiveAt = iso(now - 600_000)).presenceState(now))
            .isEqualTo(PresenceState.ONLINE)
    }

    @Test
    fun `presenceState is away when disconnected but active 10 minutes ago`() {
        assertThat(user(isOnline = false, lastActiveAt = iso(now - 600_000)).presenceState(now))
            .isEqualTo(PresenceState.AWAY)
    }

    @Test
    fun `presenceState is online when online with no timestamp`() {
        assertThat(user(isOnline = true, lastActiveAt = null).presenceState(now))
            .isEqualTo(PresenceState.ONLINE)
    }
}
