package me.meeshy.app.contacts

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.UserPresence
import org.junit.Test

/** Superposition de la carte de présence unique sur le carnet (figé au dernier `/friends` sinon). */
class PresenceOverlayTest {

    private fun friend(id: String, isOnline: Boolean? = null, lastActiveAt: String? = null) =
        FriendRequestUser(id = id, username = "user-$id", isOnline = isOnline, lastActiveAt = lastActiveAt)

    @Test
    fun `an entry marks the matching friend online with its date`() {
        val updated = PresenceOverlay.apply(
            listOf(friend("u1", isOnline = false)),
            mapOf("u1" to UserPresence(true, "2026-08-11T20:00:00.000Z")),
        )

        assertThat(updated.single().isOnline).isTrue()
        assertThat(updated.single().lastActiveAt).isEqualTo("2026-08-11T20:00:00.000Z")
    }

    @Test
    fun `a friend absent from the map keeps what the REST served`() {
        val friends = listOf(friend("u1", isOnline = true), friend("u2", isOnline = false))

        val updated = PresenceOverlay.apply(friends, mapOf("u1" to UserPresence(false, null)))

        assertThat(updated.first { it.id == "u2" }.isOnline).isFalse()
        assertThat(updated.first { it.id == "u1" }.isOnline).isFalse()
    }

    @Test
    fun `an entry for someone outside the roster is a no-op`() {
        val friends = listOf(friend("u1", isOnline = false))

        assertThat(PresenceOverlay.apply(friends, mapOf("ghost" to UserPresence(true, null)))).isSameInstanceAs(friends)
    }

    @Test
    fun `an empty map or an identical entry leaves the very same list`() {
        val friends = listOf(friend("u1", isOnline = true, lastActiveAt = "x"))

        assertThat(PresenceOverlay.apply(friends, emptyMap())).isSameInstanceAs(friends)
        assertThat(PresenceOverlay.apply(friends, mapOf("u1" to UserPresence(true, "x")))).isSameInstanceAs(friends)
    }
}
