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

    private fun FriendRequestUser.stateAt(nowEpochMillis: Long): PresenceState =
        servedPresence()?.state(nowEpochMillis) ?: PresenceState.OFFLINE

    @Test
    fun `une ligne qui ne sert aucune presence n'en fabrique pas`() {
        assertThat(user(isOnline = null, lastActiveAt = null).servedPresence()).isNull()
    }

    @Test
    fun `la presence servie passe du vert a l'orange puis au gris avec la seule horloge`() {
        val served = user(isOnline = false, lastActiveAt = iso(now)).servedPresence()
        assertThat(served?.state(now + 30_000)).isEqualTo(PresenceState.ONLINE)
        assertThat(served?.state(now + 90_000)).isEqualTo(PresenceState.AWAY)
        assertThat(served?.state(now + 240_000)).isEqualTo(PresenceState.IDLE)
        assertThat(served?.state(now + 400_000)).isEqualTo(PresenceState.OFFLINE)
    }

    @Test
    fun `presenceState is offline when isOnline is null`() {
        assertThat(user(isOnline = null).stateAt(now)).isEqualTo(PresenceState.OFFLINE)
    }

    @Test
    fun `presenceState is offline when isOnline is false`() {
        assertThat(user(isOnline = false).stateAt(now)).isEqualTo(PresenceState.OFFLINE)
    }

    @Test
    fun `presenceState is online when online and recently active`() {
        assertThat(user(isOnline = true, lastActiveAt = iso(now - 60_000)).stateAt(now))
            .isEqualTo(PresenceState.ONLINE)
    }

    @Test
    fun `presenceState stays online when connected within the five minute guard`() {
        // isOnline backend est autoritatif tant que lastActiveAt <= 5 min.
        assertThat(user(isOnline = true, lastActiveAt = iso(now - 240_000)).stateAt(now))
            .isEqualTo(PresenceState.ONLINE)
    }

    @Test
    fun `presenceState decays when connected with a stale timestamp beyond 5 minutes`() {
        assertThat(user(isOnline = true, lastActiveAt = iso(now - 600_000)).stateAt(now))
            .isEqualTo(PresenceState.OFFLINE)
    }

    @Test
    fun `presenceState is away when disconnected but active 2 minutes ago`() {
        assertThat(user(isOnline = false, lastActiveAt = iso(now - 120_000)).stateAt(now))
            .isEqualTo(PresenceState.AWAY)
    }

    @Test
    fun `presenceState is idle when disconnected but active 4 minutes ago`() {
        assertThat(user(isOnline = false, lastActiveAt = iso(now - 240_000)).stateAt(now))
            .isEqualTo(PresenceState.IDLE)
    }

    @Test
    fun `presenceState is online when online with no timestamp`() {
        assertThat(user(isOnline = true, lastActiveAt = null).stateAt(now))
            .isEqualTo(PresenceState.ONLINE)
    }
}
