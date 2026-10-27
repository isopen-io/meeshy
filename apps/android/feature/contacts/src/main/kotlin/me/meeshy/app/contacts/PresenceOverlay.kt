package me.meeshy.app.contacts

import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.UserPresence

/**
 * Superpose la carte de présence de la session (`PresenceStore.entries`) sur les champs
 * `isOnline`/`lastActiveAt` du carnet — sans cela ils restent figés au dernier `/friends`. Brique
 * sans état : le *quand* (collecter la carte) vit dans [ContactsListViewModel].
 */
internal object PresenceOverlay {

    /**
     * Applique [entries] au carnet ; un ami absent de la carte garde ce que le REST a servi. Rend
     * la MÊME liste quand rien ne change (pas de réémission d'état).
     */
    fun apply(friends: List<FriendRequestUser>, entries: Map<String, UserPresence>): List<FriendRequestUser> {
        if (entries.isEmpty()) return friends
        var changed = false
        val next = friends.map { friend ->
            val live = entries[friend.id] ?: return@map friend
            if (friend.isOnline == live.isOnline && friend.lastActiveAt == live.lastActiveAt) return@map friend
            changed = true
            friend.copy(isOnline = live.isOnline, lastActiveAt = live.lastActiveAt)
        }
        return if (changed) next else friends
    }
}
