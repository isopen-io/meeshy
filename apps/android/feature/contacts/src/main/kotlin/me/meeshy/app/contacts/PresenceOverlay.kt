package me.meeshy.app.contacts

import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.PresenceSnapshotEvent
import me.meeshy.sdk.model.UserStatusEvent

/**
 * Overlays live `user:status`/`presence:snapshot` socket frames onto the
 * Contacts roster's `isOnline`/`lastActiveAt` fields — those otherwise only
 * update on a full `/friends` refetch, so a friend going online/offline never
 * paints on this screen until the user leaves and re-enters it. A stateless
 * building block: the *when* to collect these flows lives in
 * [ContactsListViewModel], this only owns the *what*.
 */
internal object PresenceOverlay {

    /** Applies a single [event] to the matching friend; every other row is unchanged. */
    fun applyStatus(friends: List<FriendRequestUser>, event: UserStatusEvent): List<FriendRequestUser> =
        friends.map { friend ->
            if (friend.id == event.userId) {
                friend.copy(isOnline = event.isOnline, lastActiveAt = event.lastActiveAt)
            } else {
                friend
            }
        }

    /** Applies every entry of [snapshot] in one pass; a friend absent from it is unchanged. */
    fun applySnapshot(friends: List<FriendRequestUser>, snapshot: PresenceSnapshotEvent): List<FriendRequestUser> {
        if (snapshot.users.isEmpty()) return friends
        val byId = snapshot.users.associateBy { it.userId }
        return friends.map { friend ->
            byId[friend.id]?.let { event ->
                friend.copy(isOnline = event.isOnline, lastActiveAt = event.lastActiveAt)
            } ?: friend
        }
    }
}
