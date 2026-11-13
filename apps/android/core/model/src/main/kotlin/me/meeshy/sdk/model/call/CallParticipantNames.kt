package me.meeshy.sdk.model.call

import me.meeshy.sdk.model.call.group.GroupCallRoster

/**
 * Qui est qui dans l'appel, par identifiant (miroir de iOS `participantName(for:)`) : le registre du groupe d'abord, puis le pair
 * principal sous le nom de l'appel. Un identifiant absent n'a pas de nom — l'écran dit alors « Un participant ».
 */
object CallParticipantNames {
    fun of(roster: GroupCallRoster, primaryUserId: String, primaryName: String): Map<String, String> = buildMap {
        if (primaryUserId.isNotBlank() && primaryName.isNotBlank()) put(primaryUserId, primaryName)
        roster.members.forEach { if (it.userId.isNotBlank() && it.displayName.isNotBlank()) put(it.userId, it.displayName) }
    }
}
