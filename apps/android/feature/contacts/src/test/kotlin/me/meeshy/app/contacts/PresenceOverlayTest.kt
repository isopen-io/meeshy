package me.meeshy.app.contacts

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.PresenceSnapshotEvent
import me.meeshy.sdk.model.UserStatusEvent
import org.junit.Test

/**
 * Pure merge logic overlaying live `user:status`/`presence:snapshot` socket
 * frames onto the Contacts roster's REST-fetched `isOnline`/`lastActiveAt`
 * fields — those never updated live before this slice, frozen at whatever the
 * last full `/friends` fetch returned (`ContactsListTab.kt`'s
 * `friend.presenceState(...)` reads straight off the static roster).
 */
class PresenceOverlayTest {

    private fun friend(id: String, isOnline: Boolean? = null, lastActiveAt: String? = null) =
        FriendRequestUser(id = id, username = "user-$id", isOnline = isOnline, lastActiveAt = lastActiveAt)

    @Test
    fun `a status update marks the matching friend online`() {
        val friends = listOf(friend("u1", isOnline = false))

        val updated = PresenceOverlay.applyStatus(
            friends,
            UserStatusEvent(userId = "u1", isOnline = true, lastActiveAt = "2026-08-11T20:00:00.000Z"),
        )

        assertThat(updated.single().isOnline).isTrue()
        assertThat(updated.single().lastActiveAt).isEqualTo("2026-08-11T20:00:00.000Z")
    }

    @Test
    fun `a status update leaves other friends untouched`() {
        val friends = listOf(friend("u1", isOnline = false), friend("u2", isOnline = true))

        val updated = PresenceOverlay.applyStatus(friends, UserStatusEvent(userId = "u1", isOnline = true))

        assertThat(updated.first { it.id == "u2" }.isOnline).isTrue()
    }

    @Test
    fun `a status update for an unknown user id is a no-op`() {
        val friends = listOf(friend("u1", isOnline = false))

        val updated = PresenceOverlay.applyStatus(friends, UserStatusEvent(userId = "ghost", isOnline = true))

        assertThat(updated).isEqualTo(friends)
    }

    @Test
    fun `a snapshot updates every matching friend`() {
        val friends = listOf(friend("u1", isOnline = false), friend("u2", isOnline = false))
        val snapshot = PresenceSnapshotEvent(
            users = listOf(
                UserStatusEvent(userId = "u1", isOnline = true),
                UserStatusEvent(userId = "u2", isOnline = false, lastActiveAt = "2026-08-11T18:00:00.000Z"),
            ),
        )

        val updated = PresenceOverlay.applySnapshot(friends, snapshot)

        assertThat(updated.first { it.id == "u1" }.isOnline).isTrue()
        assertThat(updated.first { it.id == "u2" }.lastActiveAt).isEqualTo("2026-08-11T18:00:00.000Z")
    }

    @Test
    fun `a friend absent from the snapshot is left untouched`() {
        val friends = listOf(friend("u1", isOnline = true), friend("u2", isOnline = false))
        val snapshot = PresenceSnapshotEvent(users = listOf(UserStatusEvent(userId = "u1", isOnline = false)))

        val updated = PresenceOverlay.applySnapshot(friends, snapshot)

        assertThat(updated.first { it.id == "u2" }.isOnline).isFalse()
    }

    @Test
    fun `an empty snapshot is a no-op`() {
        val friends = listOf(friend("u1", isOnline = true))

        val updated = PresenceOverlay.applySnapshot(friends, PresenceSnapshotEvent(users = emptyList()))

        assertThat(updated).isEqualTo(friends)
    }
}
