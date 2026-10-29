package me.meeshy.sdk.model.presence

import me.meeshy.sdk.model.UserPresence
import me.meeshy.sdk.model.isoToEpochMillisOrNull

/**
 * Ce que la carte de présence garde sur disque (miroir de la persistance `presence_map.json` d'iOS) :
 * 24 h au plus, jamais le compte courant, jamais une entrée sans date lisible — on ne restitue que ce
 * que le serveur a servi, et seule une date permet de dire depuis quand.
 */
object PresenceRetention {

    /** Au-delà, une présence n'est plus un renseignement : elle n'est ni écrite ni relue. */
    const val MAX_AGE_MS: Long = 24L * 60 * 60 * 1000

    /** Le sous-ensemble de [map] qui a le droit de rester sur disque à [nowMillis]. */
    fun retained(map: PresenceMap, currentUserId: String?, nowMillis: Long): PresenceMap =
        map.filter { (userId, presence) ->
            userId.isNotBlank() && userId != currentUserId && isFresh(presence, nowMillis)
        }

    /**
     * Ce qu'une relecture au démarrage restitue : les entrées de [retained], mais plus « en ligne ».
     * Le disque a été écrit par un process dont le socket n'existe plus ; `isOnline` ne vaut que tant
     * que la connexion l'atteste. La date est gardée, donc l'entrée décroît vert, orange, gris, rien.
     */
    fun restoredAtLaunch(persisted: PresenceMap, currentUserId: String?, nowMillis: Long): PresenceMap =
        PresenceMapReducer.socketDisconnected(retained(persisted, currentUserId, nowMillis))

    private fun isFresh(presence: UserPresence, nowMillis: Long): Boolean {
        val last = isoToEpochMillisOrNull(presence.lastActiveAt) ?: return false
        return nowMillis - last <= MAX_AGE_MS
    }
}
