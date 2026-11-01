package me.meeshy.sdk.model.mention

import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.MentionCandidate

/**
 * Le cache local de contacts de la mention (#14053) : les amis acceptés déjà en cache, prêts à
 * être servis au premier « @ » sans attendre le réseau. Un ami sans pseudo ne s'adresse pas, un
 * bloqué ne se propose pas, et un ami répété ne compte qu'une fois. Le nom affiché retombe sur
 * prénom et nom, puis sur le pseudo.
 */
object MentionContactRoster {

    fun fromFriends(friends: List<FriendRequestUser>, blocked: Set<String>): List<MentionCandidate> =
        friends
            .filterNot { it.id in blocked }
            .mapNotNull { it.toCandidate() }
            .distinctBy { it.id }

    private fun FriendRequestUser.toCandidate(): MentionCandidate? {
        val handle = username.trim()
        if (handle.isEmpty()) return null
        val fullName = listOfNotNull(firstName?.trim(), lastName?.trim())
            .filter { it.isNotEmpty() }
            .joinToString(" ")
        val name = displayName?.trim()?.takeIf { it.isNotEmpty() }
            ?: fullName.takeIf { it.isNotEmpty() }
            ?: handle
        return MentionCandidate(id = id, username = handle, displayName = name, avatarURL = avatar)
    }
}
